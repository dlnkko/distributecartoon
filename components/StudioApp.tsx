"use client";

import { useEffect, useMemo, useRef, useState, type RefObject } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import type { AgentMode, ArchivedVideo, AspectRatio, Character, Project, ReferenceAsset, Scene, VisualStyle, WorkflowStep } from "@/lib/types";
import { isUnseenVoice } from "@/lib/refs";

function assetSrc(publicPath?: string) {
  if (!publicPath) return "";
  if (/^https?:\/\//i.test(publicPath)) return publicPath;
  const relative = publicPath.replace(/^\/(?:generated|api\/media)\//, "").replace(/^\//, "");
  return `/api/media/${relative}`;
}

type Profile = {
  id: string;
  email: string;
  displayName: string;
  avatarUrl?: string;
  credits: number;
  plan: string;
};

type HistoryVideo = {
  key: string;
  projectId: string;
  title: string;
  src: string;
  poster?: string;
  duration: number;
  index: number;
  parts: number;
  aspectRatio: AspectRatio;
};

const STEPS: Array<{ id: WorkflowStep; label: string }> = [
  { id: "script", label: "Script" },
  { id: "setup", label: "Setup" },
  { id: "review", label: "Scenes" },
  { id: "cast", label: "Cast" },
  { id: "produce", label: "Generate" },
];

function timeAgo(iso: string) {
  const delta = Date.now() - new Date(iso).getTime();
  const mins = Math.max(1, Math.round(delta / 60000));
  if (mins < 60) return `${mins}m`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours}h`;
  return `${Math.round(hours / 24)}d`;
}

function historyFromProjects(projects: Project[]): HistoryVideo[] {
  const videos: HistoryVideo[] = [];
  for (const project of projects) {
    const ready = project.batches.filter((batch) => batch.videoPublicPath);
    for (const batch of ready) {
      videos.push({
        key: `${project.id}-${batch.id}`,
        projectId: project.id,
        title: project.title,
        src: batch.videoPublicPath!,
        poster: batch.framePublicPath,
        duration: batch.duration,
        index: batch.index,
        parts: ready.length,
        aspectRatio: project.aspectRatio,
      });
    }
    const archived: ArchivedVideo[] = [...(project.archivedVideos || [])].reverse();
    for (const item of archived) {
      videos.push({
        key: `${project.id}-archive-${item.id}`,
        projectId: project.id,
        title: item.title || project.title,
        src: item.publicPath,
        poster: item.posterPath,
        duration: item.duration,
        index: item.index,
        parts: 1,
        aspectRatio: project.aspectRatio,
      });
    }
  }
  return videos;
}

function videoDownloadName(title: string, index = 1, parts = 1) {
  const slug = title
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  const stem = slug || "video";
  return parts > 1 ? `${stem}-${index}.mp4` : `${stem}.mp4`;
}

function slotsOf(project: Project, kind: ReferenceAsset["kind"]) {
  return project.references.filter((item) => item.kind === kind);
}

function isFileScript(name?: string) {
  if (!name) return false;
  if (/^(pasted-script|guion-pegado)\.txt$/i.test(name)) return false;
  return /\.(pdf|docx?|txt|md)$/i.test(name);
}

async function registerNotifyWorker() {
  if (!("serviceWorker" in navigator)) return null;
  try {
    return await navigator.serviceWorker.register("/sw.js");
  } catch {
    return null;
  }
}

async function showReadyNotification(title: string) {
  if (typeof Notification === "undefined" || Notification.permission !== "granted") return;
  const options: NotificationOptions = {
    body: `${title || "Your video"} has finished generating.`,
    tag: "distribute-to-ready",
  };
  try {
    const registration = await navigator.serviceWorker?.ready;
    if (registration?.showNotification) {
      await registration.showNotification("Your video is ready", options);
      return;
    }
  } catch {
    // Fall through to the page notification.
  }
  new Notification("Your video is ready", options);
}

function missingCastLooks(project: Project) {
  return project.characters.filter(
    (character) =>
      !character.isExtra &&
      !isUnseenVoice(character) &&
      !(character.portraitPublicPath || character.portraitRemoteUrl),
  );
}

async function fetchCast(projectId: string, signal: AbortSignal) {
  const res = await fetch("/api/cast", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ projectId }),
    signal,
  });
  return (await res.json()) as { project?: Project; error?: string };
}

async function loadProjectById(projectId: string, signal: AbortSignal) {
  const res = await fetch(`/api/projects?id=${encodeURIComponent(projectId)}`, { signal });
  const json = (await res.json()) as Project | { error?: string };
  if (json && "id" in json && json.id) return json as Project;
  return null;
}

async function requestCastLooks(projectId: string, signal: AbortSignal) {
  let json: { project?: Project; error?: string };
  try {
    json = await fetchCast(projectId, signal);
  } catch (error) {
    if ((error as Error).name === "AbortError") throw error;
    const recovered = await loadProjectById(projectId, signal);
    json = recovered
      ? { project: recovered }
      : { error: error instanceof Error ? error.message : "Couldn't cast those characters." };
  }
  if (json.project && missingCastLooks(json.project).length) {
    try {
      const retry = await fetchCast(projectId, signal);
      if (retry.project) json = retry;
    } catch (error) {
      if ((error as Error).name === "AbortError") throw error;
      const recovered = await loadProjectById(projectId, signal);
      if (recovered) json = { project: recovered };
    }
  }
  return json;
}

export function StudioApp() {
  const router = useRouter();
  const [projects, setProjects] = useState<Project[]>([]);
  const [project, setProject] = useState<Project | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [scriptDraft, setScriptDraft] = useState("");
  const [scenesDraft, setScenesDraft] = useState<Scene[]>([]);
  const [status, setStatus] = useState("");
  const [busy, setBusy] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [accountOpen, setAccountOpen] = useState(false);
  const [expanded, setExpanded] = useState<{ src: string; poster?: string; label?: string; downloadName?: string } | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const abortRef = useRef<AbortController | null>(null);
  const refInputs = useRef<Record<string, HTMLInputElement | null>>({});
  const projectRef = useRef<Project | null>(null);
  const settingsTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const notifyReadyRef = useRef(false);
  const [notifyReady, setNotifyReady] = useState(false);
  const [notifyHint, setNotifyHint] = useState("");

  useEffect(() => {
    void boot();
    void registerNotifyWorker();
  }, []);

  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "0px";
    el.style.height = `${Math.min(el.scrollHeight, 280)}px`;
  }, [scriptDraft]);

  useEffect(() => {
    if (!project) return;
    setScriptDraft(isFileScript(project.scriptName) ? "" : project.scriptText || "");
    setScenesDraft(project.scenes.map(cloneScene));
  }, [project?.id]);

  function remember(next: Project) {
    projectRef.current = next;
    setProject(next);
    setProjects((current) => {
      const rest = current.filter((item) => item.id !== next.id);
      return [next, ...rest];
    });
  }

  async function persistLatestSettings() {
    if (settingsTimer.current) {
      clearTimeout(settingsTimer.current);
      settingsTimer.current = null;
    }
    const current = projectRef.current;
    if (!current) return;
    await fetch("/api/projects", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        projectId: current.id,
        style: current.style,
        aspectRatio: current.aspectRatio,
        targetDurationSeconds: current.targetDurationSeconds,
      }),
    });
  }

  async function boot() {
    const [projectsRes, meRes] = await Promise.all([fetch("/api/projects"), fetch("/api/me")]);
    if (meRes.ok) setProfile((await meRes.json()) as Profile);
    const list = (await projectsRes.json()) as Project[];
    if (list[0]) {
      projectRef.current = list[0];
      setProjects(list);
      setProject(list[0]);
      return;
    }
    const created = await fetch("/api/projects", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ style: "pixar" }),
    });
    const fresh = (await created.json()) as Project;
    projectRef.current = fresh;
    setProjects([fresh]);
    setProject(fresh);
  }

  async function createNew() {
    const created = await fetch("/api/projects", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ style: project?.style || "pixar", aspectRatio: project?.aspectRatio || "16:9" }),
    });
    remember((await created.json()) as Project);
    setScriptDraft("");
    setScenesDraft([]);
    setStatus("");
    setSidebarOpen(false);
  }

  async function patchProject(payload: Record<string, unknown>) {
    const current = projectRef.current;
    if (!current) return current;
    await persistLatestSettings();
    const latest = projectRef.current ?? current;
    const res = await fetch("/api/projects", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        projectId: latest.id,
        style: latest.style,
        aspectRatio: latest.aspectRatio,
        targetDurationSeconds: latest.targetDurationSeconds,
        ...payload,
      }),
    });
    const json = (await res.json()) as Project;
    const live = projectRef.current;
    const merged = {
      ...json,
      ...(live && live.id === json.id
        ? {
            style: live.style,
            aspectRatio: live.aspectRatio,
            targetDurationSeconds: live.targetDurationSeconds,
          }
        : {}),
    };
    remember(merged);
    return merged;
  }

  async function run(mode: AgentMode) {
    if (!project || busy) return;
    setBusy(true);
    if (mode === "produce") setStatus("Generating video…");
    else setStatus("");
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    try {
      const res = await fetch("/api/run", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ projectId: project.id, mode }),
        signal: controller.signal,
      });
      if (!res.body) {
        setStatus("No response from the server.");
        return;
      }
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      let lastError = "";
      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const chunks = buffer.split("\n\n");
        buffer = chunks.pop() || "";
        for (const chunk of chunks) {
          const line = chunk.replace(/^data: /, "").trim();
          if (!line) continue;
          const event = JSON.parse(line) as { type: string; text?: string; project?: Project };
          if (event.type === "status" && event.text && mode === "produce") {
            setStatus(event.text);
          }
          if (event.type === "project" && event.project) {
            remember(event.project);
            if (event.project.scenes.length) setScenesDraft(event.project.scenes.map(cloneScene));
          }
          if (event.type === "error" && event.text) {
            lastError = event.text;
            setStatus(event.text);
          }
        }
      }
      if (!lastError) {
        setStatus("");
        const latest = projectRef.current;
        const videoReady = Boolean(latest?.batches.some((batch) => batch.videoPublicPath));
        if (mode === "produce" && notifyReadyRef.current && videoReady) {
          void showReadyNotification(latest?.title || "New video");
        }
      }
    } catch (error) {
      if ((error as Error).name === "AbortError") setStatus("Stopped.");
      else setStatus(error instanceof Error ? error.message : "Request failed.");
    } finally {
      if (abortRef.current === controller) abortRef.current = null;
      setBusy(false);
    }
  }

  async function stopProcessing() {
    abortRef.current?.abort();
    abortRef.current = null;
    setBusy(false);
    setStatus("Stopped.");
    if (!project) return;
    try {
      const res = await fetch(`/api/projects?id=${project.id}`);
      const json = (await res.json()) as Project;
      if (json?.id) remember(json);
    } catch {
      // El estado se refresca al volver.
    }
  }

  async function onUploadScript(file: File) {
    if (!project) return;
    setBusy(true);
    setStatus(`Reading ${file.name}…`);
    const form = new FormData();
    form.set("projectId", project.id);
    form.set("file", file);
    const res = await fetch("/api/upload", { method: "POST", body: form });
    const json = (await res.json()) as { project?: Project; error?: string };
    if (json.project) {
      remember(json.project);
      setScriptDraft("");
      setStatus("");
    } else {
      setStatus(json.error || "Couldn't read that file.");
    }
    setBusy(false);
  }

  async function onUploadRef(slot: ReferenceAsset, file: File) {
    if (!project) return;
    setStatus(`Uploading ${slot.label}…`);
    const form = new FormData();
    form.set("projectId", project.id);
    form.set("kind", slot.kind);
    form.set("slotId", slot.id);
    form.set("notes", slot.notes);
    form.set("file", file);
    const res = await fetch("/api/refs", { method: "POST", body: form });
    const json = (await res.json()) as { project?: Project; error?: string };
    if (json.project) {
      remember(json.project);
      setStatus("");
    } else {
      setStatus(json.error || "Couldn't upload that image.");
    }
  }

  async function onLabelRef(slot: ReferenceAsset, label: string) {
    if (!project) return;
    const next = label.trim();
    if (!next || next === slot.label) return;
    const res = await fetch("/api/refs", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ projectId: project.id, slotId: slot.id, label: next }),
    });
    const json = (await res.json()) as { project?: Project; error?: string };
    if (json.project) remember(json.project);
  }

  async function continueFromScript() {
    if (!project || busy) return;
    const text = scriptDraft.trim();
    const uploaded = isFileScript(project.scriptName) && Boolean(project.scriptText.trim());
    if (!text && !uploaded) {
      setStatus("Paste or upload a script first.");
      return;
    }
    setBusy(true);
    if (uploaded && !text) {
      await patchProject({ workflowStep: "setup" });
      setBusy(false);
      return;
    }
    const saved = await fetch("/api/script", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ projectId: project.id, text, name: "pasted-script.txt" }),
    });
    const json = (await saved.json()) as { project?: Project; error?: string };
    if (json.project) {
      remember(json.project);
    } else {
      setStatus(json.error || "Couldn't save that script.");
    }
    setBusy(false);
  }

  async function clearScriptFile() {
    if (!project || busy) return;
    setBusy(true);
    await patchProject({ clearScript: true });
    setScriptDraft("");
    setBusy(false);
  }

  async function continueFromSetup() {
    const current = projectRef.current;
    if (!current || busy) return;
    const seconds = Math.min(300, Math.max(5, Math.round(current.targetDurationSeconds || 15)));
    await patchProject({ targetDurationSeconds: seconds, workflowStep: "setup" });
    await run("plan");
  }

  async function continueFromReview() {
    if (!project || busy) return;
    setBusy(true);
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    try {
      const total = scenesDraft.reduce((sum, scene) => sum + Math.max(2, Math.round(scene.estimatedSeconds || 0)), 0);
      const saved = await patchProject({
        scenes: scenesDraft,
        targetDurationSeconds: Math.min(300, Math.max(5, total)),
        workflowStep: "cast",
        resetGeneration: true,
      });
      if (!saved) return;
      const leads = saved.characters.filter((character) => !character.isExtra && !isUnseenVoice(character));
      if (!leads.length) {
        await patchProject({ workflowStep: "produce" });
        setBusy(false);
        await run("produce");
        return;
      }
      const json = await requestCastLooks(saved.id, controller.signal);
      if (json.project) {
        remember(json.project);
        const missing = json.project.characters.filter(
          (character) =>
            !character.isExtra &&
            !isUnseenVoice(character) &&
            !(character.portraitPublicPath || character.portraitRemoteUrl),
        );
        setStatus(missing.length ? `Couldn't load ${missing.map((character) => character.name).join(", ")}.` : "");
      } else {
        setStatus(json.error || "Couldn't cast those characters.");
      }
    } catch (error) {
      if ((error as Error).name === "AbortError") setStatus("Stopped.");
      else setStatus(error instanceof Error ? error.message : "Couldn't cast those characters.");
    } finally {
      if (abortRef.current === controller) abortRef.current = null;
      setBusy(false);
    }
  }

  async function reviseCastLook(characterId: string, notes: string) {
    if (!project || busy) return;
    setBusy(true);
    abortRef.current?.abort();
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    try {
      const res = await fetch("/api/cast", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ projectId: project.id, characterId, notes }),
        signal: controller.signal,
      });
      const json = (await res.json()) as { project?: Project; error?: string };
      if (json.project) {
        remember(json.project);
        setStatus("");
      } else {
        setStatus(json.error || "Couldn't update that look.");
      }
    } catch (error) {
      if ((error as Error).name === "AbortError") setStatus("Stopped.");
      else setStatus(error instanceof Error ? error.message : "Couldn't update that look.");
    } finally {
      if (abortRef.current === controller) abortRef.current = null;
      setBusy(false);
    }
  }

  async function continueFromCast() {
    if (!project || busy) return;
    setBusy(true);
    try {
      const res = await fetch("/api/cast", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ projectId: project.id, confirm: true }),
      });
      const json = (await res.json()) as { project?: Project; error?: string };
      if (json.project) remember(json.project);
      else {
        setStatus(json.error || "Couldn't save those looks.");
        setBusy(false);
        return;
      }
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Couldn't save those looks.");
      setBusy(false);
      return;
    }
    setBusy(false);
    await run("produce");
  }

  function applySettings(patch: { style?: VisualStyle; aspectRatio?: AspectRatio; targetDurationSeconds?: number }) {
    const current = projectRef.current;
    if (!current) return;
    const next = { ...current, ...patch };
    remember(next);
    if (settingsTimer.current) clearTimeout(settingsTimer.current);
    settingsTimer.current = setTimeout(() => {
      settingsTimer.current = null;
      void persistLatestSettings();
    }, 160);
  }

  function changeStyle(style: VisualStyle) {
    if (projectRef.current?.style === style) return;
    applySettings({ style });
  }

  function changeAspect(aspectRatio: AspectRatio) {
    if (projectRef.current?.aspectRatio === aspectRatio) return;
    applySettings({ aspectRatio });
  }

  function changeDuration(seconds: number) {
    const next = Math.min(300, Math.max(5, Math.round(seconds)));
    if (projectRef.current?.targetDurationSeconds === next) return;
    applySettings({ targetDurationSeconds: next });
  }

  async function logout() {
    await createClient().auth.signOut();
    router.replace("/login");
    router.refresh();
  }

  async function enableReadyNotify() {
    if (typeof Notification === "undefined") {
      setNotifyHint("Notifications are not supported in this browser.");
      return;
    }
    await registerNotifyWorker();
    const permission = await Notification.requestPermission();
    if (permission !== "granted") {
      notifyReadyRef.current = false;
      setNotifyReady(false);
      setNotifyHint("Allow notifications in your browser to get pinged when the video is ready.");
      return;
    }
    notifyReadyRef.current = true;
    setNotifyReady(true);
    setNotifyHint("We'll notify you when the video is ready.");
  }

  const history = useMemo(() => historyFromProjects(projects), [projects]);
  const credits = profile?.credits ?? 120;
  const creditMax = Math.max(120, credits);

  if (!project) {
    return <div className="grid h-screen place-items-center text-[var(--muted)]">Opening studio…</div>;
  }

  const step = project.workflowStep || "script";
  const charactersSlots = slotsOf(project, "character");
  const products = slotsOf(project, "product");
  const locations = slotsOf(project, "location");
  const logos = slotsOf(project, "logo");
  const allSlots = [...charactersSlots, ...products, ...locations, ...logos];

  return (
    <div className="relative flex h-screen overflow-hidden" data-style={project.style}>
      {sidebarOpen ? (
        <button
          type="button"
          className="no-press fixed inset-0 z-30 bg-stone-900/20 md:hidden"
          aria-label="Close menu"
          onClick={() => setSidebarOpen(false)}
        />
      ) : null}

      <aside
        className={`fixed inset-y-0 left-0 z-40 flex w-[280px] flex-col border-r border-[var(--line)] bg-[#f3efe8] transition-transform md:static md:translate-x-0 ${
          sidebarOpen ? "translate-x-0" : "-translate-x-full"
        }`}
      >
        <div className="flex items-center justify-between px-5 pb-3 pt-5">
          <h1 className="display text-2xl">distribute.to</h1>
          <button type="button" className="rounded-xl px-2 py-1 text-sm md:hidden" onClick={() => setSidebarOpen(false)}>
            Close
          </button>
        </div>
        <button
          type="button"
          onClick={() => void createNew()}
          className="btn-primary mx-4 mb-4 rounded-2xl bg-[var(--ink)] px-4 py-2.5 text-sm font-medium text-white"
        >
          New video
        </button>

        <div className="scroll-thin min-h-0 flex-1 space-y-5 overflow-y-auto px-3 pb-4">
          <section>
            <p className="px-2 pb-2 text-[11px] font-medium uppercase tracking-[0.18em] text-[var(--muted)]">Projects</p>
            <div className="space-y-1">
              {projects.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => {
                    projectRef.current = item;
                    setProject(item);
                    setStatus("");
                    setSidebarOpen(false);
                  }}
                  className={`w-full rounded-2xl px-3 py-2.5 text-left ${
                    item.id === project.id ? "bg-white shadow-sm" : "hover:bg-white/70"
                  }`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <p className="truncate text-sm font-medium">{item.title}</p>
                    <span className="text-[10px] text-[var(--muted)]">{timeAgo(item.updatedAt)}</span>
                  </div>
                  <p className="mt-0.5 truncate text-[11px] text-[var(--muted)]">
                    {item.scriptName || (item.scenes.length ? `${item.scenes.length} scenes` : "No script")} · {item.style}
                  </p>
                </button>
              ))}
            </div>
          </section>

          <section>
            <p className="px-2 pb-2 text-[11px] font-medium uppercase tracking-[0.18em] text-[var(--muted)]">History</p>
            {history.length === 0 ? (
              <p className="px-2 text-sm text-[var(--muted)]">Generated videos will show up here.</p>
            ) : (
              <div className="space-y-1">
                {history.map((item) => (
                  <button
                    key={item.key}
                    type="button"
                    onClick={() => {
                      const found = projects.find((entry) => entry.id === item.projectId);
                      if (found) setProject(found);
                      setExpanded({
                        src: assetSrc(item.src),
                        poster: item.poster ? assetSrc(item.poster) : undefined,
                        label: item.title,
                        downloadName: videoDownloadName(item.title, item.index, item.parts),
                      });
                      setSidebarOpen(false);
                    }}
                    className="flex w-full items-center gap-2 rounded-2xl px-2 py-2 text-left hover:bg-white/80"
                  >
                    <div className="h-12 w-9 overflow-hidden rounded-lg bg-stone-200">
                      {item.poster ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={assetSrc(item.poster)} alt="" className="h-full w-full object-cover" />
                      ) : (
                        <span className="grid h-full place-items-center text-[10px] text-[var(--muted)]">▶</span>
                      )}
                    </div>
                    <div className="min-w-0">
                      <p className="truncate text-sm">{item.title}</p>
                      <p className="text-[11px] text-[var(--muted)]">
                        {item.parts > 1 ? `Part ${item.index} · ${item.duration}s` : `Video · ${item.duration}s`}
                      </p>
                    </div>
                  </button>
                ))}
              </div>
            )}
          </section>
        </div>

        <div className="border-t border-[var(--line)] bg-[#f3efe8] p-3">
          <div className="mb-3 rounded-2xl bg-white px-3 py-3">
            <div className="flex items-center justify-between text-xs">
              <span className="text-[var(--muted)]">Credits</span>
              <span className="font-medium">
                {credits}/{creditMax}
              </span>
            </div>
            <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-stone-200">
              <div className="h-full rounded-full bg-[var(--accent)]" style={{ width: `${Math.min(100, (credits / creditMax) * 100)}%` }} />
            </div>
          </div>
          <button
            type="button"
            onClick={() => setAccountOpen(true)}
            className="flex w-full items-center gap-3 rounded-2xl px-2 py-2 text-left hover:bg-white"
          >
            <span className="grid h-9 w-9 place-items-center overflow-hidden rounded-full bg-[var(--ink)] text-sm text-white">
              {profile?.avatarUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={profile.avatarUrl} alt="" className="h-full w-full object-cover" />
              ) : (
                (profile?.displayName || "A").slice(0, 1).toUpperCase()
              )}
            </span>
            <span className="min-w-0">
              <span className="block truncate text-sm font-medium">Account</span>
              <span className="block truncate text-[11px] text-[var(--muted)]">{profile?.email || "Account"}</span>
            </span>
          </button>
        </div>
      </aside>

      <section className="flex min-w-0 flex-1 flex-col bg-[var(--bg)]">
        <header className="flex items-center gap-3 px-3 py-3 md:px-6">
          <button type="button" className="rounded-xl border border-[var(--line)] bg-white px-3 py-2 text-sm md:hidden" onClick={() => setSidebarOpen(true)}>
            Menu
          </button>
          <div className="min-w-0 flex-1">
            <h2 className="display truncate text-xl md:text-2xl">{project.title}</h2>
          </div>
        </header>

        <StepBar current={step} />

        <div className="scroll-thin mx-auto flex w-full max-w-4xl flex-1 flex-col overflow-y-auto px-3 pb-8 md:px-6">
          {step === "script" ? (
            <ScriptStep
              key={project.id}
              scriptName={project.scriptName}
              fileAttached={isFileScript(project.scriptName)}
              value={scriptDraft}
              busy={busy}
              textareaRef={textareaRef}
              onChange={setScriptDraft}
              onPickFile={() => fileRef.current?.click()}
              onClearFile={() => void clearScriptFile()}
              onContinue={() => void continueFromScript()}
            />
          ) : null}

          {step === "setup" ? (
            <SetupStep
              project={project}
              characters={charactersSlots}
              products={products}
              locations={locations}
              logos={logos}
              busy={busy}
              onBack={() => void patchProject({ workflowStep: "script" })}
              onStyle={changeStyle}
              onAspect={changeAspect}
              onDuration={(seconds) => void changeDuration(seconds)}
              onPickSlot={(slot) => refInputs.current[slot.id]?.click()}
              onLabelSlot={(slot, label) => void onLabelRef(slot, label)}
              onContinue={() => void continueFromSetup()}
            />
          ) : null}

          {step === "review" ? (
            <ReviewStep
              scenes={scenesDraft}
              busy={busy}
              hasVideo={project.batches.some((batch) => batch.videoPublicPath)}
              onChange={setScenesDraft}
              onBack={() =>
                void (project.batches.some((batch) => batch.videoPublicPath)
                  ? patchProject({ scenes: scenesDraft, workflowStep: "produce" })
                  : patchProject({ workflowStep: "setup" }))
              }
              onContinue={() => void continueFromReview()}
            />
          ) : null}

          {step === "cast" ? (
            <CastStep
              characters={project.characters.filter((character) => !character.isExtra && !isUnseenVoice(character))}
              busy={busy}
              onBack={() => void patchProject({ workflowStep: "review" })}
              onRevise={(characterId, notes) => void reviseCastLook(characterId, notes)}
              onContinue={() => void continueFromCast()}
            />
          ) : null}

          {step === "produce" ? (
            <ProduceStep
              project={project}
              busy={busy}
              status={status}
              notifyReady={notifyReady}
              notifyHint={notifyHint}
              onNotifyMe={() => void enableReadyNotify()}
              onStop={() => void stopProcessing()}
              onEditScenes={() => void patchProject({ workflowStep: "review" })}
              onExpand={(item) => setExpanded(item)}
            />
          ) : null}

          {!busy && status && step !== "produce" ? <p className="mt-4 text-sm text-[var(--danger)]">{status}</p> : null}
        </div>
      </section>

      <input
        ref={fileRef}
        type="file"
        accept=".pdf,.doc,.docx"
        disabled={Boolean(scriptDraft.trim())}
        className="hidden"
        onChange={(event) => {
          const file = event.target.files?.[0];
          if (file && !scriptDraft.trim()) void onUploadScript(file);
          event.target.value = "";
        }}
      />
      {allSlots.map((slot) => (
        <input
          key={slot.id}
          ref={(node) => {
            refInputs.current[slot.id] = node;
          }}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={(event) => {
            const file = event.target.files?.[0];
            if (file) void onUploadRef(slot, file);
            event.target.value = "";
          }}
        />
      ))}

      {accountOpen ? (
        <div className="fixed inset-0 z-50 grid place-items-center bg-stone-900/25 p-3">
          <div className="w-full max-w-md rounded-3xl bg-white p-5 shadow-2xl">
            <div className="flex items-start justify-between">
              <div>
                <p className="text-[11px] uppercase tracking-[0.2em] text-[var(--muted)]">Account</p>
                <h3 className="display mt-1 text-2xl">{profile?.displayName || "Account"}</h3>
                <p className="text-sm text-[var(--muted)]">{profile?.email}</p>
              </div>
              <button type="button" onClick={() => setAccountOpen(false)} className="text-sm text-[var(--muted)]">
                Close
              </button>
            </div>
            <dl className="mt-5 space-y-3 text-sm">
              <div className="flex justify-between rounded-2xl bg-[var(--bg)] px-4 py-3">
                <dt>Plan</dt>
                <dd className="capitalize">{profile?.plan || "free"}</dd>
              </div>
              <div className="flex justify-between rounded-2xl bg-[var(--bg)] px-4 py-3">
                <dt>Credits</dt>
                <dd>{credits}</dd>
              </div>
              <div className="rounded-2xl bg-[var(--bg)] px-4 py-3 text-[var(--muted)]">
                Subscriptions and credit top-ups will live here.
              </div>
            </dl>
            <button type="button" onClick={() => void logout()} className="mt-5 w-full rounded-2xl border border-[var(--line)] px-4 py-2.5 text-sm">
              Sign out
            </button>
          </div>
        </div>
      ) : null}

      {expanded ? (
        <div
          className="no-press fixed inset-0 z-50 grid place-items-center bg-stone-950/82 p-3 backdrop-blur-md sm:p-4"
          onClick={() => setExpanded(null)}
        >
          <div className="theater-in flex max-h-full w-full max-w-[920px] flex-col items-center gap-3 sm:gap-4" onClick={(event) => event.stopPropagation()}>
            <video
              src={expanded.src}
              poster={expanded.poster}
              controls
              autoPlay
              playsInline
              className="max-h-[min(72vh,820px)] w-full rounded-2xl bg-black object-contain shadow-[0_40px_80px_rgba(0,0,0,0.45)] sm:rounded-[28px]"
            />
            <div className="flex w-full max-w-md flex-col gap-2 sm:max-w-none sm:flex-row sm:flex-wrap sm:items-center sm:justify-center sm:gap-3">
              <a
                href={expanded.src}
                download={expanded.downloadName || "video.mp4"}
                className="btn-primary inline-flex w-full items-center justify-center gap-2 rounded-full bg-white px-5 py-2.5 text-sm font-medium text-[var(--ink)] shadow-lg sm:w-auto"
              >
                <DownloadIcon />
                Download video
              </a>
              <button
                type="button"
                onClick={() => setExpanded(null)}
                className="w-full rounded-full border border-white/25 px-5 py-2.5 text-sm font-medium text-white sm:w-auto"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function cloneScene(scene: Scene): Scene {
  return { ...scene, dialogue: scene.dialogue.map((line) => ({ ...line })), characterNames: [...scene.characterNames], extraNames: [...scene.extraNames] };
}

function StepBar({ current }: { current: WorkflowStep }) {
  const index = STEPS.findIndex((item) => item.id === current);
  return (
    <ol className="mx-auto mb-4 flex w-full max-w-4xl items-center gap-2 px-3 md:px-6">
      {STEPS.map((item, i) => {
        const active = i === index;
        const done = i < index;
        return (
          <li key={item.id} className="flex min-w-0 flex-1 items-center gap-2">
            <span
              className={`grid size-6 shrink-0 place-items-center rounded-full text-[11px] font-medium ${
                active ? "bg-[var(--ink)] text-white" : done ? "bg-[var(--accent)] text-white" : "bg-stone-200 text-stone-500"
              }`}
            >
              {i + 1}
            </span>
            <span className={`hidden truncate text-xs font-medium sm:inline ${active ? "text-[var(--ink)]" : "text-[var(--muted)]"}`}>{item.label}</span>
            {i < STEPS.length - 1 ? <span className="hidden h-px flex-1 bg-stone-200 sm:block" /> : null}
          </li>
        );
      })}
    </ol>
  );
}

function ScriptStep({
  scriptName,
  fileAttached,
  value,
  busy,
  textareaRef,
  onChange,
  onPickFile,
  onClearFile,
  onContinue,
}: {
  scriptName: string;
  fileAttached: boolean;
  value: string;
  busy: boolean;
  textareaRef: RefObject<HTMLTextAreaElement | null>;
  onChange: (value: string) => void;
  onPickFile: () => void;
  onClearFile: () => void;
  onContinue: () => void;
}) {
  const [infoOpen, setInfoOpen] = useState(false);
  const infoRef = useRef<HTMLDivElement>(null);
  const typing = Boolean(value.trim());
  const uploadLocked = busy || typing;
  const pasteLocked = busy || fileAttached;
  const canContinue = fileAttached || typing;

  useEffect(() => {
    if (!infoOpen) return;
    function close(event: MouseEvent) {
      if (infoRef.current && !infoRef.current.contains(event.target as Node)) setInfoOpen(false);
    }
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, [infoOpen]);

  return (
    <div className="flex flex-1 flex-col">
      <div ref={infoRef}>
        <div className="flex flex-wrap items-center gap-3">
          <h3 className="display text-3xl md:text-4xl">Add the script</h3>
          <button
            type="button"
            aria-label="Script input info"
            aria-expanded={infoOpen}
            onClick={() => setInfoOpen((open) => !open)}
            className={`grid size-7 place-items-center rounded-full text-[13px] font-semibold shadow-sm ${
              infoOpen
                ? "bg-[var(--ink)] text-white"
                : "border border-stone-300 bg-white text-stone-500 hover:border-stone-400 hover:bg-stone-50 hover:text-[var(--ink)]"
            }`}
          >
            <InfoIcon />
          </button>
        </div>
        {infoOpen ? (
          <div className="mt-3 w-full max-w-md rounded-2xl border border-[var(--line)] bg-white p-4 text-sm leading-6 text-[var(--ink)] shadow-[0_18px_50px_rgba(28,25,23,0.12)]">
            <p>You can add the script in only one way: upload a PDF or Word file, or type the text. Not both.</p>
            <button
              type="button"
              onClick={() => setInfoOpen(false)}
              className="btn-secondary mt-3 rounded-full px-3 py-1.5 text-xs font-medium"
            >
              Got it
            </button>
          </div>
        ) : null}
      </div>
      <p className="mt-2 text-sm text-[var(--muted)]">Upload a PDF or Word file, or type the script or storyboard.</p>

      <button
        type="button"
        onClick={onPickFile}
        disabled={uploadLocked}
        title={typing ? "Clear the typed text to upload a file." : undefined}
        className={`mt-6 flex min-h-[168px] flex-col items-center justify-center gap-2 rounded-[28px] border border-dashed px-6 text-center ${
          uploadLocked
            ? "cursor-not-allowed border-stone-200 bg-stone-50 text-stone-400 opacity-60"
            : "border-stone-300 bg-white hover:border-stone-400 hover:bg-stone-50 hover:shadow-[0_12px_32px_rgba(28,25,23,0.06)]"
        }`}
      >
        <span className="grid size-12 place-items-center rounded-2xl bg-stone-100 text-stone-500">
          <ScriptIcon />
        </span>
        <span className="text-sm font-medium text-[var(--ink)]">{fileAttached ? scriptName : "Upload PDF or Word"}</span>
        <span className="text-xs text-[var(--muted)]">{fileAttached ? "File attached" : ".pdf, .doc, .docx"}</span>
      </button>
      {fileAttached ? (
        <button type="button" disabled={busy} onClick={onClearFile} className="btn-secondary mt-2 self-start rounded-full px-3 py-1.5 text-xs">
          Remove file
        </button>
      ) : null}

      <label className="mt-6 text-sm font-medium text-[var(--muted)]">or type it here</label>
      <textarea
        ref={textareaRef}
        value={value}
        disabled={pasteLocked}
        onChange={(event) => onChange(event.target.value)}
        placeholder={fileAttached ? "Remove the file to type the script instead." : "Type or paste the full script or storyboard…"}
        className="mt-2 min-h-[160px] max-h-[280px] w-full resize-none overflow-y-auto rounded-[24px] border border-[var(--line)] bg-white px-4 py-3 text-sm leading-6 outline-none placeholder:text-stone-400 disabled:cursor-not-allowed disabled:bg-stone-50 disabled:text-stone-400"
      />

      <div className="mt-auto flex justify-end pt-6">
        <button
          type="button"
          disabled={busy || !canContinue}
          onClick={onContinue}
          className="btn-primary rounded-full bg-[var(--ink)] px-5 py-2.5 text-sm font-medium text-white disabled:bg-stone-300"
        >
          Continue
        </button>
      </div>
    </div>
  );
}

function SetupStep({
  project,
  characters,
  products,
  locations,
  logos,
  busy,
  onBack,
  onStyle,
  onAspect,
  onDuration,
  onPickSlot,
  onLabelSlot,
  onContinue,
}: {
  project: Project;
  characters: ReferenceAsset[];
  products: ReferenceAsset[];
  locations: ReferenceAsset[];
  logos: ReferenceAsset[];
  busy: boolean;
  onBack: () => void;
  onStyle: (style: VisualStyle) => void;
  onAspect: (aspect: AspectRatio) => void;
  onDuration: (seconds: number) => void;
  onPickSlot: (slot: ReferenceAsset) => void;
  onLabelSlot: (slot: ReferenceAsset, label: string) => void;
  onContinue: () => void;
}) {
  return (
    <div className="flex flex-1 flex-col gap-5">
      <div>
        <h3 className="display text-3xl md:text-4xl">Look and length</h3>
        <p className="mt-2 text-sm text-[var(--muted)]">
          Photos are optional. For a real person or animal, type the role from the script so we restyle that photo as
          that character. Products, locations, and logos are only used if the script mentions them.
        </p>
      </div>

      <section className="setup-card">
        <p className="text-xs font-medium uppercase tracking-[0.16em] text-[var(--muted)]">
          Real-life characters to adapt · up to 4
        </p>
        <p className="mt-1 mb-4 text-sm text-[var(--muted)]">
          One real photo per character. Type the role from the script (Cat, Dog, Maya). We restyle that photo as that
          character at casting. Leave empty if you do not have a photo.
        </p>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {characters.map((slot, index) => (
            <CharacterSlot
              key={slot.id}
              slot={slot}
              index={index}
              preview={slot.originalPublicPath ? assetSrc(slot.originalPublicPath) : ""}
              disabled={busy}
              onPick={() => onPickSlot(slot)}
              onLabel={onLabelSlot}
            />
          ))}
        </div>
      </section>

      <section className="setup-card">
        <p className="mb-4 text-xs font-medium uppercase tracking-[0.16em] text-[var(--muted)]">Product · up to 3</p>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          {products.map((slot) => (
            <UploadTile
              key={slot.id}
              label={slot.label}
              preview={slot.originalPublicPath ? assetSrc(slot.originalPublicPath) : ""}
              disabled={busy}
              onClick={() => onPickSlot(slot)}
            />
          ))}
        </div>
      </section>

      <section className="setup-card">
        <p className="mb-4 text-xs font-medium uppercase tracking-[0.16em] text-[var(--muted)]">Location · up to 2</p>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {locations.map((slot) => (
            <UploadTile
              key={slot.id}
              label={slot.label}
              preview={slot.originalPublicPath ? assetSrc(slot.originalPublicPath) : ""}
              disabled={busy}
              onClick={() => onPickSlot(slot)}
            />
          ))}
        </div>
      </section>

      <section className="setup-card">
        <p className="mb-4 text-xs font-medium uppercase tracking-[0.16em] text-[var(--muted)]">Logo · 1</p>
        <div className="grid grid-cols-1 gap-3 sm:max-w-[260px]">
          {logos.map((slot) => (
            <UploadTile
              key={slot.id}
              label={slot.label}
              preview={slot.originalPublicPath ? assetSrc(slot.originalPublicPath) : ""}
              disabled={busy}
              onClick={() => onPickSlot(slot)}
            />
          ))}
        </div>
      </section>

      <section className="setup-card">
        <div className="grid gap-6 sm:grid-cols-2">
          <div>
            <p className="mb-3 text-xs font-medium uppercase tracking-[0.16em] text-[var(--muted)]">Style</p>
            <Segmented
              value={project.style}
              options={[
                { id: "pixar", label: "Pixar" },
                { id: "claymation", label: "Claymation" },
              ]}
              onChange={(value) => onStyle(value as VisualStyle)}
            />
          </div>
          <div>
            <p className="mb-3 text-xs font-medium uppercase tracking-[0.16em] text-[var(--muted)]">Resolution</p>
            <AspectPicker value={project.aspectRatio || "16:9"} onChange={onAspect} />
          </div>
        </div>
      </section>

      <section className="setup-card">
        <p className="mb-4 text-xs font-medium uppercase tracking-[0.16em] text-[var(--muted)]">Video length</p>
        <DurationControl
          value={project.targetDurationSeconds || 15}
          resetKey={project.id}
          disabled={busy}
          onChange={onDuration}
        />
        <p className="mt-4 text-sm text-[var(--muted)]">
          Whole video, 5 to 300 seconds. Up to 30s generates in one take; longer videos continue in sequence.
        </p>
      </section>

      <div className="mt-auto flex items-center justify-between pt-2">
        <BackButton disabled={busy} onClick={onBack} />
        <button
          type="button"
          disabled={busy}
          onClick={onContinue}
          className="btn-primary rounded-full bg-[var(--ink)] px-5 py-2.5 text-sm font-medium text-white disabled:bg-stone-300"
        >
          Continue
        </button>
      </div>
    </div>
  );
}

function ReviewStep({
  scenes,
  busy,
  hasVideo,
  onChange,
  onBack,
  onContinue,
}: {
  scenes: Scene[];
  busy: boolean;
  hasVideo: boolean;
  onChange: (scenes: Scene[]) => void;
  onBack: () => void;
  onContinue: () => void;
}) {
  function update(index: number, patch: Partial<Scene>) {
    onChange(scenes.map((scene, i) => (i === index ? { ...scene, ...patch } : scene)));
  }

  const totalSeconds = scenes.reduce((sum, scene) => sum + Math.max(2, Math.round(scene.estimatedSeconds || 0)), 0);

  return (
    <div className="flex flex-1 flex-col gap-4">
      <div>
        <h3 className="display text-3xl">Edit scenes</h3>
        <p className="mt-1 text-sm text-[var(--muted)]">
          Set how long each scene lasts. That timing goes into the video prompt.
        </p>
      </div>

      {scenes.map((scene, index) => (
        <article key={scene.id} className="rounded-[24px] border border-[var(--line)] bg-white p-4 shadow-sm">
          <div className="mb-3 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-xs font-medium uppercase tracking-[0.16em] text-[var(--muted)]">Scene {scene.index || index + 1}</p>
            <label className="flex items-center gap-2 text-xs font-medium text-[var(--ink)]">
              Duration
              <input
                type="number"
                min={2}
                max={30}
                value={scene.estimatedSeconds}
                disabled={busy}
                onChange={(event) =>
                  update(index, { estimatedSeconds: Math.min(30, Math.max(2, Number(event.target.value) || 2)) })
                }
                className="w-16 rounded-lg border border-stone-200 bg-stone-50 px-2 py-1.5 text-right text-sm text-[var(--ink)] outline-none"
              />
              s
            </label>
          </div>
          <input
            value={scene.title}
            disabled={busy}
            onChange={(event) => update(index, { title: event.target.value })}
            placeholder="Title"
            className="mb-2 w-full rounded-xl bg-stone-50 px-3 py-2 text-sm font-medium outline-none"
          />
          <label className="mb-1 block text-[11px] font-medium uppercase tracking-[0.14em] text-[var(--muted)]">Direction</label>
          <input
            value={scene.camera}
            disabled={busy}
            onChange={(event) => update(index, { camera: event.target.value })}
            placeholder="Wide shot, eye level"
            className="mb-3 w-full rounded-xl bg-stone-50 px-3 py-2 text-sm outline-none"
          />
          <label className="mb-1 block text-[11px] font-medium uppercase tracking-[0.14em] text-[var(--muted)]">Action</label>
          <textarea
            value={scene.summary}
            disabled={busy}
            onChange={(event) => update(index, { summary: event.target.value })}
            placeholder="What happens in this scene"
            className="mb-3 min-h-[72px] w-full resize-none rounded-xl bg-stone-50 px-3 py-2 text-sm outline-none"
          />
          <label className="mb-1 block text-[11px] font-medium uppercase tracking-[0.14em] text-[var(--muted)]">Location</label>
          <input
            value={scene.location}
            disabled={busy}
            onChange={(event) => update(index, { location: event.target.value })}
            placeholder="Where this is"
            className="mb-3 w-full rounded-xl bg-stone-50 px-3 py-2 text-sm outline-none"
          />
          <div className="flex items-center justify-between">
            <label className="text-[11px] font-medium uppercase tracking-[0.14em] text-[var(--muted)]">Dialogue</label>
            <button
              type="button"
              disabled={busy}
              onClick={() => update(index, { dialogue: [...scene.dialogue, { speaker: "", line: "" }] })}
              className="text-xs text-[var(--accent)]"
            >
              Add line
            </button>
          </div>
          <div className="mt-2 space-y-2">
            {scene.dialogue.length === 0 ? <p className="text-xs text-[var(--muted)]">No dialogue in this scene.</p> : null}
            {scene.dialogue.map((line, lineIndex) => (
              <div key={`${scene.id}-d-${lineIndex}`} className="grid grid-cols-[7rem_1fr_auto] gap-2">
                <input
                  value={line.speaker}
                  disabled={busy}
                  placeholder="Speaker"
                  onChange={(event) => {
                    const dialogue = scene.dialogue.map((item, i) => (i === lineIndex ? { ...item, speaker: event.target.value } : item));
                    update(index, { dialogue });
                  }}
                  className="rounded-xl bg-stone-50 px-3 py-2 text-sm outline-none"
                />
                <input
                  value={line.line}
                  disabled={busy}
                  placeholder="Line"
                  onChange={(event) => {
                    const dialogue = scene.dialogue.map((item, i) => (i === lineIndex ? { ...item, line: event.target.value } : item));
                    update(index, { dialogue });
                  }}
                  className="rounded-xl bg-stone-50 px-3 py-2 text-sm outline-none"
                />
                <button
                  type="button"
                  disabled={busy}
                  aria-label="Remove line"
                  onClick={() => update(index, { dialogue: scene.dialogue.filter((_, i) => i !== lineIndex) })}
                  className="px-2 text-sm text-stone-400 hover:text-[var(--danger)]"
                >
                  ×
                </button>
              </div>
            ))}
          </div>
        </article>
      ))}

      <p className="text-sm text-[var(--muted)]">
        Total {totalSeconds}s{totalSeconds > 30 ? " · generated in sequence" : " · one take"}
      </p>

      <div className="mt-auto flex items-center justify-between pt-2">
        <BackButton disabled={busy} onClick={onBack}>
          {hasVideo ? "Back to video" : "Back"}
        </BackButton>
        <button
          type="button"
          disabled={busy || scenes.length === 0}
          onClick={onContinue}
          className="btn-primary rounded-full bg-[var(--ink)] px-5 py-2.5 text-sm font-medium text-white disabled:bg-stone-300"
        >
          {hasVideo ? "Generate" : "Continue"}
        </button>
      </div>
    </div>
  );
}

function CastStep({
  characters,
  busy,
  onBack,
  onRevise,
  onContinue,
}: {
  characters: Character[];
  busy: boolean;
  onBack: () => void;
  onRevise: (characterId: string, notes: string) => void;
  onContinue: () => void;
}) {
  const [notes, setNotes] = useState<Record<string, string>>({});
  const ready = characters.length === 0 || characters.every((character) => character.portraitPublicPath || character.portraitRemoteUrl);

  return (
    <div className="flex flex-1 flex-col gap-4">
      <div>
        <h3 className="display text-3xl">Approve the cast</h3>
        <p className="mt-1 text-sm text-[var(--muted)]">
          Only the main characters in the story appear here — not crowd, b-roll, or background extras. Each look is that
          character alone: one pose, plain background. If you uploaded a real photo for that role, we adapted it to this
          style. Approve them, or change each character once.
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        {characters.map((character) => {
          const src = character.portraitPublicPath
            ? `${assetSrc(character.portraitPublicPath)}?v=${encodeURIComponent(character.portraitFileName || character.id)}`
            : "";
          const draft = notes[character.id] || "";
          return (
            <article key={character.id} className="rounded-[24px] border border-[var(--line)] bg-white p-4 shadow-sm">
              <div className="aspect-square overflow-hidden rounded-2xl bg-stone-100">
                {src ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={src} alt={character.name} className="h-full w-full object-contain" />
                ) : (
                  <div className="grid h-full place-items-center px-4 text-center text-sm text-[var(--muted)]">
                    {busy ? "Casting…" : "No look yet"}
                  </div>
                )}
              </div>
              <p className="mt-3 font-medium">{character.name}</p>
              {character.description ? (
                <p className="mt-1 line-clamp-2 text-xs text-[var(--muted)]">{character.description}</p>
              ) : null}
              {character.lookRevisionUsed ? (
                <p className="mt-3 text-xs text-[var(--muted)]">This look can only be changed once.</p>
              ) : (
                <div className="mt-3 space-y-2">
                  <textarea
                    value={draft}
                    disabled={busy || !src}
                    onChange={(event) => setNotes((current) => ({ ...current, [character.id]: event.target.value }))}
                    placeholder="What to change in this look…"
                    className="min-h-[72px] w-full resize-none rounded-xl bg-stone-50 px-3 py-2 text-sm outline-none disabled:opacity-50"
                  />
                  <button
                    type="button"
                    disabled={busy || !src || !draft.trim()}
                    onClick={() => onRevise(character.id, draft.trim())}
                    className="text-sm text-[var(--accent)] disabled:text-stone-300"
                  >
                    Change look
                  </button>
                </div>
              )}
            </article>
          );
        })}
      </div>

      <div className="mt-auto flex items-center justify-between pt-2">
        <BackButton disabled={busy} onClick={onBack} />
        <button
          type="button"
          disabled={busy || !ready}
          onClick={onContinue}
          className="btn-primary rounded-full bg-[var(--ink)] px-5 py-2.5 text-sm font-medium text-white disabled:bg-stone-300"
        >
          Continue
        </button>
      </div>
    </div>
  );
}

function ProduceStep({
  project,
  busy,
  status,
  notifyReady,
  notifyHint,
  onNotifyMe,
  onStop,
  onEditScenes,
  onExpand,
}: {
  project: Project;
  busy: boolean;
  status: string;
  notifyReady: boolean;
  notifyHint: string;
  onNotifyMe: () => void;
  onStop: () => void;
  onEditScenes: () => void;
  onExpand: (item: { src: string; poster?: string; label?: string; downloadName?: string }) => void;
}) {
  const ready = project.batches.filter((batch) => batch.videoPublicPath);
  const totalParts = Math.max(ready.length, project.batches.length);
  const done = Boolean(ready.length) && !busy;
  const heading = done ? "Your video" : busy ? "Directing" : ready.length ? "Your video" : "Generating";

  return (
    <div className="flex flex-1 flex-col gap-5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className="display text-3xl md:text-4xl">{heading}</h3>
          {busy ? (
            <p className="mt-1 text-sm text-[var(--muted)]">{status || "First frame, then animation."}</p>
          ) : !ready.length ? (
            <p className="mt-1 text-sm text-[var(--muted)]">First frame, then animation. You can stop anytime.</p>
          ) : null}
        </div>
        {busy ? (
          <div className="flex shrink-0 flex-col items-end gap-2 sm:flex-row">
            <button
              type="button"
              onClick={onNotifyMe}
              disabled={notifyReady}
              className="rounded-full border border-[var(--line)] bg-white px-3 py-1.5 text-sm font-medium disabled:opacity-70"
            >
              {notifyReady ? "Notifications on" : "Notify me when ready"}
            </button>
            <button type="button" onClick={onStop} className="rounded-full border border-[var(--danger)]/20 bg-white px-3 py-1.5 text-sm text-[var(--danger)]">
              Stop
            </button>
          </div>
        ) : null}
      </div>
      {busy && notifyHint ? <p className="text-right text-xs text-[var(--muted)]">{notifyHint}</p> : null}
      {!busy && status ? <p className="text-sm text-[var(--danger)]">{status}</p> : null}

      <div className="space-y-6">
        {project.batches.length === 0 && busy ? (
          <VideoStage
            title={project.title}
            aspect={project.aspectRatio}
            styleName={project.style}
            duration={project.targetDurationSeconds || 15}
            waiting
          />
        ) : null}
        {project.batches.map((batch) => (
          <VideoStage
            key={batch.id}
            title={project.title}
            aspect={project.aspectRatio}
            styleName={project.style}
            duration={batch.duration}
            status={batch.status}
            src={batch.videoPublicPath ? assetSrc(batch.videoPublicPath) : undefined}
            poster={batch.framePublicPath ? assetSrc(batch.framePublicPath) : undefined}
            part={totalParts > 1 ? batch.index : undefined}
            parts={totalParts > 1 ? totalParts : undefined}
            waiting={!batch.videoPublicPath}
            downloadName={videoDownloadName(project.title, batch.index, Math.max(1, totalParts))}
            onExpand={
              batch.videoPublicPath
                ? () =>
                    onExpand({
                      src: assetSrc(batch.videoPublicPath),
                      poster: batch.framePublicPath ? assetSrc(batch.framePublicPath) : undefined,
                      label: project.title,
                      downloadName: videoDownloadName(project.title, batch.index, Math.max(1, totalParts)),
                    })
                : undefined
            }
          />
        ))}
      </div>

      {done ? (
        <button
          type="button"
          onClick={onEditScenes}
          className="btn-primary w-full rounded-full bg-[var(--ink)] px-5 py-2.5 text-sm font-medium text-white sm:w-auto"
        >
          Edit scenes
        </button>
      ) : null}
    </div>
  );
}

function DurationControl({
  value,
  resetKey,
  disabled,
  onChange,
}: {
  value: number;
  resetKey: string;
  disabled?: boolean;
  onChange: (seconds: number) => void;
}) {
  const [seconds, setSeconds] = useState(value);
  const [text, setText] = useState(String(value));
  const secondsRef = useRef(value);

  useEffect(() => {
    secondsRef.current = value;
    setSeconds(value);
    setText(String(value));
    // Keep local +/- as the source of truth while this project is open.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resetKey]);

  function commitNumber(raw: string | number) {
    const parsed = Math.round(Number(raw));
    if (!Number.isFinite(parsed)) {
      setText(String(secondsRef.current));
      return;
    }
    const next = Math.min(300, Math.max(5, parsed));
    secondsRef.current = next;
    setSeconds(next);
    setText(String(next));
    onChange(next);
  }

  function bump(delta: number) {
    commitNumber(secondsRef.current + delta);
  }

  return (
    <div className="flex h-20 w-fit items-center rounded-[26px] border border-[var(--line)] bg-stone-50 p-1.5">
      <button
        type="button"
        disabled={disabled || seconds <= 5}
        aria-label="Decrease duration"
        onClick={() => bump(-1)}
        className="grid size-14 place-items-center rounded-[20px] text-2xl text-stone-500 hover:bg-white hover:text-[var(--ink)] disabled:opacity-40"
      >
        −
      </button>
      <input
        type="text"
        inputMode="numeric"
        disabled={disabled}
        aria-label="Duration in seconds"
        value={text}
        className="w-24 bg-transparent text-center text-3xl font-semibold tabular-nums outline-none"
        onChange={(event) => setText(event.target.value.replace(/[^\d]/g, "").slice(0, 3))}
        onBlur={() => commitNumber(text)}
        onKeyDown={(event) => {
          if (event.key === "Enter") {
            event.preventDefault();
            commitNumber(text);
            event.currentTarget.blur();
          }
        }}
      />
      <span className="pr-2 text-sm font-medium text-stone-400">s</span>
      <button
        type="button"
        disabled={disabled || seconds >= 300}
        aria-label="Increase duration"
        onClick={() => bump(1)}
        className="grid size-14 place-items-center rounded-[20px] text-2xl text-stone-500 hover:bg-white hover:text-[var(--ink)] disabled:opacity-40"
      >
        +
      </button>
    </div>
  );
}

function AspectPicker({ value, onChange }: { value: AspectRatio; onChange: (value: AspectRatio) => void }) {
  return (
    <div className="flex w-full items-center rounded-[22px] bg-stone-100 p-[3px]">
      <button
        type="button"
        onClick={() => onChange("16:9")}
        className={`flex h-[56px] flex-1 items-center justify-center gap-2 rounded-[20px] px-3 text-left ${
          value === "16:9" ? "bg-white text-[var(--ink)] shadow-sm" : "text-stone-500 hover:text-[var(--ink)]"
        }`}
      >
        <LandscapeIcon />
        <span>
          <span className="block text-[13px] font-medium leading-tight">16:9</span>
          <span className="block text-[10px] font-medium uppercase tracking-[0.12em] text-[var(--muted)]">Horizontal</span>
        </span>
      </button>
      <button
        type="button"
        onClick={() => onChange("9:16")}
        className={`flex h-[56px] flex-1 items-center justify-center gap-2 rounded-[20px] px-3 text-left ${
          value === "9:16" ? "bg-white text-[var(--ink)] shadow-sm" : "text-stone-500 hover:text-[var(--ink)]"
        }`}
      >
        <PortraitIcon />
        <span>
          <span className="block text-[13px] font-medium leading-tight">9:16</span>
          <span className="block text-[10px] font-medium uppercase tracking-[0.12em] text-[var(--muted)]">Vertical</span>
        </span>
      </button>
    </div>
  );
}

function Segmented({
  value,
  options,
  onChange,
}: {
  value: string;
  options: Array<{ id: string; label: string }>;
  onChange: (value: string) => void;
}) {
  return (
    <div className="flex h-[56px] w-full items-center rounded-full bg-stone-100 p-[3px]">
      {options.map((option) => (
        <button
          key={option.id}
          type="button"
          onClick={() => onChange(option.id)}
          className={`h-full flex-1 rounded-full px-4 text-[13px] font-medium leading-none ${
            value === option.id ? "bg-white text-[var(--ink)] shadow-sm" : "text-stone-500 hover:text-[var(--ink)]"
          }`}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}

function CharacterSlot({
  slot,
  index,
  preview,
  disabled,
  onPick,
  onLabel,
}: {
  slot: ReferenceAsset;
  index: number;
  preview: string;
  disabled?: boolean;
  onPick: () => void;
  onLabel: (slot: ReferenceAsset, label: string) => void;
}) {
  const fallback = `Character ${index + 1}`;
  const named = Boolean(slot.label.trim() && !/^character\s*\d+$/i.test(slot.label.trim()));
  const [name, setName] = useState(named ? slot.label : "");

  useEffect(() => {
    setName(named ? slot.label : "");
  }, [named, slot.label]);

  return (
    <div className="space-y-1.5">
      <UploadTile label={name.trim() || fallback} preview={preview} disabled={disabled} onClick={onPick} />
      <input
        type="text"
        value={name}
        disabled={disabled}
        placeholder="Role in the script (e.g. Cat)"
        onChange={(event) => setName(event.target.value)}
        onBlur={() => onLabel(slot, name.trim() || fallback)}
        className="w-full rounded-xl border border-[var(--line)] bg-white px-3 py-2.5 text-sm outline-none disabled:opacity-50"
      />
    </div>
  );
}

function UploadTile({
  label,
  preview,
  disabled,
  onClick,
}: {
  label: string;
  preview: string;
  disabled?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className="flex min-h-[88px] w-full items-center gap-3 rounded-2xl border border-dashed border-stone-300 bg-stone-50/70 px-3 py-2 text-left hover:border-stone-400 hover:bg-white hover:shadow-[0_10px_28px_rgba(28,25,23,0.06)] disabled:opacity-50"
    >
      {preview ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={preview} alt="" className="size-12 shrink-0 rounded-xl object-cover" />
      ) : (
        <span className="grid size-12 shrink-0 place-items-center rounded-xl bg-stone-50 text-stone-400">
          <PlusIcon />
        </span>
      )}
      <span className="min-w-0">
        <span className="block truncate text-[13px] font-medium text-[var(--ink)]">{label}</span>
        <span className="block text-[11px] text-[var(--muted)]">{preview ? "Replace" : "Optional"}</span>
      </span>
    </button>
  );
}

function BackButton({
  disabled,
  onClick,
  children = "Back",
}: {
  disabled?: boolean;
  onClick: () => void;
  children?: string;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className="btn-secondary rounded-full px-5 py-2.5 text-sm font-medium shadow-sm hover:border-stone-300 hover:bg-stone-50 disabled:opacity-50"
    >
      {children}
    </button>
  );
}

function InfoIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 12 12" fill="none" aria-hidden="true">
      <circle cx="6" cy="2.35" r="1.05" fill="currentColor" />
      <path d="M6 5.1v4.55" stroke="currentColor" strokeWidth="1.55" strokeLinecap="round" />
    </svg>
  );
}

function PlusIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <path d="M8 3.5v9M3.5 8h9" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  );
}

function ScriptIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <path d="M5 2.5h4.2L12.5 6v7.5H5A1.5 1.5 0 0 1 3.5 12V4A1.5 1.5 0 0 1 5 2.5Z" stroke="currentColor" strokeWidth="1.4" />
      <path d="M9.2 2.5V6h3.3" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round" />
    </svg>
  );
}

function LandscapeIcon() {
  return (
    <svg width="18" height="14" viewBox="0 0 18 14" fill="none" aria-hidden="true">
      <rect x="1.2" y="2.6" width="15.6" height="8.8" rx="1.6" stroke="currentColor" strokeWidth="1.5" />
    </svg>
  );
}

function PortraitIcon() {
  return (
    <svg width="14" height="18" viewBox="0 0 14 18" fill="none" aria-hidden="true">
      <rect x="2.6" y="1.2" width="8.8" height="15.6" rx="1.6" stroke="currentColor" strokeWidth="1.5" />
    </svg>
  );
}

function DownloadIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <path d="M8 2.5v7.2M5.2 7.4 8 10.2l2.8-2.8" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M3 12.5h10" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  );
}

function ExpandIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <path d="M9.5 3.5H12.5V6.5M6.5 12.5H3.5V9.5M12.5 3.5 9 7M3.5 12.5 7 9" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function VideoStage({
  title: _title,
  aspect,
  styleName,
  duration,
  src,
  poster,
  waiting,
  status,
  part,
  parts,
  downloadName,
  onExpand,
}: {
  title: string;
  aspect: AspectRatio;
  styleName: string;
  duration: number;
  src?: string;
  poster?: string;
  waiting?: boolean;
  status?: string;
  part?: number;
  parts?: number;
  downloadName?: string;
  onExpand?: () => void;
}) {
  const tall = aspect === "9:16";
  const ready = Boolean(src);
  const videoRef = useRef<HTMLVideoElement>(null);

  async function enterFullScreen() {
    const video = videoRef.current as
      | (HTMLVideoElement & { webkitEnterFullscreen?: () => void; webkitRequestFullscreen?: () => void })
      | null;
    try {
      if (video?.requestFullscreen) {
        await video.requestFullscreen();
        return;
      }
      if (video?.webkitEnterFullscreen) {
        video.webkitEnterFullscreen();
        return;
      }
      if (video?.webkitRequestFullscreen) {
        video.webkitRequestFullscreen();
        return;
      }
    } catch {
      // fall through to the overlay
    }
    onExpand?.();
  }

  return (
    <article className="theater-in overflow-hidden rounded-[24px] border border-[var(--line)] bg-[#111110] shadow-[0_30px_80px_rgba(28,25,23,0.16)] sm:rounded-[32px]">
      <div className="relative">
        <div
          className="theater-glow pointer-events-none absolute -inset-10 opacity-50"
          style={{
            background: "radial-gradient(ellipse at 50% 40%, color-mix(in srgb, var(--accent) 28%, transparent), transparent 64%)",
          }}
        />
        <div className="relative px-3 pb-4 pt-4 sm:px-6 sm:pb-5 sm:pt-6">
          <div className="mb-4 flex flex-wrap items-center gap-2 text-[11px] font-medium text-white/70">
            {part && parts ? (
              <span className="rounded-full bg-white/10 px-2.5 py-1">Part {part} of {parts}</span>
            ) : null}
            <span className="rounded-full bg-white/10 px-2.5 py-1">{duration}s</span>
            <span className="rounded-full bg-white/10 px-2.5 py-1 uppercase">{styleName}</span>
            <span className="rounded-full bg-white/10 px-2.5 py-1">{aspect}</span>
          </div>

          <div
            className={`relative overflow-hidden rounded-2xl bg-black ring-1 ring-white/10 sm:rounded-[24px] ${
              tall ? "mx-auto w-full max-w-[220px] sm:max-w-[280px] md:max-w-[320px]" : "w-full"
            }`}
            style={{ aspectRatio: tall ? "9 / 16" : "16 / 9" }}
          >
            {ready ? (
              <video
                ref={videoRef}
                src={src}
                poster={poster}
                controls
                playsInline
                preload="metadata"
                className="h-full w-full object-contain"
              />
            ) : poster ? (
              <>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={poster} alt="" className="h-full w-full object-cover" />
                <div className="absolute inset-0 overflow-hidden bg-black/45">
                  <div className="absolute inset-0 bg-gradient-to-t from-black/50 via-black/20 to-black/10" />
                  <div className="skeleton-scan pointer-events-none absolute inset-y-0 left-0 w-2/3" />
                  <div className="absolute inset-x-4 top-4 space-y-2">
                    <div className="h-2.5 w-2/5 rounded-full bg-white/20" />
                    <div className="h-2.5 w-3/5 rounded-full bg-white/12" />
                    <div className="h-2.5 w-1/3 rounded-full bg-white/10" />
                  </div>
                  <div className="absolute inset-0 grid place-items-center px-4">
                    <p className="status-breathe text-center text-sm font-medium tracking-wide text-white">
                      <span className="status-dots">
                        {waiting ? "Animating this shot" : "Waiting"}
                      </span>
                    </p>
                  </div>
                </div>
              </>
            ) : (
              <div className="relative grid h-full place-items-center overflow-hidden">
                <div className="shimmer absolute inset-0 opacity-40" />
                <div className="skeleton-scan pointer-events-none absolute inset-y-0 left-0 w-2/3" />
                <p className="status-breathe relative px-3 text-center text-sm text-white/80">
                  <span className="status-dots">{waiting ? "Animating this shot" : "Waiting"}</span>
                </p>
              </div>
            )}
          </div>

          <div className="mt-4 flex flex-col gap-2 sm:mt-5 sm:flex-row sm:flex-wrap sm:items-center sm:gap-3">
            {ready ? (
              <>
                <a
                  href={src}
                  download={downloadName || "video.mp4"}
                  className="btn-primary inline-flex w-full items-center justify-center gap-2 rounded-full bg-white px-5 py-2.5 text-sm font-medium text-[var(--ink)] shadow-[0_10px_30px_rgba(0,0,0,0.25)] sm:w-auto"
                >
                  <DownloadIcon />
                  Download video
                </a>
                {onExpand ? (
                  <button
                    type="button"
                    onClick={() => void enterFullScreen()}
                    className="inline-flex w-full items-center justify-center gap-2 rounded-full border border-white/15 bg-white/8 px-5 py-2.5 text-sm font-medium text-white sm:w-auto"
                  >
                    <ExpandIcon />
                    Full screen
                  </button>
                ) : null}
              </>
            ) : (
              <span className="rounded-full border border-white/10 px-4 py-2 text-center text-xs text-white/55">
                Download appears when the video is ready
              </span>
            )}
          </div>
        </div>
      </div>
    </article>
  );
}

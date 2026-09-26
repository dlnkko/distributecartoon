"use client";

import { useEffect, useMemo, useRef, useState, type RefObject } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import type { AgentMode, AspectRatio, Character, Project, ReferenceAsset, Scene, VisualStyle, WorkflowStep } from "@/lib/types";
import { isUnseenVoice } from "@/lib/refs";
import { activeTask } from "@/lib/tasks";
import { DURATION_CHOICES } from "@/lib/ids";
import { formatPartPlan, packScenesIntoParts, sceneHasStory } from "@/lib/timing";
import { ensureSceneShots } from "@/lib/shots";
import { durableVideoSrc, isProviderContentUrl, projectAwaitingVideo, projectDeliveredSrc, projectIsGenerating, projectIsMultipart, projectJoinedSrc } from "@/lib/video-jobs";
import { WhopPay } from "@/components/WhopPay";
import { PLANS } from "@/lib/plans";

function assetSrc(publicPath?: string) {
  if (!publicPath) return "";
  if (/^https:\/\/openrouter\.ai\/api\/v1\/videos\//i.test(publicPath)) {
    return `/api/video?url=${encodeURIComponent(publicPath)}`;
  }
  if (/^https?:\/\//i.test(publicPath)) return publicPath;
  const relative = publicPath.replace(/^\/(?:generated|api\/media)\//, "").replace(/^\//, "");
  return `/api/media/${relative}`;
}

async function prepareImageFile(file: File) {
  const type = (file.type || "").toLowerCase();
  const heic = type.includes("heic") || type.includes("heif") || /\.(heic|heif)$/i.test(file.name);
  let bitmap: ImageBitmap | null = null;
  try {
    bitmap = await createImageBitmap(file);
  } catch {
    bitmap = null;
  }
  if (!bitmap) {
    if (heic) throw new Error("Use a JPG or PNG photo.");
    if (file.size > 3_500_000) throw new Error("That photo is too large. Try a smaller JPG or PNG.");
    if (!/^image\/(jpeg|jpg|png|webp|gif)$/i.test(type) && type !== "") {
      throw new Error("Use a JPG, PNG, WEBP, or GIF photo.");
    }
    return file;
  }
  const max = 2048;
  const scale = Math.min(1, max / Math.max(bitmap.width, bitmap.height));
  const width = Math.max(1, Math.round(bitmap.width * scale));
  const height = Math.max(1, Math.round(bitmap.height * scale));
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) {
    bitmap.close();
    return file;
  }
  ctx.drawImage(bitmap, 0, 0, width, height);
  bitmap.close();
  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.88));
  if (!blob) return file;
  const stem = file.name.replace(/\.[^.]+$/, "") || "photo";
  return new File([blob], `${stem}.jpg`, { type: "image/jpeg" });
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
  createdAt: string;
};

const STEPS: Array<{ id: WorkflowStep; label: string }> = [
  { id: "script", label: "Script" },
  { id: "setup", label: "Setup" },
  { id: "review", label: "Scenes" },
  { id: "cast", label: "Cast" },
  { id: "produce", label: "Generate" },
];

function songMode(project: Project) {
  return Boolean(project.song) || project.workflowStep === "song";
}

function stepsFor(project: Project) {
  if (!songMode(project)) return STEPS;
  return [
    { id: "song" as const, label: "Song" },
    { id: "setup" as const, label: "Setup" },
    { id: "review" as const, label: "Scenes" },
    { id: "cast" as const, label: "Cast" },
    { id: "produce" as const, label: "Generate" },
  ];
}

function stepIndex(project: Project, step?: string) {
  return stepsFor(project).findIndex((item) => item.id === (step || (songMode(project) ? "song" : "script")));
}

function hasProductPhoto(project: Project) {
  return project.references.some((item) => item.kind === "product" && (item.originalPublicPath || item.originalRemoteUrl));
}

function stepReachable(project: Project, step: WorkflowStep) {
  if (step === "song") return songMode(project);
  if (step === "script") return !project.song;
  if (step === "setup") {
    if (project.song) return Boolean(project.song.productBrief?.trim()) && hasProductPhoto(project);
    return Boolean(project.scriptText.trim());
  }
  if (step === "review") return project.scenes.length > 0;
  if (step === "cast") return project.scenes.length > 0 && missingCastLooks(project).length === 0;
  return Boolean(projectDeliveredSrc(project));
}

function studioUrl(projectId?: string, step?: string) {
  if (!projectId) return window.location.pathname;
  const params = new URLSearchParams({ p: projectId });
  if (step) params.set("step", step);
  return `${window.location.pathname}?${params.toString()}`;
}

function draftKey(projectId: string) {
  return `script-draft:${projectId}`;
}

function readDraft(projectId: string) {
  try {
    return window.localStorage.getItem(draftKey(projectId)) || "";
  } catch {
    return "";
  }
}

function writeDraft(projectId: string, text: string) {
  try {
    if (text.trim()) window.localStorage.setItem(draftKey(projectId), text);
    else window.localStorage.removeItem(draftKey(projectId));
  } catch {
    // Private mode or a full quota only loses the unsaved draft.
  }
}

function timeAgo(iso: string) {
  const delta = Date.now() - new Date(iso || 0).getTime();
  const mins = Math.max(1, Number.isFinite(delta) ? Math.round(delta / 60000) : 1);
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.round(hours / 24);
  return days === 1 ? "1 day ago" : `${days} days ago`;
}

function batchVideoSrc(batch: { videoPublicPath?: string; videoRemoteUrl?: string }) {
  return batch.videoPublicPath || batch.videoRemoteUrl || "";
}

function videoMadeAt(project: Project, src: string) {
  const match = (project.archivedVideos || []).find((item) => item.publicPath === src && item.createdAt);
  return match?.createdAt || project.createdAt || "";
}

function historyFromProjects(projects: Project[]): HistoryVideo[] {
  const videos: HistoryVideo[] = [];
  const seen = new Set<string>();
  for (const project of projects) {
    const joined = projectJoinedSrc(project) || (projectIsMultipart(project) ? "" : projectDeliveredSrc(project));
    const ready = project.batches.filter((batch) => durableVideoSrc(batch) || batchVideoSrc(batch));
    const partSrcs = new Set(ready.map((batch) => batchVideoSrc(batch)).filter(Boolean));
    if (joined) {
      const dedupe = `${project.id}:${joined}`;
      if (!seen.has(dedupe)) {
        seen.add(dedupe);
        videos.push({
          key: `${project.id}-full`,
          projectId: project.id,
          title: project.title,
          src: joined,
          poster: ready[0]?.framePublicPath,
          duration: ready.reduce((sum, batch) => sum + (batch.duration || 0), 0) || project.targetDurationSeconds || 0,
          index: 1,
          parts: 1,
          aspectRatio: project.aspectRatio,
          createdAt: videoMadeAt(project, joined),
        });
      }
    }
    if (!projectIsMultipart(project)) {
      for (const batch of project.batches) {
        const src = durableVideoSrc(batch);
        if (!src) continue;
        const dedupe = `${project.id}:${src}`;
        if (seen.has(dedupe)) continue;
        seen.add(dedupe);
        videos.push({
          key: `${project.id}-part-${batch.index}`,
          projectId: project.id,
          title: project.batches.length > 1 ? `${project.title} · part ${batch.index}` : project.title,
          src,
          poster: batch.framePublicPath,
          duration: batch.duration,
          index: batch.index,
          parts: Math.max(1, project.batches.length),
          aspectRatio: project.aspectRatio,
          createdAt: batch.storedAt || batch.readyAt || project.createdAt || "",
        });
      }
    }
    for (const item of project.archivedVideos || []) {
      const src = item.publicPath;
      if (!src || isProviderContentUrl(src) || partSrcs.has(src) || /· part \d+/i.test(item.title || "")) continue;
      const dedupe = `${project.id}:${src}`;
      if (seen.has(dedupe)) continue;
      seen.add(dedupe);
      videos.push({
        key: `${project.id}-archive-${item.id}`,
        projectId: project.id,
        title: item.title || project.title,
        src,
        poster: item.posterPath,
        duration: item.duration,
        index: item.index,
        parts: 1,
        aspectRatio: project.aspectRatio,
        createdAt: item.createdAt || project.createdAt || "",
      });
    }
  }
  return videos.sort((a, b) => {
    const left = new Date(a.createdAt).getTime();
    const right = new Date(b.createdAt).getTime();
    return (Number.isFinite(right) ? right : 0) - (Number.isFinite(left) ? left : 0);
  });
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

function lookSrc(character: Pick<Character, "portraitPublicPath" | "portraitRemoteUrl" | "portraitFileName" | "id">) {
  const chosen =
    [character.portraitPublicPath, character.portraitRemoteUrl].find((item) => item && /^https?:\/\//i.test(item)) ||
    character.portraitPublicPath ||
    character.portraitRemoteUrl ||
    "";
  if (!chosen) return "";
  return `${assetSrc(chosen)}?v=${encodeURIComponent(character.portraitFileName || character.id)}`;
}

function lookFallbackSrc(character: Pick<Character, "portraitPublicPath" | "portraitRemoteUrl">) {
  const primary =
    [character.portraitPublicPath, character.portraitRemoteUrl].find((item) => item && /^https?:\/\//i.test(item)) ||
    character.portraitPublicPath ||
    "";
  const fallback = character.portraitRemoteUrl || "";
  return fallback && fallback !== primary ? fallback : "";
}

function missingCastLooks(project: Project) {
  return project.characters.filter(
    (character) =>
      !character.isExtra &&
      !isUnseenVoice(character) &&
      !lookSrc(character),
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
  const songRef = useRef<HTMLInputElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const abortRef = useRef<AbortController | null>(null);
  const projectsRef = useRef<Project[]>([]);
  const refInputs = useRef<Record<string, HTMLInputElement | null>>({});
  const projectRef = useRef<Project | null>(null);
  const settingsTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const notifyReadyRef = useRef(false);
  const [notifyReady, setNotifyReady] = useState(false);
  const [notifyHint, setNotifyHint] = useState("");
  const [pane, setPane] = useState<"library" | "studio">("library");
  const [payOpen, setPayOpen] = useState(false);
  const [generatingIds, setGeneratingIds] = useState<string[]>([]);
  const busyRef = useRef(false);
  const poppingRef = useRef(false);
  const urlReadyRef = useRef(false);

  function markGenerating(projectId: string, active: boolean) {
    setGeneratingIds((current) => {
      if (active) return current.includes(projectId) ? current : [...current, projectId];
      return current.filter((id) => id !== projectId);
    });
  }

  projectsRef.current = projects;
  const working = busy || Boolean(activeTask(project));
  busyRef.current = working;

  useEffect(() => {
    void boot();
    void registerNotifyWorker();
  }, []);

  useEffect(() => {
    let cancelled = false;

    async function syncProjects() {
      if (cancelled || document.visibilityState === "hidden") return;
      try {
        const res = await fetch("/api/projects");
        if (!res.ok) return;
        const list = (await res.json()) as Project[];
        if (cancelled || !Array.isArray(list)) return;
        setProjects(list);
        const currentId = projectRef.current?.id;
        const latest = currentId ? list.find((item) => item.id === currentId) : undefined;
        if (!latest) return;
        const hadVideo = Boolean(projectDeliveredSrc(projectRef.current));
        const hadTask = Boolean(activeTask(projectRef.current));
        remember(latest);
        if (hadTask && !activeTask(latest)) {
          if (latest.scenes.length) setScenesDraft(latest.scenes.map(cloneScene));
          setStatus(latest.taskError || "");
        }
        const hasVideo = Boolean(projectDeliveredSrc(latest));
        if (!hadVideo && hasVideo && notifyReadyRef.current) {
          void showReadyNotification(latest.title || "New video");
        }
        if (hasVideo) {
          markGenerating(latest.id, false);
          if (!projectAwaitingVideo(latest)) setStatus("");
        } else if (projectAwaitingVideo(latest) && !busy) setStatus("Generating your video…");
      } catch {
        // Keep the last snapshot until the next poll.
      }
    }

    function onResume() {
      if (document.visibilityState === "visible") void syncProjects();
    }

    window.addEventListener("visibilitychange", onResume);
    window.addEventListener("pageshow", onResume);
    window.addEventListener("focus", onResume);
    window.addEventListener("online", onResume);
    const timer = window.setInterval(() => {
      if (
        busy ||
        generatingIds.length ||
        activeTask(projectRef.current) ||
        projectAwaitingVideo(projectRef.current) ||
        projectIsGenerating(projectRef.current) ||
        projectsRef.current.some((item) => projectIsGenerating(item))
      ) {
        void syncProjects();
      }
    }, activeTask(projectRef.current) ? 4000 : 8000);

    return () => {
      cancelled = true;
      window.clearInterval(timer);
      window.removeEventListener("visibilitychange", onResume);
      window.removeEventListener("pageshow", onResume);
      window.removeEventListener("focus", onResume);
      window.removeEventListener("online", onResume);
    };
  }, [project?.id, busy, generatingIds.length, Boolean(activeTask(project))]);

  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "0px";
    el.style.height = `${Math.min(el.scrollHeight, 280)}px`;
  }, [scriptDraft]);

  useEffect(() => {
    if (!project) return;
    setScriptDraft(
      readDraft(project.id) || (isFileScript(project.scriptName) || project.song ? "" : project.scriptText || ""),
    );
    setScenesDraft(project.scenes.map(cloneScene));
  }, [project?.id]);

  useEffect(() => {
    const current = projectRef.current;
    if (!current || (current.workflowStep || "script") !== "script") return;
    writeDraft(current.id, scriptDraft === current.scriptText ? "" : scriptDraft);
  }, [scriptDraft]);

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
    const wanted = new URLSearchParams(window.location.search).get("p");
    const restored = wanted ? list.find((item) => item.id === wanted) : undefined;
    if (restored) {
      setProjects(list);
      void selectProject(restored);
      return;
    }
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
    setPane("studio");
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
    if (mode === "produce") {
      markGenerating(project.id, true);
      setPane("library");
      setStatus("Generating your video…");
    } else if (mode === "plan") {
      setStatus("Writing your scenes…");
    } else setStatus("");
    const controller = mode === "produce" ? null : new AbortController();
    if (controller) {
      abortRef.current?.abort();
      abortRef.current = controller;
    }
    try {
      const res = await fetch("/api/run", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ projectId: project.id, mode }),
        signal: controller?.signal,
      });
      if (!res.body) {
        if (mode === "produce") {
          markGenerating(project.id, true);
          setStatus("Generating your video…");
        } else setStatus("No response from the server.");
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
          if (event.type === "status" && event.text) {
            if (mode === "produce") setStatus(/couldn't|failed|error|stopped/i.test(event.text) ? event.text : "Generating your video…");
            else if (mode === "plan") setStatus("Writing your scenes…");
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
        const refreshed = await loadProjectById(project.id, controller?.signal || new AbortController().signal);
        if (refreshed) {
          remember(refreshed);
          if (mode === "plan" && refreshed.scenes.length) setScenesDraft(refreshed.scenes.map(cloneScene));
        }
        if (mode === "produce") {
          const latest = projectRef.current;
          const videoReady = Boolean(projectDeliveredSrc(latest));
          if (videoReady) {
            markGenerating(project.id, false);
            setStatus("");
          } else {
            markGenerating(project.id, true);
            setStatus("Generating your video…");
          }
          if (notifyReadyRef.current && videoReady) {
            void showReadyNotification(latest?.title || "New video");
          }
        } else {
          markGenerating(project.id, false);
          setStatus("");
          setPane("studio");
        }
      }
    } catch (error) {
      if (mode === "produce") {
        if (projectDeliveredSrc(projectRef.current)) markGenerating(project.id, false);
        else markGenerating(project.id, true);
        setStatus(projectDeliveredSrc(projectRef.current) ? "" : "Generating your video…");
      } else {
        markGenerating(project.id, false);
        setStatus((error as Error).name === "AbortError" ? "Stopped." : error instanceof Error ? error.message : "Request failed.");
        setPane("studio");
      }
      if (project?.id) {
        const recovered = await loadProjectById(project.id, new AbortController().signal).catch(() => null);
        if (recovered) remember(recovered);
      }
    } finally {
      if (controller && abortRef.current === controller) abortRef.current = null;
      setBusy(false);
    }
  }

  async function selectProject(item: Project) {
    projectRef.current = item;
    setProject(item);
    setStatus(projectAwaitingVideo(item) ? "Generating your video…" : "");
    const producing =
      item.workflowStep === "produce" &&
      !projectDeliveredSrc(item) &&
      (projectIsGenerating(item) || generatingIds.includes(item.id));
    setPane(producing ? "library" : "studio");
    setSidebarOpen(false);
    try {
      const latest = await loadProjectById(item.id, new AbortController().signal);
      if (latest) remember(latest);
    } catch {
      // Keep the cached project until the next sync.
    }
  }

  async function goToStep(target: WorkflowStep, fromHistory = false) {
    const current = projectRef.current;
    if (!current) return;
    const steps = stepsFor(current);
    const from = stepIndex(current, current.workflowStep);
    const to = stepIndex(current, target);
    const backward = to >= 0 && to < from;
    const forward = to > from && steps.slice(from + 1, to + 1).every((item) => stepReachable(current, item.id));
    const generatingNow = !projectDeliveredSrc(current) && projectIsGenerating(current);
    if (busyRef.current || generatingNow || !(backward || (fromHistory && forward))) {
      if (fromHistory) window.history.replaceState(null, "", studioUrl(current.id, current.workflowStep || "script"));
      return;
    }
    setStatus("");
    await patchProject({ workflowStep: target });
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
    setBusy(true);
    setStatus(`Uploading ${slot.label}…`);
    try {
      const image = await prepareImageFile(file);
      const form = new FormData();
      form.set("projectId", project.id);
      form.set("kind", slot.kind);
      form.set("slotId", slot.id);
      form.set("notes", slot.notes);
      form.set("file", image);
      const res = await fetch("/api/refs", { method: "POST", body: form });
      const json = (await res.json().catch(() => ({}))) as { project?: Project; error?: string };
      if (json.project) {
        remember(json.project);
        setStatus("");
      } else if (res.status === 413) {
        setStatus("That photo is too large. Try a smaller JPG or PNG.");
      } else {
        setStatus(json.error || "Couldn't upload that image.");
      }
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Couldn't upload that image.");
    }
    setBusy(false);
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

  async function onUploadSong(file: File) {
    if (!project) return;
    setBusy(true);
    setStatus(`Reading ${file.name}…`);
    const form = new FormData();
    form.set("projectId", project.id);
    form.set("file", file);
    const res = await fetch("/api/song", { method: "POST", body: form });
    const json = (await res.json().catch(() => ({}))) as { project?: Project; error?: string };
    if (json.project) {
      remember(json.project);
      setScriptDraft("");
      setStatus("");
    } else {
      setStatus(json.error || "Couldn't read that song.");
    }
    setBusy(false);
  }

  async function continueFromSong(brief: string) {
    if (!project || busy) return;
    if (!project.song) {
      setStatus("Upload a song first.");
      return;
    }
    if (!hasProductPhoto(project)) {
      setStatus("Add a photo of the product.");
      return;
    }
    if (brief.trim().length < 8) {
      setStatus("Describe what the product is about.");
      return;
    }
    setBusy(true);
    await patchProject({ songBrief: brief.trim(), workflowStep: "setup" });
    setBusy(false);
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
      writeDraft(json.project.id, "");
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
    if (current.song) await patchProject({ workflowStep: "setup" });
    else await patchProject({ targetDurationSeconds: current.targetDurationSeconds || 15, workflowStep: "setup" });
    await run("plan");
  }

  async function continueFromReview() {
    if (!project || busy) return;
    setBusy(true);
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    try {
      const scenes = scenesDraft
        .filter(sceneHasStory)
        .map((scene, index) => ({ ...scene, index: index + 1 }));
      if (!scenes.length) {
        setStatus("Every scene is empty. Add action or dialogue first.");
        setBusy(false);
        return;
      }
      const saved = await patchProject({
        scenes,
        workflowStep: "cast",
        resetGeneration: true,
      });
      if (!saved) return;
      setScenesDraft(scenes);
      setPane("studio");
      const json = await requestCastLooks(saved.id, controller.signal);
      if (json.project) {
        remember(json.project);
        const missing = missingCastLooks(json.project);
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
    const current = projectRef.current;
    if (current && !current.paidAt) {
      const status = await fetch(`/api/checkout?projectId=${encodeURIComponent(current.id)}`).then((response) =>
        response.json().catch(() => ({ enabled: false })),
      );
      if (status.enabled && !status.paid) {
        setPayOpen(true);
        return;
      }
    }
    setPane("library");
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
  const generating = useMemo(
    () =>
      projects
        .filter((item) => !projectDeliveredSrc(item))
        .filter((item) => generatingIds.includes(item.id) || projectIsGenerating(item))
        .map((item) => ({
          projectId: item.id,
          title: item.title || "Untitled video",
          duration: item.targetDurationSeconds || item.batches.reduce((sum, batch) => sum + (batch.duration || 0), 0) || 15,
          aspectRatio: item.aspectRatio,
        })),
    [projects, generatingIds],
  );
  const credits = profile?.credits ?? 120;

  useEffect(() => {
    const current = projectRef.current;
    if (!current) return;
    if (current.workflowStep !== "produce") return;
    if (projectDeliveredSrc(current)) return;
    if (generatingIds.includes(current.id) || projectIsGenerating(current)) setPane("library");
  }, [generatingIds, project?.id, project?.workflowStep, project?.joinedVideoPublicPath, project?.batches]);

  useEffect(() => {
    if (!project) return;
    const target = pane === "studio" ? studioUrl(project.id, project.workflowStep || "script") : studioUrl();
    const here = `${window.location.pathname}${window.location.search}`;
    const replace = poppingRef.current || !urlReadyRef.current;
    poppingRef.current = false;
    urlReadyRef.current = true;
    if (target === here) return;
    if (replace) window.history.replaceState(null, "", target);
    else window.history.pushState(null, "", target);
  }, [pane, project?.id, project?.workflowStep]);

  useEffect(() => {
    function onPopState() {
      const params = new URLSearchParams(window.location.search);
      const id = params.get("p");
      poppingRef.current = true;
      window.setTimeout(() => {
        poppingRef.current = false;
      }, 2000);
      const found = id ? projectsRef.current.find((item) => item.id === id) : undefined;
      if (!found) {
        setPane("library");
        return;
      }
      if (projectRef.current?.id !== found.id) {
        void selectProject(found);
        return;
      }
      setPane("studio");
      const wanted = params.get("step") as WorkflowStep | null;
      if (wanted && wanted !== (projectRef.current.workflowStep || "script")) void goToStep(wanted, true);
    }
    window.addEventListener("popstate", onPopState);
    return () => window.removeEventListener("popstate", onPopState);
  }, []);

  if (!project) {
    return <div className="grid h-screen place-items-center text-[var(--muted)]">Loading…</div>;
  }

  const step = project.workflowStep || "script";
  const task = activeTask(project);
  const taskLabel = task ? (task.kind === "plan" ? "Building your scenes… you can refresh, it keeps going." : "Casting characters… you can refresh, it keeps going.") : "";
  const charactersSlots = slotsOf(project, "character");
  const products = slotsOf(project, "product");
  const locations = slotsOf(project, "location");
  const logos = slotsOf(project, "logo");
  const allSlots = [...charactersSlots, ...products, ...locations, ...logos];

  return (
    <div className="relative flex h-dvh overflow-hidden" data-style={project.style}>
      {sidebarOpen ? (
        <button
          type="button"
          className="no-press fixed inset-0 z-30 bg-stone-900/20 md:hidden"
          aria-label="Close menu"
          onClick={() => setSidebarOpen(false)}
        />
      ) : null}

      <aside
        className={`fixed inset-y-0 left-0 z-40 flex w-[240px] flex-col border-r border-[var(--line)] bg-[#f3efe8] transition-transform md:static md:translate-x-0 ${
          sidebarOpen ? "translate-x-0" : "-translate-x-full"
        }`}
      >
        <div className="flex items-center justify-between px-5 pb-4 pt-5">
          <h1 className="display text-2xl">distribute.to</h1>
          <button type="button" className="rounded-xl px-2 py-1 text-sm md:hidden" onClick={() => setSidebarOpen(false)}>
            Close
          </button>
        </div>

        <div className="px-3 pb-3">
          <button
            type="button"
            onClick={() => void createNew()}
            className="btn-primary flex w-full items-center justify-center gap-2 rounded-2xl bg-[var(--ink)] px-4 py-3 text-sm font-semibold text-white shadow-[0_10px_24px_rgba(28,25,23,0.16)]"
          >
            <PlusIcon />
            Create a video
          </button>
        </div>

        <nav className="flex min-h-0 flex-1 flex-col gap-1 px-3">
          <button
            type="button"
            onClick={() => {
              setPane("library");
              setSidebarOpen(false);
            }}
            className={`flex w-full items-center gap-3 rounded-2xl px-3 py-2.5 text-left text-sm ${
              pane === "library" ? "bg-white shadow-sm" : "hover:bg-white/70"
            }`}
          >
            <VideosIcon />
            Your videos
          </button>
        </nav>

        <div className="p-3">
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
              <span className="block truncate text-sm font-medium">Your account</span>
              <span className="block truncate text-[11px] text-[var(--muted)]">
                {profile?.email || "Account"}
                {profile ? ` · ${credits} credits left` : ""}
              </span>
            </span>
          </button>
        </div>
      </aside>

      <section className="flex min-w-0 flex-1 flex-col bg-[var(--bg)]">
        {pane === "library" ? (
          <VideosDashboard
            videos={history}
            generating={generating}
            credits={credits}
            error={pane === "library" && status && !busy && /couldn't|failed|error|stopped|request failed/i.test(status) ? status : ""}
            onMenu={() => setSidebarOpen(true)}
            onPlay={(item) =>
              setExpanded({
                src: assetSrc(item.src),
                poster: item.poster ? assetSrc(item.poster) : undefined,
                label: item.title,
                downloadName: videoDownloadName(item.title, item.index, item.parts),
              })
            }
            onOpenProject={(projectId) => {
              const found = projects.find((entry) => entry.id === projectId);
              if (found) void selectProject(found);
            }}
            onCreate={() => void createNew()}
          />
        ) : (
          <>
        <header className="flex items-center gap-2 px-3 py-3 md:gap-3 md:px-6">
          <button type="button" className="grid size-10 shrink-0 place-items-center rounded-xl border border-[var(--line)] bg-white md:hidden" aria-label="Open menu" onClick={() => setSidebarOpen(true)}>
            <MenuIcon />
          </button>
          <div className="min-w-0 flex-1">
            <h2 className="display truncate text-lg md:text-2xl">{project.title}</h2>
          </div>
          <span className="shrink-0 rounded-full border border-[var(--line)] bg-white px-3 py-1.5 text-xs font-medium">{credits} credits</span>
          <button
            type="button"
            onClick={() => setPane("library")}
            className="shrink-0 rounded-xl border border-[var(--line)] bg-white px-3 py-2 text-sm"
          >
            <span className="sm:hidden">Library</span>
            <span className="hidden sm:inline">Your videos</span>
          </button>
        </header>
            <StepBar
              steps={stepsFor(project)}
              current={step}
              locked={working || (!projectDeliveredSrc(project) && projectIsGenerating(project))}
              onJump={(target) => void goToStep(target)}
            />
            {payOpen && project ? (
              <WhopPay
                projectId={project.id}
                email={profile?.email}
                onClose={() => setPayOpen(false)}
                onPaid={(next) => {
                  remember(next);
                  setPayOpen(false);
                  setPane("library");
                  void run("produce");
                }}
              />
            ) : null}
            <div className="scroll-thin relative mx-auto flex w-full max-w-4xl flex-1 flex-col overflow-y-auto px-3 pb-8 md:px-6">
          {working && step === "setup" ? (
            <div className="absolute inset-0 z-10 grid place-items-center bg-[var(--bg)]/75 p-6">
              <div className="w-full max-w-sm rounded-3xl border border-[var(--line)] bg-white px-6 py-7 text-center shadow-[0_12px_40px_rgba(28,25,23,0.08)]">
                <span className="mx-auto grid size-10 place-items-center">
                  <span className="size-7 animate-spin rounded-full border-2 border-stone-200 border-t-[var(--ink)]" />
                </span>
                <p className="display mt-4 text-2xl">Writing your scenes</p>
                <p className="mt-2 text-sm leading-6 text-[var(--muted)]">
                  {project.song
                    ? "This takes a minute. The scenes follow the song."
                    : "This takes a minute. The storyboard is being fitted to the length you picked."}
                </p>
              </div>
            </div>
          ) : null}
          {step === "script" ? (
            <ScriptStep
              key={project.id}
              scriptName={project.scriptName}
              fileAttached={isFileScript(project.scriptName)}
              value={scriptDraft}
              busy={working}
              textareaRef={textareaRef}
              onChange={setScriptDraft}
              onPickFile={() => fileRef.current?.click()}
              onClearFile={() => void clearScriptFile()}
              onSong={() => void patchProject({ workflowStep: "song" })}
              onContinue={() => void continueFromScript()}
            />
          ) : null}

          {step === "song" ? (
            <SongStep
              key={project.id}
              songName={project.song?.fileName || ""}
              songAttached={Boolean(project.song)}
              durationSeconds={project.song?.durationSeconds}
              brief={project.song?.productBrief || ""}
              productPreview={
                products[0]?.originalPublicPath ? assetSrc(products[0].originalPublicPath) : ""
              }
              busy={working}
              onPickSong={() => songRef.current?.click()}
              onClearSong={() => void patchProject({ clearSong: true })}
              onPickProduct={() => {
                const slot = products[0];
                if (slot) refInputs.current[slot.id]?.click();
              }}
              onUseScript={() => void (project.song ? clearScriptFile() : patchProject({ workflowStep: "script" }))}
              onContinue={(brief) => void continueFromSong(brief)}
            />
          ) : null}

          {step === "setup" ? (
            <SetupStep
              project={project}
              characters={charactersSlots}
              products={products}
              locations={locations}
              logos={logos}
              busy={working}
              onBack={() => void patchProject({ workflowStep: project.song ? "song" : "script" })}
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
              targetSeconds={project.targetDurationSeconds || 15}
              busy={working}
              hasVideo={Boolean(projectDeliveredSrc(project))}
              onChange={setScenesDraft}
              onBack={() =>
                void (projectDeliveredSrc(project)
                  ? patchProject({ scenes: scenesDraft, workflowStep: "produce" })
                  : patchProject({ workflowStep: "setup" }))
              }
              onContinue={() => void continueFromReview()}
            />
          ) : null}

          {step === "cast" ? (
            <CastStep
              characters={project.characters.filter((character) => !character.isExtra && !isUnseenVoice(character))}
              busy={working}
              onBack={() => void patchProject({ workflowStep: "review" })}
              onRevise={(characterId, notes) => void reviseCastLook(characterId, notes)}
              onContinue={() => void continueFromCast()}
            />
          ) : null}

          {step === "produce" ? (
            <ProduceStep
              project={project}
              busy={working}
              status={status}
              notifyReady={notifyReady}
              notifyHint={notifyHint}
              onNotifyMe={() => void enableReadyNotify()}
              onEditScenes={() => void patchProject({ workflowStep: "review" })}
              onExpand={(item) => setExpanded(item)}
            />
          ) : null}

          {taskLabel ? <p className="mt-4 text-sm text-[var(--muted)]">{taskLabel}</p> : null}
          {!working && status && step !== "produce" ? <p className="mt-4 text-sm text-[var(--danger)]">{status}</p> : null}
        </div>
          </>
        )}
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
      <input
        ref={songRef}
        type="file"
        accept="audio/*,.mp3,.wav,.m4a,.aac,.ogg"
        className="hidden"
        onChange={(event) => {
          const file = event.target.files?.[0];
          if (file) void onUploadSong(file);
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
          accept="image/jpeg,image/png,image/webp,image/gif,image/*"
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
              <div className="flex items-end justify-between rounded-2xl bg-[var(--bg)] px-4 py-3">
                <dt>
                  <span className="block text-[11px] uppercase tracking-[0.16em] text-[var(--muted)]">Credits left</span>
                  <span className="display mt-1 block text-3xl">{credits}</span>
                </dt>
                <dd className="max-w-[140px] text-right text-xs text-[var(--muted)]">A 30s film uses 30 credits.</dd>
              </div>
              <div className="rounded-2xl border border-[var(--line)] p-3">
                <p className="px-1 text-[11px] uppercase tracking-[0.16em] text-[var(--muted)]">Buy credits</p>
                <ul className="mt-2 flex flex-col gap-1.5">
                  {PLANS.map((plan) => (
                    <li key={plan.id}>
                      <a href={`/checkout/${plan.id}`} className="flex items-center justify-between rounded-xl px-2 py-2 hover:bg-[var(--bg)]">
                        <span>
                          {plan.name}
                          <span className="ml-2 text-[var(--muted)]">{plan.seconds} credits</span>
                        </span>
                        <span className="font-medium">${plan.price.toFixed(2)}</span>
                      </a>
                    </li>
                  ))}
                </ul>
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

function StepBar({
  steps,
  current,
  locked,
  onJump,
}: {
  steps: Array<{ id: WorkflowStep; label: string }>;
  current: WorkflowStep;
  locked?: boolean;
  onJump?: (step: WorkflowStep) => void;
}) {
  const index = steps.findIndex((item) => item.id === current);
  return (
    <ol className="mx-auto mb-3 flex w-full max-w-4xl items-center gap-1 overflow-x-auto px-3 md:gap-1.5 md:px-6">
      {steps.map((item, i) => {
        const active = i === index;
        const done = i < index;
        const content = (
          <>
            <span
              className={`grid size-5 shrink-0 place-items-center rounded-full text-[10px] font-medium ${
                active ? "bg-[var(--ink)] text-white" : done ? "bg-[var(--accent)] text-white" : "bg-stone-200 text-stone-500"
              }`}
            >
              {i + 1}
            </span>
            <span className={`truncate text-[10px] font-medium sm:text-[11px] ${active ? "text-[var(--ink)]" : "text-[var(--muted)]"}`}>{item.label}</span>
          </>
        );
        return (
          <li key={item.id} className="flex min-w-0 flex-1 items-center gap-1.5">
            {done && onJump ? (
              <button
                type="button"
                disabled={locked}
                onClick={() => onJump(item.id)}
                title={`Back to ${item.label}`}
                className="flex min-w-0 items-center gap-1.5 rounded-full hover:opacity-75 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {content}
              </button>
            ) : (
              content
            )}
            {i < steps.length - 1 ? <span className="hidden h-px flex-1 bg-stone-200 sm:block" /> : null}
          </li>
        );
      })}
    </ol>
  );
}

function VideosDashboard({
  videos,
  generating,
  credits,
  error,
  onMenu,
  onPlay,
  onOpenProject,
  onCreate,
}: {
  videos: HistoryVideo[];
  generating: Array<{ projectId: string; title: string; duration: number; aspectRatio: AspectRatio }>;
  credits: number;
  error?: string;
  onMenu: () => void;
  onPlay: (item: HistoryVideo) => void;
  onOpenProject: (projectId: string) => void;
  onCreate: () => void;
}) {
  const empty = videos.length === 0 && generating.length === 0;
  const summary = empty
    ? "Finished videos will appear here."
    : generating.length
      ? videos.length
        ? `${generating.length} generating · ${videos.length} finished`
        : "Generating your video"
      : `${videos.length} finished ${videos.length === 1 ? "video" : "videos"}`;
  const low = credits < 15;
  return (
    <div className="scroll-thin flex-1 overflow-y-auto px-4 pb-16 sm:px-6 lg:px-8">
      <div className="mx-auto w-full max-w-7xl">
        <div className="flex items-center gap-3 pt-4 sm:pt-7">
          <button type="button" className="grid size-10 shrink-0 place-items-center rounded-xl border border-[var(--line)] bg-white md:hidden" aria-label="Open menu" onClick={onMenu}>
            <MenuIcon />
          </button>
          <div className="min-w-0 flex-1">
            <h2 className="display text-[1.75rem] leading-none sm:text-[2.35rem]">Your videos</h2>
            <p className="mt-1.5 text-sm text-[var(--muted)]">{summary}</p>
          </div>
          <button
            type="button"
            onClick={onCreate}
            className="btn-primary hidden shrink-0 items-center justify-center gap-2 rounded-full bg-[var(--ink)] px-5 py-3 text-sm font-semibold text-white shadow-[0_14px_32px_rgba(28,25,23,0.2)] sm:inline-flex"
          >
            <PlusIcon />
            Create a video
          </button>
        </div>

        <div className={`mt-4 flex flex-col gap-3 rounded-[24px] border bg-white p-4 sm:mt-6 sm:flex-row sm:items-center sm:justify-between sm:p-5 ${low ? "border-[var(--warn)]" : "border-[var(--line)]"}`}>
          <div>
            <p className="text-[11px] font-medium uppercase tracking-[0.18em] text-[var(--muted)]">Credits left</p>
            <p className="display mt-1 text-4xl leading-none">{credits}</p>
            <p className="mt-2 max-w-sm text-sm text-[var(--muted)]">
              {low ? "Not enough for a 15s film. Buy a pack to generate." : "One credit is one second of video. A 30s film uses 30 credits."}
            </p>
          </div>
          <a href="/checkout/pro" className="btn-primary inline-flex items-center justify-center rounded-full bg-[var(--ink)] px-5 py-2.5 text-sm font-medium text-white">
            Buy credits
          </a>
        </div>

        <button
          type="button"
          onClick={onCreate}
          className="btn-primary mt-3 inline-flex w-full items-center justify-center gap-2 rounded-full bg-[var(--ink)] px-5 py-3 text-sm font-semibold text-white sm:hidden"
        >
          <PlusIcon />
          Create a video
        </button>

        {error ? <p className="mt-4 text-sm text-[var(--danger)]">{error}</p> : null}

        {empty ? (
          <div className="mt-14 flex flex-col items-center rounded-[28px] border border-dashed border-[var(--line)] bg-white/75 px-6 py-20 text-center">
            <p className="display text-2xl">No videos yet</p>
            <p className="mt-2 max-w-sm text-sm text-[var(--muted)]">When a video finishes generating, it will show up on this board.</p>
            <button
              type="button"
              onClick={onCreate}
              className="btn-primary mt-7 inline-flex items-center gap-2 rounded-full bg-[var(--ink)] px-6 py-3 text-[15px] font-semibold text-white"
            >
              <PlusIcon />
              Create a video
            </button>
          </div>
        ) : (
          <div className="mt-5 grid grid-cols-1 gap-3 min-[480px]:grid-cols-2 sm:mt-8 lg:grid-cols-3 xl:grid-cols-4">
            {generating.map((item) => (
              <article
                key={`generating-${item.projectId}`}
                className="overflow-hidden rounded-2xl border border-[var(--line)] bg-white text-left shadow-[0_6px_18px_rgba(28,25,23,0.04)]"
              >
                <div className="relative aspect-video overflow-hidden bg-stone-900">
                  <div className="shimmer absolute inset-0 opacity-40" />
                  <div className="skeleton-scan pointer-events-none absolute inset-y-0 left-0 w-2/3" />
                  <div className="absolute inset-0 grid place-items-center px-3">
                    <p className="status-breathe text-center text-[12px] font-medium tracking-wide text-white">
                      <span className="status-dots">Generating your video</span>
                    </p>
                  </div>
                  <span className="absolute bottom-1.5 right-1.5 rounded-full bg-black/65 px-1.5 py-0.5 text-[10px] text-white">
                    {item.duration}s
                  </span>
                </div>
                <div className="px-2.5 py-2">
                  <p className="truncate text-[13px] font-medium">{item.title}</p>
                  <p className="mt-0.5 text-[11px] text-[var(--muted)]">Generating your video</p>
                </div>
              </article>
            ))}
            {videos.map((item) => (
              <button
                key={item.key}
                type="button"
                onClick={() => onPlay(item)}
                className="group overflow-hidden rounded-2xl border border-[var(--line)] bg-white text-left shadow-[0_6px_18px_rgba(28,25,23,0.04)] hover:shadow-[0_12px_28px_rgba(28,25,23,0.08)]"
              >
                <div className="relative aspect-video overflow-hidden bg-stone-200">
                  {item.poster ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={assetSrc(item.poster)} alt="" className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-[1.03]" />
                  ) : (
                    <video src={assetSrc(item.src)} muted playsInline preload="metadata" className="h-full w-full object-cover" />
                  )}
                  <span className="absolute bottom-1.5 right-1.5 rounded-full bg-black/65 px-1.5 py-0.5 text-[10px] text-white">
                    {item.parts > 1 ? `Part ${item.index} · ${item.duration}s` : `${item.duration}s`}
                  </span>
                </div>
                <div className="flex items-start justify-between gap-2 px-2.5 py-2">
                  <div className="min-w-0">
                    <p className="truncate text-[13px] font-medium">{item.title || "Untitled video"}</p>
                    <p className="mt-0.5 text-[11px] text-[var(--muted)]">{timeAgo(item.createdAt)}</p>
                  </div>
                  <span
                    role="button"
                    tabIndex={0}
                    onClick={(event) => {
                      event.stopPropagation();
                      onOpenProject(item.projectId);
                    }}
                    onKeyDown={(event) => {
                      if (event.key === "Enter" || event.key === " ") {
                        event.preventDefault();
                        event.stopPropagation();
                        onOpenProject(item.projectId);
                      }
                    }}
                    className="shrink-0 pt-0.5 text-[11px] text-[var(--muted)] hover:text-[var(--ink)]"
                  >
                    Edit
                  </span>
                </div>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
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
  onSong,
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
  onSong: () => void;
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
          <h3 className="display text-2xl md:text-3xl">Add the script</h3>
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
      <p className="mt-1 text-sm text-[var(--muted)]">Upload a PDF or Word file, or type the script.</p>

      <button
        type="button"
        onClick={onPickFile}
        disabled={uploadLocked}
        title={typing ? "Clear the typed text to upload a file." : undefined}
        className={`mt-4 flex min-h-[108px] flex-col items-center justify-center gap-1.5 rounded-2xl border border-dashed px-5 text-center ${
          uploadLocked
            ? "cursor-not-allowed border-stone-200 bg-stone-50 text-stone-400 opacity-60"
            : "border-stone-300 bg-white hover:border-stone-400 hover:bg-stone-50 hover:shadow-[0_12px_32px_rgba(28,25,23,0.06)]"
        }`}
      >
        <span className="grid size-9 place-items-center rounded-xl bg-stone-100 text-stone-500">
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

      <label className="mt-4 text-xs font-medium text-[var(--muted)]">or type it here</label>
      <textarea
        ref={textareaRef}
        value={value}
        disabled={pasteLocked}
        onChange={(event) => onChange(event.target.value)}
        placeholder={fileAttached ? "Remove the file to type the script instead." : "Type or paste the full script or storyboard…"}
        className="mt-1.5 min-h-[120px] max-h-[220px] w-full resize-none overflow-y-auto rounded-2xl border border-[var(--line)] bg-white px-3 py-2.5 text-sm leading-6 outline-none placeholder:text-stone-400 disabled:cursor-not-allowed disabled:bg-stone-50 disabled:text-stone-400"
      />

      <div className="mt-auto flex items-center justify-between pt-6">
        <button type="button" disabled={busy} onClick={onSong} className="text-sm font-medium text-[var(--muted)] hover:text-[var(--ink)]">
          Make a song video
        </button>
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

function SongStep({
  songName,
  songAttached,
  durationSeconds,
  brief,
  productPreview,
  busy,
  onPickSong,
  onClearSong,
  onPickProduct,
  onUseScript,
  onContinue,
}: {
  songName: string;
  songAttached: boolean;
  durationSeconds?: number;
  brief: string;
  productPreview: string;
  busy: boolean;
  onPickSong: () => void;
  onClearSong: () => void;
  onPickProduct: () => void;
  onUseScript: () => void;
  onContinue: (brief: string) => void;
}) {
  const [text, setText] = useState(brief);
  const ready = songAttached && Boolean(productPreview) && text.trim().length >= 8;

  return (
    <div className="flex flex-1 flex-col">
      <h3 className="display text-2xl md:text-3xl">Song video</h3>
      <p className="mt-1 text-sm text-[var(--muted)]">Upload a Suno song, the product, and what it is about. Scenes come after the next step.</p>

      <button
        type="button"
        onClick={onPickSong}
        disabled={busy}
        className="mt-4 flex min-h-[108px] flex-col items-center justify-center gap-1.5 rounded-2xl border border-dashed border-stone-300 bg-white px-5 text-center hover:border-stone-400 hover:bg-stone-50"
      >
        <span className="grid size-9 place-items-center rounded-xl bg-stone-100 text-stone-500">
          <SongIcon />
        </span>
        <span className="text-sm font-medium text-[var(--ink)]">{songAttached ? songName : "Upload a Suno song"}</span>
        <span className="text-xs text-[var(--muted)]">
          {songAttached && durationSeconds ? `${Math.round(durationSeconds)} seconds` : "30 to 90 seconds · mp3, wav, m4a"}
        </span>
      </button>
      {songAttached ? (
        <button type="button" disabled={busy} onClick={onClearSong} className="btn-secondary mt-2 self-start rounded-full px-3 py-1.5 text-xs">
          Remove song
        </button>
      ) : null}

      <p className="mb-2 mt-4 text-[10px] font-medium uppercase tracking-[0.16em] text-[var(--muted)]">Product</p>
      <div className="max-w-xs">
        <UploadTile label="Product photo" preview={productPreview} hint={productPreview ? "Replace" : "Required"} disabled={busy} onClick={onPickProduct} />
      </div>

      <label className="mt-4 text-xs font-medium text-[var(--muted)]">What is this product about?</label>
      <textarea
        value={text}
        disabled={busy}
        onChange={(event) => setText(event.target.value)}
        placeholder="The brand, who it is for, and what the song should show."
        className="mt-1.5 min-h-[120px] w-full resize-none rounded-2xl border border-[var(--line)] bg-white px-3 py-2.5 text-sm leading-6 outline-none placeholder:text-stone-400"
      />

      <div className="mt-auto flex items-center justify-between pt-6">
        <button type="button" disabled={busy} onClick={onUseScript} className="text-sm font-medium text-[var(--muted)] hover:text-[var(--ink)]">
          Use a script instead
        </button>
        <button
          type="button"
          disabled={busy || !ready}
          onClick={() => onContinue(text)}
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
    <div className="flex flex-1 flex-col gap-3">
      <div>
        <h3 className="display text-2xl md:text-3xl">{project.song ? "Characters and places" : "Look and length"}</h3>
        <p className="mt-1 text-sm text-[var(--muted)]">
          {project.song
            ? "The song sets the length. Add characters and places if you have them."
            : "Photos are optional. Name a role if you restyle a real person."}
        </p>
      </div>

      <section className="setup-card">
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <p className="mb-2 text-[10px] font-medium uppercase tracking-[0.16em] text-[var(--muted)]">Style</p>
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
            <p className="mb-2 text-[10px] font-medium uppercase tracking-[0.16em] text-[var(--muted)]">Format</p>
            <AspectPicker value={project.aspectRatio || "16:9"} onChange={onAspect} />
          </div>
        </div>
        {project.song ? null : (
          <div className="mt-4">
            <p className="mb-2 text-[10px] font-medium uppercase tracking-[0.16em] text-[var(--muted)]">Length</p>
            <DurationControl value={project.targetDurationSeconds || 15} disabled={busy} onChange={onDuration} />
            <p className="mt-2 text-xs text-[var(--muted)]">
              Scenes are fitted to this length. Each take is at most 30s, and a scene is never split across takes.
            </p>
          </div>
        )}
      </section>

      <section className="setup-card">
        <p className="text-[10px] font-medium uppercase tracking-[0.16em] text-[var(--muted)]">
          Characters · up to 4
        </p>
        <p className="mt-1 mb-3 text-xs text-[var(--muted)]">One photo per role from the script. Leave empty if you do not have one.</p>
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
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

      {project.song ? null : (
        <section className="setup-card">
          <p className="mb-3 text-[10px] font-medium uppercase tracking-[0.16em] text-[var(--muted)]">Product · up to 3</p>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
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
      )}

      <section className="setup-card">
        <p className="mb-3 text-[10px] font-medium uppercase tracking-[0.16em] text-[var(--muted)]">Location · up to 2</p>
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
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
        <p className="mb-3 text-[10px] font-medium uppercase tracking-[0.16em] text-[var(--muted)]">Logo · 1</p>
        <div className="grid grid-cols-1 gap-2 sm:max-w-[220px]">
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

function FitText({
  value,
  disabled,
  placeholder,
  onChange,
}: {
  value: string;
  disabled: boolean;
  placeholder: string;
  onChange: (value: string) => void;
}) {
  const ref = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    const field = ref.current;
    if (!field) return;
    field.style.height = "0px";
    field.style.height = `${field.scrollHeight}px`;
  }, [value]);

  return (
    <textarea
      ref={ref}
      value={value}
      disabled={disabled}
      placeholder={placeholder}
      rows={2}
      onChange={(event) => onChange(event.target.value)}
      className="w-full resize-none overflow-hidden bg-transparent text-sm leading-5 outline-none"
    />
  );
}

function ReviewStep({
  scenes,
  targetSeconds,
  busy,
  hasVideo,
  onChange,
  onBack,
  onContinue,
}: {
  scenes: Scene[];
  targetSeconds: number;
  busy: boolean;
  hasVideo: boolean;
  onChange: (scenes: Scene[]) => void;
  onBack: () => void;
  onContinue: () => void;
}) {
  function update(index: number, patch: Partial<Scene>) {
    onChange(scenes.map((scene, i) => (i === index ? { ...scene, ...patch } : scene)));
  }

  function remove(index: number) {
    if (scenes.length <= 1) return;
    onChange(scenes.filter((_, i) => i !== index).map((scene, i) => ({ ...scene, index: i + 1 })));
  }

  const parts = packScenesIntoParts(
    scenes.map((scene) => ({ index: scene.index, estimatedSeconds: scene.estimatedSeconds || 0 })),
    targetSeconds,
  );
  const canContinue = scenes.some(sceneHasStory);

  const groups = parts.length
    ? parts.map((part, partIndex) => ({
        key: `part-${partIndex + 1}`,
        label: `Part ${partIndex + 1}`,
        max: part.duration,
        indexes: part.sceneIndexes
          .map((sceneIndex) => scenes.findIndex((scene) => scene.index === sceneIndex))
          .filter((index) => index >= 0),
      }))
    : [{ key: "all", label: "Scenes", max: targetSeconds, indexes: scenes.map((_, index) => index) }];

  return (
    <div className="flex flex-1 flex-col gap-3">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <h3 className="display text-xl">Scenes</h3>
          <p className="mt-0.5 text-xs text-[var(--muted)]">One short beat per card. Each part stays within 30s.</p>
        </div>
        <p className="text-xs text-[var(--muted)]">{formatPartPlan(parts)}</p>
      </div>

      {groups.map((group) => {
        const seconds = group.indexes.reduce((sum, index) => sum + (scenes[index]?.estimatedSeconds || 0), 0);
        return (
          <section key={group.key} className="flex flex-col gap-1.5">
            <div className="flex items-baseline justify-between px-0.5">
              <h4 className="text-sm font-semibold">{group.label}</h4>
              <p className="text-[11px] tabular-nums text-[var(--muted)]">
                {Math.round(seconds * 10) / 10}s · max {group.max}s
              </p>
            </div>
            {group.indexes.map((index) => {
              const scene = scenes[index];
              const empty = !sceneHasStory(scene);
              return (
                <article key={scene.id} className={`overflow-hidden rounded-xl border bg-white ${empty ? "border-amber-200" : "border-[var(--line)]"}`}>
                  <div className="flex items-center gap-2 border-b border-[var(--line)] bg-stone-50/80 px-3 py-1.5">
                    <span className="text-xs font-semibold tabular-nums">Scene {scene.index || index + 1}</span>
                    {empty ? <span className="text-[11px] text-amber-700">Empty</span> : null}
                    <label className="ml-auto flex items-center gap-1 text-[11px] text-[var(--muted)]">
                      <input
                        type="number"
                        min={2}
                        max={30}
                        value={scene.estimatedSeconds}
                        disabled={busy}
                        aria-label={`Scene ${scene.index || index + 1} seconds`}
                        onChange={(event) => {
                          const estimatedSeconds = Math.min(30, Math.max(2, Number(event.target.value) || 2));
                          update(index, ensureSceneShots({ ...scene, estimatedSeconds }));
                        }}
                        className="w-10 rounded-md border border-stone-200 bg-white px-1 py-0.5 text-right text-xs tabular-nums text-[var(--ink)] outline-none"
                      />
                      sec
                    </label>
                    <button
                      type="button"
                      disabled={busy || scenes.length <= 1}
                      aria-label={`Delete scene ${scene.index || index + 1}`}
                      onClick={() => remove(index)}
                      className="rounded-md px-1.5 py-0.5 text-[11px] text-stone-400 hover:bg-red-50 hover:text-[var(--danger)] disabled:opacity-30"
                    >
                      Delete
                    </button>
                  </div>
                  <div className="grid grid-cols-[4.25rem_1fr] items-start gap-x-3 gap-y-1.5 px-3 py-2.5">
                    <span className="pt-0.5 text-[11px] text-[var(--muted)]">Place</span>
                    <input
                      value={scene.location}
                      disabled={busy}
                      onChange={(event) => update(index, { location: event.target.value })}
                      placeholder="Where this happens"
                      className="w-full bg-transparent text-sm font-medium outline-none"
                    />
                    <span className="pt-0.5 text-[11px] text-[var(--muted)]">Shot</span>
                    <input
                      value={scene.camera}
                      disabled={busy}
                      onChange={(event) => update(index, { camera: event.target.value })}
                      placeholder="Camera"
                      className="w-full bg-transparent text-sm outline-none"
                    />
                    <span className="pt-0.5 text-[11px] text-[var(--muted)]">Action</span>
                    <FitText
                      value={scene.summary}
                      disabled={busy}
                      placeholder="What happens in this shot"
                      onChange={(summary) => update(index, { summary })}
                    />
                    <span className="pt-1 text-[11px] text-[var(--muted)]">Line</span>
                    <div className="min-w-0">
                      {scene.dialogue.map((line, lineIndex) => (
                        <div key={`${scene.id}-d-${lineIndex}`} className="mb-1 flex items-center gap-1.5">
                          <input
                            value={line.speaker}
                            disabled={busy}
                            placeholder="Speaker"
                            onChange={(event) => {
                              const dialogue = scene.dialogue.map((item, i) => (i === lineIndex ? { ...item, speaker: event.target.value } : item));
                              update(index, { dialogue });
                            }}
                            className="w-24 shrink-0 rounded-md bg-stone-100 px-1.5 py-0.5 text-xs font-medium outline-none"
                          />
                          <input
                            value={line.line}
                            disabled={busy}
                            placeholder="Spoken line"
                            onChange={(event) => {
                              const dialogue = scene.dialogue.map((item, i) => (i === lineIndex ? { ...item, line: event.target.value } : item));
                              update(index, { dialogue });
                            }}
                            className="min-w-0 flex-1 bg-transparent text-sm outline-none"
                          />
                          <button
                            type="button"
                            disabled={busy}
                            aria-label="Remove line"
                            onClick={() => update(index, { dialogue: scene.dialogue.filter((_, i) => i !== lineIndex) })}
                            className="px-1 text-sm text-stone-400 hover:text-[var(--danger)]"
                          >
                            ×
                          </button>
                        </div>
                      ))}
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => update(index, { dialogue: [...scene.dialogue, { speaker: "", line: "" }] })}
                        className="text-[11px] text-[var(--accent)]"
                      >
                        Add line
                      </button>
                    </div>
                  </div>
                </article>
              );
            })}
          </section>
        );
      })}

      <div className="mt-auto flex items-center justify-between pt-2">
        <BackButton disabled={busy} onClick={onBack}>
          {hasVideo ? "Back to video" : "Back"}
        </BackButton>
        <button
          type="button"
          disabled={busy || !canContinue}
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
  const ready = characters.length === 0 || characters.every((character) => Boolean(lookSrc(character)));

  return (
    <div className="flex flex-1 flex-col gap-3">
      <div>
        <h3 className="display text-2xl md:text-3xl">Approve the cast</h3>
        <p className="mt-1 text-sm text-[var(--muted)]">
          {characters.length
            ? "Main characters only. One pose each. Change a look once if needed."
            : "No on-screen characters in this script. Continue when you are ready to generate."}
        </p>
      </div>

      {characters.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-[var(--line)] bg-white px-5 py-10 text-center text-sm text-[var(--muted)]">
          Voice-over only. Nothing to approve here.
        </div>
      ) : null}

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {characters.map((character) => {
          const src = lookSrc(character);
          const fallback = lookFallbackSrc(character);
          const draft = notes[character.id] || "";
          return (
            <article key={character.id} className="rounded-2xl border border-[var(--line)] bg-white p-3">
              <div className="aspect-square overflow-hidden rounded-xl bg-stone-100">
                {src ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={src}
                    alt={character.name}
                    className="h-full w-full object-contain"
                    onError={(event) => {
                      if (fallback && event.currentTarget.src !== fallback) event.currentTarget.src = fallback;
                    }}
                  />
                ) : (
                  <div className="grid h-full place-items-center px-4 text-center text-sm text-[var(--muted)]">
                    {busy ? "Casting…" : "No look yet"}
                  </div>
                )}
              </div>
              <p className="mt-2 text-sm font-medium">{character.name}</p>
              {character.description ? (
                <p className="mt-0.5 line-clamp-2 text-[11px] text-[var(--muted)]">{character.description}</p>
              ) : null}
              {character.lookRevisionUsed ? (
                <p className="mt-2 text-[11px] text-[var(--muted)]">This look can only be changed once.</p>
              ) : (
                <div className="mt-2 space-y-1.5">
                  <textarea
                    value={draft}
                    disabled={busy || !src}
                    onChange={(event) => setNotes((current) => ({ ...current, [character.id]: event.target.value }))}
                    placeholder="What to change in this look…"
                    className="min-h-[52px] w-full resize-none rounded-lg bg-stone-50 px-2.5 py-1.5 text-sm outline-none disabled:opacity-50"
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
  onEditScenes,
  onExpand,
}: {
  project: Project;
  busy: boolean;
  status: string;
  notifyReady: boolean;
  notifyHint: string;
  onNotifyMe: () => void;
  onEditScenes: () => void;
  onExpand: (item: { src: string; poster?: string; label?: string; downloadName?: string }) => void;
}) {
  const delivered = projectDeliveredSrc(project);
  const awaiting = projectAwaitingVideo(project);
  const working = busy || awaiting;
  const done = Boolean(delivered) && !working;
  const duration =
    project.targetDurationSeconds ||
    project.batches.reduce((sum, batch) => sum + (batch.duration || 0), 0) ||
    15;
  const poster = project.batches.find((batch) => batch.framePublicPath)?.framePublicPath;
  const heading = done ? "Your video" : "Generating your video";

  return (
    <div className="flex flex-1 flex-col gap-5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className="display text-3xl md:text-4xl">{heading}</h3>
          {working ? (
            <p className="mt-1 text-sm text-[var(--muted)]">
              You can leave this page, or lose connection. The video still finishes and shows up in Your videos.
            </p>
          ) : null}
        </div>
        {working ? (
          <div className="flex shrink-0 flex-col items-end gap-2 sm:flex-row">
            <button
              type="button"
              onClick={onNotifyMe}
              disabled={notifyReady}
              className="rounded-full border border-[var(--line)] bg-white px-3 py-1.5 text-sm font-medium disabled:opacity-70"
            >
              {notifyReady ? "Notifications on" : "Notify me when ready"}
            </button>
          </div>
        ) : null}
      </div>
      {working && notifyHint ? <p className="text-right text-xs text-[var(--muted)]">{notifyHint}</p> : null}
      {!working && (status || project.produceError) ? (
        <p className="text-sm text-[var(--danger)]">{status || project.produceError}</p>
      ) : null}

      <div>
        <VideoStage
          title={project.title}
          aspect={project.aspectRatio}
          styleName={project.style}
          duration={duration}
          src={delivered ? assetSrc(delivered) : undefined}
          poster={poster ? assetSrc(poster) : undefined}
          waiting={!delivered}
          downloadName={videoDownloadName(project.title)}
          onExpand={
            delivered
              ? () =>
                  onExpand({
                    src: assetSrc(delivered),
                    poster: poster ? assetSrc(poster) : undefined,
                    label: project.title,
                    downloadName: videoDownloadName(project.title),
                  })
              : undefined
          }
        />
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
  disabled,
  onChange,
}: {
  value: number;
  disabled?: boolean;
  onChange: (seconds: number) => void;
}) {
  const selected = DURATION_CHOICES.includes(value as (typeof DURATION_CHOICES)[number])
    ? value
    : DURATION_CHOICES[0];
  return (
    <div className="flex flex-wrap gap-1.5" role="group" aria-label="Duration in seconds">
      {DURATION_CHOICES.map((seconds) => (
        <button
          key={seconds}
          type="button"
          disabled={disabled}
          aria-pressed={selected === seconds}
          onClick={() => onChange(seconds)}
          className={`rounded-full px-3 py-1.5 text-sm font-medium tabular-nums ${
            selected === seconds ? "bg-[var(--ink)] text-white" : "bg-stone-100 text-[var(--ink)] hover:bg-stone-200"
          } disabled:opacity-40`}
        >
          {seconds}s
        </button>
      ))}
    </div>
  );
}

function AspectPicker({ value, onChange }: { value: AspectRatio; onChange: (value: AspectRatio) => void }) {
  return (
    <div className="flex w-full items-center rounded-xl bg-stone-100 p-[3px]">
      <button
        type="button"
        onClick={() => onChange("16:9")}
        className={`flex h-11 flex-1 items-center justify-center gap-2 rounded-[10px] px-3 text-left ${
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
        className={`flex h-11 flex-1 items-center justify-center gap-2 rounded-[10px] px-3 text-left ${
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
    <div className="flex h-11 w-full items-center rounded-full bg-stone-100 p-[3px]">
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
        className="w-full rounded-lg border border-[var(--line)] bg-white px-2.5 py-1.5 text-sm outline-none disabled:opacity-50"
      />
    </div>
  );
}

function UploadTile({
  label,
  preview,
  hint,
  disabled,
  onClick,
}: {
  label: string;
  preview: string;
  hint?: string;
  disabled?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className="flex min-h-[64px] w-full items-center gap-2.5 rounded-xl border border-dashed border-stone-300 bg-stone-50/70 px-2.5 py-1.5 text-left hover:border-stone-400 hover:bg-white disabled:opacity-50"
    >
      {preview ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={preview} alt="" className="size-9 shrink-0 rounded-lg object-cover" />
      ) : (
        <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-stone-50 text-stone-400">
          <PlusIcon />
        </span>
      )}
      <span className="min-w-0">
        <span className="block truncate text-[13px] font-medium text-[var(--ink)]">{label}</span>
        <span className="block text-[11px] text-[var(--muted)]">{hint || (preview ? "Replace" : "Optional")}</span>
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

function MenuIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M4 7h16M4 12h16M4 17h16" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
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

function VideosIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <rect x="2" y="3.5" width="12" height="9" rx="2" stroke="currentColor" strokeWidth="1.5" />
      <path d="M6.8 6.2 10 8l-3.2 1.8V6.2Z" fill="currentColor" />
    </svg>
  );
}

function SongIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <path d="M6 12.2V3.2l7-1.2v8.4" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round" />
      <circle cx="4.4" cy="12.2" r="1.6" stroke="currentColor" strokeWidth="1.4" />
      <circle cx="11.4" cy="10.4" r="1.6" stroke="currentColor" strokeWidth="1.4" />
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
                        {waiting ? "Generating your video" : "Waiting"}
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
                  <span className="status-dots">{waiting ? "Generating your video" : "Waiting"}</span>
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

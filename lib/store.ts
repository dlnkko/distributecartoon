import { existsSync, mkdirSync, readdirSync, readFileSync, unlinkSync, writeFileSync } from "node:fs";
import path from "node:path";
import { createClient } from "@/lib/supabase/server";
import { createId, nowIso, normalizeAspectRatio } from "./ids";
import { ensureReferenceSlots, isUnseenVoice, syncReferenceInclusion } from "./refs";
import { isSpeechMode, type AspectRatio, type Project, type VisualStyle, type WorkflowStep } from "./types";

const projectsDir = () => path.join(process.cwd(), "data", "projects");

function ensureDir() {
  mkdirSync(projectsDir(), { recursive: true });
}

function fileFor(id: string) {
  return path.join(projectsDir(), `${id}.json`);
}

function writeLocal(project: Project) {
  try {
    ensureDir();
    writeFileSync(fileFor(project.id), JSON.stringify(project, null, 2), "utf8");
  } catch {
    // Vercel and similar hosts have an ephemeral filesystem.
  }
}

function readLocal(id: string): Project | null {
  try {
    const file = fileFor(id);
    if (!existsSync(file)) return null;
    return JSON.parse(readFileSync(file, "utf8")) as Project;
  } catch {
    return null;
  }
}

function pickNewer(left: Project | null, right: Project | null) {
  if (!left) return right;
  if (!right) return left;
  const leftAt = Date.parse(left.updatedAt || "");
  const rightAt = Date.parse(right.updatedAt || "");
  if (Number.isFinite(rightAt) && (!Number.isFinite(leftAt) || rightAt > leftAt)) return right;
  return left;
}

function readLocalProjects(ownerId?: string) {
  try {
    ensureDir();
    return readdirSync(projectsDir())
      .filter((name) => name.endsWith(".json"))
      .flatMap((name) => {
        try {
          const project = JSON.parse(readFileSync(path.join(projectsDir(), name), "utf8")) as Project;
          normalizeProject(project);
          return [project];
        } catch {
          return [];
        }
      })
      .filter((item) => item.id && (!ownerId || !item.ownerId || item.ownerId === ownerId))
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  } catch {
    return [];
  }
}

export function normalizeProject(project: Project): Project {
  project.references = Array.isArray(project.references) ? project.references : [];
  project.scriptRefCues = Array.isArray(project.scriptRefCues) ? project.scriptRefCues : [];
  project.skippedRefs = Boolean(project.skippedRefs);
  project.characters = project.characters || [];
  if (!isSpeechMode(project.speechMode)) delete project.speechMode;
  project.scriptCast = Array.isArray(project.scriptCast)
    ? project.scriptCast.filter((item) => item?.name?.trim() && item?.role?.trim())
    : [];
  project.scenes = project.scenes || [];
  project.batches = project.batches || [];
  project.archivedVideos = Array.isArray(project.archivedVideos) ? project.archivedVideos : [];
  project.locationPlates = Array.isArray(project.locationPlates) ? project.locationPlates : [];
  for (const batch of project.batches) {
    if (!batch.duration) batch.duration = 15;
  }
  project.messages = project.messages || [];
  project.pendingQuestions = project.pendingQuestions || [];
  project.aspectRatio = normalizeAspectRatio(project.aspectRatio);
  if (typeof project.targetDurationSeconds !== "number") {
    project.targetDurationSeconds = 15;
    project.durationAuto = false;
  }
  project.durationPending = false;
  if (!project.workflowStep) {
    project.workflowStep = inferWorkflowStep(project);
  }
  ensureReferenceSlots(project);
  if (project.title === "Nuevo corto" || project.title === "New short") project.title = "New video";
  if (project.scriptText || project.scenes.length) {
    syncReferenceInclusion(project);
  }
  return project;
}

export function inferWorkflowStep(project: Project): WorkflowStep {
  if (project.song && project.scenes.length === 0) return project.song.productBrief?.trim() ? "setup" : "song";
  if (!project.scriptText?.trim() && project.scenes.length === 0) return "script";
  if (!project.scenes.length) return "setup";
  if (
    project.batches.some(
      (batch) =>
        batch.videoPublicPath ||
        batch.videoRemoteUrl ||
        batch.kieVideoTaskId ||
        batch.status === "generating_video" ||
        batch.status === "generating_frame",
    )
  ) {
    return "produce";
  }
  if (
    project.style !== "realistic" &&
    project.characters.some((character) => !character.isExtra && !isUnseenVoice(character) && (character.portraitPublicPath || character.portraitRemoteUrl) && !character.lookConfirmed)
  ) {
    return "cast";
  }
  return "review";
}

export function ensureArchivedVideo(project: Project, batch: Project["batches"][number]) {
  const src = batch.videoPublicPath || batch.videoRemoteUrl;
  if (!src) return;
  project.archivedVideos = Array.isArray(project.archivedVideos) ? project.archivedVideos : [];
  const existing = project.archivedVideos.find((item) => item.id === batch.id || item.publicPath === src || item.publicPath === batch.videoRemoteUrl);
  if (existing) {
    existing.publicPath = src;
    existing.posterPath = batch.framePublicPath || existing.posterPath;
    existing.duration = batch.duration || existing.duration;
    return;
  }
  project.archivedVideos.push({
    id: batch.id,
    title: project.title,
    publicPath: src,
    posterPath: batch.framePublicPath,
    duration: batch.duration,
    index: batch.index,
    createdAt: nowIso(),
  });
}

export function archiveReadyVideos(project: Project) {
  for (const batch of project.batches) {
    ensureArchivedVideo(project, batch);
  }
}

export function resetStoryboard(project: Project) {
  project.scenes = [];
  project.batches = [];
  project.archivedVideos = [];
  project.locationPlates = [];
  project.characters = [];
  project.scriptCast = [];
  project.scriptRefCues = [];
  project.skippedRefs = false;
  project.pendingQuestions = [];
  delete project.lastVideoFileName;
  delete project.lastVideoPublicPath;
  delete project.lastVideoRemoteUrl;
  delete project.joinedVideoFileName;
  delete project.joinedVideoPublicPath;
  delete project.joinedVideoRemoteUrl;
  delete project.joinedSource;
}

async function persistRemote(project: Project) {
  if (!project.ownerId) return;
  const supabase = await createClient();
  const { error } = await supabase.from("projects").upsert(
    {
      id: project.id,
      owner_id: project.ownerId,
      title: project.title,
      style: project.style,
      payload: project,
      updated_at: project.updatedAt,
    },
    { onConflict: "id" },
  );
  if (error) {
    console.warn("project save skipped", project.id, error.message);
    if (process.env.NODE_ENV === "development" && /row-level security|jwt|permission denied/i.test(error.message)) return;
    throw new Error(error.message);
  }
}

async function readRemote(id: string): Promise<Project | null> {
  try {
    const supabase = await createClient();
    const { data, error } = await supabase.from("projects").select("payload").eq("id", id).maybeSingle();
    if (error || !data?.payload) return null;
    return data.payload as Project;
  } catch {
    return null;
  }
}

export async function createProject(
  style: VisualStyle = "pixar",
  aspectRatio: AspectRatio = "16:9",
  ownerId?: string,
  workflowStep: WorkflowStep = "script",
): Promise<Project> {
  const stamp = nowIso();
  const project: Project = {
    id: createId("proj"),
    title: "New video",
    style,
    aspectRatio: normalizeAspectRatio(aspectRatio),
    scriptName: "",
    scriptText: "",
    characters: [],
    scenes: [],
    batches: [],
    archivedVideos: [],
    references: [],
    scriptRefCues: [],
    skippedRefs: false,
    durationAuto: false,
    targetDurationSeconds: 15,
    durationPending: false,
    workflowStep,
    pendingQuestions: [],
    ownerId,
    messages: [],
    createdAt: stamp,
    updatedAt: stamp,
  };
  ensureReferenceSlots(project);
  await saveProject(project);
  return project;
}

export async function saveProject(project: Project) {
  normalizeProject(project);
  project.updatedAt = nowIso();
  writeLocal(project);
  await persistRemote(project);
  return project;
}

export async function getProject(id: string): Promise<Project | null> {
  const remote = await readRemote(id);
  const project = pickNewer(remote, readLocal(id));
  if (!project) return null;
  const missingSlots = !Array.isArray(project.references) || project.references.length === 0;
  normalizeProject(project);
  if (missingSlots && (project.scriptText || project.scenes.length)) await saveProject(project);
  else writeLocal(project);
  return project;
}

export async function listProjects(ownerId?: string): Promise<Project[]> {
  if (ownerId) {
    try {
      const supabase = await createClient();
      const { data, error } = await supabase
        .from("projects")
        .select("payload")
        .eq("owner_id", ownerId)
        .order("updated_at", { ascending: false });
      if (!error && data) {
        const byId = new Map<string, Project>();
        for (const row of data) {
          const project = normalizeProject(row.payload as Project);
          if (project.id) byId.set(project.id, project);
        }
        for (const local of readLocalProjects(ownerId)) {
          const existing = byId.get(local.id);
          if (!existing || local.updatedAt > existing.updatedAt) byId.set(local.id, local);
        }
        return [...byId.values()].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
      }
    } catch {
      // Fall through to local files in development.
    }
  }

  return readLocalProjects(ownerId);
}

export async function deleteProject(id: string) {
  try {
    const supabase = await createClient();
    await supabase.from("projects").delete().eq("id", id);
  } catch {
    // Local-only cleanup still runs.
  }
  try {
    const file = fileFor(id);
    if (existsSync(file)) unlinkSync(file);
  } catch {
    // Ignore missing local files.
  }
}

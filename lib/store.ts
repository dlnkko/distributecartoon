import { existsSync, mkdirSync, readdirSync, readFileSync, unlinkSync, writeFileSync } from "node:fs";
import path from "node:path";
import { createId, nowIso, normalizeAspectRatio } from "./ids";
import { ensureReferenceSlots, syncReferenceInclusion } from "./refs";
import type { AspectRatio, Project, VisualStyle, WorkflowStep } from "./types";

const projectsDir = () => path.join(process.cwd(), "data", "projects");

function ensureDir() {
  mkdirSync(projectsDir(), { recursive: true });
}

function fileFor(id: string) {
  return path.join(projectsDir(), `${id}.json`);
}

export function normalizeProject(project: Project): Project {
  project.references = Array.isArray(project.references) ? project.references : [];
  project.scriptRefCues = Array.isArray(project.scriptRefCues) ? project.scriptRefCues : [];
  project.skippedRefs = Boolean(project.skippedRefs);
  project.characters = project.characters || [];
  project.scenes = project.scenes || [];
  project.batches = project.batches || [];
  project.archivedVideos = Array.isArray(project.archivedVideos) ? project.archivedVideos : [];
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
  if (project.title === "Nuevo corto") project.title = "New short";
  if (project.scriptText || project.scenes.length) {
    syncReferenceInclusion(project);
  }
  return project;
}

export function inferWorkflowStep(project: Project): WorkflowStep {
  if (!project.scriptText?.trim() && project.scenes.length === 0) return "script";
  if (!project.scenes.length) return "setup";
  if (project.batches.some((batch) => batch.videoPublicPath || batch.status === "generating_video" || batch.status === "generating_frame")) {
    return "produce";
  }
  if (project.characters.some((character) => !character.isExtra && (character.portraitPublicPath || character.portraitRemoteUrl) && !character.lookConfirmed)) {
    return "cast";
  }
  return "review";
}

export function archiveReadyVideos(project: Project) {
  project.archivedVideos = Array.isArray(project.archivedVideos) ? project.archivedVideos : [];
  for (const batch of project.batches) {
    if (!batch.videoPublicPath) continue;
    project.archivedVideos.push({
      id: batch.id,
      title: project.title,
      publicPath: batch.videoPublicPath,
      posterPath: batch.framePublicPath,
      duration: batch.duration,
      index: batch.index,
      createdAt: nowIso(),
    });
  }
}

export function resetStoryboard(project: Project) {
  project.scenes = [];
  project.batches = [];
  project.archivedVideos = [];
  project.characters = [];
  project.scriptRefCues = [];
  project.skippedRefs = false;
  project.pendingQuestions = [];
  delete project.lastVideoFileName;
  delete project.lastVideoPublicPath;
  delete project.lastVideoRemoteUrl;
}

export function createProject(style: VisualStyle = "pixar", aspectRatio: AspectRatio = "16:9", ownerId?: string): Project {
  ensureDir();
  const stamp = nowIso();
  const project: Project = {
    id: createId("proj"),
    title: "New short",
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
    workflowStep: "script",
    pendingQuestions: [],
    ownerId,
    messages: [],
    createdAt: stamp,
    updatedAt: stamp,
  };
  ensureReferenceSlots(project);
  saveProject(project);
  return project;
}

export function saveProject(project: Project) {
  ensureDir();
  normalizeProject(project);
  project.updatedAt = nowIso();
  writeFileSync(fileFor(project.id), JSON.stringify(project, null, 2), "utf8");
  return project;
}

export function getProject(id: string): Project | null {
  const file = fileFor(id);
  if (!existsSync(file)) return null;
  const project = JSON.parse(readFileSync(file, "utf8")) as Project;
  const missingSlots = !Array.isArray(project.references) || project.references.length === 0;
  normalizeProject(project);
  if (missingSlots && (project.scriptText || project.scenes.length)) saveProject(project);
  return project;
}

export function listProjects(ownerId?: string): Project[] {
  ensureDir();
  const projects = readdirSync(projectsDir())
    .filter((name) => name.endsWith(".json"))
    .map((name) => {
      const project = JSON.parse(readFileSync(path.join(projectsDir(), name), "utf8")) as Project;
      const missingSlots = !Array.isArray(project.references) || project.references.length === 0;
      normalizeProject(project);
      if (missingSlots && (project.scriptText || project.scenes.length)) saveProject(project);
      return project;
    })
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  if (!ownerId) return projects;
  return projects.filter((item) => !item.ownerId || item.ownerId === ownerId);
}

export function deleteProject(id: string) {
  const file = fileFor(id);
  if (existsSync(file)) unlinkSync(file);
}

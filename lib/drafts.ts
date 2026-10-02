import type { Project, WorkflowStep } from "./types";
import { projectDeliveredSrc } from "./video-jobs";

const STEP_LABEL: Record<WorkflowStep, string> = {
  script: "Script",
  song: "Song",
  setup: "Setup",
  review: "Scenes",
  cast: "Cast",
  produce: "Generate",
};

function hasScript(project: Project) {
  if (project.scriptText?.trim()) return true;
  const name = project.scriptName || "";
  if (!name || /^(pasted-script|guion-pegado)\.txt$/i.test(name)) return false;
  return /\.(pdf|docx?|txt|md)$/i.test(name);
}

/** A script or song was added, and Generate was never pressed. */
export function isDraftProject(project: Project) {
  if (project.workflowStep === "produce" || project.produceStartedAt || project.keepGenerating) return false;
  if (projectDeliveredSrc(project)) return false;
  if ((project.archivedVideos || []).some((item) => item.publicPath)) return false;
  if (project.song) return true;
  return hasScript(project);
}

export function draftKind(project: Project): "Script" | "Song" {
  return project.song ? "Song" : "Script";
}

export function draftStepLabel(project: Project) {
  const step = project.workflowStep || "setup";
  return STEP_LABEL[step] || "Setup";
}

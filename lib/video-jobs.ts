import type { Batch, Project } from "./types";

export function batchAwaitingVideo(batch: Pick<Batch, "kieVideoTaskId" | "videoPublicPath" | "videoRemoteUrl" | "status">) {
  if (batch.videoPublicPath || batch.videoRemoteUrl) return false;
  const taskId = batch.kieVideoTaskId?.trim();
  if (taskId) return true;
  return batch.status === "generating_video";
}

export function projectJoinedSrc(project?: Pick<Project, "joinedVideoPublicPath" | "joinedVideoRemoteUrl"> | null) {
  return project?.joinedVideoPublicPath || project?.joinedVideoRemoteUrl || "";
}

export function projectIsMultipart(project?: Pick<Project, "batches"> | null) {
  return (project?.batches.length || 0) > 1;
}

export function projectDeliveredSrc(
  project?: Pick<Project, "batches" | "joinedVideoPublicPath" | "joinedVideoRemoteUrl"> | null,
) {
  if (!project) return "";
  const joined = projectJoinedSrc(project);
  if (joined) return joined;
  if (projectIsMultipart(project)) return "";
  const batch = project.batches[0];
  return batch?.videoPublicPath || batch?.videoRemoteUrl || "";
}

export function projectAwaitingVideo(
  project?: Pick<Project, "batches" | "joinedVideoPublicPath" | "joinedVideoRemoteUrl"> | null,
) {
  if (!project) return false;
  if (project.batches.some((batch) => batchAwaitingVideo(batch))) return true;
  return (
    projectIsMultipart(project) &&
    !projectJoinedSrc(project) &&
    project.batches.length > 0 &&
    project.batches.every((batch) => Boolean(batch.videoPublicPath || batch.videoRemoteUrl))
  );
}

export function projectIsGenerating(
  project?: Pick<
    Project,
    "batches" | "joinedVideoPublicPath" | "joinedVideoRemoteUrl" | "produceStartedAt" | "keepGenerating"
  > | null,
) {
  if (!project || projectDeliveredSrc(project) || !projectAwaitingVideo(project)) return false;
  const started = Date.now() - new Date(project.produceStartedAt || 0).getTime();
  const windowMs = project.keepGenerating ? 24 * 60 * 60 * 1000 : 2 * 60 * 60 * 1000;
  return Boolean(project.produceStartedAt) && Number.isFinite(started) && started >= 0 && started < windowMs;
}

export function realKieVideoTaskId(taskId?: string) {
  const id = taskId?.trim();
  if (!id || id === "pending") return "";
  return id;
}

// The produce function may run for 800s while it records character intros.
// Resuming sooner would send the story before those videos exist.
const STORY_RESUME_AFTER_MS = 14 * 60 * 1000;
const STORY_RESUME_BEFORE_MS = 24 * 60 * 60 * 1000;

export function storyBatchNeedsSubmit(
  batch: Pick<Batch, "videoPublicPath" | "videoRemoteUrl" | "kieVideoTaskId">,
) {
  if (batch.videoPublicPath || batch.videoRemoteUrl) return false;
  return !realKieVideoTaskId(batch.kieVideoTaskId);
}

export function produceShouldResumeStory(
  project?: Pick<
    Project,
    "produceStartedAt" | "batches" | "joinedVideoPublicPath" | "joinedVideoRemoteUrl" | "keepGenerating"
  > | null,
  now = Date.now(),
) {
  if (!project?.keepGenerating || !project.produceStartedAt || !project.batches.length || projectDeliveredSrc(project)) {
    return false;
  }
  const age = now - new Date(project.produceStartedAt).getTime();
  if (!Number.isFinite(age) || age < STORY_RESUME_AFTER_MS || age >= STORY_RESUME_BEFORE_MS) return false;
  return project.batches.some((batch) => storyBatchNeedsSubmit(batch));
}

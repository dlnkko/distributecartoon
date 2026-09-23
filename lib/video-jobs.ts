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
  if (!project || projectDeliveredSrc(project)) return false;
  if (project.keepGenerating) return true;
  if (!projectAwaitingVideo(project)) return false;
  const started = Date.now() - new Date(project.produceStartedAt || 0).getTime();
  return Boolean(project.produceStartedAt) && Number.isFinite(started) && started >= 0 && started < 2 * 60 * 60 * 1000;
}

export function isProviderContentUrl(value?: string) {
  return Boolean(value && /openrouter\.ai\/api\/v1\/videos\//i.test(value));
}

// A part counts as saved only when the file lives outside the provider URL, which expires.
export function durableVideoSrc(batch: { videoPublicPath?: string; videoRemoteUrl?: string }) {
  if (batch.videoPublicPath && !isProviderContentUrl(batch.videoPublicPath)) return batch.videoPublicPath;
  if (batch.videoRemoteUrl && !isProviderContentUrl(batch.videoRemoteUrl)) return batch.videoRemoteUrl;
  return "";
}

export function realKieVideoTaskId(taskId?: string) {
  const id = taskId?.trim();
  if (!id || id === "pending") return "";
  return id;
}

export function storyBatchNeedsSubmit(
  batch: Pick<Batch, "videoPublicPath" | "videoRemoteUrl" | "kieVideoTaskId">,
) {
  if (batch.videoPublicPath || batch.videoRemoteUrl) return false;
  return !realKieVideoTaskId(batch.kieVideoTaskId);
}

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

export function realKieVideoTaskId(taskId?: string) {
  const id = taskId?.trim();
  if (!id || id === "pending") return "";
  return id;
}

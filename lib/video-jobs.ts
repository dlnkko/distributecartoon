import type { Batch, Project } from "./types";

export function batchAwaitingVideo(batch: Pick<Batch, "kieVideoTaskId" | "videoPublicPath" | "videoRemoteUrl" | "status">) {
  if (batch.videoPublicPath || batch.videoRemoteUrl) return false;
  const taskId = batch.kieVideoTaskId?.trim();
  if (taskId) return true;
  return batch.status === "generating_video";
}

export function projectAwaitingVideo(project: Pick<Project, "batches"> | null | undefined) {
  return Boolean(project?.batches.some((batch) => batchAwaitingVideo(batch)));
}

export function realKieVideoTaskId(taskId?: string) {
  const id = taskId?.trim();
  if (!id || id === "pending") return "";
  return id;
}

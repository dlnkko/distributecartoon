import type { PendingTask, Project } from "./types";

// Vercel stops a function after 300s, so an older marker belongs to a run that was killed.
const TASK_STALE_MS = 6 * 60 * 1000;

export function activeTask(project?: Pick<Project, "pendingTask"> | null): PendingTask | undefined {
  const task = project?.pendingTask;
  if (!task) return undefined;
  const age = Date.now() - new Date(task.startedAt).getTime();
  return Number.isFinite(age) && age < TASK_STALE_MS ? task : undefined;
}

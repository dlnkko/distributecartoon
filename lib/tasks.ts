import type { PendingTask, Project } from "./types";

// The plan function may run for the full 800s host limit while max reasoning finishes.
const TASK_STALE_MS = 13 * 60 * 1000;

export function activeTask(project?: Pick<Project, "pendingTask"> | null): PendingTask | undefined {
  const task = project?.pendingTask;
  if (!task) return undefined;
  const age = Date.now() - new Date(task.startedAt).getTime();
  return Number.isFinite(age) && age < TASK_STALE_MS ? task : undefined;
}

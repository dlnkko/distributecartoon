import { abortableDelay } from "./abort";
import { advanceProduce, saveSoon, setProjectSaver, type ProduceState } from "./pipeline";
import { getProject, saveProject } from "./store";
import { claimProject, saveClaimedProject, workerEnabled } from "./worker-db";
import type { Project } from "./types";

const STEP_GAP_MS = 10_000;

type DriveOptions = {
  onStatus?: (text: string) => void;
  onProject?: (project: Project) => void;
};

// Advances one generation for at most budgetMs. Vercel Hobby stops functions at 300s,
// so a long video is finished by many short runs: the request that started it, the
// dashboard polls, and the Supabase cron that pings /api/worker every minute.
export async function driveProduce(projectId: string, budgetMs: number, options: DriveOptions = {}) {
  const leaseSeconds = Math.ceil(budgetMs / 1000) + 90;
  const project = workerEnabled() ? await claimProject(projectId, leaseSeconds) : await getProject(projectId);
  if (!project) return null;
  if (!project.keepGenerating) {
    if (workerEnabled()) await saveClaimedProject(project, 0).catch(() => undefined);
    return project;
  }

  if (workerEnabled()) setProjectSaver(project.id, (next) => saveClaimedProject(next, leaseSeconds));
  const until = Date.now() + budgetMs;
  let state: ProduceState = "waiting";
  try {
    while (true) {
      try {
        state = await advanceProduce(project, options.onStatus || (() => undefined));
      } catch (error) {
        console.error("produce step failed", project.id, error);
      }
      await saveSoon(project);
      options.onProject?.(project);
      if (state !== "waiting" || Date.now() + STEP_GAP_MS + 20_000 > until) break;
      await abortableDelay(STEP_GAP_MS);
    }
  } finally {
    await saveSoon(project).catch(() => undefined);
    setProjectSaver(project.id);
    if (workerEnabled()) await saveClaimedProject(project, 0).catch(() => undefined);
    else await saveProject(project).catch(() => undefined);
  }
  return project;
}

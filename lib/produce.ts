import { abortableDelay } from "./abort";
import { withUserKieKey } from "./kie";
import { advanceProduce, saveSoon, setProjectSaver, type ProduceState } from "./pipeline";
import { getProject, saveProject } from "./store";
import { kieKeyForUser } from "./user-kie";
import { activeProjectIds, claimProject, saveClaimedProject, workerEnabled } from "./worker-db";
import type { Project } from "./types";

const drives = new Map<string, Promise<Project | null>>();
const STEP_GAP_MS = 10_000;
// Pro plan functions can run 800s. The lease ends with the function, so a killed run
// never blocks the next worker pass for long.
const FUNCTION_LIFE_MS = 760_000;

type DriveOptions = {
  onStatus?: (text: string) => void;
  onProject?: (project: Project) => void;
};

// Advances one generation. New steps only start inside budgetMs, which leaves room for a
// slow step (sending parts, saving videos, joining) to finish before Vercel stops the function.
export function driveProduce(projectId: string, budgetMs: number, options: DriveOptions = {}) {
  const current = drives.get(projectId);
  if (current) return current;
  const job = runDrive(projectId, budgetMs, options).finally(() => {
    if (drives.get(projectId) === job) drives.delete(projectId);
  });
  drives.set(projectId, job);
  return job;
}

async function runDrive(projectId: string, budgetMs: number, options: DriveOptions = {}) {
  const startedAt = Date.now();
  const deadline = startedAt + FUNCTION_LIFE_MS;
  const leaseSeconds = () => Math.max(5, Math.ceil((deadline - Date.now()) / 1000));
  const leasedMode = workerEnabled();
  let project = leasedMode ? await claimProject(projectId, leaseSeconds()) : await getProject(projectId);
  const claimHeld = Boolean(leasedMode && project);
  if (!project && leasedMode) {
    const active = await activeProjectIds().catch(() => null);
    if (active && !active.includes(projectId)) {
      const local = await getProject(projectId);
      if (local?.keepGenerating) project = local;
    }
  }
  if (!project) return null;
  const film = project;
  if (!film.keepGenerating) {
    if (claimHeld) await saveClaimedProject(film, 0).catch(() => undefined);
    return film;
  }

  if (claimHeld) setProjectSaver(film.id, (next) => saveClaimedProject(next, leaseSeconds()));
  const apiKey = film.ownerId ? await kieKeyForUser(film.ownerId) : null;
  if (!apiKey && process.env.NODE_ENV !== "development") {
    film.keepGenerating = false;
    const batch = film.batches.find((item) => item.status === "generating_video" || item.status === "planned");
    if (batch) batch.error = "Add your KIE API key. Video runs on your KIE account.";
    await saveSoon(film);
    if (claimHeld) await saveClaimedProject(film, 0).catch(() => undefined);
    else await saveProject(film).catch(() => undefined);
    return film;
  }
  const drive = () => runSteps();
  return apiKey ? withUserKieKey(apiKey, drive) : drive();

  async function runSteps() {
    let state: ProduceState = "waiting";
    try {
      while (true) {
        try {
          state = await advanceProduce(film, options.onStatus || (() => undefined));
        } catch (error) {
          console.error("produce step failed", film.id, error);
        }
        await saveSoon(film);
        options.onProject?.(film);
        if (state !== "waiting" || Date.now() + STEP_GAP_MS > startedAt + budgetMs) break;
        await abortableDelay(STEP_GAP_MS);
      }
    } finally {
      await saveSoon(film).catch(() => undefined);
      setProjectSaver(film.id);
      if (claimHeld) await saveClaimedProject(film, 0).catch(() => undefined);
      else await saveProject(film).catch(() => undefined);
    }
    return film;
  }
}

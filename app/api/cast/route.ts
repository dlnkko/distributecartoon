import { after, NextResponse } from "next/server";
import { isAbortError } from "@/lib/abort";
import { loadOwnedProject } from "@/lib/auth";
import {
  confirmCharacterLooks,
  ensureCharacterLooks,
  leadCharacters,
  reviseCharacterLook,
} from "@/lib/pipeline";
import { refineStoryLeads } from "@/lib/refs";
import { saveProject } from "@/lib/store";
import { activeTask } from "@/lib/tasks";
import type { Project } from "@/lib/types";

export const runtime = "nodejs";
export const maxDuration = 300;

// Looks keep generating when the tab reloads; the client picks them up from pendingTask.
async function castInBackground(project: Project, work: () => Promise<void>) {
  project.pendingTask = { kind: "cast", startedAt: new Date().toISOString() };
  delete project.taskError;
  project.workflowStep = "cast";
  await saveProject(project);
  const job = (async () => {
    try {
      await work();
    } catch (error) {
      project.taskError = isAbortError(error) ? "Stopped." : error instanceof Error ? error.message : "Couldn't update the cast.";
    } finally {
      delete project.pendingTask;
      project.workflowStep = "cast";
      await saveProject(project).catch((error) => console.error("cast save failed", project.id, error));
    }
  })();
  try {
    after(job);
  } catch {
    // Local dev finishes the cast on this request.
  }
  await job;
  if (project.taskError) return NextResponse.json({ error: project.taskError, project }, { status: 500 });
  return NextResponse.json({ project });
}

export async function POST(request: Request) {
  const body = (await request.json().catch(() => ({}))) as {
    projectId?: string;
    characterId?: string;
    notes?: string;
    confirm?: boolean;
  };
  if (!body.projectId) return NextResponse.json({ error: "Missing project." }, { status: 400 });
  const loaded = await loadOwnedProject(body.projectId);
  if ("response" in loaded) return loaded.response;
  const { project } = loaded;
  if (!project.scenes.length) {
    return NextResponse.json({ error: "Review scenes before casting." }, { status: 400 });
  }
  if (activeTask(project)) {
    return NextResponse.json({ error: "Still working on the cast. Hang on a moment.", project }, { status: 409 });
  }

  if (body.confirm) {
    try {
      await confirmCharacterLooks(project);
      project.workflowStep = "produce";
      await saveProject(project);
      return NextResponse.json({ project });
    } catch (error) {
      return NextResponse.json(
        { error: error instanceof Error ? error.message : "Couldn't update the cast." },
        { status: 500 },
      );
    }
  }

  if (body.characterId) {
    const characterId = body.characterId;
    return castInBackground(project, () =>
      reviseCharacterLook(project, characterId, String(body.notes || ""), () => undefined).then(() => undefined),
    );
  }

  return castInBackground(project, async () => {
    refineStoryLeads(project);
    await saveProject(project);
    if (leadCharacters(project).length) await ensureCharacterLooks(project, () => undefined);
  });
}

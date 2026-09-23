import { after } from "next/server";
import { isAbortError } from "@/lib/abort";
import { runAgent } from "@/lib/agent";
import { loadOwnedProject } from "@/lib/auth";
import { resetInFlightBatches, startProduce } from "@/lib/pipeline";
import { driveProduce } from "@/lib/produce";
import { getProject, saveProject } from "@/lib/store";
import { activeTask } from "@/lib/tasks";
import type { AgentMode, Project, StudioEvent } from "@/lib/types";
import { projectDeliveredSrc } from "@/lib/video-jobs";

export const runtime = "nodejs";
// Pro allows 800s. The worker keeps going after this request ends.
export const maxDuration = 800;

const produceLocks = new Map<string, Promise<void>>();

function eventBus() {
  const queued: StudioEvent[] = [];
  let sink: ((event: StudioEvent) => void) | null = null;
  return {
    send(event: StudioEvent) {
      if (!sink) {
        queued.push(event);
        return;
      }
      try {
        sink(event);
      } catch {
        sink = null;
      }
    },
    attach(next: (event: StudioEvent) => void) {
      sink = next;
      const pending = queued.splice(0);
      for (const event of pending) {
        try {
          next(event);
        } catch {
          sink = null;
          break;
        }
      }
    },
    detach() {
      sink = null;
    },
  };
}

function streamEvents(work: Promise<void>, bus: ReturnType<typeof eventBus>) {
  const encoder = new TextEncoder();
  return new Response(
    new ReadableStream({
      start(controller) {
        const send = (event: StudioEvent) => {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`));
        };
        bus.attach(send);
        void work.finally(() => {
          bus.detach();
          try {
            controller.close();
          } catch {
            // The browser already dropped the connection.
          }
        });
      },
      cancel() {
        bus.detach();
      },
    }),
    {
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache, no-transform",
        Connection: "keep-alive",
      },
    },
  );
}

async function runProduce(project: Project, send: (event: StudioEvent) => void) {
  try {
    send({ type: "project", project });
    const driven = await driveProduce(project.id, 120_000, {
      onStatus: (text) => send({ type: "status", text }),
      onProject: (next) => send({ type: "project", project: next }),
    });
    const latest = driven || (await getProject(project.id)) || project;
    send({ type: "project", project: latest });
    if (latest.produceError) send({ type: "error", text: latest.produceError });
  } catch (error) {
    console.error("produce request failed", project.id, error);
  }
  send({ type: "done" });
}

export async function POST(request: Request) {
  const body = (await request.json()) as { projectId?: string; mode?: AgentMode };
  if (!body.projectId || (body.mode !== "plan" && body.mode !== "produce")) {
    return new Response(JSON.stringify({ error: "Missing project or mode." }), { status: 400 });
  }

  const loaded = await loadOwnedProject(body.projectId);
  if ("response" in loaded) return loaded.response;
  const { project } = loaded;

  if (body.mode === "plan" && !project.scriptText.trim()) {
    return new Response(JSON.stringify({ error: "Add a script first." }), { status: 400 });
  }
  if (body.mode === "produce" && !project.scenes.length) {
    return new Response(JSON.stringify({ error: "Review scenes before generating." }), { status: 400 });
  }

  if (body.mode === "produce") {
    if (!project.keepGenerating || projectDeliveredSrc(project)) {
      if (projectDeliveredSrc(project)) {
        const bus = eventBus();
        const work = Promise.resolve().then(() => {
          bus.send({ type: "project", project });
          bus.send({ type: "done" });
        });
        return streamEvents(work, bus);
      }
      await startProduce(project);
    }

    const existing = produceLocks.get(project.id);
    if (existing) {
      const bus = eventBus();
      const work = existing
        .catch(() => undefined)
        .then(async () => {
          const latest = (await getProject(project.id)) || project;
          bus.send({ type: "project", project: latest });
          bus.send({ type: "done" });
        });
      return streamEvents(work, bus);
    }

    const bus = eventBus();
    const work = runProduce(project, bus.send);
    produceLocks.set(project.id, work);
    void work.finally(() => {
      if (produceLocks.get(project.id) === work) produceLocks.delete(project.id);
    });
    try {
      after(work);
    } catch {
      // Local dev still finishes the video on this request. Vercel keeps it via after().
    }
    return streamEvents(work, bus);
  }

  const running = activeTask(project);
  if (running?.kind === "plan") {
    const bus = eventBus();
    const work = Promise.resolve().then(() => {
      bus.send({ type: "project", project });
      bus.send({ type: "done" });
    });
    return streamEvents(work, bus);
  }

  project.pendingTask = { kind: "plan", startedAt: new Date().toISOString() };
  delete project.taskError;
  await saveProject(project);
  const bus = eventBus();
  const work = runPlan(project, bus.send);
  try {
    after(work);
  } catch {
    // Local dev finishes the plan on this request.
  }
  return streamEvents(work, bus);
}

// The plan keeps running when the tab reloads; the client picks it up from pendingTask.
async function runPlan(project: Project, send: (event: StudioEvent) => void) {
  try {
    send({ type: "project", project });
    await runAgent({
      project,
      mode: "plan",
      onEvent: (event) => {
        if (event.type === "status" && event.text) send({ type: "status", text: event.text });
        if (event.type === "project" && event.project) send({ type: "project", project: event.project });
      },
    });
  } catch (error) {
    await resetInFlightBatches(project).catch(() => undefined);
    project.taskError = isAbortError(error) ? "Stopped." : error instanceof Error ? error.message : String(error);
    send({ type: "error", text: project.taskError });
  } finally {
    delete project.pendingTask;
    await saveProject(project).catch((error) => console.error("plan save failed", project.id, error));
    send({ type: "project", project });
    send({ type: "done" });
  }
}

import { after } from "next/server";
import { isAbortError } from "@/lib/abort";
import { runAgent } from "@/lib/agent";
import { loadOwnedProject } from "@/lib/auth";
import { recoverPendingVideos, resetInFlightBatches } from "@/lib/pipeline";
import { getProject, saveProject } from "@/lib/store";
import type { AgentMode, Project, StudioEvent } from "@/lib/types";

export const runtime = "nodejs";
// Intros finish before the story is sent. Fluid compute allows 800s (~13 min).
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

async function finishProduce(project: Project, send: (event: StudioEvent) => void) {
  try {
    send({ type: "project", project });
    await runAgent({
      project,
      mode: "produce",
      abortSignal: undefined,
      onEvent: (event) => {
        if (event.type === "status" && event.text) send({ type: "status", text: event.text });
        if (event.type === "project" && event.project) send({ type: "project", project: event.project });
      },
    });
    const latest = (await getProject(project.id)) || project;
    await recoverPendingVideos(latest);
    send({ type: "project", project: latest });
    send({ type: "done" });
  } catch (error) {
    const latest = (await getProject(project.id)) || project;
    await recoverPendingVideos(latest).catch(() => undefined);
    send({ type: "project", project: latest });
    if (!isAbortError(error)) {
      send({
        type: "error",
        text: error instanceof Error ? error.message : String(error),
      });
    }
    send({ type: "done" });
  }
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
    project.workflowStep = "produce";
    await recoverPendingVideos(project);
    await saveProject(project);

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
    const work = finishProduce(project, bus.send);
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

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const send = (event: StudioEvent) => {
        try {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`));
        } catch {
          // El cliente ya cortó la conexión.
        }
      };
      try {
        send({ type: "project", project });
        await runAgent({
          project,
          mode: "plan",
          abortSignal: request.signal,
          onEvent: (event) => {
            if (event.type === "status" && event.text) send({ type: "status", text: event.text });
            if (event.type === "project" && event.project) send({ type: "project", project: event.project });
          },
        });
        send({ type: "done" });
      } catch (error) {
        await resetInFlightBatches(project);
        send({
          type: "error",
          text: isAbortError(error) || request.signal.aborted ? "Stopped." : error instanceof Error ? error.message : String(error),
        });
        send({ type: "done" });
      } finally {
        try {
          controller.close();
        } catch {
          // ya cerrado
        }
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
    },
  });
}

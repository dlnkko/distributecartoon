import { isAbortError } from "@/lib/abort";
import { runAgent } from "@/lib/agent";
import { loadOwnedProject } from "@/lib/auth";
import { recoverPendingVideos, resetInFlightBatches } from "@/lib/pipeline";
import { getProject, saveProject } from "@/lib/store";
import type { AgentMode, StudioEvent } from "@/lib/types";

export const runtime = "nodejs";
export const maxDuration = 300;

const produceLocks = new Map<string, Promise<void>>();

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
      let releaseProduce: (() => void) | undefined;
      try {
        if (body.mode === "produce") {
          const existing = produceLocks.get(project.id);
          if (existing) {
            await existing.catch(() => undefined);
            const latest = (await getProject(project.id)) || project;
            send({ type: "project", project: latest });
            send({ type: "done" });
            return;
          }
          produceLocks.set(
            project.id,
            new Promise<void>((resolve) => {
              releaseProduce = resolve;
            }),
          );
        }
        send({ type: "project", project });
        await runAgent({
          project,
          mode: body.mode!,
          abortSignal: request.signal,
          onEvent: (event) => {
            if (event.type === "status" && event.text) send({ type: "status", text: event.text });
            if (event.type === "project" && event.project) send({ type: "project", project: event.project });
          },
        });
        if (body.mode === "produce") {
          const latest = (await getProject(project.id)) || project;
          await recoverPendingVideos(latest);
          send({ type: "project", project: latest });
        }
        send({ type: "done" });
      } catch (error) {
        await resetInFlightBatches(project);
        await recoverPendingVideos(project);
        send({
          type: "error",
          text: isAbortError(error) || request.signal.aborted ? "Stopped." : error instanceof Error ? error.message : String(error),
        });
        send({ type: "done" });
      } finally {
        releaseProduce?.();
        if (releaseProduce && produceLocks.get(project.id)) produceLocks.delete(project.id);
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

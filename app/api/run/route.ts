import { isAbortError } from "@/lib/abort";
import { runAgent } from "@/lib/agent";
import { resetInFlightBatches } from "@/lib/pipeline";
import { getProject, saveProject } from "@/lib/store";
import type { AgentMode, StudioEvent } from "@/lib/types";

export const runtime = "nodejs";
export const maxDuration = 800;

export async function POST(request: Request) {
  const body = (await request.json()) as { projectId?: string; mode?: AgentMode };
  if (!body.projectId || (body.mode !== "plan" && body.mode !== "produce")) {
    return new Response(JSON.stringify({ error: "Missing project or mode." }), { status: 400 });
  }

  const project = getProject(body.projectId);
  if (!project) {
    return new Response(JSON.stringify({ error: "Project not found" }), { status: 404 });
  }

  if (body.mode === "plan" && !project.scriptText.trim()) {
    return new Response(JSON.stringify({ error: "Add a script first." }), { status: 400 });
  }
  if (body.mode === "produce" && !project.scenes.length) {
    return new Response(JSON.stringify({ error: "Review scenes before generating." }), { status: 400 });
  }

  if (body.mode === "produce") {
    project.workflowStep = "produce";
    saveProject(project);
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
          mode: body.mode!,
          abortSignal: request.signal,
          onEvent: (event) => {
            if (event.type === "status" && event.text) send({ type: "status", text: event.text });
            if (event.type === "project" && event.project) send({ type: "project", project: event.project });
          },
        });
        send({ type: "done" });
      } catch (error) {
        resetInFlightBatches(project);
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

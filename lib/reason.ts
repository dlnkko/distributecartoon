import OpenAI from "openai";
import { abortableDelay, throwIfAborted } from "./abort";
import { TEXT_REASONING } from "./config";

const EFFORTS = [TEXT_REASONING, "xhigh", "high"] as const;

function stillRunning(response: OpenAI.Responses.Response) {
  if (response.status === "queued" || response.status === "in_progress") return true;
  return !response.status && !response.output?.length;
}

function usable(response: OpenAI.Responses.Response) {
  if (response.status === "completed") return true;
  return response.status === "incomplete" && response.output?.some((item) => item.type === "function_call");
}

export async function reasonedResponse(
  client: OpenAI,
  body: OpenAI.Responses.ResponseCreateParamsNonStreaming,
  options: { signal?: AbortSignal; waitMs: number; onWait?: () => void },
) {
  const started = Date.now();
  let lastError: unknown;
  for (const effort of EFFORTS) {
    try {
      const created = await client.responses.create(
        { ...body, reasoning: { effort }, background: true },
        { signal: options.signal },
      );
      return await waitForResponse(client, created, options, started);
    } catch (error) {
      lastError = error;
      if (options.signal?.aborted) throw error;
      const message = error instanceof Error ? error.message : String(error);
      if (!/effort|reasoning|background/i.test(message)) throw error;
    }
  }
  throw lastError instanceof Error ? lastError : new Error("The model could not start.");
}

async function waitForResponse(
  client: OpenAI,
  created: OpenAI.Responses.Response,
  options: { signal?: AbortSignal; waitMs: number; onWait?: () => void },
  started: number,
) {
  let current = created;
  while (stillRunning(current)) {
    if (Date.now() - started > options.waitMs) {
      await client.responses.cancel(current.id).catch(() => undefined);
      throw new Error("The story plan took too long. Try again.");
    }
    throwIfAborted(options.signal);
    options.onWait?.();
    await abortableDelay(4000, options.signal);
    current = await client.responses.retrieve(current.id, undefined, { signal: options.signal });
  }
  if (!usable(current)) {
    throw new Error(current.error?.message || "The model stopped before it finished.");
  }
  return current;
}

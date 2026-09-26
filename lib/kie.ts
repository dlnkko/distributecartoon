import { getSecrets } from "./config";
import { abortableDelay, isAbortError, throwIfAborted } from "./abort";
import { generateGptImage25Flare as generateFalGptImage25Flare, uploadLocalPublicPath } from "./fal";

const OPENROUTER_BASE = "https://openrouter.ai/api/v1";
const SEEDANCE_MODEL = "bytedance/seedance-2.5";
const SEEDANCE_FAST_MODEL = "bytedance/seedance-2.0-fast";

type OpenRouterJob = {
  id?: string;
  polling_url?: string;
  status?: string;
  unsigned_urls?: string[];
  error?: string | { message?: string };
};

function openrouterHeaders(json = true) {
  const { openrouterApiKey } = getSecrets();
  if (!openrouterApiKey) {
    throw new Error("OPENROUTER_API_KEY is missing.");
  }
  return {
    Authorization: `Bearer ${openrouterApiKey}`,
    "HTTP-Referer": "https://distribute.to",
    "X-Title": "distribute.to",
    ...(json ? { "Content-Type": "application/json" } : {}),
  };
}

function jobError(job: OpenRouterJob, fallback: string) {
  if (!job.error) return fallback;
  if (typeof job.error === "string") return job.error;
  return job.error.message || fallback;
}

function contentUrl(job: OpenRouterJob) {
  if (job.unsigned_urls?.[0]) return job.unsigned_urls[0];
  if (job.id) return `${OPENROUTER_BASE}/videos/${job.id}/content?index=0`;
  return "";
}

function isFinished(status?: string) {
  return /^(completed|succeeded|success)$/i.test(status || "");
}

function isFailed(status?: string) {
  return /^(failed|cancelled|canceled|expired)$/i.test(status || "");
}

const STATUS_TIMEOUT_MS = 20_000;

async function readVideoJob(taskId: string, signal?: AbortSignal) {
  const timeout = AbortSignal.timeout(STATUS_TIMEOUT_MS);
  const response = await fetch(`${OPENROUTER_BASE}/videos/${encodeURIComponent(taskId)}`, {
    headers: openrouterHeaders(),
    signal: signal ? AbortSignal.any([signal, timeout]) : timeout,
  });
  const json = (await response.json().catch(() => ({}))) as OpenRouterJob & { error?: { message?: string } | string };
  if (!response.ok) {
    const message = jobError(json, `OpenRouter video status failed (${response.status})`);
    if (response.status === 404) return { status: "pending" as const };
    throw new Error(message);
  }
  return json;
}

export async function peekKieTask(taskId: string): Promise<{ status: "success"; url: string } | { status: "fail"; error: string } | { status: "pending" }> {
  try {
    const job = await readVideoJob(taskId);
    if (isFinished(job.status)) {
      const raw = contentUrl(job);
      if (!raw) {
        console.warn("openrouter job finished without a url", taskId);
        return { status: "pending" };
      }
      return { status: "success", url: raw };
    }
    if (isFailed(job.status)) {
      return { status: "fail", error: jobError(job, "Video generation failed.") };
    }
    return { status: "pending" };
  } catch (error) {
    console.warn("openrouter status check failed", taskId, error instanceof Error ? error.message : error);
    return { status: "pending" };
  }
}

export async function waitForTask(taskId: string, signal?: AbortSignal, kind: "image" | "video" = "image") {
  const started = Date.now();
  let delay = 4000;
  const limit = kind === "video" ? 15 * 60 * 1000 : 8 * 60 * 1000;
  let emptySuccess = 0;
  while (Date.now() - started < limit) {
    throwIfAborted(signal);
    try {
      const job = await readVideoJob(taskId, signal);
      if (isFinished(job.status)) {
        const raw = contentUrl(job);
        if (raw) return raw;
        emptySuccess += 1;
        if (emptySuccess > 8) throw new Error(`OpenRouter finished without a ${kind} URL.`);
      } else if (isFailed(job.status)) {
        throw new Error(jobError(job, `${kind} generation failed.`));
      }
    } catch (error) {
      if (isAbortError(error)) throw error;
      if (error instanceof Error && /generation failed|without a |empty video|Couldn't download/i.test(error.message)) {
        throw error;
      }
    }
    await abortableDelay(delay, signal);
    delay = Math.min(delay + 2000, kind === "video" ? 15000 : 8000);
  }
  throw new Error(kind === "video" ? "Timed out waiting for Seedance 2.5." : "Timed out waiting for GPT Image 2.5 Flare.");
}

export async function uploadKieFile(publicPath: string, signal?: AbortSignal) {
  throwIfAborted(signal);
  if (/^https?:\/\//i.test(publicPath)) return publicPath;
  return uploadLocalPublicPath(publicPath);
}

export async function generateGptImage25Flare(options: {
  prompt: string;
  aspectRatio?: string;
  resolution?: "1K" | "2K" | "4K";
  inputUrls?: string[];
  abortSignal?: AbortSignal;
}) {
  return generateFalGptImage25Flare(options);
}

type SeedanceRequest = {
  prompt: string;
  duration?: number;
  aspectRatio?: "16:9" | "9:16" | "1:1" | "adaptive";
  referenceImageUrls?: string[];
  referenceVideoUrls?: string[];
  referenceAudioUrls?: string[];
  generateAudio?: boolean;
  resolution?: "480p" | "720p" | "1080p";
  model?: "bytedance/seedance-2.5" | "bytedance/seedance-2.0-fast";
  seed?: number;
  abortSignal?: AbortSignal;
  existingTaskId?: string;
  onTaskCreated?: (taskId: string) => void | Promise<void>;
};

export async function submitSeedance25ReferenceVideo(options: SeedanceRequest) {
  const existing = options.existingTaskId?.trim() || "";
  if (existing && existing !== "pending") return existing;
  throwIfAborted(options.abortSignal);
    const model = options.model || SEEDANCE_MODEL;
    const durationCap = model === SEEDANCE_FAST_MODEL ? 15 : 30;
    const duration = Math.min(durationCap, Math.max(4, Math.round(options.duration || 8)));
    const aspectRatio = options.aspectRatio === "9:16" ? "9:16" : options.aspectRatio === "1:1" ? "1:1" : "16:9";
    const input_references: Array<Record<string, unknown>> = [];
    for (const url of (options.referenceImageUrls || []).slice(0, 30)) {
      input_references.push({ type: "image_url", image_url: { url } });
    }
    for (const url of (options.referenceVideoUrls || []).slice(0, 7)) {
      input_references.push({ type: "video_url", video_url: { url } });
    }
    for (const url of (options.referenceAudioUrls || []).slice(0, 3)) {
      input_references.push({ type: "audio_url", audio_url: { url } });
    }
    const response = await fetch(`${OPENROUTER_BASE}/videos`, {
      method: "POST",
      headers: openrouterHeaders(),
      body: JSON.stringify({
        model,
        prompt: options.prompt,
        duration,
        aspect_ratio: aspectRatio,
        resolution: "480p",
        generate_audio: options.generateAudio !== false,
        ...(Number.isInteger(options.seed) ? { seed: options.seed } : {}),
        ...(input_references.length ? { input_references } : {}),
        provider: {
          options: {
            seed: {
              parameters: {
                watermark: false,
                output_format: "mp4",
              },
            },
          },
        },
      }),
    });
    const json = (await response.json().catch(() => ({}))) as OpenRouterJob & { error?: { message?: string } | string };
    if (!response.ok || !json.id) {
      throw new Error(jobError(json, `OpenRouter Seedance create failed (${response.status})`));
    }
    const taskId = json.id;
    await options.onTaskCreated?.(taskId);
    return taskId;
}

export async function generateSeedance25ReferenceVideo(options: SeedanceRequest) {
  const taskId = await submitSeedance25ReferenceVideo(options);
  return waitForTask(taskId, undefined, "video");
}

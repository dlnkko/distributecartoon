import { getSecrets } from "./config";
import { readPublicFile } from "./assets";
import { abortableDelay, isAbortError, throwIfAborted } from "./abort";

const KIE_BASE = "https://api.kie.ai";
const KIE_UPLOAD = "https://kieai.redpandaai.co";

type KieCreateResponse = {
  code: number;
  msg: string;
  data?: { taskId?: string };
};

type KieTaskResponse = {
  code: number;
  msg: string;
  data?: {
    taskId: string;
    state: "waiting" | "queuing" | "generating" | "success" | "fail";
    resultJson?: string;
    failMsg?: string;
  };
};

type KieUploadResponse = {
  success?: boolean;
  code?: number;
  msg?: string;
  data?: { downloadUrl?: string; fileName?: string };
};

function authHeaders(json = true) {
  const { kieApiKey } = getSecrets();
  if (!kieApiKey) {
    throw new Error("KIE_API_KEY is missing.");
  }
  return {
    Authorization: `Bearer ${kieApiKey}`,
    ...(json ? { "Content-Type": "application/json" } : {}),
  };
}

function mimeFromName(name: string) {
  if (name.endsWith(".png")) return "image/png";
  if (name.endsWith(".webp")) return "image/webp";
  if (name.endsWith(".jpg") || name.endsWith(".jpeg")) return "image/jpeg";
  if (name.endsWith(".gif")) return "image/gif";
  if (name.endsWith(".mp4")) return "video/mp4";
  if (name.endsWith(".mov")) return "video/quicktime";
  if (name.endsWith(".webm")) return "video/webm";
  if (name.endsWith(".wav")) return "audio/wav";
  if (name.endsWith(".mp3")) return "audio/mpeg";
  return "application/octet-stream";
}

async function createTask(model: string, input: Record<string, unknown>, signal?: AbortSignal) {
  throwIfAborted(signal);
  const response = await fetch(`${KIE_BASE}/api/v1/jobs/createTask`, {
    method: "POST",
    headers: authHeaders(),
    body: JSON.stringify({ model, input }),
    signal,
  });
  const json = (await response.json()) as KieCreateResponse;
  if (!response.ok || json.code !== 200 || !json.data?.taskId) {
    throw new Error(json.msg || `Kie createTask failed (${response.status})`);
  }
  return json.data.taskId;
}

function extractResultUrl(data: KieTaskResponse["data"]) {
  if (!data) return "";
  let parsed: { resultUrls?: string[]; resultUrl?: string; url?: string } = {};
  if (data.resultJson) {
    try {
      parsed = JSON.parse(data.resultJson) as typeof parsed;
    } catch {
      parsed = {};
    }
  }
  const extra = data as KieTaskResponse["data"] & { resultUrls?: string[]; resultUrl?: string; url?: string };
  return parsed.resultUrls?.[0] || parsed.resultUrl || parsed.url || extra.resultUrls?.[0] || extra.resultUrl || extra.url || "";
}

export async function peekKieTask(taskId: string): Promise<{ status: "success"; url: string } | { status: "fail"; error: string } | { status: "pending" }> {
  const response = await fetch(`${KIE_BASE}/api/v1/jobs/recordInfo?taskId=${encodeURIComponent(taskId)}`, {
    headers: authHeaders(),
  });
  if (!response.ok) return { status: "pending" };
  const json = (await response.json()) as KieTaskResponse;
  const state = json.data?.state;
  if (state === "success") {
    const url = extractResultUrl(json.data);
    if (url) return { status: "success", url };
    return { status: "pending" };
  }
  if (state === "fail") {
    return { status: "fail", error: json.data?.failMsg || json.msg || "Video generation failed." };
  }
  return { status: "pending" };
}

export async function waitForTask(taskId: string, signal?: AbortSignal, kind: "image" | "video" = "image") {
  const started = Date.now();
  let delay = 2500;
  const limit = kind === "video" ? 15 * 60 * 1000 : 8 * 60 * 1000;
  let emptySuccess = 0;
  while (Date.now() - started < limit) {
    throwIfAborted(signal);
    try {
      const response = await fetch(`${KIE_BASE}/api/v1/jobs/recordInfo?taskId=${encodeURIComponent(taskId)}`, {
        headers: authHeaders(),
        signal,
      });
      if (!response.ok) {
        await abortableDelay(delay, signal);
        delay = Math.min(delay + 1000, kind === "video" ? 12000 : 8000);
        continue;
      }
      const json = (await response.json()) as KieTaskResponse;
      const state = json.data?.state;
      if (state === "success") {
        const url = extractResultUrl(json.data);
        if (url) return url;
        emptySuccess += 1;
        if (emptySuccess > 8) throw new Error(`Kie finished without a ${kind} URL.`);
      } else if (state === "fail") {
        throw new Error(json.data?.failMsg || json.msg || `${kind} generation failed.`);
      }
    } catch (error) {
      if (isAbortError(error)) throw error;
      if (error instanceof Error && /generation failed|without a /i.test(error.message)) throw error;
    }
    await abortableDelay(delay, signal);
    delay = Math.min(delay + 1000, kind === "video" ? 12000 : 8000);
  }
  throw new Error(kind === "video" ? "Timed out waiting for Seedance 2.5." : "Timed out waiting for GPT Image 2.5 Flare.");
}

export async function uploadKieFile(publicPath: string, signal?: AbortSignal) {
  throwIfAborted(signal);
  const data = await readPublicFile(publicPath);
  const fileName = publicPath.split("/").pop() || "asset.bin";
  const stamped = `${Date.now()}-${fileName}`;
  const endpoints = [`${KIE_UPLOAD}/api/file-stream-upload`, `${KIE_BASE}/api/file-stream-upload`];
  let lastError = "Kie file upload failed.";
  for (const url of endpoints) {
    throwIfAborted(signal);
    const form = new FormData();
    form.set("file", new Blob([new Uint8Array(data)], { type: mimeFromName(fileName) }), fileName);
    form.set("uploadPath", "distribute-to");
    form.set("fileName", stamped);
    const response = await fetch(url, {
      method: "POST",
      headers: authHeaders(false),
      body: form,
      signal,
    });
    const json = (await response.json().catch(() => ({}))) as KieUploadResponse;
    if ((json.success || json.code === 200) && json.data?.downloadUrl) {
      return json.data.downloadUrl;
    }
    lastError = json.msg || `Kie file upload failed (${response.status})`;
  }
  throw new Error(lastError);
}

export async function generateGptImage25Flare(options: {
  prompt: string;
  aspectRatio?: string;
  resolution?: "1K" | "2K" | "4K";
  inputUrls?: string[];
  abortSignal?: AbortSignal;
}) {
  const input: Record<string, unknown> = {
    prompt: options.prompt,
    aspect_ratio: options.aspectRatio || "16:9",
    resolution: options.resolution || "2K",
    background: "opaque",
  };

  if (options.inputUrls?.length) {
    input.input_urls = options.inputUrls;
    const taskId = await createTask("gpt-image-2-5-flare-image-to-image", input, options.abortSignal);
    return waitForTask(taskId, options.abortSignal, "image");
  }

  const taskId = await createTask("gpt-image-2-5-flare-text-to-image", input, options.abortSignal);
  return waitForTask(taskId, options.abortSignal, "image");
}

export async function generateSeedance25ReferenceVideo(options: {
  prompt: string;
  duration?: number;
  aspectRatio?: "16:9" | "9:16" | "1:1" | "adaptive";
  referenceImageUrls?: string[];
  referenceVideoUrls?: string[];
  generateAudio?: boolean;
  resolution?: "480p" | "720p" | "1080p";
  abortSignal?: AbortSignal;
  existingTaskId?: string;
  onTaskCreated?: (taskId: string) => void | Promise<void>;
}) {
  let taskId = options.existingTaskId?.trim() || "";
  if (!taskId || taskId === "pending") {
    const duration = Math.min(30, Math.max(4, Math.round(options.duration || 8)));
    const input: Record<string, unknown> = {
      prompt: options.prompt,
      duration,
      aspect_ratio: options.aspectRatio || "16:9",
      resolution: "480p",
      generate_audio: options.generateAudio !== false,
      output_format: "mp4",
      nsfw_checker: false,
    };
    if (options.referenceImageUrls?.length) input.reference_image_urls = options.referenceImageUrls.slice(0, 30);
    if (options.referenceVideoUrls?.length) input.reference_video_urls = options.referenceVideoUrls.slice(0, 1);
    taskId = await createTask("bytedance/seedance-2-5", input);
    await options.onTaskCreated?.(taskId);
  }
  return waitForTask(taskId, undefined, "video");
}

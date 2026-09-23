import { fal } from "@fal-ai/client";
import { getSecrets } from "./config";
import { readPublicFile } from "./assets";
import { throwIfAborted } from "./abort";

export type FalProgress = (text: string) => void;

function configureFal() {
  const { falKey } = getSecrets();
  if (!falKey) {
    throw new Error("FAL_KEY is missing.");
  }
  fal.config({ credentials: falKey });
}

function mimeFromName(name: string) {
  if (name.endsWith(".png")) return "image/png";
  if (name.endsWith(".webp")) return "image/webp";
  if (name.endsWith(".jpg") || name.endsWith(".jpeg")) return "image/jpeg";
  if (name.endsWith(".gif")) return "image/gif";
  if (name.endsWith(".mp4")) return "video/mp4";
  if (name.endsWith(".webm")) return "video/webm";
  if (name.endsWith(".wav")) return "audio/wav";
  return "application/octet-stream";
}

function flareImageSize(aspectRatio?: string) {
  if (aspectRatio === "9:16") return "portrait_16_9";
  if (aspectRatio === "1:1") return "square_hd";
  return "landscape_16_9";
}

function firstFalImageUrl(data: unknown): string {
  if (!data || typeof data !== "object") return "";
  const payload = data as { images?: Array<{ url?: string } | string>; image?: { url?: string }; url?: string };
  const images = Array.isArray(payload.images) ? payload.images : [];
  for (const item of images) {
    if (typeof item === "string" && /^https?:\/\//i.test(item)) return item;
    if (item && typeof item === "object" && item.url && /^https?:\/\//i.test(item.url)) return item.url;
  }
  if (payload.image?.url && /^https?:\/\//i.test(payload.image.url)) return payload.image.url;
  if (payload.url && /^https?:\/\//i.test(payload.url)) return payload.url;
  return "";
}

export async function uploadLocalPublicPath(publicPath: string) {
  configureFal();
  const data = await readPublicFile(publicPath);
  const fileName = publicPath.split("/").pop() || "asset.bin";
  const file = new File([new Uint8Array(data)], fileName, { type: mimeFromName(fileName) });
  return fal.storage.upload(file);
}

export async function uploadFalBuffer(buffer: Buffer, fileName: string, contentType: string) {
  configureFal();
  const file = new File([new Uint8Array(buffer)], fileName, { type: contentType });
  let timer: ReturnType<typeof setTimeout> | undefined;
  const stalled = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error(`Fal upload of ${fileName} timed out.`)), 120_000);
  });
  try {
    return await Promise.race([fal.storage.upload(file), stalled]);
  } finally {
    clearTimeout(timer);
  }
}

export async function generateGptImage25Flare(options: {
  prompt: string;
  aspectRatio?: string;
  resolution?: "1K" | "2K" | "4K";
  inputUrls?: string[];
  abortSignal?: AbortSignal;
}) {
  configureFal();
  throwIfAborted(options.abortSignal);
  const imageSize = flareImageSize(options.aspectRatio);
  if (options.inputUrls?.length) {
    const result = await fal.subscribe("openai/gpt-image-2.5/flare/edit", {
      input: {
        prompt: options.prompt,
        image_urls: options.inputUrls.slice(0, 16),
        image_size: imageSize,
        background: "opaque",
        quality: "high",
        num_images: 1,
        output_format: "png",
      },
      logs: false,
      abortSignal: options.abortSignal,
    });
    const url = firstFalImageUrl(result.data);
    if (!url) throw new Error("GPT Image 2.5 Flare did not return an image.");
    return url;
  }

  const result = await fal.subscribe("openai/gpt-image-2.5/flare/text-to-image", {
    input: {
      prompt: options.prompt,
      image_size: imageSize,
      background: "opaque",
      quality: "high",
      num_images: 1,
      output_format: "png",
    },
    logs: false,
    abortSignal: options.abortSignal,
  });
  const url = firstFalImageUrl(result.data);
  if (!url) throw new Error("GPT Image 2.5 Flare did not return an image.");
  return url;
}

export async function generateH3MaxReferenceVideo(options: {
  prompt: string;
  duration?: number;
  aspectRatio?: "16:9" | "9:16" | "1:1" | "adaptive";
  referenceImageUrls?: string[];
  referenceVideoUrls?: string[];
  referenceAudioUrls?: string[];
  onProgress?: FalProgress;
  abortSignal?: AbortSignal;
}) {
  configureFal();
  throwIfAborted(options.abortSignal);
  const result = await fal.subscribe("minimax/h3-max/reference-to-video", {
    input: {
      prompt: options.prompt,
      duration: options.duration ? Math.min(15, Math.max(5, Math.round(options.duration))) : 15,
      resolution: "768P",
      prompt_expansion_mode: "balanced",
      aspect_ratio: options.aspectRatio || "16:9",
      enable_safety_checker: true,
      ...(options.referenceImageUrls?.length ? { reference_image_urls: options.referenceImageUrls } : {}),
      ...(options.referenceVideoUrls?.length ? { reference_video_urls: options.referenceVideoUrls } : {}),
      ...(options.referenceAudioUrls?.length ? { reference_audio_urls: options.referenceAudioUrls } : {}),
    },
    logs: true,
    abortSignal: options.abortSignal,
    onQueueUpdate: (update) => {
      if (options.abortSignal?.aborted) return;
      if (update.status === "IN_PROGRESS") {
        const last = update.logs?.at(-1)?.message;
        if (last) options.onProgress?.(last);
      } else {
        options.onProgress?.(update.status);
      }
    },
  });

  const url = result.data?.video?.url as string | undefined;
  if (!url) throw new Error("H3 Max did not return a video.");
  return url;
}

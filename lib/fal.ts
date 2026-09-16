import { fal } from "@fal-ai/client";
import { getSecrets } from "./config";
import { readPublicFile } from "./assets";
import { throwIfAborted } from "./abort";

export type FalProgress = (text: string) => void;

function configureFal() {
  const { falKey } = getSecrets();
  if (!falKey) {
    throw new Error("FAL_KEY is missing for MiniMax H3 Max.");
  }
  fal.config({ credentials: falKey });
}

function mimeFromName(name: string) {
  if (name.endsWith(".png")) return "image/png";
  if (name.endsWith(".webp")) return "image/webp";
  if (name.endsWith(".jpg") || name.endsWith(".jpeg")) return "image/jpeg";
  if (name.endsWith(".mp4")) return "video/mp4";
  if (name.endsWith(".webm")) return "video/webm";
  if (name.endsWith(".wav")) return "audio/wav";
  return "application/octet-stream";
}

export async function uploadLocalPublicPath(publicPath: string) {
  configureFal();
  const data = await readPublicFile(publicPath);
  const fileName = publicPath.split("/").pop() || "asset.bin";
  const file = new File([data], fileName, { type: mimeFromName(fileName) });
  return fal.storage.upload(file);
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

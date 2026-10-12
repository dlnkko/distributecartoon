import { execFile } from "node:child_process";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import ffmpegPath from "ffmpeg-static";
import { getSecrets } from "./config";

export const PRODUCT_USE_MAX_SECONDS = 20;
const GEMINI_MODEL = "gemini-3.8-flash";

function ffmpegBinary() {
  if (!ffmpegPath) throw new Error("ffmpeg is not available.");
  return ffmpegPath;
}

export async function probeVideoDuration(buffer: Buffer, ext: string) {
  const dir = await mkdtemp(path.join(os.tmpdir(), "product-use-"));
  const input = path.join(dir, `in${ext || ".mp4"}`);
  await writeFile(input, buffer);
  try {
    const text = await new Promise<string>((resolve, reject) => {
      execFile(ffmpegBinary(), ["-hide_banner", "-i", input], { timeout: 60_000, maxBuffer: 2 * 1024 * 1024 }, (error, stdout, stderr) => {
        const output = `${stderr || ""}\n${stdout || ""}`;
        if (error && !/Duration:/.test(output)) {
          reject(new Error("Couldn't read that video."));
          return;
        }
        resolve(output);
      });
    });
    const match = text.match(/Duration:\s*(\d+):(\d+):(\d+(?:\.\d+)?)/);
    if (!match) throw new Error("Couldn't read that video.");
    return Number(match[1]) * 3600 + Number(match[2]) * 60 + Number(match[3]);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

export async function describeProductUse(buffer: Buffer, mime: string) {
  const key = getSecrets().geminiApiKey;
  if (!key) throw new Error("GEMINI_API_KEY is missing.");
  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${encodeURIComponent(key)}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      signal: AbortSignal.timeout(55_000),
      body: JSON.stringify({
        contents: [
          {
            role: "user",
            parts: [
              {
                text: "Watch this product video. In two or three short sentences, say what the product is and exactly how a person uses it: how it opens, how it is applied or worn, and how it looks while in use. Stay with what the video shows. No ad copy and no scene ideas.",
              },
              {
                inlineData: {
                  mimeType: mime,
                  data: buffer.toString("base64"),
                },
              },
            ],
          },
        ],
        generationConfig: { temperature: 0.2, maxOutputTokens: 300 },
      }),
    },
  );
  const json = (await response.json().catch(() => ({}))) as {
    error?: { message?: string };
    candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
  };
  if (!response.ok) throw new Error(json.error?.message || "Couldn't watch that product video.");
  const text = (json.candidates || [])
    .flatMap((candidate) => candidate.content?.parts || [])
    .map((part) => part.text || "")
    .join(" ")
    .replace(/\s+/g, " ")
    .trim();
  if (!text) throw new Error("Couldn't tell how the product is used from that video.");
  return text.slice(0, 700);
}

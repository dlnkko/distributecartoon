import { execFile } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import ffmpegPath from "ffmpeg-static";
import { getSecrets } from "./config";

const GEMINI_MODEL = "gemini-3.8-flash";
const WATCH_BYTES = 8 * 1024 * 1024;

function ffmpegBinary() {
  if (!ffmpegPath) throw new Error("ffmpeg is not available.");
  return ffmpegPath;
}

function runFfmpeg(args: string[]) {
  return new Promise<void>((resolve, reject) => {
    execFile(ffmpegBinary(), args, { timeout: 120_000, maxBuffer: 4 * 1024 * 1024 }, (error, _stdout, stderr) => {
      if (error) reject(new Error((stderr || error.message).trim().slice(0, 400)));
      else resolve();
    });
  });
}

async function compactVideo(buffer: Buffer, crf: string, width: number) {
  const dir = await mkdtemp(path.join(os.tmpdir(), "seen-"));
  const input = path.join(dir, "in.mp4");
  const out = path.join(dir, "out.mp4");
  await writeFile(input, buffer);
  try {
    await runFfmpeg([
      "-y",
      "-i",
      input,
      "-an",
      "-vf",
      `scale='min(${width},iw)':-2`,
      "-c:v",
      "libx264",
      "-preset",
      "veryfast",
      "-crf",
      crf,
      "-movflags",
      "+faststart",
      out,
    ]);
    return await readFile(out);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

async function videoForWatch(buffer: Buffer) {
  try {
    const compact = await compactVideo(buffer, "32", 640);
    if (compact.length <= WATCH_BYTES) return compact;
    return compactVideo(buffer, "38", 480);
  } catch (error) {
    if (buffer.length <= WATCH_BYTES) return buffer;
    throw error;
  }
}

export async function watchRenderedPart(video: Buffer, context: string) {
  const key = getSecrets().geminiApiKey;
  if (!key) throw new Error("GEMINI_API_KEY is missing.");
  const clip = await videoForWatch(video);
  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${encodeURIComponent(key)}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      signal: AbortSignal.timeout(90_000),
      body: JSON.stringify({
        contents: [
          {
            role: "user",
            parts: [
              {
                text: [
                  "You watch a finished part of a film the user already wrote. You do not write the next video prompt.",
                  "The user's script decides what happens. Report what this video shows, then what is still true at the handoff.",
                  "Describe only people, clothes, place, pose, and the product.",
                  "The product notes tell you what to look for. If you see it, say who has it, where it sits, and its color.",
                  "If the script has not taken the product off, and this ending does not show it, say you did not see it. Do not say it was removed.",
                  "Describe the moment after the last gesture finishes. If someone puts the product on or takes it off and that action ends in this clip, say the result. Do not say they are still peeling, sticking, or taking it off.",
                  "Clothes at the end stay until a later scene changes them.",
                  "CARRY_POSE is the resting position after that gesture. If the next part is a new scene, leave the finished gesture out of CARRY_POSE. If the next part opens somewhere else, leave CARRY_POSE empty.",
                  "CARRY_PRODUCT is yes only when the product is still on or still in frame after the clip ends. It is no when the clip ends with it off.",
                  "Do not invent a new event, a new line, or a camera direction.",
                  "Return these lines only:",
                  "PEOPLE: who is visible at the end, and what each is doing",
                  "PLACE: the place at the end",
                  "CLOTHES: what each visible person is wearing at the end",
                  "POSE: how they are positioned at the end",
                  "PRODUCT: where the product sits, including color, or not in this clip",
                  "CARRY_PRODUCT: yes or no",
                  "CARRY_DETAIL: one sentence of where the product still sits. Use the words \"the product\". Empty if CARRY_PRODUCT is no.",
                  "CARRY_CLOTHES: one sentence of the clothes that must stay. Empty if nothing specific is visible.",
                  "CARRY_POSE: one sentence of the ending position. Empty if the next part opens in a different place.",
                  "UNSEEN: what the script still needs that you could not see. Empty if you saw everything that should carry.",
                  "",
                  context.trim(),
                ].join("\n"),
              },
              { inlineData: { mimeType: "video/mp4", data: clip.toString("base64") } },
            ],
          },
        ],
        generationConfig: { temperature: 0.1, maxOutputTokens: 600 },
      }),
    },
  );
  const json = (await response.json().catch(() => ({}))) as {
    error?: { message?: string };
    candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
  };
  if (!response.ok) throw new Error(json.error?.message || "Couldn't watch that part.");
  const text = (json.candidates || [])
    .flatMap((candidate) => candidate.content?.parts || [])
    .map((part) => part.text || "")
    .join("\n")
    .replace(/\*\*/g, "")
    .trim();
  if (!/CARRY_PRODUCT\s*:/i.test(text)) throw new Error("Couldn't read the handoff from that part.");
  return text.slice(0, 1500);
}

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

export async function watchRenderedPart(video: Buffer, context: string, options?: { describeLooks?: boolean }) {
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
                  "If you saw the product on someone in this video and nothing takes it off, it is still on, even when the last frame crops it out. Say you did not see it only when it never appears. Do not say it was removed.",
                  "Describe the moment after the last gesture finishes. If someone puts the product on or takes it off and that action ends in this clip, say the result. Do not say they are still peeling, sticking, or taking it off.",
                  "Clothes stay only when OUTFIT is same. When the next moment needs different clothes, those clothes do not carry. Face and hair stay.",
                  "CARRY_POSE is the resting position after that gesture. If the next part is a new scene, leave the finished gesture out of CARRY_POSE. If the next part opens somewhere else, leave CARRY_POSE empty.",
                  "CARRY_PRODUCT is yes when the product is on a person or still with them, including while they sleep. Watch the whole video, not only the last frame. A close-up that crops it out does not take it off. It is no only when this video shows it taken off or left behind.",
                  "CARRY_DETAIL names who has it and where it sits, so the next morning keeps it in that same place. Empty if CARRY_PRODUCT is no.",
                  "OUTFIT is same when the clothes in this video still fit the next part. When the next part is a new time or a different situation, OUTFIT is one short phrase of the clothes that fit that moment. Face and hair stay. Do not copy a street outfit onto someone now in bed, and do not keep sleep clothes on someone who is leaving.",
                  "Do not invent a new event, a new line, or a camera direction.",
                  options?.describeLooks
                    ? "LOOKS: one short sentence per named person who is visible, including someone who leaves before the ending. Start with the name, then 'is the same', then only what this video shows: skin, hair, clothes, and where they are, such as in bed or in a doorway. Do not copy a planned description. Example shape only: Sam is the same white man in a white t-shirt, sitting in bed. Ana is the same woman standing in the doorway."
                    : "",
                  options?.describeLooks
                    ? "CLIPS: a short range, in seconds, for every person who is visible and speaks. Use the moment that person is on screen and talking. If the last 7 seconds already show all of them, return only that one range. If the ending shows only one of them, add an earlier range of about 3 seconds for each missing person, in the order they appear. Use the real times in this video. Total at most 9 seconds. Example shape only: 8.0-11.0, 24.0-27.0."
                    : "",
                  "Return these lines only:",
                  "PEOPLE: who is visible at the end, and what each is doing",
                  "PLACE: the place at the end",
                  "CLOTHES: what each visible person is wearing at the end",
                  "POSE: how they are positioned at the end",
                  "PRODUCT: where the product sits, including color, or not in this clip",
                  "CARRY_PRODUCT: yes or no",
                  "CARRY_DETAIL: one sentence of where the product still sits. Use the words \"the product\". Empty if CARRY_PRODUCT is no.",
                  "CARRY_CLOTHES: the clothes that stay, only when OUTFIT is same. Empty when the next moment needs different clothes.",
                  "CARRY_POSE: one sentence of the ending position. Empty if the next part opens in a different place.",
                  "OUTFIT: same, or the clothes for the next moment",
                  options?.describeLooks ? "LOOKS: the sentences described above. Empty if no person is visible." : "",
                  options?.describeLooks ? "CLIPS: the ranges described above. Empty if you cannot tell the times." : "",
                  "UNSEEN: what the script still needs that you could not see. Empty if you saw everything that should carry.",
                  "",
                  context.trim(),
                ].join("\n"),
              },
              { inlineData: { mimeType: "video/mp4", data: clip.toString("base64") } },
            ],
          },
        ],
        generationConfig: { temperature: 0.1, maxOutputTokens: options?.describeLooks ? 1100 : 600 },
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
  return text.slice(0, options?.describeLooks ? 2200 : 1500);
}

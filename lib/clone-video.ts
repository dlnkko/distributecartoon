import { execFile } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import ffmpegPath from "ffmpeg-static";
import { getSecrets } from "./config";
import { clampTotalDuration } from "./ids";
import { sonnetText } from "./sonnet";
import type { DialogueLanguage } from "./types";

const GEMINI_MODEL = "gemini-3.8-flash";
const SOURCE_MAX_SECONDS = 120;
const WATCH_BYTES = 12 * 1024 * 1024;

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

async function compactWithAudio(buffer: Buffer, crf: string, width: number) {
  const dir = await mkdtemp(path.join(os.tmpdir(), "clone-"));
  const input = path.join(dir, "in.mp4");
  const out = path.join(dir, "out.mp4");
  await writeFile(input, buffer);
  try {
    await runFfmpeg([
      "-y",
      "-i",
      input,
      "-vf",
      `scale='min(${width},iw)':-2`,
      "-c:v",
      "libx264",
      "-preset",
      "veryfast",
      "-crf",
      crf,
      "-c:a",
      "aac",
      "-b:a",
      "64k",
      "-movflags",
      "+faststart",
      out,
    ]);
    return await readFile(out);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

async function videoForRead(buffer: Buffer) {
  try {
    const compact = await compactWithAudio(buffer, "32", 640);
    if (compact.length <= WATCH_BYTES) return compact;
    return compactWithAudio(buffer, "38", 480);
  } catch (error) {
    if (buffer.length <= WATCH_BYTES) return buffer;
    throw error;
  }
}

export function assertCloneLength(seconds: number) {
  if (seconds > SOURCE_MAX_SECONDS + 0.05) {
    throw new Error("That video is longer than 2 minutes. Use a shorter cut.");
  }
  if (seconds < 3) throw new Error("That video is too short to clone.");
}

export async function readCloneSource(buffer: Buffer, mime: string) {
  const key = getSecrets().geminiApiKey;
  if (!key) throw new Error("GEMINI_API_KEY is missing.");
  const clip = await videoForRead(buffer);
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
                  "Watch this ad and write its shape, not a new ad.",
                  "List every beat in order. A beat is one place and one action.",
                  "For each beat give the clock, the place, who is visible, the physical action, and any spoken line.",
                  "If the speaker is not on screen, or is an intercom, phone, radio, or voice-over, mark them OFF-SCREEN. If they are in the frame, mark them ON-SCREEN.",
                  "If someone reacts to a line or a sound, put that reaction after the line, not before it.",
                  "Keep the original lines in quotes. Do not improve them. Do not name a product that is not in the video.",
                  "Under 900 words.",
                ].join(" "),
              },
              { inlineData: { mimeType: mime.startsWith("video/") ? mime : "video/mp4", data: clip.toString("base64") } },
            ],
          },
        ],
        generationConfig: { temperature: 0.2, maxOutputTokens: 4000 },
      }),
    },
  );
  const json = (await response.json().catch(() => ({}))) as {
    error?: { message?: string };
    candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
  };
  if (!response.ok) throw new Error(json.error?.message || "Couldn't watch that video.");
  const text = (json.candidates || [])
    .flatMap((candidate) => candidate.content?.parts || [])
    .map((part) => part.text || "")
    .join("\n")
    .trim();
  if (text.length < 40) throw new Error("Couldn't read the shape of that video.");
  return text.slice(0, 12000);
}

export async function adaptCloneStory(input: {
  source: string;
  productName: string;
  page: string;
  how: string;
  when: string;
  extra: string;
  pain: string;
  audience: string;
  seconds: number;
  language: DialogueLanguage;
}) {
  const seconds = clampTotalDuration(input.seconds, 30);
  const language = input.language === "spanish" ? "Spanish" : "English";
  const system = [
    "You adapt an existing ad into a new one. Keep the shape: the same order of beats, the same kind of reveal, the same places of speech. Replace the product, the pain, and the audience.",
    `Write the action and every spoken line in ${language}. SCENE headings stay in English and include the seconds.`,
    `The scenes must add up to ${seconds} seconds. Scale the source clocks to that length. Do not add a new plot. If the new film is longer, give the extra time to the same beats, mostly to the change after the product is used. If it is shorter, shorten beats. Do not drop the reveal.`,
    "Each scene is one place and one action, in present tense. That place is where this action would actually happen. Do not stage an action in a room where a person would not do it. The product is used the way the page says it is used. Do not add a place only to show that time passed.",
    "Follow one person who fits this audience. Recast the source's lead into that person. Keep a second person only when the source beat needs them.",
    "A spoken line is the character's name alone on a line, in capitals, then the line in quotes.",
    "If the source marks a speaker OFF-SCREEN, that speaker stays off-screen. Name them INTERCOM, NARRATOR, or the same remote role. Do not put that voice in a face. If the source marks a speaker ON-SCREEN, that person is in the frame when they speak.",
    "A reaction to a reply, a line, or a sound is written after that cause, never before it.",
    "When a scene is a day or more later, name different clothes. Face and hair stay. A few minutes later keeps the same clothes.",
    "Do not keep the source brand, slogan, or product. Do not invent a dose, a mechanism, or a health claim the page does not state.",
    "The words are specific to this pain and this audience. Not a slogan copied from the page.",
    "Start the reply with TITLE: and a short title. Then the scenes. Nothing else.",
  ].join(" ");
  const user = [
    `Product name: ${input.productName || "the product"}`,
    `The problem to use: ${input.pain.trim()}`,
    `This ad is for: ${input.audience.trim()}`,
    input.how.trim() ? `HOW IT IS USED:\n${input.how.trim()}` : "",
    input.when.trim() ? `WHEN IT IS USED:\n${input.when.trim()}` : "",
    input.extra.trim() ? `ADDITIONAL CONTEXT:\n${input.extra.trim()}` : "",
    `PRODUCT PAGE:\n${input.page.trim() || "No page text. Use only the notes above. Do not invent a use."}`,
    `SOURCE AD, already watched. Adapt this shape. Do not copy its brand.\n${input.source.trim()}`,
    `Write the adapted screenplay for a ${seconds} second film.`,
  ]
    .filter(Boolean)
    .join("\n\n");
  const text = await sonnetText(system, user, { maxTokens: Math.min(16000, 4000 + Math.ceil(seconds / 4) * 180) });
  const title = (text.match(/^TITLE:\s*(.+)$/im)?.[1] || input.productName || "Clone").replace(/\s+/g, " ").trim().slice(0, 80);
  const script = text.replace(/^TITLE:.*(?:\r?\n)+/i, "").trim();
  if (!/(?:^|\n)\s*SCENE\s+1\b/i.test(script)) throw new Error("The adapted story came back without scenes.");
  return { title: title || "Clone", script, seconds };
}

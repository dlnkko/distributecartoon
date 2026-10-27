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
const SOURCE_MAX_SECONDS = 600;
const WATCH_BYTES = 12 * 1024 * 1024;

function ffmpegBinary() {
  if (!ffmpegPath) throw new Error("ffmpeg is not available.");
  return ffmpegPath;
}

function runFfmpeg(args: string[]) {
  return new Promise<void>((resolve, reject) => {
    execFile(ffmpegBinary(), args, { timeout: 240_000, maxBuffer: 4 * 1024 * 1024 }, (error, _stdout, stderr) => {
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
  const heavy = buffer.length > 8 * 1024 * 1024;
  try {
    const compact = await compactWithAudio(buffer, heavy ? "36" : "32", heavy ? 480 : 640);
    if (compact.length <= WATCH_BYTES) return compact;
    const smaller = await compactWithAudio(buffer, "40", 360);
    if (smaller.length <= WATCH_BYTES) return smaller;
    throw new Error("That video is too heavy to read. Export a smaller file.");
  } catch (error) {
    if (error instanceof Error && /too heavy to read/.test(error.message)) throw error;
    if (buffer.length <= WATCH_BYTES) return buffer;
    throw error;
  }
}

export function assertCloneLength(seconds: number) {
  if (seconds > SOURCE_MAX_SECONDS + 0.05) {
    throw new Error("That video is longer than 10 minutes. Use a shorter cut.");
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
      signal: AbortSignal.timeout(180_000),
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
                  "Cover every beat through the end of the video. A few lines per beat. Do not stop partway through.",
                ].join(" "),
              },
              { inlineData: { mimeType: mime.startsWith("video/") ? mime : "video/mp4", data: clip.toString("base64") } },
            ],
          },
        ],
        generationConfig: { temperature: 0.2, maxOutputTokens: 12000 },
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
  return text.slice(0, 24000);
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
    "You adapt an existing film. Keep its shape: the same kind of conflict, the same relationships, the same person who offers the remedy, and a change after that remedy is used. Do not invent a different plot.",
    "The pain point is why the person fails at what this story needs them to do. Replace the source's cause with this pain, so this product can actually turn it. Do not keep a cause this product does not solve. Do not turn the pain into a new story. If no pain point is given, keep the source's cause.",
    "The only swap of the remedy is this product. Whatever the source offers as the fix, an object, a bottle, a routine, or a person handing something over, becomes this product. It is offered and used the way the page says this product is used. What anyone says about the fix comes from this page. Do not keep the source brand, the source remedy, or a claim this page does not state.",
    "The audience decides how these people look and how old they read, so they belong to that audience. It does not replace the story. If the audience sentence mentions a problem, ignore that problem. Each person keeps their role.",
    `Write the action and every spoken line in ${language}. Each scene starts with its own line, exactly SCENE N (Xs), the seconds in parentheses and nothing else on that line. The place is the next line.`,
    `The seconds in the headings add up to exactly ${seconds}. A spoken line needs about 3 seconds of its scene, and each extra line needs about 3 more. The action in that scene finishes inside those same seconds. Do not write a scene of 2 seconds that contains more than one spoken line. Do not write several lines into a scene that is too short to say them. If the source is too long for ${seconds} seconds, drop beats and lines until the film fits that exact duration. Keep the conflict, the moment the remedy is given, and the change after it.`,
    "Each scene is one place and one action, in present tense. That place is where this action would actually happen.",
    "A spoken line is the character's name alone on its own line, in capitals, and the quoted line on the next line. Never put the name and the line on the same line. A time card is its own line, Text on screen: and a few words, with no quotation marks, and nobody says it.",
    "If the source marks a speaker OFF-SCREEN, that speaker stays off-screen. Name them INTERCOM, NARRATOR, or the same remote role. Do not put that voice in a face. If the source marks a speaker ON-SCREEN, that person is in the frame when they speak, and their name is the speaker line.",
    "A reaction to a reply, a line, or a sound is written after that cause, never before it.",
    "When a scene is a day or more later, name different clothes. Face and hair stay. A few minutes later keeps the same clothes.",
    "Do not invent a dose, a mechanism, or a health claim the page does not state.",
    "Start the reply with TITLE: and a short title. Then the scenes. Nothing else.",
  ].join(" ");
  const user = [
    `Product name: ${input.productName || "the product"}`,
    input.pain.trim()
      ? `Why the person fails, inside this same story: ${input.pain.trim()}`
      : "No pain point was given. Keep the cause already in the source.",
    input.audience.trim()
      ? `How the people should look. This is not a new story: ${input.audience.trim()}`
      : "No audience was given. Keep the people the source already follows.",
    input.how.trim() ? `HOW IT IS USED:\n${input.how.trim()}` : "",
    input.when.trim() ? `WHEN IT IS USED:\n${input.when.trim()}` : "",
    input.extra.trim() ? `ADDITIONAL CONTEXT:\n${input.extra.trim()}` : "",
    `PRODUCT PAGE:\n${input.page.trim() || "No page text. Use only the notes above. Do not invent a use."}`,
    `SOURCE FILM, already watched. Keep this shape. The cause of the failure becomes the pain point. The remedy becomes the product above.\n${input.source.trim()}`,
    `Write the adapted screenplay for a ${seconds} second film. Every scene is long enough for the lines and the action inside it.`,
  ]
    .filter(Boolean)
    .join("\n\n");
  const ask = (extra: string) => sonnetText(system, extra ? `${user}\n\n${extra}` : user, { maxTokens: 12000, effort: false });
  const sceneBody = (value: string) => value.replace(/^TITLE:.*(?:\r?\n)+/i, "").trim();
  let text = await ask("");
  if (sceneBody(text).length < 800 || !/(?:^|\n)\s*SCENE\s+1\b/i.test(text)) {
    text = await ask(
      `Reply again as a full screenplay. First line is TITLE:. Then SCENE 1, SCENE 2, and so on. Each heading is SCENE N (Xs) and those seconds add up to ${seconds}. A scene with two spoken lines is at least 6 seconds. Finish the last scene. Nothing else.`,
    );
  }
  const title = (text.match(/^TITLE:\s*(.+)$/im)?.[1] || input.productName || "Clone").replace(/\s+/g, " ").trim().slice(0, 80);
  const script = sceneBody(text);
  if (script.length < 800 || !/(?:^|\n)\s*SCENE\s+1\b/i.test(script)) throw new Error("The adapted story came back without scenes.");
  return { title: title || "Clone", script, seconds };
}

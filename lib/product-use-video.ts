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
                text: "Watch this product video. Say what is visible: the product itself, its package, or both. Describe each one separately, including shape, color, print, and material, and say exactly how a person uses it. If both are in frame, the product and the package stay two different objects. Stay with what the video shows. No ad copy and no scene ideas.",
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

export async function readAttachedProduct(buffer: Buffer, mime: string, page = "", url = "", notes = "") {
  const key = getSecrets().geminiApiKey;
  if (!key) throw new Error("GEMINI_API_KEY is missing.");
  const pageText = page.replace(/\s+/g, " ").trim().slice(0, 6000);
  const owner = notes.replace(/\s+/g, " ").trim().slice(0, 2000);
  const source = [
    url ? `PRODUCT PAGE URL: ${url}` : "",
    pageText ? `PRODUCT PAGE TEXT:\n${pageText}` : "No product page was attached.",
    owner ? `OWNER NOTES:\n${owner}` : "",
  ]
    .filter(Boolean)
    .join("\n\n");
  const text = await geminiText(
    key,
    [
      {
        text: [
          "Read this product for a film. You have its photo and, when present, the text of its page and the owner's notes.",
          "Stay with this object. Do not invent a different product, a health claim, a cure, or a scene.",
          "OWNER NOTES, when present, decide how and when this person uses it. Prefer those notes for HOW IT IS USED and WHEN IT IS USED.",
          "WHEN IT IS USED is the situation, not a result and not a benefit. Example shape only: before sleep. If neither the notes nor the page say, write not stated. Do not copy the example.",
          "Return these lines only, in English, under 220 words:",
          "NAME: the product name from the page, or what the photo shows if there is no page",
          "WHAT IT IS: the object in plain words",
          "ALSO CALLED: everyday words a script might use for this exact object, from the page and the photo, separated by commas",
          "HOW IT IS USED: the physical action a person does with it",
          "WHEN IT IS USED: the situation the page gives, or not stated",
          "IN THE PHOTO: whether the frame shows the package, the product, or both, and how each looks",
          source,
        ].join("\n"),
      },
      { inlineData: { mimeType: mime, data: buffer.toString("base64") } },
    ],
    500,
    true,
  );
  return text.replace(/\*\*/g, "").replace(/^#+\s*/gm, "").slice(0, 1500);
}

async function geminiText(
  key: string,
  parts: Array<{ text?: string; inlineData?: { mimeType: string; data: string } }>,
  maxOutputTokens: number,
  keepLines = false,
) {
  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${encodeURIComponent(key)}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      signal: AbortSignal.timeout(55_000),
      body: JSON.stringify({
        contents: [{ role: "user", parts }],
        generationConfig: { temperature: 0.1, maxOutputTokens },
      }),
    },
  );
  const json = (await response.json().catch(() => ({}))) as {
    error?: { message?: string };
    candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
  };
  if (!response.ok) throw new Error(json.error?.message || "Couldn't read that product.");
  const raw = (json.candidates || [])
    .flatMap((candidate) => candidate.content?.parts || [])
    .map((part) => part.text || "")
    .join("\n")
    .trim();
  const text = keepLines ? raw.replace(/[ \t]+/g, " ").replace(/\n{3,}/g, "\n\n").trim() : raw.replace(/\s+/g, " ").trim();
  if (!text) throw new Error("Couldn't read that product.");
  return text;
}

export async function describeProductImage(buffer: Buffer, mime: string) {
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
                text: "Look at this product photo. Report only what is visible. Say whether the frame shows the product itself, its package, or both. If both are visible, describe them as two separate objects: the package first (shape, color, material, print, logo) and then the product (shape, color, texture, and how it sits next to the package). If only one is visible, say which and describe it. A video model must rebuild these exact objects and must not swap the package for the product or drop either one. No ad copy and no scene ideas. Under 120 words.",
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
        generationConfig: { temperature: 0.1, maxOutputTokens: 400 },
      }),
    },
  );
  const json = (await response.json().catch(() => ({}))) as {
    error?: { message?: string };
    candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
  };
  if (!response.ok) throw new Error(json.error?.message || "Couldn't read that product photo.");
  const text = (json.candidates || [])
    .flatMap((candidate) => candidate.content?.parts || [])
    .map((part) => part.text || "")
    .join(" ")
    .replace(/\s+/g, " ")
    .trim();
  if (!text) throw new Error("Couldn't tell what is in that product photo.");
  return text.slice(0, 900);
}

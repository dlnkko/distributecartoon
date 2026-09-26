import { execFile } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import ffmpegPath from "ffmpeg-static";
import OpenAI, { toFile } from "openai";
import { getSecrets } from "./config";

export const SONG_MIN_SECONDS = 30;
export const SONG_MAX_SECONDS = 90;

export function songPartDurations(totalSeconds: number): number[] {
  const total = Math.round(totalSeconds);
  if (total <= 30) return [Math.max(4, total)];
  const parts: number[] = [];
  let left = total;
  while (left > 30) {
    parts.push(30);
    left -= 30;
  }
  if (left > 0 && left < 4 && parts.length) {
    const need = 4 - left;
    parts[parts.length - 1] -= need;
    left += need;
  }
  if (left > 0) parts.push(left);
  return parts;
}

function ffmpegBinary() {
  if (!ffmpegPath) throw new Error("ffmpeg is not available.");
  return ffmpegPath;
}

function runFfmpeg(args: string[], allowProbe = false) {
  return new Promise<string>((resolve, reject) => {
    execFile(ffmpegBinary(), args, { timeout: 180_000, maxBuffer: 20 * 1024 * 1024 }, (error, stdout, stderr) => {
      const text = `${stderr || ""}\n${stdout || ""}`;
      if (error && !(allowProbe && /Duration:/.test(text))) {
        reject(new Error((stderr || error.message).trim().slice(0, 500)));
        return;
      }
      resolve(text);
    });
  });
}

export async function probeAudioDuration(buffer: Buffer, ext: string) {
  const dir = await mkdtemp(path.join(os.tmpdir(), "song-"));
  const input = path.join(dir, `in${ext || ".mp3"}`);
  await writeFile(input, buffer);
  try {
    const text = await runFfmpeg(["-hide_banner", "-i", input], true);
    const match = text.match(/Duration:\s*(\d+):(\d+):(\d+(?:\.\d+)?)/);
    if (!match) throw new Error("Couldn't read the song length.");
    return Number(match[1]) * 3600 + Number(match[2]) * 60 + Number(match[3]);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

export async function sliceAudioMp3(buffer: Buffer, ext: string, start: number, duration: number) {
  const dir = await mkdtemp(path.join(os.tmpdir(), "song-cut-"));
  const input = path.join(dir, `in${ext || ".mp3"}`);
  const out = path.join(dir, "out.mp3");
  await writeFile(input, buffer);
  try {
    await runFfmpeg([
      "-y",
      "-i",
      input,
      "-ss",
      String(Math.max(0, start)),
      "-t",
      String(duration),
      "-vn",
      "-c:a",
      "libmp3lame",
      "-q:a",
      "4",
      out,
    ]);
    return await readFile(out);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

export async function transcribeLyrics(buffer: Buffer, filename: string) {
  const { openaiApiKey } = getSecrets();
  if (!openaiApiKey) throw new Error("OPENAI_API_KEY is missing.");
  const client = new OpenAI({ apiKey: openaiApiKey });
  const file = await toFile(buffer, filename || "song.mp3");
  const result = await client.audio.transcriptions.create({
    file,
    model: "gpt-4o-mini-transcribe",
  });
  return (result.text || "").trim();
}

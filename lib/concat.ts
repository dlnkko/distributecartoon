import { execFile } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import ffmpegPath from "ffmpeg-static";

function ffmpegBinary() {
  if (!ffmpegPath) throw new Error("ffmpeg is not available.");
  return ffmpegPath;
}

function runFfmpeg(args: string[]) {
  return new Promise<void>((resolve, reject) => {
    execFile(ffmpegBinary(), args, { timeout: 180_000, maxBuffer: 10 * 1024 * 1024 }, (error, _stdout, stderr) => {
      if (error) reject(new Error(stderr?.trim() || error.message));
      else resolve();
    });
  });
}

function listPath(file: string) {
  return file.replace(/\\/g, "/").replace(/'/g, "'\\''");
}

export async function replaceVideoAudio(video: Buffer, audio: Buffer) {
  const dir = await mkdtemp(path.join(os.tmpdir(), "mux-"));
  const videoPath = path.join(dir, "in.mp4");
  const audioPath = path.join(dir, "in.mp3");
  const out = path.join(dir, "out.mp4");
  await writeFile(videoPath, video);
  await writeFile(audioPath, audio);
  const args = ["-map", "0:v:0", "-map", "1:a:0", "-c:a", "aac", "-shortest", "-movflags", "+faststart", out];
  try {
    try {
      await runFfmpeg(["-y", "-i", videoPath, "-i", audioPath, "-c:v", "copy", ...args]);
    } catch {
      await runFfmpeg(["-y", "-i", videoPath, "-i", audioPath, "-c:v", "libx264", "-preset", "veryfast", "-crf", "23", ...args]);
    }
    return await readFile(out);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

export async function tailVideoBuffer(buffer: Buffer, seconds = 5) {
  const dir = await mkdtemp(path.join(os.tmpdir(), "tail-"));
  const input = path.join(dir, "in.mp4");
  const out = path.join(dir, "tail.mp4");
  await writeFile(input, buffer);
  try {
    await runFfmpeg([
      "-y",
      "-sseof",
      `-${Math.max(1, seconds)}`,
      "-i",
      input,
      "-t",
      String(Math.max(1, seconds)),
      "-c:v",
      "libx264",
      "-preset",
      "veryfast",
      "-crf",
      "23",
      "-c:a",
      "aac",
      "-movflags",
      "+faststart",
      out,
    ]);
    return await readFile(out);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

export async function clipVideoPieces(pieces: { buffer: Buffer; start: number; end: number }[]) {
  const clean = pieces.filter((piece) => piece.end - piece.start >= 2).slice(0, 4);
  if (!clean.length) throw new Error("No clip is long enough.");
  const dir = await mkdtemp(path.join(os.tmpdir(), "clips-"));
  try {
    const files: string[] = [];
    for (let index = 0; index < clean.length; index += 1) {
      const piece = clean[index];
      const input = path.join(dir, `in-${index}.mp4`);
      const out = path.join(dir, `clip-${index}.mp4`);
      await writeFile(input, piece.buffer);
      await runFfmpeg([
        "-y",
        "-ss",
        piece.start.toFixed(2),
        "-i",
        input,
        "-t",
        (piece.end - piece.start).toFixed(2),
        "-c:v",
        "libx264",
        "-preset",
        "veryfast",
        "-crf",
        "28",
        "-c:a",
        "aac",
        "-movflags",
        "+faststart",
        out,
      ]);
      files.push(out);
    }
    if (files.length === 1) return await readFile(files[0]);
    const list = path.join(dir, "list.txt");
    const joined = path.join(dir, "joined.mp4");
    await writeFile(list, files.map((file) => `file '${listPath(file)}'`).join("\n"), "utf8");
    await runFfmpeg(["-y", "-f", "concat", "-safe", "0", "-i", list, "-c", "copy", "-movflags", "+faststart", joined]);
    return await readFile(joined);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}
export async function cutSpokenClip(buffer: Buffer, start: number, end: number) {
  const length = Math.min(4, end - start);
  if (length < 1) throw new Error("That speaking cut is too short.");
  const dir = await mkdtemp(path.join(os.tmpdir(), "voice-"));
  const input = path.join(dir, "in.mp4");
  const out = path.join(dir, "clip.mp4");
  await writeFile(input, buffer);
  try {
    await runFfmpeg([
      "-y",
      "-ss",
      Math.max(0, start).toFixed(2),
      "-i",
      input,
      "-t",
      length.toFixed(2),
      "-c:v",
      "libx264",
      "-preset",
      "veryfast",
      "-crf",
      "23",
      "-c:a",
      "aac",
      "-movflags",
      "+faststart",
      out,
    ]);
    return await readFile(out);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

export async function clipVideoBuffer(buffer: Buffer, ranges: { start: number; end: number }[]) {
  const clean = ranges.filter((range) => range.end - range.start >= 2).slice(0, 4);
  if (!clean.length) return tailVideoBuffer(buffer, 7);
  return clipVideoPieces(clean.map((range) => ({ buffer, start: range.start, end: range.end })));
}

export async function concatVideoBuffers(buffers: Buffer[]) {
  if (buffers.length < 2) throw new Error("Need at least two videos to join.");
  const dir = await mkdtemp(path.join(os.tmpdir(), "parts-"));
  try {
    const files: string[] = [];
    for (let index = 0; index < buffers.length; index += 1) {
      const file = path.join(dir, `part-${index}.mp4`);
      await writeFile(file, buffers[index]);
      files.push(file);
    }
    return await concatVideoFiles(files);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

async function concatVideoFiles(files: string[]) {
  if (files.length < 2) throw new Error("Need at least two videos to join.");
  const dir = await mkdtemp(path.join(os.tmpdir(), "join-"));
  const list = path.join(dir, "list.txt");
  const out = path.join(dir, "joined.mp4");
  await writeFile(list, files.map((file) => `file '${listPath(file)}'`).join("\n"), "utf8");
  try {
    try {
      await runFfmpeg(["-y", "-f", "concat", "-safe", "0", "-i", list, "-c", "copy", "-movflags", "+faststart", out]);
    } catch {
      await runFfmpeg([
        "-y",
        "-f",
        "concat",
        "-safe",
        "0",
        "-i",
        list,
        "-c:v",
        "libx264",
        "-preset",
        "veryfast",
        "-crf",
        "23",
        "-c:a",
        "aac",
        "-movflags",
        "+faststart",
        out,
      ]);
    }
    return await readFile(out);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

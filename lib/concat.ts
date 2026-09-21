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

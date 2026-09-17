import { createWriteStream, mkdirSync, writeFileSync } from "node:fs";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import { createClient } from "@/lib/supabase/server";
import { slugify } from "./ids";
import type { Project } from "./types";

export function publicDir(...parts: string[]) {
  return path.join(process.cwd(), "public", "generated", ...parts);
}

export function publicUrl(...parts: string[]) {
  return `/generated/${parts.join("/")}`.replaceAll("\\", "/");
}

export function characterFolder(projectId: string, name: string) {
  return publicDir(projectId, "characters", slugify(name));
}

export function writePublicBuffer(buffer: Buffer, relativeParts: string[]) {
  const absolute = publicDir(...relativeParts);
  mkdirSync(path.dirname(absolute), { recursive: true });
  writeFileSync(absolute, buffer);
  return {
    absolute,
    publicPath: publicUrl(...relativeParts),
    fileName: relativeParts.at(-1) || "asset",
  };
}

export async function downloadToPublic(remoteUrl: string, relativeParts: string[]) {
  const absolute = publicDir(...relativeParts);
  mkdirSync(path.dirname(absolute), { recursive: true });
  const response = await fetch(remoteUrl);
  if (!response.ok || !response.body) {
    throw new Error(`No pude descargar ${remoteUrl} (${response.status})`);
  }
  const nodeStream = Readable.fromWeb(response.body as never);
  await pipeline(nodeStream, createWriteStream(absolute));
  return {
    absolute,
    publicPath: publicUrl(...relativeParts),
    fileName: relativeParts.at(-1) || "asset",
  };
}

export async function readPublicFile(publicPath: string) {
  if (/^https?:\/\//i.test(publicPath)) {
    const response = await fetch(publicPath);
    if (!response.ok) throw new Error(`Couldn't read ${publicPath}`);
    return Buffer.from(await response.arrayBuffer());
  }
  const absolute = path.join(process.cwd(), "public", publicPath.replace(/^\//, ""));
  return readFile(absolute);
}

function mimeFromName(name: string) {
  const ext = path.extname(name).toLowerCase();
  if (ext === ".png") return "image/png";
  if (ext === ".jpg" || ext === ".jpeg") return "image/jpeg";
  if (ext === ".webp") return "image/webp";
  if (ext === ".gif") return "image/gif";
  if (ext === ".mp4") return "video/mp4";
  if (ext === ".webm") return "video/webm";
  if (ext === ".wav") return "audio/wav";
  return "application/octet-stream";
}

export async function publishGenerated(project: Project, absolutePath: string, relativeParts: string[]) {
  if (!project.ownerId) return undefined;
  try {
    const supabase = await createClient();
    const file = await readFile(absolutePath);
    const objectPath = [project.ownerId, ...relativeParts].join("/").replaceAll("\\", "/");
    const { error } = await supabase.storage.from("generated").upload(objectPath, file, {
      upsert: true,
      contentType: mimeFromName(objectPath),
    });
    if (error) return undefined;
    const { data } = supabase.storage.from("generated").getPublicUrl(objectPath);
    return data.publicUrl;
  } catch {
    return undefined;
  }
}

export function extensionFromUrl(url: string, fallback: string) {
  try {
    const pathname = new URL(url).pathname;
    const ext = path.extname(pathname);
    return ext || fallback;
  } catch {
    return fallback;
  }
}

export function extensionFromName(name: string, fallback = ".png") {
  const ext = path.extname(name).toLowerCase();
  if ([".png", ".jpg", ".jpeg", ".webp", ".gif"].includes(ext)) return ext;
  return fallback;
}

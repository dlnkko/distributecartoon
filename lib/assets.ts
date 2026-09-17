import { mkdirSync, writeFileSync } from "node:fs";
import { readFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { createClient } from "@/lib/supabase/server";
import { slugify } from "./ids";
import type { Project } from "./types";

export type StoredFile = {
  absolute: string;
  publicPath: string;
  fileName: string;
};

function isServerless() {
  return Boolean(process.env.VERCEL || process.env.AWS_LAMBDA_FUNCTION_NAME);
}

function generatedRoot() {
  if (isServerless()) return path.join(os.tmpdir(), "generated");
  return path.join(process.cwd(), "public", "generated");
}

export function publicDir(...parts: string[]) {
  return path.join(generatedRoot(), ...parts);
}

export function publicUrl(...parts: string[]) {
  return `/generated/${parts.join("/")}`.replaceAll("\\", "/");
}

export function characterFolder(projectId: string, name: string) {
  return publicDir(projectId, "characters", slugify(name));
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

export function normalizeImageMime(type: string, name = "") {
  const mime = (type || mimeFromName(name)).toLowerCase();
  if (mime === "image/jpg") return "image/jpeg";
  return mime;
}

export function writePublicBuffer(buffer: Buffer, relativeParts: string[]): StoredFile {
  const absolute = publicDir(...relativeParts);
  mkdirSync(path.dirname(absolute), { recursive: true });
  writeFileSync(absolute, buffer);
  return {
    absolute,
    publicPath: publicUrl(...relativeParts),
    fileName: relativeParts.at(-1) || "asset",
  };
}

function writeGeneratedBuffer(buffer: Buffer, relativeParts: string[]): StoredFile {
  try {
    return writePublicBuffer(buffer, relativeParts);
  } catch {
    const absolute = path.join(os.tmpdir(), "generated", ...relativeParts);
    mkdirSync(path.dirname(absolute), { recursive: true });
    writeFileSync(absolute, buffer);
    return {
      absolute,
      publicPath: publicUrl(...relativeParts),
      fileName: relativeParts.at(-1) || "asset",
    };
  }
}

export async function publishGeneratedBuffer(
  project: Project,
  buffer: Buffer,
  relativeParts: string[],
  contentType?: string,
) {
  if (!project.ownerId) return undefined;
  const supabase = await createClient();
  const objectPath = [project.ownerId, ...relativeParts].join("/").replaceAll("\\", "/");
  const { error } = await supabase.storage.from("generated").upload(objectPath, buffer, {
    upsert: true,
    contentType: contentType || mimeFromName(objectPath),
  });
  if (error) throw new Error(error.message || "Couldn't store that image.");
  const { data } = supabase.storage.from("generated").getPublicUrl(objectPath);
  if (!data.publicUrl) throw new Error("Couldn't store that image.");
  return data.publicUrl;
}

export async function storeGeneratedFile(options: {
  project: Project;
  buffer: Buffer;
  relativeParts: string[];
  contentType?: string;
}): Promise<StoredFile> {
  const saved = writeGeneratedBuffer(options.buffer, options.relativeParts);
  const hosted = await publishGeneratedBuffer(
    options.project,
    options.buffer,
    options.relativeParts,
    options.contentType,
  );
  if (hosted) return { ...saved, publicPath: hosted };
  if (options.project.ownerId) throw new Error("Couldn't store that image.");
  return saved;
}

export async function downloadToPublic(remoteUrl: string, relativeParts: string[], project?: Project) {
  const response = await fetch(remoteUrl);
  if (!response.ok) {
    throw new Error(`Couldn't download ${remoteUrl} (${response.status})`);
  }
  const buffer = Buffer.from(await response.arrayBuffer());
  if (project) {
    return storeGeneratedFile({
      project,
      buffer,
      relativeParts,
      contentType: response.headers.get("content-type") || mimeFromName(relativeParts.at(-1) || ""),
    });
  }
  return writeGeneratedBuffer(buffer, relativeParts);
}

export async function readPublicFile(publicPath: string) {
  if (/^https?:\/\//i.test(publicPath)) {
    const response = await fetch(publicPath);
    if (!response.ok) throw new Error(`Couldn't read ${publicPath}`);
    return Buffer.from(await response.arrayBuffer());
  }
  const relative = publicPath.replace(/^\//, "");
  try {
    return await readFile(path.join(process.cwd(), "public", relative));
  } catch {
    return readFile(path.join(os.tmpdir(), relative));
  }
}

export async function publishGenerated(project: Project, absolutePath: string, relativeParts: string[]) {
  if (!project.ownerId) return undefined;
  const file = await readFile(absolutePath);
  return publishGeneratedBuffer(project, file, relativeParts);
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

import { existsSync, statSync } from "node:fs";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { NextResponse } from "next/server";

export const runtime = "nodejs";

const MIME: Record<string, string> = {
  ".mp4": "video/mp4",
  ".webm": "video/webm",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".gif": "image/gif",
  ".wav": "audio/wav",
};

export async function GET(_request: Request, context: { params: Promise<{ path: string[] }> }) {
  const { path: parts } = await context.params;
  if (!parts?.length) return NextResponse.json({ error: "Missing file" }, { status: 400 });
  const root = path.resolve(process.cwd(), "public", "generated");
  const target = path.resolve(root, ...parts);
  if (!target.startsWith(root + path.sep)) {
    return NextResponse.json({ error: "Invalid path" }, { status: 400 });
  }
  if (!existsSync(target) || !statSync(target).isFile()) {
    return NextResponse.json({ error: "File not found" }, { status: 404 });
  }
  const data = await readFile(target);
  const ext = path.extname(target).toLowerCase();
  return new Response(data, {
    headers: {
      "Content-Type": MIME[ext] || "application/octet-stream",
      "Cache-Control": "public, max-age=31536000, immutable",
      "Content-Disposition": "inline",
    },
  });
}

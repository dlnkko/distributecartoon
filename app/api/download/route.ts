import { existsSync, statSync } from "node:fs";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { NextResponse } from "next/server";
import { getAuthUser } from "@/lib/auth";
import { getSecrets } from "@/lib/config";

export const runtime = "nodejs";
export const maxDuration = 120;

const OPENROUTER_VIDEO = /^https:\/\/openrouter\.ai\/api\/v1\/videos\/[^/?#]+\/content(?:\?|$)/i;

function hostedVideoUrl(src: string) {
  let url: URL;
  try {
    url = new URL(src);
  } catch {
    return "";
  }
  if (url.protocol !== "https:") return "";
  const host = url.hostname;
  const allowed =
    host === "tempfile.aiquickdraw.com" ||
    host === "fal.media" ||
    host.endsWith(".fal.media") ||
    (host.endsWith(".supabase.co") && url.pathname.startsWith("/storage/v1/object/"));
  return allowed ? url.toString() : "";
}

function filenameOf(value: string) {
  const cleaned = value.replace(/[^a-zA-Z0-9._-]+/g, "-").replace(/^-+|-+$/g, "");
  const base = cleaned || "video.mp4";
  return base.toLowerCase().endsWith(".mp4") ? base : `${base}.mp4`;
}

function attachment(name: string) {
  return `attachment; filename="${filenameOf(name)}"`;
}

function r2Url(src: string) {
  const root = (process.env.R2_PUBLIC_URL || "").replace(/\/$/, "");
  if (!root || !src.startsWith(`${root}/`)) return "";
  return src;
}

export async function GET(request: Request) {
  const user = await getAuthUser();
  if (!user) return NextResponse.json({ error: "Sign in first." }, { status: 401 });

  const query = new URL(request.url).searchParams;
  const src = query.get("src") || "";
  const name = query.get("name") || "video.mp4";
  const headers: Record<string, string> = {
    "Content-Type": "video/mp4",
    "Content-Disposition": attachment(name),
    "Cache-Control": "private, no-store",
    "X-Content-Type-Options": "nosniff",
  };

  if (src.startsWith("/api/media/")) {
    const relative = decodeURIComponent(src.slice("/api/media/".length).split("?")[0] || "");
    const parts = relative.split("/").filter(Boolean);
    if (!parts.length || parts.some((part) => part === "." || part === "..")) {
      return NextResponse.json({ error: "Invalid video." }, { status: 400 });
    }
    const root = path.resolve(process.cwd(), "public", "generated");
    const target = path.resolve(root, ...parts);
    if (!target.startsWith(root + path.sep) || !existsSync(target) || !statSync(target).isFile()) {
      return NextResponse.json({ error: "File not found" }, { status: 404 });
    }
    const data = await readFile(target);
    return new Response(data, { headers });
  }

  const remote = r2Url(src) || (OPENROUTER_VIDEO.test(src) ? src : "") || hostedVideoUrl(src);
  const fromProxy = src.startsWith("/api/video?url=") ? new URLSearchParams(src.slice("/api/video?".length)).get("url") || "" : "";
  const openrouter = OPENROUTER_VIDEO.test(fromProxy) ? fromProxy : remote && OPENROUTER_VIDEO.test(remote) ? remote : "";
  const fileUrl = openrouter || r2Url(remote) || hostedVideoUrl(remote);

  if (!fileUrl) return NextResponse.json({ error: "Invalid video." }, { status: 400 });

  const upstreamHeaders: HeadersInit = {};
  if (openrouter) {
    const { openrouterApiKey } = getSecrets();
    if (!openrouterApiKey) return NextResponse.json({ error: "Video storage is not configured." }, { status: 500 });
    upstreamHeaders.Authorization = `Bearer ${openrouterApiKey}`;
  }

  let upstream: Response;
  try {
    upstream = await fetch(fileUrl, { headers: upstreamHeaders, redirect: "error" });
  } catch {
    return NextResponse.json({ error: "Couldn't download that video." }, { status: 502 });
  }
  if (!upstream.ok || !upstream.body) {
    return NextResponse.json({ error: "Couldn't download that video." }, { status: 502 });
  }
  const length = upstream.headers.get("content-length");
  if (length) headers["Content-Length"] = length;
  const type = upstream.headers.get("content-type");
  if (type && type.startsWith("video/")) headers["Content-Type"] = type;
  return new Response(upstream.body, { headers });
}

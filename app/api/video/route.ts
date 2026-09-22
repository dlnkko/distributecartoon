import { NextResponse } from "next/server";
import { getAuthUser } from "@/lib/auth";
import { getSecrets } from "@/lib/config";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function GET(request: Request) {
  const user = await getAuthUser();
  if (!user) return NextResponse.json({ error: "Sign in first." }, { status: 401 });
  const url = new URL(request.url).searchParams.get("url") || "";
  if (!/^https:\/\/openrouter\.ai\/api\/v1\/videos\/[^/?#]+\/content(?:\?|$)/i.test(url)) {
    return NextResponse.json({ error: "Invalid video." }, { status: 400 });
  }
  const { openrouterApiKey } = getSecrets();
  if (!openrouterApiKey) return NextResponse.json({ error: "Video storage is not configured." }, { status: 500 });
  const response = await fetch(url, { headers: { Authorization: `Bearer ${openrouterApiKey}` } });
  if (!response.ok || !response.body) {
    return NextResponse.json({ error: "Couldn't load that video." }, { status: 502 });
  }
  return new Response(response.body, {
    headers: {
      "Content-Type": response.headers.get("content-type") || "video/mp4",
      "Cache-Control": "private, max-age=3600",
    },
  });
}

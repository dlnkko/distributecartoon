import { NextResponse } from "next/server";
import { loadOwnedProject } from "@/lib/auth";
import { whopReady } from "@/lib/whop";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const projectId = new URL(request.url).searchParams.get("projectId") || "";
  if (!projectId) return NextResponse.json({ enabled: whopReady() });
  const loaded = await loadOwnedProject(projectId);
  if ("response" in loaded) return loaded.response;
  return NextResponse.json({ enabled: whopReady(), paid: Boolean(loaded.project.paidAt) });
}

export async function POST(request: Request) {
  const body = (await request.json().catch(() => ({}))) as { projectId?: string };
  if (!body.projectId) return NextResponse.json({ error: "Missing project." }, { status: 400 });
  const loaded = await loadOwnedProject(body.projectId);
  if ("response" in loaded) return loaded.response;
  const { project } = loaded;
  if (project.paidAt) return NextResponse.json({ paid: true, project });
  return NextResponse.json(
    { error: "Video runs on your KIE key. The membership pays for the workflow." },
    { status: 410 },
  );
}

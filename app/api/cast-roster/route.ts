import { NextResponse } from "next/server";
import { loadOwnedProject } from "@/lib/auth";
import { identifyScriptCast } from "@/lib/cast-roster";
import { saveProject } from "@/lib/store";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST(request: Request) {
  const body = (await request.json()) as { projectId?: string };
  if (!body.projectId) return NextResponse.json({ error: "Missing project." }, { status: 400 });
  const loaded = await loadOwnedProject(body.projectId);
  if ("response" in loaded) return loaded.response;
  const { project } = loaded;
  if (!project.scriptText.trim()) {
    return NextResponse.json({ error: "Add a script first." }, { status: 400 });
  }
  try {
    if (!project.scriptCast?.length) {
      project.scriptCast = await identifyScriptCast(project.scriptText);
    }
    project.workflowStep = "setup";
    await saveProject(project);
    return NextResponse.json({ project });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Couldn't read the characters." },
      { status: 500 },
    );
  }
}

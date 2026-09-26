import { NextResponse } from "next/server";
import { loadOwnedProject } from "@/lib/auth";
import { resetStoryboard, saveProject } from "@/lib/store";

export async function POST(request: Request) {
  const body = (await request.json()) as { projectId?: string; text?: string; name?: string };
  if (!body.projectId || !body.text?.trim()) {
    return NextResponse.json({ error: "Missing script." }, { status: 400 });
  }
  const loaded = await loadOwnedProject(body.projectId);
  if ("response" in loaded) return loaded.response;
  const { project } = loaded;
  const nextText = body.text.trim();
  if (nextText !== project.scriptText) resetStoryboard(project);
  delete project.song;
  project.scriptText = nextText;
  project.scriptName = body.name || project.scriptName || "pasted-script.txt";
  project.workflowStep = "setup";
  await saveProject(project);
  return NextResponse.json({ project });
}

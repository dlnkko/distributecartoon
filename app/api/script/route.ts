import { NextResponse } from "next/server";
import { loadOwnedProject } from "@/lib/auth";
import { resetStoryboard, saveProject } from "@/lib/store";
import { scriptAskedDuration } from "@/lib/timing";

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
  delete (project as { speechMode?: string }).speechMode;
  project.scriptText = nextText;
  project.scriptName = body.name || project.scriptName || "pasted-script.txt";
  const asked = scriptAskedDuration(nextText);
  if (asked) project.targetDurationSeconds = asked;
  await saveProject(project);
  return NextResponse.json({ project });
}

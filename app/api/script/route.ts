import { NextResponse } from "next/server";
import { getProject, resetStoryboard, saveProject } from "@/lib/store";

export async function POST(request: Request) {
  const body = (await request.json()) as { projectId?: string; text?: string; name?: string };
  if (!body.projectId || !body.text?.trim()) {
    return NextResponse.json({ error: "Missing script." }, { status: 400 });
  }
  const project = getProject(body.projectId);
  if (!project) return NextResponse.json({ error: "Project not found" }, { status: 404 });
  const nextText = body.text.trim();
  if (nextText !== project.scriptText) resetStoryboard(project);
  project.scriptText = nextText;
  project.scriptName = body.name || project.scriptName || "pasted-script.txt";
  project.workflowStep = "setup";
  saveProject(project);
  return NextResponse.json({ project });
}

import { NextResponse } from "next/server";
import { extractScriptText } from "@/lib/script";
import { getProject, resetStoryboard, saveProject } from "@/lib/store";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const form = await request.formData();
  const projectId = String(form.get("projectId") || "");
  const file = form.get("file");
  if (!projectId || !(file instanceof File)) {
    return NextResponse.json({ error: "Missing project or file." }, { status: 400 });
  }
  const project = getProject(projectId);
  if (!project) return NextResponse.json({ error: "Project not found" }, { status: 404 });

  const text = await extractScriptText(file);
  if (!text) {
    return NextResponse.json({ error: "That file had no readable text." }, { status: 422 });
  }

  if (text !== project.scriptText) resetStoryboard(project);
  project.scriptName = file.name;
  project.scriptText = text;
  project.workflowStep = "script";
  saveProject(project);
  return NextResponse.json({ project, preview: text.slice(0, 1200) });
}

import { NextResponse } from "next/server";
import { loadOwnedProject } from "@/lib/auth";
import { extractScriptText } from "@/lib/script";
import { resetStoryboard, saveProject } from "@/lib/store";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const form = await request.formData();
  const projectId = String(form.get("projectId") || "");
  const file = form.get("file");
  if (!projectId || !(file instanceof File)) {
    return NextResponse.json({ error: "Missing project or file." }, { status: 400 });
  }
  const loaded = await loadOwnedProject(projectId);
  if ("response" in loaded) return loaded.response;
  const { project } = loaded;

  const text = await extractScriptText(file);
  if (!text) {
    return NextResponse.json({ error: "That file had no readable text." }, { status: 422 });
  }

  if (text !== project.scriptText) resetStoryboard(project);
  delete project.song;
  project.scriptName = file.name;
  project.scriptText = text;
  project.workflowStep = "script";
  await saveProject(project);
  return NextResponse.json({ project, preview: text.slice(0, 1200) });
}

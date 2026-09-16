import { NextResponse } from "next/server";
import { getAuthUser } from "@/lib/auth";
import { normalizeAspectRatio, clampTotalDuration, createId } from "@/lib/ids";
import { createProject, deleteProject, getProject, listProjects, resetStoryboard, saveProject, archiveReadyVideos } from "@/lib/store";
import type { AspectRatio, Scene, VisualStyle, WorkflowStep } from "@/lib/types";

export async function GET(request: Request) {
  const user = await getAuthUser();
  const { searchParams } = new URL(request.url);
  const id = searchParams.get("id");
  if (id) {
    const project = getProject(id);
    if (!project) return NextResponse.json({ error: "Project not found" }, { status: 404 });
    if (user && project.ownerId && project.ownerId !== user.id) {
      return NextResponse.json({ error: "Project not found" }, { status: 404 });
    }
    return NextResponse.json(project);
  }
  return NextResponse.json(listProjects(user?.id));
}

export async function POST(request: Request) {
  const user = await getAuthUser();
  const body = (await request.json().catch(() => ({}))) as { style?: VisualStyle; aspectRatio?: AspectRatio };
  const project = createProject(body.style || "pixar", normalizeAspectRatio(body.aspectRatio), user?.id);
  return NextResponse.json(project);
}

export async function PATCH(request: Request) {
  const user = await getAuthUser();
  const body = (await request.json().catch(() => ({}))) as {
    projectId?: string;
    style?: VisualStyle;
    aspectRatio?: AspectRatio;
    targetDurationSeconds?: number | null;
    durationAuto?: boolean;
    workflowStep?: WorkflowStep;
    scenes?: Scene[];
    clearScript?: boolean;
    resetGeneration?: boolean;
  };
  if (!body.projectId) return NextResponse.json({ error: "Missing project" }, { status: 400 });
  const project = getProject(body.projectId);
  if (!project) return NextResponse.json({ error: "Project not found" }, { status: 404 });
  if (user && project.ownerId && project.ownerId !== user.id) {
    return NextResponse.json({ error: "Project not found" }, { status: 404 });
  }
  if (body.clearScript) {
    resetStoryboard(project);
    project.scriptText = "";
    project.scriptName = "";
    project.workflowStep = "script";
  }
  if (body.style === "pixar" || body.style === "claymation") project.style = body.style;
  if (body.aspectRatio) project.aspectRatio = normalizeAspectRatio(body.aspectRatio);
  if (typeof body.targetDurationSeconds === "number") {
    project.targetDurationSeconds = clampTotalDuration(body.targetDurationSeconds);
    project.durationAuto = false;
    project.durationPending = false;
  }
  if (
    body.workflowStep === "script" ||
    body.workflowStep === "setup" ||
    body.workflowStep === "review" ||
    body.workflowStep === "cast" ||
    body.workflowStep === "produce"
  ) {
    project.workflowStep = body.workflowStep;
  }
  if (Array.isArray(body.scenes)) {
    project.scenes = body.scenes.map((item, index) => ({
      id: String(item.id || createId("scene")),
      index: Number(item.index) || index + 1,
      title: String(item.title || `Scene ${index + 1}`),
      summary: String(item.summary || ""),
      location: String(item.location || ""),
      characterNames: Array.isArray(item.characterNames) ? item.characterNames.map(String) : [],
      extraNames: Array.isArray(item.extraNames) ? item.extraNames.map(String) : [],
      dialogue: Array.isArray(item.dialogue)
        ? item.dialogue.map((line) => ({
            speaker: String(line.speaker || ""),
            line: String(line.line || ""),
          }))
        : [],
      estimatedSeconds: Math.min(30, Math.max(2, Number(item.estimatedSeconds) || 3)),
      camera: String(item.camera || ""),
    }));
    const total = project.scenes.reduce((sum, scene) => sum + (scene.estimatedSeconds || 0), 0);
    if (total > 0) project.targetDurationSeconds = clampTotalDuration(total);
    if (body.resetGeneration) {
      archiveReadyVideos(project);
      project.batches = [];
      delete project.lastVideoFileName;
      delete project.lastVideoPublicPath;
      delete project.lastVideoRemoteUrl;
    }
  }
  if (user && !project.ownerId) project.ownerId = user.id;
  saveProject(project);
  return NextResponse.json(project);
}

export async function DELETE(request: Request) {
  const user = await getAuthUser();
  const { searchParams } = new URL(request.url);
  const id = searchParams.get("id");
  if (!id) return NextResponse.json({ error: "Missing id" }, { status: 400 });
  const project = getProject(id);
  if (user && project?.ownerId && project.ownerId !== user.id) {
    return NextResponse.json({ error: "Project not found" }, { status: 404 });
  }
  deleteProject(id);
  return NextResponse.json({ ok: true });
}

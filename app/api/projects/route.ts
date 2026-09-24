import { after, NextResponse } from "next/server";

export const runtime = "nodejs";
export const maxDuration = 300;
import { getAuthUser, loadOwnedProject } from "@/lib/auth";
import { normalizeAspectRatio, clampTotalDuration, createId } from "@/lib/ids";
import { scaleEstimatedSeconds } from "@/lib/timing";
import { recoverPendingVideos } from "@/lib/pipeline";
import { driveProduce } from "@/lib/produce";
import type { Project } from "@/lib/types";

// Polling while the tab is open also moves a generation forward. The lease keeps
// this from racing the cron worker.
function nudgeGenerations(projects: Project[]) {
  const live = projects.filter((project) => project.keepGenerating);
  if (!live.length) return;
  after(Promise.allSettled(live.map((project) => driveProduce(project.id, 40_000))));
}
import { createProject, deleteProject, listProjects, resetStoryboard, saveProject, archiveReadyVideos } from "@/lib/store";
import type { AspectRatio, Scene, VisualStyle, WorkflowStep } from "@/lib/types";

export async function GET(request: Request) {
  const user = await getAuthUser();
  if (!user) return NextResponse.json({ error: "Sign in first." }, { status: 401 });
  const { searchParams } = new URL(request.url);
  const id = searchParams.get("id");
  if (id) {
    const loaded = await loadOwnedProject(id);
    if ("response" in loaded) return loaded.response;
    nudgeGenerations([loaded.project]);
    try {
      return NextResponse.json(await recoverPendingVideos(loaded.project));
    } catch {
      return NextResponse.json(loaded.project);
    }
  }
  const list = await listProjects(user.id);
  nudgeGenerations(list);
  await Promise.all(
    list.map(async (project) => {
      try {
        await recoverPendingVideos(project);
      } catch {
        // Keep the last saved project if OpenRouter is unreachable.
      }
    }),
  );
  return NextResponse.json(list);
}

export async function POST(request: Request) {
  const user = await getAuthUser();
  if (!user) return NextResponse.json({ error: "Sign in first." }, { status: 401 });
  const body = (await request.json().catch(() => ({}))) as { style?: VisualStyle; aspectRatio?: AspectRatio };
  const project = await createProject(body.style || "pixar", normalizeAspectRatio(body.aspectRatio), user.id);
  return NextResponse.json(project);
}

export async function PATCH(request: Request) {
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
  const loaded = await loadOwnedProject(body.projectId);
  if ("response" in loaded) return loaded.response;
  const { user, project } = loaded;
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
      shots: Array.isArray(item.shots)
        ? item.shots
            .map((shot) => ({
              seconds: Math.min(30, Math.max(1.5, Number(shot.seconds) || 2)),
              camera: String(shot.camera || ""),
              action: String(shot.action || ""),
            }))
            .filter((shot) => shot.action || shot.camera)
        : undefined,
    }));
    const scaled = scaleEstimatedSeconds(
      project.scenes.map((scene) => scene.estimatedSeconds || 0),
      project.targetDurationSeconds || 15,
    );
    project.scenes.forEach((scene, index) => {
      scene.estimatedSeconds = scaled[index] ?? scene.estimatedSeconds;
    });
    if (body.resetGeneration) {
      archiveReadyVideos(project);
      project.batches = [];
      delete project.lastVideoFileName;
      delete project.lastVideoPublicPath;
      delete project.lastVideoRemoteUrl;
      delete project.joinedVideoFileName;
      delete project.joinedVideoPublicPath;
      delete project.joinedVideoRemoteUrl;
      delete project.joinedSource;
    }
  }
  if (!project.ownerId) project.ownerId = user.id;
  await saveProject(project);
  return NextResponse.json(project);
}

export async function DELETE(request: Request) {
  const { searchParams } = new URL(request.url);
  const id = searchParams.get("id");
  if (!id) return NextResponse.json({ error: "Missing id" }, { status: 400 });
  const loaded = await loadOwnedProject(id);
  if ("response" in loaded) return loaded.response;
  await deleteProject(id);
  return NextResponse.json({ ok: true });
}

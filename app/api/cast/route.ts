import { NextResponse } from "next/server";
import { isAbortError } from "@/lib/abort";
import {
  confirmCharacterLooks,
  ensureCharacterLooks,
  leadCharacters,
  reviseCharacterLook,
} from "@/lib/pipeline";
import { getProject, saveProject } from "@/lib/store";

export const runtime = "nodejs";
export const maxDuration = 300;

export async function POST(request: Request) {
  const body = (await request.json().catch(() => ({}))) as {
    projectId?: string;
    characterId?: string;
    notes?: string;
    confirm?: boolean;
  };
  if (!body.projectId) return NextResponse.json({ error: "Missing project." }, { status: 400 });
  const project = getProject(body.projectId);
  if (!project) return NextResponse.json({ error: "Project not found" }, { status: 404 });
  if (!project.scenes.length) {
    return NextResponse.json({ error: "Review scenes before casting." }, { status: 400 });
  }

  try {
    if (body.confirm) {
      confirmCharacterLooks(project);
      project.workflowStep = "produce";
      saveProject(project);
      return NextResponse.json({ project });
    }

    if (body.characterId) {
      await reviseCharacterLook(project, body.characterId, String(body.notes || ""), () => undefined, request.signal);
      project.workflowStep = "cast";
      saveProject(project);
      return NextResponse.json({ project });
    }

    project.workflowStep = "cast";
    saveProject(project);
    if (leadCharacters(project).length) {
      await ensureCharacterLooks(project, () => undefined, request.signal);
    }
    project.workflowStep = "cast";
    saveProject(project);
    return NextResponse.json({ project });
  } catch (error) {
    if (isAbortError(error) || request.signal.aborted) {
      return NextResponse.json({ error: "Stopped.", project }, { status: 400 });
    }
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Couldn't update the cast." },
      { status: 500 },
    );
  }
}

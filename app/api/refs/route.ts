import { NextResponse } from "next/server";
import { extensionFromName, writePublicBuffer } from "@/lib/assets";
import { emptySlot, ensureReferenceSlots, syncReferenceInclusion } from "@/lib/refs";
import { getProject, saveProject } from "@/lib/store";
import type { ReferenceKind } from "@/lib/types";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST(request: Request) {
  const form = await request.formData();
  const projectId = String(form.get("projectId") || "");
  const kind = (String(form.get("kind") || "other") as ReferenceKind) || "other";
  const slotId = String(form.get("slotId") || "");
  const notes = String(form.get("notes") || "");
  const file = form.get("file");
  if (!projectId || !(file instanceof File)) {
    return NextResponse.json({ error: "Missing project or image." }, { status: 400 });
  }

  const project = getProject(projectId);
  if (!project) return NextResponse.json({ error: "Project not found" }, { status: 404 });

  ensureReferenceSlots(project);
  let asset = slotId ? project.references.find((item) => item.id === slotId) : undefined;
  if (!asset) asset = project.references.find((item) => item.kind === kind);
  if (!asset) {
    asset = emptySlot(kind);
    project.references.push(asset);
  }

  const ext = extensionFromName(file.name);
  const buffer = Buffer.from(await file.arrayBuffer());
  const saved = writePublicBuffer(buffer, [project.id, "refs", `${asset.kind}-${asset.id}-original${ext}`]);
  asset.kind = kind;
  asset.originalFileName = saved.fileName;
  asset.originalPublicPath = saved.publicPath;
  asset.status = "ready";
  if (notes) asset.notes = notes;
  if (kind === "character") {
    for (const character of project.characters) {
      if (character.sourceRefId !== asset.id) continue;
      delete character.sourceRefId;
      delete character.portraitFileName;
      delete character.portraitPublicPath;
      delete character.portraitRemoteUrl;
      character.lookConfirmed = false;
      character.lookRevisionUsed = false;
    }
  }
  project.skippedRefs = false;
  syncReferenceInclusion(project);
  saveProject(project);

  return NextResponse.json({ project, asset });
}

export async function PATCH(request: Request) {
  const body = (await request.json()) as {
    projectId?: string;
    slotId?: string;
    notes?: string;
    includeInVideo?: boolean;
    skipAll?: boolean;
    label?: string;
  };
  if (!body.projectId) return NextResponse.json({ error: "Missing project" }, { status: 400 });
  const project = getProject(body.projectId);
  if (!project) return NextResponse.json({ error: "Project not found" }, { status: 404 });

  if (body.skipAll) {
    project.skippedRefs = true;
    saveProject(project);
    return NextResponse.json({ project });
  }

  const asset = project.references.find((item) => item.id === body.slotId);
  if (!asset) return NextResponse.json({ error: "Slot not found" }, { status: 404 });
  if (typeof body.notes === "string") asset.notes = body.notes;
  if (typeof body.label === "string") asset.label = body.label;
  if (typeof body.includeInVideo === "boolean") {
    if (body.includeInVideo) {
      project.scriptRefCues = [
        ...(project.scriptRefCues || []).filter((cue) => cue.kind !== asset.kind),
        {
          kind: asset.kind,
          cue: body.notes || asset.notes || asset.label,
          sceneIndexes: project.scenes.map((scene) => scene.index),
        },
      ];
    } else {
      project.scriptRefCues = (project.scriptRefCues || []).filter((cue) => cue.kind !== asset.kind);
    }
  }
  syncReferenceInclusion(project);
  saveProject(project);
  return NextResponse.json({ project, asset });
}

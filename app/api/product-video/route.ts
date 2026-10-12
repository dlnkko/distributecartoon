import path from "node:path";
import { NextResponse } from "next/server";
import { storeGeneratedFile } from "@/lib/assets";
import { loadOwnedProject } from "@/lib/auth";
import { describeProductUse, probeVideoDuration, PRODUCT_USE_MAX_SECONDS } from "@/lib/product-use-video";
import { ensureReferenceSlots } from "@/lib/refs";
import { saveProject } from "@/lib/store";

export const runtime = "nodejs";
export const maxDuration = 60;

const VIDEO_EXT: Record<string, string> = {
  ".mp4": "video/mp4",
  ".mov": "video/quicktime",
  ".webm": "video/webm",
  ".m4v": "video/mp4",
};

export async function POST(request: Request) {
  const form = await request.formData();
  const projectId = String(form.get("projectId") || "");
  const slotId = String(form.get("slotId") || "");
  const file = form.get("file");
  if (!projectId || !slotId || !(file instanceof File)) {
    return NextResponse.json({ error: "Missing project or video." }, { status: 400 });
  }
  const ext = path.extname(file.name).toLowerCase();
  const mime = VIDEO_EXT[ext] || (file.type.startsWith("video/") ? file.type : "");
  if (!mime) {
    return NextResponse.json({ error: "Upload an mp4, mov, or webm video." }, { status: 415 });
  }
  if (file.size > 32 * 1024 * 1024) {
    return NextResponse.json({ error: "That video is too large. Keep it under 20 seconds." }, { status: 413 });
  }

  const loaded = await loadOwnedProject(projectId);
  if ("response" in loaded) return loaded.response;
  const { project } = loaded;
  ensureReferenceSlots(project);
  const asset = project.references.find((item) => item.id === slotId && item.kind === "product");
  if (!asset) return NextResponse.json({ error: "Product slot not found." }, { status: 404 });

  try {
    const buffer = Buffer.from(await file.arrayBuffer());
    const seconds = await probeVideoDuration(buffer, ext || ".mp4");
    if (seconds > PRODUCT_USE_MAX_SECONDS + 0.05) {
      return NextResponse.json({ error: "That video is longer than 20 seconds." }, { status: 422 });
    }
    const note = await describeProductUse(buffer, mime);
    const relative = [project.id, "refs", `use-${asset.id}-${Date.now().toString(36)}${ext || ".mp4"}`];
    const saved = await storeGeneratedFile({
      project,
      buffer,
      relativeParts: relative,
      contentType: mime,
    });
    asset.useVideoFileName = saved.fileName;
    asset.useVideoPublicPath = saved.publicPath;
    if (/^https?:\/\//i.test(saved.publicPath)) asset.useVideoRemoteUrl = saved.publicPath;
    else delete asset.useVideoRemoteUrl;
    asset.useVideoNote = note;
    await saveProject(project);
    return NextResponse.json({ project, note });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Couldn't read that product video." },
      { status: 500 },
    );
  }
}

export async function DELETE(request: Request) {
  const { searchParams } = new URL(request.url);
  const projectId = searchParams.get("projectId") || "";
  const slotId = searchParams.get("slotId") || "";
  if (!projectId || !slotId) return NextResponse.json({ error: "Missing project or product." }, { status: 400 });
  const loaded = await loadOwnedProject(projectId);
  if ("response" in loaded) return loaded.response;
  const { project } = loaded;
  const asset = project.references.find((item) => item.id === slotId && item.kind === "product");
  if (!asset) return NextResponse.json({ error: "Product slot not found." }, { status: 404 });
  delete asset.useVideoFileName;
  delete asset.useVideoPublicPath;
  delete asset.useVideoRemoteUrl;
  delete asset.useVideoNote;
  await saveProject(project);
  return NextResponse.json({ project });
}

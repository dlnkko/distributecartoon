import { NextResponse } from "next/server";
import { getAuthUser } from "@/lib/auth";
import { CLONE_MAX_PARTS, clonePartKey, isCloneUploadId } from "@/lib/clone-upload";
import { uploadToR2 } from "@/lib/r2";

export const runtime = "nodejs";
export const maxDuration = 60;

const PART_MAX_BYTES = 4 * 1024 * 1024;

export async function POST(request: Request) {
  const user = await getAuthUser();
  if (!user) return NextResponse.json({ error: "Sign in first." }, { status: 401 });
  const form = await request.formData();
  const uploadId = String(form.get("uploadId") || "").trim();
  const index = Number(form.get("index"));
  const chunk = form.get("chunk");
  if (!isCloneUploadId(uploadId) || !Number.isInteger(index) || index < 0 || index >= CLONE_MAX_PARTS) {
    return NextResponse.json({ error: "That upload is not valid." }, { status: 400 });
  }
  if (!(chunk instanceof File)) return NextResponse.json({ error: "That upload is missing a piece." }, { status: 400 });
  if (chunk.size < 1 || chunk.size > PART_MAX_BYTES) {
    return NextResponse.json({ error: "That video is too large." }, { status: 413 });
  }
  try {
    await uploadToR2(clonePartKey(user.id, uploadId, index), Buffer.from(await chunk.arrayBuffer()), "application/octet-stream");
    return NextResponse.json({ index });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Couldn't store that video.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

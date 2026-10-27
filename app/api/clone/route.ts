import path from "node:path";
import { NextResponse } from "next/server";
import { getAuthUser } from "@/lib/auth";
import { adaptCloneStory, assertCloneLength, readCloneSource } from "@/lib/clone-video";
import { CLONE_MAX_PARTS, CLONE_UPLOAD_MAX_BYTES, clonePartKey, isCloneUploadId } from "@/lib/clone-upload";
import { clampTotalDuration } from "@/lib/ids";
import { probeVideoDuration } from "@/lib/product-use-video";
import { deleteR2Object, readR2Object } from "@/lib/r2";
import { applySavedProduct, savedProductFromRow, type SavedProduct } from "@/lib/saved-products";
import { createProject, saveProject } from "@/lib/store";
import { createClient } from "@/lib/supabase/server";
import { isDialogueLanguage, type DialogueLanguage } from "@/lib/types";
import { takeWorkflowPrep } from "@/lib/workflow-limit";

export const runtime = "nodejs";
export const maxDuration = 800;

const VIDEO_EXT: Record<string, string> = {
  ".mp4": "video/mp4",
  ".mov": "video/quicktime",
  ".webm": "video/webm",
  ".m4v": "video/mp4",
};

async function ownedProduct(id: string, userId: string) {
  const supabase = await createClient();
  const { data, error } = await supabase.from("saved_products").select("*").eq("id", id).eq("owner_id", userId).maybeSingle();
  if (error) throw new Error(error.message);
  return data ? savedProductFromRow(data) : null;
}

export async function POST(request: Request) {
  const user = await getAuthUser();
  if (!user) return NextResponse.json({ error: "Sign in first." }, { status: 401 });
  const body = (await request.json().catch(() => null)) as {
    uploadId?: string;
    partCount?: number;
    name?: string;
    productId?: string;
    pain?: string;
    audience?: string;
    seconds?: unknown;
    language?: string;
    page?: string;
  } | null;
  if (!body) return NextResponse.json({ error: "That upload is not valid." }, { status: 400 });
  const productId = String(body.productId || "").trim();
  const audience = String(body.audience || "").replace(/\s+/g, " ").trim().slice(0, 240);
  const pain = String(body.pain || "").replace(/\s+/g, " ").trim().slice(0, 400);
  const seconds = clampTotalDuration(body.seconds, 30);
  const language: DialogueLanguage = isDialogueLanguage(String(body.language || "")) ? (String(body.language) as DialogueLanguage) : "english";
  const uploadId = String(body.uploadId || "").trim();
  const partCount = Number(body.partCount);
  const ext = path.extname(String(body.name || "")).toLowerCase();
  const mime = VIDEO_EXT[ext];
  if (!productId) return NextResponse.json({ error: "Pick a product." }, { status: 400 });
  if (!audience) return NextResponse.json({ error: "Add an audience." }, { status: 422 });
  if (!pain) return NextResponse.json({ error: "Add a pain point." }, { status: 422 });
  if (!mime || !isCloneUploadId(uploadId) || !Number.isInteger(partCount) || partCount < 1 || partCount > CLONE_MAX_PARTS) {
    return NextResponse.json({ error: "Upload an mp4, mov, or webm video." }, { status: 415 });
  }

  const keys = Array.from({ length: partCount }, (_, index) => clonePartKey(user.id, uploadId, index));
  try {
    const product = await ownedProduct(productId, user.id);
    if (!product) return NextResponse.json({ error: "Product not found." }, { status: 404 });
    const parts: Buffer[] = [];
    for (const key of keys) parts.push(await readR2Object(key));
    const buffer = Buffer.concat(parts);
    if (buffer.length > CLONE_UPLOAD_MAX_BYTES) return NextResponse.json({ error: "That video is too large." }, { status: 413 });
    const length = await probeVideoDuration(buffer, ext);
    assertCloneLength(length);
    const prep = await takeWorkflowPrep(user.id, "clone");
    if (!prep.ok) return NextResponse.json({ error: prep.error }, { status: prep.status });
    const source = await readCloneSource(buffer, mime);
    const page = String(body.page || "").trim() || product.pageContext || "";
    const story = await adaptCloneStory({
      source,
      productName: product.name,
      page: page.slice(0, 24000),
      how: product.useNotes,
      when: product.whenNotes,
      extra: product.extraContext,
      pain,
      audience,
      seconds,
      language,
    });
    return await openClone(story, product, user.id, language, seconds);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Couldn't adapt that video.";
    return NextResponse.json({ error: message }, { status: 500 });
  } finally {
    await Promise.all(keys.map((key) => deleteR2Object(key).catch(() => undefined)));
  }
}

async function openClone(
  story: { title: string; script: string },
  product: SavedProduct,
  userId: string,
  language: DialogueLanguage,
  seconds: number,
) {
  const script = story.script.trim();
  if (script.length < 40) return NextResponse.json({ error: "The adapted story came back too short." }, { status: 422 });
  const project = await createProject("realistic", "16:9", userId, "setup");
  project.title = story.title.replace(/\s+/g, " ").trim().slice(0, 80) || "Clone";
  project.scriptText = script;
  project.scriptName = "";
  project.dialogueLanguage = language;
  project.targetDurationSeconds = seconds;
  project.durationAuto = false;
  project.workflowStep = "setup";
  const slot = project.references.find((item) => item.kind === "product");
  if (!slot) return NextResponse.json({ error: "Couldn't attach that product." }, { status: 500 });
  applySavedProduct(project, slot, product);
  await saveProject(project);
  return NextResponse.json({ project });
}

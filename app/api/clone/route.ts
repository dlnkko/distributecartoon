import path from "node:path";
import { NextResponse } from "next/server";
import { getAuthUser } from "@/lib/auth";
import { adaptCloneStory, assertCloneLength, readCloneSource } from "@/lib/clone-video";
import { clampTotalDuration } from "@/lib/ids";
import { probeVideoDuration } from "@/lib/product-use-video";
import { applySavedProduct, savedProductFromRow, type SavedProduct } from "@/lib/saved-products";
import { createProject, saveProject } from "@/lib/store";
import { createClient } from "@/lib/supabase/server";
import { isDialogueLanguage, type DialogueLanguage } from "@/lib/types";

export const runtime = "nodejs";
export const maxDuration = 300;

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
  const form = await request.formData();
  const productId = String(form.get("productId") || "").trim();
  const pain = String(form.get("pain") || "").replace(/\s+/g, " ").trim().slice(0, 400);
  const audience = String(form.get("audience") || "").replace(/\s+/g, " ").trim().slice(0, 240);
  const seconds = clampTotalDuration(form.get("seconds"), 30);
  const language: DialogueLanguage = isDialogueLanguage(String(form.get("language") || "")) ? (String(form.get("language")) as DialogueLanguage) : "english";
  const file = form.get("file");
  if (!productId) return NextResponse.json({ error: "Pick a product." }, { status: 400 });
  if (!pain || !audience) return NextResponse.json({ error: "Add a pain point and an audience." }, { status: 422 });
  if (!(file instanceof File)) return NextResponse.json({ error: "Upload a video to clone." }, { status: 400 });
  const ext = path.extname(file.name).toLowerCase();
  const mime = VIDEO_EXT[ext] || (file.type.startsWith("video/") ? file.type : "");
  if (!mime) return NextResponse.json({ error: "Upload an mp4, mov, or webm video." }, { status: 415 });
  if (file.size > 32 * 1024 * 1024) return NextResponse.json({ error: "That video is too large." }, { status: 413 });

  try {
    const product = await ownedProduct(productId, user.id);
    if (!product) return NextResponse.json({ error: "Product not found." }, { status: 404 });
    const buffer = Buffer.from(await file.arrayBuffer());
    const length = await probeVideoDuration(buffer, ext || ".mp4");
    assertCloneLength(length);
    const source = await readCloneSource(buffer, mime);
    const page = String(form.get("page") || "").trim() || product.pageContext || "";
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

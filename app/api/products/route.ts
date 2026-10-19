import path from "node:path";
import { NextResponse } from "next/server";
import { normalizeImageMime, storeGeneratedFile } from "@/lib/assets";
import { getAuthUser } from "@/lib/auth";
import { IMAGE_TOO_SMALL, imagePixelCount, MIN_IMAGE_PIXELS } from "@/lib/images";
import { productPageUrl, scrapeProductPage } from "@/lib/product-page";
import { describeProductImage, describeProductUse, probeVideoDuration, PRODUCT_USE_MAX_SECONDS } from "@/lib/product-use-video";
import { newSavedProductId, savedProductFromRow, type SavedProduct } from "@/lib/saved-products";
import { createClient } from "@/lib/supabase/server";
import type { Project } from "@/lib/types";

export const runtime = "nodejs";
export const maxDuration = 60;

const IMAGE_TYPES = new Set(["image/jpeg", "image/png", "image/webp", "image/gif"]);
const VIDEO_EXT: Record<string, string> = {
  ".mp4": "video/mp4",
  ".mov": "video/quicktime",
  ".webm": "video/webm",
  ".m4v": "video/mp4",
};

function publicDbError(message: string) {
  if (/row-level security|jwt/i.test(message)) return "Sign in again, then save the product.";
  return message;
}

function holder(userId: string, productId: string) {
  return { id: productId, ownerId: userId } as Project;
}

async function owned(id: string, userId: string) {
  const supabase = await createClient();
  const { data, error } = await supabase.from("saved_products").select("*").eq("id", id).eq("owner_id", userId).maybeSingle();
  if (error) throw new Error(error.message);
  return data ? savedProductFromRow(data) : null;
}

export async function GET() {
  const user = await getAuthUser();
  if (!user) return NextResponse.json({ error: "Sign in first." }, { status: 401 });
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("saved_products")
    .select("*")
    .eq("owner_id", user.id)
    .order("updated_at", { ascending: false });
  if (error) return NextResponse.json({ error: publicDbError(error.message) }, { status: 500 });
  return NextResponse.json({ products: (data || []).map((row) => savedProductFromRow(row)) });
}

export async function POST(request: Request) {
  const user = await getAuthUser();
  if (!user) return NextResponse.json({ error: "Sign in first." }, { status: 401 });
  const contentType = request.headers.get("content-type") || "";
  try {
    if (contentType.includes("multipart/form-data")) return await saveFile(request, user.id);
    return await saveText(request, user.id);
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Couldn't save that product." }, { status: 500 });
  }
}

async function saveText(request: Request, userId: string) {
  const body = (await request.json().catch(() => ({}))) as { id?: string; name?: string; pageUrl?: string; useNotes?: string };
  const supabase = await createClient();
  const id = body.id?.trim() || newSavedProductId();
  const current = body.id ? await owned(id, userId) : null;
  if (body.id && !current) return NextResponse.json({ error: "Product not found." }, { status: 404 });
  const name = String(body.name || current?.name || "Product").replace(/\s+/g, " ").trim().slice(0, 80) || "Product";
  const useNotes = String(body.useNotes ?? current?.useNotes ?? "").replace(/\s+/g, " ").trim().slice(0, 2000);
  const rawUrl = String(body.pageUrl ?? current?.pageUrl ?? "").trim();
  let pageUrl = current?.pageUrl || "";
  let pageContext = current?.pageContext || "";
  if (!rawUrl) {
    pageUrl = "";
    pageContext = "";
  } else if (rawUrl !== current?.pageUrl) {
    pageUrl = productPageUrl(rawUrl);
    if (!pageUrl) return NextResponse.json({ error: "Use a public http or https page." }, { status: 422 });
    pageContext = await scrapeProductPage(pageUrl);
  }
  const row = {
    id,
    owner_id: userId,
    name,
    page_url: pageUrl,
    page_context: pageContext,
    use_notes: useNotes,
    image_path: current?.imagePath || "",
    image_note: current?.imageNote || "",
    use_video_path: current?.useVideoPath || "",
    use_video_note: current?.useVideoNote || "",
  };
  const { data, error } = await supabase.from("saved_products").upsert(row).select("*").single();
  if (error) return NextResponse.json({ error: publicDbError(error.message) }, { status: 500 });
  return NextResponse.json({ product: savedProductFromRow(data) });
}

async function saveFile(request: Request, userId: string) {
  const form = await request.formData();
  const id = String(form.get("id") || "");
  const kind = String(form.get("kind") || "");
  const file = form.get("file");
  if (!id || !(file instanceof File)) return NextResponse.json({ error: "Missing product or file." }, { status: 400 });
  const current = await owned(id, userId);
  if (!current) return NextResponse.json({ error: "Product not found." }, { status: 404 });
  const supabase = await createClient();
  const patch: Partial<SavedProduct> & { id: string } = { id };
  if (kind === "image") {
    const mime = normalizeImageMime(file.type, file.name);
    if (!IMAGE_TYPES.has(mime)) return NextResponse.json({ error: "Use a JPG, PNG, WEBP, or GIF photo." }, { status: 422 });
    const buffer = Buffer.from(await file.arrayBuffer());
    const pixels = imagePixelCount(buffer);
    if (!pixels || pixels < MIN_IMAGE_PIXELS) return NextResponse.json({ error: IMAGE_TOO_SMALL }, { status: 422 });
    const ext = mime === "image/jpeg" ? ".jpg" : mime === "image/webp" ? ".webp" : mime === "image/gif" ? ".gif" : ".png";
    const saved = await storeGeneratedFile({
      project: holder(userId, id),
      buffer,
      relativeParts: ["products", id, `photo-${Date.now().toString(36)}${ext}`],
      contentType: mime,
    });
    let note = current.imageNote;
    try {
      note = await describeProductImage(buffer, mime);
    } catch (error) {
      console.warn("saved product photo", error instanceof Error ? error.message : error);
    }
    patch.imagePath = saved.publicPath;
    patch.imageNote = note;
  } else if (kind === "video") {
    const ext = path.extname(file.name).toLowerCase();
    const mime = VIDEO_EXT[ext] || (file.type.startsWith("video/") ? file.type : "");
    if (!mime) return NextResponse.json({ error: "Upload an mp4, mov, or webm video." }, { status: 415 });
    if (file.size > 32 * 1024 * 1024) return NextResponse.json({ error: "That video is too large. Keep it under 20 seconds." }, { status: 413 });
    const buffer = Buffer.from(await file.arrayBuffer());
    const seconds = await probeVideoDuration(buffer, ext || ".mp4");
    if (seconds > PRODUCT_USE_MAX_SECONDS + 0.05) {
      return NextResponse.json({ error: "That video is longer than 20 seconds." }, { status: 422 });
    }
    const note = await describeProductUse(buffer, mime);
    const saved = await storeGeneratedFile({
      project: holder(userId, id),
      buffer,
      relativeParts: ["products", id, `use-${Date.now().toString(36)}${ext || ".mp4"}`],
      contentType: mime,
    });
    patch.useVideoPath = saved.publicPath;
    patch.useVideoNote = note;
  } else {
    return NextResponse.json({ error: "Choose a photo or a use video." }, { status: 400 });
  }
  const { data, error } = await supabase
    .from("saved_products")
    .update({
      image_path: patch.imagePath ?? current.imagePath,
      image_note: patch.imageNote ?? current.imageNote,
      use_video_path: patch.useVideoPath ?? current.useVideoPath,
      use_video_note: patch.useVideoNote ?? current.useVideoNote,
    })
    .eq("id", id)
    .eq("owner_id", userId)
    .select("*")
    .single();
  if (error) return NextResponse.json({ error: publicDbError(error.message) }, { status: 500 });
  return NextResponse.json({ product: savedProductFromRow(data) });
}

export async function DELETE(request: Request) {
  const user = await getAuthUser();
  if (!user) return NextResponse.json({ error: "Sign in first." }, { status: 401 });
  const id = new URL(request.url).searchParams.get("id") || "";
  if (!id) return NextResponse.json({ error: "Missing product." }, { status: 400 });
  const supabase = await createClient();
  const { error } = await supabase.from("saved_products").delete().eq("id", id).eq("owner_id", user.id);
  if (error) return NextResponse.json({ error: publicDbError(error.message) }, { status: 500 });
  return NextResponse.json({ ok: true });
}

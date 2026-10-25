import { NextResponse } from "next/server";
import { getAuthUser } from "@/lib/auth";
import { proposeDramaBrief, varyDramaField, writeDramaStory } from "@/lib/drama-story";
import { clampTotalDuration } from "@/lib/ids";
import { scrapeProductPage } from "@/lib/product-page";
import { applySavedProduct, savedProductFromRow, type SavedProduct } from "@/lib/saved-products";
import { createProject, saveProject } from "@/lib/store";
import { createClient } from "@/lib/supabase/server";
import { isDialogueLanguage, type DialogueLanguage } from "@/lib/types";

export const runtime = "nodejs";
export const maxDuration = 120;

const PAGE_LIMIT = 24000;

async function ownedProduct(id: string, userId: string) {
  const supabase = await createClient();
  const { data, error } = await supabase.from("saved_products").select("*").eq("id", id).eq("owner_id", userId).maybeSingle();
  if (error) throw new Error(error.message);
  return data ? savedProductFromRow(data) : null;
}

export async function POST(request: Request) {
  const user = await getAuthUser();
  if (!user) return NextResponse.json({ error: "Sign in first." }, { status: 401 });
  const body = (await request.json().catch(() => ({}))) as {
    action?: string;
    productId?: string;
    field?: string;
    pain?: string;
    audience?: string;
    who?: string;
    page?: string;
    seconds?: number;
    language?: string;
  };
  const productId = String(body.productId || "").trim();
  if (!productId) return NextResponse.json({ error: "Pick a product." }, { status: 400 });
  try {
    const product = await ownedProduct(productId, user.id);
    if (!product) return NextResponse.json({ error: "Product not found." }, { status: 404 });
    if (body.action === "approve") return await approveStory(body, product, user.id);
    if (body.action === "vary") return await varyBrief(body, product);
    return await readBrief(body, product);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Couldn't write that story.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

async function pageText(product: SavedProduct, supplied?: string) {
  const given = String(supplied || "").trim().slice(0, PAGE_LIMIT);
  if (given.length > 80) return given;
  let page = product.pageContext || "";
  if (product.pageUrl) {
    try {
      page = await scrapeProductPage(product.pageUrl, PAGE_LIMIT);
    } catch (error) {
      if (!page) throw error;
    }
  }
  const notes = [product.useNotes, product.whenNotes, product.extraContext].some((item) => item.trim());
  if (!page.trim() && !notes) {
    return "";
  }
  return page;
}

async function readBrief(body: { language?: string }, product: SavedProduct) {
  const page = await pageText(product);
  if (!page && ![product.useNotes, product.whenNotes, product.extraContext].some((item) => item.trim())) {
    return NextResponse.json({ error: "This product needs a page or a note about how it is used." }, { status: 422 });
  }
  const language: DialogueLanguage = isDialogueLanguage(body.language) ? body.language : "english";
  const brief = await proposeDramaBrief({
    productName: product.name,
    page,
    how: product.useNotes,
    when: product.whenNotes,
    extra: product.extraContext,
    language,
  });
  return NextResponse.json({ ...brief, page });
}

async function varyBrief(
  body: { field?: string; pain?: string; audience?: string; who?: string; page?: string; language?: string },
  product: SavedProduct,
) {
  const field = body.field === "pain" || body.field === "audience" || body.field === "person" ? body.field : "";
  if (!field) return NextResponse.json({ error: "Pick which field to vary." }, { status: 400 });
  const page = await pageText(product, body.page);
  if (!page && ![product.useNotes, product.whenNotes, product.extraContext].some((item) => item.trim())) {
    return NextResponse.json({ error: "This product needs a page or a note about how it is used." }, { status: 422 });
  }
  const language: DialogueLanguage = isDialogueLanguage(body.language) ? body.language : "english";
  const value = await varyDramaField({
    productName: product.name,
    page,
    how: product.useNotes,
    when: product.whenNotes,
    extra: product.extraContext,
    language,
    field,
    current: {
      pain: String(body.pain || ""),
      audience: String(body.audience || ""),
      person: String(body.who || ""),
    },
  });
  return NextResponse.json({ field, value });
}

async function approveStory(
  body: { pain?: string; audience?: string; who?: string; page?: string; seconds?: number; language?: string },
  product: SavedProduct,
  userId: string,
) {
  const pain = String(body.pain || "").replace(/\s+/g, " ").trim().slice(0, 400);
  const audience = String(body.audience || "").replace(/\s+/g, " ").trim().slice(0, 240);
  const who = String(body.who || "").replace(/\s+/g, " ").trim().slice(0, 120);
  if (!pain || !audience || !who) {
    return NextResponse.json({ error: "Approve a pain point, an audience, and who the story follows." }, { status: 422 });
  }
  const page = await pageText(product, body.page);
  const language: DialogueLanguage = isDialogueLanguage(body.language) ? body.language : "english";
  const story = await writeDramaStory({
    productName: product.name,
    page,
    how: product.useNotes,
    when: product.whenNotes,
    extra: product.extraContext,
    pain,
    audience,
    who,
    seconds: clampTotalDuration(body.seconds, 30),
    language,
  });
  return openFilm(story, product, userId, language, clampTotalDuration(body.seconds, 30));
}

async function openFilm(
  story: { title: string; script: string },
  product: SavedProduct,
  userId: string,
  language: DialogueLanguage,
  seconds: number,
) {
  const script = story.script.trim();
  if (script.length < 40) return NextResponse.json({ error: "The story came back too short." }, { status: 422 });
  if (script.length > 80000) return NextResponse.json({ error: "That story is too long." }, { status: 422 });
  const title = story.title.replace(/\s+/g, " ").trim().slice(0, 80) || "Story";
  const project = await createProject("pixar", "16:9", userId, "setup");
  project.title = title;
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

import { NextResponse } from "next/server";
import { loadOwnedProject } from "@/lib/auth";
import { ensureReferenceSlots, syncReferenceInclusion } from "@/lib/refs";
import { applySavedProduct, clearProductSlot, savedProductFromRow } from "@/lib/saved-products";
import { saveProject } from "@/lib/store";
import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const body = (await request.json().catch(() => ({}))) as { projectId?: string; productId?: string };
  if (!body.projectId || !body.productId) {
    return NextResponse.json({ error: "Missing project or product." }, { status: 400 });
  }
  const loaded = await loadOwnedProject(body.projectId);
  if ("response" in loaded) return loaded.response;
  const { user, project } = loaded;
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("saved_products")
    .select("*")
    .eq("id", body.productId)
    .eq("owner_id", user.id)
    .maybeSingle();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!data) return NextResponse.json({ error: "Product not found." }, { status: 404 });
  const product = savedProductFromRow(data);
  ensureReferenceSlots(project);
  const products = project.references.filter((item) => item.kind === "product");
  const selected = products.find((item) => item.savedProductId === product.id);
  if (selected) {
    clearProductSlot(selected);
  } else {
    const open = products.find((item) => !item.savedProductId && !item.originalPublicPath && !item.originalRemoteUrl);
    if (!open) return NextResponse.json({ error: "You can use up to 3 products." }, { status: 409 });
    applySavedProduct(project, open, product);
  }
  syncReferenceInclusion(project);
  await saveProject(project);
  return NextResponse.json({ project });
}

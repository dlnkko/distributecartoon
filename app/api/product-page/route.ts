import { NextResponse } from "next/server";
import { loadOwnedProject } from "@/lib/auth";
import { ensureReferenceSlots } from "@/lib/refs";
import { productPageUrl, scrapeProductPage } from "@/lib/product-page";
import { saveProject } from "@/lib/store";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST(request: Request) {
  const body = (await request.json().catch(() => ({}))) as { projectId?: string; slotId?: string; url?: string };
  if (!body.projectId || !body.slotId) {
    return NextResponse.json({ error: "Missing project or product." }, { status: 400 });
  }
  const loaded = await loadOwnedProject(body.projectId);
  if ("response" in loaded) return loaded.response;
  const { project } = loaded;
  ensureReferenceSlots(project);
  const asset = project.references.find((item) => item.id === body.slotId && item.kind === "product");
  if (!asset) return NextResponse.json({ error: "Product not found." }, { status: 404 });

  const url = productPageUrl(String(body.url || ""));
  if (!String(body.url || "").trim()) {
    delete asset.pageUrl;
    delete asset.pageContext;
    await saveProject(project);
    return NextResponse.json({ project });
  }
  if (!url) return NextResponse.json({ error: "Use a public http or https page." }, { status: 422 });
  if (url === asset.pageUrl && asset.pageContext?.trim()) {
    return NextResponse.json({ project });
  }

  try {
    const page = await scrapeProductPage(url);
    asset.pageUrl = url;
    asset.pageContext = page;
    await saveProject(project);
    return NextResponse.json({ project });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Couldn't read that product page." },
      { status: 502 },
    );
  }
}

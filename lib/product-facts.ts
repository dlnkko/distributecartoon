import type { Project } from "./types";

export function productPageBrief(project: Project) {
  const pages = (project.references || []).filter((item) => item.kind === "product" && item.pageContext?.trim());
  if (!pages.length) return "";
  return pages
    .map((item) => {
      const name = productFacts(project, item.label).name || "the product in the photo";
      const where = item.pageUrl ? ` (${item.pageUrl})` : "";
      return `PRODUCT PAGE for ${name}${where}:\n${item.pageContext}`;
    })
    .join("\n\n");
}

export function productUseHint(project: Project, label: string) {
  return productFacts(project, label).use;
}

const PAGE_JUNK =
  /skip to main content|halloween sale|%\s*off|free (?:u\.s\.|gift|shipping)|add to cart|shop now|subscribe|sign in|cookie|^\s*#+\s*$/i;

export function productFacts(project: Project, label: string) {
  const products = (project.references || []).filter((item) => item.kind === "product");
  const match =
    products.find((item) => item.label.trim().toLowerCase() === label.trim().toLowerCase()) ||
    (products.length === 1 ? products[0] : undefined);
  const blocks = pageBlocks(match?.pageContext || "");
  const title = blocks[0] || "";
  const blurb = blocks.find((block, index) => index > 0 && block.length > 70) || "";
  const fromPage = nameFromPage(title, blurb);
  const plain = label.trim();
  const name = fromPage || (plain && !/^product\s*\d+$/i.test(plain) ? plain : "");
  const video = (match?.useVideoNote || "").replace(/\s+/g, " ").trim();
  const seen = (match?.imageNote || "").replace(/\s+/g, " ").trim();
  const pageUse = useFromBlurb(blurb);
  const use = [pageUse, video].filter(Boolean).join(" ");
  return { name, use, seen };
}

export function productUsePhysics(project: Project, label: string) {
  const facts = productFacts(project, label);
  const name = facts.name || "The product in the photo";
  const observed = facts.use ? ` The recorded use says: ${facts.use}` : "";
  const seen = facts.seen ? ` The photo shows: ${facts.seen} If both the product and the package are in the photo, show both. Do not replace one with the other.` : "";
  return `${name} follows real contact. A hand holds it the way the photo shows. It sits on the body, the face, or a surface only where this action places it. The material keeps the shape, color, and stiffness in the photo. Pressed on, it stays stuck. Fitted or closed, it stays seated. It does not float, pass through skin, or turn into another container.${seen}${observed}`;
}

export function productLookBrief(project: Project) {
  const notes = (project.references || []).filter((item) => item.kind === "product" && item.imageNote?.trim());
  if (!notes.length) return "";
  return notes
    .map((item) => {
      const name = productFacts(project, item.label).name || "The product";
      return `PRODUCT PHOTO of ${name}: ${item.imageNote?.trim()}. When this product is on screen, match this description and the attached photo. If both the package and the product are visible, show both. Do not swap them or drop one.`;
    })
    .join("\n\n");
}

export function productUseBrief(project: Project) {
  const notes = (project.references || []).filter((item) => item.kind === "product" && item.useVideoNote?.trim());
  if (!notes.length) return "";
  return notes
    .map((item) => {
      const note = item.useVideoNote?.trim() || "";
      if (!note) return "";
      const name = productFacts(project, item.label).name || "The product";
      return `HOW ${name} IS USED, from the uploaded product video:\n${note}\nWhen this product appears, show this exact use. Do not invent a different way to open it, hold it, or apply it.`;
    })
    .filter(Boolean)
    .join("\n\n");
}

function pageBlocks(page: string) {
  return page
    .split(/\n{2,}/)
    .map((block) => block.replace(/[#>*_]+/g, " ").replace(/\s+/g, " ").trim())
    .filter((block) => block && !PAGE_JUNK.test(block));
}

function nameFromPage(title: string, blurb: string) {
  const composed = composeTitle(title);
  if (!composed) return "";
  const tokens = composed.split(/\s+/).filter((word) => word.length >= 4);
  const phrases = blurb.match(/\b[A-Z][A-Za-z0-9]+(?:\s+[A-Z][A-Za-z0-9]+){0,4}\b/g) || [];
  let best = "";
  let score = 0;
  for (const phrase of phrases) {
    const hit = tokens.filter((token) => phrase.toLowerCase().includes(token.toLowerCase())).length;
    if (hit > score && hit >= Math.min(2, tokens.length)) {
      score = hit;
      best = phrase;
    }
  }
  return best || composed;
}

function composeTitle(title: string) {
  const flat = title.replace(/\s+/g, " ").trim();
  if (!flat) return "";
  const pipe = flat.split(/\s+\|\s+/);
  if (pipe.length >= 2) return joinBrand(pipe[0], pipe[1]);
  const dash = flat.split(/\s+[–—-]\s+/);
  if (dash.length >= 2) return joinBrand(dash[0], dash[1]);
  return flat.slice(0, 80);
}

function joinBrand(product: string, brand: string) {
  const item = product.trim();
  const house = brand.trim().replace(/\s+naturals$/i, "").trim();
  if (!item) return house;
  if (!house || item.toLowerCase().includes(house.toLowerCase())) return item;
  return `${house} ${item}`;
}

function useFromBlurb(blurb: string) {
  const parts = blurb.match(/[^.!?]+[.!?]+/g) || [];
  let out = "";
  for (const part of parts) {
    const sentence = part.replace(/\s+/g, " ").trim();
    if (!sentence || PAGE_JUNK.test(sentence)) continue;
    const next = `${out} ${sentence}`.trim();
    if (next.length > 380 && out) break;
    out = next;
    if (out.split(/[.!?]+/).filter(Boolean).length >= 3) break;
  }
  return out;
}

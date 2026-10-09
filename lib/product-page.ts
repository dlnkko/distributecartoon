import { getSecrets } from "./config";
import type { Project } from "./types";

const BLOCKED_HOST = /^(localhost|127\.|10\.|192\.168\.|172\.(1[6-9]|2\d|3[0-1])\.|169\.254\.|0\.0\.0\.0|\[::1\])|(\.local)$/i;

export function productPageUrl(raw: string) {
  const text = raw.trim();
  if (!text) return "";
  let url: URL;
  try {
    url = new URL(text);
  } catch {
    return "";
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") return "";
  if (url.username || url.password) return "";
  if (BLOCKED_HOST.test(url.hostname)) return "";
  return url.toString();
}

export function condenseProductPage(text: string) {
  const clean = text
    .replace(/!\[[^\]]*]\([^)]*\)/g, " ")
    .replace(/\[([^\]]+)]\([^)]*\)/g, "$1")
    .replace(/\n{3,}/g, "\n\n")
    .replace(/[ \t]{2,}/g, " ")
    .trim();
  return clean.slice(0, 4500);
}

export async function scrapeProductPage(url: string) {
  const key = getSecrets().firecrawlApiKey;
  if (!key) throw new Error("FIRECRAWL_API_KEY is missing.");
  const response = await fetch("https://api.firecrawl.dev/v2/scrape", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      url,
      formats: ["markdown"],
      onlyMainContent: true,
    }),
    signal: AbortSignal.timeout(45_000),
  });
  const json = (await response.json().catch(() => ({}))) as {
    success?: boolean;
    error?: string;
    message?: string;
    data?: { markdown?: string; metadata?: { title?: string; description?: string } };
  };
  if (!response.ok || json.success === false) {
    throw new Error(json.error || json.message || "Couldn't read that product page.");
  }
  const title = String(json.data?.metadata?.title || "").trim();
  const description = String(json.data?.metadata?.description || "").trim();
  const markdown = String(json.data?.markdown || "").trim();
  const page = condenseProductPage([title, description, markdown].filter(Boolean).join("\n\n"));
  if (!page) throw new Error("That page had no readable text.");
  return page;
}

export function productPageBrief(project: Project) {
  const pages = (project.references || []).filter((item) => item.kind === "product" && item.pageContext?.trim());
  if (!pages.length) return "";
  return pages
    .map((item) => {
      const name = item.label.trim() || "Product";
      const where = item.pageUrl ? ` (${item.pageUrl})` : "";
      return `PRODUCT PAGE for ${name}${where}:\n${item.pageContext}`;
    })
    .join("\n\n");
}

export function productUseHint(project: Project, label: string) {
  const pages = (project.references || []).filter((item) => item.kind === "product" && item.pageContext?.trim());
  const match =
    pages.find((item) => item.label.trim().toLowerCase() === label.trim().toLowerCase()) ||
    (pages.length === 1 ? pages[0] : undefined);
  if (!match?.pageContext) return "";
  return match.pageContext.replace(/\s+/g, " ").trim().slice(0, 500);
}

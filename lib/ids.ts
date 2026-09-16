export function createId(prefix = "id") {
  return `${prefix}_${crypto.randomUUID().slice(0, 8)}`;
}

export function slugify(value: string) {
  const slug = value
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return slug || "character";
}

export function clampClipDuration(seconds: unknown, fallback = 8) {
  const value = Math.round(Number(seconds));
  if (!Number.isFinite(value)) return fallback;
  return Math.min(30, Math.max(4, value));
}

export function clampTotalDuration(seconds: unknown, fallback = 15) {
  const value = Math.round(Number(seconds));
  if (!Number.isFinite(value)) return fallback;
  return Math.min(300, Math.max(5, value));
}

export function normalizeAspectRatio(value: unknown): "16:9" | "9:16" {
  return value === "9:16" ? "9:16" : "16:9";
}

export function nowIso() {
  return new Date().toISOString();
}

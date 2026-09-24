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

export const DURATION_CHOICES = [15, 30, 45, 60, 75, 90, 100, 120] as const;

export function clampTotalDuration(seconds: unknown, fallback = 15) {
  const value = Math.round(Number(seconds));
  if (!Number.isFinite(value)) return fallback;
  let best: (typeof DURATION_CHOICES)[number] = DURATION_CHOICES[0];
  let gap = Infinity;
  for (const choice of DURATION_CHOICES) {
    const next = Math.abs(choice - value);
    if (next < gap) {
      gap = next;
      best = choice;
    }
  }
  return best;
}

export function normalizeAspectRatio(value: unknown): "16:9" | "9:16" {
  return value === "9:16" ? "9:16" : "16:9";
}

export function nowIso() {
  return new Date().toISOString();
}

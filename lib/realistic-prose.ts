import type { Project } from "./types";

// Realistic videos describe a person in words unless the user uploaded that person's photo.
// A product, logo, or place photo the user added is still attached. Set this to false to restore generated portraits.
export const REALISTIC_PROSE_CAST = true;

export function realisticProseCast(project: Pick<Project, "style" | "song">) {
  return REALISTIC_PROSE_CAST && project.style === "realistic" && !project.song;
}

// Used only when Gemini does not return cut points. One room only needs the ending.
export const REALISTIC_REFERENCE_FALLBACK_SECONDS = 7;

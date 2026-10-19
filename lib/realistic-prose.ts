import type { Project } from "./types";

// Test switch for realistic videos. Set this to false to restore reference images and @Image tags.
export const REALISTIC_PROSE_CAST = true;

export function realisticProseCast(project: Pick<Project, "style" | "song">) {
  return REALISTIC_PROSE_CAST && project.style === "realistic" && !project.song;
}

// Seedance rejects a reference video of 30 seconds or more. Keep the ending and drop the opening second.
export const REALISTIC_REFERENCE_SECONDS = 29;

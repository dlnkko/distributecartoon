import type { Scene } from "./types";

const DURATION_RE =
  /(?:(?:dura|duración|duration|runtime|length|lasts?|de)\s*)?(\d+(?:\.\d+)?)\s*(?:s|sec|secs|segs?|segundos?|seconds?)\b/i;
const MINUTE_RE = /(\d+(?:\.\d+)?)\s*(?:m|min|mins|minutos?|minutes?)\b/i;

export function parseDurationFromText(text: string): number | undefined {
  if (!text?.trim()) return undefined;
  const seconds = text.match(DURATION_RE);
  if (seconds) {
    const value = Math.round(Number(seconds[1]));
    if (Number.isFinite(value) && value > 0) return Math.min(300, Math.max(5, value));
  }
  const minutes = text.match(MINUTE_RE);
  if (minutes && /min|minuto/i.test(minutes[0])) {
    const value = Math.round(Number(minutes[1]) * 60);
    if (Number.isFinite(value) && value > 0) return Math.min(300, Math.max(5, value));
  }
  return undefined;
}

export function estimateDialogueSeconds(line: string): number {
  const words = (line || "").trim().split(/\s+/).filter(Boolean).length;
  if (!words) return 0;
  const spoken = words / 2.15 + 0.45;
  if (words <= 2) return Math.max(1.8, Math.min(2.8, spoken));
  if (words <= 6) return Math.max(2.2, Math.min(3.6, spoken));
  return Math.min(8, Math.max(2.8, spoken));
}

export function estimateActionSeconds(summary: string): number {
  const words = (summary || "").trim().split(/\s+/).filter(Boolean).length;
  if (!words) return 2.4;
  const simple = words < 14;
  if (simple) return Math.min(3.2, Math.max(2, words * 0.11 + 1.7));
  return Math.min(6, Math.max(2.6, words * 0.13 + 2.1));
}

export function estimateSceneSeconds(scene: Pick<Scene, "summary" | "dialogue">): number {
  const talk = (scene.dialogue || []).reduce((sum, line) => sum + estimateDialogueSeconds(line.line), 0);
  const action = estimateActionSeconds(scene.summary || "");
  if (talk > 0) return Math.round((talk + Math.min(1.6, action * 0.35)) * 10) / 10;
  return Math.round(action * 10) / 10;
}

export function dialogueFloorSeconds(scenes: Array<Pick<Scene, "summary" | "dialogue">>): number {
  return scenes.reduce((sum, scene) => {
    const talk = (scene.dialogue || []).reduce((inner, line) => inner + estimateDialogueSeconds(line.line), 0);
    return sum + talk;
  }, 0);
}

export function scriptHasTimingFromContent(script: string, scenes: Scene[]): boolean {
  if (parseDurationFromText(script)) return true;
  const dialogueWords = scenes
    .flatMap((scene) => scene.dialogue || [])
    .map((line) => line.line)
    .join(" ")
    .trim()
    .split(/\s+/)
    .filter(Boolean).length;
  if (scenes.length >= 3) return true;
  if (dialogueWords >= 12) return true;
  return false;
}

export const SEEDANCE_MAX_SECONDS = 30;

export function estimatedTotalSeconds(scenes: Array<Pick<Scene, "summary" | "dialogue" | "estimatedSeconds">>) {
  return scenes.reduce((sum, scene) => sum + (scene.estimatedSeconds || estimateSceneSeconds(scene)), 0);
}

export function shouldGenerateOneShot(targetSeconds?: number, scenes?: Array<Pick<Scene, "summary" | "dialogue" | "estimatedSeconds">>) {
  const target = Math.round(Number(targetSeconds));
  if (Number.isFinite(target) && target > 0) return target <= SEEDANCE_MAX_SECONDS;
  const estimated = estimatedTotalSeconds(scenes || []);
  return estimated > 0 && estimated <= SEEDANCE_MAX_SECONDS;
}

export function clipDurationForScenes(
  scenes: Scene[],
  requested?: number,
  targetTotal?: number,
  sceneCount = scenes.length,
) {
  const estimated = estimatedTotalSeconds(scenes);
  let duration = requested ?? estimated;
  if (targetTotal && sceneCount > 0 && scenes.length === sceneCount) {
    duration = targetTotal;
  }
  return Math.min(SEEDANCE_MAX_SECONDS, Math.max(4, Math.round(duration || estimated || 8)));
}

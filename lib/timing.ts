import { clampTotalDuration } from "./ids";
import type { Scene } from "./types";

const DURATION_RE =
  /(?:(?:dura|duración|duration|runtime|length|lasts?|de)\s*)?(\d+(?:\.\d+)?)\s*(?:s|sec|secs|segs?|segundos?|seconds?)\b/i;
const MINUTE_RE = /(\d+(?:\.\d+)?)\s*(?:m|min|mins|minutos?|minutes?)\b/i;

export function parseDurationFromText(text: string): number | undefined {
  if (!text?.trim()) return undefined;
  const seconds = text.match(DURATION_RE);
  if (seconds) {
    const value = Math.round(Number(seconds[1]));
    if (Number.isFinite(value) && value > 0) return clampTotalDuration(value);
  }
  const minutes = text.match(MINUTE_RE);
  if (minutes && /min|minuto/i.test(minutes[0])) {
    const value = Math.round(Number(minutes[1]) * 60);
    if (Number.isFinite(value) && value > 0) return clampTotalDuration(value);
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

const EMPTY_SCENE_TEXT = /^(what happens(?: in this scene)?|where this is|n\/a|none|tbd|placeholder|unknown|\.+)?$/i;

export function sceneHasStory(scene: Pick<Scene, "summary" | "dialogue">) {
  const summary = (scene.summary || "").trim();
  if ((scene.dialogue || []).some((line) => Boolean(line.line?.trim()))) return true;
  return Boolean(summary) && !EMPTY_SCENE_TEXT.test(summary);
}

export type SeedancePartPlan = {
  duration: number;
  sceneIndexes: number[];
};

function sceneSpan(seconds: number) {
  const value = Number(seconds);
  if (!Number.isFinite(value) || value <= 0) return 2;
  return Math.min(SEEDANCE_MAX_SECONDS, Math.max(2, Math.round(value * 10) / 10));
}

function generationDurations(target: number) {
  const total = Math.max(4, Math.round(target));
  if (total <= SEEDANCE_MAX_SECONDS) return [total];
  const count = Math.ceil(total / SEEDANCE_MAX_SECONDS);
  const durations = Array.from({ length: count }, () => SEEDANCE_MAX_SECONDS);
  const last = total - SEEDANCE_MAX_SECONDS * (count - 1);
  durations[count - 1] = Math.min(SEEDANCE_MAX_SECONDS, Math.max(4, last));
  return durations;
}

export function packScenesIntoParts(
  scenes: Array<{ index: number; estimatedSeconds: number }>,
  targetSeconds?: number,
): SeedancePartPlan[] {
  const summed = scenes.reduce((sum, scene) => sum + sceneSpan(scene.estimatedSeconds), 0);
  const target = Math.round(Number(targetSeconds)) > 0 ? Math.round(Number(targetSeconds)) : Math.round(summed) || 4;
  const durations = generationDurations(target);
  if (!scenes.length) return durations.map((duration) => ({ duration, sceneIndexes: [] }));
  if (durations.length === 1) return [{ duration: durations[0], sceneIndexes: scenes.map((scene) => scene.index) }];

  const groups: number[][] = durations.map(() => []);
  const usedInPart = durations.map(() => 0);
  let part = 0;
  for (const scene of scenes) {
    const span = sceneSpan(scene.estimatedSeconds);
    while (
      part < durations.length - 1 &&
      groups[part].length > 0 &&
      usedInPart[part] + span > durations[part] + 0.05
    ) {
      part += 1;
    }
    const slot = Math.min(part, durations.length - 1);
    groups[slot].push(scene.index);
    usedInPart[slot] += span;
  }
  for (let index = 1; index < groups.length; index += 1) {
    if (groups[index].length) continue;
    const previous = groups[index - 1];
    if (previous.length < 2) continue;
    const moved = previous.pop();
    if (moved !== undefined) groups[index].unshift(moved);
  }
  return durations
    .map((duration, index) => ({ duration, sceneIndexes: groups[index] }))
    .filter((part) => part.sceneIndexes.length);
}

export function capPartSceneSeconds(
  scenes: Array<{ index: number; estimatedSeconds: number }>,
  parts: SeedancePartPlan[],
) {
  const next = new Map(scenes.map((scene) => [scene.index, sceneSpan(scene.estimatedSeconds)]));
  for (const part of parts) {
    const values = part.sceneIndexes.map((index) => next.get(index) || 2);
    const sum = values.reduce((total, value) => total + value, 0);
    if (sum <= part.duration + 0.05) continue;
    const fitted = scaleEstimatedSeconds(values, part.duration).map((value) => Math.min(part.duration, value));
    let overflow = fitted.reduce((total, value) => total + value, 0) - part.duration;
    for (let position = fitted.length - 1; position >= 0 && overflow > 0.05; position -= 1) {
      const floor = 0.5;
      const room = fitted[position] - floor;
      if (room <= 0) continue;
      const cut = Math.min(room, overflow);
      fitted[position] = Math.round((fitted[position] - cut) * 10) / 10;
      overflow -= cut;
    }
    part.sceneIndexes.forEach((index, position) => {
      next.set(index, fitted[position]);
    });
  }
  return next;
}

export function formatPartPlan(parts: SeedancePartPlan[]) {
  if (parts.length <= 1) return `${parts[0]?.duration || 0}s · one take`;
  return parts.map((part) => `${part.duration}s`).join(" + ");
}

export function seedancePartDurations(totalSeconds: number): number[] {
  return packScenesIntoParts([], totalSeconds).map((part) => part.duration);
}

export function scaleEstimatedSeconds(values: number[], target: number): number[] {
  if (!values.length) return [];
  const total = Math.max(4, Math.round(target));
  const sum = values.reduce((acc, value) => acc + (Number(value) || 0), 0);
  if (sum <= 0) {
    const each = total / values.length;
    let used = 0;
    return values.map((_, index) => {
      if (index === values.length - 1) return Math.max(2, Math.round((total - used) * 10) / 10);
      const next = Math.max(2, Math.round(each * 10) / 10);
      used += next;
      return next;
    });
  }
  const scale = total / sum;
  let used = 0;
  return values.map((value, index) => {
    if (index === values.length - 1) return Math.max(2, Math.round((total - used) * 10) / 10);
    const next = Math.max(2, Math.round((value || 0) * scale * 10) / 10);
    used += next;
    return next;
  });
}

export function sceneIndexesForParts(
  scenes: Array<{ index: number; estimatedSeconds: number }>,
  _parts?: number[],
  targetSeconds?: number,
): number[][] {
  return packScenesIntoParts(scenes, targetSeconds).map((part) => part.sceneIndexes);
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

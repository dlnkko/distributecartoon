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
  const spoken = words / 4 + 0.25;
  if (words <= 8) return Math.max(3, Math.min(5, spoken));
  return Math.min(5, Math.max(3, Math.round(spoken * 10) / 10));
}

export function estimateActionSeconds(summary: string): number {
  const words = (summary || "").trim().split(/\s+/).filter(Boolean).length;
  if (/\b(quick cuts?|rapid cuts?|smash cut|whip pan|flash cut|action cuts?)\b/i.test(summary || "")) return 2;
  if (!words) return 3;
  const simple = words < 14;
  if (simple) return Math.min(5, Math.max(3, words * 0.11 + 2.4));
  return Math.min(5, Math.max(3, words * 0.13 + 2.6));
}

export function sceneSpeechFloor(scene: Pick<Scene, "dialogue">): number {
  const lines = (scene.dialogue || []).filter((line) => line.line?.trim());
  const talk = lines.reduce((sum, line) => sum + estimateDialogueSeconds(line.line), 0);
  if (talk <= 0) return 3;
  return Math.min(SEEDANCE_MAX_SECONDS, Math.max(3, Math.round(talk * 10) / 10));
}

export function estimateSceneSeconds(scene: Pick<Scene, "summary" | "dialogue">): number {
  const lines = (scene.dialogue || []).filter((line) => line.line?.trim());
  if (lines.length) return sceneSpeechFloor(scene);
  return Math.round(estimateActionSeconds(scene.summary || "") * 10) / 10;
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

function distributeScenes(
  scenes: Array<{ index: number; estimatedSeconds: number }>,
  durations: number[],
) {
  const groups: number[][] = durations.map(() => []);
  const count = durations.length;
  if (!scenes.length || !count) return groups;
  if (scenes.length >= count) {
    const base = Math.floor(scenes.length / count);
    let extra = scenes.length % count;
    let cursor = 0;
    for (let part = 0; part < count; part += 1) {
      const take = base + (extra > 0 ? 1 : 0);
      if (extra > 0) extra -= 1;
      for (let step = 0; step < take && cursor < scenes.length; step += 1) {
        groups[part].push(scenes[cursor].index);
        cursor += 1;
      }
    }
  } else {
    scenes.forEach((scene, index) => groups[index].push(scene.index));
    const last = scenes[scenes.length - 1]?.index;
    if (last !== undefined) {
      for (let part = scenes.length; part < count; part += 1) groups[part].push(last);
    }
  }
  const spanOf = new Map(scenes.map((scene) => [scene.index, sceneSpan(scene.estimatedSeconds)]));
  const sumOf = (indexes: number[]) => indexes.reduce((total, index) => total + (spanOf.get(index) || 0), 0);
  for (let part = 0; part < count - 1; part += 1) {
    while (groups[part].length > 1 && sumOf(groups[part]) > durations[part] + 0.05) {
      const moved = groups[part].pop();
      if (moved === undefined) break;
      groups[part + 1].unshift(moved);
    }
  }
  return groups;
}

function fillEmptyGroups(groups: number[][]) {
  let moved = true;
  while (moved) {
    moved = false;
    for (let index = 1; index < groups.length; index += 1) {
      if (groups[index].length) continue;
      let donor = -1;
      let most = 1;
      for (let from = 0; from < index; from += 1) {
        if (groups[from].length > most) {
          most = groups[from].length;
          donor = from;
        }
      }
      if (donor < 0) continue;
      const item = groups[donor].pop();
      if (item === undefined) continue;
      groups[index].unshift(item);
      moved = true;
    }
  }
}

export function packScenesIntoParts(
  scenes: Array<{ index: number; estimatedSeconds: number }>,
  targetSeconds?: number,
  fixedDurations?: number[],
): SeedancePartPlan[] {
  const summed = scenes.reduce((sum, scene) => sum + sceneSpan(scene.estimatedSeconds), 0);
  const target = Math.round(Number(targetSeconds)) > 0 ? Math.round(Number(targetSeconds)) : Math.round(summed) || 4;
  const durations = fixedDurations?.length
    ? fixedDurations.map((value) => Math.min(SEEDANCE_MAX_SECONDS, Math.max(4, Math.round(value))))
    : generationDurations(target);
  if (!scenes.length) return durations.map((duration) => ({ duration, sceneIndexes: [] }));
  if (durations.length === 1) return [{ duration: durations[0], sceneIndexes: scenes.map((scene) => scene.index) }];

  if (!fixedDurations?.length) {
    const groups = distributeScenes(scenes, durations);
    return durations.map((duration, index) => ({ duration, sceneIndexes: groups[index] || [] })).filter((part) => part.sceneIndexes.length);
  }

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
  fillEmptyGroups(groups);
  return durations
    .map((duration, index) => ({ duration, sceneIndexes: groups[index] }))
    .filter((part) => part.sceneIndexes.length);
}

// A timed row cannot shrink, so a 30s bucket that cannot hold the next clock opens another part.
export function spillLockedParts(
  scenes: Array<{ index: number; estimatedSeconds: number; lock?: number }>,
  parts: SeedancePartPlan[],
): SeedancePartPlan[] {
  const meta = new Map(scenes.map((scene) => [scene.index, scene]));
  const next: SeedancePartPlan[] = [];
  for (const part of parts) {
    const indexes = part.sceneIndexes;
    const sum = indexes.reduce((total, index) => total + (meta.get(index)?.estimatedSeconds || 0), 0);
    const locked = indexes.some((index) => (meta.get(index)?.lock || 0) > 0);
    if (!locked || sum <= part.duration + 0.05) {
      next.push(part);
      continue;
    }
    let bucket: number[] = [];
    let used = 0;
    const flush = () => {
      if (!bucket.length) return;
      const bucketSum = bucket.reduce((total, index) => total + (meta.get(index)?.estimatedSeconds || 0), 0);
      next.push({
        duration: Math.min(SEEDANCE_MAX_SECONDS, Math.max(4, Math.round(bucketSum))),
        sceneIndexes: bucket,
      });
      bucket = [];
      used = 0;
    };
    for (const index of indexes) {
      const span = meta.get(index)?.estimatedSeconds || 0;
      if (bucket.length && used + span > SEEDANCE_MAX_SECONDS + 0.05) flush();
      bucket.push(index);
      used += span;
    }
    flush();
  }
  return next;
}

// Fit every part to its own length. Spoken shots absorb extra time; a silent shot stays short.
// A locked shot (an end card the user timed) does not grow or shrink.
export function balancePartSceneSeconds(
  scenes: Array<{ index: number; estimatedSeconds: number; floor?: number; lock?: number }>,
  parts: SeedancePartPlan[],
) {
  const next = new Map<number, number>();
  const meta = new Map(scenes.map((scene) => [scene.index, scene]));
  for (const scene of scenes) {
    const locked = scene.lock && scene.lock > 0 ? Math.min(SEEDANCE_MAX_SECONDS, Math.max(2, scene.lock)) : 0;
    const floor = Math.min(SEEDANCE_MAX_SECONDS, Math.max(2, scene.floor ?? 2));
    const start = locked || Math.max(floor, sceneSpan(scene.estimatedSeconds));
    next.set(scene.index, Math.min(SEEDANCE_MAX_SECONDS, start));
  }
  for (const part of parts) {
    const indexes = part.sceneIndexes;
    const sum = () => indexes.reduce((total, index) => total + (next.get(index) || 0), 0);
    let overflow = sum() - part.duration;
    const shrink = (minFor: (index: number) => number) => {
      for (let position = indexes.length - 1; position >= 0 && overflow > 0.05; position -= 1) {
        const index = indexes[position];
        if ((meta.get(index)?.lock || 0) > 0) continue;
        const current = next.get(index) || 2;
        const room = current - minFor(index);
        if (room <= 0) continue;
        const cut = Math.min(room, overflow);
        next.set(index, Math.round((current - cut) * 10) / 10);
        overflow -= cut;
      }
    };
    shrink((index) => Math.max(2, meta.get(index)?.floor ?? 2));
    shrink(() => 2);
  }
  return next;
}

export function fillPartSceneSeconds(
  scenes: Array<{ index: number; estimatedSeconds: number; lock?: number }>,
  parts: SeedancePartPlan[],
) {
  const next = new Map<number, number>();
  const meta = new Map(scenes.map((scene) => [scene.index, scene]));
  for (const scene of scenes) {
    const locked = scene.lock && scene.lock > 0 ? Math.min(SEEDANCE_MAX_SECONDS, Math.max(2, scene.lock)) : 0;
    next.set(scene.index, locked || sceneSpan(scene.estimatedSeconds));
  }
  for (const part of parts) {
    const indexes = [...new Set(part.sceneIndexes)];
    const sum = () => indexes.reduce((total, index) => total + (next.get(index) || 0), 0);
    let gap = part.duration - sum();
    if (gap <= 0.05) continue;
    const unlocked = indexes.filter((index) => !((meta.get(index)?.lock || 0) > 0));
    const pool = unlocked.length ? unlocked : indexes;
    const weight = pool.reduce((total, index) => total + Math.max(1, next.get(index) || 0), 0);
    let added = 0;
    pool.forEach((index, position) => {
      const current = next.get(index) || 0;
      const share =
        position === pool.length - 1
          ? gap - added
          : Math.round(((gap * Math.max(1, current)) / weight) * 10) / 10;
      const add = Math.max(0, Math.min(Math.max(0, share), SEEDANCE_MAX_SECONDS - current));
      next.set(index, Math.round((current + add) * 10) / 10);
      added += add;
    });
    let rest = part.duration - sum();
    for (const index of pool) {
      if (rest <= 0.05) break;
      const current = next.get(index) || 0;
      const room = SEEDANCE_MAX_SECONDS - current;
      if (room <= 0) continue;
      const add = Math.min(room, rest);
      next.set(index, Math.round((current + add) * 10) / 10);
      rest -= add;
    }
  }
  return next;
}

export function userTimedSeconds(title: string, seconds: number) {
  if (/\d{1,2}:\d{2}\s*(?:to|–|—|-)\s*\d{1,2}:\d{2}/i.test(title) || /end\s*card|tarjeta\s+final/i.test(title)) {
    return seconds > 0 ? seconds : undefined;
  }
  return undefined;
}

export function capPartSceneSeconds(
  scenes: Array<{ index: number; estimatedSeconds: number }>,
  parts: SeedancePartPlan[],
  floors?: Map<number, number>,
) {
  const next = new Map(scenes.map((scene) => [scene.index, sceneSpan(scene.estimatedSeconds)]));
  for (const part of parts) {
    const values = part.sceneIndexes.map((index) => next.get(index) || 2);
    const sum = values.reduce((total, value) => total + value, 0);
    if (sum <= part.duration + 0.05) continue;
    const fitted = values.slice();
    let overflow = sum - part.duration;
    const cutSlack = (floorFor: (index: number) => number) => {
      for (let position = fitted.length - 1; position >= 0 && overflow > 0.05; position -= 1) {
        const floor = floorFor(part.sceneIndexes[position]);
        const room = fitted[position] - floor;
        if (room <= 0) continue;
        const cut = Math.min(room, overflow);
        fitted[position] = Math.round((fitted[position] - cut) * 10) / 10;
        overflow -= cut;
      }
    };
    cutSlack((index) => {
      const floor = floors?.get(index);
      return floor == null ? 2 : Math.min(SEEDANCE_MAX_SECONDS, Math.max(2, floor));
    });
    if (overflow > 0.05) cutSlack(() => 2);
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

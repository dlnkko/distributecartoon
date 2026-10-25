import { clampTotalDuration, createId } from "./ids";
import type { DialogueLine, Scene } from "./types";

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

function clockToSeconds(token: string) {
  const match = token.trim().match(/^(\d{1,2}):(\d{2})$/);
  if (!match) return undefined;
  return Number(match[1]) * 60 + Number(match[2]);
}

function statedSeconds(amount: string, unit: string) {
  const value = Number(amount);
  if (!Number.isFinite(value) || value <= 0) return undefined;
  const seconds = /^(?:m|min|mins|minutes?|minutos?)$/i.test(unit) ? value * 60 : value;
  if (seconds < 8 || seconds > 500) return undefined;
  return clampTotalDuration(seconds);
}

/** The length the script itself asks for. A time inside the story, such as an 8 minute run, does not count. */
export function scriptAskedDuration(text: string): number | undefined {
  if (!text?.trim()) return undefined;
  const ranges = [...text.matchAll(/(\d{1,2}:\d{2})\s*(?:to|–|—|-)\s*(\d{1,2}:\d{2})/gi)];
  if (ranges.length >= 2) {
    let end = 0;
    let counted = 0;
    for (const match of ranges) {
      const start = clockToSeconds(match[1]);
      const stop = clockToSeconds(match[2]);
      if (start == null || stop == null || stop <= start || stop - start > 180) continue;
      counted += 1;
      if (stop > end) end = stop;
    }
    if (counted >= 2 && end >= 8 && end <= 500) return clampTotalDuration(end);
  }

  const labeled = text.match(
    /(?:^|[\n.])\s*(?:duration|duraci[oó]n|runtime|length|total(?:\s+time)?)\s*[:\-–]?\s*(\d+(?:\.\d+)?)\s*(seconds?|secs?|segundos?|s|minutes?|mins?|minutos?|min)\b/i,
  );
  if (labeled) {
    const seconds = statedSeconds(labeled[1], labeled[2]);
    if (seconds) return seconds;
  }

  const shortAd = text.match(/\b(\d+(?:\.\d+)?)\s*s\s+(?:ad|spot|commercial|video|film|short|anuncio|pieza)\b/i);
  if (shortAd) {
    const seconds = statedSeconds(shortAd[1], "s");
    if (seconds) return seconds;
  }

  const named = text.match(
    /\b(\d+(?:\.\d+)?)\s*[- ]?(?:second|sec|segundo)s?\s+(?:ad|spot|commercial|video|film|short|anuncio|pieza)\b|\b(\d+(?:\.\d+)?)\s*[- ]?(?:minute|minuto)s?\s+(?:ad|spot|commercial|video|film|short|anuncio|pieza)\b|\b(?:make (?:it|this)|que dure|video de|spot de|anuncio de|pieza de)\s+(\d+(?:\.\d+)?)\s*[- ]?(seconds?|secs?|segundos?|s|minutes?|mins?|minutos?|min)\b|\b(?:about|around|approx(?:imately)?|roughly|m[aá]s o menos|unos|cerca de|~)\s+(\d+(?:\.\d+)?)\s*(seconds?|secs?|segundos?|minutes?|mins?|minutos?)\b/i,
  );
  if (named) {
    const amount = named[1] || named[2] || named[3] || named[5];
    const unit = named[1] ? "seconds" : named[2] ? "minutes" : named[3] ? named[4] || "seconds" : named[6] || "seconds";
    const seconds = amount ? statedSeconds(amount, unit) : undefined;
    if (seconds) return seconds;
  }

  if (/\b(?:about|around|m[aá]s o menos|que dure|duraci[oó]n|video de|anuncio de|spot de)\s+(?:a|an|un|una|one\s+)?minute and a half\b|\bminuto y medio\b/i.test(text)) {
    return clampTotalDuration(90);
  }
  if (/\b(?:about|around|m[aá]s o menos|que dure|duraci[oó]n|video de|anuncio de|spot de)\s+(?:a|an|un|una|one)\s+minutes?\b/i.test(text)) {
    return clampTotalDuration(60);
  }

  const alone = text.match(/^\s*(\d+(?:\.\d+)?)\s*(seconds?|secs?|segundos?|s|minutes?|mins?|minutos?|min)\s*$/im);
  if (alone) {
    const seconds = statedSeconds(alone[1], alone[2]);
    if (seconds) return seconds;
  }

  const headings = [...text.matchAll(/^\s*(?:scene|escena)\s*\d+[^\n]{0,48}?\b(\d+(?:\.\d+)?)\s*(?:s|sec|secs|seconds)\b/gim)];
  if (headings.length >= 2) {
    const sum = headings.reduce((total, match) => total + Math.round(Number(match[1])), 0);
    if (sum >= 8 && sum <= 500) return clampTotalDuration(sum);
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
    const pool = indexes.filter((index) => !((meta.get(index)?.lock || 0) > 0));
    if (!pool.length) continue;
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

export function clockBeatSeconds(script: string): number[] {
  const rangeRe = /(\d{1,2}:\d{2})\s*(?:to|–|—|-)\s*(\d{1,2}:\d{2})/i;
  const found: number[] = [];
  for (const raw of (script || "").split(/\n/)) {
    const plain = raw.replace(/\|/g, " ").replace(/\*/g, "").replace(/\s+/g, " ").trim();
    const match = plain.match(rangeRe);
    if (!match || plain.indexOf(match[0]) >= 24) continue;
    const start = match[1].split(":").map(Number);
    const end = match[2].split(":").map(Number);
    if (start.length < 2 || end.length < 2) continue;
    const from = start[0] * 60 + start[1];
    const to = end[0] * 60 + end[1];
    if (to <= from || to - from > 180) continue;
    found.push(to - from);
  }
  return found;
}

function roundTenth(value: number) {
  return Math.round(value * 10) / 10;
}

function proseSentences(text: string) {
  const parts = text
    .split(/(?<=[.!?])\s+/)
    .map((part) => part.trim())
    .filter(Boolean);
  return parts.length ? parts : text.trim() ? [text.trim()] : [];
}

function sliceProse(text: string, start: number, end: number, role: "head" | "tail", seconds: number) {
  const sentences = proseSentences(text);
  if (!sentences.length) {
    return role === "head"
      ? `The opening ${seconds}s of this beat play in real time.`
      : `That action already finished in the previous part. Hold the result for ${seconds}s and do not repeat the gesture.`;
  }
  if (sentences.length === 1) {
    const line = sentences[0];
    return role === "head"
      ? `The opening ${seconds}s play in real time. ${line}`
      : `That action already finished in the previous part. Stay in the same place for ${seconds}s and do not repeat the gesture.`;
  }
  const weights = sentences.map((sentence) => Math.max(1, sentence.split(/\s+/).filter(Boolean).length));
  const total = weights.reduce((sum, value) => sum + value, 0);
  let cursor = 0;
  const kept: string[] = [];
  sentences.forEach((sentence, index) => {
    const from = cursor / total;
    const to = (cursor + weights[index]) / total;
    cursor += weights[index];
    const mid = (from + to) / 2;
    if (mid >= start && mid < end) kept.push(sentence);
  });
  const body = (kept.length ? kept : role === "head" ? sentences.slice(0, 1) : sentences.slice(-1)).join(" ");
  return role === "head"
    ? `${body} The rest of this beat continues in the next generation.`
    : `The earlier part of this beat already happened. Now: ${body}`;
}

function sliceDialogue(lines: DialogueLine[], start: number, end: number, role: "head" | "tail") {
  const spoken = lines.filter((line) => line.line?.trim());
  if (!spoken.length) return [];
  if (spoken.length === 1) return role === "head" ? spoken : [];
  const weights = spoken.map((line) => Math.max(1, estimateDialogueSeconds(line.line)));
  const total = weights.reduce((sum, value) => sum + value, 0);
  let cursor = 0;
  return spoken.filter((line, index) => {
    const from = cursor / total;
    const to = (cursor + weights[index]) / total;
    cursor += weights[index];
    const mid = (from + to) / 2;
    return mid >= start && mid < end;
  });
}

function sliceScene(scene: Scene, seconds: number, offset: number, total: number, role: "whole" | "head" | "tail"): Scene {
  if (role === "whole") return { ...scene, estimatedSeconds: seconds, shots: [] };
  const start = offset / total;
  const end = (offset + seconds) / total;
  return {
    ...scene,
    id: role === "head" ? scene.id : createId("scene"),
    title: role === "tail" ? `${scene.title} continued`.slice(0, 90) : scene.title,
    summary: sliceProse(scene.summary || scene.title, start, end, role, seconds),
    dialogue: sliceDialogue(scene.dialogue || [], start, end, role),
    estimatedSeconds: seconds,
    camera: role === "tail" ? (/close/i.test(scene.camera || "") ? "medium shot, eye level" : "close-up, eye level") : scene.camera,
    shots: [],
  };
}

// A generation is at most 30s of consecutive story time. A 15s beat stays 15s.
// The next beat fills the rest of that generation, and a long beat continues in the next one.
export function splitScenesAcrossTakes(scenes: Scene[]): Scene[] {
  const ordered = [...scenes].sort((left, right) => left.index - right.index);
  const out: Scene[] = [];
  let used = 0;
  for (const scene of ordered) {
    let remaining = roundTenth(Math.max(2, scene.estimatedSeconds || 2));
    const total = remaining;
    let offset = 0;
    while (remaining > 0.05) {
      if (used > 0 && SEEDANCE_MAX_SECONDS - used < 2) used = 0;
      const room = roundTenth(SEEDANCE_MAX_SECONDS - used);
      const take = roundTenth(Math.min(remaining, room));
      const role = offset < 0.05 && take >= remaining - 0.05 ? "whole" : offset < 0.05 ? "head" : "tail";
      out.push(sliceScene(scene, take, offset, total, role));
      remaining = roundTenth(remaining - take);
      offset = roundTenth(offset + take);
      used = roundTenth(used + take);
      if (used >= SEEDANCE_MAX_SECONDS - 0.05) used = 0;
    }
  }
  return out.map((scene, index) => ({ ...scene, index: index + 1 }));
}

// Keep each generation as the story timed it. Do not re-deal scenes by count:
// that piles the opening into one clip and leaves the last lines too short to play.
export function fitPartsToBudget(parts: SeedancePartPlan[], target: number): SeedancePartPlan[] {
  const goal = Math.max(4, Math.round(target));
  const next = parts
    .filter((part) => part.sceneIndexes.length)
    .map((part) => ({
      sceneIndexes: [...part.sceneIndexes],
      duration: Math.min(SEEDANCE_MAX_SECONDS, Math.max(4, Math.round(part.duration))),
    }));
  if (!next.length) return generationDurations(goal).map((duration) => ({ duration, sceneIndexes: [] }));
  let drift = goal - next.reduce((sum, part) => sum + part.duration, 0);
  for (let index = next.length - 1; index >= 0 && drift !== 0; index -= 1) {
    const room = drift > 0 ? SEEDANCE_MAX_SECONDS - next[index].duration : next[index].duration - 4;
    if (room <= 0) continue;
    const step = Math.min(room, Math.abs(drift));
    next[index].duration += drift > 0 ? step : -step;
    drift += drift > 0 ? -step : step;
  }
  return next;
}

// The last shot of the last generation carries the close, so it weighs more than a passing cut.
export function holdTheClose(scenes: Array<{ index: number; estimatedSeconds?: number }>, parts: SeedancePartPlan[]) {
  const last = parts[parts.length - 1];
  if (!last?.sceneIndexes.length || last.duration < 8) return;
  const scene = scenes.find((item) => item.index === last.sceneIndexes[last.sceneIndexes.length - 1]);
  if (!scene) return;
  const hold = Math.min(last.duration, Math.max(6, Math.round(last.duration * 0.4)));
  scene.estimatedSeconds = Math.max(scene.estimatedSeconds || 0, hold);
}

export function groupConsecutiveTakes(scenes: Array<{ index: number; estimatedSeconds: number }>): SeedancePartPlan[] {
  const parts: SeedancePartPlan[] = [];
  let sceneIndexes: number[] = [];
  let used = 0;
  const flush = () => {
    if (!sceneIndexes.length) return;
    parts.push({
      duration: Math.min(SEEDANCE_MAX_SECONDS, Math.max(4, Math.round(used))),
      sceneIndexes,
    });
    sceneIndexes = [];
    used = 0;
  };
  for (const scene of scenes) {
    const span = sceneSpan(scene.estimatedSeconds);
    if (sceneIndexes.length && used + span > SEEDANCE_MAX_SECONDS + 0.05) flush();
    sceneIndexes.push(scene.index);
    used += span;
  }
  flush();
  return parts;
}

export function formatPartPlan(parts: SeedancePartPlan[]) {
  if (parts.length <= 1) return `${parts[0]?.duration || 0}s · one take`;
  return parts.map((part) => `${part.duration}s`).join(" + ");
}

export function seedancePartDurations(totalSeconds: number): number[] {
  return packScenesIntoParts([], totalSeconds).map((part) => part.duration);
}

function shareSeconds(total: number, weights: number[]) {
  const sum = weights.reduce((left, right) => left + right, 0);
  const raw = weights.map((weight) => (total * weight) / sum);
  const next = raw.map((value) => Math.floor(value));
  let left = total - next.reduce((acc, value) => acc + value, 0);
  const order = raw
    .map((value, index) => ({ index, frac: value - next[index] }))
    .sort((a, b) => b.frac - a.frac);
  for (const item of order) {
    if (left <= 0) break;
    next[item.index] += 1;
    left -= 1;
  }
  return next;
}

export function dramaAdSpans(totalSeconds: number) {
  const total = Math.max(15, Math.round(totalSeconds || 15));
  const [problem, use, after] = shareSeconds(total, [50, 17, 33]);
  return { total, problem, use, after };
}

export function storyArc(totalSeconds: number) {
  const { total, problem, use, after } = dramaAdSpans(totalSeconds);
  const parts = seedancePartDurations(total);
  const listed = parts.map((duration, index) => `part ${index + 1} (${duration}s)`).join(", ");
  const head = parts.length > 1 ? `The film is ${total} seconds, told in ${listed}.` : `The film is ${total} seconds, in one part.`;
  const moves =
    "Open on the problem already in motion. Do not add a calm introduction before it. A turn inside that problem makes it worse, or shows the cause was not what they thought. Any part may visit more than one place when the story takes them somewhere else. A later minute of the same situation stays in that place, on the same ground. Do not invent a second environment to mark that time. The solution is then used where someone would really use it. After that, the same life is shown improved, for long enough that the change is visible. Do not solve the story in the opening. Do not add a slogan or a health claim.";
  const clock = `Start from about ${problem}s for the problem, including the turn, about ${use}s for the solution being used, and about ${after}s after that so the change has time to land. Bend those lengths when this situation cannot hold them. A product handed over in the middle of an event that is already going keeps the problem as what the camera shows, puts the use inside that event, and lets the rest of the event, going better, be the ending. A story that can pause may use a longer spoken problem and a spoken landing. The ending still gets real time. It is still this story, not a tour of other days.`;
  let where = "";
  if (parts.length <= 1) {
    where = "Those three stretches play in that order, in the one part, unless the use has to happen inside the problem because that is when this product would be used. Each can change place and action when the story needs it.";
  } else if (parts.length === 2) {
    where = "Part 1 carries the problem and the turn. Do not solve it there unless the product would actually arrive during that event. Part 2 is the solution being used, then the change. Do not spend part 2 only on the use, and do not leave the event for a separate testimonial if the change is the rest of that same event. End part 2 on one continuous shot, long enough to see the change. If someone can speak, that shot is where they say what changed. Do not end on a burst of cuts.";
  } else {
    where = `Parts 1 to ${parts.length - 1} carry the problem and the turn. Do not solve it in part 1 unless the product would actually arrive during that event. Part ${parts.length} is the solution being used, then the change. Do not spend that last part only on the use. End that part on one continuous shot, long enough to see the change. If someone can speak, that shot is where they say what changed. Do not end on a burst of cuts.`;
  }
  return `${head} ${moves} ${clock} ${where} This shape is the same for Pixar, claymation, and realistic. The style changes the look of the picture, not the story.`;
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
  const fitted = values.map((value, index) => {
    if (index === values.length - 1) return Math.max(0, Math.round((total - used) * 10) / 10);
    const next = Math.max(0, Math.round((value || 0) * scale * 10) / 10);
    used += next;
    return next;
  });
  let overflow = Math.round((fitted.reduce((acc, value) => acc + value, 0) - total) * 10) / 10;
  for (let index = fitted.length - 1; index >= 0 && overflow > 0.05; index -= 1) {
    const cut = Math.min(fitted[index], overflow);
    fitted[index] = Math.round((fitted[index] - cut) * 10) / 10;
    overflow = Math.round((overflow - cut) * 10) / 10;
  }
  return fitted;
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

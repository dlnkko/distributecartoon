import type { Scene, SceneShot } from "./types";

const ANGLES = [
  "Eye level, medium close-up",
  "High angle, wide shot",
  "Low angle, close-up",
  "Tracking shot, full shot",
  "Dutch angle, medium shot",
  "Eye level, insert",
  "Handheld, medium shot",
  "Worm's eye, close-up",
];

function shotSizes(total: number) {
  const whole = Math.max(2, Math.round(total));
  if (whole <= 3) return [whole];
  const parts: number[] = [];
  let left = whole;
  while (left > 3) {
    const take = left - 3 === 1 ? 2 : 3;
    parts.push(take);
    left -= take;
  }
  if (left > 0) parts.push(left);
  return parts;
}

function sizeOf(camera: string) {
  return camera.match(/wide shot|full shot|medium close-up|medium shot|close-up|insert/i)?.[0].toLowerCase() || "";
}

function camerasFor(first: string, count: number) {
  const start = first.trim() || ANGLES[0];
  const out = [start];
  let cursor = 0;
  while (out.length < count && cursor < ANGLES.length * 3) {
    const next = ANGLES[cursor % ANGLES.length];
    cursor += 1;
    const prev = out[out.length - 1];
    if (sizeOf(prev) && sizeOf(prev) === sizeOf(next)) continue;
    if (out.some((item) => item.toLowerCase() === next.toLowerCase())) continue;
    out.push(next);
  }
  while (out.length < count) out.push(ANGLES[out.length % ANGLES.length]);
  return out;
}

function clauses(text: string) {
  const sentences = text
    .split(/(?<=[.!?])\s+/)
    .map((part) => part.trim())
    .filter(Boolean);
  if (sentences.length > 1) return sentences;
  const bits = text
    .split(/,\s+/)
    .map((part) => part.trim())
    .filter((part) => part.length > 12);
  return bits.length > 1 ? bits : sentences;
}

function actionsFor(summary: string, count: number) {
  const parts = clauses(summary);
  const seed = parts.length ? parts : ["The action continues in the same place."];
  return Array.from({ length: count }, (_, index) => {
    if (index === count - 1 && seed.length > count) {
      return `${seed.slice(index).map((part) => part.replace(/[. ]+$/, "")).join(". ")}.`;
    }
    if (index >= seed.length) return "The same moment continues from a new angle.";
    return `${seed[index].replace(/[. ]+$/, "")}.`;
  });
}

export function planShots(scene: Pick<Scene, "summary" | "camera" | "estimatedSeconds">): SceneShot[] {
  const seconds = Math.max(2, Math.round(scene.estimatedSeconds || 3));
  const sizes = shotSizes(seconds);
  const cameras = camerasFor(scene.camera || "", sizes.length);
  const actions = actionsFor(scene.summary || "", sizes.length);
  return sizes.map((value, index) => ({
    seconds: value,
    camera: cameras[index],
    action: actions[index],
  }));
}

export function ensureSceneShots(scene: Scene): Scene {
  const seconds = Math.max(2, Math.round(Number(scene.estimatedSeconds) || 3));
  const sizes = shotSizes(seconds);
  const seeded = (scene.shots || []).filter((shot) => shot.action?.trim() || shot.camera?.trim());
  const planned = planShots({ summary: scene.summary, camera: scene.camera, estimatedSeconds: seconds });
  const shots = sizes.map((value, index) => {
    const source = seeded[index] || planned[index];
    return {
      seconds: value,
      camera: (source?.camera || planned[index].camera).trim(),
      action: (source?.action || planned[index].action).trim(),
    };
  });
  if (seeded.length > sizes.length) {
    const extra = seeded
      .slice(sizes.length)
      .map((shot) => shot.action.trim())
      .filter(Boolean)
      .join(" ");
    if (extra) shots[shots.length - 1].action = `${shots[shots.length - 1].action} ${extra}`.replace(/\s{2,}/g, " ").trim();
  }
  return {
    ...scene,
    estimatedSeconds: sizes.reduce((sum, value) => sum + value, 0),
    camera: shots[0]?.camera || scene.camera,
    shots,
  };
}

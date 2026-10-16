import type { Scene, SceneShot } from "./types";

function sizeOf(camera: string) {
  return camera.match(/wide shot|full shot|medium close-up|medium shot|close-up|insert/i)?.[0].toLowerCase() || "";
}

export function isFastCut(text: string) {
  return /\b(quick cuts?|rapid cuts?|smash cut|whip pan|flash cut|action cuts?|burst of cuts?)\b/i.test(text);
}

export function cameraHeight(camera: string) {
  return camera.match(/bird'?s eye|worm'?s eye|low angle|high angle|dutch|eye level/i)?.[0].toLowerCase() || "eye level";
}

export function sameCameraPerspective(left: string, right: string) {
  const size = sizeOf(left);
  return Boolean(size) && size === sizeOf(right) && cameraHeight(left) === cameraHeight(right);
}

function cameraNamedIn(text: string) {
  const size = text.match(/\b(extreme wide shot|wide shot|full shot|medium close-up|medium shot|close-up|insert)\b/i)?.[1];
  const height = text.match(/\b(low angle|high angle|eye level|dutch(?: angle)?|bird'?s eye)\b/i)?.[1];
  if (!size && !height) return "";
  return [height || "Eye level", size || "medium shot"].join(", ");
}

function camerasFor(first: string, beats: string[]) {
  const start = first.trim() || "Eye level, medium shot";
  return beats.map((beat) => cameraNamedIn(beat) || start);
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

function isHeldLook(text: string) {
  const clean = text.trim();
  if (!clean) return true;
  if (/\b(walks?|runs?|grabs?|opens?|closes?|hands|inhales?|exhales?|pours?|stands?|sits?|turns?|slams?|signs?|steps?|reaches?|picks?|puts?|sets?|lifts?|pushes?|pulls?|enters?|leaves?|packs?|uncaps?|breathes?|speaks?|says|asks|shouts?|leans?|clicks?|types?|writes?|drags?|lies|alarms?|blares?)\b/i.test(clean)) {
    return false;
  }
  return /\b(looks?|stares?|gazes?|eyes (?:drop|meet|lock|close)|freezes?|frozen|nods?|pauses?|watches?|studies|silence|silent|expression|goes pale)\b/i.test(clean);
}

function storyBeats(summary: string) {
  const parts = clauses(summary);
  const beats: string[] = [];
  for (const part of parts.length ? parts : ["The action continues in the same place."]) {
    const sentence = /[.!?]$/.test(part) ? part : `${part}.`;
    if (isHeldLook(sentence) && beats.length) {
      const lead = beats[beats.length - 1].replace(/[. ]+$/, "");
      beats[beats.length - 1] = `${lead}. During the line, ${sentence.charAt(0).toLowerCase()}${sentence.slice(1)}`;
      continue;
    }
    beats.push(sentence);
  }
  return beats;
}

function shareSeconds(total: number, count: number, minimum: number) {
  const floor = Math.max(1, minimum);
  const safe = Math.max(floor, Math.round(total));
  const room = Math.max(1, Math.floor(safe / floor));
  const used = Math.min(count, room);
  const each = Math.floor(safe / used);
  const values = Array.from({ length: used }, () => each);
  values[values.length - 1] += safe - each * used;
  return values.map((value) => Math.max(floor, value));
}

export function planShots(scene: Pick<Scene, "summary" | "camera" | "estimatedSeconds">): SceneShot[] {
  const fast = isFastCut(`${scene.summary || ""} ${scene.camera || ""}`);
  const seconds = Math.max(1, Math.round(scene.estimatedSeconds || 4));
  const minimum = Math.min(fast ? 2 : 3, seconds);
  const beats = storyBeats(scene.summary || "");
  const onlyLook = beats.length === 1 && isHeldLook(beats[0]);
  const sizes = shareSeconds(onlyLook ? Math.min(5, Math.max(minimum, seconds)) : seconds, beats.length, minimum);
  const cameras = camerasFor(scene.camera || "", beats.slice(0, sizes.length));
  const used = beats.slice(0, sizes.length);
  if (beats.length > used.length) {
    used[used.length - 1] = `${used[used.length - 1].replace(/[. ]+$/, "")}. ${beats.slice(used.length).join(" ")}`;
  }
  return sizes.map((value, index) => ({
    seconds: value,
    camera: cameras[index],
    action: used[index],
  }));
}

export function ensureSceneShots(scene: Scene): Scene {
  const fast = isFastCut(`${scene.summary || ""} ${scene.camera || ""}`);
  const seconds = Math.max(1, Math.round(Number(scene.estimatedSeconds) || 4));
  const minimum = Math.min(fast ? 2 : 3, seconds);
  const seeded = (scene.shots || []).filter((shot) => shot.action?.trim() || shot.camera?.trim());
  const planned = planShots({ summary: scene.summary, camera: scene.camera, estimatedSeconds: seconds });
  const base = seeded.length
    ? seeded.map((shot) => ({
        seconds: Math.max(1, Math.round(shot.seconds || minimum)),
        camera: shot.camera.trim(),
        action: shot.action.trim(),
      }))
    : planned;
  const spoken = (scene.dialogue || []).some((line) => line.line?.trim());
  const shots = base.map((shot) => {
    if (!isHeldLook(shot.action)) return shot;
    if (spoken && base.length === 1) return shot;
    return { ...shot, seconds: Math.min(5, Math.max(minimum, shot.seconds)) };
  });
  let sum = shots.reduce((total, shot) => total + shot.seconds, 0);
  const gap = seconds - sum;
  if (gap > 0 && shots.length) {
    const host = shots.findIndex((shot) => !isHeldLook(shot.action));
    const index = host >= 0 ? host : 0;
    shots[index] = { ...shots[index], seconds: shots[index].seconds + gap };
  } else if (gap < 0) {
    let overflow = -gap;
    for (let index = shots.length - 1; index >= 0 && overflow > 0; index -= 1) {
      const room = shots[index].seconds - 1;
      if (room <= 0) continue;
      const cut = Math.min(room, overflow);
      shots[index] = { ...shots[index], seconds: shots[index].seconds - cut };
      overflow -= cut;
    }
  }
  sum = shots.reduce((total, shot) => total + shot.seconds, 0);
  return {
    ...scene,
    estimatedSeconds: Math.min(seconds, sum || seconds),
    camera: shots[0]?.camera || scene.camera,
    shots: shots.filter((shot) => shot.seconds > 0),
  };
}

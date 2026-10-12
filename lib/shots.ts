import type { Scene, SceneShot } from "./types";

function sentence(text: string) {
  const clean = text.trim();
  if (!clean) return "The action continues.";
  return /[.!?]$/.test(clean) ? clean : `${clean}.`;
}

export function planShots(scene: Pick<Scene, "summary" | "camera" | "estimatedSeconds">): SceneShot[] {
  const seconds = Math.max(2, Math.round(scene.estimatedSeconds || 3));
  return [
    {
      seconds,
      camera: (scene.camera || "").trim(),
      action: sentence(scene.summary || ""),
    },
  ];
}

export function ensureSceneShots(scene: Scene): Scene {
  const seconds = Math.max(2, Math.round(Number(scene.estimatedSeconds) || 3));
  const [shot] = planShots({ summary: scene.summary, camera: scene.camera, estimatedSeconds: seconds });
  return {
    ...scene,
    estimatedSeconds: seconds,
    camera: shot.camera || scene.camera,
    shots: [shot],
  };
}

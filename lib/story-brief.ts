import { createHash } from "node:crypto";
import { getSecrets } from "./config";
import { saveProject } from "./store";
import type { Project } from "./types";

export const STORY_MODEL = "claude-sonnet-5-5";

function scriptKey(project: Project) {
  return createHash("sha256")
    .update(`${project.targetDurationSeconds || 0}\n${project.style}\n${project.scriptText}`)
    .digest("hex")
    .slice(0, 20);
}

function briefText(payload: { content?: Array<{ type?: string; text?: string }> }) {
  return (payload.content || [])
    .filter((block) => block.type === "text" && block.text?.trim())
    .map((block) => block.text?.trim() || "")
    .join("\n")
    .trim();
}

function anthropicHeaders(apiKey: string) {
  const workspaceId = process.env.ANTHROPIC_WORKSPACE_ID?.trim() || "wrkspc_0129j5LedZdN7uikpR2QLKMc";
  return {
    "content-type": "application/json",
    "x-api-key": apiKey,
    "anthropic-version": "2023-06-01",
    "anthropic-workspace-id": workspaceId,
  };
}

async function requestBrief(apiKey: string, project: Project, signal: AbortSignal | undefined, effort: boolean) {
  const script = project.scriptText.slice(0, 40000);
  const response = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    signal,
    headers: anthropicHeaders(apiKey),
    body: JSON.stringify({
      model: STORY_MODEL,
      max_tokens: 16000,
      ...(effort ? { output_config: { effort: "high" } } : {}),
      system: [
        "You are the story editor for a short film. Read the script once and return a directing note in English, under 450 words.",
        "Write the through-line in order: who wants what, and what changes by the end.",
        "For each beat, name the place, who is in frame, how far apart they are, what the body does, and the spoken line when the script has one. A distance the script states stays that distance. A place keeps one name, and a later return to that room uses the same name.",
        "If the script has spoken lines, copy those lines only. Do not write a new line, a voice-over, or a closing speech. Product marketing is not dialogue.",
        "Each later part starts from the consequence of the previous beat.",
        "Do not write camera tags, @Image tags, or a video prompt.",
      ].join(" "),
      messages: [
        {
          role: "user",
          content: `Style: ${project.style}. Target: ${project.targetDurationSeconds || 15} seconds.\n\nSCRIPT:\n${script}`,
        },
      ],
    }),
  });
  const payload = (await response.json().catch(() => null)) as {
    content?: Array<{ type?: string; text?: string }>;
    error?: { message?: string };
  } | null;
  if (!response.ok) {
    const message = payload?.error?.message || `Story reading failed (${response.status}).`;
    const error = new Error(message);
    (error as Error & { status?: number }).status = response.status;
    throw error;
  }
  const text = payload ? briefText(payload) : "";
  if (!text) throw new Error("The story reading came back empty.");
  return text;
}

export async function ensureStoryBrief(project: Project, signal?: AbortSignal) {
  const key = scriptKey(project);
  if (project.storyBrief?.trim() && project.storyBriefKey === key) return project.storyBrief;
  const { claudeApiKey } = getSecrets();
  if (!claudeApiKey) throw new Error("CLAUDE_API_KEY is missing.");
  console.info("story reader", STORY_MODEL);
  let brief = "";
  try {
    brief = await requestBrief(claudeApiKey, project, signal, true);
  } catch (error) {
    const status = error && typeof error === "object" && "status" in error ? Number(error.status) : 0;
    const message = error instanceof Error ? error.message : "";
    if (status !== 400 || !/output_config|effort/i.test(message)) throw error;
    brief = await requestBrief(claudeApiKey, project, signal, false);
  }
  project.storyBrief = brief;
  project.storyBriefKey = key;
  await saveProject(project);
  return brief;
}

function productSceneKey(project: Project) {
  const products = (project.references || [])
    .filter((item) => item.kind === "product")
    .map((item) => `${item.label}|${item.imageNote || ""}|${item.originalRemoteUrl || item.originalPublicPath || ""}`)
    .join("\n");
  const scenes = (project.scenes || [])
    .map((scene) =>
      [
        scene.index,
        scene.title,
        scene.summary,
        ...(scene.shots || []).map((shot) => shot.action),
        ...(scene.dialogue || []).map((line) => line.line),
      ].join("|"),
    )
    .join("\n");
  return createHash("sha256").update(`${products}\n${scenes}`).digest("hex").slice(0, 20);
}

function sceneCard(project: Project) {
  return (project.scenes || [])
    .map((scene) => {
      const shots = (scene.shots || []).map((shot) => shot.action).join(" ");
      const lines = (scene.dialogue || []).map((line) => `${line.speaker}: ${line.line}`).join(" | ");
      return `${scene.index}. ${[scene.title, scene.location, scene.summary, shots, lines].filter(Boolean).join(" ")}`
        .replace(/\s+/g, " ")
        .trim()
        .slice(0, 700);
    })
    .join("\n");
}

function parseShownScenes(text: string) {
  const match = text.match(/\{[\s\S]*\}/);
  if (!match) return [];
  try {
    const payload = JSON.parse(match[0]) as { scenes?: unknown[] };
    return [...new Set((payload.scenes || []).map((item) => Number(item)).filter((item) => Number.isInteger(item) && item > 0))];
  } catch {
    return [];
  }
}

async function requestProductScenes(apiKey: string, project: Project, signal: AbortSignal | undefined, effort: boolean) {
  const products = (project.references || []).filter((item) => item.kind === "product");
  const named = products
    .map((item) => {
      const name = item.label.trim();
      const looks = (item.imageNote || "").replace(/\s+/g, " ").trim().slice(0, 400);
      return looks ? `${name}. Looks like: ${looks}` : name;
    })
    .filter(Boolean)
    .join("\n");
  const response = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    signal,
    headers: anthropicHeaders(apiKey),
    body: JSON.stringify({
      model: STORY_MODEL,
      max_tokens: 800,
      ...(effort ? { output_config: { effort: "high" } } : {}),
      system: [
        "Decide which scenes physically show the attached product in frame.",
        "Count a scene when someone holds it, wears it, applies it, opens it, or it sits where the camera can see it.",
        "The script may call it a strip, tape, pouch, bottle, pack, or another everyday word instead of the brand.",
        "A scene that only talks about it does not count. A line that says it stays out does not count unless that same scene then puts it in frame.",
        'Return JSON only: {"scenes":[2,4]}',
      ].join(" "),
      messages: [{ role: "user", content: `PRODUCT:\n${named}\n\nSCENES:\n${sceneCard(project)}` }],
    }),
  });
  const payload = (await response.json().catch(() => null)) as {
    content?: Array<{ type?: string; text?: string }>;
    error?: { message?: string };
  } | null;
  if (!response.ok) {
    const message = payload?.error?.message || `Product read failed (${response.status}).`;
    const error = new Error(message);
    (error as Error & { status?: number }).status = response.status;
    throw error;
  }
  return parseShownScenes(payload ? briefText(payload) : "");
}

/** Scene indexes where the attached product is in frame, read by Sonnet from the scene action. */
export async function ensureProductScenes(project: Project, signal?: AbortSignal) {
  const key = productSceneKey(project);
  if (project.productShownKey === key && project.productShownIndexes) return project.productShownIndexes;
  const products = (project.references || []).filter(
    (item) => item.kind === "product" && Boolean(item.originalRemoteUrl || item.originalPublicPath),
  );
  if (!products.length || !project.scenes.length) {
    project.productShownIndexes = [];
    project.productShownKey = key;
    return project.productShownIndexes;
  }
  const { claudeApiKey } = getSecrets();
  if (!claudeApiKey) return project.productShownIndexes || [];
  console.info("product scenes", STORY_MODEL);
  let shown: number[] | undefined;
  try {
    shown = await requestProductScenes(claudeApiKey, project, signal, true);
  } catch (error) {
    const status = error && typeof error === "object" && "status" in error ? Number(error.status) : 0;
    const message = error instanceof Error ? error.message : "";
    if (status === 400 && /output_config|effort/i.test(message)) {
      shown = await requestProductScenes(claudeApiKey, project, signal, false);
    } else {
      console.warn("product scenes", project.id, message);
      return project.productShownIndexes || [];
    }
  }
  const known = new Set(project.scenes.map((scene) => scene.index));
  project.productShownIndexes = (shown || []).filter((index) => known.has(index));
  project.productShownKey = key;
  await saveProject(project);
  return project.productShownIndexes;
}

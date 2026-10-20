import { createHash } from "node:crypto";
import { getSecrets } from "./config";
import { isJunkPlace } from "./places";
import { productUnderstandingBrief } from "./product-facts";
import { SONNET_MODEL, sonnetText } from "./sonnet";
import { saveProject } from "./store";
import { storyArc } from "./timing";
import type { Project } from "./types";

export const STORY_MODEL = SONNET_MODEL;

function scriptKey(project: Project) {
  const read = (project.references || [])
    .filter((item) => item.kind === "product")
    .map((item) => item.productRead || "")
    .join("\n");
  return createHash("sha256")
    .update(`${project.targetDurationSeconds || 0}\n${project.style}\n${project.scriptText}\n${read}`)
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
        "Shape that through-line to the target length. Open on the hook already in motion. Do not add a calm introduction before it. The knot makes the conflict harder. The close is the longest movement: the solution is used where someone would really use it, then what follows is shown where it would actually be seen. Any situation that needs another place or another time, in the hook, the knot, or the close, gets its own scene and its own action there. Time can pass. Only a beat that is still the same moment stays in the same place. If the product was already on someone, it stays where it was left, including the next morning, until a scene takes it off. When the moment changes, the clothes change to fit it. Face and hair stay. If the beats are shorter than the target, the missing seconds are the scenes the story still needs: more shots and short lines, until the length is filled. It is still this story, not a tour of unrelated days. Use the time map in the request. Do not solve the story in the opening. Do not add a slogan or a health claim.",
        "This story shape is the same for Pixar, claymation, and realistic. The style changes the look of the picture, not the hook, the knot, the close, or the places.",
        "Any part may move through more than one place, with a different action and a different kind of picture, whenever the story needs it. That is true in the opening, the middle, and the ending. For each beat, name the place, who is in frame, how far apart they are, and what the body does. When the time or the place changes, say so. Reuse one place name every time the story returns there.",
        project.song
          ? "This script is a transcribed song. The lyrics are the picture, in the order they are sung. Do not turn a line into someone singing, mouthing words, or performing. Each beat is the event those words describe, in the place that event would happen. A line that is still the same moment stays in that place. A line that needs another place or another time moves there. When the moment changes, the clothes change. Face and hair stay. Mouths stay closed. The song is the only audio. Do not add spoken lines."
          : "If the script has spoken lines, copy those lines only. Do not write a new line, a voice-over, or a closing speech. Product marketing is not dialogue.",
        "Each later part starts from the consequence of the previous beat.",
        "If the product brief has WHEN IT IS USED, that situation is where the use belongs. Put that action there. Do not move it into a conversation that happens at another time. Do not add a health claim.",
        "Do not write camera tags, @Image tags, or a video prompt.",
      ].join(" "),
      messages: [
        {
          role: "user",
          content: `Style: ${project.style}. Target: ${project.targetDurationSeconds || 15} seconds.\n${storyArc(project.targetDurationSeconds || 15)}\n\n${productBlock(project)}SCRIPT:\n${script}`,
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
    .map((item) => `${item.label}|${item.productRead || ""}|${item.imageNote || ""}|${item.originalRemoteUrl || item.originalPublicPath || ""}`)
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

function productBlock(project: Project) {
  const understood = productUnderstandingBrief(project);
  return understood ? `${understood}\n\n` : "";
}

async function requestProductScenes(apiKey: string, project: Project, signal: AbortSignal | undefined, effort: boolean) {
  const products = (project.references || []).filter((item) => item.kind === "product");
  const named = products
    .map((item) => item.productRead?.trim() || item.imageNote?.trim() || item.label.trim())
    .filter(Boolean)
    .join("\n\n");
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
        "The PRODUCT brief names the object and the other words a script may use for it. Those words are this product.",
        "Count a scene when someone holds it, wears it, applies it, opens it, removes it, or it sits where the camera can see it.",
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

function placeKey(project: Project) {
  const scenes = (project.scenes || []).map((scene) => `${scene.index}|${scene.title || ""}|${scene.summary || ""}`).join("\n");
  return createHash("sha256").update(scenes).digest("hex").slice(0, 20);
}

function parsePlaces(text: string) {
  const match = text.match(/\{[\s\S]*\}/);
  if (!match) return [];
  try {
    const payload = JSON.parse(match[0]) as { places?: Array<{ index?: unknown; place?: unknown }> };
    return (payload.places || [])
      .map((item) => ({ index: Number(item.index), place: String(item.place || "").replace(/\s+/g, " ").trim() }))
      .filter((item) => Number.isInteger(item.index) && item.index > 0);
  } catch {
    return [];
  }
}

/** One physical set per scene, named by Claude from the action. The same set keeps the same name. */
export async function ensureScenePlaces(project: Project, signal?: AbortSignal) {
  if (!project.scenes.length) return;
  const key = placeKey(project);
  if (project.placeReadKey === key) return;
  const { claudeApiKey } = getSecrets();
  if (!claudeApiKey) return;
  console.info("scene places", STORY_MODEL);
  let text = "";
  try {
    text = await sonnetText(
      [
        "Name the physical set the camera is in for every scene.",
        "Read the action. A label left over from an earlier room is wrong once they have left it.",
        "When someone leaves a room, the next scene is the place the action is in now. Name it from what that action shows, not from the room they left.",
        "Reuse one short place name, two or three words, and copy that exact name every time the story is in that same set, including after a time jump.",
        "Do not use a clock, a scene number, or a beat name as the place.",
        "An end card with no room gets an empty place.",
        'Return JSON only: {"places":[{"index":1,"place":"name"}]}',
      ].join(" "),
      `SCENES:\n${sceneCard(project)}`,
      { maxTokens: 2000, signal },
    );
  } catch (error) {
    console.warn("scene places", project.id, error instanceof Error ? error.message : error);
    return;
  }
  const places = parsePlaces(text);
  if (places.length < Math.ceil(project.scenes.length * 0.6)) return;
  const known = new Set(project.scenes.map((scene) => scene.index));
  for (const item of places) {
    if (!known.has(item.index)) continue;
    const scene = project.scenes.find((entry) => entry.index === item.index);
    if (!scene) continue;
    const name = item.place.replace(/^(?:the|a|an)\s+/i, "").slice(0, 48);
    if (!name || isJunkPlace(name)) {
      if (/\bend\s*card\b/i.test(`${scene.title} ${scene.summary}`)) scene.location = "";
      continue;
    }
    scene.location = name;
  }
  project.placeReadKey = key;
  await saveProject(project);
}

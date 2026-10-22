import { createHash } from "node:crypto";
import { getSecrets } from "./config";
import { isJunkPlace, keepsPreviousPlace } from "./places";
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
  const songTake = project.song ? 1000 + Math.floor(Math.random() * 9000) : 0;
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
        "Shape that through-line to the target length. Open on the hook already in motion. Do not add a calm introduction before it. The knot makes the conflict harder. The close is the longest movement: the solution is used where someone would really use it, then what follows is shown where it would actually be seen. A later minute of the same situation stays in the same place, on the same ground, in the hook, the knot, and the close. Time can pass there. A new place is only when they go somewhere else. Do not invent a second environment to mark that time, and do not rename the ground they are already standing on. If the product was already on someone, it stays where it was left, including the next morning, until a scene takes it off. Clothes stay with the place. They change when the place changes. Face and hair stay. If the beats are shorter than the target, the missing seconds are the scenes the story still needs: more shots and short lines, until the length is filled. It is still this story, not a tour of unrelated days. Use the time map in the request. Do not solve the story in the opening. Do not add a slogan or a health claim.",
        "This story shape is the same for Pixar, claymation, and realistic. The style changes the look of the picture, not the hook, the knot, the close, or the places.",
        "A part may move to another place when the story takes them somewhere else, in the opening, the middle, or the ending. A later minute of the same situation stays in the place already named, on the same ground. For each beat, name the place, who is in frame, how far apart they are, and what the body does. Reuse that exact place name while they are still there, and again when the story returns.",
        project.song
          ? `This script is a transcribed song. Take ${songTake}. The lyrics are one story, in the order they are sung. Nobody sings, mouths the words, or performs. Each verse, chorus, bridge, and outro gets its own shots, so the picture keeps moving. The place and the clothes stay until the lyric itself takes them somewhere else. A later minute of the same situation stays in that place, on the same ground. Do not change the room, the ground, or the clothes just because a new section starts. When the story does need another place, that is when the clothes change to fit it. Do not invent a trip just to connect two times. Face and hair stay. Inside a section, a line that names a different action is its own shot. A line that names an object, a place, or a physical action keeps that. A line that only names a feeling or a relationship gets one concrete everyday cause. Take ${songTake} must not use the first obvious cause for those lines, and it must not repeat the cause or the prop a previous take would pick. The place can stay. Another upload of this same lyric has to be able to show a different cause and still be this story. Mouths stay closed. The song is the only audio. Do not add spoken lines.`
          : "If the script already has spoken lines, copy those lines and do not replace them. If it has none, it is not a silent film: the people on screen speak, about one short line every 3 seconds. Someone alone says it out loud, or thinks it so it is heard, in their own voice. The words are what they would say then. They are not a narrator, a slogan, or a claim from the product page.",
        "Each later part starts from the consequence of the previous beat.",
        "If the product brief has WHEN IT IS USED, that situation is where the use belongs. Put that action there. Do not move it into a conversation that happens at another time. Do not add a health claim.",
        "Do not write camera tags, @Image tags, or a video prompt.",
      ].join(" "),
      messages: [
        {
          role: "user",
          content: `Style: ${project.style}. Target: ${project.targetDurationSeconds || 15} seconds.\n${storyArc(project.targetDurationSeconds || 15)}\n${project.song ? `Song take: ${songTake}. Stage each vague line for this take.\n` : ""}\n${productBlock(project)}SCRIPT:\n${script}`,
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
        "A few minutes later, a closer shot, or a different word for the same ground is still that set. Copy the earlier place name. Do not invent a second name for one stretch of ground, and do not turn a ridge and the flat beside it into two environments.",
        "A new name is only when the action goes somewhere else, such as indoors, into a vehicle, or into another building.",
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
  let carried = "";
  for (const scene of project.scenes) {
    const blob = [scene.title, scene.summary, ...(scene.shots || []).map((shot) => shot.action || "")].join(" ");
    if (carried && scene.location && keepsPreviousPlace(blob)) {
      scene.location = carried;
      continue;
    }
    carried = scene.location || "";
  }
  project.placeReadKey = key;
  await saveProject(project);
}

import { SONNET_MODEL, sonnetText } from "./sonnet";
import { cleanPromptSyntax } from "./style";

function sceneBlocks(text: string) {
  const matches = [...text.matchAll(/\bSCENE\s+\d+\s*(?:\([^)\n]*\)|\|\s*Duration:)/gi)];
  if (!matches.length) return [text];
  return matches.map((match, index) => {
    const start = match.index || 0;
    const end = index + 1 < matches.length ? matches[index + 1].index || text.length : text.length;
    return text.slice(start, end);
  });
}

function tagsIn(value: string) {
  return [...value.matchAll(/@(?:Video|Image)\d+/gi)].map((match) => match[0].toLowerCase());
}

function quotedLines(text: string) {
  return [...text.matchAll(/"([^"]+)"/g)].map((match) => match[1]);
}

function sameQuotes(draft: string, revised: string) {
  const left = quotedLines(draft);
  const right = quotedLines(revised);
  if (left.length !== right.length) return false;
  return left.every((line, index) => line === right[index]);
}

function keepDialogueLanguage(draft: string, revised: string) {
  const lead = draft.match(/^The dialogues are in (?:English|Spanish)\./)?.[0] || "";
  if (!lead) return revised;
  const rest = revised.replace(/The dialogues are in (?:English|Spanish)\.?\s*/gi, "").trim();
  return `${lead}\n${rest}`.replace(/[^\S\n]{2,}/g, " ").trim();
}

function tightenPrompt(text: string) {
  const next = text
    .replace(/Use this photo as the set every time the story is here, including when it comes back later\.?/gi, "")
    .replace(/Match (?:its|that photo: same) walls, doors, furniture, and layout\.?/gi, "")
    .replace(/A scene set somewhere else leaves this tag out\.?/gi, "")
    .replace(/Keep the distance the action states, including far apart\.?/gi, "")
    .replace(/No product or package appears in this scene\.?/gi, "")
    .replace(/Speech and action fill all \d+ seconds, from the first frame to the last\. No pause, no frozen look, and no silent tail\.?/gi, "")
    .replace(/Name this tag only in a scene whose action has it in (?:a hand, on a surface, or )?in frame\. Every other scene leaves the tag out\.?/gi, "")
    .replace(/This face stays on this tag\. Do not give it to anyone else\.?/gi, "")
    .replace(/Reference tags stay fixed for the whole film:?/gi, "")
    .replace(/Gaze must not be directed at lens unless explicitly stated\.?/gi, "")
    .replace(/[^\S\n]{2,}/g, " ")
    .replace(/[ \t]+([,.])/g, "$1")
    .trim();
  return cleanPromptSyntax(next);
}

function sameSceneTags(draft: string, revised: string) {
  const left = sceneBlocks(draft);
  const right = sceneBlocks(revised);
  if (left.length !== right.length) return false;
  return left.every((block, index) => {
    const revisedTags = new Set(tagsIn(right[index] || ""));
    return tagsIn(block).every((tag) => revisedTags.has(tag));
  });
}

function continuityLines(text: string) {
  return [...text.matchAll(/Continuity: [^ \n][^\n]*/g)].map((match) => match[0].replace(/\s+/g, " ").trim());
}

export async function refineSeedancePrompt(draft: string, priorPrompt = "", storyBrief = "", seen = "") {
  const trimmed = draft.trim();
  if (!trimmed) return draft;
  const prior = priorPrompt.trim();
  const sight = seen.trim();
  try {
    console.info("seedance prompt model", SONNET_MODEL);
    const instructions = [
      "Revise this Seedance prompt. Return only the prompt. Keep it in this shape: the dialogue-language line, then [GLOBAL SETUP], then [CONTINUITY RULE], then [CHARACTER ROLES & POSITIONS], then [SCENE BREAKDOWN].",
      /@Image\d+/.test(trimmed)
        ? "Each scene stays `SCENE N | Duration: Xs | Shot: ...`, then `- CAMERA:`, then `- ENVIRONMENT:` or `- CONTINUITY:`, then `- ACTION:`, then `- DIALOGUE:`. Dialogue lines sit under DIALOGUE, each as `  - @Image: \"line\"`. Do not put a spoken line on the ACTION line."
        : "Each scene stays `SCENE N | Duration: Xs | Shot: ...`, then `- CAMERA:`, then `- ENVIRONMENT:` or `- CONTINUITY:`, then `- ACTION:`, then `- DIALOGUE:`. Dialogue lines sit under DIALOGUE, each naming the person in words and then the quoted line. Do not put a spoken line on the ACTION line. Do not add an @Image tag.",
      /@Image\d+/.test(trimmed)
        ? "In CHARACTER ROLES & POSITIONS, keep one bullet per character, place, and product already listed. Each bullet is the tag, who it is, and the position already written. Do not invent a person, a vehicle, or a place."
        : "In CHARACTER ROLES & POSITIONS, keep one bullet per character, place, and product already listed. Each bullet keeps the written description and the position. Do not invent a person, a vehicle, or a place. Do not add an @Image tag.",
      "Write visible action. A vague finish becomes the last sip or the last bite, then the hand lowers. A vehicle that pulls away accelerates and drives out of the frame. Name the place already in the draft instead of saying room. Keep positions until the action moves someone.",
      "When these scenes change feeling, add one Tone line under GLOBAL SETUP, using the feeling, the light, and the people this draft already shows.",
      /@Image\d+/.test(trimmed)
        ? "A product image stays only in a scene that already has it. When it sits on a surface the action names, say that tag rests flat on that surface. When a person handles it, it stays in their hands. Leave it out of every other scene. When a scene says the product is still visible after it was used, keep that sentence and its tag."
        : "When the draft describes a product in words, keep that description. Leave the product out of a scene that does not already use it. When a scene says the product is still visible after it was used, keep that sentence.",
      /Clothes have changed/i.test(trimmed)
        ? "Keep the sentence that clothes have changed. Do not put a coat, a bag, or street shoes back on someone who is in bed. Face and hair stay."
        : "",
      /@Image\d+/.test(trimmed)
        ? "Keep every SCENE duration, every @Video and @Image tag already inside that scene, and every quoted line. Leave the language line first. Each character speaks only their own line. A face stays on its tag."
        : "Keep every SCENE duration, every @Video tag already inside that scene, and every quoted line. Leave the language line first. This draft names people in words and has no @Image tag. Do not add one. Keep each person's description as written, including the words 'the same' when they are there.",
      "Each scene is one forward action, then the spoken line. Continue a beat only when the draft says that beat is still going. When the draft says the previous scene already finished, start the next action and do not replay the last gesture.",
      "If the draft includes @Audio1, keep @Audio1 playing from the first frame, with each quoted lyric in its scene. A mouth that sings along matches @Audio1.",
      prior
        ? /short cut of the previous part/i.test(trimmed)
          ? "A previous part prompt is included. The attached video is a short cut of the previous part. It includes every person who speaks, even when they are not in the final seconds. Match each of them. Replay a gesture only when this draft says that beat is still going. Otherwise the previous action is finished and the new lines are the only words. This part may open in a new place."
          : "A previous part prompt is included. This clip is the next slice. The last 5 seconds carry clothes and where people ended up. Replay a gesture only when this draft says that same beat is still going. Otherwise the previous action is finished and the new lines are the only words. This part may open in a new place."
        : "",
      sight
        ? "A sighting of the finished previous video is included. The user's script decides the events. Keep each Continuity sentence word for word in its scene. Those sentences are the clothes, the pose, and the product that are still true. Do not move them. Do not add a tag that is not already in the draft."
        : "",
    ]
      .filter(Boolean)
      .join(" ");
    const reading = storyBrief.trim() ? `STORY READING:\n${storyBrief.trim()}\n\n` : "";
    const sightBlock = sight ? `SEEN IN THE PREVIOUS VIDEO:\n${sight}\n\n` : "";
    const input = prior
      ? `${reading}${sightBlock}PREVIOUS PART PROMPT:\n${prior}\n\nNEXT PART DRAFT:\n${trimmed}`
      : `${reading}${sightBlock}DRAFT:\n${trimmed}`;
    const revised = (await sonnetText(instructions, input, { maxTokens: 8000 })).trim();
    if (!/SCENE\s+1\b/i.test(revised)) return tightenPrompt(trimmed);
    if (/\[GLOBAL SETUP\]/.test(trimmed) && !/\[GLOBAL SETUP\]/.test(revised)) return trimmed;
    if (/\[SCENE BREAKDOWN\]/.test(trimmed) && !/\[SCENE BREAKDOWN\]/.test(revised)) return trimmed;
    if (/\[CHARACTER ROLES & POSITIONS\]/.test(trimmed) && !/\[CHARACTER ROLES & POSITIONS\]/.test(revised)) return trimmed;
    if (/\[CONTINUITY RULE\]/.test(trimmed) && !/\[CONTINUITY RULE\]/.test(revised)) return trimmed;
    if (/\|\s*Duration:/.test(trimmed) && !/\|\s*Duration:/.test(revised)) return trimmed;
    const fieldCount = (value: string, label: string) => [...value.matchAll(new RegExp(`^- ${label}:`, "gim"))].length;
    if (fieldCount(trimmed, "CAMERA") !== fieldCount(revised, "CAMERA")) return trimmed;
    if (fieldCount(trimmed, "ACTION") !== fieldCount(revised, "ACTION")) return trimmed;
    if (fieldCount(trimmed, "DIALOGUE") !== fieldCount(revised, "DIALOGUE")) return trimmed;
    if (!sameQuotes(trimmed, revised)) return trimmed;
    if (!sameSceneTags(trimmed, revised)) return trimmed;
    const draftTags = tagsIn(trimmed);
    const revisedTags = tagsIn(revised);
    if (draftTags.some((tag) => !revisedTags.includes(tag)) || revisedTags.some((tag) => !draftTags.includes(tag))) return trimmed;
    const carried = continuityLines(trimmed);
    const revisedFlat = revised.replace(/\s+/g, " ");
    if (carried.some((line) => !revisedFlat.includes(line))) return tightenPrompt(trimmed);
    if (/last 5 seconds/i.test(trimmed) && !/last 5 seconds/i.test(revised)) return trimmed;
    if (/short cut of the previous part/i.test(trimmed) && !/short cut of the previous part/i.test(revised)) return trimmed;
    if (/seen in @Video\d+/i.test(trimmed) && !/seen in @Video\d+/i.test(revised)) return trimmed;
    if (/Clothes have changed/i.test(trimmed) && !/Clothes have changed/i.test(revised)) return trimmed;
    if (/still visible after it was used/i.test(trimmed) && !/still visible after it was used/i.test(revised)) return trimmed;
    if (!/@Image\d+/.test(trimmed) && /@Image\d+/.test(revised)) return trimmed;
    if (/do not say them again/i.test(trimmed) && !/do not say them again/i.test(revised)) return trimmed;
    if (/@Audio1\b/.test(trimmed) && !/@Audio1\b/.test(revised)) return trimmed;
    if (/@Audio2\b/.test(revised)) return trimmed;
    if (/While @Audio1 plays/i.test(trimmed) && !/While @Audio1 plays/i.test(revised)) return trimmed;
    if (/\bsings along\b/i.test(trimmed) && !/\bsings along\b/i.test(revised)) return tightenPrompt(trimmed);
    return keepDialogueLanguage(trimmed, tightenPrompt(revised));
  } catch (error) {
    console.warn("astra prompt revise failed", error instanceof Error ? error.message : error);
    return tightenPrompt(trimmed);
  }
}

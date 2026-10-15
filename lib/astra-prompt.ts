import { SONNET_MODEL, sonnetText } from "./sonnet";

function sceneBlocks(text: string) {
  const matches = [...text.matchAll(/\bSCENE\s+\d+\s*\(/gi)];
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

function tightenPrompt(text: string) {
  return text
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
    .replace(/\s{2,}/g, " ")
    .replace(/\s+([,.])/g, "$1")
    .trim();
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

export async function refineSeedancePrompt(draft: string, priorPrompt = "", storyBrief = "") {
  const trimmed = draft.trim();
  if (!trimmed) return draft;
  const prior = priorPrompt.trim();
  try {
    console.info("seedance prompt model", SONNET_MODEL);
    const instructions = [
      "Revise this Seedance prompt. Return only the prompt, and make it shorter than the draft.",
      "Keep every SCENE heading, its duration, every @Video and @Image tag already inside that scene, and every quoted line. Do not rename a tag and do not add one.",
      "Each scene is one forward action, then the spoken line. Do not put the line inside the action. Do not add a pause, a frozen look, or a new line.",
      "A place is named once in the header, like @Image4 is the cabin. Inside a scene, cite that tag once. Do not explain how to use the photo, and do not repeat walls, doors, furniture, or layout.",
      "People are standing in that room. Do not describe them as pasted on the photo.",
      "Keep a product tag only in a scene that already has it. Do not write that the product is absent.",
      "The first scene continues the previous ending unless this draft moves them.",
      "If the draft includes @Audio1, keep @Audio1. That is this part's song slice and it plays from the first frame of this video. Keep every 'While @Audio1 plays' cue with the lyric in quotes and the action that follows it. Do not drop a lyric or move it to another scene. Do not add @Audio2. The previous ending is the video reference only: do not regenerate those 5 seconds. Do not add a silent intro, a title card, or spoken dialogue when the draft has none. If a scene says a character sings along or mouths a lyric, keep it: that mouth matches @Audio1 only. Do not add a second voice and do not close that mouth.",
      "If this draft shows the product or an end card, keep those scenes and the product image tag inside the action. Do not turn the tag into a style note, and do not drop it because the previous part left the product out.",
      "Each character speaks only their own line. A face stays on its tag. Do not swap two characters.",
      prior
        ? "A previous part prompt is included. This clip is the next slice, not a replay of the previous ending. The attached video of the last 5 seconds is a continuation reference for the picture only: clothes, hands, and body position. Do not copy its audio. Do not repeat, lipsync, or paraphrase any spoken line from that fragment. If the draft lists lines already said in that reference, keep that list. This part may open in a new place."
        : "",
    ]
      .filter(Boolean)
      .join(" ");
    const reading = storyBrief.trim() ? `STORY READING:\n${storyBrief.trim()}\n\n` : "";
    const input = prior
      ? `${reading}PREVIOUS PART PROMPT:\n${prior}\n\nNEXT PART DRAFT:\n${trimmed}`
      : `${reading}DRAFT:\n${trimmed}`;
    const revised = (await sonnetText(instructions, input, { maxTokens: 8000 })).trim();
    if (!/SCENE\s+1\b/i.test(revised)) return tightenPrompt(trimmed);
    if (!sameQuotes(trimmed, revised)) return trimmed;
    if (!sameSceneTags(trimmed, revised)) return trimmed;
    const draftTags = tagsIn(trimmed);
    const revisedTags = tagsIn(revised);
    if (draftTags.some((tag) => !revisedTags.includes(tag)) || revisedTags.some((tag) => !draftTags.includes(tag))) return trimmed;
    if (/last 5 seconds/i.test(trimmed) && !/last 5 seconds/i.test(revised)) return trimmed;
    if (/do not say them again/i.test(trimmed) && !/do not say them again/i.test(revised)) return trimmed;
    if (/@Audio1\b/.test(trimmed) && !/@Audio1\b/.test(revised)) return trimmed;
    if (/@Audio2\b/.test(revised)) return trimmed;
    if (/While @Audio1 plays/i.test(trimmed) && !/While @Audio1 plays/i.test(revised)) return trimmed;
    if (/\bsings along\b/i.test(trimmed) && !/\bsings along\b/i.test(revised)) return tightenPrompt(trimmed);
    return tightenPrompt(revised);
  } catch (error) {
    console.warn("astra prompt revise failed", error instanceof Error ? error.message : error);
    return tightenPrompt(trimmed);
  }
}

import OpenAI from "openai";
import { getSecrets, TEXT_MODEL } from "./config";

function quotedLines(text: string) {
  return [...text.matchAll(/"([^"]+)"/g)].map((match) => match[1]);
}

function sameQuotes(draft: string, revised: string) {
  const left = quotedLines(draft);
  const right = quotedLines(revised);
  if (left.length !== right.length) return false;
  return left.every((line, index) => line === right[index]);
}

export async function refineSeedancePrompt(draft: string, priorPrompt = "") {
  const trimmed = draft.trim();
  if (!trimmed) return draft;
  const prior = priorPrompt.trim();
  const { openaiApiKey } = getSecrets();
  if (!openaiApiKey) return trimmed;
  try {
    const client = new OpenAI({ apiKey: openaiApiKey });
    console.info("seedance prompt model", TEXT_MODEL);
    const response = await client.responses.create({
      model: TEXT_MODEL,
      reasoning: { effort: "medium" },
      instructions: [
        "Revise this Seedance video prompt. Return only the prompt. Do not add a physics essay or explain what tags mean.",
        "Keep every SCENE heading, its duration, every @Video and @Image tag, and every quoted line. Do not rename a tag and do not add one. A character written as @Video stays @Video. A character written as @Image stays @Image.",
        "If the draft includes @Audio1, keep @Audio1. That is this part's song slice and it plays from the first frame of this video. Keep every 'While @Audio1 plays' cue with the lyric in quotes and the action that follows it. Do not drop a lyric or move it to another scene. Do not add @Audio2. The previous ending is the video reference only: do not regenerate those 5 seconds. Do not add a silent intro, a title card, or spoken dialogue when the draft has none. If a scene says a character sings along or mouths a lyric, keep it: that mouth matches @Audio1 only. Do not add a second voice and do not close that mouth.",
        "Each scene is one action and one camera move. If one scene walks through many places, you may not merge them; leave the scene breaks. A line starts in the first second of its scene. Do not add a silent look, a freeze, or people staring before or after a line. Do not leave more than 2 seconds where nobody speaks and nothing moves.",
        "Do not add the product to a scene that does not already show it. Problem scenes stay without the product. Keep the camera and the place already written.",
        "Name which way a screen or object faces the camera. Each character speaks only their own line.",
        "Before any gaze, state the camera position relative to the look target. Do not leave two competing face directions. If the eyes are not on the lens, say eyes NOT on camera. On an emotional close-up keep: gaze must not be directed at lens unless explicitly stated.",
        prior
          ? "A previous part prompt is included. This clip is the next slice, not a replay of the previous ending. Do not regenerate the last 5 seconds. The video tagged as those 5 seconds is a reference so the cut is not abrupt. Use it for the clothes, anything in their hands, and a body change that still applies. This part may open in a new place."
          : "",
      ]
        .filter(Boolean)
        .join(" "),
      input: prior ? `PREVIOUS PART PROMPT:\n${prior}\n\nNEXT PART DRAFT:\n${trimmed}` : trimmed,
    });
    const revised = (response.output_text || "").trim();
    if (!/SCENE\s+1\b/i.test(revised)) return trimmed;
    if (!sameQuotes(trimmed, revised)) return trimmed;
    const tagsIn = (value: string) => [...value.matchAll(/@(?:Video|Image)\d+/gi)].map((match) => match[0].toLowerCase());
    const draftTags = tagsIn(trimmed);
    const revisedTags = tagsIn(revised);
    if (draftTags.some((tag) => !revisedTags.includes(tag)) || revisedTags.some((tag) => !draftTags.includes(tag))) return trimmed;
    if (/last 5 seconds/i.test(trimmed) && !/last 5 seconds/i.test(revised)) return trimmed;
    if (/@Audio1\b/.test(trimmed) && !/@Audio1\b/.test(revised)) return trimmed;
    if (/@Audio2\b/.test(revised)) return trimmed;
    if (/While @Audio1 plays/i.test(trimmed) && !/While @Audio1 plays/i.test(revised)) return trimmed;
    if (/\bsings along\b/i.test(trimmed) && !/\bsings along\b/i.test(revised)) return trimmed;
    return revised;
  } catch (error) {
    console.warn("astra prompt revise failed", error instanceof Error ? error.message : error);
    return trimmed;
  }
}

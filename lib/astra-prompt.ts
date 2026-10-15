import OpenAI from "openai";
import { getSecrets, TEXT_MODEL, TEXT_REASONING } from "./config";

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

function sameSceneTags(draft: string, revised: string) {
  const left = sceneBlocks(draft);
  const right = sceneBlocks(revised);
  if (left.length !== right.length) return false;
  return left.every((block, index) => {
    const revisedTags = new Set(tagsIn(right[index] || ""));
    return tagsIn(block).every((tag) => revisedTags.has(tag));
  });
}

export async function refineSeedancePrompt(draft: string, priorPrompt = "") {
  const trimmed = draft.trim();
  if (!trimmed) return draft;
  const prior = priorPrompt.trim();
  const { openaiApiKey } = getSecrets();
  if (!openaiApiKey) return trimmed;
  try {
    const client = new OpenAI({ apiKey: openaiApiKey });
    console.info("seedance prompt model", TEXT_MODEL, TEXT_REASONING);
    const instructions = [
      "First understand this part as a film. Who is in the scene, where they stand, how far apart they are, what they want, and what changes by the last frame. Then revise the Seedance prompt from that reading. Return only the prompt.",
      "Keep every SCENE heading, its duration, every @Video and @Image tag already inside that scene, and every quoted line. Do not rename a tag and do not add one. A character written as @Video stays @Video. A character written as @Image stays @Image.",
      "Each SCENE (Ns) stays busy for all N seconds. The line and the physical action start together and finish together. After the last word the body finishes the gesture in that same second. Continue the story action through the last frame: the step, the reach, the turn, the reaction. Do not add a pause, a frozen look, a silent tail, or a new quoted line.",
      "Write the space. Say who is left, right, near, far, in front, and behind. If the draft says they are far, across the room, down the hall, or small in frame, keep a wide shot and that distance.",
      "Write the performance in the action: breath, hands, weight, and eyes on the person they address.",
      "A location image is the set. In a scene that happens in that place, the walls, doors, furniture, and layout match that image, and the scene names that tag. A scene set somewhere else leaves that tag out.",
      "Keep the product and the logo only in a scene that already has them in a hand, on a surface, or in frame. Every other scene leaves out the product, the package, the box, the brand, and its tag. When the product is on screen, match the photo exactly: the product itself and its package, same shape, color, print, and material. Do not show only the box.",
      "Watching this part after the previous one should read as one drama. The first scene starts from the previous ending's place, distance, and body, unless this draft moves them.",
      "Each scene is one action and one camera move. If one scene walks through many places, leave the scene breaks.",
      "If the draft includes @Audio1, keep @Audio1. That is this part's song slice and it plays from the first frame of this video. Keep every 'While @Audio1 plays' cue with the lyric in quotes and the action that follows it. Do not drop a lyric or move it to another scene. Do not add @Audio2. The previous ending is the video reference only: do not regenerate those 5 seconds. Do not add a silent intro, a title card, or spoken dialogue when the draft has none. If a scene says a character sings along or mouths a lyric, keep it: that mouth matches @Audio1 only. Do not add a second voice and do not close that mouth.",
      "If this draft shows the product or an end card, keep those scenes and the product image tag inside the action. Do not turn the tag into a style note, and do not drop it because the previous part left the product out.",
      "Each character speaks only their own line. A face stays on the tag named at the start. Do not swap two characters.",
      "Before any gaze, state the camera position relative to the look target. Do not leave two competing face directions. If the eyes are not on the lens, say eyes NOT on camera. On an emotional close-up keep: gaze must not be directed at lens unless explicitly stated.",
      prior
        ? "A previous part prompt is included. This clip is the next slice, not a replay of the previous ending. The attached video of the last 5 seconds is a continuation reference for the picture only: clothes, hands, and body position. Do not copy its audio. Do not repeat, lipsync, or paraphrase any spoken line from that fragment. If the draft lists lines already said in that reference, keep that list. This part may open in a new place."
        : "",
    ]
      .filter(Boolean)
      .join(" ");
    const input = prior ? `PREVIOUS PART PROMPT:\n${prior}\n\nNEXT PART DRAFT:\n${trimmed}` : trimmed;
    const timeout = new AbortController();
    const timer = setTimeout(() => timeout.abort(), 45_000);
    let response;
    try {
      response = await client.responses.create(
        {
          model: TEXT_MODEL,
          reasoning: { effort: TEXT_REASONING },
          instructions,
          input,
        },
        { signal: timeout.signal },
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (timeout.signal.aborted || !/effort|reasoning/i.test(message)) throw error;
      response = await client.responses.create({
        model: TEXT_MODEL,
        reasoning: { effort: "medium" },
        instructions,
        input,
      });
    } finally {
      clearTimeout(timer);
    }
    const revised = (response.output_text || "").trim();
    if (!/SCENE\s+1\b/i.test(revised)) return trimmed;
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
    if (/\bsings along\b/i.test(trimmed) && !/\bsings along\b/i.test(revised)) return trimmed;
    return revised;
  } catch (error) {
    console.warn("astra prompt revise failed", error instanceof Error ? error.message : error);
    return trimmed;
  }
}

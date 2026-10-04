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
  const realistic = /realistic live-action/i.test(trimmed);
  const hasVideoRef = /@Video\d+\b/.test(trimmed);
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
        realistic
          ? "This is realistic live-action. Keep every person's appearance sentence word for word. Do not write @Video in front of a name. A video tag is only @Video1, @Video2, and so on, and only when the draft already has that tag. The first part has no previous video, so it must not mention @Video at all. On a later part, only a person the draft already calls seen in @Video1 was in that video. A person described without that tag is new: keep that first-appearance description and do not move them into @Video1."
          : "Keep every SCENE heading, its duration, every @Video and @Image tag, and every quoted line. Speaking characters stay @Video. Silent characters, places, and products stay @Image.",
        realistic
          ? "Keep every SCENE heading, its duration, every Active state line, every @Image tag, and every quoted line. Keep each 'Name - State X | clothing | face | hair' line word for word, and keep 'Name in State X' inside the scene. Keep every 'MUST NOT resemble' line and every 'From SCENE' transition. If a scene says 'No background music or dialogue.', leave it and do not add a spoken line. If a scene gives a character a quoted line, keep that speaker and that line. Keep the door, solid-object, and eyeline lines. Two characters never share a face."
          : "",
        realistic
          ? "If the draft includes @Audio1, keep @Audio1. Do not add @Audio2. Do not add a silent intro, a title card, or a spoken line when the draft has none. Do not mention a 5 second tail or a cut of the previous video."
          : "If the draft includes @Audio1, keep @Audio1. That is this part's song slice and it plays from the first frame of this video. Keep every 'While @Audio1 plays' cue with the lyric in quotes and the action that follows it. Do not drop a lyric or move it to another scene. Do not add @Audio2. The previous ending is the video reference only: do not regenerate those 5 seconds. Do not add a silent intro, a title card, or spoken dialogue when the draft has none. If a scene says a character sings along or mouths a lyric, keep it: that mouth matches @Audio1 only. Do not add a second voice and do not close that mouth.",
        "Each scene is one action and one camera move. If one scene walks through many places, you may not merge them; leave the scene breaks.",
        "Do not add the product to a scene that does not already show it. Problem scenes stay without the product. Keep the camera and the place already written.",
        "Name which way a screen or object faces the camera. Each character speaks only their own line.",
        "Before any gaze, state the camera position relative to the look target. Do not leave two competing face directions. If the eyes are not on the lens, say eyes NOT on camera. On an emotional close-up keep: gaze must not be directed at lens unless explicitly stated.",
        prior && realistic
          ? "The previous part prompt is context for who already exists. Copy the same appearance words for anyone named there. Anyone absent from that previous prompt is new in this part: keep their first-appearance description and do not say they are seen in @Video1."
          : prior
            ? "A previous part prompt is included. This clip is the next slice, not a replay of the previous ending. Do not regenerate the last 5 seconds. The video tagged as those 5 seconds is a reference so the cut is not abrupt. Use it for the clothes, anything in their hands, and a body change that still applies. This part may open in a new place."
            : "",
      ]
        .filter(Boolean)
        .join(" "),
      input: prior ? `PREVIOUS PART PROMPT:\n${prior}\n\nNEXT PART DRAFT:\n${trimmed}` : trimmed,
    });
    let revised = (response.output_text || "").trim();
    if (realistic) revised = revised.replace(/@Video(?!\d)\s*/g, "");
    if (realistic && !hasVideoRef) revised = revised.replace(/@Video\d+\b/g, "");
    if (realistic && /\bState [A-Z]\b/.test(trimmed) && !/\bState [A-Z]\b/.test(revised)) return trimmed;
    if (realistic && /MUST NOT resemble/i.test(trimmed) && !/MUST NOT resemble/i.test(revised)) return trimmed;
    if (realistic && /\bActive:/.test(trimmed) && !/\bActive:/.test(revised)) return trimmed;
    if (!/SCENE\s+1\b/i.test(revised)) return trimmed;
    if (!sameQuotes(trimmed, revised)) return trimmed;
    if (/@Video\d|@Image\d/.test(trimmed) && !/@Video\d|@Image\d/.test(revised)) return trimmed;
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

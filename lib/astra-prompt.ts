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
        "Keep every SCENE heading, its duration, every @Video and @Image tag, and every quoted line. Speaking characters stay @Video. Silent characters, places, and products stay @Image.",
        "Each scene is one action and one camera move. If one scene walks through many places, you may not merge them; leave the scene breaks.",
        "Name which way a screen or object faces the camera. Each character speaks only their own line.",
        "Before any gaze, state the camera position relative to the look target. Do not leave two competing face directions. If the eyes are not on the lens, say eyes NOT on camera. On an emotional close-up keep: gaze must not be directed at lens unless explicitly stated.",
        prior
          ? "A previous part prompt is included. Continue from its last moment. Do not restart the story or repeat a finished action. The video tagged as the last 5 seconds is the end of that previous part. Use it for the clothes, anything in their hands, and a body change that still applies. This part may open in a new place."
          : "",
      ]
        .filter(Boolean)
        .join(" "),
      input: prior ? `PREVIOUS PART PROMPT:\n${prior}\n\nNEXT PART DRAFT:\n${trimmed}` : trimmed,
    });
    const revised = (response.output_text || "").trim();
    if (!/SCENE\s+1\b/i.test(revised)) return trimmed;
    if (!sameQuotes(trimmed, revised)) return trimmed;
    if (/@Video\d|@Image\d/.test(trimmed) && !/@Video\d|@Image\d/.test(revised)) return trimmed;
    if (/last 5 seconds/i.test(trimmed) && !/last 5 seconds/i.test(revised)) return trimmed;
    return revised;
  } catch (error) {
    console.warn("astra prompt revise failed", error instanceof Error ? error.message : error);
    return trimmed;
  }
}

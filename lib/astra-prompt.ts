import OpenAI from "openai";
import { getSecrets } from "./config";

const ASTRA_MODEL = "gpt-6-sol";

function quotedLines(text: string) {
  return [...text.matchAll(/"([^"]+)"/g)].map((match) => match[1]);
}

function sameQuotes(draft: string, revised: string) {
  const left = quotedLines(draft);
  const right = quotedLines(revised);
  if (left.length !== right.length) return false;
  return left.every((line, index) => line === right[index]);
}

export async function refineSeedancePrompt(draft: string) {
  const trimmed = draft.trim();
  if (!trimmed) return draft;
  const { openaiApiKey } = getSecrets();
  if (!openaiApiKey) return trimmed;
  try {
    const client = new OpenAI({ apiKey: openaiApiKey });
    const response = await client.responses.create({
      model: ASTRA_MODEL,
      reasoning: { effort: "medium" },
      instructions: [
        "Revise this Seedance video prompt. Return only the prompt. Do not add a physics essay or explain what tags mean.",
        "Keep every SCENE heading, its duration, every @Video and @Image tag, and every quoted line. Speaking characters stay @Video. Silent characters, places, and products stay @Image.",
        "Each scene is one action and one camera move. If one scene walks through many places, you may not merge them; leave the scene breaks.",
        "Name which way a screen or object faces the camera. Each character speaks only their own line.",
      ].join(" "),
      input: trimmed,
    });
    const revised = (response.output_text || "").trim();
    if (!/SCENE\s+1\b/i.test(revised)) return trimmed;
    if (!sameQuotes(trimmed, revised)) return trimmed;
    if (/@Video\d|@Image\d/.test(trimmed) && !/@Video\d|@Image\d/.test(revised)) return trimmed;
    return revised;
  } catch (error) {
    console.warn("astra prompt revise failed", error instanceof Error ? error.message : error);
    return trimmed;
  }
}

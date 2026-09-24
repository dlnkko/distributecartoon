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
        "Revise this Seedance video prompt. Return only the prompt.",
        "Keep every SCENE heading, its duration, every @Video and @Image tag, every quoted line, and the closing physics paragraph.",
        "Each character keeps the same height, build, face, and features unless that shot already says the story changes them.",
        "Each character speaks only their own quoted line. Never move a line to another character and never repeat a line.",
        "Fix actions that break real objects. Plates slide onto a barbell sleeve and the collar locks them. A treadmill belt moves under the feet while the runner stays on the deck.",
        "Each shot continues the previous shot. Keep a day-to-night change or a flashback only when the action already says so.",
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

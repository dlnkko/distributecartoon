import { getSecrets } from "./config";
import { clampTotalDuration } from "./ids";
import { sonnetText } from "./sonnet";
import type { DialogueLanguage } from "./types";

const GEMINI_MODEL = "gemini-3.8-flash";

export type DramaBrief = {
  pain: string;
  audience: string;
  person: string;
};

export type DramaBeat = "problem" | "turn" | "solution";

export type DramaSceneSlot = {
  beat: DramaBeat;
  seconds: number;
};

const BEAT_LABEL: Record<DramaBeat, string> = {
  problem: "problem, already happening, no product yet",
  turn: "the turn: the trouble gets worse, or the cause is not what they thought. Still no product",
  solution: "the product is the solution. They use it, then the result shows",
};

export function dramaScenePlan(seconds: number) {
  const total = clampTotalDuration(seconds, 15);
  const solution = Math.max(4, Math.round(total * 0.25));
  const turn = Math.max(4, Math.round(total * 0.2));
  const problem = total - solution - turn;
  const scenes = [
    ...splitBeat("problem", problem),
    ...splitBeat("turn", turn),
    ...splitBeat("solution", solution),
  ];
  return { total, scenes };
}

function splitBeat(beat: DramaBeat, budget: number): DramaSceneSlot[] {
  if (budget <= 8) return [{ beat, seconds: budget }];
  const scenes: DramaSceneSlot[] = [];
  let left = budget;
  while (left > 8) {
    scenes.push({ beat, seconds: 6 });
    left -= 6;
  }
  if (left >= 4) scenes.push({ beat, seconds: left });
  else if (scenes.length) scenes[scenes.length - 1].seconds += left;
  return scenes;
}

export async function proposeDramaBrief(input: {
  productName: string;
  page: string;
  how: string;
  when: string;
  extra: string;
  language: DialogueLanguage;
}): Promise<DramaBrief> {
  const language = input.language === "spanish" ? "Spanish" : "English";
  const prompt = [
    "Read this product page and fill three fields for a drama ad. Do not write the story, the scenes, or any dialogue.",
    `Write the three fields in ${language}.`,
    "pain: the sharpest problem a real customer already has, in one or two sentences. No slogan and no claim the page does not make.",
    "audience: who the page is for, specific, one sentence.",
    "person: one ordinary person from that audience the film can follow. A role and a situation, not a famous name. Under 20 words.",
    "Reply as JSON with keys pain, audience, and person. Nothing else.",
    `Product name: ${input.productName || "the product"}`,
    input.how.trim() ? `HOW IT IS USED:\n${input.how.trim()}` : "",
    input.when.trim() ? `WHEN IT IS USED:\n${input.when.trim()}` : "",
    input.extra.trim() ? `ADDITIONAL CONTEXT:\n${input.extra.trim()}` : "",
    `PRODUCT PAGE:\n${input.page.trim() || "No page text. Use only the notes above. Do not invent a use."}`,
  ]
    .filter(Boolean)
    .join("\n\n");
  const text = await geminiText(prompt);
  const parsed = parseBrief(text);
  if (!parsed.pain || !parsed.audience || !parsed.person) throw new Error("The page didn't suggest a pain point and an audience.");
  return parsed;
}

function parseBrief(text: string): DramaBrief {
  const fenced = text.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "").trim();
  const start = fenced.indexOf("{");
  const end = fenced.lastIndexOf("}");
  const slice = start >= 0 && end > start ? fenced.slice(start, end + 1) : fenced;
  let raw: { pain?: unknown; audience?: unknown; person?: unknown } = {};
  try {
    raw = JSON.parse(slice) as { pain?: unknown; audience?: unknown; person?: unknown };
  } catch {
    raw = {};
  }
  return {
    pain: clip(raw.pain, 400),
    audience: clip(raw.audience, 240),
    person: clip(raw.person, 120),
  };
}

function clip(value: unknown, max: number) {
  return String(value || "").replace(/\s+/g, " ").trim().slice(0, max);
}

async function geminiText(prompt: string) {
  const key = getSecrets().geminiApiKey;
  if (!key) throw new Error("GEMINI_API_KEY is missing.");
  const ask = async (json: boolean) => {
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${encodeURIComponent(key)}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        signal: AbortSignal.timeout(55_000),
        body: JSON.stringify({
          contents: [{ role: "user", parts: [{ text: prompt }] }],
          generationConfig: {
            temperature: 0.2,
            maxOutputTokens: 800,
            ...(json ? { responseMimeType: "application/json" } : {}),
          },
        }),
      },
    );
    const body = (await response.json().catch(() => ({}))) as {
      error?: { message?: string };
      candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
    };
    if (!response.ok) {
      const error = new Error(body.error?.message || "Couldn't read that page.");
      (error as Error & { status?: number }).status = response.status;
      throw error;
    }
    return (body.candidates || [])
      .flatMap((candidate) => candidate.content?.parts || [])
      .map((part) => part.text || "")
      .join("\n")
      .trim();
  };
  let text = "";
  try {
    text = await ask(true);
  } catch (error) {
    const status = error && typeof error === "object" && "status" in error ? Number(error.status) : 0;
    if (status !== 400) throw error;
    text = await ask(false);
  }
  if (!text) throw new Error("Couldn't read that page.");
  return text;
}

export async function writeDramaStory(input: {
  productName: string;
  page: string;
  how: string;
  when: string;
  extra: string;
  pain: string;
  audience: string;
  who: string;
  seconds: number;
  language: DialogueLanguage;
}) {
  const plan = dramaScenePlan(input.seconds);
  const outline = plan.scenes
    .map((slot, index) => `SCENE ${index + 1} (${slot.seconds}s) — ${BEAT_LABEL[slot.beat]}`)
    .join("\n");
  const language = input.language === "spanish" ? "Spanish" : "English";
  const system = [
    "You write a short drama ad as a screenplay. The trouble comes first. A turn makes it sharper. The product is the solution, and it arrives only at the end.",
    `Write the action and every spoken line in ${language}. Keep the SCENE headings in English exactly as given, including the seconds.`,
    "The seconds on the headings already add up to the film. Do not add, drop, merge, or renumber a scene. Do not change a second count.",
    "Each scene is one place and one action, in present tense. One or two people. Name them and keep those names.",
    "Most problem scenes and turn scenes have one short spoken line. A line is what that person would say then, in quotes, under their name. Leave a scene silent when the picture is the point. The solution has a line when they use the product, and may have one line when the result lands.",
    "Do not write a slogan, a narrator, or a line read off the product page. Do not invent a dose, a mechanism, or a health claim that the page does not state. Show the product used the way the page says it is used.",
    "Start the reply with TITLE: and a short title. Then the scenes. Nothing else.",
  ].join(" ");
  const user = [
    `Product name: ${input.productName || "the product"}`,
    input.pain.trim()
      ? `The problem to use: ${input.pain.trim()}`
      : "No problem was chosen. Pick the sharpest real problem on the page.",
    input.audience.trim() ? `This ad is for: ${input.audience.trim()}` : "",
    input.who.trim()
      ? `Follow this person: ${input.who.trim()}`
      : "No person was named. Follow one ordinary person this problem actually hits.",
    input.how.trim() ? `HOW IT IS USED:\n${input.how.trim()}` : "",
    input.when.trim() ? `WHEN IT IS USED:\n${input.when.trim()}` : "",
    input.extra.trim() ? `ADDITIONAL CONTEXT:\n${input.extra.trim()}` : "",
    `PRODUCT PAGE:\n${input.page.trim() || "No page text. Use only the notes above. Do not invent a use."}`,
    `Write these scenes, in this order, for a ${plan.total} second film:\n${outline}`,
  ]
    .filter(Boolean)
    .join("\n\n");
  const text = await sonnetText(system, user, { maxTokens: 16000 });
  const title = (text.match(/^TITLE:\s*(.+)$/im)?.[1] || input.productName || "Story").replace(/\s+/g, " ").trim().slice(0, 80);
  const script = text.replace(/^TITLE:.*(?:\r?\n)+/i, "").trim();
  if (!/(?:^|\n)\s*SCENE\s+1\b/i.test(script)) throw new Error("The story came back without scenes.");
  return { title: title || "Story", script, seconds: plan.total };
}

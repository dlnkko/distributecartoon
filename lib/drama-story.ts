import { getSecrets } from "./config";
import { sonnetText } from "./sonnet";
import { dramaAdSpans } from "./timing";
import type { DialogueLanguage } from "./types";

const GEMINI_MODEL = "gemini-3.8-flash";

export type DramaBrief = {
  pain: string;
  audience: string;
  person: string;
};

export type DramaBeat = "problem" | "turn" | "use" | "after";

export type DramaSceneSlot = {
  beat: DramaBeat;
  seconds: number;
};

const BEAT_LABEL: Record<DramaBeat, string> = {
  problem: "the problem, already happening. Show it in the body and the situation. A line only if someone in this moment could speak, in words specific to this pain. No product yet",
  turn: "the turn: it gets worse, or the cause is not what they thought. Show that. A line only if this moment can hold one. Still no product",
  use: "the product arrives the way this situation would hand it over, and they use it the way a person would. One line only if someone here would speak",
  after: "this same situation going better, long enough to see the change. If someone can talk, they say what changed in the words this moment would use. Not a slogan",
};

export function dramaScenePlan(seconds: number) {
  const { total, problem, use, after } = dramaAdSpans(seconds);
  const turn = Math.max(4, Math.round(problem * 0.3));
  const lead = problem - turn;
  const scenes =
    lead >= 4
      ? [...splitBeat("problem", lead), ...splitBeat("turn", turn), ...splitBeat("use", use), ...splitBeat("after", after)]
      : [...splitBeat("problem", problem), ...splitBeat("use", use), ...splitBeat("after", after)];
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
    "audience: who the page is for, specific, one sentence. If the page does not name them, use the narrowest real customer that page is speaking to.",
    "person: one ordinary person from that audience the film can follow. A role and a situation, not a famous name. Under 20 words.",
    "Always fill pain, audience, and person from the page text. Never leave a field empty.",
    "Reply as JSON with keys pain, audience, and person. Nothing else.",
    briefContext(input),
  ]
    .filter(Boolean)
    .join("\n\n");
  let parsed = parseBrief(await geminiText(prompt, 0.2));
  if (!parsed.pain || !parsed.audience || !parsed.person) {
    parsed = parseBrief(await geminiText(`${prompt}\n\nThe last reply missed a field. Reply with JSON only. pain, audience, and person are all required and non-empty.`, 0.4));
  }
  if (!parsed.pain || !parsed.audience || !parsed.person) throw new Error("Couldn't interpret that saved page. Try again.");
  return parsed;
}

const FIELD_LIMIT = { pain: 400, audience: 240, person: 120 } as const;

export async function varyDramaField(input: {
  productName: string;
  page: string;
  how: string;
  when: string;
  extra: string;
  language: DialogueLanguage;
  field: keyof typeof FIELD_LIMIT;
  current: DramaBrief;
}): Promise<string> {
  const language = input.language === "spanish" ? "Spanish" : "English";
  const ask = input.field === "pain"
    ? "Write a different customer problem the page also supports. Not a paraphrase of the current pain."
    : input.field === "audience"
      ? "Write a different audience the page also speaks to. Not a paraphrase of the current audience."
      : "Write a different ordinary person the film can follow. A different role or a different situation, not the same person in new words. Not a famous name. Under 20 words.";
  const current = input.field === "pain" ? input.current.pain : input.field === "audience" ? input.current.audience : input.current.person;
  const prompt = [
    "Rewrite one field of a drama-ad brief. Do not write the story, the scenes, or any dialogue. Do not rewrite the other fields.",
    `Write the new field in ${language}.`,
    ask,
    "Stay inside what the page actually says. No slogan and no claim the page does not make.",
    `Reply as JSON with one key, value, holding the new ${input.field}. Nothing else.`,
    `Current ${input.field}, which you must not repeat: ${current || "(empty)"}`,
    `Other fields, for context only: pain: ${input.current.pain || "(empty)"} | audience: ${input.current.audience || "(empty)"} | person: ${input.current.person || "(empty)"}`,
    briefContext({ ...input, page: input.page.slice(0, 6000) }),
  ].join("\n\n");
  const limit = FIELD_LIMIT[input.field];
  let value = parseValue(await geminiText(prompt, 0.9, 25_000), limit, input.field);
  if (!value || sameText(value, current)) {
    value = parseValue(
      await geminiText(`${prompt}\n\nThat repeated the current text. Write a different ${input.field}. JSON only: {"value":"..."}`, 1, 20_000),
      limit,
      input.field,
    );
  }
  if (!value || sameText(value, current)) throw new Error("That came back the same. Try the variation again.");
  return value;
}

function briefContext(input: { productName: string; page: string; how: string; when: string; extra: string }) {
  return [
    `Product name: ${input.productName || "the product"}`,
    input.how.trim() ? `HOW IT IS USED:\n${input.how.trim()}` : "",
    input.when.trim() ? `WHEN IT IS USED:\n${input.when.trim()}` : "",
    input.extra.trim() ? `ADDITIONAL CONTEXT:\n${input.extra.trim()}` : "",
    `PRODUCT PAGE:\n${input.page.trim() || "No page text. Use only the notes above. Do not invent a use."}`,
  ]
    .filter(Boolean)
    .join("\n\n");
}

function sameText(left: string, right: string) {
  return left.replace(/\s+/g, " ").trim().toLowerCase() === right.replace(/\s+/g, " ").trim().toLowerCase();
}

function parseValue(text: string, max: number, field: string) {
  const raw = jsonObject(text);
  const picked = clip(raw.value ?? raw[field] ?? raw.person ?? raw.who ?? raw.pain ?? raw.audience, max);
  if (picked) return picked;
  const plain = text.replace(/```[\s\S]*?```/g, " ").replace(/\s+/g, " ").trim();
  if (!plain || plain.includes("{") || plain.length > max) return "";
  return plain;
}

function parseBrief(text: string): DramaBrief {
  const raw = jsonObject(text);
  return {
    pain: clip(raw.pain ?? raw.pain_point ?? raw.painPoint ?? raw.problem, 400),
    audience: clip(raw.audience ?? raw.target_audience ?? raw.targetAudience, 240),
    person: clip(raw.person ?? raw.who ?? raw.character, 120),
  };
}

function jsonObject(text: string) {
  const fenced = text.replace(/```(?:json)?/gi, " ").trim();
  const start = fenced.indexOf("{");
  const end = fenced.lastIndexOf("}");
  const slice = start >= 0 && end > start ? fenced.slice(start, end + 1) : fenced;
  try {
    const parsed = JSON.parse(slice) as Record<string, unknown>;
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

function clip(value: unknown, max: number) {
  if (value && typeof value === "object") {
    const record = value as Record<string, unknown>;
    return clip(record.text ?? record.value ?? record.description, max);
  }
  return String(value || "").replace(/\s+/g, " ").trim().slice(0, max);
}

async function geminiText(prompt: string, temperature: number, timeoutMs = 55_000) {
  const key = getSecrets().geminiApiKey;
  if (!key) throw new Error("GEMINI_API_KEY is missing.");
  const ask = async (json: boolean) => {
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${encodeURIComponent(key)}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        signal: AbortSignal.timeout(timeoutMs),
        body: JSON.stringify({
          contents: [{ role: "user", parts: [{ text: prompt }] }],
          generationConfig: {
            temperature,
            maxOutputTokens: 1200,
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
    "You write a drama ad as a screenplay. The trouble comes first. Decide from this product, this person, and this moment whether the trouble is said, shown, or both. A turn makes it sharper. The product is used as the solution, in the situation where it would actually be used. Then stay with that same situation long enough to see it go better.",
    `Write the action and every spoken line in ${language}. Keep the SCENE headings in English exactly as given, including the seconds.`,
    "The seconds on the headings already add up to the film. Do not add, drop, merge, or renumber a scene. Do not change a second count.",
    "Each scene is one place and one action, in present tense. Name the people and keep those names. Two people only when this moment would actually have two people.",
    "The viewer has to recognize the pain. Use the picture when speech would break the moment, and a line when someone there could say it. The words are specific to this pain, this audience, and this situation. Do not use a vague complaint that could fit any product. Do not stop the action for a confession. A silent scene is right when the body is doing the telling. In the after scenes, stay on the improved situation. If someone can speak, one of them says what changed, in the words that moment would use. That is not an announcer, not a slogan, and not a line copied from the page.",
    "Do not invent a dose, a mechanism, or a health claim the page does not state. Show the product used the way the page says it is used.",
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
  const text = await sonnetText(system, user, { maxTokens: Math.min(32000, 4000 + plan.scenes.length * 220) });
  const title = (text.match(/^TITLE:\s*(.+)$/im)?.[1] || input.productName || "Story").replace(/\s+/g, " ").trim().slice(0, 80);
  const script = text.replace(/^TITLE:.*(?:\r?\n)+/i, "").trim();
  if (!/(?:^|\n)\s*SCENE\s+1\b/i.test(script)) throw new Error("The story came back without scenes.");
  return { title: title || "Story", script, seconds: plan.total };
}

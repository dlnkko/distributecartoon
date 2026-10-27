import type { Project, Scene } from "./types";

export type SeenCard = {
  raw: string;
  people: string;
  place: string;
  clothes: string;
  pose: string;
  product: string;
  carryProduct: boolean;
  carryDetail: string;
  carryClothes: string;
  carryPose: string;
  looks: string;
  outfit: string;
  unseen: string;
};

const EMPTY: SeenCard = {
  raw: "",
  people: "",
  place: "",
  clothes: "",
  pose: "",
  product: "",
  carryProduct: false,
  carryDetail: "",
  carryClothes: "",
  carryPose: "",
  looks: "",
  outfit: "",
  unseen: "",
};

function readLine(raw: string, label: string) {
  const match = raw.match(new RegExp(`^\\s*(?:[-*]\\s*)?(?:\\*\\*)?${label}(?:\\*\\*)?\\s*:\\s*(.+)$`, "im"));
  return (match?.[1] || "").replace(/\*\*/g, "").replace(/\s+/g, " ").trim();
}

export function referenceRanges(raw: string) {
  return fitRangeDurations(readRanges(raw, "CLIPS"));
}

export type VoiceSpan = { name: string; start: number; end: number; partIndex: number };

export function voiceMarks(raw: string) {
  const match = raw.match(/(?:^|\n)\s*VOICES\s*:\s*([^\n]+)/i);
  const line = (match?.[1] || "").trim();
  if (!line || /^(?:none|n\/a|empty|nothing|not applicable)\b/i.test(line)) return [];
  const found: { name: string; start: number; end: number }[] = [];
  for (const pair of line.matchAll(/([A-Za-z][A-Za-z0-9' .-]{0,40}?)\s+(\d+(?:\.\d+)?)\s*-\s*(\d+(?:\.\d+)?)/g)) {
    const name = pair[1].replace(/[,;]+$/, "").trim();
    const start = Number(pair[2]);
    const end = Number(pair[3]);
    if (!name || !Number.isFinite(start) || !Number.isFinite(end) || end - start < 1.5) continue;
    found.push({ name, start, end });
  }
  return found;
}

function sameSpeaker(mark: string, name: string) {
  const left = mark.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
  const right = name.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
  if (!left || !right) return false;
  return left === right || left.endsWith(` ${right}`) || right.endsWith(` ${left}`);
}

export function chooseVoiceSpans(needed: string[], parts: { index: number; voices: string }[]) {
  const newest = [...parts].sort((left, right) => right.index - left.index);
  const chosen: VoiceSpan[] = [];
  for (const name of needed) {
    if (chosen.some((span) => sameSpeaker(span.name, name))) continue;
    for (const part of newest) {
      const mark = voiceMarks(part.voices).find((item) => sameSpeaker(item.name, name));
      if (!mark) continue;
      chosen.push({ name, partIndex: part.index, start: mark.start, end: mark.end });
      break;
    }
  }
  return chosen.map((span) => {
    const length = Math.min(4, Math.max(2, span.end - span.start));
    return { ...span, end: span.start + length };
  });
}

function readRanges(raw: string, label: string) {
  const match = raw.match(new RegExp(`(?:^|\\n)\\s*${label}\\s*:\\s*([^\\n]+)`, "i"));
  const line = (match?.[1] || "").trim();
  if (!line || /^(?:none|n\/a|empty|nothing|not applicable)\b/i.test(line)) return [];
  const found: { start: number; end: number }[] = [];
  for (const pair of line.matchAll(/(\d+(?:\.\d+)?)\s*-\s*(\d+(?:\.\d+)?)/g)) {
    const start = Number(pair[1]);
    const end = Number(pair[2]);
    if (Number.isFinite(start) && Number.isFinite(end) && end - start >= 1.5) found.push({ start, end });
  }
  return found.sort((left, right) => left.start - right.start);
}

function fitRangeDurations(found: { start: number; end: number }[]) {
  const kept: { start: number; end: number }[] = [];
  let cursor = -1;
  for (const range of found) {
    if (range.start < cursor - 0.2) continue;
    const cap = found.length === 1 ? 7 : 3.5;
    const end = Math.min(range.end, range.start + cap);
    if (end - range.start < 2) continue;
    kept.push({ start: range.start, end });
    cursor = end;
    if (kept.length === 4) break;
  }
  const total = kept.reduce((sum, range) => sum + range.end - range.start, 0);
  if (total <= 9) return kept;
  const scale = 9 / total;
  return kept
    .map((range) => {
      const duration = Math.max(2, (range.end - range.start) * scale);
      return { start: range.start, end: range.start + Math.min(duration, range.end - range.start) };
    })
    .filter((range) => range.end - range.start >= 2);
}

function readLooks(raw: string) {
  const match = raw.match(/(?:^|\n)\s*LOOKS\s*:\s*([\s\S]*?)(?=\n\s*[A-Z][A-Z_ ]{2,}\s*:|$)/);
  const value = (match?.[1] || "").replace(/\s+/g, " ").trim();
  if (!value || /^(?:none|n\/a|empty|nothing|not applicable)\b/i.test(value)) return "";
  return value.slice(0, 700);
}

export function usableNote(text: string) {
  const value = text.replace(/\s+/g, " ").trim();
  if (!value) return "";
  if (/^(?:none|n\/a|empty|nothing|not applicable|no change|unchanged)\b/i.test(value)) return "";
  return value.slice(0, 240);
}

function readOutfit(text: string) {
  const value = usableNote(readLine(text, "OUTFIT"));
  if (!value || /^(?:same|unchanged|no change|keep|stays)\b/i.test(value)) return "";
  return value;
}

export function parseSeenCard(raw: string): SeenCard {
  const text = raw.replace(/\r/g, "").trim();
  if (!text) return EMPTY;
  const product = readLine(text, "PRODUCT");
  const unseen = readLine(text, "UNSEEN");
  const declared = readLine(text, "CARRY_PRODUCT");
  const scriptStillHasIt = /product/i.test(unseen) && /script|still|not seen|did not see|couldn't see|could not see/i.test(unseen);
  let carryProduct = false;
  if (/^yes\b/i.test(declared)) carryProduct = true;
  else if (/^no\b/i.test(declared)) carryProduct = scriptStillHasIt;
  else if (scriptStillHasIt) carryProduct = true;
  else if (product && !/\b(?:not in this clip|never shown|no product)\b/i.test(product)) carryProduct = true;
  return {
    raw: text.slice(0, 1500),
    people: readLine(text, "PEOPLE"),
    place: readLine(text, "PLACE"),
    clothes: readLine(text, "CLOTHES"),
    pose: readLine(text, "POSE"),
    product,
    carryProduct,
    carryDetail:
      usableNote(readLine(text, "CARRY_DETAIL")) ||
      (carryProduct && !/\b(?:not seen|not in this clip|did not see|couldn't see|could not see)\b/i.test(product) ? usableNote(product) : ""),
    carryClothes: usableNote(readLine(text, "CARRY_CLOTHES")),
    carryPose: usableNote(readLine(text, "CARRY_POSE")),
    looks: readLooks(text),
    outfit: readOutfit(text),
    unseen,
  };
}

export function seenCardMatters(card: SeenCard) {
  return card.carryProduct || Boolean(card.carryClothes) || Boolean(card.carryPose) || Boolean(card.outfit);
}

const GARMENT =
  /\b(?:hoodie|t-?shirt|tee|shirt|blouse|dress|skirt|jeans|pants|trousers|shorts|jacket|coat|sweater|sweatshirt|cardigan|suit|uniform|scrubs|sneakers?|shoes?|boots?|sandals?|heels?|hat|cap|beanie|scarf|glasses|sunglasses|leggings|sweatpants|joggers|blazer|vest|polo|tank top|crop top)\b/i;

const PRODUCT_RELEASE =
  /\b(?:takes?(?:\s+it|\s+them|\s+the\s+\w+)?\s+off|peels?(?:\s+it|\s+them)?\s+off|removes?|pulls?(?:\s+it|\s+them)?\s+off|throws?(?:\s+it|\s+them)?(?:\s+away|\s+out)|discards?|tosses?|sets?\s+it\s+aside)\b/i;

export function sceneReleasesProduct(text: string) {
  if (!PRODUCT_RELEASE.test(text)) return false;
  if (GARMENT.test(text) && !/\b(?:product|package|box)\b/i.test(text)) return false;
  return true;
}

export function sceneChangesClothes(text: string) {
  if (!GARMENT.test(text)) return false;
  return /\b(?:changes?(?:\s+\w+){0,2}\s+into|changed into|puts?\s+on|takes?\s+off|now wears?|now wearing|switches?\s+(?:to|into)|gets?\s+dressed|changes?\s+clothes)\b/i.test(
    text,
  );
}

export function placeAllowsPose(placeLine: string, location: string) {
  const loc = location.trim().toLowerCase();
  const seen = placeLine.trim().toLowerCase();
  if (!loc) return true;
  if (!seen) return false;
  if (seen.includes(loc) || loc.includes(seen)) return true;
  const skip = new Set(["the", "and", "room", "still", "inside", "later", "night", "with", "from", "into"]);
  const words = loc.split(/[^a-z0-9]+/).filter((word) => word.length >= 3 && !skip.has(word));
  return words.some((word) => seen.includes(word));
}

function sameSceneList(left: number[], right: number[]) {
  return left.length === right.length && left.every((index, place) => index === right[place]);
}

function sceneBlob(scene?: Scene) {
  if (!scene) return "";
  const lines = (scene.dialogue || []).map((line) => line.line || "").join(" ");
  const shots = (scene.shots || []).map((shot) => shot.action || "").join(" ");
  return `${scene.title || ""} ${scene.summary || ""} ${shots} ${lines}`;
}

function sceneHasSomeone(project: Project, scene?: Scene) {
  if (!scene) return false;
  if ((scene.characterNames || []).length || (scene.extraNames || []).length) return true;
  const blob = sceneBlob(scene);
  return project.characters.some((character) => {
    const name = character.name.trim();
    if (!name) return false;
    return new RegExp(`\\b${name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, "i").test(blob);
  });
}

function graphicScene(scene?: Scene) {
  return /\b(on-?screen text|pack\s*shot|packshot|title card|end card|small print|\bsuper\b|caption)\b/i.test(sceneBlob(scene));
}

export function previousSeenCard(project: Project, sceneIndexes: number[]) {
  const current = (project.batches || []).find((batch) => sameSceneList(batch.sceneIndexes || [], sceneIndexes));
  if (!current) return EMPTY;
  const previous = (project.batches || []).find((batch) => batch.index === current.index - 1);
  return parseSeenCard(previous?.seenContinuity || "");
}

export function clothesShouldChange(card: SeenCard, sceneText: string) {
  if (!card.raw && !card.outfit && !card.place && !card.clothes) return false;
  if (card.outfit) return true;
  const inBed = /\b(?:in bed|on the pillows?|under the covers|l(?:ie|ies|ying)\s+(?:on|in|down)|asleep|sleeping)\b/i.test(sceneText);
  const timeShift = /\b(?:next morning|the next day|later that|time change|hours later|that night|the following (?:morning|day|night|week)|days later|weeks later|a week later|months later|the next week|days after|weeks after)\b/i.test(sceneText);
  if (!inBed && !timeShift) return false;
  const seen = `${card.place} ${card.clothes} ${card.carryClothes} ${card.pose}`;
  return !/\b(?:bed|pillow|asleep|sleeping|lying|bedroom)\b/i.test(seen);
}

export function productCarryIndexes(project: Project, sceneIndexes: number[], card: SeenCard) {
  const keep = new Set<number>();
  if (!card.carryProduct) return keep;
  for (const index of sceneIndexes) {
    const scene = project.scenes.find((item) => item.index === index);
    const text = sceneBlob(scene);
    if (sceneReleasesProduct(text)) break;
    if (graphicScene(scene) || !sceneHasSomeone(project, scene)) continue;
    keep.add(index);
  }
  return keep;
}

export function clothesCarryIndexes(project: Project, sceneIndexes: number[], card: SeenCard) {
  const keep = new Set<number>();
  if (!card.carryClothes || card.outfit) return keep;
  for (const index of sceneIndexes) {
    const scene = project.scenes.find((item) => item.index === index);
    const text = sceneBlob(scene);
    if (sceneChangesClothes(text) || clothesShouldChange(card, text)) break;
    if (graphicScene(scene) || !sceneHasSomeone(project, scene)) continue;
    keep.add(index);
  }
  return keep;
}

export function actionGesture(text: string) {
  return /\b(?:peel\w*|tak(?:e|es|ing)\s+off|pull(?:s|ing)?\s+off|remov\w*|stick\w*|put(?:s|ting)\s+on|appl(?:y|ies|ying))\b/i.test(text);
}

export function removalGesture(text: string) {
  return /\b(?:peel\w*|tak(?:e|es|ing)\s+off|pull(?:s|ing)?\s+off|remov\w*)\b/i.test(text);
}

export function poseCarryIndex(project: Project, sceneIndexes: number[], card: SeenCard) {
  if (!card.carryPose) return undefined;
  const index = sceneIndexes[0];
  const scene = project.scenes.find((item) => item.index === index);
  if (!scene || graphicScene(scene)) return undefined;
  if (!placeAllowsPose(card.place, scene.location || "")) return undefined;
  const sceneText = `${scene.title || ""} ${scene.summary || ""}`;
  if (actionGesture(card.carryPose) && !actionGesture(sceneText)) return undefined;
  return index;
}

export function partKeepsCarriedProduct(project: Project, sceneIndexes: number[]) {
  return productCarryIndexes(project, sceneIndexes, previousSeenCard(project, sceneIndexes)).size > 0;
}

export function continuityLine(sentence: string) {
  const clean = sentence
    .replace(/@(?:Image|Video)\d+/gi, "")
    .replace(/\s+/g, " ")
    .replace(/^Continuity:\s*/i, "")
    .trim();
  if (!usableNote(clean)) return "";
  const finished = /[.!?]$/.test(clean) ? clean : `${clean}.`;
  return `Continuity: ${finished}`;
}

export function carriedProductSentence(tag: string, detail: string) {
  const clean = (detail || "")
    .replace(/@(?:Image|Video)\d+/gi, "the product")
    .replace(/\s+/g, " ")
    .replace(/^Continuity:\s*/i, "")
    .trim();
  const swapped = clean ? clean.replace(/\bthe product\b/i, tag) : "";
  const body = swapped.includes(tag) ? swapped : clean ? `${tag} stays in place, matching the photo. ${clean}` : `${tag} stays where the previous part left it, matching the photo`;
  const finished = /[.!?]$/.test(body) ? body : `${body}.`;
  return `Continuity: ${finished}`;
}

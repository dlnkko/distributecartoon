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
  unseen: "",
};

function readLine(raw: string, label: string) {
  const match = raw.match(new RegExp(`^\\s*(?:[-*]\\s*)?(?:\\*\\*)?${label}(?:\\*\\*)?\\s*:\\s*(.+)$`, "im"));
  return (match?.[1] || "").replace(/\*\*/g, "").replace(/\s+/g, " ").trim();
}

export function usableNote(text: string) {
  const value = text.replace(/\s+/g, " ").trim();
  if (!value) return "";
  if (/^(?:none|n\/a|empty|nothing|not applicable|no change|unchanged)\b/i.test(value)) return "";
  return value.slice(0, 240);
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
    unseen,
  };
}

export function seenCardMatters(card: SeenCard) {
  return card.carryProduct || Boolean(card.carryClothes) || Boolean(card.carryPose);
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
  if (!card.carryClothes) return keep;
  for (const index of sceneIndexes) {
    const scene = project.scenes.find((item) => item.index === index);
    const text = sceneBlob(scene);
    if (sceneChangesClothes(text)) break;
    if (graphicScene(scene) || !sceneHasSomeone(project, scene)) continue;
    keep.add(index);
  }
  return keep;
}

export function poseCarryIndex(project: Project, sceneIndexes: number[], card: SeenCard) {
  if (!card.carryPose) return undefined;
  const index = sceneIndexes[0];
  const scene = project.scenes.find((item) => item.index === index);
  if (!scene || graphicScene(scene)) return undefined;
  if (!placeAllowsPose(card.place, scene.location || "")) return undefined;
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

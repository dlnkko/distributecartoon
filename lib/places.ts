const TIME_WORDS =
  /\b(?:(?:at|in|on|during|under|by|before|after)\s+)?(?:the\s+)?(?:golden hour|blue hour|moonlight|midnight|afternoon|morning|evening|sunrise|sunset|twilight|night|dawn|dusk|noon|day|moon|sunny|rainy|rain|foggy|fog|misty|mist|wet|dry|dark|bright)\b/gi;

const GENERIC = new Set([
  "the",
  "a",
  "an",
  "and",
  "with",
  "at",
  "in",
  "on",
  "of",
  "to",
  "by",
  "from",
  "near",
  "next",
  "into",
  "over",
  "under",
  "outside",
  "inside",
  "scene",
  "place",
  "area",
  "view",
  "shot",
  "city",
  "town",
  "street",
  "road",
  "path",
  "way",
  "room",
  "house",
  "building",
  "light",
  "lights",
  "lighting",
  "time",
]);

export function placeLabel(name: string) {
  const stripped = name.replace(TIME_WORDS, " ").replace(/\s+/g, " ").replace(/^[,.\s-]+|[,.\s-]+$/g, "").trim();
  return stripped || name.trim();
}

export function placeTokens(name: string) {
  return placeLabel(name)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .split(" ")
    .filter((token) => token.length >= 3 && !GENERIC.has(token));
}

export function richerPlaceName(current: string, candidate: string) {
  return placeTokens(candidate).length > placeTokens(current).length ? candidate : current;
}

const ROOMS: Array<{ name: string; pattern: RegExp }> = [
  { name: "bedroom", pattern: /\b(?:bedrooms?|in bed|on the bed|the bed|his bed|her bed|their bed|pillow|mattress|sits?\s+up)\b/i },
  { name: "kitchen", pattern: /\b(?:kitchens?|fridge|refrigerator|countertop|the counter)\b/i },
  { name: "bathroom", pattern: /\b(?:bathrooms?|shower|bathtub|toilet)\b/i },
  { name: "office", pattern: /\b(?:offices?|cubicles?)\b/i },
  { name: "living room", pattern: /\b(?:living\s+rooms?|sofa|couch)\b/i },
  { name: "hallway", pattern: /\b(?:hallways?|corridors?)\b/i },
  { name: "car", pattern: /\b(?:in the car|driver'?s seat|steering wheel)\b/i },
  { name: "street", pattern: /\b(?:streets?|sidewalks?|crosswalks?)\b/i },
  { name: "park", pattern: /\bparks?\b/i },
  { name: "cafe", pattern: /\b(?:cafes?|coffee shops?)\b/i },
  { name: "restaurant", pattern: /\brestaurants?\b/i },
  { name: "bar", pattern: /\bbars?\b/i },
  { name: "gym", pattern: /\bgyms?\b/i },
  { name: "store", pattern: /\b(?:stores?|shops?)\b/i },
  { name: "school", pattern: /\b(?:schools?|classrooms?)\b/i },
  { name: "hospital", pattern: /\b(?:hospitals?|clinic)\b/i },
];

export function isJunkPlace(name: string) {
  const clean = placeLabel(name).trim();
  if (!clean) return true;
  if (!/[a-z]{3,}/i.test(clean)) return true;
  if (/^(?:scene|shot|hook|body|pivot|ending|end\s*card)(?:\s+\d+)?$/i.test(clean)) return true;
  return false;
}

export function timeJump(text: string) {
  const trimmed = text.trim();
  return (
    /^\s*(?:morning|night|later|end\s*card)\b/i.test(trimmed) ||
    /\b(?:next morning|the next day|that night|later that night|hours later|the following)\b/i.test(trimmed)
  );
}

const SHORT_LATER =
  /\b(?:a few minutes later|minutes later|moments later|seconds later|a moment later|same spot)\b/i;
const LEFT_FOR_SOMEWHERE =
  /\b(?:arrives?|arrived|enters?|entered|reaches?|reached|walks? into|steps? into|gets? (?:in|into) the|leaves?|left the|now inside|back home|back at the|crosses? into)\b/i;

/** Minutes later on the same ground is not a new set. A real departure is. */
export function keepsPreviousPlace(text: string) {
  return SHORT_LATER.test(text) && !LEFT_FOR_SOMEWHERE.test(text);
}

export function placesInText(text: string) {
  const found: Array<{ name: string; at: number }> = [];
  for (const room of ROOMS) {
    const match = room.pattern.exec(text);
    room.pattern.lastIndex = 0;
    if (match && typeof match.index === "number") found.push({ name: room.name, at: match.index });
  }
  found.sort((left, right) => left.at - right.at);
  const names: string[] = [];
  for (const item of found) {
    if (!names.includes(item.name)) names.push(item.name);
  }
  return names;
}

const FURNISHING: Array<{ name: string; pattern: RegExp }> = [
  { name: "bedroom", pattern: /\b(?:nightstands?|dressers?|pillows?|mattress(?:es)?|headboards?|in bed|on the bed|sits?\s+up)\b/i },
  { name: "kitchen", pattern: /\b(?:kitchens?|sinks?|fridges?|refrigerators?|stoves?|countertops?|the counter)\b/i },
  { name: "bathroom", pattern: /\b(?:bathrooms?|showers?|bathtubs?|toilets?)\b/i },
  { name: "hallway", pattern: /\b(?:hallways?|corridors?)\b/i },
  { name: "living room", pattern: /\b(?:living\s+rooms?|sofas?|couches?)\b/i },
  { name: "office", pattern: /\b(?:offices?|cubicles?)\b/i },
  { name: "car", pattern: /\b(?:in the (?:car|truck|van)|driver['’]?s seats?|passenger seats?|steering wheels?)\b/i },
];

const VAGUE_SET = /^(?:home|house|inside|outside|indoors|outdoors)$/i;
const TIME_LABEL = /^(?:morning|night|later|noon|dawn|dusk|evening|afternoon|\d{1,2}:\d{2}(?:\s*(?:a\.?m\.?|p\.?m\.?))?)$/i;
const LABEL_VERB = /\b(?:is|are|was|were|looks?|stands?|walks?|sits?|runs?|drinks?|says|asks|gets?|buckles?|lowers?|presses?|puts?|peels?|waits?|comes?|follows?|hears?|heard|unbuckles?|stops?|does|do|has|had|can|'s|’s)\b/i;

function withoutOnScreen(text: string) {
  return text.replace(/\b(?:on[\s-]?screen(?:\s+text)?|super|caption)\s*:\s*[^\n]+/gi, " ");
}

/** A short opening sentence with no action verb is a set name written in the script. */
export function explicitSetLabel(text: string) {
  const sentences = withoutOnScreen(text)
    .split(/(?<=[.!?])\s+/)
    .map((part) => part.replace(/[.]+$/, "").trim())
    .filter(Boolean);
  for (const sentence of sentences) {
    if (TIME_LABEL.test(sentence)) continue;
    if (LABEL_VERB.test(sentence)) break;
    const name = sentence.replace(/,?\s*(?:later|earlier|morning|night|noon)$/i, "").trim();
    if (!name || TIME_LABEL.test(name)) continue;
    if (name.split(/\s+/).length > 6) break;
    return name;
  }
  return "";
}

function roomCue(text: string) {
  const source = withoutOnScreen(text);
  let name = "";
  let at = -1;
  for (const item of FURNISHING) {
    const match = item.pattern.exec(source);
    item.pattern.lastIndex = 0;
    if (!match || match.index < at) continue;
    at = match.index;
    name = item.name;
  }
  return name;
}

function leftThePlace(text: string, place: string) {
  if (!place) return false;
  const room = place.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`\\b(?:comes?|steps?|walks?|goes?)\\s+out\\b|\\bleaves?\\s+(?:the\\s+|her\\s+|his\\s+)?${room}\\b`, "i").test(text);
}

export function primaryPlace(text: string, previous = "") {
  const source = withoutOnScreen(text);
  const label = explicitSetLabel(source);
  const cue = roomCue(source);
  if (label && !VAGUE_SET.test(label)) return label;
  if (cue) return cue;
  if (label) return label;
  if (previous && !leftThePlace(source, previous)) return previous;
  return "";
}

export function assignScenePlaces<T extends { title?: string; summary?: string; location?: string; shots?: Array<{ action?: string }> }>(
  scenes: T[],
) {
  const textOf = (scene: T) => [scene.summary, scene.title, ...(scene.shots || []).map((shot) => shot.action || "")].join(" ");
  let previous = "";
  for (const scene of scenes) {
    const blob = textOf(scene);
    if (previous && keepsPreviousPlace(blob)) {
      scene.location = previous;
      continue;
    }
    if (/\bend\s*card\b/i.test(blob)) {
      scene.location = "";
      previous = "";
      continue;
    }
    const jumped = timeJump(blob);
    const named = primaryPlace(blob, jumped ? "" : previous);
    if (named) {
      scene.location = named;
      previous = named;
    } else if (!jumped && previous && isJunkPlace(scene.location || "")) {
      scene.location = previous;
    } else if (isJunkPlace(scene.location || "")) {
      scene.location = "";
      if (jumped) previous = "";
    } else {
      previous = placeLabel(scene.location || "");
    }
  }
  return scenes;
}

export function samePlace(left: string, right: string) {
  const a = placeLabel(left).toLowerCase();
  const b = placeLabel(right).toLowerCase();
  if (!a || !b) return false;
  const hasWord = (haystack: string, needle: string) =>
    new RegExp(`(?:^|\\s)${needle.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(?:$|\\s)`).test(haystack);
  if (a === b || hasWord(a, b) || hasWord(b, a)) return true;
  const leftTokens = placeTokens(left);
  const rightTokens = new Set(placeTokens(right));
  if (!leftTokens.length || !rightTokens.size) return false;
  const shared = leftTokens.filter((token) => rightTokens.has(token));
  if (!shared.length) return false;
  const smaller = Math.min(leftTokens.length, rightTokens.size);
  return shared.length >= smaller || shared.length >= 2;
}

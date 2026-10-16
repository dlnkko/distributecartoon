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
  { name: "bedroom", pattern: /\b(?:bedrooms?|in bed|on the bed|the bed|pillow|mattress|sits?\s+up)\b/i },
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

export function primaryPlace(text: string, previous = "") {
  const names = placesInText(text);
  if (!names.length) return "";
  const moved = text.match(
    /\b(?:walks?|goes?|heads?|steps?|moves?|enters?|returns?)\s+(?:back\s+)?(?:in)?to\s+(?:the\s+|her\s+|his\s+)?([a-z]+(?:\s+[a-z]+)?)/i,
  );
  if (moved) {
    const phrase = moved[1].toLowerCase();
    const hit = names.find((name) => phrase.includes(name) || name.includes(phrase));
    if (hit) return hit;
  }
  const staged = [...text.matchAll(/\b(?:in|into|inside)\s+(?:the\s+|her\s+|his\s+)?([a-z]+(?:\s+[a-z]+)?)/gi)];
  for (let index = staged.length - 1; index >= 0; index -= 1) {
    const phrase = staged[index][1].toLowerCase();
    const hit = names.find((name) => phrase.includes(name) || name.includes(phrase));
    if (hit) return hit;
  }
  if (previous && (names.includes(previous) || (!moved && !staged.length))) return previous;
  return names[names.length - 1];
}

export function assignScenePlaces<T extends { title?: string; summary?: string; location?: string; shots?: Array<{ action?: string }> }>(
  scenes: T[],
) {
  const textOf = (scene: T) => [scene.summary, scene.title, ...(scene.shots || []).map((shot) => shot.action || "")].join(" ");
  let previous = "";
  for (const scene of scenes) {
    const blob = textOf(scene);
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
  let upcoming = "";
  for (let index = scenes.length - 1; index >= 0; index -= 1) {
    const scene = scenes[index];
    const blob = textOf(scene);
    if (scene.location) upcoming = timeJump(blob) ? "" : scene.location;
    else if (upcoming) scene.location = upcoming;
  }
  return scenes;
}

export function samePlace(left: string, right: string) {
  const a = placeLabel(left).toLowerCase();
  const b = placeLabel(right).toLowerCase();
  if (!a || !b) return false;
  if (a === b || a.includes(b) || b.includes(a)) return true;
  const leftTokens = placeTokens(left);
  const rightTokens = new Set(placeTokens(right));
  if (!leftTokens.length || !rightTokens.size) return false;
  const shared = leftTokens.filter((token) => rightTokens.has(token));
  if (!shared.length) return false;
  const smaller = Math.min(leftTokens.length, rightTokens.size);
  return shared.length >= smaller || shared.length >= 2;
}

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

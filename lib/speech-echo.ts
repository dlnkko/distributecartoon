function spokenWords(line: string) {
  return line
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .split(/\s+/)
    .filter((word) => word.length > 2);
}

export function isSpeechFragment(text: string, spoken: string[]) {
  const raw = text.replace(/\s+/g, " ").trim();
  if (!raw) return false;
  const bare = raw
    .replace(/^[A-Z][A-Za-z'’-]{0,24}(?:\s+[A-Z][A-Za-z'’-]{0,24}){0,2}\s+/, "")
    .replace(/[“"]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  const words = spokenWords(bare || raw);
  if (words.length < 2) {
    const rest = raw.replace(/^[A-Z][A-Za-z'’-]{1,24}\b/, "").replace(/[^a-z0-9]+/gi, "");
    return !rest;
  }
  return spoken.some((line) => {
    const said = new Set(spokenWords(line));
    if (said.size < 2) return false;
    const hit = words.filter((word) => said.has(word)).length;
    return hit >= 2 && hit / words.length >= 0.75;
  });
}

export function dropSpeechFragments(text: string, spoken: string[]) {
  const unquoted = text
    .replace(/[“"][^"”]{0,400}[”"]/g, " ")
    .replace(/\b[A-Z][A-Za-z'’-]{1,24}(?:\s+[A-Z][A-Za-z'’-]{1,24}){0,2}\s+[“"][^"”\n]*$/gm, " ");
  const kept = unquoted
    .split(/\n+|(?<=[.!?])\s+/)
    .map((part) => part.replace(/\s+/g, " ").trim())
    .filter((part) => part && !isSpeechFragment(part, spoken));
  return kept.join(" ").replace(/\s{2,}/g, " ").replace(/\s+([,.])/g, "$1").trim();
}

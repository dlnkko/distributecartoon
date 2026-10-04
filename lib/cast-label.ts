const HUMAN_ROLE = /^(?:human|humans|person|people|man|woman|men|women|boy|girl|child|kid|teen|teenager|adult|baby|toddler|infant)$/i;

/** Button label. Humans stay as a name. A named non-human keeps the species: Lucas (cat). */
export function castChipLabel(name: string, role: string) {
  const label = name.replace(/\s+/g, " ").trim();
  const species = role.replace(/[()]/g, "").replace(/\s+/g, " ").trim().toLowerCase();
  if (!label) return "";
  if (!species || HUMAN_ROLE.test(species) || label.toLowerCase() === species) return label;
  const already = new RegExp(`\\(\\s*${species.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\s*\\)$`, "i");
  if (already.test(label)) return label;
  return `${label} (${species})`;
}

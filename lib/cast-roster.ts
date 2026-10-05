import OpenAI from "openai";
import { getSecrets, TEXT_MODEL } from "./config";
import type { Project, ScriptCastMember } from "./types";

function cleanName(value: string) {
  const name = value.replace(/["']/g, "").replace(/\s+/g, " ").trim();
  if (!name || name.length > 32) return "";
  if (/narrat|voice-?over|crowd|extra/i.test(name)) return "";
  return name;
}

function cleanRole(value: string) {
  const role = value.replace(/["']/g, "").replace(/\s+/g, " ").trim().toLowerCase();
  if (!role) return "human";
  return role.split(/[,.]/)[0].trim().slice(0, 24) || "human";
}

function parseCast(text: string): ScriptCastMember[] {
  const raw = text.trim().replace(/^```(?:json)?/i, "").replace(/```$/, "").trim();
  const start = raw.indexOf("{");
  const end = raw.lastIndexOf("}");
  if (start < 0 || end <= start) return [];
  let parsed: { characters?: Array<{ name?: string; role?: string }> };
  try {
    parsed = JSON.parse(raw.slice(start, end + 1)) as { characters?: Array<{ name?: string; role?: string }> };
  } catch {
    return [];
  }
  const seen = new Set<string>();
  const cast: ScriptCastMember[] = [];
  for (const item of parsed.characters || []) {
    const name = cleanName(String(item?.name || ""));
    const key = name.toLowerCase();
    if (!name || seen.has(key)) continue;
    seen.add(key);
    cast.push({ name, role: cleanRole(String(item?.role || "")) });
    if (cast.length >= 8) break;
  }
  return cast;
}

export async function identifyScriptCast(script: string) {
  const text = script.trim().slice(0, 14000);
  if (text.length < 12) return [];
  const { openaiApiKey } = getSecrets();
  if (!openaiApiKey) return [];
  const client = new OpenAI({ apiKey: openaiApiKey });
  const response = await client.responses.create({
    model: TEXT_MODEL,
    reasoning: { effort: "medium" },
    instructions: [
      "Read the script or storyboard and list the on-screen characters.",
      "Keep each name as written. Role is one or two words: human, dog, cat, bird, robot, or another species.",
      "Skip the narrator, voice-over, and unnamed crowds.",
      "Return JSON only: {\"characters\":[{\"name\":\"Carlos\",\"role\":\"human\"}]}",
    ].join(" "),
    input: text,
  });
  return parseCast(response.output_text || "");
}

function sameCastName(left: string, right: string) {
  return left.trim().toLowerCase() === right.trim().toLowerCase();
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

const SPECIES_CUES: Array<[RegExp, string]> = [
  [/\b(gatitos?|kittens?)\b/i, "a kitten"],
  [/\b(gatos?|gatas?|cats?)\b/i, "a cat"],
  [/\b(cachorros?|puppies|puppy)\b/i, "a puppy"],
  [/\b(perros?|perras?|dogs?)\b/i, "a dog"],
  [/\b(p[aá]jaros?|birds?)\b/i, "a bird"],
  [/\b(conejos?|rabbits?)\b/i, "a rabbit"],
  [/\b(caballos?|horses?)\b/i, "a horse"],
  [/\b(peces|pez|fish)\b/i, "a fish"],
  [/\b(robots?)\b/i, "a robot"],
  [/\b(dragones|drag[oó]n|dragons?)\b/i, "a dragon"],
  [/\b(aliens?)\b/i, "an alien"],
  [/\b(monstruos?|monsters?|creatures?)\b/i, "a creature"],
];

function isHumanRole(role: string) {
  return /^(human|person|people|woman|man|girl|boy|child|kid|baby|toddler|adult)$/i.test(role.trim());
}

function rolePhrase(role: string) {
  const clean = role.trim().toLowerCase();
  if (!clean || isHumanRole(clean)) return "";
  return `a ${clean}`;
}

function otherCastNames(project: Project, name: string) {
  const mine = name.trim().toLowerCase();
  const names = [
    ...(project.scriptCast || []).map((item) => item.name),
    ...project.characters.map((item) => item.name),
  ];
  return [...new Set(names.map((item) => item.trim()).filter((item) => item.length >= 2 && item.toLowerCase() !== mine))];
}

function mentionsName(text: string, name: string) {
  return new RegExp(`(?<![\\p{L}\\p{N}])${escapeRegExp(name)}(?![\\p{L}\\p{N}])`, "iu").test(text);
}

/** The comma-clause that names this character, plus the next clause when that clause is still about them. */
function localMentions(text: string, name: string, others: string[]) {
  const mentions: string[] = [];
  const sentences = text.split(/[.!?\n]+/);
  for (const sentence of sentences) {
    if (!mentionsName(sentence, name)) continue;
    const parts = sentence.split(",");
    const index = parts.findIndex((part) => mentionsName(part, name));
    if (index < 0) continue;
    const taken = [parts[index]];
    const next = parts[index + 1];
    if (next && !others.some((other) => mentionsName(next, other))) taken.push(next);
    const window = taken.join(",");
    const cutOthers = others.filter((other) => mentionsName(window, other));
    if (!cutOthers.length) {
      mentions.push(shrinkToName(window, name));
      continue;
    }
    const nameAt = window.search(new RegExp(`(?<![\\p{L}\\p{N}])${escapeRegExp(name)}(?![\\p{L}\\p{N}])`, "iu"));
    let start = 0;
    let end = window.length;
    for (const other of cutOthers) {
      const otherRe = new RegExp(`(?<![\\p{L}\\p{N}])${escapeRegExp(other)}(?![\\p{L}\\p{N}])`, "giu");
      for (const match of window.matchAll(otherRe)) {
        const at = match.index ?? 0;
        if (at < nameAt) start = Math.max(start, at + other.length);
        else if (at > nameAt) end = Math.min(end, at);
      }
    }
    const slice = window.slice(start, end).trim();
    if (slice) mentions.push(shrinkToName(slice, name));
  }
  return mentions;
}

function shrinkToName(window: string, name: string) {
  const tokens = window.split(/\s+/).filter(Boolean);
  const index = tokens.findIndex((token) =>
    mentionsName(token.replace(/^[^A-Za-zÁÉÍÓÚÜÑáéíóúüñ0-9]+|[^A-Za-zÁÉÍÓÚÜÑáéíóúüñ0-9]+$/g, ""), name),
  );
  if (index < 0) return window.trim();
  return tokens.slice(Math.max(0, index - 3), Math.min(tokens.length, index + 5)).join(" ");
}

function speciesIn(text: string) {
  for (const [pattern, label] of SPECIES_CUES) {
    if (pattern.test(text)) return label;
  }
  return "";
}

function ageIn(text: string) {
  const match = text.match(/\b(\d{1,2})\s*(?:años|año|years?\s*old|year-olds?|year-old)\b/i);
  const age = match ? Number(match[1]) : 0;
  return age >= 1 && age <= 99 ? age : 0;
}

/**
 * Age, species, and kinship written next to this name.
 * A stated age wins over a stray kinship word. A species wins over "human".
 * The script is read before scene summaries, so a later rewrite cannot age a child up or turn an animal into a person.
 */
export function scriptIdentityCue(project: Project, name: string) {
  const others = otherCastNames(project, name);
  const fromScript = describeMentions(localMentions(project.scriptText || "", name, others), name);
  if (fromScript) return fromScript;
  const scenes = project.scenes
    .map((scene) => [scene.summary, scene.title].filter(Boolean).join(". "))
    .join("\n");
  return describeMentions(localMentions(scenes, name, others), name);
}

function word(pattern: string) {
  return new RegExp(`(?<![\\p{L}\\p{N}])(?:${pattern})(?![\\p{L}\\p{N}])`, "iu");
}

function aged(age: number, noun: string) {
  const vowel = age === 8 || age === 11 || age === 18 || (age >= 80 && age < 90);
  return `${vowel ? "an" : "a"} ${age}-year-old ${noun}`;
}

function textBeforeName(mention: string, name: string) {
  const first = mention.split(",")[0] || mention;
  const at = first.search(new RegExp(`(?<![\\p{L}\\p{N}])${escapeRegExp(name)}(?![\\p{L}\\p{N}])`, "iu"));
  if (at < 0) return "";
  return first.slice(0, at);
}

function describeMentions(mentions: string[], name: string) {
  if (!mentions.length) return "";
  const blob = mentions.join(" \n ");
  const species = speciesIn(blob);
  const age = ageIn(blob);
  const speciesWord = species.replace(/^(a|an)\s+/, "");
  if (species && age) return aged(age, speciesWord);
  if (species) return species;
  const before = mentions.map((mention) => textBeforeName(mention, name)).join(" ");
  const titled = `${before} ${mentions.map((mention) => mention.split(",").slice(1).join(",")).join(" ")}`;
  const femaleChild = word("niña|nina|girl|daughter").test(titled) || word("hija").test(before);
  const maleChild = word("niño|nino|boy|son").test(titled) || word("hijo").test(before);
  const femaleAdult = word("mam[aá]|madre|mother|mom|mujer|woman|señora|senora").test(titled);
  const maleAdult = word("pap[aá]|padre|father|dad|hombre|man|señor|senor").test(titled);
  const baby = word("beb[eé]|baby|toddler|infant").test(titled);
  if (age > 0 && age < 13) {
    if (baby) return aged(age, "baby");
    if (femaleChild) return aged(age, "girl");
    if (maleChild) return aged(age, "boy");
    return aged(age, "child");
  }
  if (age >= 13 && age < 18) {
    if (femaleChild || femaleAdult) return aged(age, "girl");
    if (maleChild || maleAdult) return aged(age, "boy");
    return aged(age, "teenager");
  }
  if (age >= 18) {
    if (femaleAdult) return aged(age, "woman");
    if (maleAdult) return aged(age, "man");
    return aged(age, "adult");
  }
  if ((femaleAdult || maleAdult) && !(femaleChild || maleChild)) {
    return femaleAdult ? "an adult woman" : "an adult man";
  }
  if (femaleAdult && femaleChild) return "an adult woman";
  if (maleAdult && maleChild) return "an adult man";
  if (baby) return "a baby";
  if (femaleChild) return "a girl";
  if (maleChild) return "a boy";
  return "";
}

function withoutConflicts(kept: string, lead: string) {
  if (!lead) return kept;
  let text = kept;
  const animal = /\b(kitten|cat|puppy|dog|bird|rabbit|horse|fish|robot|dragon|alien|creature)\b/i.test(lead);
  const young = /\b(child|girl|boy|baby|toddler|teenager)\b/i.test(lead);
  const statedAge = lead.match(/(\d+)-year-old/);
  if (animal) text = text.replace(/\b(women|woman|men|man|person|human|lady|guy|girl|boy|child|people)\b/gi, "");
  else if (young) text = text.replace(/\b(young\s+)?(women|woman|men|man|lady|gentleman|guy)\b/gi, "");
  else if (statedAge && Number(statedAge[1]) >= 18) text = text.replace(/\byoung\s+(women|woman|men|man|lady|guy)\b/gi, "");
  return text
    .replace(/\s{2,}/g, " ")
    .replace(/^[,.\s]+|[,.\s]+$/g, "")
    .replace(/\b(a|an)$/gi, "")
    .replace(/^[,.\s]+|[,.\s]+$/g, "")
    .trim();
}

function alreadyCovered(text: string, cue: string) {
  if (!cue) return true;
  if (text.toLowerCase().includes(cue.toLowerCase())) return true;
  const age = cue.match(/(\d+)-year-old/);
  if (age && new RegExp(`\\b${age[1]}\\s*-?\\s*years?\\s*-?\\s*old\\b`, "i").test(text)) return true;
  const animal = cue.match(/\b(kitten|cat|puppy|dog|bird|rabbit|horse|fish|robot|dragon|alien|creature)\b/i);
  if (animal && new RegExp(`\\b${animal[1]}s?\\b`, "i").test(text)) return true;
  return false;
}

function mergeRealisticDescription(project: Project, character: Project["characters"][number]) {
  const look = scriptLookFor(project, character.name);
  const cue = scriptIdentityCue(project, character.name);
  const role = rolePhrase(
    (project.scriptCast || []).find((item) => sameCastName(item.name, character.name))?.role || "",
  );
  const lead = cue || role;
  let kept = (character.description || "")
    .replace(/^\s*human\b[.,]?\s*/i, "")
    .replace(/\s+/g, " ")
    .trim();
  if (look) kept = kept.replace(new RegExp(escapeRegExp(look), "ig"), " ").replace(/\s+/g, " ").trim();
  kept = kept.replace(/^[,.\s]+|[,.\s]+$/g, "").trim();
  if (/^(human|person)$/i.test(kept)) kept = "";
  kept = withoutConflicts(kept, lead);
  const animalLead = /\b(kitten|cat|puppy|dog|bird|rabbit|horse|fish|robot|dragon|alien|creature)\b/i.test(lead);
  if (animalLead && kept && !alreadyCovered(kept, lead)) kept = "";
  let next = kept;
  if (lead && !alreadyCovered(next, lead)) next = [lead, next].filter(Boolean).join(". ");
  if (look && !next.toLowerCase().includes(look.toLowerCase())) next = [next, look].filter(Boolean).join(". ");
  next = next.replace(/\s{2,}/g, " ").replace(/\.\s*\./g, ".").trim();
  if (next) character.description = next;
}

export function scriptLookFor(project: Project, name: string) {
  const slot = project.references.find(
    (item) => item.kind === "character" && sameCastName(item.label, name) && item.lookNotes?.trim(),
  );
  return slot?.lookNotes?.trim() || "";
}

/** The user's chosen name, role, and look replace whatever the storyboard invented. */
/** After a song's scenes exist, the user's written look replaces the invented description. */
export function applySongLooks(project: Project) {
  if (!project.song) return project;
  for (const character of project.characters) {
    if (character.isExtra) continue;
    const look = scriptLookFor(project, character.name);
    if (!look) continue;
    character.description = look;
  }
  return project;
}

export function applyScriptLooks(project: Project) {
  if (project.style === "realistic") {
    for (const character of project.characters) {
      if (character.isExtra) continue;
      mergeRealisticDescription(project, character);
    }
    return project;
  }
  const cast = project.scriptCast || [];
  if (!cast.length) return project;
  for (const character of project.characters) {
    if (character.isExtra) continue;
    const known = cast.find((item) => sameCastName(item.name, character.name));
    const look = scriptLookFor(project, character.name);
    if (!known && !look) continue;
    const role = known?.role?.trim() || "";
    if (look) {
      const prefix = role && !new RegExp(`\\b${role.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, "i").test(look) ? `${role}. ` : "";
      character.description = `${prefix}${look}`.replace(/\s+/g, " ").trim();
      continue;
    }
    if (role && !new RegExp(`\\b${role.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, "i").test(character.description)) {
      character.description = `${role}. ${character.description}`.replace(/\s+/g, " ").trim();
    }
  }
  return project;
}

export function castBrief(project: Project) {
  const cast = project.scriptCast || [];
  if (!cast.length) return "";
  const lines = cast.map((item) => {
    const look = scriptLookFor(project, item.name);
    return look ? `${item.name} (${item.role}): ${look}` : `${item.name} (${item.role})`;
  });
  return `The script's characters are: ${lines.join("; ")}. Use these exact names and roles. A written look is the visual description. Do not rename them, merge them, or change their species.`;
}

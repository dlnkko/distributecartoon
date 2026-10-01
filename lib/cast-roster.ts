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

export function scriptLookFor(project: Project, name: string) {
  const slot = project.references.find(
    (item) => item.kind === "character" && sameCastName(item.label, name) && item.lookNotes?.trim(),
  );
  return slot?.lookNotes?.trim() || "";
}

/** The user's chosen name, role, and look replace whatever the storyboard invented. */
export function applyScriptLooks(project: Project) {
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

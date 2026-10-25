import { clampTotalDuration, createId } from "./ids";
import { sonnetText } from "./sonnet";
import { sceneSpeechFloor, seedancePartDurations } from "./timing";
import type { Project, Scene } from "./types";

const CLOCK = /\d{1,2}:\d{2}\s*(?:to|–|—|-)\s*\d{1,2}:\d{2}/gi;

function spokenSeconds(project: Project) {
  return project.scenes.reduce((sum, scene) => sum + (Number(scene.estimatedSeconds) || 0), 0);
}

function boardText(project: Project) {
  return project.scenes
    .map((scene) => {
      const lines = (scene.dialogue || [])
        .filter((line) => line.line?.trim())
        .map((line) => `${line.speaker}: ${line.line}`)
        .join(" / ");
      return `${scene.index}. ${scene.title} (${scene.estimatedSeconds}s) ${scene.location} — ${scene.summary}${lines ? ` | ${lines}` : ""}`;
    })
    .join("\n");
}

function parseScenes(text: string) {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const raw = fenced?.[1] || text;
  const start = raw.indexOf("{");
  const end = raw.lastIndexOf("}");
  if (start < 0 || end <= start) return [];
  try {
    const parsed = JSON.parse(raw.slice(start, end + 1)) as { scenes?: unknown };
    return Array.isArray(parsed.scenes) ? parsed.scenes : [];
  } catch {
    return [];
  }
}

function knownName(raw: string, names: string[], fallback: string) {
  const clean = raw.trim();
  const hit = names.find((name) => name.toLowerCase() === clean.toLowerCase());
  return hit || fallback;
}

export async function extendShortStory(project: Project, signal?: AbortSignal) {
  if (project.song || !project.scenes.length) return false;
  if (((project.scriptText || "").match(CLOCK) || []).length >= 2) return false;
  const target = clampTotalDuration(project.targetDurationSeconds);
  const written = Math.round(spokenSeconds(project));
  const gap = target - written;
  if (gap < 3) return false;
  const names = project.characters.filter((character) => !character.isExtra && character.name.trim()).map((character) => character.name);
  const last = project.scenes[project.scenes.length - 1];
  const fallback = (last?.dialogue || []).find((line) => line.speaker?.trim())?.speaker || names[0] || "the man";
  const parts = seedancePartDurations(target)
    .map((duration, index) => `part ${index + 1} ${duration}s`)
    .join(", ");
  const wroteLines = /["“][^"”]{2,}["”]/.test(project.scriptText || "");
  const linesNeeded = wroteLines ? Math.max(1, Math.round(gap / 3)) : Math.max(2, Math.round(gap / 5));
  const speechRule = wroteLines
    ? "Every new scene has one or two short spoken lines. A short line is about 3 seconds. No silent scene. No slogan. No health claim. No new character."
    : "The new scenes are the life after the fix when that has not been shown. Someone tells the other person what changed, inside the story, and that they would get it now. A quiet insert can stay silent. No slogan. No health claim. No new character.";
  const language = project.dialogueLanguage === "spanish" ? "Spanish" : "English";
  let text = "";
  try {
    text = await sonnetText(
      [
        "You finish a short film that came out shorter than the length the user asked for.",
        "Return one JSON object and nothing else: {\"scenes\":[...]}.",
        "Do not rewrite the scenes you are given. Add new scenes that continue after the last one.",
        "The missing seconds belong to the life after the fix, once the solution has been used. Show that same life improved. Do not start another story.",
        "Write that out. A later minute of the same situation stays in the last place, on the same ground. A new place is only when they go somewhere else. Time can pass there. Do not invent a second environment. It is still this story, not a tour of unrelated days.",
        "Do not repeat an action that already happened. If the product was already used, do not show that use again. If it was left on someone, including while they slept, it is still on them until a scene takes it off.",
        "Clothes stay with the place. They change when the place changes. Face and hair stay.",
        speechRule,
        "The style does not change the story.",
      ].join(" "),
      [
        `Target: ${target} seconds (${parts}). The scenes below cover ${written} seconds. Add ${gap} seconds, about ${linesNeeded} short lines, and no more.`,
        `Dialogue language: ${language}. Use only these people: ${names.join(", ") || fallback}.`,
        `The last scene is in ${last?.location || "the same place"}. If these seconds are still that situation, continue there, on the same ground. Start a new place only when they go somewhere else.`,
        project.storyBrief?.trim()
          ? `STORY READING. New scenes continue this same film. They finish SOLUTION. They do not start another story.\n${project.storyBrief.trim()}`
          : "",
        boardText(project),
        'Each scene has title, summary, location, character_names, camera, estimated_seconds, and dialogue as [{speaker, line}]. estimated_seconds is about 3 per spoken line. The new estimated_seconds add up to the missing seconds.',
      ]
        .filter(Boolean)
        .join("\n\n"),
      { maxTokens: 8000, signal },
    );
  } catch (error) {
    console.warn("story extend", project.id, error instanceof Error ? error.message : error);
    return false;
  }
  const incoming = parseScenes(text);
  const added: Scene[] = [];
  for (const item of incoming) {
    if (!item || typeof item !== "object") continue;
    const record = item as Record<string, unknown>;
    const dialogue = (Array.isArray(record.dialogue) ? record.dialogue : [])
      .map((line) => {
        const row = line && typeof line === "object" ? (line as Record<string, unknown>) : {};
        const spoken = String(row.line || "").replace(/\s+/g, " ").trim();
        if (!spoken) return null;
        return { speaker: knownName(String(row.speaker || ""), names, fallback), line: spoken };
      })
      .filter((line): line is { speaker: string; line: string } => Boolean(line))
      .slice(0, 2);
    const summary = String(record.summary || record.title || "").replace(/\s+/g, " ").trim();
    if (!summary || !dialogue.length) continue;
    const draft = { dialogue };
    const speakers = [...new Set(dialogue.map((line) => line.speaker))];
    added.push({
      id: createId("scene"),
      index: project.scenes.length + added.length + 1,
      title: String(record.title || "Later").replace(/\s+/g, " ").trim().slice(0, 80),
      summary: summary.slice(0, 400),
      location: String(record.location || last?.location || "").replace(/\s+/g, " ").trim(),
      characterNames: (Array.isArray(record.character_names) ? record.character_names : speakers)
        .map((name) => knownName(String(name), names, ""))
        .filter((name, index, list) => Boolean(name) && list.indexOf(name) === index)
        .concat(speakers)
        .filter((name, index, list) => list.indexOf(name) === index),
      extraNames: [],
      dialogue,
      estimatedSeconds: sceneSpeechFloor(draft),
      camera: String(record.camera || "").replace(/\s+/g, " ").trim(),
      shots: [],
    });
  }
  if (!added.length) return false;
  project.scenes = [...project.scenes, ...added].map((scene, index) => ({ ...scene, index: index + 1 }));
  return true;
}

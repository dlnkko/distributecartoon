import { characterRole, continuityPass } from "./continuity";
import { samePlace } from "./places";
import { isUnseenVoice, promptReadyReferences } from "./refs";
import type { Batch, Character, Project, Scene, VisualStyle } from "./types";

export type PromptRef = {
  url: string;
  kind: "frame" | "logo" | "product" | "location" | "other" | "video" | "character" | "narrator";
  name: string;
  notes?: string;
};

export function imageStyleLead(style: VisualStyle) {
  return style === "claymation" ? "claymation style" : "pixar style";
}

export function videoAudioLead() {
  return "Dialogue starts early, but never before its speaker is on screen. Each line stays inside its own SCENE. No repeated lines.";
}

export function sceneAudioClose() {
  return "[NO BGM]";
}

export function videoVoiceLead() {
  return "On-screen dialogue uses that character's realistic lipsync. Narrator lines are off-screen voice-over only. No character lipsyncs them, and mouths stay closed.";
}

export function videoCloseLead() {
  return `Obey real-world physics: gravity pulls down, weight stays on contact surfaces, two solids cannot occupy the same space, no clipping through walls, doors, furniture, vehicles, or other bodies, no mirrored or reversed motion unless the script names a reflection. Each character is one body at a time. A clothing change is still that same person, not a second body. Keep who is in front, behind, left, and right until the action moves them. Time moves forward. Stay in the same place until the scene changes location. Never invent extra copies of anyone. Foreground bodies occlude background glow; no shine through hair or skin. Speakers look at who they address, not the lens, unless they break the fourth wall. Same body scale versus chairs, tables, and doors across cuts. Hands keep contact with held props. On-screen dialogue uses that character's realistic lipsync. Narrator lines are off-screen voice-over only. No character lipsyncs them, and mouths stay closed. Props, background people, and set pieces persist across cuts: nothing appears or vanishes unless the action shows it. Characters never teleport or swap sides between shots. ${videoAudioLead()}`;
}

export function videoStyleLead(style: VisualStyle, aspect?: string) {
  const look = style === "claymation" ? "Claymation" : "Pixar";
  const frame =
    aspect === "9:16"
      ? "Vertical 9:16 frame: one continuous space, and left and right stay consistent across cuts."
      : aspect
        ? "Horizontal 16:9 frame: the wide image is one place, so the extra width must not duplicate anyone or flip who is left, right, in front, or behind."
        : "";
  return frame ? `${look} style throughout the whole video. ${frame}` : `${look} style throughout the whole video.`;
}

export function styleGuide(style: VisualStyle) {
  return imageStyleLead(style);
}

function stripVideoStyleLead(text: string) {
  return text
    .replace(/^(?:pixar|claymation) style(?: throughout the whole video)?\.?\s*/i, "")
    .replace(/^(?:Horizontal 16:9|Vertical 9:16) frame:[^.]*\.\s*/i, "")
    .replace(/^@Image\d+\s+is the first frame of this shot(?:,[^.]+)?\.?\s*/i, "")
    .replace(/^Animate forward from that still\.?\s*/i, "")
    .replace(/^Hold the same cinematic camera until CUT\.?\s*/i, "")
    .replace(
      /^Keep (?:the same )?(?:pixar|claymation) style(?: as seen in [@#]\s*Image\s*\d+)?(?: for (?:the entire video|every scene))?\.?\s*/i,
      "",
    )
    .replace(/^Do not (?:switch look|change the look)\.?\s*/i, "")
    .replace(/^Maintain the exact same[^.]+visual style\.?\s*/i, "")
    .replace(/^No background music\.?\s*/i, "")
    .replace(/^\[NO BGM\]\s*/i, "")
    .replace(/^Speak from 0s\.?\s*/i, "")
    .replace(/^Dialogue starts early, but never before its speaker is on screen\.?\s*/i, "")
    .replace(/^Each line stays inside its own SCENE\.?\s*/i, "")
    .replace(/^No repeated lines\.?\s*/i, "")
    .replace(/^(?:Natural )?ambient sound and dialogue only\.?\s*/i, "")
    .replace(/^No (?:soundtrack|score|bgm|music|background (?:music|score|soundtrack))\.?\s*/i, "")
    .trim();
}

function stripIdentityDump(text: string) {
  return text
    .replace(/@Image\d+\s+is the first frame of this shot[^.]*\.\s*/gi, "")
    .replace(/@Image\d+\s+is the (?:product|logo|location) reference\.[^.]*\.\s*/gi, "")
    .replace(/@Image\d+\s+is [^.]*Match (?:his|her|their|this)[^.]*\.\s*/gi, "")
    .replace(/@Video\d+\s+is the exact voice[^.]*\.\s*/gi, "")
    .replace(/Recreate the product in[^.]*\.\s*/gi, "")
    .replace(/Use the product naturally[^.]*\.\s*/gi, "")
    .replace(/\s{2,}/g, " ")
    .trim();
}

function stripSceneStyleLocks(text: string) {
  return stripIdentityDump(text)
    .replace(/\s*Keep the same style(?:, look, lighting and characters)? as seen in [@#]\s*Image\s*\d+\.?\s*/gi, " ")
    .replace(/\s*Animate forward from that still\.?\s*/gi, " ")
    .replace(/\s*Hold the same cinematic camera until CUT\.?\s*/gi, " ")
    .replace(/\s{2,}/g, " ")
    .trim();
}

function joinPromptParts(parts: Array<string | undefined>) {
  return parts
    .map((part) => (part || "").replace(/^[,.\s]+|[,.\s]+$/g, "").trim())
    .filter(Boolean)
    .join(", ")
    .replace(/\s{2,}/g, " ")
    .replace(/,\s*,/g, ", ");
}

function appearanceForLook(character: Character) {
  const name = character.name.trim();
  let text = (character.description || "").trim();
  text = text
    .replace(/\b(claymation|pixar|stop-motion)\s+(style\s+)?/gi, "")
    .replace(/\b(engaged in|involved in)\b[\s\S]*/gi, "")
    .replace(/\b(fight|fighting|scuffle|brawl|chase|chasing|wrestling|playing with|interacting)\b[\s\S]*/gi, "")
    .replace(/\b(?:with|and|versus|vs\.?)\s+(?:a|an|the)\s+[\w'-]+/gi, "")
    .replace(/\s{2,}/g, " ")
    .replace(/^[,.\s]+|[,.\s]+$/g, "")
    .trim();
  if (!text || text.toLowerCase() === name.toLowerCase()) return name;
  return `${name}, ${text}`;
}

const SOLO_LOOK =
  "exactly one character in frame, isolated solo portrait, no other people or animals, not a scene, not a fight, not a two-shot, no interaction";

export function characterLookPrompt(character: Character, style: VisualStyle) {
  return joinPromptParts([
    imageStyleLead(style),
    `solo portrait of ${character.name} only`,
    appearanceForLook(character),
    SOLO_LOOK,
    "single three-quarter standing pose, full character clearly visible, face hair wardrobe and body readable",
    "looking at camera, even studio lighting",
    "plain light gray seamless background",
    "one image, one pose, no grid, no collage, no character sheet, no turnaround, no multiple expressions or faces",
  ]);
}

export function characterLookFromPhotoPrompt(_character: Character, style: VisualStyle, _role = "") {
  const look = imageStyleLead(style);
  return `Convert the attached photo to ${look}. Same subject. Solo portrait pose on a plain grey background.`;
}

export function characterAnchorPrompt(name: string, style: VisualStyle) {
  const line = `Hi, my name is ${name}, nice to meet you!`;
  return `${videoStyleLead(style)} @Image1 looks into the camera and says, "${line}" Realistic lipsync. Plain background. ${sceneAudioClose()}`;
}

export function locationPlatePrompt(name: string, style: VisualStyle, fromPhoto: boolean) {
  const angle =
    "Three-quarter angle, never head-on. The angle bakes depth and distance into the image so a moving camera can hold the geometry. No flat frontal view.";
  const look = imageStyleLead(style);
  const time = "Neutral lighting. Do not lock this place to day or night. The video will change the time of day.";
  if (fromPhoto) {
    return `${look}. Reframe this location, ${name}, from the attached photo. Keep the place recognizable. ${angle} ${time} No people, no characters, no text.`;
  }
  return `${look}. Empty view of ${name}. ${angle} ${time} No people, no characters, no text.`;
}

export function characterLookRevisionPrompt(character: Character, style: VisualStyle, notes: string) {
  return joinPromptParts([
    imageStyleLead(style),
    `Keep this same character, ${character.name}, alone`,
    "apply only these look changes:",
    notes.trim(),
    SOLO_LOOK,
    "single three-quarter standing pose, full character clearly visible",
    "plain light gray seamless background, even studio lighting",
    "one image, one pose, no grid, no collage, no character sheet, no multiple expressions",
  ]);
}

function sceneByIndex(project: Project, index?: number): Scene | undefined {
  if (!index) return undefined;
  return project.scenes.find((item) => item.index === index);
}

function mentionIndex(text: string, name: string) {
  const blob = ` ${text.toLowerCase()} `;
  const full = name.trim().toLowerCase();
  if (!full) return -1;
  const fullAt = blob.indexOf(` ${full} `);
  if (fullAt >= 0) return fullAt;
  const first = full.split(/\s+/).filter(Boolean)[0] || "";
  if (first.length < 3) return -1;
  const match = blob.match(new RegExp(`\\b${escapeRegExp(first)}s?\\b`, "i"));
  return typeof match?.index === "number" ? match.index : -1;
}

function firstSceneIndex(batch: Batch) {
  const indexes = batch.sceneIndexes.map((index) => Number(index)).filter((index) => Number.isFinite(index) && index > 0);
  return indexes.length ? Math.min(...indexes) : 1;
}

const CAMERA_SHOTS: Array<[RegExp, string]> = [
  [/\b(extreme wide(?: shot)?|ews|gran plano general|gpg|establishing)\b/i, "extreme wide shot"],
  [/\b(wide(?: shot)?|plano general|long shot)\b/i, "wide shot"],
  [/\b(full(?: shot)?|plano entero)\b/i, "full shot"],
  [/\b(medium full(?: shot)?|cowboy|plano americano|american shot)\b/i, "medium full shot"],
  [/\b(medium close-?up|plano medio corto)\b/i, "medium close-up"],
  [/\b(medium(?: shot)?|plano medio)\b/i, "medium shot"],
  [/\b(extreme close-?up|ecu|primer[ií]simo(?: primer plano)?)\b/i, "extreme close-up"],
  [/\b(close-?up|primer plano)\b/i, "close-up"],
  [/\b(insert|plano detalle)\b/i, "insert"],
  [/\b(two[- ]shot)\b/i, "two-shot"],
  [/\b(over[- ]the[- ]shoulder|ots|sobre el hombro)\b/i, "over the shoulder"],
  [/\b(pov|point of view|punto de vista)\b/i, "POV"],
];

const CAMERA_ANGLES: Array<[RegExp, string]> = [
  [/\b(dutch(?: angle)?|canted|holand[eé]s|tilted)\b/i, "dutch angle"],
  [/\b(bird'?s[- ]eye|cenital|top shot|overhead|top[- ]down)\b/i, "bird's eye"],
  [/\b(worm'?s[- ]eye|nadir)\b/i, "worm's eye"],
  [/\b(low angle|contrapicado)\b/i, "low angle"],
  [/\b(high angle|picado)\b/i, "high angle"],
  [/\b(eye[- ]level|ángulo normal|angulo normal)\b/i, "eye level"],
];

const CAMERA_MOVES: Array<[RegExp, string]> = [
  [/\b(dolly zoom|v[eé]rtigo)\b/i, "dolly zoom"],
  [/\b(tracking(?: shot)?)\b/i, "tracking shot"],
  [/\b(steadicam)\b/i, "steadicam"],
  [/\b(handheld)\b/i, "handheld"],
  [/\b(crane|gr[uú]a)\b/i, "crane"],
  [/\b(dolly|travelling)\b/i, "dolly"],
  [/\b(pan|paneo)\b/i, "pan"],
  [/\b(tilt)\b/i, "tilt"],
  [/\b(zoom)\b/i, "zoom"],
];

const CAMERA_VARIETY = [
  "Eye level, medium shot",
  "Dutch angle, full shot",
  "Eye level, two-shot",
  "Low angle, close-up",
  "High angle, wide shot",
  "Eye level, insert",
  "Tracking shot, full shot",
  "Bird's eye, wide shot",
  "Handheld, medium shot",
  "Worm's eye, close-up",
];

function firstMatch(source: string, pairs: Array<[RegExp, string]>) {
  for (const [pattern, label] of pairs) {
    if (pattern.test(source)) return label;
  }
  return "";
}

function formatCameraLabel(parts: string[]) {
  return parts
    .filter(Boolean)
    .join(", ")
    .replace(/(^|,\s*)(pov)\b/gi, "$1POV")
    .replace(/(^|,\s*)([a-z])/g, (_, prefix: string, letter: string) => `${prefix}${letter.toUpperCase()}`);
}

export function cinematicCamera(scene?: Scene, fallback = "wide shot, eye level", used: string[] = []) {
  const raw = (scene?.camera || "").replace(/\.+$/g, "").trim();
  const tokens = raw
    ? raw.split(/[;,/]/).map((token) => token.trim()).filter(Boolean)
    : [];
  const angles: string[] = [];
  const shots: string[] = [];
  const moves: string[] = [];
  for (const token of tokens) {
    const angle = firstMatch(token, CAMERA_ANGLES);
    if (angle) {
      if (!angles.includes(angle)) angles.push(angle);
      continue;
    }
    const shot = firstMatch(token, CAMERA_SHOTS);
    if (shot) {
      if (!shots.includes(shot)) shots.push(shot);
      continue;
    }
    const move = firstMatch(token, CAMERA_MOVES);
    if (move) {
      if (!moves.includes(move)) moves.push(move);
      continue;
    }
    if (token && !/[áéíóúñ]/i.test(token) && !shots.includes(token.toLowerCase())) shots.push(token.toLowerCase());
  }
  let label = formatCameraLabel([...angles, ...shots, ...moves]);
  if (!label) label = fallback;
  const normalized = label.toLowerCase();
  if (used.some((item) => item.toLowerCase() === normalized)) {
    const next = CAMERA_VARIETY.find((item) => !used.some((prev) => prev.toLowerCase() === item));
    if (next) return next;
  }
  return label;
}

function sceneOnScreenNames(scene?: Scene, project?: Project) {
  if (!scene) return [] as string[];
  const unseen = new Set(
    (project?.characters || [])
      .filter((character) => character.isExtra || isUnseenVoice(character))
      .map((character) => character.name.trim().toLowerCase()),
  );
  return [...new Set((scene.characterNames || []).map((name) => name.trim()).filter(Boolean))].filter(
    (name) => !unseen.has(name.toLowerCase()),
  );
}

function pickSingleSubjectCamera(used: string[]) {
  return (
    CAMERA_VARIETY.find(
      (item) =>
        !/over the shoulder|two-shot/i.test(item) &&
        !used.some((prev) => prev.toLowerCase() === item.toLowerCase()),
    ) || "Eye level, medium shot"
  );
}

function safeCinematicCamera(scene?: Scene, fallback = "wide shot, eye level", used: string[] = [], project?: Project) {
  const camera = cinematicCamera(scene, fallback, used);
  const names = sceneOnScreenNames(scene, project);
  if (/over the shoulder|two-shot/i.test(camera) && names.length < 2) {
    return pickSingleSubjectCamera(used);
  }
  return camera;
}

function openingAction(scene?: Scene) {
  const summary = (scene?.summary || scene?.title || "").trim();
  if (!summary) return "the scene is just beginning";
  const beat = summary
    .split(/\b(?:then|suddenly|until|before|after that|later|meanwhile|cut to)\b/i)[0]
    .split(/[.!;]/)[0]
    .trim();
  return beat || summary;
}

export function openingFrameCharacters(project: Project, batch: Batch): string[] {
  const scene = sceneByIndex(project, firstSceneIndex(batch));
  if (!scene) return [];
  const leads = (scene.characterNames.length
    ? scene.characterNames
    : project.characters.filter((character) => !character.isExtra).map((character) => character.name)
  ).filter((name, index, all) => name.trim() && all.findIndex((other) => other.toLowerCase() === name.toLowerCase()) === index);
  const beat = openingAction(scene);
  const hits = leads
    .map((name) => ({ name, at: mentionIndex(beat, name) }))
    .filter((item) => item.at >= 0)
    .sort((a, b) => a.at - b.at);
  if (hits.length >= 2) return hits.slice(0, 2).map((item) => item.name);
  if (hits.length) return [hits[0].name];
  const speaker = scene.dialogue[0]?.speaker?.trim() || "";
  if (speaker) {
    const match = leads.find(
      (name) => name.toLowerCase() === speaker.toLowerCase() || mentionIndex(speaker, name) >= 0,
    );
    if (match) return [match];
  }
  return leads.length === 1 ? leads : [];
}

export function sceneFramePrompt(project: Project, batch: Batch) {
  const lead = imageStyleLead(project.style);
  const firstIndex = firstSceneIndex(batch);
  const scene = sceneByIndex(project, firstIndex);
  const camera = cinematicCamera(scene);
  const opening = openingFrameCharacters(project, batch);
  const looks = opening
    .map((name) => {
      const character = project.characters.find((item) => item.name.toLowerCase() === name.toLowerCase());
      return character ? appearanceForLook(character) : name;
    })
    .filter(Boolean)
    .join(", ");
  const beat = openingAction(scene);
  const onlyShot = opening.length
    ? `Only ${opening.join(" and ")} in this opening frame. Do not add any other characters.`
    : "Do not add any character who is not in this opening beat.";
  const refs = promptReadyReferences(project, firstIndex ? [firstIndex] : [])
    .map((item) =>
      item.kind === "logo"
        ? `${item.label} logo drawn in ${lead} from the reference, in the scene`
        : `${item.label} drawn in ${lead} from the reference, in the scene`,
    )
    .join(", ");
  return joinPromptParts([
    lead,
    "cinematic still",
    camera,
    `opening instant of scene ${firstIndex}`,
    beat,
    looks,
    scene?.location,
    onlyShot,
    refs,
    "frozen first frame at the very start of this scene, before later action, so the animation can continue from this still",
    "match the attached character look, hold eyelines and blocking, English prompt only",
  ]);
}

export function sanitizeReferencePrompt(prompt: string) {
  return prompt
    .replace(/\bKeep identity, costume, face and body consistent with (?:[@#])?Image\s*\d+\.?\s*/gi, "")
    .replace(/\b(?:[@#])?Image\s+(\d+)\s+is\b/gi, "@Image$1 is")
    .replace(/\b(?:[@#])?Video\s+(\d+)\s+is\b/gi, "@Video$1 is")
    .replace(/(^|[^@#\w])Image\s+(\d+)\b/gi, "$1@Image$2")
    .replace(/(^|[^@#\w])Video\s+(\d+)\b/gi, "$1@Video$2")
    .replace(/#Image/gi, "@Image")
    .replace(/#Video/gi, "@Video")
    .replace(/@{2,}Image/gi, "@Image")
    .replace(/@{2,}Video/gi, "@Video")
    .replace(/\s{2,}/g, " ")
    .trim();
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export function englishExtraName(name: string) {
  const raw = name.trim();
  if (!raw) return "";
  if (/\b(hombre|mujer|niño|niña|señor|señora|chico|chica)\b/i.test(raw) || /\baños\b/i.test(raw)) {
    return englishSpeakerName(raw);
  }
  return raw.replace(/\s+/g, " ");
}

export function englishSpeakerName(name: string, description = "") {
  const raw = name.trim();
  if (!raw) return "the man";
  const blob = `${raw} ${description}`;
  const age = blob.match(/(\d+)\s*(?:-?\s*year|\s*años?)/i)?.[1];
  const female = /\b(mujer|niña|señora|girl|woman)\b/i.test(blob);
  if (/\b(hombre|mujer|niño|niña|señor|señora|chico|chica)\b/i.test(raw) || /\baños\b/i.test(raw)) {
    if (female) return age ? `the ${age}-year-old woman` : "the woman";
    return age ? `the ${age}-year-old man` : "the man";
  }
  const first = raw.split(/\s+/)[0];
  if (/^[A-Za-zÁÉÍÓÚÜÑáéíóúüñ]{2,16}$/.test(first)) return first;
  return raw;
}

function toEnglishSpeaker(name: string, description = "") {
  return englishSpeakerName(name, description);
}

function scrubSpanishSpeakerPhrases(text: string) {
  return text
    .replace(
      /\b((?:el |la )?(?:hombre|mujer|niño|niña|señor|señora|chico|chica)(?: de \d+\s*años?)?)\b/gi,
      (match) => toEnglishSpeaker(match),
    )
    .replace(/\bdice:\s*/gi, "says: ");
}

function speakerLabel(project: Project, speaker: string) {
  const needle = speaker.trim().toLowerCase();
  const character =
    project.characters.find((item) => item.name.toLowerCase() === needle) ||
    project.characters.find((item) => needle.includes(item.name.toLowerCase()) || item.name.toLowerCase().includes(needle));
  return toEnglishSpeaker(character?.name || speaker, character?.description || "");
}

function findSpeakerCharacter(project: Project, speaker: string) {
  const needle = speaker.trim().toLowerCase();
  if (!needle) return undefined;
  return (
    project.characters.find((item) => item.name.toLowerCase() === needle) ||
    project.characters.find((item) => needle.includes(item.name.toLowerCase()) || item.name.toLowerCase().includes(needle))
  );
}

function isVoiceoverSpeaker(project: Project, speaker: string) {
  const raw = speaker.trim();
  if (!raw) return false;
  if (/^(the\s+)?(narrator|narradora|voice[- ]?over|voiceover|vo|off[- ]?screen|voz en off)$/i.test(raw)) return true;
  const character = findSpeakerCharacter(project, raw);
  if (character) return isUnseenVoice(character);
  return isUnseenVoice({ name: raw, description: "", voiceNotes: "" });
}

export function narrationLines(project: Project, sceneIndexes?: number[]) {
  const scenes = sceneIndexes ? sceneIndexes.map((index) => sceneByIndex(project, index)) : project.scenes;
  return scenes.flatMap((scene) =>
    (scene?.dialogue || [])
      .filter((line) => line.speaker && (line.line || "").trim() && isVoiceoverSpeaker(project, line.speaker))
      .map((line) => line.line.replace(/^["']+|["']+$/g, "").trim()),
  );
}

function narratorVoiceNotes(project: Project) {
  const narrator = project.characters.find((item) => isVoiceoverSpeaker(project, item.name));
  return (narrator?.voiceNotes || "").trim().replace(/[. ]+$/, "") || "a warm, close, even storyteller voice";
}

// Four seconds fit about ten spoken words.
export function narratorVoiceSample(project: Project) {
  const first = narrationLines(project)[0] || "";
  const words = first.split(/\s+/).filter(Boolean);
  return words.length > 10 ? `${words.slice(0, 10).join(" ").replace(/[,;:]+$/, "")}…` : first;
}

export function narratorVoicePrompt(project: Project) {
  const look = project.style === "claymation" ? "Claymation" : "Pixar";
  const language = spokenLanguage(project);
  return [
    `4 seconds, one continuous shot. ${look} style.`,
    "An empty, softly lit backdrop with gentle light drifting across a plain textured wall. The frame holds no people, no characters, no faces and no mouths.",
    `NARRATOR — off-screen voice-over, heard only, with no lipsync. Voice: ${narratorVoiceNotes(project)}. Spoken in ${language.speech}: {${narratorVoiceSample(project)}}`,
    "Audio: the narrator's voice over a quiet room tone. No music, no score, no instruments.",
  ].join("\n");
}

function spokenLineCue(project: Project, scene: Scene | undefined, speakerRaw: string, text: string) {
  const speaker = speakerLabel(project, speakerRaw);
  const line = text.replace(/^["']+|["']+$/g, "").trim();
  if (!speaker || !line) return "";
  if (isVoiceoverSpeaker(project, speakerRaw) || isVoiceoverSpeaker(project, speaker)) {
    return `Off-screen narrator voice-over, no lipsync: "${line}"`;
  }
  const onScreen = sceneOnScreenNames(scene, project).some((name) => {
    const label = speakerLabel(project, name);
    return name.toLowerCase() === speakerRaw.trim().toLowerCase() || label.toLowerCase() === speaker.toLowerCase();
  });
  if (!onScreen) return `${speaker} voiceover: "${line}"`;
  return `${speaker} lipsyncs: "${line}"`;
}

function collapseRepeatedSays(text: string) {
  return text
    .replace(
      /(?:((?:the\s+)?[\p{L}\p{N}][\p{L}\p{N}'-]{0,24}(?:\s+[\p{L}\p{N}'-]{1,16}){0,4})\s+(?:says|lipsyncs|voiceover):\s*){2,}(?=")/giu,
      "$1 lipsyncs: ",
    )
    .replace(/(?:(?:Off-screen\s+)?Voiceover:\s*){2,}(?=")/gi, "Voiceover: ")
    .replace(
      /(\b[\p{L}\p{N}' -]{1,48}\s+(?:says|lipsyncs|voiceover):\s*"[^"]+"\.?\s*)\1+/giu,
      "$1",
    )
    .replace(/((?:Off-screen\s+)?Voiceover:\s*"[^"]+"\.?\s*)\1+/gi, "$1")
    .replace(/([.!?]\s+)(the\s+)/g, "$1The ");
}

function replaceSpeakerNames(text: string, project: Project) {
  let next = text;
  const names = [
    ...project.characters.map((item) => item.name),
    ...project.scenes.flatMap((scene) => scene.dialogue.map((line) => line.speaker)),
  ];
  const unique = [...new Set(names.map((name) => name.trim()).filter(Boolean))].sort((a, b) => b.length - a.length);
  for (const name of unique) {
    const label = speakerLabel(project, name);
    if (!label || label.toLowerCase() === name.toLowerCase()) continue;
    next = next.replace(new RegExp(escapeRegExp(name), "gi"), label);
  }
  return next;
}

function attributeDialogueInPrompt(prompt: string, project: Project, sceneIndexes: number[]) {
  let next = collapseRepeatedSays(replaceSpeakerNames(scrubSpanishSpeakerPhrases(prompt), project));
  for (const index of sceneIndexes) {
    const scene = sceneByIndex(project, index);
    for (const line of scene?.dialogue || []) {
      const speaker = speakerLabel(project, line.speaker || "");
      const text = (line.line || "").replace(/^["']+|["']+$/g, "").trim();
      if (!speaker || !text) continue;
      const quote = `"${text}"`;
      if (new RegExp(`(?:says|lipsyncs|voiceover|no lipsync):\\s*${escapeRegExp(quote)}`, "i").test(next)) continue;
      if (next.includes(quote)) next = next.replace(quote, spokenLineCue(project, scene, line.speaker || "", text));
    }
  }
  return collapseRepeatedSays(next).replace(/\s{2,}/g, " ").trim();
}

function ensureVisibleAction(summary: string) {
  let text = summary.trim();
  if (!text) return text;
  if (
    /\b(eat|eats|eating|chew|chews|swallow|swallows|takes a gummy|take a gummy|takes one|take one|puts it in (?:his|her|their) mouth)\b/i.test(
      text,
    ) &&
    !/\b(hand|picks? it|brings? it to|lifts? it to|puts? it (?:in|into) (?:his|her|their)?\s*mouth|chews)\b/i.test(text)
  ) {
    text +=
      " On camera, a hand takes it from the pack, lifts it to the mouth, and the character chews.";
  }
  return text;
}

function alreadyHas(text: string, lock: string) {
  return text.toLowerCase().includes(lock.slice(0, 28).toLowerCase());
}

function ensurePhysicalLogic(summary: string, context = "") {
  let text = summary.trim();
  if (!text) return text;
  const blob = `${text} ${context}`.toLowerCase();
  const locks: string[] = [];

  if (/\b(treadmill|running machine|caminadora)\b/.test(blob)) {
    locks.push(
      "Facing the console, running forward while the belt slides backward under the feet.",
    );
  }
  if (/\b(bike|bicycle|cycle|spin bike|stationary bike)\b/.test(blob)) {
    locks.push("Sit on the saddle facing the handlebars. Pedal forward so cranks and wheels turn the right way.");
  }
  if (/\b(car|truck|drive|driving|steering wheel)\b/.test(blob)) {
    locks.push("Sit facing the windshield with hands on the wheel. The vehicle moves the direction it is pointing.");
  }
  if (/\b(escalator)\b/.test(blob)) {
    locks.push("Stand facing the travel direction. Steps move under the feet the same way a real escalator does.");
  }
  if (/\b(stairs|staircase)\b/.test(blob) && /\b(walk|walks|running|run|climb|climbs|go up|goes up|go down|goes down)\b/.test(blob)) {
    locks.push("Feet plant on each step in the travel direction.");
  }
  if (/\b(pour|pours|pouring|spill|spills)\b/.test(blob)) {
    locks.push("Liquid leaves the opening and falls downward with gravity.");
  }
  if (/\b(swim|swimming|pool)\b/.test(blob)) {
    locks.push("The body is in the water. Arms and legs stroke forward in the travel direction.");
  }

  for (const lock of locks) {
    if (!alreadyHas(text, lock)) text += ` ${lock}`;
  }
  return text;
}

function scenePropCues(project: Project, sceneIndex: number) {
  return promptReadyReferences(project, [sceneIndex], true).filter(
    (item) => item.kind === "product" || item.kind === "logo" || item.kind === "location",
  );
}

const YOUNG_MARK = /\b(baby|kitten|puppy|newborn|infant|toddler|chiquit|beb[eé])\b/i;
const GROWN_MARK = /\b(grown|full[- ]grown|grew up|grows up|years later|time has passed|now grown)\b/i;

function montageBeats(summary: string) {
  const raw = summary.trim();
  if (!raw) return null;
  if (/\bCUT to\b/i.test(raw)) return null;
  const sentences = raw
    .split(/(?<=\.)\s+(?=[A-Z@])/)
    .map((item) => item.trim())
    .filter((item) => item.length > 8);
  const looksLikeMontage =
    /\b(time[- ]lapse|timelapse|montage|growth change|growing up|years (?:ago|later))\b/i.test(raw) ||
    (raw.match(/(?:^|\n)\s*[-•–]\s+/g) || []).length >= 2 ||
    (sentences.length >= 3 && YOUNG_MARK.test(raw) && GROWN_MARK.test(raw));
  if (!looksLikeMontage) return null;
  const rest = raw
    .replace(/^[\s\S]*?\b(time[- ]lapse|timelapse|montage)\b[^.]*\.?\s*/i, "")
    .replace(/\bThe moments flow[^.]*\.\s*/gi, "")
    .replace(/\bno extra dialogue[^.]*\.\s*/gi, "")
    .trim();
  const fromList = rest
    .split(/\n+|;\s+|(?:^|\n)\s*[-•–]\s+/)
    .map((item) => item.replace(/^[-•–]\s*/, "").trim())
    .filter(
      (item) =>
        item.length > 8 &&
        !/\b(time[- ]lapse|timelapse|uses distinct|bullet|compact montage)\b/i.test(item),
    );
  if (fromList.length >= 2) return fromList;
  const fromSentences = rest
    .split(/(?<=\.)\s+(?=[A-Z@])/)
    .map((item) => item.trim())
    .filter((item) => item.length > 8 && !/\b(time[- ]lapse|timelapse|compact montage)\b/i.test(item));
  return fromSentences.length >= 2 ? fromSentences : null;
}

function expandMontageAction(summary: string) {
  const beats = montageBeats(summary);
  if (!beats) return null;
  return beats
    .map((beat, index) => {
      const core = beat.replace(/\s+/g, " ").replace(/^[-•–]\s*/, "").replace(/[.]+$/, "").trim();
      if (index === 0) return `${core}.`;
      return `CUT to ${core}.`;
    })
    .join(" ");
}

function statesProductPlacement(text: string) {
  return /\b(worn on the character|not worn|not yet|not already on|held and used|close detail|sits far|first time here|only appears as this action)\b/i.test(
    text,
  );
}

function productPlacementLine(action: string, label: string) {
  const blob = action.toLowerCase();
  const name = label.trim() || "The attached product";
  if (/\b(first time|unbox|looking at the product|looks at the product|notices the product)\b/.test(blob)) {
    return `${name} is seen for the first time here, not worn and not already on the character.`;
  }
  if (/\b(worn|wearing|in (?:her|his|their) ears|puts (?:it|them) on|already wearing)\b/.test(blob)) {
    return `${name} is worn on the character in this shot.`;
  }
  if (/\b(holds? (?:the product|it|them)|holding (?:the product|it|them)|in (?:her|his|their) hand|picks? (?:it|them) up)\b/.test(blob)) {
    return `${name} is held and used by the character, not already worn.`;
  }
  if (/\b(close-?up|insert|macro)\b/.test(blob)) {
    return `${name} is a close detail, not worn.`;
  }
  if (/\b(far away|in the background|distant)\b/.test(blob)) {
    return `${name} sits far in the shot, not on a character.`;
  }
  return `${name} only appears as this action says, not worn unless the action puts it on the character.`;
}

function productCueLabel(label: string, notes: string) {
  const name = label.trim();
  if (name && !/^product\s*\d+$/i.test(name)) return name;
  const note = notes.trim();
  if (note && note.length <= 48 && !/^optional\b/i.test(note)) return note;
  return "The attached product";
}

export function stampProductPlacement(project: Project) {
  for (const scene of project.scenes) {
    const products = scenePropCues(project, scene.index).filter((item) => item.kind === "product");
    if (!products.length) continue;
    const blob = `${scene.summary} ${scene.title}`;
    if (statesProductPlacement(blob)) continue;
    const label = productCueLabel(products[0].label, products[0].notes || "");
    const sentence = productPlacementLine(blob, label);
    scene.summary = `${scene.summary.replace(/[. ]+$/, "").trim()}. ${sentence}`.replace(/\s{2,}/g, " ").trim();
  }
  return project;
}

function withOnScreenProps(action: string, project: Project, sceneIndex: number) {
  let next = action;
  for (const asset of scenePropCues(project, sceneIndex)) {
    const label = asset.label.trim();
    const needle = asset.kind === "product" ? productCueLabel(label, asset.notes || "") : label;
    if (!needle) continue;
    if (asset.kind === "product") {
      if (statesProductPlacement(next)) continue;
      next += ` ${productPlacementLine(next, needle)}`;
      continue;
    }
    if (new RegExp(escapeRegExp(needle), "i").test(next)) continue;
    if (asset.kind === "logo") next += ` ${needle} is visible.`;
    else next += ` at ${needle}.`;
  }
  return next;
}

function rewriteProductContainers(text: string, project: Project) {
  const products = (project.references || []).filter((item) => item.kind === "product");
  if (!products.length) {
    return text.replace(/\b(gummies?|creatine) (?:bottle|jar|tub|canister|flask)\b/gi, "$1 pack");
  }
  let next = text;
  for (const product of products) {
    const label = product.label.trim();
    if (!label || /^product\s*\d+$/i.test(label)) continue;
    next = next.replace(
      new RegExp(`${escapeRegExp(label)}(?:\\s+(?:bottle|jar|tub|canister|flask|jug))?`, "gi"),
      label,
    );
  }
  return next.replace(/\b(gummies?|creatine) (?:bottle|jar|tub|canister|flask)\b/gi, "$1 pack");
}

function replaceOutsideQuotes(text: string, pattern: RegExp, replacer: (match: string) => string) {
  const flags = pattern.flags.includes("g") ? pattern.flags : `${pattern.flags}g`;
  return text
    .split(/("(?:\\.|[^"\\])*")/)
    .map((part, index) => {
      if (index % 2 === 1) return part;
      return part.replace(new RegExp(pattern.source, flags), replacer);
    })
    .join("");
}

function applyInlineRefTags(text: string, images: PromptRef[], videos: PromptRef[], style: VisualStyle) {
  let next = text;
  const look = imageStyleLead(style);
  const used = new Set<string>();

  const replacements: Array<{ pattern: RegExp; tag: string; first?: string; always?: string }> = [];
  images.forEach((item, index) => {
    const tag = `@Image${index + 1}`;
    const name = item.name.trim();
    if (!name) return;
    if (item.kind === "product") {
      const aliases = [name, item.notes || "", "the attached product", "the product"]
        .map((value) => value.trim())
        .filter((value) => value.length >= 4 && value.length <= 48 && !/^product\s*\d+$/i.test(value));
      const unique = [...new Set(aliases)].sort((a, b) => b.length - a.length);
      for (const alias of unique) {
        replacements.push({
          pattern: new RegExp(`\\b${escapeRegExp(alias)}\\b`, "gi"),
          tag,
        });
      }
      return;
    }
    if (item.kind === "logo") {
      replacements.push({
        pattern: new RegExp(`\\b${escapeRegExp(name)}\\b`, "gi"),
        tag,
        first: `${tag} which is the ${name} logo, same mark as the attached photo, drawn in ${look}`,
      });
      return;
    }
    if (item.kind === "location") {
      replacements.push({
        pattern: new RegExp(`\\b${escapeRegExp(name)}\\b`, "gi"),
        tag,
        first: `${tag} which is the ${name} location from the attached photo, drawn in ${look}`,
      });
      return;
    }
    if (item.kind === "character") {
      replacements.push({
        pattern: new RegExp(`\\b${escapeRegExp(name)}\\b`, "gi"),
        tag,
      });
    }
  });
  videos.forEach((item, index) => {
    const name = item.name.trim();
    if (!name || item.kind === "narrator") return;
    const tag = `@Video${index + 1}`;
    replacements.push({
      pattern: new RegExp(`\\b${escapeRegExp(name)}\\b`, "gi"),
      tag,
      always:
        item.kind === "character"
          ? `${tag}, keep the same exact character, voice, gestures as the reference`
          : undefined,
    });
  });

  replacements.sort(
    (a, b) => b.pattern.source.length - a.pattern.source.length || Number(Boolean(b.always)) - Number(Boolean(a.always)),
  );
  for (const item of replacements) {
    next = replaceOutsideQuotes(next, item.pattern, () => {
      if (item.always) {
        used.add(item.tag);
        return item.always;
      }
      if (item.first && !used.has(item.tag)) {
        used.add(item.tag);
        return item.first;
      }
      used.add(item.tag);
      return item.tag;
    });
  }

  next = next.replace(/@(Image|Video)(\d+)\s+(?:bottle|jar|tub|canister|flask|jug)\b/gi, "@$1$2");

  return next.replace(/\s{2,}/g, " ").trim();
}

function splitPackedScenes(text: string) {
  const matches = [...text.matchAll(/\bSCENE\s+\d+\s*\(/gi)];
  if (!matches.length) return { prefix: "", blocks: [text] };
  const prefix = text.slice(0, matches[0].index).trim();
  const blocks = matches.map((match, index) => {
    const start = match.index || 0;
    const end = index + 1 < matches.length ? matches[index + 1].index || text.length : text.length;
    return text.slice(start, end).replace(/\s*CUT\.\s*$/i, "").trim();
  });
  return { prefix, blocks };
}

function ensurePropTagsInScenes(
  text: string,
  images: PromptRef[],
  project?: Project,
  sceneIndexes?: number[],
) {
  if (!project || !sceneIndexes?.length) return text;
  const props = images
    .map((item, index) => ({ item, tag: `@Image${index + 1}` }))
    .filter(({ item }) => item.kind === "product" || item.kind === "logo" || item.kind === "location");
  if (!props.length) return text;

  const { prefix, blocks } = splitPackedScenes(text);
  const next = blocks.map((part, index) => {
    const sceneIndex = sceneIndexes[index];
    if (!sceneIndex) return part;
    let sceneText = part;
    const needed = scenePropCues(project, sceneIndex);
    for (const { item, tag } of props) {
      const match = needed.some(
        (asset) =>
          asset.kind === item.kind && asset.label.trim().toLowerCase() === item.name.trim().toLowerCase(),
      );
      if (!match) continue;
      if (new RegExp(`${escapeRegExp(tag)}\\b`, "i").test(sceneText)) continue;
      if (item.kind === "product") {
        if (statesProductPlacement(sceneText)) continue;
        sceneText = `${sceneText.replace(/[. ]+$/, "")}. ${productPlacementLine(sceneText, tag)}`;
        continue;
      }
      sceneText = `${sceneText.replace(/[. ]+$/, "")}. ${tag}.`;
    }
    return sceneText;
  });
  const joined = next.join(" CUT. ");
  return prefix ? `${prefix} ${joined}` : joined;
}

function ensureSceneNoBgm(text: string) {
  const { prefix, blocks } = splitPackedScenes(text);
  const next = blocks.map((part) => {
    const physics = part.match(/\s+(Obey real-world physics:[\s\S]*)$/i);
    let scene = (physics ? part.slice(0, physics.index) : part).replace(/\s*CUT\.\s*$/i, "").trim();
    const tail = physics ? physics[1].trim() : "";
    scene = scene.replace(/\s*No background music\.?/gi, " ").replace(/\s*\[NO BGM\]/gi, " ").replace(/\s{2,}/g, " ").trim();
    const withBgm = `${scene.replace(/[. ]+$/, "")}. ${sceneAudioClose()}`;
    return tail ? `${withBgm} ${tail}` : withBgm;
  });
  const joined = next.join(" CUT. ");
  return prefix ? `${prefix} ${joined}` : joined;
}

type CompactPromptOptions = {
  project: Project;
  sceneIndexes: number[];
  maxSeconds?: number;
  images?: PromptRef[];
  videos?: PromptRef[];
};

type TagSwap = { names: string[]; tag: string; person?: boolean; exact?: boolean };

function fittedSeconds(scenes: Array<Scene | undefined>, maxSeconds?: number) {
  const budget = maxSeconds && maxSeconds > 0 ? maxSeconds : 0;
  const raw = scenes.map((scene) => Math.max(2, scene?.estimatedSeconds || 4));
  const sum = raw.reduce((total, value) => total + value, 0);
  return budget > 0 && sum > budget
    ? raw.map((value) => Math.max(2, Math.round((value / sum) * budget)))
    : raw.map((value) => Math.round(value));
}

function cleanPlace(value: string) {
  return value.trim().replace(/^(?:still\s+)?(?:in\s+)?(?:the\s+)?same\s+/i, "").replace(/[.\s]+$/, "");
}

function aspectLabel(aspect?: string) {
  if (aspect === "9:16") return "9:16 vertical";
  if (aspect === "1:1") return "1:1 square";
  return "16:9 horizontal";
}

function cameraTitle(camera: string) {
  return camera
    .replace(/\beye level\b/i, "eye-level")
    .split(/,\s*/)
    .filter(Boolean)
    .join(" ")
    .replace(/(^|[\s-])([a-z])/g, (_, prefix: string, letter: string) => `${prefix}${letter.toUpperCase()}`);
}

function buildTags(project: Project, images: PromptRef[], videos: PromptRef[]) {
  const people = new Map<string, string>();
  const refs: string[] = [];
  const swaps: TagSwap[] = [];
  let narratorTag = "";
  videos.forEach((item, index) => {
    const tag = `@Video${index + 1}`;
    const key = item.name.trim().toLowerCase();
    if (item.kind === "narrator") {
      narratorTag = tag;
      refs.push(`${tag} is the narrator's voice only: an off-screen voice-over, never shown, with no lipsync; use its voice, none of its images`);
    } else if (item.kind === "character" && key) people.set(key, tag);
    else refs.push(`${tag} is the previous clip; match its voices and look`);
  });
  images.forEach((item, index) => {
    const tag = `@Image${index + 1}`;
    const name = item.name.trim();
    if (!name) return;
    if (item.kind === "character") {
      if (!people.has(name.toLowerCase())) people.set(name.toLowerCase(), tag);
      return;
    }
    if (item.kind === "product") refs.push(`${tag} is ${productCueLabel(name, item.notes || "")}, same packaging`);
    else if (item.kind === "logo") refs.push(`${tag} is the ${name} logo`);
    else refs.push(`${tag} is ${name}`);
    const aliases =
      item.kind === "product"
        ? [name, item.notes || "", "the attached product", "the product"]
        : item.kind === "location"
          ? placeAliases(project, name)
          : [name];
    swaps.push({
      tag,
      names: aliases
        .map((value) => value.trim())
        .filter((value) => value.length >= 3 && value.length <= 48 && !/^product\s*\d+$/i.test(value)),
    });
  });
  const placeWords = project.scenes.map((scene) => scene.location || "").join(" ").toLowerCase();
  for (const [key, tag] of people) {
    const full = project.characters.find((item) => item.name.trim().toLowerCase() === key)?.name.trim() || key;
    const first = full.split(/\s+/)[0];
    const firstIsUnique =
      first.length >= 3 &&
      first !== full &&
      project.characters.filter((item) => item.name.trim().split(/\s+/)[0].toLowerCase() === first.toLowerCase()).length === 1;
    const names = firstIsUnique ? [full, first] : [full];
    // A role named after a place word ("Gym" in "home gym") only matches when capitalized.
    const exact = names.some((name) => new RegExp(`\\b${escapeRegExp(name.toLowerCase())}\\b`).test(placeWords));
    swaps.push({ tag, names, person: true, exact });
  }
  return { people, refs, swaps, narratorTag };
}

function realismRules(project: Project, sceneIndexes: number[], narrated: boolean) {
  const continues = Boolean(project.scenes.length && sceneIndexes[0] !== project.scenes[0]?.index);
  return [
    "RULES —",
    "Real-world physics: gravity pulls down, weight rests on what supports it, and bodies and objects stay solid, never passing through each other or the set.",
    "Each character is one body, once per frame, with the same face, outfit and scale in every shot.",
    continues ? "This clip picks up straight from the previous part: same wardrobe, props, light and time of day." : "",
    "Continuity: each shot starts where the last one ended, with the same positions, screen sides, props and light.",
    "Objects are picked up on camera before use and stay in the same hand until put down.",
    "People and props enter and leave on camera; nothing appears, vanishes or teleports.",
    "Eyes follow the person being addressed.",
    narrated ? "Only on-screen speakers lipsync; narration is off-screen voice-over." : "Only the speaking character lipsyncs.",
  ]
    .filter(Boolean)
    .join(" ");
}

// The setting line already names the place, so a sentence that only restates it is dropped.
function withoutPlaceRestatement(text: string, images: PromptRef[]) {
  const tags = images.map((item, index) => (item.kind === "location" ? `@Image${index + 1}` : "")).filter(Boolean);
  if (!tags.length) return text;
  return text
    .replace(/\b(?:a|an|the)\s+(@Image\d+)/gi, "$1")
    .split(/(?<=[.!?])\s+/)
    .filter((sentence) => {
      const lead = tags.find((tag) => sentence.startsWith(tag));
      if (!lead) return true;
      return /@(?:Video|Image)\d+/.test(sentence.slice(lead.length));
    })
    .join(" ");
}

function settingLine(place: string, images: PromptRef[], fresh: boolean) {
  if (!place) return "";
  const index = images.findIndex((item) => item.kind === "location" && samePlace(item.name, place));
  const tag = index >= 0 ? `@Image${index + 1}` : "";
  if (fresh) return tag ? `Location: ${tag}, ${place}.` : `Location: ${place}.`;
  return tag ? `Still in ${tag}.` : `Still in ${place}.`;
}

function placeCore(value: string) {
  return cleanPlace(value).split(/,|\s+(?:matching|during|at|with)\s+/i)[0].trim();
}

function placeAliases(project: Project, name: string) {
  const core = placeCore;
  const matching = project.scenes.map((scene) => scene.location || "").filter((place) => place && samePlace(place, name));
  return [...new Set([name, cleanPlace(name), core(name), ...matching.flatMap((place) => [cleanPlace(place), core(place)])])].filter(
    (value) => value.length >= 4,
  );
}

function applyTags(text: string, swaps: TagSwap[]) {
  const pairs = swaps
    .flatMap((swap) => swap.names.map((name) => ({ name, tag: swap.tag, exact: Boolean(swap.exact) })))
    .sort((a, b) => b.name.length - a.name.length);
  let next = text;
  for (const { name, tag, exact } of pairs) {
    const pattern = exact
      ? new RegExp(`(?<![@\\w])(?:[Tt]he\\s+)?${escapeRegExp(name)}\\b`, "g")
      : new RegExp(`(?<![@\\w])(?:the\\s+)?${escapeRegExp(name)}\\b`, "gi");
    next = replaceOutsideQuotes(next, pattern, () => tag);
  }
  for (const swap of swaps) {
    if (!swap.person) continue;
    // "Gym Buddy" or "Gummy Mascot" leave a stray title word after the tag.
    next = next.replace(new RegExp(`${escapeRegExp(swap.tag)}\\s+(?!I\\b)[A-Z][a-z]{2,}\\b(?=[\\s,.;:!?'’]|$)`, "g"), swap.tag);
  }
  return next
    .replace(/\b[Ss]ame\s+(@Image\d+)/g, "$1")
    .replace(/@(Image|Video)(\d+)\s+(?:bottle|jar|tub|canister|flask|jug)\b/gi, "@$1$2");
}

function withoutQuotedDialogue(summary: string, scene?: Scene) {
  let next = summary;
  for (const line of scene?.dialogue || []) {
    const text = (line.line || "").replace(/^["']+|["']+$/g, "").trim();
    if (!text) continue;
    const quote = `["“]${escapeRegExp(text)}["”]`;
    next = next
      .replace(new RegExp(`\\b(?:says|asks|whispers|shouts|yells|replies|mutters|exclaims|lipsyncs)[:,]?\\s*${quote}`, "gi"), "speaks.")
      .replace(new RegExp(quote, "g"), "");
  }
  return next
    .replace(/\s+([.,!?])/g, "$1")
    .replace(/\.[.,]+/g, (match) => (match.includes(",") ? "," : "."))
    .replace(/\s{2,}/g, " ")
    .trim();
}

function dialogueBlock(project: Project, scene: Scene | undefined, people: Map<string, string>, narratorTag = "") {
  const onScreen = sceneOnScreenNames(scene, project).map((name) => name.toLowerCase());
  let previousLabel = "";
  const parts: string[] = [];
  for (const entry of scene?.dialogue || []) {
    const text = (entry.line || "").replace(/^["']+|["']+$/g, "").trim();
    if (!entry.speaker || !text) continue;
    let label: string;
    if (isVoiceoverSpeaker(project, entry.speaker)) {
      label = `Narrator${narratorTag ? ` (${narratorTag} voice)` : ""} voice-over (off-screen, no lipsync, mouths closed):`;
    } else {
      const character = findSpeakerCharacter(project, entry.speaker);
      const name = character?.name || entry.speaker;
      const who = people.get(name.trim().toLowerCase()) || speakerLabel(project, entry.speaker);
      label = onScreen.includes(name.trim().toLowerCase()) ? `${who} lipsyncs:` : `${who} (off-screen voice):`;
    }
    parts.push(label === previousLabel ? `"${text}"` : `${label} "${text}"`);
    previousLabel = label;
  }
  return parts.length ? `Dialogue: ${parts.join(" / ")}` : "";
}

function stagingLines(scene: Scene | undefined, project: Project, camera: string) {
  const names = sceneOnScreenNames(scene, project);
  const lines: string[] = [];
  if (/over the shoulder/i.test(camera) && names.length >= 2) {
    lines.push(`Camera over ${names[0]}'s shoulder, facing ${names[1]}.`);
  }
  const blob = `${scene?.summary || ""} ${scene?.title || ""}`;
  if (names.length >= 2 && !/\b(fourth wall|to camera|into the (?:camera|lens)|looks? (?:at|into) (?:the )?(?:camera|lens))\b/i.test(blob)) {
    const spoken = (scene?.dialogue || []).find(
      (line) => line.speaker && !isVoiceoverSpeaker(project, line.speaker) && names.some((name) => name.toLowerCase() === line.speaker.trim().toLowerCase()),
    );
    const speaker = spoken ? names.find((name) => name.toLowerCase() === spoken.speaker.trim().toLowerCase()) : undefined;
    const others = speaker ? names.filter((name) => name.toLowerCase() !== speaker.toLowerCase()) : [];
    if (speaker && others.length) {
      const listeners = others.length === 1 ? others[0] : `${others.slice(0, -1).join(", ")} and ${others[others.length - 1]}`;
      lines.push(`${speaker} looks at ${listeners} while speaking.`);
    }
  }
  if (names.length >= 2 && /\b(chas(?:e|es|ing)|pursu(?:e|es|ing)|hunts?|lunges? at|runs? after|goes? after)\b/i.test(blob)) {
    lines.push(`The chase heads toward ${names[names.length - 1]}.`);
  }
  return lines;
}

export function compactVideoPrompt(options: CompactPromptOptions) {
  const { project, sceneIndexes } = options;
  const { people, refs, swaps, narratorTag } = buildTags(project, options.images || [], options.videos || []);
  const scenes = sceneIndexes.map((index) => sceneByIndex(project, index));
  const seconds = fittedSeconds(scenes, options.maxSeconds);
  const shots = continuityPass(project);
  const look = project.style === "claymation" ? "Claymation" : "Pixar";

  const places: string[] = [];
  for (const scene of scenes) {
    const place = cleanPlace(scene?.location || "");
    if (place && !places.some((item) => samePlace(item, place))) places.push(place);
  }
  const placeTag = (place: string) => {
    const index = (options.images || []).findIndex((item) => item.kind === "location" && samePlace(item.name, place));
    return index >= 0 ? `${place} (@Image${index + 1})` : place;
  };
  const setting =
    places.length === 1
      ? `Setting: ${placeTag(places[0])}`
      : places.length
        ? `Settings: ${places.map(placeTag).join(", then ")}`
        : "One continuous setting";

  const leads: string[] = [];
  let narrated = false;
  for (const scene of scenes) {
    for (const name of sceneOnScreenNames(scene, project)) {
      if (!leads.some((item) => item.toLowerCase() === name.toLowerCase())) leads.push(name);
    }
    for (const line of scene?.dialogue || []) {
      if (!line.speaker) continue;
      if (isVoiceoverSpeaker(project, line.speaker)) {
        narrated = true;
        continue;
      }
      const name = findSpeakerCharacter(project, line.speaker)?.name || line.speaker.trim();
      if (!leads.some((item) => item.toLowerCase() === name.toLowerCase())) leads.push(name);
    }
  }
  const cast = leads.map((name) => {
    const tag = people.get(name.toLowerCase());
    const role = characterRole(project, name);
    const label = speakerLabel(project, name);
    const who = tag ? `${tag} as ${label}` : label;
    return role ? `${who} (${role})` : who;
  });
  if (narrated) {
    cast.push(narratorTag ? `Narrator (${narratorTag} voice): off-screen voice-over only, no lipsync` : "Narrator: off-screen voice-over only");
  }
  const extras = [...new Set(scenes.flatMap((scene) => (scene?.extraNames || []).map((name) => englishExtraName(name)).filter(Boolean)))];

  const header = [
    `GLOBAL: ${look} style, ${aspectLabel(project.aspectRatio)}. ${setting}, consistent lighting and spatial orientation. Each character keeps the same face, outfit, and footwear in every shot. Audio: dialogue and natural ambient sound only; each scene's lines play inside that scene, after the speaker appears.`,
    realismRules(project, sceneIndexes, narrated),
    cast.length ? `CHARACTERS: ${cast.join("; ")}.${extras.length ? ` Background extras: ${extras.join(", ")}.` : ""}` : "",
    refs.length ? `REFERENCES: ${refs.join("; ")}.` : "",
  ].filter(Boolean);

  const usedCameras: string[] = [];
  let lastPlace = "";
  const blocks = sceneIndexes.map((index, i) => {
    const scene = scenes[i];
    const camera = safeCinematicCamera(scene, CAMERA_VARIETY[i % CAMERA_VARIETY.length], usedCameras, project);
    usedCameras.push(camera);
    const summary = withoutQuotedDialogue(rewriteProductContainers(scene?.summary || scene?.title || "", project), scene);
    const space = `${scene?.title || ""} ${scene?.location || ""}`;
    const action = withOnScreenProps(expandMontageAction(summary) || ensurePhysicalLogic(ensureVisibleAction(summary), space), project, index);
    const place = cleanPlace(scene?.location || "");
    const moved = places.length > 1 && place && !samePlace(place, lastPlace || "");
    if (place) lastPlace = place;
    const body = [action, ...stagingLines(scene, project, camera), ...(shots.get(index)?.locks || [])]
      .map((part) => part.trim())
      .filter(Boolean)
      .map((part) => (/[.!?]$/.test(part) ? part : `${part}.`))
      .join(" ");
    const tagged = scrubSpanishSpeakerPhrases(replaceSpeakerNames(applyTags(body, swaps), project));
    const text = `${moved ? settingLine(place, options.images || [], true) : ""} ${withoutPlaceRestatement(tagged, options.images || [])}`.trim();
    const dialogue = dialogueBlock(project, scene, people, narratorTag);
    return [`SCENE ${i + 1} (${seconds[i]}s) — ${cameraTitle(camera)}:`, text, dialogue].filter(Boolean).join("\n");
  });

  return [header.join("\n"), ...blocks].join("\n\n").replace(/[ \t]{2,}/g, " ").trim();
}

function exactSeconds(scenes: Array<Scene | undefined>, total?: number) {
  const raw = scenes.map((scene) => Math.max(1.5, scene?.estimatedSeconds || 4));
  const sum = raw.reduce((acc, value) => acc + value, 0);
  const target = total && total > 0 ? total : sum;
  const scaled = raw.map((value) => Math.round((value / sum) * target * 10) / 10);
  const drift = Math.round((target - scaled.reduce((acc, value) => acc + value, 0)) * 10) / 10;
  if (scaled.length) scaled[scaled.length - 1] = Math.round((scaled[scaled.length - 1] + drift) * 10) / 10;
  return { durations: scaled, total: target };
}

function secondsLabel(value: number) {
  return `${value.toFixed(2)}s`;
}

function spokenLanguage(project: Project) {
  const lines = project.scenes.flatMap((scene) => scene.dialogue.map((line) => line.line)).join(" ");
  if (!lines.trim()) return { label: "ENGLISH", speech: "American English" };
  const spanish =
    /[ñ¿¡áéíóú]/i.test(lines) ||
    (lines.match(/\b(que|el|la|los|las|de|y|es|no|por|para|con|pero|como|está|estoy|yo|tú|qué)\b/gi) || []).length >
      (lines.match(/\b(the|and|is|you|to|of|it|that|what|this|are|not|with|but)\b/gi) || []).length;
  return spanish ? { label: "SPANISH", speech: "natural Latin American Spanish" } : { label: "ENGLISH", speech: "American English" };
}

function wordsIn(text: string) {
  return text.split(/\s+/).filter(Boolean).length;
}

function shotTitle(scene: Scene | undefined, index: number) {
  const title = (scene?.title || "").replace(/[."]+$/g, "").trim();
  return (title || `Shot ${index + 1}`).toUpperCase();
}

function voiceDescription(project: Project, name: string) {
  const character = findSpeakerCharacter(project, name);
  const notes = (character?.voiceNotes || "").trim();
  if (notes) return notes.replace(/[. ]+$/, "");
  const who = (character?.description || "")
    .replace(/\b(claymation|pixar|stop-motion)\s+(style\s+)?/gi, "")
    .split(/[.;,]|\bwith\b|\bwearing\b/i)[0]
    .trim()
    .split(/\s+/)
    .slice(0, 6)
    .join(" ");
  return who ? `natural and clear, the voice of a ${who.replace(/^(?:a|an|the)\s+/i, "")}` : "natural and clear";
}

export function directorBriefPrompt(options: CompactPromptOptions) {
  const { project, sceneIndexes } = options;
  const images = options.images || [];
  const videos = options.videos || [];
  const { people, swaps, narratorTag } = buildTags(project, images, videos);
  const scenes = sceneIndexes.map((index) => sceneByIndex(project, index));
  const { durations, total } = exactSeconds(scenes, options.maxSeconds);
  const shots = continuityPass(project);
  const look = project.style === "claymation" ? "Claymation" : "Pixar";
  const language = spokenLanguage(project);
  const tagOf = (name: string) => people.get(name.trim().toLowerCase());
  const nameWithTag = (name: string) => {
    const tag = tagOf(name);
    const label = speakerLabel(project, name);
    return tag ? `${label.toUpperCase()} (${tag})` : label.toUpperCase();
  };

  const starts: number[] = [];
  durations.reduce((acc, value) => {
    starts.push(acc);
    return Math.round((acc + value) * 100) / 100;
  }, 0);
  const cuts = starts.slice(1);
  const cutList = cuts.map(secondsLabel);
  const cutSentence =
    cuts.length > 1
      ? `One generation, ${scenes.length} shots: hard cuts at ${cutList.slice(0, -1).join(", ")} and ${cutList[cutList.length - 1]} — this is the complete cut list.`
      : cuts.length
        ? `One generation, 2 shots: a single hard cut at ${cutList[0]} — this is the complete cut list.`
        : "One generation, one continuous shot with no cuts.";
  const aspect = project.aspectRatio === "9:16" ? "9:16" : "16:9";
  const header = `${Math.round(total)} seconds, ${aspect}, 24fps. ${cutSentence} LANGUAGE: ${language.label}. Every spoken word is ${language.speech}, spoken by native speakers.`;

  const speakers = new Map<string, { onCamera: number[]; offCamera: number[]; narrator: boolean }>();
  scenes.forEach((scene, i) => {
    const onScreen = sceneOnScreenNames(scene, project).map((name) => name.toLowerCase());
    for (const line of scene?.dialogue || []) {
      if (!line.speaker || !line.line) continue;
      const narrator = isVoiceoverSpeaker(project, line.speaker);
      const name = narrator ? "Narrator" : findSpeakerCharacter(project, line.speaker)?.name || line.speaker.trim();
      const entry = speakers.get(name) || { onCamera: [], offCamera: [], narrator };
      const list = !narrator && onScreen.includes(name.toLowerCase()) ? entry.onCamera : entry.offCamera;
      if (!list.includes(i + 1)) list.push(i + 1);
      speakers.set(name, entry);
    }
  });
  const shotList = (values: number[]) =>
    values.length === 1 ? `shot ${values[0]}` : `shots ${values.slice(0, -1).join(", ")} and ${values[values.length - 1]}`;
  const voiceBlocks = [...speakers.entries()].map(([name, entry]) => {
    if (entry.narrator) {
      const source = narratorTag
        ? ` The narrator's voice is ${narratorTag}: an off-screen voice-over reference, audio only. Use its voice; none of its images appear in the film.`
        : "";
      return `VOICE — NARRATOR (this description holds for every narrated word)\nThe narrator is never on screen and has no body in the film. Voice: ${narratorVoiceNotes(project)}.${source} Narration is voice-over only, with no lipsync: every mouth on screen stays closed while the narrator speaks. This exact voice, every line, every generation.`;
    }
    const tag = tagOf(name);
    const where = [
      entry.onCamera.length ? `in ${shotList(entry.onCamera)} ${speakerLabel(project, name)} speaks on camera, lips forming every word` : "",
      entry.offCamera.length ? `in ${shotList(entry.offCamera)} the voice is heard off screen` : "",
    ]
      .filter(Boolean)
      .join("; ");
    const source = tag?.startsWith("@Video") ? `, the same voice heard in ${tag}` : "";
    return `VOICE — ${speakerLabel(project, name).toUpperCase()} (this description holds for every word, off screen and on)\nThe speaker is ${speakerLabel(project, name)}${tag ? `, shown in ${tag}` : ""}. ${where.charAt(0).toUpperCase()}${where.slice(1)}, and it is audibly the same person. Voice: ${voiceDescription(project, name)}${source}. An even, natural pace, about three words per second; a small inhale before each sentence and a settled landing at its end. This exact voice, every line, every generation.`;
  });

  const assets: string[] = [];
  videos.forEach((item, index) => {
    const tag = `@Video${index + 1}`;
    if (item.kind === "character") {
      const outfit = characterRole(project, item.name);
      assets.push(`${tag} as character and voice reference — ${speakerLabel(project, item.name).toUpperCase()}${outfit ? ` (${outfit})` : ""}. Keep face geometry, hair, skin, outfit, footwear and voice identical in every frame this character appears.`);
    } else if (item.kind === "narrator") {
      assets.push(`${tag} as the NARRATOR voice reference — audio only. This is the narrator's voice: an off-screen voice-over with no lipsync. No one on screen is the narrator, and none of its images appear.`);
    } else {
      assets.push(`${tag} as the previous clip — match its characters, voices, light and grade.`);
    }
  });
  images.forEach((item, index) => {
    const tag = `@Image${index + 1}`;
    const name = item.name.trim();
    if (item.kind === "character") {
      const outfit = characterRole(project, name);
      assets.push(`${tag} as character reference — ${speakerLabel(project, name).toUpperCase()}${outfit ? ` (${outfit})` : ""}. Keep face geometry, hair, skin, outfit and footwear identical in every frame this character appears.`);
    } else if (item.kind === "location") {
      assets.push(`${tag} as the location — ${placeCore(name) || name}. Geography and layout are law in every shot set here; each shot sets its own light.`);
    } else if (item.kind === "product") {
      assets.push(`${tag} as the product — ${productCueLabel(name, item.notes || "")}. Same packaging form, label, colours and branding every time it appears.`);
    } else if (item.kind === "logo") {
      assets.push(`${tag} as the logo — ${name}. Same mark and colours wherever it appears, placed as a physical object in the world.`);
    } else if (name) {
      assets.push(`${tag} as ${name}.`);
    }
  });
  const extras = [...new Set(scenes.flatMap((scene) => (scene?.extraNames || []).map((name) => englishExtraName(name)).filter(Boolean)))];
  if (extras.length) assets.push(`Background people: ${extras.join(", ")} — present only in the shots that name them.`);

  const beats = scenes
    .map((scene) => {
      const title = (scene?.title || "").trim();
      if (title) return title.replace(/[.]+$/, "");
      return (scene?.summary || "").split(/(?<=[.!?])\s+/)[0].split(/\s+/).slice(0, 16).join(" ").replace(/[.]+$/, "");
    })
    .filter(Boolean);
  const summary = `A ${look.toLowerCase()} short${project.title ? `, "${project.title}"` : ""}: ${applyTags(beats.join(" — then "), swaps)}.`;

  const lens =
    project.style === "claymation"
      ? "Stop-motion claymation throughout: hand-sculpted clay with visible fingerprints and tool marks, miniature sets with real-scale textures, soft practical lighting, the slight frame-to-frame shimmer of handmade animation, shallow miniature depth of field. Each shot keeps its location's palette and light."
      : "Pixar-style 3D animation throughout: soft global illumination, subsurface skin, rounded appealing shapes, expressive eyes, clean readable silhouettes; filmic depth of field with soft round bokeh; gentle motion blur at a 180° shutter. Each shot keeps its location's palette and light.";

  const usedCameras: string[] = [];
  let lastPlace = "";
  const places: string[] = [];
  const timing = scenes.map((scene, i) => {
    const index = sceneIndexes[i];
    const start = starts[i];
    const end = Math.round((start + durations[i]) * 100) / 100;
    const camera = safeCinematicCamera(scene, CAMERA_VARIETY[i % CAMERA_VARIETY.length], usedCameras, project);
    usedCameras.push(camera);
    const place = cleanPlace(scene?.location || "");
    if (place && !places.some((item) => samePlace(item, place))) places.push(place);
    const moved = place && !samePlace(place, lastPlace || "");
    if (place) lastPlace = place;
    const summaryText = withoutQuotedDialogue(rewriteProductContainers(scene?.summary || scene?.title || "", project), scene);
    const space = `${scene?.title || ""} ${scene?.location || ""}`;
    const action = withOnScreenProps(
      expandMontageAction(summaryText) || ensurePhysicalLogic(ensureVisibleAction(summaryText), space),
      project,
      index,
    );
    const shot = shots.get(index);
    const body = [action, ...stagingLines(scene, project, camera), ...(shot?.locks || [])]
      .map((part) => part.trim())
      .filter(Boolean)
      .map((part) => (/[.!?]$/.test(part) ? part : `${part}.`))
      .join(" ");
    const tagged = scrubSpanishSpeakerPhrases(replaceSpeakerNames(applyTags(body, swaps), project)).replace(/\bCUT to\s+/g, "Then ");
    const visual = `${settingLine(place, images, Boolean(moved) || i === 0)} ${withoutPlaceRestatement(tagged, images)}`.trim();

    const onScreen = sceneOnScreenNames(scene, project).map((name) => name.toLowerCase());
    const lines = (scene?.dialogue || []).filter((line) => line.speaker && line.line);
    const window = end - start;
    let cursor = start + (shot?.revealFirst ? window * 0.35 : Math.min(0.3, window * 0.1));
    const needed = lines.reduce((acc, line) => acc + Math.max(1, wordsIn(line.line) / 2.8) + 0.2, 0);
    const room = Math.max(0.5, end - 0.1 - cursor);
    const squeeze = needed > room ? room / needed : 1;
    const spoken = lines.map((line) => {
      const text = line.line.replace(/^["']+|["']+$/g, "").trim();
      const span = Math.max(1, wordsIn(text) / 2.8) * squeeze;
      const from = cursor;
      const to = Math.min(end - 0.05, from + span);
      cursor = to + 0.2 * squeeze;
      const range = `(${secondsLabel(from)}–${secondsLabel(to)})`;
      if (isVoiceoverSpeaker(project, line.speaker)) {
        return `NARRATOR${narratorTag ? ` (${narratorTag})` : ""} voice-over, off screen, no lipsync, every mouth on screen closed: {${text}} ${range}.`;
      }
      const name = findSpeakerCharacter(project, line.speaker)?.name || line.speaker.trim();
      const who = nameWithTag(name);
      return onScreen.includes(name.toLowerCase())
        ? `${who} speaks on camera, lips forming every word: {${text}} ${range}.`
        : `${who}'s voice, heard off screen: {${text}} ${range}.`;
    });

    const heading = `${secondsLabel(start)}–${secondsLabel(end)} — SHOT ${i + 1} · ${shotTitle(scene, i)}${i ? ` — hard cut at ${secondsLabel(start)}` : ""}`;
    return [heading, `${cameraTitle(camera)}. ${visual}`, ...spoken].join("\n");
  });

  const audio = `AUDIO MASTER — the entire ${Math.round(total)} seconds\nProduction audio only: the natural ambience of ${places.length ? places.join(", then ") : "each location"}, footsteps, cloth and prop sounds that match the action. Every spoken line lands inside its stated second-range per the VOICE blocks; every silence has an ambient bed. No music, no score, no instruments anywhere in the clip.`;

  const identity = [...new Set(scenes.flatMap((scene) => sceneOnScreenNames(scene, project)))]
    .map((name) => {
      const tag = tagOf(name);
      return tag ? `${speakerLabel(project, name)}'s face, hair, outfit and footwear match ${tag} in every frame they appear.` : "";
    })
    .filter(Boolean)
    .join(" ");
  const constraints = [
    `CONSTRAINTS — hold for the entire ${Math.round(total)} seconds`,
    [
      `${look} style throughout.`,
      cuts.length > 1
        ? `The cuts at ${cutList.join(", ")} are the complete cut list.`
        : cuts.length
          ? `The cut at ${cutList[0]} is the only cut.`
          : "The clip is one continuous shot.",
      identity,
      "Each line is spoken inside its own shot's second-range, after its speaker is on screen.",
      [...speakers.values()].some((entry) => entry.narrator)
        ? `Narrator lines are off-screen voice-over${narratorTag ? ` in the ${narratorTag} voice` : ""}, with no lipsync and every mouth closed.`
        : "",
      "Light direction holds steady within each shot.",
    ]
      .filter(Boolean)
      .join(" "),
  ].join("\n");

  return [
    header,
    realismRules(project, sceneIndexes, [...speakers.values()].some((entry) => entry.narrator)),
    ...voiceBlocks,
    assets.length ? `ASSETS\n${assets.join("\n")}` : "",
    `SUMMARY\n${summary}`,
    `LENS AND GRADE\n${lens}`,
    `TIMING\n${timing.join("\n")}`,
    audio,
    constraints,
  ]
    .filter(Boolean)
    .join("\n")
    .replace(/[ \t]{2,}/g, " ")
    .trim();
}

function assetTags(swaps: TagSwap[]) {
  return [...new Set(swaps.filter((swap) => !swap.person).map((swap) => swap.tag))];
}

function dropPlaceOnlySentences(text: string, locationTags: string[]) {
  if (!locationTags.length) return text;
  return text
    .split(/(?<=[.!?])\s+/)
    .filter((sentence) => {
      const tags = sentence.match(/@(?:Image|Video)\d+/g) || [];
      return !(tags.length && tags.every((tag) => locationTags.includes(tag)));
    })
    .join(" ");
}

function imageKind(images: PromptRef[], tag: string) {
  const index = Number(tag.replace("@Image", "")) - 1;
  return images[index]?.kind || "";
}

function seenPhrase(tag: string, kind: string, look: string) {
  if (kind === "product") return `as seen in ${tag}, in ${look} style`;
  return `as seen in ${tag}`;
}

const PLACE_SPOT =
  /\b((?:in|on|at|by|near|behind|beside|under|inside|next to|in front of)\s+(?:the\s+|her\s+|his\s+|their\s+)?(?:driver'?s seat|passenger seat|front seat|back seat|counter|bar|window|doorway|table|rack|bench|sofa|couch|desk|stage|corner|wheel|windshield|entrance|stairs|treadmill|seat))/i;

function markAsSeen(text: string, tags: string[], images: PromptRef[], look: string) {
  let next = text;
  for (const tag of tags) {
    const phrase = seenPhrase(tag, imageKind(images, tag), look);
    next = next.replace(new RegExp(`\\b(?:a|an|the|at|in|inside|within|same)\\s+${escapeRegExp(tag)}\\b`, "gi"), phrase);
    next = next.replace(new RegExp(`(?<!as seen in )${escapeRegExp(tag)}\\b`, "g"), phrase);
  }
  return next
    .replace(/(?:\s*,?\s*as seen in @Image\d+(?:, in (?:Pixar|Claymation) style)?){2,}/gi, (match) => {
      const unique = [...new Set(match.match(/@Image\d+/g) || [])];
      return unique.map((tag) => `, ${seenPhrase(tag, imageKind(images, tag), look)}`).join("");
    })
    .replace(/\s{2,}/g, " ")
    .replace(/\s+([,.])/g, "$1")
    .trim();
}

function attachPlaceSpot(text: string, tag: string) {
  if (new RegExp(`as seen in ${escapeRegExp(tag)}\\b`, "i").test(text)) return { text, attached: true };
  const match = text.match(PLACE_SPOT);
  if (!match || match.index === undefined) return { text, attached: false };
  const spot = match[1];
  const after = text.slice(match.index + spot.length);
  const tail = /^[.!?]/.test(after) ? "" : ",";
  return { text: `${text.slice(0, match.index)}${spot}, as seen in ${tag}${tail}${after}`, attached: true };
}

function ensureAsSeen(text: string, tags: string[], images: PromptRef[], look: string) {
  let next = text;
  const missing: string[] = [];
  for (const tag of tags) {
    if (imageKind(images, tag) === "location") {
      const spot = attachPlaceSpot(next, tag);
      next = spot.text;
      if (spot.attached) continue;
    }
    if (new RegExp(`as seen in ${escapeRegExp(tag)}\\b`, "i").test(next)) continue;
    missing.push(tag);
  }
  if (!missing.length) return next;
  const sentence = missing.map((tag) => seenPhrase(tag, imageKind(images, tag), look)).join(" and ");
  const body = next.replace(/[. ]+$/, "");
  const line = sentence.charAt(0).toUpperCase() + sentence.slice(1);
  return body ? `${body}. ${line}.` : `${line}.`;
}

function sceneAssetTags(project: Project, scene: Scene | undefined, images: PromptRef[]) {
  if (!scene) return [];
  const place = scene.location || "";
  const cues = scenePropCues(project, scene.index);
  const tags: string[] = [];
  images.forEach((item, index) => {
    const tag = `@Image${index + 1}`;
    if (item.kind === "location" && place && samePlace(item.name, place)) tags.push(tag);
    else if (
      (item.kind === "product" || item.kind === "logo") &&
      cues.some((cue) => cue.kind === item.kind && cue.label.trim().toLowerCase() === item.name.trim().toLowerCase())
    ) {
      tags.push(tag);
    }
  });
  return tags;
}

function participateLine(names: string[], people: Map<string, string>, project: Project) {
  const tags = names.map((name) => people.get(name.toLowerCase()) || speakerLabel(project, name)).filter(Boolean);
  if (!tags.length) return "";
  if (tags.length === 1) return `Only ${tags[0]} participates in this scene.`;
  const list = tags.length === 2 ? `${tags[0]} and ${tags[1]}` : `${tags.slice(0, -1).join(", ")} and ${tags[tags.length - 1]}`;
  return `Only ${list} participate in this scene.`;
}

function sceneSays(project: Project, scene: Scene | undefined, people: Map<string, string>, narratorTag: string) {
  const onScreen = sceneOnScreenNames(scene, project).map((name) => name.toLowerCase());
  const parts: string[] = [];
  for (const entry of scene?.dialogue || []) {
    const text = (entry.line || "").replace(/^["']+|["']+$/g, "").trim();
    if (!entry.speaker || !text) continue;
    if (isVoiceoverSpeaker(project, entry.speaker)) {
      const voice = narratorTag ? `, voice as heard in ${narratorTag}` : "";
      parts.push(`Off-screen narrator voice-over, no lipsync${voice}: "${text}"`);
      continue;
    }
    const name = findSpeakerCharacter(project, entry.speaker)?.name || entry.speaker.trim();
    const who = people.get(name.toLowerCase()) || speakerLabel(project, name);
    parts.push(onScreen.includes(name.toLowerCase()) ? `${who} says: "${text}"` : `${who} off-screen voice: "${text}"`);
  }
  return parts.join(" ");
}

function openingRules(continues: boolean, narrated: boolean, look: string) {
  return [
    "Obey real-world physics: gravity pulls down, weight stays on contact surfaces, two solids cannot occupy the same space, no clipping through walls, doors, furniture, vehicles, or other bodies, no mirrored or reversed motion unless the script names a reflection.",
    "Continuity holds: each shot starts where the last one ended, with the same positions, screen sides, props and light.",
    "Each character is one body, as seen in their reference, with the same face and outfit in every shot. Never duplicate anyone.",
    `Places, products and logos are @Image references from @Image1 on. Products are always in ${look} style. Describe a place only when the scene stands in a specific spot inside that image.`,
    continues ? "This clip picks up straight from the previous part." : "",
    narrated ? "Narrator lines are off-screen voice-over, no lipsync, and every mouth stays closed." : "",
  ]
    .filter(Boolean)
    .join(" ");
}

function simpleScenePrompt(options: CompactPromptOptions) {
  const { project, sceneIndexes } = options;
  const images = options.images || [];
  const { people, swaps, narratorTag } = buildTags(project, images, options.videos || []);
  const scenes = sceneIndexes.map((index) => sceneByIndex(project, index));
  const seconds = fittedSeconds(scenes, options.maxSeconds);
  const shots = continuityPass(project);
  const look = project.style === "claymation" ? "Claymation" : "Pixar";
  const locationTags = images.map((item, index) => (item.kind === "location" ? `@Image${index + 1}` : "")).filter(Boolean);
  const seenTags = assetTags(swaps);
  const narrated = scenes.some((scene) => (scene?.dialogue || []).some((line) => line.speaker && isVoiceoverSpeaker(project, line.speaker)));
  const continues = Boolean(project.scenes.length && sceneIndexes[0] !== project.scenes[0]?.index);
  const usedCameras: string[] = [];

  const blocks = sceneIndexes.map((index, i) => {
    const scene = scenes[i];
    const camera = safeCinematicCamera(scene, CAMERA_VARIETY[i % CAMERA_VARIETY.length], usedCameras, project);
    usedCameras.push(camera);
    const summary = withoutQuotedDialogue(rewriteProductContainers(scene?.summary || scene?.title || "", project), scene);
    const space = `${scene?.title || ""} ${scene?.location || ""}`;
    const action = expandMontageAction(summary) || ensurePhysicalLogic(ensureVisibleAction(summary), space);
    const locks = (shots.get(index)?.locks || []).filter((lock) => !alreadyHas(action, lock));
    const body = [action, ...locks]
      .map((part) => part.trim())
      .filter(Boolean)
      .map((part) => (/[.!?]$/.test(part) ? part : `${part}.`))
      .join(" ");
    const tagged = dropPlaceOnlySentences(
      scrubSpanishSpeakerPhrases(replaceSpeakerNames(applyTags(body, swaps), project)),
      locationTags,
    );
    const visual = ensureAsSeen(markAsSeen(tagged, seenTags, images, look), sceneAssetTags(project, scene, images), images, look);
    return [
      `SCENE ${i + 1} (${seconds[i]}s).`,
      `${camera}.`,
      participateLine(sceneOnScreenNames(scene, project), people, project),
      sceneSays(project, scene, people, narratorTag),
      visual,
    ]
      .filter(Boolean)
      .join(" ");
  });

  return `${openingRules(continues, narrated, look)} ${look} style throughout the whole video. ${blocks.join(" CUT. ")} No background music. Speak from 0s. No repeated lines.`
    .replace(/[ \t]{2,}/g, " ")
    .replace(/\s+([,.])/g, "$1")
    .trim();
}

function videoPromptFor(options: CompactPromptOptions) {
  return process.env.VIDEO_PROMPT_FORMAT === "compact" ? compactVideoPrompt(options) : directorBriefPrompt(options);
}

export function packedScenePrompt(project: Project, sceneIndexes: number[], _existing = "", maxSeconds?: number) {
  return videoPromptFor({ project, sceneIndexes, maxSeconds });
}

export function restyleReferencePrompt(kind: string, style: VisualStyle) {
  const job =
    kind === "logo"
      ? "Keep the logo mark recognizable, clean and on-model. Place it as a physical object or set dressing in-world."
      : kind === "product"
        ? "Keep the exact packaging form from the photo: pouch stays a pouch, bottle stays a bottle. Same silhouette, closure, label, colors, and branding, restyled into the animation world."
        : kind === "location"
          ? "Keep the architecture and layout recognizable while converting materials, lighting and scale to the animation world."
          : "Keep the subject recognizable.";
  return [
    `Restyle this ${kind} into ${styleGuide(style)}.`,
    job,
    "No collage, no extra captions, no watermark.",
  ].join(" ");
}

function ensureNamedLocations(
  text: string,
  images: PromptRef[],
  project?: Project,
  sceneIndexes?: number[],
) {
  if (!project || !sceneIndexes?.length) return text;
  const locations = images
    .map((item, index) => ({ item, tag: `@Image${index + 1}` }))
    .filter(({ item }) => item.kind === "location" && item.name.trim());
  if (!locations.length) return text;
  const { prefix, blocks } = splitPackedScenes(text);
  const next = blocks.map((part, index) => {
    const scene = project.scenes.find((item) => item.index === sceneIndexes[index]);
    const place = scene?.location?.trim();
    if (!place) return part;
    const hit = locations.find((item) => samePlace(item.item.name, place));
    if (!hit || new RegExp(`${escapeRegExp(hit.tag)}\\b`, "i").test(part)) return part;
    return `${part.replace(/[. ]+$/, "")}. ${hit.tag}.`;
  });
  const joined = next.join(" CUT. ");
  return prefix ? `${prefix} ${joined}` : joined;
}

export function labeledReferencePrompt(options: {
  images: PromptRef[];
  videos: PromptRef[];
  videoPrompt: string;
  style: VisualStyle;
  project?: Project;
  sceneIndexes?: number[];
  duration?: number;
}) {
  if (options.project && options.sceneIndexes?.length) {
    return videoPromptFor({
      project: options.project,
      sceneIndexes: options.sceneIndexes,
      maxSeconds: options.duration,
      images: options.images,
      videos: options.videos,
    });
  }
  let body = stripSceneStyleLocks(stripVideoStyleLead(stripIdentityDump(options.videoPrompt.trim())));
  body = body.replace(/^SCENE\s+/i, "SCENE ");
  if (options.project && options.sceneIndexes?.length && !/\b(?:says|lipsyncs|voiceover|no lipsync):\s*"/i.test(body)) {
    body = attributeDialogueInPrompt(body, options.project, options.sceneIndexes);
  } else if (!options.project || !options.sceneIndexes?.length) {
    body = collapseRepeatedSays(scrubSpanishSpeakerPhrases(body));
  }
  if (options.project) body = rewriteProductContainers(body, options.project);
  body = applyInlineRefTags(body, options.images, options.videos, options.style);
  body = ensurePropTagsInScenes(body, options.images, options.project, options.sceneIndexes);
  body = ensureNamedLocations(body, options.images, options.project, options.sceneIndexes);
  body = ensureSceneNoBgm(body);
  const priorClip = options.videos.length === 1 && options.videos[0]?.kind === "video";
  if (priorClip && !/@Video1\b/.test(body)) {
    body = body.replace(/\bSCENE 1\b[^.]*\./i, (match) => `${match} Keep @Video1 voice and cadence.`);
  }
  if (!/^(?:pixar|claymation) style throughout/i.test(body)) {
    body = `${videoStyleLead(options.style, options.project?.aspectRatio)} ${body}`;
  }
  if (!/obey real-world physics/i.test(body)) body = `${body} ${videoCloseLead()}`;
  else if (!/on-screen dialogue uses that character/i.test(body)) body = `${body} ${videoVoiceLead()} ${videoAudioLead()}`;
  else if (!/never before its speaker is on screen/i.test(body)) body = `${body} ${videoAudioLead()}`;
  return collapseRepeatedSays(sanitizeReferencePrompt(body.replace(/\s{2,}/g, " ").trim()));
}

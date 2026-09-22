import { samePlace } from "./places";
import { isUnseenVoice, promptReadyReferences } from "./refs";
import type { Batch, Character, Project, Scene, VisualStyle } from "./types";

export type PromptRef = {
  url: string;
  kind: "frame" | "logo" | "product" | "location" | "other" | "video" | "character";
  name: string;
  notes?: string;
};

export function imageStyleLead(style: VisualStyle) {
  return style === "claymation" ? "claymation style" : "pixar style";
}

export function videoAudioLead() {
  return "Speak from 0s. No repeated lines.";
}

export function sceneAudioClose() {
  return "[NO BGM]";
}

export function videoVoiceLead() {
  return "On-screen dialogue uses that character's realistic lipsync. Narrator lines are off-screen voice-over only. No character lipsyncs them, and mouths stay closed.";
}

export function videoCloseLead() {
  return "Obey real-world physics: gravity pulls down, weight stays on contact surfaces, two solids cannot occupy the same space, no clipping through walls, doors, furniture, vehicles, or other bodies, no mirrored or reversed motion unless the script names a reflection. Never invent extra copies of anyone. Each character has exactly one body in frame. Never clone or duplicate a character. Foreground bodies occlude background glow; no shine through hair or skin. Speakers look at who they address, not the lens, unless they break the fourth wall. Same body scale versus chairs, tables, and doors across cuts. Hands keep contact with held props. On-screen dialogue uses that character's realistic lipsync. Narrator lines are off-screen voice-over only. No character lipsyncs them, and mouths stay closed. Speak from 0s. No repeated lines.";
}

export function videoStyleLead(style: VisualStyle) {
  const look = style === "claymation" ? "Claymation" : "Pixar";
  return `${look} style throughout the whole video.`;
}

export function styleGuide(style: VisualStyle) {
  return imageStyleLead(style);
}

function stripVideoStyleLead(text: string) {
  return text
    .replace(/^(?:pixar|claymation) style(?: throughout the whole video)?\.?\s*/i, "")
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
  let camera = cinematicCamera(scene, fallback, used);
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
      " Show the complete action on camera: a hand takes it from the pack, lifts it to the mouth, and the character chews. Do not cut to it already inside the mouth.";
  }
  return text;
}

function alreadyHas(text: string, lock: string) {
  return text.toLowerCase().includes(lock.slice(0, 28).toLowerCase());
}

function withNoClone(action: string, camera: string, scene?: Scene, project?: Project) {
  let next = action.trim();
  const names = sceneOnScreenNames(scene, project);
  if (/over the shoulder/i.test(camera) && names.length >= 2) {
    const lock = `Over-the-shoulder: camera behind ${names[0]}, only ${names[0]}'s shoulder and the back of the head in the foreground, looking at ${names[1]}. ${names[1]} is the only face in frame. Never show ${names[0]}'s face. Never duplicate anyone.`;
    if (!alreadyHas(next, lock)) next += ` ${lock}`;
  }
  return next;
}

function withCraftLocks(action: string, scene?: Scene, project?: Project) {
  let next = action.trim();
  const names = sceneOnScreenNames(scene, project);
  const blob = `${next} ${scene?.title || ""} ${scene?.location || ""} ${(scene?.dialogue || []).map((line) => `${line.speaker} ${line.line}`).join(" ")}`;

  if (
    names.length &&
    /\b(glow|glowing|neon|headlight|lantern|backlit|backlight|lens flare|emissive|halo|shining eyes|glowing eyes|light source)\b/i.test(
      blob,
    )
  ) {
    const lock = `${names[0]} in the foreground occludes any glow or lights behind. No shine through body or hair.`;
    if (!alreadyHas(next, lock)) next += ` ${lock}`;
  }

  const spoken = (scene?.dialogue || []).filter(
    (line) => line.speaker && line.line && !(project && isVoiceoverSpeaker(project, line.speaker)),
  );
  if (names.length >= 2 && spoken.length && !/\b(fourth wall|to camera|into the (?:camera|lens)|looks? (?:at|into) (?:the )?(?:camera|lens))\b/i.test(blob)) {
    const speakerRaw = spoken.find((line) => names.some((name) => name.toLowerCase() === line.speaker.trim().toLowerCase()));
    const speaker = speakerRaw
      ? names.find((name) => name.toLowerCase() === speakerRaw.speaker.trim().toLowerCase())
      : undefined;
    const other = speaker ? names.find((name) => name.toLowerCase() !== speaker.toLowerCase()) : undefined;
    if (speaker && other) {
      const lock = `${speaker} looks at ${other}, not the camera.`;
      if (!alreadyHas(next, lock)) next += ` ${lock}`;
    }
  }

  if (/\b(chas(?:e|es|ing)|pursu(?:e|es|ing)|hunts?|lunges? at|runs? after|goes? after|stalk(?:s|ing)?)\b/i.test(blob) && names.length) {
    const lock =
      names.length >= 2
        ? `The pursuer moves toward ${names[names.length - 1]}'s position in the scene.`
        : `The pursuer moves toward the character's position in the scene.`;
    if (!alreadyHas(next, lock)) next += ` ${lock}`;
  }

  if (
    names.length &&
    /\b(chair|table|desk|sofa|couch|doorway|jumps? (?:down|off)|hops? (?:down|off)|gets? (?:down|off)|climbs? (?:down|off)|sits?|stands? up)\b/i.test(
      blob,
    )
  ) {
    const lock = `${names[0]} stays the same size versus the nearby chair, table, and door.`;
    if (!alreadyHas(next, lock)) next += ` ${lock}`;
  }

  if (
    /\b(door handle|doorknob|handle|fork|knife|spoon|utensil|chopsticks|cup|glass|mug|grabs?|grips?|holds? the|opens? the door|closes? the door)\b/i.test(
      blob,
    )
  ) {
    const lock = "Hands keep real contact on the object they hold; it does not float, slide, or clip.";
    if (!alreadyHas(next, lock)) next += ` ${lock}`;
  }

  return next;
}

function ensurePhysicalLogic(summary: string, context = "") {
  let text = summary.trim();
  if (!text) return text;
  const blob = `${text} ${context}`.toLowerCase();
  const locks: string[] = [];

  if (/\b(treadmill|running machine|caminadora)\b/.test(blob)) {
    locks.push(
      "Face the console and run the correct way: the belt slides backward under the feet. Never moonwalk, never run backward on the belt, never fall off the back.",
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
    locks.push("Feet plant on each step in the travel direction. Do not float or walk through the stairs.");
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

function sceneCastLine(scene?: Scene, project?: Project) {
  if (!scene) return "";
  const principals = sceneOnScreenNames(scene, project);
  const extras = [...new Set((scene.extraNames || []).map((name) => name.trim()).filter(Boolean))]
    .filter((name) => name && !principals.some((lead) => lead.toLowerCase() === name.toLowerCase()))
    .map((name) => name.replace(/^(the|a|an)\s+/i, "").trim())
    .filter(Boolean);
  const ordered = extras.length
    ? [...extras.map((name, index) => (index === 0 ? `the ${name}` : name)), ...principals]
    : principals;
  if (!ordered.length) return "";
  if (ordered.length === 1) return `Only ${ordered[0]} participates in this scene.`;
  if (ordered.length === 2) return `Only ${ordered[0]} and ${ordered[1]} participate in this scene.`;
  return `Only ${ordered.slice(0, -1).join(", ")} and ${ordered[ordered.length - 1]} participate in this scene.`;
}

const YOUNG_MARK = /\b(tiny|baby|kitten|puppy|newborn|young|infant|toddler|chiquit|beb[eé])\b/i;
const GROWN_MARK =
  /\b(grown|older|adult|full[- ]grown|larger|grew|grows|years later|time has passed|now grown)\b/i;

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
    if (!name) return;
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

export function packedScenePrompt(project: Project, sceneIndexes: number[], _existing = "", maxSeconds?: number) {
  const usedCameras: string[] = [];
  const chosen = sceneIndexes.map((index) => sceneByIndex(project, index)).filter((scene): scene is Scene => Boolean(scene));
  const budget = maxSeconds && maxSeconds > 0 ? maxSeconds : 0;
  const raw = chosen.map((scene) => Math.max(2, scene.estimatedSeconds || 4));
  const rawSum = raw.reduce((sum, value) => sum + value, 0);
  const fitted =
    budget > 0 && rawSum > budget
      ? raw.map((value) => Math.max(2, Math.round((value / rawSum) * budget)))
      : raw.map((value) => Math.round(value));
  const timed = sceneIndexes
    .map((index, i) => {
      const scene = sceneByIndex(project, index);
      const fallback = CAMERA_VARIETY[i % CAMERA_VARIETY.length];
      const camera = safeCinematicCamera(scene, fallback, usedCameras, project);
      usedCameras.push(camera);
      const summary = rewriteProductContainers(scene?.summary || scene?.title || "", project);
      const montage = expandMontageAction(summary);
      const space = `${scene?.title || ""} ${scene?.location || ""}`;
      const visual = withCraftLocks(
        withNoClone(
          withOnScreenProps(
            montage || ensurePhysicalLogic(ensureVisibleAction(summary), space),
            project,
            index,
          ),
          camera,
          scene,
          project,
        ),
        scene,
        project,
      );
      const dialogue = (scene?.dialogue || []).filter((line) => line.speaker && line.line);
      const lines = dialogue
        .map((line) => spokenLineCue(project, scene, line.speaker, line.line))
        .filter(Boolean)
        .join(" ");
      const narratorLock = dialogue.some((line) => isVoiceoverSpeaker(project, line.speaker))
        ? "Narrator lines stay off-screen. Mouths stay closed."
        : "";
      const seconds = fitted[i] || Math.max(2, Math.round(scene?.estimatedSeconds || 4));
      const who = sceneCastLine(scene, project);
      const body = (i === 0 && lines ? [who, lines, narratorLock, visual] : [who, visual, lines, narratorLock])
        .filter(Boolean)
        .join(" ");
      return `SCENE ${i + 1} (${seconds}s). ${camera}. ${body} ${sceneAudioClose()}`.replace(/\s+/g, " ").trim();
    })
    .join(" CUT. ");
  return `${videoStyleLead(project.style)} ${attributeDialogueInPrompt(timed, project, sceneIndexes)} ${videoCloseLead()}`.replace(/\s{2,}/g, " ").trim();
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
}) {
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
  const priorClip = options.videos.length === 1 && options.videos[0]?.kind !== "character";
  if (priorClip && !/@Video1\b/.test(body)) {
    body = body.replace(/\bSCENE 1\b[^.]*\./i, (match) => `${match} Keep @Video1 voice and cadence.`);
  }
  if (!/^(?:pixar|claymation) style throughout/i.test(body)) {
    body = `${videoStyleLead(options.style)} ${body}`;
  }
  if (!/obey real-world physics/i.test(body)) body = `${body} ${videoCloseLead()}`;
  else if (!/on-screen dialogue uses that character/i.test(body)) body = `${body} ${videoVoiceLead()} ${videoAudioLead()}`;
  else if (!/speak from 0s/i.test(body)) body = `${body} ${videoAudioLead()}`;
  return collapseRepeatedSays(sanitizeReferencePrompt(body.replace(/\s{2,}/g, " ").trim()));
}

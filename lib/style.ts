import { promptReadyReferences } from "./refs";
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
  return "No background music. Ambient sound and dialogue only.";
}

export function videoStyleLead(style: VisualStyle, frameTag = "@Image1") {
  return `${frameTag} is the first frame of this shot, the opening instant of scene 1. Animate forward from that still. Hold the same cinematic camera until CUT. Keep the same ${imageStyleLead(style)} as seen in ${frameTag} for every scene. Do not switch look. ${videoAudioLead()}`;
}

export function styleGuide(style: VisualStyle) {
  return imageStyleLead(style);
}

function stripVideoStyleLead(text: string) {
  return text
    .replace(/^(?:pixar|claymation) style\.?\s*/i, "")
    .replace(/^@Image\d+\s+is the first frame of this shot(?:,[^.]+)?\.?\s*/i, "")
    .replace(/^Animate forward from that still\.?\s*/i, "")
    .replace(/^Hold the same cinematic camera until CUT\.?\s*/i, "")
    .replace(
      /^Keep (?:the same )?(?:pixar|claymation) style(?: as seen in [@#]\s*Image\s*\d+)?(?: for (?:the entire video|every scene))?\.?\s*/i,
      "",
    )
    .replace(/^Do not (?:switch look|change the look)\.?\s*/i, "")
    .replace(/^No background music\.?\s*/i, "")
    .replace(/^(?:Natural )?ambient sound and dialogue only\.?\s*/i, "")
    .replace(/^No (?:soundtrack|score|bgm|music|background (?:music|score|soundtrack))\.?\s*/i, "")
    .trim();
}

function stripSceneStyleLocks(text: string) {
  return text
    .replace(/\s*Keep the same style(?:, look, lighting and characters)? as seen in [@#]\s*Image\s*\d+\.?\s*/gi, " ")
    .replace(/\s*@Image\d+\s+is the first frame of this shot(?:,[^.]+)?\.?\s*/gi, " ")
    .replace(/\s*Animate forward from that still\.?\s*/gi, " ")
    .replace(/\s*Hold the same cinematic camera until CUT\.?\s*/gi, " ")
    .replace(/\s*No background music\.?\s*/gi, " ")
    .replace(/\s*(?:Natural )?ambient sound and dialogue only\.?\s*/gi, " ")
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

export function characterLookFromPhotoPrompt(character: Character, style: VisualStyle) {
  return joinPromptParts([
    imageStyleLead(style),
    `image-to-image: restyle only the main subject as ${character.name}`,
    "if the photo shows more than one subject, keep only this character and omit everyone else",
    "keep the same identity as that one subject",
    appearanceForLook(character),
    SOLO_LOOK,
    "single three-quarter standing pose, full character clearly visible",
    "plain light gray seamless background, even studio lighting",
    "one image, one pose, no grid, no collage, no character sheet",
  ]);
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

export function cinematicCamera(scene?: Scene, fallback = "wide shot, eye level") {
  const raw = (scene?.camera || "").replace(/\.+$/g, "").trim();
  if (!raw) return fallback;
  const hasSize =
    /\b(extreme wide|establishing|ews|wide|full shot|long shot|medium wide|cowboy|medium close-?up|medium|close-?up|ecu|extreme close|insert|two[- ]shot|ots|over[- ]the[- ]shoulder|pov)\b/i.test(
      raw,
    );
  const hasAngle =
    /\b(eye[- ]level|high angle|low angle|dutch|canted|bird'?s[- ]eye|worm'?s[- ]eye|overhead|ground level|top[- ]down|side angle|lateral)\b/i.test(
      raw,
    );
  const parts = [raw];
  if (!hasSize) parts.unshift("wide shot");
  if (!hasAngle) parts.push("eye level");
  return parts.join(", ");
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

function stripInjectedRefTags(text: string) {
  return text
    .replace(/(^|(?<=[.!?]\s))[@#](?:Image|Video)\d+\b[^.!]*[.!]?\s*/gi, "")
    .replace(/\s{2,}/g, " ")
    .trim();
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

function spokenCue(speaker: string, text: string) {
  const line = text.replace(/^["']+|["']+$/g, "").trim();
  return `${speaker} says: "${line}"`;
}

function collapseRepeatedSays(text: string) {
  return text
    .replace(
      /(?:((?:the\s+)?[\p{L}\p{N}][\p{L}\p{N}'-]{0,24}(?:\s+[\p{L}\p{N}'-]{1,16}){0,4})\s+says:\s*){2,}(?=")/giu,
      "$1 says: ",
    )
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
  const speakers = new Set<string>();
  for (const index of sceneIndexes) {
    const scene = sceneByIndex(project, index);
    for (const line of scene?.dialogue || []) {
      const speaker = speakerLabel(project, line.speaker || "");
      const text = (line.line || "").replace(/^["']+|["']+$/g, "").trim();
      if (!speaker || !text) continue;
      speakers.add(speaker);
      const quote = `"${text}"`;
      if (new RegExp(`says:\\s*${escapeRegExp(quote)}`, "i").test(next)) continue;
      if (next.includes(quote)) next = next.replace(quote, spokenCue(speaker, text));
    }
  }
  if (speakers.size > 1 && !/only the named speaker/i.test(next)) {
    next = `${next} Each line of dialogue is spoken only by the character named before it. The other characters stay silent on that line.`;
  }
  return collapseRepeatedSays(next).replace(/\s{2,}/g, " ").trim();
}

export function packedScenePrompt(project: Project, sceneIndexes: number[], existing = "") {
  const cleaned = stripInjectedRefTags(sanitizeReferencePrompt(existing));
  const body = /\bSCENE\s+\d+\s*:/i.test(cleaned)
    ? cleaned
    : sceneIndexes
        .map((index, i) => {
          const scene = sceneByIndex(project, index);
          const camera = cinematicCamera(scene);
          const action = scene?.summary || "";
          const lines = (scene?.dialogue || [])
            .filter((line) => line.speaker && line.line)
            .map((line) => spokenCue(speakerLabel(project, line.speaker), line.line))
            .join(" ");
          const seconds = Math.max(2, Math.round(scene?.estimatedSeconds || 4));
          const start = i === 0 ? "Start from the first-frame still. " : "";
          return `SCENE ${i + 1} (${seconds}s): ${camera}. ${start}${action} ${lines}`.replace(/\s+/g, " ").trim();
        })
        .join(" CUT. ");
  const timed = injectSceneDurations(
    stripSceneStyleLocks(attributeDialogueInPrompt(stripVideoStyleLead(body), project, sceneIndexes)),
    project,
    sceneIndexes,
  );
  return videoStyleLead(project.style) + " " + timed;
}

function injectSceneDurations(prompt: string, project: Project, sceneIndexes: number[]) {
  return prompt.replace(/\bSCENE\s+(\d+)\s*(?:\([^)]*\))?\s*:/gi, (match, raw) => {
    const order = Number(raw) - 1;
    const scene = sceneByIndex(project, sceneIndexes[order]);
    const seconds = Math.max(2, Math.round(scene?.estimatedSeconds || 0));
    if (!seconds) return match;
    return `SCENE ${raw} (${seconds}s):`;
  });
}

export function restyleReferencePrompt(kind: string, style: VisualStyle) {
  const job =
    kind === "logo"
      ? "Keep the logo mark recognizable, clean and on-model. Place it as a physical object or set dressing in-world."
      : kind === "product"
        ? "Keep the product silhouette, colors and key details recognizable."
        : kind === "location"
          ? "Keep the architecture and layout recognizable while converting materials, lighting and scale to the animation world."
          : "Keep the subject recognizable.";
  return [
    `Restyle this ${kind} into ${styleGuide(style)}.`,
    job,
    "No collage, no extra captions, no watermark.",
  ].join(" ");
}

function refLine(tag: string, item: PromptRef, style: VisualStyle) {
  const notes = item.notes ? ` ${item.notes}` : "";
  const look = imageStyleLead(style);
  switch (item.kind) {
    case "frame":
      return `${tag} is the first frame of this shot.`;
    case "logo":
      return `${tag} is the logo reference. Draw this mark in ${look} inside the scene and keep it recognizable.${notes}`;
    case "product":
      return `${tag} is the product reference. Draw this product in ${look} inside the scene when the action includes it, matching shape and colors. Not a product-only shot.${notes}`;
    case "location":
      return `${tag} is the location reference. Draw this place in ${look}.${notes}`;
    case "video":
      return `${tag} is the exact voice, cadence, face, and gesture reference for ${item.name}. Keep each named character consistent with this clip. Do not invent a new voice.${notes}`;
    case "character":
      return `${tag} is ${item.name}. Match this character look in ${look}.${notes}`;
    default:
      return `${tag} is ${item.name}. Match this look.${notes}`;
  }
}

export function labeledReferencePrompt(options: {
  images: PromptRef[];
  videos: PromptRef[];
  videoPrompt: string;
  style: VisualStyle;
  project?: Project;
  sceneIndexes?: number[];
}) {
  const imageLines = options.images.map((item, index) => refLine(`@Image${index + 1}`, item, options.style));
  const videoLines = options.videos.map((item, index) => refLine(`@Video${index + 1}`, item, options.style));
  const frameIndex = options.images.findIndex((item) => item.kind === "frame");
  const frameTag = frameIndex >= 0 ? `@Image${frameIndex + 1}` : "@Image1";
  let body = stripInjectedRefTags(
    options.videoPrompt.match(/\bSCENE\s+\d+\s*:[\s\S]*/i)?.[0] || stripVideoStyleLead(options.videoPrompt.trim()),
  );
  if (options.project && options.sceneIndexes?.length) {
    body = attributeDialogueInPrompt(body, options.project, options.sceneIndexes);
  } else {
    body = collapseRepeatedSays(scrubSpanishSpeakerPhrases(body));
  }
  body = stripSceneStyleLocks(body);
  return collapseRepeatedSays(
    sanitizeReferencePrompt(
      [videoStyleLead(options.style, frameTag), ...imageLines.filter((_, i) => i !== frameIndex), ...videoLines, body]
        .filter(Boolean)
        .join(" "),
    ),
  );
}

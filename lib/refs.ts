import { createId } from "./ids";
import { productFacts } from "./product-facts";
import type { Character, Project, ReferenceAsset, ReferenceKind, Scene } from "./types";

export const MAX_CAST_LEADS = 4;

export const SLOT_QUOTA: Record<Exclude<ReferenceKind, "other">, number> = {
  character: 4,
  product: 3,
  location: 2,
  logo: 1,
};

const DEFAULT_SLOTS: Array<{ kind: Exclude<ReferenceKind, "other">; label: string; notes: string }> = [
  { kind: "character", label: "Character 1", notes: "Real-life photo of one person or animal. Type the script role (Cat, Dog). Adapted to the chosen style at casting." },
  { kind: "character", label: "Character 2", notes: "Real-life photo of one person or animal. Type the script role (Cat, Dog). Adapted to the chosen style at casting." },
  { kind: "character", label: "Character 3", notes: "Real-life photo of one person or animal. Type the script role (Cat, Dog). Adapted to the chosen style at casting." },
  { kind: "character", label: "Character 4", notes: "Real-life photo of one person or animal. Type the script role (Cat, Dog). Adapted to the chosen style at casting." },
  { kind: "product", label: "Product 1", notes: "Optional. Only used if the script involves this product. Keep the exact pack from the photo: pouch stays a pouch, bottle stays a bottle." },
  { kind: "product", label: "Product 2", notes: "Optional. Only used if the script involves this product. Keep the exact pack from the photo: pouch stays a pouch, bottle stays a bottle." },
  { kind: "product", label: "Product 3", notes: "Optional. Only used if the script involves this product. Keep the exact pack from the photo: pouch stays a pouch, bottle stays a bottle." },
  { kind: "location", label: "Location 1", notes: "Optional. Only used if the script asks for this location." },
  { kind: "location", label: "Location 2", notes: "Optional. Only used if the script asks for this location." },
  { kind: "logo", label: "Logo", notes: "Optional. Only used if the script involves this brand." },
];

const GENERIC_LABELS = new Set([
  "producto",
  "product",
  "product 1",
  "product 2",
  "product 3",
  "logo",
  "locación",
  "locacion",
  "location",
  "location 1",
  "location 2",
  "character",
  "character 1",
  "character 2",
  "character 3",
  "character 4",
  "personaje",
  "personaje 1",
  "personaje 2",
  "personaje 3",
  "personaje 4",
  "referencia",
  "reference",
]);

const PRODUCT_WORD_STOP = new Set([
  "about",
  "after",
  "again",
  "already",
  "also",
  "appear",
  "appears",
  "appearing",
  "around",
  "attached",
  "because",
  "been",
  "before",
  "being",
  "body",
  "both",
  "character",
  "face",
  "from",
  "hand",
  "hands",
  "have",
  "held",
  "holding",
  "holds",
  "into",
  "just",
  "keep",
  "keeps",
  "like",
  "lips",
  "more",
  "mouth",
  "only",
  "original",
  "over",
  "package",
  "packaging",
  "product",
  "producto",
  "scene",
  "scenes",
  "show",
  "shown",
  "shows",
  "still",
  "that",
  "their",
  "them",
  "then",
  "there",
  "these",
  "they",
  "this",
  "those",
  "through",
  "under",
  "used",
  "using",
  "wear",
  "wears",
  "when",
  "where",
  "which",
  "while",
  "with",
  "without",
  "worn",
  "your",
]);

const KIND_PATTERNS: Record<ReferenceKind, RegExp[]> = {
  character: [],
  logo: [/\blogo\b/i, /\bisotipo\b/i, /\blogotipo\b/i, /\bbrand mark\b/i, /\bwordmark\b/i],
  product: [/\bproducto\b/i, /\bproduct\b/i, /\bempaque\b/i, /\bpackaging\b/i, /\bmerchandise\b/i],
  location: [
    /\blocaci[oó]n de referencia\b/i,
    /\besta locaci[oó]n\b/i,
    /\busar esta locaci[oó]n\b/i,
    /\blocation (?:plate|photo|reference|still)\b/i,
  ],
  other: [],
};

const CORE_KINDS: Array<Exclude<ReferenceKind, "other">> = ["character", "product", "location", "logo"];

export function emptySlot(kind: ReferenceKind, label?: string, notes?: string): ReferenceAsset {
  const defaults = DEFAULT_SLOTS.find((slot) => slot.kind === kind);
  return {
    id: createId("ref"),
    kind,
    label: label || defaults?.label || "Reference",
    notes: notes || defaults?.notes || "",
    includeInVideo: false,
    status: "empty",
  };
}

function hasFile(asset: ReferenceAsset) {
  return Boolean(asset.originalPublicPath || asset.originalRemoteUrl);
}

export function ensureReferenceSlots(project: Project) {
  if (!Array.isArray(project.references)) project.references = [];

  const others = project.references.filter((asset) => !CORE_KINDS.includes(asset.kind as Exclude<ReferenceKind, "other">));
  const core: ReferenceAsset[] = [];

  for (const kind of CORE_KINDS) {
    const wanted = DEFAULT_SLOTS.filter((slot) => slot.kind === kind);
    const quota = SLOT_QUOTA[kind];
    const existing = project.references.filter((asset) => asset.kind === kind);
    const filled = existing.filter(hasFile);
    const empty = existing.filter((asset) => !hasFile(asset));
    const kept = [...filled, ...empty].slice(0, quota);
    while (kept.length < quota) {
      const defaults = wanted[kept.length] || wanted[0];
      kept.push(emptySlot(kind, defaults.label, defaults.notes));
    }
    kept.forEach((asset, index) => {
      const defaults = wanted[index] || wanted[0];
      asset.kind = kind;
      if (!asset.label.trim() || GENERIC_LABELS.has(asset.label.trim().toLowerCase())) {
        asset.label = defaults.label;
      }
      if (!asset.notes.trim() || GENERIC_LABELS.has(asset.notes.trim().toLowerCase()) || /guion|locaci/i.test(asset.notes)) {
        asset.notes = defaults.notes;
      }
    });
    core.push(...kept);
  }

  project.references = [...core, ...others];
  return project.references;
}

function referenceWords(text: string) {
  return text
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((word) => word.length >= 4 && !PRODUCT_WORD_STOP.has(word));
}

function productMentionWords(project: Project, asset: ReferenceAsset) {
  const cues = (project.scriptRefCues || []).filter((cue) => cue.kind === asset.kind && cue.cue?.trim());
  const facts = productFacts(project, asset.label);
  const notes = asset.notes?.trim() || "";
  const namedNotes = notes && !/^optional\b/i.test(notes) && notes.length <= 80 ? notes : "";
  const label = GENERIC_LABELS.has(asset.label.trim().toLowerCase()) ? "" : asset.label;
  return [...new Set(referenceWords([...cues.map((cue) => cue.cue), label, namedNotes, facts.name].join(" ")))];
}

const ABSENT_OBJECT =
  "tape|tapes|box|boxes|pack|packs|packet|packets|package|packages|packaging|pouch|pouches|sachet|sachets|bottle|bottles|jar|jars|tub|tubs|product|producto|logo|strip|strips";

const NEGATED_OBJECT = new RegExp(
  `\\b(?:no|not|without|never|zero)\\s+(?:the\\s+|a\\s+|an\\s+|any\\s+|more\\s+|her\\s+|his\\s+|their\\s+)?(?:${ABSENT_OBJECT})\\b`,
  "gi",
);

const POSITIVE_OBJECT = new RegExp(
  `\\b(?:the|a|an|this|that|her|his|their)\\s+(?:${ABSENT_OBJECT})\\b`,
  "gi",
);

export function productKeptOut(text: string) {
  NEGATED_OBJECT.lastIndex = 0;
  POSITIVE_OBJECT.lastIndex = 0;
  const absent =
    NEGATED_OBJECT.test(text) ||
    /\b(?:without the product|no product|product stays out|before the product|not in frame|stays out of frame|out of frame)\b/i.test(text);
  NEGATED_OBJECT.lastIndex = 0;
  if (!absent) return false;
  const stripped = text.replace(NEGATED_OBJECT, " ");
  NEGATED_OBJECT.lastIndex = 0;
  POSITIVE_OBJECT.lastIndex = 0;
  const shown = POSITIVE_OBJECT.test(stripped);
  POSITIVE_OBJECT.lastIndex = 0;
  return !shown;
}

export function textShowsPackage(text: string) {
  if (productKeptOut(text)) return false;
  const stripped = text.replace(NEGATED_OBJECT, " ");
  NEGATED_OBJECT.lastIndex = 0;
  return /\b(?:packs?|packets?|box(?:es)?|pouches?|sachets?|packaging|the product|producto)\b/i.test(stripped);
}

const SPOKEN_QUOTES = /"[^"]*"|“[^”]*”/g;

const PHYSICAL_ASSET =
  /\b(?:holds?|holding|in (?:her|his|their|a|the) hand|picks? (?:it|them|the|up)|puts? (?:it|them) (?:on|in)|on the (?:table|counter|desk|nightstand|shelf|bed|seat|dashboard)|in frame|on screen|close-?up|insert|opens?|unbox(?:es|ing)?|applies?|applying|uses?|using|wears?|wearing|worn|sticks?|presses?|pressed|adheres?|adhered|shows? the (?:box|pack|packet|package|pouch|bottle|jar|tub|product|logo))\b/i;

export function actionWithoutSpeech(text: string) {
  return text.replace(SPOKEN_QUOTES, " ");
}

export function sceneRequiresAsset(kind: string, text: string) {
  const action = actionWithoutSpeech(text);
  if (kind !== "product" && kind !== "logo") return false;
  if (productKeptOut(action)) return false;
  if (/\b(?:empty (?:table|counter|desk|room|frame)|bare (?:table|counter)|nothing on the (?:table|counter))\b/i.test(action) && !PHYSICAL_ASSET.test(action)) {
    return false;
  }
  if (kind === "logo") return /\b(?:logo|brand mark|wordmark)\b/i.test(action);
  return PHYSICAL_ASSET.test(action);
}

function hasPositiveWord(text: string, word: string) {
  const escaped = word.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const re = new RegExp(
    `\\b(?:no|not|without|never|zero)\\s+(?:the\\s+|a\\s+|an\\s+|any\\s+|her\\s+|his\\s+|their\\s+)?${escaped}\\b|\\b${escaped}\\b`,
    "gi",
  );
  let positive = false;
  for (const match of text.matchAll(re)) {
    if (!/^(?:no|not|without|never|zero)\b/i.test(match[0])) positive = true;
  }
  return positive;
}

function sceneMentionsProduct(project: Project, asset: ReferenceAsset, sceneIndexes: number[]) {
  const text = sceneBlob(project, sceneIndexes);
  if (productKeptOut(text)) return false;
  return productMentionWords(project, asset).some((word) => hasPositiveWord(text, word));
}

function sceneBlob(project: Project, sceneIndexes?: number[]) {
  const scenes = sceneIndexes?.length
    ? project.scenes.filter((scene) => sceneIndexes.includes(scene.index))
    : project.scenes;
  const fromScenes = scenes
    .map((scene) =>
      [
        scene.title,
        scene.summary,
        scene.location,
        ...(scene.shots || []).map((shot) => shot.action),
        ...scene.dialogue.map((line) => `${line.speaker} ${line.line}`),
      ].join(
        " ",
      ),
    )
    .join("\n");
  if (sceneIndexes?.length) return fromScenes;
  return `${project.scriptText || ""}\n${fromScenes}`;
}

export function filledCharacterPhotos(project: Project) {
  return project.references.filter(
    (asset) => asset.kind === "character" && Boolean(asset.originalPublicPath || asset.originalRemoteUrl),
  );
}

function normalizeRole(value: string) {
  return value.trim().toLowerCase().replace(/^(the|a|an)\s+/, "");
}

const IDENTITY_GROUPS: Array<{ keys: string[]; tags: string[] }> = [
  { keys: ["cat", "gato", "gata", "kitten", "kitty", "feline", "gatito", "gatita"], tags: ["cat", "animal"] },
  { keys: ["dog", "perro", "perra", "puppy", "canine", "cachorro", "cachorra", "retriever"], tags: ["dog", "animal"] },
  { keys: ["bird", "ave", "parrot", "loro"], tags: ["bird", "animal"] },
  {
    keys: ["woman", "mujer", "girl", "lady", "female", "señora", "senora", "chica", "niña", "nina", "mom", "mother", "wife", "daughter"],
    tags: ["woman", "human"],
  },
  {
    keys: ["man", "hombre", "guy", "boy", "male", "señor", "senor", "chico", "niño", "nino", "dad", "father", "husband", "son", "kid", "child"],
    tags: ["man", "human"],
  },
];

function kinshipName(name: string) {
  return /^(?:kid|child|boy|girl|son|daughter|dad|mom|mother|father|papa|mama|wife|husband|baby|toddler|man|woman)$/i.test(
    name.trim(),
  );
}

function namedAsAnimal(name: string, description: string) {
  const who = name.trim().replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  if (!who) return false;
  const species = "dog|cat|puppy|kitten|bird|rabbit|horse|retriever";
  return new RegExp(
    `\\b${who}\\b\\s*(?:,|is|the)\\s+(?:a\\s+|an\\s+|the\\s+)?(?:${species})\\b|\\b(?:a|an|the)\\s+(?:${species})\\s+(?:named|called)\\s+${who}\\b`,
    "i",
  ).test(`${name} ${description}`);
}

function identityTags(text: string) {
  const blob = ` ${normalizeRole(text)} `;
  const tags = new Set<string>();
  for (const group of IDENTITY_GROUPS) {
    if (group.keys.some((key) => new RegExp(`\\b${key}s?\\b`, "i").test(blob))) {
      for (const tag of group.tags) tags.add(tag);
    }
  }
  if (!tags.size && /\b(person|human|people|adulto|adult)\b/i.test(blob)) tags.add("human");
  if (!tags.size && !/\b(cat|dog|gato|perro|bird|fox|bear|rabbit|mouse|animal)\b/i.test(blob)) {
    tags.add("human");
  }
  return tags;
}

function photoRoleScore(photo: ReferenceAsset, character: Character) {
  const role = normalizeRole(photo.label);
  const name = normalizeRole(character.name);
  const blob = `${character.name} ${character.description}`;
  const mentionedAnimal = kinshipName(character.name) && !namedAsAnimal(character.name, character.description || "");
  const animalLabel = /^(?:dog|cat|puppy|kitten|bird|rabbit|horse|retriever|animal)s?$/i.test(role);
  if (!role || GENERIC_LABELS.has(role) || /^character\s*\d+$/i.test(photo.label.trim())) return 2;
  if (role === name) return 100;
  if (role.length >= 3 && (name.includes(role) || role.includes(name))) return 85;
  if (!(mentionedAnimal && animalLabel) && new RegExp(`\\b${role.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}s?\\b`, "i").test(blob)) return 75;

  const photoTags = identityTags(`${photo.label} ${photo.notes}`);
  const charTags = identityTags(blob);
  if (mentionedAnimal) {
    for (const tag of ["dog", "cat", "bird", "animal"]) charTags.delete(tag);
    charTags.add("human");
    if (/^(?:girl|daughter|mom|mother|mama|wife|woman)$/i.test(character.name)) charTags.add("woman");
    else if (!/^(?:baby|toddler)$/i.test(character.name)) charTags.add("man");
  }
  let score = 0;
  for (const tag of photoTags) {
    if (charTags.has(tag)) score += tag === "human" || tag === "animal" ? 20 : 45;
  }
  if (photoTags.has("animal") && charTags.has("human") && !charTags.has("animal")) return -80;
  if (photoTags.has("human") && charTags.has("animal") && !charTags.has("human")) return -80;
  if (photoTags.has("cat") && charTags.has("dog")) return -80;
  if (photoTags.has("dog") && charTags.has("cat")) return -80;
  if (photoTags.has("woman") && charTags.has("man") && !charTags.has("woman")) score -= 25;
  if (photoTags.has("man") && charTags.has("woman") && !charTags.has("man")) score -= 25;
  return score;
}

export function assignCharacterSourcePhotos(project: Project) {
  const photos = filledCharacterPhotos(project);
  const leads = project.characters.filter((character) => !character.isExtra);
  const map = new Map<string, ReferenceAsset>();
  const usedPhotos = new Set<string>();
  const usedLeads = new Set<string>();

  const ranked = photos.flatMap((photo) =>
    leads.map((character) => ({
      photo,
      character,
      score: photoRoleScore(photo, character),
    })),
  );
  ranked.sort((a, b) => b.score - a.score);

  for (const item of ranked) {
    if (item.score < 8) continue;
    if (usedPhotos.has(item.photo.id) || usedLeads.has(item.character.id)) continue;
    map.set(item.character.id, item.photo);
    usedPhotos.add(item.photo.id);
    usedLeads.add(item.character.id);
  }

  const leftoverPhotos = photos.filter((photo) => !usedPhotos.has(photo.id));
  const leftoverLeads = leads.filter((character) => !usedLeads.has(character.id));
  leftoverLeads.forEach((character, index) => {
    const photo = leftoverPhotos[index];
    if (!photo) return;
    map.set(character.id, photo);
    usedPhotos.add(photo.id);
    usedLeads.add(character.id);
  });

  return map;
}

function characterKey(name: string) {
  return name.trim().toLowerCase();
}

export function isUnseenVoice(character: Pick<Character, "name" | "description"> & { voiceNotes?: string }) {
  const name = character.name.trim().toLowerCase();
  const blob = `${character.name} ${character.description} ${character.voiceNotes || ""}`.toLowerCase();
  if (/^(the\s+)?(narrator|narradora|voice[- ]?over|voiceover|vo|off[- ]?screen|voz en off)$/i.test(name)) return true;
  return /\b(unseen voice|no on[- ]screen appearance|no onscreen|off[- ]screen(?: voice)?|voice[- ]over only|no presencia|sin presencia|voz en off)\b/i.test(
    blob,
  );
}

function mergeUnseenNarrators(project: Project) {
  const unseen = project.characters.filter(isUnseenVoice);
  if (!unseen.length) return;

  for (const narrator of unseen) {
    narrator.isExtra = true;
    const from = characterKey(narrator.name);
    for (const scene of project.scenes || []) {
      scene.characterNames = (scene.characterNames || []).filter((name) => characterKey(name) !== from);
      scene.extraNames = (scene.extraNames || []).filter((name) => characterKey(name) !== from);
    }
  }
}

function isCrowdName(name: string) {
  const n = name.trim();
  if (!n) return true;
  if (/\b(b-?roll|broll|montage|crowd|extra|background|passerby|onlooker|cutaway|fondo|multitud)\b/i.test(n)) return true;
  return /^(the\s+)?(dog|cat|puppy|kitten|pet|owner|person|man|woman|guy|kid|child|boy|girl|customer|handler|presenter|perro|gata?|dueño|dueno|persona|hombre|mujer|niñ[oa]|cliente)\s*\d+$/i.test(
    n,
  );
}

function isCrowdScene(scene: Scene) {
  const blob = `${scene.title} ${scene.summary} ${scene.camera}`.toLowerCase();
  if (/\b(b-?roll|broll|b roll|montage|cutaways?|crowd|passers-?by|varios perros|several dogs|many dogs|multiple owners)\b/.test(blob)) {
    return true;
  }
  const named = scene.characterNames?.length || 0;
  const talking = scene.dialogue?.length || 0;
  return named >= 6 && talking === 0;
}

export function refineStoryLeads(project: Project) {
  mergeUnseenNarrators(project);
  const speakers = new Set<string>();
  const storyKeys = new Set<string>();
  const montageOnly = new Set<string>();
  const sceneHits = new Map<string, number>();

  for (const scene of project.scenes || []) {
    const crowdShot = isCrowdScene(scene);
    for (const line of scene.dialogue || []) {
      const key = characterKey(line.speaker);
      if (!key) continue;
      speakers.add(key);
      storyKeys.add(key);
    }
    for (const name of scene.characterNames || []) {
      const key = characterKey(name);
      if (!key) continue;
      sceneHits.set(key, (sceneHits.get(key) || 0) + 1);
      if (crowdShot) montageOnly.add(key);
      else storyKeys.add(key);
    }
  }

  for (const key of storyKeys) montageOnly.delete(key);

  const ranked = [...project.characters].map((character) => {
    const key = characterKey(character.name);
    let score = 0;
    if (speakers.has(key)) score += 120;
    if (storyKeys.has(key)) score += 50;
    if (character.sourceRefId) score += 40;
    score += (sceneHits.get(key) || 0) * 8;
    if (isCrowdName(character.name) || montageOnly.has(key) || isUnseenVoice(character)) score -= 120;
    return { character, key, score };
  });
  ranked.sort((a, b) => b.score - a.score);

  const leadKeys = new Set<string>();
  for (const item of ranked) {
    if (leadKeys.size >= MAX_CAST_LEADS) break;
    if (isUnseenVoice(item.character) || isCrowdName(item.character.name) || montageOnly.has(item.key)) continue;
    const keep = speakers.has(item.key) || storyKeys.has(item.key) || Boolean(item.character.sourceRefId);
    if (!keep) continue;
    leadKeys.add(item.key);
    item.character.isExtra = false;
  }

  if (!leadKeys.size) {
    const fallback =
      ranked.find((item) => !isUnseenVoice(item.character) && !isCrowdName(item.character.name) && !montageOnly.has(item.key)) ||
      ranked.find((item) => !isUnseenVoice(item.character));
    if (fallback) {
      leadKeys.add(fallback.key);
      fallback.character.isExtra = false;
    }
  }

  for (const item of ranked) {
    if (!leadKeys.has(item.key)) item.character.isExtra = true;
  }

  for (const scene of project.scenes || []) {
    const originals = scene.characterNames;
    const principals = originals.filter((name) => leadKeys.has(characterKey(name)));
    const demoted = originals.filter((name) => !leadKeys.has(characterKey(name)));
    scene.characterNames = principals.length ? principals : isCrowdScene(scene) ? [] : originals;
    scene.extraNames = [...new Set([...(scene.extraNames || []), ...demoted])].filter(
      (name) => !leadKeys.has(characterKey(name)),
    );
  }

  return project;
}

export function scriptCallsForReference(
  project: Project,
  asset: ReferenceAsset,
  sceneIndexes?: number[],
  scriptFallback = false,
) {
  if (asset.kind === "character") return false;
  if (sceneIndexes && sceneIndexes.length === 0) return false;
  if ((asset.kind === "product" || asset.kind === "logo") && sceneIndexes?.length) {
    const texts = sceneIndexes.map((index) => sceneBlob(project, [index]));
    if (texts.length && texts.every((text) => productKeptOut(text))) return false;
    if (texts.length && !texts.some((text) => sceneRequiresAsset(asset.kind, text))) return false;
  }

  const cues = project.scriptRefCues || [];
  if (sceneIndexes) {
    if (
      cues.some(
        (cue) => cue.kind === asset.kind && cue.sceneIndexes.some((index) => sceneIndexes.includes(index)),
      )
    ) {
      return true;
    }
  } else if (cues.some((cue) => cue.kind === asset.kind)) {
    return true;
  }

  const text = sceneIndexes
    ? sceneBlob(project, sceneIndexes)
    : `${sceneBlob(project, sceneIndexes)}\n${scriptFallback ? project.scriptText || "" : ""}`;
  if (!text.trim()) return false;

  const label = asset.label.trim().toLowerCase();
  if (label && !GENERIC_LABELS.has(label) && text.toLowerCase().includes(label)) return true;

  if ((asset.kind === "product" || asset.kind === "logo") && sceneIndexes?.length && sceneMentionsProduct(project, asset, sceneIndexes)) {
    return true;
  }

  return (KIND_PATTERNS[asset.kind] || []).some((pattern) => pattern.test(text));
}

export function promptReadyReferences(project: Project, sceneIndexes?: number[], scriptFallback = false) {
  return project.references.filter((asset) => {
    const hasFile = Boolean(asset.originalPublicPath || asset.originalRemoteUrl);
    return hasFile && scriptCallsForReference(project, asset, sceneIndexes, scriptFallback);
  });
}

export function syncReferenceInclusion(project: Project) {
  for (const asset of project.references) {
    const hasFile = Boolean(asset.originalPublicPath || asset.originalRemoteUrl);
    if (project.song && asset.kind === "product" && hasFile) {
      asset.includeInVideo = true;
      continue;
    }
    asset.includeInVideo = hasFile && scriptCallsForReference(project, asset);
  }
  return project.references;
}

export function projectStage(project: Project) {
  if (project.workflowStep) return project.workflowStep;
  if (!project.scriptText.trim() && project.scenes.length === 0) return "script" as const;
  if (project.scenes.length) {
    if (project.batches.some((batch) => batch.videoPublicPath)) return "produce" as const;
    if (project.characters.some((character) => !character.isExtra && !isUnseenVoice(character) && character.portraitPublicPath && !character.lookConfirmed)) {
      return "cast" as const;
    }
    return "cast" as const;
  }
  return "setup" as const;
}

export function includedReferences(project: Project) {
  return promptReadyReferences(project);
}

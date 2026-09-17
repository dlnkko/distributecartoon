import { createId } from "./ids";
import type { Character, Project, ReferenceAsset, ReferenceKind } from "./types";

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
  { kind: "product", label: "Product 1", notes: "Optional. Only used if the script involves this product." },
  { kind: "product", label: "Product 2", notes: "Optional. Only used if the script involves this product." },
  { kind: "product", label: "Product 3", notes: "Optional. Only used if the script involves this product." },
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

function sceneBlob(project: Project, sceneIndexes?: number[]) {
  const scenes = sceneIndexes?.length
    ? project.scenes.filter((scene) => sceneIndexes.includes(scene.index))
    : project.scenes;
  const fromScenes = scenes
    .map((scene) =>
      [scene.title, scene.summary, scene.location, ...scene.dialogue.map((line) => `${line.speaker} ${line.line}`)].join(
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

function roleMatchesCharacter(label: string, character: Character) {
  const role = normalizeRole(label);
  if (!role || GENERIC_LABELS.has(label.trim().toLowerCase()) || /^character\s*\d+$/i.test(label.trim())) return false;
  const name = normalizeRole(character.name);
  if (role === name) return true;
  if (role.length >= 3 && (name.includes(role) || role.includes(name))) return true;
  const blob = `${character.name} ${character.description}`.toLowerCase();
  return new RegExp(`\\b${role.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}s?\\b`, "i").test(blob);
}

export function assignCharacterSourcePhotos(project: Project) {
  const photos = filledCharacterPhotos(project);
  const leads = project.characters.filter((character) => !character.isExtra);
  const map = new Map<string, ReferenceAsset>();
  const used = new Set<string>();

  for (const character of leads) {
    const match = photos.find((photo) => !used.has(photo.id) && roleMatchesCharacter(photo.label, character));
    if (!match) continue;
    map.set(character.id, match);
    used.add(match.id);
  }

  return map;
}

export function scriptCallsForReference(
  project: Project,
  asset: ReferenceAsset,
  sceneIndexes?: number[],
  scriptFallback = false,
) {
  if (asset.kind === "character") return false;
  if (sceneIndexes && sceneIndexes.length === 0) return false;

  const cues = project.scriptRefCues || [];
  if (
    cues.some(
      (cue) =>
        cue.kind === asset.kind &&
        (!sceneIndexes ||
          cue.sceneIndexes.length === 0 ||
          cue.sceneIndexes.some((index) => sceneIndexes.includes(index))),
    )
  ) {
    return true;
  }

  const text = `${sceneBlob(project, sceneIndexes)}\n${scriptFallback ? project.scriptText || "" : ""}`;
  if (!text.trim()) return false;

  const label = asset.label.trim().toLowerCase();
  if (label && !GENERIC_LABELS.has(label) && text.toLowerCase().includes(label)) return true;

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
    asset.includeInVideo = hasFile && scriptCallsForReference(project, asset);
  }
  return project.references;
}

export function projectStage(project: Project) {
  if (project.workflowStep) return project.workflowStep;
  if (!project.scriptText.trim() && project.scenes.length === 0) return "script" as const;
  if (project.scenes.length) {
    if (project.batches.some((batch) => batch.videoPublicPath)) return "produce" as const;
    if (project.characters.some((character) => !character.isExtra && character.portraitPublicPath && !character.lookConfirmed)) {
      return "cast" as const;
    }
    return "review" as const;
  }
  return "setup" as const;
}

export function includedReferences(project: Project) {
  return promptReadyReferences(project);
}

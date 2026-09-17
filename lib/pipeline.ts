import { downloadToPublic, extensionFromUrl, publishGenerated } from "./assets";
import { generateGptImage25Flare, generateSeedance25ReferenceVideo, uploadKieFile } from "./kie";
import { clampClipDuration, slugify, normalizeAspectRatio } from "./ids";
import { saveProject } from "./store";
import { characterLookFromPhotoPrompt, characterLookPrompt, characterLookRevisionPrompt, labeledReferencePrompt, openingFrameCharacters, packedScenePrompt, sceneFramePrompt, type PromptRef } from "./style";
import { assignCharacterSourcePhotos, promptReadyReferences } from "./refs";
import { isAbortError, throwIfAborted } from "./abort";
import { shouldGenerateOneShot } from "./timing";
import type { Batch, Character, Project, ReferenceAsset } from "./types";

type StatusFn = (text: string) => void;

function findCharacter(project: Project, name: string) {
  const needle = name.trim().toLowerCase();
  return project.characters.find((character) => character.name.toLowerCase() === needle);
}

async function persistImage(project: Project, remoteUrl: string, parts: string[]) {
  const ext = extensionFromUrl(remoteUrl, ".png");
  const withExt = [...parts];
  const last = withExt.at(-1) || "image";
  withExt[withExt.length - 1] = last.endsWith(ext) ? last : `${last}${ext}`;
  const saved = await downloadToPublic(remoteUrl, withExt);
  const hosted = await publishGenerated(project, saved.absolute, withExt);
  if (hosted) saved.publicPath = hosted;
  return saved;
}

async function persistVideo(project: Project, remoteUrl: string, parts: string[]) {
  const ext = extensionFromUrl(remoteUrl, ".mp4");
  const withExt = [...parts];
  const last = withExt.at(-1) || "clip";
  withExt[withExt.length - 1] = last.endsWith(ext) ? last : `${last}${ext}`;
  const saved = await downloadToPublic(remoteUrl, withExt);
  const hosted = await publishGenerated(project, saved.absolute, withExt);
  if (hosted) saved.publicPath = hosted;
  return saved;
}

function isHttpUrl(value?: string) {
  return Boolean(value && /^https?:\/\//i.test(value));
}

async function resolveUploadUrl(remoteUrl?: string, publicPath?: string, abortSignal?: AbortSignal) {
  if (isHttpUrl(remoteUrl)) return remoteUrl;
  if (isHttpUrl(publicPath)) return publicPath;
  if (publicPath) {
    try {
      return await uploadKieFile(publicPath, abortSignal);
    } catch {
      if (isHttpUrl(remoteUrl)) return remoteUrl;
      throw new Error(`Couldn't upload ${publicPath} to Kie.`);
    }
  }
  return undefined;
}

function uniqueNames(names: string[]) {
  const seen = new Set<string>();
  return names.filter((name) => {
    const key = name.trim().toLowerCase();
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function leadNames(project: Project, names: string[]) {
  return uniqueNames(names).filter((name) => {
    const character = findCharacter(project, name);
    return character ? !character.isExtra : true;
  });
}

export async function resetInFlightBatches(project: Project) {
  let changed = false;
  for (const batch of project.batches) {
    if (batch.status === "generating_video" || batch.status === "generating_frame") {
      batch.status = "planned";
      changed = true;
    }
  }
  if (changed) await saveProject(project);
  return project;
}

async function restoreBatchAfterAbort(project: Project, batch: Batch) {
  if (batch.videoPublicPath) batch.status = "done";
  else batch.status = "planned";
  await saveProject(project);
}

function previousBatch(project: Project, batch: Batch) {
  return project.batches
    .filter((item) => item.index < batch.index && (item.videoRemoteUrl || item.frameRemoteUrl))
    .sort((a, b) => b.index - a.index)[0];
}

export function leadCharacters(project: Project) {
  return project.characters.filter((character) => !character.isExtra);
}

export async function generateCharacterLook(
  project: Project,
  character: Character,
  onStatus: StatusFn,
  abortSignal?: AbortSignal,
  revisionNotes?: string,
  source?: ReferenceAsset,
) {
  throwIfAborted(abortSignal);
  const inputUrls: string[] = [];
  if (revisionNotes) {
    const prior = await resolveUploadUrl(character.portraitRemoteUrl, character.portraitPublicPath, abortSignal);
    if (prior) inputUrls.push(prior);
  } else if (source) {
    const photo = await resolveUploadUrl(source.originalRemoteUrl, source.originalPublicPath, abortSignal);
    if (photo) inputUrls.push(photo);
  }
  onStatus(revisionNotes ? `Updating ${character.name}…` : `Casting ${character.name}…`);
  const fromPhoto = Boolean(!revisionNotes && source && inputUrls.length);
  const remoteUrl = await generateGptImage25Flare({
    prompt: revisionNotes
      ? characterLookRevisionPrompt(character, project.style, revisionNotes)
      : fromPhoto
        ? characterLookFromPhotoPrompt(character, project.style)
        : characterLookPrompt(character, project.style),
    aspectRatio: "1:1",
    resolution: "2K",
    inputUrls,
    abortSignal,
  });
  const saved = await persistImage(project, remoteUrl, [
    project.id,
    "characters",
    `${character.slug}-look-${Date.now()}`,
  ]);
  character.portraitFileName = saved.fileName;
  character.portraitPublicPath = saved.publicPath;
  character.portraitRemoteUrl = remoteUrl;
  character.lookConfirmed = false;
  if (revisionNotes) character.lookRevisionUsed = true;
  else if (fromPhoto && source) character.sourceRefId = source.id;
  else delete character.sourceRefId;
  await saveProject(project);
  return character;
}

export async function ensureCharacterLooks(project: Project, onStatus: StatusFn, abortSignal?: AbortSignal) {
  const leads = leadCharacters(project);
  const sources = assignCharacterSourcePhotos(project);
  for (const character of leads) {
    throwIfAborted(abortSignal);
    const source = sources.get(character.id);
    const hasLook = Boolean(character.portraitRemoteUrl || character.portraitPublicPath);
    const sameSource = source ? character.sourceRefId === source.id : !character.sourceRefId;
    if (hasLook && sameSource) continue;
    try {
      await generateCharacterLook(project, character, onStatus, abortSignal, undefined, source);
    } catch (error) {
      if (isAbortError(error)) throw error;
      onStatus(`Couldn't cast ${character.name}. Continuing with the description.`);
    }
  }
  return project.characters;
}

export async function reviseCharacterLook(
  project: Project,
  characterId: string,
  notes: string,
  onStatus: StatusFn,
  abortSignal?: AbortSignal,
) {
  const character = project.characters.find((item) => item.id === characterId);
  if (!character) throw new Error("Character not found.");
  if (character.isExtra) throw new Error("Extras do not get a look still.");
  if (character.lookRevisionUsed) throw new Error("This look can only be changed once.");
  const change = notes.trim();
  if (!change) throw new Error("Write the change you want.");
  return generateCharacterLook(project, character, onStatus, abortSignal, change);
}

export async function confirmCharacterLooks(project: Project) {
  for (const character of leadCharacters(project)) {
    character.lookConfirmed = true;
  }
  await saveProject(project);
  return project;
}

async function collectFrameInputs(project: Project, batch: Batch, abortSignal?: AbortSignal) {
  const inputUrls: string[] = [];
  const prev = previousBatch(project, batch);
  if (prev?.framePublicPath || prev?.frameRemoteUrl) {
    const prevFrame = await resolveUploadUrl(prev.frameRemoteUrl, prev.framePublicPath, abortSignal);
    if (prevFrame) inputUrls.push(prevFrame);
  }
  for (const name of openingFrameCharacters(project, batch)) {
    const character = findCharacter(project, name);
    const url = await resolveUploadUrl(character?.portraitRemoteUrl, character?.portraitPublicPath, abortSignal);
    if (url) inputUrls.push(url);
  }
  for (const asset of promptReadyReferences(project, batch.sceneIndexes.slice(0, 1))) {
    const url = await resolveUploadUrl(asset.originalRemoteUrl, asset.originalPublicPath, abortSignal);
    if (url) inputUrls.push(url);
  }
  return uniqueUrls(inputUrls).slice(0, 16);
}

function uniqueUrls(urls: string[]) {
  const seen = new Set<string>();
  return urls.filter((url) => {
    if (seen.has(url)) return false;
    seen.add(url);
    return true;
  });
}

export async function generateBatchFrame(project: Project, batchIndex: number, onStatus: StatusFn, abortSignal?: AbortSignal) {
  throwIfAborted(abortSignal);
  const batch = project.batches.find((item) => item.index === batchIndex);
  if (!batch) throw new Error(`Batch ${batchIndex} does not exist.`);
  batch.status = "generating_frame";
  await saveProject(project);

  try {
    const inputUrls = await collectFrameInputs(project, batch, abortSignal);
    onStatus(`Generating the first frame of scene ${batch.sceneIndexes[0] || 1}…`);
    throwIfAborted(abortSignal);
    const remoteUrl = await generateGptImage25Flare({
      prompt: sceneFramePrompt(project, batch),
      aspectRatio: normalizeAspectRatio(project.aspectRatio),
      resolution: "2K",
      inputUrls,
      abortSignal,
    });

    const fileStem = `batch-${String(batchIndex).padStart(2, "0")}-frame`;
    const saved = await persistImage(project, remoteUrl, [project.id, "frames", fileStem]);
    batch.frameFileName = saved.fileName;
    batch.framePublicPath = saved.publicPath;
    batch.frameRemoteUrl = remoteUrl;
    batch.status = "planned";
    await saveProject(project);
    return batch;
  } catch (error) {
    if (isAbortError(error)) await restoreBatchAfterAbort(project, batch);
    throw error;
  }
}

function speakersInScenes(project: Project, sceneIndexes: number[]) {
  const names: string[] = [];
  for (const index of sceneIndexes) {
    const scene = project.scenes.find((item) => item.index === index);
    if (!scene) continue;
    for (const line of scene.dialogue || []) {
      if (line.speaker?.trim()) names.push(line.speaker);
    }
  }
  return leadNames(project, names);
}

function voiceTagsForBatch(project: Project, batch: Batch) {
  const speakers = speakersInScenes(project, batch.sceneIndexes);
  if (speakers.length) return speakers;
  return leadNames(project, batch.characterNames);
}

function pickCastVideo(project: Project, batch: Batch): { batch: Batch; names: string[] } | undefined {
  const needed = voiceTagsForBatch(project, batch);
  if (!needed.length) return undefined;
  const neededSet = new Set(needed.map((name) => name.toLowerCase()));
  const pool = project.batches
    .filter((item) => item.index < batch.index && (item.videoPublicPath || item.videoRemoteUrl))
    .sort((a, b) => b.index - a.index);

  let best:
    | {
        batch: Batch;
        names: string[];
        covered: number;
        extra: number;
        exact: boolean;
        allVoices: boolean;
      }
    | undefined;

  for (const item of pool) {
    const voices = voiceTagsForBatch(project, item);
    const coveredNames = voices.filter((name) => neededSet.has(name.toLowerCase()));
    if (!coveredNames.length) continue;
    const extra = voices.filter((name) => !neededSet.has(name.toLowerCase())).length;
    const covered = coveredNames.length;
    const allVoices = covered === needed.length;
    const exact = allVoices && extra === 0;
    const better = !best
      ? true
      : allVoices !== best.allVoices
        ? allVoices
        : exact !== best.exact
          ? exact
          : covered !== best.covered
            ? covered > best.covered
            : extra < best.extra;
    if (!better) continue;
    best = {
      batch: item,
      names: allVoices ? needed : coveredNames,
      covered,
      extra,
      exact,
      allVoices,
    };
  }

  return best ? { batch: best.batch, names: best.names } : undefined;
}

function batchCastNames(project: Project, batch: Batch) {
  const fromScenes = batch.sceneIndexes.flatMap((index) => {
    const scene = project.scenes.find((item) => item.index === index);
    return scene?.characterNames || [];
  });
  return leadNames(project, [...batch.characterNames, ...fromScenes]);
}

async function collectReferences(project: Project, batch: Batch, abortSignal?: AbortSignal) {
  const imageEntries: PromptRef[] = [];
  const videoEntries: PromptRef[] = [];

  const frameUrl = await resolveUploadUrl(batch.frameRemoteUrl, batch.framePublicPath, abortSignal);
  if (frameUrl) {
    imageEntries.push({
      url: frameUrl,
      kind: "frame",
      name: "opening frame",
    });
  }

  for (const name of batchCastNames(project, batch)) {
    const character = findCharacter(project, name);
    const url = await resolveUploadUrl(character?.portraitRemoteUrl, character?.portraitPublicPath, abortSignal);
    if (!url) continue;
    imageEntries.push({
      url,
      kind: "character",
      name: character?.name || name,
    });
  }

  for (const asset of promptReadyReferences(project, batch.sceneIndexes, true)) {
    const url = await resolveUploadUrl(asset.originalRemoteUrl, asset.originalPublicPath, abortSignal);
    if (!url) continue;
    const kind = asset.kind === "logo" || asset.kind === "product" || asset.kind === "location" ? asset.kind : "other";
    imageEntries.push({
      url,
      kind,
      name: asset.label,
      notes: asset.notes,
    });
  }

  const pick = pickCastVideo(project, batch);
  if (pick) {
    const url = await resolveUploadUrl(pick.batch.videoRemoteUrl, pick.batch.videoPublicPath, abortSignal);
    if (url) {
      videoEntries.push({
        url,
        kind: "video",
        name: pick.names.join(" and "),
      });
    }
  }

  return { imageEntries, videoEntries: videoEntries.slice(0, 1) };
}

function assignClipToCharacters(
  project: Project,
  batch: Batch,
  clip: {
    id: string;
    fileName: string;
    publicPath: string;
    remoteUrl: string;
  },
) {
  const names = voiceTagsForBatch(project, batch);
  for (const name of names) {
    const character = findCharacter(project, name);
    if (!character || character.isExtra) continue;
    character.clips.push({
      id: clip.id,
      fileName: clip.fileName,
      publicPath: clip.publicPath,
      remoteUrl: clip.remoteUrl,
      batchIndex: batch.index,
      characterNames: names,
    });
    if (names.length === 1) {
      character.latestVideoFileName = clip.fileName;
      character.latestVideoPublicPath = clip.publicPath;
      character.latestVideoRemoteUrl = clip.remoteUrl;
    }
  }

  if (names.length > 1) {
    for (const name of names) {
      const character = findCharacter(project, name);
      if (!character || character.latestVideoRemoteUrl) continue;
      character.latestVideoFileName = clip.fileName;
      character.latestVideoPublicPath = clip.publicPath;
      character.latestVideoRemoteUrl = clip.remoteUrl;
    }
  }
}

export async function generateBatchVideo(
  project: Project,
  batchIndex: number,
  onStatus: StatusFn,
  durationOverride?: unknown,
  abortSignal?: AbortSignal,
) {
  throwIfAborted(abortSignal);
  const batch = project.batches.find((item) => item.index === batchIndex);
  if (!batch) throw new Error(`Batch ${batchIndex} does not exist.`);
  if (shouldGenerateOneShot(project.targetDurationSeconds, project.scenes)) {
    batch.duration = clampClipDuration(project.targetDurationSeconds, batch.duration || 8);
  } else if (durationOverride !== undefined) {
    batch.duration = clampClipDuration(durationOverride, batch.duration || 8);
  } else {
    batch.duration = clampClipDuration(batch.duration, 8);
  }

  if (!batch.frameRemoteUrl) {
    await generateBatchFrame(project, batchIndex, onStatus, abortSignal);
  }

  throwIfAborted(abortSignal);
  batch.status = "generating_video";
  await saveProject(project);

  try {
    const { imageEntries, videoEntries } = await collectReferences(project, batch, abortSignal);
    throwIfAborted(abortSignal);
    const prompt = labeledReferencePrompt({
      images: imageEntries,
      videos: videoEntries,
      style: project.style,
      project,
      sceneIndexes: batch.sceneIndexes,
      videoPrompt: packedScenePrompt(project, batch.sceneIndexes, batch.videoPrompt),
    });

    const voiceNote = videoEntries[0]?.name ? ` Voice ref: ${videoEntries[0].name}.` : "";
    onStatus(`Animating the video (${batch.duration}s)…${voiceNote}`);
    const remoteUrl = await generateSeedance25ReferenceVideo({
      prompt,
      duration: batch.duration,
      aspectRatio: normalizeAspectRatio(project.aspectRatio),
      referenceImageUrls: imageEntries.map((item) => item.url),
      referenceVideoUrls: videoEntries.slice(0, 1).map((item) => item.url),
      generateAudio: true,
      resolution: "480p",
      abortSignal,
    });
    throwIfAborted(abortSignal);

    const people = uniqueNames(batch.characterNames).map((name) => slugify(name)).join("_") || "scene";
    const fileStem = `batch-${String(batchIndex).padStart(2, "0")}-${people}`;
    const saved = await persistVideo(project, remoteUrl, [project.id, "batches", fileStem]);

    batch.videoFileName = saved.fileName;
    batch.videoPublicPath = saved.publicPath;
    batch.videoRemoteUrl = remoteUrl;
    batch.status = "done";
    project.lastVideoFileName = saved.fileName;
    project.lastVideoPublicPath = saved.publicPath;
    project.lastVideoRemoteUrl = remoteUrl;

    assignClipToCharacters(project, batch, {
      id: `clip_${batch.index}`,
      fileName: saved.fileName,
      publicPath: saved.publicPath,
      remoteUrl,
    });

    await saveProject(project);
    return { batch, prompt };
  } catch (error) {
    if (isAbortError(error)) await restoreBatchAfterAbort(project, batch);
    throw error;
  }
}

export function summarizeLibrary(project: Project) {
  return {
    characters: project.characters.map((character: Character) => ({
      name: character.name,
      slug: character.slug,
      extra: character.isExtra,
      portrait: character.portraitFileName || null,
      latestVideo: character.latestVideoFileName || null,
      clips: character.clips.map((clip) => ({
        file: clip.fileName,
        batch: clip.batchIndex,
        cast: clip.characterNames,
      })),
    })),
    references: project.references.map((asset: ReferenceAsset) => ({
      id: asset.id,
      kind: asset.kind,
      label: asset.label,
      status: asset.status,
      includeInVideo: asset.includeInVideo,
      notes: asset.notes,
      stylized: asset.stylizedFileName || null,
    })),
  };
}

export function getBatch(project: Project, batchIndex: number): Batch {
  const batch = project.batches.find((item) => item.index === batchIndex);
  if (!batch) throw new Error(`Batch ${batchIndex} does not exist.`);
  return batch;
}

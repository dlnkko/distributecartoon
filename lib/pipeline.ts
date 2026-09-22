import { downloadToPublic, extensionFromUrl, readPublicFile, storeGeneratedFile } from "./assets";
import { concatVideoBuffers } from "./concat";
import { generateGptImage25Flare, generateSeedance25ReferenceVideo, peekKieTask, submitSeedance25ReferenceVideo, uploadKieFile, waitForTask } from "./kie";
import { clampClipDuration, clampTotalDuration, createId, nowIso, slugify, normalizeAspectRatio } from "./ids";
import { ensureArchivedVideo, getProject, saveProject } from "./store";
import { batchAwaitingVideo, produceShouldResumeStory, projectDeliveredSrc, realKieVideoTaskId, storyBatchNeedsSubmit } from "./video-jobs";
import { characterAnchorPrompt, characterLookFromPhotoPrompt, characterLookPrompt, characterLookRevisionPrompt, labeledReferencePrompt, locationPlatePrompt, openingFrameCharacters, packedScenePrompt, sceneFramePrompt, type PromptRef } from "./style";
import { placeLabel, richerPlaceName, samePlace } from "./places";
import { assignCharacterSourcePhotos, isUnseenVoice, promptReadyReferences, refineStoryLeads } from "./refs";
import { abortableDelay, isAbortError, throwIfAborted } from "./abort";
import { packScenesIntoParts, scaleEstimatedSeconds, sceneHasStory, shouldGenerateOneShot } from "./timing";
import type { Batch, Character, LocationPlate, Project, ReferenceAsset } from "./types";

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
  try {
    return await downloadToPublic(remoteUrl, withExt, project);
  } catch {
    return {
      fileName: withExt.at(-1) || "image.png",
      publicPath: remoteUrl,
      absolute: remoteUrl,
    };
  }
}

async function persistVideo(project: Project, remoteUrl: string, parts: string[]) {
  const ext = extensionFromUrl(remoteUrl, ".mp4");
  const withExt = [...parts];
  const last = withExt.at(-1) || "clip";
  withExt[withExt.length - 1] = last.endsWith(ext) ? last : `${last}${ext}`;
  return downloadToPublic(remoteUrl, withExt, project);
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
      throw new Error(`Couldn't upload ${publicPath} for generation.`);
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
  if (project.keepGenerating) return project;
  let changed = false;
  for (const batch of project.batches) {
    if (batch.status === "generating_video" && batch.kieVideoTaskId) continue;
    if (batch.status === "generating_video" || batch.status === "generating_frame") {
      batch.status = batch.kieVideoTaskId ? "generating_video" : "planned";
      changed = true;
    }
  }
  if (changed) await saveProject(project);
  return project;
}

async function attachGeneratedVideo(project: Project, batch: Batch, remoteUrl: string) {
  if (remoteUrl) {
    batch.videoRemoteUrl = remoteUrl;
    project.lastVideoRemoteUrl = remoteUrl;
  }
  batch.status = "done";
  project.workflowStep = "produce";
  if (!batch.videoPublicPath && batch.videoRemoteUrl) {
    try {
      const people = uniqueNames(batch.characterNames).map((name) => slugify(name)).join("_") || "scene";
      const fileStem = `batch-${String(batch.index).padStart(2, "0")}-${people}`;
      const saved = await persistVideo(project, batch.videoRemoteUrl, [project.id, "batches", fileStem]);
      batch.videoFileName = saved.fileName;
      batch.videoPublicPath = saved.publicPath;
      project.lastVideoFileName = saved.fileName;
      project.lastVideoPublicPath = saved.publicPath;
      delete batch.kieVideoTaskId;
    } catch {
      // The OpenRouter file is already recorded. The player can stream it until storage succeeds.
    }
  } else if (batch.videoPublicPath) {
    delete batch.kieVideoTaskId;
  }
  assignClipToCharacters(project, batch, {
    id: `clip_${batch.index}`,
    fileName: batch.videoFileName || `batch-${batch.index}.mp4`,
    publicPath: batch.videoPublicPath || batch.videoRemoteUrl!,
    remoteUrl: batch.videoRemoteUrl || remoteUrl,
  });
  ensureArchivedVideo(project, batch);
}

export async function recoverPendingVideos(project: Project, options?: { wait?: boolean }) {
  let changed = false;
  for (const batch of project.batches) {
    if (batch.videoPublicPath) {
      if (batch.status !== "done") {
        batch.status = "done";
        changed = true;
      }
      const before = project.archivedVideos?.length || 0;
      ensureArchivedVideo(project, batch);
      if ((project.archivedVideos?.length || 0) !== before) changed = true;
      continue;
    }
    if (batch.videoRemoteUrl) {
      try {
        await attachGeneratedVideo(project, batch, batch.videoRemoteUrl);
      } catch {
        batch.status = "done";
        project.workflowStep = "produce";
        project.lastVideoRemoteUrl = batch.videoRemoteUrl;
        ensureArchivedVideo(project, batch);
      }
      changed = true;
      continue;
    }
    const taskId = realKieVideoTaskId(batch.kieVideoTaskId);
    if (!taskId) {
      if (batch.kieVideoTaskId === "pending" || batchAwaitingVideo(batch)) {
        batch.status = "generating_video";
        project.workflowStep = "produce";
        changed = true;
      }
      continue;
    }
    try {
      if (options?.wait) {
        const remoteUrl = await waitForTask(taskId, undefined, "video");
        if (remoteUrl) {
          await attachGeneratedVideo(project, batch, remoteUrl);
          changed = true;
        }
        continue;
      }
      const peek = await peekKieTask(taskId);
      if (peek.status === "success") {
        batch.videoRemoteUrl = peek.url;
        batch.status = "done";
        project.workflowStep = "produce";
        project.lastVideoRemoteUrl = peek.url;
        changed = true;
        await saveProject(project);
        await attachGeneratedVideo(project, batch, peek.url);
      } else if (peek.status === "fail") {
        delete batch.kieVideoTaskId;
        batch.status = "error";
        batch.error = peek.error;
        changed = true;
      } else {
        batch.status = "generating_video";
        project.workflowStep = "produce";
        changed = true;
      }
    } catch (error) {
      if (error instanceof Error && /generation failed/i.test(error.message)) {
        delete batch.kieVideoTaskId;
        batch.status = "error";
        batch.error = error.message;
        changed = true;
      } else {
        batch.status = "generating_video";
        project.workflowStep = "produce";
        changed = true;
      }
    }
  }
  if (await resumeLongformAnchors(project)) changed = true;
  if (await resumeUnsentStoryJobs(project)) changed = true;
  const parts = project.batches.filter((batch) => batch.videoPublicPath || batch.videoRemoteUrl);
  if (parts.length > 1 && parts.length === project.batches.length) {
    try {
      await joinReadyParts(project, () => undefined);
      changed = true;
    } catch {
      // The parts stay available until the next join attempt.
    }
  }
  if (changed) await saveProject(project);
  return project;
}

async function restoreBatchAfterAbort(project: Project, batch: Batch) {
  if (batch.videoPublicPath) batch.status = "done";
  else if (batch.kieVideoTaskId) batch.status = "generating_video";
  else batch.status = "planned";
  await saveProject(project);
}

function copyVideoFields(target: Batch, source: Batch) {
  target.videoFileName = source.videoFileName;
  target.videoPublicPath = source.videoPublicPath;
  target.videoRemoteUrl = source.videoRemoteUrl;
  target.kieVideoTaskId = source.kieVideoTaskId;
  if (source.videoPublicPath || source.videoRemoteUrl) target.status = "done";
}

const videoLocks = new Map<string, Promise<{ batch: Batch; prompt: string }>>();

function previousBatch(project: Project, batch: Batch) {
  return project.batches
    .filter((item) => item.index < batch.index && (item.videoRemoteUrl || item.frameRemoteUrl))
    .sort((a, b) => b.index - a.index)[0];
}

export function leadCharacters(project: Project) {
  return project.characters.filter((character) => !character.isExtra && !isUnseenVoice(character));
}

const ANCHOR_SECONDS = 4;
const MAX_ANCHOR_VIDEOS = 7;
const projectSaves = new Map<string, Promise<unknown>>();

function saveSoon(project: Project) {
  const previous = projectSaves.get(project.id) || Promise.resolve();
  const next = previous.then(
    () => saveProject(project),
    () => saveProject(project),
  );
  projectSaves.set(project.id, next);
  return next;
}

function anchorSourceUrl(character: Character) {
  return character.portraitRemoteUrl || character.portraitPublicPath || "";
}

function hasFreshAnchor(character: Character) {
  const source = anchorSourceUrl(character);
  return Boolean(source && character.anchorVideoRemoteUrl && character.anchorSourceUrl === source);
}

function storyPlaces(project: Project) {
  const photos = project.references.filter(
    (asset) => asset.kind === "location" && (asset.originalRemoteUrl || asset.originalPublicPath),
  );
  const places: Array<{ name: string; photo?: ReferenceAsset }> = [];
  function add(name: string, photo?: ReferenceAsset) {
    const clean = placeLabel(name);
    if (!clean || /^(unknown|none|n\/a|tbd)$/i.test(clean)) return;
    const hit = places.find((place) => samePlace(place.name, clean));
    if (hit) {
      if (photo && !hit.photo) hit.photo = photo;
      hit.name = richerPlaceName(hit.name, clean);
      return;
    }
    places.push({ name: clean, photo });
  }
  for (const scene of project.scenes) add(scene.location);
  for (const photo of photos) {
    const label = photo.label.trim();
    if (!label || /^location\s*\d+$/i.test(label)) continue;
    if (!promptReadyReferences(project, undefined, true).some((asset) => asset.id === photo.id)) continue;
    add(label, photo);
  }
  return places;
}

async function rememberAnchor(project: Project, character: Character, remoteUrl: string) {
  let saved: { fileName?: string; publicPath?: string };
  try {
    saved = await persistVideo(project, remoteUrl, [project.id, "anchors", `${character.slug}-intro`]);
  } catch {
    saved = { fileName: `${character.slug}-intro.mp4`, publicPath: remoteUrl };
  }
  character.anchorVideoPublicPath = saved.publicPath || remoteUrl;
  character.anchorVideoRemoteUrl = remoteUrl;
  character.anchorSourceUrl = anchorSourceUrl(character);
  delete character.anchorVideoTaskId;
  await saveSoon(project);
}

function characterHasDialogue(project: Project, character: Character) {
  const key = character.name.trim().toLowerCase();
  if (!key) return false;
  return project.scenes.some((scene) =>
    (scene.dialogue || []).some((line) => {
      const speaker = (line.speaker || "").trim();
      if (!speaker || !(line.line || "").trim()) return false;
      if (isUnseenVoice({ name: speaker, description: "" })) return false;
      return speaker.toLowerCase() === key;
    }),
  );
}

async function ensureCharacterAnchors(project: Project, onStatus: StatusFn, abortSignal?: AbortSignal) {
  const pending = leadCharacters(project).filter(
    (character) => characterHasDialogue(project, character) && hasUsableLook(character) && !hasFreshAnchor(character),
  );
  await Promise.all(
    pending.map(async (character) => {
      const source = anchorSourceUrl(character);
      if (character.anchorSourceUrl && character.anchorSourceUrl !== source) delete character.anchorVideoTaskId;
      const portrait = await resolveUploadUrl(character.portraitRemoteUrl, character.portraitPublicPath, abortSignal);
      if (!portrait) return;
      onStatus("Generating your video…");
      try {
        const remoteUrl = await generateSeedance25ReferenceVideo({
          prompt: characterAnchorPrompt(character.name, project.style),
          duration: ANCHOR_SECONDS,
          aspectRatio: normalizeAspectRatio(project.aspectRatio),
          referenceImageUrls: [portrait],
          generateAudio: true,
          resolution: "480p",
          existingTaskId: realKieVideoTaskId(character.anchorVideoTaskId) || undefined,
          onTaskCreated: async (taskId) => {
            character.anchorVideoTaskId = taskId;
            character.anchorSourceUrl = source;
            await saveSoon(project);
          },
        });
        await rememberAnchor(project, character, remoteUrl);
      } catch (error) {
        if (isAbortError(error)) throw error;
        onStatus(`Couldn't record ${character.name}.`);
      }
    }),
  );
}

async function ensureLocationPlates(project: Project, onStatus: StatusFn, abortSignal?: AbortSignal) {
  project.locationPlates = Array.isArray(project.locationPlates) ? project.locationPlates : [];
  const missing = storyPlaces(project).filter(
    (place) => !project.locationPlates!.some((plate) => samePlace(plate.name, place.name) && isHttpUrl(plate.remoteUrl)),
  );
  for (const place of missing) {
    onStatus("Generating your video…");
    try {
      const photo = place.photo
        ? await resolveUploadUrl(place.photo.originalRemoteUrl, place.photo.originalPublicPath, abortSignal)
        : "";
      const remoteUrl = await generateGptImage25Flare({
        prompt: locationPlatePrompt(place.name, project.style, Boolean(photo)),
        aspectRatio: project.aspectRatio,
        resolution: "2K",
        inputUrls: photo ? [photo] : [],
        abortSignal,
      });
      let saved;
      try {
        saved = await persistImage(project, remoteUrl, [project.id, "locations", slugify(place.name) || "place"]);
      } catch {
        saved = { fileName: "place.png", publicPath: remoteUrl, absolute: remoteUrl };
      }
      project.locationPlates = (project.locationPlates || []).filter((plate) => !samePlace(plate.name, place.name));
      project.locationPlates.push({
        name: place.name,
        publicPath: saved.publicPath || remoteUrl,
        remoteUrl,
      });
      await saveSoon(project);
    } catch (error) {
      if (isAbortError(error)) throw error;
      onStatus(`Couldn't build ${place.name}. The story will still generate.`);
    }
  }
}

export async function ensureLongformAnchors(project: Project, onStatus: StatusFn, abortSignal?: AbortSignal) {
  if (shouldGenerateOneShot(project.targetDurationSeconds, project.scenes)) return project;
  throwIfAborted(abortSignal);
  await ensureCharacterAnchors(project, onStatus, abortSignal);
  await ensureLocationPlates(project, onStatus, abortSignal);
  return project;
}

async function resumeLongformAnchors(project: Project) {
  if (shouldGenerateOneShot(project.targetDurationSeconds, project.scenes)) return false;
  let changed = false;
  for (const character of leadCharacters(project)) {
    if (!characterHasDialogue(project, character)) continue;
    const taskId = realKieVideoTaskId(character.anchorVideoTaskId);
    if (!taskId || hasFreshAnchor(character)) continue;
    const peek = await peekKieTask(taskId);
    if (peek.status === "success") {
      await rememberAnchor(project, character, peek.url);
      changed = true;
    } else if (peek.status === "fail") {
      delete character.anchorVideoTaskId;
      changed = true;
    }
  }
  return changed;
}

type LookResult = {
  fileName: string;
  publicPath: string;
  remoteUrl: string;
  fromPhoto: boolean;
  source?: ReferenceAsset;
  revisionNotes?: string;
};

function applyLookToCharacter(character: Character, look: LookResult) {
  character.portraitFileName = look.fileName;
  character.portraitPublicPath = look.publicPath || look.remoteUrl;
  character.portraitRemoteUrl = look.remoteUrl || look.publicPath;
  character.lookConfirmed = false;
  if (look.revisionNotes) character.lookRevisionUsed = true;
  else if (look.fromPhoto && look.source) character.sourceRefId = look.source.id;
  else delete character.sourceRefId;
}

async function createCharacterLook(
  project: Project,
  character: Character,
  abortSignal?: AbortSignal,
  revisionNotes?: string,
  source?: ReferenceAsset,
): Promise<LookResult> {
  throwIfAborted(abortSignal);
  const photo = source || project.references.find((item) => item.id === character.sourceRefId);
  const inputUrls: string[] = [];
  if (revisionNotes) {
    const prior = await resolveUploadUrl(character.portraitRemoteUrl, character.portraitPublicPath, abortSignal);
    if (prior) inputUrls.push(prior);
  } else if (photo) {
    const url = await resolveUploadUrl(photo.originalRemoteUrl, photo.originalPublicPath, abortSignal);
    if (!url) throw new Error(`Couldn't upload the ${photo.label} photo for ${character.name}.`);
    inputUrls.push(url);
  }
  const fromPhoto = Boolean(!revisionNotes && photo && inputUrls.length);
  const remoteUrl = await generateGptImage25Flare({
    prompt: revisionNotes
      ? characterLookRevisionPrompt(character, project.style, revisionNotes)
      : fromPhoto
        ? characterLookFromPhotoPrompt(character, project.style, photo?.label)
        : characterLookPrompt(character, project.style),
    aspectRatio: "1:1",
    resolution: "2K",
    inputUrls,
    abortSignal,
  });
  if (!remoteUrl) throw new Error(`Fal did not return a look for ${character.name}.`);
  let saved;
  try {
    saved = await persistImage(project, remoteUrl, [
      project.id,
      "characters",
      `${character.slug}-look-${Date.now()}-${createId("look")}`,
    ]);
  } catch {
    saved = { fileName: `${character.slug}-look.png`, publicPath: remoteUrl, absolute: remoteUrl };
  }
  return {
    fileName: saved.fileName,
    publicPath: saved.publicPath || remoteUrl,
    remoteUrl,
    fromPhoto,
    source: photo,
    revisionNotes,
  };
}

function hasUsableLook(character: Character) {
  return isHttpUrl(character.portraitRemoteUrl) || isHttpUrl(character.portraitPublicPath);
}

function characterNeedsLook(character: Character, source?: ReferenceAsset) {
  const sameSource = source ? character.sourceRefId === source.id : !character.sourceRefId;
  return !(hasUsableLook(character) && sameSource);
}

export async function generateCharacterLook(
  project: Project,
  character: Character,
  onStatus: StatusFn,
  abortSignal?: AbortSignal,
  revisionNotes?: string,
  source?: ReferenceAsset,
) {
  onStatus(revisionNotes ? `Updating ${character.name}…` : `Casting ${character.name}…`);
  const look = await createCharacterLook(project, character, abortSignal, revisionNotes, source);
  applyLookToCharacter(character, look);
  await saveProject(project);
  return character;
}

async function requestLooks(
  project: Project,
  characters: Character[],
  sources: Map<string, ReferenceAsset>,
  abortSignal?: AbortSignal,
) {
  return Promise.allSettled(
    characters.map(async (character) => {
      const look = await createCharacterLook(project, character, abortSignal, undefined, sources.get(character.id));
      applyLookToCharacter(character, look);
      return look;
    }),
  );
}

export async function ensureCharacterLooks(project: Project, onStatus: StatusFn, abortSignal?: AbortSignal) {
  refineStoryLeads(project);
  const leads = leadCharacters(project);
  const sources = assignCharacterSourcePhotos(project);
  const pending = leads.filter((character) => characterNeedsLook(character, sources.get(character.id)));
  if (!pending.length) return project.characters;

  onStatus(
    pending.length === 1 ? `Casting ${pending[0].name}…` : `Casting ${pending.map((character) => character.name).join(", ")}…`,
  );

  let settled = await requestLooks(project, pending, sources, abortSignal);
  const retry: Character[] = [];
  let abortError: unknown;
  for (let index = 0; index < pending.length; index += 1) {
    const result = settled[index];
    if (result.status === "fulfilled") continue;
    if (isAbortError(result.reason)) abortError = result.reason;
    else retry.push(pending[index]);
  }
  await saveProject(project);
  if (abortError) throw abortError;

  if (retry.length && !abortSignal?.aborted) {
    onStatus(`Retrying ${retry.map((character) => character.name).join(", ")}…`);
    settled = await requestLooks(project, retry, sources, abortSignal);
    abortError = undefined;
    for (let index = 0; index < retry.length; index += 1) {
      const result = settled[index];
      if (result.status === "fulfilled") continue;
      if (isAbortError(result.reason)) abortError = result.reason;
      else onStatus(`Couldn't cast ${retry[index].name}.`);
    }
    await saveProject(project);
    if (abortError) throw abortError;
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
  const openingScene = batch.sceneIndexes.length ? [Math.min(...batch.sceneIndexes)] : [];
  for (const asset of promptReadyReferences(project, openingScene)) {
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
    onStatus(`Generating the first frame of scene ${batch.sceneIndexes.length ? Math.min(...batch.sceneIndexes) : 1}…`);
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
    if (!scene) return [];
    return [...(scene.characterNames || []), ...(scene.dialogue || []).map((line) => line.speaker)];
  });
  return leadNames(project, [...fromScenes, ...batch.characterNames]);
}

async function collectLongformReferences(project: Project, batch: Batch, abortSignal?: AbortSignal) {
  const imageEntries: PromptRef[] = [];
  const videoEntries: PromptRef[] = [];
  const cast = new Set(batchCastNames(project, batch).map((name) => name.toLowerCase()));

  for (const character of leadCharacters(project)) {
    if (!cast.has(character.name.toLowerCase())) continue;
    if (characterHasDialogue(project, character)) {
      const video = await resolveUploadUrl(character.anchorVideoRemoteUrl, character.anchorVideoPublicPath, abortSignal);
      if (video) {
        videoEntries.push({ url: video, kind: "character", name: character.name });
        continue;
      }
    }
    const portrait = await resolveUploadUrl(character.portraitRemoteUrl, character.portraitPublicPath, abortSignal);
    if (portrait) imageEntries.push({ url: portrait, kind: "character", name: character.name });
  }

  const scenePlaces = batch.sceneIndexes
    .map((index) => project.scenes.find((scene) => scene.index === index)?.location || "")
    .filter(Boolean);
  const chosenPlates: LocationPlate[] = [];
  for (const place of scenePlaces) {
    const plate = (project.locationPlates || []).find(
      (item) => samePlace(item.name, place) && !chosenPlates.includes(item),
    );
    if (plate) chosenPlates.push(plate);
  }
  for (const plate of chosenPlates) {
    const url = await resolveUploadUrl(plate.remoteUrl, plate.publicPath, abortSignal);
    if (!url) continue;
    imageEntries.push({ url, kind: "location", name: plate.name });
  }

  for (const asset of promptReadyReferences(project, batch.sceneIndexes, true)) {
    if (asset.kind === "location") continue;
    const url = await resolveUploadUrl(asset.originalRemoteUrl, asset.originalPublicPath, abortSignal);
    if (!url) continue;
    const kind = asset.kind === "logo" || asset.kind === "product" ? asset.kind : "other";
    imageEntries.push({ url, kind, name: asset.label, notes: asset.notes });
  }

  return { imageEntries, videoEntries: videoEntries.slice(0, MAX_ANCHOR_VIDEOS) };
}

async function collectReferences(project: Project, batch: Batch, abortSignal?: AbortSignal) {
  if (!shouldGenerateOneShot(project.targetDurationSeconds, project.scenes)) {
    return collectLongformReferences(project, batch, abortSignal);
  }
  const imageEntries: PromptRef[] = [];
  const videoEntries: PromptRef[] = [];

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
    if (!character.clips.some((item) => item.batchIndex === batch.index)) {
      character.clips.push({
        id: clip.id,
        fileName: clip.fileName,
        publicPath: clip.publicPath,
        remoteUrl: clip.remoteUrl,
        batchIndex: batch.index,
        characterNames: names,
      });
    }
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

function sameSceneList(left: number[], right: number[]) {
  return left.length === right.length && left.every((value, index) => value === right[index]);
}

export function planSeedanceBatches(project: Project) {
  const usable = project.scenes.filter(sceneHasStory);
  if (usable.length && usable.length !== project.scenes.length) {
    project.scenes = usable.map((scene, index) => ({ ...scene, index: index + 1 }));
  }
  const fallback = project.scenes.reduce((sum, scene) => sum + (scene.estimatedSeconds || 0), 0) || 15;
  const target = clampTotalDuration(project.targetDurationSeconds || fallback);
  project.targetDurationSeconds = target;
  const scaled = scaleEstimatedSeconds(
    project.scenes.map((scene) => scene.estimatedSeconds || 0),
    target,
  );
  project.scenes.forEach((scene, index) => {
    scene.estimatedSeconds = scaled[index] ?? scene.estimatedSeconds;
  });
  const parts = packScenesIntoParts(
    project.scenes.map((scene) => ({ index: scene.index, estimatedSeconds: scene.estimatedSeconds || 0 })),
    target,
  );
  const previous = project.batches;
  project.batches = parts.map((part, index) => {
    const duration = part.duration;
    const sceneIndexes = part.sceneIndexes.length ? part.sceneIndexes : project.scenes.map((scene) => scene.index);
    const scenes = sceneIndexes
      .map((sceneIndex) => project.scenes.find((scene) => scene.index === sceneIndex))
      .filter((scene): scene is Project["scenes"][number] => Boolean(scene));
    const prior = previous.find(
      (batch) =>
        batch.duration === duration &&
        sameSceneList(batch.sceneIndexes, sceneIndexes) &&
        Boolean(batch.videoPublicPath || batch.videoRemoteUrl || realKieVideoTaskId(batch.kieVideoTaskId)),
    );
    const names = [...new Set(scenes.flatMap((scene) => scene.characterNames || []))];
    return {
      id: prior?.id || createId("batch"),
      index: index + 1,
      duration,
      sceneIndexes,
      characterNames: names,
      extraNames: [...new Set(scenes.flatMap((scene) => scene.extraNames || []))],
      introducesNewLead: index === 0,
      newLeadNames: index === 0 ? names : [],
      cameraPlan: scenes
        .map((scene) => scene.camera)
        .filter(Boolean)
        .join(" / "),
      videoPrompt: prior?.videoPrompt || packedScenePrompt(project, sceneIndexes, "", duration),
      framePrompt: prior?.framePrompt || "",
      pacingNotes: `Part ${index + 1} of ${parts.length}, ${duration}s.`,
      status: (prior?.videoPublicPath || prior?.videoRemoteUrl
        ? "done"
        : prior?.kieVideoTaskId
          ? "generating_video"
          : "planned") as Batch["status"],
      frameFileName: prior?.frameFileName,
      framePublicPath: prior?.framePublicPath,
      frameRemoteUrl: prior?.frameRemoteUrl,
      videoFileName: prior?.videoFileName,
      videoPublicPath: prior?.videoPublicPath,
      videoRemoteUrl: prior?.videoRemoteUrl,
      kieVideoTaskId: prior?.kieVideoTaskId,
    };
  });
  return project.batches;
}

async function submitStoryBatch(project: Project, batch: Batch, onStatus: StatusFn, abortSignal?: AbortSignal) {
  if (!storyBatchNeedsSubmit(batch)) return false;
  throwIfAborted(abortSignal);
  onStatus("Generating your video…");
  const prompt = packedScenePrompt(project, batch.sceneIndexes, batch.videoPrompt, batch.duration);
  const { imageEntries, videoEntries } = await collectReferences(project, batch, abortSignal);
  const labeled = labeledReferencePrompt({
    images: imageEntries,
    videos: videoEntries,
    style: project.style,
    project,
    sceneIndexes: batch.sceneIndexes,
    videoPrompt: prompt,
  });
  batch.videoPrompt = labeled;
  batch.status = "generating_video";
  batch.kieVideoTaskId = "pending";
  delete batch.error;
  await saveSoon(project);
  const taskId = await submitSeedance25ReferenceVideo({
    prompt: labeled,
    duration: batch.duration,
    aspectRatio: normalizeAspectRatio(project.aspectRatio),
    referenceImageUrls: imageEntries.map((item) => item.url),
    referenceVideoUrls: videoEntries.map((item) => item.url),
    generateAudio: true,
    resolution: "480p",
    onTaskCreated: async (id) => {
      batch.kieVideoTaskId = id;
      batch.status = "generating_video";
      await saveSoon(project);
    },
  });
  batch.kieVideoTaskId = taskId;
  await saveSoon(project);
  return true;
}

function storyIntrosReady(project: Project) {
  if (shouldGenerateOneShot(project.targetDurationSeconds, project.scenes)) return true;
  return leadCharacters(project)
    .filter((character) => characterHasDialogue(project, character) && hasUsableLook(character))
    .every((character) => hasFreshAnchor(character));
}

async function resumeUnsentStoryJobs(project: Project) {
  if (!produceShouldResumeStory(project) || !storyIntrosReady(project)) return false;
  let changed = false;
  for (const batch of [...project.batches].sort((a, b) => a.index - b.index)) {
    if (!storyBatchNeedsSubmit(batch) || batch.error?.startsWith("resume:")) continue;
    try {
      if (await submitStoryBatch(project, batch, () => undefined)) changed = true;
    } catch (error) {
      if (!realKieVideoTaskId(batch.kieVideoTaskId)) {
        batch.status = "error";
        batch.error = `resume: ${error instanceof Error ? error.message : "Couldn't start this part."}`;
        delete batch.kieVideoTaskId;
      }
      changed = true;
      await saveSoon(project);
    }
  }
  return changed;
}

async function submitMissingStoryJobs(
  project: Project,
  onStatus: StatusFn,
  abortSignal?: AbortSignal,
  options?: { force?: boolean },
) {
  if (projectDeliveredSrc(project) || !project.scenes.length) return false;
  if (!options?.force) return false;
  throwIfAborted(abortSignal);
  planSeedanceBatches(project);
  let submitted = false;
  for (const batch of [...project.batches].sort((a, b) => a.index - b.index)) {
    if (!storyBatchNeedsSubmit(batch)) continue;
    try {
      if (await submitStoryBatch(project, batch, onStatus, abortSignal)) submitted = true;
    } catch (error) {
      if (isAbortError(error)) throw error;
      if (!realKieVideoTaskId(batch.kieVideoTaskId)) {
        batch.status = "error";
        batch.error = error instanceof Error ? error.message : "Couldn't start this part.";
        delete batch.kieVideoTaskId;
      }
      await saveSoon(project);
    }
  }
  return submitted;
}

export async function generatePlannedVideos(project: Project, onStatus: StatusFn, abortSignal?: AbortSignal) {
  throwIfAborted(abortSignal);
  project.keepGenerating = true;
  project.produceStartedAt = nowIso();
  planSeedanceBatches(project);
  for (const batch of project.batches) {
    if (!batch.videoPublicPath && !batch.videoRemoteUrl && !realKieVideoTaskId(batch.kieVideoTaskId)) {
      batch.status = "generating_video";
    }
  }
  await saveSoon(project);
  const longform = !shouldGenerateOneShot(project.targetDurationSeconds, project.scenes);
  if (longform) {
    void ensureLocationPlates(project, onStatus, abortSignal).catch(() => undefined);
    await ensureCharacterAnchors(project, onStatus, abortSignal);
    const missing = leadCharacters(project).filter(
      (character) => characterHasDialogue(project, character) && hasUsableLook(character) && !hasFreshAnchor(character),
    );
    if (missing.length) {
      throw new Error(
        `Couldn't finish the intro for ${missing.map((character) => character.name).join(", ")}. The story was not sent.`,
      );
    }
  }
  await submitMissingStoryJobs(project, onStatus, abortSignal, { force: true });

  const settled = await Promise.allSettled(
    project.batches.map(async (batch) => {
      if (batch.videoPublicPath || batch.videoRemoteUrl) return;
      const taskId = realKieVideoTaskId(batch.kieVideoTaskId);
      if (!taskId) return;
      onStatus("Generating your video…");
      const remoteUrl = await waitForTask(taskId, undefined, "video");
      await attachGeneratedVideo(project, batch, remoteUrl);
      await saveSoon(project);
    }),
  );
  await saveSoon(project);
  const failed = settled.find((result) => result.status === "rejected");
  if (!failed) await joinReadyParts(project, onStatus);
  if (failed && failed.status === "rejected") throw failed.reason;
}

function readyParts(project: Project) {
  return [...project.batches]
    .filter((batch) => batch.videoPublicPath || batch.videoRemoteUrl)
    .sort((a, b) => a.index - b.index);
}

async function joinReadyParts(project: Project, onStatus: StatusFn) {
  const parts = readyParts(project);
  if (parts.length < 2 || parts.length !== project.batches.length) return;
  const key = parts.map((batch) => `${batch.index}:${batch.videoRemoteUrl || batch.videoPublicPath}`).join("|");
  const existing = project.joinedVideoPublicPath || project.joinedVideoRemoteUrl;
  if (project.joinedSource === key && existing) return;
  onStatus("Generating your video…");
  const buffers = [];
  for (const batch of parts) {
    buffers.push(await readPublicFile(batch.videoRemoteUrl || batch.videoPublicPath || ""));
  }
  const joined = await concatVideoBuffers(buffers);
  const saved = await storeGeneratedFile({
    project,
    buffer: joined,
    relativeParts: [project.id, "final", `full-${Date.now()}.mp4`],
    contentType: "video/mp4",
  });
  project.joinedVideoFileName = saved.fileName;
  project.joinedVideoPublicPath = saved.publicPath;
  project.joinedVideoRemoteUrl = saved.publicPath;
  project.joinedSource = key;
  project.lastVideoFileName = saved.fileName;
  project.lastVideoPublicPath = saved.publicPath;
  project.lastVideoRemoteUrl = saved.publicPath;
  const partIds = new Set(parts.map((batch) => batch.id));
  const partSrcs = new Set(parts.flatMap((batch) => [batch.videoPublicPath, batch.videoRemoteUrl].filter(Boolean)));
  project.archivedVideos = (project.archivedVideos || []).filter(
    (item) => !partIds.has(item.id) && !partSrcs.has(item.publicPath),
  );
  project.archivedVideos.push({
    id: `full_${project.id}_${Date.now()}`,
    title: project.title,
    publicPath: saved.publicPath,
    posterPath: parts[0]?.framePublicPath,
    duration: parts.reduce((sum, batch) => sum + (batch.duration || 0), 0),
    index: 1,
    createdAt: nowIso(),
  });
  await saveSoon(project);
}

export async function generateBatchVideo(
  project: Project,
  batchIndex: number,
  onStatus: StatusFn,
  durationOverride?: unknown,
  abortSignal?: AbortSignal,
) {
  const key = `${project.id}:${batchIndex}`;
  const inflight = videoLocks.get(key);
  if (inflight) return inflight;
  const job: Promise<{ batch: Batch; prompt: string }> = runGenerateBatchVideo(
    project,
    batchIndex,
    onStatus,
    durationOverride,
    abortSignal,
  ).finally(() => {
    if (videoLocks.get(key) === job) videoLocks.delete(key);
  });
  videoLocks.set(key, job);
  return job;
}

async function runGenerateBatchVideo(
  project: Project,
  batchIndex: number,
  onStatus: StatusFn,
  durationOverride?: unknown,
  abortSignal?: AbortSignal,
): Promise<{ batch: Batch; prompt: string }> {
  throwIfAborted(abortSignal);
  const foundBatch = project.batches.find((item) => item.index === batchIndex);
  if (!foundBatch) throw new Error(`Batch ${batchIndex} does not exist.`);
  const batch: Batch = foundBatch;
  if (shouldGenerateOneShot(project.targetDurationSeconds, project.scenes)) {
    batch.duration = clampClipDuration(project.targetDurationSeconds, batch.duration || 8);
  } else if (durationOverride !== undefined) {
    batch.duration = clampClipDuration(durationOverride, batch.duration || 8);
  } else {
    batch.duration = clampClipDuration(batch.duration, 8);
  }

  const prompt = packedScenePrompt(project, batch.sceneIndexes, batch.videoPrompt, batch.duration);

  async function finishExisting(source: Batch) {
    copyVideoFields(batch, source);
    await saveProject(project);
    return { batch, prompt };
  }

  if (batch.videoPublicPath || batch.videoRemoteUrl) {
    if (batch.videoRemoteUrl && !batch.videoPublicPath) {
      await attachGeneratedVideo(project, batch, batch.videoRemoteUrl);
    } else {
      batch.status = "done";
      ensureArchivedVideo(project, batch);
    }
    await saveProject(project);
    return { batch, prompt };
  }

  const fresh = await getProject(project.id);
  const freshBatch = fresh?.batches.find((item) => item.index === batchIndex);
  if (freshBatch && (freshBatch.videoPublicPath || freshBatch.videoRemoteUrl)) {
    return finishExisting(freshBatch);
  }
  if (freshBatch?.kieVideoTaskId) batch.kieVideoTaskId = freshBatch.kieVideoTaskId;

  if (batch.kieVideoTaskId === "pending") {
    for (let attempt = 0; attempt < 40; attempt += 1) {
      await abortableDelay(1500);
      const again = await getProject(project.id);
      const other = again?.batches.find((item) => item.index === batchIndex);
      if (other && (other.videoPublicPath || other.videoRemoteUrl)) return finishExisting(other);
      if (other?.kieVideoTaskId && other.kieVideoTaskId !== "pending") {
        batch.kieVideoTaskId = other.kieVideoTaskId;
        break;
      }
    }
  }

  batch.status = "generating_video";
  project.workflowStep = "produce";
  if (!batch.kieVideoTaskId) {
    batch.kieVideoTaskId = "pending";
  }
  await saveProject(project);

  try {
    const { imageEntries, videoEntries } = await collectReferences(project, batch);
    const labeled = labeledReferencePrompt({
      images: imageEntries,
      videos: videoEntries,
      style: project.style,
      project,
      sceneIndexes: batch.sceneIndexes,
      videoPrompt: prompt,
    });

    onStatus("Generating your video…");
    const remoteUrl = await generateSeedance25ReferenceVideo({
      prompt: labeled,
      duration: batch.duration,
      aspectRatio: normalizeAspectRatio(project.aspectRatio),
      referenceImageUrls: imageEntries.map((item) => item.url),
      referenceVideoUrls: videoEntries.map((item) => item.url),
      generateAudio: true,
      resolution: "480p",
      existingTaskId: batch.kieVideoTaskId !== "pending" ? batch.kieVideoTaskId : undefined,
      onTaskCreated: async (taskId) => {
        batch.kieVideoTaskId = taskId;
        batch.status = "generating_video";
        project.workflowStep = "produce";
        await saveProject(project);
      },
    });
    await attachGeneratedVideo(project, batch, remoteUrl);
    await saveProject(project);
    return { batch, prompt: labeled };
  } catch (error) {
    if (isAbortError(error)) {
      await restoreBatchAfterAbort(project, batch);
      throw error;
    }
    if (error instanceof Error && /generation failed/i.test(error.message)) {
      delete batch.kieVideoTaskId;
      batch.status = "error";
      await saveProject(project);
    }
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

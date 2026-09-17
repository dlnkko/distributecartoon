import { downloadToPublic, extensionFromUrl } from "./assets";
import { generateGptImage25Flare, generateSeedance25ReferenceVideo, peekKieTask, uploadKieFile, waitForTask } from "./kie";
import { clampClipDuration, createId, slugify, normalizeAspectRatio } from "./ids";
import { ensureArchivedVideo, getProject, saveProject } from "./store";
import { batchAwaitingVideo, realKieVideoTaskId } from "./video-jobs";
import { characterLookFromPhotoPrompt, characterLookPrompt, characterLookRevisionPrompt, labeledReferencePrompt, openingFrameCharacters, packedScenePrompt, sceneFramePrompt, type PromptRef } from "./style";
import { assignCharacterSourcePhotos, isUnseenVoice, promptReadyReferences, refineStoryLeads } from "./refs";
import { abortableDelay, isAbortError, throwIfAborted } from "./abort";
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
  return downloadToPublic(remoteUrl, withExt, project);
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
  if (!batch.videoPublicPath) {
    try {
      const people = uniqueNames(batch.characterNames).map((name) => slugify(name)).join("_") || "scene";
      const fileStem = `batch-${String(batch.index).padStart(2, "0")}-${people}`;
      const saved = await persistVideo(project, remoteUrl, [project.id, "batches", fileStem]);
      batch.videoFileName = saved.fileName;
      batch.videoPublicPath = saved.publicPath;
      project.lastVideoFileName = saved.fileName;
      project.lastVideoPublicPath = saved.publicPath;
    } catch {
      // Kie already has the file; the player can use the remote URL until we persist later.
    }
    batch.videoRemoteUrl = remoteUrl;
    project.lastVideoRemoteUrl = remoteUrl;
  } else if (!batch.videoRemoteUrl) {
    batch.videoRemoteUrl = remoteUrl;
  }
  delete batch.kieVideoTaskId;
  batch.status = "done";
  project.workflowStep = "produce";
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
        await attachGeneratedVideo(project, batch, peek.url);
        changed = true;
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
  character.portraitPublicPath = look.publicPath;
  character.portraitRemoteUrl = look.remoteUrl;
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
  const saved = await persistImage(project, remoteUrl, [
    project.id,
    "characters",
    `${character.slug}-look-${Date.now()}-${createId("look")}`,
  ]);
  return {
    fileName: saved.fileName,
    publicPath: saved.publicPath,
    remoteUrl,
    fromPhoto,
    source: photo,
    revisionNotes,
  };
}

function characterNeedsLook(character: Character, source?: ReferenceAsset) {
  const hasLook = Boolean(character.portraitRemoteUrl || character.portraitPublicPath);
  const sameSource = source ? character.sourceRefId === source.id : !character.sourceRefId;
  return !(hasLook && sameSource);
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
    characters.map((character) => createCharacterLook(project, character, abortSignal, undefined, sources.get(character.id))),
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
    if (result.status === "fulfilled") {
      applyLookToCharacter(pending[index], result.value);
      continue;
    }
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
      if (result.status === "fulfilled") {
        applyLookToCharacter(retry[index], result.value);
        continue;
      }
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

async function collectReferences(project: Project, batch: Batch, abortSignal?: AbortSignal) {
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

  const prompt = packedScenePrompt(project, batch.sceneIndexes, batch.videoPrompt);

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

    const voiceNote = videoEntries[0]?.name ? ` Voice ref: ${videoEntries[0].name}.` : "";
    onStatus(`Animating the video (${batch.duration}s)…${voiceNote}`);
    const remoteUrl = await generateSeedance25ReferenceVideo({
      prompt: labeled,
      duration: batch.duration,
      aspectRatio: normalizeAspectRatio(project.aspectRatio),
      referenceImageUrls: imageEntries.map((item) => item.url),
      referenceVideoUrls: videoEntries.slice(0, 1).map((item) => item.url),
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

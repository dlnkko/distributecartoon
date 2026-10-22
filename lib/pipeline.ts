import { createHash } from "node:crypto";
import { downloadToPublic, extensionFromUrl, readPublicFile, storeGeneratedFile } from "./assets";
import { clipVideoBuffer, concatVideoBuffers, replaceVideoAudio, tailVideoBuffer } from "./concat";
import { charactersPresent, continuityFlags, projectSeed } from "./continuity";
import { assignScenePlaces, isJunkPlace, placeLabel, richerPlaceName, samePlace } from "./places";
import { refineSeedancePrompt } from "./astra-prompt";
import { generateGptImage25Flare, generateSeedance25ReferenceVideo, peekKieTask, submitSeedance25ReferenceVideo, uploadKieFile, waitForTask } from "./kie";
import { clampClipDuration, clampTotalDuration, createId, nowIso, slugify, normalizeAspectRatio } from "./ids";
import { ensureArchivedVideo, getProject, saveProject } from "./store";
import { batchAwaitingVideo, durableVideoSrc, projectDeliveredSrc, realKieVideoTaskId, storeFailureShouldRegenerate, storyBatchNeedsSubmit } from "./video-jobs";
import { describeProductImage, readAttachedProduct } from "./product-use-video";
import { watchRenderedPart } from "./continuity-watch";
import { clothesShouldChange, parseSeenCard, partKeepsCarriedProduct, previousSeenCard, referenceRanges, seenCardMatters } from "./seen-continuity";
import { REALISTIC_REFERENCE_FALLBACK_SECONDS, realisticProseCast, storyClipCast } from "./realistic-prose";
import { ownerProductContext, productUnderstandingBrief } from "./product-facts";
import { scrapeProductPage } from "./product-page";
import { ensureProductScenes, ensureScenePlaces } from "./story-brief";
import { applyScriptLooks } from "./cast-roster";
import { assignCharacterSourcePhotos, dropUnscriptedDialogue, isUnseenVoice, partNeedsPackshot, promptReadyReferences, refineStoryLeads, sceneRequiresAsset } from "./refs";
import { abortableDelay, isAbortError, throwIfAborted } from "./abort";
import { uploadFalBuffer } from "./fal";
import { characterAnchorPrompt, characterLookFromPhotoPrompt, characterLookPrompt, characterLookRevisionPrompt, labeledReferencePrompt, locationPlatePrompt, narrationLines, narratorVoicePrompt, openingFrameCharacters, packedScenePrompt, sceneFramePrompt, type PromptRef } from "./style";
import { balancePartSceneSeconds, clockBeatSeconds, fillPartSceneSeconds, fitPartsToBudget, groupConsecutiveTakes, packScenesIntoParts, sceneHasStory, sceneSpeechFloor, shouldGenerateOneShot, splitScenesAcrossTakes, userTimedSeconds } from "./timing";
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

function isOpenRouterContent(value?: string) {
  return Boolean(value && /openrouter\.ai\/api\/v1\/videos\//i.test(value));
}

// OpenRouter content URLs need our API key, so Seedance cannot read them as references.
async function publicVideoUrl(url: string) {
  if (!isOpenRouterContent(url)) return url;
  const buffer = await readPublicFile(url);
  return uploadFalBuffer(buffer, "clip.mp4", "video/mp4");
}

async function resolveUploadUrl(remoteUrl?: string, publicPath?: string, abortSignal?: AbortSignal) {
  if (isHttpUrl(remoteUrl) && !isOpenRouterContent(remoteUrl)) return remoteUrl;
  if (isHttpUrl(publicPath) && !isOpenRouterContent(publicPath)) return publicPath;
  if (isOpenRouterContent(remoteUrl)) return publicVideoUrl(remoteUrl!);
  if (isOpenRouterContent(publicPath)) return publicVideoUrl(publicPath!);
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

async function pushExtraProductPhotos(entries: PromptRef[], asset: ReferenceAsset, abortSignal?: AbortSignal) {
  if (asset.kind !== "product") return;
  for (const path of asset.extraImagePaths || []) {
    const remote = isHttpUrl(path) ? path : undefined;
    const url = await resolveUploadUrl(remote, remote ? undefined : path, abortSignal);
    if (!url || entries.some((entry) => entry.url === url)) continue;
    entries.push({ url, kind: "product", name: asset.label, notes: asset.notes });
  }
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

function songFileAttached(batch: Batch) {
  const name = `${batch.videoFileName || ""} ${batch.videoPublicPath || ""}`;
  return name.includes("-song.mp4");
}

async function attachGeneratedVideo(project: Project, batch: Batch, remoteUrl: string) {
  if (remoteUrl) {
    batch.videoRemoteUrl = remoteUrl;
    project.lastVideoRemoteUrl = remoteUrl;
  }
  if (!project.song) batch.status = "done";
  project.workflowStep = "produce";
  const stored = Boolean(durableVideoSrc(batch));
  if ((!stored && (batch.videoRemoteUrl || batch.videoPublicPath)) || (project.song && stored && !songFileAttached(batch))) {
    try {
      const source = batch.videoRemoteUrl || batch.videoPublicPath || remoteUrl;
      const people = uniqueNames(batch.characterNames).map((name) => slugify(name)).join("_") || "scene";
      const fileStem = `batch-${String(batch.index).padStart(2, "0")}-${people}`;
      const saved = await persistVideo(project, source, [project.id, "batches", fileStem]);
      batch.videoFileName = saved.fileName;
      batch.videoPublicPath = saved.publicPath;
      if (isHttpUrl(saved.publicPath) && !isOpenRouterContent(saved.publicPath)) {
        batch.videoRemoteUrl = saved.publicPath;
        project.lastVideoRemoteUrl = saved.publicPath;
      }
      project.lastVideoFileName = saved.fileName;
      project.lastVideoPublicPath = saved.publicPath;
      await muxSongOntoPart(project, batch);
      if (project.song && !songFileAttached(batch)) throw new Error("The song could not be attached to this part.");
      batch.status = "done";
      delete batch.kieVideoTaskId;
      delete batch.error;
    } catch (error) {
      const message = error instanceof Error ? error.message : "Couldn't store this part.";
      console.warn("part store failed", project.id, batch.index, message);
      if (project.song && !songFileAttached(batch)) {
        const failedPath = batch.videoPublicPath;
        delete batch.videoFileName;
        delete batch.videoPublicPath;
        delete batch.videoRemoteUrl;
        if (failedPath && (project.lastVideoPublicPath === failedPath || project.lastVideoRemoteUrl === failedPath)) {
          delete project.lastVideoFileName;
          delete project.lastVideoPublicPath;
          delete project.lastVideoRemoteUrl;
        }
        schedulePartRetry(project, batch, message);
        delete batch.kieVideoTaskId;
      } else {
        const providerFile = isOpenRouterContent(batch.videoRemoteUrl) || isOpenRouterContent(batch.videoPublicPath);
        if (providerFile && storeFailureShouldRegenerate(batch.attempts || 0, message)) {
          delete batch.videoRemoteUrl;
          if (isOpenRouterContent(batch.videoPublicPath)) delete batch.videoPublicPath;
          schedulePartRetry(project, batch, message);
          delete batch.kieVideoTaskId;
        } else {
          notePartFailure(project, batch, message);
          batch.error = message;
          batch.attempts = (batch.attempts || 0) + 1;
        }
      }
    }
  } else if (stored) {
    batch.status = "done";
    delete batch.kieVideoTaskId;
  }
  if (durableVideoSrc(batch)) {
    assignClipToCharacters(project, batch, {
      id: `clip_${batch.index}`,
      fileName: batch.videoFileName || `batch-${batch.index}.mp4`,
      publicPath: durableVideoSrc(batch),
      remoteUrl: batch.videoRemoteUrl || remoteUrl,
    });
    ensureArchivedVideo(project, batch);
  }
}

export async function recoverPendingVideos(project: Project, options?: { wait?: boolean }) {
  // A live generation is owned by the produce worker. Saving it here would overwrite its job ids.
  if (project.keepGenerating) return project;
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
      if (batch.status === "done") {
        const before = project.archivedVideos?.length || 0;
        ensureArchivedVideo(project, batch);
        if ((project.archivedVideos?.length || 0) !== before) changed = true;
        continue;
      }
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
  const parts = project.batches.filter((batch) => batch.videoPublicPath || batch.videoRemoteUrl);
  if (parts.length > 1 && parts.length === project.batches.length) {
    try {
      if (await joinReadyParts(project, () => undefined)) changed = true;
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
const projectSavers = new Map<string, (project: Project) => Promise<unknown>>();

// The produce worker saves through its lease instead of the signed-in user's session.
export function setProjectSaver(projectId: string, saver?: (project: Project) => Promise<unknown>) {
  if (saver) projectSavers.set(projectId, saver);
  else projectSavers.delete(projectId);
}

export function saveSoon(project: Project) {
  const write = () => (projectSavers.get(project.id) || saveProject)(project);
  const previous = projectSaves.get(project.id) || Promise.resolve();
  const next = previous.then(write, write);
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
  if (!project.placeReadKey) assignScenePlaces(project.scenes);
  const photos = project.references.filter(
    (asset) => asset.kind === "location" && (asset.originalRemoteUrl || asset.originalPublicPath),
  );
  const places: Array<{ name: string; photo?: ReferenceAsset }> = [];
  function add(name: string, photo?: ReferenceAsset) {
    const clean = placeLabel(name);
    if (!clean || isJunkPlace(clean) || /^(unknown|none|n\/a|tbd)$/i.test(clean)) return;
    const hit = places.find((place) => samePlace(place.name, clean));
    if (hit) {
      if (photo && !hit.photo) hit.photo = photo;
      hit.name = richerPlaceName(hit.name, clean);
      return;
    }
    places.push({ name: clean, photo });
  }
  for (const scene of project.scenes) add(scene.location || "");
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
    saved = { fileName: `${character.slug}-intro.mp4`, publicPath: await publicVideoUrl(remoteUrl) };
  }
  const publicUrl = saved.publicPath || remoteUrl;
  character.anchorVideoPublicPath = publicUrl;
  character.anchorVideoRemoteUrl = isOpenRouterContent(remoteUrl) && isHttpUrl(publicUrl) ? publicUrl : remoteUrl;
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

const MAX_JOB_ATTEMPTS = 3;
const PRODUCE_LIMIT_MS = 3 * 60 * 60 * 1000;

type StepResult = { ready: boolean; failed?: string };

function speakingLeads(project: Project) {
  return leadCharacters(project).filter((character) => characterHasDialogue(project, character) && hasUsableLook(character));
}

// One non-blocking pass: start missing intros and collect finished ones.
async function stepCharacterIntros(project: Project): Promise<StepResult> {
  if (project.song) return { ready: true };
  for (const character of speakingLeads(project)) {
    if (hasFreshAnchor(character)) continue;
    const source = anchorSourceUrl(character);
    if (character.anchorSourceUrl && character.anchorSourceUrl !== source) {
      delete character.anchorVideoTaskId;
      character.anchorAttempts = 0;
    }
    const taskId = realKieVideoTaskId(character.anchorVideoTaskId);
    if (taskId) {
      const peek = await peekKieTask(taskId);
      if (peek.status === "pending") continue;
      if (peek.status === "success") {
        await rememberAnchor(project, character, peek.url);
        continue;
      }
      delete character.anchorVideoTaskId;
      await saveSoon(project);
    }
    if ((character.anchorAttempts || 0) >= MAX_JOB_ATTEMPTS) {
      const retryAt = Date.parse(character.anchorRetryAt || "");
      if (!Number.isFinite(retryAt)) {
        character.anchorRetryAt = new Date(Date.now() + 2 * 60 * 1000).toISOString();
        await saveSoon(project);
        continue;
      }
      if (Date.now() < retryAt) continue;
      character.anchorAttempts = 0;
      delete character.anchorRetryAt;
    }
    const portrait = await resolveUploadUrl(character.portraitRemoteUrl, character.portraitPublicPath);
    if (!portrait) return { ready: false, failed: `${character.name} has no look yet.` };
    character.anchorAttempts = (character.anchorAttempts || 0) + 1;
    try {
      await submitSeedance25ReferenceVideo({
        prompt: characterAnchorPrompt(character.name, project.style),
        duration: ANCHOR_SECONDS,
        aspectRatio: normalizeAspectRatio(project.aspectRatio),
        referenceImageUrls: [portrait],
        generateAudio: true,
        resolution: "480p",
        model: "bytedance/seedance-2.0-fast",
        provider: "kie",
        seed: projectSeed(project),
        onTaskCreated: async (id) => {
          character.anchorVideoTaskId = id;
          character.anchorSourceUrl = source;
          await saveSoon(project);
        },
      });
    } catch {
      await saveSoon(project);
    }
  }
  return { ready: speakingLeads(project).every((character) => hasFreshAnchor(character)) };
}

// Changing the voice notes or the first narrated line re-records the narrator reference.
function narratorVoiceSource(project: Project) {
  if (!narrationLines(project).length) return "";
  return narratorVoicePrompt(project);
}

function freshNarratorVoice(project: Project) {
  const source = narratorVoiceSource(project);
  const voice = project.narratorVoice;
  return source && voice?.remoteUrl && voice.source === source ? voice : undefined;
}

// A missing narrator reference never blocks the video: after the last attempt the story goes on without it.
async function stepNarratorVoice(project: Project): Promise<StepResult> {
  if (project.song) return { ready: true };
  const source = narratorVoiceSource(project);
  if (!source || freshNarratorVoice(project)) return { ready: true };
  if (project.narratorVoice?.source !== source) project.narratorVoice = { source, attempts: 0 };
  const voice = project.narratorVoice!;
  const taskId = realKieVideoTaskId(voice.taskId);
  if (taskId) {
    const peek = await peekKieTask(taskId);
    if (peek.status === "pending") return { ready: false };
    if (peek.status === "success") {
      let saved: { publicPath?: string };
      try {
        saved = await persistVideo(project, peek.url, [project.id, "anchors", "narrator-voice"]);
      } catch {
        saved = { publicPath: await publicVideoUrl(peek.url).catch(() => "") };
      }
      const url = saved.publicPath || peek.url;
      voice.publicPath = url;
      voice.remoteUrl = isOpenRouterContent(peek.url) && isHttpUrl(url) ? url : peek.url;
      delete voice.taskId;
      await saveSoon(project);
      return { ready: true };
    }
    delete voice.taskId;
  }
  if ((voice.attempts || 0) >= MAX_JOB_ATTEMPTS) return { ready: true };
  voice.attempts = (voice.attempts || 0) + 1;
  try {
    await submitSeedance25ReferenceVideo({
      prompt: source,
      duration: ANCHOR_SECONDS,
      aspectRatio: normalizeAspectRatio(project.aspectRatio),
      generateAudio: true,
      resolution: "480p",
      model: "bytedance/seedance-2.0-fast",
      seed: projectSeed(project),
      onTaskCreated: async (id) => {
        voice.taskId = id;
        await saveSoon(project);
      },
    });
  } catch (error) {
    console.warn("narrator voice submit failed", project.id, error instanceof Error ? error.message : error);
    await saveSoon(project);
  }
  return { ready: false };
}

async function narratorVoiceRef(project: Project, sceneIndexes: number[], abortSignal?: AbortSignal): Promise<PromptRef | undefined> {
  const voice = freshNarratorVoice(project);
  if (!voice || !narrationLines(project, sceneIndexes).length) return undefined;
  const url = await resolveUploadUrl(voice.remoteUrl, voice.publicPath, abortSignal);
  return url ? { url, kind: "narrator", name: "Narrator" } : undefined;
}

const PART_RETRY_MS = 2 * 60 * 1000;
const PENDING_STALE_MS = 3 * 60 * 1000;

function blockedByRealFace(message: string) {
  return /real person|PrivacyInformation/i.test(message);
}

function notePartFailure(project: Project, batch: Batch, message: string) {
  const taskId = realKieVideoTaskId(batch.kieVideoTaskId);
  batch.failures = [...(batch.failures || []), { at: nowIso(), message, ...(taskId ? { taskId } : {}) }].slice(-8);
  console.warn("part failure", project.id, batch.index, message, taskId || "");
}

function schedulePartRetry(project: Project, batch: Batch, message: string) {
  notePartFailure(project, batch, message);
  batch.attempts = (batch.attempts || 0) + 1;
  batch.error = message;
  batch.status = "generating_video";
  batch.nextRetryAt = new Date(Date.now() + PART_RETRY_MS).toISOString();
}

// One heavy step per pass: store a finished part, or submit the next missing one.
// A provider failure retries that part. It does not cancel the parts already saved.
function previousStoryBatch(project: Project, batch: Batch) {
  return project.batches.find((item) => item.index === batch.index - 1);
}

function tailUrl(batch?: Batch) {
  if (!batch) return "";
  return batch.tailRemoteUrl || batch.tailPublicPath || "";
}

function voiceWatchKey(src: string) {
  return createHash("sha256").update(`${src}\ncarry-on`).digest("hex").slice(0, 20);
}

async function savePartTail(project: Project, batch: Batch) {
  const src = durableVideoSrc(batch);
  const cutKey = storyClipCast(project) ? "voices" : "tail";
  if (!src || (tailUrl(batch) && batch.tailCutKey === cutKey)) return;
  const buffer = await readPublicFile(src);
  const tail = storyClipCast(project) ? await proseReferenceClip(buffer, batch.seenContinuity || "") : await tailVideoBuffer(buffer, 5);
  const saved = await storeGeneratedFile({
    project,
    buffer: tail,
    relativeParts: [project.id, "tails", `part-${String(batch.index).padStart(2, "0")}-tail.mp4`],
    contentType: "video/mp4",
  });
  batch.tailPublicPath = saved.publicPath;
  batch.tailRemoteUrl = saved.publicPath;
  batch.tailCutKey = cutKey;
}

async function proseReferenceClip(buffer: Buffer, card: string) {
  const ranges = referenceRanges(card);
  if (!ranges.length) return tailVideoBuffer(buffer, REALISTIC_REFERENCE_FALLBACK_SECONDS);
  try {
    return await clipVideoBuffer(buffer, ranges);
  } catch (error) {
    console.warn("reference clip failed", error instanceof Error ? error.message : error);
    return tailVideoBuffer(buffer, REALISTIC_REFERENCE_FALLBACK_SECONDS);
  }
}

function directingNotes(project: Project) {
  return [project.storyBrief || "", productUnderstandingBrief(project)].filter(Boolean).join("\n\n");
}

function partOutline(project: Project, batch?: Batch) {
  if (!batch) return "No further part.";
  return batch.sceneIndexes
    .map((index) => {
      const scene = project.scenes.find((item) => item.index === index);
      if (!scene) return "";
      const lines = (scene.dialogue || [])
        .map((line) => `${line.speaker}: ${line.line}`)
        .filter((line) => line.trim().length > 2)
        .join(" | ");
      return [`Scene ${scene.index} (${scene.estimatedSeconds || "?"}s)`, scene.location, scene.summary || scene.title, lines].filter(Boolean).join(" — ");
    })
    .filter(Boolean)
    .join("\n");
}

async function ensureRenderedContinuity(project: Project, previous?: Batch, next?: Batch) {
  if (!previous || !next) return;
  const src = durableVideoSrc(previous);
  if (!src) return;
  const key = voiceWatchKey(src);
  if (previous.seenContinuityKey && previous.seenContinuityKey !== key) previous.seenAttempts = 0;
  if (previous.seenContinuity?.trim() && previous.seenContinuityKey === key) return;
  if ((previous.seenAttempts || 0) >= 2) return;
  try {
    const context = [
      `USER SCRIPT:\n${(project.scriptText || "").trim().slice(0, 5000) || "No script text."}`,
      project.storyBrief?.trim() ? `STORY READING:\n${project.storyBrief.trim().slice(0, 1500)}` : "",
      `PRODUCT:\n${productUnderstandingBrief(project) || "No product was attached."}`,
      `THIS PART, as written:\n${partOutline(project, previous)}`,
      `NEXT PART, as written:\n${partOutline(project, next)}`,
      storyClipCast(project) ? `VIDEO LENGTH: ${previous.duration || 30} seconds.` : "",
      storyClipCast(project)
        ? `PEOPLE IN THIS FILM: ${project.characters
            .filter((character) => !character.isExtra && character.name.trim())
            .map((character) => character.name.trim())
            .join(", ")}. LOOKS and CLIPS come from the video, not from a written description. Every one of these people who appears needs a look, and a moment in CLIPS where they are visible and speaking.`
        : "",
    ]
      .filter(Boolean)
      .join("\n\n");
    previous.seenContinuity = await watchRenderedPart(await readPublicFile(src), context, {
      describeLooks: storyClipCast(project),
    });
    previous.seenContinuityKey = key;
    previous.seenAttempts = 0;
    console.info("continuity watch", project.id, previous.index);
    await saveProject(project);
  } catch (error) {
    previous.seenAttempts = (previous.seenAttempts || 0) + 1;
    console.warn("continuity watch", project.id, previous.index, error instanceof Error ? error.message : error);
    await saveProject(project);
  }
}

function productImageMime(src: string) {
  const lower = src.split("?")[0].toLowerCase();
  if (lower.endsWith(".png")) return "image/png";
  if (lower.endsWith(".webp")) return "image/webp";
  if (lower.endsWith(".gif")) return "image/gif";
  return "image/jpeg";
}

async function ensureProductImageNotes(project: Project) {
  await ensureProductUnderstanding(project);
}

export async function ensureProductUnderstanding(project: Project) {
  let wrote = false;
  for (const asset of project.references || []) {
    if (asset.kind !== "product") continue;
    const src = asset.originalRemoteUrl || asset.originalPublicPath;
    if (!src) continue;
    if (asset.pageUrl && !asset.pageContext?.trim()) {
      try {
        asset.pageContext = await scrapeProductPage(asset.pageUrl);
        wrote = true;
      } catch (error) {
        console.warn("product page", project.id, error instanceof Error ? error.message : error);
      }
    }
    const owner = ownerProductContext(asset);
    const key = createHash("sha256").update(`${src}\n${asset.pageContext || ""}\n${owner}\nwhen-it-is-used`).digest("hex").slice(0, 20);
    if (asset.productRead?.trim() && asset.productReadKey === key) continue;
    try {
      const read = await readAttachedProduct(
        await readPublicFile(src),
        productImageMime(src),
        asset.pageContext || "",
        asset.pageUrl || "",
        owner,
      );
      if (!read) continue;
      asset.productRead = read;
      asset.productReadKey = key;
      const photo = read.match(/^IN THE PHOTO:\s*(.+)$/im)?.[1]?.replace(/\s+/g, " ").trim();
      if (photo) asset.imageNote = photo;
      else if (!asset.imageNote?.trim()) asset.imageNote = read.slice(0, 700);
      wrote = true;
    } catch (error) {
      const message = error instanceof Error ? error.message : "";
      console.warn("product photo", project.id, message);
      if (/quota|rate.limit/i.test(message) || asset.imageNote?.trim()) continue;
      try {
        const note = await describeProductImage(await readPublicFile(src), productImageMime(src));
        if (!note) continue;
        asset.imageNote = note;
        wrote = true;
      } catch (fallback) {
        console.warn("product photo", project.id, fallback instanceof Error ? fallback.message : fallback);
      }
    }
  }
  if (wrote) await saveProject(project);
}

async function prepareStoryPrompt(project: Project, batch: Batch) {
  const before = `${project.characters.map((character) => character.description).join("\n")}\n${project.scenes.map((scene) => `${scene.summary}|${(scene.dialogue || []).map((line) => line.line).join("~")}`).join("\n")}`;
  dropUnscriptedDialogue(project);
  applyScriptLooks(project);
  if (`${project.characters.map((character) => character.description).join("\n")}\n${project.scenes.map((scene) => `${scene.summary}|${(scene.dialogue || []).map((line) => line.line).join("~")}`).join("\n")}` !== before) {
    await saveProject(project);
  }
  await ensureProductImageNotes(project);
  await ensureProductScenes(project);
  const previous = previousStoryBatch(project, batch);
  await ensureRenderedContinuity(project, previous, batch);
  const prompt = packedScenePrompt(project, batch.sceneIndexes, "", batch.duration);
  const { imageEntries, videoEntries } = await collectReferences(project, batch);
  const labeled = labeledReferencePrompt({
    images: imageEntries,
    videos: videoEntries,
    style: project.style,
    project,
    sceneIndexes: batch.sceneIndexes,
    videoPrompt: prompt,
    duration: batch.duration,
  });
  batch.videoPrompt = await refineSeedancePrompt(labeled, previous?.videoPrompt || "", directingNotes(project), previous?.seenContinuity || "");
  batch.promptReady = true;
}

async function stepStoryParts(project: Project): Promise<StepResult> {
  const batches = [...project.batches].sort((a, b) => a.index - b.index);
  let heavy = false;
  for (const batch of batches) {
    if (durableVideoSrc(batch)) continue;
    const previous = previousStoryBatch(project, batch);
    if (previous && !durableVideoSrc(previous)) return { ready: false };
    if (previous && durableVideoSrc(previous)) {
      await ensureRenderedContinuity(project, previous, batch);
      if (!previous.seenContinuity?.trim() && (previous.seenAttempts || 0) < 2) return { ready: false };
      if (seenCardMatters(parseSeenCard(previous.seenContinuity || "")) && !/(?:^|\n)Continuity:\s+\S/.test(batch.videoPrompt || "")) {
        batch.promptReady = false;
      }
      if (
        realisticProseCast(project) &&
        (!/\bthe same\b/i.test(batch.videoPrompt || "") || !/seen in @Video\d+/i.test(batch.videoPrompt || ""))
      ) {
        batch.promptReady = false;
      }
    }
    const previousSrc = previous ? durableVideoSrc(previous) : "";
    const voicesReady = Boolean(previous && previousSrc && previous.seenContinuityKey === voiceWatchKey(previousSrc));
    const staleCut = Boolean(
      previous &&
      storyClipCast(project) &&
      tailUrl(previous) &&
      previous.tailCutKey !== "voices" &&
      voicesReady &&
      (previous.tailAttempts || 0) < 4,
    );
    if (previous && ((!tailUrl(previous) && (previous.tailAttempts || 0) < 2) || staleCut)) {
      previous.tailAttempts = (previous.tailAttempts || 0) + 1;
      try {
        await savePartTail(project, previous);
      } catch (error) {
        console.warn("tail cut failed", project.id, previous.index, error instanceof Error ? error.message : error);
      }
      await saveSoon(project);
      if (!tailUrl(previous)) return { ready: false };
    }
    const handoffReady = storyClipCast(project)
      ? /short cut of the previous part/i.test(batch.videoPrompt || "")
      : /last 5 seconds/i.test(batch.videoPrompt || "");
    if (previous && !realKieVideoTaskId(batch.kieVideoTaskId) && batch.kieVideoTaskId !== "pending") {
      const prompt = batch.videoPrompt || "";
      const momentText = batch.sceneIndexes
        .map((index) => project.scenes.find((scene) => scene.index === index))
        .filter((scene) => Boolean(scene))
        .map((scene) => `${scene?.title || ""} ${scene?.location || ""} ${scene?.summary || ""}`)
        .join(" ");
      if (!handoffReady || /@Audio2\b/.test(prompt)) batch.promptReady = false;
      const seen = previousSeenCard(project, batch.sceneIndexes);
      if (clothesShouldChange(seen, momentText) && !/Clothes have changed/i.test(prompt)) batch.promptReady = false;
      if (partKeepsCarriedProduct(project, batch.sceneIndexes) && !/\bthe product\b|@Image\d+/i.test(prompt)) {
        batch.promptReady = false;
      }
    }
    if (batch.videoRemoteUrl || batch.videoPublicPath) {
      if (heavy) return { ready: false };
      heavy = true;
      await attachGeneratedVideo(project, batch, batch.videoRemoteUrl || batch.videoPublicPath || "");
      if (durableVideoSrc(batch)) {
        batch.storedAt = nowIso();
        console.info("part stored", project.id, batch.index);
      }
      await saveSoon(project);
      return { ready: false };
    }
    if (batch.kieVideoTaskId === "pending") {
      const age = Date.now() - new Date(batch.submittedAt || 0).getTime();
      if (batch.submittedAt && age < PENDING_STALE_MS) return { ready: false };
      delete batch.kieVideoTaskId;
      delete batch.submittedAt;
      await saveSoon(project);
    }
    const taskId = realKieVideoTaskId(batch.kieVideoTaskId);
    if (taskId) {
      const peek = await peekKieTask(taskId);
      if (peek.status === "pending") return { ready: false };
      if (peek.status === "success") {
        batch.videoRemoteUrl = peek.url;
        batch.status = "done";
        batch.readyAt = nowIso();
        delete batch.kieVideoTaskId;
        delete batch.error;
        delete batch.nextRetryAt;
        await saveSoon(project);
        if (heavy) return { ready: false };
        heavy = true;
        await attachGeneratedVideo(project, batch, peek.url);
        if (durableVideoSrc(batch)) {
          batch.storedAt = nowIso();
          console.info("part ready", project.id, batch.index, {
            submittedAt: batch.submittedAt,
            readyAt: batch.readyAt,
            storedAt: batch.storedAt,
          });
        }
        await saveSoon(project);
        return { ready: false };
      }
      schedulePartRetry(project, batch, peek.error || `Couldn't generate part ${batch.index}.`);
      delete batch.kieVideoTaskId;
      await saveSoon(project);
    }
    if (blockedByRealFace(batch.error || "") && !batch.faceRefsDropped) {
      batch.faceRefsDropped = true;
      batch.promptReady = false;
      delete batch.nextRetryAt;
      delete batch.error;
      await saveSoon(project);
    }
    if (batch.faceRefsDropped && /last 5 seconds/i.test(batch.videoPrompt || "")) {
      batch.promptReady = false;
      delete batch.nextRetryAt;
      delete batch.error;
    }
    if (
      batch.faceRefsDropped &&
      blockedByRealFace(batch.error || "") &&
      (batch.attempts || 0) >= 4 &&
      !/last 5 seconds/i.test(batch.videoPrompt || "")
    ) {
      failProduce(project, "This part was blocked because a reference looks like a real person.");
      await saveSoon(project);
      return { ready: false };
    }
    if (batch.nextRetryAt && Date.now() < new Date(batch.nextRetryAt).getTime()) return { ready: false };
    if (heavy) return { ready: false };
    heavy = true;
    try {
      await submitStoryBatch(project, batch, () => undefined);
    } catch (error) {
      if (!realKieVideoTaskId(batch.kieVideoTaskId)) {
        schedulePartRetry(project, batch, error instanceof Error ? error.message : "Couldn't start this part.");
        delete batch.kieVideoTaskId;
      }
      await saveSoon(project);
    }
  }
  return { ready: batches.every((batch) => Boolean(durableVideoSrc(batch))) && !heavy };
}

function finishProduce(project: Project) {
  project.keepGenerating = false;
  delete project.produceError;
  project.workflowStep = "produce";
  const src = projectDeliveredSrc(project);
  if (src && !project.messages.some((message) => message.attachments?.some((item) => item.src === src))) {
    project.messages.push({
      id: createId("msg"),
      role: "assistant",
      content: "Video ready.",
      createdAt: nowIso(),
      attachments: [{ kind: "video", src, poster: project.batches[0]?.framePublicPath, label: "Video ready" }],
    });
  }
}

function failProduce(project: Project, message: string) {
  project.keepGenerating = false;
  project.produceError = message;
  for (const batch of project.batches) {
    if (batch.videoPublicPath || batch.videoRemoteUrl) continue;
    if (!realKieVideoTaskId(batch.kieVideoTaskId)) delete batch.kieVideoTaskId;
    batch.status = "error";
    batch.error = message;
  }
}

export type ProduceState = "waiting" | "done" | "failed";

// Prepares a new generation. Only projects started here are ever advanced by the worker.
export async function startProduce(project: Project) {
  planSeedanceBatches(project);
  project.keepGenerating = true;
  project.produceStartedAt = nowIso();
  project.platesTried = false;
  project.workflowStep = "produce";
  delete project.produceError;
  for (const character of project.characters) character.anchorAttempts = 0;
  if (project.narratorVoice) project.narratorVoice.attempts = 0;
  for (const batch of project.batches) {
    if (batch.videoPublicPath || batch.videoRemoteUrl || realKieVideoTaskId(batch.kieVideoTaskId)) continue;
    delete batch.kieVideoTaskId;
    delete batch.error;
    delete batch.nextRetryAt;
    batch.attempts = 0;
    batch.status = "generating_video";
  }
  await saveSoon(project);
  return project;
}

// Intros must finish before any story part is sent, because the story uses them as references.
export async function advanceProduce(project: Project, onStatus: StatusFn): Promise<ProduceState> {
  if (projectDeliveredSrc(project)) {
    if (project.keepGenerating) finishProduce(project);
    return "done";
  }
  if (!project.keepGenerating) return "failed";
  const age = Date.now() - new Date(project.produceStartedAt || 0).getTime();
  if (!Number.isFinite(age) || age > PRODUCE_LIMIT_MS) {
    failProduce(project, "This video took too long. Try generating again.");
    return "failed";
  }
  onStatus("Generating your video…");
  const storyStarted = project.batches.some(
    (batch) => batch.videoPublicPath || batch.videoRemoteUrl || realKieVideoTaskId(batch.kieVideoTaskId),
  );
  const oneShot = shouldGenerateOneShot(project.targetDurationSeconds, project.scenes);
  const realistic = project.style === "realistic";
  const narrator = storyStarted || oneShot || realistic || project.song ? { ready: true } : await stepNarratorVoice(project);
  if (!project.platesTried) {
    await ensureLocationPlates(project, onStatus);
    project.platesTried = true;
    await saveSoon(project);
  }
  if (!narrator.ready) return "waiting";
  const story = await stepStoryParts(project);
  if (story.failed) {
    failProduce(project, story.failed);
    return "failed";
  }
  if (!story.ready) return "waiting";
  if (project.batches.length > 1) {
    try {
      await joinReadyParts(project, onStatus);
    } catch (error) {
      console.warn("join failed", project.id, error instanceof Error ? error.message : error);
      return "waiting";
    }
  }
  if (!projectDeliveredSrc(project)) return "waiting";
  finishProduce(project);
  await saveSoon(project);
  return "done";
}

async function ensureLocationPlates(project: Project, onStatus: StatusFn, abortSignal?: AbortSignal) {
  await ensureScenePlaces(project, abortSignal);
  if (realisticProseCast(project) || project.style === "pixar" || project.style === "claymation") return;
  project.locationPlates = (Array.isArray(project.locationPlates) ? project.locationPlates : []).filter(
    (plate) => !isJunkPlace(plate.name),
  );
  const missing = storyPlaces(project).filter(
    (place) => !project.locationPlates!.some((plate) => samePlace(plate.name, place.name) && isHttpUrl(plate.remoteUrl)),
  );
  await Promise.all(missing.map(async (place) => {
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
  }));
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
        ? characterLookFromPhotoPrompt(character, project.style, photo?.lookNotes || "")
        : characterLookPrompt(character, project.style, project.scriptText || ""),
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
  applyScriptLooks(project);
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
  applyScriptLooks(project);
  if (realisticProseCast(project)) return project.characters;
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

function appearanceOrder(project: Project) {
  const names: string[] = [];
  const seen = new Set<string>();
  for (const scene of project.scenes) {
    for (const name of [...(scene.characterNames || []), ...(scene.extraNames || [])]) {
      const key = name.trim().toLowerCase();
      if (!key || seen.has(key)) continue;
      seen.add(key);
      names.push(name.trim());
    }
  }
  for (const character of leadCharacters(project)) {
    const key = character.name.trim().toLowerCase();
    if (!key || seen.has(key)) continue;
    seen.add(key);
    names.push(character.name);
  }
  return names;
}

async function stableImageEntries(project: Project, abortSignal?: AbortSignal, keepSpeakingPortraits = false) {
  const imageEntries: PromptRef[] = [];
  const seen = new Set<string>();
  function add(entry: PromptRef) {
    const key = `${entry.kind}:${entry.name.trim().toLowerCase()}`;
    if (!entry.url || !entry.name.trim() || seen.has(key)) return;
    seen.add(key);
    imageEntries.push(entry);
  }

  const sources = assignCharacterSourcePhotos(project);
  for (const name of appearanceOrder(project)) {
    const character = findCharacter(project, name);
    if (!character || character.isExtra || isUnseenVoice(character)) continue;
    const speaks = characterHasDialogue(project, character);
    const hasVoice = speaks && Boolean(character.anchorVideoRemoteUrl || character.anchorVideoPublicPath);
    if (hasVoice && !keepSpeakingPortraits) continue;
    const photo = sources.get(character.id);
    const generated = await resolveUploadUrl(character.portraitRemoteUrl, character.portraitPublicPath, abortSignal);
    const uploaded = generated || !photo ? "" : await resolveUploadUrl(photo.originalRemoteUrl, photo.originalPublicPath, abortSignal);
    const portrait = generated || uploaded;
    if (portrait) add({ url: portrait, kind: "character", name: character.name });
  }

  const places: string[] = [];
  for (const scene of project.scenes) {
    const place = (scene.location || "").trim();
    if (place && !places.some((item) => samePlace(item, place))) places.push(place);
  }
  for (const place of places) {
    if (project.style === "pixar" || project.style === "claymation") break;
    const plate = (project.locationPlates || []).find((item) => samePlace(item.name, place));
    if (!plate) continue;
    const url = await resolveUploadUrl(plate.remoteUrl, plate.publicPath, abortSignal);
    if (url) add({ url, kind: "location", name: plate.name });
  }

  for (const asset of promptReadyReferences(project, undefined, true)) {
    const url = await resolveUploadUrl(asset.originalRemoteUrl, asset.originalPublicPath, abortSignal);
    if (!url) continue;
    const kind = asset.kind === "logo" || asset.kind === "product" || asset.kind === "location" ? asset.kind : "other";
    add({ url, kind, name: asset.label, notes: asset.notes });
  }
  return imageEntries;
}

async function stableCharacterVideos(project: Project, abortSignal?: AbortSignal) {
  if (project.style === "pixar" || project.style === "claymation") return [];
  const videos: PromptRef[] = [];
  for (const name of appearanceOrder(project)) {
    const character = findCharacter(project, name);
    if (!character || character.isExtra || isUnseenVoice(character)) continue;
    const video = await resolveUploadUrl(character.anchorVideoRemoteUrl, character.anchorVideoPublicPath, abortSignal);
    if (video) videos.push({ url: video, kind: "character", name: character.name });
  }
  return videos;
}

async function previousTailRef(project: Project, batch: Batch, abortSignal?: AbortSignal): Promise<PromptRef | undefined> {
  const previous = previousStoryBatch(project, batch);
  const src = tailUrl(previous);
  if (!src) return undefined;
  const url = await resolveUploadUrl(previous?.tailRemoteUrl, previous?.tailPublicPath, abortSignal);
  return url ? { url, kind: "video", name: "Previous ending" } : undefined;
}

async function proseReferenceImages(project: Project, sceneIndexes: number[], abortSignal?: AbortSignal) {
  const entries: PromptRef[] = [];
  const sources = assignCharacterSourcePhotos(project);
  const scenes = sceneIndexes
    .map((index) => project.scenes.find((item) => item.index === index))
    .filter((scene): scene is NonNullable<typeof scene> => Boolean(scene));
  const present = new Set(scenes.flatMap((scene) => charactersPresent(project, scene).map((name) => name.toLowerCase())));
  for (const character of project.characters) {
    if (character.isExtra || isUnseenVoice(character) || !present.has(character.name.trim().toLowerCase())) continue;
    const photo = sources.get(character.id);
    if (!photo) continue;
    const url = await resolveUploadUrl(photo.originalRemoteUrl, photo.originalPublicPath, abortSignal);
    if (url) entries.push({ url, kind: "character", name: character.name, notes: photo.notes });
  }
  for (const asset of project.references || []) {
    if (asset.kind !== "product" && asset.kind !== "logo" && asset.kind !== "location") continue;
    const url = await resolveUploadUrl(asset.originalRemoteUrl, asset.originalPublicPath, abortSignal);
    if (url && !entries.some((entry) => entry.url === url)) {
      entries.push({ url, kind: asset.kind, name: asset.label, notes: asset.notes });
    }
    await pushExtraProductPhotos(entries, asset, abortSignal);
  }
  await ensureCarriedProducts(project, entries, sceneIndexes, abortSignal);
  dropUnusedPackshots(project, entries, sceneIndexes);
  const blob = scenes
    .map((scene) => `${scene.title || ""} ${scene.summary || ""} ${(scene.dialogue || []).map((line) => line.line).join(" ")}`)
    .join(" ");
  for (const asset of project.references || []) {
    if (asset.kind !== "logo" || entries.some((entry) => entry.kind === "logo" && entry.name === asset.label)) continue;
    if (!sceneRequiresAsset("logo", blob)) continue;
    const url = await resolveUploadUrl(asset.originalRemoteUrl, asset.originalPublicPath, abortSignal);
    if (url) entries.push({ url, kind: "logo", name: asset.label, notes: asset.notes });
  }
  return entries;
}

async function collectRealisticReferences(project: Project, batch: Batch, abortSignal?: AbortSignal) {
  if (realisticProseCast(project)) {
    const imageEntries = await proseReferenceImages(project, batch.sceneIndexes, abortSignal);
    if (shouldGenerateOneShot(project.targetDurationSeconds, project.scenes)) {
      return { imageEntries, videoEntries: [] as PromptRef[] };
    }
    const tail = await previousTailRef(project, batch, abortSignal);
    return { imageEntries, videoEntries: tail ? [tail] : [] };
  }
  const imageEntries = await stableImageEntries(project, abortSignal, true);
  const seen = new Set(imageEntries.map((item) => item.url));
  for (const asset of project.references) {
    const alreadySeen = Boolean((asset.originalRemoteUrl && seen.has(asset.originalRemoteUrl)) || (asset.originalPublicPath && seen.has(asset.originalPublicPath)));
    const url = alreadySeen ? undefined : await resolveUploadUrl(asset.originalRemoteUrl, asset.originalPublicPath, abortSignal);
    if (url && !seen.has(url)) {
      seen.add(url);
      const kind = asset.kind === "logo" || asset.kind === "product" || asset.kind === "location" || asset.kind === "character" ? asset.kind : "other";
      imageEntries.push({ url, kind, name: asset.label, notes: asset.notes });
    }
    await pushExtraProductPhotos(imageEntries, asset, abortSignal);
    for (const entry of imageEntries) seen.add(entry.url);
  }
  await ensureCarriedProducts(project, imageEntries, batch.sceneIndexes, abortSignal);
  dropUnusedPackshots(project, imageEntries, batch.sceneIndexes);
  if (imageEntries.length > 30 && partKeepsCarriedProduct(project, batch.sceneIndexes)) {
    const products = imageEntries.filter((entry) => entry.kind === "product");
    const rest = imageEntries.filter((entry) => entry.kind !== "product");
    imageEntries.length = 0;
    imageEntries.push(...rest.slice(0, Math.max(0, 30 - products.length)), ...products);
  }
  if (imageEntries.length > 30) imageEntries.length = 30;
  if (shouldGenerateOneShot(project.targetDurationSeconds, project.scenes)) {
    return { imageEntries, videoEntries: [] as PromptRef[] };
  }
  const tail = batch.faceRefsDropped ? undefined : await previousTailRef(project, batch, abortSignal);
  return { imageEntries, videoEntries: tail ? [tail] : [] };
}

async function ensureCarriedProducts(project: Project, entries: PromptRef[], sceneIndexes: number[], abortSignal?: AbortSignal) {
  if (!partKeepsCarriedProduct(project, sceneIndexes)) return;
  for (const asset of project.references || []) {
    if (asset.kind !== "product") continue;
    const url = await resolveUploadUrl(asset.originalRemoteUrl, asset.originalPublicPath, abortSignal);
    if (url && !entries.some((entry) => entry.url === url)) {
      entries.push({ url, kind: "product", name: asset.label, notes: asset.notes });
    }
    await pushExtraProductPhotos(entries, asset, abortSignal);
  }
}

function dropUnusedPackshots(project: Project, entries: PromptRef[], sceneIndexes: number[]) {
  const scenes = (sceneIndexes || [])
    .map((index) => project.scenes.find((item) => item.index === index))
    .filter((scene): scene is NonNullable<typeof scene> => Boolean(scene));
  const present = new Set(scenes.flatMap((scene) => charactersPresent(project, scene).map((name) => name.toLowerCase())));
  const texts = scenes.map((scene) => {
    const lines = (scene.dialogue || []).map((line) => line.line).join(" ");
    const shots = (scene.shots || []).map((shot) => shot.action).join(" ");
    return `${scene.title || ""} ${scene.summary || ""} ${lines} ${shots}`;
  });
  const shown = new Set(project.productShownIndexes || []);
  for (let index = entries.length - 1; index >= 0; index -= 1) {
    const entry = entries[index];
    if (entry.kind === "character") {
      if (!present.has(entry.name.trim().toLowerCase())) entries.splice(index, 1);
      continue;
    }
    if (entry.kind === "location") {
      const used = scenes.some((scene) => scene.location && samePlace(scene.location, entry.name));
      if (!used) entries.splice(index, 1);
      continue;
    }
    if (entry.kind !== "product" && entry.kind !== "logo") continue;
    if (entry.kind === "logo") {
      const logoNeeded = texts.some((text) => sceneRequiresAsset("logo", text));
      if (!logoNeeded) entries.splice(index, 1);
      continue;
    }
    if (partKeepsCarriedProduct(project, sceneIndexes)) continue;
    const needed =
      scenes.some((scene) => shown.has(scene.index)) ||
      texts.some((text) => partNeedsPackshot(project, "product", entry.kind === "product" ? entry.name : "", text));
    if (!needed) entries.splice(index, 1);
  }
}

async function appendNeededPackshots(project: Project, entries: PromptRef[], sceneIndexes: number[], abortSignal?: AbortSignal) {
  const scenes = (sceneIndexes || [])
    .map((index) => project.scenes.find((item) => item.index === index))
    .filter((scene): scene is NonNullable<typeof scene> => Boolean(scene));
  const shown = new Set(project.productShownIndexes || []);
  const needed =
    scenes.some((scene) => shown.has(scene.index)) ||
    scenes.some((scene) => {
      const lines = (scene.dialogue || []).map((line) => line.line).join(" ");
      const shots = (scene.shots || []).map((shot) => shot.action).join(" ");
      return partNeedsPackshot(project, "product", "", `${scene.title || ""} ${scene.summary || ""} ${lines} ${shots}`);
    });
  if (!needed) return;
  for (const asset of project.references || []) {
    if (asset.kind !== "product" && asset.kind !== "logo") continue;
    const url = await resolveUploadUrl(asset.originalRemoteUrl, asset.originalPublicPath, abortSignal);
    if (url && !entries.some((entry) => entry.url === url)) {
      entries.push({ url, kind: asset.kind, name: asset.label, notes: asset.notes });
    }
    await pushExtraProductPhotos(entries, asset, abortSignal);
  }
}

async function collectLongformReferences(project: Project, batch: Batch, abortSignal?: AbortSignal) {
  const imageEntries = await stableImageEntries(project, abortSignal);
  await appendNeededPackshots(project, imageEntries, batch.sceneIndexes, abortSignal);
  await ensureCarriedProducts(project, imageEntries, batch.sceneIndexes, abortSignal);
  dropUnusedPackshots(project, imageEntries, batch.sceneIndexes);
  const videoEntries = await stableCharacterVideos(project, abortSignal);
  const narrator = await narratorVoiceRef(project, batch.sceneIndexes, abortSignal);
  const tail = batch.faceRefsDropped ? undefined : await previousTailRef(project, batch, abortSignal);
  const reserve = (narrator ? 1 : 0) + (tail ? 1 : 0);
  const characters = videoEntries.slice(0, Math.max(0, MAX_ANCHOR_VIDEOS - reserve));
  return {
    imageEntries,
    videoEntries: [
      ...characters,
      ...(narrator ? [narrator] : []),
      ...(tail ? [tail] : []),
    ],
  };
}

async function collectReferences(project: Project, batch: Batch, abortSignal?: AbortSignal) {
  if (project.style === "realistic") return collectRealisticReferences(project, batch, abortSignal);
  if (!shouldGenerateOneShot(project.targetDurationSeconds, project.scenes)) {
    return collectLongformReferences(project, batch, abortSignal);
  }
  const imageEntries = await stableImageEntries(project, abortSignal);
  await appendNeededPackshots(project, imageEntries, batch.sceneIndexes, abortSignal);
  await ensureCarriedProducts(project, imageEntries, batch.sceneIndexes, abortSignal);
  dropUnusedPackshots(project, imageEntries, batch.sceneIndexes);
  const videoEntries = await stableCharacterVideos(project, abortSignal);
  return { imageEntries, videoEntries: videoEntries.slice(0, MAX_ANCHOR_VIDEOS) };
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
  const requested = project.song
    ? Math.round(project.song.durationSeconds)
    : clampTotalDuration(project.targetDurationSeconds || fallback);
  project.targetDurationSeconds = requested;
  const target = requested;
  if (!project.song) {
    const clocks = clockBeatSeconds(project.scriptText || "");
    if (clocks.length >= 2 && clocks.length === project.scenes.length) {
      project.scenes.forEach((scene, index) => {
        scene.estimatedSeconds = clocks[index];
      });
    }
    project.scenes = splitScenesAcrossTakes(project.scenes);
  }
  const timed = project.scenes.map((scene) => ({
    index: scene.index,
    estimatedSeconds: scene.estimatedSeconds || 0,
    floor: sceneSpeechFloor(scene),
    lock: userTimedSeconds(scene.title, scene.estimatedSeconds) || (/end\s*card|tarjeta\s+final/i.test(`${scene.title} ${scene.summary}`) ? scene.estimatedSeconds : undefined),
  }));
  const parts = project.song
    ? packScenesIntoParts(
        project.scenes.map((scene) => ({ index: scene.index, estimatedSeconds: scene.estimatedSeconds || 0 })),
        target,
        project.song.clips.map((clip) => clip.durationSeconds),
      )
    : groupConsecutiveTakes(project.scenes.map((scene) => ({ index: scene.index, estimatedSeconds: scene.estimatedSeconds || 0 })));
  const bounded = project.song ? parts : fitPartsToBudget(parts, target);
  if (project.song) {
    const capped = balancePartSceneSeconds(timed, parts);
    const filled = fillPartSceneSeconds(
      timed.map((scene) => ({ ...scene, estimatedSeconds: capped.get(scene.index) || scene.estimatedSeconds })),
      parts,
    );
    project.scenes.forEach((scene) => {
      const next = filled.get(scene.index);
      if (next) scene.estimatedSeconds = next;
    });
  }
  const previous = project.batches;
  project.batches = bounded.map((part, index) => {
    const sceneIndexes = part.sceneIndexes.length
      ? part.sceneIndexes
      : project.song
        ? []
        : project.scenes.map((scene) => scene.index);
    const scenes = sceneIndexes
      .map((sceneIndex) => project.scenes.find((scene) => scene.index === sceneIndex))
      .filter((scene): scene is Project["scenes"][number] => Boolean(scene));
    const fitted = project.song ? part.duration : Math.min(30, Math.max(4, Math.round(part.duration)));
    const prior = previous.find(
      (batch) =>
        sameSceneList(batch.sceneIndexes, sceneIndexes) &&
        Boolean(batch.videoPublicPath || batch.videoRemoteUrl || realKieVideoTaskId(batch.kieVideoTaskId)),
    );
    const duration = prior?.duration || fitted;
    const names = [...new Set(scenes.flatMap((scene) => scene.characterNames || []))];
    return {
      id: prior?.id || createId("batch"),
      index: index + 1,
      duration,
      sceneIndexes,
      characterNames: names,
      extraNames: [...new Set(scenes.flatMap((scene) => scene.extraNames || []))],
      introducesNewLead: project.song ? false : index === 0,
      newLeadNames: project.song || index !== 0 ? [] : names,
      cameraPlan: scenes
        .map((scene) => scene.camera)
        .filter(Boolean)
        .join(" / "),
      videoPrompt: prior?.videoPrompt || packedScenePrompt(project, sceneIndexes, "", duration),
      promptReady: prior?.promptReady,
      framePrompt: prior?.framePrompt || "",
      pacingNotes: `Part ${index + 1} of ${bounded.length}, ${duration}s.`,
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
      seenContinuity: prior?.seenContinuity,
      seenContinuityKey: prior?.seenContinuityKey,
      seenAttempts: prior?.seenAttempts,
    };
  });
  if (project.song && project.batches.length !== project.song.clips.length) {
    console.warn("song parts", project.id, project.batches.length, project.song.clips.length);
  }
  return project.batches;
}

async function songAudioUrls(project: Project, batch: Batch, abortSignal?: AbortSignal) {
  const clip = project.song?.clips.find((item) => item.index === batch.index);
  if (!clip?.publicPath) return [];
  const urls: string[] = [];
  const main = await resolveUploadUrl(undefined, clip.publicPath, abortSignal);
  if (main) urls.push(main);
  return urls;
}

async function muxSongOntoPart(project: Project, batch: Batch) {
  if (!project.song) return;
  const clip = project.song.clips.find((item) => item.index === batch.index);
  const videoSrc = durableVideoSrc(batch);
  if (!clip?.publicPath || !videoSrc) throw new Error("The song could not be attached to this part.");
  const muxed = await replaceVideoAudio(await readPublicFile(videoSrc), await readPublicFile(clip.publicPath));
  const saved = await storeGeneratedFile({
    project,
    buffer: muxed,
    relativeParts: [project.id, "batches", `batch-${String(batch.index).padStart(2, "0")}-song.mp4`],
    contentType: "video/mp4",
  });
  batch.videoFileName = saved.fileName;
  batch.videoPublicPath = saved.publicPath;
  batch.videoRemoteUrl = saved.publicPath;
  project.lastVideoFileName = saved.fileName;
  project.lastVideoPublicPath = saved.publicPath;
  project.lastVideoRemoteUrl = saved.publicPath;
}

async function submitStoryBatch(project: Project, batch: Batch, onStatus: StatusFn, abortSignal?: AbortSignal) {
  if (!storyBatchNeedsSubmit(batch)) return false;
  throwIfAborted(abortSignal);
  onStatus("Generating your video…");
  await ensureProductImageNotes(project);
  await ensureProductScenes(project, abortSignal);
  if (!batch.promptReady) await prepareStoryPrompt(project, batch);
  const { imageEntries, videoEntries } = await collectReferences(project, batch, abortSignal);
  batch.continuityFlags = continuityFlags(project, batch.sceneIndexes);
  if (batch.continuityFlags.length) console.info("continuity", project.id, batch.index, batch.continuityFlags);
  batch.status = "generating_video";
  batch.kieVideoTaskId = "pending";
  batch.submittedAt = nowIso();
  delete batch.error;
  delete batch.nextRetryAt;
  await saveSoon(project);
  const audioUrls = await songAudioUrls(project, batch, abortSignal);
  if (project.song && !audioUrls.length) throw new Error("The song could not be attached to this part.");
  const taskId = await submitSeedance25ReferenceVideo({
    prompt: batch.videoPrompt,
    duration: batch.duration,
    aspectRatio: normalizeAspectRatio(project.aspectRatio),
    referenceImageUrls: imageEntries.map((item) => item.url),
    referenceVideoUrls: videoEntries.map((item) => item.url),
    referenceAudioUrls: audioUrls.length ? audioUrls : undefined,
    generateAudio: !project.song,
    resolution: "480p",
    provider: "kie",
    seed: projectSeed(project),
    onTaskCreated: async (id) => {
      batch.kieVideoTaskId = id;
      batch.status = "generating_video";
      batch.submittedAt = nowIso();
      await saveSoon(project);
    },
  });
  batch.kieVideoTaskId = taskId;
  await saveSoon(project);
  return true;
}

function readyParts(project: Project) {
  return [...project.batches].filter((batch) => durableVideoSrc(batch)).sort((a, b) => a.index - b.index);
}

async function joinReadyParts(project: Project, onStatus: StatusFn) {
  const parts = readyParts(project);
  if (parts.length < 2 || parts.length !== project.batches.length) return false;
  const key = parts.map((batch) => `${batch.index}:${batch.videoRemoteUrl || batch.videoPublicPath}`).join("|");
  const existing = project.joinedVideoPublicPath || project.joinedVideoRemoteUrl;
  if (existing) return false;
  onStatus("Generating your video…");
  const buffers = [];
  for (const batch of parts) {
    buffers.push(await readPublicFile(durableVideoSrc(batch)));
  }
  let joined = await concatVideoBuffers(buffers);
  if (project.song?.fullPublicPath) {
    joined = await replaceVideoAudio(joined, await readPublicFile(project.song.fullPublicPath));
  }
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
  console.info("video joined", project.id, parts.length);
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
  return true;
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
    await ensureProductImageNotes(project);
    await ensureProductScenes(project, abortSignal);
    const previous = previousStoryBatch(project, batch);
    await ensureRenderedContinuity(project, previous, batch);
    const { imageEntries, videoEntries } = await collectReferences(project, batch);
    const labeled = labeledReferencePrompt({
      images: imageEntries,
      videos: videoEntries,
      style: project.style,
      project,
      sceneIndexes: batch.sceneIndexes,
      videoPrompt: prompt,
      duration: batch.duration,
    });

    onStatus("Generating your video…");
    const revised = await refineSeedancePrompt(labeled, previous?.videoPrompt || "", directingNotes(project), previous?.seenContinuity || "");
    batch.videoPrompt = revised;
    const audioUrls = await songAudioUrls(project, batch);
    if (project.song && !audioUrls.length) throw new Error("The song could not be attached to this part.");
    const remoteUrl = await generateSeedance25ReferenceVideo({
      prompt: revised,
      duration: batch.duration,
      aspectRatio: normalizeAspectRatio(project.aspectRatio),
      referenceImageUrls: imageEntries.map((item) => item.url),
      referenceVideoUrls: videoEntries.map((item) => item.url),
      referenceAudioUrls: audioUrls.length ? audioUrls : undefined,
      generateAudio: project.song ? false : true,
      provider: "kie",
      resolution: "480p",
      seed: projectSeed(project),
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

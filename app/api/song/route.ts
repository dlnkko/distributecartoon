import path from "node:path";
import { NextResponse } from "next/server";
import { loadOwnedProject } from "@/lib/auth";
import { storeGeneratedFile } from "@/lib/assets";
import {
  probeAudioDuration,
  sliceAudioMp3,
  songPartDurations,
  SONG_MAX_SECONDS,
  SONG_MIN_SECONDS,
  transcribeLyrics,
} from "@/lib/song";
import { resetStoryboard, saveProject } from "@/lib/store";

export const runtime = "nodejs";
export const maxDuration = 120;

const AUDIO_EXT = new Set([".mp3", ".wav", ".m4a", ".aac", ".ogg", ".flac", ".webm", ".mpeg", ".mpga"]);

export async function POST(request: Request) {
  const form = await request.formData();
  const projectId = String(form.get("projectId") || "");
  const file = form.get("file");
  if (!projectId || !(file instanceof File)) {
    return NextResponse.json({ error: "Missing project or song." }, { status: 400 });
  }
  const ext = path.extname(file.name).toLowerCase();
  if (!AUDIO_EXT.has(ext) && !file.type.startsWith("audio/")) {
    return NextResponse.json({ error: "Upload an audio file, such as an mp3 from Suno." }, { status: 415 });
  }
  if (file.size > 20 * 1024 * 1024) {
    return NextResponse.json({ error: "That song is too large. Use an mp3 under 20 MB." }, { status: 413 });
  }
  const loaded = await loadOwnedProject(projectId);
  if ("response" in loaded) return loaded.response;
  const { project } = loaded;
  const buffer = Buffer.from(await file.arrayBuffer());
  const safeExt = AUDIO_EXT.has(ext) ? ext : ".mp3";
  let duration = 0;
  try {
    duration = await probeAudioDuration(buffer, safeExt);
  } catch {
    return NextResponse.json({ error: "Couldn't read that audio file." }, { status: 422 });
  }
  if (duration < SONG_MIN_SECONDS - 0.5 || duration > SONG_MAX_SECONDS + 0.5) {
    return NextResponse.json(
      { error: `Songs must be between 30 and 90 seconds. This one is ${Math.round(duration)}s.` },
      { status: 422 },
    );
  }
  const rounded = Math.min(SONG_MAX_SECONDS, Math.max(SONG_MIN_SECONDS, Math.round(duration)));
  let lyrics = "";
  try {
    lyrics = await transcribeLyrics(buffer, file.name);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Couldn't read the lyrics.";
    return NextResponse.json({ error: message }, { status: 422 });
  }
  if (lyrics.length < 8) {
    return NextResponse.json({ error: "Couldn't hear lyrics in that song." }, { status: 422 });
  }
  const parts = songPartDurations(rounded);
  const clips = [];
  let start = 0;
  for (let index = 0; index < parts.length; index += 1) {
    const length = parts[index];
    const slice = await sliceAudioMp3(buffer, safeExt, start, length);
    const saved = await storeGeneratedFile({
      project,
      buffer: slice,
      relativeParts: [project.id, "song", `part-${String(index + 1).padStart(2, "0")}.mp3`],
      contentType: "audio/mpeg",
    });
    clips.push({
      index: index + 1,
      startSeconds: start,
      durationSeconds: length,
      publicPath: saved.publicPath,
    });
    start += length;
  }
  resetStoryboard(project);
  project.song = {
    fileName: file.name,
    durationSeconds: rounded,
    lyrics,
    clips,
  };
  project.scriptName = file.name;
  project.scriptText = lyrics;
  project.targetDurationSeconds = rounded;
  project.durationAuto = false;
  project.durationPending = false;
  project.workflowStep = "script";
  await saveProject(project);
  return NextResponse.json({ project });
}

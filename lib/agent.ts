import OpenAI from "openai";
import { getSecrets } from "./config";
import { clampTotalDuration, createId, slugify, normalizeAspectRatio } from "./ids";
import { generateBatchFrame, generateBatchVideo, summarizeLibrary } from "./pipeline";
import { englishSpeakerName, packedScenePrompt } from "./style";
import { clipDurationForScenes, estimateSceneSeconds, parseDurationFromText, shouldGenerateOneShot } from "./timing";
import { ensureReferenceSlots, promptReadyReferences, syncReferenceInclusion } from "./refs";
import { saveProject } from "./store";
import { isAbortError, throwIfAborted } from "./abort";
import type { AgentMode, Batch, Character, Project, Scene, ScriptRefCue, VisualStyle } from "./types";

const SYSTEM_PROMPT = `You are the director-agent of distribute.to, a studio that turns scripts into Pixar or claymation shorts.

Language: always reply in English, clear and concrete.

Pipeline real:
1. PRIMERO el guion. No pidas imágenes ni generes video si aún no hay script.
2. Extraer escenas, diálogos, locaciones y personajes.
3. El sistema genera un retrato por lead (una sola pose, fondo gris claro). El usuario lo aprueba o pide un cambio, una sola vez, ANTES de animar. No confirmes looks tú.
4. El first frame de cada tanda solo incluye al personaje que actúa en ESE plano de apertura. No metas retratos de otros. Seedance 2.5 R2V sí recibe las fotos y/o el video de los demás personajes del clip.
5. Duración de cada ESCENA: si hay diálogo, el tiempo es el de decirlo con calma. Si casi no pasa nada (un beat, un insert, un corte), 2 a 3 segundos, según complejidad, intención y relevancia. No alargues una escena vacía ni comprimas una frase hablada.
6. El total del video está en targetDurationSeconds (5-300). Seedance 2.5 genera hasta 30s por clip, siempre a 480p. Si el total es 30s o menos, UNA sola tanda con TODAS las escenas (one-shot). Si es más de 30s, empaqueta en clips de 4-30s.
7. Si el guion es largo (más de 30s), con varias escenas y diálogos, estructura varios clips de 4-30s. El total debe cubrir el habla sin parecer apurado. Si el usuario pide un total más corto que el habla, no comprimas el diálogo por debajo de lo que tarda en decirse.
8. El aspect ratio del proyecto (16:9 o 9:16) ya lo aplica el sistema. No lo cambies salvo que el usuario lo pida.
9. Animar con Seedance 2.5 Reference-to-Video. El sistema etiqueta @Image1, @Image2 y @Video1 según el orden de archivos subidos.
10. El sistema tagea internamente cada clip por las voces de los leads que hablan ahí. En la siguiente tanda sube COMO MÁXIMO un @Video1: el clip anterior donde estén las voces de los personajes que participan en esa tanda. No adjunta varios videos ni clips de gente que no habla en la escena nueva.

Logo, product, and location:
- Do NOT generate a standalone product/logo/location still when a photo is uploaded. No packshot, no product-only restyle.
- Do NOT put them in prompts just because a slot or photo exists.
- Only if the SCRIPT mentions that product, logo, or location, and a photo is attached, the system labels it @Image2, @Image3, etc. as a LOOK REFERENCE.
- In first frames AND video, DRAW that object inside the scene in the current pixar or claymation style. The photo is identity (shape, colors, mark). The short is animation. Do not paste the photo photoreal as-is.
- Mention them in video_prompt only in the SCENE the script involves. Never invent a logo on set.
- Do not wait for photos. If the script does not need them, go to first frame and video.

Reglas de prompt Seedance 2.5 (obligatorias):
- El video_prompt EMPIEZA EXACTAMENTE con una sola ancla: "@Image1 is the first frame of this shot. Keep the same claymation style as seen in @Image1 for every scene. Do not switch look. No background music. Ambient sound and dialogue only." o la versión pixar. Luego SCENE 1. No repitas el ancla dentro de cada SCENE. Nunca pidas soundtrack, score ni background music.
- Las etiquetas @ImageN y @VideoN las inyecta el sistema. En video_prompt NO escribas Image 1 is / Keep identity / Keep the same style, look, lighting.
- Un logo nunca lleva "keep identity, costume, face and body". Va como marca en set, empaque o inserto, reconocible, dibujada en el estilo del corto, y solo si el guion lo pide.
- Cada cambio de escena/ángulo va así: SCENE 1 (5s): [plano y ángulo cinematográfico]. acción. The man says: "línea". CUT. SCENE 2 (4s): ...
- Respeta estimated_seconds de cada escena en el video_prompt: SCENE N (Xs). Esa duración es la que eligió el usuario.
- Dirección como corto profesional: establishing wide, closer para emoción, OTS o two-shot en diálogo, tracking/lateral motivado, hold en la cara mientras habla. Cambia de plano en el CUT, no a mitad de frase.
- El video_prompt va 100% en inglés, salvo las comillas del diálogo si el guion está en otro idioma. Nunca mezcles español fuera de esas comillas. Nombres cortos en inglés (Luna, Milo, the man). Nunca "Hombre de 40 años".
- Cada línea de diálogo una sola vez: the man says: "Wow, that's amazing!" Nunca repitas el nombre ni "says:".
- Usa planos y ángulos reales (wide, medium, close-up, insert, two-shot, OTS, high angle, low angle, tracking, lateral, dutch, POV) para dinamismo cuando la historia lo pida.
- Super breve. Nada de "cinematic masterpiece".
- Ejemplo Pixar:
  @Image1 is the first frame of this shot. Keep the same pixar style as seen in @Image1 for every scene. Do not switch look. No background music. Ambient sound and dialogue only. SCENE 1 (6s): Wide shot, eye level. Luna holds a red balloon over the sunset city. Luna says: "Si te suelto, ¿vas a volver?" CUT. SCENE 2 (4s): Tracking shot, lateral angle. The balloon rises through clotheslines as she runs to the railing.
- Ejemplo claymation:
  @Image1 is the first frame of this shot. Keep the same claymation style as seen in @Image1 for every scene. Do not switch look. No background music. Ambient sound and dialogue only. SCENE 1: Wide shot, eye-level, gentle lateral tracking. A 40-year-old man walks along the beach, then suddenly notices a big dolphin far out in the sea. CUT. SCENE 2: Close-up, eye-level. The man's face becomes happy and amazed as he looks toward the dolphin. The 40-year-old man says: "Wow, that's amazing!"

Herramientas:
- Usa extract_storyboard cuando entiendas el guion. En mentioned_refs solo listes logo/producto/locación si el texto del guion los involucra de verdad.
- No uses stylize_reference. Nunca generes una imagen solo del producto. El estilo Pixar/claymation se aplica dentro del first frame de la escena y del clip.
- Usa plan_video_batches cuando el usuario ya aprobó las escenas. Si targetDurationSeconds es 30 o menos, exactamente UNA tanda con todas las escenas. Si es más de 30, empaqueta en clips de 4-30s.
- generate_batch_frame crea el first frame de la primera escena de esa tanda. Solo el personaje que actúa en ese plano. Los retratos ya los aprobó el usuario.
- Prompt de IMAGEN (first frame): SIEMPRE en inglés, super breve. Empieza EXACTAMENTE con "claymation style" o "pixar style", luego plano y/o ángulo, luego acción y línea. Si el guion menciona un producto/logo/locación con foto, dibújalo DENTRO del plano en ese estilo, no como ficha ni packshot. Ejemplo claymation: claymation style, wide shot, dog in the rain alone, looking sad. Ejemplo pixar: pixar style, wide shot, Luna on a sunset rooftop holding a red balloon, looking at the city. Nada de "cinematic masterpiece".
- generate_video_batch anima UNA tanda con Seedance 2.5 reference-to-video. Respeta 4-30s. Cuando termine, el video YA está en el proyecto. No inventes URLs.

Nunca inventes URLs. Nunca digas que ya existe un video si la herramienta no lo creó. No uses markdown con asteriscos; escribe texto plano con saltos de línea. No hagas chat libre. No preguntes nada fuera del flujo.`;

const PLAN_PROMPT = `${SYSTEM_PROMPT}

Current task: PLAN ONLY.
Call extract_storyboard exactly once with every scene, dialogue, action (summary), camera direction, and estimated_seconds.
Make scene times add up to the project's targetDurationSeconds.
Then STOP. Do not plan batches. Do not generate frames or video. Do not ask questions.`;

const PRODUCE_PROMPT = `${SYSTEM_PROMPT}

Current task: PRODUCE.
The user already approved the storyboard. Do NOT rewrite or re-extract scenes.
If targetDurationSeconds is 30 or less, call plan_video_batches with EXACTLY one batch covering every scene at that duration (Seedance 2.5 one-shot). Otherwise pack into 4-30s clips whose durations add up to targetDurationSeconds.
Then call generate_batch_frame and generate_video_batch for each batch in order until all clips exist.
Do not ask questions. Do not chat.`;

const tools: OpenAI.Responses.Tool[] = [
  {
    type: "function",
    strict: false,
    name: "set_style",
    description: "Fija el estilo visual o el aspect ratio del corto.",
    parameters: {
      type: "object",
      additionalProperties: false,
      properties: {
        style: { type: "string", enum: ["pixar", "claymation"] },
        aspect_ratio: { type: "string", enum: ["16:9", "9:16"] },
        target_seconds: { type: "integer", description: "Duración total del corto en segundos, si el usuario la dijo." },
      },
    },
  },
  {
    type: "function",
    strict: false,
    name: "extract_storyboard",
    description: "Guarda personajes y escenas extraídos del guion.",
    parameters: {
      type: "object",
      additionalProperties: false,
      properties: {
        title: { type: "string" },
        characters: {
          type: "array",
          items: {
            type: "object",
            additionalProperties: false,
            properties: {
              name: { type: "string", description: "Short English name, e.g. Luna or Marco. Never a Spanish description like Hombre de 40 años." },
              description: { type: "string" },
              voice_notes: { type: "string" },
              is_extra: { type: "boolean" },
              look_known: { type: "boolean" },
            },
            required: ["name", "description", "is_extra", "look_known"],
          },
        },
        scenes: {
          type: "array",
          items: {
            type: "object",
            additionalProperties: false,
            properties: {
              index: { type: "integer" },
              title: { type: "string" },
              summary: { type: "string" },
              location: { type: "string" },
              character_names: { type: "array", items: { type: "string" } },
              extra_names: { type: "array", items: { type: "string" } },
              dialogue: {
                type: "array",
                items: {
                  type: "object",
                  additionalProperties: false,
                  properties: {
                    speaker: { type: "string", description: "Same short English name as the character. Never a Spanish label." },
                    line: { type: "string" },
                  },
                  required: ["speaker", "line"],
                },
              },
              estimated_seconds: {
                type: "number",
                description:
                  "Seconds this scene needs. Dialogue = time to say it calmly. Quiet/simple beats = 2-3s by complexity and intent. Do not pad empty scenes.",
              },
              camera: {
                type: "string",
                description: "English shot/angle only, e.g. wide shot, eye level or tracking shot, lateral.",
              },
            },
            required: [
              "index",
              "title",
              "summary",
              "location",
              "character_names",
              "dialogue",
              "estimated_seconds",
              "camera",
            ],
          },
        },
        questions_for_user: { type: "array", items: { type: "string" } },
        mentioned_refs: {
          type: "array",
          description:
            "Solo logo, producto o locación que el GUION involucra de verdad. Vacío si el texto no los pide.",
          items: {
            type: "object",
            additionalProperties: false,
            properties: {
              kind: { type: "string", enum: ["product", "logo", "location", "other"] },
              cue: { type: "string" },
              scene_indexes: { type: "array", items: { type: "integer" } },
            },
            required: ["kind", "scene_indexes"],
          },
        },
      },
      required: ["title", "characters", "scenes"],
    },
  },
  {
    type: "function",
    strict: false,
    name: "update_character_look",
    description: "Actualiza la descripción visual o de voz de un personaje.",
    parameters: {
      type: "object",
      additionalProperties: false,
      properties: {
        name: { type: "string" },
        description: { type: "string" },
        voice_notes: { type: "string" },
        look_confirmed: { type: "boolean" },
      },
      required: ["name"],
    },
  },
  {
    type: "function",
    strict: false,
    name: "propose_reference_slots",
    description: "Abre o asegura los slots de producto, logo y locación después del guion.",
    parameters: {
      type: "object",
      additionalProperties: false,
      properties: {
        extra_slots: {
          type: "array",
          items: {
            type: "object",
            additionalProperties: false,
            properties: {
              kind: { type: "string", enum: ["product", "logo", "location", "other"] },
              label: { type: "string" },
              notes: { type: "string" },
            },
            required: ["kind", "label"],
          },
        },
      },
    },
  },
  {
    type: "function",
    strict: false,
    name: "update_reference_usage",
    description: "Define cómo se usa una referencia en el video.",
    parameters: {
      type: "object",
      additionalProperties: false,
      properties: {
        ref_id: { type: "string" },
        label: { type: "string" },
        notes: { type: "string" },
        include_in_video: { type: "boolean" },
        skip_all: { type: "boolean" },
      },
    },
  },
  {
    type: "function",
    strict: false,
    name: "plan_video_batches",
    description:
      "Parte las escenas en tandas Seedance 2.5. Si el corto dura 30s o menos, exactamente una tanda con todas las escenas. Si dura más, tandas de 4 a 30s.",
    parameters: {
      type: "object",
      additionalProperties: false,
      properties: {
        batches: {
          type: "array",
          items: {
            type: "object",
            additionalProperties: false,
            properties: {
              index: { type: "integer" },
              duration: {
                type: "integer",
                description:
                  "Clip seconds, 4-30. If the whole short is 30s or less, use that full duration on the single batch. Otherwise pack short 2-3s scenes together. Cover spoken lines fully.",
              },
              scene_indexes: { type: "array", items: { type: "integer" } },
              character_names: { type: "array", items: { type: "string" } },
              extra_names: { type: "array", items: { type: "string" } },
              introduces_new_lead: { type: "boolean" },
              new_lead_names: { type: "array", items: { type: "string" } },
              camera_plan: { type: "string" },
              video_prompt: {
                type: "string",
                description:
                  "English only. Starts once with: @Image1 is the first frame of this shot. Keep the same claymation/pixar style as seen in @Image1 for every scene. Do not switch look. No background music. Ambient sound and dialogue only. Then SCENE 1 / CUT / SCENE 2. Do not repeat the style lock or @Image1 notes inside each scene. Dialogue once. Never repeat says. No Spanish. No soundtrack.",
              },
              frame_prompt: {
                type: "string",
                description:
                  'English only, super brief. Format: "claymation style, wide shot, action" or "pixar style, wide shot, action". Style words first, then shot/angle, then action and line.',
              },
              pacing_notes: { type: "string" },
            },
            required: [
              "index",
              "duration",
              "scene_indexes",
              "character_names",
              "introduces_new_lead",
              "video_prompt",
              "frame_prompt",
              "camera_plan",
            ],
          },
        },
      },
      required: ["batches"],
    },
  },
  {
    type: "function",
    strict: false,
    name: "generate_batch_frame",
    description: "Creates the first frame of this clip. Only the character acting in that opening shot.",
    parameters: {
      type: "object",
      additionalProperties: false,
      properties: { batch_index: { type: "integer" } },
      required: ["batch_index"],
    },
  },
  {
    type: "function",
    strict: false,
    name: "generate_video_batch",
    description: "Anima una tanda con Seedance 2.5 reference-to-video (4-30s).",
    parameters: {
      type: "object",
      additionalProperties: false,
      properties: {
        batch_index: { type: "integer" },
        duration: { type: "integer", description: "Opcional. 4-30 segundos. Sobrescribe la duración de esa tanda." },
      },
      required: ["batch_index"],
    },
  },
  {
    type: "function",
    strict: false,
    name: "list_character_library",
    description: "Lista personajes, retratos y clips tageados por elenco.",
    parameters: {
      type: "object",
      additionalProperties: false,
      properties: {},
    },
  },
];

type StatusFn = (text: string) => void;

function projectSnapshot(project: Project) {
  return {
    id: project.id,
    title: project.title,
    style: project.style,
    aspectRatio: project.aspectRatio,
    scriptName: project.scriptName,
    scriptChars: project.scriptText.length,
    pendingQuestions: project.pendingQuestions,
    characters: project.characters.map((character) => ({
      name: character.name,
      slug: character.slug,
      extra: character.isExtra,
      lookConfirmed: character.lookConfirmed,
      description: character.description,
      hasPortrait: Boolean(character.portraitRemoteUrl),
      latestVideo: character.latestVideoFileName || null,
    })),
    scenes: project.scenes,
    batches: project.batches.map((batch) => ({
      index: batch.index,
      duration: batch.duration,
      sceneIndexes: batch.sceneIndexes,
      characterNames: batch.characterNames,
      introducesNewLead: batch.introducesNewLead,
      newLeadNames: batch.newLeadNames,
      status: batch.status,
      videoPrompt: batch.videoPrompt,
      hasFrame: Boolean(batch.frameRemoteUrl),
      hasVideo: Boolean(batch.videoRemoteUrl),
      fileName: batch.videoFileName || null,
    })),
    lastVideo: project.lastVideoFileName || null,
    durationAuto: false,
    oneShot: shouldGenerateOneShot(project.targetDurationSeconds, project.scenes),
    resolution: "480p",
    targetDurationSeconds: project.targetDurationSeconds || null,
    durationPending: false,
    stage: project.workflowStep || "script",
    scriptRefCues: project.scriptRefCues,
    attachedRefs: promptReadyReferences(project).map((item) => ({
      id: item.id,
      kind: item.kind,
      label: item.label,
    })),
    references: project.references.map((item) => ({
      id: item.id,
      kind: item.kind,
      label: item.label,
      notes: item.notes,
      includeInVideo: item.includeInVideo,
      status: item.status,
      hasOriginal: Boolean(item.originalPublicPath),
    })),
  };
}

function uniqueList(names: string[]) {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const name of names) {
    const key = name.trim().toLowerCase();
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push(name.trim());
  }
  return out;
}

function collapseToOneShot(project: Project, previous: Map<number, Batch>) {
  if (!shouldGenerateOneShot(project.targetDurationSeconds, project.scenes) || !project.scenes.length) return;
  const sceneIndexes = project.scenes.map((scene) => scene.index);
  const source =
    project.batches.find((batch) => batch.sceneIndexes.length === sceneIndexes.length) || project.batches[0];
  const next: Batch = {
    id: createId("batch"),
    index: 1,
    duration: clipDurationForScenes(
      project.scenes,
      project.targetDurationSeconds,
      project.targetDurationSeconds,
      project.scenes.length,
    ),
    sceneIndexes,
    characterNames: uniqueList(project.scenes.flatMap((scene) => scene.characterNames || [])),
    extraNames: uniqueList(project.scenes.flatMap((scene) => scene.extraNames || [])),
    introducesNewLead: true,
    newLeadNames: uniqueList(project.scenes.flatMap((scene) => scene.characterNames || [])),
    cameraPlan:
      project.scenes
        .map((scene) => scene.camera)
        .filter(Boolean)
        .join(" / ") ||
      source?.cameraPlan ||
      "",
    videoPrompt: packedScenePrompt(project, sceneIndexes, source?.videoPrompt || ""),
    framePrompt: source?.framePrompt || "",
    pacingNotes: source?.pacingNotes || "One-shot Seedance clip covering the full short.",
    status: "planned",
  };
  const prior =
    [...previous.values()].find((item) => JSON.stringify(item.sceneIndexes) === JSON.stringify(sceneIndexes)) ||
    previous.get(1);
  if (prior && JSON.stringify(prior.sceneIndexes) === JSON.stringify(sceneIndexes)) {
    next.id = prior.id;
    next.status = prior.videoPublicPath ? "done" : prior.status === "planned" ? next.status : prior.status;
    next.frameFileName = prior.frameFileName;
    next.framePublicPath = prior.framePublicPath;
    next.frameRemoteUrl = prior.frameRemoteUrl;
    next.videoFileName = prior.videoFileName;
    next.videoPublicPath = prior.videoPublicPath;
    next.videoRemoteUrl = prior.videoRemoteUrl;
  }
  project.batches = [next];
}

function scaleScenesToTarget(project: Project) {
  const target = clampTotalDuration(project.targetDurationSeconds);
  project.targetDurationSeconds = target;
  if (!project.scenes.length) return;
  const sum = project.scenes.reduce((total, scene) => total + (scene.estimatedSeconds || 0), 0);
  if (sum <= 0) {
    const each = Math.max(2, Math.round((target / project.scenes.length) * 10) / 10);
    for (const scene of project.scenes) scene.estimatedSeconds = each;
    return;
  }
  const scale = target / sum;
  let used = 0;
  project.scenes.forEach((scene, index) => {
    if (index === project.scenes.length - 1) {
      scene.estimatedSeconds = Math.max(2, Math.round((target - used) * 10) / 10);
      return;
    }
    scene.estimatedSeconds = Math.max(2, Math.round(scene.estimatedSeconds * scale * 10) / 10);
    used += scene.estimatedSeconds;
  });
}

function toolsFor(mode: AgentMode) {
  const names =
    mode === "plan"
      ? ["extract_storyboard"]
      : ["plan_video_batches", "generate_batch_frame", "generate_video_batch"];
  return tools.filter((tool) => tool.type === "function" && names.includes(tool.name));
}

async function executeTool(
  project: Project,
  name: string,
  args: Record<string, unknown>,
  onStatus: StatusFn,
  abortSignal?: AbortSignal,
) {
  throwIfAborted(abortSignal);
  switch (name) {
    case "set_style": {
      if (args.style === "pixar" || args.style === "claymation") project.style = args.style as VisualStyle;
      if (args.aspect_ratio) project.aspectRatio = normalizeAspectRatio(args.aspect_ratio);
      if (args.target_seconds) {
        project.targetDurationSeconds = clampTotalDuration(args.target_seconds);
        project.durationPending = false;
      }
      saveProject(project);
      return {
        style: project.style,
        aspectRatio: project.aspectRatio,
        targetDurationSeconds: project.targetDurationSeconds || null,
      };
    }
    case "extract_storyboard": {
      project.title = String(args.title || project.title);
      const characters = (args.characters as Array<Record<string, unknown>>) || [];
      const previousCharacters = new Map<string, Character>();
      for (const character of project.characters) {
        previousCharacters.set(character.slug, character);
        previousCharacters.set(character.name.toLowerCase(), character);
      }
      project.characters = characters.map((item) => {
        const name = englishSpeakerName(String(item.name), String(item.description || ""));
        const slug = slugify(name);
        const prior = previousCharacters.get(slug) || previousCharacters.get(name.toLowerCase());
        return {
          id: prior?.id || createId("char"),
          name,
          slug,
          description: String(item.description || ""),
          voiceNotes: String(item.voice_notes || ""),
          isExtra: Boolean(item.is_extra),
          lookConfirmed: false,
          lookRevisionUsed: Boolean(prior?.lookRevisionUsed),
          sourceRefId: prior?.sourceRefId,
          portraitFileName: prior?.portraitFileName,
          portraitPublicPath: prior?.portraitPublicPath,
          portraitRemoteUrl: prior?.portraitRemoteUrl,
          latestVideoFileName: prior?.latestVideoFileName,
          latestVideoPublicPath: prior?.latestVideoPublicPath,
          latestVideoRemoteUrl: prior?.latestVideoRemoteUrl,
          clips: prior?.clips || [],
        };
      });
      const scenes = (args.scenes as Array<Record<string, unknown>>) || [];
      project.scenes = scenes.map((item) => {
        const dialogue = ((item.dialogue as Array<{ speaker: string; line: string }>) || []).map((line) => ({
          speaker: englishSpeakerName(line.speaker),
          line: line.line,
        }));
        const summary = String(item.summary || "");
        const computed = estimateSceneSeconds({ summary, dialogue });
        const raw = Number(item.estimated_seconds || 0);
        return {
          id: createId("scene"),
          index: Number(item.index),
          title: String(item.title || ""),
          summary,
          location: String(item.location || ""),
          characterNames: ((item.character_names as string[]) || []).map((name) => englishSpeakerName(name)),
          extraNames: (item.extra_names as string[]) || [],
          dialogue,
          estimatedSeconds: Math.max(2, raw > 0 ? raw : computed),
          camera: String(item.camera || ""),
        };
      }) as Scene[];
      const cue =
        typeof project.targetDurationSeconds === "number"
          ? clampTotalDuration(project.targetDurationSeconds)
          : parseDurationFromText(project.scriptText);
      project.durationPending = false;
      project.durationAuto = false;
      if (cue) project.targetDurationSeconds = cue;
      else {
        project.targetDurationSeconds = clampTotalDuration(
          project.scenes.reduce((sum, scene) => sum + scene.estimatedSeconds, 0),
        );
      }
      scaleScenesToTarget(project);
      project.pendingQuestions = (args.questions_for_user as string[]) || [];
      project.scriptRefCues = ((args.mentioned_refs as Array<Record<string, unknown>>) || []).map((item) => ({
        kind: item.kind as ScriptRefCue["kind"],
        cue: String(item.cue || ""),
        sceneIndexes: (item.scene_indexes as number[]) || [],
      }));
      ensureReferenceSlots(project);
      syncReferenceInclusion(project);
      project.workflowStep = "review";
      saveProject(project);
      return {
        characters: project.characters.length,
        scenes: project.scenes.length,
        questions: project.pendingQuestions,
        mentionedRefs: project.scriptRefCues,
        attachedRefs: promptReadyReferences(project).map((item) => item.label),
        targetDurationSeconds: project.targetDurationSeconds || null,
        durationPending: Boolean(project.durationPending),
      };
    }
    case "propose_reference_slots": {
      ensureReferenceSlots(project);
      saveProject(project);
      return { slots: project.references };
    }
    case "update_reference_usage": {
      if (args.skip_all) {
        project.skippedRefs = true;
        saveProject(project);
        return { skipped: true };
      }
      const asset = project.references.find((item) => item.id === args.ref_id || item.label.toLowerCase() === String(args.label || "").toLowerCase());
      if (!asset) return { error: "I couldn't find that slot." };
      if (args.notes) asset.notes = String(args.notes);
      if (args.label) asset.label = String(args.label);
      if (typeof args.include_in_video === "boolean") {
        if (args.include_in_video) {
          project.scriptRefCues = [
            ...(project.scriptRefCues || []).filter((cue) => cue.kind !== asset.kind),
            {
              kind: asset.kind,
              cue: String(args.notes || asset.notes || asset.label),
              sceneIndexes: project.scenes.map((scene) => scene.index),
            },
          ];
        } else {
          project.scriptRefCues = (project.scriptRefCues || []).filter((cue) => cue.kind !== asset.kind);
        }
      }
      syncReferenceInclusion(project);
      saveProject(project);
      return { asset, attached: promptReadyReferences(project).map((item) => item.label) };
    }
    case "update_character_look": {
      const nameArg = String(args.name);
      const character = project.characters.find((item) => item.name.toLowerCase() === nameArg.toLowerCase());
      if (!character) return { error: `No existe ${nameArg}` };
      if (args.description) character.description = String(args.description);
      if (args.voice_notes) character.voiceNotes = String(args.voice_notes);
      if (typeof args.look_confirmed === "boolean") character.lookConfirmed = args.look_confirmed;
      saveProject(project);
      return { character };
    }
    case "plan_video_batches": {
      project.durationPending = false;
      if (!project.targetDurationSeconds) {
        project.targetDurationSeconds = clampTotalDuration(
          project.scenes.reduce((sum, scene) => sum + scene.estimatedSeconds, 0),
        );
      }
      const previous = new Map(project.batches.map((batch) => [batch.index, batch]));
      const batches = (args.batches as Array<Record<string, unknown>>) || [];
      project.batches = batches.map((item) => {
        const sceneIndexes = (item.scene_indexes as number[]) || [];
        const scenes = sceneIndexes
          .map((index) => project.scenes.find((entry) => entry.index === index))
          .filter((scene): scene is Scene => Boolean(scene));
        const allScenes = scenes.length === project.scenes.length;
        const next = {
          id: createId("batch"),
          index: Number(item.index),
          duration: clipDurationForScenes(
            scenes,
            Number(item.duration) || undefined,
            allScenes ? project.targetDurationSeconds : undefined,
            project.scenes.length,
          ),
          sceneIndexes,
          characterNames: (item.character_names as string[]) || [],
          extraNames: (item.extra_names as string[]) || [],
          introducesNewLead: Boolean(item.introduces_new_lead),
          newLeadNames: (item.new_lead_names as string[]) || [],
          cameraPlan: String(item.camera_plan || ""),
          videoPrompt: packedScenePrompt(project, sceneIndexes, String(item.video_prompt || "")),
          framePrompt: String(item.frame_prompt || ""),
          pacingNotes: String(item.pacing_notes || ""),
          status: "planned" as const,
        };
        const prior = previous.get(next.index);
        if (prior && JSON.stringify(prior.sceneIndexes) === JSON.stringify(sceneIndexes)) {
          return {
            ...next,
            id: prior.id,
            status: prior.videoPublicPath ? ("done" as const) : prior.status === "planned" ? next.status : prior.status,
            frameFileName: prior.frameFileName,
            framePublicPath: prior.framePublicPath,
            frameRemoteUrl: prior.frameRemoteUrl,
            videoFileName: prior.videoFileName,
            videoPublicPath: prior.videoPublicPath,
            videoRemoteUrl: prior.videoRemoteUrl,
          };
        }
        return next;
      });
      collapseToOneShot(project, previous);
      saveProject(project);
      return { batches: project.batches.length, prompts: project.batches.map((batch) => batch.videoPrompt) };
    }
    case "generate_batch_frame": {
      project.workflowStep = "produce";
      const batch = await generateBatchFrame(project, Number(args.batch_index), onStatus, abortSignal);
      if (batch.framePublicPath) {
        project.messages.push({
          id: createId("msg"),
          role: "assistant",
          content: `First frame is ready.`,
          createdAt: new Date().toISOString(),
          attachments: [{ kind: "image", src: batch.framePublicPath, label: `Frame ${batch.index}` }],
        });
        saveProject(project);
      }
      return { index: batch.index, file: batch.frameFileName, path: batch.framePublicPath, delivered: true };
    }
    case "generate_video_batch": {
      project.workflowStep = "produce";
      const result = await generateBatchVideo(project, Number(args.batch_index), onStatus, args.duration, abortSignal);
      if (result.batch.videoPublicPath) {
        project.messages.push({
          id: createId("msg"),
          role: "assistant",
          content: `The video is ready (${result.batch.duration}s).`,
          createdAt: new Date().toISOString(),
          attachments: [
            {
              kind: "video",
              src: result.batch.videoPublicPath,
              poster: result.batch.framePublicPath,
              label: project.title || "Video",
            },
          ],
        });
        saveProject(project);
      }
      return {
        index: result.batch.index,
        duration: result.batch.duration,
        file: result.batch.videoFileName,
        path: result.batch.videoPublicPath,
        promptUsed: result.prompt,
        delivered: true,
      };
    }
    case "list_character_library": {
      return summarizeLibrary(project);
    }
    default:
      return { error: `Unknown tool: ${name}` };
  }
}

function asRecord(value: string) {
  if (!value) return {};
  return JSON.parse(value) as Record<string, unknown>;
}

export async function runAgent(options: {
  project: Project;
  userText?: string;
  mode: AgentMode;
  onEvent: (event: { type: "status" | "project"; text?: string; project?: Project }) => void;
  abortSignal?: AbortSignal;
}) {
  const mode = options.mode;
  options.project.durationPending = false;
  options.project.durationAuto = false;
  if (typeof options.project.targetDurationSeconds !== "number") {
    options.project.targetDurationSeconds = 15;
  } else {
    options.project.targetDurationSeconds = clampTotalDuration(options.project.targetDurationSeconds);
  }
  if (mode === "plan") options.project.workflowStep = "setup";
  if (mode === "produce") options.project.workflowStep = "produce";
  saveProject(options.project);

  const { openaiApiKey, openaiModel } = getSecrets();
  if (!openaiApiKey) {
    throw new Error("OPENAI_API_KEY is missing for the GPT-5.6 Luna agent.");
  }

  const client = new OpenAI({ apiKey: openaiApiKey });
  const onStatus = (text: string) => options.onEvent({ type: "status", text });
  const signal = options.abortSignal;
  const activeTools = toolsFor(mode);
  const instructions = mode === "plan" ? PLAN_PROMPT : PRODUCE_PROMPT;
  const userText =
    options.userText?.trim() ||
    (mode === "plan"
      ? `Split the script into scenes with dialogue, action, and camera direction. Target total duration: ${options.project.targetDurationSeconds}s. Style: ${options.project.style}. Aspect: ${options.project.aspectRatio}. Call extract_storyboard once, then stop.`
      : `The storyboard is approved. Do not rewrite scenes. ${
          shouldGenerateOneShot(options.project.targetDurationSeconds, options.project.scenes)
            ? `Generate this ${options.project.targetDurationSeconds}s ${options.project.style} short in ONE Seedance 2.5 take covering every scene at 480p.`
            : `Plan 4-30s clips covering all scenes for a ${options.project.targetDurationSeconds}s ${options.project.style} video at ${options.project.aspectRatio}, then generate every clip in order at 480p.`
        }`);

  const input: OpenAI.Responses.ResponseInput = [
    {
      role: "user",
      content: [
        {
          type: "input_text",
          text: [
            `Current project state:\n${JSON.stringify(projectSnapshot(options.project), null, 2)}`,
            options.project.scriptText
              ? `\n\nSCRIPT (${options.project.scriptName || "pasted"}):\n${options.project.scriptText.slice(0, 40000)}`
              : "",
            `\n\nTASK:\n${userText}`,
          ].join(""),
        },
      ],
    },
  ];

  throwIfAborted(signal);
  let response = await client.responses.create(
    {
      model: openaiModel,
      instructions,
      tools: activeTools,
      input,
      reasoning: { effort: "medium" },
    },
    { signal },
  );

  const maxSteps = mode === "plan" ? 4 : 80;
  for (let step = 0; step < maxSteps; step += 1) {
    throwIfAborted(signal);
    const calls = response.output.filter((item) => item.type === "function_call");
    if (!calls.length) break;

    const outputs: OpenAI.Responses.ResponseInput = [];
    let planned = false;
    for (const call of calls) {
      throwIfAborted(signal);
      onStatus(mode === "plan" ? "Building scenes…" : `Agent: ${call.name}`);
      let result: unknown;
      try {
        result = await executeTool(options.project, call.name, asRecord(call.arguments), onStatus, signal);
        options.onEvent({ type: "project", project: options.project });
        if (mode === "plan" && options.project.scenes.length) planned = true;
      } catch (error) {
        if (isAbortError(error)) throw error;
        result = { error: error instanceof Error ? error.message : String(error) };
      }
      outputs.push({
        type: "function_call_output",
        call_id: call.call_id,
        output: JSON.stringify(result),
      });
    }

    if (planned) break;

    throwIfAborted(signal);
    response = await client.responses.create(
      {
        model: openaiModel,
        instructions,
        tools: activeTools,
        previous_response_id: response.id,
        input: outputs,
      },
      { signal },
    );
  }

  throwIfAborted(signal);

  if (mode === "plan") {
    if (!options.project.scenes.length) {
      throw new Error("Couldn't extract scenes from that script.");
    }
    options.project.workflowStep = "review";
    saveProject(options.project);
    options.onEvent({ type: "project", project: options.project });
    return;
  }

  const lastVideo = options.project.lastVideoPublicPath;
  const alreadyDelivered = Boolean(
    lastVideo && options.project.messages.some((item) => item.attachments?.some((att) => att.src === lastVideo)),
  );
  if (lastVideo && !alreadyDelivered) {
    options.project.messages.push({
      id: createId("msg"),
      role: "assistant",
      content: "Video ready.",
      createdAt: new Date().toISOString(),
      attachments: [{ kind: "video", src: lastVideo, label: "Video ready" }],
    });
  }
  options.project.workflowStep = "produce";
  saveProject(options.project);
  options.onEvent({ type: "project", project: options.project });
}

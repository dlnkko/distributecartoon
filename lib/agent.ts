import OpenAI from "openai";
import { getSecrets } from "./config";
import { clampTotalDuration, createId, slugify, normalizeAspectRatio } from "./ids";
import { generateBatchVideo, planSeedanceBatches, startProduce, summarizeLibrary } from "./pipeline";
import { driveProduce } from "./produce";
import { englishExtraName, englishSpeakerName, packedScenePrompt, stampProductPlacement } from "./style";
import { estimateSceneSeconds, parseDurationFromText, sceneHasStory, shouldGenerateOneShot } from "./timing";
import { ensureReferenceSlots, isUnseenVoice, promptReadyReferences, refineStoryLeads, syncReferenceInclusion } from "./refs";
import { saveProject } from "./store";
import { isAbortError, throwIfAborted } from "./abort";
import type { AgentMode, Batch, Character, Project, Scene, ScriptRefCue, VisualStyle } from "./types";

const SYSTEM_PROMPT = `You are the director-agent of distribute.to, a studio that turns scripts into Pixar or claymation shorts.

Language: always reply in English, clear and concrete.

Pipeline real:
1. PRIMERO el guion. No pidas imágenes ni generes video si aún no hay script.
2. Extraer escenas, diálogos, locaciones y personajes.
3. El sistema genera un retrato INDIVIDUAL por lead (una sola pose, fondo gris claro, ese personaje solo). Nunca un two-shot ni una escena de pelea. Si hay foto de Setup, el look es SOLO convertir esa foto a Pixar o claymation; nunca inventes pelo, piel, ropa ni especie. La description del personaje es SOLO apariencia (especie, color, ropa) cuando NO hay foto, sin plot ni otros personajes. El usuario lo aprueba o pide un cambio, una sola vez, ANTES de animar. No confirmes looks tú. Cast ONLY on-screen story principals (usually 1-4). Never cast a look for a Narrator or unseen voice-over. If the script is narrator VO and does not name whose voice, keep speaker as Narrator (is_extra true); the system picks any fitting off-screen voice. If an on-screen character has dialogue, that is their realistic lipsync. A speaker named Narrator is always off-screen voice-over. Never give those lines to an on-screen character and never lipsync them. Crowd, montage, b-roll, numbered extras are is_extra true — no look.
4. NO first-frame still. Only character look portraits are generated. Seedance 2.5 R2V receives those portraits plus product/logo/location photos when the script uses them. The system maps files to @Image1, @Image2, @Image3 in upload order and writes those tags INSIDE the scenes when that person or object is on screen. Do not dump "@Image2 is Guy. Match his design..." at the start of the prompt.
5. Duración de cada ESCENA: si hay diálogo, el tiempo es el de decirlo con calma. Si casi no pasa nada (un beat, un insert, un corte), 2 a 3 segundos, según complejidad, intención y relevancia. No alargues una escena vacía ni comprimas una frase hablada.
6. El total del video está en targetDurationSeconds (5-300). Seedance 2.5 genera hasta 30s por clip, siempre a 480p. Si el total es 30s o menos, UNA sola tanda con TODAS las escenas (one-shot). Si es más de 30s, empaqueta escenas enteras en clips de 4-30s. Nunca partas una escena a la mitad ni la repitas en el clip siguiente: si al segundo 28 entra una escena de 5s, cierra ese clip en 28s y empieza el siguiente con esa escena. La suma de clips cubre targetDurationSeconds.
7. Si el guion es largo (más de 30s), con varias escenas y diálogos, estructura varios clips de 4-30s. El total debe cubrir el habla sin parecer apurado. Si el usuario pide un total más corto que el habla, no comprimas el diálogo por debajo de lo que tarda en decirse.
8. El aspect ratio del proyecto (16:9 o 9:16) ya lo aplica el sistema. No lo cambies salvo que el usuario lo pida.
9. Animar con Seedance 2.5 Reference-to-Video. Menciona @ImageN / @VideoN en la escena en la que aparecen, no en un preámbulo.
10. El sistema tagea internamente cada clip por las voces de los leads que hablan ahí. En la siguiente tanda sube COMO MÁXIMO un @Video1: el clip anterior donde estén las voces de los personajes que participan en esa tanda. No adjunta varios videos ni clips de gente que no habla en la escena nueva.

Logo, product, and location:
- Do NOT generate a standalone product/logo/location still when a photo is uploaded. No packshot, no product-only restyle.
- Do NOT put them in prompts just because a slot or photo exists.
- Only if the SCRIPT mentions that product, logo, or location, and a photo is attached, mention that @Image tag in the SCENE where it appears.
- Keep the EXACT packaging form of the attached product photo: a stand-up pouch stays a pouch, a sachet stays a sachet, a bottle stays a bottle. Never turn a pouch into a bottle, jar, or tub. Same silhouette, closure, label layout, colors, and branding, drawn in pixar or claymation. Do not paste the photo photoreal as-is.
- Never invent a logo on set. Do not wait for photos.

Reglas de prompt Seedance 2.5 (obligatorias):
- El video_prompt EMPIEZA EXACTAMENTE así: "Pixar style throughout the whole video." o "Claymation style throughout the whole video." Luego SCENE 1. Nada de first frame. Nada de listar todos los @Image al inicio.
- Dentro de cada escena, nombra @ImageN cuando ese personaje, producto, logo o locación entra o se usa. Ejemplo: SCENE 1. Eye level, medium shot. @Image1 appears in the gym drinking creatine. CUT. SCENE 2. Dutch angle, full shot. After @Image1 stops drinking, his friend @Image2 appears with @Image3 which is the creatine gummies product.
- El sistema inyecta los números @ImageN. En video_prompt usa los nombres de personaje/producto; el sistema los sustituye.
- Cada cambio de escena: SCENE 1 (5s). [English camera names only]. action. The man says: "line". CUT. SCENE 2 (4s). ...
- Respeta estimated_seconds: SCENE N (Xs).
- El diálogo o voiceover EMPIEZA en el segundo 0. SCENE 1 abre con la primera línea hablada, sin intro muda.
- Voz, una sola vez en el cierre (el sistema lo escribe): diálogo on-screen = lipsync con la voz realista de ESE personaje. Si el speaker es Narrator, es voz en off: nadie mueve la boca y ningún personaje la dice. Nunca pases una línea de Narrator a un personaje en cuadro. No repitas esta regla dentro de cada SCENE.
- Dentro de cada escena, nombra el producto/logo/locación con @ImageN cuando aparece en ESA escena, igual que los personajes. Nunca lo dejes solo al final del prompt.
- Cámara: varía el plano y el ángulo en CADA escena. Usa SOLO nombres en inglés: extreme wide shot, wide shot, full shot, medium full shot, medium shot, medium close-up, close-up, extreme close-up, insert, two-shot, over the shoulder, POV, eye level, low angle, high angle, bird's eye, worm's eye, dutch angle, pan, tilt, dolly, tracking shot, steadicam, crane, zoom, handheld, dolly zoom. Nunca nombres en español.
- Planos: nunca inventes un segundo cuerpo del mismo personaje. Over-the-shoulder = hombro de A, cara de B, A ≠ B. Si solo hay un personaje en cuadro, no uses OTS ni two-shot. Estas reglas van en el cierre del prompt UNA vez, no repetidas en cada escena. OTS sí puede llevar su línea de cámara solo en ESA escena.
- Acción visible: si alguien come o usa un producto, muestra la acción completa (mano, pack, boca). Nunca cortes al objeto ya dentro de la boca.
- Física y continuidad: escríbelas EN LA ACCIÓN, no como un párrafo de reglas en cada escena. Gravedad, sólidos que no se atraviesan, puertas que se abren por aire vacío. Si alguien está acorralado en un rincón, la siguiente escena sigue en ese rincón. Edad/tamaño igual: tiny se queda tiny hasta el beat que crece; misma escala vs silla, mesa y puerta entre cortes. Si A le habla a B, A mira a B, no al lente, salvo cuarta pared. Si alguien persigue, avanza hacia esa posición. Si hay glow, luces u ojos brillantes detrás, el cuerpo de enfrente los tapa: nada de brillo a través del pelo o la piel. Si agarra una puerta o cubiertos, los dedos tocan el objeto; no flota. La ropa puede cambiar: sigue siendo la misma persona, no un segundo cuerpo. Conserva quién está adelante, atrás, a la izquierda y a la derecha hasta que la acción los mueva. El tiempo avanza. El lugar no cambia hasta que la escena cambie de locación. En 16:9 el cuadro ancho es un solo espacio: no uses el ancho para duplicar a nadie ni para invertir el layout. El sistema puede añadir una frase corta solo cuando esa escena lo necesita; no copies esas reglas en cada SCENE.
- Actuación: caras, ojos, orejas, colas y cuerpo muestran emoción (miedo, alivio, cariño, alegría). Nada de personajes rígidos.
- Quién está en cuadro: en character_names solo los principals de ESA escena; en extra_names secundarios visibles. El sistema escribe una frase breve: "Only Luna and Milo participate in this scene." o "Only the dogs, cats and Luna participate in this scene."
- Time-lapse / varias acciones en una escena: NUNCA bullets. Cada beat es una frase física completa. El sistema inserta "CUT to" entre beats para que se lean como clips separados (día/noche, distinto set), no como una acción seguida de 2s. Ejemplo: "Young Milo falls asleep on a desk, tiny body on the papers. CUT to a stop-motion growth change showing him larger on the same desk. CUT to older Milo batting at a toy across the floor. CUT to movie night, older Milo curling up beside Luna on the couch."
- El video_prompt va 100% en inglés, salvo las comillas del diálogo si el guion está en otro idioma. Nombres cortos en inglés (Luna, Milo, the man). Nunca "Hombre de 40 años".
- Cada línea de diálogo una sola vez. No repeated lines. Cierra CADA SCENE con "[NO BGM]". Nunca soundtrack ni BGM. Si un producto adjunto sale en la escena, una sola frase dice cómo: puesto en el personaje, en la mano, primer vistazo y aún no puesto, cerca, o lejos.
- Super breve. Nada de "cinematic masterpiece". No repitas el párrafo de física/clones, oclusión, eyeline, escala ni props en cada SCENE; el sistema lo pone una sola vez al final y solo añade una frase concreta si esa escena lo pide.
- Ejemplo Pixar:
  Pixar style throughout the whole video. SCENE 1 (6s). Eye level, medium shot. Luna lipsyncs: "Si te suelto, ¿vas a volver?" Luna holds a red balloon over the sunset city. [NO BGM] CUT. SCENE 2 (4s). Tracking shot, full shot. The balloon rises through clotheslines as she runs to the railing. [NO BGM]
- Ejemplo claymation:
  Claymation style throughout the whole video. SCENE 1 (5s). Wide shot, eye level. Off-screen narrator voice-over, no lipsync: "Out on the water, something moved." A 40-year-old man walks along the beach, then suddenly notices a big dolphin far out in the sea. Narrator lines stay off-screen. Mouths stay closed. [NO BGM] CUT. SCENE 2 (4s). Close-up, low angle. The man's face becomes happy and amazed. The man lipsyncs: "Wow, that's amazing!" [NO BGM]

Herramientas:
- Usa extract_storyboard cuando entiendas el guion. En mentioned_refs solo listes logo/producto/locación si el texto del guion los involucra de verdad. En camera usa solo nombres en inglés y cambia de plano en cada escena. En summaries, write the blocking so space and size stay continuous from the previous scene. If A talks to B, A looks at B. Glow behind a body is occluded. Hands keep contact with doors and utensils. Show emotion in faces, eyes, ears, tails, and body. Show complete physical actions. Keep the attached product packaging (pouch vs bottle). Keep age/size locked until a later scene shows growth. List every on-screen principal in character_names and background animals/people in extra_names. Never write a time-lapse as a bullet list; write each beat as a full physical sentence so the system can insert CUT to. Never clone a character. Do not paste physics lectures into every summary.
- No uses stylize_reference. Nunca generes una imagen solo del producto ni un first frame de la escena.
- Usa plan_video_batches cuando el usuario ya aprobó las escenas. Si targetDurationSeconds es 30 o menos, exactamente UNA tanda con todas las escenas. Si es más de 30, empaqueta en clips de 4-30s.
- generate_video_batch anima UNA tanda con Seedance 2.5 reference-to-video. Respeta 4-30s. Cuando termine, el video YA está en el proyecto. No inventes URLs. No llames generate_batch_frame.

Nunca inventes URLs. Nunca digas que ya existe un video si la herramienta no lo creó. No uses markdown con asteriscos; escribe texto plano con saltos de línea. No hagas chat libre. No preguntes nada fuera del flujo.`;

const PLAN_PROMPT = `${SYSTEM_PROMPT}

Current task: PLAN ONLY.
Call extract_storyboard exactly once with every scene, dialogue, action (summary), camera direction, and estimated_seconds.
Mark is_extra true for unseen narrators/voice-over, crowd, b-roll, montage, and numbered extras. If the line is narrator voice-over, keep speaker as Narrator. Never move a Narrator line onto an on-screen character. At most 4 leads. Put background names in extra_names, not character_names. If an attached product appears in a scene, add one short sentence on how: worn on a character, held or used by them, first look and not yet worn, close-up, or far in the shot.
Every scene must list who is on screen. Write emotion and keep spatial continuity from the previous scene. Keep a character the same age and size until a later scene explicitly shows they grew. Clothes may change. Keep who is in front, behind, left, and right until the action moves them. Stay in the same place until the location changes. If they speak to someone, they look at that person. If they hold a door or utensil, write the grip. If glow is behind them, they occlude it. Never write time-lapse as bullets; write each beat as a full physical sentence. Do not paste physics lectures into every summary.
Make scene times add up to the project's targetDurationSeconds. Never add an empty or placeholder scene to fill leftover seconds; lengthen a real scene instead.
Put the hook spoken line in scene 1 so audio starts at 0s.
Then STOP. Do not plan batches. Do not generate frames or video. Do not ask questions.`;

const PRODUCE_PROMPT = `${SYSTEM_PROMPT}

Current task: PRODUCE.
The user already approved the storyboard. Do NOT rewrite or re-extract scenes.
If targetDurationSeconds is 30 or less, call plan_video_batches with EXACTLY one batch covering every scene at that duration (Seedance 2.5 one-shot). Otherwise pack whole scenes into 4-30s clips whose durations add up to targetDurationSeconds. Never repeat a scene across clips.
Then call generate_video_batch for each batch in order until all clips exist. Do not generate a first-frame still.
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
    description:
      "Guarda personajes y escenas extraídos del guion. Solo 1-4 leads (is_extra false): speakers and named story principals. Crowd, b-roll, montage, and numbered extras must be is_extra true.",
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
              description: {
                type: "string",
                description:
                  "Visual appearance of this character alone: species, colors, clothes. No plot, no other characters, no fight or scene.",
              },
              voice_notes: { type: "string" },
              is_extra: {
                type: "boolean",
                description:
                  "True for Narrator and unseen voice-over, crowd, b-roll, montage, numbered extras (Dog 2, Owner 3), and background pets/people. Narrator lines stay Narrator and are never lipsync. False only for story principals who need a look.",
              },
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
              summary: {
                type: "string",
                description:
                  "What happens, starting with the opening beat. Show complete physical actions and visible emotion (face, eyes, ears, tail, posture). Keep blocking continuous with the previous scene: if someone is trapped in a corner, they are still there until they move. If a character starts tiny/baby/young, keep that size here unless THIS scene is the explicit growth. Same scale versus chairs, tables, and doors. If A speaks to B, write that A looks at B, not the camera. If they grip a door or utensil, write the contact. If glow or lights sit behind someone, they occlude it. Clothes may change and it is still the same person, never a second body. Keep who is in front, behind, left, and right until this action moves them. If the location is the same as the previous scene, say so. If it changes, time has moved forward. If an attached product is in this scene, add one short sentence: worn on a named character, held or used by them, seen for the first time and not yet worn, a close-up, or far in the shot. Never show it worn in a first-look scene. Never write a time-lapse as a bullet list: write each montage beat as a full physical sentence. Do not append physics-rule lectures.",
              },
              location: { type: "string" },
              character_names: {
                type: "array",
                items: { type: "string" },
                description: "Only the scene's story principals who are on screen. The system will say Only NAME participate in this scene.",
              },
              extra_names: {
                type: "array",
                items: { type: "string" },
                description: "Background animals or people who appear, e.g. dogs, cats, basset hounds. The system will say Only the dogs, cats and NAME participate in this scene.",
              },
              dialogue: {
                type: "array",
                description: "Spoken lines. Scene 1 must include the opening hook so audio starts at 0s. Never repeat the same line twice.",
                items: {
                  type: "object",
                  additionalProperties: false,
                  properties: {
                    speaker: { type: "string", description: "On-screen speaker name for lipsync, or Narrator for voice-over. Narrator is never an on-screen character and is never lipsync. Never a Spanish label." },
                    line: { type: "string" },
                  },
                  required: ["speaker", "line"],
                },
              },
              estimated_seconds: {
                type: "number",
                description:
                  "Seconds this scene needs. Dialogue = time to say it calmly. Quiet/simple beats = 2-3s by complexity and intent. Do not create empty or leftover scenes to fill time.",
              },
              camera: {
                type: "string",
                description:
                  "English shot SIZE and ANGLE names only, different for each scene. Examples: eye level, medium shot; dutch angle, full shot; tracking shot, wide shot; insert; bird's eye. Over the shoulder or two-shot only if two different characters are on screen: shoulder of A, face of B. Never clone. Never Spanish names.",
              },
            },
            required: [
              "index",
              "title",
              "summary",
              "location",
              "character_names",
              "extra_names",
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
                  "English only. Starts with Pixar/Claymation style throughout the whole video. Then SCENE 1 (Xs). English camera. Brief Only X participate line. Action with names later injected as @Image. CUT between scenes. Several actions in one scene use CUT to between beats, not a physics lecture after every scene. Physics and no-clone once at the end. Dialogue once. No first frame. No soundtrack.",
              },
              frame_prompt: {
                type: "string",
                description: "Unused. Leave empty. No first-frame still is generated.",
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
    description: "Deprecated. Do not call. Character looks are enough; video starts from scene action.",
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
      : ["plan_video_batches", "generate_video_batch"];
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
      await saveProject(project);
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
          isExtra: Boolean(item.is_extra) || isUnseenVoice({ name, description: String(item.description || ""), voiceNotes: String(item.voice_notes || "") }),
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
          extraNames: ((item.extra_names as string[]) || []).map((name) => englishExtraName(name)),
          dialogue,
          estimatedSeconds: Math.max(2, raw > 0 ? raw : computed),
          camera: String(item.camera || ""),
        };
      }) as Scene[];
      const withStory = project.scenes.filter(sceneHasStory);
      if (withStory.length) {
        project.scenes = withStory.map((scene, index) => ({ ...scene, index: index + 1 }));
      }
      refineStoryLeads(project);
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
      stampProductPlacement(project);
      project.workflowStep = "review";
      await saveProject(project);
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
      await saveProject(project);
      return { slots: project.references };
    }
    case "update_reference_usage": {
      if (args.skip_all) {
        project.skippedRefs = true;
        await saveProject(project);
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
      await saveProject(project);
      return { asset, attached: promptReadyReferences(project).map((item) => item.label) };
    }
    case "update_character_look": {
      const nameArg = String(args.name);
      const character = project.characters.find((item) => item.name.toLowerCase() === nameArg.toLowerCase());
      if (!character) return { error: `No existe ${nameArg}` };
      if (args.description) character.description = String(args.description);
      if (args.voice_notes) character.voiceNotes = String(args.voice_notes);
      if (typeof args.look_confirmed === "boolean") character.lookConfirmed = args.look_confirmed;
      await saveProject(project);
      return { character };
    }
    case "plan_video_batches": {
      project.durationPending = false;
      planSeedanceBatches(project);
      await saveProject(project);
      return {
        batches: project.batches.map((batch) => ({ index: batch.index, duration: batch.duration, scenes: batch.sceneIndexes })),
        prompts: project.batches.map((batch) => batch.videoPrompt),
      };
    }
    case "generate_batch_frame": {
      return { skipped: true, reason: "No first-frame still. Character looks are enough." };
    }
    case "generate_video_batch": {
      project.workflowStep = "produce";
      const existing = project.batches.find((item) => item.index === Number(args.batch_index));
      if (existing?.videoPublicPath || existing?.videoRemoteUrl) {
        existing.status = "done";
        await saveProject(project);
        return {
          index: existing.index,
          duration: existing.duration,
          file: existing.videoFileName,
          path: existing.videoPublicPath || existing.videoRemoteUrl,
          delivered: true,
          reused: true,
        };
      }
      const result = await generateBatchVideo(project, Number(args.batch_index), onStatus, args.duration);
      const deliveredSrc = result.batch.videoPublicPath || result.batch.videoRemoteUrl;
      if (deliveredSrc) {
        project.messages.push({
          id: createId("msg"),
          role: "assistant",
          content: `The video is ready (${result.batch.duration}s).`,
          createdAt: new Date().toISOString(),
          attachments: [
            {
              kind: "video",
              src: deliveredSrc,
              poster: result.batch.framePublicPath,
              label: project.title || "Video",
            },
          ],
        });
        await saveProject(project);
      }
      return {
        index: result.batch.index,
        duration: result.batch.duration,
        file: result.batch.videoFileName,
        path: deliveredSrc,
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
  await saveProject(options.project);

  if (mode === "produce") {
    const onStatus = (text: string) => options.onEvent({ type: "status", text });
    await startProduce(options.project);
    const driven = await driveProduce(options.project.id, 240_000, { onStatus });
    options.onEvent({ type: "project", project: driven || options.project });
    return;
  }

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
    await saveProject(options.project);
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
  await saveProject(options.project);
  options.onEvent({ type: "project", project: options.project });
}

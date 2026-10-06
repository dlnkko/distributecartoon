import OpenAI from "openai";
import { getSecrets, TEXT_MODEL } from "./config";
import { clampTotalDuration, createId, slugify, normalizeAspectRatio } from "./ids";
import { generateBatchVideo, planSeedanceBatches, startProduce, summarizeLibrary } from "./pipeline";
import { driveProduce } from "./produce";
import { applyScriptLooks, castBrief } from "./cast-roster";
import { diversifyInventedCast, englishExtraName, englishSpeakerName, packedScenePrompt, stampProductPlacement } from "./style";
import { balancePartSceneSeconds, estimateDialogueSeconds, estimateSceneSeconds, packScenesIntoParts, parseDurationFromText, sceneHasStory, sceneSpeechFloor, seedancePartDurations, shouldGenerateOneShot } from "./timing";
import { ensureSceneShots } from "./shots";
import { ensureReferenceSlots, isUnseenVoice, promptReadyReferences, refineStoryLeads, syncReferenceInclusion } from "./refs";
import { saveProject } from "./store";
import { isAbortError, throwIfAborted } from "./abort";
import { isVisualStyle, type AgentMode, type Batch, type Character, type Project, type Scene, type ScriptRefCue, type SpeechMode } from "./types";

const SYSTEM_PROMPT = `You are the director-agent of distribute.to, a studio that turns scripts into Pixar, claymation, or realistic live-action shorts.

Language: always reply in English, clear and concrete.

Pipeline real:
1. PRIMERO el guion. No pidas imágenes ni generes video si aún no hay script.
2. Extraer escenas, diálogos, locaciones y personajes.
3. El sistema genera un retrato INDIVIDUAL por lead (una sola pose, de frente a la cámara, fondo gris claro, ese personaje solo). En realistic es la misma pose, fotoreal, y ese retrato es la referencia del video. Nunca un two-shot ni una escena de pelea. Si hay foto de Setup y el estilo es pixar o claymation, el look es SOLO convertir esa foto a ese estilo; nunca inventes pelo, piel, ropa ni especie. Si el estilo es realistic y hay foto, el retrato conserva a esa misma persona fotoreal, de frente, fondo gris. No la conviertas a Pixar, a claymation, ni a 3D. Si NO hay foto y el personaje es una mujer humana, invéntala distinta en cada corto: otro nombre corto en inglés, otra cara, otra edad, otro pelo y otro tono de piel, al azar. Nunca la llames Maya. Nunca uses dark skin como piel por defecto. La description del personaje es SOLO apariencia (especie, color, ropa) cuando NO hay foto, sin plot ni otros personajes. El usuario lo aprueba o pide un cambio, una sola vez, ANTES de animar. No confirmes looks tú. Cast ONLY on-screen story principals (usually 1-4). Never cast a look for a Narrator or unseen voice-over. If the script is narrator VO and does not name whose voice, keep speaker as Narrator (is_extra true); the system picks any fitting off-screen voice. If an on-screen character has dialogue, that is their realistic lipsync. A speaker named Narrator is always off-screen voice-over. Never give those lines to an on-screen character and never lipsync them. Crowd, montage, b-roll, numbered extras are is_extra true — no look.
4. NO first-frame still. Only character look portraits are generated. Seedance 2.5 R2V receives those portraits plus product/logo/location photos when the script uses them. The system maps files to @Image1, @Image2, @Image3 in upload order and writes those tags INSIDE the scenes when that person or object is on screen. Do not dump "@Image2 is Guy. Match his design..." at the start of the prompt.
5. Cada escena es UN plano y UNA acción. El plano cambia en cada escena: wide, close-up, insert, low angle, high angle, tracking, dutch. Nunca repitas el mismo encuadre dos veces seguidas. Una conversación en el mismo lugar no tiene que caber en una sola escena: parte el diálogo en dos, la primera mitad en una escena y la otra mitad en la siguiente, con otro ángulo o movimiento de cámara. Unas dos líneas por escena, tres como máximo. La duración es lo que tardan en decirse esas líneas, sin silencio después de la última palabra y sin acelerarlas para que quepan. Un plano sin diálogo sigue en 2 o 3 segundos. Dentro de un plano, nadie se queda callado ni mirándose sin que pase nada por más de 2 o 3 segundos. Si el beat no alcanza, añade una línea corta que siga la historia, en la voz de quien está en cuadro. Si el usuario ya numeró las escenas, respeta esos cortes, el orden y los segundos que escribió. No te saltes una escena, un montage ni una end card. Si en ese tiempo sobran líneas, quita las del medio y deja la primera y la última. Si faltan y la imagen se quedaría quieta, añade una línea corta.
6. El total del video está en targetDurationSeconds y solo puede ser 15, 30, 45, 60, 75, 90, 100 o 120. Cada escena dura lo que su acción y su movimiento de cámara necesiten. Si el total pasa de 30 segundos, agrupa esas escenas en partes: 45 es 30+15, 60 es 30+30, 75 es 30+30+15, 90 es 30+30+30, 100 es 30+30+30+10, 120 es cuatro partes de 30. Las escenas de una parte suman como máximo 30 segundos. No cambies la duración de una escena para llenar la parte. No cortes una escena entre dos partes de generación. Seedance 2.5 genera hasta 30s por clip, siempre a 480p.
7. Si el guion pasa de 30s, cada generación dura 30s. 60s son dos generaciones. 90s son tres. El total debe cubrir el habla sin parecer apurado. Si el usuario pide un total más corto que el habla, no comprimas el diálogo por debajo de lo que tarda en decirse.
8. El aspect ratio del proyecto (16:9 o 9:16) ya lo aplica el sistema. No lo cambies salvo que el usuario lo pida.
9. Animar con Seedance 2.5 Reference-to-Video. Menciona @ImageN / @VideoN en la escena en la que aparecen, no en un preámbulo.
10. El sistema tagea internamente cada clip por las voces de los leads que hablan ahí. En la siguiente tanda sube COMO MÁXIMO un @Video1: el clip anterior donde estén las voces de los personajes que participan en esa tanda. No adjunta varios videos ni clips de gente que no habla en la escena nueva.

Logo, product, and location:
- Do NOT generate a standalone product/logo/location still when a photo is uploaded. No packshot, no product-only restyle.
- Do NOT put them in prompts just because a slot or photo exists.
- Only if the SCRIPT mentions that product, logo, or location, and a photo is attached, mention that @Image tag in the SCENE where it appears.
- Keep the EXACT packaging form of the attached product photo: a stand-up pouch stays a pouch, a sachet stays a sachet, a bottle stays a bottle. Never turn a pouch into a bottle, jar, or tub. Same silhouette, closure, label layout, colors, and branding. In pixar or claymation, draw it in that style and do not paste the photo photoreal as-is. In realistic, keep the photo photoreal.
- Never invent a logo on set. Do not wait for photos.

Reglas de prompt Seedance 2.5 (obligatorias):
- El video_prompt EMPIEZA EXACTAMENTE así, según el estilo del proyecto: "Pixar style throughout the whole video." o "Claymation style throughout the whole video." o "Realistic live-action throughout the whole video. Real people, real places, real materials, and real light. Not a cartoon, not 3D animation, and not clay." Luego SCENE 1. Nada de first frame. Nada de listar todos los @Image al inicio. Si el estilo es realistic, lugares, personas, props y escenas son fotoreal. No escribas cartoon, Pixar, clay ni 3D en esas descripciones.
- Dentro de cada escena, nombra @ImageN cuando ese personaje, producto, logo o locación entra o se usa. Ejemplo: SCENE 1. Eye level, medium shot. @Image1 appears in the gym drinking creatine. CUT. SCENE 2. Dutch angle, full shot. After @Image1 stops drinking, his friend @Image2 appears with @Image3 which is the creatine gummies product.
- El sistema inyecta los números @ImageN. En video_prompt usa los nombres de personaje/producto; el sistema los sustituye.
- Cada cambio de escena: SCENE 1 (5s). [English camera names only]. action. The man says: "line". CUT. SCENE 2 (4s). ...
- Respeta estimated_seconds: SCENE N (Xs).
- El diálogo o voiceover EMPIEZA en el segundo 0. SCENE 1 abre con la primera línea hablada, sin intro muda.
- Voz, una sola vez en el cierre (el sistema lo escribe): diálogo on-screen = lipsync con la voz realista de ESE personaje. Si el speaker es Narrator, es voz en off: nadie mueve la boca y ningún personaje la dice. Nunca pases una línea de Narrator a un personaje en cuadro. No repitas esta regla dentro de cada SCENE.
- Dentro de cada escena, nombra el producto/logo/locación con @ImageN cuando aparece en ESA escena, igual que los personajes. Nunca lo dejes solo al final del prompt.
- Cámara: varía el plano y el ángulo en CADA escena. Usa SOLO nombres en inglés: extreme wide shot, wide shot, full shot, medium full shot, medium shot, medium close-up, close-up, extreme close-up, insert, two-shot, over the shoulder, POV, eye level, low angle, high angle, bird's eye, worm's eye, dutch angle, pan, tilt, dolly, tracking shot, steadicam, crane, zoom, handheld, dolly zoom. Nunca nombres en español.
- Planos: nunca inventes un segundo cuerpo del mismo personaje. En realistic, cada persona sale una sola vez en el plano: nunca en primer plano y otra vez en la puerta o al fondo. Over-the-shoulder = hombro de A, cara de B, A ≠ B. Si solo hay un personaje en cuadro, no uses OTS ni two-shot. Estas reglas van en el cierre del prompt UNA vez, no repetidas en cada escena. OTS sí puede llevar su línea de cámara solo en ESA escena.
- Acción visible: si alguien come o usa un producto, muestra la acción completa (mano, pack, boca). Nunca cortes al objeto ya dentro de la boca.
- Física y continuidad: escríbelas EN LA ACCIÓN, no como un párrafo de reglas en cada escena. Gravedad, sólidos que no se atraviesan, puertas que se abren por aire vacío. Si alguien está acorralado en un rincón, la siguiente escena sigue en ese rincón. Edad/tamaño igual: tiny se queda tiny hasta el beat que crece; misma escala vs silla, mesa y puerta entre cortes. Si A le habla a B, A mira a B, no al lente, salvo cuarta pared. Si alguien persigue, avanza hacia esa posición. Si hay glow, luces u ojos brillantes detrás, el cuerpo de enfrente los tapa: nada de brillo a través del pelo o la piel. Si agarra una puerta o cubiertos, los dedos tocan el objeto; no flota. La ropa puede cambiar: sigue siendo la misma persona, no un segundo cuerpo. Conserva quién está adelante, atrás, a la izquierda y a la derecha hasta que la acción los mueva. El tiempo avanza. El lugar no cambia hasta que la escena cambie de locación. En 16:9 el cuadro ancho es un solo espacio: no uses el ancho para duplicar a nadie ni para invertir el layout. El sistema puede añadir una frase corta solo cuando esa escena lo necesita; no copies esas reglas en cada SCENE.
- Actuación: caras, ojos, orejas, colas y cuerpo muestran emoción (miedo, alivio, cariño, alegría). Nada de personajes rígidos.
- Quién está en cuadro: en character_names solo los principals de ESA escena; en extra_names secundarios visibles. El sistema escribe una frase breve: "Only Luna and Milo participate in this scene." o "Only the dogs, cats and Luna participate in this scene."
- Time-lapse / varias acciones: NUNCA bullets y NUNCA varios beats dentro de una sola escena. Cada beat es su propia escena, con su propia cámara y sus propios segundos. Un montage de tres lugares son tres escenas. No escribas "CUT to" dentro del summary.
- El video_prompt va 100% en inglés, salvo las comillas del diálogo si el guion está en otro idioma. Nombres cortos en inglés (Luna, Milo, the man). Nunca "Hombre de 40 años".
- Cada línea de diálogo una sola vez. No repeated lines. Cierra CADA SCENE con "[NO BGM]". Nunca soundtrack ni BGM. Si un producto adjunto sale en la escena, una sola frase dice cómo: puesto en el personaje, en la mano, primer vistazo y aún no puesto, cerca, o lejos.
- Super breve. Nada de "cinematic masterpiece". No repitas el párrafo de física/clones, oclusión, eyeline, escala ni props en cada SCENE; el sistema lo pone una sola vez al final y solo añade una frase concreta si esa escena lo pide.
- Ejemplo Pixar:
  Pixar style throughout the whole video. SCENE 1 (6s). Eye level, medium shot. Luna lipsyncs: "Si te suelto, ¿vas a volver?" Luna holds a red balloon over the sunset city. [NO BGM] CUT. SCENE 2 (4s). Tracking shot, full shot. The balloon rises through clotheslines as she runs to the railing. [NO BGM]
- Ejemplo claymation:
  Claymation style throughout the whole video. SCENE 1 (5s). Wide shot, eye level. Off-screen narrator voice-over, no lipsync: "Out on the water, something moved." A 40-year-old man walks along the beach, then suddenly notices a big dolphin far out in the sea. Narrator lines stay off-screen. Mouths stay closed. [NO BGM] CUT. SCENE 2 (4s). Close-up, low angle. The man's face becomes happy and amazed. The man lipsyncs: "Wow, that's amazing!" [NO BGM]
- Ejemplo realistic:
  Realistic live-action throughout the whole video. Real people, real places, real materials, and real light. Not a cartoon, not 3D animation, and not clay. SCENE 1 (5s). Wide shot, eye level. A 40-year-old man walks along a real beach and notices a dolphin far out in the sea. [NO BGM] CUT. SCENE 2 (4s). Close-up, low angle. The man's face becomes happy and amazed. The man lipsyncs: "Wow, that's amazing!" [NO BGM]

Storyboard continuity:
- The storyboard is one continuous animated film. Same story in Spanish or English keeps the same causal order and the same space. Do not merge, skip, or reorder a cause.
- Each scene starts where the previous one ended: same place, same distance between bodies, same screen sides, same body state. A new scene is the next moment, not a new staging.
- Who can see whom is blocking. If A sees B and B does not see A, that beat states the distance, who is in frame, and the eyelines. The next beat starts from that exact distance.
- A new place, a new time, or a montage beat is a new scene. Do not write "CUT to" inside one summary. A location changes only when that scene shows the travel.
- Time moves forward. Nothing happens before its cause.
- Be cinematic: wide when distance matters, closer when emotion or a small action matters, a new angle when the story turns. Vary size and angle, and do not repeat the same shot size on consecutive scenes. Every new angle continues the same blocking. Never a second body, a second location, or an extra character.
- Write each summary as physical blocking: where each body is, how far, who looks at whom, what the body does next, and the emotion in face and posture. A character talking to himself is on screen and the line is his, not the narrator. Narrator stays off-screen on the beat it belongs to. No bullet lists and no physics lectures.

Herramientas:
- Usa extract_storyboard cuando entiendas el guion. En mentioned_refs solo listes logo/producto/locación si el texto del guion los involucra de verdad. En camera usa solo nombres en inglés y cambia tamaño o ángulo cuando cambia la emoción o la distancia, nunca el mismo tamaño en dos escenas seguidas. En summaries, write the blocking so the next scene continues the previous ending: place, distance, screen sides, and body state. If A sees B while B does not see A, write that distance and those eyelines. If A talks to B, A looks at B. Glow behind a body is occluded. Hands keep contact with doors and utensils. Show emotion in faces, eyes, ears, tails, and body. Show complete physical actions. Keep the attached product packaging (pouch vs bottle). Keep age/size locked until a later scene shows growth. List every on-screen principal in character_names and background animals/people in extra_names. Never write a time-lapse as a bullet list; write each beat as a full physical sentence so the system can insert CUT to. A CUT to only changes the angle. Never clone a character. Do not paste physics lectures into every summary.
- No uses stylize_reference. Nunca generes una imagen solo del producto ni un first frame de la escena.
- Usa plan_video_batches cuando el usuario ya aprobó las escenas. Si targetDurationSeconds es 30 o menos, exactamente UNA tanda con todas las escenas. Si es 60, dos tandas de 30s. Si es 90, tres tandas de 30s.
- generate_video_batch anima UNA tanda con Seedance 2.5 reference-to-video. Respeta 4-30s. Cuando termine, el video YA está en el proyecto. No inventes URLs. No llames generate_batch_frame.

Nunca inventes URLs. Nunca digas que ya existe un video si la herramienta no lo creó. No uses markdown con asteriscos; escribe texto plano con saltos de línea. No hagas chat libre. No preguntes nada fuera del flujo.`;

const PLAN_PROMPT = `${SYSTEM_PROMPT}

Current task: PLAN ONLY.
Call extract_storyboard exactly once with every scene, dialogue, action (summary), camera direction, and estimated_seconds.
Build one continuous film. Keep every cause in the order the user told it. Scene 1 opens on the first beat. Each later scene begins at the exact place, distance, screen sides, and body state where the previous scene ended. If one character sees the other and is not seen back, keep that as its own beat with the distance and the eyelines, and start the next beat from there. Do not skip the approach, the run, the collapse, or the carry. Change location only when the scene shows the travel.
Each character keeps the same height, build, face, and features in every shot. Change size or body only when the user's story explicitly says that change happens in that shot. Clothes may change; the person does not.
A human woman with no uploaded photo is a new person every film. Pick her name, face, age, hair, and skin tone at random. Do not name her Maya. Do not default to dark skin. Fair, olive, tan, light brown, warm brown, and deep brown are all available, and the choice changes from film to film.
A supporting character introduced once is that same person for the whole film. If the hero returns with his friends, those are the friends already introduced, with the same names, not new people. Never let a character's reference number later mean a place.
Each spoken line belongs to exactly one speaker. A character speaks only their own lines. Never copy a line onto another character, and never let two characters say the same sentence.
Objects work the way they do in the world. Plates slide onto a barbell sleeve and the collar locks them. A treadmill belt moves under the feet while the runner stays on the deck. Do not invent a mechanism.
Shots are a linear continuation. A cut from day to night, or a flashback, is allowed only when the story needs it, and that shot must say the time changed or that this is a flashback. Otherwise the next shot is the next moment.
One scene is one clear action and one camera. A character may speak and move in that same shot, for example leaning in while talking. The next action or the next angle is the next scene. Sitting and looking at his hands is one scene. Walking into the next room is another scene. The mirror is another scene. Do not glue those into one 9, 10, or 11 second paragraph. If a journey crosses several places, make one scene per place. Change the shot on every scene and never repeat the same framing twice in a row. Use the list: extreme wide, wide, full, medium, medium close-up, close-up, extreme close-up, insert, low angle, high angle, dutch, tracking, dolly, handheld. Most shots are 2 or 3 seconds, including a camera move. A shot with no line, or a short line, is 2 or 3. Go past 3 only when the spoken line does not fit. A conversation in one place is split across scenes: about two lines in one scene, the rest in the next, with a different angle or camera move. Three lines is the maximum in one scene. Time that scene to those lines only. Do not hold after the last word, and do not speed the lines up. A pause or a character alone stays at 2 or 3 seconds and still has a physical action, not a frozen look. Do not leave anyone quiet, only looking, for more than 2 or 3 seconds. If a beat would play that way, add a short line in that person's voice so the story keeps moving. Do not write 6, 7, or 8 second shots as the normal length, and do not merge shots to make a long scene. Say which way a screen or object faces the camera, for example the monitor screen faces the character and the back of the monitor faces the lens. Before any gaze, state where the camera is relative to the look target, for example camera positioned behind @Image1, shooting down the hallway toward the doorway. Do not give a face direction and a gaze target that compete; say which one wins. If they look at something other than the lens, write eyes NOT on camera, gaze locked on that target. On an emotional close-up add: gaze must not be directed at lens unless explicitly stated. Give each speaking character a distinct voice in voice_notes. A principal who never speaks is still a lead, not an extra, so they get one consistent portrait.
Mark is_extra true for unseen narrators/voice-over, crowd, b-roll, montage, and numbered extras. If the line is narrator voice-over, keep speaker as Narrator. Never move a Narrator line onto an on-screen character. A character talking to himself stays on screen and keeps the line. At most 4 leads. Put background names in extra_names, not character_names. If an attached product appears in a scene, add one short sentence on how: worn on a character, held or used by them, first look and not yet worn, close-up, or far in the shot.
Every scene must list who is on screen. Write emotion in the face and the body. Keep a character the same age and size until a later scene explicitly shows they grew. Clothes may change. Keep who is in front, behind, left, and right until the action moves them. If they speak to someone, they look at that person. If they hold a door or utensil, write the grip. If glow is behind them, they occlude it. Never write time-lapse as bullets; write each beat as a full physical sentence. Do not paste physics lectures into every summary.
Cut on every new action and every new angle, and give that scene its own camera. Vary wide, close, insert, low, high, and a move. Do not repeat tracking shot. Most scenes are 2 or 3 seconds. A camera move is still usually 2 or 3. Use more than 3 only when the spoken line does not fit. A long exchange stays in the same place and is split: half the lines, then the other half in the next scene with a new angle. Each half lasts as long as those lines take. A silent beat stays at 2 or 3 seconds, with a hand or a step, never a frozen look. If the story needs longer, add a line. Do not default to 6, 7, or 8. If the film is longer than 30 seconds, group those scenes into parts: 45 is 30+15, 60 is 30+30, 75 is 30+30+15, 90 is 30+30+30, 100 is 30+30+30+10, 120 is four parts of 30. The scenes inside one part add up to at most 30 seconds. A part can end early. Do not split a scene across parts. Do not change a scene's length to fill its part. A later part may open in a new place. Carry the clothes, anything being held, and any body change from the last scene of the previous part, unless this scene changes them. Write enough scenes that every part has at least one. Vary the shot size and give each scene one camera move.
Put the hook spoken line in scene 1 so audio starts at 0s.
Then STOP. Do not plan batches. Do not generate frames or video. Do not ask questions.`;

const PRODUCE_PROMPT = `${SYSTEM_PROMPT}

Current task: PRODUCE.
The user already approved the storyboard. Do NOT rewrite or re-extract scenes.
If targetDurationSeconds is 30 or less, call plan_video_batches with EXACTLY one batch covering every scene at that duration (Seedance 2.5 one-shot). If it is 60s, two batches of 30s. If it is 90s, three batches of 30s. Longer films use one 30s generation per 30 seconds. Never repeat a scene across clips.
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
        style: { type: "string", enum: ["pixar", "claymation", "realistic"] },
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
              name: { type: "string", description: "Short English name. A woman with no photo gets a new random name every film, never Maya. Never a Spanish description like Hombre de 40 años." },
              description: {
                type: "string",
                description:
                  "Visual appearance of this character alone: species, colors, clothes. For a woman with no photo, pick a skin tone at random and do not default to dark skin. No plot, no other characters, no fight or scene. With a Setup photo, only what the photo shows.",
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
                  "What happens, as the next moment of one continuous film. Start from the previous scene's ending: same place, same distance, same screen sides, same body state, unless this action moves them. If A sees B and B does not see A, write the distance, who is in frame, and the eyelines. Show complete physical actions and visible emotion (face, eyes, ears, tail, posture). If a character starts tiny/baby/young, keep that size here unless THIS scene is the explicit growth. Same scale versus chairs, tables, and doors. If A speaks to B, write that A looks at B, not the camera. A character talking to himself is on screen. If they grip a door, a body, or a utensil, write the contact. If glow or lights sit behind someone, they occlude it. Clothes may change and it is still the same person, never a second body. Keep who is in front, behind, left, and right until this action moves them. If the location is the same as the previous scene, say so. Change location only by showing the travel. CUT to only changes the camera angle on this same action; it does not skip a cause. If an attached product is in this scene, add one short sentence: worn on a named character, held or used by them, seen for the first time and not yet worn, a close-up, or far in the shot. Never show it worn in a first-look scene. Never write a time-lapse as a bullet list: write each montage beat as a full physical sentence. Do not append physics-rule lectures.",
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
                description: "Spoken lines in this scene. About two lines. Three is the maximum. A longer exchange continues in the next scene, same place, new camera. Empty when the beat is a silence, a pause, or someone alone. Scene 1 must include the opening hook so audio starts at 0s. Never repeat the same line twice.",
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
                  "Seconds to say only the lines in this scene, at a natural pace. No extra silence after the last word, and no shorter than the lines take. A scene with no line stays at 2 or 3. Do not use 6, 7, or 8 as the normal length.",
              },
              camera: {
                type: "string",
                description:
                  "This scene's only camera, in English. Different shot size or angle from the previous scene. Never the same framing twice in a row.",
              },
              shots: {
                type: "array",
                description:
                  "Leave this empty. A new angle is a new scene, not a hidden shot inside this one.",
                items: {
                  type: "object",
                  additionalProperties: false,
                  properties: {
                    seconds: { type: "number", description: "2 or 3 seconds. More only if the spoken line does not fit in 3." },
                    camera: {
                      type: "string",
                      description:
                        "English shot size and angle, different from the previous shot. Wide when distance matters, closer when emotion matters.",
                    },
                    action: {
                      type: "string",
                      description:
                        "One physical action at this angle. Same place, distance, and body as the previous shot unless this action moves them.",
                    },
                  },
                  required: ["seconds", "camera", "action"],
                },
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
      "Parte las escenas en tandas Seedance 2.5. Si el corto dura 30s o menos, exactamente una tanda. Si dura 60s, dos tandas de 30s. Si dura 90s, tres tandas de 30s.",
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
                  "English only. Starts with Pixar/Claymation style throughout the whole video. Then SCENE 1 (Xs). English camera. Brief Only X participate line. Action with names later injected as @Image. CUT between scenes. One action per scene. Do not put CUT to inside a scene. Physics and no-clone once at the end. Dialogue once. No first frame. No soundtrack.",
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
    speechMode: project.speechMode || null,
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

function scriptIsStoryboard(script: string) {
  return /(?:^|\n)\s*(?:scene|escena)\s*\d+\b/i.test(script) || /(?:^|\n)\s*\d+\s*[.)]\s+\S/.test(script);
}

type StoryBlock = { label: string; text: string; seconds?: number; headingSeconds?: number };

function clockSeconds(token: string) {
  const match = token.trim().match(/^(\d{1,2}):(\d{2})$/);
  if (!match) return undefined;
  return Number(match[1]) * 60 + Number(match[2]);
}

function lineSeconds(line: string) {
  const range = line.match(/(\d{1,2}:\d{2})\s*(?:to|–|—|-|a)\s*(\d{1,2}:\d{2})/i);
  if (range) {
    const start = clockSeconds(range[1]);
    const end = clockSeconds(range[2]);
    if (start != null && end != null && end > start && end - start <= 120) return end - start;
  }
  const secs = line.match(/\b(\d+(?:\.\d+)?)\s*(?:s|sec|secs|seconds)\b/i);
  if (!secs) return undefined;
  const value = Math.round(Number(secs[1]));
  return value >= 2 && value <= 30 ? value : undefined;
}

function cleanSpokenLine(line: string) {
  return line
    .replace(/\([^)]*\)/g, " ")
    .replace(/^["']+|["']+$/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function actionText(block: StoryBlock) {
  return block.text
    .split(/\n/)
    .map((line) => line.trim())
    .filter((line) => {
      if (!line) return false;
      const match = line.match(/^([^:]{2,48}):\s+\S/);
      if (!match) return true;
      const speaker = match[1].replace(/\([^)]*\)/g, "").trim();
      return /^(text|title|super|caption)$/i.test(speaker);
    })
    .join(" ")
    .replace(/\s*\(\s*\d{1,3}\s*\)/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function linesFromBlock(text: string) {
  const out: Array<{ speaker: string; line: string; voiceover?: boolean }> = [];
  for (const raw of text.split(/\n/)) {
    const namedVoice = raw.trim().match(/^(?:vo|v\.o\.|voice-?over)\s*\(([^)]+)\)\s*:\s*(.+)$/i);
    if (namedVoice) {
      const line = cleanSpokenLine(namedVoice[2]);
      const speaker = englishSpeakerName(namedVoice[1].trim());
      if (line && speaker) out.push({ speaker, line, voiceover: true });
      continue;
    }
    const match = raw.trim().match(/^([^:]{2,48}):\s*(.+)$/);
    if (!match) continue;
    const speaker = match[1].replace(/\([^)]*\)/g, "").trim();
    if (!speaker || /^(scene|escena|act|acto|int|ext|end|text|title|super|caption)$/i.test(speaker)) continue;
    const line = cleanSpokenLine(match[2]);
    if (!line) continue;
    const voiceover = /^(?:vo|v\.o\.|voice-?over|voiceover)$/i.test(speaker);
    out.push({
      speaker: voiceover ? "Narrator" : englishSpeakerName(speaker),
      line,
      ...(voiceover ? { voiceover: true } : {}),
    });
  }
  return out;
}

function isCardLabel(label: string) {
  return /^\s*(?:end\s*card|tarjeta\s+final)\b/i.test(label);
}

function placeNamedIn(text: string) {
  const marked = text.match(/\b(?:INT|EXT)\.?\s+([^.\n]+)/i)?.[1]?.trim().replace(/[.\s]+$/, "");
  if (marked) return marked;
  const room = text.match(/\b(?:in|into|inside)\s+(?:the\s+)?([a-z][^.,]{2,42})/i)?.[1]?.trim();
  if (!room || /^(?:front|order|fact|time|place|silence|hand|hands|pocket|mouth|air|frame|shot)\b/i.test(room)) return "";
  return room.replace(/\s+(?:before|while|as|and)$/i, "").trim();
}

function namesMentioned(project: Project, text: string) {
  return project.characters
    .filter((character) => character.name.trim() && new RegExp(`\\b${character.name.trim().replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, "i").test(text))
    .map((character) => character.name);
}

function storyboardBlocks(script: string): StoryBlock[] {
  const heading = /^\s*(?:(?:scene|escena)\s*\d+\b|end\s*card\b|tarjeta\s+final\b)/i;
  const act = /^\s*(?:act|acto)\s*\d+\b/i;
  const blocks: StoryBlock[] = [];
  let current: StoryBlock | undefined;
  let actSeconds: number | undefined;
  let actScenes: StoryBlock[] = [];
  const closeAct = () => {
    if (actSeconds && actScenes.length) {
      const open = actScenes.filter((scene) => scene.seconds == null);
      const claimed = actScenes.reduce((sum, scene) => sum + (scene.seconds || 0), 0);
      const budget = Math.max(0, actSeconds - claimed);
      if (open.length && budget >= 2) {
        const weights = open.map((scene) => Math.max(8, actionText(scene).split(/\s+/).filter(Boolean).length));
        const weightSum = weights.reduce((sum, value) => sum + value, 0);
        let used = 0;
        open.forEach((scene, index) => {
          const share = index === open.length - 1 ? budget - used : Math.round((budget * weights[index]) / weightSum);
          scene.seconds = Math.min(30, Math.max(2, share));
          used += scene.seconds;
        });
      }
    }
    actScenes = [];
    actSeconds = undefined;
  };
  for (const line of script.split(/\n/)) {
    const trimmed = line.trim();
    if (act.test(trimmed)) {
      if (current) blocks.push(current);
      current = undefined;
      closeAct();
      actSeconds = lineSeconds(trimmed);
      continue;
    }
    if (heading.test(trimmed)) {
      if (current) blocks.push(current);
      current = { label: trimmed, text: "", seconds: lineSeconds(trimmed), headingSeconds: lineSeconds(trimmed) };
      actScenes.push(current);
      continue;
    }
    if (current) current.text += `${current.text ? "\n" : ""}${line}`;
  }
  if (current) blocks.push(current);
  closeAct();
  return blocks;
}

function wordSet(text: string) {
  return new Set(text.toLowerCase().split(/[^a-z0-9']+/).filter((word) => word.length > 3));
}

function overlapScore(summary: string, action: string) {
  const need = [...wordSet(action)];
  if (!need.length) return 0;
  const has = wordSet(summary);
  return need.filter((word) => has.has(word)).length / need.length;
}

function fitLinesToSeconds(scene: Scene) {
  const budget = scene.estimatedSeconds;
  if (!budget) return;
  const next = (scene.dialogue || []).filter((line) => line.line?.trim());
  if (next.length < 2) return;
  let talk = next.reduce((sum, line) => sum + estimateDialogueSeconds(line.line), 0);
  while (next.length > 2 && talk > budget + 0.8) {
    let drop = 1;
    let shortest = Infinity;
    for (let index = 1; index < next.length - 1; index += 1) {
      const weight = estimateDialogueSeconds(next[index].line);
      if (weight < shortest) {
        shortest = weight;
        drop = index;
      }
    }
    talk -= estimateDialogueSeconds(next[drop].line);
    next.splice(drop, 1);
  }
  if (next.length === 2 && talk > budget + 0.8 && estimateDialogueSeconds(next[0].line) <= budget + 0.8) next.pop();
  scene.dialogue = next;
}

function sceneFromBlock(block: StoryBlock): Scene {
  const action = actionText(block);
  const dialogue = linesFromBlock(block.text);
  const place = `${block.label} ${block.text}`.match(/\b(?:INT|EXT)\.?\s+([^.\n]+)/i)?.[1]?.trim() || "";
  const card = isCardLabel(block.label);
  const seconds = Math.min(30, Math.max(2, block.headingSeconds || estimateSceneSeconds({ summary: action, dialogue: card ? [] : dialogue })));
  return {
    id: createId("scene"),
    index: 0,
    title: block.label.replace(/\s*\([^)]*\)\s*$/, "").slice(0, 90),
    summary: action || block.label,
    location: card ? placeNamedIn(action) || place : place,
    characterNames: card
      ? []
      : [...new Set(dialogue.map((line) => line.speaker).filter((speaker) => speaker && !NARRATOR_NAME.test(speaker)))],
    extraNames: [],
    dialogue: card ? [] : dialogue,
    estimatedSeconds: seconds,
    camera: "",
    shots: [],
  };
}

function applyUserStoryboard(project: Project) {
  if (project.song || !scriptIsStoryboard(project.scriptText)) return;
  const blocks = storyboardBlocks(project.scriptText);
  if (blocks.length < 2) return;
  const used = new Set<number>();
  const next: Scene[] = [];
  for (const block of blocks) {
    const action = actionText(block);
    let best = -1;
    let bestScore = 0;
    project.scenes.forEach((scene, index) => {
      if (used.has(index)) return;
      const score = overlapScore(`${scene.title} ${scene.summary}`, action);
      if (score > bestScore) {
        bestScore = score;
        best = index;
      }
    });
    if (best >= 0 && bestScore >= 0.34) {
      used.add(best);
      const scene = project.scenes[best];
      const card = isCardLabel(block.label);
      if (action) {
        scene.summary = action;
        scene.shots = [];
      }
      const parsed = linesFromBlock(block.text).filter(
        (line) => project.speechMode !== "dialogue" || line.voiceover || !NARRATOR_NAME.test(line.speaker),
      );
      scene.dialogue = card ? [] : parsed;
      if (card) {
        scene.characterNames = [];
        scene.extraNames = [];
        const spot = placeNamedIn(action);
        if (spot) scene.location = spot;
      }
      if (block.headingSeconds) {
        scene.estimatedSeconds = Math.min(30, Math.max(2, block.headingSeconds));
        scene.shots = [];
        fitLinesToSeconds(scene);
      }
      const mentioned = namesMentioned(project, `${action} ${(scene.dialogue || []).map((line) => line.speaker).join(" ")}`);
      if (!card && mentioned.length) scene.characterNames = [...new Set(mentioned)];
      next.push(scene);
    } else {
      const created = sceneFromBlock(block);
      if (project.speechMode === "dialogue") {
        created.dialogue = created.dialogue.filter((line) => !NARRATOR_NAME.test(line.speaker));
      }
      if (block.headingSeconds) fitLinesToSeconds(created);
      next.push(created);
    }
  }
  project.scenes = next.map((scene, index) => ({ ...scene, index: index + 1 }));
}

function nextAngle(camera: string) {
  const current = camera.toLowerCase();
  if (current.includes("close")) return "medium shot, handheld";
  if (current.includes("wide") || current.includes("full")) return "close-up, eye level";
  return "close-up, slight low angle";
}

function exchangeChunks<T>(lines: T[]): T[][] {
  if (lines.length <= 3) return [lines];
  const mid = Math.ceil(lines.length / 2);
  if (mid > 3 || lines.length - mid > 3) {
    return [...exchangeChunks(lines.slice(0, mid)), ...exchangeChunks(lines.slice(mid))];
  }
  return [lines.slice(0, mid), lines.slice(mid)];
}

function openingBeat(summary: string, location: string) {
  const sentence = summary.trim().split(/(?<=[.!?])\s+/)[0]?.trim() || "";
  const beat = sentence || (location.trim() ? `${location.trim()}.` : "Same place.");
  return `${beat.replace(/[. ]+$/, "").trim()}. Only the lines in this scene. Cut before the rest of the exchange.`;
}

function contentSeconds(scene: Pick<Scene, "summary" | "dialogue">) {
  const lines = (scene.dialogue || []).filter((line) => line.line?.trim());
  if (lines.length) return Math.min(30, Math.max(3, sceneSpeechFloor(scene)));
  const words = (scene.summary || "").split(/\s+/).filter(Boolean).length;
  return words > 22 ? 4 : 3;
}

function beatParts(summary: string) {
  const clean = summary.replace(/\s*The attached product only appears as this action says[^.]*\.\s*/gi, " ").trim();
  const cuts = clean
    .split(/\s*\bCUT to\s+/i)
    .map((part) => part.replace(/^[,.\s]+/, "").trim())
    .filter((part) => part.length > 12);
  if (cuts.length > 1) return cuts;
  return [];
}

function longParts(summary: string) {
  return summary
    .replace(/\s*The attached product only appears as this action says[^.]*\.\s*/gi, " ")
    .split(/(?<=[.!?])\s+/)
    .map((part) => part.trim())
    .filter((part) => part.length > 24 && !/^the attached product\b/i.test(part));
}

function lineBuckets(lines: Array<{ speaker: string; line: string }>, count: number) {
  const buckets = Array.from({ length: count }, () => [] as Array<{ speaker: string; line: string }>);
  if (!lines.length) return buckets;
  if (lines.length === 1) {
    buckets[0].push(lines[0]);
    return buckets;
  }
  lines.forEach((line, index) => {
    const at = Math.min(count - 1, Math.floor((index * count) / lines.length));
    buckets[at].push(line);
  });
  return buckets;
}

function splitPackedBeats(project: Project) {
  if (project.song) return;
  const next: Scene[] = [];
  for (const scene of project.scenes) {
    const summary = scene.summary || "";
    const cuts = beatParts(summary);
    const sentences =
      cuts.length > 1 ? cuts : scriptIsStoryboard(project.scriptText) ? longParts(summary) : [];
    if (sentences.length < 2) {
      next.push(scene);
      continue;
    }
    const lines = (scene.dialogue || []).filter((line) => line.line?.trim());
    const buckets = lineBuckets(lines, sentences.length);
    const montage = /\bmontage\b/i.test(`${scene.title} ${summary}`);
    let camera = scene.camera;
    sentences.forEach((part, index) => {
      if (index > 0) camera = nextAngle(camera);
      const dialogue = buckets[index] || [];
      const spoken = `${part} ${dialogue.map((line) => line.speaker).join(" ")}`;
      const card = isCardLabel(scene.title) || isCardLabel(part);
      const ownPlace = placeNamedIn(part);
      const mentioned = namesMentioned(project, spoken);
      const piece: Scene = {
        ...scene,
        id: index === 0 ? scene.id : createId("scene"),
        summary: /[.!?]$/.test(part) ? part : `${part}.`,
        dialogue: card ? [] : dialogue,
        location: card ? ownPlace || scene.location : ownPlace || (montage ? "" : scene.location),
        characterNames: card ? [] : mentioned.length ? mentioned : scene.characterNames,
        camera,
        shots: [],
        estimatedSeconds: 0,
      };
      piece.estimatedSeconds = contentSeconds(piece);
      next.push(piece);
    });
  }
  project.scenes = next.map((scene, index) => ({ ...scene, index: index + 1 }));
}

function splitLongExchanges(project: Project) {
  if (project.song) return;
  const board = scriptIsStoryboard(project.scriptText);
  const next: Scene[] = [];
  for (const scene of project.scenes) {
    const lines = (scene.dialogue || []).filter((line) => line.line?.trim());
    if (lines.length < 4) {
      next.push(scene);
      continue;
    }
    const chunks = exchangeChunks(lines);
    let camera = scene.camera;
    chunks.forEach((chunk, index) => {
      if (index === 0) {
        next.push({
          ...scene,
          dialogue: chunk,
          shots: [],
          summary: board ? scene.summary : openingBeat(scene.summary, scene.location),
        });
        return;
      }
      camera = nextAngle(camera);
      next.push({
        ...scene,
        id: createId("scene"),
        dialogue: chunk,
        camera,
        summary: "Same place. The exchange continues from the last line. New angle, same bodies, no repeated action.",
        shots: [],
      });
    });
  }
  project.scenes = next.map((scene, index) => ({ ...scene, index: index + 1 }));
}

function scaleScenesToTarget(project: Project) {
  const board = !project.song && scriptIsStoryboard(project.scriptText) ? storyboardBlocks(project.scriptText) : [];
  const timed = board.some((block) => block.seconds != null);
  const target = project.song ? Math.round(project.song.durationSeconds) : clampTotalDuration(project.targetDurationSeconds);
  project.targetDurationSeconds = target;
  if (!project.scenes.length) return;
  for (const scene of project.scenes) {
    const written = scene.estimatedSeconds || estimateSceneSeconds(scene);
    if (project.song) {
      scene.dialogue = [];
      scene.estimatedSeconds = Math.max(2, Math.min(30, Math.round(written * 10) / 10));
    } else if (!timed) {
      const spoken = (scene.dialogue || []).some((line) => line.line?.trim());
      scene.estimatedSeconds = spoken
        ? sceneSpeechFloor(scene)
        : Math.max(3, Math.min(4, Math.round(written * 10) / 10));
    } else {
      scene.estimatedSeconds = contentSeconds(scene);
      scene.shots = [];
    }
  }
  if (timed) {
    const explicit = storyboardBlocks(project.scriptText).filter((block) => block.seconds != null && lineSeconds(block.label));
    const used = new Set<number>();
    for (const block of explicit) {
      const action = actionText(block);
      let best = -1;
      let score = 0;
      project.scenes.forEach((scene, index) => {
        if (used.has(index)) return;
        const nextScore = overlapScore(`${scene.title} ${scene.summary}`, action);
        if (nextScore > score) {
          score = nextScore;
          best = index;
        }
      });
      if (best < 0 || score < 0.3 || !block.seconds) continue;
      used.add(best);
      project.scenes[best].estimatedSeconds = Math.min(30, Math.max(2, block.seconds));
      fitLinesToSeconds(project.scenes[best]);
    }
  }
  const durationOf = (scene: Scene) => {
    const lock = /end\s*card|tarjeta\s+final/i.test(scene.title || "") ? scene.estimatedSeconds : undefined;
    return {
      index: scene.index,
      estimatedSeconds: scene.estimatedSeconds || 0,
      floor: sceneSpeechFloor(scene),
      lock,
    };
  };
  const whole = balancePartSceneSeconds(
    project.scenes.map(durationOf),
    [{ duration: target, sceneIndexes: project.scenes.map((scene) => scene.index) }],
  );
  for (const scene of project.scenes) {
    const next = whole.get(scene.index);
    if (next) scene.estimatedSeconds = next;
  }
  const parts = packScenesIntoParts(
    project.scenes.map((scene) => ({ index: scene.index, estimatedSeconds: scene.estimatedSeconds || 0 })),
    project.targetDurationSeconds,
    project.song?.clips.map((clip) => clip.durationSeconds),
  );
  const capped = balancePartSceneSeconds(
    project.scenes.map(durationOf),
    parts,
  );
  for (const scene of project.scenes) {
    const next = capped.get(scene.index);
    if (next) scene.estimatedSeconds = next;
  }
  project.scenes = project.scenes.map((scene) => ensureSceneShots(scene));
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
      if (isVisualStyle(args.style)) project.style = args.style;
      if (args.aspect_ratio) project.aspectRatio = normalizeAspectRatio(args.aspect_ratio);
      if (args.target_seconds && !project.song) {
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
        const dialogue = project.song
          ? []
          : ((item.dialogue as Array<{ speaker: string; line: string }>) || []).map((line) => ({
              speaker: englishSpeakerName(line.speaker),
              line: line.line,
            }));
        const summary = String(item.summary || "");
        const computed = estimateSceneSeconds({ summary, dialogue });
        const raw = Number(item.estimated_seconds || 0);
        const shots = ((item.shots as Array<Record<string, unknown>>) || [])
          .map((shot) => ({
            seconds: Math.max(2, Math.min(3, Math.round(Number(shot.seconds) || 3))),
            camera: String(shot.camera || ""),
            action: String(shot.action || ""),
          }))
          .filter((shot) => shot.action || shot.camera);
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
          camera: String(item.camera || shots[0]?.camera || ""),
          shots,
        };
      }) as Scene[];
      const withStory = project.scenes.filter(sceneHasStory);
      if (withStory.length) {
        project.scenes = withStory.map((scene, index) => ({ ...scene, index: index + 1 }));
      }
      applySpeechMode(project);
      applyUserStoryboard(project);
      splitPackedBeats(project);
      splitLongExchanges(project);
      refineStoryLeads(project);
      diversifyInventedCast(project);
      applyScriptLooks(project);
      project.durationPending = false;
      project.durationAuto = false;
      if (project.song) {
        project.targetDurationSeconds = Math.round(project.song.durationSeconds);
      } else {
        const cue =
          typeof project.targetDurationSeconds === "number"
            ? clampTotalDuration(project.targetDurationSeconds)
            : parseDurationFromText(project.scriptText);
        if (cue) project.targetDurationSeconds = cue;
        else {
          project.targetDurationSeconds = clampTotalDuration(
            project.scenes.reduce((sum, scene) => sum + scene.estimatedSeconds, 0),
          );
        }
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

const NARRATOR_NAME = /^(the\s+)?(narrator|narradora|voice[- ]?over|voiceover|vo|off[- ]?screen|voz en off)$/i;

function applySpeechMode(project: Project) {
  if (project.song || !project.speechMode) return;
  if (project.speechMode === "voiceover") {
    for (const scene of project.scenes) {
      scene.dialogue = (scene.dialogue || [])
        .filter((line) => line.line?.trim())
        .map((line) => ({ speaker: "Narrator", line: line.line.trim() }));
    }
    const narrator = project.characters.find((character) => NARRATOR_NAME.test(character.name.trim()));
    if (narrator) {
      narrator.name = "Narrator";
      narrator.slug = "narrator";
      narrator.isExtra = true;
      if (!narrator.description.trim()) narrator.description = "Off-screen voice-over. Never on screen.";
    } else if (project.scenes.some((scene) => scene.dialogue.length)) {
      project.characters.push({
        id: createId("char"),
        name: "Narrator",
        slug: "narrator",
        description: "Off-screen voice-over. Never on screen.",
        voiceNotes: "a warm, close, even storyteller voice",
        isExtra: true,
        lookConfirmed: false,
        clips: [],
      });
    }
    return;
  }
  if (project.speechMode === "dialogue") {
    for (const scene of project.scenes) {
      scene.dialogue = (scene.dialogue || []).filter(
        (line) => line.line?.trim() && (Boolean(line.voiceover && !NARRATOR_NAME.test(line.speaker.trim())) || !NARRATOR_NAME.test(line.speaker.trim())),
      );
    }
    project.characters = project.characters.filter((character) => !NARRATOR_NAME.test(character.name.trim()));
  }
}

function speechPlan(mode: SpeechMode | undefined) {
  if (mode === "voiceover") {
    return "SPEECH MODE voiceover. This mode overrides every other speech rule. Write only off-screen narrator voice-over over the actions in each summary. Every dialogue line uses speaker Narrator and describes what is happening. The picture keeps moving while the line plays. Do not leave a silent face for more than 2 or 3 seconds. If the shot is longer than the line, add another narrator line that tells the next action. Do not write a conversation. Do not give a line to an on-screen character. No lipsync. Mouths stay closed. Scene 1 opens with the first narrator line.";
  }
  if (mode === "both") {
    return "SPEECH MODE both. This mode overrides every other speech rule. Use off-screen narrator voice-over and on-screen dialogue in the same film. Narrator lines describe the action, stay off-screen, and are never lipsync. A line written VO (Name) is that person's voice over the picture: mouth closed, no lipsync, and the words stay exactly as written. Dialogue lines are a real exchange between the characters in the shot, and each speaker looks at the other person while the line is coming out. Do not play a silent stare before or after a line. No shot stays quiet, with nothing happening, for more than 2 or 3 seconds. If a beat has no line in the script and would only be a frozen look, add one short line. If the script already has the line, copy it. Do not paraphrase it and do not add a second line on top of it. A parenthetical such as (beat) or (quiet) is not spoken. Scene 1 opens with a spoken line.";
  }
  if (mode === "dialogue") {
    return "SPEECH MODE dialogue. This mode overrides every other speech rule. Write the talk the story actually needs. A pause or a character alone can last 2 or 3 seconds, and the body still does something. Do not leave people looking at each other with nothing happening. An argument, a confession, a negotiation, or any beat where the words are the point needs every line the user wrote, back and forth, each said by the person who says it. Do not shrink that exchange to a single line and do not replace it with a new line. Do not put the whole exchange in one scene. About two lines per scene, three at most, then the next scene in the same place with a different angle or camera move for the rest. Each scene lasts only as long as its own lines, with no held silence after the last word and no faster delivery. Copy the user's words. A parenthetical such as (beat), (quiet), or (small smile) is a direction, not speech. A line written VO (Name) is that person's voice over the picture: mouth closed, no lipsync, and it is not also spoken on screen. Add a short line only when that beat has no speech in the script and would otherwise be a frozen look. Do not use an unnamed narrator. Scene 1 opens with the first line.";
  }
  return "";
}

function planTask(project: Project) {
  const styleLine = `Style: ${project.style}. Aspect: ${project.aspectRatio}. Call extract_storyboard once, then stop.`;
  if (project.song) {
    const parts = project.song.clips
      .map(
        (clip) =>
          `part ${clip.index} covers the song from ${clip.startSeconds}s for ${clip.durationSeconds}s (max ${clip.durationSeconds}s)`,
      )
      .join("; ");
    const about = project.song.productBrief?.trim()
      ? `The user is selling this product and brand: ${project.song.productBrief.trim()}. `
      : "The user is selling the product in the attached product photo. ";
    return `SONG VIDEO. This is a promo film for the attached product, cut to a ${Math.round(project.song.durationSeconds)} second song. ${about}The lyrics are the soundtrack, in the order they are sung. Read them as one commercial with a problem and then a solution. The attached product is always the solution, even when the lyric never names a brand. Open on the problem the words point at: the lack, the stress, the old habit, the want. Those scenes have no product in frame. Do not write "the attached product", the brand, or the pack into a problem scene. The product appears only when the story turns to the fix: the change, the relief, the after. That scene is the first time it is visible. Write "the attached product" in that summary and show them using it the way this product is used, same packaging as the photo. Later scenes may keep it only while the result of using it is on screen. Do not paste it onto every line. In mentioned_refs, list the product only with the scene indexes where that solution is on screen.
A calm lyric is still a dramatic shot. Do not leave the character in one room on one close-up. Change the place, the action, and the camera on every scene. Use wide, full, medium, close-up, insert, low angle, high angle, tracking, dolly, handheld, and dutch, and do not repeat the same size twice in a row. Give the problem weather, movement, and stakes. Give the solution a different place and a clear action with the product.
Each scene is one lyric line, or two short lines that are the same picture. Do not skip a line that shows a new action, and do not put a whole verse into one scene. Early lines belong to the earlier parts, later lines to the later parts. Never repeat a line in a later part. Every summary starts with the exact sung words, in quotes, then the action: While the song plays "exact lyric", then one physical action. Copy the lyric from the script. Do not paraphrase it and do not invent a line. Every dialogue array stays empty. There is no narrator and no generated voice. The attached song is the only audio and it is already playing on frame one: do not open with a title card, a logo sting, or a silent intro. Ignore the spoken-line and [NO BGM] rules. Mouths stay closed, except once or twice on a hook or a brand line: write sings along in that summary and have the lead mouth that exact quoted line, where they already are, or into a mic only if that line is a performance. Do not do it on every line. ${parts}. One scene is one action and one camera. Most scenes are 2 or 3 seconds, longer only when that lyric line itself is longer. Write enough scenes that the seconds inside each part add up to that part. ${styleLine}`;
  }
  const parts = seedancePartDurations(project.targetDurationSeconds || 15).map(
    (duration, index) => `part ${index + 1} (max ${duration}s)`,
  );
  const ordered =
    /(?:^|\n)\s*(?:scene|escena)\s*\d+\b/i.test(project.scriptText) ||
    /(?:^|\n)\s*\d+\s*[.)]\s+\S/.test(project.scriptText);
  const opening = ordered
    ? "The user already ordered this as a storyboard. Keep every heading, in that order, including a montage and an end card. Do not skip or replace one. Copy every action they wrote and every line they wrote, in their words, said by that speaker. Do not invent a substitute line. If one heading contains several beats or the word montage, make one scene per beat instead of one scene with CUT to inside it. A montage beat that changes room or time of day is a new place, not a continuation of the previous room. An act range is the span of those scenes together, not the length of a single scene. Do not stretch one scene to 20 seconds to fill the act, and do not crush several beats into 2 seconds. The scenes together stay inside the target duration. Do not add a part past it. Each scene lasts only as long as its own line, or about 3 or 4 seconds when nobody speaks. If a heading itself says how many seconds that one card lasts, keep that. An end card shows only the objects and the words they wrote. No people in the end card."
    : "The user gave a concept, not a scene list. Keep the cause order they told, name each person once, and reuse that name. Open on the problem in the first scenes, before a long setup. Then the middle, with enough scenes that the story can be followed. Then the turn. If a product is attached or named, it is the solution and it first appears in that turn, not during the problem. If there is no product, the turn is the resolution and it also gets room. Do not rush the middle into one shot. Do not leave a quiet stretch where nothing happens.";
  const known = castBrief(project);
  const speech = speechPlan(project.speechMode);
  const timing =
    project.speechMode === "dialogue"
      ? "A silent beat stays 2 or 3 seconds and the body still moves. Nobody only looks at someone else for longer than that. Split a discussion across scenes in the same place, about two lines each and a new camera on the next scene. Keep every line the user wrote. Time each scene to its lines. No dead air after the last word, and do not rush the lines. Add a short line only when the script left that beat with no speech. Do not default every scene to 6, 7, or 8."
      : "Most scenes are 2 or 3 seconds. A camera move is still usually 2 or 3. Use more than 3 only when the spoken line does not fit. A longer exchange is two scenes, not one rushed shot. No extra silence after the last word, and no quiet look longer than 2 or 3 seconds. Add a line when a beat would otherwise be empty. Do not default to 6, 7, or 8.";
  return `${speech} ${opening} ${known} Target total duration: ${project.targetDurationSeconds}s, grouped as ${parts.join(", ")}. One scene is one action and one camera. Change the shot every scene. ${timing} The scenes inside one part sum to at most that part, never more than 30s. ${styleLine}`;
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
  if (options.project.song) {
    options.project.targetDurationSeconds = Math.round(options.project.song.durationSeconds);
  } else if (typeof options.project.targetDurationSeconds !== "number") {
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
    const driven = await driveProduce(options.project.id, 120_000, { onStatus });
    options.onEvent({ type: "project", project: driven || options.project });
    return;
  }

  const { openaiApiKey } = getSecrets();
  if (!openaiApiKey) {
    throw new Error("OPENAI_API_KEY is missing for the GPT-5.6 Luna agent.");
  }
  const client = new OpenAI({ apiKey: openaiApiKey });
  console.info("storyboard model", TEXT_MODEL);
  const onStatus = (text: string) => options.onEvent({ type: "status", text });
  const signal = options.abortSignal;
  const activeTools = toolsFor(mode);
  const instructions = mode === "plan" ? PLAN_PROMPT : PRODUCE_PROMPT;
  const userText =
    options.userText?.trim() ||
    (mode === "plan"
      ? planTask(options.project)
      : `The storyboard is approved. Do not rewrite scenes. ${
          shouldGenerateOneShot(options.project.targetDurationSeconds, options.project.scenes)
            ? `Generate this ${options.project.targetDurationSeconds}s ${options.project.style} short in ONE Seedance 2.5 take covering every scene at 480p.`
            : `Plan ${Math.ceil(options.project.targetDurationSeconds / 30)} generations of 30s covering all scenes for a ${options.project.targetDurationSeconds}s ${options.project.style} video at ${options.project.aspectRatio}, then generate every clip in order at 480p.`
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
      model: TEXT_MODEL,
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
        model: TEXT_MODEL,
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

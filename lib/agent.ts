import { getSecrets } from "./config";
import { clampTotalDuration, createId, slugify, normalizeAspectRatio } from "./ids";
import { generateBatchVideo, planSeedanceBatches, startProduce, summarizeLibrary, ensureProductUnderstanding } from "./pipeline";
import { driveProduce } from "./produce";
import { applyScriptLooks, castBrief } from "./cast-roster";
import { diversifyInventedCast, englishExtraName, englishSpeakerName, packedScenePrompt, stampProductPlacement } from "./style";
import { dropSpeechFragments } from "./speech-echo";
import { balancePartSceneSeconds, estimateSceneSeconds, fitSpokenScenes, parseDurationFromText, sceneHasStory, sceneSpeechFloor, seedancePartDurations, shouldGenerateOneShot, storyArc, userTimedSeconds } from "./timing";
import { ensureSceneShots } from "./shots";
import { ensureReferenceSlots, isUnseenVoice, promptReadyReferences, refineStoryLeads, syncReferenceInclusion, dropUnscriptedDialogue } from "./refs";
import { productLookBrief, productPageBrief, productUnderstandingBrief, productUseBrief } from "./product-facts";
import { filmTitle, saveProject } from "./store";
import { isAbortError, throwIfAborted } from "./abort";
import { SONNET_MODEL, sonnetTools, type SonnetMessage } from "./sonnet";
import { ensureProductScenes, ensureScenePlaces, ensureStoryBrief } from "./story-brief";
import { extendShortStory } from "./story-extend";
import { isVisualStyle, type AgentMode, type Batch, type Character, type Project, type Scene, type ScriptRefCue } from "./types";

const SYSTEM_PROMPT = `You are the director-agent of distribute.to, a studio that turns scripts into Pixar, claymation, or realistic live-action shorts.

Language: always reply in English, clear and concrete.

Pipeline real:
1. PRIMERO el guion. No pidas imágenes ni generes video si aún no hay script.
2. Extraer escenas, diálogos, locaciones y personajes.
3. El sistema genera un retrato INDIVIDUAL por lead (una sola pose, de frente a la cámara, fondo gris claro, ese personaje solo). Ese retrato es la referencia del video. Nunca un two-shot ni una escena de pelea. Si hay foto de Setup, el look es SOLO convertir esa foto al estilo del proyecto; nunca inventes pelo, piel, ropa ni especie. Si NO hay foto y el personaje es una mujer humana, invéntala distinta en cada corto: otro nombre corto en inglés, otra cara, otra edad, otro pelo y otro tono de piel, al azar. Nunca la llames Maya. Nunca uses dark skin como piel por defecto. La description del personaje es SOLO apariencia (especie, color, ropa) cuando NO hay foto, sin plot ni otros personajes. El usuario lo aprueba o pide un cambio, una sola vez, ANTES de animar. No confirmes looks tú. Cast ONLY on-screen story principals (usually 1-4). Never cast a look for a Narrator or unseen voice-over. If the script is narrator VO and does not name whose voice, keep speaker as Narrator (is_extra true); the system picks any fitting off-screen voice. If an on-screen character has dialogue, that is their realistic lipsync. A speaker named Narrator is always off-screen voice-over. Never give those lines to an on-screen character and never lipsync them. Crowd, montage, b-roll, numbered extras are is_extra true — no look.
4. NO first-frame still. Only character look portraits are generated. Seedance 2.5 R2V receives those portraits plus product/logo/location photos when the script uses them. The system maps files to @Image1, @Image2, @Image3 in upload order and writes those tags INSIDE the scenes when that person or object is on screen. Do not dump "@Image2 is Guy. Match his design..." at the start of the prompt.
5. Cada escena es UN plano y UNA acción. En una conversación en el mismo lugar, mantén el mismo tamaño de plano y la altura de los ojos en los contraplanos. Cambia a wide, close-up, insert, low angle o high angle solo cuando la acción sale de ese lugar o el beat lo pide. Unas dos líneas por escena, tres como máximo. La duración es lo que tardan en decirse esas líneas, sin silencio después de la última palabra y sin acelerarlas para que quepan. Un plano normal dura de 3 a 5 segundos. Un plano de 2 segundos solo si es un corte de acción rápido. Dentro de un plano, nadie se queda callado ni mirándose sin que pase nada por más de 2 o 3 segundos. Si el usuario ya escribió el diálogo, copia solo esas líneas. No inventes un discurso, un VO ni un cierre sacado de la página del producto. Si el usuario ya numeró las escenas, respeta esos cortes, el orden y los segundos que escribió. No te saltes una escena, un montage ni una end card. Si en ese tiempo sobran líneas, quita las del medio y deja la primera y la última. Si faltan y la imagen se quedaría quieta, añade una línea corta.
6. El total del video está en targetDurationSeconds y puede ser cualquier duración entre 15 y 500 segundos. Cada escena dura lo que el guion le escribió. Un rango 00:00-00:15 dura 15 segundos. No lo conviertas en 30 porque la generación máxima es 30. Seedance 2.5 genera hasta 30s por clip, siempre a 480p. Una generación de 30s se llena con el siguiente beat, no alargando el anterior: un hook de 15s más los primeros 15s del body. El resto del body abre la siguiente generación y puede seguir con el inicio del pivot. 60s son 30+30. 90s son 30+30+30. 45 es 30+15. 500s son dieciséis generaciones de 30 y una de 20. Nunca estires un beat para llenar la generación.
7. Si el guion pasa de 30s, cada generación dura como máximo 30s de tiempo consecutivo del relato. El total debe cubrir el habla sin parecer apurado. Si el usuario pide un total más corto que el habla, no comprimas el diálogo por debajo de lo que tarda en decirse.
8. El aspect ratio del proyecto (16:9 o 9:16) ya lo aplica el sistema. No lo cambies salvo que el usuario lo pida.
9. Animar con Seedance 2.5 Reference-to-Video. Menciona @ImageN / @VideoN en la escena en la que aparecen, no en un preámbulo.
10. El sistema adjunta un video por personaje que vuelve en esta parte y ya habló antes. Cada video dura como máximo 4 segundos de esa persona hablando. @Video1 es el primero, @Video2 el siguiente. Un personaje nuevo no tiene video. Alguien que no sale en esta parte no se adjunta.

Logo, product, and location:
- Do NOT generate a standalone product/logo/location still when a photo is uploaded. No packshot, no product-only restyle.
- Do NOT put them in prompts just because a slot or photo exists.
- Name the product and the logo only inside a scene that has them in a hand, on a surface, or in frame. A location image is the set for a scene that happens in that place.
- Keep the product EXACTLY as the attached photo. If the photo shows the item and its package, both stay: the item keeps its shape, color, print, and material, and the package keeps its form. Do not show only the box. A stand-up pouch stays a pouch, a sachet stays a sachet, a bottle stays a bottle. Never turn a pouch into a bottle, jar, or tub. Same silhouette, closure, label layout, colors, and branding. Draw it in the project's style. Do not paste the photo as-is.
- Never invent a logo on set. Do not wait for photos.

Reglas de prompt Seedance 2.5 (obligatorias):
- El video_prompt EMPIEZA EXACTAMENTE así, según el estilo del proyecto: "Pixar style throughout the whole video." o "Claymation style throughout the whole video." o "realistic commercial, handheld camera fake documentary style. Realistic live-action throughout the whole video." Luego SCENE 1. Nada de first frame. Nada de listar todos los @Image al inicio.
- Dentro de cada escena, nombra @ImageN cuando ese personaje, producto, logo o locación entra o se usa. Cuando la historia vuelve a un lugar, usa el mismo nombre de lugar y el mismo @Image de ese lugar.
- El sistema inyecta los números @ImageN. En video_prompt usa los nombres de personaje/producto; el sistema los sustituye.
- Cada cambio de escena: SCENE 1 (5s). [English camera names only]. action. The man says: "line". CUT. SCENE 2 (4s). ...
- Respeta estimated_seconds: SCENE N (Xs).
- Voz, una sola vez en el cierre (el sistema lo escribe): diálogo on-screen = lipsync con la voz realista de ESE personaje. Si el speaker es Narrator, es voz en off y nadie le hace lipsync. El cuerpo sí hace lo que esa línea dice en esa misma escena: si la línea dice que la boca se abre, la boca se abre. No muestres la pose contraria. Nunca pases una línea de Narrator a un personaje en cuadro. No repitas esta regla dentro de cada SCENE.
- Dentro de cada escena, nombra el producto/logo/locación con @ImageN cuando aparece en ESA escena, igual que los personajes. Nunca lo dejes solo al final del prompt.
- Cámara: varía el plano y el ángulo en CADA escena. Usa SOLO nombres en inglés: extreme wide shot, wide shot, full shot, medium full shot, medium shot, medium close-up, close-up, extreme close-up, insert, two-shot, over the shoulder, POV, eye level, low angle, high angle, bird's eye, worm's eye, dutch angle, pan, tilt, dolly, tracking shot, steadicam, crane, zoom, handheld, dolly zoom. Nunca nombres en español.
- Planos: nunca inventes un segundo cuerpo del mismo personaje. Over-the-shoulder = hombro de A, cara de B, A ≠ B. Si solo hay un personaje en cuadro, no uses OTS ni two-shot. Estas reglas van en el cierre del prompt UNA vez, no repetidas en cada escena. OTS sí puede llevar su línea de cámara solo en ESA escena.
- Acción visible: si alguien come o usa un producto, muestra la acción completa (mano, pack, boca). Nunca cortes al objeto ya dentro de la boca.
- Física y continuidad: escríbelas EN LA ACCIÓN, no como un párrafo de reglas en cada escena. Gravedad, sólidos que no se atraviesan, puertas que se abren por aire vacío. Si alguien está acorralado en un rincón, la siguiente escena sigue en ese rincón. Edad/tamaño igual: tiny se queda tiny hasta el beat que crece; misma escala vs silla, mesa y puerta entre cortes. Si A le habla a B, A mira a B, no al lente, salvo cuarta pared. Si alguien persigue, avanza hacia esa posición. Si hay glow, luces u ojos brillantes detrás, el cuerpo de enfrente los tapa: nada de brillo a través del pelo o la piel. Si agarra una puerta o cubiertos, los dedos tocan el objeto; no flota. La ropa puede cambiar: sigue siendo la misma persona, no un segundo cuerpo. Conserva quién está adelante, atrás, a la izquierda y a la derecha hasta que la acción los mueva. El tiempo avanza. El lugar no cambia hasta que la escena cambie de locación. En 16:9 el cuadro ancho es un solo espacio: no uses el ancho para duplicar a nadie ni para invertir el layout. El sistema puede añadir una frase corta solo cuando esa escena lo necesita; no copies esas reglas en cada SCENE.
- Actuación: la cara y el cuerpo muestran emoción. Nada de personajes rígidos.
- Quién está en cuadro: en character_names solo los principals de ESA escena; en extra_names secundarios visibles. El sistema escribe una frase breve con quien está en esa escena.
- Time-lapse / varias acciones: NUNCA bullets y NUNCA varios beats dentro de una sola escena. Cada beat es su propia escena, con su propia cámara y sus propios segundos. Un montage de tres lugares son tres escenas. No escribas "CUT to" dentro del summary.
- El video_prompt va 100% en inglés, salvo las comillas del diálogo si el guion está en otro idioma. Nombres cortos en inglés. Nunca "Hombre de 40 años". No escribas una línea que el usuario no escribió.
- Cada línea de diálogo una sola vez, en una sola escena. No la repitas en esa escena ni en la siguiente. No repeated lines. Cierra CADA SCENE con "[NO BGM]". Nunca soundtrack ni BGM. Si un producto adjunto sale en la escena, una sola frase dice cómo: puesto en el personaje, en la mano, primer vistazo y aún no puesto, cerca, o lejos.
- Super breve. Nada de "cinematic masterpiece". No repitas el párrafo de física/clones, oclusión, eyeline, escala ni props en cada SCENE; el sistema lo pone una sola vez al final y solo añade una frase concreta si esa escena lo pide.
- Ejemplo Pixar:
  Pixar style throughout the whole video. SCENE 1 (6s). Eye level, medium shot. The woman lipsyncs: "the line the user wrote". She does the action the user wrote. [NO BGM] CUT. SCENE 2 (4s). Tracking shot, full shot. The next action the user wrote, in the same place unless they leave it. [NO BGM]
- Ejemplo claymation:
  Claymation style throughout the whole video. SCENE 1 (5s). Wide shot, eye level. The man does the action of that scene. A narrator line stays off-screen. [NO BGM] CUT. SCENE 2 (4s). Close-up, low angle. The man lipsyncs the line written for that scene. [NO BGM]
- Ejemplo realistic:
  realistic commercial, handheld camera fake documentary style. Realistic live-action throughout the whole video. SCENE 1 (5s). Wide shot, eye level. The man does the action of that scene in that place. [NO BGM] CUT. SCENE 2 (4s). Close-up, low angle. The man lipsyncs the line written for that scene. [NO BGM]

Storyboard continuity:
- The storyboard is one continuous animated film. Same story in Spanish or English keeps the same causal order. Do not merge, skip, or reorder a cause. The same space lasts until they leave it.
- Inside one continuous moment, each scene starts where the previous one ended: same place, same distance between bodies, same screen sides, same body state. A new scene of that same moment is the next beat, not a new staging. A later minute of that same situation stays there, on the same ground. A new place starts only when they go somewhere else.
- Who can see whom is blocking. If A sees B and B does not see A, that beat states the distance, who is in frame, and the eyelines. The next beat starts from that exact distance.
- A new place, a new time, or a montage beat is a new scene. Do not write "CUT to" inside one summary. A part may visit several places, and so may the hook, the knot, and the close, when the story takes them somewhere else. A few minutes later in the same situation keeps the place and the ground. Do not rename that ground, and do not swap it for a different landscape. Do not invent a trip just to connect two times. Travel is one way to arrive. It is not the only way.
- Time moves forward. Nothing happens before its cause.
- Be cinematic: wide when distance matters, closer when emotion or a small action matters, a new angle when the story turns. Vary size and movement across the part. Keep the place until they leave it. Do not repeat the same shot size on consecutive scenes. A reverse angle of the same exchange keeps the bodies where they are. A new place does not. Never a second body or an extra character.
- Write each summary as physical blocking: where each body is, how far, who looks at whom, what the body does next, and the emotion in face and posture. A character talking to himself is on screen and the line is his, not the narrator. Narrator stays off-screen on the beat it belongs to. No bullet lists and no physics lectures.

Herramientas:
- Usa extract_storyboard cuando entiendas el guion. En mentioned_refs solo listes logo/producto/locación si el texto del guion los involucra de verdad. En camera usa solo nombres en inglés y cambia tamaño o ángulo cuando cambia la emoción o la distancia, nunca el mismo tamaño en dos escenas seguidas. En summaries, write the blocking so the next scene continues the previous ending: place, distance, screen sides, and body state. If A sees B while B does not see A, write that distance and those eyelines. If A talks to B, A looks at B. Glow behind a body is occluded. Hands keep contact with doors and utensils. Show emotion in the face and the body. Show complete physical actions. Keep the attached product exact to the photo, the item and the package, not only the box. Keep age/size locked until a later scene shows growth. List every on-screen principal in character_names and background animals/people in extra_names. Never write a time-lapse as a bullet list; write each beat as a full physical sentence so the system can insert CUT to. A CUT to only changes the angle. Never clone a character. Do not paste physics lectures into every summary.
- No uses stylize_reference. Nunca generes una imagen solo del producto ni un first frame de la escena.
- Usa plan_video_batches cuando el usuario ya aprobó las escenas. Si targetDurationSeconds es 30 o menos, exactamente UNA tanda con todas las escenas. Si es 60, dos tandas de 30s. Si es 90, tres tandas de 30s.
- generate_video_batch anima UNA tanda con Seedance 2.5 reference-to-video. Respeta 4-30s. Cuando termine, el video YA está en el proyecto. No inventes URLs. No llames generate_batch_frame.

Nunca inventes URLs. Nunca digas que ya existe un video si la herramienta no lo creó. No uses markdown con asteriscos; escribe texto plano con saltos de línea. No hagas chat libre. No preguntes nada fuera del flujo.`;

const PLAN_PROMPT = `${SYSTEM_PROMPT}

Current task: PLAN ONLY.
Before extract_storyboard, use the STORY READING. AIM is what the film is for, ABOUT is the story, PROBLEM is the trouble, SOLUTION is the fix and where it is used, and PICTURES is what the camera shows, in order. Write the scenes from PICTURES. Where each person stands and how far apart they are comes from that beat. Part 2 starts from the consequence of part 1.
Call extract_storyboard exactly once with every scene, dialogue, action (summary), camera direction, and estimated_seconds. The title is a short film name from the story. Never name the film after its length.
Build one continuous film. Keep every cause in the order the user told it. Scene 1 opens on the first beat. Inside one continuous moment, each later scene begins at the exact place, distance, screen sides, and body state where the previous scene ended. If one character sees the other and is not seen back, keep that as its own beat with the distance and the eyelines, and start the next beat from there. Do not skip the approach, the run, the collapse, or the carry. Change location inside that moment only by showing the move. Going somewhere else is its own scene, in that new place, including the opening, the middle, and the ending. A few minutes later, or a harder feeling, stays on the ground they are already on. Do not invent a second environment for that, and do not rewrite the ground as a different landscape.
Each character keeps the same height, build, face, and features in every shot. Dialogue does not set species: a child who says a drawing is a dog stays a human child. An animal species is only when the script says that character is the animal, such as "Biscuit is a dog". Change size or body only when the user's story explicitly says that change happens in that shot. Clothes may change; the person does not.
A human woman with no uploaded photo is a new person every film. Pick her name, face, age, hair, and skin tone at random. Do not name her Maya. Do not default to dark skin. Fair, olive, tan, light brown, warm brown, and deep brown are all available, and the choice changes from film to film.
A supporting character introduced once is that same person for the whole film. If the hero returns with his friends, those are the friends already introduced, with the same names, not new people. Never let a character's reference number later mean a place.
Each spoken line belongs to exactly one speaker. A character speaks only their own lines. Never copy a line onto another character, and never let two characters say the same sentence.
Objects work the way they do in the world. Do not invent a mechanism. A short note or a full script both become one film of the chosen length. Understand who wants what and what changes before you write scenes. Keep every line the user already wrote, in their words and in their order. When a written beat is too long for the lines it has, write more lines in those same voices. The new lines push that same conflict. They do not add a slogan, a health claim, or a speech from the product page. These films are drama ads. Keep a problem, a turn, the product used where it would really be used, and enough time after that to see the change. How the problem is told depends on the product, the audience, and the moment. If people can talk, they say what is wrong in the specific words that moment would pull out of them, to whoever is actually there. If they cannot talk, the picture carries the pain, and the next person who can speak names it. Do not invent a conversation the moment would not have. Do not put a line on every shot. A quiet story can hold several lines. An event already in motion can stay mostly visual. When someone can speak at the end, they say what changed, inside the story, in the words that moment would use. That is not a slogan, a narrator, or a claim from a page.
Shots are a linear continuation. A cut from day to night, or a flashback, is allowed only when the story needs it, and that shot must say the time changed or that this is a flashback. Otherwise the next shot is the next moment.
One scene is one clear action and one camera. A character may speak and move in that same shot, for example leaning in while talking. The next action or the next angle is the next scene. Sitting and looking at his hands is one scene. Walking into the next room is another scene. The mirror is another scene. Do not glue those into one 9, 10, or 11 second paragraph. If a journey crosses several places, make one scene per place. Change the shot on every scene and never repeat the same framing twice in a row. Use the list: extreme wide, wide, full, medium, medium close-up, close-up, extreme close-up, insert, low angle, high angle, dutch, tracking, dolly, handheld. Most shots are 3 to 5 seconds. Use 2 seconds only for a fast action cut with nobody speaking. Each spoken line needs about 3 seconds in that scene, and the action finishes inside those same seconds. Do not put several lines in a 2 second scene. A short line is 3 to 5 seconds, not 2. A conversation of two lines can keep one shot size. A part does not stay on one camera. When the stake, the time, or the feeling changes, cut to another action or another kind of move. Keep the place and the ground until they leave. When the user already wrote the lines, a scene holds about one short line every 3 seconds. A 15 second beat can hold about five short lines. A longer exchange cuts to a new angle and continues, with the same bodies. Do not hold after the last word, and do not speed the lines up. There is no frozen body. Keep the lines the user wrote. If those lines do not fill the beat, add lines in the same voices. Do not add a narrator speech or a closing slogan. If the script says they are far, across the room, or down the hall, keep them that far and choose a wide shot. Name the product only in a scene that has it in a hand, on a surface, or in frame. Every other scene leaves out the product, the package, the box, and the brand. Each place keeps one location name for the whole film. A few minutes later keeps that name and that ground. Night and the next morning in the same room keep that same name, so the same place image comes back whenever the story returns. Do not give one stretch of ground a second name. Do not write 6, 7, or 8 second shots as the normal length, and do not merge shots to make a long scene. Say which way a screen or object faces the camera, for example the monitor screen faces the character and the back of the monitor faces the lens. Before any gaze, state where the camera is relative to the look target, for example camera positioned behind @Image1, shooting down the hallway toward the doorway. Do not give a face direction and a gaze target that compete; say which one wins. If they look at something other than the lens, write eyes NOT on camera, gaze locked on that target. On an emotional close-up add: gaze must not be directed at lens unless explicitly stated. Give each speaking character a distinct voice in voice_notes. A principal who never speaks is still a lead, not an extra, so they get one consistent portrait.
Mark is_extra true for unseen narrators/voice-over, crowd, b-roll, montage, and numbered extras. If the line is narrator voice-over, keep speaker as Narrator. Never move a Narrator line onto an on-screen character. A character talking to himself stays on screen and keeps the line. At most 4 leads. Put background names in extra_names, not character_names. If an attached product appears in a scene, add one short sentence on how: worn on a character, held or used by them, first look and not yet worn, close-up, or far in the shot.
Every scene must list who is on screen. Write emotion in the face and the body. Keep a character the same age and size until a later scene explicitly shows they grew. Clothes may change. A jump of a day or more, a few days later, or weeks later means different clothes, and the scene names them, even in the same room. Face and hair stay. A few minutes later keeps the same clothes. Keep who is in front, behind, left, and right until the action moves them. If they speak to someone, they look at that person. If they hold a door or utensil, write the grip. If glow is behind them, they occlude it. Never write time-lapse as bullets; write each beat as a full physical sentence. Do not paste physics lectures into every summary.
Cut on every new action and every new angle, and give that scene its own camera. Vary wide, close, insert, low, high, and a move. Do not repeat tracking shot. Most scenes are 3 to 5 seconds. A camera move is still usually 3 to 5. Use 2 seconds only for a fast action cut with nobody speaking. Each spoken line needs about 3 seconds, and everything in that scene finishes inside those seconds. Do not put several lines in a 2 second scene. A long exchange can stay in one place for those lines. The part around it moves. Change the place, the action, and the camera when that picture tells more. Most scenes are 3 to 5 seconds. A camera move is still usually 3 to 5. Use 2 seconds only for a fast action cut. When the user already wrote the lines, there is no silent beat. On a concept, a shot stays quiet when nobody in it would speak. Speech lands where the moment can hold it. Do not default to 6, 7, or 8. If the film is longer than 30 seconds, generations are still at most 30s of consecutive story time. The total can be any length from 15 to 500 seconds. Each full 30 seconds is one generation, and the remainder is the last one. 45 is 30+15. 500 is sixteen generations of 30 plus one of 20. A clock range is not a generation. A 15s hook stays 15s. The next beat fills the rest of that 30s generation, and a longer beat may continue in the next generation. Do not stretch a beat to 30s. Carry the clothes, anything being held, and any body change from the last scene of the previous part, unless this scene changes them. Write enough scenes that every part has at least one.
If the user wrote an opening line, put it in scene 1 so audio starts at 0s. On a concept, scene 1 opens on the trouble already happening, and the first spoken line comes at the first moment someone could actually say it.
Then STOP. Do not plan batches. Do not generate frames or video. Do not ask questions.`;

const PRODUCE_PROMPT = `${SYSTEM_PROMPT}

Current task: PRODUCE.
The user already approved the storyboard. Do NOT rewrite or re-extract scenes.
If targetDurationSeconds is 30 or less, call plan_video_batches with EXACTLY one batch covering every scene at that duration (Seedance 2.5 one-shot). If it is 60s, two batches of 30s. If it is 90s, three batches of 30s. Longer films use one generation per 30 seconds of the timeline, up to 500 seconds. A batch may start in the middle of a beat. Do not repeat a moment and do not stretch a short beat to fill 30s.
Then call generate_video_batch for each batch in order until all clips exist. Do not generate a first-frame still.
Do not ask questions. Do not chat.`;

const tools = [
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
        title: {
          type: "string",
          description:
            "A short film title taken from this story, the way a movie is named. Never the running time, and never Ten Seconds or any other duration.",
        },
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
                  "Visual appearance of this character alone: species, colors, clothes. Species is this character's own body. An animal they mention, draw, hold, or say is not their species. Kid, Dad, Mom, Boy, Girl, Wife, and Husband are human unless the script says that character is an animal. For a woman with no photo, pick a skin tone at random and do not default to dark skin. No plot, no other characters, no fight or scene. With a Setup photo, only what the photo shows.",
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
                  "What happens. Inside one continuous moment, start from the previous scene's ending: same place, same distance, same screen sides, same body state, unless this action moves them. A few minutes later stays in the previous place, on the same ground, in the same clothes. A jump of a day or more, including a few days later or weeks later, puts different clothes on everyone in that scene. Name those clothes. Face and hair stay. A new place is only when this action takes them somewhere else. Do not invent a second environment, and do not invent travel just to connect the times. If A sees B and B does not see A, write the distance, who is in frame, and the eyelines. Show complete physical actions and visible emotion in the face and the body. If a character starts tiny/baby/young, keep that size here unless THIS scene is the explicit growth. Same scale versus chairs, tables, and doors. If A speaks to B, write that A looks at B, not the camera. A character talking to himself is on screen. If they grip a door, a body, or a utensil, write the contact. If glow or lights sit behind someone, they occlude it. Clothes may change and it is still the same person, never a second body. Keep who is in front, behind, left, and right until this action moves them. If this beat is the same moment and the same place as the previous scene, say so. CUT to only changes the camera angle on this same action; it does not skip a cause. If an attached product is in this scene, add one short sentence: worn on a named character, held or used by them, seen for the first time and not yet worn, a close-up, or far in the shot. The product photo is the product. A mark printed on it is not a separate logo. Never show it worn in a first-look scene. Never write a time-lapse as a bullet list: write each montage beat as a full physical sentence. Do not append physics-rule lectures.",
              },
              location: { type: "string", description: "The place this beat actually happens. Minutes later in the same situation copies the previous place name and keeps the same ground. A new name is only when they go somewhere else. Reuse a place name when the story returns there." },
              character_names: {
                type: "array",
                items: { type: "string" },
                description: "Only the scene's story principals who are on screen. The system will say Only NAME participate in this scene.",
              },
              extra_names: {
                type: "array",
                items: { type: "string" },
                description: "Background people or animals who appear. The system names only who this scene shows.",
              },
              dialogue: {
                type: "array",
                description: "Lines heard in this scene. On a written script, copy the user's lines. On a concept, add a line only when someone in this moment could speak. The words are specific to this pain, this audience, and this situation. Leave the scene empty when speech would break the action. After the change has landed, a line only if someone there would say what changed. If a person is alone, they say it out loud, or set thought true so the line is heard as their thought with the mouth closed. Never a narrator for that. Never a slogan, a health claim, or a speech from the product page. Never repeat a line and never move a later line onto an earlier scene.",
                items: {
                  type: "object",
                  additionalProperties: false,
                  properties: {
                    speaker: { type: "string", description: "On-screen speaker name for lipsync, or Narrator for voice-over. Narrator is never an on-screen character and is never lipsync. A person alone keeps their own name, even for a thought. Never a Spanish label." },
                    line: { type: "string" },
                    thought: { type: "boolean", description: "True only when this line is heard as that person's thought and the mouth stays closed. False when they say it out loud." },
                  },
                  required: ["speaker", "line"],
                },
              },
              estimated_seconds: {
                type: "number",
                description:
                  "If the user wrote a clock range on this row, use that exact length. Otherwise time the lines briskly: a short line is about 2 seconds, and two or three lines share about 4 to 6 seconds. No extra silence after the last word. Do not use 6, 7, or 8 for a single line.",
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
                    seconds: { type: "number", description: "3 to 5 seconds for a normal action or a short line. 2 seconds only for a fast action cut." },
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
            "Solo logo, producto o locación que el GUION involucra de verdad. Vacío si el texto no los pide. A mark printed on the product is the product, not a logo. The logo kind is only when the logo itself is on screen as its own graphic.",
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
  return (
    /(?:^|\n)\s*(?:scene|escena)\s*\d+\b/i.test(script) ||
    /(?:^|\n)\s*\d+\s*[.)]\s+\S/.test(script) ||
    timestampRows(script).length >= 2
  );
}

function isBareConcept(project: Project) {
  if (project.song) return false;
  if (scriptIsStoryboard(project.scriptText)) return false;
  if (timestampRows(project.scriptText).length >= 2) return false;
  if (/["“][^"”]{2,}["”]/.test(project.scriptText || "")) return false;
  return true;
}

function conceptSpeechBudget(seconds: number) {
  return Math.max(4, Math.min(28, Math.round(Math.max(15, seconds) / 5)));
}

function speechNeed(scene: Scene, line: string, sceneIndex: number, sceneCount: number) {
  const blob = `${scene.title || ""} ${scene.summary || ""} ${line}`.toLowerCase();
  let score = 1;
  if (sceneCount > 1 && sceneIndex >= Math.floor(sceneCount * 0.65)) score += 5;
  if (/\b(?:help|helps|try|need|needed|works|better|again)\b/.test(blob)) score += 2;
  if (/\b(?:tell|tells|told|says|said|ask|asks|asked)\b/.test(blob)) score += 2;
  if (/\b(?:opens?|opening|tears?|rips?|pours?|mixes?|stirs?|drinks?|swallows?|uses?|using|pulls? out)\b/.test(blob)) score += 3;
  if (/\b(?:pack|packet|pouch|stick|sachet|bottle)\b/.test(blob)) score += 2;
  return score;
}

function trimConceptSpeech(project: Project) {
  if (!isBareConcept(project)) return;
  const budget = conceptSpeechBudget(project.targetDurationSeconds || 30);
  const rows: Array<{ scene: number; line: number; score: number }> = [];
  project.scenes.forEach((scene, sceneIndex) => {
    (scene.dialogue || []).forEach((line, lineIndex) => {
      if (!line.line?.trim()) return;
      rows.push({ scene: sceneIndex, line: lineIndex, score: speechNeed(scene, line.line, sceneIndex, project.scenes.length) });
    });
  });
  if (rows.length <= budget) return;
  const ranked = [...rows].sort((a, b) => b.score - a.score || a.scene - b.scene);
  const keep = new Set<string>();
  const perScene = new Map<number, number>();
  for (const row of ranked) {
    if (keep.size >= budget) break;
    const count = perScene.get(row.scene) || 0;
    if (count >= 2) continue;
    keep.add(`${row.scene}:${row.line}`);
    perScene.set(row.scene, count + 1);
  }
  for (const row of ranked) {
    if (keep.size >= budget) break;
    keep.add(`${row.scene}:${row.line}`);
  }
  project.scenes.forEach((scene, sceneIndex) => {
    scene.dialogue = (scene.dialogue || []).filter((line, lineIndex) => line.line?.trim() && keep.has(`${sceneIndex}:${lineIndex}`));
  });
}

function conceptNeedsSpeech(project: Project) {
  if (!isBareConcept(project)) return false;
  if ((project.targetDurationSeconds || 0) < 8) return false;
  return !project.scenes.some((scene) => (scene.dialogue || []).some((line) => line.line?.trim()));
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
    if (start != null && end != null && end > start && end - start <= 180) return end - start;
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
  const columns = block.text.split(/\t/).map((part) => part.trim()).filter(Boolean);
  const last = columns[columns.length - 1] || "";
  const speech = columns.length >= 2 && /[“"]/.test(last);
  const supers = speech
    ? [...last.matchAll(/\b(?:Super|Small print|Text|Title|Caption)\s*:\s*[“"]([^”"]+)[”"]/gi)].map((match) => match[1])
    : [];
  const body = speech ? columns.slice(0, -1).join(" ") : stripCueLines(block.text);
  const cleaned = body
    .replace(/\b([A-Z][A-Za-z'’-]{1,24}(?:\s+[A-Z][A-Za-z'’-]{1,24}){0,2})\s*(?:\([^)]*\))?\s*:?\s*[“"][^”"]+[”"]/g, (full, who: string) =>
      looksLikeSpeaker(who) && !/^(?:super|small print|text|title|caption)$/i.test(who.trim()) ? " " : full,
    )
    .replace(/\s+/g, " ")
    .trim();
  return [...(cleaned ? [cleaned] : []), ...supers]
    .join(" ")
    .replace(/\btext\s+on[\s-]?screen\s*:\s*["“]([^"”]+)["”]/gi, (_full, card: string) => `On-screen text: ${card.trim()}`)
    .replace(/\s+/g, " ")
    .trim();
}

function stripCueLines(text: string) {
  const rows = text.split(/\n/);
  const kept: string[] = [];
  for (let i = 0; i < rows.length; i++) {
    const cue = rows[i].trim().replace(/:$/, "");
    const next = (rows[i + 1] || "").trim();
    if (looksLikeSpeaker(cue) && !/^(?:super|small print|text|title|caption)$/i.test(cue) && /^[“"]/.test(next)) {
      i += 1;
      continue;
    }
    kept.push(rows[i]);
  }
  return kept.join("\n");
}

function linesFromBlock(text: string) {
  const out: Array<{ speaker: string; line: string; voiceover?: boolean; offscreen?: boolean }> = [];
  const skip = /^(?:scene|escena|act|acto|int|ext|end|text|title|super|caption|small print|beat)$/i;
  const rows = text.split(/\n/);
  for (let i = 0; i < rows.length; i++) {
    const cue = rows[i].trim().replace(/:$/, "");
    if (!cue || cue !== cue.toUpperCase() || !looksLikeSpeaker(cue) || skip.test(cue)) continue;
    let at = i + 1;
    const notes: string[] = [];
    while (at < rows.length && /^\([^)]*\)$/.test(rows[at].trim())) {
      notes.push(rows[at].trim());
      at += 1;
    }
    const quoted = (rows[at] || "").trim().match(/^[“"]([^”"]+)[”"]$/);
    if (!quoted) continue;
    const line = cleanSpokenLine(quoted[1]);
    if (!line || out.some((item) => spokenKey(item.line) === spokenKey(line))) continue;
    const note = notes.join(" ");
    const offscreen = /\b(?:o\.?\s*s\.?|off[- ]?screen)\b/i.test(`${cue} ${note}`);
    const voiceover = offscreen || /\b(?:vo|v\.o\.|voice-?over)\b/i.test(`${cue} ${note}`);
    out.push({
      speaker: spokenName(cue),
      line,
      ...(voiceover ? { voiceover: true } : {}),
      ...(offscreen ? { offscreen: true } : {}),
    });
    i = at;
  }
  const quoteRe = /[“"]([^”"]+)[”"]/g;
  let found: RegExpExecArray | null;
  const cueLines = out.length;
  while ((found = quoteRe.exec(text))) {
    const line = cleanSpokenLine(found[1]);
    if (!line) continue;
    const tagged = speakerAt(text.slice(0, found.index));
    if (tagged && skip.test(tagged.name)) continue;
    if (!tagged && out.length === cueLines) continue;
    const speaker = tagged ? tagged.name : out[out.length - 1].speaker;
    const note = tagged ? tagged.note : out[out.length - 1].voiceover ? "(VO)" : "";
    if (!speaker || skip.test(speaker) || !looksLikeSpeaker(speaker)) continue;
    if (out.some((item) => spokenKey(item.line) === spokenKey(line))) continue;
    const bareVoice = /^(?:vo|v\.o\.|voice-?over|voiceover)$/i.test(speaker);
    const offscreen = bareVoice || /\b(?:o\.?\s*s\.?|off[- ]?screen)\b/i.test(note);
    const voiceover = offscreen || /\b(?:vo|v\.o\.|voice-?over)\b/i.test(note);
    out.push({
      speaker: bareVoice ? "Narrator" : spokenName(speaker),
      line,
      ...(voiceover ? { voiceover: true } : {}),
      ...(offscreen ? { offscreen: true } : {}),
    });
  }
  for (let i = 0; i < rows.length; i++) {
    const cue = rows[i].trim().replace(/:$/, "");
    const quoted = (rows[i + 1] || "").trim().match(/^[“"]([^”"]+)[”"]/);
    if (!quoted || !looksLikeSpeaker(cue) || skip.test(cue)) continue;
    const line = cleanSpokenLine(quoted[1]);
    if (!line || out.some((item) => spokenKey(item.line) === spokenKey(line))) continue;
    const offscreen = /\b(?:o\.?\s*s\.?|off[- ]?screen)\b/i.test(rows[i]);
    const voiceover = offscreen || /\b(?:vo|v\.o\.|voice-?over)\b/i.test(rows[i]);
    out.push({
      speaker: spokenName(cue),
      line,
      ...(voiceover ? { voiceover: true } : {}),
      ...(offscreen ? { offscreen: true } : {}),
    });
  }
  if (out.length) return out;
  for (const raw of text.split(/\n/)) {
    const namedVoice = raw.trim().match(/^(?:vo|v\.o\.|voice-?over)\s*\(([^)]+)\)\s*:\s*(.+)$/i);
    if (namedVoice) {
      const line = cleanSpokenLine(namedVoice[2]);
      const speaker = spokenName(namedVoice[1].trim());
      if (line && speaker) out.push({ speaker, line, voiceover: true });
      continue;
    }
    const match = raw.trim().match(/^([^:]{2,40}):\s*(.+)$/);
    if (!match) continue;
    const speaker = match[1].replace(/\([^)]*\)/g, "").trim();
    if (!speaker || skip.test(speaker) || !looksLikeSpeaker(speaker)) continue;
    const line = cleanSpokenLine(match[2]);
    if (!line) continue;
    const voiceover = /^(?:vo|v\.o\.|voice-?over|voiceover)$/i.test(speaker) || offScreenCue(match[1]);
    out.push({
      speaker: voiceover && /^(?:vo|v\.o\.|voice-?over|voiceover)$/i.test(speaker) ? "Narrator" : spokenName(speaker),
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

function looksLikeSpeaker(raw: string) {
  const words = raw.trim().split(/\s+/).filter(Boolean);
  if (!words.length || words.length > 3) return false;
  if (words.some((word) => /^(?:hook|reverse|insert|close-up|closeup|wide|medium|dolly|mirror|dawn|time-lapse|timelapse|super|caption|beat|int|ext|quick|two-shot)$/i.test(word))) return false;
  return words.every((word) => /^[A-Z][A-Z'’-]*$/.test(word) || /^[A-Z][a-z'’-]+$/.test(word));
}

function speakerAt(before: string) {
  const match = before.match(/(?:^|[^\w])([A-Z][A-Za-z'’-]{1,24}(?:\s+[A-Z][A-Za-z'’-]{1,24}){0,2})\s*(\([^)]{0,80}\))?\s*:\s*$/);
  if (!match || !looksLikeSpeaker(match[1])) return undefined;
  return { name: match[1].trim(), note: match[2] || "" };
}

function spokenName(raw: string) {
  const name = englishSpeakerName(raw.trim());
  if (name === name.toUpperCase() && /[A-Z]/.test(name)) return name.charAt(0) + name.slice(1).toLowerCase();
  return name;
}

function offScreenCue(note: string) {
  return /\b(?:o\.?\s*s\.?|vo|v\.o\.|voice-?over|off[- ]?screen)\b/i.test(note);
}

function plainScriptLine(raw: string) {
  return raw.replace(/\|/g, " ").replace(/\*\*/g, "").replace(/\*/g, "").replace(/\s+/g, " ").trim();
}

function timestampRows(script: string): StoryBlock[] {
  const rows: StoryBlock[] = [];
  const rangeRe = /(\d{1,2}:\d{2})\s*(?:to|–|—|-)\s*(\d{1,2}:\d{2})/i;
  let current: { number: string; start: string; end: string; seconds: number; text: string[] } | undefined;
  const write = () => {
    if (!current) return;
    const text = current.text.join("\n").trim();
    const row = current;
    current = undefined;
    if (!text) return;
    rows.push({
      label: `${row.number} ${row.start}-${row.end}`,
      text,
      seconds: row.seconds,
      headingSeconds: row.seconds,
    });
  };
  for (const raw of script.split(/\n/)) {
    const plain = plainScriptLine(raw);
    const match = plain.match(rangeRe);
    const at = match ? plain.indexOf(match[0]) : -1;
    if (match && at >= 0 && at < 24) {
      const start = clockSeconds(match[1]);
      const end = clockSeconds(match[2]);
      if (start != null && end != null && end > start && end - start <= 180) {
        write();
        const rest = plain.slice(at + match[0].length).replace(/^\s*\([^)]*\)\s*/, " ").trim();
        current = {
          number: String(rows.length + 1),
          start: match[1],
          end: match[2],
          seconds: end - start,
          text: rest ? [rest] : [],
        };
        continue;
      }
    }
    if (current && raw.trim()) current.text.push(raw);
  }
  write();
  return rows;
}

function storyboardBlocks(script: string): StoryBlock[] {
  const rows = timestampRows(script);
  if (rows.length >= 2) return rows;
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

function isCardBlock(block: StoryBlock) {
  return isCardLabel(block.label) || /^\s*(?:end\s*card|tarjeta\s+final)\b/i.test(block.text);
}

function sceneDialogue(block: StoryBlock) {
  const dialogue = linesFromBlock(block.text);
  const kept = isCardBlock(block) ? dialogue.filter((line) => line.voiceover) : dialogue;
  return kept.map(({ speaker, line, voiceover }) => ({ speaker, line, ...(voiceover ? { voiceover: true } : {}) }));
}

function sceneFromBlock(block: StoryBlock): Scene {
  const action = actionText(block);
  const dialogue = linesFromBlock(block.text);
  const place = `${block.label} ${block.text}`.match(/\b(?:INT|EXT)\.?\s+([^.\n]+)/i)?.[1]?.trim() || "";
  const card = isCardBlock(block);
  const spoken = sceneDialogue(block);
  const seconds = Math.min(180, Math.max(2, block.headingSeconds || estimateSceneSeconds({ summary: action, dialogue: spoken })));
  return {
    id: createId("scene"),
    index: 0,
    title: block.label.replace(/\s*\([^)]*\)\s*$/, "").slice(0, 90),
    summary: action || block.label,
    location: card ? placeNamedIn(action) || place : place,
    characterNames: card
      ? []
      : [...new Set(dialogue.filter((line) => !line.offscreen).map((line) => line.speaker).filter((speaker) => speaker && !NARRATOR_NAME.test(speaker)))],
    extraNames: [],
    dialogue: spoken,
    estimatedSeconds: seconds,
    camera: "",
    shots: [],
  };
}

function castOnScreen(scenes: Scene[]) {
  const names = [...new Set(scenes.flatMap((scene) => (scene.dialogue || []).map((line) => line.speaker)).filter((name) => name && !NARRATOR_NAME.test(name)))];
  for (const scene of scenes) {
    if (isCardLabel(scene.title) || /^\s*(?:end\s*card|tarjeta\s+final)\b/i.test(scene.summary || "")) continue;
    const present = names.filter((name) => new RegExp(`\\b${name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, "i").test(scene.summary || ""));
    scene.characterNames = [...new Set([...(scene.characterNames || []), ...present])];
  }
}

function absorbDraftedDialogue(
  project: Project,
  drafted: Array<{ title: string; summary: string; dialogue: Scene["dialogue"] }>,
) {
  const used = new Set<number>();
  for (const scene of project.scenes) {
    let best = -1;
    let score = 0;
    drafted.forEach((item, index) => {
      if (used.has(index)) return;
      const nextScore = overlapScore(`${scene.title} ${scene.summary}`, `${item.title} ${item.summary}`);
      if (nextScore > score) {
        score = nextScore;
        best = index;
      }
    });
    if (best < 0 || score < 0.2) continue;
    used.add(best);
    const have = new Set((scene.dialogue || []).map((line) => spokenKey(line.line || "")).filter(Boolean));
    for (const line of drafted[best].dialogue || []) {
      const key = spokenKey(line.line || "");
      if (!key || have.has(key)) continue;
      scene.dialogue = [...(scene.dialogue || []), line];
      have.add(key);
    }
  }
}

function applyUserStoryboard(project: Project) {
  if (project.song || !scriptIsStoryboard(project.scriptText)) return;
  const drafted = project.scenes.map((scene) => ({
    title: scene.title || "",
    summary: scene.summary || "",
    dialogue: (scene.dialogue || []).map((line) => ({ ...line })),
  }));
  const rows = timestampRows(project.scriptText);
  if (rows.length >= 2) {
    const scenes = rows.map((block) => {
      const scene = sceneFromBlock(block);
      return scene;
    });
    castOnScreen(scenes);
    project.scenes = scenes.map((scene, index) => ({ ...scene, index: index + 1 }));
    const clocks = [...rows[rows.length - 1].label.matchAll(/(\d{1,2}:\d{2})/g)];
    const endClock = clocks.length ? clockSeconds(clocks[clocks.length - 1][1]) : undefined;
    if (endClock) project.targetDurationSeconds = clampTotalDuration(endClock);
    return;
  }
  const blocks = storyboardBlocks(project.scriptText);
  if (blocks.length < 2) return;
  const timedHeadings = blocks.filter((block) => block.headingSeconds);
  if (timedHeadings.length >= 2 && timedHeadings.length === blocks.length) {
    const scenes = blocks.map((block) => sceneFromBlock(block));
    castOnScreen(scenes);
    project.scenes = scenes.map((scene, index) => ({ ...scene, index: index + 1 }));
    return;
  }
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
      const parsed = linesFromBlock(block.text);
      scene.dialogue = card ? parsed.filter((line) => line.voiceover) : parsed;
      if (card) {
        scene.characterNames = [];
        scene.extraNames = [];
        const spot = placeNamedIn(action);
        if (spot) scene.location = spot;
      }
      if (block.headingSeconds) {
        scene.estimatedSeconds = Math.min(180, Math.max(2, block.headingSeconds));
        scene.shots = [];
      }
      const mentioned = namesMentioned(project, `${action} ${(scene.dialogue || []).map((line) => line.speaker).join(" ")}`);
      if (!card && mentioned.length) scene.characterNames = [...new Set(mentioned)];
      next.push(scene);
    } else {
      const created = sceneFromBlock(block);
      if (block.headingSeconds) created.estimatedSeconds = Math.min(180, Math.max(2, block.headingSeconds));
      next.push(created);
    }
  }
  project.scenes = next.map((scene, index) => ({ ...scene, index: index + 1 }));
  absorbDraftedDialogue(project, drafted);
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

function spokenKey(line: string) {
  return line.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

function dropRepeatedLines(project: Project) {
  const seen = new Set<string>();
  for (const scene of project.scenes) {
    const local = new Set<string>();
    scene.dialogue = (scene.dialogue || []).filter((line) => {
      const narrated = Boolean(line.voiceover) || NARRATOR_NAME.test(line.speaker || "");
      if (!narrated) return true;
      const key = spokenKey(line.line || "");
      if (!key || local.has(key) || seen.has(key)) return false;
      local.add(key);
      seen.add(key);
      return true;
    });
  }
}

function lineBuckets(lines: Array<{ speaker: string; line: string; voiceover?: boolean }>, count: number) {
  const buckets = Array.from({ length: count }, () => [] as Array<{ speaker: string; line: string; voiceover?: boolean }>);
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
  const spoken = project.scenes.flatMap((scene) => (scene.dialogue || []).map((line) => line.line || ""));
  const next: Scene[] = [];
  for (const scene of project.scenes) {
    if (userTimedSeconds(scene.title, scene.estimatedSeconds || 0) || (scene.estimatedSeconds || 0) >= 4) {
      scene.summary = dropSpeechFragments(scene.summary || "", spoken);
      next.push(scene);
      continue;
    }
    const summary = dropSpeechFragments(scene.summary || "", spoken);
    const sentences = beatParts(summary);
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
        dialogue: card ? dialogue.filter((line) => line.voiceover) : dialogue,
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
  joinSameBeat(project);
  dropEchoScenes(project);
}

function joinSameBeat(project: Project) {
  if (project.song || project.scenes.length < 2) return;
  const next: Scene[] = [];
  for (const scene of project.scenes) {
    const prev = next[next.length - 1];
    const title = scene.title.trim().toLowerCase();
    const same =
      prev &&
      title.length > 0 &&
      prev.title.trim().toLowerCase() === title &&
      (prev.estimatedSeconds || 0) + (scene.estimatedSeconds || 0) <= 30;
    if (!same || !prev) {
      next.push(scene);
      continue;
    }
    prev.summary = [prev.summary, scene.summary].filter(Boolean).join(" ");
    const seen = new Set((prev.dialogue || []).map((line) => spokenKey(line.line || "")));
    for (const line of scene.dialogue || []) {
      const key = spokenKey(line.line || "");
      if (!key || seen.has(key)) continue;
      prev.dialogue = [...(prev.dialogue || []), line];
      seen.add(key);
    }
    prev.estimatedSeconds = (prev.estimatedSeconds || 0) + (scene.estimatedSeconds || 0);
    prev.shots = [];
  }
  if (next.length === project.scenes.length) return;
  project.scenes = next.map((scene, index) => ({ ...scene, index: index + 1 }));
}

function dropEchoScenes(project: Project) {
  const spoken = project.scenes.flatMap((scene) => (scene.dialogue || []).map((line) => line.line || ""));
  const said = new Set<string>();
  const next: Scene[] = [];
  for (const scene of project.scenes) {
    const visual = dropSpeechFragments(scene.summary || "", spoken);
    const own = (scene.dialogue || []).filter((line) => line.line?.trim());
    const fresh = own.filter((line) => {
      const key = spokenKey(line.line || "");
      return key && !said.has(key);
    });
    for (const line of own) {
      const key = spokenKey(line.line || "");
      if (key) said.add(key);
    }
    if (!visual && !fresh.length) continue;
    next.push({ ...scene, summary: visual || (scene.location ? `In the ${scene.location}.` : "The shot holds.") });
  }
  if (!next.length) return;
  project.scenes = next.map((scene, index) => ({ ...scene, index: index + 1 }));
}

function splitLongExchanges(project: Project) {
  if (project.song) return;
  const board = scriptIsStoryboard(project.scriptText);
  const next: Scene[] = [];
  for (const scene of project.scenes) {
    if (userTimedSeconds(scene.title, scene.estimatedSeconds || 0) || (scene.estimatedSeconds || 0) >= 4) {
      next.push(scene);
      continue;
    }
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
    const kept = userTimedSeconds(scene.title, written);
    if (project.song) {
      scene.dialogue = [];
      scene.estimatedSeconds = Math.max(2, Math.min(30, Math.round(written * 10) / 10));
    } else if (kept) {
      scene.estimatedSeconds = Math.min(180, Math.max(2, kept));
    } else if (!timed) {
      const spoken = (scene.dialogue || []).some((line) => line.line?.trim());
      scene.estimatedSeconds = spoken
        ? sceneSpeechFloor(scene)
        : Math.max(3, Math.min(4, Math.round(written * 10) / 10));
    } else if ((scene.estimatedSeconds || 0) < 4) {
      scene.estimatedSeconds = contentSeconds(scene);
      scene.shots = [];
    } else {
      scene.shots = [];
    }
  }
  if (timed && timestampRows(project.scriptText).length < 2) {
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
      project.scenes[best].estimatedSeconds = Math.min(180, Math.max(2, block.seconds));
    }
  }
  if (!project.song) fitSpokenScenes(project.scenes, target);
  const durationOf = (scene: Scene) => {
    const lock = userTimedSeconds(scene.title, scene.estimatedSeconds) || (/end\s*card|tarjeta\s+final/i.test(`${scene.title} ${scene.summary}`) ? scene.estimatedSeconds : undefined);
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
  stampLaterClothes(project);
  project.scenes = project.scenes.map((scene) => ensureSceneShots(scene));
}

const DAY_OR_MORE =
  /\b(?:days later|weeks later|a week later|months later|the next week|the next day|next morning|the following (?:day|morning|night|week)|days after|weeks after)\b/i;
const NAMED_CLOTHES =
  /\b(?:hoodie|t-?shirt|tee|shirt|blouse|dress|skirt|jeans|pants|trousers|shorts|jacket|coat|sweater|sweatshirt|cardigan|suit|uniform|scrubs|sneakers?|shoes?|boots?|leggings|sweatpants|joggers|blazer|vest|polo|tank top|crop top|different clothes|now wears|now wearing)\b/i;

function stampLaterClothes(project: Project) {
  if (project.song) return;
  const note = "A day or more has passed. Everyone here wears different clothes from before this jump. Face and hair stay the same.";
  let carry = false;
  for (const scene of project.scenes) {
    const blob = `${scene.title || ""} ${scene.summary || ""} ${(scene.shots || []).map((shot) => shot.action || "").join(" ")}`;
    const jump = DAY_OR_MORE.test(blob);
    const piece = carry && /\bcontinued\b/i.test(scene.title || "");
    if (!jump && !piece) {
      carry = false;
      continue;
    }
    carry = true;
    if (NAMED_CLOTHES.test(blob) || /different clothes from before this jump/i.test(blob)) continue;
    scene.summary = `${(scene.summary || "").trim()} ${note}`.trim();
  }
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
      const incoming = parseSceneList(args.scenes);
      if (!incoming.length) throw new Error("extract_storyboard needs every scene. The scenes array was empty.");
      const requestedTitle = String(args.title || "");
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
      project.scenes = incoming.map((item) => {
        const dialogue = project.song
          ? []
          : ((item.dialogue as Array<{ speaker: string; line: string; thought?: boolean }>) || []).map((line) => ({
              speaker: englishSpeakerName(line.speaker),
              line: line.line,
              ...(line.thought ? { voiceover: true } : {}),
            }));
        const summary = project.song ? songPicture(String(item.summary || "")) : String(item.summary || "");
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
      applyUserStoryboard(project);
      splitPackedBeats(project);
      splitLongExchanges(project);
      dropRepeatedLines(project);
      refineStoryLeads(project);
      diversifyInventedCast(project);
      applyScriptLooks(project);
      dropUnscriptedDialogue(project);
      project.title = filmTitle(requestedTitle, project.scenes);
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
      if (await extendShortStory(project, abortSignal)) scaleScenesToTarget(project);
      project.pendingQuestions = (args.questions_for_user as string[]) || [];
      project.scriptRefCues = ((args.mentioned_refs as Array<Record<string, unknown>>) || []).map((item) => ({
        kind: item.kind as ScriptRefCue["kind"],
        cue: String(item.cue || ""),
        sceneIndexes: (item.scene_indexes as number[]) || [],
      }));
      ensureReferenceSlots(project);
      syncReferenceInclusion(project);
      try {
        await ensureScenePlaces(project);
        await ensureProductScenes(project);
      } catch (error) {
        console.warn("story read", project.id, error instanceof Error ? error.message : error);
      }
      stampProductPlacement(project);
      trimConceptSpeech(project);
      if (conceptNeedsSpeech(project)) {
        throw new Error(
          "This concept has no spoken lines. Add a line at the first moment someone in this situation could actually speak, about the pain or about the change, in words specific to it. Leave a moment silent when speech would break it. Do not write a slogan or a product claim.",
        );
      }
      project.workflowStep = "cast";
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

function asRecord(value: unknown) {
  if (!value) return {};
  if (typeof value === "object") return value as Record<string, unknown>;
  if (typeof value !== "string") return {};
  return JSON.parse(value) as Record<string, unknown>;
}

function parseSceneList(value: unknown) {
  const list = typeof value === "string" ? asRecordArray(value) : value;
  if (!Array.isArray(list)) return [];
  return list.filter((item): item is Record<string, unknown> => Boolean(item) && typeof item === "object" && Boolean(String((item as Record<string, unknown>).summary || (item as Record<string, unknown>).title || "").trim()));
}

function asRecordArray(value: string) {
  try {
    return JSON.parse(value) as unknown;
  } catch {
    return [];
  }
}

const NARRATOR_NAME = /^(the\s+)?(narrator|narradora|voice[- ]?over|voiceover|vo|off[- ]?screen|voz en off)$/i;

function songPicture(summary: string) {
  const cleaned = summary
    .split(/("(?:[^"\\]|\\.)*")/g)
    .map((part, index) =>
      index % 2 === 1
        ? part
        : part
            .replace(/\b(?:sings|singing) along\b[^.]*\.?/gi, "")
            .replace(/\b(?:mouths|mouthing) the (?:lyric|words|line)\b[^.]*\.?/gi, "")
            .replace(/\b(?:into|at) a mic\b[^.]*\.?/gi, "")
            .replace(/\blip-?sync(?:h|ed|ing)?\b[^.]*\.?/gi, "")
            .replace(/\b(?:performs|performing) the (?:hook|chorus|song|line)\b[^.]*\.?/gi, ""),
    )
    .join("");
  return cleaned.replace(/\s{2,}/g, " ").replace(/\s+([,.])/g, "$1").trim();
}

function planTask(project: Project) {
  const styleLine = `Style: ${project.style}. Pixar, claymation, and realistic use this same story. The style only changes how the picture looks. Aspect: ${project.aspectRatio}. Call extract_storyboard once, then stop.`;
  if (project.song) {
    const parts = project.song.clips
      .map(
        (clip) =>
          `part ${clip.index} covers the song from ${clip.startSeconds}s for ${clip.durationSeconds}s (max ${clip.durationSeconds}s)`,
      )
      .join("; ");
    const hasProduct = project.references.some(
      (item) => item.kind === "product" && (item.originalPublicPath || item.originalRemoteUrl),
    );
    const named = project.song.productBrief?.trim() || "";
    const about = hasProduct
      ? named
        ? `The user is selling this product and brand: ${named}. `
        : "The user is selling the product in the attached product photo. "
      : "There is no product. Tell the story in the lyrics. Do not invent a brand, a pack, or a product. ";
    const productRules = hasProduct
      ? `The attached product is the solution, even when a line never names a brand. Open on the problem the words point at, already happening. Those scenes have no product in frame. Do not write the brand, the pack, or "the attached product" into a problem scene. The product appears only when the story turns to the fix. That scene is the first time it is visible. Write "the attached product" there and show them using it the way this product is used, in the place that use would really happen. Match the photo exactly: the product itself and its package, same shape, color, print, and material. A mark printed on it is that photo, not the logo upload. Do not show only the box. Later scenes may keep it only while the result of using it is still on screen, including the next morning, until a scene takes it off. Do not paste it onto every line. In mentioned_refs, list the product only with the scene indexes where that solution is on screen. `
      : "Open on the problem the words point at, already happening. ";
    const closeLine = hasProduct
      ? "The close shows the product being used, then what follows, each where it would actually be seen."
      : "The close shows how the story turns out, in the place that ending would really happen.";
  const songTask = `SONG VIDEO. This is a promo film cut to a ${Math.round(project.song.durationSeconds)} second song. ${about}The lyrics are the story, in the order they are sung. Read them as one film with a problem and then a solution, the same shape as every other film. The style only changes how the picture looks. ${productRules}
The picture shows the event the line is about. It is not a performance. Nobody sings, nobody mouths the words, and nobody stands at a mic. Do not write sings along, singing, or lip-sync. Mouths stay closed. A verse, a chorus, a bridge, and an outro each get their own shots, so the picture keeps moving. The place and the clothes stay until the lyric itself takes them somewhere else. A later minute of the same situation stays in that place, on the same ground. Do not change the room, the ground, or the clothes just because a new section starts. A jump of a day or more still changes the clothes, and you name the new ones. Face and hair stay. When the story does need another place, that is when the clothes change to fit it. Do not invent a trip just to connect them. Inside one section, cut when the action changes. A line that is still that same moment stays in that place, in those clothes. Face and hair stay. A line that names an object, a place, or a physical action keeps it. A line that only names a feeling or a relationship uses the concrete cause in the story reading for this take. Do not replace that cause with a more familiar one, and do not restage it the way another upload of this song would. ${closeLine}
Each scene is one lyric line, or two short lines that are the same picture. Do not skip a line that shows a new action, and do not put a whole section into one scene. Early lines belong to the earlier parts, later lines to the later parts. Never repeat a line in a later part. Every summary starts with the exact sung words, in quotes, then the action those words are showing: While the song plays "exact lyric", then one physical action in that place. Copy the lyric from the script. Do not paraphrase it and do not invent a line. Every dialogue array stays empty. There is no narrator and no generated voice. The attached song is the only audio and it is already playing on frame one: do not open with a title card, a logo sting, or a silent intro. Ignore the spoken-line and [NO BGM] rules. Change the camera when the action changes. Use wide, full, medium, close-up, insert, low angle, high angle, tracking, dolly, handheld, and dutch, and do not repeat the same size twice in a row. ${parts}. One scene is one action and one camera. Most scenes are 2 or 3 seconds, longer only when that lyric line itself is longer. Write enough scenes that the seconds inside each part add up to that part. ${styleLine}`;
    const understood = productUnderstandingBrief(project);
    const songContext = understood
      ? `${understood} HOW IT IS USED is the physical action. WHEN IT IS USED is the situation from the page. Show the product used in that situation. Never read this aloud. Never turn the page into a slogan or a health claim.`
      : "";
    return withStoryReading(project, `${songTask} ${songContext}`.trim());
  }
  const parts = seedancePartDurations(project.targetDurationSeconds || 15).map(
    (duration, index) => `part ${index + 1} (max ${duration}s)`,
  );
  const ordered = scriptIsStoryboard(project.scriptText);
  const timedRows = timestampRows(project.scriptText).length >= 2;
  const opening = timedRows
    ? "The user wrote a timed script. A clock range is that beat's length, not a generation. 00:00-00:15 is 15 seconds. Keep that order. Copy the action and every spoken line under that clock, in their words, including a VO quote in full. Do not move a phrase from a later VO onto an earlier scene. A sound note with no VO and no quotes is not a spoken line, so that scene's dialogue stays empty. estimated_seconds is the clock range. Do not change 15 seconds into 30 because a generation holds 30. Do not drop a line and do not rewrite a line. O.S. stays off-screen. VO is Narrator, off-screen, not lipsynced. The picture in that scene is the action the line describes: if the line says the mouth opens, show the mouth opening, not a closed mouth. Say each line in one scene only. Do not copy it into the next scene. If a clock is long for the lines under it, about one short line every 3 seconds, add lines in those same voices that continue that beat. The added lines stay inside that clock. They do not change the ending the user wrote."
    : ordered
    ? "The user already ordered this as a storyboard. Keep every heading, in that order, including a montage and an end card. Do not skip or replace one. Copy every action they wrote and every line they wrote, in their words, said by that speaker. Do not replace a line with a different sentence. A heading that already says its seconds is one scene of that length. Keep every action and every spoken line of that heading inside that one scene. Do not split it into one scene per sentence, and do not shorten it to 2 seconds. If one heading contains several beats or the word montage and it does not already give its seconds, make one scene per beat instead of one scene with CUT to inside it. A montage beat that changes room or time of day is a new place, not a continuation of the previous room. An act range is the span of those scenes together, not the length of a single scene. Do not stretch one scene to 20 seconds to fill the act, and do not crush several beats into 2 seconds. The scenes together stay inside the target duration. Do not add a part past it. If a heading is long and has too few lines, add lines in those voices and write the blocking the picture needs. If a heading itself says how many seconds that one card lasts, keep that."
    : "The user gave a concept, a paragraph, or a few lines, not a timed scene list. The STORY READING already decided the aim, the problem, the solution, and the pictures. Stage PICTURES. Do not replace that film with a different one. Then write a finished film of the target duration. Keep the events in the order they told them. Name each person once and reuse that name. Write the dialogue, the places, and the blocking yourself. Decide from this situation whether the problem is said, shown, or both. If someone there can talk, they say what is wrong in the words that moment would pull out of them. If they cannot, the picture carries it, and the next person who can speak names it. Do not invent a conversation the moment would not have. Do not put a line on every shot. A person alone says a line out loud, or thinks it so it is heard, only when that moment would have one. A 30 second film is one continuous story, cut into shots when the action or the angle changes. Follow the time map. Open on the hook already happening. Do not put a calm setup before it. Inside a part, change the camera and the action when that tells this story better. Keep the place and the ground until they go somewhere else. A few minutes later is still that place. Time can pass there. Do not invent a second environment for it. Do leave when the next action would not happen in that room: a laptop, a call, a meal, or sleep happens where a person would really do it. When a scene is a day or more later, a few days later, or weeks later, name different clothes from before that jump, even in the same room. Face and hair stay. A few minutes later keeps the same clothes. Do not invent a trip just to connect the times. Then show the solution being used where someone would really use it. Then stay with what follows, long enough to see the change. If that change is the rest of the same event, stay in the event. If someone can speak, they say what changed in the words that moment would use, inside the story. The pictures fill the target. The lines fill only the moments that can hold them. The last shot is one continuous landing, long enough for someone to say what changed. Do not end on a burst of cuts. A short line is about 3 seconds. If the story would end while time is still left, the remaining scenes are that life after, not a silent hold and not a tour of unrelated days. If a product is attached or named, it is the solution and it appears in the close, used the way a person really uses it and in the situation the page describes, not during the problem. The attached product photo is the product. A mark printed on the product is that same photo, not the logo upload. In a later scene, if the product was already on someone, it stays where it was left, including the next morning, until a scene takes it off. When the moment changes, the clothes change to fit it. Face and hair stay. Make the pictures creative and specific to this story. Move the frame as the feeling changes: a reaction, a close insert, a wider view, or a cut to another moment when that picture says more than staying on the same setup. Put each action where it would really happen. Do not solve every story with the same kind of cut. If there is no product, the turn is still the solution and the later scene, and both get room. A quiet shot is any moment where nobody would speak. Do not add a line just to fill a walk. Do not add a slogan or a health claim.";
  const known = castBrief(project);
  const understood = productUnderstandingBrief(project);
  const pages = understood
    ? `${understood} HOW IT IS USED is the physical action. WHEN IT IS USED is the situation the page gives, and that is where the action belongs. On a concept, the use stays in that situation. Talk only where someone in that moment could speak. Do not pause the event for a conversation it would not have. Do not invent a different routine. The other names in ALSO CALLED are the same product. Never read this aloud. Never turn the page into a slogan or a health claim. On a written script, the product appears only where that script puts it. On a concept, it appears when the story reaches the solution, in the situation the page describes.`
    : productPageBrief(project)
      ? "A product page is included. Use it only for how the product is used and how it should look. Never read the page aloud. Never add a slogan or a health claim from the page. Keep every line the user wrote. Added lines are story, not page copy."
      : "";
  const presence =
    "The product image and the logo belong only to a scene whose action has them in a hand, on a surface, or in frame. A scene that does not need them leaves out the product, the package, the box, the logo, and the brand. On a concept, that scene is the turn. On a written script, it is only a scene the script already gives the product.";
  const watched = [understood ? "" : productLookBrief(project), productUseBrief(project)].filter(Boolean).join(" ");
  const timing = timedRows
    ? "Each clock range is that beat's length. A 15 second hook stays 15 seconds. Do not stretch it to fill a 30 second generation."
    : ordered
    ? "Every second has a spoken line or a physical action that moves the story. There is no silent beat and no hold after the last word. About one short line every 3 seconds, and the body acts through the line. Several lines share a scene when they are one exchange, and that scene is long enough for every line to be said in full. A two-line exchange can keep one shot size. Use 2 seconds only for a fast action cut with nobody speaking. If the script says they are far, keep that distance in a wide shot. Keep every line the user wrote, and add lines when the film would otherwise be thin. A line marked VO or O.S. stays off-screen and is not lipsynced. The body still does what that line says. Do not repeat a line in the next scene."
    : "A line only where someone in that moment could speak. Show the problem when speech would break the action. After the change, a line only if someone there would say what changed. No slogan and no product claim.";
  const language = project.dialogueLanguage === "spanish" ? "Spanish" : "English";
  const arc = timedRows
    ? "The clocks already set the order. Keep them. Added lines stay inside their clock. Across those clocks the film still reads as an opening, a knot, and a close. Do not move the ending into an earlier clock."
    : ordered
      ? `${storyArc(project.targetDurationSeconds || 15)} Keep every heading they wrote, in their order. If those pages are thinner than this length, the extra time shows the change, not a longer opening. If they never say what changed, add that only when someone in those pictures could speak, in their voices, without replacing their pictures.`
      : storyArc(project.targetDurationSeconds || 15);
  return withStoryReading(
    project,
    `${opening} ${known} ${pages} ${watched} ${presence} ${arc} Dialogue language: ${language}. Every line you write is in ${language}. A line the user already wrote stays in their words. Target total duration: ${project.targetDurationSeconds}s. The story you write fills that length. Generations are at most 30s of consecutive story time (${parts.join(", ")}). A generation is not one heading. A short beat stays short and the next beat fills the rest of that generation. Do not stretch a clock. ${timing} ${styleLine}`,
  );
}

function withStoryReading(project: Project, task: string) {
  const brief = project.storyBrief?.trim();
  if (!brief) return task;
  return `STORY READING. This is the film, already understood. AIM is what it is for. ABOUT is the story. PROBLEM is the trouble. SOLUTION is the fix and where it is used. PICTURES is the order of what the camera shows. Write the scenes from PICTURES. If the script already has scenes, visuals, dialogue, or times, those stay: the same pictures, the same lines, on the same beats, for the times they wrote. Add only what the chosen length still needs. If the script never shows the change after the fix, the seconds you add are that change. A line there only if someone in those pictures could speak. Do not restage their film as a different one.\n${brief}\n\n${task}`;
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

  if (!getSecrets().claudeApiKey) throw new Error("CLAUDE_API_KEY is missing.");
  console.info("storyboard model", SONNET_MODEL);
  const onStatus = (text: string) => options.onEvent({ type: "status", text });
  const signal = options.abortSignal;
  if (mode === "plan") {
    onStatus("Reading the product…");
    await ensureProductUnderstanding(options.project);
    onStatus("Reading the story…");
    await ensureStoryBrief(options.project, signal);
    options.onEvent({ type: "project", project: options.project });
  }
  const activeTools = toolsFor(mode).map((tool) => ({
    name: tool.name,
    description: tool.description,
    input_schema: tool.parameters as Record<string, unknown>,
  }));
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

  let messages: SonnetMessage[] = [
    {
      role: "user",
      content: [
        `Current project state:\n${JSON.stringify(projectSnapshot(options.project), null, 2)}`,
        options.project.scriptText
          ? `\n\nSCRIPT (${options.project.scriptName || "pasted"}):\n${options.project.scriptText.slice(0, 40000)}`
          : "",
        productPageBrief(options.project) ? `\n\n${productPageBrief(options.project)}` : "",
        productUseBrief(options.project) ? `\n\n${productUseBrief(options.project)}` : "",
        `\n\nTASK:\n${userText}`,
      ].join(""),
    },
  ];

  throwIfAborted(signal);
  let turn = await sonnetTools({
    system: instructions,
    messages,
    tools: activeTools,
    signal,
  });

  const maxSteps = mode === "plan" ? 4 : 80;
  for (let step = 0; step < maxSteps; step += 1) {
    throwIfAborted(signal);
    const calls = turn.toolUses.filter((call) => call.name !== "extract_storyboard" || parseSceneList((call.input as { scenes?: unknown }).scenes).length > 0);
    if (!calls.length) break;

    const results: Array<{ type: "tool_result"; tool_use_id: string; content: string }> = [];
    let planned = false;
    for (const call of calls) {
      throwIfAborted(signal);
      onStatus(mode === "plan" ? "Building scenes…" : `Agent: ${call.name}`);
      let result: unknown;
      try {
        result = await executeTool(options.project, call.name, asRecord(call.input), onStatus, signal);
        options.onEvent({ type: "project", project: options.project });
        if (mode === "plan" && options.project.scenes.length) planned = true;
      } catch (error) {
        if (isAbortError(error)) throw error;
        result = { error: error instanceof Error ? error.message : String(error) };
      }
      results.push({
        type: "tool_result",
        tool_use_id: call.id,
        content: JSON.stringify(result),
      });
    }

    if (planned) break;

    throwIfAborted(signal);
    messages = [
      ...messages,
      { role: "assistant", content: turn.content },
      { role: "user", content: results },
    ];
    turn = await sonnetTools({
      system: instructions,
      messages,
      tools: activeTools,
      signal,
    });
  }

  throwIfAborted(signal);

  if (mode === "plan") {
    if (!options.project.scenes.length) {
      throw new Error("Couldn't extract scenes from that script.");
    }
    if (conceptNeedsSpeech(options.project)) {
      throw new Error("Couldn't write spoken lines for that story.");
    }
    options.project.workflowStep = "cast";
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

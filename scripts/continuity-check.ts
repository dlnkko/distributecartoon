import assert from "node:assert/strict";
import { continuityFlags, continuityPass, projectSeed } from "../lib/continuity";
import { labeledReferencePrompt, narrationLines, narratorVoicePrompt, packedScenePrompt } from "../lib/style";
import type { Character, Project, Scene } from "../lib/types";

function character(name: string, description: string): Character {
  return {
    id: name,
    name,
    slug: name.toLowerCase(),
    description,
    voiceNotes: "",
    isExtra: false,
    lookConfirmed: true,
    clips: [],
  };
}

function scene(index: number, partial: Partial<Scene>): Scene {
  return {
    id: `s${index}`,
    index,
    title: "",
    summary: "",
    location: "Coffee shop",
    characterNames: [],
    extraNames: [],
    dialogue: [],
    estimatedSeconds: 6,
    camera: "",
    ...partial,
  };
}

const project = {
  id: "proj_continuity",
  style: "pixar",
  aspectRatio: "16:9",
  characters: [
    character("Ana", "young woman, green hoodie, blue jeans and white sneakers"),
    character("Ben", "tall man, brown leather jacket and black boots"),
  ],
  references: [],
  scenes: [
    scene(1, {
      summary: "Ana sits at the table and holds a coffee cup while Ben talks.",
      characterNames: ["Ana", "Ben"],
      extraNames: ["barista"],
      camera: "two-shot",
      dialogue: [{ speaker: "Ben", line: "You look tired." }],
    }),
    scene(2, {
      summary: "Close on Ana. She reacts and looks at Ben.",
      characterNames: ["Ana"],
      camera: "close-up",
    }),
    scene(3, {
      summary: "Ben leaves the shop.",
      characterNames: ["Ben"],
      camera: "wide shot",
    }),
    scene(4, {
      summary: 'The door opens and Ben is revealed. Ben sips a drink and says: "I forgot my keys."',
      characterNames: ["Ben", "Ana"],
      camera: "wide shot",
      dialogue: [{ speaker: "Ben", line: "I forgot my keys." }],
    }),
  ],
  batches: [],
} as unknown as Project;

const shots = continuityPass(project);
const two = shots.get(2)!.locks.join(" ");
assert.match(two, /Ana holds the coffee cup in the same hand/);
assert.match(two, /barista remains in the background/);
assert.match(two, /Ana looks frame-right toward Ben/);

assert.doesNotMatch(shots.get(3)!.locks.join(" "), /already in the room|looks frame/);

const four = shots.get(4)!;
assert.doesNotMatch(four.locks.join(" "), /Ana is already|walks back in/);
assert.ok(four.revealFirst);
assert.match(four.locks.join(" "), /Ben speaks after appearing on screen/);
assert.match(four.locks.join(" "), /Ana on frame-left, Ben on frame-right/);
assert.ok(continuityFlags(project, [4]).some((flag) => /drink appears without being picked up/.test(flag)));

const noDoor = structuredClone(project);
noDoor.scenes[3].summary = "Ben sips a drink next to Ana.";
assert.match(continuityPass(noDoor).get(4)!.locks.join(" "), /Ben walks back in on camera/);

const images = [
  { url: "a", kind: "character" as const, name: "Ben" },
  { url: "b", kind: "location" as const, name: "Coffee shop" },
];
const videos = [{ url: "c", kind: "character" as const, name: "Ana" }];
const prompt = labeledReferencePrompt({
  images,
  videos,
  videoPrompt: "",
  style: "pixar",
  project,
  sceneIndexes: [1, 2, 3, 4],
  duration: 24,
});
assert.match(prompt, /^Pixar style throughout the whole video\./);
assert.match(prompt, /Silent characters, places, and products are @Image/);
assert.match(prompt, /@Image1 is Ben, a silent character/);
assert.match(prompt, /SCENE 1 \(6s\)\./);
assert.match(prompt, /Only @Video1 and @Image1 participate in this scene\./);
assert.match(prompt, /@Image1 lipsyncs: "You look tired\."/);
assert.match(prompt, /No background music\.$/);
assert.doesNotMatch(prompt, /keys in hand/);
const lastScene = prompt.slice(prompt.indexOf("SCENE 4"));
assert.ok(lastScene.indexOf("revealed") < lastScene.indexOf("lipsyncs:"));
assert.equal((lastScene.match(/I forgot my keys/g) || []).length, 1);
assert.equal(projectSeed(project), projectSeed(project));
assert.match(packedScenePrompt(project, [1], "", 6), /SCENE 1 \(6s\)/);

const narrated = structuredClone(project);
narrated.scenes[1].dialogue = [{ speaker: "Narrator", line: "Some mornings start slower than others, and this was one of them." }];
const narratorVideos = [...videos, { url: "n", kind: "narrator" as const, name: "Narrator" }];
const withNarrator = labeledReferencePrompt({ images, videos: narratorVideos, videoPrompt: "", style: "pixar", project: narrated, sceneIndexes: [1, 2, 3, 4], duration: 24 });
assert.match(withNarrator, /Voiceover, voice as heard in @Video2: "Some mornings start slower than others, and this was one of them\."/);
assert.match(withNarrator, /Narrator lines are off-screen voice-over, no lipsync/);
assert.doesNotMatch(withNarrator, /@Video2 lipsyncs/);
assert.match(narratorVoicePrompt(narrated), /no faces and no mouths[\s\S]*off-screen voice-over, heard only, with no lipsync/);
assert.match(narratorVoicePrompt(narrated), /\{Some mornings start slower than others, and this was one…\}/);
assert.deepEqual(narrationLines(narrated, [1]), []);

const gym = {
  ...structuredClone(project),
  characters: [character("Gym", "big man, tank top"), character("Gummy", "tiny orange gummy with a cape")],
  scenes: [
    scene(1, {
      location: "Same home gym, warm golden light",
      summary: "Same home gym, now washed in warm light. Gym Buddy leans on the rack. The tiny Gummy Mascot hops toward the larger Gym Buddy.",
      characterNames: ["Gym", "Gummy"],
      camera: "wide shot",
    }),
  ],
} as Project;
const gymPrompt = labeledReferencePrompt({
  images: [{ url: "p", kind: "location" as const, name: "Same home gym, warm golden light" }],
  videos: [
    { url: "g", kind: "character" as const, name: "Gym" },
    { url: "m", kind: "character" as const, name: "Gummy" },
  ],
  videoPrompt: "",
  style: "pixar",
  project: gym,
  sceneIndexes: [1],
  duration: 8,
});
assert.match(gymPrompt, /@Video1 leans on the rack, as seen in @Image1/);
assert.match(gymPrompt, /The tiny @Video2 hops toward the larger @Video1/);
assert.match(gymPrompt, /as seen in @Image1/);
assert.doesNotMatch(gymPrompt, /home @Video|@Video1 Buddy|@Video2 Mascot|CUT to/);
assert.match(gymPrompt, /Speaking characters are @Video/);

console.log(withNarrator);
console.log("continuity checks passed");

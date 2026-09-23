import assert from "node:assert/strict";
import { continuityFlags, continuityPass, projectSeed } from "../lib/continuity";
import { labeledReferencePrompt, packedScenePrompt } from "../lib/style";
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
assert.match(prompt, /^GLOBAL: Pixar style, 16:9 horizontal\./);
assert.match(prompt, /CHARACTERS: @Video1 as Ana \(young woman, green hoodie, blue jeans, white sneakers\); @Image1 as Ben/);
assert.match(prompt, /REFERENCES: @Image2 is Coffee shop\./);
assert.match(prompt, /SCENE 1 \(6s\) — Two-Shot:/);
assert.doesNotMatch(prompt, /keys in hand/);
assert.match(prompt, /Dialogue: @Image1 lipsyncs: "You look tired\."/);
assert.doesNotMatch(prompt, /keep the same exact character|Obey real-world physics|\[NO BGM\]|No pop-in|No teleporting|never swap/i);
const lastScene = prompt.slice(prompt.indexOf("SCENE 4"));
assert.ok(lastScene.indexOf("revealed") < lastScene.indexOf("Dialogue:"));
assert.equal((lastScene.match(/I forgot my keys/g) || []).length, 1);
assert.equal(projectSeed(project), projectSeed(project));
assert.match(packedScenePrompt(project, [1], "", 6), /CHARACTERS: Ana/);

console.log(prompt);
console.log("WORDS", prompt.split(/\s+/).length);
console.log("continuity checks passed");

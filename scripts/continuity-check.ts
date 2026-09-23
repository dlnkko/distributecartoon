import assert from "node:assert/strict";
import { continuityFlags, continuityPass, projectSeed } from "../lib/continuity";
import { packedScenePrompt } from "../lib/style";
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
      summary: "The door opens and Ben is revealed. Ben sips a drink.",
      characterNames: ["Ben", "Ana"],
      camera: "wide shot",
      dialogue: [{ speaker: "Ben", line: "I forgot my keys." }],
    }),
  ],
  batches: [],
} as unknown as Project;

const shots = continuityPass(project);
const two = shots.get(2)!.locks.join(" ");
assert.match(two, /Ana still holds the coffee cup/);
assert.match(two, /barista/);
assert.match(two, /Ana looks frame-right, toward off-screen Ben/);
assert.match(two, /Ana's eyes and head point at Ben/);

assert.doesNotMatch(shots.get(3)!.locks.join(" "), /enters from the edge|looks frame/);

const four = shots.get(4)!;
assert.doesNotMatch(four.locks.join(" "), /Ana enters|walks back in/);

const noDoor = structuredClone(project);
noDoor.scenes[3].summary = "Ben sips a drink next to Ana.";
assert.match(continuityPass(noDoor).get(4)!.locks.join(" "), /Ben walks back in on camera/);
assert.ok(four.revealFirst, "reveal scene should put visuals before dialogue");
assert.match(four.locks.join(" "), /speaks only after the reveal/);
assert.match(four.locks.join(" "), /180-degree rule: Ana stays frame-left and Ben frame-right/);
assert.ok(continuityFlags(project, [4]).some((flag) => /drink appears without being picked up/.test(flag)));

const prompt = packedScenePrompt(project, [1, 2, 3, 4], "", 24);
assert.match(prompt, /Identity lock/);
assert.match(prompt, /white sneakers/);
assert.match(prompt, /never before its speaker is on screen/);
assert.ok(prompt.indexOf("Ben is revealed") < prompt.indexOf("I forgot my keys"));
assert.equal(projectSeed(project), projectSeed(project));

console.log(prompt);
console.log("continuity checks passed");

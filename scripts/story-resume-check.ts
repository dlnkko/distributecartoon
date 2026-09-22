import assert from "node:assert/strict";
import { produceShouldResumeStory, storyBatchNeedsSubmit } from "../lib/video-jobs";
import type { Project } from "../lib/types";

const now = Date.parse("2026-09-22T22:00:00.000Z");

function project(patch: Partial<Project>): Project {
  return {
    id: "proj_test",
    title: "Test",
    style: "pixar",
    aspectRatio: "16:9",
    scriptName: "",
    scriptText: "",
    characters: [],
    scenes: [],
    batches: [],
    references: [],
    scriptRefCues: [],
    skippedRefs: false,
    pendingQuestions: [],
    messages: [],
    createdAt: "2026-09-22T21:00:00.000Z",
    updatedAt: "2026-09-22T21:50:00.000Z",
    ...patch,
  };
}

const planned = {
  id: "batch_1",
  index: 1,
  duration: 15,
  sceneIndexes: [1],
  characterNames: [],
  extraNames: [],
  introducesNewLead: true,
  newLeadNames: [],
  cameraPlan: "",
  videoPrompt: "",
  framePrompt: "",
  pacingNotes: "",
  status: "planned" as const,
};

assert.equal(storyBatchNeedsSubmit({ ...planned, videoPublicPath: undefined, videoRemoteUrl: undefined, kieVideoTaskId: undefined }), true);
assert.equal(storyBatchNeedsSubmit({ ...planned, kieVideoTaskId: "pending" }), true);
assert.equal(storyBatchNeedsSubmit({ ...planned, kieVideoTaskId: "job_123" }), false);
assert.equal(storyBatchNeedsSubmit({ ...planned, videoPublicPath: "/v.mp4" }), false);

const stuck = project({
  produceStartedAt: "2026-09-22T21:50:00.000Z",
  batches: [planned],
});
assert.equal(produceShouldResumeStory(stuck, now), true, "a produce stuck past the intro wait should send the story");

assert.equal(
  produceShouldResumeStory({ ...stuck, produceStartedAt: "2026-09-22T21:58:00.000Z" }, now),
  false,
  "a produce that just started must not be submitted twice",
);

assert.equal(
  produceShouldResumeStory(
    { ...stuck, batches: [{ ...planned, kieVideoTaskId: "job_123", status: "generating_video" }] },
    now,
  ),
  false,
  "a story job already on OpenRouter is left alone",
);

assert.equal(
  produceShouldResumeStory({ ...stuck, batches: [{ ...planned, videoPublicPath: "/done.mp4", status: "done" }] }, now),
  false,
  "a finished video is not generated again",
);

assert.equal(
  produceShouldResumeStory(
    {
      ...stuck,
      batches: [
        { ...planned, videoPublicPath: "/a.mp4", status: "done" },
        { ...planned, id: "batch_2", index: 2 },
      ],
      joinedVideoPublicPath: "/full.mp4",
    },
    now,
  ),
  false,
  "a delivered film is not generated again",
);

assert.equal(produceShouldResumeStory(project({ batches: [planned] }), now), false);
assert.equal(
  produceShouldResumeStory({ ...stuck, produceStartedAt: "2026-09-22T18:00:00.000Z" }, now),
  false,
);

console.log("story resume checks passed");

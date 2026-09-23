import assert from "node:assert/strict";
import { durableVideoSrc, projectDeliveredSrc, projectIsGenerating, storyBatchNeedsSubmit } from "../lib/video-jobs";
import type { Project } from "../lib/types";

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
assert.equal(durableVideoSrc({ videoPublicPath: "https://openrouter.ai/api/v1/videos/job/content" }), "");
assert.equal(durableVideoSrc({ videoRemoteUrl: "https://fal.media/clip.mp4" }), "https://fal.media/clip.mp4");
const missingPart = project({
  keepGenerating: true,
  produceStartedAt: new Date().toISOString(),
  batches: [
    { ...planned, index: 1, videoPublicPath: "https://fal.media/part-1.mp4", status: "done" },
    { ...planned, id: "batch_2", index: 2, status: "generating_video" },
  ],
});
assert.equal(projectDeliveredSrc(missingPart), "", "a missing part does not count as the finished film");
assert.equal(durableVideoSrc(missingPart.batches[0]), "https://fal.media/part-1.mp4");
assert.equal(projectIsGenerating(missingPart), true, "the worker keeps going until every part is stored");

const live = project({
  keepGenerating: true,
  produceStartedAt: "2026-09-20T10:00:00.000Z",
  batches: [{ ...planned, status: "generating_video" }],
});
assert.equal(projectIsGenerating(live), true, "a live generation shows until the worker finishes it");
assert.equal(
  projectIsGenerating({ ...live, batches: [{ ...planned, status: "planned" }] }),
  true,
  "intros still recording count as generating",
);
assert.equal(
  projectIsGenerating({ ...live, batches: [{ ...planned, videoPublicPath: "/v.mp4", status: "done" }] }),
  false,
  "a delivered video is not generating",
);
assert.equal(
  projectIsGenerating({ ...live, keepGenerating: false, batches: [{ ...planned, status: "error" }] }),
  false,
  "a failed generation stops showing as generating",
);
assert.equal(
  projectIsGenerating(project({ produceStartedAt: "2026-09-20T10:00:00.000Z", batches: [planned] })),
  false,
  "old videos from before the worker are never picked up",
);

console.log("produce state checks passed");

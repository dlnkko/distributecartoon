import assert from "node:assert/strict";
import { activeProjectIds, claimProject, saveClaimedProject, workerEnabled } from "../lib/worker-db";

const projectId = process.argv[2];

async function main() {
  assert.equal(workerEnabled(), true, "WORKER_SECRET and Supabase env must be set");
  const active = await activeProjectIds();
  console.log("active generations:", active.length);
  if (!projectId) return;
  const first = await claimProject(projectId, 30);
  assert.ok(first, "first claim gets the project");
  const second = await claimProject(projectId, 30);
  assert.equal(second, null, "a second claim is refused while the lease is held");
  await saveClaimedProject(first, 0);
  const third = await claimProject(projectId, 30);
  assert.ok(third, "the project can be claimed again after release");
  await saveClaimedProject(third, 0);
  console.log("lease checks passed for", first.title);
}

void main();

import { createClient } from "@supabase/supabase-js";
import { nowIso } from "./ids";
import { normalizeProject } from "./store";
import type { Project } from "./types";

function workerToken() {
  return process.env.WORKER_SECRET || "";
}

function client() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

export function workerEnabled() {
  return Boolean(workerToken() && process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY);
}

export function workerTokenMatches(value: string | null) {
  const token = workerToken();
  return Boolean(token && value && value === token);
}

export async function activeProjectIds(): Promise<string[]> {
  const { data, error } = await client().rpc("worker_active", { p_token: workerToken() });
  if (error) throw new Error(error.message);
  return Array.isArray(data) ? data.map(String) : [];
}

// Returns null while another invocation holds the lease.
export async function claimProject(id: string, leaseSeconds: number): Promise<Project | null> {
  const { data, error } = await client().rpc("worker_claim", {
    p_token: workerToken(),
    p_id: id,
    p_seconds: leaseSeconds,
  });
  if (error) throw new Error(error.message);
  if (!data || typeof data !== "object") return null;
  return normalizeProject(data as Project);
}

export async function saveClaimedProject(project: Project, leaseSeconds: number) {
  normalizeProject(project);
  project.updatedAt = nowIso();
  const { error } = await client().rpc("worker_save", {
    p_token: workerToken(),
    p_id: project.id,
    p_payload: project,
    p_lease_seconds: leaseSeconds,
  });
  if (error) throw new Error(error.message);
}

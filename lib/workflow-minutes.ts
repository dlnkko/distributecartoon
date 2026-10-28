import { createClient } from "@supabase/supabase-js";
import { planById } from "./plans";
import { whopClient, whopConfig } from "./whop";

const DAY_MS = 24 * 60 * 60 * 1000;
const PERIOD_MS = 30 * DAY_MS;

export type WorkflowMinutes = {
  plan: string;
  totalSeconds: number;
  usedSeconds: number;
  leftSeconds: number;
  resetsAt: string;
};

function admin() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}

async function membershipClock(membershipId: string | null) {
  if (!membershipId || !whopConfig().apiKey) return { renewal: null as number | null, created: null as number | null };
  try {
    const membership = (await whopClient().memberships.retrieve({ id: membershipId })) as {
      current_period_end?: string | null;
      created_at?: string | null;
    };
    const end = membership.current_period_end ? Date.parse(membership.current_period_end) : NaN;
    const created = membership.created_at ? Date.parse(membership.created_at) : NaN;
    return {
      renewal: Number.isFinite(end) && end > Date.now() ? end : null,
      created: Number.isFinite(created) ? created : null,
    };
  } catch {
    return { renewal: null, created: null };
  }
}

// Each generation records the seconds it rendered in generation_charges, so the
// minutes used this period are the sum of those rows since the period began.
export async function workflowMinutes(userId: string): Promise<WorkflowMinutes | null> {
  const client = admin();
  if (!client || !userId) return null;
  const { data: membership } = await client
    .from("memberships")
    .select("plan, status, bonus_seconds, whop_membership_id, updated_at")
    .eq("user_id", userId)
    .in("status", ["active", "trialing", "past_due", "canceling", "completed"])
    .maybeSingle();
  if (!membership) return null;

  const bonus = Number(membership.bonus_seconds || 0);
  const totalSeconds = (planById(String(membership.plan || ""))?.seconds || 300) + (Number.isFinite(bonus) && bonus > 0 ? bonus : 0);
  const clock = await membershipClock(membership.whop_membership_id || null);
  const began = clock.created ?? Date.parse(String(membership.updated_at || ""));
  const anchor = Number.isFinite(began) && began < Date.now() ? began : Date.now() - PERIOD_MS;
  const periods = Math.floor((Date.now() - anchor) / PERIOD_MS);
  const end = clock.renewal ?? anchor + (periods + 1) * PERIOD_MS;
  let start = end - PERIOD_MS;
  if (start > Date.now()) start = Date.now() - PERIOD_MS;

  let usedSeconds = 0;
  for (let from = 0; from < 20000; from += 1000) {
    const { data: charges } = await client
      .from("generation_charges")
      .select("credits")
      .eq("user_id", userId)
      .gte("created_at", new Date(start).toISOString())
      .range(from, from + 999);
    const rows = charges || [];
    usedSeconds += rows.reduce((sum, row) => sum + Math.max(0, Number(row.credits) || 0), 0);
    if (rows.length < 1000) break;
  }

  return {
    plan: String(membership.plan || ""),
    totalSeconds,
    usedSeconds,
    leftSeconds: Math.max(0, totalSeconds - usedSeconds),
    resetsAt: new Date(end).toISOString(),
  };
}

import { createClient } from "@supabase/supabase-js";
import { planById } from "./plans";

export type PrepKind = "plan" | "clone" | "story" | "brief";

const MESSAGES: Record<string, { status: number; error: string }> = {
  membership: {
    status: 402,
    error: "Subscribe before writing a script. The membership pays for the workflow.",
  },
  hour: {
    status: 429,
    error: "Too many scripts in a short time. Wait a bit and try again.",
  },
  month: {
    status: 429,
    error: "This month's script allowance is used up. It comes back in 30 days.",
  },
};

function admin() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}

export function prepCaps(planSeconds: number, kind: PrepKind) {
  const minutes = Math.max(5, Math.round((Number(planSeconds) || 0) / 60));
  const heavyMonth = Math.min(2000, Math.max(200, minutes * 8));
  if (kind === "brief") return { hour: 60, month: Math.min(2000, heavyMonth * 4) };
  return { hour: 30, month: heavyMonth };
}

export async function takeWorkflowPrep(
  userId: string,
  kind: PrepKind,
): Promise<{ ok: true } | { ok: false; status: number; error: string }> {
  if (process.env.NODE_ENV === "development") return { ok: true };
  const client = admin();
  if (!client || !userId) {
    return { ok: false, status: 503, error: "Couldn't check the script limit." };
  }
  const { data: membership, error: memberError } = await client
    .from("memberships")
    .select("plan, status, bonus_seconds")
    .eq("user_id", userId)
    .in("status", ["active", "trialing", "past_due", "canceling", "completed"])
    .maybeSingle();
  if (memberError) return { ok: false, status: 503, error: "Couldn't check the script limit." };
  if (!membership) return { ok: false, ...MESSAGES.membership };
  const bonus = Number(membership.bonus_seconds || 0);
  const seconds = (planById(String(membership.plan || ""))?.seconds || 300) + (Number.isFinite(bonus) && bonus > 0 ? bonus : 0);
  const caps = prepCaps(seconds, kind);
  const { data, error } = await client.rpc("take_workflow_prep", {
    member: userId,
    prep_kind: kind,
    hour_cap: caps.hour,
    month_cap: caps.month,
  });
  if (error) return { ok: false, status: 503, error: "Couldn't check the script limit." };
  if (data === "ok") return { ok: true };
  const denied = MESSAGES[String(data)] || MESSAGES.month;
  return { ok: false, ...denied };
}

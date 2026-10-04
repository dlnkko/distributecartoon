import { createClient } from "@supabase/supabase-js";
import { planById, planByWhop } from "@/lib/plans";
import { createClient as createUserClient } from "@/lib/supabase/server";
import { whopClient, whopConfig } from "@/lib/whop";

export type MembershipView = {
  id: string | null;
  plan: string;
  name: string;
  status: string;
  cancelAtPeriodEnd: boolean;
  periodEnd: string | null;
};

function admin() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}

export async function saveMembership(userId: string, plan: string, paymentId: string) {
  const client = admin();
  if (!client || !userId) return false;
  const { error } = await client.from("memberships").upsert({
    user_id: userId,
    plan,
    status: "active",
    whop_payment_id: paymentId || null,
    updated_at: new Date().toISOString(),
  });
  if (error) console.warn("membership save failed", error.message);
  return !error;
}

export async function activeMembership() {
  try {
    const supabase = await createUserClient();
    const { data, error } = await supabase.from("memberships").select("plan, status").in("status", ["active", "canceling", "completed"]).maybeSingle();
    if (error) return null;
    return data;
  } catch {
    return null;
  }
}

function planName(plan: string, planId?: string | null) {
  const named = planById(plan);
  if (named) return named.name;
  const byWhop = planId ? planByWhop(planId) : undefined;
  return byWhop?.name || plan || "Membership";
}

function planSlug(plan: string, planId?: string | null) {
  if (planById(plan)) return plan;
  const byWhop = planId ? planByWhop(planId) : undefined;
  return byWhop?.id || plan || "m40";
}

type WhopMembership = {
  id: string;
  plan_id: string;
  status: string;
  cancel_at_period_end: boolean;
  current_period_end: string | null;
  metadata?: Record<string, unknown> | null;
};

function toView(remote: WhopMembership | null, local: { plan: string; status: string } | null): MembershipView | null {
  if (!remote && !local) return null;
  const plan = planSlug(local?.plan || "", remote?.plan_id);
  const remoteStatus = remote?.status || local?.status || "active";
  const canceling = remote
    ? Boolean(remote.cancel_at_period_end) || remote.status === "canceling"
    : local?.status === "canceling";
  return {
    id: remote?.id || null,
    plan,
    name: planName(plan, remote?.plan_id),
    status: canceling && remoteStatus !== "canceled" && remoteStatus !== "expired" ? "canceling" : remoteStatus,
    cancelAtPeriodEnd: canceling,
    periodEnd: remote?.current_period_end || null,
  };
}

async function localMembership(userId: string) {
  if (!userId) return null;
  const columns = "plan, status, whop_payment_id, whop_membership_id";
  const client = admin();
  if (client) {
    const { data, error } = await client.from("memberships").select(columns).eq("user_id", userId).maybeSingle();
    if (!error && data) return data as { plan: string; status: string; whop_payment_id: string | null; whop_membership_id: string | null };
  }
  try {
    const supabase = await createUserClient();
    const { data, error } = await supabase.from("memberships").select(columns).eq("user_id", userId).maybeSingle();
    if (error) return null;
    return data as { plan: string; status: string; whop_payment_id: string | null; whop_membership_id: string | null } | null;
  } catch {
    return null;
  }
}

export async function setMembershipStatus(userId: string, status: string, plan = "starter") {
  if (!userId) return;
  const row = {
    user_id: userId,
    plan: plan || "starter",
    status,
    updated_at: new Date().toISOString(),
  };
  const client = admin();
  if (client) {
    await client.from("memberships").upsert(row);
    return;
  }
  try {
    const supabase = await createUserClient();
    await supabase.from("memberships").update({ status, plan: row.plan, updated_at: row.updated_at }).eq("user_id", userId);
  } catch {
    /* The signed-in user can still read the row. */
  }
}

async function whopMembershipFor(userId: string, paymentId: string | null, membershipId: string | null) {
  if (!whopConfig().apiKey) return null;
  const client = whopClient();
  if (membershipId) {
    try {
      return (await client.memberships.retrieve({ id: membershipId })) as WhopMembership;
    } catch {
      /* Fall through to the payment and company search. */
    }
  }
  if (paymentId) {
    try {
      const payment = await client.payments.retrieve({ id: paymentId });
      if (payment.membership_id) {
        return (await client.memberships.retrieve({ id: payment.membership_id })) as WhopMembership;
      }
    } catch {
      /* Fall through to a company search. */
    }
  }
  const { companyId } = whopConfig();
  if (!companyId) return null;
  let page = await client.memberships.list({ account_id: companyId, first: 50 });
  for (let i = 0; i < 6; i++) {
    const hit = page.data.find((item) => String((item.metadata || {}).user_id || "") === userId);
    if (hit) return hit as WhopMembership;
    if (!page.hasNextPage()) break;
    page = await page.getNextPage();
  }
  return null;
}

export async function loadMembership(userId: string) {
  const local = await localMembership(userId);
  const remote = await whopMembershipFor(userId, local?.whop_payment_id || null, local?.whop_membership_id || null);
  return toView(remote, local);
}

export async function replaceMembership(userId: string, plan: string, paymentId: string, oldMembershipId: string) {
  await saveMembership(userId, plan, paymentId);
  if (!oldMembershipId || !whopConfig().apiKey) return;
  try {
    await whopClient().memberships.cancel({
      id: oldMembershipId,
      cancel_at_period_end: false,
      reason: "Replaced by a new monthly plan",
    });
  } catch (error) {
    console.warn("could not end the previous membership", error instanceof Error ? error.message : error);
  }
}

export async function grantCredits(userId: string, credits: number, paymentId: string) {
  if (!userId || !paymentId || !Number.isInteger(credits) || credits < 1) return;
  const client = admin();
  if (!client) return;
  const { error } = await client.rpc("grant_credits", { target: userId, amount: credits, payment: paymentId });
  if (error) console.warn("credit grant failed", error.message);
}

const creditSyncAt = new Map<string, number>();

export async function syncWhopCredits(userId: string) {
  const { apiKey, companyId } = whopConfig();
  if (!apiKey || !companyId || !userId) return;
  const last = creditSyncAt.get(userId) || 0;
  if (Date.now() - last < 60_000) return;
  creditSyncAt.set(userId, Date.now());
  try {
    const page = await whopClient().payments.list({ account_id: companyId, status: "paid", first: 20 });
    let savedMonthly = false;
    for (const payment of page.data) {
      const metadata = (payment.metadata || {}) as Record<string, unknown>;
      if (String(metadata.user_id || "") !== userId) continue;
      const paymentId = String(payment.id || "");
      const bought = planById(String(metadata.plan || ""));
      if (!paymentId || !bought) continue;
      if (bought.kind === "monthly" && !savedMonthly) {
        savedMonthly = true;
        const local = await localMembership(userId);
        if (local?.whop_payment_id !== paymentId) await saveMembership(userId, bought.id, paymentId);
      }
      if ((bought.kind === "monthly" || bought.kind === "topup" || bought.kind === "intro") && bought.seconds > 0) {
        await grantCredits(userId, bought.seconds, paymentId);
      }
    }
  } catch (error) {
    creditSyncAt.delete(userId);
    console.warn("whop credit sync failed", error instanceof Error ? error.message : error);
  }
}

export async function cancelMembership(userId: string) {
  const local = await localMembership(userId);
  const remote = await whopMembershipFor(userId, local?.whop_payment_id || null, local?.whop_membership_id || null);
  if (!remote && !local) return { error: "You don't have a membership." as const };

  if (!remote) {
    await setMembershipStatus(userId, "canceled", local?.plan || "starter");
    return { membership: toView(null, { plan: local?.plan || "starter", status: "canceled" }) };
  }

  if (remote.status === "canceled" || remote.status === "expired") {
    await setMembershipStatus(userId, "canceled", planSlug(local?.plan || "", remote.plan_id));
    return { membership: toView({ ...remote, status: "canceled" }, local) };
  }

  const atPeriodEnd = remote.status === "active" || remote.status === "trialing" || remote.status === "past_due";
  const updated = (await whopClient().memberships.cancel({
    id: remote.id,
    cancel_at_period_end: atPeriodEnd,
    reason: "Canceled from the account menu",
  })) as WhopMembership;
  const view = toView(updated, local);
  await setMembershipStatus(userId, view?.status || "canceled", view?.plan || "starter");
  return { membership: view };
}

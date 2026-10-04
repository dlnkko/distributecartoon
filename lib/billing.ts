import { createClient } from "@supabase/supabase-js";
import { planById, planByWhop, planWhopId } from "@/lib/plans";
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

export async function saveMembership(userId: string, plan: string, paymentId: string, membershipId?: string) {
  const client = admin();
  if (!client || !userId) return false;
  const row: Record<string, string | null> = {
    user_id: userId,
    plan,
    status: "active",
    whop_payment_id: paymentId || null,
    updated_at: new Date().toISOString(),
  };
  if (membershipId) row.whop_membership_id = membershipId;
  const { error } = await client.from("memberships").upsert(row);
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

const LIVE_MEMBERSHIP = new Set(["active", "trialing", "past_due", "canceling"]);
const PAID_MEMBERSHIP = new Set(["active", "trialing", "past_due", "canceling", "completed"]);

async function whopMembershipFor(userId: string, _paymentId: string | null, _membershipId: string | null) {
  const { apiKey, companyId } = whopConfig();
  if (!apiKey || !companyId || !userId) return null;
  const client = whopClient();
  let page = await client.memberships.list({ account_id: companyId, first: 50, direction: "desc" });
  for (let i = 0; i < 4; i++) {
    for (const item of page.data) {
      const metadata = (item.metadata || {}) as Record<string, unknown>;
      if (String(metadata.user_id || "") !== userId) continue;
      const bought = planById(String(metadata.plan || "")) || planByWhop(item.plan_id);
      if (bought?.kind !== "monthly" || !LIVE_MEMBERSHIP.has(item.status)) continue;
      return {
        id: item.id,
        plan_id: item.plan_id,
        status: item.status,
        cancel_at_period_end: Boolean(item.cancel_at_period_end),
        current_period_end: item.current_period_end || null,
        metadata,
      } satisfies WhopMembership;
    }
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

export async function grantCredits(userId: string, credits: number, paymentId: string, membershipId?: string) {
  if (!userId || !paymentId || !Number.isInteger(credits) || credits < 1) return;
  const client = admin();
  if (!client) {
    console.error("credit grant skipped: service role is not configured");
    return;
  }
  const { error } = await client.rpc("grant_credits", {
    target: userId,
    amount: credits,
    payment: paymentId,
    membership: membershipId || null,
  });
  if (error) console.error("credit grant failed", error.message);
}

export async function rememberCreditCheckout(userId: string, checkoutId: string, plan: string) {
  if (!userId || !checkoutId || !plan) return;
  const client = admin();
  if (!client) return;
  const { error } = await client.from("credit_checkouts").upsert({
    id: checkoutId,
    user_id: userId,
    plan,
    created_at: new Date().toISOString(),
  });
  if (error) console.error("credit checkout save failed", error.message);
}

export async function applyWhopPurchase(userId: string, planId: string, paymentId: string, membershipId?: string) {
  const bought = planById(planId);
  if (!bought || !userId || !paymentId) return;
  if (bought.kind === "monthly") {
    const local = await localMembership(userId);
    if (local?.whop_membership_id !== membershipId || local?.plan !== bought.id) {
      await saveMembership(userId, bought.id, paymentId, membershipId);
    }
  }
  if ((bought.kind === "monthly" || bought.kind === "topup" || bought.kind === "intro") && bought.seconds > 0) {
    await grantCredits(userId, bought.seconds, paymentId, membershipId);
  }
}

const creditSyncAt = new Map<string, number>();
const CREDIT_KINDS = new Set(["monthly", "topup", "intro"]);

type ListedMembership = {
  id: string;
  plan_id: string;
  status: string;
  created_at: string;
  metadata?: Record<string, unknown> | null;
};

async function listRecentMemberships(companyId: string) {
  const client = whopClient();
  const found: ListedMembership[] = [];
  let page = await client.memberships.list({ account_id: companyId, first: 50, direction: "desc" });
  for (let i = 0; i < 4; i++) {
    for (const item of page.data) {
      found.push({
        id: item.id,
        plan_id: item.plan_id,
        status: item.status,
        created_at: item.created_at,
        metadata: (item.metadata || null) as Record<string, unknown> | null,
      });
    }
    if (!page.hasNextPage()) break;
    page = await page.getNextPage();
  }
  return found;
}

async function pendingCheckouts(userId: string) {
  const client = admin();
  if (!client) return [];
  const since = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
  const { data, error } = await client
    .from("credit_checkouts")
    .select("id, plan, created_at")
    .eq("user_id", userId)
    .gte("created_at", since)
    .order("created_at", { ascending: true });
  if (error) {
    console.error("credit checkout read failed", error.message);
    return [];
  }
  return (data || []) as Array<{ id: string; plan: string; created_at: string }>;
}

export async function syncWhopCredits(userId: string) {
  const { apiKey, companyId } = whopConfig();
  if (!apiKey || !companyId || !userId) return;
  const last = creditSyncAt.get(userId) || 0;
  if (Date.now() - last < 15_000) return;
  creditSyncAt.set(userId, Date.now());
  try {
    const memberships = await listRecentMemberships(companyId);
    const claimed = new Set<string>();
    let savedMonthly = false;

    for (const item of memberships) {
      const metadata = item.metadata || {};
      if (String(metadata.user_id || "") !== userId || !PAID_MEMBERSHIP.has(item.status)) continue;
      const bought = planById(String(metadata.plan || "")) || planByWhop(item.plan_id);
      if (!bought || !CREDIT_KINDS.has(bought.kind)) continue;
      claimed.add(item.id);
      if (bought.kind === "monthly" && LIVE_MEMBERSHIP.has(item.status) && !savedMonthly) {
        savedMonthly = true;
        const local = await localMembership(userId);
        if (local?.whop_membership_id !== item.id || local.plan !== bought.id) {
          await saveMembership(userId, bought.id, item.id, item.id);
        }
      }
      if (bought.seconds > 0) await grantCredits(userId, bought.seconds, item.id, item.id);
    }

    // A promo checkout still creates a paid membership. The company key can list
    // that membership without the metadata we stored on it, so match it to the
    // checkout row we saved when the buyer left for Whop.
    for (const checkout of await pendingCheckouts(userId)) {
      const bought = planById(checkout.plan);
      if (!bought || !CREDIT_KINDS.has(bought.kind) || bought.seconds < 1) continue;
      const expectedPlans = new Set([bought.whopPlanId, planWhopId(bought)]);
      const start = Date.parse(checkout.created_at) - 60_000;
      const end = Date.parse(checkout.created_at) + 2 * 60 * 60 * 1000;
      const candidates = memberships
        .filter((item) => {
          if (claimed.has(item.id) || !PAID_MEMBERSHIP.has(item.status)) return false;
          const owner = String((item.metadata || {}).user_id || "");
          if (owner && owner !== userId) return false;
          if (!expectedPlans.has(item.plan_id)) return false;
          const created = Date.parse(item.created_at);
          return created >= start && created <= end;
        })
        .sort((a, b) => Date.parse(a.created_at) - Date.parse(b.created_at));
      if (candidates.length !== 1) continue;
      const item = candidates[0];
      claimed.add(item.id);
      if (bought.kind === "monthly" && LIVE_MEMBERSHIP.has(item.status) && !savedMonthly) {
        savedMonthly = true;
        const local = await localMembership(userId);
        if (local?.whop_membership_id !== item.id || local.plan !== bought.id) {
          await saveMembership(userId, bought.id, item.id, item.id);
        }
      }
      await grantCredits(userId, bought.seconds, item.id, item.id);
    }
  } catch (error) {
    creditSyncAt.delete(userId);
    console.error("whop credit sync failed", error instanceof Error ? error.message : error);
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

import { NextResponse } from "next/server";
import { markProjectPaid, readWhopEvent } from "@/lib/whop";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const payload = await request.text();
  let event: ReturnType<typeof readWhopEvent>;
  try {
    event = readWhopEvent(payload, request.headers);
  } catch {
    return NextResponse.json({ error: "Invalid webhook signature." }, { status: 401 });
  }

  const data = event.data;
  const metadata = data?.metadata || data?.membership?.metadata || {};
  const userId = String(metadata.user_id || "");
  const plan = String(metadata.plan || "");
  const replaceId = String(metadata.replace_membership_id || "");
  const membershipId = String(data?.membership_id || data?.membership?.id || (String(data?.id || "").startsWith("mem_") ? data?.id : "") || "");
  const paymentId = String(data?.id || "").startsWith("pay_") ? String(data?.id) : membershipId;
  const membershipEnded =
    event.type === "membership.deactivated" ||
    event.type === "membership.went_invalid" ||
    (Boolean(event.type?.startsWith("membership.")) && (data?.status === "canceled" || data?.status === "expired"));
  if (membershipEnded && userId) {
    const { setMembershipStatus } = await import("@/lib/billing");
    await setMembershipStatus(userId, data?.status === "expired" ? "expired" : "canceled", plan || "m40");
  }
  const paid =
    event.type === "payment.succeeded" ||
    event.type === "membership.activated" ||
    event.type === "membership.went_valid" ||
    data?.status === "paid";
  if (paid && userId && plan && paymentId) {
    const { applyWhopPurchase, replaceMembership } = await import("@/lib/billing");
    const { planById } = await import("@/lib/plans");
    const bought = planById(plan);
    if (bought?.kind === "monthly" && replaceId) await replaceMembership(userId, plan, paymentId, replaceId);
    await applyWhopPurchase(userId, plan, paymentId, membershipId || undefined);
  }
  const projectId = String(event.data?.metadata?.project_id || "");
  if (paid && projectId) {
    await markProjectPaid(projectId, event.data?.id || "", userId || undefined);
  }
  return NextResponse.json({ received: true });
}

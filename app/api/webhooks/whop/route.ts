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

  const userId = String(event.data?.metadata?.user_id || "");
  const plan = String(event.data?.metadata?.plan || "");
  const replaceId = String(event.data?.metadata?.replace_membership_id || "");
  const membershipEnded =
    Boolean(event.type?.startsWith("membership.")) && (event.data?.status === "canceled" || event.data?.status === "expired" || event.type === "membership.went_invalid");
  if (membershipEnded && userId) {
    const { setMembershipStatus } = await import("@/lib/billing");
    await setMembershipStatus(userId, event.data?.status === "expired" ? "expired" : "canceled", plan || "m40");
  }
  const paid = event.type === "payment.succeeded" || event.data?.status === "paid";
  if (paid && userId) {
    const { grantCredits, replaceMembership, saveMembership } = await import("@/lib/billing");
    const { planById } = await import("@/lib/plans");
    const bought = planById(plan);
    if (bought?.kind === "monthly" && replaceId) await replaceMembership(userId, plan, event.data?.id || "", replaceId);
    else if (bought?.kind !== "topup") await saveMembership(userId, plan || "m40", event.data?.id || "");
    if (bought && (bought.kind === "monthly" || bought.kind === "topup") && bought.seconds > 0) {
      await grantCredits(userId, bought.seconds, event.data?.id || "");
    }
  }
  const projectId = String(event.data?.metadata?.project_id || "");
  if (paid && projectId) {
    await markProjectPaid(projectId, event.data?.id || "", userId || undefined);
  }
  return NextResponse.json({ received: true });
}

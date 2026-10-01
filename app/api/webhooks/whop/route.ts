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
  const membershipEnded =
    Boolean(event.type?.startsWith("membership.")) && (event.data?.status === "canceled" || event.data?.status === "expired" || event.type === "membership.went_invalid");
  if (membershipEnded && userId) {
    const { setMembershipStatus } = await import("@/lib/billing");
    await setMembershipStatus(userId, event.data?.status === "expired" ? "expired" : "canceled", plan || "starter");
  }
  const paid = event.type === "payment.succeeded" || event.data?.status === "paid";
  if (paid && userId) {
    const { saveMembership } = await import("@/lib/billing");
    await saveMembership(userId, plan || "starter", event.data?.id || "");
  }
  const projectId = String(event.data?.metadata?.project_id || "");
  if (paid && projectId) {
    await markProjectPaid(projectId, event.data?.id || "", userId || undefined);
  }
  return NextResponse.json({ received: true });
}

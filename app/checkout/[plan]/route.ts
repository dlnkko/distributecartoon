import { NextResponse } from "next/server";
import { getAuthUser } from "@/lib/auth";
import { rememberCreditCheckout } from "@/lib/billing";
import { planById, planWhopId } from "@/lib/plans";
import { APP_ORIGIN } from "@/lib/site";
import { whopClient, whopConfig } from "@/lib/whop";

export const runtime = "nodejs";

export async function GET(request: Request, context: { params: Promise<{ plan: string }> }) {
  const origin = new URL(request.url).origin;
  const { plan: planId } = await context.params;
  const plan = planById(planId);
  if (!plan?.whopPlanId) return NextResponse.redirect(new URL("/#pricing", origin));
  const user = await getAuthUser();
  if (!user) {
    const next = `/checkout/${plan.id}`;
    return NextResponse.redirect(new URL(`/login?next=${encodeURIComponent(next)}`, origin));
  }
  const { companyId } = whopConfig();
  if (!companyId) return NextResponse.redirect(new URL("/#pricing", origin));
  try {
    const session = await whopClient().checkoutConfigurations.create({
      account_id: companyId,
      plan_id: planWhopId(plan),
      metadata: { user_id: user.id, plan: plan.id },
      redirect_url: `${APP_ORIGIN}/`,
    });
    const url = session.purchase_url;
    if (!url) return NextResponse.redirect(new URL("/#pricing", origin));
    await rememberCreditCheckout(user.id, session.id, plan.id);
    return NextResponse.redirect(url);
  } catch (error) {
    console.error("checkout", plan.id, error instanceof Error ? error.message : error);
    return NextResponse.redirect(new URL("/#pricing", origin));
  }
}

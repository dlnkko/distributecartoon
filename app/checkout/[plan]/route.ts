import { NextResponse } from "next/server";
import { getAuthUser } from "@/lib/auth";
import { planById, planWhopId } from "@/lib/plans";
import { whopClient, whopConfig } from "@/lib/whop";

export const runtime = "nodejs";

export async function GET(request: Request, context: { params: Promise<{ plan: string }> }) {
  const { plan: planId } = await context.params;
  const origin = new URL(request.url).origin;
  const plan = planById(planId);
  if (!plan) return NextResponse.redirect(new URL("/#pricing", origin));

  const user = await getAuthUser();
  if (!user) return NextResponse.redirect(new URL(`/login?next=/checkout/${plan.id}`, origin));

  const planWhop = planWhopId(plan);
  const { companyId, apiKey } = whopConfig();
  if (!apiKey || !companyId) return NextResponse.redirect(plan.purchaseUrl);

  const checkout = await whopClient().checkoutConfigurations.create({
    account_id: companyId,
    plan_id: planWhop,
    mode: "payment",
    metadata: { user_id: user.id, plan: plan.id },
    redirect_url: "https://distribute.to",
  });
  if (!checkout.purchase_url) {
    return NextResponse.json({ error: "Whop did not return a checkout link." }, { status: 502 });
  }
  return NextResponse.redirect(checkout.purchase_url);
}

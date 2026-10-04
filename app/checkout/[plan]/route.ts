import { NextResponse } from "next/server";
import { getAuthUser } from "@/lib/auth";
import { loadMembership, rememberCreditCheckout } from "@/lib/billing";
import { APP_ORIGIN } from "@/lib/site";
import { memberCanTopUp, planById, planWhopId } from "@/lib/plans";
import { whopClient, whopConfig } from "@/lib/whop";

export const runtime = "nodejs";

export async function GET(request: Request, context: { params: Promise<{ plan: string }> }) {
  const { plan: planId } = await context.params;
  const origin = new URL(request.url).origin;
  const plan = planById(planId);
  if (!plan || plan.kind === "legacy") return NextResponse.redirect(new URL("/#pricing", origin));

  const user = await getAuthUser();
  if (!user) return NextResponse.redirect(new URL(`/login?next=/checkout/${plan.id}`, origin));

  const membership = plan.kind === "monthly" || plan.kind === "topup" ? await loadMembership(user.id) : null;
  if (plan.kind === "topup" && !memberCanTopUp(membership?.status)) {
    return NextResponse.redirect(new URL("/?panel=credits", origin));
  }

  const planWhop = planWhopId(plan);
  const { companyId, apiKey } = whopConfig();
  if (!apiKey || !companyId) return NextResponse.redirect(plan.purchaseUrl);

  const metadata: Record<string, string> = { user_id: user.id, plan: plan.id, credits: String(plan.seconds) };
  if (plan.kind === "monthly" && membership?.id && memberCanTopUp(membership.status) && membership.plan !== plan.id) {
    metadata.replace_membership_id = membership.id;
  }

  const checkout = await whopClient().checkoutConfigurations.create({
    account_id: companyId,
    plan_id: planWhop,
    mode: "payment",
    metadata,
    redirect_url: `${APP_ORIGIN}/`,
  });
  if (checkout.id) await rememberCreditCheckout(user.id, checkout.id, plan.id);
  if (!checkout.purchase_url) {
    return NextResponse.json({ error: "Whop did not return a checkout link." }, { status: 502 });
  }
  return NextResponse.redirect(checkout.purchase_url);
}

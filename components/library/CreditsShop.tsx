"use client";

import { useEffect, useState } from "react";
import { CreditRange } from "@/components/pricing/CreditRange";
import {
  LEAD_PLANS,
  SLIDER_PLANS,
  TOPUP_PLANS,
  TOPUP_STOPS,
  formatPlanPrice,
  memberCanTopUp,
  type Plan,
} from "@/lib/plans";

type Membership = { plan: string; status: string } | null;

export function CreditsShop() {
  const [mode, setMode] = useState<"upgrade" | "once">("upgrade");
  const [picked, setPicked] = useState(LEAD_PLANS[0].id);
  const [tier, setTier] = useState(0);
  const [top, setTop] = useState(0);
  const [membership, setMembership] = useState<Membership>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let live = true;
    void fetch("/api/membership")
      .then(async (response) => {
        const body = (await response.json()) as { membership?: Membership };
        return body.membership || null;
      })
      .then((next) => {
        if (live) setMembership(next);
      })
      .catch(() => {
        if (live) setMembership(null);
      })
      .finally(() => {
        if (live) setReady(true);
      });
    return () => {
      live = false;
    };
  }, []);

  const sliderPlan = SLIDER_PLANS[tier] ?? SLIDER_PLANS[0];
  const selected = [...LEAD_PLANS, ...SLIDER_PLANS].find((plan) => plan.id === picked) || LEAD_PLANS[0];
  const topup = TOPUP_PLANS[top] ?? TOPUP_PLANS[0];
  const member = memberCanTopUp(membership?.status);
  const current = membership?.plan || "";
  const samePlan = selected.id === current;

  function chooseSlider(index: number) {
    const plan = SLIDER_PLANS[index];
    setTier(index);
    if (plan) setPicked(plan.id);
  }

  function checkout(plan: Plan) {
    window.location.assign(`/checkout/${plan.id}`);
  }

  return (
    <div>
      <div className="grid grid-cols-2 rounded-xl bg-[var(--bg)] p-1" role="tablist" aria-label="Buy credits">
        <button
          type="button"
          role="tab"
          aria-selected={mode === "upgrade"}
          onClick={() => setMode("upgrade")}
          className={`min-h-10 rounded-lg text-sm font-medium ${mode === "upgrade" ? "cf-grad text-white" : "text-[var(--muted)]"}`}
        >
          Upgrade
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={mode === "once"}
          onClick={() => setMode("once")}
          className={`min-h-10 rounded-lg text-sm font-medium ${mode === "once" ? "cf-grad text-white" : "text-[var(--muted)]"}`}
        >
          One-time
        </button>
      </div>

      {mode === "upgrade" ? (
        <div className="mt-3 space-y-2">
          {LEAD_PLANS.map((plan) => (
            <button
              key={plan.id}
              type="button"
              onClick={() => setPicked(plan.id)}
              className={`flex w-full items-center justify-between rounded-2xl border px-3 py-2.5 text-left text-sm ${picked === plan.id ? "border-white/40 bg-white/5" : "border-[var(--line)]"}`}
            >
              <span>
                {plan.seconds.toLocaleString("en-US")} credits
                {current === plan.id ? <span className="ml-2 text-[11px] uppercase tracking-[0.14em] text-[#ffb089]">Current</span> : null}
              </span>
              <span className="font-medium">{formatPlanPrice(plan.price)}/mo</span>
            </button>
          ))}
          <div className={`rounded-2xl border p-3 ${picked === sliderPlan.id ? "border-white/40 bg-white/5" : "border-[var(--line)]"}`}>
            <button type="button" onClick={() => setPicked(sliderPlan.id)} className="flex w-full items-center justify-between text-left text-sm">
              <span>
                {sliderPlan.badge ? (
                  <>
                    {sliderPlan.badge}
                    <span className="ml-2 text-[var(--muted)]">{sliderPlan.seconds.toLocaleString("en-US")} credits</span>
                  </>
                ) : (
                  `${sliderPlan.seconds.toLocaleString("en-US")} credits`
                )}
                {current === sliderPlan.id ? <span className="ml-2 text-[11px] uppercase tracking-[0.14em] text-[#ffb089]">Current</span> : null}
              </span>
              <span className="font-medium">{formatPlanPrice(sliderPlan.price)}/mo</span>
            </button>
            <div className="mt-3">
              <CreditRange labels={["250", "Max", "Ultra"]} index={tier} onChange={chooseSlider} label="Monthly plan size" />
            </div>
          </div>
          <p className="px-1 text-xs leading-relaxed text-[var(--muted)]">
            {member
              ? "A new month starts the day you pay. The plan you have now stops then."
              : "1 credit is 1 second of video. The month starts the day you pay."}
          </p>
          <button
            type="button"
            disabled={!ready || samePlan}
            onClick={() => checkout(selected)}
            className="btn-primary mt-1 w-full rounded-2xl bg-[linear-gradient(135deg,var(--cf-accent-a),var(--cf-accent-b))] px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-60"
          >
            {samePlan ? "Current plan" : member ? `Upgrade to ${formatPlanPrice(selected.price)}/mo` : `Start ${formatPlanPrice(selected.price)}/mo`}
          </button>
        </div>
      ) : member ? (
        <div className="mt-3">
          <p className="text-sm font-medium">{topup.seconds.toLocaleString("en-US")} credits</p>
          <p className="mt-1 text-2xl font-semibold">{formatPlanPrice(topup.price)}</p>
          <p className="text-xs text-[var(--muted)]">{topup.perCredit} per credit. Added once, on top of the monthly plan.</p>
          <div className="mt-4">
            <CreditRange labels={TOPUP_STOPS} index={top} onChange={setTop} label="One-time credits" />
          </div>
          <button
            type="button"
            onClick={() => checkout(topup)}
            className="btn-primary mt-4 w-full rounded-2xl bg-[linear-gradient(135deg,var(--cf-accent-a),var(--cf-accent-b))] px-4 py-2.5 text-sm font-semibold text-white"
          >
            Buy {formatPlanPrice(topup.price)}
          </button>
        </div>
      ) : (
        <p className="mt-4 text-sm leading-relaxed text-[var(--muted)]">
          {ready ? "One-time credits are for members. Start a monthly plan first." : "Loading membership…"}
        </p>
      )}
    </div>
  );
}

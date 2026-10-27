"use client";

import { useState } from "react";
import { startCheckout } from "@/components/landing/checkout";
import { MINUTE_TOPUPS } from "@/lib/plans";

function money(price: number) {
  return price.toLocaleString("en-US", { style: "currency", currency: "USD" });
}

export function CreditsShop() {
  const [index, setIndex] = useState(0);
  const [error, setError] = useState("");
  const pick = MINUTE_TOPUPS[index] || MINUTE_TOPUPS[0];

  return (
    <div className="space-y-4 text-sm leading-relaxed text-[var(--muted)]">
      <p>
        The membership pays for the Clickframes workflow: the story, the shots, and the direction. It does not sell video seconds.
      </p>
      <p>
        After the plan is active, you add your own KIE API key. Every video runs on that key, so the render is billed on your KIE account and stays cheap.
      </p>
      <div className="rounded-2xl border border-[var(--line)] p-4">
        <p className="text-[11px] uppercase tracking-[0.16em] text-[var(--muted)]">One-time minutes</p>
        <div className="mt-3 flex items-end justify-between gap-3">
          <p className="display text-3xl text-[var(--cf-ink)]">{pick.minutes} min</p>
          <p className="display text-3xl text-[var(--cf-ink)]">{money(pick.price)}</p>
        </div>
        <input
          type="range"
          className="cf-range mt-4"
          min={0}
          max={MINUTE_TOPUPS.length - 1}
          step={1}
          value={index}
          aria-label="One-time minutes"
          aria-valuetext={`${pick.minutes} minutes, ${money(pick.price)}`}
          onChange={(event) => setIndex(Number(event.target.value))}
        />
        <div className="mt-3 flex flex-wrap gap-2">
          {MINUTE_TOPUPS.map((plan, planIndex) => {
            const on = planIndex === index;
            return (
              <button
                key={plan.id}
                type="button"
                aria-pressed={on}
                onClick={() => setIndex(planIndex)}
                className={`rounded-full border px-3 py-1 text-xs tabular-nums ${on ? "border-white/40 bg-white/10 font-semibold text-white" : "border-white/10 text-[var(--muted)]"}`}
              >
                {plan.minutes}
              </button>
            );
          })}
        </div>
        <p className="mt-3 text-xs">Extra workflow minutes, charged once. They do not renew.</p>
        {error ? <p className="mt-2 text-xs text-[var(--danger)]">{error}</p> : null}
        <button
          type="button"
          onClick={() => {
            setError("");
            void startCheckout(pick.id).catch(() => setError("Couldn't open checkout."));
          }}
          className="cf-btn btn-primary mt-4 w-full rounded-xl px-4 py-2.5 text-sm font-semibold"
        >
          Buy {pick.minutes} minutes
        </button>
      </div>
    </div>
  );
}

"use client";

import { useId } from "react";

const CAP = 150;

export function CreditsWidget({
  credits,
  compact = false,
  onBuy,
}: {
  credits: number;
  compact?: boolean;
  onBuy?: () => void;
}) {
  const gradId = useId().replace(/:/g, "");
  const low = credits < 30;
  const pct = Math.max(0.04, Math.min(1, credits / CAP));
  const radius = 18;
  const circ = 2 * Math.PI * radius;

  return (
    <div className={`border bg-[var(--cf-surface-2)] shadow-[inset_0_1px_0_rgba(255,255,255,0.06)] ${compact ? "rounded-2xl px-1.5 py-2" : "rounded-[20px] p-3"} ${low ? "border-[#5B8CFF]/50" : "border-[var(--cf-line)]"}`}>
      <div className={`flex items-center ${compact ? "justify-center" : "gap-3"}`}>
        <svg viewBox="0 0 48 48" className={`shrink-0 ${compact ? "h-8 w-8" : "h-12 w-12"}`} aria-hidden="true">
          <circle cx="24" cy="24" r={radius} fill="none" stroke="rgba(255,255,255,0.08)" strokeWidth="4" />
          <circle
            cx="24"
            cy="24"
            r={radius}
            fill="none"
            stroke={low ? "#5B8CFF" : `url(#${gradId})`}
            strokeWidth="4"
            strokeLinecap="round"
            strokeDasharray={circ}
            strokeDashoffset={circ * (1 - pct)}
            transform="rotate(-90 24 24)"
          />
          <defs>
            <linearGradient id={gradId} x1="0" y1="0" x2="1" y2="1">
              <stop offset="0%" stopColor="#5B8CFF" />
              <stop offset="100%" stopColor="#7A6CFF" />
            </linearGradient>
          </defs>
        </svg>
        {compact ? null : (
          <div className="min-w-0">
            <p className="text-[10px] font-medium uppercase tracking-[0.16em] text-[var(--cf-muted)]">Membership</p>
            <p className="display text-[1.35rem] leading-none">Workflow</p>
          </div>
        )}
      </div>
      {compact ? (
        <p className="mt-0.5 text-center text-[10px] font-medium">Plan</p>
      ) : (
        <>
          <p className="mt-2 text-[11px] leading-4 text-[var(--cf-muted)]">Pays for the workflow. Video runs on your KIE key.</p>
          <button
            type="button"
            onClick={onBuy}
            className="btn-primary mt-3 flex min-h-11 w-full items-center justify-center rounded-xl bg-[linear-gradient(135deg,var(--cf-accent-a),var(--cf-accent-b))] px-3 text-sm font-semibold text-white shadow-[0_10px_28px_rgba(122,108,255,0.28)]"
          >
            Membership
          </button>
        </>
      )}
    </div>
  );
}

export function CreditsPill({ credits, onClick }: { credits: number; onClick: () => void }) {
  const low = credits < 30;
  return (
    <button
      type="button"
      onClick={onClick}
      className={`no-press inline-flex min-h-11 items-center gap-2 rounded-xl border px-3 text-sm ${low ? "border-[#5B8CFF]/60 text-[#C5D4FF]" : "border-[var(--cf-line)] text-white"} bg-[var(--cf-surface)]`}
      aria-label="Open membership"
    >
      <span className="font-medium">Membership</span>
    </button>
  );
}

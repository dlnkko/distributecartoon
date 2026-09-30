"use client";

import { useId } from "react";

const CAP = 150;

export function CreditsWidget({
  credits,
  compact = false,
}: {
  credits: number;
  compact?: boolean;
}) {
  const gradId = useId().replace(/:/g, "");
  const low = credits < 30;
  const pct = Math.max(0.04, Math.min(1, credits / CAP));
  const radius = 18;
  const circ = 2 * Math.PI * radius;

  return (
    <div className={`rounded-[20px] border bg-[var(--cf-surface-2)] p-3 shadow-[inset_0_1px_0_rgba(255,255,255,0.06)] ${low ? "border-[#FF8A3D]/50" : "border-[var(--cf-line)]"}`}>
      <div className={`flex items-center ${compact ? "justify-center" : "gap-3"}`}>
        <svg viewBox="0 0 48 48" className="h-12 w-12 shrink-0" aria-hidden="true">
          <circle cx="24" cy="24" r={radius} fill="none" stroke="rgba(255,255,255,0.08)" strokeWidth="4" />
          <circle
            cx="24"
            cy="24"
            r={radius}
            fill="none"
            stroke={low ? "#FF8A3D" : `url(#${gradId})`}
            strokeWidth="4"
            strokeLinecap="round"
            strokeDasharray={circ}
            strokeDashoffset={circ * (1 - pct)}
            transform="rotate(-90 24 24)"
          />
          <defs>
            <linearGradient id={gradId} x1="0" y1="0" x2="1" y2="1">
              <stop offset="0%" stopColor="#FF8A3D" />
              <stop offset="100%" stopColor="#FF5E62" />
            </linearGradient>
          </defs>
        </svg>
        {compact ? null : (
          <div className="min-w-0">
            <p className="text-[10px] font-medium uppercase tracking-[0.16em] text-[var(--cf-muted)]">Credits</p>
            <p className="display text-[1.7rem] leading-none tabular-nums">{credits}</p>
          </div>
        )}
      </div>
      {compact ? (
        <p className="mt-1 text-center text-sm font-medium tabular-nums">{credits}</p>
      ) : (
        <>
          <p className="mt-2 text-[11px] leading-4 text-[var(--cf-muted)]">credits = seconds of video</p>
          {low ? <p className="mt-1 text-[11px] text-[#FFB088]">Low balance. A short film needs more credits.</p> : null}
          <a
            href="/checkout/pro"
            className="btn-primary mt-3 flex min-h-11 w-full items-center justify-center rounded-xl bg-[linear-gradient(135deg,var(--cf-accent-a),var(--cf-accent-b))] px-3 text-sm font-semibold text-white shadow-[0_10px_28px_rgba(255,94,98,0.28)]"
          >
            Buy credits
          </a>
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
      className={`no-press inline-flex min-h-11 items-center gap-2 rounded-xl border px-3 text-sm ${low ? "border-[#FF8A3D]/60 text-[#FFB088]" : "border-[var(--cf-line)] text-white"} bg-[var(--cf-surface)]`}
      aria-label={`${credits} credits. Open credit details`}
    >
      <span className="font-medium tabular-nums">{credits}</span>
      <span className="text-[var(--cf-muted)]">credits</span>
    </button>
  );
}

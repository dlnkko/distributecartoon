"use client";

import { useEffect, useId, useState } from "react";

type Minutes = { totalSeconds: number; usedSeconds: number; leftSeconds: number; resetsAt: string };

let cached: Minutes | null | undefined;
let pending: Promise<void> | null = null;
const listeners = new Set<(value: Minutes | null) => void>();

function loadMinutes() {
  if (pending) return pending;
  pending = fetch("/api/workflow-minutes", { cache: "no-store" })
    .then(async (response) => (response.ok ? ((await response.json()) as { minutes?: Minutes | null }).minutes ?? null : null))
    .catch(() => null)
    .then((value) => {
      cached = value;
      listeners.forEach((listener) => listener(value));
    })
    .finally(() => {
      pending = null;
    });
  return pending;
}

export function refreshWorkflowMinutes() {
  void loadMinutes();
}

function useWorkflowMinutes() {
  const [value, setValue] = useState<Minutes | null | undefined>(cached);
  useEffect(() => {
    listeners.add(setValue);
    if (cached === undefined) void loadMinutes();
    const onFocus = () => void loadMinutes();
    window.addEventListener("focus", onFocus);
    return () => {
      listeners.delete(setValue);
      window.removeEventListener("focus", onFocus);
    };
  }, []);
  return value;
}

export function usePlanCredits() {
  const minutes = useWorkflowMinutes();
  if (minutes === undefined) return undefined;
  return minutes ? minutes.leftSeconds : 0;
}

function creditText(value: number) {
  return Math.max(0, Math.round(value)).toLocaleString("en-US");
}

export function CreditsWidget({
  compact = false,
  onBuy,
}: {
  credits?: number;
  compact?: boolean;
  onBuy?: () => void;
}) {
  const gradId = useId().replace(/:/g, "");
  const minutes = useWorkflowMinutes();
  const total = minutes?.totalSeconds || 0;
  const left = minutes?.leftSeconds ?? 0;
  const low = Boolean(minutes) && left < 30;
  const pct = total > 0 ? Math.max(0.04, Math.min(1, left / total)) : 0.04;
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
            <p className="text-[10px] font-medium uppercase tracking-[0.16em] text-[var(--cf-muted)]">Credits</p>
            <p className="display text-[1.7rem] leading-none tabular-nums">{minutes === undefined ? "…" : creditText(left)}</p>
          </div>
        )}
      </div>
      {compact ? (
        <p className="mt-0.5 text-center text-xs font-medium tabular-nums">{minutes === undefined ? "…" : creditText(left)}</p>
      ) : (
        <>
          <p className="mt-2 text-[11px] leading-4 text-[var(--cf-muted)]">credits = seconds of video</p>
          {low ? <p className="mt-1 text-[11px] text-[#C5D4FF]">Low balance. A short film needs more credits.</p> : null}
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

export function CreditsPill({ onClick }: { credits?: number; onClick: () => void }) {
  const minutes = useWorkflowMinutes();
  const left = minutes?.leftSeconds ?? 0;
  const low = Boolean(minutes) && left < 30;
  return (
    <button
      type="button"
      onClick={onClick}
      className={`no-press inline-flex min-h-11 items-center gap-2 rounded-xl border px-3 text-sm ${low ? "border-[#5B8CFF]/60 text-[#C5D4FF]" : "border-[var(--cf-line)] text-white"} bg-[var(--cf-surface)]`}
      aria-label={minutes ? `${creditText(left)} credits. Open membership` : "Open membership"}
    >
      {minutes ? (
        <>
          <span className="font-medium tabular-nums">{creditText(left)}</span>
          <span className="text-[var(--cf-muted)]">credits</span>
        </>
      ) : (
        <span className="font-medium">{minutes === undefined ? "…" : "Membership"}</span>
      )}
    </button>
  );
}

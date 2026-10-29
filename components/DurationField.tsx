"use client";

import { useEffect, useState } from "react";
import { clampTotalDuration, TOTAL_DURATION_MAX, TOTAL_DURATION_MIN } from "@/lib/ids";

function clockLabel(seconds: number) {
  const total = Math.max(0, Math.round(seconds));
  const minutes = Math.floor(total / 60);
  const rest = total % 60;
  return `${minutes}:${String(rest).padStart(2, "0")}`;
}

function readClock(text: string, fallback: number) {
  const trimmed = text.trim().toLowerCase().replace(/\s+/g, "").replace(/s$/, "");
  const clock = trimmed.match(/^(\d+):(\d{1,2})$/);
  if (clock) return Number(clock[1]) * 60 + Number(clock[2]);
  const plain = trimmed.match(/^(\d+)$/);
  if (plain) return Number(plain[1]);
  return fallback;
}

export function DurationField({
  value,
  disabled,
  onChange,
}: {
  value: number;
  disabled?: boolean;
  onChange: (seconds: number) => void;
}) {
  const seconds = clampTotalDuration(value, 30);
  const [draft, setDraft] = useState(clockLabel(seconds));
  const [editing, setEditing] = useState(false);
  const fill = ((seconds - TOTAL_DURATION_MIN) / (TOTAL_DURATION_MAX - TOTAL_DURATION_MIN)) * 100;

  useEffect(() => {
    if (!editing) setDraft(clockLabel(seconds));
  }, [editing, seconds]);

  function commit(next: number) {
    const clamped = clampTotalDuration(next, seconds);
    onChange(clamped);
    setDraft(clockLabel(clamped));
    setEditing(false);
  }

  return (
    <div className={disabled ? "pointer-events-none opacity-40" : ""}>
      <div className="flex items-center gap-2">
        <button
          type="button"
          aria-label="15 seconds shorter"
          disabled={disabled || seconds <= TOTAL_DURATION_MIN}
          onClick={() => commit(seconds - 15)}
          className="grid size-11 shrink-0 place-items-center rounded-2xl bg-black/[0.04] text-xl leading-none text-[var(--cf-ink)] hover:bg-black/[0.06] disabled:cursor-not-allowed disabled:opacity-40"
        >
          −
        </button>
        <div className="min-w-0 flex-1 text-center">
          <input
            inputMode="decimal"
            aria-label="Duration"
            disabled={disabled}
            value={draft}
            onFocus={(event) => {
              setEditing(true);
              event.currentTarget.select();
            }}
            onChange={(event) => setDraft(event.target.value)}
            onBlur={() => commit(readClock(draft, seconds))}
            onKeyDown={(event) => {
              if (event.key === "Enter") event.currentTarget.blur();
            }}
            className="display w-full bg-transparent text-center text-4xl font-semibold tabular-nums outline-none"
          />
          <p className="text-xs text-[var(--cf-muted)]">{`${seconds} seconds`}</p>
        </div>
        <button
          type="button"
          aria-label="15 seconds longer"
          disabled={disabled || seconds >= TOTAL_DURATION_MAX}
          onClick={() => commit(seconds + 15)}
          className="grid size-11 shrink-0 place-items-center rounded-2xl bg-black/[0.04] text-xl leading-none text-[var(--cf-ink)] hover:bg-black/[0.06] disabled:cursor-not-allowed disabled:opacity-40"
        >
          +
        </button>
      </div>
      <input
        type="range"
        className="duration-range mt-4 w-full"
        min={TOTAL_DURATION_MIN}
        max={TOTAL_DURATION_MAX}
        step={1}
        disabled={disabled}
        value={seconds}
        aria-label="Duration in seconds"
        aria-valuemin={TOTAL_DURATION_MIN}
        aria-valuemax={TOTAL_DURATION_MAX}
        aria-valuenow={seconds}
        aria-valuetext={`${seconds} seconds`}
        onChange={(event) => commit(Number(event.target.value))}
        style={{ background: `linear-gradient(90deg, #3d5afe ${fill}%, rgba(12,12,12,0.1) ${fill}%)` }}
      />
      <div className="mt-1.5 flex justify-between text-[11px] tabular-nums text-[var(--cf-muted)]">
        <span>{clockLabel(TOTAL_DURATION_MIN)}</span>
        <span>{clockLabel(TOTAL_DURATION_MAX)}</span>
      </div>
    </div>
  );
}

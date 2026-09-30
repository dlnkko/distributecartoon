"use client";

import { useLayoutEffect, useRef, useState } from "react";
import type { LibraryFilter } from "@/components/library/types";

const FILTERS: Array<{ id: LibraryFilter; label: string }> = [
  { id: "all", label: "All" },
  { id: "60", label: "60s" },
  { id: "120", label: "120s" },
  { id: "processing", label: "Processing" },
];

export function FilterChips({
  value,
  onChange,
}: {
  value: LibraryFilter;
  onChange: (value: LibraryFilter) => void;
}) {
  const rowRef = useRef<HTMLDivElement>(null);
  const [box, setBox] = useState({ left: 0, width: 0 });

  useLayoutEffect(() => {
    const row = rowRef.current;
    const active = row?.querySelector<HTMLElement>("[data-active='true']");
    if (!row || !active) return;
    setBox({ left: active.offsetLeft, width: active.offsetWidth });
  }, [value]);

  return (
    <div className="cf-scroll -mx-1 overflow-x-auto px-1">
      <div ref={rowRef} className="relative flex w-max min-w-full snap-x gap-1 rounded-full border border-[var(--cf-line)] bg-[var(--cf-surface)] p-1">
        <span
          className="cf-chip-indicator pointer-events-none absolute top-1 bottom-1 rounded-full bg-white/10 shadow-[inset_0_1px_0_rgba(255,255,255,0.08)] transition-all duration-300 ease-[cubic-bezier(0.22,1,0.36,1)]"
          style={{ left: box.left, width: box.width }}
        />
        {FILTERS.map((item) => {
          const active = item.id === value;
          return (
            <button
              key={item.id}
              type="button"
              data-active={active ? "true" : "false"}
              aria-pressed={active}
              onClick={() => onChange(item.id)}
              className={`no-press relative z-10 min-h-11 snap-start rounded-full px-4 text-sm ${active ? "text-white" : "text-[var(--cf-muted)]"}`}
            >
              {item.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}

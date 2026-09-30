export function Mark({ className = "h-[18px] w-[18px]" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden="true">
      <rect x="4" y="3.6" width="16" height="2.2" rx="1.1" fill="currentColor" />
      <rect x="4" y="18.2" width="16" height="2.2" rx="1.1" fill="currentColor" />
      <path fill="currentColor" d="M9.2 8.4v7.2l6.2-3.6-6.2-3.6Z" />
    </svg>
  );
}

export function Brand({ word = true, tone = "ink", compact = false }: { word?: boolean; tone?: "ink" | "accent"; compact?: boolean }) {
  const plate =
    tone === "accent"
      ? "bg-[linear-gradient(135deg,#FF8A3D,#FF5E62)] text-white shadow-[0_8px_20px_rgba(255,94,98,0.35)]"
      : "bg-[var(--ink)] text-white shadow-[0_8px_16px_rgba(28,25,23,0.16)]";
  return (
    <span className="inline-flex min-w-0 items-center gap-2.5">
      <span className={`grid shrink-0 place-items-center rounded-lg ${compact ? "h-7 w-7" : "h-8 w-8 rounded-xl"} ${plate}`}>
        <Mark className={compact ? "h-3.5 w-3.5" : "h-[18px] w-[18px]"} />
      </span>
      {word ? <span className="display truncate text-[1.15rem] leading-none tracking-[-0.04em]">clickframes</span> : null}
    </span>
  );
}

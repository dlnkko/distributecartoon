export function Mark({ className = "h-8 w-8" }: { className?: string }) {
  const stroke = {
    fill: "none",
    strokeWidth: 2.5,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
  };
  return (
    <svg viewBox="0 0 32 32" className={className} aria-hidden="true">
      <path d="M5.1 12.8V5.1H12.8" stroke="currentColor" {...stroke} />
      <path d="M19.2 5.1H26.9V12.8" stroke="currentColor" {...stroke} />
      <path d="M26.9 19.2V26.9H19.2" stroke="currentColor" {...stroke} />
      <path d="M12.8 26.9H5.1V19.2" stroke="#3d5afe" {...stroke} />
    </svg>
  );
}

export function Brand({ word = true, tone = "ink", compact = false }: { word?: boolean; tone?: "ink" | "accent"; compact?: boolean }) {
  void tone;
  return (
    <span className="inline-flex min-w-0 items-center gap-2.5 text-[#0c0c0c]">
      <Mark className={compact ? "h-7 w-7" : "h-8 w-8"} />
      {word ? <span className="truncate text-[1.15rem] font-semibold leading-none tracking-[-0.04em]">clickframes</span> : null}
    </span>
  );
}

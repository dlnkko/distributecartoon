"use client";

export function CreditRange({
  labels,
  index,
  onChange,
  label,
  idleClass = "text-[var(--cf-muted)]",
}: {
  labels: string[];
  index: number;
  onChange: (index: number) => void;
  label: string;
  idleClass?: string;
}) {
  const safe = Math.min(Math.max(0, index), Math.max(0, labels.length - 1));
  return (
    <div>
      <input
        type="range"
        className="cf-range"
        min={0}
        max={Math.max(0, labels.length - 1)}
        step={1}
        value={safe}
        aria-label={label}
        aria-valuetext={labels[safe] || ""}
        onChange={(event) => onChange(Number(event.target.value))}
      />
      <div className="mt-1 flex justify-between gap-1 text-[11px]">
        {labels.map((item, itemIndex) => (
          <button
            key={`${item}-${itemIndex}`}
            type="button"
            onClick={() => onChange(itemIndex)}
            className={itemIndex === safe ? "font-semibold text-white" : idleClass}
          >
            {item}
          </button>
        ))}
      </div>
    </div>
  );
}

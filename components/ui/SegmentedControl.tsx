"use client";

interface SegmentedControlProps {
  value: "over" | "under";
  onChange: (value: "over" | "under") => void;
  disabled?: boolean;
  /** Quant-style labels: Long/Short instead of Over/Under */
  quantLabels?: boolean;
}

export function SegmentedControl({ value, onChange, disabled, quantLabels }: SegmentedControlProps) {
  const longActive = value === "over";
  const shortActive = value === "under";

  return (
    <div className="relative flex w-full rounded-sm bg-white/[0.03] border border-white/[0.08] p-0.5 h-9">
      {/* Sliding background indicator */}
      <div
        className="absolute top-0.5 bottom-0.5 w-[calc(50%-4px)] rounded-sm transition-all duration-300 ease-out"
        style={{
          left: longActive ? "2px" : "calc(50% + 2px)",
          backgroundColor: longActive ? "rgba(52, 211, 153, 0.25)" : "rgba(244, 63, 94, 0.25)",
          boxShadow: longActive
            ? "0 0 12px rgba(52, 211, 153, 0.2)"
            : "0 0 12px rgba(244, 63, 94, 0.2)",
        }}
      />
      <button
        type="button"
        onClick={() => onChange("over")}
        disabled={disabled}
        className={`relative flex-1 rounded-sm text-[11px] font-bold transition-colors duration-200 z-10 ${
          longActive
            ? "text-emerald-400"
            : "text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-white/[0.02]"
        } disabled:opacity-50 disabled:cursor-not-allowed`}
      >
        <span className="flex items-center justify-center gap-1.5">
          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 10l7-7m0 0l7 7m-7-7v18" />
          </svg>
          {quantLabels ? "Long" : "Over"}
        </span>
      </button>
      <button
        type="button"
        onClick={() => onChange("under")}
        disabled={disabled}
        className={`relative flex-1 rounded-sm text-[11px] font-bold transition-colors duration-200 z-10 ${
          shortActive
            ? "text-rose-400"
            : "text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-white/[0.02]"
        } disabled:opacity-50 disabled:cursor-not-allowed`}
      >
        <span className="flex items-center justify-center gap-1.5">
          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M19 14l-7 7m0 0l-7-7m7 7V3" />
          </svg>
          {quantLabels ? "Short" : "Under"}
        </span>
      </button>
    </div>
  );
}

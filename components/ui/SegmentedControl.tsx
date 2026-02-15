"use client";

interface SegmentedControlProps {
  value: "over" | "under";
  onChange: (value: "over" | "under") => void;
  disabled?: boolean;
  /** Quant-style labels: Long/Short instead of Over/Under */
  quantLabels?: boolean;
}

export function SegmentedControl({ value, onChange, disabled, quantLabels }: SegmentedControlProps) {
  const accent = "bg-[#0ea5e9] text-white shadow-[0_0_10px_rgba(14,165,233,0.25)]";
  return (
    <div className="flex w-full rounded-lg bg-white/[0.03] border border-white/[0.08] p-0.5 h-10">
      <button
        type="button"
        onClick={() => onChange("over")}
        disabled={disabled}
        className={`flex-1 rounded-md text-xs font-bold transition-all duration-200 ${
          value === "over" ? accent : "text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-white/[0.03]"
        } disabled:opacity-50 disabled:cursor-not-allowed`}
      >
        <span className="flex items-center justify-center gap-1.5">
          <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 10l7-7m0 0l7 7m-7-7v18" />
          </svg>
          {quantLabels ? "Long" : "Over"}
        </span>
      </button>
      <button
        type="button"
        onClick={() => onChange("under")}
        disabled={disabled}
        className={`flex-1 rounded-md text-xs font-bold transition-all duration-200 ${
          value === "under" ? accent : "text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-white/[0.03]"
        } disabled:opacity-50 disabled:cursor-not-allowed`}
      >
        <span className="flex items-center justify-center gap-1.5">
          <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M19 14l-7 7m0 0l-7-7m7 7V3" />
          </svg>
          {quantLabels ? "Short" : "Under"}
        </span>
      </button>
    </div>
  );
}

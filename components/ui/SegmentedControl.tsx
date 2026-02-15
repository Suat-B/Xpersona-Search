"use client";

interface SegmentedControlProps {
  value: "over" | "under";
  onChange: (value: "over" | "under") => void;
  disabled?: boolean;
  /** Quant-style labels: Long/Short instead of Over/Under */
  quantLabels?: boolean;
}

export function SegmentedControl({ value, onChange, disabled, quantLabels }: SegmentedControlProps) {
  const accent = "bg-[#0ea5e9] text-white shadow-lg shadow-[#0ea5e9]/30";
  return (
    <div className="inline-flex rounded-xl bg-[var(--bg-matte)] border border-[var(--border)] p-1">
      <button
        type="button"
        onClick={() => onChange("over")}
        disabled={disabled}
        className={`px-6 py-2.5 rounded-lg text-sm font-semibold transition-all duration-200 ${
          value === "over" ? accent : "text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
        } disabled:opacity-50 disabled:cursor-not-allowed`}
      >
        <span className="flex items-center gap-2">
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 10l7-7m0 0l7 7m-7-7v18" />
          </svg>
          {quantLabels ? "Long" : "Over"}
        </span>
      </button>
      <button
        type="button"
        onClick={() => onChange("under")}
        disabled={disabled}
        className={`px-6 py-2.5 rounded-lg text-sm font-semibold transition-all duration-200 ${
          value === "under" ? accent : "text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
        } disabled:opacity-50 disabled:cursor-not-allowed`}
      >
        <span className="flex items-center gap-2">
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 14l-7 7m0 0l-7-7m7 7V3" />
          </svg>
          {quantLabels ? "Short" : "Under"}
        </span>
      </button>
    </div>
  );
}

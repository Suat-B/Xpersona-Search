"use client";

interface SegmentedControlProps {
  value: "over" | "under";
  onChange: (value: "over" | "under") => void;
  disabled?: boolean;
}

export function SegmentedControl({ value, onChange, disabled }: SegmentedControlProps) {
  return (
    <div className="inline-flex rounded-xl bg-[var(--bg-matte)] border border-[var(--border)] p-1">
      <button
        type="button"
        onClick={() => onChange("over")}
        disabled={disabled}
        className={`px-6 py-2.5 rounded-lg text-sm font-semibold transition-all duration-200 ${
          value === "over"
            ? "bg-[var(--accent-heart)] text-white shadow-lg shadow-[var(--accent-heart)]/30"
            : "text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
        } disabled:opacity-50 disabled:cursor-not-allowed`}
      >
        <span className="flex items-center gap-2">
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 10l7-7m0 0l7 7m-7-7v18" />
          </svg>
          Over
        </span>
      </button>
      <button
        type="button"
        onClick={() => onChange("under")}
        disabled={disabled}
        className={`px-6 py-2.5 rounded-lg text-sm font-semibold transition-all duration-200 ${
          value === "under"
            ? "bg-[var(--accent-heart)] text-white shadow-lg shadow-[var(--accent-heart)]/30"
            : "text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
        } disabled:opacity-50 disabled:cursor-not-allowed`}
      >
        <span className="flex items-center gap-2">
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 14l-7 7m0 0l-7-7m7 7V3" />
          </svg>
          Under
        </span>
      </button>
    </div>
  );
}

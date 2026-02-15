"use client";

interface QuickBetButtonsProps {
  onHalf: () => void;
  onDouble: () => void;
  onMax: () => void;
  disabled?: boolean;
  currentAmount: number;
  maxAmount: number;
}

const btnBase = "px-3.5 py-2 text-xs font-bold font-mono rounded-full border transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed border-white/[0.08] bg-white/[0.03] text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-white/[0.06] hover:border-[#0ea5e9]/40 hover:shadow-[0_0_12px_rgba(14,165,233,0.15)]";

export function QuickBetButtons({
  onHalf,
  onDouble,
  onMax,
  disabled,
  currentAmount,
  maxAmount,
}: QuickBetButtonsProps) {
  return (
    <div className="flex gap-1.5">
      <button
        type="button"
        onClick={onHalf}
        disabled={disabled || currentAmount <= 1}
        className={btnBase}
      >
        ½
      </button>
      <button
        type="button"
        onClick={onDouble}
        disabled={disabled || currentAmount * 2 > maxAmount}
        className={btnBase}
      >
        2×
      </button>
      <button
        type="button"
        onClick={onMax}
        disabled={disabled}
        className={btnBase}
      >
        Max
      </button>
    </div>
  );
}

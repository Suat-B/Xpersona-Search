"use client";

interface QuickBetButtonsProps {
  onHalf: () => void;
  onDouble: () => void;
  onMax: () => void;
  disabled?: boolean;
  currentAmount: number;
  maxAmount: number;
}

export function QuickBetButtons({ 
  onHalf, 
  onDouble, 
  onMax, 
  disabled,
  currentAmount,
  maxAmount 
}: QuickBetButtonsProps) {
  return (
    <div className="flex gap-1">
      <button
        type="button"
        onClick={onHalf}
        disabled={disabled || currentAmount <= 1}
        className="px-3 py-1.5 text-xs font-medium rounded-lg border border-[var(--border)] bg-[var(--bg-matte)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:border-[var(--accent-heart)]/50 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
      >
        ½
      </button>
      <button
        type="button"
        onClick={onDouble}
        disabled={disabled || currentAmount * 2 > maxAmount}
        className="px-3 py-1.5 text-xs font-medium rounded-lg border border-[var(--border)] bg-[var(--bg-matte)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:border-[var(--accent-heart)]/50 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
      >
        2×
      </button>
      <button
        type="button"
        onClick={onMax}
        disabled={disabled}
        className="px-3 py-1.5 text-xs font-medium rounded-lg border border-[var(--border)] bg-[var(--bg-matte)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:border-[var(--accent-heart)]/50 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
      >
        Max
      </button>
    </div>
  );
}

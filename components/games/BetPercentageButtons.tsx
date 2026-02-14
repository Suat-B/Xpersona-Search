"use client";

interface BetPercentageButtonsProps {
  balance: number;
  onBetChange: (amount: number) => void;
  disabled?: boolean;
  currentBet: number;
}

const PERCENTAGES = [
  { label: "1%", value: 0.01 },
  { label: "10%", value: 0.1 },
  { label: "25%", value: 0.25 },
  { label: "50%", value: 0.5 },
  { label: "MAX", value: 1 },
];

export function BetPercentageButtons({ 
  balance, 
  onBetChange, 
  disabled = false,
  currentBet 
}: BetPercentageButtonsProps) {
  const handleClick = (percentage: number) => {
    const newBet = Math.max(1, Math.floor(balance * percentage));
    onBetChange(newBet);
  };

  return (
    <div className="flex items-center gap-1">
      {PERCENTAGES.map(({ label, value }) => {
        const calculatedBet = Math.max(1, Math.floor(balance * value));
        const isActive = currentBet === calculatedBet;
        
        return (
          <button
            key={label}
            onClick={() => handleClick(value)}
            disabled={disabled || balance < 1}
            className={`
              px-2 py-1 text-[10px] font-bold rounded-md transition-all
              ${isActive 
                ? "bg-[var(--accent-heart)] text-white" 
                : "bg-[var(--bg-matte)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-white/5"
              }
              disabled:opacity-30 disabled:cursor-not-allowed
            `}
          >
            {label}
          </button>
        );
      })}
    </div>
  );
}

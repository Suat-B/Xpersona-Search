"use client";

import { DICE_HOUSE_EDGE } from "@/lib/constants";

interface WinPreviewProps {
  amount: number;
  target: number;
  condition: "over" | "under";
  className?: string;
}

export function WinPreview({ amount, target, condition, className = "" }: WinPreviewProps) {
  // Calculate probability and multiplier
  const probability = condition === "over" 
    ? (100 - target) / 100 
    : target / 100;
  
  const multiplier = (1 - DICE_HOUSE_EDGE) / probability;
  const potentialWin = Math.floor(amount * multiplier);
  const netProfit = potentialWin - amount;

  return (
    <div className={`p-3 rounded-lg bg-[var(--bg-card)] border border-[var(--border)] ${className}`}>
      <div className="flex items-center justify-between mb-2">
        <span className="text-xs text-[var(--text-secondary)]">Potential Win</span>
        <span className="text-sm font-bold text-emerald-400">
          +{netProfit.toLocaleString()} credits
        </span>
      </div>
      <div className="flex items-center justify-between text-xs">
        <span className="text-[var(--text-secondary)]">Total Return</span>
        <span className="font-mono font-bold text-[var(--text-primary)]">
          {potentialWin.toLocaleString()} credits
        </span>
      </div>
      <div className="mt-2 h-1 bg-[var(--bg-matte)] rounded-full overflow-hidden">
        <div 
          className="h-full bg-gradient-to-r from-emerald-500 to-[var(--accent-heart)] rounded-full"
          style={{ width: `${Math.min(100, (netProfit / amount) * 10)}%` }}
        />
      </div>
    </div>
  );
}

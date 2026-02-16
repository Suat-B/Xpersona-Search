"use client";

import { DICE_HOUSE_EDGE } from "@/lib/constants";

interface ProbabilityBarProps {
  target: number;
  condition: "over" | "under";
  className?: string;
}

export function ProbabilityBar({ target, condition, className = "" }: ProbabilityBarProps) {
  // Calculate probability
  const probability = condition === "over" 
    ? (100 - target) / 100 
    : target / 100;
  
  const percentage = Math.round(probability * 100);
  
  // Calculate multiplier
  const multiplier = (1 - DICE_HOUSE_EDGE) / probability;
  
  // Risk level based on probability
  let riskLevel: { label: string; color: string };
  if (percentage >= 50) {
    riskLevel = { label: "Low Risk", color: "bg-emerald-500" };
  } else if (percentage >= 25) {
    riskLevel = { label: "Medium Risk", color: "bg-[#0ea5e9]" };
  } else if (percentage >= 10) {
    riskLevel = { label: "High Risk", color: "bg-[#ff453a]" };
  } else {
    riskLevel = { label: "Extreme Risk", color: "bg-red-500" };
  }

  return (
    <div className={`space-y-2 ${className}`}>
      {/* Probability visualization */}
      <div className="relative h-3 bg-[var(--bg-matte)] rounded-full overflow-hidden">
        <div 
          className={`absolute h-full rounded-full transition-all duration-500 ${riskLevel.color}`}
          style={{ width: `${percentage}%` }}
        />
        {/* Divider line at target */}
        <div 
          className="absolute top-0 bottom-0 w-0.5 bg-white/50"
          style={{ left: `${condition === "over" ? target : target}%` }}
        />
      </div>
      
      {/* Stats row */}
      <div className="flex items-center justify-between text-xs">
        <div className="flex items-center gap-2">
          <span className="text-[var(--text-secondary)]">Win chance:</span>
          <span className={`font-bold ${riskLevel.color.replace("bg-", "text-")}`}>
            {percentage}%
          </span>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-[var(--text-secondary)]">Multiplier:</span>
          <span className="font-bold text-[var(--accent-heart)]">
            {multiplier.toFixed(2)}×
          </span>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-[var(--text-secondary)]">Risk:</span>
          <span className={`font-bold ${riskLevel.color.replace("bg-", "text-")}`}>
            {riskLevel.label}
          </span>
        </div>
      </div>
    </div>
  );
}

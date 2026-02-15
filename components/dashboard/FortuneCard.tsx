"use client";

import { useMemo } from "react";
import { cn } from "@/lib/utils";

const FORTUNES = [
  "The house always has an edge. Play with it, not against it.",
  "Martingale: exponential gains, exponential pain.",
  "Paroli loves the hot hand. Ride it.",
  "Target 50% and let variance be your friend.",
  "One bet does not define a session. Compounding does.",
  "The best strategy is the one you can stick to.",
  "RTP 97% — the 3% is the house rent.",
  "Provably fair means you can always verify. Trust, but verify.",
  "Your edge is patience. The casino's edge is time.",
  "Over or under — the dice don't care about your streak.",
  "Flat bets sleep well. Martingale dreams big.",
  "The Kelly Criterion says: bet a fraction, not the farm.",
  "Session PnL is noise. Bankroll management is signal.",
  "OpenClaw AI doesn't tilt. Neither should you.",
  "Three greens in a row? Variance. Not strategy.",
  "Free Credits giveth. The house edge taketh.",
  "Balance is a state. Withdrawable is a constraint.",
  "Each roll is independent. Your psychology is not.",
  "Strategy runs are synchronous. Life is async.",
  "Sharpe ratio: risk-adjusted returns. Play long.",
];

function getFortuneForDay(): string {
  const d = new Date();
  const dayOfYear = Math.floor((d.getTime() - new Date(d.getFullYear(), 0, 0).getTime()) / 86400000);
  const index = dayOfYear % FORTUNES.length;
  return FORTUNES[index];
}

export function FortuneCard() {
  const fortune = useMemo(() => getFortuneForDay(), []);

  return (
    <div className={cn(
      "agent-card p-5 h-[140px] flex flex-col justify-between",
      "border-[#bf5af2]/20",
      "hover:border-[#bf5af2]/40 transition-all duration-300"
    )}
    >
      <div className="flex items-start gap-3">
        <div className={cn(
          "flex h-11 w-11 shrink-0 items-center justify-center rounded-xl",
          "bg-[#bf5af2]/10 border border-[#bf5af2]/20 text-[#bf5af2]"
        )}
        >
          <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M5 3v4M3 5h4M6 17v4m-2-2h4m5-16l2.286 6.857L21 12l-5.714 2.143L13 21l-2.286-6.857L5 12l5.714-2.143L13 3z" />
          </svg>
        </div>
        
        <div className="flex-1 min-w-0">
          <div className="text-[10px] font-semibold text-[#bf5af2]/80 uppercase tracking-wider mb-1">
            Fortune of the Day
          </div>
          <p className="text-sm text-[var(--text-secondary)] leading-relaxed line-clamp-2">
            &ldquo;{fortune}&rdquo;
          </p>
        </div>
      </div>
      
      <div className="flex items-center justify-between">
        <span className="text-[10px] text-[var(--text-quaternary)]">
          Updated daily at 00:00 UTC
        </span>
        
        <div className="flex items-center gap-1.5">
          <span className="w-1.5 h-1.5 rounded-full bg-[#bf5af2] animate-pulse" />
          <span className="text-[10px] text-[#bf5af2]/70">Active</span>
        </div>
      </div>
    </div>
  );
}

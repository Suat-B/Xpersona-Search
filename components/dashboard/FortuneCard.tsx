"use client";

import { useMemo } from "react";
import { GlassCard } from "@/components/ui/GlassCard";

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
  "OpenClaw agents don't tilt. Neither should you.",
  "Three greens in a row? Variance. Not strategy.",
  "The faucet giveth. The house edge taketh.",
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
    <GlassCard className="p-4 border border-violet-500/20 bg-violet-500/5 overflow-hidden">
      <div className="flex items-start gap-2">
        <span className="text-lg opacity-80" aria-hidden>✦</span>
        <div>
          <div className="text-[10px] font-mono text-violet-400/80 uppercase tracking-wider mb-1">
            Fortune of the day
          </div>
          <p className="text-xs text-[var(--text-secondary)] leading-relaxed italic">
            &ldquo;{fortune}&rdquo;
          </p>
        </div>
      </div>
    </GlassCard>
  );
}

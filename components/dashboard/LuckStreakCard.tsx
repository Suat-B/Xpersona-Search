"use client";

import { useState, useEffect, useCallback } from "react";
import { GlassCard } from "@/components/ui/GlassCard";

type StreakState = "hot" | "cold" | "neutral";

export function LuckStreakCard() {
  const [streak, setStreak] = useState(0);
  const [state, setState] = useState<StreakState>("neutral");
  const [recentWins, setRecentWins] = useState(0);
  const [recentTotal, setRecentTotal] = useState(0);

  const refresh = useCallback(async () => {
    try {
      const res = await fetch("/api/me/bets?gameType=dice&limit=20", { credentials: "include" });
      const data = await res.json().catch(() => ({}));
      if (!data.success || !Array.isArray(data.data?.bets)) return;
      const bets = data.data.bets as { outcome: string }[];
      const wins = bets.filter((b) => b.outcome === "win").length;
      setRecentTotal(bets.length);
      setRecentWins(wins);

      // Compute current streak (from most recent)
      let currentStreak = 0;
      const isWin = (b: { outcome: string }) => b.outcome === "win";
      for (let i = 0; i < bets.length; i++) {
        if (isWin(bets[i])) {
          currentStreak = currentStreak >= 0 ? currentStreak + 1 : 1;
        } else {
          currentStreak = currentStreak <= 0 ? currentStreak - 1 : -1;
        }
      }
      setStreak(currentStreak);

      // Hot/cold from recent win rate
      const rate = bets.length > 0 ? wins / bets.length : 0.5;
      if (rate >= 0.55) setState("hot");
      else if (rate <= 0.45) setState("cold");
      else setState("neutral");
    } catch {
      setState("neutral");
      setStreak(0);
    }
  }, []);

  useEffect(() => {
    refresh();
    window.addEventListener("balance-updated", refresh);
    return () => window.removeEventListener("balance-updated", refresh);
  }, [refresh]);

  const label = state === "hot" ? "Running Hot" : state === "cold" ? "Running Cold" : "Neutral";
  const emoji = state === "hot" ? "🔥" : state === "cold" ? "🧊" : "◎";
  const glowClass = state === "hot" ? "border-emerald-500/30 text-emerald-400" : state === "cold" ? "border-red-500/30 text-red-400" : "border-white/10 text-[var(--text-secondary)]";

  return (
    <GlassCard className={`p-4 border-2 ${glowClass} transition-all duration-300`}>
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <span className="text-2xl animate-pulse" aria-hidden>{emoji}</span>
          <div>
            <div className="text-xs font-mono text-[var(--text-secondary)] uppercase tracking-wider">Luck</div>
            <div className={`text-sm font-bold ${state === "hot" ? "text-emerald-400" : state === "cold" ? "text-red-400" : "text-[var(--text-primary)]"}`}>
              {label}
            </div>
          </div>
        </div>
        <div className="text-right">
          <div className="text-2xl font-mono font-bold tabular-nums">
            {streak > 0 ? `+${streak}` : streak}
          </div>
          <div className="text-[10px] text-[var(--text-secondary)] uppercase">Streak</div>
        </div>
      </div>
      {recentTotal > 0 && (
        <p className="mt-2 text-[10px] text-[var(--text-secondary)]">
          Last {recentTotal} bets: {recentWins}W · {recentTotal - recentWins}L
        </p>
      )}
    </GlassCard>
  );
}

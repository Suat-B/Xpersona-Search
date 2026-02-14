"use client";

import { useState, useEffect, useCallback } from "react";
import { cn } from "@/lib/utils";

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

  const config = {
    hot: {
      gradient: "from-[#30d158]/20 via-[#30d158]/10 to-transparent",
      border: "border-[#30d158]/30",
      iconBg: "bg-[#30d158]/10 border-[#30d158]/20 text-[#30d158]",
      text: "text-[#30d158]",
      label: "Running Hot",
      icon: (
        <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M17.657 18.657A8 8 0 016.343 7.343S7 9 9 10c0-2 .5-5 2.986-7C14 5 16.09 5.777 17.656 7.343A7.975 7.975 0 0120 13a7.975 7.975 0 01-2.343 5.657z" />
        </svg>
      ),
      glow: "shadow-[0_0_30px_rgba(48,209,88,0.15)]",
    },
    cold: {
      gradient: "from-[#0a84ff]/20 via-[#0a84ff]/10 to-transparent",
      border: "border-[#0a84ff]/30",
      iconBg: "bg-[#0a84ff]/10 border-[#0a84ff]/20 text-[#0a84ff]",
      text: "text-[#0a84ff]",
      label: "Running Cold",
      icon: (
        <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M14.828 14.828a4 4 0 01-5.656 0M9 10h.01M15 10h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
      ),
      glow: "shadow-[0_0_30px_rgba(10,132,255,0.15)]",
    },
    neutral: {
      gradient: "from-white/10 via-white/5 to-transparent",
      border: "border-white/10",
      iconBg: "bg-white/[0.04] border-white/[0.08] text-[var(--text-tertiary)]",
      text: "text-[var(--text-secondary)]",
      label: "Neutral",
      icon: (
        <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M8 12h.01M12 12h.01M16 12h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
      ),
      glow: "",
    },
  }[state];

  return (
    <div className={cn(
      "agent-card p-5 h-[140px] flex flex-col justify-between transition-all duration-300",
      config.border,
      config.glow,
      "hover:border-[var(--border-strong)]"
    )}
    >
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className={cn(
            "flex h-11 w-11 items-center justify-center rounded-xl border",
            config.iconBg
          )}
          >
            {config.icon}
          </div>
          
          <div>
            <div className="text-xs font-semibold text-[var(--text-tertiary)] uppercase tracking-wider">Luck</div>
            <div className={cn("text-sm font-semibold", config.text)}>
              {config.label}
            </div>
          </div>
        </div>
        
        <div className="text-right">
          <div className={cn("text-3xl font-semibold tabular-nums", config.text)}>
            {streak > 0 ? `+${streak}` : streak}
          </div>
          <div className="text-xs text-[var(--text-tertiary)] font-medium">Streak</div>
        </div>
      </div>
      
      <div className="flex items-center justify-between">
        {recentTotal > 0 ? (
          <span className="text-xs text-[var(--text-tertiary)]">
            Last {recentTotal} bets: {recentWins}W · {recentTotal - recentWins}L
          </span>
        ) : (
          <span className="text-xs text-[var(--text-tertiary)]">Awaiting data...</span>
        )}
        
        <div className="flex gap-0.5" aria-hidden>
          {[...Array(5)].map((_, i) => {
            const filled = i < Math.round((recentWins / (recentTotal || 1)) * 5);
            const dotColor = state === "hot" ? "bg-[#30d158]" : state === "cold" ? "bg-[#0a84ff]" : "bg-[var(--text-tertiary)]";
            return (
              <div
                key={i}
                className={cn("w-1 h-1 rounded-full transition-colors", filled ? dotColor : "bg-white/10")}
              />
            );
          })}
        </div>
      </div>
    </div>
  );
}

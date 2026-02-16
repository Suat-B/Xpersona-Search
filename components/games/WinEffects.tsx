"use client";

import { useEffect, useState } from "react";

interface WinEffectsProps {
  active: boolean;
  win: boolean;
  nearMiss?: boolean;
  payout: number;
  betAmount: number;
  /** Consecutive win streak for tiered celebration (3+ = fire mode) */
  streakCount?: number;
}

export function WinEffects({
  active,
  win,
  nearMiss = false,
  payout,
  betAmount,
  streakCount = 0,
}: WinEffectsProps) {
  const [showEffects, setShowEffects] = useState(false);

  useEffect(() => {
    if (active) {
      setShowEffects(true);
      const duration = nearMiss ? 800 : win && (payout >= 5 * betAmount || streakCount >= 8) ? 1500 : 600;
      const timer = setTimeout(() => setShowEffects(false), duration);
      return () => clearTimeout(timer);
    }
  }, [active, nearMiss, win, payout, betAmount, streakCount]);

  // Mega win: apply screen shake to body
  const megaTier = win && betAmount > 0 && payout >= 5 * betAmount;
  useEffect(() => {
    if (active && megaTier) {
      document.body.classList.add("animate-screen-shake");
      const t = setTimeout(() => document.body.classList.remove("animate-screen-shake"), 400);
      return () => {
        clearTimeout(t);
        document.body.classList.remove("animate-screen-shake");
      };
    }
  }, [active, megaTier]);

  if (!showEffects) return null;

  if (nearMiss) {
    return (
      <div className="fixed inset-0 pointer-events-none z-50 overflow-hidden">
        <div className="absolute inset-0 rounded-none animate-near-miss-flash" style={{ animationDuration: "0.6s" }} />
      </div>
    );
  }

  if (!win) {
    return (
      <div className="fixed inset-0 pointer-events-none z-50 overflow-hidden">
        <div className="absolute inset-0 rounded-none win-effects-border-lose" style={{ animationDuration: "0.4s" }} />
      </div>
    );
  }

  const profitMultiplier = betAmount > 0 ? payout / betAmount : 0;
  const isMegaWin = profitMultiplier >= 5;
  const isStreakWin = streakCount >= 3;
  const isBigWin = profitMultiplier >= 2 && !isStreakWin && !isMegaWin;
  const profit = payout - betAmount;

  return (
    <div className="fixed inset-0 pointer-events-none z-50 overflow-hidden">
      {/* Tier 1: Standard win — green border */}
      {!isBigWin && !isStreakWin && !isMegaWin && (
        <div className="absolute inset-0 rounded-none win-effects-border-win" style={{ animationDuration: "0.4s" }} />
      )}

      {/* Tier 2: Big win (2x+) — golden glow */}
      {isBigWin && <div className="absolute inset-0 rounded-none win-effects-border-gold" />}

      {/* Tier 3: Streak win (3+) — fire border + ON FIRE overlay */}
      {isStreakWin && !isMegaWin && (
        <>
          <div className="absolute inset-0 rounded-none animate-fire-glow" style={{ boxShadow: "inset 0 0 0 4px rgba(249, 115, 22, 0.7), inset 0 0 80px rgba(239, 68, 68, 0.2)" }} />
          <div className="absolute inset-0 flex items-center justify-center">
            <span
              className="text-2xl font-black uppercase tracking-[0.3em] text-transparent bg-clip-text bg-gradient-to-r from-amber-400 via-orange-500 to-red-500 animate-pulse"
              style={{ textShadow: "0 0 30px rgba(249, 115, 22, 0.8), 0 0 60px rgba(239, 68, 68, 0.5)" }}
            >
              {streakCount >= 8 ? "LEGENDARY" : "ON FIRE"}
            </span>
          </div>
        </>
      )}

      {/* Tier 4: Mega win (5x+) — radial glow + floating profit */}
      {isMegaWin && (
        <>
          <div
            className="absolute inset-0 flex items-center justify-center"
            style={{
              background: "radial-gradient(ellipse at center, rgba(251, 191, 36, 0.25) 0%, transparent 70%)",
              animation: "fade-in-up 0.5s ease-out",
            }}
          />
          <div className="absolute inset-0 flex items-center justify-center">
            <span className="animate-float-up text-3xl font-black tabular-nums text-amber-400" style={{ textShadow: "0 0 24px rgba(251, 191, 36, 0.8)" }}>
              +{profit} U
            </span>
          </div>
        </>
      )}
    </div>
  );
}

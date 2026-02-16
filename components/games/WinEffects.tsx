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

  if (!showEffects) return null;

  return null;
}

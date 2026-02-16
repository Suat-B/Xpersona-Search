"use client";

import { useEffect, useState, useCallback } from "react";

interface WinEffectsProps {
  active: boolean;
  win: boolean;
  nearMiss?: boolean;
  payout: number;
  betAmount: number;
  streakCount?: number;
}

interface FloatingParticle {
  id: number;
  x: number;
  y: number;
  px: number;
  py: number;
  delay: number;
  size: number;
}

export function WinEffects({
  active,
  win,
  nearMiss = false,
  payout,
  betAmount,
  streakCount = 0,
}: WinEffectsProps) {
  const [effectTier, setEffectTier] = useState<0 | 1 | 2 | 3>(0);
  const [showRing, setShowRing] = useState(false);
  const [showFlash, setShowFlash] = useState(false);
  const [particles, setParticles] = useState<FloatingParticle[]>([]);
  const [profitText, setProfitText] = useState<string | null>(null);

  const generateParticles = useCallback((count: number): FloatingParticle[] => {
    return Array.from({ length: count }, (_, i) => {
      const angle = (i / count) * Math.PI * 2 + (Math.random() - 0.5) * 0.5;
      const distance = 60 + Math.random() * 80;
      return {
        id: Date.now() + i,
        x: 50,
        y: 50,
        px: Math.cos(angle) * distance,
        py: Math.sin(angle) * distance - 20,
        delay: Math.random() * 0.15,
        size: 3 + Math.random() * 4,
      };
    });
  }, []);

  useEffect(() => {
    if (!active) {
      setEffectTier(0);
      return;
    }

    if (nearMiss && !win) {
      setEffectTier(1);
      setShowFlash(true);
      const t = setTimeout(() => {
        setShowFlash(false);
        setEffectTier(0);
      }, 800);
      return () => clearTimeout(t);
    }

    if (!win) {
      setEffectTier(1);
      setShowFlash(true);
      const t = setTimeout(() => {
        setShowFlash(false);
        setEffectTier(0);
      }, 600);
      return () => clearTimeout(t);
    }

    const isBigPayout = payout >= 5 * betAmount;
    const isHotStreak = streakCount >= 5;
    const isMedStreak = streakCount >= 3;

    if (isBigPayout || isHotStreak) {
      setEffectTier(3);
      setShowRing(true);
      setShowFlash(true);
      const profit = payout - betAmount;
      setProfitText(`+${profit.toFixed(0)}`);
      setParticles(generateParticles(12));

      const t1 = setTimeout(() => setShowRing(false), 1000);
      const t2 = setTimeout(() => {
        setShowFlash(false);
        setParticles([]);
        setProfitText(null);
        setEffectTier(0);
      }, 1500);
      return () => {
        clearTimeout(t1);
        clearTimeout(t2);
      };
    }

    if (isMedStreak) {
      setEffectTier(2);
      setShowRing(true);
      setShowFlash(true);
      const profit = payout - betAmount;
      setProfitText(`+${profit.toFixed(0)}`);

      const t1 = setTimeout(() => setShowRing(false), 800);
      const t2 = setTimeout(() => {
        setShowFlash(false);
        setProfitText(null);
        setEffectTier(0);
      }, 1000);
      return () => {
        clearTimeout(t1);
        clearTimeout(t2);
      };
    }

    // Tier 1: basic win
    setEffectTier(1);
    setShowFlash(true);
    const profit = payout - betAmount;
    if (profit > 0) setProfitText(`+${profit.toFixed(0)}`);

    const t = setTimeout(() => {
      setShowFlash(false);
      setProfitText(null);
      setEffectTier(0);
    }, 700);
    return () => clearTimeout(t);
  }, [active, win, nearMiss, payout, betAmount, streakCount, generateParticles]);

  if (effectTier === 0 && !showFlash && !showRing) return null;

  const flashClass = nearMiss && !win
    ? "near-miss-pulse"
    : !win
      ? "screen-flash-loss"
      : effectTier >= 3
        ? "screen-flash-streak"
        : "screen-flash-win";

  return (
    <div className="absolute inset-0 pointer-events-none z-50 overflow-hidden" aria-hidden>
      {/* Screen flash overlay */}
      {showFlash && (
        <div
          className={`absolute inset-0 rounded-[var(--radius-lg)] ${flashClass}`}
        />
      )}

      {/* Expanding ring (Tier 2+) */}
      {showRing && (
        <div className="absolute inset-0 flex items-center justify-center">
          <div
            className={`win-burst-ring rounded-full border-2 ${
              effectTier >= 3
                ? "border-[#0ea5e9]"
                : "border-[#30d158]"
            }`}
            style={{
              width: 80,
              height: 80,
            }}
          />
          {effectTier >= 3 && (
            <div
              className="win-burst-ring rounded-full border border-[#0ea5e9]/60"
              style={{
                width: 60,
                height: 60,
                animationDelay: "0.1s",
              }}
            />
          )}
        </div>
      )}

      {/* Burst particles (Tier 3) */}
      {particles.length > 0 && (
        <div className="absolute inset-0 flex items-center justify-center">
          {particles.map((p) => (
            <div
              key={p.id}
              className="win-burst-particle absolute rounded-full bg-[#0ea5e9]"
              style={{
                width: p.size,
                height: p.size,
                "--px": `${p.px}px`,
                "--py": `${p.py}px`,
                animationDelay: `${p.delay}s`,
                boxShadow: `0 0 ${p.size * 2}px rgba(14, 165, 233, 0.6)`,
              } as React.CSSProperties}
            />
          ))}
        </div>
      )}

      {/* Floating profit text */}
      {profitText && win && (
        <div className="absolute inset-0 flex items-center justify-center">
          <span
            className={`profit-particle text-2xl font-bold tabular-nums ${
              effectTier >= 3
                ? "text-[#0ea5e9] drop-shadow-[0_0_20px_rgba(14,165,233,0.6)]"
                : "text-[#30d158] drop-shadow-[0_0_15px_rgba(48,209,88,0.5)]"
            }`}
          >
            {profitText}
          </span>
        </div>
      )}
    </div>
  );
}

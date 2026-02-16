"use client";

import { useMemo } from "react";
import type { PnLPoint, QuantMetrics } from "./useSessionPnL";

interface RollResult {
  result: number;
  win: boolean;
  payout: number;
  playAmount?: number;
}

type Regime =
  | "alpha"
  | "momentum"
  | "equilibrium"
  | "recovery"
  | "drawdown"
  | "awaiting";

interface RegimeResult {
  regime: Regime;
  label: string;
  colorClass: string;
  glowColor: string;
  pulseDuration: number;
}

function detectRegime(
  series: PnLPoint[],
  quant: QuantMetrics,
  rounds: number,
  totalPnl: number,
  recentResults: RollResult[]
): RegimeResult {
  if (rounds < 5) {
    return {
      regime: "awaiting",
      label: "Awaiting Data",
      colorClass: "text-white/50",
      glowColor: "rgba(255,255,255,0.15)",
      pulseDuration: 3,
    };
  }

  const sharpe = quant.sharpeRatio ?? 0;
  const winRate = quant.winRate;
  const maxDd = quant.maxDrawdownPct ?? 0;
  const kelly = quant.kellyFraction ?? 0;

  const { currentStreak, currentIsWin } = (() => {
    let streak = 0;
    const last = recentResults[recentResults.length - 1];
    const isWin = last?.win ?? null;
    for (let i = recentResults.length - 1; i >= 0; i--) {
      if (recentResults[i]?.win === isWin) streak++;
      else break;
    }
    return { currentStreak: isWin === false ? -streak : streak, currentIsWin: isWin };
  })();

  const returns =
    series.length >= 2
      ? series.map((p, i) => (i === 0 ? p.pnl : p.pnl - (series[i - 1]?.pnl ?? 0)))
      : [];
  const last5Returns = returns.slice(-5);
  const last5Positive = last5Returns.length > 0 && last5Returns.every((r) => r > 0);

  if (sharpe > 0.3 && totalPnl > 0 && winRate > 55) {
    return {
      regime: "alpha",
      label: "Alpha Generation",
      colorClass: "text-[#30d158]",
      glowColor: "rgba(48,209,88,0.45)",
      pulseDuration: 2,
    };
  }

  if (currentIsWin === true && currentStreak >= 3) {
    return {
      regime: "momentum",
      label: "Momentum",
      colorClass: "text-[#30d158]",
      glowColor: "rgba(48,209,88,0.4)",
      pulseDuration: 2.2,
    };
  }

  if (maxDd > 10 && sharpe < 0) {
    return {
      regime: "drawdown",
      label: "Drawdown",
      colorClass: "text-[#ff453a]",
      glowColor: "rgba(255,69,58,0.5)",
      pulseDuration: 1.5,
    };
  }

  if (last5Positive && maxDd > 5 && returns.length >= 5) {
    return {
      regime: "recovery",
      label: "Recovery",
      colorClass: "text-[#bf5af2]",
      glowColor: "rgba(191,90,242,0.4)",
      pulseDuration: 2.5,
    };
  }

  if (Math.abs(sharpe) <= 0.1 && winRate >= 45 && winRate <= 55) {
    return {
      regime: "equilibrium",
      label: "Equilibrium",
      colorClass: "text-[#64d2ff]",
      glowColor: "rgba(10,132,255,0.35)",
      pulseDuration: 3,
    };
  }

  if (sharpe < 0 || totalPnl < 0) {
    return {
      regime: "drawdown",
      label: "Drawdown",
      colorClass: "text-[#ff453a]",
      glowColor: "rgba(255,69,58,0.45)",
      pulseDuration: 1.8,
    };
  }

  return {
    regime: "equilibrium",
    label: "Equilibrium",
    colorClass: "text-[#64d2ff]",
    glowColor: "rgba(10,132,255,0.35)",
    pulseDuration: 3,
  };
}

function sparklinePath(series: PnLPoint[], width: number, height: number): string {
  const slice = series.slice(-20);
  if (slice.length < 2) return "";

  const returns = slice.map((p, i) =>
    i === 0 ? p.pnl : p.pnl - (slice[i - 1]?.pnl ?? 0)
  );
  const max = Math.max(...returns.map(Math.abs), 0.01);
  const halfH = height / 2;
  const step = width / (returns.length - 1);

  const points = returns.map((r, i) => {
    const x = i * step;
    const y = halfH - (r / max) * (halfH - 4);
    return `${x},${y}`;
  });

  return `M ${points.join(" L ")}`;
}

interface SessionAuraProps {
  series: PnLPoint[];
  quantMetrics: QuantMetrics;
  rounds: number;
  wins: number;
  totalPnl: number;
  recentResults: RollResult[];
}

export function SessionAura({
  series,
  quantMetrics,
  rounds,
  totalPnl,
  recentResults,
}: SessionAuraProps) {
  const regime = useMemo(
    () => detectRegime(series, quantMetrics, rounds, totalPnl, recentResults),
    [series, quantMetrics, rounds, totalPnl, recentResults]
  );

  const riskLevel = useMemo(() => {
    const kelly = quantMetrics.kellyFraction ?? 0;
    const dd = quantMetrics.maxDrawdownPct ?? 0;
    if (rounds < 3) return 0.5;
    const kellyScore = Math.min(1, (kelly / 8) * 1.2);
    const ddScore = Math.min(1, (dd / 50) * 1.2);
    return Math.min(1, (kellyScore + ddScore) / 2);
  }, [quantMetrics.kellyFraction, quantMetrics.maxDrawdownPct, rounds]);

  const pathD = useMemo(
    () => sparklinePath(series, 120, 24),
    [series]
  );

  const hasSparkline = series.length >= 2 && pathD;

  return (
    <div
      className="relative h-[100px] flex flex-col overflow-hidden"
      aria-label={`Session aura: ${regime.label}`}
    >
      <div className="terminal-header flex-shrink-0">
        <div className="terminal-header-accent" />
        <span>Session Aura</span>
      </div>

      <div className="flex-1 relative min-h-0 p-2 flex items-center justify-center">
        {/* Pulsing aura orb */}
        <div
          className="absolute inset-0 flex items-center justify-center pointer-events-none"
          aria-hidden
        >
          <div
            className="w-16 h-16 rounded-full opacity-40 aura-orb"
            style={{
              background: `radial-gradient(circle at 30% 30%, ${regime.glowColor}, transparent 70%)`,
              boxShadow: `0 0 40px ${regime.glowColor}, 0 0 80px ${regime.glowColor}`,
              animationDuration: `${regime.pulseDuration}s`,
            }}
          />
        </div>

        {/* Regime label */}
        <div
          className={`relative z-10 text-[10px] font-semibold uppercase tracking-widest ${regime.colorClass}`}
          style={{ textShadow: `0 0 12px ${regime.glowColor}` }}
        >
          {regime.label}
        </div>
      </div>

      {/* Micro sparkline */}
      {hasSparkline && (
        <div className="flex-shrink-0 px-2 pb-1 h-6 flex items-center justify-center">
          <svg
            viewBox="0 0 120 24"
            className="w-full max-w-[140px] h-6"
            preserveAspectRatio="none"
            aria-hidden
          >
            <defs>
              <linearGradient id="sparkline-grad" x1="0" x2="1" y1="0" y2="0">
                <stop offset="0%" stopColor="#ff453a" />
                <stop offset="50%" stopColor="#8b8b8b" />
                <stop offset="100%" stopColor="#30d158" />
              </linearGradient>
            </defs>
            <path
              d={pathD}
              fill="none"
              stroke="url(#sparkline-grad)"
              strokeWidth="1.5"
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeDasharray="200"
              className="sparkline-draw"
            />
          </svg>
        </div>
      )}

      {/* Risk gradient bar */}
      <div className="flex-shrink-0 px-2 pb-2 relative">
        <div className="h-1.5 w-full rounded-full overflow-hidden bg-white/[0.06] relative">
          <div
            className="h-full w-full rounded-full bg-gradient-to-r from-[#30d158] via-[#ff9f0a] to-[#ff453a]"
            aria-hidden
          />
          <div
            className="absolute top-1/2 -translate-y-1/2 h-2.5 w-1 rounded-full bg-white shadow-[0_0_8px_currentColor] transition-all duration-500 -ml-0.5"
            style={{
              left: `${Math.min(98, Math.max(2, riskLevel * 100))}%`,
              color: regime.glowColor,
            }}
            aria-hidden
          />
        </div>
      </div>
    </div>
  );
}

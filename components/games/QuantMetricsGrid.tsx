"use client";

import type { QuantMetrics } from "./useSessionPnL";

interface RollResult {
  result: number;
  win: boolean;
  payout: number;
  betAmount?: number;
}

function computeStreaks(results: RollResult[]) {
  let currentStreak = 0;
  const currentIsWin = results[results.length - 1]?.win ?? null;
  for (let i = results.length - 1; i >= 0; i--) {
    if (results[i]?.win === currentIsWin) currentStreak++;
    else break;
  }
  if (currentIsWin === false) currentStreak = -currentStreak;
  return { currentStreak, currentIsWin };
}

function computeRollingWinRate(results: RollResult[], window: number): number {
  const slice = results.slice(-window);
  if (slice.length === 0) return 0;
  return (slice.filter((r) => r.win).length / slice.length) * 100;
}

function momentumScore(last10: number, last20: number): { score: number; label: string } {
  const avg = (last10 + last20) / 2;
  if (avg >= 60) return { score: 0.8, label: "Hot" };
  if (avg <= 40) return { score: -0.8, label: "Cold" };
  return { score: 0, label: "Neutral" };
}

interface QuantMetricsGridProps {
  metrics: QuantMetrics;
  recentResults: RollResult[];
}

export function QuantMetricsGrid({ metrics, recentResults }: QuantMetricsGridProps) {
  const { currentStreak, currentIsWin } = computeStreaks(recentResults);
  const last10WinRate = computeRollingWinRate(recentResults, 10);
  const last20WinRate = computeRollingWinRate(recentResults, 20);
  const momentum = momentumScore(last10WinRate, last20WinRate);
  const streakLabel =
    currentStreak !== 0 && currentIsWin != null
      ? `${currentIsWin ? "W" : "L"}${Math.abs(currentStreak)}`
      : "—";

  const row = (label: string, value: React.ReactNode, dataValue?: string | number | null) => (
    <div
      className="flex justify-between items-center py-1.5 border-b border-white/5 last:border-0"
      {...(dataValue != null ? { "data-agent": `stat-${label.toLowerCase().replace(/\s/g, "-")}`, "data-value": String(dataValue) } : {})}
    >
      <span className="text-[10px] text-[var(--text-secondary)] uppercase tracking-wider">{label}</span>
      <span className="text-xs font-mono font-semibold text-[var(--text-primary)] tabular-nums">{value}</span>
    </div>
  );

  return (
    <div className="rounded-xl border border-white/[0.08] bg-[var(--bg-card)] p-4 space-y-4" data-agent="quant-metrics-grid">
      <h4 className="text-[10px] font-semibold text-[var(--text-secondary)] uppercase tracking-widest">
        Performance metrics
      </h4>
      <div className="space-y-1">
        {row(
          "Sharpe Ratio",
          metrics.sharpeRatio != null ? metrics.sharpeRatio.toFixed(2) : "—",
          metrics.sharpeRatio
        )}
        {row(
          "Sortino Ratio",
          metrics.sortinoRatio != null ? metrics.sortinoRatio.toFixed(2) : "—",
          metrics.sortinoRatio
        )}
        {row(
          "Profit Factor",
          metrics.profitFactor == null ? "—" : metrics.profitFactor === Infinity ? "∞" : metrics.profitFactor.toFixed(2),
          metrics.profitFactor
        )}
        {row("Win Rate", `${metrics.winRate.toFixed(1)}%`, metrics.winRate.toFixed(1))}
        {row(
          "Avg Win",
          metrics.avgWin != null ? `+${metrics.avgWin.toFixed(2)}` : "—",
          metrics.avgWin
        )}
        {row(
          "Avg Loss",
          metrics.avgLoss != null ? `-${metrics.avgLoss.toFixed(2)}` : "—",
          metrics.avgLoss
        )}
        {row(
          "Max Drawdown",
          metrics.maxDrawdownPct != null ? `-${metrics.maxDrawdownPct.toFixed(1)}%` : "—",
          metrics.maxDrawdownPct
        )}
        {row(
          "Recovery Factor",
          metrics.recoveryFactor != null ? metrics.recoveryFactor.toFixed(2) : "—",
          metrics.recoveryFactor
        )}
        {row(
          "Kelly Criterion",
          metrics.kellyFraction != null ? `${metrics.kellyFraction.toFixed(1)}%` : "—",
          metrics.kellyFraction
        )}
        {row(
          "Expected Value",
          metrics.expectedValuePerTrade != null ? `${metrics.expectedValuePerTrade >= 0 ? "+" : ""}${metrics.expectedValuePerTrade.toFixed(2)}/trade` : "—",
          metrics.expectedValuePerTrade
        )}
      </div>

      <h4 className="text-[10px] font-semibold text-[var(--text-secondary)] uppercase tracking-widest pt-2 border-t border-white/5">
        Momentum
      </h4>
      <div className="space-y-1">
        {row("Current Streak", streakLabel, currentStreak)}
        {row("Last 10 WR", `${last10WinRate.toFixed(0)}%`, last10WinRate.toFixed(1))}
        {row("Last 20 WR", `${last20WinRate.toFixed(0)}%`, last20WinRate.toFixed(1))}
        {row(
          "Momentum Score",
          <span
            className={
              momentum.label === "Hot"
                ? "text-emerald-400"
                : momentum.label === "Cold"
                  ? "text-amber-400"
                  : "text-[var(--text-secondary)]"
            }
          >
            {momentum.score >= 0 ? "+" : ""}
            {momentum.score.toFixed(2)} ({momentum.label})
          </span>
        )}
      </div>
    </div>
  );
}

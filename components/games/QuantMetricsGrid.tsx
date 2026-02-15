"use client";

import { DICE_HOUSE_EDGE } from "@/lib/constants";
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

function statusColor(val: number | null, good: number, bad: number): "emerald" | "amber" | "red" | "neutral" {
  if (val == null) return "neutral";
  if (val >= good) return "emerald";
  if (val <= bad) return "red";
  return "amber";
}

interface QuantMetricsGridProps {
  metrics: QuantMetrics;
  recentResults: RollResult[];
}

function StatusDot({ status }: { status: "emerald" | "amber" | "red" | "neutral" }) {
  if (status === "neutral") return <span className="w-1.5 h-1.5 rounded-full bg-white/20 shrink-0" />;
  const color =
    status === "emerald" ? "bg-emerald-400" : status === "amber" ? "bg-amber-400" : "bg-red-400";
  return <span className={`w-1.5 h-1.5 rounded-full ${color} shrink-0`} aria-hidden />;
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

  const sharpeStatus = statusColor(metrics.sharpeRatio, 0.5, 0);
  const winRateStatus = statusColor(metrics.winRate, 55, 45);
  const kellyStatus = statusColor(metrics.kellyFraction, 5, 1);

  const row = (
    label: string,
    value: React.ReactNode,
    dataValue?: string | number | null,
    status?: "emerald" | "amber" | "red" | "neutral",
    large?: boolean
  ) => (
    <div
      className="flex justify-between items-center py-2.5 border-b border-white/[0.06] last:border-0"
      {...(dataValue != null
        ? { "data-agent": `stat-${label.toLowerCase().replace(/\s/g, "-")}`, "data-value": String(dataValue) }
        : {})}
    >
      <span className="text-xs text-[var(--text-tertiary)] uppercase tracking-wider">{label}</span>
      <span className="flex items-center gap-2">
        {status != null && <StatusDot status={status} />}
        <span
          className={`font-semibold tabular-nums ${
            large ? "text-sm text-[var(--text-primary)]" : "text-xs text-[var(--text-primary)]"
          }`}
        >
          {value}
        </span>
      </span>
    </div>
  );

  const edgePct = (DICE_HOUSE_EDGE * 100).toFixed(1);
  const hasNegativeEdge = true; // House edge is always -3% for dice

  return (
    <div
      className="agent-card p-5 space-y-4 min-w-0 overflow-hidden"
      data-agent="quant-metrics-grid"
    >
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="w-1 h-5 rounded-full bg-[#0ea5e9]" />
          <h4 className="text-xs font-semibold text-[var(--text-primary)]">
            Performance Metrics
          </h4>
        </div>
        {recentResults.length > 0 && (
          <span className="text-xs text-[#30d158]/80 tabular-nums">
            {recentResults.length} fills
          </span>
        )}
      </div>

      {hasNegativeEdge && recentResults.length < 5 && (
        <div className="rounded-xl border border-amber-500/20 bg-amber-500/5 px-3 py-2.5">
          <p className="text-sm text-[var(--text-secondary)] leading-relaxed">
            <span className="font-semibold text-amber-400/90">House edge −{edgePct}%.</span>{" "}
            Use Kelly criterion for position sizing. Strategy builder for backtests.
          </p>
        </div>
      )}

      {/* Core metrics — key ones larger */}
      <div className="space-y-0 border-b border-white/10 pb-2">
        {row(
          "Sharpe Ratio",
          metrics.sharpeRatio != null ? metrics.sharpeRatio.toFixed(2) : "—",
          metrics.sharpeRatio,
          sharpeStatus,
          true
        )}
        {row("Win Rate", `${metrics.winRate.toFixed(1)}%`, metrics.winRate.toFixed(1), winRateStatus, true)}
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
      </div>

      {/* P&L metrics */}
      <div className="space-y-0 border-b border-white/10 pb-2">
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
      </div>

      {/* Kelly & EV */}
      <div className="space-y-0 border-b border-white/10 pb-2">
        {row(
          "Kelly Criterion",
          metrics.kellyFraction != null ? `${metrics.kellyFraction.toFixed(1)}%` : "—",
          metrics.kellyFraction,
          kellyStatus
        )}
        {row(
          "Expected Value",
          metrics.expectedValuePerTrade != null
            ? `${metrics.expectedValuePerTrade >= 0 ? "+" : ""}${metrics.expectedValuePerTrade.toFixed(2)}/tr`
            : "—",
          metrics.expectedValuePerTrade
        )}
      </div>

      <h4 className="text-xs font-semibold text-[var(--text-tertiary)] uppercase tracking-wider pt-2">
        Momentum
      </h4>
      <div className="space-y-0">
        <div
          className="flex justify-between items-center py-2.5 border-b border-white/[0.06]"
          data-agent="stat-current-streak"
          data-value={String(currentStreak)}
        >
          <span className="text-xs text-[var(--text-tertiary)] uppercase tracking-wider">Current Streak</span>
          <span className="flex items-center gap-2">
            <div className="flex h-2 w-16 rounded-full overflow-hidden bg-white/[0.06]">
              <div
                className={`h-full transition-all duration-300 ${
                  currentStreak > 0 ? "bg-[#30d158]" : currentStreak < 0 ? "bg-[#ff453a]" : "bg-white/20"
                }`}
                style={{
                  width: currentStreak !== 0 ? `${Math.min(100, Math.abs(currentStreak) * 10)}%` : "0%",
                }}
              />
            </div>
            <span className="text-xs font-semibold tabular-nums text-[var(--text-primary)]">
              {streakLabel}
            </span>
          </span>
        </div>
        {row("Last 10 WR", `${last10WinRate.toFixed(0)}%`, last10WinRate.toFixed(1))}
        {row("Last 20 WR", `${last20WinRate.toFixed(0)}%`, last20WinRate.toFixed(1))}
        {row(
          "Momentum Score",
          <span
            className={
              momentum.label === "Hot"
                ? "text-[#30d158]"
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

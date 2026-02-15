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
      className="flex justify-between items-center py-2 border-b border-white/5 last:border-0"
      {...(dataValue != null
        ? { "data-agent": `stat-${label.toLowerCase().replace(/\s/g, "-")}`, "data-value": String(dataValue) }
        : {})}
    >
      <span className="text-[10px] text-[var(--text-secondary)] uppercase tracking-wider">{label}</span>
      <span className="flex items-center gap-1.5">
        {status != null && <StatusDot status={status} />}
        <span
          className={`font-mono font-semibold tabular-nums ${
            large ? "text-sm text-[var(--text-primary)]" : "text-xs text-[var(--text-primary)]"
          }`}
        >
          {value}
        </span>
      </span>
    </div>
  );

  return (
    <div
      className="rounded-xl border border-white/[0.08] bg-[var(--bg-card)] p-4 space-y-4"
      data-agent="quant-metrics-grid"
    >
      <h4 className="text-[10px] font-semibold text-[var(--text-secondary)] uppercase tracking-widest">
        Performance metrics
      </h4>

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

      {/* Momentum — with streak bar */}
      <h4 className="text-[10px] font-semibold text-[var(--text-secondary)] uppercase tracking-widest pt-1">
        Momentum
      </h4>
      <div className="space-y-0">
        <div
          className="flex justify-between items-center py-2 border-b border-white/5"
          data-agent="stat-current-streak"
          data-value={String(currentStreak)}
        >
          <span className="text-[10px] text-[var(--text-secondary)] uppercase tracking-wider">Current Streak</span>
          <span className="flex items-center gap-2">
            {/* Mini streak bar */}
            <div className="flex h-2 w-16 rounded-full overflow-hidden bg-white/[0.06]">
              <div
                className={`h-full transition-all duration-300 ${
                  currentStreak > 0 ? "bg-emerald-500" : currentStreak < 0 ? "bg-red-500" : "bg-white/20"
                }`}
                style={{
                  width: currentStreak !== 0 ? `${Math.min(100, Math.abs(currentStreak) * 10)}%` : "0%",
                }}
              />
            </div>
            <span className="text-xs font-mono font-semibold tabular-nums text-[var(--text-primary)]">
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

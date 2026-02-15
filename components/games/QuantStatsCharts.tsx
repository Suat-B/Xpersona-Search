"use client";

/**
 * Quantitative stats + visual charts for dice session.
 * Machine-readable via data-agent-* for AI consumption.
 */

interface RollResult {
  result: number;
  win: boolean;
  payout: number;
  betAmount?: number;
}

function computeStreaks(results: RollResult[]) {
  let currentStreak = 0;
  let currentIsWin = results[results.length - 1]?.win ?? null;
  let maxWinStreak = 0;
  let maxLossStreak = 0;
  let runWin = 0;
  let runLoss = 0;

  for (const r of results) {
    if (r.win) {
      runWin++;
      runLoss = 0;
      maxWinStreak = Math.max(maxWinStreak, runWin);
    } else {
      runLoss++;
      runWin = 0;
      maxLossStreak = Math.max(maxLossStreak, runLoss);
    }
  }

  if (results.length > 0) {
    const last = results[results.length - 1].win;
    for (let i = results.length - 1; i >= 0; i--) {
      if (results[i].win === last) currentStreak++;
      else break;
    }
  }

  return {
    currentStreak,
    currentIsWin,
    maxWinStreak,
    maxLossStreak,
  };
}

function computeRollingWinRate(results: RollResult[], window: number): number {
  const slice = results.slice(-window);
  if (slice.length === 0) return 0;
  return (slice.filter((r) => r.win).length / slice.length) * 100;
}

function computeProfitFactor(results: RollResult[]): number | null {
  let grossProfit = 0;
  let grossLoss = 0;
  for (const r of results) {
    const pnl = r.payout - (r.betAmount ?? 0);
    if (pnl > 0) grossProfit += pnl;
    else grossLoss += Math.abs(pnl);
  }
  if (grossLoss === 0) return grossProfit > 0 ? Infinity : null;
  return grossProfit / grossLoss;
}

function getBetSizeBuckets(results: RollResult[]): { label: string; count: number; range: [number, number] }[] {
  const buckets = [
    { label: "1–10", range: [1, 10] as [number, number] },
    { label: "11–50", range: [11, 50] as [number, number] },
    { label: "51–100", range: [51, 100] as [number, number] },
    { label: "101–500", range: [101, 500] as [number, number] },
    { label: "501+", range: [501, Infinity] as [number, number] },
  ];
  return buckets.map((b) => {
    const count = results.filter(
      (r) => (r.betAmount ?? 0) >= b.range[0] && (r.betAmount ?? 0) <= b.range[1]
    ).length;
    return { ...b, count };
  });
}

interface QuantStatsChartsProps {
  recentResults: RollResult[];
}

export function QuantStatsCharts({ recentResults }: QuantStatsChartsProps) {
  const n = recentResults.length;
  if (n === 0) return null;

  const { currentStreak, currentIsWin, maxWinStreak, maxLossStreak } = computeStreaks(recentResults);
  const rolling10 = computeRollingWinRate(recentResults, 10);
  const rolling20 = computeRollingWinRate(recentResults, 20);
  const profitFactor = computeProfitFactor(recentResults);
  const betBuckets = getBetSizeBuckets(recentResults);
  const maxBucketCount = Math.max(1, ...betBuckets.map((b) => b.count));

  const last30 = recentResults.slice(-30);

  return (
    <div className="space-y-4" data-agent="quant-stats">
      {/* Win/Loss run chart — colored dots with subtle glow */}
      <div className="rounded-2xl border border-white/10 bg-gradient-to-br from-[var(--bg-card)] to-[var(--bg-card)]/80 p-4 shadow-lg">
        <h4 className="text-xs font-semibold text-[var(--text-secondary)] uppercase tracking-widest mb-3 flex items-center gap-2">
          <span className="w-1 h-1 rounded-full bg-[var(--accent-heart)]" />
          Run chart (last 30)
        </h4>
        <div className="flex flex-wrap gap-1.5" data-agent="run-chart">
          {last30.map((r, i) => (
            <div
              key={i}
              className={`w-2.5 h-2.5 rounded-md transition-all duration-200 hover:scale-125 ${
                r.win
                  ? "bg-emerald-500 shadow-[0_0_6px_rgba(16,185,129,0.5)]"
                  : "bg-red-500/90 shadow-[0_0_6px_rgba(239,68,68,0.4)]"
              }`}
              title={`Round ${recentResults.length - last30.length + i + 1}: ${r.win ? "Win" : "Loss"}`}
            />
          ))}
        </div>
      </div>

      {/* Streaks + rolling metrics */}
      <div className="rounded-2xl border border-white/10 bg-gradient-to-br from-[var(--bg-card)] to-[var(--bg-matte)]/50 p-4 space-y-3 shadow-md" data-agent="streak-stats">
        <h4 className="text-xs font-semibold text-[var(--text-primary)] uppercase tracking-widest">
          Streaks & rolling
        </h4>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <div className="rounded-lg bg-[var(--bg-matte)] p-2.5 text-center" data-agent="stat-current-streak" data-value={currentStreak}>
            <div className={`text-sm font-bold font-mono ${currentIsWin ? "text-emerald-400" : "text-red-400"}`}>
              {currentStreak}
            </div>
            <div className="text-[10px] text-[var(--text-secondary)]">Current streak</div>
          </div>
          <div className="rounded-lg bg-[var(--bg-matte)] p-2.5 text-center" data-agent="stat-max-win-streak" data-value={maxWinStreak}>
            <div className="text-sm font-bold font-mono text-emerald-400">{maxWinStreak}</div>
            <div className="text-[10px] text-[var(--text-secondary)]">Max win streak</div>
          </div>
          <div className="rounded-lg bg-[var(--bg-matte)] p-2.5 text-center" data-agent="stat-max-loss-streak" data-value={maxLossStreak}>
            <div className="text-sm font-bold font-mono text-red-400">{maxLossStreak}</div>
            <div className="text-[10px] text-[var(--text-secondary)]">Max loss streak</div>
          </div>
          <div className="rounded-lg bg-[var(--bg-matte)] p-2.5 text-center" data-agent="stat-profit-factor" data-value={profitFactor ?? 0}>
            <div className="text-sm font-bold font-mono text-[var(--text-primary)]">
              {profitFactor == null ? "—" : profitFactor === Infinity ? "∞" : profitFactor.toFixed(2)}
            </div>
            <div className="text-[10px] text-[var(--text-secondary)]">Profit factor</div>
          </div>
        </div>
        <div className="flex gap-4">
          <div className="flex items-center gap-2">
            <span className="text-[10px] text-[var(--text-secondary)]">Last 10:</span>
            <span
              className={`text-xs font-mono font-semibold ${
                rolling10 >= 50 ? "text-emerald-400" : rolling10 <= 40 ? "text-red-400" : "text-[var(--text-primary)]"
              }`}
              data-agent="stat-rolling-10"
              data-value={rolling10.toFixed(1)}
            >
              {rolling10.toFixed(0)}%
            </span>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-[10px] text-[var(--text-secondary)]">Last 20:</span>
            <span
              className={`text-xs font-mono font-semibold ${
                rolling20 >= 50 ? "text-emerald-400" : rolling20 <= 40 ? "text-red-400" : "text-[var(--text-primary)]"
              }`}
              data-agent="stat-rolling-20"
              data-value={rolling20.toFixed(1)}
            >
              {rolling20.toFixed(0)}%
            </span>
          </div>
        </div>
      </div>

      {/* Bet size distribution bar chart */}
      <div className="rounded-2xl border border-white/10 bg-[var(--bg-card)] p-4 shadow-md">
        <h4 className="text-xs font-semibold text-[var(--text-secondary)] uppercase tracking-widest mb-3">
          Bet size distribution
        </h4>
        <div className="space-y-2">
          {betBuckets.map((b) => (
            <div key={b.label} className="flex items-center gap-2 group">
              <span className="text-[10px] text-[var(--text-secondary)] w-12 shrink-0 font-mono">{b.label} cr</span>
              <div className="flex-1 h-5 rounded-lg bg-[var(--bg-matte)] overflow-hidden">
                <div
                  className="h-full rounded-lg bg-gradient-to-r from-[var(--accent-heart)]/70 to-[var(--accent-heart)]/40 transition-all duration-500 group-hover:from-[var(--accent-heart)]/90"
                  style={{ width: `${(b.count / maxBucketCount) * 100}%`, minWidth: b.count > 0 ? "6px" : 0 }}
                />
              </div>
              <span className="text-[10px] font-mono text-[var(--text-secondary)] w-6 text-right tabular-nums">{b.count}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

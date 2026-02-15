"use client";

/**
 * Aesthetic quant charts — creative, eye-catching visualizations.
 * Machine-readable via data-agent-* for AI.
 */

import type { PnLPoint } from "@/components/ui/SessionPnLChart";

interface RollResult {
  result: number;
  win: boolean;
  payout: number;
  betAmount?: number;
}

function computeDrawdown(series: PnLPoint[]) {
  let peak = 0;
  const drawdowns: number[] = [];
  for (const p of series) {
    peak = Math.max(peak, p.pnl);
    drawdowns.push(peak - p.pnl);
  }
  return { drawdowns, maxDrawdown: Math.max(0, ...drawdowns), peak };
}

function getResultBuckets(results: RollResult[], bins = 10) {
  const buckets = Array.from({ length: bins }, (_, i) => ({
    low: (i * 100) / bins,
    high: ((i + 1) * 100) / bins,
    wins: 0,
    losses: 0,
  }));
  for (const r of results) {
    const idx = Math.min(Math.floor((r.result / 100) * bins), bins - 1);
    if (r.win) buckets[idx].wins++;
    else buckets[idx].losses++;
  }
  return buckets;
}

interface QuantChartsAestheticProps {
  recentResults: RollResult[];
  series: PnLPoint[];
  winRate: number;
  totalPnl: number;
  rounds: number;
  layout?: "default" | "analytics";
}

export function QuantChartsAesthetic({
  recentResults,
  series,
  winRate,
  totalPnl,
  rounds,
  layout = "default",
}: QuantChartsAestheticProps) {
  const n = recentResults.length;
  const hasData = n > 0;

  const wins = hasData ? recentResults.filter((r) => r.win).length : 0;
  const losses = n - wins;
  const { drawdowns, maxDrawdown } = computeDrawdown(series);
  const resultBuckets = getResultBuckets(recentResults, 10);

  const isHot = hasData && (winRate >= 55 || recentResults.slice(-5).filter((r) => r.win).length >= 4);
  const isCold = hasData && (winRate <= 40 || recentResults.slice(-5).filter((r) => r.win).length <= 1);

  const isAnalytics = layout === "analytics";

  return (
    <div className="space-y-4" data-agent="quant-charts-aesthetic">
      {/* Win rate gauge — hidden in analytics layout */}
      {!isAnalytics && (
      <div className="relative overflow-hidden rounded-2xl border border-white/10 bg-gradient-to-br from-[var(--bg-card)] to-[var(--bg-card)]/80 p-4 shadow-lg shadow-black/20 backdrop-blur-sm">
        <div className="absolute inset-0 bg-gradient-to-br from-emerald-500/5 via-transparent to-red-500/5 pointer-events-none" />
        <h4 className="relative text-xs font-semibold text-[var(--text-secondary)] uppercase tracking-widest mb-3 flex items-center gap-2">
          <span className="w-1.5 h-1.5 rounded-full bg-[var(--accent-heart)] animate-pulse" />
          Win rate gauge
        </h4>
        <div className="relative flex items-center justify-center gap-6">
          <div className="relative" data-agent="win-rate-gauge" data-value={winRate.toFixed(1)}>
            <svg viewBox="0 0 120 70" className="w-28 h-14">
              <defs>
                <linearGradient id="gauge-bg" x1="0" y1="0" x2="1" y2="0">
                  <stop offset="0%" stopColor="#ef4444" />
                  <stop offset="50%" stopColor="#f59e0b" />
                  <stop offset="100%" stopColor="#10b981" />
                </linearGradient>
                <linearGradient id="gauge-fill" x1="0" y1="0" x2="1" y2="0">
                  <stop offset="0%" stopColor="#10b981" />
                  <stop offset="100%" stopColor="#34d399" />
                </linearGradient>
                <filter id="glow">
                  <feGaussianBlur stdDeviation="2" result="blur" />
                  <feMerge>
                    <feMergeNode in="blur" />
                    <feMergeNode in="SourceGraphic" />
                  </feMerge>
                </filter>
              </defs>
              <path
                d="M 10 60 A 50 50 0 0 1 110 60"
                fill="none"
                stroke="url(#gauge-bg)"
                strokeWidth="8"
                strokeLinecap="round"
                opacity={0.3}
              />
              <path
                d="M 10 60 A 50 50 0 0 1 110 60"
                fill="none"
                stroke="url(#gauge-fill)"
                strokeWidth="8"
                strokeLinecap="round"
                strokeDasharray={`${(winRate / 100) * 157} 157`}
                strokeDashoffset="0"
                opacity={0.95}
                style={{ filter: "url(#glow)" }}
              />
              <circle
                cx={60 + 50 * Math.cos(Math.PI * (1 - winRate / 100))}
                cy={60 - 50 * Math.sin(Math.PI * (1 - winRate / 100))}
                r="4"
                fill="#34d399"
                className="drop-shadow-lg"
              />
            </svg>
            <div className="absolute inset-0 flex items-end justify-center pb-1">
              <span
                className={`text-xl font-black font-mono tabular-nums ${
                  winRate >= 55 ? "text-emerald-400" : winRate <= 45 ? "text-red-400" : "text-amber-400"
                }`}
              >
                {winRate.toFixed(0)}%
              </span>
            </div>
          </div>
          <div className="flex flex-col gap-1 text-[10px]">
            <span className="text-emerald-400/90 font-medium">0%</span>
            <span className="text-amber-400/90 font-medium">50%</span>
            <span className="text-red-400/90 font-medium">100%</span>
          </div>
        </div>
      </div>
      )}

      {/* Session momentum — hidden in analytics */}
      {!isAnalytics && (
      <div
        className={`relative overflow-hidden rounded-2xl border p-4 transition-all duration-500 ${
          isHot
            ? "border-emerald-500/30 bg-gradient-to-br from-emerald-500/20 to-emerald-500/5"
            : isCold
              ? "border-cyan-500/30 bg-gradient-to-br from-cyan-500/15 to-cyan-500/5"
              : "border-amber-500/20 bg-gradient-to-br from-amber-500/10 to-transparent"
        }`}
        data-agent="session-momentum"
        data-value={isHot ? "hot" : isCold ? "cold" : "neutral"}
      >
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <span className="text-2xl">
              {hasData ? (isHot ? "🔥" : isCold ? "❄️" : "⚖️") : "🎲"}
            </span>
            <div>
              <h4 className="text-xs font-semibold text-[var(--text-primary)]">
                {hasData
                  ? (isHot ? "Hot streak" : isCold ? "Cold streak" : "Neutral")
                  : "Session momentum"}
              </h4>
              <p className="text-[10px] text-[var(--text-secondary)]">
                {hasData
                  ? (isHot
                    ? "Session running above expectation"
                    : isCold
                      ? "Below average — variance at play"
                      : "Steady session")
                  : "Roll to see momentum"}
              </p>
            </div>
          </div>
          <div className="text-right">
            <span
              className={`text-lg font-bold font-mono ${
                hasData
                  ? isHot
                    ? "text-emerald-400"
                    : isCold
                      ? "text-cyan-400"
                      : "text-amber-400"
                  : "text-[var(--text-tertiary)]"
              }`}
            >
              {hasData ? `${recentResults.slice(-5).filter((r) => r.win).length}/5` : "—"}
            </span>
            <div className="text-[10px] text-[var(--text-secondary)]">Last 5</div>
          </div>
        </div>
      </div>
      )}

      {/* Win / Loss donut — hidden in analytics */}
      {!isAnalytics && (
      <div className="relative overflow-hidden rounded-2xl border border-white/10 bg-[var(--bg-card)] p-4 shadow-lg">
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,var(--accent-heart)/5_0%,transparent_70%)] pointer-events-none" />
        <h4 className="relative text-xs font-semibold text-[var(--text-secondary)] uppercase tracking-widest mb-3">
          Win / loss split
        </h4>
        <div className="relative flex items-center justify-center gap-6">
          <div className="relative" data-agent="win-loss-donut">
            <svg viewBox="0 0 100 100" className="w-24 h-24">
              <defs>
                <linearGradient id="donut-win" x1="0" y1="0" x2="1" y2="1">
                  <stop offset="0%" stopColor="#34d399" />
                  <stop offset="100%" stopColor="#10b981" />
                </linearGradient>
                <linearGradient id="donut-loss" x1="0" y1="0" x2="1" y2="1">
                  <stop offset="0%" stopColor="#fbbf24" />
                  <stop offset="100%" stopColor="#f59e0b" />
                </linearGradient>
                <filter id="donut-glow">
                  <feGaussianBlur stdDeviation="1" result="blur" />
                  <feMerge>
                    <feMergeNode in="blur" />
                    <feMergeNode in="SourceGraphic" />
                  </feMerge>
                </filter>
              </defs>
              <circle cx="50" cy="50" r="40" fill="none" stroke="var(--bg-matte)" strokeWidth="12" />
              {wins > 0 && (
                <circle
                  cx="50"
                  cy="50"
                  r="40"
                  fill="none"
                  stroke="url(#donut-win)"
                  strokeWidth="12"
                  strokeDasharray={`${(wins / n) * 251} 251`}
                  strokeDashoffset="0"
                  transform="rotate(-90 50 50)"
                  strokeLinecap="round"
                  style={{ filter: "url(#donut-glow)" }}
                />
              )}
              {losses > 0 && (
                <circle
                  cx="50"
                  cy="50"
                  r="40"
                  fill="none"
                  stroke="url(#donut-loss)"
                  strokeWidth="12"
                  strokeDasharray={`${(losses / n) * 251} 251`}
                  strokeDashoffset={-(wins / n) * 251}
                  transform="rotate(-90 50 50)"
                  strokeLinecap="round"
                  style={{ filter: "url(#donut-glow)" }}
                />
              )}
            </svg>
            <div className="absolute inset-0 flex items-center justify-center">
              <span className="text-sm font-bold font-mono text-[var(--text-primary)]">
                {hasData ? n : "—"}
              </span>
            </div>
          </div>
            <div className="flex flex-col gap-2">
            <div className="flex items-center gap-2">
              <div className="w-3 h-3 rounded-full bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.6)]" />
              <span className="text-xs font-mono">{wins} wins</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-3 h-3 rounded-full bg-amber-500 shadow-[0_0_8px_rgba(245,158,11,0.5)]" />
              <span className="text-xs font-mono">{losses} losses</span>
            </div>
          </div>
        </div>
      </div>
      )}

      {/* Drawdown chart */}
      {drawdowns.length > 1 && (
        <div className="relative overflow-hidden rounded-2xl border border-white/10 bg-[var(--bg-card)] p-4">
          <div className="absolute inset-0 bg-gradient-to-b from-red-500/5 to-transparent pointer-events-none opacity-50" />
          <h4 className="relative text-xs font-semibold text-[var(--text-secondary)] uppercase tracking-widest mb-2 flex items-center justify-between">
            <span>Drawdown</span>
            <span className="text-red-400 font-mono text-[10px]" data-agent="max-drawdown" data-value={maxDrawdown}>
              Max: {maxDrawdown}
            </span>
          </h4>
          <div className="relative h-16 rounded-lg overflow-hidden bg-[var(--bg-matte)]/50">
            <svg viewBox="0 0 400 60" className="w-full h-full" preserveAspectRatio="none">
              <defs>
                <linearGradient id="dd-fill" x1="0" y1="1" x2="0" y2="0">
                  <stop offset="0%" stopColor="#ef4444" stopOpacity={0} />
                  <stop offset="100%" stopColor="#ef4444" stopOpacity={0.4} />
                </linearGradient>
              </defs>
              {(() => {
                const maxD = Math.max(1, ...drawdowns);
                const pts = drawdowns.map((d, i) => {
                  const x = (i / Math.max(1, drawdowns.length - 1)) * 380 + 10;
                  const y = 50 - (d / maxD) * 45;
                  return `${i === 0 ? "M" : "L"} ${x} ${y}`;
                }).join(" ");
                const fillD =
                  pts +
                  ` L 390 50 L 10 50 Z`;
                return (
                  <>
                    <path d={fillD} fill="url(#dd-fill)" />
                    <path d={pts} fill="none" stroke="#ef4444" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" opacity={0.8} />
                  </>
                );
              })()}
            </svg>
          </div>
          <p className="relative text-[10px] text-[var(--text-tertiary)] mt-1">
            Peak-to-trough decline from session high
          </p>
        </div>
      )}

      {/* Dice result distribution — simplified in analytics */}
      <div className="relative overflow-hidden rounded-2xl border border-white/10 bg-[var(--bg-card)] p-4">
        <h4 className="text-xs font-semibold text-[var(--text-secondary)] uppercase tracking-widest mb-3">
          Roll distribution (0–100)
        </h4>
        <div className="space-y-1.5" data-agent="roll-distribution">
          {resultBuckets.map((b, i) => {
            const total = b.wins + b.losses;
            return (
              <div key={i} className="flex items-center gap-2">
                <span className="text-[10px] text-[var(--text-tertiary)] w-14 shrink-0 font-mono">
                  {b.low.toFixed(0)}–{b.high.toFixed(0)}
                </span>
                <div className="flex-1 h-5 rounded-md overflow-hidden flex bg-[var(--bg-matte)]">
                  <div
                    className="h-full bg-emerald-500/80 transition-all duration-300 rounded-l"
                    style={{
                      width: total > 0 ? `${(b.wins / total) * 100}%` : "0%",
                      minWidth: b.wins > 0 ? "2px" : 0,
                    }}
                  />
                  <div
                    className="h-full bg-amber-500/70 transition-all duration-300 rounded-r"
                    style={{
                      width: total > 0 ? `${(b.losses / total) * 100}%` : "0%",
                      minWidth: b.losses > 0 ? "2px" : 0,
                    }}
                  />
                </div>
                <span className="text-[10px] font-mono text-[var(--text-secondary)] w-8 text-right">
                  {total}
                </span>
              </div>
            );
          })}
        </div>
        <p className="text-[10px] text-[var(--text-tertiary)] mt-2">
          Stacked: wins (green) vs losses (amber) per result range
        </p>
      </div>

      {/* PnL range — where current sits between session min/max */}
      {series.length >= 5 && (() => {
        const minP = Math.min(...series.map((p) => p.pnl));
        const maxP = Math.max(...series.map((p) => p.pnl));
        const range = maxP - minP || 1;
        const posPct = ((totalPnl - minP) / range) * 100;
        return (
          <div className="rounded-2xl border border-white/10 bg-gradient-to-br from-violet-500/5 to-[var(--bg-card)] p-4" data-agent="pnl-range">
            <h4 className="text-xs font-semibold text-[var(--text-secondary)] uppercase tracking-widest mb-2">
              PnL range
            </h4>
            <div className="relative h-3 rounded-full bg-[var(--bg-matte)] overflow-hidden">
              <div
                className="absolute top-0 h-full rounded-full bg-gradient-to-r from-red-500/50 via-amber-500/30 to-emerald-500/50 transition-all duration-500"
                style={{ left: "0%", width: `${Math.max(2, Math.min(98, posPct))}%` }}
              />
              <div
                className="absolute top-1/2 -translate-y-1/2 w-1.5 h-4 rounded bg-white/90 shadow-lg -ml-0.75 transition-all duration-300"
                style={{ left: `${Math.max(0, Math.min(100, posPct))}%` }}
              />
            </div>
            <div className="flex justify-between mt-1.5 text-[10px] font-mono">
              <span className="text-red-400/90">Min {minP}</span>
              <span className={`font-bold ${totalPnl >= 0 ? "text-emerald-400" : "text-red-400"}`}>{totalPnl >= 0 ? "+" : ""}{totalPnl}</span>
              <span className="text-emerald-400/90">Max {maxP}</span>
            </div>
          </div>
        );
      })()}
    </div>
  );
}

"use client";

import { DICE_HOUSE_EDGE } from "@/lib/constants";

interface QuantTopMetricsBarProps {
  nav: number;
  navLoading?: boolean;
  sessionPnl: number;
  sharpeRatio: number | null;
  winRate: number;
  maxDrawdownPct: number | null;
  rounds: number;
  kellyFraction: number | null;
  /** When true, shows a subtle "ready" status dot */
  ready?: boolean;
}

function formatSharpeColor(sharpe: number | null): "emerald" | "amber" | "neutral" {
  if (sharpe == null) return "neutral";
  if (sharpe >= 0.5) return "emerald";
  if (sharpe >= 0) return "amber";
  return "neutral";
}

function formatKellyColor(kelly: number | null): "emerald" | "amber" | "neutral" {
  if (kelly == null) return "neutral";
  if (kelly >= 5) return "emerald";
  if (kelly >= 1) return "amber";
  return "neutral";
}

const HOUSE_EDGE_PCT = (DICE_HOUSE_EDGE * 100).toFixed(1);

export function QuantTopMetricsBar({
  nav,
  navLoading = false,
  sessionPnl,
  sharpeRatio,
  winRate,
  maxDrawdownPct,
  rounds,
  kellyFraction,
  ready = true,
}: QuantTopMetricsBarProps) {
  const sharpeColor = formatSharpeColor(sharpeRatio);
  const kellyColor = formatKellyColor(kellyFraction);

  return (
    <div className="flex items-center gap-2 px-4 py-2 border-b border-white/[0.06] bg-gradient-to-r from-[#0a0a0f]/95 via-[#0d0d14]/80 to-[#0a0a0f]/95 backdrop-blur-sm overflow-x-auto scrollbar-sidebar">
      {/* NAV */}
      <div className="metric-badge shrink-0">
        <span className="text-[9px] text-[var(--text-tertiary)] uppercase tracking-wider">NAV</span>
        <span className="text-xs font-bold text-[var(--text-primary)] tabular-nums">
          {navLoading ? "…" : nav.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
        </span>
      </div>

      <span className="w-px h-4 bg-white/10 shrink-0" aria-hidden />

      {/* Session P&L — larger, bolder, glow on positive */}
      <div
        className={`flex items-center gap-2 px-3 py-1.5 rounded-lg shrink-0 ${
          sessionPnl >= 0
            ? "bg-emerald-500/10 border border-emerald-500/20 shadow-[0_0_12px_rgba(52,211,153,0.15)]"
            : "bg-red-500/10 border border-red-500/20"
        }`}
      >
        <span className="text-[9px] text-[var(--text-tertiary)] uppercase tracking-wider">P&L</span>
        <span
          className={`text-sm font-bold font-mono tabular-nums ${
            sessionPnl >= 0 ? "text-emerald-400 drop-shadow-[0_0_8px_rgba(52,211,153,0.4)]" : "text-red-400"
          }`}
        >
          {sessionPnl >= 0 ? "+" : ""}
          {sessionPnl.toFixed(2)}
        </span>
      </div>

      <span className="w-px h-4 bg-white/10 shrink-0" aria-hidden />

      {/* Sharpe — conditional coloring */}
      <div className="metric-badge shrink-0">
        <span className="text-[9px] text-[var(--text-tertiary)] uppercase tracking-wider">Sharpe</span>
        <span
          className={`text-xs font-bold tabular-nums ${
            sharpeColor === "emerald"
              ? "text-emerald-400"
              : sharpeColor === "amber"
                ? "text-amber-400"
                : "text-[var(--text-primary)]"
          }`}
        >
          {sharpeRatio != null ? sharpeRatio.toFixed(2) : "—"}
        </span>
      </div>

      {/* Win Rate — with status dot when low */}
      <div className="metric-badge shrink-0 flex items-center gap-1.5">
        {winRate < 45 && rounds > 0 && <span className="w-1.5 h-1.5 rounded-full bg-amber-400/80 shrink-0" aria-hidden title="Win rate below 45%" />}
        <span className="text-[9px] text-[var(--text-tertiary)] uppercase tracking-wider">WR</span>
        <span className={`text-xs font-bold tabular-nums ${winRate >= 50 ? "text-emerald-400/90" : winRate < 45 && rounds > 0 ? "text-amber-400" : "text-[var(--text-primary)]"}`}>
          {winRate.toFixed(1)}%
        </span>
      </div>

      {/* Max DD */}
      <div className="metric-badge shrink-0">
        <span className="text-[9px] text-[var(--text-tertiary)] uppercase tracking-wider">Max DD</span>
        <span className="text-xs font-bold text-red-400/90 tabular-nums">
          {maxDrawdownPct != null ? `-${maxDrawdownPct.toFixed(1)}%` : "—"}
        </span>
      </div>

      {/* Rounds — badge with pulse dot */}
      <div className="metric-badge shrink-0 flex items-center gap-1.5">
        <span className="w-1.5 h-1.5 rounded-full bg-[#0ea5e9] animate-pulse shrink-0" aria-hidden />
        <span className="text-[9px] text-[var(--text-tertiary)] uppercase tracking-wider">Rounds</span>
        <span className="text-xs font-bold text-[var(--text-primary)] tabular-nums">{rounds}</span>
      </div>

      <span className="w-px h-4 bg-white/10 shrink-0" aria-hidden />

      {/* Edge — house edge, quant-critical for position sizing */}
      <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-red-500/10 border border-red-500/20 shrink-0" title="House edge (3%) — RTP 97%">
        <svg className="w-3 h-3 text-red-400 shrink-0" fill="currentColor" viewBox="0 0 20 20" aria-hidden>
          <path
            fillRule="evenodd"
            d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z"
            clipRule="evenodd"
          />
        </svg>
        <span className="text-[9px] text-[var(--text-tertiary)] uppercase tracking-wider">Edge</span>
        <span className="text-xs font-bold text-red-400 tabular-nums">-{HOUSE_EDGE_PCT}%</span>
      </div>

      {/* Kelly — conditional coloring */}
      <div className="metric-badge shrink-0">
        <span className="text-[9px] text-[var(--text-tertiary)] uppercase tracking-wider">Kelly</span>
        <span
          className={`text-xs font-bold tabular-nums ${
            kellyColor === "emerald"
              ? "text-emerald-400"
              : kellyColor === "amber"
                ? "text-amber-400"
                : "text-[var(--text-primary)]"
          }`}
        >
          {kellyFraction != null ? `${kellyFraction.toFixed(1)}%` : "—"}
        </span>
      </div>

      {/* Ready status — subtle indicator */}
      {ready && (
        <>
          <span className="w-px h-4 bg-white/10 shrink-0" aria-hidden />
          <div className="metric-badge shrink-0 flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-emerald-500/80 shrink-0 animate-breathing ring-2 ring-emerald-500/30" aria-hidden />
            <span className="text-[9px] text-emerald-400/90 font-semibold uppercase tracking-wider">Ready</span>
          </div>
        </>
      )}
    </div>
  );
}

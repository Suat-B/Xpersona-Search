"use client";

import { useState, useEffect, useSyncExternalStore } from "react";

function useIsMobile() {
  return useSyncExternalStore(
    (cb) => {
      const m = window.matchMedia("(max-width: 1023px)");
      m.addEventListener("change", cb);
      return () => m.removeEventListener("change", cb);
    },
    () => typeof window !== "undefined" && window.matchMedia("(max-width: 1023px)").matches,
    () => false
  );
}
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
  /** Compact inline mode for use inside merged header row */
  compact?: boolean;
  /** AI/API connected — shows LIVE indicator */
  live?: boolean;
  /** Session start timestamp (ms) for elapsed timer */
  sessionStartTime?: number | null;
  /** Mobile mode: show only NAV, P&L, Rounds inline; expand for rest */
  mobile?: boolean;
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

function formatElapsed(ms: number): string {
  const s = Math.floor((Date.now() - ms) / 1000);
  const m = Math.floor(s / 60);
  const sec = s % 60;
  return `${m}:${sec.toString().padStart(2, "0")}`;
}

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
  compact = false,
  live = false,
  sessionStartTime = null,
  mobile = false,
}: QuantTopMetricsBarProps) {
  const sharpeColor = formatSharpeColor(sharpeRatio);
  const kellyColor = formatKellyColor(kellyFraction);
  const [elapsed, setElapsed] = useState<string | null>(null);
  const [expanded, setExpanded] = useState(false);
  const isMobile = useIsMobile();
  const useCondensed = mobile && isMobile && !expanded;

  useEffect(() => {
    if (sessionStartTime == null || rounds === 0) {
      setElapsed(null);
      return;
    }
    setElapsed(formatElapsed(sessionStartTime));
    const id = setInterval(() => setElapsed(formatElapsed(sessionStartTime)), 1000);
    return () => clearInterval(id);
  }, [sessionStartTime, rounds]);

  return (
    <div className="relative">
      <div className="terminal-scan-line" aria-hidden />
      <div
        className={`flex items-center font-mono ${
          compact
            ? "flex-1 min-w-0 px-2 lg:px-3 py-1 overflow-x-auto " + (useCondensed ? "scrollbar-none" : "scrollbar-sidebar")
            : "px-4 py-1.5 border-b border-white/[0.06] bg-[#050506] overflow-x-auto scrollbar-sidebar"
        }`}
      >
      <div className="flex items-center gap-0">
      {/* NAV */}
      <div className="metric-badge shrink-0 px-2 py-0.5">
        <span className="text-[10px] sm:text-[8px] text-[var(--text-tertiary)] uppercase tracking-wider">NAV</span>
        <span className="text-[11px] lg:text-[11px] font-semibold text-[var(--text-primary)] tabular-nums">
          {navLoading ? "…" : nav.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
        </span>
      </div>

      <span className="w-px h-3 bg-white/[0.08] shrink-0 mx-0.5" aria-hidden />

      {/* Session P&L */}
      <div
        className={`flex items-center gap-1.5 px-2 py-0.5 rounded-sm shrink-0 ${
          sessionPnl >= 0
            ? "bg-emerald-500/10 border border-emerald-500/20"
            : "bg-red-500/10 border border-red-500/20"
        }`}
      >
        <span className="text-[10px] sm:text-[8px] text-[var(--text-tertiary)] uppercase tracking-wider">P&L</span>
        <span
          className={`text-[11px] font-semibold tabular-nums ${
            sessionPnl >= 0 ? "text-emerald-400" : "text-red-400"
          }`}
        >
          {sessionPnl >= 0 ? "+" : ""}
          {sessionPnl.toFixed(2)}
        </span>
      </div>

      <span className="w-px h-3 bg-white/[0.08] shrink-0 mx-0.5" aria-hidden />

      {!useCondensed && (
      <>
      {/* Sharpe */}
      <div className="metric-badge shrink-0 px-2 py-0.5">
        <span className="text-[10px] sm:text-[8px] text-[var(--text-tertiary)] uppercase tracking-wider">Sharpe</span>
        <span
          className={`text-[11px] font-semibold tabular-nums ${
            sharpeColor === "emerald" ? "text-emerald-400" : sharpeColor === "amber" ? "text-amber-400" : "text-[var(--text-primary)]"
          }`}
        >
          {sharpeRatio != null ? sharpeRatio.toFixed(2) : "—"}
        </span>
      </div>

      <span className="w-px h-3 bg-white/[0.08] shrink-0 mx-0.5" aria-hidden />

      {/* Win Rate */}
      <div className="metric-badge shrink-0 px-2 py-0.5 flex items-center gap-1">
        {winRate < 45 && rounds > 0 && <span className="w-1 h-1 rounded-full bg-amber-400/80 shrink-0" aria-hidden />}
        <span className="text-[10px] sm:text-[8px] text-[var(--text-tertiary)] uppercase tracking-wider">WR</span>
        <span className={`text-[11px] font-semibold tabular-nums ${winRate >= 50 ? "text-emerald-400/90" : winRate < 45 && rounds > 0 ? "text-amber-400" : "text-[var(--text-primary)]"}`}>
          {winRate.toFixed(1)}%
        </span>
      </div>

      <span className="w-px h-3 bg-white/[0.08] shrink-0 mx-0.5" aria-hidden />

      {/* Max DD */}
      <div className="metric-badge shrink-0 px-2 py-0.5">
        <span className="text-[10px] sm:text-[8px] text-[var(--text-tertiary)] uppercase tracking-wider">Max DD</span>
        <span className="text-[11px] font-semibold text-red-400/90 tabular-nums">
          {maxDrawdownPct != null ? `-${maxDrawdownPct.toFixed(1)}%` : "—"}
        </span>
      </div>

      <span className="w-px h-3 bg-white/[0.08] shrink-0 mx-0.5" aria-hidden />

      {/* Rounds */}
      <div className="metric-badge shrink-0 px-2 py-0.5 flex items-center gap-1">
        <span className="w-1 h-1 rounded-full bg-[#0ea5e9] animate-pulse shrink-0" aria-hidden />
        <span className="text-[10px] sm:text-[8px] text-[var(--text-tertiary)] uppercase tracking-wider">Rnd</span>
        <span className="text-[11px] font-semibold text-[var(--text-primary)] tabular-nums">{rounds}</span>
      </div>

      <span className="w-px h-3 bg-white/[0.08] shrink-0 mx-0.5" aria-hidden />

      {/* Edge */}
      <div className="flex items-center gap-1 px-2 py-0.5 rounded-sm bg-red-500/10 border border-red-500/20 shrink-0" title="House edge (3%) — RTP 97%">
        <span className="text-[10px] sm:text-[8px] text-[var(--text-tertiary)] uppercase tracking-wider">Edge</span>
        <span className="text-[11px] font-semibold text-red-400 tabular-nums">-{HOUSE_EDGE_PCT}%</span>
      </div>

      <span className="w-px h-3 bg-white/[0.08] shrink-0 mx-0.5" aria-hidden />

      {/* Kelly */}
      <div className="metric-badge shrink-0 px-2 py-0.5">
        <span className="text-[10px] sm:text-[8px] text-[var(--text-tertiary)] uppercase tracking-wider">Kelly</span>
        <span
          className={`text-[11px] font-semibold tabular-nums ${
            kellyColor === "emerald" ? "text-emerald-400" : kellyColor === "amber" ? "text-amber-400" : "text-[var(--text-primary)]"
          }`}
        >
          {kellyFraction != null ? `${kellyFraction.toFixed(1)}%` : "—"}
        </span>
      </div>

      {/* Session timer */}
      {elapsed != null && (
        <>
          <span className="w-px h-3 bg-white/[0.08] shrink-0 mx-0.5" aria-hidden />
          <div className="metric-badge shrink-0 px-2 py-0.5">
            <span className="text-[10px] sm:text-[8px] text-[var(--text-tertiary)] uppercase tracking-wider">Time</span>
            <span className="text-[11px] font-semibold text-[var(--text-secondary)] tabular-nums">{elapsed}</span>
          </div>
        </>
      )}

      {/* LIVE indicator when AI connected */}
      {live && (
        <>
          <span className="w-px h-3 bg-white/[0.08] shrink-0 mx-0.5" aria-hidden />
          <div className="flex items-center gap-1 px-2 py-0.5 rounded-sm bg-violet-500/15 border border-violet-500/30 shrink-0">
            <span className="w-1 h-1 rounded-full bg-violet-400 animate-pulse shrink-0" aria-hidden />
            <span className="text-[9px] font-semibold text-violet-400 uppercase tracking-wider">LIVE</span>
          </div>
        </>
      )}

      {/* Ready status */}
      {ready && (
        <>
          <span className="w-px h-3 bg-white/[0.08] shrink-0 mx-0.5" aria-hidden />
          <div className="metric-badge shrink-0 flex items-center gap-1 px-2 py-0.5">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500/80 shrink-0 animate-breathing" aria-hidden />
            <span className="text-[9px] text-emerald-400/90 font-semibold uppercase tracking-wider">Ready</span>
          </div>
        </>
      )}
      </>
      )}

      {/* Mobile expand button — show more metrics */}
      {mobile && isMobile && (
        <button
          type="button"
          onClick={() => setExpanded((e) => !e)}
          className="shrink-0 ml-1 flex items-center justify-center w-8 h-8 rounded-sm bg-white/[0.04] hover:bg-white/[0.08] text-[var(--text-tertiary)] hover:text-[var(--text-primary)] transition-colors min-h-[36px] min-w-[36px]"
          aria-label={expanded ? "Show fewer metrics" : "Show all metrics"}
        >
          <span className="text-sm font-bold">{expanded ? "−" : "⋯"}</span>
        </button>
      )}
      </div>
    </div>
  </div>
  );
}

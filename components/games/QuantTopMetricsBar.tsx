"use client";

import { useState, useEffect, useRef, useSyncExternalStore } from "react";
import { MetricCard } from "@/components/ui/GlassCard";

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
  ready?: boolean;
  compact?: boolean;
  live?: boolean;
  sessionStartTime?: number | null;
  mobile?: boolean;
  cardLayout?: boolean;
  cardLayoutCompact?: boolean;
}

function formatSharpeColor(sharpe: number | null): "emerald" | "blue" | "neutral" {
  if (sharpe == null) return "neutral";
  if (sharpe >= 0.5) return "emerald";
  if (sharpe >= 0) return "blue";
  return "neutral";
}

function formatKellyColor(kelly: number | null): "emerald" | "blue" | "neutral" {
  if (kelly == null) return "neutral";
  if (kelly >= 5) return "emerald";
  if (kelly >= 1) return "blue";
  return "neutral";
}

const HOUSE_EDGE_PCT = (DICE_HOUSE_EDGE * 100).toFixed(1);

function formatElapsed(ms: number): string {
  const s = Math.floor((Date.now() - ms) / 1000);
  const m = Math.floor(s / 60);
  const sec = s % 60;
  return `${m}:${sec.toString().padStart(2, "0")}`;
}

function AnimatedValue({ value, className }: { value: string; className?: string }) {
  const prevRef = useRef(value);
  const [flash, setFlash] = useState(false);

  useEffect(() => {
    if (value !== prevRef.current) {
      prevRef.current = value;
      setFlash(true);
      const t = setTimeout(() => setFlash(false), 400);
      return () => clearTimeout(t);
    }
  }, [value]);

  return (
    <span className={`metric-value-transition ${flash ? "metric-value-flash" : ""} ${className ?? ""}`}>
      {value}
    </span>
  );
}

function TrendArrow({ direction }: { direction: "up" | "down" | "neutral" }) {
  if (direction === "neutral") return null;
  return (
    <svg
      className={`w-2.5 h-2.5 ${direction === "up" ? "text-emerald-400" : "text-red-400"}`}
      fill="none"
      stroke="currentColor"
      viewBox="0 0 24 24"
    >
      {direction === "up" ? (
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 10l7-7m0 0l7 7m-7-7v18" />
      ) : (
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M19 14l-7 7m0 0l-7-7m7 7V3" />
      )}
    </svg>
  );
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
  cardLayout = false,
  cardLayoutCompact = false,
}: QuantTopMetricsBarProps) {
  const sharpeColor = formatSharpeColor(sharpeRatio);
  const kellyColor = formatKellyColor(kellyFraction);
  const [elapsed, setElapsed] = useState<string | null>(null);
  const [expanded, setExpanded] = useState(false);
  const isMobile = useIsMobile();
  const useCondensed = mobile && isMobile && !expanded;
  const pnlTrend: "up" | "down" | "neutral" = sessionPnl > 0 ? "up" : sessionPnl < 0 ? "down" : "neutral";
  const wrTrend: "up" | "down" | "neutral" = winRate >= 50 ? "up" : winRate < 45 && rounds > 0 ? "down" : "neutral";

  useEffect(() => {
    if (sessionStartTime == null || rounds === 0) {
      setElapsed(null);
      return;
    }
    setElapsed(formatElapsed(sessionStartTime));
    const id = setInterval(() => setElapsed(formatElapsed(sessionStartTime)), 1000);
    return () => clearInterval(id);
  }, [sessionStartTime, rounds]);

  if (cardLayout) {
    const cardClass = cardLayoutCompact
      ? "!h-[56px] !p-2 !min-h-0 [&_.text-3xl]:!text-lg"
      : undefined;
    return (
      <div className={`grid grid-cols-2 md:grid-cols-4 ${cardLayoutCompact ? "gap-2" : "gap-4"}`}>
        <MetricCard
          label="Balance"
          value={navLoading ? "\u2026" : nav.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          trend="neutral"
          className={cardClass}
        />
        <MetricCard
          label="Session P&L"
          value={`${sessionPnl >= 0 ? "+" : ""}${sessionPnl.toFixed(2)}`}
          subtext={!cardLayoutCompact ? `${rounds} rounds` : undefined}
          trend={pnlTrend}
          className={cardClass}
        />
        <MetricCard
          label="Win Rate"
          value={`${winRate.toFixed(1)}%`}
          trend={wrTrend}
          className={cardClass}
        />
        <MetricCard
          label="Rounds"
          value={rounds}
          subtext={!cardLayoutCompact && elapsed ? `Time: ${elapsed}` : undefined}
          trend="neutral"
          className={cardClass}
        />
      </div>
    );
  }

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
      {/* BALANCE */}
      <div className="metric-badge shrink-0 px-2 py-0.5">
        <span className="text-[10px] sm:text-[8px] text-[var(--text-tertiary)] uppercase tracking-wider">BALANCE</span>
        <AnimatedValue
          value={navLoading ? "\u2026" : nav.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          className="text-[11px] lg:text-[11px] font-semibold text-[var(--text-primary)] tabular-nums"
        />
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
        <TrendArrow direction={pnlTrend} />
        <AnimatedValue
          value={`${sessionPnl >= 0 ? "+" : ""}${sessionPnl.toFixed(2)}`}
          className={`text-[11px] font-semibold tabular-nums ${sessionPnl >= 0 ? "text-emerald-400" : "text-red-400"}`}
        />
      </div>

      <span className="w-px h-3 bg-white/[0.08] shrink-0 mx-0.5" aria-hidden />

      {!useCondensed && (
      <>
      {/* Sharpe */}
      <div className="metric-badge shrink-0 px-2 py-0.5">
        <span className="text-[10px] sm:text-[8px] text-[var(--text-tertiary)] uppercase tracking-wider">Sharpe</span>
        <AnimatedValue
          value={sharpeRatio != null ? sharpeRatio.toFixed(2) : "\u2014"}
          className={`text-[11px] font-semibold tabular-nums ${
            sharpeColor === "emerald" ? "text-emerald-400" : sharpeColor === "blue" ? "text-[#0ea5e9]" : "text-[var(--text-primary)]"
          }`}
        />
      </div>

      <span className="w-px h-3 bg-white/[0.08] shrink-0 mx-0.5" aria-hidden />

      {/* Win Rate */}
      <div className="metric-badge shrink-0 px-2 py-0.5 flex items-center gap-1">
        {winRate < 45 && rounds > 0 && <span className="w-1 h-1 rounded-full bg-[#ff453a]/80 shrink-0" aria-hidden />}
        <span className="text-[10px] sm:text-[8px] text-[var(--text-tertiary)] uppercase tracking-wider">WR</span>
        <TrendArrow direction={wrTrend} />
        <AnimatedValue
          value={`${winRate.toFixed(1)}%`}
          className={`text-[11px] font-semibold tabular-nums ${winRate >= 50 ? "text-emerald-400/90" : winRate < 45 && rounds > 0 ? "text-[#ff453a]" : "text-[var(--text-primary)]"}`}
        />
      </div>

      <span className="w-px h-3 bg-white/[0.08] shrink-0 mx-0.5" aria-hidden />

      {/* Max DD */}
      <div className="metric-badge shrink-0 px-2 py-0.5">
        <span className="text-[10px] sm:text-[8px] text-[var(--text-tertiary)] uppercase tracking-wider">Max DD</span>
        <AnimatedValue
          value={maxDrawdownPct != null ? `-${maxDrawdownPct.toFixed(1)}%` : "\u2014"}
          className="text-[11px] font-semibold text-red-400/90 tabular-nums"
        />
      </div>

      <span className="w-px h-3 bg-white/[0.08] shrink-0 mx-0.5" aria-hidden />

      {/* Rounds */}
      <div className="metric-badge shrink-0 px-2 py-0.5 flex items-center gap-1">
        <span className="w-1 h-1 rounded-full bg-[#0ea5e9] animate-pulse shrink-0" aria-hidden />
        <span className="text-[10px] sm:text-[8px] text-[var(--text-tertiary)] uppercase tracking-wider">Rnd</span>
        <AnimatedValue
          value={String(rounds)}
          className="text-[11px] font-semibold text-[var(--text-primary)] tabular-nums"
        />
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
        <AnimatedValue
          value={kellyFraction != null ? `${kellyFraction.toFixed(1)}%` : "\u2014"}
          className={`text-[11px] font-semibold tabular-nums ${
            kellyColor === "emerald" ? "text-emerald-400" : kellyColor === "blue" ? "text-[#0ea5e9]" : "text-[var(--text-primary)]"
          }`}
        />
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

      {/* Mobile expand button */}
      {mobile && isMobile && (
        <button
          type="button"
          onClick={() => setExpanded((e) => !e)}
          className="shrink-0 ml-1 flex items-center justify-center w-8 h-8 rounded-sm bg-white/[0.04] hover:bg-white/[0.08] text-[var(--text-tertiary)] hover:text-[var(--text-primary)] transition-colors min-h-[36px] min-w-[36px]"
          aria-label={expanded ? "Show fewer metrics" : "Show all metrics"}
        >
          <span className="text-sm font-bold">{expanded ? "\u2212" : "\u22EF"}</span>
        </button>
      )}
      </div>
    </div>
  </div>
  );
}

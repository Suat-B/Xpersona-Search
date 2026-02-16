"use client";

import { useState, useEffect } from "react";
import Link from "next/link";

interface CommandCenterProps {
  balance: number | null;
  isLoadingBalance?: boolean;
  onRetryBalance?: () => void;
  sessionPnl: number;
  winRate: number;
  sharpe: number;
  isAutoTrading: boolean;
  onToggleAuto: () => void;
}

export function CommandCenter({
  balance,
  isLoadingBalance,
  onRetryBalance,
  sessionPnl,
  winRate,
  sharpe,
  isAutoTrading,
  onToggleAuto,
}: CommandCenterProps) {
  const [time, setTime] = useState(new Date());
  const [latency, setLatency] = useState(23);
  const [prevPnl, setPrevPnl] = useState(sessionPnl);
  const [pnlFlash, setPnlFlash] = useState<"green" | "red" | null>(null);

  // Update clock
  useEffect(() => {
    const interval = setInterval(() => {
      setTime(new Date());
      // Simulate latency variation
      setLatency(Math.floor(Math.random() * 30) + 10);
    }, 100);
    return () => clearInterval(interval);
  }, []);

  // Flash PnL on change
  useEffect(() => {
    if (sessionPnl !== prevPnl) {
      setPnlFlash(sessionPnl > prevPnl ? "green" : "red");
      const timer = setTimeout(() => setPnlFlash(null), 300);
      setPrevPnl(sessionPnl);
      return () => clearTimeout(timer);
    }
  }, [sessionPnl, prevPnl]);

  const pnlTrend = sessionPnl > 0 ? "▲" : sessionPnl < 0 ? "▼" : "─";
  const pnlClass = sessionPnl >= 0 ? "text-bullish" : "text-bearish";

  return (
    <header className="h-14 bg-[var(--quant-bg-surface)] border-b border-[var(--quant-border)] flex items-center justify-between px-4">
      {/* Left - Logo & Title (matches dashboard; click navigates to dashboard) */}
      <div className="flex items-center gap-4">
        <Link href="/dashboard" className="flex items-center gap-2 group" aria-label="Back to Dashboard">
          <div className="w-8 h-8 rounded flex items-center justify-center bg-gradient-to-br from-[#0ea5e9] to-[#0077b6] shadow-lg shadow-[#0ea5e9]/20 group-hover:shadow-[#0ea5e9]/40 transition-shadow">
            <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" />
            </svg>
          </div>
          <div>
            <h1 className="text-sm font-bold tracking-wider text-white font-display">Xpersona</h1>
            <p className="text-[10px] text-[var(--quant-neutral)]">Quantitative Game</p>
          </div>
        </Link>

        {/* Atomic Clock */}
        <div className="flex items-center gap-2 px-4 border-l border-[var(--quant-border)]">
          <svg className="w-4 h-4 text-[var(--quant-accent)]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          <span className="font-mono text-sm text-white tabular-nums">
            {time.toISOString().split("T")[1].split(".")[0]}
          </span>
          <span className="text-[10px] text-[var(--quant-neutral)]">UTC</span>
        </div>

        {/* Connection Status */}
        <div className="flex items-center gap-2 px-4 border-l border-[var(--quant-border)]">
          <div className="quant-status-dot online animate-pulse"></div>
          <span className="text-[11px] font-medium text-bullish">LIVE</span>
          <span className="text-[10px] text-[var(--quant-neutral)]">{latency}ms</span>
        </div>
      </div>

      {/* Right - Metrics */}
      <div className="flex items-center gap-6">
        {/* Balance */}
        <div className="quant-metric">
          <span className="quant-metric-label">NAV</span>
          {balance === null || isLoadingBalance ? (
            <button
              type="button"
              onClick={onRetryBalance}
              disabled={isLoadingBalance}
              className="quant-metric-value animate-pulse hover:text-[var(--quant-accent)] transition-colors disabled:pointer-events-none"
              title={balance === null && !isLoadingBalance ? "Click to retry" : undefined}
            >
              --.--
            </button>
          ) : (
            <span className="quant-metric-value">${balance.toLocaleString("en-US", { minimumFractionDigits: 2 })}</span>
          )}
        </div>

        {/* PnL */}
        <div className="quant-metric">
          <span className="quant-metric-label">Session PnL</span>
          <div className="flex items-center gap-1">
            <span
              className={`quant-metric-value ${pnlClass} ${
                pnlFlash === "green" ? "animate-quant-flash-green" : pnlFlash === "red" ? "animate-quant-flash-red" : ""
              }`}
            >
              {sessionPnl >= 0 ? "+" : ""}${sessionPnl.toFixed(2)}
            </span>
            <span className={`text-xs ${pnlClass}`}>{pnlTrend}</span>
          </div>
        </div>

        {/* Win Rate */}
        <div className="quant-metric">
          <span className="quant-metric-label">Win Rate</span>
          <span className="quant-metric-value text-accent">{winRate.toFixed(1)}%</span>
        </div>

        {/* Sharpe */}
        <div className="quant-metric">
          <span className="quant-metric-label">Sharpe</span>
          <span className={`quant-metric-value ${sharpe > 1 ? "text-bullish" : "text-neutral"}`}>{sharpe.toFixed(2)}</span>
        </div>

        {/* Auto-Trade Toggle */}
        <button
          onClick={onToggleAuto}
          className={`quant-btn ${isAutoTrading ? "quant-btn-success" : ""}`}
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            {isAutoTrading ? (
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 9v6m4-6v6m7-3a9 9 0 11-18 0 9 9 0 0118 0z" />
            ) : (
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z" />
            )}
          </svg>
          {isAutoTrading ? "STOP" : "AUTO"}
        </button>
      </div>
    </header>
  );
}

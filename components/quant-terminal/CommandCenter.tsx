"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { useAiConnectionStatus } from "@/lib/hooks/use-ai-connection-status";
import { HeartbeatIndicator } from "@/components/ui/HeartbeatIndicator";

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
  const { hasApiKey: aiConnected } = useAiConnectionStatus();
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
        {/* Connect AI — left of balance, links to API page */}
        <Link
          href="/dashboard/api"
          className={`inline-flex items-center gap-2 rounded-md border px-3 py-1.5 text-xs font-medium transition-all ${
            aiConnected
              ? "border-[#30d158]/40 bg-[#30d158]/10 text-[#30d158] hover:bg-[#30d158]/20 hover:border-[#30d158]/60"
              : "border-[#0ea5e9]/40 bg-[#0ea5e9]/10 text-[#0ea5e9] hover:bg-[#0ea5e9]/20 hover:border-[#0ea5e9]/60"
          }`}
        >
          {aiConnected ? (
            <>
              <HeartbeatIndicator size="sm" />
              <span>AI connected</span>
            </>
          ) : (
            <>
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
              </svg>
              <span>Connect AI</span>
            </>
          )}
        </Link>

        {/* Balance */}
        <div className="quant-metric">
          <span className="quant-metric-label">NAV</span>
          <div className="flex items-center gap-1.5">
            <div className="w-5 h-5 rounded-full flex items-center justify-center bg-[var(--quant-accent)]/20 border border-[var(--quant-accent)]/40 shrink-0" title="Credits">
              <svg className="w-3 h-3 text-[var(--quant-accent)]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </div>
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

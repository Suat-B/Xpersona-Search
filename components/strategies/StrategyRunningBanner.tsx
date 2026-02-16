"use client";

/**
 * Dice-themed banner showing that the user's strategy is running (not an AI agent).
 * Matches Pure Dice visual language: rounded-2xl, border, font-mono, accent-heart.
 */

export interface StrategyRunningBannerProps {
  strategyName: string;
  status: "running" | "stopped" | "completed" | "error";
  currentRound: number;
  sessionPnl: number;
  currentBalance: number;
  initialBalance: number;
  winRatePercent: number;
  onStop?: () => void;
  /** Compact mode for inline/sidebar */
  compact?: boolean;
}

export function StrategyRunningBanner({
  strategyName,
  status,
  currentRound,
  sessionPnl,
  currentBalance,
  initialBalance,
  winRatePercent,
  onStop,
  compact = false,
}: StrategyRunningBannerProps) {
  const isRunning = status === "running";

  if (compact) {
    return (
      <div className="rounded-lg border border-[var(--border)] bg-[var(--bg-card)] px-3 py-2 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0 flex-wrap">
          <span className="flex-shrink-0 w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
          <span className="text-xs text-[var(--text-secondary)] truncate">
            Your strategy
          </span>
          <span className="text-sm font-semibold text-[var(--text-primary)] truncate">
            {strategyName}
          </span>
        </div>
        <div className="flex items-center gap-3 flex-shrink-0 text-xs font-mono flex-wrap">
          <span className="text-[var(--text-secondary)] tabular-nums min-w-[3ch]">R{currentRound}</span>
          <span className={sessionPnl >= 0 ? "text-emerald-400" : "text-red-400"}>
            {sessionPnl >= 0 ? "+" : ""}{sessionPnl}
          </span>
          {onStop && isRunning && (
            <button
              type="button"
              onClick={onStop}
              className="rounded-lg border border-red-500/50 bg-red-500/10 px-3 py-2 text-red-400 hover:bg-red-500/20 text-xs font-medium transition-colors min-h-[44px] min-w-[60px] flex items-center justify-center"
            >
              Stop
            </button>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-2xl border border-[var(--border)] bg-[var(--bg-card)] overflow-hidden">
      {/* Header - same style as dice game */}
      <div className="flex-shrink-0 px-5 pt-4 pb-3 border-b border-[var(--border)]/50">
        <div className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-3 min-w-0">
            <span className="flex-shrink-0 w-2.5 h-2.5 rounded-full bg-emerald-500 animate-pulse" />
            <div className="min-w-0">
              <p className="text-[10px] font-medium text-[var(--text-secondary)] uppercase tracking-wider">
                Your strategy · You&apos;re running (not AI)
              </p>
              <p className="text-base font-bold text-[var(--text-primary)] truncate">
                {strategyName}
              </p>
            </div>
          </div>
          {onStop && isRunning && (
            <button
              type="button"
              onClick={onStop}
              className="flex-shrink-0 rounded-xl border-2 border-red-500 bg-red-500/10 px-4 py-2 text-sm font-bold text-red-400 hover:bg-red-500/20 transition-colors flex items-center gap-1.5"
            >
              <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8 7a1 1 0 00-1 1v4a1 1 0 001 1h4a1 1 0 001-1V8a1 1 0 00-1-1H8z" clipRule="evenodd" />
              </svg>
              Stop
            </button>
          )}
        </div>
      </div>

      {/* Stats grid - dice style: font-mono, same labels */}
      <div className="p-5 grid grid-cols-2 sm:grid-cols-4 gap-4">
        <div className="rounded-xl border border-[var(--border)] bg-[var(--bg-matte)] px-4 py-3">
          <p className="text-[10px] font-medium text-[var(--text-secondary)] uppercase tracking-wider mb-0.5">
            Round
          </p>
          <p className="text-lg font-mono font-bold text-[var(--text-primary)]">
            {currentRound}
          </p>
        </div>
        <div className="rounded-xl border border-[var(--border)] bg-[var(--bg-matte)] px-4 py-3">
          <p className="text-[10px] font-medium text-[var(--text-secondary)] uppercase tracking-wider mb-0.5">
            Session PnL
          </p>
          <p className={`text-lg font-mono font-bold ${sessionPnl >= 0 ? "text-emerald-400" : "text-red-400"}`}>
            {sessionPnl >= 0 ? "+" : ""}{sessionPnl}
          </p>
        </div>
        <div className="rounded-xl border border-[var(--border)] bg-[var(--bg-matte)] px-4 py-3">
          <p className="text-[10px] font-medium text-[var(--text-secondary)] uppercase tracking-wider mb-0.5">
            Balance
          </p>
          <p className="text-lg font-mono font-bold text-[var(--text-primary)]">
            {currentBalance}
          </p>
        </div>
        <div className="rounded-xl border border-[var(--border)] bg-[var(--bg-matte)] px-4 py-3">
          <p className="text-[10px] font-medium text-[var(--text-secondary)] uppercase tracking-wider mb-0.5">
            Win rate
          </p>
          <p className="text-lg font-mono font-bold text-[var(--accent-heart)]">
            {winRatePercent.toFixed(1)}%
          </p>
        </div>
      </div>

      {/* Footer hint */}
      <div className="px-5 pb-4 flex items-center gap-2 text-xs text-[var(--text-secondary)]">
        <span className="text-[var(--border)]">|</span>
        <span>Initial balance: {initialBalance}</span>
      </div>
    </div>
  );
}

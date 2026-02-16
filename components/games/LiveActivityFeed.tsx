"use client";

export type LiveActivityItem = {
  id: string;
  result: number;
  win: boolean;
  payout: number;
  amount: number;
  target: number;
  condition: string;
  fromApi?: boolean;
};

interface LiveActivityFeedProps {
  items: LiveActivityItem[];
  maxItems?: number;
  className?: string;
  /** When true, omits outer card styling (parent provides agent-card) */
  embedded?: boolean;
}

export function LiveActivityFeed({
  items,
  maxItems = 30,
  className = "",
  embedded = false,
}: LiveActivityFeedProps) {
  const display = items.slice(-maxItems).reverse();

  if (display.length === 0) {
    return (
      <div
        className={embedded ? `p-0 ${className}` : `rounded-xl border border-[var(--border)] bg-[var(--bg-card)] p-4 ${className}`}
      >
        <h4 className="text-sm font-semibold text-[var(--text-secondary)] uppercase tracking-wider mb-2">
          Live activity
        </h4>
        <p className="text-sm text-[var(--text-tertiary)] italic">
          AI/API rounds will appear here in real time
        </p>
      </div>
    );
  }

  return (
    <div
      className={embedded ? `overflow-hidden ${className}` : `rounded-xl border border-[var(--border)] bg-[var(--bg-card)] overflow-hidden ${className}`}
    >
      <h4 className="text-sm font-semibold text-[var(--text-secondary)] uppercase tracking-wider px-0 py-2 border-b border-[var(--border)]/50 flex items-center gap-2">
        <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
        Live activity
        <span className="text-[var(--text-tertiary)] font-normal normal-case">
          — {display.length} recent
        </span>
      </h4>
      <div className="max-h-[240px] overflow-y-auto overscroll-contain scrollbar-sidebar">
        {display.map((item) => (
          <div
            key={item.id}
            className="flex items-center justify-between gap-4 px-0 py-2.5 border-b border-white/5 last:border-0 text-sm hover:bg-white/[0.02] transition-colors"
          >
            <div className="flex items-center gap-2 min-w-0 flex-1">
              <span
                className={`font-mono font-bold tabular-nums shrink-0 ${
                  item.win ? "text-emerald-400" : "text-red-400"
                }`}
              >
                {item.result.toFixed(2)}
              </span>
              <span className="text-[var(--text-tertiary)] shrink-0">
                {item.condition} {item.target}
              </span>
              <span className="text-[var(--text-secondary)] shrink-0 tabular-nums">
                {item.amount} U
              </span>
            </div>
            <div className="flex items-center gap-2 shrink-0 pl-3 min-w-[3rem]">
              {item.win ? (
                <span className="text-emerald-400 font-medium tabular-nums">+{item.payout}</span>
              ) : (
                <span className="text-red-400/80">—</span>
              )}
              {item.fromApi && (
                <span className="text-[10px] text-violet-400/80">API</span>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

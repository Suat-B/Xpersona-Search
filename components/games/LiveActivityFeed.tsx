"use client";

import { useEffect, useRef } from "react";

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
  /** When true, AI mode is active (show AI stream styling and waiting state) */
  aiModeActive?: boolean;
}

export function LiveActivityFeed({
  items,
  maxItems = 30,
  className = "",
  embedded = false,
  aiModeActive = false,
}: LiveActivityFeedProps) {
  const display = items.slice(-maxItems).reverse();
  const hasApiItems = display.some((i) => i.fromApi);
  const scrollRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to top (newest) when new items arrive
  useEffect(() => {
    if (display.length > 0 && scrollRef.current) {
      scrollRef.current.scrollTop = 0;
    }
  }, [display.length]);

  if (display.length === 0) {
    return (
      <div
        className={embedded ? `p-0 ${className}` : `rounded-xl border border-[var(--border)] bg-[var(--bg-card)] p-4 ${className}`}
      >
        <h4 className={`text-sm font-semibold uppercase tracking-wider mb-2 flex items-center gap-2 ${
          aiModeActive ? "text-violet-400" : "text-[var(--text-secondary)]"
        }`}>
          {aiModeActive && <span className="w-2 h-2 rounded-full bg-violet-400 animate-pulse shrink-0" />}
          {aiModeActive ? "AI Activity" : "Live activity"}
        </h4>
        <p className={`text-sm italic ${aiModeActive ? "text-violet-300/80 animate-pulse" : "text-[var(--text-tertiary)]"}`}>
          {aiModeActive ? "Waiting for AI activity…" : "AI/API rounds will appear here in real time"}
        </p>
      </div>
    );
  }

  return (
    <div
      className={embedded ? `overflow-hidden ${className}` : `rounded-xl border border-[var(--border)] bg-[var(--bg-card)] overflow-hidden ${className}`}
    >
      <h4 className={`text-sm font-semibold uppercase tracking-wider px-0 py-2 border-b border-[var(--border)]/50 flex items-center gap-2 ${
        hasApiItems || aiModeActive ? "text-violet-300" : "text-[var(--text-secondary)]"
      }`}>
        <span className={`w-2 h-2 rounded-full shrink-0 ${hasApiItems || aiModeActive ? "bg-violet-400 animate-pulse" : "bg-emerald-400 animate-pulse"}`} />
        {hasApiItems || aiModeActive ? "AI Activity · Live stream" : "Live activity"}
        <span className="text-[var(--text-tertiary)] font-normal normal-case">
          — {display.length} recent
        </span>
      </h4>
      <div ref={scrollRef} className="max-h-[240px] overflow-y-auto overscroll-contain scrollbar-sidebar">
        {display.map((item, i) => (
          <div
            key={item.id}
            className={`flex items-center justify-between gap-4 py-2.5 border-b border-white/5 last:border-0 text-sm hover:bg-white/[0.02] transition-colors ${
              item.fromApi
                ? "pl-3 border-l-2 border-l-violet-500/60 bg-violet-500/[0.04]"
                : "px-0"
            } ${i === 0 ? "animate-slide-in-from-bottom" : ""}`}
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
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider text-violet-400 bg-violet-500/20 border border-violet-500/30">
                  AI
                </span>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

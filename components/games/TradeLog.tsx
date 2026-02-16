"use client";

export interface TradeLogEntry {
  roundNumber: number;
  result: number;
  win: boolean;
  payout: number;
  amount: number;
  target: number;
  condition: "over" | "under";
  balance?: number;
  source?: "manual" | "algo" | "api";
  timestamp?: Date;
}

interface TradeLogProps {
  entries: TradeLogEntry[];
  maxRows?: number;
  /** Compact mode for narrow sidebar */
  compact?: boolean;
}

function SourceDot({ source }: { source?: "manual" | "algo" | "api" }) {
  const s = source ?? "manual";
  const color =
    s === "api" ? "bg-violet-400" : s === "algo" ? "bg-[#0ea5e9]" : "bg-emerald-400";
  return (
    <span className="inline-flex items-center justify-center" title={s}>
      <span className={`w-1.5 h-1.5 rounded-full ${color}`} aria-hidden />
    </span>
  );
}

export function TradeLog({ entries, maxRows = 20, compact = true }: TradeLogProps) {
  const displayEntries = entries.slice(-maxRows).reverse();

  const formatTime = (d?: Date) => {
    if (!d) return "—";
    return d.toLocaleTimeString("en-US", { hour12: false, hour: "2-digit", minute: "2-digit" });
  };

  const pnl = (e: TradeLogEntry) => e.payout - e.amount;

  if (!compact) {
    /* Full-width table for non-sidebar contexts */
    return (
      <div className="overflow-hidden min-h-0 flex-1 flex flex-col min-w-0 w-full" data-agent="trade-log">
        <div className="overflow-x-auto overflow-y-auto max-h-[300px] min-h-0 flex-1 scrollbar-sidebar min-w-0">
          <table className="w-full text-xs border-collapse">
            <thead className="sticky top-0 bg-[var(--bg-card)]/98 border-b border-white/[0.08] z-10">
              <tr className="text-[var(--text-tertiary)]">
                <th className="text-left py-2 px-2 font-semibold text-[10px] uppercase tracking-wider">#</th>
                <th className="text-left py-2 px-2 font-semibold text-[10px] uppercase tracking-wider">Time</th>
                <th className="text-left py-2 px-2 font-semibold text-[10px] uppercase tracking-wider">Dir</th>
                <th className="text-right py-2 px-2 font-semibold text-[10px] uppercase tracking-wider">Size</th>
                <th className="text-right py-2 px-2 font-semibold text-[10px] uppercase tracking-wider">Result</th>
                <th className="text-right py-2 px-2 font-semibold text-[10px] uppercase tracking-wider">P&L</th>
                <th className="text-center py-2 px-2 font-semibold text-[10px] uppercase tracking-wider">Src</th>
              </tr>
            </thead>
            <tbody>
              {displayEntries.length === 0 ? (
                <tr>
                  <td colSpan={7} className="py-8 text-center text-sm text-[var(--text-tertiary)]">Execute a trade to see your log</td>
                </tr>
              ) : (
                displayEntries.map((e, i) => {
                  const p = pnl(e);
                  return (
                    <tr key={`${e.roundNumber}-${i}`} className={`border-b border-white/[0.04] hover:bg-white/[0.03] ${i === 0 ? "animate-slide-in-from-bottom" : ""}`}>
                      <td className="py-1.5 px-2 tabular-nums text-[var(--text-secondary)]">{e.roundNumber}</td>
                      <td className="py-1.5 px-2 tabular-nums text-[var(--text-tertiary)]">{formatTime(e.timestamp)}</td>
                      <td className="py-1.5 px-2">{e.condition === "over" ? "L" : "S"} {e.target}%</td>
                      <td className="py-1.5 px-2 text-right tabular-nums">{e.amount.toFixed(0)}</td>
                      <td className="py-1.5 px-2 text-right tabular-nums font-medium">{e.result.toFixed(2)}</td>
                      <td className={`py-1.5 px-2 text-right tabular-nums font-semibold ${p >= 0 ? "text-[#30d158]" : "text-[#ff453a]"}`}>{p >= 0 ? "+" : ""}{p.toFixed(2)}</td>
                      <td className="py-1.5 px-2 text-center"><SourceDot source={e.source} /></td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
    );
  }

  /* ─── Compact sidebar layout: row-based, no table ─── */
  return (
    <div className="flex flex-col min-h-0 flex-1 min-w-0 w-full" data-agent="trade-log">
      {displayEntries.length === 0 ? (
        <div className="flex flex-col items-center justify-center gap-1.5 py-5 text-[var(--text-tertiary)]">
          <svg className="w-6 h-6 opacity-25" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
          </svg>
          <span className="text-[10px]">Execute a trade to begin</span>
        </div>
      ) : (
        <div className="overflow-y-auto max-h-[160px] scrollbar-sidebar">
          {displayEntries.map((e, i) => {
            const p = pnl(e);
            const isNewest = i === 0;
            return (
              <div
                key={`${e.roundNumber}-${i}`}
                className={`flex items-center gap-1 px-1 py-[3px] rounded text-[10px] tabular-nums hover:bg-white/[0.04] transition-colors ${
                  i % 2 === 1 ? "bg-white/[0.015]" : ""
                } ${isNewest ? "animate-slide-in-from-bottom" : ""}`}
              >
                <SourceDot source={e.source} />
                <span className="text-[var(--text-tertiary)] shrink-0 w-[34px]">{formatTime(e.timestamp)}</span>
                <span className={`shrink-0 w-[14px] text-center font-bold text-[9px] ${
                  e.condition === "over"
                    ? "text-emerald-400"
                    : "text-red-400"
                }`}>
                  {e.condition === "over" ? "L" : "S"}
                </span>
                <span className="text-[var(--text-secondary)] shrink-0 w-[22px] text-right">{e.amount.toFixed(0)}</span>
                <span className="text-[var(--text-quaternary)] shrink-0">→</span>
                <span className="text-[var(--text-secondary)] font-medium shrink-0">{e.result.toFixed(1)}</span>
                <span className={`ml-auto font-semibold shrink-0 ${p >= 0 ? "text-[#30d158]" : "text-[#ff453a]"}`}>
                  {p >= 0 ? "+" : ""}{p.toFixed(1)}
                </span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

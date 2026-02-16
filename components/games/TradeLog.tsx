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
  compact?: boolean;
  fillHeight?: boolean;
}

function SourceDot({ source }: { source?: "manual" | "algo" | "api" }) {
  const s = source ?? "manual";
  const color =
    s === "api" ? "bg-[#0ea5e9]" : s === "algo" ? "bg-[#0ea5e9]" : "bg-emerald-400";
  return (
    <span className="inline-flex items-center justify-center" title={s}>
      <span className={`w-1.5 h-1.5 rounded-full ${color}`} aria-hidden />
    </span>
  );
}

export function TradeLog({ entries, maxRows = 20, compact = true, fillHeight = false }: TradeLogProps) {
  const displayEntries = entries.slice(-maxRows).reverse();

  const formatTime = (d?: Date) => {
    if (!d) return "\u2014";
    return d.toLocaleTimeString("en-US", { hour12: false, hour: "2-digit", minute: "2-digit" });
  };

  const pnl = (e: TradeLogEntry) => e.payout - e.amount;

  if (!compact) {
    return (
      <div className="overflow-hidden min-h-0 flex-1 flex flex-col min-w-0 w-full" data-agent="trade-log">
        <div className="overflow-x-auto overflow-y-auto max-h-[300px] min-h-0 flex-1 scrollbar-sidebar min-w-0">
          <table className="w-full text-xs border-collapse">
            <thead className="sticky top-0 bg-[var(--bg-card)]/98 border-b border-white/[0.08] z-10">
              <tr className="text-[var(--text-tertiary)]">
                <th className="text-left py-2 px-2 font-semibold text-[10px] uppercase tracking-wider">#</th>
                <th className="text-left py-2 px-2 font-semibold text-[10px] uppercase tracking-wider hidden sm:table-cell">Time</th>
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
                    <tr
                      key={`${e.roundNumber}-${i}`}
                      className={`border-b border-white/[0.04] hover:bg-white/[0.04] transition-colors trade-log-entry ${i === 0 ? "animate-slide-in-from-bottom" : ""}`}
                      style={{ animationDelay: i === 0 ? "0ms" : undefined }}
                    >
                      <td className="py-1.5 px-2 tabular-nums text-[var(--text-secondary)]">
                        <div className="flex items-center gap-1.5">
                          <div className={`w-0.5 h-4 rounded-full ${e.win ? "bg-[#30d158]" : "bg-[#ff453a]"}`} />
                          {e.roundNumber}
                        </div>
                      </td>
                      <td className="py-1.5 px-2 tabular-nums text-[var(--text-tertiary)] hidden sm:table-cell">{formatTime(e.timestamp)}</td>
                      <td className="py-1.5 px-2">
                        <span className={e.condition === "over" ? "text-emerald-400" : "text-rose-400"}>
                          {e.condition === "over" ? "L" : "S"}
                        </span>
                        {" "}{e.target}%
                      </td>
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

  return (
    <div className="flex flex-col min-h-0 flex-1 min-w-0 w-full" data-agent="trade-log">
      {displayEntries.length === 0 ? (
        <div className="flex flex-col items-center justify-center gap-2 py-6 text-[var(--text-tertiary)]">
          <svg className="w-8 h-8 opacity-25" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
          </svg>
          <span className="text-sm">Execute a trade to begin</span>
        </div>
      ) : (
        <div className={`overflow-y-auto scrollbar-sidebar ${fillHeight ? "flex-1 min-h-0" : "max-h-[200px]"}`}>
          {displayEntries.map((e, i) => {
            const p = pnl(e);
            const isNewest = i === 0;
            return (
              <div
                key={`${e.roundNumber}-${i}`}
                className={`trade-log-entry flex items-center gap-2 px-2 py-1.5 rounded-lg text-xs tabular-nums hover:bg-white/[0.05] hover:backdrop-blur-sm transition-all border-l-2 ${
                  e.win ? "border-l-[#30d158]/60" : "border-l-[#ff453a]/40"
                } ${
                  i % 2 === 1 ? "bg-white/[0.015]" : ""
                } ${isNewest ? "animate-slide-in-from-bottom" : ""}`}
              >
                <SourceDot source={e.source} />
                <span className="text-[var(--text-tertiary)] shrink-0 min-w-[32px] hidden sm:inline">{formatTime(e.timestamp)}</span>
                <span className={`shrink-0 min-w-[14px] text-center font-bold text-xs ${
                  e.condition === "over"
                    ? "text-emerald-400"
                    : "text-red-400"
                }`}>
                  {e.condition === "over" ? "L" : "S"}
                </span>
                <span className="text-[var(--text-secondary)] shrink-0 min-w-[24px] text-right">{e.amount.toFixed(0)}</span>
                <span className="text-[var(--text-quaternary)] shrink-0">&rarr;</span>
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

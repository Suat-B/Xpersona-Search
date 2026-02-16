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
  /** Compact mode for narrow sidebar — smaller table, abbreviated source */
  compact?: boolean;
}

function SourceDot({ source, compact }: { source?: "manual" | "algo" | "api"; compact?: boolean }) {
  const s = source ?? "manual";
  const color =
    s === "api" ? "bg-violet-400" : s === "algo" ? "bg-[#0ea5e9]" : "bg-emerald-400";
  return (
    <span
      className={`inline-flex items-center gap-1 ${s === "api" ? "text-violet-400" : s === "algo" ? "text-[#0ea5e9]" : "text-emerald-400/90"}`}
      title={s}
    >
      <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${color}`} aria-hidden />
      {!compact && <span className="capitalize text-[10px]">{s}</span>}
    </span>
  );
}

export function TradeLog({ entries, maxRows = 20, compact = true }: TradeLogProps) {
  const displayEntries = entries.slice(-maxRows).reverse();

  const formatTime = (d?: Date) => {
    if (!d) return "—";
    return d.toLocaleTimeString("en-US", { hour12: false, hour: "2-digit", minute: "2-digit", second: "2-digit" });
  };

  const dirThreshold = (e: TradeLogEntry) =>
    `${e.condition === "over" ? "L" : "S"} ${e.target.toFixed(0)}%`;
  const pnl = (e: TradeLogEntry) => e.payout - e.amount;

  return (
    <div className="overflow-hidden min-h-0 flex-1 flex flex-col min-w-0 w-full" data-agent="trade-log">
      <div className="overflow-x-auto overflow-y-auto max-h-[200px] min-h-0 flex-1 scrollbar-sidebar min-w-0">
        <table className="w-full table-fixed text-xs border-collapse" style={{ minWidth: 0 }}>
          <thead className="sticky top-0 bg-[var(--bg-card)]/98 border-b border-white/[0.08] z-10">
            <tr className="text-[var(--text-tertiary)]">
              <th className="text-left py-2 px-1.5 font-semibold text-[10px] uppercase tracking-wider w-[10%]">#</th>
              <th className="text-left py-2 px-1.5 font-semibold text-[10px] uppercase tracking-wider w-[22%]">Time</th>
              <th className="text-left py-2 px-1.5 font-semibold text-[10px] uppercase tracking-wider w-[16%]">L/S</th>
              <th className="text-right py-2 px-1.5 font-semibold text-[10px] uppercase tracking-wider w-[12%]">Size</th>
              <th className="text-right py-2 px-1.5 font-semibold text-[10px] uppercase tracking-wider w-[16%]">Res</th>
              <th className="text-right py-2 px-1.5 font-semibold text-[10px] uppercase tracking-wider w-[14%]">P&L</th>
              <th className="text-left py-2 px-1.5 font-semibold text-[10px] uppercase tracking-wider w-[10%]">Src</th>
            </tr>
          </thead>
          <tbody>
            {displayEntries.length === 0 ? (
              <tr>
                <td colSpan={7} className="py-12 text-center">
                  <div className="flex flex-col items-center gap-2 text-[var(--text-tertiary)]">
                    <svg className="w-10 h-10 opacity-40" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
                    </svg>
                    <span className="text-sm">Execute a trade to see your log</span>
                    <span className="text-xs text-[var(--text-quaternary)]">Time · Size · P&L · Source</span>
                  </div>
                </td>
              </tr>
            ) : (
              displayEntries.map((e, i) => {
                const p = pnl(e);
                const isNewest = i === 0;
                return (
                  <tr
                    key={`${e.roundNumber}-${i}`}
                    className={`border-b border-white/[0.06] hover:bg-white/[0.04] transition-colors ${
                      i % 2 === 1 ? "bg-white/[0.02]" : ""
                    } ${isNewest ? "animate-slide-in-from-bottom" : ""}`}
                  >
                    <td className="py-1.5 px-1.5 text-[var(--text-secondary)] tabular-nums font-medium truncate">{e.roundNumber}</td>
                    <td className="py-1.5 px-1.5 text-[var(--text-tertiary)] tabular-nums truncate">
                      {formatTime(e.timestamp)}
                    </td>
                    <td className="py-1.5 px-1.5 truncate">{dirThreshold(e)}</td>
                    <td className="py-1.5 px-1.5 text-right tabular-nums text-[var(--text-secondary)] font-medium truncate">
                      {e.amount.toFixed(0)}
                    </td>
                    <td className="py-1.5 px-1.5 text-right tabular-nums truncate">{e.result.toFixed(2)}</td>
                    <td
                      className={`py-1.5 px-1.5 text-right tabular-nums font-semibold truncate ${
                        p >= 0 ? "text-[#30d158]" : "text-[#ff453a]"
                      }`}
                    >
                      {p >= 0 ? "+" : ""}
                      {p.toFixed(2)}
                    </td>
                    <td className="py-1.5 px-1.5 truncate">
                      <SourceDot source={e.source} compact={compact} />
                    </td>
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

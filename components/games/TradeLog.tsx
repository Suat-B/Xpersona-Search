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
}

function SourceDot({ source }: { source?: "manual" | "algo" | "api" }) {
  const s = source ?? "manual";
  const color =
    s === "api" ? "bg-violet-400" : s === "algo" ? "bg-[#0ea5e9]" : "bg-emerald-400";
  return (
    <span
      className={`inline-flex items-center gap-1.5 ${s === "api" ? "text-violet-400" : s === "algo" ? "text-[#0ea5e9]" : "text-emerald-400/90"}`}
      title={s}
    >
      <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${color}`} aria-hidden />
      <span className="capitalize text-[10px]">{s}</span>
    </span>
  );
}

export function TradeLog({ entries, maxRows = 20 }: TradeLogProps) {
  const displayEntries = entries.slice(-maxRows).reverse();

  const formatTime = (d?: Date) => {
    if (!d) return "—";
    return d.toLocaleTimeString("en-US", { hour12: false, hour: "2-digit", minute: "2-digit", second: "2-digit" });
  };

  const dirThreshold = (e: TradeLogEntry) =>
    `${e.condition === "over" ? "L" : "S"} ${e.target.toFixed(0)}%`;
  const pnl = (e: TradeLogEntry) => e.payout - e.amount;

  return (
    <div
      className="rounded-xl border border-white/[0.08] bg-[var(--bg-card)] overflow-hidden min-h-0 flex-1 flex flex-col min-w-0"
      data-agent="trade-log"
    >
      <div className="overflow-x-auto overflow-y-auto max-h-[140px] min-h-0 flex-1 scrollbar-sidebar">
        <table className="w-full min-w-[320px] text-xs font-mono border-collapse">
          <thead className="sticky top-0 bg-[var(--bg-matte)]/98 border-b-2 border-white/10 z-10">
            <tr className="text-[var(--text-secondary)]">
              <th className="text-left py-2 px-2 font-semibold text-[10px] w-8">#</th>
              <th className="text-left py-2 px-2 font-semibold text-[10px] min-w-[52px]">Time</th>
              <th className="text-left py-2 px-2 font-semibold text-[10px] min-w-[56px]">L/S %</th>
              <th className="text-right py-2 px-2 font-semibold text-[10px] min-w-[44px]">Size</th>
              <th className="text-right py-2 px-2 font-semibold text-[10px] min-w-[48px]">Result</th>
              <th className="text-right py-2 px-2 font-semibold text-[10px] min-w-[56px]">P&L</th>
              <th className="text-left py-2 px-2 font-semibold text-[10px] min-w-[48px]">Src</th>
            </tr>
          </thead>
          <tbody>
            {displayEntries.length === 0 ? (
              <tr>
                <td colSpan={7} className="py-10 text-center">
                  <div className="flex flex-col items-center gap-2 text-[var(--text-tertiary)]">
                    <svg className="w-8 h-8 opacity-40" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
                    </svg>
                    <span className="text-[11px]">Execute a trade to see your log</span>
                    <span className="text-[10px] text-[var(--text-quaternary)]">Time · Size · P&L · Source</span>
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
                    className={`border-b border-white/5 hover:bg-white/[0.04] transition-colors ${
                      i % 2 === 1 ? "bg-white/[0.015]" : ""
                    } ${isNewest ? "animate-slide-in-from-bottom" : ""}`}
                  >
                    <td className="py-1.5 px-2 text-[var(--text-secondary)] tabular-nums">{e.roundNumber}</td>
                    <td className="py-1.5 px-2 text-[10px] text-[var(--text-tertiary)] tabular-nums truncate">
                      {formatTime(e.timestamp)}
                    </td>
                    <td className="py-1.5 px-2 text-[10px]">{dirThreshold(e)}</td>
                    <td className="py-1.5 px-2 text-right tabular-nums text-[var(--text-secondary)]">
                      {e.amount.toFixed(0)}
                    </td>
                    <td className="py-1.5 px-2 text-right tabular-nums">{e.result.toFixed(2)}</td>
                    <td
                      className={`py-1.5 px-2 text-right tabular-nums font-bold ${
                        p >= 0 ? "text-emerald-400" : "text-red-400"
                      }`}
                    >
                      {p >= 0 ? "+" : ""}
                      {p.toFixed(2)}
                    </td>
                    <td className="py-1.5 px-2">
                      <SourceDot source={e.source} />
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

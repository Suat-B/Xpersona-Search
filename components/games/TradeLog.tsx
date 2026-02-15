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

export function TradeLog({ entries, maxRows = 20 }: TradeLogProps) {
  const displayEntries = entries.slice(-maxRows).reverse();

  const formatTime = (d?: Date) => {
    if (!d) return "—";
    return d.toLocaleTimeString("en-US", { hour12: false, hour: "2-digit", minute: "2-digit", second: "2-digit" });
  };

  const direction = (c: "over" | "under") => (c === "over" ? "Long" : "Short");
  const pnl = (e: TradeLogEntry) => e.payout - e.amount;

  return (
    <div className="rounded-xl border border-white/[0.08] bg-[var(--bg-card)] overflow-hidden" data-agent="trade-log">
      <div className="overflow-x-auto overflow-y-auto max-h-[160px]">
        <table className="w-full text-xs font-mono border-collapse">
          <thead className="sticky top-0 bg-[var(--bg-matte)]/95 border-b border-white/10 z-10">
            <tr className="text-[var(--text-secondary)]">
              <th className="text-left py-2 px-2 font-medium">#</th>
              <th className="text-left py-2 px-2 font-medium">Time</th>
              <th className="text-left py-2 px-2 font-medium">Dir</th>
              <th className="text-left py-2 px-2 font-medium">Threshold</th>
              <th className="text-right py-2 px-2 font-medium">Size</th>
              <th className="text-right py-2 px-2 font-medium">Result</th>
              <th className="text-right py-2 px-2 font-medium">P&L</th>
              <th className="text-left py-2 px-2 font-medium">Source</th>
              <th className="text-right py-2 px-2 font-medium">Balance</th>
            </tr>
          </thead>
          <tbody>
            {displayEntries.length === 0 ? (
              <tr>
                <td colSpan={9} className="py-8 text-center text-[var(--text-tertiary)]">
                  No executions yet — execute to see trade log
                </td>
              </tr>
            ) : (
              displayEntries.map((e, i) => {
                const p = pnl(e);
                return (
                  <tr
                    key={`${e.roundNumber}-${i}`}
                    className="border-b border-white/5 hover:bg-white/[0.03] transition-colors"
                  >
                    <td className="py-1.5 px-2 text-[var(--text-secondary)]">{e.roundNumber}</td>
                    <td className="py-1.5 px-2 text-[var(--text-tertiary)]">{formatTime(e.timestamp)}</td>
                    <td className="py-1.5 px-2">{direction(e.condition)}</td>
                    <td className="py-1.5 px-2">{e.target.toFixed(2)}%</td>
                    <td className="py-1.5 px-2 text-right">{e.amount.toFixed(2)}</td>
                    <td className="py-1.5 px-2 text-right tabular-nums">{e.result.toFixed(2)}</td>
                    <td
                      className={`py-1.5 px-2 text-right tabular-nums font-medium ${
                        p >= 0 ? "text-emerald-400" : "text-red-400"
                      }`}
                    >
                      {p >= 0 ? "+" : ""}
                      {p.toFixed(2)}
                    </td>
                    <td className="py-1.5 px-2 text-[10px] text-[var(--text-tertiary)] capitalize">
                      {e.source ?? "Manual"}
                    </td>
                    <td className="py-1.5 px-2 text-right tabular-nums text-[var(--text-secondary)]">
                      {e.balance != null ? e.balance.toLocaleString(undefined, { maximumFractionDigits: 2 }) : "—"}
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

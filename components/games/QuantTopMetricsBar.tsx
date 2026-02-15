"use client";

interface QuantTopMetricsBarProps {
  nav: number;
  sessionPnl: number;
  sharpeRatio: number | null;
  winRate: number;
  maxDrawdownPct: number | null;
  rounds: number;
  kellyFraction: number | null;
}

const Metric = ({ label, value, positive }: { label: string; value: React.ReactNode; positive?: boolean }) => (
  <div className="flex items-center gap-1.5">
    <span className="text-[10px] text-[var(--text-tertiary)] uppercase tracking-wider">{label}</span>
    <span
      className={`text-xs font-mono font-semibold tabular-nums ${
        positive === true ? "text-emerald-400" : positive === false ? "text-red-400" : "text-[var(--text-primary)]"
      }`}
    >
      {value}
    </span>
  </div>
);

export function QuantTopMetricsBar({
  nav,
  sessionPnl,
  sharpeRatio,
  winRate,
  maxDrawdownPct,
  rounds,
  kellyFraction,
}: QuantTopMetricsBarProps) {
  return (
    <div className="flex items-center gap-6 px-4 py-2 border-b border-white/[0.08] bg-[var(--bg-card)]/60">
      <Metric label="NAV" value={nav.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} />
      <span className="w-px h-4 bg-white/10" />
      <Metric
        label="Session P&L"
        value={
          <span className={sessionPnl >= 0 ? "text-emerald-400" : "text-red-400"}>
            {sessionPnl >= 0 ? "+" : ""}
            {sessionPnl.toFixed(2)}
          </span>
        }
        positive={sessionPnl >= 0}
      />
      <span className="w-px h-4 bg-white/10" />
      <Metric label="Sharpe" value={sharpeRatio != null ? sharpeRatio.toFixed(2) : "—"} />
      <Metric label="Win Rate" value={`${winRate.toFixed(1)}%`} />
      <Metric
        label="Max DD"
        value={maxDrawdownPct != null ? `-${maxDrawdownPct.toFixed(1)}%` : "—"}
        positive={false}
      />
      <Metric label="Rounds" value={rounds} />
      <span className="w-px h-4 bg-white/10" />
      <Metric label="Edge" value="-3.0%" />
      <Metric label="Kelly" value={kellyFraction != null ? `${kellyFraction.toFixed(1)}%` : "—"} />
    </div>
  );
}

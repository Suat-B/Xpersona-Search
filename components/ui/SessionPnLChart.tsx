"use client";

export type PnLPoint = { round: number; pnl: number };

const CHART_W = 400;
const CHART_H = 100;
const PAD = 4;

export function SessionPnLChart({
  series,
  totalPnl,
  rounds,
  onReset,
}: {
  series: PnLPoint[];
  totalPnl: number;
  rounds: number;
  onReset: () => void;
}) {
  if (rounds === 0) {
    return (
      <div className="rounded-2xl border border-white/10 bg-gradient-to-br from-[var(--bg-card)] to-[var(--bg-card)]/80 p-4 shadow-md">
        <div className="mb-2 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <svg className="w-3.5 h-3.5 text-[var(--accent-heart)]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 12l3-3 3 3 4-4M8 21l4-4 4 4M3 4h18M4 4h16v12a1 1 0 01-1 1H5a1 1 0 01-1-1V4z" />
            </svg>
            <span className="text-xs font-medium text-[var(--text-secondary)] uppercase tracking-wider">Session PnL</span>
          </div>
          <button
            type="button"
            onClick={onReset}
            className="text-[10px] text-[var(--text-secondary)] hover:text-[var(--accent-heart)] transition-colors px-2 py-1 rounded-lg hover:bg-white/5"
          >
            Reset
          </button>
        </div>
        <div className="flex h-[100px] flex-col items-center justify-center text-xs text-[var(--text-secondary)] gap-2">
          <svg className="w-8 h-8 opacity-30" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
          </svg>
          <span>No rounds yet</span>
        </div>
      </div>
    );
  }

  const points = series;
  const allPnl = points.map((p) => p.pnl);
  const minPnl = Math.min(0, ...allPnl);
  const maxPnl = Math.max(0, ...allPnl);
  const range = maxPnl - minPnl || 1;
  const scaleY = (CHART_H - PAD * 2) / range;
  const zeroY = maxPnl <= 0 ? PAD : PAD + (maxPnl - 0) * scaleY;

  const pathD = points
    .map((p, i) => {
      const x = PAD + (i / Math.max(1, points.length - 1)) * (CHART_W - PAD * 2);
      const y = maxPnl <= 0 ? CHART_H - PAD : PAD + (maxPnl - p.pnl) * scaleY;
      return `${i === 0 ? "M" : "L"} ${x} ${y}`;
    })
    .join(" ");

  const fillD =
    pathD +
    ` L ${PAD + ((points.length - 1) / Math.max(1, points.length - 1)) * (CHART_W - PAD * 2)} ${zeroY} L ${PAD} ${zeroY} Z`;

  return (
    <div className="rounded-2xl border border-white/10 bg-gradient-to-br from-[var(--bg-card)] to-[var(--bg-card)]/80 p-4 shadow-md">
      <div className="mb-2 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <svg className="w-3.5 h-3.5 text-[var(--accent-heart)]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 12l3-3 3 3 4-4M8 21l4-4 4 4M3 4h18M4 4h16v12a1 1 0 01-1 1H5a1 1 0 01-1-1V4z" />
          </svg>
          <span className="text-xs font-medium text-[var(--text-secondary)] uppercase tracking-wider">Session PnL</span>
        </div>
        <div className="flex items-center gap-2">
          <span
            className={`text-sm font-bold font-mono ${totalPnl >= 0 ? "text-emerald-400" : "text-red-400"}`}
          >
            {totalPnl >= 0 ? "+" : ""}
            {totalPnl}
          </span>
          <span className="text-[10px] text-[var(--text-secondary)] bg-[var(--bg-matte)] px-2 py-0.5 rounded">
            {rounds}
          </span>
          <button
            type="button"
            onClick={onReset}
            className="text-[10px] text-[var(--text-secondary)] hover:text-[var(--accent-heart)] transition-colors px-2 py-0.5 rounded hover:bg-white/5"
          >
            Reset
          </button>
        </div>
      </div>
      <svg
        viewBox={`0 0 ${CHART_W} ${CHART_H}`}
        className="w-full max-w-full"
        style={{ height: CHART_H }}
        preserveAspectRatio="none"
        aria-hidden
      >
        <defs>
          <linearGradient id="pnl-fill-up" x1="0" y1="1" x2="0" y2="0">
            <stop offset="0%" stopColor="#10b981" stopOpacity={0} />
            <stop offset="50%" stopColor="#10b981" stopOpacity={0.2} />
            <stop offset="100%" stopColor="#10b981" stopOpacity={0.4} />
          </linearGradient>
          <linearGradient id="pnl-fill-down" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#ef4444" stopOpacity={0.4} />
            <stop offset="50%" stopColor="#ef4444" stopOpacity={0.2} />
            <stop offset="100%" stopColor="#ef4444" stopOpacity={0} />
          </linearGradient>
          <linearGradient id="pnl-fill-neutral" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="var(--accent-heart)" stopOpacity={0.3} />
            <stop offset="100%" stopColor="var(--accent-heart)" stopOpacity={0} />
          </linearGradient>
        </defs>
        {zeroY > PAD && zeroY < CHART_H - PAD && (
          <line
            x1={PAD}
            y1={zeroY}
            x2={CHART_W - PAD}
            y2={zeroY}
            stroke="var(--text-secondary)"
            strokeOpacity={0.3}
            strokeDasharray="4 2"
          />
        )}
        <path
          d={fillD}
          fill={
            totalPnl > 0
              ? "url(#pnl-fill-up)"
              : totalPnl < 0
                ? "url(#pnl-fill-down)"
                : "url(#pnl-fill-neutral)"
          }
        />
        <path
          d={pathD}
          fill="none"
          stroke={totalPnl >= 0 ? "#10b981" : "#ef4444"}
          strokeWidth={2.5}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        {/* Last point dot */}
        {points.length > 0 && (
          <circle
            cx={PAD + ((points.length - 1) / Math.max(1, points.length - 1)) * (CHART_W - PAD * 2)}
            cy={maxPnl <= 0 ? CHART_H - PAD : PAD + (maxPnl - points[points.length - 1].pnl) * scaleY}
            r={3}
            fill={points[points.length - 1].pnl >= 0 ? "#10b981" : "#ef4444"}
            stroke="var(--bg-card)"
            strokeWidth={2}
          />
        )}
      </svg>
    </div>
  );
}

export default SessionPnLChart;

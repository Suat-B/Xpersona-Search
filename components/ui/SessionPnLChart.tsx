"use client";

export type PnLPoint = { round: number; pnl: number };

const CHART_W = 400;
const CHART_H = 120;
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
      <div className="rounded-xl border border-white/10 bg-white/[0.02] p-4">
        <div className="mb-2 flex items-center justify-between">
          <span className="text-sm font-medium text-[var(--text-secondary)]">Session PnL</span>
          <button
            type="button"
            onClick={onReset}
            className="text-xs text-[var(--text-secondary)] hover:text-[var(--accent-heart)]"
          >
            Reset
          </button>
        </div>
        <div className="flex h-[120px] items-center justify-center text-sm text-[var(--text-secondary)]">
          No rounds yet — play to see your PnL chart
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
    <div className="rounded-xl border border-white/10 bg-white/[0.02] p-4">
      <div className="mb-2 flex items-center justify-between">
        <span className="text-sm font-medium text-[var(--text-secondary)]">Session PnL</span>
        <div className="flex items-center gap-3">
          <span
            className={`text-sm font-semibold ${totalPnl >= 0 ? "text-emerald-400" : "text-red-400"}`}
          >
            {totalPnl >= 0 ? "+" : ""}
            {totalPnl} credits
          </span>
          <span className="text-xs text-[var(--text-secondary)]">{rounds} rounds</span>
          <button
            type="button"
            onClick={onReset}
            className="text-xs text-[var(--text-secondary)] hover:text-[var(--accent-heart)]"
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
          <linearGradient id="pnl-fill-session" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="var(--accent-heart)" stopOpacity={0.2} />
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
        <path d={fillD} fill="url(#pnl-fill-session)" />
        <path
          d={pathD}
          fill="none"
          stroke="var(--accent-heart)"
          strokeWidth={2}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    </div>
  );
}

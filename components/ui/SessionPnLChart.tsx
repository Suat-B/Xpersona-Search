"use client";

import { useId } from "react";

export type PnLPoint = { round: number; pnl: number };

const PAD = 4;

export function SessionPnLChart({
  series,
  totalPnl,
  rounds,
  onReset,
  layout = "default",
}: {
  series: PnLPoint[];
  totalPnl: number;
  rounds: number;
  onReset: () => void;
  layout?: "default" | "large" | "mini";
}) {
  const uid = useId().replace(/[^a-z0-9-]/gi, "") || "pnl";
  const isLarge = layout === "large";
  const isMini = layout === "mini";
  const CHART_W = isLarge ? 640 : isMini ? 280 : 400;
  const CHART_H = isLarge ? 180 : isMini ? 65 : 100;
  if (rounds === 0) {
    return (
      <div className={`rounded-2xl border border-white/10 bg-gradient-to-br from-[var(--bg-card)] to-[var(--bg-card)]/80 shadow-md ${isMini ? "p-2" : "p-4"}`}>
        <div className="mb-2 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <svg className="w-3.5 h-3.5 text-[var(--accent-heart)] animate-pulse" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 12l3-3 3 3 4-4M8 21l4-4 4 4M3 4h18M4 4h16v12a1 1 0 01-1 1H5a1 1 0 01-1-1V4z" />
            </svg>
            <span className="text-xs font-medium text-[var(--text-secondary)] uppercase tracking-wider">Equity Curve</span>
          </div>
          <button
            type="button"
            onClick={onReset}
            className="text-[10px] text-[var(--text-secondary)] hover:text-[var(--accent-heart)] transition-colors px-2 py-1 rounded-lg hover:bg-white/5"
          >
            Reset
          </button>
        </div>
        <div className={`flex flex-col items-center justify-center text-xs text-[var(--text-secondary)] gap-2 ${isMini ? "h-[60px]" : isLarge ? "h-[140px]" : "h-[100px]"}`}>
          <svg className="w-8 h-8 opacity-30 animate-pulse" style={{ animationDuration: "2s" }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
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

  const lastX = PAD + ((points.length - 1) / Math.max(1, points.length - 1)) * (CHART_W - PAD * 2);
  const lastY = maxPnl <= 0 ? CHART_H - PAD : PAD + (maxPnl - (points[points.length - 1]?.pnl ?? 0)) * scaleY;
  const isUp = (points[points.length - 1]?.pnl ?? 0) >= 0;
  const strokeColor = totalPnl >= 0 ? "#10b981" : "#f59e0b";

  const strokeW = isLarge ? 3.5 : isMini ? 2 : 2.5;
  const dotR = isLarge ? 5 : isMini ? 2.5 : 3;
  const pingR = isLarge ? 10 : isMini ? 5 : 6;
  const glowStdDev = isLarge ? 2.5 : 1.5;

  return (
    <div className={`rounded-2xl border border-white/10 bg-gradient-to-br from-[var(--bg-card)] to-[var(--bg-card)]/80 shadow-lg overflow-hidden transition-all duration-300 hover:border-white/20 hover:shadow-xl ${isMini ? "p-2" : "p-4"}`}>
      <style>{`
        @keyframes pnl-dot-pulse-${uid} {
          0%, 100% { transform: scale(1); opacity: 1; }
          50% { transform: scale(1.4); opacity: 0.92; }
        }
        .pnl-dot-${uid} {
          transform-origin: center;
          animation: pnl-dot-pulse-${uid} 1.6s ease-in-out infinite;
        }
      `}</style>
      <div className="mb-2 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <svg className="w-3.5 h-3.5 text-[var(--accent-heart)]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 12l3-3 3 3 4-4M8 21l4-4 4 4M3 4h18M4 4h16v12a1 1 0 01-1 1H5a1 1 0 01-1-1V4z" />
          </svg>
          <span className="text-xs font-medium text-[var(--text-secondary)] uppercase tracking-wider">Equity Curve</span>
          {!isMini && (
            <span className="inline-flex items-center gap-1 rounded bg-white/5 px-1.5 py-0.5">
              <span className="w-1 h-1 rounded-full bg-emerald-400 animate-pulse" style={{ animationDuration: "1.2s" }} />
              <span className="text-[9px] text-[var(--text-tertiary)] font-mono">LIVE</span>
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          <span
            className={`text-sm font-bold font-mono transition-colors duration-300 ${totalPnl >= 0 ? "text-emerald-400 drop-shadow-[0_0_8px_rgba(16,185,129,0.35)]" : "text-red-400 drop-shadow-[0_0_8px_rgba(239,68,68,0.35)]"}`}
          >
            {totalPnl >= 0 ? "+" : ""}
            {totalPnl}
          </span>
          <span className="text-[10px] text-[var(--text-secondary)] bg-[var(--bg-matte)] px-2 py-0.5 rounded tabular-nums">
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
          <linearGradient id={`pnl-fill-up-${uid}`} x1="0" y1="1" x2="0" y2="0">
            <stop offset="0%" stopColor="#10b981" stopOpacity={0} />
            <stop offset="40%" stopColor="#10b981" stopOpacity={0.2} />
            <stop offset="100%" stopColor="#10b981" stopOpacity={0.55} />
          </linearGradient>
          <linearGradient id={`pnl-fill-down-${uid}`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#f59e0b" stopOpacity={0.55} />
            <stop offset="60%" stopColor="#f59e0b" stopOpacity={0.25} />
            <stop offset="100%" stopColor="#f59e0b" stopOpacity={0} />
          </linearGradient>
          <linearGradient id={`pnl-fill-neutral-${uid}`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="var(--accent-heart)" stopOpacity={0.3} />
            <stop offset="100%" stopColor="var(--accent-heart)" stopOpacity={0} />
          </linearGradient>
          <filter id={`pnl-glow-${uid}`} x="-40%" y="-40%" width="180%" height="180%">
            <feGaussianBlur in="SourceGraphic" stdDeviation={glowStdDev} result="blur" />
            <feMerge>
              <feMergeNode in="blur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
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
            className="animate-pulse"
            style={{ animationDuration: "3s" }}
          />
        )}
        <path
          d={fillD}
          fill={
            totalPnl > 0
              ? `url(#pnl-fill-up-${uid})`
              : totalPnl < 0
                ? `url(#pnl-fill-down-${uid})`
                : `url(#pnl-fill-neutral-${uid})`
          }
          className="transition-opacity duration-500"
        />
        <g filter={`url(#pnl-glow-${uid})`}>
          <path
            d={pathD}
            fill="none"
            stroke={strokeColor}
            strokeWidth={strokeW}
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </g>
        {points.length > 0 && (
          <g filter={`url(#pnl-glow-${uid})`}>
            <circle
              cx={lastX}
              cy={lastY}
              r={dotR}
              fill={isUp ? "#10b981" : "#f59e0b"}
              stroke="rgba(10,10,15,0.9)"
              strokeWidth={isLarge ? 2.5 : 1.5}
              className={`pnl-dot-${uid}`}
            />
            <circle
              cx={lastX}
              cy={lastY}
              r={pingR}
              fill="none"
              stroke={isUp ? "#10b981" : "#f59e0b"}
              strokeWidth={isLarge ? 2 : 1.5}
              strokeOpacity={0.35}
              className="animate-ping"
              style={{ animationDuration: "2s", animationIterationCount: "infinite" }}
            />
          </g>
        )}
      </svg>
    </div>
  );
}

export default SessionPnLChart;

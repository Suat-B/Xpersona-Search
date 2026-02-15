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
    const emptyW = isLarge ? 420 : isMini ? 120 : 160;
    const emptyH = isLarge ? 120 : isMini ? 40 : 60;
    // Gentle sine-wave placeholder hint (subtle, quant-aesthetic)
    const samplePoints = 24;
    const pathD = Array.from({ length: samplePoints }, (_, i) => {
      const x = (i / (samplePoints - 1)) * emptyW;
      const y = emptyH / 2 + Math.sin((i / samplePoints) * Math.PI * 2) * (emptyH * 0.15);
      return `${i === 0 ? "M" : "L"} ${x} ${y}`;
    }).join(" ");
    return (
      <div className={`rounded-2xl border border-white/10 bg-gradient-to-br from-[var(--bg-card)] to-[var(--bg-card)]/80 shadow-md overflow-hidden ${isMini ? "p-2" : "p-4"}`}>
        <div className="mb-3 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-1 h-5 rounded-full bg-[#0ea5e9]" />
            <span className="text-sm font-semibold text-[var(--text-primary)]">Equity Curve</span>
          </div>
          <button
            type="button"
            onClick={onReset}
            className="text-xs text-[var(--text-tertiary)] hover:text-[#0ea5e9] transition-colors px-2.5 py-1.5 rounded-lg hover:bg-white/[0.06]"
          >
            Reset
          </button>
        </div>
        <div className={`relative flex flex-col items-center justify-center text-[var(--text-secondary)] gap-3 ${isMini ? "h-[60px]" : isLarge ? "h-[140px]" : "h-[100px]"}`}>
          {/* Subtle animated placeholder curve — quant-style hint */}
          <svg className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[85%] h-[60%] opacity-[0.15]" viewBox={`0 0 ${emptyW} ${emptyH}`} preserveAspectRatio="xMidYMid slice" aria-hidden>
            <defs>
              <linearGradient id="empty-curve-grad" x1="0%" y1="0%" x2="100%" y2="0%">
                <stop offset="0%" stopColor="#0ea5e9" stopOpacity={0.4} />
                <stop offset="50%" stopColor="#0ea5e9" stopOpacity={0.7} />
                <stop offset="100%" stopColor="#0ea5e9" stopOpacity={0.4} />
              </linearGradient>
            </defs>
            <path d={pathD} fill="none" stroke="url(#empty-curve-grad)" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="animate-pulse" style={{ animationDuration: "3.5s" }} />
          </svg>
          <svg className="opacity-25 w-full max-w-[240px]" viewBox={`0 0 ${emptyW} ${emptyH}`} fill="none" aria-hidden>
            <line x1={0} y1={emptyH / 2} x2={emptyW} y2={emptyH / 2} stroke="currentColor" strokeWidth={1.5} strokeDasharray="6 4" strokeLinecap="round" />
          </svg>
          <div className="relative z-10 text-center space-y-1">
            <span className="block text-xs text-[var(--text-tertiary)]">
              Execute trades to see your equity curve
            </span>
            <span className="block text-[10px] text-[var(--text-quaternary)]">
              P&L over time · Sharpe · Drawdown
            </span>
          </div>
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

  const strokeW = isLarge ? 4 : isMini ? 2.5 : 3;
  const dotR = isLarge ? 5 : isMini ? 2.5 : 3;
  const pingR = isLarge ? 10 : isMini ? 5 : 6;
  const glowStdDev = isLarge ? 2.5 : 1.5;

  return (
    <div className={`rounded-2xl border border-white/10 bg-gradient-to-br from-[var(--bg-card)] to-[var(--bg-card)]/80 shadow-lg overflow-hidden min-w-0 min-h-0 transition-all duration-300 hover:border-white/20 hover:shadow-xl ${isMini ? "p-2" : "p-4"}`}>
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
      <div className="mb-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="w-1 h-5 rounded-full bg-[#0ea5e9]" />
          <span className="text-sm font-semibold text-[var(--text-primary)]">Equity Curve</span>
          {!isMini && (
            <span className="inline-flex items-center gap-1.5 rounded-lg bg-[#30d158]/10 px-2 py-0.5 border border-[#30d158]/20">
              <span className="w-1.5 h-1.5 rounded-full bg-[#30d158] animate-pulse" style={{ animationDuration: "1.2s" }} />
              <span className="text-[10px] font-medium text-[#30d158]">LIVE</span>
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          <span
            className={`text-lg font-semibold tabular-nums transition-colors duration-300 ${
              totalPnl >= 0 ? "text-[#30d158]" : "text-[#ff453a]"
            }`}
          >
            {totalPnl >= 0 ? "+" : ""}
            {totalPnl}
          </span>
          <span className="text-xs text-[var(--text-tertiary)] bg-white/[0.04] px-2 py-1 rounded-lg tabular-nums">
            {rounds} rounds
          </span>
          <button
            type="button"
            onClick={onReset}
            className="text-xs text-[var(--text-tertiary)] hover:text-[#0ea5e9] transition-colors px-2.5 py-1.5 rounded-lg hover:bg-white/[0.06]"
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
          <pattern id={`pnl-grid-${uid}`} width="32" height="32" patternUnits="userSpaceOnUse">
            <path d="M 32 0 L 0 0 0 32" fill="none" stroke="rgba(255,255,255,0.04)" strokeWidth="0.5" />
          </pattern>
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
        <rect width={CHART_W} height={CHART_H} fill={`url(#pnl-grid-${uid})`} />
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

"use client";

import { useMemo } from "react";
import type { PnLPoint } from "./useSessionPnL";

const NUM_PATHS = 25;
const NUM_STEPS = 40;
const PAD = 8;
const MIN_VOL = 0.5;

/** Seeded PRNG (mulberry32) for deterministic paths */
function createSeededRng(seed: number) {
  return () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Box-Muller for normal(0,1) from uniform(0,1) */
function normalFromUniform(u1: number, u2: number): number {
  const r = Math.sqrt(-2 * Math.log(Math.max(1e-10, u1)));
  return r * Math.cos(2 * Math.PI * u2);
}

/** Distinct colors for each path — teal, cyan, blue, purple, violet, pink, amber, green */
const PATH_COLORS = [
  "#64d2ff", "#0ea5e9", "#0a84ff", "#5e5ce6", "#bf5af2",
  "#ff2d55", "#ff9f0a", "#30d158", "#10b981", "#14b8a6",
  "#06b6d4", "#3b82f6", "#8b5cf6", "#a855f7", "#ec4899",
  "#f43f5e", "#fb923c", "#22c55e", "#84cc16", "#eab308",
  "#f97316", "#6366f1", "#a78bfa", "#f472b6", "#fb7185",
];

interface MonteCarloShadowProps {
  series: PnLPoint[];
  totalPnl: number;
  rounds: number;
}

function percentile(arr: number[], p: number): number {
  const sorted = [...arr].sort((a, b) => a - b);
  const idx = (p / 100) * (sorted.length - 1);
  const lo = Math.floor(idx);
  const hi = Math.ceil(idx);
  if (lo === hi) return sorted[lo] ?? 0;
  const w = idx - lo;
  return (sorted[lo] ?? 0) * (1 - w) + (sorted[hi] ?? 0) * w;
}

export function MonteCarloShadow({ series, totalPnl, rounds }: MonteCarloShadowProps) {
  const { pathData, viewW, viewH, stats, zeroY, isEmpty } = useMemo(() => {
    if (series.length < 5) {
      return {
        pathData: [] as { d: string; color: string }[],
        viewW: 400,
        viewH: 120,
        stats: null,
        zeroY: null as number | null,
        isEmpty: true,
      };
    }

    const returns = series.map((p, i) =>
      i === 0 ? p.pnl : p.pnl - (series[i - 1]?.pnl ?? 0)
    );
    const mu = returns.reduce((a, b) => a + b, 0) / returns.length;
    const variance =
      returns.length > 1
        ? returns.reduce((acc, r) => acc + (r - mu) ** 2, 0) / (returns.length - 1)
        : 0;
    const sigma = Math.sqrt(Math.max(variance, 0)) || MIN_VOL;

    const seed = (series.length * 31 + Math.round(totalPnl * 100)) | 0;
    const rng = createSeededRng(seed);

    const allPaths: number[][] = [];

    for (let p = 0; p < NUM_PATHS; p++) {
      const path: number[] = [totalPnl];
      for (let t = 0; t < NUM_STEPS - 1; t++) {
        const u1 = rng();
        const u2 = rng();
        const z = normalFromUniform(u1, u2);
        const next = path[path.length - 1]! + mu + sigma * z;
        path.push(next);
      }
      allPaths.push(path);
    }

    const finalPnLs = allPaths.map((p) => p[p.length - 1] ?? 0);
    const meanFinal = finalPnLs.reduce((a, b) => a + b, 0) / finalPnLs.length;
    const winProb = (finalPnLs.filter((v) => v > 0).length / finalPnLs.length) * 100;
    const p10 = percentile(finalPnLs, 10);
    const p50 = percentile(finalPnLs, 50);
    const p90 = percentile(finalPnLs, 90);

    const allVals = allPaths.flat();
    const minVal = Math.min(...allVals);
    const maxVal = Math.max(...allVals);
    const range = Math.max(maxVal - minVal, 1);
    const viewW = 400;
    const viewH = 120;
    const padH = viewH - PAD * 2;
    const padW = viewW - PAD * 2;

    const zeroInRange = 0 >= minVal && 0 <= maxVal;
    const zeroY = zeroInRange ? PAD + padH - ((0 - minVal) / range) * padH : null;

    const pathData = allPaths.map((path, i) => {
      const points = path.map((val, j) => {
        const x = PAD + (j / (NUM_STEPS - 1)) * padW;
        const y = PAD + padH - ((val - minVal) / range) * padH;
        return `${x},${y}`;
      });
      return {
        d: `M ${points.join(" L ")}`,
        color: PATH_COLORS[i % PATH_COLORS.length],
      };
    });

    return {
      pathData,
      viewW,
      viewH,
      stats: { meanFinal, winProb, p10, p50, p90, evPerRound: mu, sigma },
      zeroY,
      isEmpty: false,
    };
  }, [series, totalPnl, rounds]);

  if (isEmpty) {
    return (
      <div className="h-full min-h-[100px] w-full rounded-xl border border-white/[0.06] bg-[var(--bg-card)]/50 flex flex-col items-center justify-center gap-2">
        <div className="w-full max-w-[200px] h-12 opacity-20">
          <svg viewBox="0 0 200 48" className="w-full h-full" preserveAspectRatio="none">
            <path
              d="M 0 24 Q 50 20, 100 24 T 200 24"
              fill="none"
              stroke="#64d2ff"
              strokeWidth="1"
              strokeLinecap="round"
            />
          </svg>
        </div>
        <span className="text-[10px] text-[var(--text-tertiary)] uppercase tracking-wider">
          Trade more to see possible paths
        </span>
      </div>
    );
  }

  return (
    <div className="h-full min-h-[100px] w-full rounded-xl border border-white/[0.06] bg-[var(--bg-card)]/50 overflow-hidden relative flex flex-col">
      <div className="flex-shrink-0 flex items-center justify-between px-2.5 py-1.5 border-b border-white/[0.06]">
        <span className="text-[9px] text-[var(--text-quaternary)] uppercase tracking-widest">
          Monte Carlo
        </span>
        {stats && (
          <div className="flex items-center gap-x-3 gap-y-1 flex-wrap justify-end text-[9px] font-mono tabular-nums">
            <span title="Mean projected P&L after 40 rounds">
              <span className="text-[var(--text-quaternary)]">E[P&L]:</span>{" "}
              <span className={stats.meanFinal >= 0 ? "text-[#30d158]" : "text-[#f59e0b]"}>
                {stats.meanFinal >= 0 ? "+" : ""}
                {stats.meanFinal.toFixed(1)}
              </span>
            </span>
            <span title="Probability of ending in profit">
              <span className="text-[var(--text-quaternary)]">P(win):</span>{" "}
              <span className="text-[var(--text-primary)]">
                {stats.winProb.toFixed(0)}%
              </span>
            </span>
            <span title="EV per round (μ)">
              <span className="text-[var(--text-quaternary)]">μ:</span>{" "}
              <span className={stats.evPerRound >= 0 ? "text-[#30d158]" : "text-[#f59e0b]"}>
                {stats.evPerRound >= 0 ? "+" : ""}
                {stats.evPerRound.toFixed(2)}
              </span>
            </span>
            <span title="10th / 50th / 90th percentile">
              <span className="text-[var(--text-quaternary)]">P10/50/90:</span>{" "}
              <span className="text-[var(--text-secondary)]">
                {stats.p10.toFixed(0)} / {stats.p50.toFixed(0)} / {stats.p90.toFixed(0)}
              </span>
            </span>
          </div>
        )}
      </div>
      <div className="flex-1 min-h-0 relative">
        <svg
          viewBox={`0 0 ${viewW} ${viewH}`}
          className="w-full h-full"
          preserveAspectRatio="none"
          aria-label="Monte Carlo simulated future paths"
        >
          <defs>
            <pattern
              id="mc-grid"
              width={20}
              height={20}
              patternUnits="userSpaceOnUse"
            >
              <path
                d="M 20 0 L 0 0 0 20"
                fill="none"
                stroke="rgba(255,255,255,0.04)"
                strokeWidth="0.5"
              />
            </pattern>
          </defs>
          <rect width={viewW} height={viewH} fill="url(#mc-grid)" />
          {zeroY != null && (
            <line
              x1={PAD}
              y1={zeroY}
              x2={viewW - PAD}
              y2={zeroY}
              stroke="rgba(255,255,255,0.2)"
              strokeWidth="1"
              strokeDasharray="4 3"
              strokeLinecap="round"
            />
          )}
          {pathData.map(({ d, color }, i) => (
            <path
              key={i}
              d={d}
              fill="none"
              stroke={color}
              strokeWidth="1"
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeOpacity={0.12 + (i / pathData.length) * 0.14}
              className="transition-opacity duration-300"
            />
          ))}
        </svg>
      </div>
    </div>
  );
}

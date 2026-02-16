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

interface MonteCarloShadowProps {
  series: PnLPoint[];
  totalPnl: number;
  rounds: number;
}

export function MonteCarloShadow({ series, totalPnl, rounds }: MonteCarloShadowProps) {
  const { paths, viewW, viewH, strokeColor, isEmpty } = useMemo(() => {
    if (series.length < 5) {
      return { paths: [] as string[], viewW: 400, viewH: 120, strokeColor: "#64d2ff", isEmpty: true };
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

    const allVals = allPaths.flat();
    const minVal = Math.min(...allVals);
    const maxVal = Math.max(...allVals);
    const range = Math.max(maxVal - minVal, 1);
    const viewW = 400;
    const viewH = 120;
    const padH = viewH - PAD * 2;
    const padW = viewW - PAD * 2;

    const pathsAsD: string[] = allPaths.map((path) => {
      const points = path.map((val, i) => {
        const x = PAD + (i / (NUM_STEPS - 1)) * padW;
        const y = PAD + padH - ((val - minVal) / range) * padH;
        return `${x},${y}`;
      });
      return `M ${points.join(" L ")}`;
    });

    const strokeColor = totalPnl >= 0 ? "#30d158" : "#f59e0b";

    return {
      paths: pathsAsD,
      viewW,
      viewH,
      strokeColor,
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
    <div className="h-full min-h-[100px] w-full rounded-xl border border-white/[0.06] bg-[var(--bg-card)]/50 overflow-hidden relative">
      <span
        className="absolute top-1.5 right-2 text-[9px] text-[var(--text-quaternary)] uppercase tracking-widest z-10"
        aria-hidden
      >
        Monte Carlo
      </span>
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
        {paths.map((d, i) => (
          <path
            key={i}
            d={d}
            fill="none"
            stroke={strokeColor}
            strokeWidth="1"
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeOpacity={0.06 + (i / paths.length) * 0.12}
            className="transition-opacity duration-300"
          />
        ))}
      </svg>
    </div>
  );
}

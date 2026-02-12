"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { cn } from "@/lib/utils";

const HEIGHT = 48;
const POINTS = 32;

export function MiniPnLSparkline() {
  const [points, setPoints] = useState<number[]>([]);
  const [totalPnl, setTotalPnl] = useState(0);

  const refresh = useCallback(async () => {
    try {
      const res = await fetch("/api/me/bets?gameType=dice&limit=200", { credentials: "include" });
      const data = await res.json().catch(() => ({}));
      if (!data.success || !Array.isArray(data.data?.bets)) return;
      const bets = data.data.bets as { amount: number; payout: number }[];
      const chronological = [...bets].reverse();
      const pnls = chronological.map((b) => Number(b.payout) - Number(b.amount));
      const cumulative: number[] = [];
      let sum = 0;
      for (const p of pnls) {
        sum += p;
        cumulative.push(sum);
      }
      const lastN = cumulative.slice(-POINTS);
      const min = Math.min(0, ...lastN);
      const max = Math.max(0, ...lastN);
      const range = max - min || 1;
      const normalized = lastN.map((v) => (v - min) / range);
      setPoints(normalized);
      setTotalPnl(sum);
    } catch {
      setPoints([]);
      setTotalPnl(0);
    }
  }, []);

  useEffect(() => {
    refresh();
    window.addEventListener("balance-updated", refresh);
    return () => window.removeEventListener("balance-updated", refresh);
  }, [refresh]);

  if (points.length < 2) {
    return (
      <div className="agent-card p-5 h-[140px] flex flex-col justify-between">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-white/[0.04] border border-white/[0.08] text-[var(--text-tertiary)]"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M7 12l3-3 3 3 4-4M8 21l4-4 4 4M3 4h18M4 4h16v12a1 1 0 01-1 1H5a1 1 0 01-1-1V4z" />
              </svg>
            </div>
            <span className="text-xs font-semibold text-[var(--text-tertiary)] uppercase tracking-wider"
            >Neural PnL</span>
          </div>
          
          <Link href="/games/dice" className="text-xs text-[#ff2d55] hover:underline"
          >
            Start →
          </Link>
        </div>
        
        <div className="flex-1 flex items-center justify-center">
          <div className="text-center">
            <div className="w-12 h-12 mx-auto mb-2 rounded-full bg-white/[0.03] flex items-center justify-center"
            >
              <svg className="w-6 h-6 text-[var(--text-quaternary)]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
              </svg>
            </div>
            <p className="text-xs text-[var(--text-quaternary)]">No data yet</p>
          </div>
        </div>
      </div>
    );
  }

  const pathD = points
    .map((y, i) => {
      const x = (i / (points.length - 1)) * 100;
      const py = HEIGHT - y * (HEIGHT - 4) - 2;
      return `${i === 0 ? "M" : "L"} ${x} ${py}`;
    })
    .join(" ");

  const isPositive = totalPnl >= 0;

  return (
    <div className="agent-card p-5 h-[140px] flex flex-col justify-between group"
    >
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className={cn(
            "flex h-11 w-11 items-center justify-center rounded-xl border",
            isPositive ? "bg-[#30d158]/10 border-[#30d158]/20 text-[#30d158]" : "bg-[#ff453a]/10 border-[#ff453a]/20 text-[#ff453a]"
          )}
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M7 12l3-3 3 3 4-4M8 21l4-4 4 4M3 4h18M4 4h16v12a1 1 0 01-1 1H5a1 1 0 01-1-1V4z" />
            </svg>
          </div>
          
          <span className="text-xs font-semibold text-[var(--text-tertiary)] uppercase tracking-wider"
          >PnL Trend</span>
        </div>
        
        <Link href="/games/dice" className="text-xs text-[#ff2d55] opacity-0 group-hover:opacity-100 transition-opacity hover:underline"
        >
          View →
        </Link>
      </div>
      
      <div className="relative flex-1 min-h-[50px]">
        <svg viewBox={`0 0 100 ${HEIGHT}`} preserveAspectRatio="none" className="w-full h-full"
        >
          <defs>
            <linearGradient id="sparklineGrad" x1="0" y1="0" x2="0" y2="1"
            >
              <stop offset="0%" stopColor={isPositive ? "#30d158" : "#ff453a"} stopOpacity={0.3} />
              <stop offset="100%" stopColor={isPositive ? "#30d158" : "#ff453a"} stopOpacity={0} />
            </linearGradient>
          </defs>
          <path
            d={pathD}
            fill="none"
            stroke={isPositive ? "#30d158" : "#ff453a"}
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          <path
            d={`${pathD} L 100 ${HEIGHT} L 0 ${HEIGHT} Z`}
            fill="url(#sparklineGrad)"
          />
        </svg>
        
        <div className={cn(
          "absolute right-0 top-0 text-lg font-semibold tabular-nums",
          isPositive ? "text-[#30d158]" : "text-[#ff453a]"
        )}
        >
          {totalPnl >= 0 ? "+" : ""}{totalPnl}
        </div>
      </div>
    </div>
  );
}

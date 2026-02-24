"use client";

import { useState, useEffect, useCallback, useId } from "react";
import Link from "next/link";
import { cn } from "@/lib/utils";

const HEIGHT = 48;
const POINTS = 32;

export function MiniPnLSparkline() {
  const id = useId();
  const [points, setPoints] = useState<number[]>([]);
  const [totalPnl, setTotalPnl] = useState(0);

  const refresh = useCallback(async () => {
    try {
      const res = await fetch("/api/v1/me/rounds?gameType=dice&limit=200", { credentials: "include" });
      const data = await res.json().catch(() => ({}));
      if (!data.success || !Array.isArray(data.data?.plays)) return;
      const plays = data.data.plays as { amount: number; payout: number; pnl?: number }[];
      const chronological = [...plays].reverse();
      const pnls = chronological.map((p) =>
        typeof p.pnl === "number" ? p.pnl : Number(p.payout ?? 0) - Number(p.amount ?? 0)
      );
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
      <div className="agent-card p-4 sm:p-5 min-h-[120px] sm:min-h-[140px] flex flex-col justify-between min-w-0 overflow-hidden">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-white/[0.04] border border-white/[0.08] text-[var(--text-tertiary)]">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M7 12l3-3 3 3 4-4M8 21l4-4 4 4M3 4h18M4 4h16v12a1 1 0 01-1 1H5a1 1 0 01-1-1V4z" />
              </svg>
            </div>
            <span className="text-xs font-semibold text-[var(--text-tertiary)] uppercase tracking-wider">
              Neural PnL
            </span>
          </div>
          <Link href="/games/dice" className="text-xs text-[#0ea5e9] hover:underline shrink-0">
            Start â†’
          </Link>
        </div>
        <div className="flex-1 flex items-center justify-center min-h-0">
          <p className="text-xs text-[var(--text-quaternary)]">Play dice to see your PnL trend</p>
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
    <div className="agent-card p-4 sm:p-5 min-h-[120px] sm:min-h-[140px] flex flex-col justify-between group min-w-0 overflow-hidden"
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
        
        <Link href="/games/dice" className="text-xs text-[#0ea5e9] opacity-0 group-hover:opacity-100 transition-opacity hover:underline"
        >
          View â†’
        </Link>
      </div>
      
      <div className="relative flex-1 min-h-[50px]">
        <svg viewBox={`0 0 100 ${HEIGHT}`} preserveAspectRatio="none" className="w-full h-full"
        >
          <defs>
            <linearGradient id={`sparkline-${id}`} x1="0" y1="0" x2="0" y2="1">
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
            fill={`url(#sparkline-${id})`}
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




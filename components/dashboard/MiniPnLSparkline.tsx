"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { GlassCard } from "@/components/ui/GlassCard";

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
      <GlassCard className="p-4">
        <div className="flex items-center justify-between">
          <span className="text-xs font-mono text-[var(--text-secondary)] uppercase tracking-wider">PnL Trend</span>
          <Link href="/games/dice" className="text-[10px] text-[var(--accent-heart)] hover:underline">
            Play dice →
          </Link>
        </div>
        <div className="mt-2 h-12 flex items-center justify-center text-[var(--text-secondary)]/50 text-xs">
          No bets yet
        </div>
      </GlassCard>
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
    <GlassCard className="p-4 group">
      <div className="flex items-center justify-between">
        <span className="text-xs font-mono text-[var(--text-secondary)] uppercase tracking-wider">PnL Trend</span>
        <Link href="/games/dice" className="text-[10px] text-[var(--accent-heart)] opacity-0 group-hover:opacity-100 transition-opacity hover:underline">
          Play dice →
        </Link>
      </div>
      <div className="mt-2 relative">
        <svg viewBox={`0 0 100 ${HEIGHT}`} preserveAspectRatio="none" className="w-full h-12">
          <defs>
            <linearGradient id="sparklineGrad" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={isPositive ? "#10b981" : "#ef4444"} stopOpacity={0.3} />
              <stop offset="100%" stopColor={isPositive ? "#10b981" : "#ef4444"} stopOpacity={0} />
            </linearGradient>
          </defs>
          <path
            d={pathD}
            fill="none"
            stroke={isPositive ? "#10b981" : "#ef4444"}
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          <path
            d={`${pathD} L 100 ${HEIGHT} L 0 ${HEIGHT} Z`}
            fill="url(#sparklineGrad)"
          />
        </svg>
        <div className={`absolute right-0 top-0 text-xs font-mono font-bold ${isPositive ? "text-emerald-400" : "text-red-400"}`}>
          {totalPnl >= 0 ? "+" : ""}{totalPnl}
        </div>
      </div>
    </GlassCard>
  );
}

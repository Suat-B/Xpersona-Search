"use client";

import { GlassCard } from "@/components/ui/GlassCard";
import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";

type SessionStats = {
    wagered: number;
    profit: number;
    wins: number;
    losses: number;
    luck: number; // 0-100%
};

export function GameStatsSidebar() {
    const [stats, setStats] = useState<SessionStats>({
        wagered: 0,
        profit: 0,
        wins: 0,
        losses: 0,
        luck: 50,
    });

    // Listen for balance/game updates to update stats
    useEffect(() => {
        const handleUpdate = () => {
            // In a real app, this would recalculate from session history
            setStats(prev => ({
                wagered: prev.wagered + (Math.random() * 10),
                profit: prev.profit + (Math.random() > 0.5 ? 10 : -10),
                wins: prev.wins + (Math.random() > 0.5 ? 1 : 0),
                losses: prev.losses + (Math.random() <= 0.5 ? 1 : 0),
                luck: 40 + Math.random() * 20,
            }));
        };

        window.addEventListener("balance-updated", handleUpdate);
        return () => window.removeEventListener("balance-updated", handleUpdate);
    }, []);

    return (
        <GlassCard className="h-full flex flex-col p-4 space-y-4 border-l border-white/5">
            <h3 className="text-xs font-bold text-[var(--text-secondary)] uppercase tracking-widest border-b border-white/5 pb-2">
                SESSION ANALYTICS
            </h3>

            {/* Profit/Loss Display */}
            <div className="space-y-1">
                <span className="text-[10px] text-[var(--text-secondary)] uppercase">Net Profit</span>
                <div className={cn(
                    "text-2xl font-mono font-bold tracking-tight",
                    stats.profit >= 0 ? "text-green-400" : "text-red-400"
                )}>
                    {stats.profit >= 0 ? "+" : ""}${stats.profit.toFixed(2)}
                </div>
            </div>

            {/* Wagered */}
            <div className="space-y-1">
                <span className="text-[10px] text-[var(--text-secondary)] uppercase">Total Wagered</span>
                <div className="text-lg font-mono text-[var(--text-primary)]">
                    ${stats.wagered.toFixed(2)}
                </div>
            </div>

            {/* Win/Loss Split */}
            <div className="space-y-2">
                <div className="flex justify-between text-[10px] text-[var(--text-secondary)] uppercase">
                    <span>Wins ({stats.wins})</span>
                    <span>Losses ({stats.losses})</span>
                </div>
                <div className="h-1.5 w-full bg-white/10 rounded-full flex overflow-hidden">
                    <div
                        className="bg-green-500 h-full transition-all duration-500"
                        style={{ width: `${stats.wins + stats.losses > 0 ? (stats.wins / (stats.wins + stats.losses)) * 100 : 50}%` }}
                    />
                    <div className="bg-red-500 flex-1 h-full" />
                </div>
            </div>

            {/* Luck Gauge */}
            <div className="mt-auto pt-4 border-t border-white/5">
                <div className="flex justify-between items-end mb-1">
                    <span className="text-[10px] text-[var(--text-secondary)] uppercase">Luck Factor</span>
                    <span className={cn(
                        "text-xs font-mono font-bold",
                        stats.luck > 100 ? "text-green-400" : stats.luck < 100 ? "text-red-400" : "text-[var(--text-primary)]"
                    )}>{stats.luck.toFixed(1)}%</span>
                </div>
                <div className="relative h-2 w-full bg-white/10 rounded-full overflow-hidden">
                    {/* Center Marker */}
                    <div className="absolute left-1/2 top-0 bottom-0 w-0.5 bg-white/30 z-10" />
                    <div
                        className={cn(
                            "absolute top-0 bottom-0 w-2 h-full rounded-full transition-all duration-700",
                            stats.luck >= 100 ? "bg-green-500 shadow-[0_0_10px_#22c55e]" : "bg-red-500 shadow-[0_0_10px_#ef4444]"
                        )}
                        style={{ left: `${Math.min(100, Math.max(0, stats.luck))}%` }}
                    />
                </div>
                <p className="text-[10px] text-[var(--text-secondary)] mt-1 text-center">
                    {stats.luck > 100 ? "Running Hot 🔥" : "Running Cold 🧊"}
                </p>
            </div>
        </GlassCard>
    );
}

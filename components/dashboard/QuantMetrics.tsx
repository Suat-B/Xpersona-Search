"use client";

import Link from "next/link";
import { GlassCard } from "@/components/ui/GlassCard";
import { useEffect, useState, useCallback } from "react";
import { cn } from "@/lib/utils";

type Metric = {
    label: string;
    value: string;
    subtext?: string;
    trend?: "up" | "down" | "neutral";
};

export default function QuantMetrics() {
    const [metrics, setMetrics] = useState<Metric[]>([
        { label: "BALANCE", value: "0", subtext: "credits", trend: "neutral" },
        { label: "SESSION PNL", value: "+0", subtext: "0 bets", trend: "neutral" },
        { label: "WIN RATE", value: "0%", subtext: "0 Bets", trend: "neutral" },
        { label: "VOLUME", value: "0", subtext: "Wagered", trend: "neutral" },
    ]);

    const refresh = useCallback(async () => {
        try {
            const [balanceRes, betsRes] = await Promise.all([
                fetch("/api/me/balance", { credentials: "include" }),
                fetch("/api/me/bets?limit=100&gameType=dice", { credentials: "include" }),
            ]);
            const balanceData = await balanceRes.json();
            const betsData = await betsRes.json();

            const balance = balanceData.success && typeof balanceData.data?.balance === "number"
                ? balanceData.data.balance
                : 0;

            let sessionPnl = 0;
            let roundCount = 0;
            let wins = 0;
            let volume = 0;
            if (betsData.success && Array.isArray(betsData.data?.bets)) {
                sessionPnl = typeof betsData.data.sessionPnl === "number" ? betsData.data.sessionPnl : 0;
                const bets = betsData.data.bets as { amount: number; outcome: string }[];
                roundCount = bets.length;
                wins = bets.filter((b) => b.outcome === "win").length;
                volume = bets.reduce((s, b) => s + (b.amount ?? 0), 0);
            }

            const winRatePct = roundCount > 0 ? (wins / roundCount) * 100 : 0;
            const pnlTrend: "up" | "down" | "neutral" = sessionPnl > 0 ? "up" : sessionPnl < 0 ? "down" : "neutral";

            setMetrics([
                { label: "BALANCE", value: String(balance), subtext: "credits", trend: "neutral" },
                {
                    label: "SESSION PNL",
                    value: (sessionPnl >= 0 ? "+" : "") + String(sessionPnl),
                    subtext: `${roundCount} bets`,
                    trend: pnlTrend,
                },
                {
                    label: "WIN RATE",
                    value: `${winRatePct.toFixed(1)}%`,
                    subtext: `${roundCount} Bets`,
                    trend: winRatePct >= 50 ? "up" : winRatePct < 50 ? "down" : "neutral",
                },
                { label: "VOLUME", value: String(volume), subtext: "Wagered", trend: "neutral" },
            ]);
        } catch (e) {
            console.error("QuantMetrics fetch failed", e);
        }
    }, []);

    useEffect(() => {
        refresh();
        const interval = setInterval(refresh, 10000);
        return () => clearInterval(interval);
    }, [refresh]);

    useEffect(() => {
        window.addEventListener("balance-updated", refresh);
        return () => window.removeEventListener("balance-updated", refresh);
    }, [refresh]);

    return (
        <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
            {metrics.map((m, i) => (
                <GlassCard key={i} className={cn("p-4 flex flex-col justify-between relative overflow-hidden group", i === 0 ? "min-h-24 h-auto" : "h-24")}>
                    {/* Scanline effect */}
                    <div className="absolute inset-0 bg-gradient-to-b from-white/5 to-transparent opacity-0 group-hover:opacity-20 transition-opacity pointer-events-none" />

                    <span className="text-xs font-mono text-[var(--text-secondary)] tracking-widest uppercase mb-1">
                        {m.label}
                    </span>
                    <div className="flex items-end justify-between">
                        <span className={cn(
                            "text-xl font-bold font-mono tracking-tight",
                            m.trend === "up" ? "text-green-400" : m.trend === "down" ? "text-red-400" : "text-[var(--text-primary)]"
                        )}>
                            {m.value}
                        </span>
                        {m.subtext && (
                            <span className={cn(
                                "text-[10px] font-mono",
                                m.trend === "up" ? "text-green-500/70" : m.trend === "down" ? "text-red-500/70" : "text-[var(--text-secondary)]"
                            )}>
                                {m.subtext}
                            </span>
                        )}
                    </div>
                    {i === 0 && (
                        <Link
                            href="/dashboard/deposit"
                            className="mt-2 text-[10px] font-medium text-[var(--accent-heart)] hover:underline"
                        >
                            Deposit
                        </Link>
                    )}
                </GlassCard>
            ))}
        </div>
    );
}

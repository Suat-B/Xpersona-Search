"use client";

import Link from "next/link";
import { useEffect, useState, useCallback } from "react";
import { cn } from "@/lib/utils";
import { fetchSessionStatsWithRetry } from "@/lib/safeFetch";

type Metric = {
    label: string;
    value: string;
    subtext?: string;
    trend?: "up" | "down" | "neutral";
    icon: React.ReactNode;
};

const icons = {
    balance: (
        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
    ),
    pnl: (
        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
        </svg>
    ),
    winrate: (
        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" />
        </svg>
    ),
    volume: (
        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
        </svg>
    ),
};

const trendBg = {
    up: "bg-[#30d158]/10 border-[#30d158]/20 text-[#30d158]",
    down: "bg-[#ff453a]/10 border-[#ff453a]/20 text-[#ff453a]",
    neutral: "bg-white/[0.04] border-white/[0.08] text-[var(--text-tertiary)]",
};

const trendText = {
    up: "text-[#30d158]",
    down: "text-[#ff453a]",
    neutral: "text-[var(--text-primary)]",
};

export default function QuantMetrics() {
    const [metrics, setMetrics] = useState<Metric[]>([
        { label: "Balance", value: "...", subtext: "credits", trend: "neutral", icon: icons.balance },
        { label: "Session P&L", value: "+0", subtext: "0 plays", trend: "neutral", icon: icons.pnl },
        { label: "Win Rate", value: "0%", subtext: "0 Plays", trend: "neutral", icon: icons.winrate },
        { label: "Volume", value: "0", subtext: "Wagered", trend: "neutral", icon: icons.volume },
    ]);

    const refresh = useCallback(async () => {
        try {
            const stats = await fetchSessionStatsWithRetry({ gameType: "dice", limit: 100 });

            const balanceVal = stats?.balance ?? 0;
            const sessionPnl = stats?.sessionPnl ?? 0;
            const recentPlays = stats?.recentPlays ?? [];
            const roundCount = recentPlays.length;
            const wins = recentPlays.filter((b) => b.outcome === "win").length;
            const volume = recentPlays.reduce((s, b) => s + (b.amount ?? 0), 0);
            const winRatePct = roundCount > 0 ? (wins / roundCount) * 100 : (stats?.winRate ?? 0);
            const pnlTrend: "up" | "down" | "neutral" = sessionPnl > 0 ? "up" : sessionPnl < 0 ? "down" : "neutral";

            setMetrics([
                { label: "Balance", value: String(balanceVal), subtext: "credits", trend: "neutral", icon: icons.balance },
                {
                    label: "Session P&L",
                    value: (sessionPnl >= 0 ? "+" : "") + String(sessionPnl),
                    subtext: `${roundCount} plays`,
                    trend: pnlTrend,
                    icon: icons.pnl,
                },
                {
                    label: "Win Rate",
                    value: `${winRatePct.toFixed(1)}%`,
                    subtext: `${roundCount} Plays`,
                    trend: winRatePct >= 50 ? "up" : winRatePct < 50 ? "down" : "neutral",
                    icon: icons.winrate,
                },
                { label: "Volume", value: String(volume), subtext: "Wagered", trend: "neutral", icon: icons.volume },
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

    useEffect(() => {
        const handler = () => {
            if (document.visibilityState === "visible") refresh();
        };
        window.addEventListener("visibilitychange", handler);
        return () => window.removeEventListener("visibilitychange", handler);
    }, [refresh]);

    return (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {metrics.map((m, i) => (
                <div 
                    key={m.label}
                    className={cn(
                        "agent-card p-5 h-[140px] flex flex-col justify-between transition-all duration-300 hover:border-[var(--border-strong)]",
                    )}
                >
                    <div className="flex items-start justify-between">
                        <span className="text-xs font-semibold text-[var(--text-tertiary)] uppercase tracking-wider"
                        >
                            {m.label}
                        </span>
                        
                        <div className={cn(
                            "flex items-center justify-center w-10 h-10 rounded-xl border",
                            trendBg[m.trend || "neutral"]
                        )}
                        >
                            {m.icon}
                        </div>
                    </div>
                    
                    <div className="mt-auto">
                        <div className="flex items-baseline gap-2">
                            <span className={cn("text-3xl font-semibold tracking-tight", trendText[m.trend || "neutral"])}
                            >
                                {m.value}
                            </span>
                            
                            {m.trend === "up" && (
                                <svg className="w-4 h-4 text-[#30d158]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" />
                                </svg>
                            )}
                            
                            {m.trend === "down" && (
                                <svg className="w-4 h-4 text-[#ff453a]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 17h8m0 0V9m0 8l-8-8-4 4-6-6" />
                                </svg>
                            )}
                        </div>
                        
                        <div className="flex items-center justify-between">
                            <span className={cn(
                                "text-xs font-medium",
                                m.trend === "up" ? "text-[#30d158]/70" : 
                                m.trend === "down" ? "text-[#ff453a]/70" : 
                                "text-[var(--text-tertiary)]"
                            )}
                            >
                                {m.subtext}
                            </span>
                            
                            {i === 0 && (
                                <Link
                                    href="/dashboard/deposit"
                                    className="text-xs font-medium text-[#ff2d55] hover:underline"
                                >
                                    Deposit →
                                </Link>
                            )}
                        </div>
                    </div>
                </div>
            ))}
        </div>
    );
}

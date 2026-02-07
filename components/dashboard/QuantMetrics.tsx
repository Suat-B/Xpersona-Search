"use client";

import { GlassCard } from "@/components/ui/GlassCard";
import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";

type Metric = {
    label: string;
    value: string;
    subtext?: string;
    trend?: "up" | "down" | "neutral";
};

export default function QuantMetrics() {
    const [metrics, setMetrics] = useState<Metric[]>([
        { label: "BALANCE", value: "$0.00", subtext: "Available", trend: "neutral" },
        { label: "SESSION PNL", value: "+$0.00", subtext: "0% ROI", trend: "neutral" },
        { label: "WIN RATE", value: "0%", subtext: "0 Bets", trend: "neutral" },
        { label: "VOLUME", value: "$0.00", subtext: "Wagered", trend: "neutral" },
    ]);

    // Mock live data updates
    useEffect(() => {
        const interval = setInterval(() => {
            // In a real app, fetch from API or listen to socket
            // For now, just a placeholder effect to show it's "live"
        }, 5000);
        return () => clearInterval(interval);
    }, []);

    // Listen for balance updates
    useEffect(() => {
        const updateBalance = async () => {
            try {
                const res = await fetch("/api/me/balance");
                const data = await res.json();
                if (data.success) {
                    setMetrics(prev => {
                        const newMetrics = [...prev];
                        newMetrics[0] = { ...newMetrics[0], value: `$${data.data.balance.toFixed(2)}` };
                        return newMetrics;
                    });
                }
            } catch (e) {
                console.error("Failed to fetch balance", e);
            }
        };

        updateBalance();
        window.addEventListener("balance-updated", updateBalance);
        return () => window.removeEventListener("balance-updated", updateBalance);
    }, []);

    return (
        <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
            {metrics.map((m, i) => (
                <GlassCard key={i} className="p-4 flex flex-col justify-between h-24 relative overflow-hidden group">
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
                </GlassCard>
            ))}
        </div>
    );
}

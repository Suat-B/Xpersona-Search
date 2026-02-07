"use client";

import { useState, useEffect, useRef } from "react";
import { cn } from "@/lib/utils";

type GameFeedItem = {
    id: string;
    multiplier: number;
    payout: number;
    user: string;
    isHighRoller: boolean;
};

const MOCK_BOTS = ["AlgoX", "Quant7", "Whale_99", "SniperBot", "HFT_Pro"];

export function GameFeed() {
    const [feed, setFeed] = useState<GameFeedItem[]>([]);
    const listRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        const addOutcome = () => {
            const mult = parseFloat((Math.random() * 5).toFixed(2));
            const payout = parseFloat((Math.random() * 50).toFixed(2));
            const newItem: GameFeedItem = {
                id: Math.random().toString(36).substr(2, 9),
                multiplier: mult,
                payout: payout,
                user: MOCK_BOTS[Math.floor(Math.random() * MOCK_BOTS.length)],
                isHighRoller: payout > 40,
            };
            setFeed(prev => [newItem, ...prev].slice(0, 8)); // Keep 8 most recent
        };

        const interval = setInterval(addOutcome, 2000);
        return () => clearInterval(interval);
    }, []);

    return (
        <div className="h-full flex flex-col border-l border-white/5 bg-black/20 backdrop-blur-sm w-full">
            <div className="px-3 py-2 border-b border-white/5 text-[10px] font-bold text-[var(--text-secondary)] uppercase tracking-widest flex justify-between">
                <span>Live Bets</span>
                <span className="text-green-400 animate-pulse">● Live</span>
            </div>
            <div className="flex-1 overflow-hidden relative">
                <div className="absolute inset-0 overflow-y-auto scrollbar-none space-y-0.5 p-1" ref={listRef}>
                    {feed.map((item) => (
                        <div
                            key={item.id}
                            className={cn(
                                "flex items-center justify-between px-2 py-1.5 rounded text-xs font-mono animate-in slide-in-from-top-2 fade-in duration-300",
                                item.isHighRoller ? "bg-yellow-500/10 border border-yellow-500/20" : "hover:bg-white/5"
                            )}
                        >
                            <span className={cn(
                                "font-medium truncate max-w-[80px]",
                                item.isHighRoller ? "text-yellow-400" : "text-[var(--text-secondary)]"
                            )}>{item.user}</span>

                            <div className="flex gap-3">
                                <span className={cn(
                                    item.multiplier >= 2 ? "text-green-400" : "text-[var(--text-secondary)]"
                                )}>{item.multiplier}x</span>
                                <span className={cn(
                                    "w-12 text-right",
                                    item.payout > 0 ? "text-white" : "text-[var(--text-secondary)]"
                                )}>${item.payout}</span>
                            </div>
                        </div>
                    ))}
                </div>
                {/* Fade overlay at bottom */}
                <div className="absolute bottom-0 left-0 right-0 h-10 bg-gradient-to-t from-black/80 to-transparent pointer-events-none" />
            </div>
        </div>
    );
}

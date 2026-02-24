"use client";

import { GlassCard } from "@/components/ui/GlassCard";
import { useEffect, useState, useRef, useCallback } from "react";
import { cn } from "@/lib/utils";

type FeedItem = {
    id: string;
    user: string;
    action: string;
    amount: string;
    game: string;
    timestamp: number;
    type: "win" | "transaction";
};

export default function LiveFeed() {
    const [feed, setFeed] = useState<FeedItem[]>([]);
    const listRef = useRef<HTMLUListElement>(null);

    const refresh = useCallback(async () => {
        try {
            const res = await fetch("/api/v1/me/rounds?limit=15&gameType=dice", { credentials: "include" });
            const data = await res.json();
            if (!data.success || !Array.isArray(data.data?.plays)) {
                setFeed([]);
                return;
            }
            const plays = data.data.plays as { id: string; amount: number; outcome: string; payout: number; createdAt?: string }[];
            const items: FeedItem[] = plays.map((p) => ({
                id: p.id,
                user: "You",
                action: p.outcome === "win" ? "won" : "play",
                amount: p.outcome === "win" ? `+${p.payout}` : `-${p.amount}`,
                game: "Dice",
                timestamp: p.createdAt ? new Date(p.createdAt).getTime() : Date.now(),
                type: p.outcome === "win" ? "win" : "transaction",
            }));
            setFeed(items);
        } catch (e) {
            console.error("LiveFeed fetch failed", e);
        }
    }, []);

    useEffect(() => {
        refresh();
        const interval = setInterval(refresh, 8000);
        return () => clearInterval(interval);
    }, [refresh]);

    useEffect(() => {
        window.addEventListener("balance-updated", refresh);
        return () => window.removeEventListener("balance-updated", refresh);
    }, [refresh]);

    return (
        <GlassCard className="h-full flex flex-col p-0 overflow-hidden">
            <div className="px-4 py-3 border-b border-white/5 flex justify-between items-center bg-white/5">
                <h3 className="text-sm font-semibold text-[var(--text-primary)] flex items-center gap-2">
                    <span className="relative flex h-2 w-2">
                        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75"></span>
                        <span className="relative inline-flex rounded-full h-2 w-2 bg-green-500"></span>
                    </span>
                    LIVE FEED
                </h3>
                <span className="text-[10px] text-[var(--text-secondary)] font-mono">YOUR TRANSACTIONS</span>
            </div>
            <div className="flex-1 overflow-y-auto p-2 scrollbar-thin scrollbar-thumb-white/10 scrollbar-track-transparent">
                <ul ref={listRef} className="space-y-1">
                    {feed.length === 0 ? (
                        <li className="p-4 text-center text-xs text-[var(--text-secondary)]">
                            No transactions yet. Play a game to see activity here.
                        </li>
                    ) : (
                        feed.map((item) => (
                            <li key={item.id} className="animate-in fade-in slide-in-from-top-2 duration-300">
                                <div className="flex items-center justify-between p-2 rounded hover:bg-white/5 transition-colors text-xs font-mono group">
                                    <div className="flex items-center gap-2 text-[var(--text-secondary)]">
                                        <span className="text-[var(--text-primary)] font-medium">{item.user}</span>
                                        <span>{item.action}</span>
                                        <span className={cn(
                                            "font-bold",
                                            item.type === "win" ? "text-green-400" : "text-red-400/90"
                                        )}>{item.amount}</span>
                                        <span>on</span>
                                        <span className="text-[var(--accent-heart)]">{item.game}</span>
                                    </div>
                                    <span className="text-[10px] opacity-0 group-hover:opacity-50 transition-opacity">
                                        {new Date(item.timestamp).toLocaleTimeString([], { hour12: false, hour: "2-digit", minute: "2-digit", second: "2-digit" })}
                                    </span>
                                </div>
                            </li>
                        ))
                    )}
                </ul>
            </div>
        </GlassCard>
    );
}




"use client";

import { GlassCard } from "@/components/ui/GlassCard";
import { useEffect, useState, useRef } from "react";
import { cn } from "@/lib/utils";

type FeedItem = {
    id: string;
    user: string;
    action: string;
    amount: string;
    game: string;
    timestamp: number;
    type: "win" | "bet";
};

const MOCK_USERS = ["Alex", "Sarah", "QuantBot", "CryptoKing", "MoonWalker", "Satoshi", "AI_Agent_007"];
const MOCK_GAMES = ["Dice"];

export default function LiveFeed() {
    const [feed, setFeed] = useState<FeedItem[]>([]);
    const listRef = useRef<HTMLUListElement>(null);

    const addMockItem = () => {
        const type = Math.random() > 0.7 ? "win" : "bet";
        const amount = (Math.random() * 100).toFixed(2);
        const newItem: FeedItem = {
            id: Math.random().toString(36).substring(7),
            user: MOCK_USERS[Math.floor(Math.random() * MOCK_USERS.length)],
            action: type === "win" ? "won" : "bet",
            amount: `$${amount}`,
            game: MOCK_GAMES[Math.floor(Math.random() * MOCK_GAMES.length)],
            timestamp: Date.now(),
            type,
        };

        setFeed(prev => [newItem, ...prev].slice(0, 10)); // Keep last 10
    };

    useEffect(() => {
        // Initial population
        for (let i = 0; i < 5; i++) addMockItem();

        const interval = setInterval(addMockItem, 3000 + Math.random() * 2000); // Random interval 3-5s
        return () => clearInterval(interval);
    }, []);

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
                <span className="text-[10px] text-[var(--text-secondary)] font-mono">GLOBAL</span>
            </div>
            <div className="flex-1 overflow-y-auto p-2 scrollbar-thin scrollbar-thumb-white/10 scrollbar-track-transparent">
                <ul ref={listRef} className="space-y-1">
                    {feed.map((item) => (
                        <li key={item.id} className="animate-in fade-in slide-in-from-top-2 duration-500">
                            <div className="flex items-center justify-between p-2 rounded hover:bg-white/5 transition-colors text-xs font-mono group">
                                <div className="flex items-center gap-2 text-[var(--text-secondary)]">
                                    <span className="text-[var(--text-primary)] font-medium">{item.user}</span>
                                    <span>{item.action}</span>
                                    <span className={cn(
                                        "font-bold",
                                        item.type === "win" ? "text-green-400" : "text-[var(--text-primary)]"
                                    )}>{item.amount}</span>
                                    <span>on</span>
                                    <span className="text-[var(--accent-heart)]">{item.game}</span>
                                </div>
                                <span className="text-[10px] opacity-0 group-hover:opacity-50 transition-opacity">
                                    {new Date(item.timestamp).toLocaleTimeString([], { hour12: false, hour: "2-digit", minute: "2-digit", second: "2-digit" })}
                                </span>
                            </div>
                        </li>
                    ))}
                </ul>
            </div>
        </GlassCard>
    );
}

"use client";

import { GlassCard } from "@/components/ui/GlassCard";
import { cn } from "@/lib/utils";

type Transaction = {
    id: string;
    type: "deposit" | "withdraw" | "bet" | "win";
    amount: string;
    status: "completed" | "pending" | "failed";
    hash: string;
    timestamp: string;
};

const MOCK_TRANSACTIONS = [
    { id: "tx_1", type: "deposit", amount: "+$500.00", status: "completed", hash: "0x3f...e2a", timestamp: "Today, 10:42 AM" },
    { id: "tx_2", type: "win", amount: "+$120.00", status: "completed", hash: "game_dice_882", timestamp: "Today, 10:30 AM" },
    { id: "tx_3", type: "bet", amount: "-$50.00", status: "completed", hash: "game_dice_882", timestamp: "Today, 10:29 AM" },
    { id: "tx_4", type: "withdraw", amount: "-$200.00", status: "pending", hash: "0x9a...b1c", timestamp: "Yesterday, 08:15 PM" },
    { id: "tx_5", type: "deposit", amount: "+$1000.00", status: "completed", hash: "0x7d...f4e", timestamp: "Yesterday, 09:00 AM" },
];

export default function TransactionTable() {
    return (
        <GlassCard className="w-full overflow-hidden">
            <div className="px-6 py-4 border-b border-white/5 flex items-center justify-between">
                <h3 className="font-semibold text-[var(--text-primary)]">Recent Activity</h3>
                <button className="text-xs text-[var(--accent-heart)] hover:text-[var(--accent-heart)]/80 transition-colors">
                    View All →
                </button>
            </div>
            <div className="overflow-x-auto">
                <table className="w-full text-sm text-left">
                    <thead className="text-xs text-[var(--text-secondary)] uppercase bg-white/5">
                        <tr>
                            <th className="px-6 py-3">Type</th>
                            <th className="px-6 py-3">Amount</th>
                            <th className="px-6 py-3">Hash/ID</th>
                            <th className="px-6 py-3">Time</th>
                            <th className="px-6 py-3 text-right">Status</th>
                        </tr>
                    </thead>
                    <tbody>
                        {MOCK_TRANSACTIONS.map((tx) => (
                            <tr key={tx.id} className="border-b border-white/5 hover:bg-white/5 transition-colors group">
                                <td className="px-6 py-4 font-medium">
                                    <span className={cn(
                                        "inline-flex items-center gap-2",
                                        tx.type === "deposit" ? "text-green-400" :
                                            tx.type === "withdraw" ? "text-orange-400" :
                                                tx.type === "win" ? "text-blue-400" : "text-[var(--text-secondary)]"
                                    )}>
                                        <span className="capitalize">{tx.type}</span>
                                    </span>
                                </td>
                                <td className={cn(
                                    "px-6 py-4 font-mono",
                                    tx.amount.startsWith("+") ? "text-green-400" : "text-[var(--text-primary)]"
                                )}>
                                    {tx.amount}
                                </td>
                                <td className="px-6 py-4 font-mono text-xs text-[var(--text-secondary)] group-hover:text-[var(--text-primary)] transition-colors">
                                    {tx.hash}
                                </td>
                                <td className="px-6 py-4 text-[var(--text-secondary)]">
                                    {tx.timestamp}
                                </td>
                                <td className="px-6 py-4 text-right">
                                    <span className={cn(
                                        "inline-flex items-center px-2 py-0.5 rounded text-xs font-medium",
                                        tx.status === "completed" ? "bg-green-500/10 text-green-400" :
                                            tx.status === "pending" ? "bg-yellow-500/10 text-yellow-500" :
                                                tx.status === "failed" ? "bg-red-500/10 text-red-400" : ""
                                    )}>
                                        {tx.status}
                                    </span>
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        </GlassCard>
    );
}

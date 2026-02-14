"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { GlassCard } from "@/components/ui/GlassCard";

const PAGE_SIZE = 50;
const GAME_LABELS: Record<string, string> = {
  dice: "Dice",
};

type TransactionItem =
  | {
      id: string;
      type: "bet";
      gameType: string;
      amount: number;
      outcome: string;
      payout: number;
      pnl: number;
      createdAt: string | null;
    }
  | {
      id: string;
      type: "faucet";
      amount: number;
      createdAt: string | null;
    };

function TransactionsPageClient() {
  const [transactions, setTransactions] = useState<TransactionItem[]>([]);
  const [sessionPnl, setSessionPnl] = useState<number>(0);
  const [loading, setLoading] = useState(true);
  const [typeFilter, setTypeFilter] = useState<"all" | "bet" | "faucet">("all");
  const [offset, setOffset] = useState(0);
  const [hasMore, setHasMore] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);

  const fetchTransactions = useCallback(
    async (off = 0, append = false) => {
      if (append) setLoadingMore(true);
      else setLoading(true);
      try {
        const params = new URLSearchParams({
          limit: String(PAGE_SIZE),
          offset: String(off),
          type: typeFilter,
        });
        const res = await fetch(`/api/me/transactions?${params}`, {
          credentials: "include",
        });
        const data = await res.json().catch(() => ({}));
        if (data.success && Array.isArray(data.data?.transactions)) {
          const items = data.data.transactions.map((t: TransactionItem) => ({
            ...t,
            createdAt: t.createdAt ? String(t.createdAt) : null,
          }));
          setTransactions(append ? (prev) => [...prev, ...items] : items);
          setSessionPnl(data.data.sessionPnl ?? 0);
          setHasMore(items.length === PAGE_SIZE);
        } else if (!append) {
          setTransactions([]);
          setHasMore(false);
        }
      } catch {
        if (!append) setTransactions([]);
      } finally {
        setLoading(false);
        setLoadingMore(false);
      }
    },
    [typeFilter]
  );

  useEffect(() => {
    setOffset(0);
    setHasMore(true);
    fetchTransactions(0, false);
  }, [fetchTransactions]);

  useEffect(() => {
    const onUpdate = () => fetchTransactions(0, false);
    window.addEventListener("balance-updated", onUpdate);
    return () => window.removeEventListener("balance-updated", onUpdate);
  }, [fetchTransactions]);

  const loadMore = useCallback(() => {
    const nextOffset = offset + PAGE_SIZE;
    setOffset(nextOffset);
    fetchTransactions(nextOffset, true);
  }, [offset, fetchTransactions]);

  const formatDate = (d: string | null) => {
    if (!d) return "—";
    const date = new Date(d);
    return date.toLocaleString(undefined, {
      dateStyle: "short",
      timeStyle: "short",
    });
  };

  const betCount = transactions.filter((t) => t.type === "bet").length;
  const faucetCount = transactions.filter((t) => t.type === "faucet").length;

  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      {/* Hero */}
      <section>
        <h1 className="text-2xl font-bold text-[var(--text-primary)] font-[family-name:var(--font-outfit)]">
          Transactions
        </h1>
        <p className="mt-1 text-sm text-[var(--text-secondary)]">
          All activity — bets, Free Credit claims, and balance changes
        </p>
      </section>

      {/* Summary cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <GlassCard className="p-5">
          <p className="text-xs font-semibold text-[var(--text-secondary)] uppercase tracking-wider mb-1">
            Session PnL
          </p>
          <p
            className={`text-2xl font-mono font-bold ${
              sessionPnl >= 0 ? "text-emerald-400" : "text-red-400"
            }`}
          >
            {sessionPnl >= 0 ? "+" : ""}
            {sessionPnl} credits
          </p>
        </GlassCard>
        <GlassCard className="p-5">
          <p className="text-xs font-semibold text-[var(--text-secondary)] uppercase tracking-wider mb-1">
            Bets shown
          </p>
          <p className="text-2xl font-mono font-bold text-[var(--text-primary)]">
            {betCount}
          </p>
        </GlassCard>
        <GlassCard className="p-5">
          <p className="text-xs font-semibold text-[var(--text-secondary)] uppercase tracking-wider mb-1">
            Free Credit claims
          </p>
          <p className="text-2xl font-mono font-bold text-emerald-400">
            {faucetCount}
          </p>
        </GlassCard>
      </div>

      {/* Filters */}
      <GlassCard className="p-4">
        <div className="flex flex-wrap items-center gap-3">
          <span className="text-xs font-semibold text-[var(--text-secondary)] uppercase tracking-wider">
            Filter
          </span>
          {(["all", "bet", "faucet"] as const).map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => setTypeFilter(t)}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                typeFilter === t
                  ? "bg-[var(--accent-heart)] text-white"
                  : "bg-white/5 text-[var(--text-secondary)] hover:bg-white/10 hover:text-[var(--text-primary)]"
              }`}
            >
              {t === "all" ? "All" : t === "bet" ? "Bets" : "Free Credits"}
            </button>
          ))}
          <Link
            href="/dashboard/provably-fair"
            className="ml-auto text-xs font-medium text-[var(--accent-heart)] hover:underline"
          >
            Verify bets →
          </Link>
        </div>
      </GlassCard>

      {/* Table */}
      <GlassCard className="overflow-hidden">
        <div className="overflow-x-auto">
          {loading && transactions.length === 0 ? (
            <div className="px-6 py-12 text-center text-sm text-[var(--text-secondary)]">
              <div className="inline-block w-6 h-6 border-2 border-[var(--accent-heart)] border-t-transparent rounded-full animate-spin" />
              <p className="mt-2">Loading transactions…</p>
            </div>
          ) : transactions.length === 0 ? (
            <div className="px-6 py-12 text-center">
              <p className="text-sm text-[var(--text-secondary)]">
                No transactions yet.
              </p>
              <p className="mt-1 text-xs text-[var(--text-secondary)]/80">
                Play dice or claim Free Credits to see activity here.
              </p>
              <Link
                href="/dashboard"
                className="mt-4 inline-block rounded-lg bg-[var(--accent-heart)] px-4 py-2 text-sm font-medium text-white hover:opacity-90"
              >
                Go to Dashboard
              </Link>
            </div>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-[var(--border)] text-left text-[10px] font-semibold uppercase tracking-wider text-[var(--text-secondary)]">
                  <th className="px-4 py-3">Type</th>
                  <th className="px-4 py-3">Description</th>
                  <th className="px-4 py-3">Amount</th>
                  <th className="px-4 py-3">PnL</th>
                  <th className="px-4 py-3">Date</th>
                </tr>
              </thead>
              <tbody>
                {transactions.map((tx) => (
                  <tr
                    key={tx.id}
                    className="border-b border-[var(--border)]/50 hover:bg-white/5 transition-colors"
                  >
                    <td className="px-4 py-4">
                      {tx.type === "bet" ? (
                        <span className="inline-flex items-center gap-2">
                          <span
                            className={`w-2 h-2 rounded-full ${
                              tx.outcome === "win"
                                ? "bg-emerald-400"
                                : "bg-red-400"
                            }`}
                          />
                          <span className="font-medium text-[var(--text-primary)]">
                            Bet
                          </span>
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-2">
                          <span className="w-2 h-2 rounded-full bg-emerald-400" />
                          <span className="font-medium text-emerald-400">
                            Free Credits
                          </span>
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-4 text-[var(--text-primary)]">
                      {tx.type === "bet"
                        ? `${GAME_LABELS[tx.gameType] ?? tx.gameType} · ${tx.outcome}`
                        : "Free Credit claim"}
                    </td>
                    <td className="px-4 py-4 font-mono">
                      {tx.type === "bet"
                        ? `${tx.amount} → ${tx.payout}`
                        : `+${tx.amount}`}
                    </td>
                    <td className="px-4 py-4">
                      {tx.type === "bet" ? (
                        <span
                          className={`font-mono font-bold ${
                            tx.pnl >= 0 ? "text-emerald-400" : "text-red-400"
                          }`}
                        >
                          {tx.pnl >= 0 ? "+" : ""}
                          {tx.pnl}
                        </span>
                      ) : (
                        <span className="font-mono font-bold text-emerald-400">
                          +{tx.amount}
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-4 text-[var(--text-secondary)] font-mono text-xs">
                      {formatDate(tx.createdAt)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
        {transactions.length > 0 && hasMore && (
          <div className="px-4 py-3 border-t border-[var(--border)]">
            <button
              type="button"
              onClick={loadMore}
              disabled={loadingMore}
              className="w-full py-2 rounded-lg border border-[var(--border)] bg-[var(--bg-matte)] text-sm font-medium text-[var(--text-primary)] hover:bg-white/5 disabled:opacity-50"
            >
              {loadingMore ? "Loading…" : "Load more"}
            </button>
          </div>
        )}
      </GlassCard>
    </div>
  );
}

export default function TransactionsPage() {
  return <TransactionsPageClient />;
}

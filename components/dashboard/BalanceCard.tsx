"use client";

import { useEffect, useState, useCallback } from "react";
import { fetchBalanceWithRetry } from "@/lib/safeFetch";

export function BalanceCard() {
  const [balance, setBalance] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    setLoading(true);
    const bal = await fetchBalanceWithRetry();
    if (bal !== null) setBalance(bal);
    setLoading(false);
  }, []);

  useEffect(() => {
    refresh();
    const handler = () => refresh();
    window.addEventListener("balance-updated", handler);
    return () => window.removeEventListener("balance-updated", handler);
  }, [refresh]);

  return (
    <div
      className="rounded-lg border border-[var(--border)] bg-[var(--bg-card)] p-6"
      aria-live="polite"
    >
      <h2 className="mb-2 text-sm font-medium text-[var(--text-secondary)]">
        Balance
      </h2>
      {loading ? (
        <p className="text-2xl font-bold">...</p>
      ) : (
        <p className="text-2xl font-bold">{balance ?? 0} credits</p>
      )}
      <button
        type="button"
        onClick={refresh}
        className="mt-2 text-sm text-[var(--accent-heart)] hover:underline"
      >
        Refresh
      </button>
    </div>
  );
}

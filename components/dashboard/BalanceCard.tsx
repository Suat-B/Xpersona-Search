"use client";

import { useEffect, useState } from "react";

export function BalanceCard() {
  const [balance, setBalance] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/me/balance")
      .then((r) => r.json())
      .then((data) => {
        if (data.success) setBalance(data.data.balance);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  const refresh = () => {
    setLoading(true);
    fetch("/api/me/balance")
      .then((r) => r.json())
      .then((data) => {
        if (data.success) setBalance(data.data.balance);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  };

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

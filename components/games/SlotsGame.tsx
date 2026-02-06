"use client";

import { useState } from "react";

export function SlotsGame() {
  const [amount, setAmount] = useState(10);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<{
    reels: number[][];
    totalPayout: number;
    balance: number;
  } | null>(null);
  const [error, setError] = useState<string | null>(null);

  const spin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    setResult(null);
    const res = await fetch("/api/games/slots/spin", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ amount }),
    });
    const data = await res.json();
    setLoading(false);
    if (data.success) {
      setResult({
        reels: data.data.reels || [],
        totalPayout: data.data.totalPayout ?? 0,
        balance: data.data.balance ?? 0,
      });
      window.dispatchEvent(new Event("balance-updated"));
    } else {
      setError(data.error || "Failed");
    }
  };

  return (
    <div className="rounded-lg border border-[var(--border)] bg-[var(--bg-card)] p-6">
      <h2 className="mb-4 text-lg font-semibold">Slots</h2>
      <form onSubmit={spin} className="space-y-4">
        <div>
          <label className="block text-sm text-[var(--text-secondary)]">Amount</label>
          <input
            type="number"
            min={1}
            value={amount}
            onChange={(e) => setAmount(Number(e.target.value))}
            className="mt-1 w-full rounded border border-[var(--border)] bg-[var(--bg-matte)] px-3 py-2"
          />
        </div>
        <button
          type="submit"
          disabled={loading}
          className="rounded bg-[var(--accent-heart)] px-4 py-2 text-white disabled:opacity-50"
        >
          Spin
        </button>
      </form>
      {error && <p className="mt-4 text-sm text-red-400">{error}</p>}
      {result && (
        <div className="mt-6 rounded border border-[var(--border)] bg-[var(--bg-matte)] p-4" aria-live="polite">
          <pre className="text-sm">{JSON.stringify(result.reels, null, 0)}</pre>
          <p>Payout: {result.totalPayout} | Balance: {result.balance}</p>
        </div>
      )}
    </div>
  );
}

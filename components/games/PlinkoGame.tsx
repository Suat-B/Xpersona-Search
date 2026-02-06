"use client";

import { useState } from "react";

export function PlinkoGame() {
  const [amount, setAmount] = useState(10);
  const [risk, setRisk] = useState<"low" | "medium" | "high">("low");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<{
    path: string[];
    bucketIndex: number;
    multiplier: number;
    payout: number;
    balance: number;
  } | null>(null);
  const [error, setError] = useState<string | null>(null);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    setResult(null);
    const res = await fetch("/api/games/plinko/bet", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ amount, risk }),
    });
    const data = await res.json();
    setLoading(false);
    if (data.success) {
      setResult({
        path: data.data.path || [],
        bucketIndex: data.data.bucketIndex ?? 0,
        multiplier: data.data.multiplier ?? 0,
        payout: data.data.payout ?? 0,
        balance: data.data.balance ?? 0,
      });
      window.dispatchEvent(new Event("balance-updated"));
    } else {
      setError(data.error || "Failed");
    }
  };

  return (
    <div className="rounded-lg border border-[var(--border)] bg-[var(--bg-card)] p-6">
      <h2 className="mb-4 text-lg font-semibold">Plinko</h2>
      <form onSubmit={submit} className="space-y-4">
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
        <div>
          <label className="block text-sm text-[var(--text-secondary)]">Risk</label>
          <select
            value={risk}
            onChange={(e) => setRisk(e.target.value as "low" | "medium" | "high")}
            className="mt-1 w-full rounded border border-[var(--border)] bg-[var(--bg-matte)] px-3 py-2"
          >
            <option value="low">Low</option>
            <option value="medium">Medium</option>
            <option value="high">High</option>
          </select>
        </div>
        <button
          type="submit"
          disabled={loading}
          className="rounded bg-[var(--accent-heart)] px-4 py-2 text-white disabled:opacity-50"
        >
          Drop
        </button>
      </form>
      {error && <p className="mt-4 text-sm text-red-400">{error}</p>}
      {result && (
        <div className="mt-6 rounded border border-[var(--border)] bg-[var(--bg-matte)] p-4" aria-live="polite">
          <p>Path: {result.path.join(" → ")}</p>
          <p>Bucket: {result.bucketIndex}, Multiplier: {result.multiplier}x</p>
          <p>Payout: {result.payout} | Balance: {result.balance}</p>
        </div>
      )}
    </div>
  );
}

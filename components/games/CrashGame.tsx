"use client";

import { useState, useEffect } from "react";

export function CrashGame() {
  const [amount, setAmount] = useState(10);
  const [loading, setLoading] = useState(false);
  const [currentRound, setCurrentRound] = useState<{
    roundId: string;
    currentMultiplier: number;
    status: string;
    myBet?: { amount: number };
  } | null>(null);
  const [balance, setBalance] = useState<number | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const fetchCurrent = async () => {
    const res = await fetch("/api/games/crash/rounds/current");
    const data = await res.json();
    if (data.success && data.data) {
      setCurrentRound(data.data);
    } else {
      setCurrentRound(null);
    }
  };

  useEffect(() => {
    fetchCurrent();
    const t = setInterval(fetchCurrent, 500);
    return () => clearInterval(t);
  }, []);

  const placeBet = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setMessage(null);
    const res = await fetch("/api/games/crash/rounds/current/bet", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ amount }),
    });
    const data = await res.json();
    setLoading(false);
    if (data.success) {
      setBalance(data.data.balance);
      setCurrentRound((prev) => prev ? { ...prev, myBet: { amount } } : null);
      fetchCurrent();
    } else {
      setMessage(data.error || "Failed");
    }
  };

  const cashOut = async () => {
    if (!currentRound?.roundId) return;
    setLoading(true);
    setMessage(null);
    const res = await fetch(`/api/games/crash/rounds/${currentRound.roundId}/cashout`, {
      method: "POST",
    });
    const data = await res.json();
    setLoading(false);
    if (data.success) {
      setBalance(data.data.balance);
      setMessage(`Cashed out at ${data.data.cashedOutAt}x. Payout: ${data.data.payout}`);
      fetchCurrent();
    } else {
      setMessage(data.error || "Failed");
    }
  };

  return (
    <div className="rounded-lg border border-[var(--border)] bg-[var(--bg-card)] p-6">
      <h2 className="mb-4 text-lg font-semibold">Crash</h2>
      <p className="mb-2 text-2xl font-bold">
        Multiplier: {currentRound?.currentMultiplier?.toFixed(2) ?? "—"}
      </p>
      <p className="mb-4 text-sm text-[var(--text-secondary)]">
        Status: {currentRound?.status ?? "waiting"}
      </p>
      <form onSubmit={placeBet} className="mb-4 flex gap-2">
        <input
          type="number"
          min={1}
          value={amount}
          onChange={(e) => setAmount(Number(e.target.value))}
          className="rounded border border-[var(--border)] bg-[var(--bg-matte)] px-3 py-2"
        />
        <button
          type="submit"
          disabled={loading || currentRound?.status !== "running"}
          className="rounded bg-[var(--accent-heart)] px-4 py-2 text-white disabled:opacity-50"
        >
          Place bet
        </button>
      </form>
      {currentRound?.myBet && currentRound.status === "running" && (
        <button
          type="button"
          onClick={cashOut}
          disabled={loading}
          className="rounded border border-green-500 px-4 py-2 text-green-500 disabled:opacity-50"
        >
          Cash out
        </button>
      )}
      {balance != null && <p className="mt-2 text-sm">Balance: {balance}</p>}
      {message && <p className="mt-4 text-sm" aria-live="polite">{message}</p>}
    </div>
  );
}

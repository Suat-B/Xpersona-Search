"use client";

import { useState } from "react";

type Result = {
  result: number;
  win: boolean;
  payout: number;
  balance: number;
} | null;

export function DiceGame() {
  const [amount, setAmount] = useState(10);
  const [target, setTarget] = useState(50);
  const [condition, setCondition] = useState<"over" | "under">("over");
  const [result, setResult] = useState<Result>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    setResult(null);
    const res = await fetch("/api/games/dice/bet", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ amount, target, condition }),
    });
    const data = await res.json();
    setLoading(false);
    if (data.success) {
      setResult({
        result: data.data.result,
        win: data.data.win,
        payout: data.data.payout,
        balance: data.data.balance,
      });
      window.dispatchEvent(new Event("balance-updated"));
    } else {
      setError(data.error || "Something went wrong");
    }
  };

  return (
    <div className="rounded-lg border border-[var(--border)] bg-[var(--bg-card)] p-6">
      <h2 className="mb-4 text-lg font-semibold">Dice</h2>
      <form onSubmit={submit} className="space-y-4">
        <div>
          <label htmlFor="dice-amount" className="block text-sm text-[var(--text-secondary)]">
            Amount (credits)
          </label>
          <input
            id="dice-amount"
            type="number"
            min={1}
            max={10000}
            value={amount}
            onChange={(e) => setAmount(Number(e.target.value))}
            className="mt-1 w-full rounded border border-[var(--border)] bg-[var(--bg-matte)] px-3 py-2 text-[var(--text-primary)]"
          />
        </div>
        <div>
          <label htmlFor="dice-target" className="block text-sm text-[var(--text-secondary)]">
            Target (0–100)
          </label>
          <input
            id="dice-target"
            type="number"
            min={0}
            max={99.99}
            step={0.01}
            value={target}
            onChange={(e) => setTarget(Number(e.target.value))}
            className="mt-1 w-full rounded border border-[var(--border)] bg-[var(--bg-matte)] px-3 py-2 text-[var(--text-primary)]"
          />
        </div>
        <div>
          <span className="block text-sm text-[var(--text-secondary)]">Condition</span>
          <div className="mt-1 flex gap-4">
            <label className="flex items-center gap-2">
              <input
                type="radio"
                name="condition"
                checked={condition === "over"}
                onChange={() => setCondition("over")}
              />
              Over
            </label>
            <label className="flex items-center gap-2">
              <input
                type="radio"
                name="condition"
                checked={condition === "under"}
                onChange={() => setCondition("under")}
              />
              Under
            </label>
          </div>
        </div>
        <button
          type="submit"
          disabled={loading}
          className="rounded bg-[var(--accent-heart)] px-4 py-2 font-medium text-white disabled:opacity-50"
        >
          {loading ? "Rolling..." : "Roll"}
        </button>
      </form>
      {error && (
        <p className="mt-4 text-sm text-red-400" role="alert">
          {error}
        </p>
      )}
      {result && (
        <div
          className="mt-6 rounded border border-[var(--border)] bg-[var(--bg-matte)] p-4"
          aria-live="polite"
        >
          <p className="text-2xl font-bold">Result: {result.result.toFixed(2)}</p>
          <p className={result.win ? "text-green-400" : "text-red-400"}>
            {result.win ? "Win" : "Loss"} — Payout: {result.payout} credits
          </p>
          <p className="text-sm text-[var(--text-secondary)]">
            New balance: {result.balance} credits
          </p>
        </div>
      )}
    </div>
  );
}

"use client";

import { useState, useRef, useCallback } from "react";
import { useSessionPnL } from "./useSessionPnL";
import { SessionPnLChart } from "@/components/ui/SessionPnLChart";

const AUTO_SPEEDS = [100, 250, 500, 1000] as const;

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
  const [autoPlay, setAutoPlay] = useState(false);
  const [autoSpeed, setAutoSpeed] = useState(250);
  const [autoRounds, setAutoRounds] = useState(0);
  const stopRef = useRef(false);
  const { series, totalPnl, rounds, addRound, reset } = useSessionPnL();

  const runDrop = useCallback(async (): Promise<boolean> => {
    const res = await fetch("/api/games/plinko/bet", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ amount, risk }),
    });
    const data = await res.json();
    if (data.success) {
      const payout = data.data.payout ?? 0;
      setResult({
        path: data.data.path || [],
        bucketIndex: data.data.bucketIndex ?? 0,
        multiplier: data.data.multiplier ?? 0,
        payout,
        balance: data.data.balance ?? 0,
      });
      addRound(amount, payout);
      window.dispatchEvent(new Event("balance-updated"));
      return true;
    }
    setError(data.error || "Failed");
    return false;
  }, [amount, risk, addRound]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (autoPlay) return;
    setLoading(true);
    setError(null);
    setResult(null);
    await runDrop();
    setLoading(false);
  };

  const startAuto = useCallback(() => {
    if (autoPlay) return;
    setAutoPlay(true);
    setError(null);
    stopRef.current = false;
    setAutoRounds(0);
    const loop = async () => {
      setLoading(true);
      setResult(null);
      const ok = await runDrop();
      setLoading(false);
      setAutoRounds((n) => n + 1);
      if (!ok || stopRef.current) {
        setAutoPlay(false);
        return;
      }
      setTimeout(loop, autoSpeed);
    };
    loop();
  }, [autoPlay, autoSpeed, runDrop]);

  const stopAuto = useCallback(() => {
    stopRef.current = true;
    setAutoPlay(false);
  }, []);

  return (
    <div className="space-y-6">
      <SessionPnLChart series={series} totalPnl={totalPnl} rounds={rounds} onReset={reset} />

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
              disabled={autoPlay}
              className="mt-1 w-full rounded border border-[var(--border)] bg-[var(--bg-matte)] px-3 py-2 disabled:opacity-60"
            />
          </div>
          <div>
            <label className="block text-sm text-[var(--text-secondary)]">Risk</label>
            <select
              value={risk}
              onChange={(e) => setRisk(e.target.value as "low" | "medium" | "high")}
              disabled={autoPlay}
              className="mt-1 w-full rounded border border-[var(--border)] bg-[var(--bg-matte)] px-3 py-2 disabled:opacity-60"
            >
              <option value="low">Low</option>
              <option value="medium">Medium</option>
              <option value="high">High</option>
            </select>
          </div>
          <div className="flex flex-wrap items-center gap-3 pt-2" role="group" aria-label="Play controls">
            <button
              type="submit"
              disabled={loading || autoPlay}
              className="rounded bg-[var(--accent-heart)] px-4 py-2 text-white disabled:opacity-50"
            >
              Drop
            </button>
            <button
              type="button"
              onClick={autoPlay ? stopAuto : startAuto}
              disabled={loading && !autoPlay}
              className="min-w-[120px] rounded border-2 px-4 py-2 font-semibold disabled:opacity-50"
              style={autoPlay
                ? { borderColor: "#ef4444", backgroundColor: "rgba(239,68,68,0.15)", color: "#f87171" }
                : { borderColor: "#22c55e", backgroundColor: "rgba(34,197,94,0.15)", color: "#4ade80" }
              }
            >
              {autoPlay ? `Stop (${autoRounds})` : "▶ Auto Play"}
            </button>
            {autoPlay && (
              <select
                value={autoSpeed}
                onChange={(e) => setAutoSpeed(Number(e.target.value))}
                className="rounded border border-[var(--border)] bg-[var(--bg-matte)] px-2 py-1.5 text-sm text-[var(--text-primary)]"
              >
                {AUTO_SPEEDS.map((ms) => (
                  <option key={ms} value={ms}>
                    {ms === 100 ? "Fast" : ms === 250 ? "Normal" : ms === 500 ? "Slow" : "1s"} ({ms}ms)
                  </option>
                ))}
              </select>
            )}
          </div>
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
    </div>
  );
}

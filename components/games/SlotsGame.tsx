"use client";

import { useState, useRef, useCallback } from "react";
import { useSessionPnL } from "./useSessionPnL";
import { SessionPnLChart } from "@/components/ui/SessionPnLChart";

const AUTO_SPEEDS = [100, 250, 500, 1000] as const;

export function SlotsGame() {
  const [amount, setAmount] = useState(10);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<{
    reels: number[][];
    totalPayout: number;
    balance: number;
  } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [autoPlay, setAutoPlay] = useState(false);
  const [autoSpeed, setAutoSpeed] = useState(250);
  const [autoRounds, setAutoRounds] = useState(0);
  const stopRef = useRef(false);
  const { series, totalPnl, rounds, addRound, reset } = useSessionPnL();

  const runSpin = useCallback(async (): Promise<boolean> => {
    const res = await fetch("/api/games/slots/spin", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ amount }),
    });
    const data = await res.json();
    if (data.success) {
      const totalPayout = data.data.totalPayout ?? 0;
      setResult({
        reels: data.data.reels || [],
        totalPayout,
        balance: data.data.balance ?? 0,
      });
      addRound(amount, totalPayout);
      window.dispatchEvent(new Event("balance-updated"));
      return true;
    }
    setError(data.error || "Failed");
    return false;
  }, [amount, addRound]);

  const spin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (autoPlay) return;
    setLoading(true);
    setError(null);
    setResult(null);
    await runSpin();
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
      const ok = await runSpin();
      setLoading(false);
      setAutoRounds((n) => n + 1);
      if (!ok || stopRef.current) {
        setAutoPlay(false);
        return;
      }
      setTimeout(loop, autoSpeed);
    };
    loop();
  }, [autoPlay, autoSpeed, runSpin]);

  const stopAuto = useCallback(() => {
    stopRef.current = true;
    setAutoPlay(false);
  }, []);

  return (
    <div className="space-y-6">
      <SessionPnLChart series={series} totalPnl={totalPnl} rounds={rounds} onReset={reset} />

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
              disabled={autoPlay}
              className="mt-1 w-full rounded border border-[var(--border)] bg-[var(--bg-matte)] px-3 py-2 disabled:opacity-60"
            />
          </div>
          <div className="flex flex-wrap items-center gap-3 pt-2" role="group" aria-label="Play controls">
            <button
              type="submit"
              disabled={loading || autoPlay}
              className="rounded bg-[var(--accent-heart)] px-4 py-2 text-white disabled:opacity-50"
            >
              Spin
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
            <pre className="text-sm">{JSON.stringify(result.reels, null, 0)}</pre>
            <p>Payout: {result.totalPayout} | Balance: {result.balance}</p>
          </div>
        )}
      </div>
    </div>
  );
}

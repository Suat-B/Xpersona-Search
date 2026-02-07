"use client";

import { useState, useRef, useCallback } from "react";
import { useSessionPnL } from "./useSessionPnL";
import { SessionPnLChart } from "@/components/ui/SessionPnLChart";
import { DiceStrategyPanel } from "@/components/strategies/DiceStrategyPanel";
import type { DiceStrategyConfig } from "@/lib/strategies";

type Result = {
  result: number;
  win: boolean;
  payout: number;
  balance: number;
} | null;

const AUTO_SPEEDS = [100, 250, 500, 1000] as const; // ms between rounds

export function DiceGame() {
  const [amount, setAmount] = useState(10);
  const [target, setTarget] = useState(50);
  const [condition, setCondition] = useState<"over" | "under">("over");
  const [result, setResult] = useState<Result>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [autoPlay, setAutoPlay] = useState(false);
  const [autoSpeed, setAutoSpeed] = useState(250);
  const [autoRounds, setAutoRounds] = useState(0);
  const stopRef = useRef(false);
  const { series, totalPnl, rounds, addRound, reset } = useSessionPnL();

  const loadStrategyConfig = useCallback((config: DiceStrategyConfig) => {
    setAmount(config.amount);
    setTarget(config.target);
    setCondition(config.condition);
  }, []);

  const runBet = useCallback(async (): Promise<boolean> => {
    const res = await fetch("/api/games/dice/bet", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ amount, target, condition }),
    });
    const data = await res.json();
    if (data.success) {
      setResult({
        result: data.data.result,
        win: data.data.win,
        payout: data.data.payout,
        balance: data.data.balance,
      });
      addRound(amount, data.data.payout);
      window.dispatchEvent(new Event("balance-updated"));
      return true;
    }
    setError(data.error || "Something went wrong");
    return false;
  }, [amount, target, condition, addRound]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (autoPlay) return;
    setLoading(true);
    setError(null);
    setResult(null);
    await runBet();
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
      const ok = await runBet();
      setLoading(false);
      setAutoRounds((n) => n + 1);
      if (!ok || stopRef.current) {
        setAutoPlay(false);
        return;
      }
      setTimeout(loop, autoSpeed);
    };
    loop();
  }, [autoPlay, autoSpeed, runBet]);

  const stopAuto = useCallback(() => {
    stopRef.current = true;
    setAutoPlay(false);
  }, []);

  return (
    <div className="space-y-6">
      <SessionPnLChart series={series} totalPnl={totalPnl} rounds={rounds} onReset={reset} />

      <div className="rounded-lg border border-[var(--border)] bg-[var(--bg-card)] p-6">
        <h2 className="mb-4 text-lg font-semibold">Dice</h2>
        <DiceStrategyPanel
          amount={amount}
          target={target}
          condition={condition}
          disabled={autoPlay}
          onLoadConfig={loadStrategyConfig}
          onBalanceUpdate={() => window.dispatchEvent(new Event("balance-updated"))}
        />
        <form onSubmit={submit} className="space-y-4 mt-4">
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
              disabled={autoPlay}
              className="mt-1 w-full rounded border border-[var(--border)] bg-[var(--bg-matte)] px-3 py-2 text-[var(--text-primary)] disabled:opacity-60"
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
              disabled={autoPlay}
              className="mt-1 w-full rounded border border-[var(--border)] bg-[var(--bg-matte)] px-3 py-2 text-[var(--text-primary)] disabled:opacity-60"
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
                  disabled={autoPlay}
                />
                Over
              </label>
              <label className="flex items-center gap-2">
                <input
                  type="radio"
                  name="condition"
                  checked={condition === "under"}
                  onChange={() => setCondition("under")}
                  disabled={autoPlay}
                />
                Under
              </label>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-3 pt-2" role="group" aria-label="Play controls">
            <button
              type="submit"
              disabled={loading || autoPlay}
              className="rounded bg-[var(--accent-heart)] px-4 py-2 font-medium text-white disabled:opacity-50"
            >
              {loading && !autoPlay ? "Rolling..." : "Roll"}
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
    </div>
  );
}

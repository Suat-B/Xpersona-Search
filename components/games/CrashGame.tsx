"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { useSessionPnL } from "./useSessionPnL";
import { SessionPnLChart } from "@/components/ui/SessionPnLChart";

const AUTO_CASHOUT_OPTIONS = [0, 1.2, 1.5, 2, 3, 5] as const; // 0 = manual only

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
  const [autoPlay, setAutoPlay] = useState(false);
  const [autoCashoutAt, setAutoCashoutAt] = useState(1.5);
  const stopRef = useRef(false);
  const lastBetRoundIdRef = useRef<string | null>(null);
  const { series, totalPnl, rounds, addRound, reset } = useSessionPnL();

  const fetchCurrent = useCallback(async () => {
    const res = await fetch("/api/games/crash/rounds/current");
    const data = await res.json();
    if (data.success && data.data) {
      setCurrentRound(data.data);
      return data.data;
    }
    setCurrentRound(null);
    return null;
  }, []);

  useEffect(() => {
    fetchCurrent();
    const t = setInterval(fetchCurrent, 500);
    return () => clearInterval(t);
  }, [fetchCurrent]);

  const placeBet = async (e?: React.FormEvent) => {
    e?.preventDefault();
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
      lastBetRoundIdRef.current = currentRound?.roundId ?? null;
      setCurrentRound((prev) => (prev ? { ...prev, myBet: { amount } } : null));
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
      const payout = data.data.payout ?? 0;
      addRound(amount, payout);
      lastBetRoundIdRef.current = null;
      setMessage(`Cashed out at ${data.data.cashedOutAt}x. Payout: ${payout}`);
      window.dispatchEvent(new Event("balance-updated"));
      fetchCurrent();
    } else {
      setMessage(data.error || "Failed");
    }
  };

  // Auto: place bet when round running and no bet; auto cash out at target
  useEffect(() => {
    if (!autoPlay || stopRef.current) return;
    const interval = setInterval(async () => {
      const res = await fetch("/api/games/crash/rounds/current");
      const data = await res.json();
      const round = data.success ? data.data : null;

      if (round) setCurrentRound(round);

      if (!round) return;

      const hadBetOn = lastBetRoundIdRef.current;
      if (hadBetOn && round.roundId !== hadBetOn) {
        addRound(amount, 0);
        lastBetRoundIdRef.current = null;
      }

      if (round.status === "running") {
        if (!round.myBet) {
          const betRes = await fetch("/api/games/crash/rounds/current/bet", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ amount }),
          });
          const betData = await betRes.json();
          if (betData.success) {
            setBalance(betData.data.balance);
            lastBetRoundIdRef.current = round.roundId;
            setCurrentRound((prev) => (prev ? { ...prev, myBet: { amount } } : null));
          }
        } else if (
          autoCashoutAt > 0 &&
          round.currentMultiplier >= autoCashoutAt
        ) {
          const cashRes = await fetch(`/api/games/crash/rounds/${round.roundId}/cashout`, {
            method: "POST",
          });
          const cashData = await cashRes.json();
          if (cashData.success) {
            setBalance(cashData.data.balance);
            addRound(amount, cashData.data.payout ?? 0);
            lastBetRoundIdRef.current = null;
            window.dispatchEvent(new Event("balance-updated"));
            fetchCurrent();
          }
        }
      }
    }, 300);
    return () => clearInterval(interval);
  }, [autoPlay, amount, autoCashoutAt, addRound, fetchCurrent]);

  const startAuto = useCallback(() => {
    stopRef.current = false;
    setAutoPlay(true);
  }, []);

  const stopAuto = useCallback(() => {
    stopRef.current = true;
    setAutoPlay(false);
  }, []);

  return (
    <div className="space-y-6">
      <SessionPnLChart series={series} totalPnl={totalPnl} rounds={rounds} onReset={reset} />

      <div className="rounded-lg border border-[var(--border)] bg-[var(--bg-card)] p-6">
        <h2 className="mb-4 text-lg font-semibold">Crash</h2>
        <p className="mb-2 text-2xl font-bold">
          Multiplier: {currentRound?.currentMultiplier?.toFixed(2) ?? "—"}
        </p>
        <p className="mb-4 text-sm text-[var(--text-secondary)]">
          Status: {currentRound?.status ?? "waiting"}
        </p>
        <form onSubmit={placeBet} className="mb-4 flex flex-wrap items-center gap-2">
          <input
            type="number"
            min={1}
            value={amount}
            onChange={(e) => setAmount(Number(e.target.value))}
            disabled={autoPlay}
            className="rounded border border-[var(--border)] bg-[var(--bg-matte)] px-3 py-2 disabled:opacity-60"
          />
          <button
            type="submit"
            disabled={loading || currentRound?.status !== "running" || !!currentRound?.myBet || autoPlay}
            className="rounded bg-[var(--accent-heart)] px-4 py-2 text-white disabled:opacity-50"
          >
            Place bet
          </button>
          <button
            type="button"
            onClick={autoPlay ? stopAuto : startAuto}
            className="min-w-[120px] rounded border-2 px-4 py-2 font-semibold"
            style={autoPlay
              ? { borderColor: "#ef4444", backgroundColor: "rgba(239,68,68,0.15)", color: "#f87171" }
              : { borderColor: "#22c55e", backgroundColor: "rgba(34,197,94,0.15)", color: "#4ade80" }
            }
          >
            {autoPlay ? "Stop Auto" : "▶ Auto Play"}
          </button>
          {autoPlay && (
            <select
              value={autoCashoutAt}
              onChange={(e) => setAutoCashoutAt(Number(e.target.value))}
              className="rounded border border-[var(--border)] bg-[var(--bg-matte)] px-2 py-1.5 text-sm"
            >
              {AUTO_CASHOUT_OPTIONS.map((x) => (
                <option key={x} value={x}>
                  {x === 0 ? "Manual cash out" : `Auto @ ${x}x`}
                </option>
              ))}
            </select>
          )}
        </form>
        {currentRound?.myBet && currentRound.status === "running" && !autoPlay && (
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
    </div>
  );
}

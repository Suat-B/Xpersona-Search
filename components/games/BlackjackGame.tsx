"use client";

import { useState, useRef, useCallback } from "react";
import { useSessionPnL } from "./useSessionPnL";
import { SessionPnLChart } from "@/components/ui/SessionPnLChart";

const AUTO_SPEEDS = [200, 500, 1000, 2000] as const;

function handValue(cards: string[]): number {
  let sum = 0;
  let aces = 0;
  for (const c of cards) {
    const rank = c.slice(0, -1);
    if (rank === "A") {
      aces++;
      sum += 11;
    } else if (["K", "Q", "J"].includes(rank)) sum += 10;
    else sum += parseInt(rank, 10) || 0;
  }
  while (sum > 21 && aces > 0) {
    sum -= 10;
    aces--;
  }
  return sum;
}

export function BlackjackGame() {
  const [amount, setAmount] = useState(10);
  const [loading, setLoading] = useState(false);
  const [roundId, setRoundId] = useState<string | null>(null);
  const [playerHand, setPlayerHand] = useState<string[]>([]);
  const [dealerUp, setDealerUp] = useState("");
  const [status, setStatus] = useState("");
  const [balance, setBalance] = useState<number | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [autoPlay, setAutoPlay] = useState(false);
  const [autoSpeed, setAutoSpeed] = useState(500);
  const [autoRounds, setAutoRounds] = useState(0);
  const stopRef = useRef(false);
  const { series, totalPnl, rounds, addRound, reset } = useSessionPnL();

  const startRound = async (e?: React.FormEvent) => {
    e?.preventDefault();
    if (autoPlay && !e) return;
    setLoading(true);
    setMessage(null);
    const res = await fetch("/api/games/blackjack/round", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ amount }),
    });
    const data = await res.json();
    setLoading(false);
    if (data.success) {
      setRoundId(data.data.roundId);
      const hands = data.data.playerHands ?? data.data.playerHand;
      const single = Array.isArray(hands?.[0]) ? hands[0] : hands ?? [];
      setPlayerHand(single);
      setDealerUp(data.data.dealerUp || "");
      setStatus(data.data.status || "active");
      setBalance(data.data.balance ?? null);
      if (data.data.status === "settled") {
        setMessage(`Outcome: ${data.data.outcome}. Payout: ${data.data.payout}`);
        addRound(amount, data.data.payout ?? 0);
        setRoundId(null);
      }
    } else setMessage(data.error || "Failed");
  };

  const action = async (actionName: string) => {
    if (!roundId) return;
    setLoading(true);
    setMessage(null);
    const res = await fetch(`/api/games/blackjack/round/${roundId}/action`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: actionName }),
    });
    const data = await res.json();
    setLoading(false);
    if (data.success) {
      const hands = data.data.playerHands ?? data.data.playerHand;
      const single = Array.isArray(hands?.[0]) ? hands[0] : hands ?? playerHand;
      setPlayerHand(single);
      setDealerUp(data.data.dealerUp ?? data.data.dealerHand?.[0] ?? dealerUp);
      setStatus(data.data.status ?? status);
      setBalance(data.data.balance ?? balance ?? null);
      if (data.data.status === "settled") {
        const payout = data.data.payout ?? 0;
        setMessage(`Outcome: ${data.data.outcome}. Payout: ${payout}`);
        addRound(amount, payout);
        setRoundId(null);
        window.dispatchEvent(new Event("balance-updated"));
      }
      return data;
    }
    setMessage(data.error || "Failed");
    return null;
  };

  const runAutoRound = useCallback(async (): Promise<boolean> => {
    const res = await fetch("/api/games/blackjack/round", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ amount }),
    });
    const data = await res.json();
    if (!data.success) {
      setMessage(data.error || "Failed");
      return false;
    }
    let rid = data.data.roundId;
    let currentStatus = data.data.status;
    let playerHands = data.data.playerHands ?? data.data.playerHand;
    let betAmount = amount;

    if (currentStatus === "settled") {
      addRound(amount, data.data.payout ?? 0);
      return true;
    }

    while (currentStatus === "active" && !stopRef.current) {
      const hand = Array.isArray(playerHands?.[0]) ? playerHands[0] : playerHands ?? [];
      const value = handValue(hand);
      const act = value < 17 ? "hit" : "stand";
      const actRes = await fetch(`/api/games/blackjack/round/${rid}/action`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: act }),
      });
      const actData = await actRes.json();
      if (!actData.success) {
        setMessage(actData.error || "Failed");
        return false;
      }
      currentStatus = actData.data.status;
      playerHands = actData.data.playerHands ?? actData.data.playerHand;
      if (actData.data.payout !== undefined) betAmount = amount;
      if (currentStatus === "settled") {
        const payout = actData.data.payout ?? 0;
        addRound(amount, payout);
        setBalance(actData.data.balance ?? null);
        setMessage(`Auto: ${actData.data.outcome}. Payout: ${payout}`);
        break;
      }
    }
    return true;
  }, [amount, addRound]);

  const startAuto = useCallback(() => {
    if (autoPlay || roundId) return;
    setAutoPlay(true);
    setMessage(null);
    stopRef.current = false;
    setAutoRounds(0);
    const loop = async () => {
      setLoading(true);
      setRoundId(null);
      const ok = await runAutoRound();
      setLoading(false);
      setAutoRounds((n) => n + 1);
      if (!ok || stopRef.current) {
        setAutoPlay(false);
        return;
      }
      setTimeout(loop, autoSpeed);
    };
    loop();
  }, [autoPlay, roundId, autoSpeed, runAutoRound]);

  const stopAuto = useCallback(() => {
    stopRef.current = true;
    setAutoPlay(false);
  }, []);

  return (
    <div className="space-y-6">
      <SessionPnLChart series={series} totalPnl={totalPnl} rounds={rounds} onReset={reset} />

      <div className="rounded-lg border border-[var(--border)] bg-[var(--bg-card)] p-6">
        <h2 className="mb-4 text-lg font-semibold">Blackjack</h2>
        {!roundId ? (
          <form onSubmit={startRound} className="space-y-4">
            <div>
              <label htmlFor="bj-amount" className="block text-sm text-[var(--text-secondary)]">Bet amount</label>
              <input
                id="bj-amount"
                type="number"
                min={1}
                value={amount}
                onChange={(e) => setAmount(Number(e.target.value))}
                disabled={autoPlay}
                className="mt-1 w-full rounded border border-[var(--border)] bg-[var(--bg-matte)] px-3 py-2 disabled:opacity-60"
              />
            </div>
            <div className="flex flex-wrap items-center gap-3 pt-2" role="group" aria-label="Play controls">
              <button type="submit" disabled={loading || autoPlay} className="rounded bg-[var(--accent-heart)] px-4 py-2 text-white disabled:opacity-50">
                Deal
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
                    <option key={ms} value={ms}>{ms}ms</option>
                  ))}
                </select>
              )}
            </div>
          </form>
        ) : (
          <div className="space-y-4">
            <p>Your hand: {playerHand.join(", ")}</p>
            <p>Dealer: {dealerUp}</p>
            <p>Status: {status}</p>
            {balance != null && <p>Balance: {balance}</p>}
            {status === "active" && (
              <div className="flex gap-2">
                <button type="button" onClick={() => action("hit")} disabled={loading} className="rounded border px-3 py-1 disabled:opacity-50">Hit</button>
                <button type="button" onClick={() => action("stand")} disabled={loading} className="rounded border px-3 py-1 disabled:opacity-50">Stand</button>
                <button type="button" onClick={() => action("double")} disabled={loading} className="rounded border px-3 py-1 disabled:opacity-50">Double</button>
                <button type="button" onClick={() => action("split")} disabled={loading} className="rounded border px-3 py-1 disabled:opacity-50">Split</button>
              </div>
            )}
          </div>
        )}
        {message && <p className="mt-4 text-sm" aria-live="polite">{message}</p>}
      </div>
    </div>
  );
}

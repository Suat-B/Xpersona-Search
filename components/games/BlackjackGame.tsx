"use client";

import { useState } from "react";

export function BlackjackGame() {
  const [amount, setAmount] = useState(10);
  const [loading, setLoading] = useState(false);
  const [roundId, setRoundId] = useState<string | null>(null);
  const [playerHand, setPlayerHand] = useState<string[]>([]);
  const [dealerUp, setDealerUp] = useState("");
  const [status, setStatus] = useState("");
  const [balance, setBalance] = useState<number | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const startRound = async (e: React.FormEvent) => {
    e.preventDefault();
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
      setPlayerHand(data.data.playerHand || []);
      setDealerUp(data.data.dealerUp || "");
      setStatus(data.data.status || "active");
      setBalance(data.data.balance ?? null);
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
      setPlayerHand(Array.isArray(hands?.[0]) ? hands[0] : hands ?? playerHand);
      setDealerUp(data.data.dealerUp ?? data.data.dealerHand?.[0] ?? dealerUp);
      setStatus(data.data.status ?? status);
      setBalance(data.data.balance ?? balance);
      if (data.data.status === "settled") {
        setMessage(`Outcome: ${data.data.outcome}. Payout: ${data.data.payout}`);
        setRoundId(null);
      }
    } else setMessage(data.error || "Failed");
  };

  return (
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
              className="mt-1 w-full rounded border border-[var(--border)] bg-[var(--bg-matte)] px-3 py-2"
            />
          </div>
          <button type="submit" disabled={loading} className="rounded bg-[var(--accent-heart)] px-4 py-2 text-white disabled:opacity-50">Deal</button>
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
  );
}

"use client";

/**
 * Client-side bet executor for StrategyExecutionEngine.
 * Places real dice bets via POST /api/games/dice/bet (credentials from the page).
 */

import type { ExecutionSession, RoundResult, IBetExecutor } from "./strategy-engine";

export function createClientBetExecutor(): IBetExecutor {
  return {
    async executeBet(
      session: ExecutionSession,
      amount: number,
      target: number,
      condition: string
    ): Promise<RoundResult> {
      const roundIndex = session.currentRound + 1;
      const res = await fetch("/api/games/dice/bet", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ amount, target, condition }),
      });
      const data = await res.json();
      if (!data.success || !data.data) {
        const msg = data.error || data.message || "Bet failed";
        throw new Error(msg);
      }
      const d = data.data;
      return {
        round: roundIndex,
        result: d.result,
        win: d.win,
        payout: d.payout,
        betAmount: amount,
        target,
        condition,
        balance: d.balance,
        decision: { amount, target, condition },
        timestamp: new Date(),
      };
    },
  };
}

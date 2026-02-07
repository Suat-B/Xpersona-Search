"use client";

/**
 * Client-side bet executor for StrategyExecutionEngine.
 * Places real dice bets via POST /api/games/dice/bet (credentials from the page).
 * Coerces decision values to API schema (integer amount, 0–100 target, "over"|"under") so
 * Python strategy output (e.g. float amount) never causes VALIDATION_ERROR.
 */

import type { ExecutionSession, RoundResult, IBetExecutor } from "./strategy-engine";
import { MIN_BET, MAX_BET } from "./constants";

function coerceDiceBetParams(
  amount: number,
  target: number,
  condition: string
): { amount: number; target: number; condition: "over" | "under" } {
  const amountInt = Math.floor(Number(amount));
  const amountClamped = Math.max(MIN_BET, Math.min(MAX_BET, amountInt));
  const targetNum = Number(target);
  const targetClamped = Math.max(0, Math.min(100, Number.isNaN(targetNum) ? 50 : targetNum));
  const cond =
    String(condition).toLowerCase() === "under" ? "under" : "over";
  return {
    amount: amountClamped,
    target: targetClamped,
    condition: cond,
  };
}

export function createClientBetExecutor(): IBetExecutor {
  return {
    async executeBet(
      session: ExecutionSession,
      amount: number,
      target: number,
      condition: string
    ): Promise<RoundResult> {
      const { amount: a, target: t, condition: c } = coerceDiceBetParams(
        amount,
        target,
        condition
      );
      const roundIndex = session.currentRound + 1;
      const res = await fetch("/api/games/dice/bet", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ amount: a, target: t, condition: c }),
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
        betAmount: a,
        target: t,
        condition: c,
        balance: d.balance,
        decision: { amount: a, target: t, condition: c },
        timestamp: new Date(),
      };
    },
  };
}

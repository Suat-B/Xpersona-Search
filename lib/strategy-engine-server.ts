/**
 * Server-side bet executor for StrategyExecutionEngine.
 * Uses DB and executeDiceRound; only import this on the server.
 */

import type { ExecutionSession, RoundResult, IBetExecutor } from "./strategy-engine";
import { executeDiceRound } from "./games/execute-dice";

export function createServerBetExecutor(): IBetExecutor {
  return {
    async executeBet(
      session: ExecutionSession,
      amount: number,
      target: number,
      condition: string
    ): Promise<RoundResult> {
      const roundIndex = session.currentRound + 1;
      const outcome = await executeDiceRound(
        session.userId,
        amount,
        target,
        condition as "over" | "under"
      );
      return {
        round: roundIndex,
        result: outcome.result,
        win: outcome.win,
        payout: outcome.payout,
        betAmount: amount,
        target,
        condition,
        balance: outcome.balance,
        decision: { amount, target, condition },
        timestamp: new Date(),
      };
    },
  };
}

/**
 * Strategy Execution Engine
 * Handles autonomous strategy execution with safety controls.
 * Uses an injected IBetExecutor so it can run in browser (client executor) or server (server executor).
 */

import type { StrategyRuntime, CasinoBridge } from "./python-runtime";
import { DICE_HOUSE_EDGE, MIN_BET, MAX_BET } from "./constants";

export interface ExecutionSession {
  id: string;
  strategyId: string;
  userId: string;
  status: "running" | "stopped" | "completed" | "error";
  currentRound: number;
  currentBalance: number;
  initialBalance: number;
  sessionPnl: number;
  results: RoundResult[];
  stopReason?: string;
  error?: string;
  startedAt: Date;
  stoppedAt?: Date;
}

export interface RoundResult {
  round: number;
  result: number;
  win: boolean;
  payout: number;
  betAmount: number;
  target: number;
  condition: string;
  balance: number;
  decision: Record<string, unknown>;
  timestamp: Date;
}

export interface StopConditions {
  maxRounds?: number;
  maxLossAmount?: number;
  maxLossPercentage?: number;
  targetProfitAmount?: number;
  targetProfitPercentage?: number;
  consecutiveLosses?: number;
  maxTimeSeconds?: number;
}

/** Injected dependency: executes one bet and returns the round result. Used for both client (fetch API) and server (DB). */
export interface IBetExecutor {
  executeBet(
    session: ExecutionSession,
    amount: number,
    target: number,
    condition: string
  ): Promise<RoundResult>;
}

export interface StartSessionOptions {
  strategyId: string;
  userId: string;
  initialBalance: number;
  stopConditions: StopConditions;
  speedMs?: number;
  /** Required: Python strategy code (client fetches via GET strategy, then passes here). */
  pythonCode: string;
}

export class StrategyExecutionEngine {
  private runtime: StrategyRuntime;
  private betExecutor: IBetExecutor;
  private sessions: Map<string, ExecutionSession> = new Map();
  private abortControllers: Map<string, AbortController> = new Map();

  constructor(runtime: StrategyRuntime, betExecutor: IBetExecutor) {
    this.runtime = runtime;
    this.betExecutor = betExecutor;
  }

  async startSession(opts: StartSessionOptions): Promise<ExecutionSession> {
    const { strategyId, userId, initialBalance, stopConditions, speedMs = 100, pythonCode } = opts;
    if (!pythonCode || !pythonCode.trim()) {
      throw new Error("pythonCode is required");
    }

    const validation = await this.runtime.loadStrategy(pythonCode);
    if (!validation.valid) {
      throw new Error(`Strategy validation failed: ${validation.error}`);
    }

    const sessionId = crypto.randomUUID();
    const session: ExecutionSession = {
      id: sessionId,
      strategyId,
      userId,
      status: "running",
      currentRound: 0,
      currentBalance: initialBalance,
      initialBalance,
      sessionPnl: 0,
      results: [],
      startedAt: new Date(),
    };

    this.sessions.set(sessionId, session);
    const abortController = new AbortController();
    this.abortControllers.set(sessionId, abortController);

    this.runSession(session, pythonCode, stopConditions, speedMs, abortController.signal);
    return session;
  }

  private async runSession(
    session: ExecutionSession,
    pythonCode: string,
    stopConditions: StopConditions,
    speedMs: number,
    signal: AbortSignal
  ) {
    let state: Record<string, unknown> | null = null;
    const startTime = Date.now();

    try {
      while (session.status === "running") {
        if (signal.aborted) {
          this.stopSession(session.id, "aborted");
          break;
        }

        if (stopConditions.maxTimeSeconds) {
          const elapsedSeconds = (Date.now() - startTime) / 1000;
          if (elapsedSeconds >= stopConditions.maxTimeSeconds) {
            this.stopSession(session.id, "max_time_reached");
            break;
          }
        }

        if (stopConditions.maxRounds && session.currentRound >= stopConditions.maxRounds) {
          this.stopSession(session.id, "max_rounds_reached");
          break;
        }

        if (stopConditions.maxLossAmount && session.sessionPnl <= -stopConditions.maxLossAmount) {
          this.stopSession(session.id, "max_loss_amount_reached");
          break;
        }

        if (stopConditions.maxLossPercentage) {
          const maxLoss = session.initialBalance * (stopConditions.maxLossPercentage / 100);
          if (session.sessionPnl <= -maxLoss) {
            this.stopSession(session.id, "max_loss_percentage_reached");
            break;
          }
        }

        if (stopConditions.targetProfitAmount && session.sessionPnl >= stopConditions.targetProfitAmount) {
          this.stopSession(session.id, "target_profit_reached");
          break;
        }

        if (stopConditions.targetProfitPercentage) {
          const targetProfit = session.initialBalance * (stopConditions.targetProfitPercentage / 100);
          if (session.sessionPnl >= targetProfit) {
            this.stopSession(session.id, "target_profit_percentage_reached");
            break;
          }
        }

        if (stopConditions.consecutiveLosses) {
          const recentLosses = this.getConsecutiveLosses(session);
          if (recentLosses >= stopConditions.consecutiveLosses) {
            this.stopSession(session.id, "consecutive_losses_reached");
            break;
          }
        }

        const bridge: CasinoBridge = {
          get_balance: () => session.currentBalance,
          get_history: (n: number) =>
            session.results.slice(-n).map((r) => ({
              result: r.result,
              win: r.win,
              payout: r.payout,
              bet_amount: r.betAmount,
            })),
          place_bet: async () => ({}),
          notify: (message: string) => {
            console.log(`[Session ${session.id}] ${message}`);
          },
          calculate_odds: (target: number, condition: string) => {
            const probability =
              condition === "over" ? (100 - target) / 100 : target / 100;
            return {
              win_probability: probability * 100,
              multiplier: (1 - DICE_HOUSE_EDGE) / probability,
            };
          },
          get_round_number: () => session.currentRound + 1,
          get_initial_balance: () => session.initialBalance,
          get_session_pnl: () => session.sessionPnl,
          get_limits: () => ({
            min_bet: MIN_BET,
            max_bet: MAX_BET,
            house_edge: DICE_HOUSE_EDGE,
            target_min: 0,
            target_max: 99.99,
          }),
          get_last_result: () => {
            const last = session.results[session.results.length - 1];
            if (!last) return null;
            return {
              result: last.result,
              win: last.win,
              payout: last.payout,
              bet_amount: last.betAmount,
            };
          },
        };

        const executionResult = await this.runtime.executeRound(
          pythonCode,
          bridge,
          state
        );

        if (!executionResult.success) {
          session.status = "error";
          session.error = executionResult.error;
          break;
        }

        if (
          executionResult.shouldStop ||
          executionResult.decision?.action === "stop"
        ) {
          this.stopSession(
            session.id,
            executionResult.decision?.reason || "strategy_stop"
          );
          break;
        }

        const decision = executionResult.decision;
        if (decision && decision.action === "bet") {
          const result = await this.betExecutor.executeBet(
            session,
            decision.amount,
            decision.target,
            decision.condition
          );

          session.results.push(result);
          session.currentBalance = result.balance;
          session.sessionPnl = session.currentBalance - session.initialBalance;
          session.currentRound++;

          state = (executionResult.state as Record<string, unknown>) ?? null;
          if (state) {
            state._last_result = {
              result: result.result,
              win: result.win,
              payout: result.payout,
            };
          }

          const completeResult = await this.runtime.executeRoundComplete(
            pythonCode,
            bridge,
            state,
            {
              result: result.result,
              win: result.win,
              payout: result.payout,
              balance: result.balance,
            }
          );
          if (completeResult.success && completeResult.state != null) {
            state = completeResult.state;
          }
        }

        if (speedMs > 0) {
          await this.delay(speedMs);
        }
      }
    } catch (error) {
      session.status = "error";
      session.error = error instanceof Error ? error.message : String(error);
    }

    session.stoppedAt = new Date();
  }

  stopSession(sessionId: string, reason: string): ExecutionSession | null {
    const session = this.sessions.get(sessionId);
    if (!session) return null;

    const controller = this.abortControllers.get(sessionId);
    if (controller) {
      controller.abort();
      this.abortControllers.delete(sessionId);
    }

    session.status = "stopped";
    session.stopReason = reason;
    session.stoppedAt = new Date();
    return session;
  }

  getSession(sessionId: string): ExecutionSession | null {
    return this.sessions.get(sessionId) ?? null;
  }

  getUserSessions(userId: string): ExecutionSession[] {
    return Array.from(this.sessions.values()).filter(
      (s) => s.userId === userId && s.status === "running"
    );
  }

  private getConsecutiveLosses(session: ExecutionSession): number {
    let count = 0;
    for (let i = session.results.length - 1; i >= 0; i--) {
      if (!session.results[i].win) count++;
      else break;
    }
    return count;
  }

  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}

export default StrategyExecutionEngine;

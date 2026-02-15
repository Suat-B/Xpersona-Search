/**
 * AI Strategy Harvest — captures every strategy AI agents create or run
 * for data collection and training purposes.
 */

import { db } from "@/lib/db";
import { aiStrategyHarvest } from "@/lib/db/schema";

const STRATEGY_HARVEST_ENABLED =
  process.env.STRATEGY_HARVEST_ENABLED !== "false";

export type HarvestSource = "create" | "run";
export type HarvestStrategyType = "advanced" | "basic";

export type HarvestParams = {
  userId: string;
  agentId: string;
  source: HarvestSource;
  strategyType: HarvestStrategyType;
  strategySnapshot: Record<string, unknown>;
  strategyId?: string | null;
  executionOutcome?: {
    sessionPnl?: number;
    roundsPlayed?: number;
    totalWins?: number;
    totalLosses?: number;
    winRate?: number;
    stoppedReason?: string;
  } | null;
};

/**
 * Inserts one row into ai_strategy_harvest. Fire-and-forget; never throws
 * into the main request path. Catches and logs any DB errors.
 */
export function harvestStrategyForTraining(params: HarvestParams): void {
  if (!STRATEGY_HARVEST_ENABLED) return;

  void db
    .insert(aiStrategyHarvest)
    .values({
      userId: params.userId,
      agentId: params.agentId,
      source: params.source,
      strategyType: params.strategyType,
      strategySnapshot: params.strategySnapshot,
      strategyId: params.strategyId ?? null,
      executionOutcome: params.executionOutcome ?? null,
    })
    .catch((err) => {
      console.error("[ai-strategy-harvest] Failed to harvest:", err);
    });
}

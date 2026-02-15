/**
 * Discovery data builder — single source of truth for /api/discovery and xpersona_get_discovery.
 * Used by both REST and OpenClaw tool so AI gets identical schema from either path.
 */

import {
  TRIGGER_INFO,
  ACTION_INFO,
  STRATEGY_PRESETS,
  type TriggerType,
  type ActionType,
} from "@/lib/advanced-strategy-types";
import {
  FAUCET_AMOUNT,
  FAUCET_COOLDOWN_SECONDS,
  MIN_BET,
  MAX_BET,
  DICE_HOUSE_EDGE,
  DICE_MAX_MULTIPLIER,
  DEPOSIT_ALERT_LOW,
  DEPOSIT_ALERT_CRITICAL,
  BALANCE_MILESTONES,
  CREDITS_TO_USD,
  WITHDRAW_MIN_CREDITS,
} from "@/lib/constants";

const MAX_ROUNDS_PER_RUN = 100_000;

export type DiscoverySection = "strategy_builder" | "game_mechanics" | "platform" | "all";

export function buildDiscoveryData(section: DiscoverySection = "all") {
  const strategyBuilder = {
    triggers: (
      Object.entries(TRIGGER_INFO) as [TriggerType, (typeof TRIGGER_INFO)[TriggerType]][]
    ).map(([type, info]) => ({
      type,
      label: info.label,
      description: info.description,
      needsValue: info.needsValue,
      valueLabel: info.valueLabel,
      valueType: type === "pattern_win_loss" ? "pattern" : "number",
    })),
    actions: (Object.entries(ACTION_INFO) as [ActionType, (typeof ACTION_INFO)[ActionType]][])
      .map(([type, info]) => ({
        type,
        label: info.label,
        description: info.description,
        needsValue: info.needsValue,
        valueLabel: info.valueLabel,
        defaultValue: info.defaultValue,
      })),
    globalLimits: {
      maxBet: { type: "number", description: "Maximum bet amount", min: 1, max: MAX_BET },
      minBet: { type: "number", description: "Minimum bet amount", min: 1, max: MAX_BET },
      maxRounds: { type: "number", description: "Maximum rounds before stop" },
      stopIfBalanceBelow: { type: "number", description: "Stop when balance falls below" },
      stopIfBalanceAbove: { type: "number", description: "Stop when balance exceeds" },
      stopOnConsecutiveLosses: {
        type: "number",
        description: "Stop after N consecutive losses",
      },
      stopOnConsecutiveWins: { type: "number", description: "Stop after N consecutive wins" },
      stopOnProfitAbove: { type: "number", description: "Stop when session profit exceeds" },
      stopOnLossAbove: { type: "number", description: "Stop when session loss exceeds" },
    },
    ruleSchema: {
      trigger: {
        type: "object",
        properties: { type: "string", value: "number", value2: "number", pattern: "string" },
      },
      action: {
        type: "object",
        properties: { type: "string", value: "number", targetRuleId: "string" },
      },
      cooldownRounds: { type: "number", description: "Rounds before rule can trigger again" },
      maxExecutions: { type: "number", description: "Max times rule can execute per run" },
    },
    executionModes: ["sequential", "all_matching"] as const,
    presets: STRATEGY_PRESETS.map((p) => ({
      id: p.id,
      name: p.name,
      description: p.description,
      strategy: p.strategy,
    })),
  };

  const gameMechanics = {
    dice: {
      houseEdge: DICE_HOUSE_EDGE,
      minBet: MIN_BET,
      maxBet: MAX_BET,
      maxMultiplier: DICE_MAX_MULTIPLIER,
      targetRange: [0, 99.99] as [number, number],
      conditions: ["over", "under"] as const,
      winProbabilityFormula:
        "over X → (100-X)/100; under X → X/100. Example: over 50 = 49% win chance.",
      multiplierFormula:
        "(1 - houseEdge) / winProbability. Example: over 50 ≈ 1.98x payout.",
      provablyFair: {
        formula:
          "value = (parseInt(SHA256(serverSeed + clientSeed + ':' + nonce).slice(0, 8), 16) / 0x100000000) * 100",
        description: "Dice value in [0, 100) from deterministic hash.",
      },
    },
  };

  const platform = {
    faucet: {
      amount: FAUCET_AMOUNT,
      cooldownSeconds: FAUCET_COOLDOWN_SECONDS,
    },
    depositAlerts: {
      low: DEPOSIT_ALERT_LOW,
      critical: DEPOSIT_ALERT_CRITICAL,
      minBet: MIN_BET,
    },
    balanceMilestones: [...BALANCE_MILESTONES],
    withdrawal: {
      minCredits: WITHDRAW_MIN_CREDITS,
      creditsToUsd: CREDITS_TO_USD,
    },
    limits: {
      maxRoundsPerRun: MAX_ROUNDS_PER_RUN,
      maxBet: MAX_BET,
      minBet: MIN_BET,
    },
  };

  if (section === "strategy_builder") return { strategyBuilder };
  if (section === "game_mechanics") return { gameMechanics };
  if (section === "platform") return { platform };
  return { strategyBuilder, gameMechanics, platform };
}

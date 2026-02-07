/**
 * Strategy config types and validation per game.
 * Used by API (CRUD + run-strategy) and OpenClaw.
 */

export const GAME_TYPES = ["dice", "blackjack", "plinko", "crash", "slots"] as const;
export type GameType = (typeof GAME_TYPES)[number];

export type DiceStrategyConfig = {
  amount: number;
  target: number;
  condition: "over" | "under";
  stopAfterRounds?: number;
  stopIfBalanceBelow?: number;
  stopIfBalanceAbove?: number;
};

export type BlackjackStrategyConfig = {
  amount: number;
  hitUntil?: number; // stand when hand >= this (default 17)
  doubleOn11?: boolean;
  stopAfterRounds?: number;
  stopIfBalanceBelow?: number;
  stopIfBalanceAbove?: number;
};

export type PlinkoStrategyConfig = {
  amount: number;
  risk: "low" | "medium" | "high";
  stopAfterRounds?: number;
  stopIfBalanceBelow?: number;
  stopIfBalanceAbove?: number;
};

export type CrashStrategyConfig = {
  amount: number;
  autoCashoutAt?: number; // 0 = manual only
  stopAfterRounds?: number;
  stopIfBalanceBelow?: number;
  stopIfBalanceAbove?: number;
};

export type SlotsStrategyConfig = {
  amount: number;
  stopAfterRounds?: number;
  stopIfBalanceBelow?: number;
  stopIfBalanceAbove?: number;
};

export type StrategyConfig =
  | DiceStrategyConfig
  | BlackjackStrategyConfig
  | PlinkoStrategyConfig
  | CrashStrategyConfig
  | SlotsStrategyConfig;

export function validateDiceConfig(c: unknown): c is DiceStrategyConfig {
  if (!c || typeof c !== "object") return false;
  const o = c as Record<string, unknown>;
  return (
    typeof o.amount === "number" &&
    o.amount >= 1 &&
    typeof o.target === "number" &&
    o.target >= 0 &&
    o.target < 100 &&
    (o.condition === "over" || o.condition === "under")
  );
}

export function validateBlackjackConfig(c: unknown): c is BlackjackStrategyConfig {
  if (!c || typeof c !== "object") return false;
  const o = c as Record<string, unknown>;
  return typeof o.amount === "number" && o.amount >= 1;
}

export function validatePlinkoConfig(c: unknown): c is PlinkoStrategyConfig {
  if (!c || typeof c !== "object") return false;
  const o = c as Record<string, unknown>;
  return (
    typeof o.amount === "number" &&
    o.amount >= 1 &&
    (o.risk === "low" || o.risk === "medium" || o.risk === "high")
  );
}

export function validateCrashConfig(c: unknown): c is CrashStrategyConfig {
  if (!c || typeof c !== "object") return false;
  const o = c as Record<string, unknown>;
  return typeof o.amount === "number" && o.amount >= 1;
}

export function validateSlotsConfig(c: unknown): c is SlotsStrategyConfig {
  if (!c || typeof c !== "object") return false;
  const o = c as Record<string, unknown>;
  return typeof o.amount === "number" && o.amount >= 1;
}

export function validateStrategyConfig(
  gameType: GameType,
  config: unknown
): config is StrategyConfig {
  switch (gameType) {
    case "dice":
      return validateDiceConfig(config);
    case "blackjack":
      return validateBlackjackConfig(config);
    case "plinko":
      return validatePlinkoConfig(config);
    case "crash":
      return validateCrashConfig(config);
    case "slots":
      return validateSlotsConfig(config);
    default:
      return false;
  }
}

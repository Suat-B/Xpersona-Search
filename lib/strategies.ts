/**
 * Strategy config types and validation per game.
 * Used by API (CRUD + run-strategy) and OpenClaw.
 */

export const GAME_TYPES = ["dice"] as const;
export type GameType = (typeof GAME_TYPES)[number];

export const DICE_PROGRESSION_TYPES = [
  "flat",
  "martingale",
  "paroli",
  "dalembert",
  "fibonacci",
  "labouchere",
  "oscar",
  "kelly",
] as const;
export type DiceProgressionType = (typeof DICE_PROGRESSION_TYPES)[number];

export type DiceStrategyConfig = {
  amount: number;
  target: number;
  condition: "over" | "under";
  progressionType?: DiceProgressionType;
  maxBet?: number;
  maxConsecutiveLosses?: number;
  maxConsecutiveWins?: number;
  unitStep?: number;
  stopAfterRounds?: number;
  stopIfBalanceBelow?: number;
  stopIfBalanceAbove?: number;
};

export type StrategyConfig = DiceStrategyConfig;

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

export function validateStrategyConfig(
  gameType: GameType,
  config: unknown
): config is StrategyConfig {
  return gameType === "dice" && validateDiceConfig(config);
}

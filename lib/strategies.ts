/**
 * Strategy config types and validation per game.
 * Used by API (CRUD + run-strategy) and OpenClaw.
 *
 * Coercion: Clients (PowerShell, OpenClaw, LLMs) often send amount/target as strings.
 * Use coerceDiceConfigFromBody() before validateStrategyConfig for robust parsing.
 */

import { coerceInt, coerceNumber, coerceCondition } from "@/lib/validation";

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

/**
 * Coerce raw body config to DiceStrategyConfig.
 * Handles string numbers from PowerShell ConvertTo-Json, OpenClaw, LLMs.
 */
export function coerceDiceConfigFromBody(
  raw: unknown,
  defaults: { amount?: number; target?: number; condition?: "over" | "under" } = {}
): DiceStrategyConfig | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  const amount = coerceInt(o.amount, defaults.amount ?? 10);
  const target = coerceNumber(o.target, defaults.target ?? 50);
  const condition = coerceCondition(o.condition ?? defaults.condition);
  if (amount < 1 || amount > 10000 || target < 0 || target >= 100) return null;
  const config: DiceStrategyConfig = { amount, target, condition };
  if (o.progressionType && typeof o.progressionType === "string") {
    const pt = (o.progressionType as string).toLowerCase();
    if (["flat", "martingale", "paroli", "dalembert", "fibonacci", "labouchere", "oscar", "kelly"].includes(pt)) {
      config.progressionType = pt as DiceProgressionType;
    }
  }
  const numericOpts: (keyof DiceStrategyConfig)[] = [
    "maxBet", "maxConsecutiveLosses", "maxConsecutiveWins",
    "unitStep", "stopAfterRounds", "stopIfBalanceBelow", "stopIfBalanceAbove",
  ];
  for (const k of numericOpts) {
    const v = o[k];
    let n: number | undefined;
    if (typeof v === "number" && !Number.isNaN(v)) n = v;
    else if (typeof v === "string") n = parseFloat(v);
    if (n !== undefined && !Number.isNaN(n)) (config as Record<string, unknown>)[k] = n;
  }
  return config;
}

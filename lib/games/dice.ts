import {
  DICE_HOUSE_EDGE,
  DICE_MAX_MULTIPLIER,
  MIN_BET,
  MAX_BET,
} from "@/lib/constants";
import { hashToFloat, hashSeed } from "./rng";

export type DiceCondition = "over" | "under";

export type DiceResult = {
  result: number;
  win: boolean;
  payout: number;
  resultPayload: {
    value: number;
    target: number;
    condition: DiceCondition;
    win: boolean;
    multiplier: number;
  };
};

export function runDiceBet(
  amount: number,
  target: number,
  condition: DiceCondition,
  serverSeed: string,
  clientSeed: string,
  nonce: number
): DiceResult {
  const value = hashToFloat(serverSeed, clientSeed, nonce) * 100;
  const win =
    condition === "over" ? value > target : value < target;
  const probability =
    condition === "over" ? (100 - target) / 100 : target / 100;
  const rawMultiplier = probability > 0 ? (1 - DICE_HOUSE_EDGE) / probability : 0;
  const multiplier = Math.min(rawMultiplier, DICE_MAX_MULTIPLIER);
  const payout = win ? Math.round(amount * multiplier) : 0;
  return {
    result: value,
    win,
    payout,
    resultPayload: {
      value,
      target,
      condition,
      win,
      multiplier,
    },
  };
}

export function validateDiceBet(
  amount: number,
  target: number,
  condition: string,
  balance: number
): string | null {
  if (amount < MIN_BET) return "BET_TOO_LOW";
  if (amount > MAX_BET) return "BET_TOO_HIGH";
  if (amount > balance) return "INSUFFICIENT_BALANCE";
  if (target < 0 || target >= 100) return "VALIDATION_ERROR";
  if (condition !== "over" && condition !== "under") return "VALIDATION_ERROR";
  return null;
}

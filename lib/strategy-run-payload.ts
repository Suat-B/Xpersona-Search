/**
 * Strategy run payload: passed from strategies page to dice game via sessionStorage.
 * Used when redirecting user to /games/dice?run=1 to auto-play a strategy.
 */

import type { DiceStrategyConfig } from "./strategies";
import type { AdvancedDiceStrategy } from "./advanced-strategy-types";

export type StrategyRunPayload = {
  strategyId?: string;
  config?: DiceStrategyConfig;
  strategy?: AdvancedDiceStrategy;
  strategyName: string;
  maxRounds: number;
  isAdvanced?: boolean;
};

const STORAGE_KEY = "xpersona_strategy_run";

export function saveStrategyRunPayload(payload: StrategyRunPayload): void {
  if (typeof window === "undefined") return;
  try {
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
  } catch {
    // ignore
  }
}

export function getAndClearStrategyRunPayload(): StrategyRunPayload | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    sessionStorage.removeItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as StrategyRunPayload;
    if (typeof parsed.strategyName !== "string" || typeof parsed.maxRounds !== "number") {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

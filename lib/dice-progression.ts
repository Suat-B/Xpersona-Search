/**
 * Pure progression logic for dice strategies.
 * Each strategy: (state, roundResult, config) => { nextBet, nextState }
 */

import { MIN_BET, MAX_BET } from "@/lib/constants";
import type { DiceStrategyConfig, DiceProgressionType } from "./strategies";

export type RoundResult = { win: boolean; payout: number; betAmount: number };

export type ProgressionState = {
  type: DiceProgressionType;
  baseAmount: number;
  currentBet: number;
  consecutiveLosses: number;
  consecutiveWins: number;
  /** Fibonacci index (0-based) */
  fibIndex: number;
  /** Labouchere line */
  labouchereLine: number[];
  /** Oscar: profit target in units (grind until we're up by this) */
  oscarProfitTarget: number;
  /** Oscar: current profit in units this cycle */
  oscarProfit: number;
  /** Rolling results for Kelly: [win, loss, win, ...] */
  recentResults: boolean[];
};

const FIB_SEQ = [1, 1, 2, 3, 5, 8, 13, 21, 34, 55, 89, 144, 233, 377, 610, 987, 1597, 2584];
const LABOUCHERE_DEFAULT_LINE = [1, 2, 3, 4];
const KELLY_WINDOW = 20;
const KELLY_FRACTION = 0.25;

function clampBet(amount: number, config: DiceStrategyConfig, balance: number): number {
  const min = MIN_BET;
  const max = Math.min(
    MAX_BET,
    config.maxBet ?? MAX_BET,
    Math.floor(balance)
  );
  return Math.max(min, Math.min(max, Math.round(amount)));
}

/** Create initial progression state for a config. */
export function createProgressionState(
  config: DiceStrategyConfig,
  balance: number
): ProgressionState {
  const amount = config.amount ?? 10;
  const baseBet = clampBet(amount, config, balance);
  return {
    type: config.progressionType ?? "flat",
    baseAmount: baseBet,
    currentBet: baseBet,
    consecutiveLosses: 0,
    consecutiveWins: 0,
    fibIndex: 0,
    labouchereLine: [...LABOUCHERE_DEFAULT_LINE],
    oscarProfitTarget: 1,
    oscarProfit: 0,
    recentResults: [],
  };
}

/** Compute next bet and state from round result. */
export function getNextBet(
  state: ProgressionState,
  roundResult: RoundResult | null,
  config: DiceStrategyConfig,
  balance: number
): { nextBet: number; nextState: ProgressionState } {
  const maxBet = config.maxBet ?? MAX_BET;
  const maxConsecutiveLosses = config.maxConsecutiveLosses ?? 10;
  const maxConsecutiveWins = config.maxConsecutiveWins ?? 3;
  const unitStep = config.unitStep ?? 1;
  const baseAmount = state.baseAmount;

  const nextState: ProgressionState = {
    ...state,
    recentResults:
      roundResult === null
        ? state.recentResults
        : [...state.recentResults.slice(-(KELLY_WINDOW - 1)), roundResult.win],
  };

  if (roundResult === null) {
    return { nextBet: clampBet(state.currentBet, config, balance), nextState: state };
  }

  const { win } = roundResult;

  switch (state.type) {
    case "flat": {
      return {
        nextBet: clampBet(baseAmount, config, balance),
        nextState: nextState,
      };
    }

    case "martingale": {
      if (win) {
        nextState.currentBet = baseAmount;
        nextState.consecutiveLosses = 0;
        nextState.consecutiveWins = 0;
        return { nextBet: clampBet(baseAmount, config, balance), nextState };
      }
      nextState.consecutiveLosses++;
      if (nextState.consecutiveLosses >= maxConsecutiveLosses) {
        nextState.currentBet = baseAmount;
        nextState.consecutiveLosses = 0;
        return { nextBet: clampBet(baseAmount, config, balance), nextState };
      }
      const doubled = state.currentBet * 2;
      nextState.currentBet = Math.min(doubled, maxBet);
      return { nextBet: clampBet(nextState.currentBet, config, balance), nextState };
    }

    case "paroli": {
      if (!win) {
        nextState.currentBet = baseAmount;
        nextState.consecutiveWins = 0;
        return { nextBet: clampBet(baseAmount, config, balance), nextState };
      }
      nextState.consecutiveWins++;
      if (nextState.consecutiveWins >= maxConsecutiveWins) {
        nextState.currentBet = baseAmount;
        nextState.consecutiveWins = 0;
        return { nextBet: clampBet(baseAmount, config, balance), nextState };
      }
      const tripled = state.currentBet * 3;
      nextState.currentBet = Math.min(tripled, maxBet);
      return { nextBet: clampBet(nextState.currentBet, config, balance), nextState };
    }

    case "dalembert": {
      const unit = baseAmount * unitStep;
      if (win) {
        nextState.currentBet = Math.max(baseAmount, state.currentBet - unit);
      } else {
        nextState.currentBet = state.currentBet + unit;
      }
      nextState.currentBet = Math.min(nextState.currentBet, maxBet);
      return { nextBet: clampBet(nextState.currentBet, config, balance), nextState };
    }

    case "fibonacci": {
      if (win) {
        nextState.fibIndex = Math.max(0, state.fibIndex - 2);
      } else {
        nextState.fibIndex = Math.min(
          state.fibIndex + 1,
          FIB_SEQ.length - 1
        );
      }
      const mult = FIB_SEQ[nextState.fibIndex] ?? FIB_SEQ[FIB_SEQ.length - 1];
      nextState.currentBet = Math.min(baseAmount * mult, maxBet);
      return { nextBet: clampBet(nextState.currentBet, config, balance), nextState };
    }

    case "labouchere": {
      const line = nextState.labouchereLine;
      if (line.length === 0) {
        nextState.labouchereLine = [...LABOUCHERE_DEFAULT_LINE];
        nextState.currentBet = baseAmount;
        return { nextBet: clampBet(baseAmount, config, balance), nextState };
      }
      const first = line[0] ?? 0;
      const last = line[line.length - 1] ?? 0;
      const betUnits = first + last;
      if (win) {
        const newLine = line.slice(1, -1);
        nextState.labouchereLine = newLine.length > 0 ? newLine : [...LABOUCHERE_DEFAULT_LINE];
      } else {
        nextState.labouchereLine = [...line, betUnits];
      }
      nextState.currentBet = Math.min(baseAmount * betUnits, maxBet);
      return { nextBet: clampBet(nextState.currentBet, config, balance), nextState };
    }

    case "oscar": {
      const unit = baseAmount * (unitStep || 1);
      if (win) {
        nextState.oscarProfit += 1;
        if (nextState.oscarProfit >= nextState.oscarProfitTarget) {
          nextState.oscarProfit = 0;
          nextState.oscarProfitTarget = 1;
          nextState.currentBet = baseAmount;
        } else {
          nextState.currentBet = Math.min(state.currentBet + unit, maxBet);
        }
      } else {
        nextState.oscarProfit = 0;
        nextState.oscarProfitTarget = 1;
        nextState.currentBet = baseAmount;
      }
      return { nextBet: clampBet(nextState.currentBet, config, balance), nextState };
    }

    case "kelly": {
      const results = nextState.recentResults;
      if (results.length < 5) {
        return { nextBet: clampBet(baseAmount, config, balance), nextState };
      }
      const wins = results.filter(Boolean).length;
      const winRate = wins / results.length;
      const target = config.target ?? 50;
      const condition = config.condition ?? "over";
      const probability = condition === "over" ? (100 - target) / 100 : target / 100;
      const multiplier = probability > 0 ? (1 - 0.03) / probability : 0;
      const odds = multiplier - 1;
      if (odds <= 0) {
        return { nextBet: clampBet(baseAmount, config, balance), nextState };
      }
      const edge = winRate * (1 + odds) - 1;
      if (edge <= 0) {
        return { nextBet: clampBet(baseAmount, config, balance), nextState };
      }
      const kellyFraction = (edge / odds) * KELLY_FRACTION;
      const kellyBet = Math.floor(balance * Math.min(kellyFraction, 0.5));
      nextState.currentBet = Math.max(baseAmount, Math.min(kellyBet, maxBet));
      return { nextBet: clampBet(nextState.currentBet, config, balance), nextState };
    }

    default:
      return { nextBet: clampBet(baseAmount, config, balance), nextState };
  }
}

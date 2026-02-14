/**
 * Dice Rule Engine
 * Executes advanced strategy rules and manages game state
 */

import { MIN_BET, MAX_BET } from "@/lib/constants";
import type {
  AdvancedDiceStrategy,
  StrategyRule,
  RuleEngineState,
  RoundResult,
  RuleExecutionResult,
  TriggerType,
  ActionType,
} from "./advanced-strategy-types";

export function createRuleEngineState(
  strategy: AdvancedDiceStrategy,
  balance: number
): RuleEngineState {
  return {
    totalRounds: 0,
    totalWins: 0,
    totalLosses: 0,
    currentStreakWins: 0,
    currentStreakLosses: 0,
    sessionProfit: 0,
    sessionLoss: 0,
    startingBalance: balance,
    currentBalance: balance,
    highestBalance: balance,
    lowestBalance: balance,
    ruleCounters: {},
    lastResults: [],
    currentBet: strategy.baseConfig.amount,
    baseBet: strategy.baseConfig.amount,
    currentTarget: strategy.baseConfig.target,
    currentCondition: strategy.baseConfig.condition,
    pausedRounds: 0,
    skipNextBet: false,
  };
}

export function processRound(
  strategy: AdvancedDiceStrategy,
  state: RuleEngineState,
  roundResult: RoundResult
): RuleExecutionResult {
  // Create new state (immutable update)
  const newState: RuleEngineState = {
    ...state,
    totalRounds: state.totalRounds + 1,
    currentBalance: state.currentBalance + roundResult.payout,
    sessionProfit: Math.max(0, state.sessionProfit + roundResult.payout - roundResult.betAmount),
    sessionLoss: Math.max(0, state.sessionLoss + (roundResult.win ? 0 : roundResult.betAmount)),
    lastResults: [...state.lastResults.slice(-50), roundResult.win],
    ruleCounters: { ...state.ruleCounters },
    pausedRounds: Math.max(0, state.pausedRounds - 1),
    skipNextBet: false,
  };

  // Update win/loss tracking
  if (roundResult.win) {
    newState.totalWins++;
    newState.currentStreakWins = state.currentStreakWins + 1;
    newState.currentStreakLosses = 0;
  } else {
    newState.totalLosses++;
    newState.currentStreakLosses = state.currentStreakLosses + 1;
    newState.currentStreakWins = 0;
  }

  // Update balance extremes
  if (newState.currentBalance > newState.highestBalance) {
    newState.highestBalance = newState.currentBalance;
  }
  if (newState.currentBalance < newState.lowestBalance) {
    newState.lowestBalance = newState.currentBalance;
  }

  // Check global stop conditions first
  const stopCheck = checkGlobalStopConditions(strategy, newState);
  if (stopCheck.shouldStop) {
    return {
      newState,
      nextBet: 0,
      nextTarget: state.currentTarget,
      nextCondition: state.currentCondition,
      executedRules: [],
      shouldStop: true,
      stopReason: stopCheck.reason,
    };
  }

  // Check if paused
  if (newState.pausedRounds > 0) {
    return {
      newState,
      nextBet: 0,
      nextTarget: state.currentTarget,
      nextCondition: state.currentCondition,
      executedRules: [],
      shouldStop: false,
    };
  }

  // Execute rules
  const executedRules: string[] = [];
  let nextBet = state.currentBet;
  let nextTarget = state.currentTarget;
  let nextCondition = state.currentCondition;
  let shouldStop = false;

  // Get enabled rules sorted by order
  const sortedRules = strategy.rules
    .filter((r) => r.enabled)
    .sort((a, b) => a.order - b.order);

  for (const rule of sortedRules) {
    if (shouldTrigger(rule, newState)) {
      const result = executeAction(
        rule.action,
        newState,
        nextBet,
        nextTarget,
        nextCondition
      );

      nextBet = result.bet;
      nextTarget = result.target;
      nextCondition = result.condition;
      shouldStop = result.shouldStop || shouldStop;
      newState.skipNextBet = result.skipNextBet || newState.skipNextBet;
      newState.pausedRounds = result.pauseRounds || newState.pausedRounds;

      executedRules.push(rule.id);

      // Update rule counter
      const counter = newState.ruleCounters[rule.id] || {
        lastTriggeredRound: 0,
        executionCount: 0,
        customCounter: 0,
      };
      newState.ruleCounters[rule.id] = {
        ...counter,
        lastTriggeredRound: newState.totalRounds,
        executionCount: counter.executionCount + 1,
      };

      // Check if rule should be disabled (max executions reached)
      if (rule.maxExecutions && newState.ruleCounters[rule.id].executionCount >= rule.maxExecutions) {
        rule.enabled = false;
      }

      // Sequential mode: stop after first matching rule
      if (strategy.executionMode === "sequential") {
        break;
      }

      // Stop action: halt execution
      if (shouldStop) {
        break;
      }
    }
  }

  // Apply global limits to bet
  if (strategy.globalLimits?.maxBet) {
    nextBet = Math.min(nextBet, strategy.globalLimits.maxBet);
  }
  if (strategy.globalLimits?.minBet) {
    nextBet = Math.max(nextBet, strategy.globalLimits.minBet);
  }

  // Clamp to valid ranges
  nextBet = Math.max(MIN_BET, Math.min(MAX_BET, Math.round(nextBet)));
  nextTarget = Math.max(0, Math.min(99, Math.round(nextTarget)));

  // Update state with final values
  newState.currentBet = nextBet;
  newState.currentTarget = nextTarget;
  newState.currentCondition = nextCondition;

  return {
    newState,
    nextBet: newState.skipNextBet ? 0 : nextBet,
    nextTarget,
    nextCondition,
    executedRules,
    shouldStop,
    stopReason: shouldStop ? "Rule triggered stop action" : undefined,
  };
}

function checkGlobalStopConditions(
  strategy: AdvancedDiceStrategy,
  state: RuleEngineState
): { shouldStop: boolean; reason?: string } {
  const limits = strategy.globalLimits;
  if (!limits) return { shouldStop: false };

  if (limits.maxRounds && state.totalRounds >= limits.maxRounds) {
    return { shouldStop: true, reason: `Max rounds (${limits.maxRounds}) reached` };
  }

  if (limits.stopIfBalanceBelow !== undefined && state.currentBalance < limits.stopIfBalanceBelow) {
    return { shouldStop: true, reason: `Balance below ${limits.stopIfBalanceBelow}` };
  }

  if (limits.stopIfBalanceAbove !== undefined && state.currentBalance > limits.stopIfBalanceAbove) {
    return { shouldStop: true, reason: `Balance above ${limits.stopIfBalanceAbove}` };
  }

  if (limits.stopOnConsecutiveLosses && state.currentStreakLosses >= limits.stopOnConsecutiveLosses) {
    return { shouldStop: true, reason: `${limits.stopOnConsecutiveLosses} consecutive losses` };
  }

  if (limits.stopOnConsecutiveWins && state.currentStreakWins >= limits.stopOnConsecutiveWins) {
    return { shouldStop: true, reason: `${limits.stopOnConsecutiveWins} consecutive wins` };
  }

  if (limits.stopOnProfitAbove !== undefined && state.sessionProfit >= limits.stopOnProfitAbove) {
    return { shouldStop: true, reason: `Profit above ${limits.stopOnProfitAbove}` };
  }

  if (limits.stopOnLossAbove !== undefined && state.sessionLoss >= limits.stopOnLossAbove) {
    return { shouldStop: true, reason: `Loss above ${limits.stopOnLossAbove}` };
  }

  return { shouldStop: false };
}

function shouldTrigger(rule: StrategyRule, state: RuleEngineState): boolean {
  // Check if rule is enabled
  if (!rule.enabled) return false;

  // Check cooldown
  if (rule.cooldownRounds) {
    const lastTrigger = state.ruleCounters[rule.id]?.lastTriggeredRound || 0;
    if (state.totalRounds - lastTrigger < rule.cooldownRounds) {
      return false;
    }
  }

  // Check max executions
  if (rule.maxExecutions) {
    const execCount = state.ruleCounters[rule.id]?.executionCount || 0;
    if (execCount >= rule.maxExecutions) {
      return false;
    }
  }

  return evaluateTrigger(rule.trigger.type, rule.trigger, state);
}

function evaluateTrigger(
  type: TriggerType,
  trigger: StrategyRule["trigger"],
  state: RuleEngineState
): boolean {
  const value = trigger.value ?? 1;
  const lastResult = state.lastResults[state.lastResults.length - 1];

  switch (type) {
    // Basic win/loss
    case "win":
      return lastResult === true;
    case "loss":
      return lastResult === false;

    // Streak-based
    case "streak_win":
      return state.currentStreakWins >= value;
    case "streak_loss":
      return state.currentStreakLosses >= value;
    case "streak_win_at_least":
      return state.currentStreakWins >= value;
    case "streak_loss_at_least":
      return state.currentStreakLosses >= value;
    case "streak_win_exactly":
      return state.currentStreakWins === value;
    case "streak_loss_exactly":
      return state.currentStreakLosses === value;

    // Count-based
    case "every_n_wins":
      return state.totalWins > 0 && state.totalWins % value === 0;
    case "every_n_losses":
      return state.totalLosses > 0 && state.totalLosses % value === 0;
    case "every_n_rounds":
      return state.totalRounds % value === 0;

    // Financial
    case "profit_above":
      return state.sessionProfit > value;
    case "profit_below":
      return state.sessionProfit < value;
    case "loss_above":
      return state.sessionLoss > value;
    case "loss_below":
      return state.sessionLoss < value;
    case "balance_above":
      return state.currentBalance > value;
    case "balance_below":
      return state.currentBalance < value;
    case "balance_percent_above": {
      const pctAbove = ((state.currentBalance - state.startingBalance) / state.startingBalance) * 100;
      return pctAbove > value;
    }
    case "balance_percent_below": {
      const pctBelow = ((state.startingBalance - state.currentBalance) / state.startingBalance) * 100;
      return pctBelow > value;
    }
    case "balance_percent_change": {
      const change = Math.abs(((state.currentBalance - state.startingBalance) / state.startingBalance) * 100);
      return change >= value;
    }

    // Win rate
    case "win_rate_above": {
      if (state.totalRounds === 0) return false;
      const winRate = (state.totalWins / state.totalRounds) * 100;
      return winRate > value;
    }
    case "win_rate_below": {
      if (state.totalRounds === 0) return false;
      const winRate = (state.totalWins / state.totalRounds) * 100;
      return winRate < value;
    }
    case "win_rate_exactly": {
      if (state.totalRounds === 0) return false;
      const winRate = (state.totalWins / state.totalRounds) * 100;
      return Math.abs(winRate - value) < 0.01;
    }

    // Pattern-based
    case "pattern_win_loss": {
      const pattern = trigger.pattern || "";
      const recent = state.lastResults.slice(-pattern.length);
      if (recent.length < pattern.length) return false;
      return pattern.split("").every((char, i) => {
        const expected = char.toUpperCase() === "W";
        return recent[i] === expected;
      });
    }
    case "pattern_last_n": {
      const n = value;
      const recent = state.lastResults.slice(-n);
      return recent.length >= n && recent.every((r) => r === recent[0]);
    }
    case "alternating_wins_losses": {
      if (state.lastResults.length < 2) return false;
      const recent = state.lastResults.slice(-4);
      return recent.every((r, i) => i === 0 || r !== recent[i - 1]);
    }
    case "no_win_for_n": {
      const recent = state.lastResults.slice(-value);
      return recent.length >= value && !recent.includes(true);
    }
    case "no_loss_for_n": {
      const recent = state.lastResults.slice(-value);
      return recent.length >= value && !recent.includes(false);
    }

    // Comparative
    case "total_wins_equals":
      return state.totalWins === value;
    case "total_losses_equals":
      return state.totalLosses === value;
    case "rounds_equals":
      return state.totalRounds === value;

    // Volatility
    case "last_n_were_wins": {
      const recent = state.lastResults.slice(-value);
      return recent.length >= value && recent.every((r) => r === true);
    }
    case "last_n_were_losses": {
      const recent = state.lastResults.slice(-value);
      return recent.length >= value && recent.every((r) => r === false);
    }
    case "last_result_was_win":
      return lastResult === true;
    case "last_result_was_loss":
      return lastResult === false;

    default:
      return false;
  }
}

function executeAction(
  action: StrategyRule["action"],
  state: RuleEngineState,
  currentBet: number,
  currentTarget: number,
  currentCondition: "over" | "under"
): {
  bet: number;
  target: number;
  condition: "over" | "under";
  shouldStop: boolean;
  skipNextBet: boolean;
  pauseRounds: number;
} {
  let bet = currentBet;
  let target = currentTarget;
  let condition = currentCondition;
  let shouldStop = false;
  let skipNextBet = false;
  let pauseRounds = 0;

  const value = action.value ?? 0;

  switch (action.type) {
    // Bet amount - percentage
    case "increase_bet_percent":
      bet = currentBet * (1 + value / 100);
      break;
    case "decrease_bet_percent":
      bet = currentBet * (1 - value / 100);
      break;
    case "multiply_bet":
      bet = currentBet * value;
      break;
    case "divide_bet":
      bet = currentBet / (value || 1);
      break;

    // Bet amount - absolute
    case "increase_bet_absolute":
      bet = currentBet + value;
      break;
    case "decrease_bet_absolute":
      bet = Math.max(MIN_BET, currentBet - value);
      break;
    case "set_bet_absolute":
      bet = value || MIN_BET;
      break;
    case "set_bet_percent_of_balance":
      bet = state.currentBalance * (value / 100);
      break;
    case "set_bet_percent_of_base":
      bet = state.baseBet * (value / 100);
      break;

    // Bet amount - special
    case "reset_bet":
      bet = state.baseBet;
      break;
    case "double_bet":
      bet = currentBet * 2;
      break;
    case "halve_bet":
      bet = currentBet / 2;
      break;
    case "triple_bet":
      bet = currentBet * 3;
      break;
    case "max_bet":
      bet = MAX_BET;
      break;
    case "min_bet":
      bet = MIN_BET;
      break;

    // Condition
    case "switch_over_under":
      condition = condition === "over" ? "under" : "over";
      target = 99 - target;
      break;
    case "set_over":
      condition = "over";
      break;
    case "set_under":
      condition = "under";
      break;

    // Target
    case "set_target_absolute":
      target = Math.max(0, Math.min(99, value));
      break;
    case "increase_target":
      target = Math.min(99, currentTarget + value);
      break;
    case "decrease_target":
      target = Math.max(0, currentTarget - value);
      break;
    case "invert_target":
      target = 99 - currentTarget;
      break;
    case "double_target":
      target = Math.min(99, currentTarget * 2);
      break;
    case "halve_target":
      target = Math.floor(currentTarget / 2);
      break;

    // Control flow
    case "stop":
      shouldStop = true;
      break;
    case "pause_n_rounds":
      pauseRounds = value;
      break;
    case "skip_next_bet":
      skipNextBet = true;
      break;
    case "reset_all_rules":
      // Reset all rule counters
      Object.keys(state.ruleCounters).forEach((key) => {
        state.ruleCounters[key] = {
          lastTriggeredRound: 0,
          executionCount: 0,
          customCounter: 0,
        };
      });
      break;

    // Multi-action (basic implementation)
    case "execute_rule":
    case "enable_rule":
    case "disable_rule":
      // These would need additional logic to find and modify other rules
      // For now, they're placeholders
      break;
  }

  return {
    bet,
    target,
    condition,
    shouldStop,
    skipNextBet,
    pauseRounds,
  };
}

// Utility function to simulate a strategy
export function simulateStrategy(
  strategy: AdvancedDiceStrategy,
  startingBalance: number,
  rounds: number,
  houseEdge: number = 0.01
): {
  finalBalance: number;
  profit: number;
  totalWins: number;
  totalLosses: number;
  maxBalance: number;
  minBalance: number;
  shouldStop: boolean;
  stopReason?: string;
  roundHistory: Array<{
    round: number;
    bet: number;
    target: number;
    condition: "over" | "under";
    roll: number;
    win: boolean;
    payout: number;
    balance: number;
    executedRules: string[];
  }>;
} {
  const state = createRuleEngineState(strategy, startingBalance);
  const history: Array<{
    round: number;
    bet: number;
    target: number;
    condition: "over" | "under";
    roll: number;
    win: boolean;
    payout: number;
    balance: number;
    executedRules: string[];
  }> = [];

  for (let i = 0; i < rounds; i++) {
    // Simulate dice roll
    const roll = Math.floor(Math.random() * 100);
    const win = state.currentCondition === "over"
      ? roll > state.currentTarget
      : roll < state.currentTarget;
    
    // Calculate payout with house edge
    const probability = state.currentCondition === "over"
      ? (99 - state.currentTarget) / 100
      : state.currentTarget / 100;
    const multiplier = probability > 0 ? (1 - houseEdge) / probability : 0;
    const payout = win ? state.currentBet * multiplier : 0;

    const roundResult: RoundResult = {
      win,
      payout,
      roll,
      betAmount: state.currentBet,
    };

    const result = processRound(strategy, state, roundResult);

    history.push({
      round: i + 1,
      bet: state.currentBet,
      target: state.currentTarget,
      condition: state.currentCondition,
      roll,
      win,
      payout,
      balance: result.newState.currentBalance,
      executedRules: result.executedRules,
    });
    
    // Update state for next round - need to update the reference
    state.currentBalance = result.newState.currentBalance;
    state.sessionProfit = result.newState.sessionProfit;
    state.sessionLoss = result.newState.sessionLoss;
    state.totalRounds = result.newState.totalRounds;
    state.totalWins = result.newState.totalWins;
    state.totalLosses = result.newState.totalLosses;
    state.currentStreakWins = result.newState.currentStreakWins;
    state.currentStreakLosses = result.newState.currentStreakLosses;
    state.highestBalance = result.newState.highestBalance;
    state.lowestBalance = result.newState.lowestBalance;
    state.lastResults = result.newState.lastResults;
    state.ruleCounters = result.newState.ruleCounters;
    state.currentBet = result.newState.currentBet;
    state.currentTarget = result.newState.currentTarget;
    state.currentCondition = result.newState.currentCondition;
    state.pausedRounds = result.newState.pausedRounds;
    state.skipNextBet = result.newState.skipNextBet;

    if (result.shouldStop) {
      return {
        finalBalance: result.newState.currentBalance,
        profit: result.newState.currentBalance - startingBalance,
        totalWins: result.newState.totalWins,
        totalLosses: result.newState.totalLosses,
        maxBalance: result.newState.highestBalance,
        minBalance: result.newState.lowestBalance,
        shouldStop: true,
        stopReason: result.stopReason,
        roundHistory: history,
      };
    }
  }

  return {
    finalBalance: state.currentBalance,
    profit: state.currentBalance - startingBalance,
    totalWins: state.totalWins,
    totalLosses: state.totalLosses,
    maxBalance: state.highestBalance,
    minBalance: state.lowestBalance,
    shouldStop: false,
    roundHistory: history,
  };
}

/**
 * Advanced Dice Strategy Types
 * Comprehensive rule-based strategy system for Dice game
 * Supports unlimited condition-action combinations
 */

export type TriggerType = 
  // Basic Win/Loss
  | "win"
  | "loss"
  // Streak-based
  | "streak_win"
  | "streak_loss"
  | "streak_win_at_least"
  | "streak_loss_at_least"
  | "streak_win_exactly"
  | "streak_loss_exactly"
  // Count-based
  | "every_n_wins"
  | "every_n_losses"
  | "every_n_rounds"
  // Financial
  | "profit_above"
  | "profit_below"
  | "loss_above"
  | "loss_below"
  | "balance_above"
  | "balance_below"
  | "balance_percent_above"
  | "balance_percent_below"
  | "balance_percent_change"
  // Win Rate
  | "win_rate_above"
  | "win_rate_below"
  | "win_rate_exactly"
  // Pattern-based
  | "pattern_win_loss"
  | "pattern_last_n"
  | "alternating_wins_losses"
  | "no_win_for_n"
  | "no_loss_for_n"
  // Comparative
  | "total_wins_equals"
  | "total_losses_equals"
  | "rounds_equals"
  // Volatility
  | "last_n_were_wins"
  | "last_n_were_losses"
  | "last_result_was_win"
  | "last_result_was_loss";

export type ActionType =
  // Bet Amount - Percentage
  | "increase_bet_percent"
  | "decrease_bet_percent"
  | "multiply_bet"
  | "divide_bet"
  // Bet Amount - Absolute
  | "increase_bet_absolute"
  | "decrease_bet_absolute"
  | "set_bet_absolute"
  | "set_bet_percent_of_balance"
  | "set_bet_percent_of_base"
  // Bet Amount - Special
  | "reset_bet"
  | "double_bet"
  | "halve_bet"
  | "triple_bet"
  | "max_bet"
  | "min_bet"
  // Condition (Over/Under)
  | "switch_over_under"
  | "set_over"
  | "set_under"
  | "invert_target"
  // Target Value
  | "set_target_absolute"
  | "increase_target"
  | "decrease_target"
  | "double_target"
  | "halve_target"
  // Control Flow
  | "stop"
  | "pause_n_rounds"
  | "skip_next_bet"
  | "reset_all_rules"
  // Multi-action (execute other rules)
  | "execute_rule"
  | "enable_rule"
  | "disable_rule";

export type ExecutionMode = "sequential" | "all_matching" | "priority";

export interface StrategyRule {
  id: string;
  order: number;
  enabled: boolean;
  name?: string;
  
  trigger: {
    type: TriggerType;
    value?: number;
    value2?: number;
    pattern?: string;
  };
  
  action: {
    type: ActionType;
    value?: number;
    targetRuleId?: string;
  };
  
  cooldownRounds?: number;
  maxExecutions?: number;
}

export interface GlobalLimits {
  maxBet?: number;
  minBet?: number;
  maxRounds?: number;
  stopIfBalanceBelow?: number;
  stopIfBalanceAbove?: number;
  stopOnConsecutiveLosses?: number;
  stopOnConsecutiveWins?: number;
  stopOnProfitAbove?: number;
  stopOnLossAbove?: number;
}

export interface AdvancedDiceStrategy {
  id?: string;
  userId?: string;
  name: string;
  description?: string;
  createdAt?: string;
  updatedAt?: string;
  
  baseConfig: {
    amount: number;
    target: number;
    condition: "over" | "under";
  };
  
  rules: StrategyRule[];
  globalLimits?: GlobalLimits;
  executionMode: ExecutionMode;
  
  isPublic?: boolean;
  tags?: string[];
}

export interface RuleEngineState {
  totalRounds: number;
  totalWins: number;
  totalLosses: number;
  currentStreakWins: number;
  currentStreakLosses: number;
  sessionProfit: number;
  sessionLoss: number;
  startingBalance: number;
  currentBalance: number;
  highestBalance: number;
  lowestBalance: number;
  
  ruleCounters: Record<string, {
    lastTriggeredRound: number;
    executionCount: number;
    customCounter: number;
  }>;
  
  lastResults: boolean[];
  
  currentBet: number;
  baseBet: number;
  currentTarget: number;
  currentCondition: "over" | "under";
  
  pausedRounds: number;
  skipNextBet: boolean;
}

export interface RoundResult {
  win: boolean;
  payout: number;
  roll: number;
  betAmount: number;
}

export interface RuleExecutionResult {
  newState: RuleEngineState;
  nextBet: number;
  nextTarget: number;
  nextCondition: "over" | "under";
  executedRules: string[];
  shouldStop: boolean;
  stopReason?: string;
}

// Trigger display info for UI
export const TRIGGER_INFO: Record<TriggerType, { label: string; description: string; needsValue: boolean; valueLabel?: string }> = {
  win: { label: "On Win", description: "Triggers on every win", needsValue: false },
  loss: { label: "On Loss", description: "Triggers on every loss", needsValue: false },
  streak_win: { label: "On Win Streak", description: "After N consecutive wins", needsValue: true, valueLabel: "Consecutive Wins" },
  streak_loss: { label: "On Loss Streak", description: "After N consecutive losses", needsValue: true, valueLabel: "Consecutive Losses" },
  streak_win_at_least: { label: "Win Streak ≥ N", description: "When win streak reaches at least N", needsValue: true, valueLabel: "Minimum Streak" },
  streak_loss_at_least: { label: "Loss Streak ≥ N", description: "When loss streak reaches at least N", needsValue: true, valueLabel: "Minimum Streak" },
  streak_win_exactly: { label: "Win Streak = N", description: "When win streak is exactly N", needsValue: true, valueLabel: "Exact Streak" },
  streak_loss_exactly: { label: "Loss Streak = N", description: "When loss streak is exactly N", needsValue: true, valueLabel: "Exact Streak" },
  every_n_wins: { label: "Every N Wins", description: "Triggers every N total wins", needsValue: true, valueLabel: "N Wins" },
  every_n_losses: { label: "Every N Losses", description: "Triggers every N total losses", needsValue: true, valueLabel: "N Losses" },
  every_n_rounds: { label: "Every N Rounds", description: "Triggers every N rounds played", needsValue: true, valueLabel: "N Rounds" },
  profit_above: { label: "Profit Above", description: "When session profit exceeds N", needsValue: true, valueLabel: "Profit Amount" },
  profit_below: { label: "Profit Below", description: "When session profit is below N", needsValue: true, valueLabel: "Profit Amount" },
  loss_above: { label: "Loss Above", description: "When session loss exceeds N", needsValue: true, valueLabel: "Loss Amount" },
  loss_below: { label: "Loss Below", description: "When session loss is below N", needsValue: true, valueLabel: "Loss Amount" },
  balance_above: { label: "Balance Above", description: "When current balance exceeds N", needsValue: true, valueLabel: "Balance" },
  balance_below: { label: "Balance Below", description: "When current balance is below N", needsValue: true, valueLabel: "Balance" },
  balance_percent_above: { label: "Balance % Above", description: "When balance is N% above starting", needsValue: true, valueLabel: "Percent" },
  balance_percent_below: { label: "Balance % Below", description: "When balance is N% below starting", needsValue: true, valueLabel: "Percent" },
  balance_percent_change: { label: "Balance Changed %", description: "When balance changes by N%", needsValue: true, valueLabel: "Percent Change" },
  win_rate_above: { label: "Win Rate Above", description: "When win rate exceeds N%", needsValue: true, valueLabel: "Win Rate %" },
  win_rate_below: { label: "Win Rate Below", description: "When win rate is below N%", needsValue: true, valueLabel: "Win Rate %" },
  win_rate_exactly: { label: "Win Rate = N%", description: "When win rate is exactly N%", needsValue: true, valueLabel: "Win Rate %" },
  pattern_win_loss: { label: "Pattern Match", description: "When results match pattern (W=win, L=loss)", needsValue: true, valueLabel: "Pattern (e.g., WWL)" },
  pattern_last_n: { label: "Last N Match", description: "When last N results match", needsValue: true, valueLabel: "N Results" },
  alternating_wins_losses: { label: "Alternating", description: "When wins and losses alternate", needsValue: false },
  no_win_for_n: { label: "No Win For N", description: "When no win for N rounds", needsValue: true, valueLabel: "N Rounds" },
  no_loss_for_n: { label: "No Loss For N", description: "When no loss for N rounds", needsValue: true, valueLabel: "N Rounds" },
  total_wins_equals: { label: "Total Wins = N", description: "When total wins equals N", needsValue: true, valueLabel: "N Wins" },
  total_losses_equals: { label: "Total Losses = N", description: "When total losses equals N", needsValue: true, valueLabel: "N Losses" },
  rounds_equals: { label: "Round N", description: "On specific round number", needsValue: true, valueLabel: "Round Number" },
  last_n_were_wins: { label: "Last N Were Wins", description: "When last N results were all wins", needsValue: true, valueLabel: "N" },
  last_n_were_losses: { label: "Last N Were Losses", description: "When last N results were all losses", needsValue: true, valueLabel: "N" },
  last_result_was_win: { label: "Last Was Win", description: "When last result was a win", needsValue: false },
  last_result_was_loss: { label: "Last Was Loss", description: "When last result was a loss", needsValue: false },
};

// Action display info for UI
export const ACTION_INFO: Record<ActionType, { label: string; description: string; needsValue: boolean; valueLabel?: string; defaultValue?: number }> = {
  increase_bet_percent: { label: "Increase Bet %", description: "Increase current bet by N%", needsValue: true, valueLabel: "Percent", defaultValue: 5 },
  decrease_bet_percent: { label: "Decrease Bet %", description: "Decrease current bet by N%", needsValue: true, valueLabel: "Percent", defaultValue: 5 },
  multiply_bet: { label: "Multiply Bet", description: "Multiply current bet by N", needsValue: true, valueLabel: "Multiplier", defaultValue: 2 },
  divide_bet: { label: "Divide Bet", description: "Divide current bet by N", needsValue: true, valueLabel: "Divisor", defaultValue: 2 },
  increase_bet_absolute: { label: "Increase Bet +", description: "Add N to current bet", needsValue: true, valueLabel: "Amount", defaultValue: 10 },
  decrease_bet_absolute: { label: "Decrease Bet -", description: "Subtract N from current bet", needsValue: true, valueLabel: "Amount", defaultValue: 10 },
  set_bet_absolute: { label: "Set Bet To", description: "Set bet to specific amount", needsValue: true, valueLabel: "Amount", defaultValue: 10 },
  set_bet_percent_of_balance: { label: "Bet % of Balance", description: "Set bet to N% of current balance", needsValue: true, valueLabel: "Percent", defaultValue: 1 },
  set_bet_percent_of_base: { label: "Bet % of Base", description: "Set bet to N% of base amount", needsValue: true, valueLabel: "Percent", defaultValue: 100 },
  reset_bet: { label: "Reset Bet", description: "Reset bet to base amount", needsValue: false },
  double_bet: { label: "Double Bet", description: "Double the current bet", needsValue: false },
  halve_bet: { label: "Halve Bet", description: "Halve the current bet", needsValue: false },
  triple_bet: { label: "Triple Bet", description: "Triple the current bet", needsValue: false },
  max_bet: { label: "Max Bet", description: "Set to maximum allowed bet", needsValue: false },
  min_bet: { label: "Min Bet", description: "Set to minimum allowed bet", needsValue: false },
  switch_over_under: { label: "Switch Over/Under", description: "Toggle between over and under", needsValue: false },
  set_over: { label: "Set Over", description: "Switch to over condition", needsValue: false },
  set_under: { label: "Set Under", description: "Switch to under condition", needsValue: false },
  invert_target: { label: "Invert Target", description: "Invert target (50→49, 75→24)", needsValue: false },
  set_target_absolute: { label: "Set Target", description: "Set target to specific value", needsValue: true, valueLabel: "Target (0-99)", defaultValue: 50 },
  increase_target: { label: "Increase Target", description: "Increase target by N", needsValue: true, valueLabel: "Amount", defaultValue: 5 },
  decrease_target: { label: "Decrease Target", description: "Decrease target by N", needsValue: true, valueLabel: "Amount", defaultValue: 5 },
  double_target: { label: "Double Target", description: "Double the target value", needsValue: false },
  halve_target: { label: "Halve Target", description: "Halve the target value", needsValue: false },
  stop: { label: "Stop", description: "Stop strategy execution", needsValue: false },
  pause_n_rounds: { label: "Pause", description: "Pause for N rounds", needsValue: true, valueLabel: "Rounds", defaultValue: 1 },
  skip_next_bet: { label: "Skip Next", description: "Skip the next bet", needsValue: false },
  reset_all_rules: { label: "Reset Rules", description: "Reset all rule counters", needsValue: false },
  execute_rule: { label: "Execute Rule", description: "Execute another rule by ID", needsValue: true, valueLabel: "Rule ID" },
  enable_rule: { label: "Enable Rule", description: "Enable another rule", needsValue: true, valueLabel: "Rule ID" },
  disable_rule: { label: "Disable Rule", description: "Disable another rule", needsValue: true, valueLabel: "Rule ID" },
};

// Preset strategies
export const STRATEGY_PRESETS: { id: string; name: string; description: string; strategy: AdvancedDiceStrategy }[] = [
  {
    id: "adaptive-kelly",
    name: "Adaptive Kelly",
    description: "Adjusts bet size based on win rate",
    strategy: {
      name: "Adaptive Kelly",
      baseConfig: { amount: 100, target: 33, condition: "under" },
      rules: [
        { id: "1", order: 0, enabled: true, trigger: { type: "win_rate_above", value: 55 }, action: { type: "set_bet_percent_of_balance", value: 5 } },
        { id: "2", order: 1, enabled: true, trigger: { type: "win_rate_below", value: 45 }, action: { type: "set_bet_percent_of_balance", value: 1 } },
        { id: "3", order: 2, enabled: true, trigger: { type: "streak_loss_at_least", value: 3 }, action: { type: "decrease_bet_percent", value: 50 } },
        { id: "4", order: 3, enabled: true, trigger: { type: "balance_percent_above", value: 50 }, action: { type: "stop" } },
      ],
      executionMode: "sequential",
      globalLimits: { maxBet: 10000, minBet: 10, maxRounds: 1000 },
    },
  },
  {
    id: "martingale-plus",
    name: "Martingale++",
    description: "Classic martingale with safety nets",
    strategy: {
      name: "Martingale Plus",
      baseConfig: { amount: 10, target: 49, condition: "over" },
      rules: [
        { id: "1", order: 0, enabled: true, trigger: { type: "loss", value: 1 }, action: { type: "double_bet" } },
        { id: "2", order: 1, enabled: true, trigger: { type: "win", value: 1 }, action: { type: "reset_bet" } },
        { id: "3", order: 2, enabled: true, trigger: { type: "streak_loss_at_least", value: 6 }, action: { type: "reset_bet" } },
      ],
      executionMode: "sequential",
      globalLimits: { maxBet: 1000, stopOnConsecutiveLosses: 8 },
    },
  },
  {
    id: "oscar-grind",
    name: "Oscar's Grind Advanced",
    description: "Conservative progression with pattern recognition",
    strategy: {
      name: "Oscar's Grind",
      baseConfig: { amount: 10, target: 49, condition: "over" },
      rules: [
        { id: "1", order: 0, enabled: true, trigger: { type: "win", value: 1 }, action: { type: "increase_bet_absolute", value: 10 } },
        { id: "2", order: 1, enabled: true, trigger: { type: "loss", value: 1 }, action: { type: "set_bet_absolute", value: 10 } },
        { id: "3", order: 2, enabled: true, trigger: { type: "profit_above", value: 100 }, action: { type: "reset_bet" } },
      ],
      executionMode: "sequential",
    },
  },
  {
    id: "trend-follower",
    name: "Trend Follower",
    description: "Switches condition based on recent patterns",
    strategy: {
      name: "Trend Follower",
      baseConfig: { amount: 20, target: 50, condition: "over" },
      rules: [
        { id: "1", order: 0, enabled: true, trigger: { type: "streak_loss_at_least", value: 3 }, action: { type: "switch_over_under" } },
        { id: "2", order: 1, enabled: true, trigger: { type: "streak_win_at_least", value: 3 }, action: { type: "increase_bet_percent", value: 20 } },
        { id: "3", order: 2, enabled: true, trigger: { type: "loss", value: 1 }, action: { type: "reset_bet" } },
      ],
      executionMode: "all_matching",
    },
  },
  {
    id: "risk-manager",
    name: "Risk Manager",
    description: "Aggressive on wins, conservative on losses",
    strategy: {
      name: "Risk Manager",
      baseConfig: { amount: 50, target: 40, condition: "under" },
      rules: [
        { id: "1", order: 0, enabled: true, trigger: { type: "win_rate_above", value: 60 }, action: { type: "set_bet_percent_of_balance", value: 10 } },
        { id: "2", order: 1, enabled: true, trigger: { type: "balance_percent_below", value: -20 }, action: { type: "set_bet_absolute", value: 10 } },
        { id: "3", order: 2, enabled: true, trigger: { type: "streak_loss_at_least", value: 5 }, action: { type: "stop" } },
        { id: "4", order: 3, enabled: true, trigger: { type: "balance_percent_above", value: 100 }, action: { type: "stop" } },
      ],
      executionMode: "sequential",
      globalLimits: { stopIfBalanceBelow: 100 },
    },
  },
];

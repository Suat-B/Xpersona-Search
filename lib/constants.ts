/**
 * Central config - single source of truth for game and app constants.
 * Override via env where noted.
 */
export const SIGNUP_BONUS = parseInt(process.env.SIGNUP_BONUS ?? "500", 10);
export const FAUCET_AMOUNT = parseInt(process.env.FAUCET_AMOUNT ?? "50", 10);
export const FAUCET_COOLDOWN_SECONDS = 3600;
export const MIN_BET = parseInt(process.env.MIN_BET ?? "1", 10);
export const MAX_BET = parseInt(process.env.MAX_BET ?? "10000", 10);
export const DICE_HOUSE_EDGE = 0.02;
export const DICE_MAX_MULTIPLIER = 10;
export const CRASH_MIN_MULTIPLIER = 1.0;
export const CRASH_MAX_MULTIPLIER = parseFloat(
  process.env.CRASH_MAX_MULTIPLIER ?? "10.0"
);
export const BLACKJACK_DECKS = 1;
export const BLACKJACK_BLACKJACK_PAYOUT = 2.5;
export const PLINKO_ROWS = 12;
export const SLOTS_REELS = 5;
export const SLOTS_ROWS_VISIBLE = 3;
export const SLOTS_PAYLINES = 10;

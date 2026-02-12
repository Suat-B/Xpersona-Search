/**
 * Central config - single source of truth for game and app constants.
 * Override via env where noted.
 *
 * House edge summary (single source of truth):
 * - Dice:     DICE_HOUSE_EDGE = 3%
 * - Blackjack: ~0.5% (standard rules, BJ 2.5:1, dealer stands 17)
 * - Plinko:   ~2–4% (bucket multipliers; low/medium/high risk)
 * - Slots:    set by paytable/reels (no explicit edge constant)
 * - Crash:    strategy-dependent; crash point uniform [CRASH_MIN, CRASH_MAX]
 */
export const SIGNUP_BONUS = parseInt(process.env.SIGNUP_BONUS ?? "500", 10);
export const FAUCET_AMOUNT = parseInt(process.env.FAUCET_AMOUNT ?? "100", 10);
export const FAUCET_COOLDOWN_SECONDS = 3600;
export const MIN_BET = parseInt(process.env.MIN_BET ?? "1", 10);
export const MAX_BET = parseInt(process.env.MAX_BET ?? "10000", 10);
export const DICE_HOUSE_EDGE = 0.03;
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

/** Withdrawal: 1 credit = $0.01 USD */
export const CREDITS_TO_USD = 0.01;
/** Minimum withdrawal in USD */
export const WITHDRAW_MIN_USD = 100;
/** Minimum withdrawal in credits (derived from WITHDRAW_MIN_USD) */
export const WITHDRAW_MIN_CREDITS = Math.round(WITHDRAW_MIN_USD / CREDITS_TO_USD);

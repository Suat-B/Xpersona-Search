/**
 * Central config - single source of truth for game and app constants.
 * Override via env where noted.
 *
 * House edge (single source of truth):
 * - Dice: DICE_HOUSE_EDGE = 3%
 */
export const SIGNUP_BONUS = parseInt(process.env.SIGNUP_BONUS ?? "500", 10);
export const FAUCET_AMOUNT = parseInt(process.env.FAUCET_AMOUNT ?? "100", 10);
export const FAUCET_COOLDOWN_SECONDS = 3600;
export const MIN_BET = parseInt(process.env.MIN_BET ?? "1", 10);
export const MAX_BET = parseInt(process.env.MAX_BET ?? "10000", 10);
export const DICE_HOUSE_EDGE = 0.03;
export const DICE_MAX_MULTIPLIER = 10;

/** Suggested thresholds for AI to alert player to deposit — use in prompt logic */
export const DEPOSIT_ALERT_LOW = 100;      // balance < this: suggest deposit soon
export const DEPOSIT_ALERT_CRITICAL = 10;  // balance < this: alert immediately

/** Credit milestones — when balance reaches these, AI can congratulate the player */
export const BALANCE_MILESTONES = [1000, 2000, 5000, 10000, 25000, 50000] as const;

/** Get highest milestone crossed for a balance; returns null if below first milestone */
export function getBalanceMilestone(balance: number): { milestone: number; message: string } | null {
  let highest = 0;
  for (const t of BALANCE_MILESTONES) {
    if (balance >= t) highest = t;
  }
  if (highest === 0) return null;
  const formatted = highest.toLocaleString();
  const messages: Record<number, string> = {
    1000: `Nice progress! You've reached ${formatted} credits.`,
    2000: `You're doing great! ${formatted} credits and climbing.`,
    5000: `Strong run! You've hit ${formatted} credits.`,
    10000: `Impressive! ${formatted} credits — keep it up!`,
    25000: `Outstanding! ${formatted} credits.`,
    50000: `Exceptional! You've reached ${formatted} credits.`,
  };
  return { milestone: highest, message: messages[highest] ?? `You've reached ${formatted} credits!` };
}

/** Withdrawal: 1 credit = $0.01 USD */
export const CREDITS_TO_USD = 0.01;
/** Minimum withdrawal in USD */
export const WITHDRAW_MIN_USD = 100;
/** Minimum withdrawal in credits (derived from WITHDRAW_MIN_USD) */
export const WITHDRAW_MIN_CREDITS = Math.round(WITHDRAW_MIN_USD / CREDITS_TO_USD);

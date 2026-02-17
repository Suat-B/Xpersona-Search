/**
 * Central config - single source of truth for game and app constants.
 * Override via env where noted.
 *
 * House edge (single source of truth):
 * - Dice: DICE_HOUSE_EDGE = 3%
 */
export const SIGNUP_BONUS = parseInt(process.env.SIGNUP_BONUS ?? "100", 10);
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

/** Session PnL milestones (positive) — when up by these amounts, AI can alert the player */
export const SESSION_PNL_MILESTONES = [100, 250, 500, 1000, 2500, 5000] as const;

/** Round count milestones — when this many rounds played, AI can give a status update */
export const ROUND_MILESTONES = [10, 25, 50, 100, 250, 500] as const;

/** Min win streak to suggest an alert (e.g., "On a 5-win streak!") */
export const WIN_STREAK_ALERT_THRESHOLD = 3;

/** Proof-of-life alert — ready-to-use message for AI to tell the player how things are going */
export type ProofOfLifeAlert = { type: string; message: string };

/** Count current win streak (positive) or loss streak (negative) from most recent bets. Bets ordered desc by time. */
export function calculateCurrentStreak(bets: { outcome: string }[]): number {
  if (bets.length === 0) return 0;
  let streak = 0;
  const lastResult = bets[0]!.outcome === "win";
  for (const bet of bets) {
    if ((bet.outcome === "win") === lastResult) {
      streak = lastResult ? streak + 1 : streak - 1;
    } else break;
  }
  return streak;
}

/**
 * Build proof-of-life alerts for the AI to proactively update the player.
 * Returns array of suggested messages; AI can pick 1–2 when appropriate.
 */
export function getProofOfLifeAlerts(
  sessionPnl: number,
  rounds: number,
  currentStreak: number,
  winRate: number
): ProofOfLifeAlert[] {
  const alerts: ProofOfLifeAlert[] = [];

  // Session PnL milestones (positive only)
  if (sessionPnl > 0) {
    let pnlMilestone = 0;
    for (const t of SESSION_PNL_MILESTONES) {
      if (sessionPnl >= t) pnlMilestone = t;
    }
    if (pnlMilestone > 0) {
      const formatted = pnlMilestone.toLocaleString();
      alerts.push({
        type: "session_pnl",
        message: `You're up ${formatted} credits this session!`,
      });
    }
  }

  // Round count milestones
  let roundsMilestone = 0;
  for (const t of ROUND_MILESTONES) {
    if (rounds >= t) roundsMilestone = t;
  }
  if (roundsMilestone > 0) {
    alerts.push({
      type: "rounds",
      message: `Played ${roundsMilestone} rounds so far.`,
    });
  }

  // Win streak
  if (currentStreak >= WIN_STREAK_ALERT_THRESHOLD) {
    alerts.push({
      type: "streak",
      message: `On a ${currentStreak}-win streak!`,
    });
  }

  // Session summary (always useful as a catch-all)
  const pnlSign = sessionPnl >= 0 ? "+" : "";
  const wr = Math.round(winRate);
  alerts.push({
    type: "summary",
    message: `Session: ${rounds} rounds, ${pnlSign}${sessionPnl} credits, ${wr}% win rate.`,
  });

  return alerts;
}

/** Withdrawal: 1 credit = $0.01 USD */
export const CREDITS_TO_USD = 0.01;
/** Minimum withdrawal in USD */
export const WITHDRAW_MIN_USD = 100;
/** Minimum withdrawal in credits (derived from WITHDRAW_MIN_USD) */
export const WITHDRAW_MIN_CREDITS = Math.round(WITHDRAW_MIN_USD / CREDITS_TO_USD);

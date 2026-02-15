import { db } from "@/lib/db";
import { faucetGrants, deposits } from "@/lib/db/schema";
import { eq } from "drizzle-orm";

/**
 * Withdrawal policy: FAUCET CREDITS ARE ABSOLUTELY 0% WITHDRAWABLE.
 * They can only be spent on bets (and burned on losses) — never converted to real funds.
 *
 * withdrawable = credits - faucetCredits (capped at 0).
 * All withdrawal logic MUST use this function. Never allow withdrawal of faucet-origin credits.
 */

export function getWithdrawableBalance(credits: number, faucetCredits: number): number {
  const fc = Math.max(0, Math.floor(faucetCredits ?? 0));
  const cr = Math.max(0, Math.floor(credits ?? 0));
  return Math.max(0, cr - fc);
}

/** True if user has ever claimed from the faucet (includes AI/agent claims). */
export async function hasEverClaimedFaucet(userId: string): Promise<boolean> {
  const [row] = await db
    .select({ id: faucetGrants.id })
    .from(faucetGrants)
    .where(eq(faucetGrants.userId, userId))
    .limit(1);
  return !!row;
}

/** True if user has ever made a deposit (Stripe purchase). */
export async function hasEverDeposited(userId: string): Promise<boolean> {
  const [row] = await db
    .select({ id: deposits.id })
    .from(deposits)
    .where(eq(deposits.userId, userId))
    .limit(1);
  return !!row;
}

export type WithdrawableResult = {
  withdrawable: number;
  /** True when withdrawable is 0 because user claimed faucet but never deposited. */
  blockedByFaucetGate: boolean;
};

/**
 * Withdrawal gate: faucet-only users get 0 withdrawable. Depositors use credits - faucetCredits.
 */
export async function getWithdrawableBalanceWithGate(
  userId: string,
  credits: number,
  faucetCredits: number
): Promise<WithdrawableResult> {
  const claimedFaucet = await hasEverClaimedFaucet(userId);
  const deposited = await hasEverDeposited(userId);
  if (claimedFaucet && !deposited) {
    return { withdrawable: 0, blockedByFaucetGate: true };
  }
  return {
    withdrawable: getWithdrawableBalance(credits, faucetCredits),
    blockedByFaucetGate: false,
  };
}

/** Assert faucet credits are never included in withdrawal amount. Use for defense-in-depth. */
export function assertFaucetExcludedFromWithdrawal(
  amount: number,
  credits: number,
  faucetCredits: number
): void {
  const withdrawable = getWithdrawableBalance(credits, faucetCredits);
  if (amount > withdrawable) {
    throw new Error(
      `Withdrawal exceeds withdrawable: requested ${amount}, max ${withdrawable} (faucet credits ${faucetCredits} excluded)`
    );
  }
}

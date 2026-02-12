/**
 * Withdrawal policy: faucet credits cannot be withdrawn.
 * withdrawable = credits - faucetCredits (capped at 0).
 * When withdrawal API is built, use getWithdrawableBalance().
 */

export function getWithdrawableBalance(credits: number, faucetCredits: number): number {
  return Math.max(0, credits - (faucetCredits ?? 0));
}

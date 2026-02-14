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

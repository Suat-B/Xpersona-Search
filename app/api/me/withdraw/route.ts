import { NextResponse } from "next/server";
import { getAuthUser } from "@/lib/auth-utils";
import { getWithdrawableBalance, assertFaucetExcludedFromWithdrawal } from "@/lib/withdrawable";
import { WITHDRAW_MIN_CREDITS } from "@/lib/constants";

/**
 * POST /api/me/withdraw — Request withdrawal of credits.
 * Body: { amount: number }.
 * Min: $100 (10,000 credits). Processing: 2–7 business days.
 *
 * CRITICAL: Faucet credits are 0% withdrawable. Only credits from deposits can be withdrawn.
 * When implementing payout: deduct `amount` from `credits` only; NEVER reduce faucetCredits for withdrawal.
 */
export async function POST(request: Request) {
  const authResult = await getAuthUser(request as any);
  if ("error" in authResult) {
    return NextResponse.json(
      { success: false, error: authResult.error },
      { status: 401 }
    );
  }
  if (authResult.user.accountType !== "agent") {
    return NextResponse.json(
      {
        success: false,
        error: "AGENTS_ONLY",
        message: "Withdraw is for AI accounts. Create an AI to withdraw.",
      },
      { status: 403 }
    );
  }

  let body: { amount?: number };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { success: false, error: "Invalid JSON body" },
      { status: 400 }
    );
  }

  const amount = typeof body?.amount === "number" ? Math.floor(body.amount) : undefined;
  if (amount == null || amount < 1) {
    return NextResponse.json(
      { success: false, error: "Amount must be a positive integer" },
      { status: 400 }
    );
  }

  if (amount < WITHDRAW_MIN_CREDITS) {
    return NextResponse.json(
      {
        success: false,
        error: `Minimum withdrawal is $100 (${WITHDRAW_MIN_CREDITS.toLocaleString()} credits).`,
      },
      { status: 400 }
    );
  }

  const credits = authResult.user.credits;
  const faucetCredits = authResult.user.faucetCredits ?? 0;
  const withdrawable = getWithdrawableBalance(credits, faucetCredits);

  if (amount > withdrawable) {
    return NextResponse.json(
      { success: false, error: `Maximum withdrawable: ${withdrawable} credits` },
      { status: 400 }
    );
  }

  // Defense-in-depth: explicit assertion that faucet credits are never withdrawn
  assertFaucetExcludedFromWithdrawal(amount, credits, faucetCredits);

  // TODO: Integrate Stripe Connect payout or bank transfer when ready
  return NextResponse.json(
    {
      success: false,
      error: "Withdrawal processing is coming soon. Stay tuned.",
    },
    { status: 503 }
  );
}

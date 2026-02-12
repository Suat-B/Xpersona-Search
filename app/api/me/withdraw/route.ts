import { NextResponse } from "next/server";
import { getAuthUser } from "@/lib/auth-utils";
import { getWithdrawableBalance } from "@/lib/withdrawable";
import { WITHDRAW_MIN_CREDITS } from "@/lib/constants";

/**
 * POST /api/me/withdraw — Request withdrawal of credits.
 * Body: { amount: number }.
 * Min: $100 (10,000 credits). Processing: 2–7 business days.
 * Withdrawal processing (Stripe Connect, bank transfer, etc.) is not yet implemented.
 */
export async function POST(request: Request) {
  const authResult = await getAuthUser(request as any);
  if ("error" in authResult) {
    return NextResponse.json(
      { success: false, error: authResult.error },
      { status: 401 }
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

  const withdrawable = getWithdrawableBalance(
    authResult.user.credits,
    authResult.user.faucetCredits ?? 0
  );
  if (amount > withdrawable) {
    return NextResponse.json(
      { success: false, error: `Maximum withdrawable: ${withdrawable} credits` },
      { status: 400 }
    );
  }

  // TODO: Integrate Stripe Connect payout or bank transfer when ready
  return NextResponse.json(
    {
      success: false,
      error: "Withdrawal processing is coming soon. Stay tuned.",
    },
    { status: 503 }
  );
}

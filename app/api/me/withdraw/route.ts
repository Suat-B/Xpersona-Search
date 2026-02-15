import { NextResponse } from "next/server";
import { eq, and } from "drizzle-orm";
import { getAuthUser } from "@/lib/auth-utils";
import { getWithdrawableBalance, assertFaucetExcludedFromWithdrawal } from "@/lib/withdrawable";
import { WITHDRAW_MIN_CREDITS } from "@/lib/constants";
import { withdrawSchema } from "@/lib/validation";
import { db } from "@/lib/db";
import { users, withdrawalRequests } from "@/lib/db/schema";

/**
 * POST /api/me/withdraw — Request withdrawal of credits via Wise.
 * Body: { amount: number, wiseEmail: string, fullName: string, currency?: "USD"|"EUR"|"GBP" }.
 * Min: $100 (10,000 credits). Processing: 2–7 business days.
 *
 * CRITICAL: Faucet credits are 0% withdrawable. Only credits from deposits can be withdrawn.
 * Deducts amount from credits on creation so balance reflects pending withdrawal.
 */
export async function POST(request: Request) {
  const authResult = await getAuthUser(request as any);
  if ("error" in authResult) {
    return NextResponse.json(
      { success: false, error: authResult.error },
      { status: 401 }
    );
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { success: false, error: "Invalid JSON body" },
      { status: 400 }
    );
  }

  const parsed = withdrawSchema.safeParse(body);
  if (!parsed.success) {
    const first = parsed.error.flatten().fieldErrors;
    const msg =
      first.amount?.[0] ??
      first.wiseEmail?.[0] ??
      first.fullName?.[0] ??
      first.currency?.[0] ??
      "Invalid request";
    return NextResponse.json(
      { success: false, error: msg },
      { status: 400 }
    );
  }

  const { amount, wiseEmail, fullName, currency } = parsed.data;

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

  assertFaucetExcludedFromWithdrawal(amount, credits, faucetCredits);

  const userId = authResult.user.id;

  // Rate limit: one pending withdrawal at a time
  const [existing] = await db
    .select()
    .from(withdrawalRequests)
    .where(
      and(
        eq(withdrawalRequests.userId, userId),
        eq(withdrawalRequests.status, "pending")
      )
    )
    .limit(1);

  if (existing) {
    return NextResponse.json(
      {
        success: false,
        error:
          "You already have a pending withdrawal. Please wait for it to process before requesting another.",
      },
      { status: 429 }
    );
  }

  await db.transaction(async (tx) => {
    await tx.insert(withdrawalRequests).values({
      userId,
      amount,
      wiseEmail,
      fullName,
      currency,
      status: "pending",
    });
    await tx
      .update(users)
      .set({ credits: credits - amount })
      .where(eq(users.id, userId));
  });

  return NextResponse.json({
    success: true,
    message:
      "Withdrawal requested. Payout will be sent via Wise to your email. Processing: 2–7 business days.",
  });
}

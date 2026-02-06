import { NextResponse } from "next/server";
import { getAuthUser } from "@/lib/auth-utils";
import { db } from "@/lib/db";
import { users, crashRounds, crashBets } from "@/lib/db/schema";
import { eq, and } from "drizzle-orm";
import { crashBetSchema } from "@/lib/validation";
import { getRunningRound, currentMultiplier, shouldCrash } from "@/lib/games/crash";

export async function POST(request: Request) {
  const authResult = await getAuthUser(request as any);
  if ("error" in authResult) {
    return NextResponse.json(
      { success: false, error: authResult.error },
      { status: 401 }
    );
  }
  const body = await request.json().catch(() => ({}));
  const parsed = crashBetSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { success: false, error: "VALIDATION_ERROR" },
      { status: 400 }
    );
  }
  const amount = parsed.data.amount;
  const round = await getRunningRound();
  if (!round) {
    return NextResponse.json(
      { success: false, error: "ROUND_NOT_FOUND" },
      { status: 404 }
    );
  }
  if (shouldCrash(round)) {
    return NextResponse.json(
      { success: false, error: "ROUND_ENDED" },
      { status: 400 }
    );
  }
  if (amount > authResult.user.credits) {
    return NextResponse.json(
      { success: false, error: "INSUFFICIENT_BALANCE" },
      { status: 400 }
    );
  }
  const mult = currentMultiplier(round);
  if (mult >= round.crashPoint) {
    return NextResponse.json(
      { success: false, error: "ROUND_ENDED" },
      { status: 400 }
    );
  }
  try {
    const result = await db.transaction(async (tx) => {
      const [userRow] = await tx
        .select({ credits: users.credits })
        .from(users)
        .where(eq(users.id, authResult.user.id))
        .limit(1);
      if (!userRow || userRow.credits < amount) {
        throw new Error("INSUFFICIENT_BALANCE");
      }
      const [existing] = await tx
        .select()
        .from(crashBets)
        .where(and(eq(crashBets.crashRoundId, round.id), eq(crashBets.userId, authResult.user.id)))
        .limit(1);
      if (existing) {
        throw new Error("ALREADY_BET");
      }
      await tx
        .update(users)
        .set({ credits: userRow.credits - amount })
        .where(eq(users.id, authResult.user.id));
      const [bet] = await tx
        .insert(crashBets)
        .values({
          crashRoundId: round.id,
          userId: authResult.user.id,
          amount,
          payout: 0,
        })
        .returning({ id: crashBets.id });
      return {
        betId: bet!.id,
        roundId: round.id,
        amount,
        balance: userRow.credits - amount,
      };
    });
    return NextResponse.json({ success: true, data: result });
  } catch (e) {
    const err = e as Error;
    if (err.message === "INSUFFICIENT_BALANCE") {
      return NextResponse.json(
        { success: false, error: "INSUFFICIENT_BALANCE" },
        { status: 400 }
      );
    }
    if (err.message === "ALREADY_BET") {
      return NextResponse.json(
        { success: false, error: "VALIDATION_ERROR", message: "Already bet in this round" },
        { status: 400 }
      );
    }
    console.error(e);
    return NextResponse.json(
      { success: false, error: "INTERNAL_ERROR" },
      { status: 500 }
    );
  }
}

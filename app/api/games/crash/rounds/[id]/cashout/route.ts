import { NextResponse } from "next/server";
import { getAuthUser } from "@/lib/auth-utils";
import { db } from "@/lib/db";
import { users, crashRounds, crashBets } from "@/lib/db/schema";
import { eq, and } from "drizzle-orm";
import { currentMultiplier, shouldCrash } from "@/lib/games/crash";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const authResult = await getAuthUser(request as any);
  if ("error" in authResult) {
    return NextResponse.json(
      { success: false, error: authResult.error },
      { status: 401 }
    );
  }
  const { id: roundId } = await params;
  const [round] = await db
    .select()
    .from(crashRounds)
    .where(eq(crashRounds.id, roundId))
    .limit(1);
  if (!round) {
    return NextResponse.json(
      { success: false, error: "ROUND_NOT_FOUND" },
      { status: 404 }
    );
  }
  if (round.status !== "running") {
    return NextResponse.json(
      { success: false, error: "ROUND_ENDED" },
      { status: 400 }
    );
  }
  if (shouldCrash(round)) {
    return NextResponse.json(
      { success: false, error: "ROUND_ENDED" },
      { status: 400 }
    );
  }
  const mult = currentMultiplier(round);
  const [bet] = await db
    .select()
    .from(crashBets)
    .where(and(eq(crashBets.crashRoundId, roundId), eq(crashBets.userId, authResult.user.id)))
    .limit(1);
  if (!bet) {
    return NextResponse.json(
      { success: false, error: "ROUND_NOT_FOUND" },
      { status: 404 }
    );
  }
  if (bet.cashedOutAt != null) {
    return NextResponse.json(
      { success: false, error: "ROUND_ENDED", message: "Already cashed out" },
      { status: 400 }
    );
  }
  const payout = Math.round(bet.amount * mult);
  await db.transaction(async (tx) => {
    await tx
      .update(crashBets)
      .set({ cashedOutAt: mult, payout })
      .where(eq(crashBets.id, bet.id));
    const [u] = await tx
      .select({ credits: users.credits })
      .from(users)
      .where(eq(users.id, authResult.user.id))
      .limit(1);
    if (u) {
      await tx
        .update(users)
        .set({ credits: u.credits + payout })
        .where(eq(users.id, authResult.user.id));
    }
  });
  const [u] = await db
    .select({ credits: users.credits })
    .from(users)
    .where(eq(users.id, authResult.user.id))
    .limit(1);
  return NextResponse.json({
    success: true,
    data: {
      cashedOutAt: mult,
      payout,
      balance: (u?.credits ?? 0),
    },
  });
}

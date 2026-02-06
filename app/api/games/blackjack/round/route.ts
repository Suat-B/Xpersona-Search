import { NextResponse } from "next/server";
import { getAuthUser } from "@/lib/auth-utils";
import { db } from "@/lib/db";
import { users, blackjackRounds, serverSeeds } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { blackjackRoundSchema } from "@/lib/validation";
import { createBlackjackRound } from "@/lib/games/blackjack";
import { hashSeed } from "@/lib/games/rng";
import { randomBytes } from "crypto";

export async function POST(request: Request) {
  const authResult = await getAuthUser(request as any);
  if ("error" in authResult) {
    return NextResponse.json({ success: false, error: authResult.error }, { status: 401 });
  }
  const body = await request.json().catch(() => ({}));
  const parsed = blackjackRoundSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ success: false, error: "VALIDATION_ERROR" }, { status: 400 });
  }
  const amount = parsed.data.amount;
  if (amount > authResult.user.credits) {
    return NextResponse.json({ success: false, error: "INSUFFICIENT_BALANCE" }, { status: 400 });
  }
  try {
    const result = await db.transaction(async (tx) => {
      const [userRow] = await tx.select({ credits: users.credits }).from(users).where(eq(users.id, authResult.user.id)).limit(1);
      if (!userRow || userRow.credits < amount) throw new Error("INSUFFICIENT_BALANCE");
      const serverSeed = randomBytes(32).toString("hex");
      const seedHash = hashSeed(serverSeed);
      const [seedRow] = await tx.insert(serverSeeds).values({ seedHash, seed: serverSeed, used: true }).returning({ id: serverSeeds.id });
      const { deck, playerHand, dealerHand } = createBlackjackRound(serverSeed, "", 0);
      await tx.update(users).set({ credits: userRow.credits - amount }).where(eq(users.id, authResult.user.id));
      const [round] = await tx.insert(blackjackRounds).values({
        userId: authResult.user.id,
        betAmount: amount,
        playerHands: [playerHand],
        dealerHand,
        deck,
        status: "active",
        serverSeedId: seedRow!.id,
        clientSeed: "",
        nonce: 0,
      }).returning({ id: blackjackRounds.id });
      return {
        roundId: round!.id,
        playerHand,
        dealerUp: dealerHand[0],
        balance: userRow.credits - amount,
        status: "active",
      };
    });
    return NextResponse.json({ success: true, data: result });
  } catch (e) {
    if ((e as Error).message === "INSUFFICIENT_BALANCE") {
      return NextResponse.json({ success: false, error: "INSUFFICIENT_BALANCE" }, { status: 400 });
    }
    console.error(e);
    return NextResponse.json({ success: false, error: "INTERNAL_ERROR" }, { status: 500 });
  }
}

import { db } from "@/lib/db";
import { users, gameBets, serverSeeds } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { runPlinkoBet } from "@/lib/games/plinko";
import { hashSeed } from "@/lib/games/rng";
import { randomBytes } from "crypto";
import type { PlinkoRisk } from "@/lib/games/plinko";

export type PlinkoRoundResult = {
  balance: number;
  bucketIndex: number;
  multiplier: number;
  payout: number;
};

export async function executePlinkoRound(
  userId: string,
  amount: number,
  risk: PlinkoRisk
): Promise<PlinkoRoundResult> {
  const [userRow] = await db
    .select({ credits: users.credits })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);
  if (!userRow) throw new Error("USER_NOT_FOUND");
  if (userRow.credits < amount) throw new Error("INSUFFICIENT_BALANCE");

  const clientSeed = "";
  const result = await db.transaction(async (tx) => {
    const [row] = await tx
      .select({ credits: users.credits })
      .from(users)
      .where(eq(users.id, userId))
      .limit(1);
    if (!row || row.credits < amount) throw new Error("INSUFFICIENT_BALANCE");
    const serverSeed = randomBytes(32).toString("hex");
    const seedHash = hashSeed(serverSeed);
    const [seedRow] = await tx
      .insert(serverSeeds)
      .values({ seedHash, seed: serverSeed, used: true })
      .returning({ id: serverSeeds.id });
    const plinkoResult = runPlinkoBet(amount, risk, serverSeed, clientSeed, 0);
    const newCredits = row.credits - amount + plinkoResult.payout;
    await tx
      .update(users)
      .set({ credits: newCredits })
      .where(eq(users.id, userId));
    await tx.insert(gameBets).values({
      userId,
      gameType: "plinko",
      amount,
      outcome: plinkoResult.payout > 0 ? "win" : "loss",
      payout: plinkoResult.payout,
      resultPayload: plinkoResult.resultPayload,
      serverSeedId: seedRow!.id,
      clientSeed,
      nonce: 0,
    });
    return {
      balance: newCredits,
      bucketIndex: plinkoResult.bucketIndex,
      multiplier: plinkoResult.multiplier,
      payout: plinkoResult.payout,
    };
  });
  return result;
}

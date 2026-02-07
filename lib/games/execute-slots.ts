import { db } from "@/lib/db";
import { users, gameBets, serverSeeds } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { runSlotsSpin } from "@/lib/games/slots";
import { hashSeed } from "@/lib/games/rng";
import { randomBytes } from "crypto";

export type SlotsRoundResult = {
  balance: number;
  totalPayout: number;
};

export async function executeSlotsRound(
  userId: string,
  amount: number
): Promise<SlotsRoundResult> {
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
    const spinResult = runSlotsSpin(amount, serverSeed, clientSeed, 0);
    const newCredits = row.credits - amount + spinResult.totalPayout;
    await tx
      .update(users)
      .set({ credits: newCredits })
      .where(eq(users.id, userId));
    await tx.insert(gameBets).values({
      userId,
      gameType: "slots",
      amount,
      outcome: spinResult.totalPayout > 0 ? "win" : "loss",
      payout: spinResult.totalPayout,
      resultPayload: spinResult.resultPayload,
      serverSeedId: seedRow!.id,
      clientSeed,
      nonce: 0,
    });
    return {
      balance: newCredits,
      totalPayout: spinResult.totalPayout,
    };
  });
  return result;
}

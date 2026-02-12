import { db } from "@/lib/db";
import { users, gameBets, serverSeeds } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { runDiceBet, validateDiceBet } from "@/lib/games/dice";
import { hashSeed } from "@/lib/games/rng";
import { randomBytes } from "crypto";

export type DiceRoundResult = {
  balance: number;
  result: number;
  win: boolean;
  payout: number;
  betId?: string;
  serverSeedHash?: string;
};

/** Execute one dice round for a user. Throws on insufficient balance or validation. */
export async function executeDiceRound(
  userId: string,
  amount: number,
  target: number,
  condition: "over" | "under",
  resultPayloadExtra?: Record<string, unknown>
): Promise<DiceRoundResult> {
  const [userRow] = await db
    .select({ credits: users.credits, faucetCredits: users.faucetCredits })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);
  if (!userRow) throw new Error("USER_NOT_FOUND");
  const err = validateDiceBet(amount, target, condition, userRow.credits);
  if (err) throw new Error(err);

  const clientSeed = "";
  const result = await db.transaction(async (tx) => {
    const [row] = await tx
      .select({ credits: users.credits, faucetCredits: users.faucetCredits })
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
    const diceResult = runDiceBet(
      amount,
      target,
      condition,
      serverSeed,
      clientSeed,
      0
    );
    const payload = { ...diceResult.resultPayload, ...(resultPayloadExtra || {}) };
    const newCredits = row.credits - amount + diceResult.payout;
    const currentFaucet = row.faucetCredits ?? 0;
    const burnedFaucet = diceResult.win ? 0 : Math.min(currentFaucet, amount);
    const newFaucetCredits = Math.max(0, currentFaucet - burnedFaucet);
    await tx
      .update(users)
      .set({ credits: newCredits, faucetCredits: newFaucetCredits })
      .where(eq(users.id, userId));
    const [bet] = await tx
      .insert(gameBets)
      .values({
        userId,
        gameType: "dice",
        amount,
        outcome: diceResult.win ? "win" : "loss",
        payout: diceResult.payout,
        resultPayload: payload,
        serverSeedId: seedRow!.id,
        clientSeed,
        nonce: 0,
      })
      .returning({ id: gameBets.id });
    return {
      balance: newCredits,
      result: diceResult.result,
      win: diceResult.win,
      payout: diceResult.payout,
      betId: bet?.id,
      serverSeedHash: seedHash,
    };
  });
  return result;
}

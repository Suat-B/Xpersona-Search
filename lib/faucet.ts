import { db } from "@/lib/db";
import { users, faucetGrants } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { FAUCET_AMOUNT, FAUCET_COOLDOWN_SECONDS } from "./constants";

export type FaucetResult =
  | { granted: true; balance: number; nextFaucetAt: Date }
  | { granted: false; nextFaucetAt: Date };

export function canClaimFaucet(lastFaucetAt: Date | null): boolean {
  if (!lastFaucetAt) return true;
  return (Date.now() - lastFaucetAt.getTime()) / 1000 >= FAUCET_COOLDOWN_SECONDS;
}

export async function grantFaucet(
  userId: string
): Promise<FaucetResult> {
  const [user] = await db
    .select({ credits: users.credits, lastFaucetAt: users.lastFaucetAt })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);
  if (!user) throw new Error("User not found");
  const now = new Date();
  const nextEligible = user.lastFaucetAt
    ? new Date(user.lastFaucetAt.getTime() + FAUCET_COOLDOWN_SECONDS * 1000)
    : now;
  if (nextEligible > now) {
    return { granted: false, nextFaucetAt: nextEligible };
  }
  await db.transaction(async (tx) => {
    await tx
      .update(users)
      .set({
        credits: user.credits + FAUCET_AMOUNT,
        lastFaucetAt: now,
      })
      .where(eq(users.id, userId));
    await tx.insert(faucetGrants).values({ userId, amount: FAUCET_AMOUNT });
  });
  const nextFaucetAt = new Date(now.getTime() + FAUCET_COOLDOWN_SECONDS * 1000);
  return {
    granted: true,
    balance: user.credits + FAUCET_AMOUNT,
    nextFaucetAt,
  };
}

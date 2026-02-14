import { db } from "@/lib/db";
import {
  users,
  gameBets,
  strategies,
  faucetGrants,
  agentSessions,
} from "@/lib/db/schema";
import { eq } from "drizzle-orm";

/**
 * Merge guest user data into the target user.
 * Transfers: game_bets, strategies, faucet_grants, agent_sessions, and credits.
 */
export async function mergeGuestIntoUser(
  guestUserId: string,
  targetUserId: string
): Promise<{ ok: true } | { ok: false; error: string }> {
  if (guestUserId === targetUserId) {
    return { ok: false, error: "Same user" };
  }

  try {
    await db.transaction(async (tx) => {
      const [guestRow] = await tx
        .select({ id: users.id, credits: users.credits })
        .from(users)
        .where(eq(users.id, guestUserId))
        .limit(1);
      if (!guestRow) {
        throw new Error("Guest user not found");
      }

      const [targetRow] = await tx
        .select({ id: users.id, credits: users.credits })
        .from(users)
        .where(eq(users.id, targetUserId))
        .limit(1);
      if (!targetRow) {
        throw new Error("Target user not found");
      }

      const guestCredits = guestRow.credits ?? 0;
      const targetCredits = targetRow.credits ?? 0;
      const newCredits = targetCredits + guestCredits;

      await tx
        .update(gameBets)
        .set({ userId: targetUserId })
        .where(eq(gameBets.userId, guestUserId));

      await tx
        .update(strategies)
        .set({ userId: targetUserId })
        .where(eq(strategies.userId, guestUserId));

      await tx
        .update(faucetGrants)
        .set({ userId: targetUserId })
        .where(eq(faucetGrants.userId, guestUserId));

      await tx
        .update(agentSessions)
        .set({ userId: targetUserId })
        .where(eq(agentSessions.userId, guestUserId));

      await tx
        .update(users)
        .set({ credits: newCredits })
        .where(eq(users.id, targetUserId));

      await tx.delete(users).where(eq(users.id, guestUserId));
    });
    return { ok: true };
  } catch (err) {
    console.error("[merge-guest] mergeGuestIntoUser error:", err);
    return {
      ok: false,
      error: err instanceof Error ? err.message : "Merge failed",
    };
  }
}

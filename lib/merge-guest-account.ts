import { db } from "@/lib/db";
import {
  users,
  gameBets,
  strategies,
  faucetGrants,
  agentSessions,
} from "@/lib/db/schema";
import { eq } from "drizzle-orm";

type MergeOptions = {
  transferAgentFields?: boolean;
};

type DbTransaction = Parameters<Parameters<typeof db.transaction>[0]>[0];

async function mergeEphemeralIntoTarget(
  tx: DbTransaction,
  sourceUserId: string,
  targetUserId: string,
  options: MergeOptions = {}
): Promise<void> {
  const [sourceRow] = await tx
    .select({
      id: users.id,
      credits: users.credits,
      apiKeyHash: users.apiKeyHash,
      apiKeyPrefix: users.apiKeyPrefix,
      apiKeyCreatedAt: users.apiKeyCreatedAt,
      agentId: users.agentId,
    })
    .from(users)
    .where(eq(users.id, sourceUserId))
    .limit(1);
  if (!sourceRow) {
    throw new Error("Source user not found");
  }

  const [targetRow] = await tx
    .select({ id: users.id, credits: users.credits, agentId: users.agentId })
    .from(users)
    .where(eq(users.id, targetUserId))
    .limit(1);
  if (!targetRow) {
    throw new Error("Target user not found");
  }

  const sourceCredits = sourceRow.credits ?? 0;
  const targetCredits = targetRow.credits ?? 0;
  const newCredits = targetCredits + sourceCredits;

  await tx
    .update(gameBets)
    .set({ userId: targetUserId })
    .where(eq(gameBets.userId, sourceUserId));

  await tx
    .update(strategies)
    .set({ userId: targetUserId })
    .where(eq(strategies.userId, sourceUserId));

  await tx
    .update(faucetGrants)
    .set({ userId: targetUserId })
    .where(eq(faucetGrants.userId, sourceUserId));

  await tx
    .update(agentSessions)
    .set({ userId: targetUserId })
    .where(eq(agentSessions.userId, sourceUserId));

  const targetUpdate: Record<string, unknown> = { credits: newCredits };

  if (options.transferAgentFields && sourceRow.apiKeyHash) {
    targetUpdate.apiKeyHash = sourceRow.apiKeyHash;
    targetUpdate.apiKeyPrefix = sourceRow.apiKeyPrefix;
    targetUpdate.apiKeyCreatedAt = sourceRow.apiKeyCreatedAt;
  }
  if (options.transferAgentFields && sourceRow.agentId) {
    targetUpdate.agentId = sourceRow.agentId;
  }

  if (options.transferAgentFields) {
    const sourceNulls: Record<string, unknown> = {};
    if (sourceRow.apiKeyHash) {
      sourceNulls.apiKeyHash = null;
      sourceNulls.apiKeyPrefix = null;
      sourceNulls.apiKeyCreatedAt = null;
    }
    if (sourceRow.agentId) {
      sourceNulls.agentId = null;
    }
    if (Object.keys(sourceNulls).length > 0) {
      await tx
        .update(users)
        .set(sourceNulls as Record<string, never>)
        .where(eq(users.id, sourceUserId));
    }
  }

  await tx
    .update(users)
    .set(targetUpdate as Record<string, never>)
    .where(eq(users.id, targetUserId));

  await tx.delete(users).where(eq(users.id, sourceUserId));
}

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
      await mergeEphemeralIntoTarget(tx, guestUserId, targetUserId);
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

/**
 * Merge agent user data into the target user.
 * Transfers: game_bets, strategies, faucet_grants, agent_sessions, credits,
 * and API key (apiKeyHash, apiKeyPrefix, apiKeyCreatedAt) so the same API key
 * keeps working. Also transfers agentId for audit continuity.
 */
export async function mergeAgentIntoUser(
  agentUserId: string,
  targetUserId: string
): Promise<{ ok: true } | { ok: false; error: string }> {
  if (agentUserId === targetUserId) {
    return { ok: false, error: "Same user" };
  }

  try {
    await db.transaction(async (tx) => {
      await mergeEphemeralIntoTarget(tx, agentUserId, targetUserId, {
        transferAgentFields: true,
      });
    });
    return { ok: true };
  } catch (err) {
    console.error("[merge-agent] mergeAgentIntoUser error:", err);
    return {
      ok: false,
      error: err instanceof Error ? err.message : "Merge failed",
    };
  }
}

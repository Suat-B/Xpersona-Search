import { db } from "@/lib/db";
import {
  users,
  gameBets,
  strategies,
  faucetGrants,
  agentSessions,
  crashBets,
  blackjackRounds,
  deposits,
  withdrawalRequests,
  advancedStrategies,
  marketplaceDevelopers,
  marketplaceStrategies,
  marketplaceSubscriptions,
  aiStrategyHarvest,
  userSignalPreferences,
  ansDomains,
  ansSubscriptions,
  signalDeliveryLogs,
  agents,
  agentClaims,
} from "@/lib/db/schema";
import { and, eq, sql } from "drizzle-orm";

type MergeOptions = {
  transferAgentFields?: boolean;
};

type DbTransaction = Parameters<Parameters<typeof db.transaction>[0]>[0];

function appendMergeSuffix(name: string, suffixNumber: number): string {
  const suffix = ` (${suffixNumber})`;
  if (name.length + suffix.length <= 100) return `${name}${suffix}`;
  return `${name.slice(0, Math.max(1, 100 - suffix.length))}${suffix}`;
}

async function dedupeStrategyNamesForTarget(
  tx: DbTransaction,
  sourceUserId: string,
  targetUserId: string
): Promise<void> {
  const sourceRows = await tx
    .select({
      id: strategies.id,
      gameType: strategies.gameType,
      name: strategies.name,
    })
    .from(strategies)
    .where(eq(strategies.userId, sourceUserId));

  if (sourceRows.length === 0) return;

  const targetRows = await tx
    .select({ gameType: strategies.gameType, name: strategies.name })
    .from(strategies)
    .where(eq(strategies.userId, targetUserId));

  const existingKeys = new Set(
    targetRows.map((row) => `${row.gameType}::${row.name}`)
  );

  for (const row of sourceRows) {
    const directKey = `${row.gameType}::${row.name}`;
    if (!existingKeys.has(directKey)) {
      existingKeys.add(directKey);
      continue;
    }

    let suffixNumber = 2;
    let candidate = appendMergeSuffix(row.name, suffixNumber);
    while (existingKeys.has(`${row.gameType}::${candidate}`)) {
      suffixNumber += 1;
      candidate = appendMergeSuffix(row.name, suffixNumber);
    }

    await tx
      .update(strategies)
      .set({ name: candidate })
      .where(eq(strategies.id, row.id));

    existingKeys.add(`${row.gameType}::${candidate}`);
  }
}

async function dedupeAdvancedStrategyNamesForTarget(
  tx: DbTransaction,
  sourceUserId: string,
  targetUserId: string
): Promise<void> {
  const sourceRows = await tx
    .select({ id: advancedStrategies.id, name: advancedStrategies.name })
    .from(advancedStrategies)
    .where(eq(advancedStrategies.userId, sourceUserId));

  if (sourceRows.length === 0) return;

  const targetRows = await tx
    .select({ name: advancedStrategies.name })
    .from(advancedStrategies)
    .where(eq(advancedStrategies.userId, targetUserId));

  const existingNames = new Set(targetRows.map((row) => row.name));

  for (const row of sourceRows) {
    if (!existingNames.has(row.name)) {
      existingNames.add(row.name);
      continue;
    }

    let suffixNumber = 2;
    let candidate = appendMergeSuffix(row.name, suffixNumber);
    while (existingNames.has(candidate)) {
      suffixNumber += 1;
      candidate = appendMergeSuffix(row.name, suffixNumber);
    }

    await tx
      .update(advancedStrategies)
      .set({ name: candidate })
      .where(eq(advancedStrategies.id, row.id));

    existingNames.add(candidate);
  }
}

async function mergeUserSignalPreferences(
  tx: DbTransaction,
  sourceUserId: string,
  targetUserId: string
): Promise<void> {
  const [sourcePrefs] = await tx
    .select({
      id: userSignalPreferences.id,
      discordWebhookUrl: userSignalPreferences.discordWebhookUrl,
      email: userSignalPreferences.email,
      webhookUrl: userSignalPreferences.webhookUrl,
    })
    .from(userSignalPreferences)
    .where(eq(userSignalPreferences.userId, sourceUserId))
    .limit(1);

  if (!sourcePrefs) return;

  const [targetPrefs] = await tx
    .select({
      id: userSignalPreferences.id,
      discordWebhookUrl: userSignalPreferences.discordWebhookUrl,
      email: userSignalPreferences.email,
      webhookUrl: userSignalPreferences.webhookUrl,
    })
    .from(userSignalPreferences)
    .where(eq(userSignalPreferences.userId, targetUserId))
    .limit(1);

  if (!targetPrefs) {
    await tx
      .update(userSignalPreferences)
      .set({ userId: targetUserId, updatedAt: new Date() })
      .where(eq(userSignalPreferences.id, sourcePrefs.id));
    return;
  }

  await tx
    .update(userSignalPreferences)
    .set({
      discordWebhookUrl:
        targetPrefs.discordWebhookUrl ?? sourcePrefs.discordWebhookUrl,
      email: targetPrefs.email ?? sourcePrefs.email,
      webhookUrl: targetPrefs.webhookUrl ?? sourcePrefs.webhookUrl,
      updatedAt: new Date(),
    })
    .where(eq(userSignalPreferences.id, targetPrefs.id));

  await tx
    .delete(userSignalPreferences)
    .where(eq(userSignalPreferences.id, sourcePrefs.id));
}

async function recomputeDeveloperSubscriberCount(
  tx: DbTransaction,
  developerId: string
): Promise<void> {
  const [countRow] = await tx
    .select({ count: sql<number>`count(*)::int` })
    .from(marketplaceSubscriptions)
    .innerJoin(
      marketplaceStrategies,
      eq(marketplaceSubscriptions.strategyId, marketplaceStrategies.id)
    )
    .where(
      and(
        eq(marketplaceStrategies.developerId, developerId),
        eq(marketplaceSubscriptions.status, "active")
      )
    );

  await tx
    .update(marketplaceDevelopers)
    .set({
      subscriberCount: countRow?.count ?? 0,
      updatedAt: new Date(),
    })
    .where(eq(marketplaceDevelopers.id, developerId));
}

async function handleMarketplaceDeveloperMerge(
  tx: DbTransaction,
  sourceUserId: string,
  targetUserId: string
): Promise<void> {
  const [sourceDev] = await tx
    .select({
      id: marketplaceDevelopers.id,
      userId: marketplaceDevelopers.userId,
      stripeAccountId: marketplaceDevelopers.stripeAccountId,
      stripeOnboardingComplete: marketplaceDevelopers.stripeOnboardingComplete,
    })
    .from(marketplaceDevelopers)
    .where(eq(marketplaceDevelopers.userId, sourceUserId))
    .limit(1);

  const [targetDev] = await tx
    .select({
      id: marketplaceDevelopers.id,
      userId: marketplaceDevelopers.userId,
      stripeAccountId: marketplaceDevelopers.stripeAccountId,
      stripeOnboardingComplete: marketplaceDevelopers.stripeOnboardingComplete,
    })
    .from(marketplaceDevelopers)
    .where(eq(marketplaceDevelopers.userId, targetUserId))
    .limit(1);

  let destinationDeveloperId: string | null = targetDev?.id ?? null;

  if (sourceDev && targetDev) {
    const [sourceStrategyCount] = await tx
      .select({ count: sql<number>`count(*)::int` })
      .from(marketplaceStrategies)
      .where(eq(marketplaceStrategies.developerId, sourceDev.id));

    await tx
      .update(marketplaceStrategies)
      .set({ developerId: targetDev.id, updatedAt: new Date() })
      .where(eq(marketplaceStrategies.developerId, sourceDev.id));

    const targetUpdates: {
      stripeAccountId?: string | null;
      stripeOnboardingComplete?: boolean;
      updatedAt?: Date;
    } = {};

    if (!targetDev.stripeAccountId && sourceDev.stripeAccountId) {
      targetUpdates.stripeAccountId = sourceDev.stripeAccountId;
    }

    if (!targetDev.stripeOnboardingComplete && sourceDev.stripeOnboardingComplete) {
      targetUpdates.stripeOnboardingComplete = true;
    }

    if (Object.keys(targetUpdates).length > 0) {
      targetUpdates.updatedAt = new Date();
      await tx
        .update(marketplaceDevelopers)
        .set(targetUpdates)
        .where(eq(marketplaceDevelopers.id, targetDev.id));
    }

    await tx
      .delete(marketplaceDevelopers)
      .where(eq(marketplaceDevelopers.id, sourceDev.id));

    console.warn("[merge-account] marketplace developer conflict resolved", {
      sourceUserId,
      targetUserId,
      sourceDeveloperId: sourceDev.id,
      targetDeveloperId: targetDev.id,
      movedStrategyCount: sourceStrategyCount?.count ?? 0,
      targetStripeAccountKept: !!targetDev.stripeAccountId,
      targetStripeAccountBackfilled:
        !targetDev.stripeAccountId && !!sourceDev.stripeAccountId,
    });

    destinationDeveloperId = targetDev.id;
  } else if (sourceDev && !targetDev) {
    await tx
      .update(marketplaceDevelopers)
      .set({ userId: targetUserId, updatedAt: new Date() })
      .where(eq(marketplaceDevelopers.id, sourceDev.id));

    destinationDeveloperId = sourceDev.id;
  }

  if (destinationDeveloperId) {
    await recomputeDeveloperSubscriberCount(tx, destinationDeveloperId);
  }
}

async function assertNoSourceReferencesRemain(
  tx: DbTransaction,
  sourceUserId: string
): Promise<void> {
  const remainingTables: string[] = [];

  const [remainingGameBets] = await tx
    .select({ id: gameBets.id })
    .from(gameBets)
    .where(eq(gameBets.userId, sourceUserId))
    .limit(1);
  if (remainingGameBets) remainingTables.push("game_bets.user_id");

  const [remainingCrashBets] = await tx
    .select({ id: crashBets.id })
    .from(crashBets)
    .where(eq(crashBets.userId, sourceUserId))
    .limit(1);
  if (remainingCrashBets) remainingTables.push("crash_bets.user_id");

  const [remainingBlackjackRounds] = await tx
    .select({ id: blackjackRounds.id })
    .from(blackjackRounds)
    .where(eq(blackjackRounds.userId, sourceUserId))
    .limit(1);
  if (remainingBlackjackRounds) remainingTables.push("blackjack_rounds.user_id");

  const [remainingStrategies] = await tx
    .select({ id: strategies.id })
    .from(strategies)
    .where(eq(strategies.userId, sourceUserId))
    .limit(1);
  if (remainingStrategies) remainingTables.push("strategies.user_id");

  const [remainingAdvancedStrategies] = await tx
    .select({ id: advancedStrategies.id })
    .from(advancedStrategies)
    .where(eq(advancedStrategies.userId, sourceUserId))
    .limit(1);
  if (remainingAdvancedStrategies)
    remainingTables.push("advanced_strategies.user_id");

  const [remainingFaucetGrants] = await tx
    .select({ id: faucetGrants.id })
    .from(faucetGrants)
    .where(eq(faucetGrants.userId, sourceUserId))
    .limit(1);
  if (remainingFaucetGrants) remainingTables.push("faucet_grants.user_id");

  const [remainingAgentSessions] = await tx
    .select({ id: agentSessions.id })
    .from(agentSessions)
    .where(eq(agentSessions.userId, sourceUserId))
    .limit(1);
  if (remainingAgentSessions) remainingTables.push("agent_sessions.user_id");

  const [remainingDeposits] = await tx
    .select({ id: deposits.id })
    .from(deposits)
    .where(eq(deposits.userId, sourceUserId))
    .limit(1);
  if (remainingDeposits) remainingTables.push("deposits.user_id");

  const [remainingWithdrawals] = await tx
    .select({ id: withdrawalRequests.id })
    .from(withdrawalRequests)
    .where(eq(withdrawalRequests.userId, sourceUserId))
    .limit(1);
  if (remainingWithdrawals) remainingTables.push("withdrawal_requests.user_id");

  const [remainingMarketplaceSubscriptions] = await tx
    .select({ id: marketplaceSubscriptions.id })
    .from(marketplaceSubscriptions)
    .where(eq(marketplaceSubscriptions.userId, sourceUserId))
    .limit(1);
  if (remainingMarketplaceSubscriptions)
    remainingTables.push("marketplace_subscriptions.user_id");

  const [remainingAiHarvest] = await tx
    .select({ id: aiStrategyHarvest.id })
    .from(aiStrategyHarvest)
    .where(eq(aiStrategyHarvest.userId, sourceUserId))
    .limit(1);
  if (remainingAiHarvest) remainingTables.push("ai_strategy_harvest.user_id");

  const [remainingSignalPrefs] = await tx
    .select({ id: userSignalPreferences.id })
    .from(userSignalPreferences)
    .where(eq(userSignalPreferences.userId, sourceUserId))
    .limit(1);
  if (remainingSignalPrefs)
    remainingTables.push("user_signal_preferences.user_id");

  const [remainingAnsDomains] = await tx
    .select({ id: ansDomains.id })
    .from(ansDomains)
    .where(eq(ansDomains.ownerId, sourceUserId))
    .limit(1);
  if (remainingAnsDomains) remainingTables.push("ans_domains.owner_id");

  const [remainingAnsSubscriptions] = await tx
    .select({ id: ansSubscriptions.id })
    .from(ansSubscriptions)
    .where(eq(ansSubscriptions.userId, sourceUserId))
    .limit(1);
  if (remainingAnsSubscriptions) remainingTables.push("ans_subscriptions.user_id");

  const [remainingSignalDeliveryLogs] = await tx
    .select({ id: signalDeliveryLogs.id })
    .from(signalDeliveryLogs)
    .where(eq(signalDeliveryLogs.userId, sourceUserId))
    .limit(1);
  if (remainingSignalDeliveryLogs)
    remainingTables.push("signal_delivery_logs.user_id");

  const [remainingClaimedAgents] = await tx
    .select({ id: agents.id })
    .from(agents)
    .where(eq(agents.claimedByUserId, sourceUserId))
    .limit(1);
  if (remainingClaimedAgents) remainingTables.push("agents.claimed_by_user_id");

  const [remainingClaimOwnerRows] = await tx
    .select({ id: agentClaims.id })
    .from(agentClaims)
    .where(eq(agentClaims.userId, sourceUserId))
    .limit(1);
  if (remainingClaimOwnerRows) remainingTables.push("agent_claims.user_id");

  const [remainingClaimReviewerRows] = await tx
    .select({ id: agentClaims.id })
    .from(agentClaims)
    .where(eq(agentClaims.reviewedByUserId, sourceUserId))
    .limit(1);
  if (remainingClaimReviewerRows)
    remainingTables.push("agent_claims.reviewed_by_user_id");

  const [remainingDevelopers] = await tx
    .select({ id: marketplaceDevelopers.id })
    .from(marketplaceDevelopers)
    .where(eq(marketplaceDevelopers.userId, sourceUserId))
    .limit(1);
  if (remainingDevelopers) remainingTables.push("marketplace_developers.user_id");

  if (remainingTables.length > 0) {
    throw new Error(
      `[merge-account] source user still referenced by: ${remainingTables.join(
        ", "
      )}`
    );
  }
}

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
      faucetCredits: users.faucetCredits,
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
    .select({
      id: users.id,
      credits: users.credits,
      faucetCredits: users.faucetCredits,
      agentId: users.agentId,
    })
    .from(users)
    .where(eq(users.id, targetUserId))
    .limit(1);
  if (!targetRow) {
    throw new Error("Target user not found");
  }

  const sourceCredits = sourceRow.credits ?? 0;
  const targetCredits = targetRow.credits ?? 0;
  const sourceFaucetCredits = sourceRow.faucetCredits ?? 0;
  const targetFaucetCredits = targetRow.faucetCredits ?? 0;
  const newCredits = targetCredits + sourceCredits;
  const newFaucetCredits = targetFaucetCredits + sourceFaucetCredits;

  await dedupeStrategyNamesForTarget(tx, sourceUserId, targetUserId);
  await dedupeAdvancedStrategyNamesForTarget(tx, sourceUserId, targetUserId);

  await tx
    .update(gameBets)
    .set({ userId: targetUserId })
    .where(eq(gameBets.userId, sourceUserId));

  await tx
    .update(strategies)
    .set({ userId: targetUserId })
    .where(eq(strategies.userId, sourceUserId));

  await tx
    .update(crashBets)
    .set({ userId: targetUserId })
    .where(eq(crashBets.userId, sourceUserId));

  await tx
    .update(blackjackRounds)
    .set({ userId: targetUserId })
    .where(eq(blackjackRounds.userId, sourceUserId));

  await tx
    .update(faucetGrants)
    .set({ userId: targetUserId })
    .where(eq(faucetGrants.userId, sourceUserId));

  await tx
    .update(agentSessions)
    .set({ userId: targetUserId })
    .where(eq(agentSessions.userId, sourceUserId));

  await tx
    .update(deposits)
    .set({ userId: targetUserId })
    .where(eq(deposits.userId, sourceUserId));

  await tx
    .update(withdrawalRequests)
    .set({ userId: targetUserId })
    .where(eq(withdrawalRequests.userId, sourceUserId));

  await tx
    .update(advancedStrategies)
    .set({ userId: targetUserId, updatedAt: new Date() })
    .where(eq(advancedStrategies.userId, sourceUserId));

  await tx
    .update(marketplaceSubscriptions)
    .set({ userId: targetUserId })
    .where(eq(marketplaceSubscriptions.userId, sourceUserId));

  await tx
    .update(aiStrategyHarvest)
    .set({ userId: targetUserId })
    .where(eq(aiStrategyHarvest.userId, sourceUserId));

  await tx
    .update(ansDomains)
    .set({ ownerId: targetUserId, updatedAt: new Date() })
    .where(eq(ansDomains.ownerId, sourceUserId));

  await tx
    .update(ansSubscriptions)
    .set({ userId: targetUserId, updatedAt: new Date() })
    .where(eq(ansSubscriptions.userId, sourceUserId));

  await tx
    .update(signalDeliveryLogs)
    .set({ userId: targetUserId })
    .where(eq(signalDeliveryLogs.userId, sourceUserId));

  await tx
    .update(agents)
    .set({
      claimedByUserId: targetUserId,
      updatedAt: new Date(),
    })
    .where(eq(agents.claimedByUserId, sourceUserId));

  await tx
    .update(agentClaims)
    .set({ userId: targetUserId, updatedAt: new Date() })
    .where(eq(agentClaims.userId, sourceUserId));

  await tx
    .update(agentClaims)
    .set({ reviewedByUserId: targetUserId, updatedAt: new Date() })
    .where(eq(agentClaims.reviewedByUserId, sourceUserId));

  await mergeUserSignalPreferences(tx, sourceUserId, targetUserId);
  await handleMarketplaceDeveloperMerge(tx, sourceUserId, targetUserId);

  const targetUpdate: Record<string, unknown> = {
    credits: newCredits,
    faucetCredits: newFaucetCredits,
  };

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

  await assertNoSourceReferencesRemain(tx, sourceUserId);

  await tx.delete(users).where(eq(users.id, sourceUserId));
}

/**
 * Merge guest user data into the target user.
 * Transfers all known user-owned rows and balances into the target user.
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
 * Includes all guest transfers plus API key fields and agentId continuity.
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

import "./load-env";
import { db } from "../lib/db";
import { agentClaims, agents, users } from "../lib/db/schema";
import { and, desc, eq, inArray, isNull, or } from "drizzle-orm";

type RepairAction = {
  agentId: string;
  slug: string;
  action: "reattach" | "unclaim";
  reason: string;
  targetUserId?: string;
  sourceClaimId?: string;
};

function claimTimestamp(claim: {
  verifiedAt: Date | null;
  createdAt: Date | null;
}): number {
  return (claim.verifiedAt ?? claim.createdAt ?? new Date(0)).getTime();
}

async function main() {
  if (!process.env.DATABASE_URL) {
    throw new Error("DATABASE_URL is not set.");
  }

  const isApply = process.argv.includes("--apply");
  const now = new Date();

  const claimedAgents = await db
    .select({
      id: agents.id,
      slug: agents.slug,
      claimedByUserId: agents.claimedByUserId,
      ownerUserId: users.id,
    })
    .from(agents)
    .leftJoin(users, eq(agents.claimedByUserId, users.id))
    .where(eq(agents.claimStatus, "CLAIMED"));

  const orphanClaimedAgents = claimedAgents.filter(
    (row) => !row.claimedByUserId || !row.ownerUserId
  );

  const actions: RepairAction[] = [];
  let reattachedAgents = 0;
  let unclaimedAgents = 0;
  let ambiguousAgents = 0;
  let noValidClaimantAgents = 0;

  for (const orphan of orphanClaimedAgents) {
    const approvedClaims = await db
      .select({
        id: agentClaims.id,
        userId: agentClaims.userId,
        verifiedAt: agentClaims.verifiedAt,
        createdAt: agentClaims.createdAt,
        resolvedTier: agentClaims.resolvedTier,
        verificationMethod: agentClaims.verificationMethod,
      })
      .from(agentClaims)
      .innerJoin(users, eq(agentClaims.userId, users.id))
      .where(
        and(
          eq(agentClaims.agentId, orphan.id),
          eq(agentClaims.status, "APPROVED")
        )
      )
      .orderBy(
        desc(agentClaims.verifiedAt),
        desc(agentClaims.createdAt),
        desc(agentClaims.updatedAt)
      );

    if (approvedClaims.length === 0) {
      actions.push({
        agentId: orphan.id,
        slug: orphan.slug,
        action: "unclaim",
        reason: "no_valid_approved_claimant",
      });
      unclaimedAgents += 1;
      noValidClaimantAgents += 1;

      if (isApply) {
        await db
          .update(agents)
          .set({
            claimStatus: "UNCLAIMED",
            claimedByUserId: null,
            claimedAt: null,
            verificationTier: "NONE",
            verificationMethod: null,
            updatedAt: now,
          })
          .where(eq(agents.id, orphan.id));
      }
      continue;
    }

    const newestTimestamp = claimTimestamp(approvedClaims[0]);
    const newestClaims = approvedClaims.filter(
      (claim) => claimTimestamp(claim) === newestTimestamp
    );
    const newestUserIds = new Set(newestClaims.map((claim) => claim.userId));

    if (newestUserIds.size !== 1) {
      actions.push({
        agentId: orphan.id,
        slug: orphan.slug,
        action: "unclaim",
        reason: "ambiguous_latest_approved_claimant",
      });
      unclaimedAgents += 1;
      ambiguousAgents += 1;

      if (isApply) {
        await db
          .update(agents)
          .set({
            claimStatus: "UNCLAIMED",
            claimedByUserId: null,
            claimedAt: null,
            verificationTier: "NONE",
            verificationMethod: null,
            updatedAt: now,
          })
          .where(eq(agents.id, orphan.id));
      }
      continue;
    }

    const winner = approvedClaims[0];
    actions.push({
      agentId: orphan.id,
      slug: orphan.slug,
      action: "reattach",
      reason: "latest_valid_approved_claimant",
      targetUserId: winner.userId,
      sourceClaimId: winner.id,
    });
    reattachedAgents += 1;

    if (isApply) {
      await db
        .update(agents)
        .set({
          claimStatus: "CLAIMED",
          claimedByUserId: winner.userId,
          claimedAt: winner.verifiedAt ?? winner.createdAt ?? now,
          verificationTier: winner.resolvedTier ?? "NONE",
          verificationMethod: winner.verificationMethod,
          updatedAt: now,
        })
        .where(eq(agents.id, orphan.id));
    }
  }

  const orphanPendingClaims = await db
    .select({
      id: agentClaims.id,
      agentId: agentClaims.agentId,
      userId: agentClaims.userId,
    })
    .from(agentClaims)
    .leftJoin(users, eq(agentClaims.userId, users.id))
    .leftJoin(agents, eq(agentClaims.agentId, agents.id))
    .where(
      and(
        eq(agentClaims.status, "PENDING"),
        or(isNull(users.id), isNull(agents.id))
      )
    );

  if (isApply && orphanPendingClaims.length > 0) {
    const ids = orphanPendingClaims.map((claim) => claim.id);
    await db
      .update(agentClaims)
      .set({
        status: "EXPIRED",
        reviewNote: "Auto-expired by integrity repair script: orphan pending claim.",
        updatedAt: now,
      })
      .where(inArray(agentClaims.id, ids));
  }

  const summary = {
    mode: isApply ? "apply" : "dry-run",
    generatedAt: now.toISOString(),
    scannedClaimedAgents: claimedAgents.length,
    orphanClaimedAgents: orphanClaimedAgents.length,
    reattachedAgents,
    unclaimedAgents,
    ambiguousAgents,
    noValidClaimantAgents,
    orphanPendingClaims: orphanPendingClaims.length,
    expiredPendingClaims: isApply ? orphanPendingClaims.length : 0,
    actions,
    orphanPendingClaimIds: orphanPendingClaims.map((claim) => claim.id),
  };

  console.log(JSON.stringify(summary, null, 2));
}

main().catch((err) => {
  console.error("[repair-claim-developer-integrity] failed:", err);
  process.exit(1);
});

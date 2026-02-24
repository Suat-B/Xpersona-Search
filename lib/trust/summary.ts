import { db } from "@/lib/db";
import { agentCapabilityHandshakes, agentReputationSnapshots } from "@/lib/db/schema";
import { desc, eq } from "drizzle-orm";
import { hasTrustTable } from "@/lib/trust/db";

export type TrustSummary = {
  handshakeStatus: string;
  lastVerifiedAt: string | null;
  verificationFreshnessHours: number | null;
  reputationScore: number | null;
  receiptSupport: true;
};

export async function getTrustSummary(agentId: string): Promise<TrustSummary | null> {
  const hasHandshake = await hasTrustTable("agent_capability_handshakes");
  const hasReputation = await hasTrustTable("agent_reputation_snapshots");
  if (!hasHandshake && !hasReputation) return null;

  let handshake: { status: string; verifiedAt: Date | null } | null = null;
  if (hasHandshake) {
    const rows = await db
      .select({
        status: agentCapabilityHandshakes.status,
        verifiedAt: agentCapabilityHandshakes.verifiedAt,
      })
      .from(agentCapabilityHandshakes)
      .where(eq(agentCapabilityHandshakes.agentId, agentId))
      .orderBy(desc(agentCapabilityHandshakes.verifiedAt))
      .limit(1);
    handshake = rows[0] ?? null;
  }

  let reputation: { scoreTotal: number | null; computedAt: Date | null } | null = null;
  if (hasReputation) {
    const rows = await db
      .select({
        scoreTotal: agentReputationSnapshots.scoreTotal,
        computedAt: agentReputationSnapshots.computedAt,
      })
      .from(agentReputationSnapshots)
      .where(eq(agentReputationSnapshots.agentId, agentId))
      .orderBy(desc(agentReputationSnapshots.computedAt))
      .limit(1);
    reputation = rows[0] ?? null;
  }

  const lastVerifiedAt = handshake?.verifiedAt ?? reputation?.computedAt ?? null;
  const freshnessHours = lastVerifiedAt
    ? Math.round((Date.now() - lastVerifiedAt.getTime()) / (1000 * 60 * 60))
    : null;

  return {
    handshakeStatus: handshake?.status ?? "UNKNOWN",
    lastVerifiedAt: lastVerifiedAt ? lastVerifiedAt.toISOString() : null,
    verificationFreshnessHours: freshnessHours,
    reputationScore: reputation?.scoreTotal ?? null,
    receiptSupport: true,
  };
}

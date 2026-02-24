import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { agents } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { getAuthUser } from "@/lib/auth-utils";

let hasClaimedAgentsExtraColsCache: boolean | null = null;

function isMissingClaimedAgentsColumnsError(err: unknown): boolean {
  if (!(err instanceof Error)) return false;
  const msg = err.message.toLowerCase();
  return (
    msg.includes('column "verification_tier" does not exist') ||
    msg.includes('column "has_custom_page" does not exist')
  );
}

/**
 * GET /api/me/claimed-agents -- List all agents claimed by the current user.
 */
export async function GET(req: NextRequest) {
  const authResult = await getAuthUser(req);
  if ("error" in authResult) {
    return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
  }
  const { user } = authResult;

  async function queryClaimed(includeExtra: boolean) {
    if (includeExtra) {
      return db
        .select({
          id: agents.id,
          name: agents.name,
          slug: agents.slug,
          description: agents.description,
          url: agents.url,
          homepage: agents.homepage,
          source: agents.source,
          claimStatus: agents.claimStatus,
          verificationTier: agents.verificationTier,
          hasCustomPage: agents.hasCustomPage,
          claimedAt: agents.claimedAt,
          safetyScore: agents.safetyScore,
          popularityScore: agents.popularityScore,
          overallRank: agents.overallRank,
          ownerOverrides: agents.ownerOverrides,
        })
        .from(agents)
        .where(eq(agents.claimedByUserId, user.id));
    }

    const rows = await db
      .select({
        id: agents.id,
        name: agents.name,
        slug: agents.slug,
        description: agents.description,
        url: agents.url,
        homepage: agents.homepage,
        source: agents.source,
        claimStatus: agents.claimStatus,
        claimedAt: agents.claimedAt,
        safetyScore: agents.safetyScore,
        popularityScore: agents.popularityScore,
        overallRank: agents.overallRank,
        ownerOverrides: agents.ownerOverrides,
      })
      .from(agents)
      .where(eq(agents.claimedByUserId, user.id));

    return rows.map((r) => ({
      ...r,
      verificationTier: "NONE",
      hasCustomPage: false,
    }));
  }

  let claimed;
  const tryExtra = hasClaimedAgentsExtraColsCache !== false;
  try {
    claimed = await queryClaimed(tryExtra);
    if (tryExtra) hasClaimedAgentsExtraColsCache = true;
  } catch (err) {
    if (tryExtra && isMissingClaimedAgentsColumnsError(err)) {
      hasClaimedAgentsExtraColsCache = false;
      claimed = await queryClaimed(false);
    } else {
      throw err;
    }
  }

  return NextResponse.json({ agents: claimed });
}

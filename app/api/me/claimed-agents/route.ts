import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { agents } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { getAuthUser } from "@/lib/auth-utils";

/**
 * GET /api/me/claimed-agents -- List all agents claimed by the current user.
 */
export async function GET(req: NextRequest) {
  const authResult = await getAuthUser(req);
  if ("error" in authResult) {
    return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
  }
  const { user } = authResult;

  const claimed = await db
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

  return NextResponse.json({ agents: claimed });
}

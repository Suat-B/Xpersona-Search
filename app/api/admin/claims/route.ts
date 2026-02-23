import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { agentClaims, agents, users } from "@/lib/db/schema";
import { eq, desc, and, sql } from "drizzle-orm";
import { getAuthUser } from "@/lib/auth-utils";
import { isAdmin } from "@/lib/admin";

/**
 * GET /api/admin/claims -- List all claims (admin only).
 * Query params: ?status=PENDING&limit=50&offset=0
 */
export async function GET(req: NextRequest) {
  const authResult = await getAuthUser(req);
  if ("error" in authResult) {
    return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
  }
  if (!isAdmin(authResult.user)) {
    return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });
  }

  const url = new URL(req.url);
  const statusFilter = url.searchParams.get("status");
  const limit = Math.min(parseInt(url.searchParams.get("limit") ?? "50", 10), 200);
  const offset = parseInt(url.searchParams.get("offset") ?? "0", 10);

  const conditions = statusFilter
    ? and(eq(agentClaims.status, statusFilter))
    : undefined;

  const claims = await db
    .select({
      id: agentClaims.id,
      agentId: agentClaims.agentId,
      userId: agentClaims.userId,
      status: agentClaims.status,
      verificationMethod: agentClaims.verificationMethod,
      verificationData: agentClaims.verificationData,
      reviewNote: agentClaims.reviewNote,
      expiresAt: agentClaims.expiresAt,
      createdAt: agentClaims.createdAt,
      agentName: agents.name,
      agentSlug: agents.slug,
      agentSource: agents.source,
      userName: users.name,
      userEmail: users.email,
    })
    .from(agentClaims)
    .leftJoin(agents, eq(agentClaims.agentId, agents.id))
    .leftJoin(users, eq(agentClaims.userId, users.id))
    .where(conditions)
    .orderBy(desc(agentClaims.createdAt))
    .limit(limit)
    .offset(offset);

  const [countResult] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(agentClaims)
    .where(conditions);

  return NextResponse.json({
    claims,
    total: countResult?.count ?? 0,
    limit,
    offset,
  });
}

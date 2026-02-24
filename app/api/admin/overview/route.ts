import { NextResponse } from "next/server";
import { getAuthUser } from "@/lib/auth-utils";
import { isAdmin } from "@/lib/admin";
import { db } from "@/lib/db";
import { users, agents, agentClaims, agentCustomizations } from "@/lib/db/schema";
import { and, eq, gte, sql } from "drizzle-orm";

export async function GET(request: Request) {
  const authResult = await getAuthUser(request as any);
  if ("error" in authResult) {
    return NextResponse.json({ success: false, error: authResult.error }, { status: 401 });
  }
  if (!isAdmin(authResult.user)) {
    return NextResponse.json({ success: false, error: "FORBIDDEN" }, { status: 403 });
  }

  const since7d = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

  const [usersTotal] = await db.select({ count: sql<number>`count(*)::int` }).from(users);
  const [usersLast7d] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(users)
    .where(gte(users.createdAt, since7d));

  const [activeAgents] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(agents)
    .where(eq(agents.status, "ACTIVE"));

  const [pendingAgents] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(agents)
    .where(eq(agents.status, "PENDING_REVIEW"));

  const [pendingClaims] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(agentClaims)
    .where(eq(agentClaims.status, "PENDING"));

  const [claimedAgents] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(agents)
    .where(eq(agents.claimStatus, "CLAIMED"));

  const [customPagesPublished] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(agentCustomizations)
    .where(eq(agentCustomizations.status, "PUBLISHED"));

  const [customPagesDraft] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(agentCustomizations)
    .where(and(sql`${agentCustomizations.status} != 'PUBLISHED'`));

  return NextResponse.json({
    success: true,
    data: {
      usersTotal: usersTotal?.count ?? 0,
      usersLast7d: usersLast7d?.count ?? 0,
      activeAgents: activeAgents?.count ?? 0,
      pendingAgents: pendingAgents?.count ?? 0,
      pendingClaims: pendingClaims?.count ?? 0,
      claimedAgents: claimedAgents?.count ?? 0,
      customPagesPublished: customPagesPublished?.count ?? 0,
      customPagesDraft: customPagesDraft?.count ?? 0,
    },
  });
}

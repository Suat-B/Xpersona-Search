import { NextResponse } from "next/server";
import { getAuthUser } from "@/lib/auth-utils";
import { isAdmin } from "@/lib/admin";
import { db } from "@/lib/db";
import { agents, users } from "@/lib/db/schema";
import { desc, eq, sql } from "drizzle-orm";

const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 200;

export async function GET(request: Request) {
  const authResult = await getAuthUser(request as any);
  if ("error" in authResult) {
    return NextResponse.json({ success: false, error: authResult.error }, { status: 401 });
  }
  if (!isAdmin(authResult.user)) {
    return NextResponse.json({ success: false, error: "FORBIDDEN" }, { status: 403 });
  }

  const url = new URL(request.url);
  const limit = Math.min(MAX_LIMIT, Math.max(1, Number(url.searchParams.get("limit") ?? DEFAULT_LIMIT)));
  const offset = Math.max(0, Number(url.searchParams.get("offset") ?? 0));

  const items = await db
    .select({
      id: agents.id,
      name: agents.name,
      slug: agents.slug,
      source: agents.source,
      status: agents.status,
      createdAt: agents.createdAt,
      claimedByUserEmail: users.email,
    })
    .from(agents)
    .leftJoin(users, eq(agents.claimedByUserId, users.id))
    .orderBy(desc(agents.createdAt))
    .limit(limit)
    .offset(offset);

  const [total] = await db.select({ count: sql<number>`count(*)::int` }).from(agents);

  return NextResponse.json({ success: true, data: { items, total: total?.count ?? 0, limit, offset } });
}

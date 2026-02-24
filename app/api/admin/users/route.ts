import { NextResponse } from "next/server";
import { getAuthUser } from "@/lib/auth-utils";
import { isAdmin } from "@/lib/admin";
import { db } from "@/lib/db";
import { users } from "@/lib/db/schema";
import { desc, sql } from "drizzle-orm";

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

  const [totalCountRow] = await db.select({ count: sql<number>`count(*)::int` }).from(users);

  const userRows = await db
    .select({
      id: users.id,
      email: users.email,
      name: users.name,
      accountType: users.accountType,
      createdAt: users.createdAt,
    })
    .from(users)
    .orderBy(desc(users.createdAt))
    .limit(limit)
    .offset(offset);

  return NextResponse.json({
    success: true,
    data: {
      users: userRows,
      totalCount: totalCountRow?.count ?? 0,
      offset,
      limit,
    },
  });
}

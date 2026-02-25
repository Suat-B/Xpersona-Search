import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { agents } from "@/lib/db/schema";
import { desc, eq } from "drizzle-orm";

export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const limit = Math.min(50, Math.max(1, Number(url.searchParams.get("limit") ?? "20")));
  const cursorRaw = url.searchParams.get("cursor");
  const offset = Math.max(0, Number(cursorRaw ?? "0") || 0);

  const rows = await db
    .select({
      id: agents.id,
      name: agents.name,
      slug: agents.slug,
      description: agents.description,
    })
    .from(agents)
    .where(eq(agents.status, "ACTIVE"))
    .orderBy(desc(agents.overallRank), desc(agents.updatedAt))
    .limit(limit)
    .offset(offset);

  const nextCursor = rows.length === limit ? String(offset + rows.length) : null;

  return NextResponse.json({
    results: rows,
    pagination: {
      hasMore: rows.length === limit,
      nextCursor,
      total: null,
    },
  });
}

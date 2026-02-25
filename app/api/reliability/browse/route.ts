import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { agents } from "@/lib/db/schema";
import { desc, eq } from "drizzle-orm";
import { applyRequestIdHeader, jsonError } from "@/lib/api/errors";
import { recordApiResponse } from "@/lib/metrics/record";

export async function GET(req: NextRequest) {
  const startedAt = Date.now();
  try {
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

    const response = NextResponse.json({
      results: rows,
      pagination: {
        hasMore: rows.length === limit,
        nextCursor,
        total: null,
      },
    });
    applyRequestIdHeader(response, req);
    recordApiResponse("/api/reliability/browse", req, response, startedAt);
    return response;
  } catch (err) {
    const response = jsonError(req, {
      code: "INTERNAL_ERROR",
      message: "Failed to browse agents",
      status: 500,
      details: process.env.NODE_ENV === "production" ? undefined : String(err),
    });
    recordApiResponse("/api/reliability/browse", req, response, startedAt);
    return response;
  }
}

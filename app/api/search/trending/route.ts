import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { searchQueries } from "@/lib/db/schema";
import { desc, gte, sql } from "drizzle-orm";

const MAX_TRENDING = 8;
const TRENDING_WINDOW_DAYS = 30;
const MIN_COUNT = 2;

const TRAILING_STOPWORDS = new Set([
  "a", "an", "and", "be", "for", "in", "is", "it", "of", "on", "or", "the", "to",
]);

function isIncompletePhrase(text: string): boolean {
  const last = text.trim().toLowerCase().split(/\s+/).pop() ?? "";
  return TRAILING_STOPWORDS.has(last);
}

export async function GET() {
  try {
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - TRENDING_WINDOW_DAYS);

    const rows = await db
      .select({
        query: searchQueries.query,
        count: searchQueries.count,
      })
      .from(searchQueries)
      .where(
        sql`${searchQueries.lastSearchedAt} >= ${cutoff} AND ${searchQueries.count} >= ${MIN_COUNT}`
      )
      .orderBy(desc(searchQueries.count))
      .limit(MAX_TRENDING * 2);

    // If we don't have enough trending queries yet, supplement with top agents
    if (rows.length < 4) {
      const agentRows = await db.execute(
        sql`SELECT name FROM agents WHERE status = 'ACTIVE' ORDER BY overall_rank DESC LIMIT 8`
      );
      const agentNames = (agentRows as unknown as { rows?: Array<{ name: string }> }).rows ?? [];
      const seen = new Set(rows.map((r) => r.query.toLowerCase()));
      for (const a of agentNames) {
        if (rows.length >= MAX_TRENDING) break;
        if (!seen.has(a.name.toLowerCase())) {
          seen.add(a.name.toLowerCase());
          rows.push({ query: a.name, count: 0 });
        }
      }
    }

    const filtered = rows
      .filter((r) => !isIncompletePhrase(r.query))
      .slice(0, MAX_TRENDING);

    return NextResponse.json({
      trending: filtered.map((r) => r.query),
    });
  } catch (err) {
    console.error("[Search Trending] Error:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Trending failed" },
      { status: 500 }
    );
  }
}

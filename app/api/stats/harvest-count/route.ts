import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { aiStrategyHarvest } from "@/lib/db/schema";
import { sql } from "drizzle-orm";

/**
 * GET /api/stats/harvest-count
 * Public endpoint returning total count of harvested AI strategies.
 * Used for Data Intelligence branding across the platform.
 */
export async function GET() {
  try {
    const result = await db
      .select({ count: sql<number>`cast(count(*) as integer)` })
      .from(aiStrategyHarvest);

    const count = result[0]?.count || 0;

    return NextResponse.json(
      { count },
      {
        headers: {
          "Cache-Control": "public, s-maxage=60, stale-while-revalidate=120",
        },
      }
    );
  } catch (error) {
    console.error("Error fetching harvest count:", error);
    // Return fallback count on error (don't expose internal errors)
    return NextResponse.json(
      { count: 0 },
      {
        headers: {
          "Cache-Control": "public, s-maxage=60, stale-while-revalidate=120",
        },
      }
    );
  }
}

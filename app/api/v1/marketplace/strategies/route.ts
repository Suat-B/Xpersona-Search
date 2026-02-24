import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { marketplaceDevelopers, marketplaceStrategies, users } from "@/lib/db/schema";
import { and, desc, eq } from "drizzle-orm";

const DEFAULT_LIMIT = 24;
const MAX_LIMIT = 50;

export async function GET(request: Request) {
  const url = new URL(request.url);
  const category = url.searchParams.get("category")?.trim() || "";
  const limit = Math.min(
    MAX_LIMIT,
    Math.max(1, Number(url.searchParams.get("limit") ?? DEFAULT_LIMIT))
  );

  const whereClause = category
    ? and(eq(marketplaceStrategies.isActive, true), eq(marketplaceStrategies.category, category))
    : eq(marketplaceStrategies.isActive, true);

  const rows = await db
    .select({
      id: marketplaceStrategies.id,
      name: marketplaceStrategies.name,
      description: marketplaceStrategies.description,
      priceMonthlyCents: marketplaceStrategies.priceMonthlyCents,
      sharpeRatio: marketplaceStrategies.sharpeRatio,
      riskLabel: marketplaceStrategies.riskLabel,
      category: marketplaceStrategies.category,
      winRate: marketplaceStrategies.winRate,
      totalTrades: marketplaceStrategies.tradeCount,
      developerName: users.name,
    })
    .from(marketplaceStrategies)
    .leftJoin(marketplaceDevelopers, eq(marketplaceStrategies.developerId, marketplaceDevelopers.id))
    .leftJoin(users, eq(marketplaceDevelopers.userId, users.id))
    .where(whereClause)
    .orderBy(desc(marketplaceStrategies.createdAt))
    .limit(limit);

  const data = rows.map((row) => ({
    ...row,
    developerName: row.developerName ?? "Verified Developer",
  }));

  return NextResponse.json({ success: true, data });
}

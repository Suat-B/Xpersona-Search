import { NextResponse } from "next/server";
import { getAuthUser } from "@/lib/auth-utils";
import { db } from "@/lib/db";
import {
  marketplaceStrategies,
  marketplaceDevelopers,
  users,
  advancedStrategies,
} from "@/lib/db/schema";
import { eq, and, desc } from "drizzle-orm";
import { calculatePlatformFeePercent } from "@/lib/trading/fee-tier";
import { computeHealthScore } from "@/lib/trading/health-score";

const PRICE_MIN_CENTS = 999; // $9.99
const PRICE_MAX_CENTS = 99900; // $999

/**
 * GET /api/trading/strategies
 * List marketplace strategies (public). Only active strategies.
 */
export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const search = searchParams.get("search")?.trim().toLowerCase() || "";
    const category = searchParams.get("category")?.trim().toLowerCase() || "";
    const timeframe = searchParams.get("timeframe")?.trim().toLowerCase() || "";
    const risk = searchParams.get("risk")?.trim().toLowerCase() || "";
    const sort = searchParams.get("sort") || "newest";

    const rows = await db
      .select({
        id: marketplaceStrategies.id,
        name: marketplaceStrategies.name,
        description: marketplaceStrategies.description,
        priceMonthlyCents: marketplaceStrategies.priceMonthlyCents,
        priceYearlyCents: marketplaceStrategies.priceYearlyCents,
        platformFeePercent: marketplaceStrategies.platformFeePercent,
        sharpeRatio: marketplaceStrategies.sharpeRatio,
        maxDrawdownPercent: marketplaceStrategies.maxDrawdownPercent,
        winRate: marketplaceStrategies.winRate,
        riskLabel: marketplaceStrategies.riskLabel,
        category: marketplaceStrategies.category,
        timeframe: marketplaceStrategies.timeframe,
        liveTrackRecordDays: marketplaceStrategies.liveTrackRecordDays,
        paperTradingDays: marketplaceStrategies.paperTradingDays,
        developerName: users.name,
        developerEmail: users.email,
      })
      .from(marketplaceStrategies)
      .innerJoin(marketplaceDevelopers, eq(marketplaceStrategies.developerId, marketplaceDevelopers.id))
      .innerJoin(users, eq(marketplaceDevelopers.userId, users.id))
      .where(eq(marketplaceStrategies.isActive, true))
      .orderBy(desc(marketplaceStrategies.createdAt))
      .limit(100);

    let filtered = rows;
    if (search) {
      filtered = filtered.filter(
        (r) =>
          r.name.toLowerCase().includes(search) ||
          (r.description?.toLowerCase().includes(search) ?? false)
      );
    }
    if (category) {
      filtered = filtered.filter((r) => r.category?.toLowerCase() === category);
    }
    if (timeframe) {
      filtered = filtered.filter((r) => r.timeframe?.toLowerCase() === timeframe);
    }
    if (risk) {
      filtered = filtered.filter((r) => r.riskLabel?.toLowerCase() === risk);
    }
    if (sort === "sharpe") {
      filtered = [...filtered].sort((a, b) => (b.sharpeRatio ?? 0) - (a.sharpeRatio ?? 0));
    } else if (sort === "price_asc") {
      filtered = [...filtered].sort((a, b) => a.priceMonthlyCents - b.priceMonthlyCents);
    } else if (sort === "price_desc") {
      filtered = [...filtered].sort((a, b) => b.priceMonthlyCents - a.priceMonthlyCents);
    }

    return NextResponse.json({
      success: true,
      data: filtered.map((r) => {
        const { score: healthScore, label: healthLabel } = computeHealthScore({
          sharpeRatio: r.sharpeRatio,
          maxDrawdownPercent: r.maxDrawdownPercent,
          winRate: r.winRate,
          paperTradingDays: r.paperTradingDays,
          liveTrackRecordDays: r.liveTrackRecordDays,
        });
        return {
          id: r.id,
          name: r.name,
          description: r.description,
          priceMonthlyCents: r.priceMonthlyCents,
          priceYearlyCents: r.priceYearlyCents,
          platformFeePercent: r.platformFeePercent,
          sharpeRatio: r.sharpeRatio,
          maxDrawdownPercent: r.maxDrawdownPercent,
          winRate: r.winRate,
          riskLabel: r.riskLabel,
          category: r.category,
          timeframe: r.timeframe,
          liveTrackRecordDays: r.liveTrackRecordDays,
          paperTradingDays: r.paperTradingDays,
          healthScore,
          healthLabel,
          developerName: r.developerName ?? "Developer",
          developerEmail: r.developerEmail ? r.developerEmail.replace(/(.{2})(.*)(@.*)/, "$1***$3") : null,
        };
      }),
    });
  } catch (err) {
    console.error("[trading/strategies GET]", err);
    return NextResponse.json(
      { success: false, error: "INTERNAL_ERROR", message: "Failed to list strategies." },
      { status: 500 }
    );
  }
}

/**
 * POST /api/trading/strategies
 * Create a marketplace strategy (developer only, must be onboarded).
 */
export async function POST(request: Request) {
  try {
    const authResult = await getAuthUser(request as never);
    if ("error" in authResult) {
      return NextResponse.json({ success: false, error: authResult.error }, { status: 401 });
    }

    const body = await request.json().catch(() => ({}));
    const {
      name,
      description,
      strategySnapshot,
      priceMonthlyCents,
      priceYearlyCents,
      advancedStrategyId,
    } = body as {
      name?: string;
      description?: string;
      strategySnapshot?: unknown;
      priceMonthlyCents?: number;
      priceYearlyCents?: number;
      advancedStrategyId?: string;
    };

    const nameStr = (name ?? "").toString().trim();
    if (!nameStr || nameStr.length > 100) {
      return NextResponse.json(
        { success: false, error: "VALIDATION_ERROR", message: "name required, max 100 chars" },
        { status: 400 }
      );
    }

    let snapshot: unknown;
    if (strategySnapshot && typeof strategySnapshot === "object") {
      snapshot = strategySnapshot;
    } else if (advancedStrategyId) {
      const [adv] = await db
        .select()
        .from(advancedStrategies)
        .where(
          and(
            eq(advancedStrategies.id, advancedStrategyId),
            eq(advancedStrategies.userId, authResult.user.id)
          )
        )
        .limit(1);
      if (!adv) {
        return NextResponse.json(
          { success: false, error: "NOT_FOUND", message: "Advanced strategy not found" },
          { status: 404 }
        );
      }
      snapshot = {
        type: "advanced",
        baseConfig: adv.baseConfig,
        rules: adv.rules,
        globalLimits: adv.globalLimits,
      };
    } else {
      return NextResponse.json(
        { success: false, error: "VALIDATION_ERROR", message: "strategySnapshot or advancedStrategyId required" },
        { status: 400 }
      );
    }

    const priceMonthly = Math.floor(Number(priceMonthlyCents) || 0);
    if (priceMonthly < PRICE_MIN_CENTS || priceMonthly > PRICE_MAX_CENTS) {
      return NextResponse.json(
        { success: false, error: "VALIDATION_ERROR", message: `priceMonthlyCents must be ${PRICE_MIN_CENTS}-${PRICE_MAX_CENTS}` },
        { status: 400 }
      );
    }

    const priceYearly = priceYearlyCents != null ? Math.floor(Number(priceYearlyCents) || 0) : null;

    const [dev] = await db
      .select()
      .from(marketplaceDevelopers)
      .where(eq(marketplaceDevelopers.userId, authResult.user.id))
      .limit(1);

    if (!dev || !dev.stripeAccountId || !dev.stripeOnboardingComplete) {
      return NextResponse.json(
        { success: false, error: "NOT_ONBOARDED", message: "Complete Stripe Connect onboarding first" },
        { status: 403 }
      );
    }

    const feePercent = calculatePlatformFeePercent(
      dev.subscriberCount ?? 0,
      dev.rating,
      false
    );

    const [inserted] = await db
      .insert(marketplaceStrategies)
      .values({
        developerId: dev.id,
        name: nameStr,
        description: (description ?? "").toString().trim() || null,
        strategySnapshot: snapshot as Record<string, unknown>,
        priceMonthlyCents: priceMonthly,
        priceYearlyCents: priceYearly,
        platformFeePercent: feePercent,
        isActive: false,
      })
      .returning({ id: marketplaceStrategies.id });

    return NextResponse.json({
      success: true,
      data: { id: inserted?.id },
    });
  } catch (err) {
    console.error("[trading/strategies POST]", err);
    return NextResponse.json(
      { success: false, error: "INTERNAL_ERROR", message: "Failed to create strategy." },
      { status: 500 }
    );
  }
}

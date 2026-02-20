/**
 * Seed 5 in-house marketplace strategies for Xpersona.
 * Creates a system user + developer, then inserts strategies with fake performance data.
 * Run: tsx scripts/seed-marketplace-strategies.ts
 * Prerequisite: npm run db:push (or db:migrate) to apply schema.
 */
import "./load-env";
import { db } from "../lib/db";
import {
  users,
  marketplaceDevelopers,
  marketplaceStrategies,
  strategyPerformanceSnapshots,
} from "../lib/db/schema";
import { eq } from "drizzle-orm";
import { CREATIVE_DICE_STRATEGIES } from "../lib/dice-strategies";

const XPERSONA_SEED_EMAIL = "xpersona-seed@xpersona.local";

// Pick 5 diverse strategies for the seed
const STRATEGIES_TO_SEED = ["martingale", "paroli", "dalembert", "fibonacci", "kelly"];

// Fake performance data per risk tier
const PERFORMANCE_BY_RISK: Record<
  string,
  { sharpeRatio: number; maxDrawdownPercent: number; winRate: number; tradeCount: number; riskLabel: string }
> = {
  LOW: { sharpeRatio: 0.85, maxDrawdownPercent: 6, winRate: 52, tradeCount: 180, riskLabel: "conservative" },
  MEDIUM: { sharpeRatio: 1.1, maxDrawdownPercent: 14, winRate: 50, tradeCount: 220, riskLabel: "moderate" },
  HIGH: { sharpeRatio: 1.35, maxDrawdownPercent: 22, winRate: 48, tradeCount: 310, riskLabel: "aggressive" },
  CALCULATED: { sharpeRatio: 1.2, maxDrawdownPercent: 12, winRate: 51, tradeCount: 195, riskLabel: "moderate" },
};

async function seed() {
  let [seedUser] = await db.select().from(users).where(eq(users.email, XPERSONA_SEED_EMAIL)).limit(1);

  if (!seedUser) {
    const [inserted] = await db
      .insert(users)
      .values({
        email: XPERSONA_SEED_EMAIL,
        name: "Xpersona",
        accountType: "agent",
        agentId: "aid_seed01",
      })
      .returning();
    seedUser = inserted!;
    console.log("Created Xpersona seed user");
  }

  let [dev] = await db
    .select()
    .from(marketplaceDevelopers)
    .where(eq(marketplaceDevelopers.userId, seedUser.id))
    .limit(1);

  if (!dev) {
    const [inserted] = await db
      .insert(marketplaceDevelopers)
      .values({
        userId: seedUser.id,
        stripeAccountId: null,
        stripeOnboardingComplete: false,
        feeTier: "elite",
        subscriberCount: 0,
      })
      .returning();
    dev = inserted!;
    console.log("Created Xpersona marketplace developer");
  }

  const creativeStrategies = CREATIVE_DICE_STRATEGIES.filter((s) =>
    STRATEGIES_TO_SEED.includes(s.id)
  );

  for (const cs of creativeStrategies) {
    const perf = PERFORMANCE_BY_RISK[cs.risk] ?? PERFORMANCE_BY_RISK.MEDIUM;
    const snapshot = {
      type: "basic",
      config: {
        amount: cs.config.amount,
        target: cs.config.target,
        condition: cs.config.condition,
        progressionType: cs.config.progressionType ?? "flat",
      },
    };

    const existing = await db
      .select({ name: marketplaceStrategies.name })
      .from(marketplaceStrategies)
      .where(eq(marketplaceStrategies.developerId, dev.id));

    const alreadyExists = existing.some((s) => s.name === `${cs.name} Pro`);
    if (alreadyExists) {
      console.log(`Skipping ${cs.name} (already seeded)`);
      continue;
    }

    const [strategy] = await db
      .insert(marketplaceStrategies)
      .values({
        developerId: dev.id,
        name: `${cs.name} Pro`,
        description: cs.desc,
        strategySnapshot: snapshot as Record<string, unknown>,
        priceMonthlyCents: 1999 + Math.floor(Math.random() * 2000),
        platformFeePercent: 20,
        isActive: true,
        sharpeRatio: perf.sharpeRatio,
        maxDrawdownPercent: perf.maxDrawdownPercent,
        winRate: perf.winRate,
        tradeCount: perf.tradeCount,
        paperTradingDays: 45,
        riskLabel: perf.riskLabel,
        liveTrackRecordDays: 120,
        category: "crypto",
        timeframe: "day",
      })
      .returning({ id: marketplaceStrategies.id });

    if (strategy?.id) {
      await db.insert(strategyPerformanceSnapshots).values({
        strategyId: strategy.id,
        sharpeRatio: perf.sharpeRatio,
        maxDrawdownPercent: perf.maxDrawdownPercent,
        winRate: perf.winRate,
        tradeCount: perf.tradeCount,
      });
      console.log(`Seeded: ${cs.name} Pro (${strategy.id})`);
    }
  }

  // Add a forked strategy (lineage demo): Kelly Pro v2 forked from Kelly Pro
  const allStrategies = await db
    .select({ id: marketplaceStrategies.id, name: marketplaceStrategies.name })
    .from(marketplaceStrategies)
    .where(eq(marketplaceStrategies.developerId, dev.id));
  const kellyProId = allStrategies.find((r) => r.name === "Kelly Pro")?.id;

  if (kellyProId) {
    const existingFork = await db
      .select()
      .from(marketplaceStrategies)
      .where(eq(marketplaceStrategies.developerId, dev.id));
    const hasFork = existingFork.some((s) => s.parentStrategyId === kellyProId);
    if (!hasFork) {
      await db.insert(marketplaceStrategies).values({
        developerId: dev.id,
        name: "Kelly Pro v2",
        description: "Fork of Kelly Pro with adjusted risk parameters.",
        strategySnapshot: { type: "basic", config: {} },
        priceMonthlyCents: 2499,
        platformFeePercent: 20,
        isActive: true,
        sharpeRatio: 1.25,
        maxDrawdownPercent: 10,
        winRate: 52,
        tradeCount: 200,
        paperTradingDays: 60,
        riskLabel: "conservative",
        category: "crypto",
        timeframe: "day",
        parentStrategyId: kellyProId,
      });
      console.log("Seeded: Kelly Pro v2 (forked from Kelly Pro)");
    }
  }

  console.log("✅ Marketplace strategies seeded.");
}

seed()
  .catch((e) => {
    console.error("Seed failed:", e);
    process.exit(1);
  })
  .finally(() => process.exit(0));

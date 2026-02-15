/**
 * Backfill deposits table from stripe_events (checkout.session.completed).
 * Run after applying migration 0003 (deposits table) and before using withdrawal gate.
 *
 * Usage: npx tsx scripts/backfill-deposits.ts
 */
import "dotenv/config";
import { config } from "dotenv";
config({ path: ".env.local" });

import { db } from "../lib/db";
import { stripeEvents, deposits } from "../lib/db/schema";
import { eq, isNotNull } from "drizzle-orm";

async function backfill() {
  if (!process.env.DATABASE_URL) {
    console.error("DATABASE_URL is not set.");
    process.exit(1);
  }

  const rows = await db
    .select({
      stripeEventId: stripeEvents.stripeEventId,
      type: stripeEvents.type,
      payload: stripeEvents.payload,
      processedAt: stripeEvents.processedAt,
    })
    .from(stripeEvents)
    .where(eq(stripeEvents.type, "checkout.session.completed"));

  const existingEventIds = new Set(
    (await db.select({ stripeEventId: deposits.stripeEventId }).from(deposits).where(isNotNull(deposits.stripeEventId)))
      .map((r) => r.stripeEventId)
      .filter((id): id is string => typeof id === "string")
  );

  let inserted = 0;
  let skipped = 0;
  let failed = 0;

  for (const row of rows) {
    if (existingEventIds.has(row.stripeEventId)) {
      skipped++;
      continue;
    }
    const payload = row.payload as Record<string, unknown> | null;
    if (!payload || typeof payload !== "object") {
      failed++;
      console.warn(`[backfill-deposits] Invalid payload for event ${row.stripeEventId}`);
      continue;
    }
    const data = payload.data as Record<string, unknown> | undefined;
    const session = (data?.object ?? payload) as Record<string, unknown> | undefined;
    if (!session || typeof session !== "object") {
      failed++;
      console.warn(`[backfill-deposits] No session in payload for event ${row.stripeEventId}`);
      continue;
    }
    const metadata = session.metadata as Record<string, unknown> | undefined;
    const userId = metadata?.userId as string | undefined;
    const creditsStr = metadata?.credits as string | undefined;
    if (!userId || typeof userId !== "string" || !creditsStr) {
      failed++;
      console.warn(`[backfill-deposits] Missing userId or credits in metadata for event ${row.stripeEventId}`);
      continue;
    }
    const credits = parseInt(String(creditsStr), 10);
    if (Number.isNaN(credits) || credits <= 0) {
      failed++;
      console.warn(`[backfill-deposits] Invalid credits "${creditsStr}" for event ${row.stripeEventId}`);
      continue;
    }
    try {
      await db.insert(deposits).values({
        userId,
        credits,
        stripeEventId: row.stripeEventId,
        stripeSessionId: (session.id as string) ?? undefined,
        createdAt: row.processedAt ?? new Date(),
      });
      existingEventIds.add(row.stripeEventId);
      inserted++;
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      if (msg.includes("unique") || msg.includes("duplicate") || msg.includes("foreign key")) {
        skipped++;
        existingEventIds.add(row.stripeEventId);
      } else {
        failed++;
        console.error(`[backfill-deposits] Insert failed for event ${row.stripeEventId}:`, e);
      }
    }
  }

  console.log(`Backfill complete: ${inserted} inserted, ${skipped} skipped (duplicate), ${failed} failed.`);
}

backfill()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });

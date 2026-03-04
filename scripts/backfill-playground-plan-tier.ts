import { and, eq, isNotNull } from "drizzle-orm";
import { db } from "@/lib/db";
import { playgroundSubscriptions } from "@/lib/db/playground-schema";

/**
 * Backfill legacy "paid" subscriptions to "builder".
 * Safe to run multiple times.
 */
async function main() {
  const legacyPaid = await db
    .select({ id: playgroundSubscriptions.id })
    .from(playgroundSubscriptions)
    .where(eq(playgroundSubscriptions.planTier, "paid" as any));

  if (!legacyPaid.length) {
    console.log("No legacy paid rows found.");
    return;
  }

  await db
    .update(playgroundSubscriptions)
    .set({ planTier: "builder", updatedAt: new Date() })
    .where(eq(playgroundSubscriptions.planTier, "paid" as any));

  console.log(`Backfilled ${legacyPaid.length} subscription(s): paid -> builder`);

  const withStripeId = await db
    .select({ id: playgroundSubscriptions.id })
    .from(playgroundSubscriptions)
    .where(
      and(
        eq(playgroundSubscriptions.planTier, "builder"),
        isNotNull(playgroundSubscriptions.stripeSubscriptionId)
      )
    );

  console.log(
    `Builder subscriptions with Stripe IDs (metadata reconciliation candidate set): ${withStripeId.length}`
  );
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error("Backfill failed:", error);
    process.exit(1);
  });

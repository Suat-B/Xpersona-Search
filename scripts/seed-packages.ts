/**
 * Seed credit_packages. Run after migrations.
 * Set STRIPE_PRICE_* in env or edit placeholders before running in prod.
 */
import { db } from "../lib/db";
import { creditPackages } from "../lib/db/schema";

const packages = [
  {
    stripePriceId: process.env.STRIPE_PRICE_500 ?? "price_placeholder_500",
    name: "Starter Bundle",
    credits: 500,
    amountCents: 500, // $5.00
    active: true,
    sortOrder: 0,
  },
  {
    stripePriceId: process.env.STRIPE_PRICE_2000 ?? "price_placeholder_2000",
    name: "2000 Credits",
    credits: 2000,
    amountCents: 1499,
    active: true,
    sortOrder: 1,
  },
  {
    stripePriceId: process.env.STRIPE_PRICE_10000 ?? "price_placeholder_10000",
    name: "10000 Credits",
    credits: 10000,
    amountCents: 3999,
    active: true,
    sortOrder: 2,
  },
];

async function seed() {
  for (const pkg of packages) {
    await db
      .insert(creditPackages)
      .values(pkg)
      .onConflictDoNothing({ target: creditPackages.stripePriceId });
  }
  console.log("Credit packages seeded.");
}

seed().catch(console.error).finally(() => process.exit(0));

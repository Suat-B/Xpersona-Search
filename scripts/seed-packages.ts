/**
 * Seed credit_packages. Run after migrations.
 * Package specs from lib/credit-packages-config.json.
 * Set STRIPE_PRICE_* env vars (or run npm run setup:stripe).
 */
import "./load-env";
import { db } from "../lib/db";
import { creditPackages } from "../lib/db/schema";
import { PACKAGE_SPECS } from "../lib/credit-packages-config";
import { inArray } from "drizzle-orm";

function isValidStripePriceId(id: string): boolean {
  return typeof id === "string" && id.startsWith("price_") && id.length > 10 && !id.includes("placeholder");
}

async function seed() {
  const packages: Array<{
    stripePriceId: string;
    name: string;
    credits: number;
    amountCents: number;
    active: boolean;
    sortOrder: number;
  }> = [];

  for (let i = 0; i < PACKAGE_SPECS.length; i++) {
    const spec = PACKAGE_SPECS[i];
    const stripePriceId = (process.env[spec.envKey] ?? "").trim();
    if (!isValidStripePriceId(stripePriceId)) {
      console.warn(`⚠️  Skipping ${spec.name}: ${spec.envKey} not set or invalid (must be real Stripe Price ID, e.g. price_1ABC...)`);
      continue;
    }
    packages.push({
      stripePriceId,
      name: spec.name,
      credits: spec.credits,
      amountCents: spec.amountCents,
      active: true,
      sortOrder: i,
    });
  }

  if (packages.length === 0) {
    console.error(`
❌ No credit packages to seed. Set these in .env.local:
   STRIPE_PRICE_500=price_xxx   (Starter Bundle, $5)
   STRIPE_PRICE_2000=price_xxx  (2000 Credits, $20)
   STRIPE_PRICE_10000=price_xxx (10000 Credits, $100)

Create products in Stripe Dashboard → Product catalog → Add product.
See docs/STRIPE_SETUP.md for steps.
`);
    process.exit(1);
  }

  const creditTiers = packages.map((p) => p.credits);
  await db.delete(creditPackages).where(inArray(creditPackages.credits, creditTiers));

  for (const pkg of packages) {
    await db
      .insert(creditPackages)
      .values(pkg)
      .onConflictDoNothing({ target: creditPackages.stripePriceId });
  }
  console.log(`✅ Credit packages seeded (${packages.length} packages).`);
}

seed().catch((e) => {
  console.error("Seed failed:", e);
  process.exit(1);
}).finally(() => process.exit(0));

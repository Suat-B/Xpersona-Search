/**
 * Seed credit_packages. Run after migrations.
 * Requires STRIPE_PRICE_500, STRIPE_PRICE_2000, STRIPE_PRICE_10000 in env.
 * Create products in Stripe Dashboard first (see docs/STRIPE_SETUP.md).
 */
import { db } from "../lib/db";
import { creditPackages } from "../lib/db/schema";

const PACKAGE_SPECS = [
  { envKey: "STRIPE_PRICE_500", name: "Starter Bundle", credits: 500, amountCents: 500 },
  { envKey: "STRIPE_PRICE_2000", name: "2000 Credits", credits: 2000, amountCents: 1499 },
  { envKey: "STRIPE_PRICE_10000", name: "10000 Credits", credits: 10000, amountCents: 3999 },
] as const;

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
   STRIPE_PRICE_2000=price_xxx  (2000 Credits, $14.99)
   STRIPE_PRICE_10000=price_xxx (10000 Credits, $39.99)

Create products in Stripe Dashboard → Product catalog → Add product.
See docs/STRIPE_SETUP.md for steps.
`);
    process.exit(1);
  }

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

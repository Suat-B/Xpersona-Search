#!/usr/bin/env node
/**
 * Seed credit_packages into production database.
 * Pulls full production env from Vercel (including STRIPE_PRICE_*), then runs seed.
 * Usage: npm run db:seed-production
 */
import { execSync } from "child_process";
import { existsSync, readFileSync, writeFileSync, unlinkSync } from "fs";
import { fileURLToPath } from "url";
import { dirname, join } from "path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, "..");
const envBackup = join(root, ".env.seed.backup");
const envPath = join(root, ".env.local");
const envVercel = join(root, ".env.local.vercel");

function run(cmd, opts = {}) {
  return execSync(cmd, { cwd: root, stdio: opts.silent ? "pipe" : "inherit", ...opts });
}

async function main() {
  console.log("\n📦 Seeding production credit packages...\n");

  console.log("1️⃣  Pulling production env from Vercel...");
  try {
    run("npx vercel env pull .env.local.vercel --environment=production --yes");
  } catch (e) {
    console.error("Failed to pull Vercel env. Ensure: npx vercel link");
    process.exit(1);
  }

  const pulled = readFileSync(envVercel, "utf8");
  const hasDb = /DATABASE_URL=.+/.test(pulled);
  const hasStripe = /STRIPE_PRICE_\d+=[^\n]*price_[a-zA-Z0-9]+/m.test(pulled);
  if (!hasDb) {
    console.error("DATABASE_URL not found in Vercel production env.");
    cleanup();
    process.exit(1);
  }
  if (!hasStripe) {
    console.error(
      "STRIPE_PRICE_500, STRIPE_PRICE_2000, or STRIPE_PRICE_10000 not set in Vercel. Add them in Project → Settings → Environment Variables."
    );
    cleanup();
    process.exit(1);
  }

  if (existsSync(envPath)) {
    writeFileSync(envBackup, readFileSync(envPath, "utf8"));
  }
  try {
    writeFileSync(envPath, readFileSync(envVercel, "utf8"));
    console.log("\n2️⃣  Running seed...");
    run("npm run seed");
  } finally {
    if (existsSync(envBackup)) {
      writeFileSync(envPath, readFileSync(envBackup, "utf8"));
      unlinkSync(envBackup);
    }
    cleanup();
  }

  console.log("\n✅ Production credit packages seeded.\n");
}

function cleanup() {
  if (existsSync(envVercel)) unlinkSync(envVercel);
}

main().catch((e) => {
  console.error(e);
  cleanup();
  process.exit(1);
});

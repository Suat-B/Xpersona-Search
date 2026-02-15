#!/usr/bin/env node
/**
 * Run DB migration against production database.
 * Pulls DATABASE_URL from Vercel env, then runs add-account-type.
 * Usage: npm run db:migrate-production
 */
import { execSync } from "child_process";
import { existsSync, readFileSync, writeFileSync, unlinkSync } from "fs";
import { fileURLToPath } from "url";
import { dirname, join } from "path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, "..");
const envBackup = join(root, ".env.migration.backup");
const envPath = join(root, ".env.local");

function run(cmd, opts = {}) {
  return execSync(cmd, { cwd: root, stdio: "inherit", ...opts });
}

async function main() {
  console.log("\n📦 Migrating production database...\n");

  // Pull production env from Vercel (creates .env.local.vercel)
  console.log("1️⃣  Pulling production env from Vercel...");
  try {
    run("npx vercel env pull .env.local.vercel --environment=production --yes");
  } catch (e) {
    console.error("Failed to pull Vercel env. Ensure you're linked: npx vercel link");
    process.exit(1);
  }

  const pulled = readFileSync(join(root, ".env.local.vercel"), "utf8");
  const dbMatch = pulled.match(/DATABASE_URL=(.+)/m);
  if (!dbMatch || !dbMatch[1].trim()) {
    console.error("DATABASE_URL not found in Vercel production env.");
    process.exit(1);
  }

  // Backup .env.local, inject DATABASE_URL for migration, run, restore
  if (existsSync(envPath)) {
    writeFileSync(envBackup, readFileSync(envPath, "utf8"));
  }
  const current = existsSync(envPath) ? readFileSync(envPath, "utf8") : "";
  const withoutDb = current.replace(/DATABASE_URL=.*/m, "").trim();
  writeFileSync(envPath, `${withoutDb}\nDATABASE_URL=${dbMatch[1].trim()}\n`);

  try {
    console.log("\n2️⃣  Running migration...");
    run("npm run db:add-account-type");
  } finally {
    if (existsSync(envBackup)) {
      writeFileSync(envPath, readFileSync(envBackup, "utf8"));
      unlinkSync(envBackup);
    }
    if (existsSync(join(root, ".env.local.vercel"))) {
      unlinkSync(join(root, ".env.local.vercel"));
    }
  }

  console.log("\n✅ Production migration complete.\n");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

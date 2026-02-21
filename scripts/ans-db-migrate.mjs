#!/usr/bin/env node
/**
 * ANS database migration — adds missing stripe_customer_id column + ensures env.
 * Run: npm run db:ans-migrate
 *
 * Fixes "column stripe_customer_id does not exist" when claiming domains.
 * Also ensures MASTER_ENCRYPTION_KEY in .env.local for registration to proceed.
 */

import { config } from "dotenv";
import { readFileSync, writeFileSync, existsSync } from "fs";
import { randomBytes } from "crypto";
import { fileURLToPath } from "url";
import { dirname, join } from "path";
import pg from "pg";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, "..");
const ENV_LOCAL = join(root, ".env.local");

config({ path: ".env.local" });

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) {
  console.error("❌ DATABASE_URL not set. Add it to .env.local");
  process.exit(1);
}

async function main() {
  const client = new pg.Client({
    connectionString: DATABASE_URL.replace(
      /sslmode=(?:prefer|require|verify-ca)(?=&|$)/gi,
      "sslmode=verify-full"
    ),
  });

  try {
    await client.connect();
    console.log("✓ Connected to database");

    // Check if column exists
    const checkRes = await client.query(`
      SELECT column_name FROM information_schema.columns
      WHERE table_name = 'users' AND column_name = 'stripe_customer_id'
    `);

    if (checkRes.rows.length > 0) {
      console.log("✓ stripe_customer_id column already exists");
      return;
    }

    // Add column (PostgreSQL 9.6+ supports IF NOT EXISTS)
    await client.query(`
      ALTER TABLE users ADD COLUMN IF NOT EXISTS stripe_customer_id VARCHAR(255)
    `);
    console.log("✓ Added stripe_customer_id column to users");

    // Add unique index if not exists
    await client.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS users_stripe_customer_id_idx
      ON users(stripe_customer_id) WHERE stripe_customer_id IS NOT NULL
    `);
    console.log("✓ Created unique index on stripe_customer_id");

    console.log("\n✓ ANS migration complete. Registration should work now.\n");
  } catch (err) {
    console.error("Migration failed:", err.message);
    process.exit(1);
  } finally {
    await client.end();
  }
}

function ensureMasterKey() {
  if (!existsSync(ENV_LOCAL)) return;
  let content = readFileSync(ENV_LOCAL, "utf8");
  const re = /^MASTER_ENCRYPTION_KEY=.+$/m;
  if (re.test(content)) return;
  const key = randomBytes(32).toString("hex");
  content = content.trimEnd() + `\nMASTER_ENCRYPTION_KEY=${key}\n`;
  writeFileSync(ENV_LOCAL, content);
  console.log("✓ Added MASTER_ENCRYPTION_KEY to .env.local (required for ANS)\n");
}

async function run() {
  ensureMasterKey();
  await main();
}

run();

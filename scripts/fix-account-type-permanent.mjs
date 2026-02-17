#!/usr/bin/env node
/**
 * Fix accountType for users with passwordHash (permanent accounts).
 * Sets account_type = 'email' where password_hash IS NOT NULL and account_type != 'email'.
 * Run: node scripts/fix-account-type-permanent.mjs
 */
import "dotenv/config";
import { readFileSync, existsSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import pg from "pg";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, "..");

function loadEnv() {
  const envLocal = join(root, ".env.local");
  if (existsSync(envLocal)) {
    const content = readFileSync(envLocal, "utf8");
    for (const line of content.split("\n")) {
      const match = line.match(/^([^#=]+)=(.*)$/);
      if (match) {
        const key = match[1].trim();
        const val = match[2].trim().replace(/^["']|["']$/g, "");
        if (!process.env[key]) process.env[key] = val;
      }
    }
  }
}

loadEnv();

const dbUrl = process.env.DATABASE_URL;
if (!dbUrl) {
  console.error("DATABASE_URL not set.");
  process.exit(1);
}

async function main() {
  const client = new pg.Client({
    connectionString: dbUrl.replace(/sslmode=(?:prefer|require|verify-ca)/i, "sslmode=verify-full"),
  });
  try {
    await client.connect();
    const r = await client.query(`
      UPDATE users
      SET account_type = 'email'
      WHERE password_hash IS NOT NULL AND account_type != 'email'
      RETURNING id, email;
    `);
    console.log(`Updated ${r.rowCount} user(s) to account_type='email'.`);
    if (r.rows?.length) {
      r.rows.forEach((row) => console.log(`  - ${row.email}`));
    }
  } catch (err) {
    console.error("Migration failed:", err.message);
    process.exit(1);
  } finally {
    await client.end();
  }
}

main();

#!/usr/bin/env node
/**
 * Add password_hash column to users table for email/password auth.
 * Run: node scripts/add-password-hash.mjs
 * Uses DATABASE_URL from .env.local (via dotenv) or env.
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
  console.error("DATABASE_URL not set. Add it to .env.local");
  process.exit(1);
}

async function main() {
  const client = new pg.Client({ connectionString: dbUrl });
  try {
    await client.connect();
    await client.query(`
      ALTER TABLE users ADD COLUMN IF NOT EXISTS password_hash varchar(255);
    `);
    console.log("Added password_hash column to users table.");
  } catch (err) {
    console.error("Migration failed:", err.message);
    process.exit(1);
  } finally {
    await client.end();
  }
}

main();

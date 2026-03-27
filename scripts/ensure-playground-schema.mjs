#!/usr/bin/env node
/**
 * Applies idempotent playground SQL migrations when `drizzle-kit migrate` cannot run
 * (e.g. DB was partially created with push / older tooling and early migrations conflict).
 *
 * Uses DATABASE_URL from .env.local (same as drizzle.config.ts).
 * Usage: npm run db:ensure-playground-schema
 */
import { config } from "dotenv";
import { readFileSync } from "fs";
import { dirname, join } from "path";
import { fileURLToPath } from "url";
import pg from "pg";

const { Client } = pg;
const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, "..");

config({ path: join(root, ".env.local") });

const url = String(process.env.DATABASE_URL || "").trim();
if (!url) {
  console.error("DATABASE_URL is missing. Set it in .env.local.");
  process.exit(1);
}

/** Order matters: core tables before alters and VS Code auth. */
const files = [
  "0026_playground_orchestration.sql",
  "0027_playground_reliability_qol.sql",
  "0029_playground_vscode_browser_auth.sql",
];

async function main() {
  const client = new Client({ connectionString: url });
  await client.connect();
  try {
    for (const name of files) {
      const path = join(root, "drizzle", name);
      const sql = readFileSync(path, "utf8");
      process.stdout.write(`Applying ${name}... `);
      await client.query(sql);
      console.log("ok");
    }
    console.log("\nPlayground schema SQL applied successfully.");
  } finally {
    await client.end();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

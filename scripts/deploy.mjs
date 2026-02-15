#!/usr/bin/env node
/**
 * Agentic deploy: one command to ship xpersona.co
 * Prereqs: vercel CLI (`npm i -g vercel` or uses npx), GitHub connected to Vercel
 * First run: links project, syncs env, deploys.
 */

import { execSync, spawn } from "child_process";
import { readFileSync, existsSync } from "fs";
import { fileURLToPath } from "url";
import { dirname, join } from "path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, "..");

function run(cmd, opts = {}) {
  try {
    return execSync(cmd, { cwd: root, stdio: opts.silent ? "pipe" : "inherit", ...opts });
  } catch (e) {
    if (!opts.ignoreError) throw e;
    return null;
  }
}

function hasVercelProject() {
  try {
    const out = execSync("vercel project ls 2>/dev/null | head -5", { cwd: root, encoding: "utf8" });
    return out && !out.includes("Error");
  } catch {
    return false;
  }
}

async function main() {
  console.log("\n🚀 xpersona.co agentic deploy\n");

  const envPath = join(root, ".env.local");
  if (!existsSync(envPath)) {
    console.log("⚠️  No .env.local found. Copy .env.example to .env.local and fill in values.\n");
    process.exit(1);
  }

  const env = readFileSync(envPath, "utf8");

  // Run migration first (only needs DATABASE_URL) so production DB has account_type
  if (env.includes("DATABASE_URL=")) {
    console.log("1️⃣  Running DB migration (account_type, agent_id)...");
    run("npm run db:add-account-type", { ignoreError: true });
  }

  const required = ["NEXTAUTH_SECRET", "NEXTAUTH_URL", "DATABASE_URL", "GOOGLE_CLIENT_ID", "GOOGLE_CLIENT_SECRET", "STRIPE_SECRET_KEY", "STRIPE_WEBHOOK_SECRET"];
  const missing = required.filter((k) => {
    const m = env.match(new RegExp(`${k}=(.+)`, "m"));
    return !m || !m[1].trim() || m[1].trim().length < 3;
  });
  if (missing.length > 0) {
    console.log("⚠️  .env.local missing or empty:", missing.join(", "));
    console.log("   Fill these in before deploying.\n");
    process.exit(1);
  }

  if (!env.includes("NEXTAUTH_URL=https://xpersona.co")) {
    console.log("⚠️  Set NEXTAUTH_URL=https://xpersona.co in .env.local for production.\n");
  }

  console.log("\n2️⃣  Linking Vercel project (one-time; follow prompts if any)...");
  run("npx vercel link --yes", { ignoreError: true });

  console.log("\n3️⃣  Deploying to production...");
  run("npx vercel --prod --yes");

  console.log("\n✅ Deploy done.");
  console.log("   First time? Add env vars in Vercel → Project → Settings → Environment Variables (copy from .env.local)");
  console.log("   Add domain: Vercel → Settings → Domains → xpersona.co\n");
}

main().catch((e) => {
  console.error(e.message || e);
  process.exit(1);
});

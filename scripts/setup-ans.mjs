#!/usr/bin/env node
/**
 * Setup ANS (Agent Name Service) for .xpersona.agent domains — automated.
 * Run: npm run setup:ans
 *
 * 1. Generates MASTER_ENCRYPTION_KEY (64 hex chars)
 * 2. Creates Stripe products + prices via API (Standard $10/yr, Pro $25/yr)
 * 3. Ensures webhook includes ANS events (checkout.session.completed, etc.)
 * 4. Writes STRIPE_PRICE_ID_ANS_STANDARD, STRIPE_PRICE_ID_ANS_PRO + MASTER_ENCRYPTION_KEY to .env.local
 *
 * Requires: STRIPE_SECRET_KEY in .env.local (or paste when prompted).
 * Optional: NEXTAUTH_URL for webhook URL (defaults to localhost).
 */

import { readFileSync, writeFileSync, existsSync } from "fs";
import { createInterface } from "readline";
import { randomBytes } from "crypto";
import { fileURLToPath } from "url";
import { dirname, join } from "path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, "..");

const ENV_LOCAL = join(root, ".env.local");
const ENV_EXAMPLE = join(root, ".env.example");

// Per XPERSONA ANS PLAN1.MD: Standard + Pro tiers
const ANS_PACKAGES = [
  { envKey: "STRIPE_PRICE_ID_ANS_STANDARD", name: "ANS Standard Domain", yearlyCents: 1000 },
  { envKey: "STRIPE_PRICE_ID_ANS_PRO", name: "ANS Pro Domain", yearlyCents: 2500 },
];

const ANS_WEBHOOK_EVENTS = [
  "checkout.session.completed",
  "invoice.payment_succeeded",
  "customer.subscription.deleted",
];

function readEnv() {
  if (!existsSync(ENV_LOCAL)) return "";
  return readFileSync(ENV_LOCAL, "utf8");
}

function writeEnv(content) {
  writeFileSync(ENV_LOCAL, content, "utf8");
}

function ensureEnv() {
  if (!existsSync(ENV_LOCAL)) {
    const example = existsSync(ENV_EXAMPLE) ? readFileSync(ENV_EXAMPLE, "utf8") : "";
    writeEnv(example || "# Xpersona .env.local\n");
    console.log("  Created .env.local from .env.example\n");
  }
}

function setVar(content, key, value) {
  const line = `${key}=${String(value).replace(/\n/g, "")}`;
  const re = new RegExp(`^${key}=.*$`, "m");
  if (re.test(content)) {
    return content.replace(re, line);
  }
  return content.trimEnd() + `\n${line}\n`;
}

function getVar(content, key) {
  const m = content.match(new RegExp(`^${key}=(.+)$`, "m"));
  return m ? m[1].trim().replace(/^["']|["']$/g, "") : null;
}

function getWebhookUrl(content) {
  const url = getVar(content, "NEXTAUTH_URL") || getVar(content, "NEXT_PUBLIC_APP_URL");
  const base = url ? url.trim().replace(/\/$/, "") : "http://localhost:3000";
  return `${base}/api/stripe/webhook`;
}

function prompt(question) {
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  return new Promise((resolve) => {
    rl.question(question, (answer) => {
      rl.close();
      resolve(answer.trim());
    });
  });
}

function generateMasterKey() {
  return randomBytes(32).toString("hex");
}

async function createAnsStripeResources(stripe) {
  const priceIds = {};
  const products = await stripe.products.list({ limit: 100 });

  for (const pkg of ANS_PACKAGES) {
    const ansMeta = pkg.envKey.includes("PRO") ? "ans_pro" : "ans_standard";
    let product = products.data.find(
      (p) => p.name === pkg.name || p.metadata?.xpersona_ans === ansMeta
    );

    if (!product) {
      product = await stripe.products.create({
        name: pkg.name,
        description: `.xpersona.agent domain registration — yearly subscription`,
        metadata: { xpersona_ans: ansMeta },
      });
      console.log(`  Created Stripe product: ${pkg.name}`);
    } else {
      console.log(`  Found existing Stripe product: ${pkg.name}`);
    }

    const prices = await stripe.prices.list({ product: product.id, active: true });
    let price = prices.data.find(
      (p) =>
        p.recurring?.interval === "year" && p.unit_amount === pkg.yearlyCents
    );

    if (!price) {
      price = await stripe.prices.create({
        product: product.id,
        unit_amount: pkg.yearlyCents,
        currency: "usd",
        recurring: { interval: "year" },
        metadata: { xpersona_ans: ansMeta },
      });
      const label = `$${(pkg.yearlyCents / 100).toFixed(0)}/year`;
      console.log(`  Created Stripe price: ${label}`);
    } else {
      const label = `$${(pkg.yearlyCents / 100).toFixed(0)}/year`;
      console.log(`  Found existing Stripe price: ${label}`);
    }

    priceIds[pkg.envKey] = price.id;
  }

  return priceIds;
}

async function ensureWebhookEvents(stripe, webhookUrl) {
  const endpoints = await stripe.webhookEndpoints.list({ limit: 100 });
  const ours = endpoints.data.find((e) => e.url === webhookUrl);

  if (!ours) {
    console.log("  No webhook endpoint for this URL yet.");
    console.log(`  Add manually: Stripe Dashboard → Webhooks → Add endpoint`);
    console.log(`  URL: ${webhookUrl}`);
    console.log(`  Events: ${ANS_WEBHOOK_EVENTS.join(", ")}`);
    return;
  }

  const current = new Set(ours.enabled_events);
  if (current.has("*")) {
    console.log("  Webhook already receives all events.");
    return;
  }

  const toAdd = ANS_WEBHOOK_EVENTS.filter((e) => !current.has(e));

  if (toAdd.length === 0) {
    console.log("  Webhook already has ANS events enabled.");
    return;
  }

  const newEvents = [...ours.enabled_events, ...toAdd];
  await stripe.webhookEndpoints.update(ours.id, {
    enabled_events: newEvents,
  });
  console.log(`  Updated webhook: added ${toAdd.join(", ")}`);
}

async function main() {
  console.log("\n  Xpersona — ANS (Agent Name Service) Setup\n");
  console.log("  Automated setup for .xpersona.agent domain registration.\n");

  ensureEnv();
  let content = readEnv();

  let secretKey = getVar(content, "STRIPE_SECRET_KEY");
  if (!secretKey || secretKey.length < 20) {
    console.log("  STRIPE_SECRET_KEY not found or invalid.");
    secretKey = await prompt("  Paste Stripe Secret key (sk_...): ");
    if (!secretKey?.startsWith("sk_")) {
      console.log("\n  Invalid key. Add STRIPE_SECRET_KEY to .env.local and re-run.");
      process.exit(1);
    }
  }

  let Stripe;
  try {
    const mod = await import("stripe");
    Stripe = mod.default;
  } catch {
    console.log("\n  Stripe package not found. Run: npm install");
    process.exit(1);
  }

  const stripe = new Stripe(secretKey, { apiVersion: "2025-02-24.acacia" });

  // 1. Generate master key
  const masterKey = generateMasterKey();
  console.log("  Generated MASTER_ENCRYPTION_KEY");

  // 2. Create Stripe products + prices
  let priceIds;
  try {
    priceIds = await createAnsStripeResources(stripe);
  } catch (err) {
    console.error("\n  Stripe API error:", err.message);
    console.log("\n  Create products manually: Stripe Dashboard → Products → Add product");
    console.log("  Add recurring prices, copy price_xxx IDs for STRIPE_PRICE_ID_ANS_STANDARD and STRIPE_PRICE_ID_ANS_PRO");
    process.exit(1);
  }

  // 3. Ensure webhook has ANS events
  const webhookUrl = getWebhookUrl(content);
  try {
    await ensureWebhookEvents(stripe, webhookUrl);
  } catch (err) {
    console.warn("  Webhook update skipped:", err.message);
  }

  // 4. Write to .env.local
  content = readEnv(); // Re-read in case it was modified
  for (const [key, id] of Object.entries(priceIds)) {
    content = setVar(content, key, id);
  }
  content = setVar(content, "MASTER_ENCRYPTION_KEY", masterKey);
  if (!getVar(content, "STRIPE_SECRET_KEY")) {
    content = setVar(content, "STRIPE_SECRET_KEY", secretKey);
  }
  writeEnv(content);

  console.log("\n  Wrote to .env.local:");
  for (const key of Object.keys(priceIds)) {
    console.log(`  • ${key}`);
  }
  console.log("  • MASTER_ENCRYPTION_KEY");
  console.log("\n  ANS setup complete. Run 'npm run dev' and visit xpersona.co to test.\n");
  console.log("  Optional: Add Cloudflare env vars for automatic DNS (see docs/ANS-SETUP.md)\n");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

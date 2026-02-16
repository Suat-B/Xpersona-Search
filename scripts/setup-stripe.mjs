#!/usr/bin/env node
/**
 * Setup Stripe for Xpersona — hands-off payments + credit delivery.
 * Run: npm run setup:stripe
 *
 * 1. Opens Stripe Dashboard
 * 2. Prompts for Secret Key
 * 3. Creates 3 credit packages in Stripe via API
 * 4. Prompts for Webhook Secret
 * 5. Writes .env.local
 * 6. Seeds credit_packages in DB
 */

import { readFileSync, writeFileSync, existsSync } from "fs";
import { config } from "dotenv";
import { createInterface } from "readline";
import { spawn, execSync } from "child_process";
import { fileURLToPath } from "url";
import { dirname, join } from "path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, "..");

const ENV_LOCAL = join(root, ".env.local");
const ENV_EXAMPLE = join(root, ".env.example");

const PACKAGES = [
  { name: "Starter Bundle", credits: 500, amountCents: 500 },
  { name: "2000 Credits", credits: 2000, amountCents: 1499 },
  { name: "10000 Credits", credits: 10000, amountCents: 3999 },
];

const PREFIX = "Xpersona";

function open(url) {
  try {
    if (process.platform === "win32") {
      spawn("cmd", ["/c", "start", "", url], { stdio: "ignore" });
    } else if (process.platform === "darwin") {
      spawn("open", [url], { stdio: "ignore" });
    } else {
      spawn("xdg-open", [url], { stdio: "ignore" });
    }
  } catch {
    console.log(`\nOpen manually: ${url}\n`);
  }
}

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

function getWebhookUrl() {
  try {
    const m = readEnv().match(/NEXTAUTH_URL=(.+)/);
    if (m) {
      const url = m[1].trim().replace(/\/$/, "");
      return `${url}/api/stripe/webhook`;
    }
  } catch {}
  return "http://localhost:3000/api/stripe/webhook";
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

function setVar(content, key, value) {
  const line = `${key}=${String(value).replace(/\n/g, "")}`;
  const re = new RegExp(`^${key}=.*$`, "m");
  if (re.test(content)) {
    return content.replace(re, line);
  }
  return content.trimEnd() + `\n${line}\n`;
}

async function createProductsAndPrices(stripe) {
  const priceIds = { 500: null, 2000: null, 10000: null };
  const products = await stripe.products.list({ limit: 100 });
  for (const pkg of PACKAGES) {
    const tag = `${PREFIX} - ${pkg.name}`;
    let product = products.data.find(
      (p) => p.name === tag || (p.metadata?.xpersona_credits && parseInt(p.metadata.xpersona_credits, 10) === pkg.credits)
    );
    if (!product) {
      product = await stripe.products.create({
        name: tag,
        metadata: { xpersona_credits: String(pkg.credits) },
      });
    }
    const prices = await stripe.prices.list({ product: product.id, active: true });
    let price = prices.data.find((pr) => pr.unit_amount === pkg.amountCents);
    if (!price) {
      price = await stripe.prices.create({
        product: product.id,
        unit_amount: pkg.amountCents,
        currency: "usd",
      });
    }
    if (pkg.credits === 500) priceIds[500] = price.id;
    else if (pkg.credits === 2000) priceIds[2000] = price.id;
    else if (pkg.credits === 10000) priceIds[10000] = price.id;
  }
  return priceIds;
}

async function main() {
  console.log("\n  Xpersona — Stripe Payments Setup\n");
  console.log("  This sets up payments and credit delivery in one run.\n");

  open("https://dashboard.stripe.com/apikeys");

  console.log("  Steps:");
  console.log("  1. In Stripe Dashboard: Developers → API keys");
  console.log("  2. Copy the Secret key (sk_test_... or sk_live_...)");
  console.log("  3. Use Test mode for dev; Live for production.\n");

  const secretKey = await prompt("  Paste Secret key (sk_...): ");
  if (!secretKey || !secretKey.startsWith("sk_")) {
    console.log("\n  Invalid key. Add STRIPE_SECRET_KEY to .env.local manually.");
    process.exit(1);
  }

  let Stripe;
  try {
    const mod = await import("stripe");
    Stripe = mod.default;
  } catch (e) {
    console.log("\n  Stripe package not found. Run: npm install");
    process.exit(1);
  }

  const stripe = new Stripe(secretKey, { apiVersion: "2025-02-24.acacia" });

  console.log("\n  Creating credit packages in Stripe...");
  let priceIds;
  try {
    priceIds = await createProductsAndPrices(stripe);
  } catch (err) {
    console.error("\n  Stripe API error:", err.message);
    console.log("\n  Add STRIPE_PRICE_500, STRIPE_PRICE_2000, STRIPE_PRICE_10000 manually after creating products in Stripe Dashboard.");
    process.exit(1);
  }

  console.log("  Created/found prices: 500, 2000, 10000 credits.\n");

  const webhookUrl = getWebhookUrl();
  console.log("  Webhook Secret:");
  console.log("  • Local dev: Run 'stripe listen --forward-to " + webhookUrl + "' and paste the whsec_ value.");
  console.log("  • Production: Stripe Dashboard → Developers → Webhooks → Add endpoint");
  console.log("    URL: https://xpersona.co/api/stripe/webhook");
  console.log("    Events: checkout.session.completed");
  console.log("    Reveal Signing secret → paste below.\n");

  const webhookSecret = await prompt("  Paste Webhook signing secret (whsec_...): ");
  if (!webhookSecret || !webhookSecret.startsWith("whsec_")) {
    console.log("\n  Webhook secret required for credits to be added after payment.");
    console.log("  Add STRIPE_WEBHOOK_SECRET to .env.local when you have it.\n");
  }

  ensureEnv();
  let content = readEnv();

  content = setVar(content, "STRIPE_SECRET_KEY", secretKey);
  if (webhookSecret) content = setVar(content, "STRIPE_WEBHOOK_SECRET", webhookSecret);
  content = setVar(content, "STRIPE_PRICE_500", priceIds[500]);
  content = setVar(content, "STRIPE_PRICE_2000", priceIds[2000]);
  content = setVar(content, "STRIPE_PRICE_10000", priceIds[10000]);

  writeEnv(content);

  console.log("\n  Wrote STRIPE_* to .env.local\n");

  config({ path: ENV_LOCAL });
  console.log("  Seeding credit_packages...");
  try {
    execSync("npm run seed", { cwd: root, stdio: "inherit" });
  } catch {
    console.log("  Seed failed. Run 'npm run db:push' then 'npm run seed' manually.\n");
  }

  console.log("\n  Done. Next:");
  console.log("  1. Local dev: Run 'stripe listen --forward-to " + webhookUrl + "' in another terminal");
  console.log("  2. Start app: npm run dev");
  console.log("  3. Test: Dashboard → Deposit → buy a package (card 4242...)");
  console.log("  4. Production: Add same env vars to Vercel + webhook endpoint in Stripe.\n");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

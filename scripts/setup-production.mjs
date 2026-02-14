#!/usr/bin/env node
/**
 * Opens all required URLs for one-time production setup.
 * You still sign up / copy keys manually, but we open the tabs for you.
 */

import { execSync } from "child_process";
import { platform } from "os";

const LINKS = [
  { name: "Neon (database)", url: "https://neon.tech" },
  { name: "Vercel (hosting)", url: "https://vercel.com/new?filter=next.js" },
  { name: "Google Cloud (OAuth)", url: "https://console.cloud.google.com/apis/credentials" },
  { name: "Stripe (payments + webhook)", url: "https://dashboard.stripe.com/webhooks" },
];

function open(url) {
  const cmd = platform() === "win32" ? `start "" "${url}"` : platform() === "darwin" ? `open "${url}"` : `xdg-open "${url}"`;
  execSync(cmd, { stdio: "ignore" });
}

console.log("\n📋 Production setup — opening URLs.\n");
LINKS.forEach(({ name, url }, i) => {
  console.log(`${i + 1}. ${name}: ${url}`);
  try {
    open(url);
  } catch (_) {}
});

console.log(`
Checklist (do once):
□ Neon: Create project → copy connection string → add as DATABASE_URL in .env.local
□ Vercel: Import this repo, add env vars from .env.local
□ Google: Add redirect URI https://xpersona.co/api/auth/callback/google
□ Stripe: Add webhook https://xpersona.co/api/stripe/webhook (checkout.session.completed)
□ Vercel: Add domain xpersona.co in Settings → Domains

Then: npm run deploy
`);

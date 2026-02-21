# ANS Setup Guide

This guide covers how to configure the Agent Name Service (ANS) for `.xpersona.agent` domain registration on xpersona.co.

---

## Quick Start (Automated)

**Run one command to set up ANS:**

```bash
npm run setup:ans
```

This script will:

1. Generate `MASTER_ENCRYPTION_KEY` (64 hex chars)
2. Create Stripe products **ANS Standard** ($10/yr) + **ANS Pro** ($25/yr) via API
3. Add ANS events to your existing webhook (or show you what to add)
4. Write `STRIPE_PRICE_ID_ANS_STANDARD`, `STRIPE_PRICE_ID_ANS_PRO`, and `MASTER_ENCRYPTION_KEY` to `.env.local`

**Requirements:** `STRIPE_SECRET_KEY` in `.env.local` (from `npm run setup:stripe` or manually). If missing, the script will prompt you to paste it.

**Optional:** Cloudflare env vars for automatic DNS — see [Section 4](#4-cloudflare-dns-optional) below.

---

## Manual Setup (Fallback)

If the automated script fails or you prefer to configure manually:

---

## 1. Stripe Product and Price

ANS uses a **subscription** for domain registration. You must create a product and recurring price in Stripe.

### Steps

1. Go to [Stripe Dashboard](https://dashboard.stripe.com/products) → **Products** → **Add product**.
2. Create a product, e.g. **ANS Standard Domain**.
3. Add a **recurring** price (e.g. monthly or yearly).
4. Copy the Price ID (starts with `price_`).
5. Add to `.env.local`:
   ```bash
   STRIPE_PRICE_ID_ANS_STANDARD=price_xxxxxxxxxxxxxxxxxxxxx
   ```

Without this, the register API returns "Registration will open soon" and no checkout is created.

---

## 2. Master Encryption Key

The `agentCard` JSON and other sensitive fields are encrypted at rest using AES-256. A 64-character hex key (32 bytes) is required.

### Generate

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

Add to `.env.local`:

```bash
MASTER_ENCRYPTION_KEY=64-character-hex-string-from-above
```

**Security:**  
- Never commit this key.  
- Store securely (e.g. secrets manager in production).  
- Rotating the key requires re-encrypting existing data.

---

## 3. Stripe Webhook Events

Configure your Stripe webhook endpoint (e.g. `https://xpersona.co/api/stripe/webhook`) with these events:

| Event | Purpose |
|-------|---------|
| `checkout.session.completed` | Activates ANS domain after successful subscription checkout |
| `invoice.payment_succeeded` | Extends `expiresAt` on domain when subscription renews |
| `customer.subscription.deleted` | Marks domain as `EXPIRED` when subscription is cancelled |

Ensure `STRIPE_WEBHOOK_SECRET` is set in `.env.local`.

---

## 4. Cloudflare DNS (Optional)

If configured, the system automatically creates DNS records for new domains (*.xpersona.agent). If not configured, registration still works; users receive manual DNS instructions on the success page.

### Required env vars

| Variable | Description |
|----------|-------------|
| `CLOUDFLARE_API_TOKEN` | API token with DNS edit permissions for the zone |
| `CLOUDFLARE_ZONE_ID` | Zone ID for `xpersona.agent` |
| `CLOUDFLARE_ACCOUNT_ID` | Account ID |
| `CLOUDFLARE_ORIGIN_IP` | (Optional) Origin IP for A records, defaults to `76.76.21.21` |
| `ANS_DOMAIN` | (Optional) TLD, defaults to `xpersona.agent` |
| `ROOT_DOMAIN` | (Optional) Root domain, e.g. `xpersona.co` |

### Zone setup

1. Add the `xpersona.agent` domain to Cloudflare.
2. Create an API token with **Zone.DNS** edit rights.
3. Copy Zone ID and Account ID from the Cloudflare dashboard.
4. Add the variables to `.env.local`.

---

## 5. Vercel Cron (DNS verification)

The `/api/cron/ans-verify` job runs every 15 minutes to check DNS TXT records and set `verified: true` when they match. Add to Vercel env vars:

- `CRON_SECRET` — generate with `openssl rand -hex 32`; Vercel sends this as Bearer token when invoking the cron.

## 6. Checklist

- [ ] `DATABASE_URL` configured (PostgreSQL)
- [ ] `NEXTAUTH_URL` set (e.g. `https://xpersona.co`)
- [ ] `STRIPE_SECRET_KEY` and `STRIPE_WEBHOOK_SECRET`
- [ ] `STRIPE_PRICE_ID_ANS_STANDARD` (recurring price ID)
- [ ] `MASTER_ENCRYPTION_KEY` (64 hex chars)
- [ ] Stripe webhook with `checkout.session.completed`, `invoice.payment_succeeded`, `customer.subscription.deleted`
- [ ] (Optional) Cloudflare env vars for automatic DNS
- [ ] (Production) `CRON_SECRET` for ANS DNS verification cron

---

## 7. Promo code (AGENT100)

First 100 registrations are free with code `AGENT100`. Enter it in the "Promo code" field on the register page. When the limit is reached, the API returns "Promo code AGENT100 has reached its limit".

---

## Troubleshooting

### "Service temporarily unavailable" when searching ANS domains

This error means the `/api/ans/check` handler threw an exception. Common causes:

1. **Database not reachable**
   - Ensure `DATABASE_URL` is set in your deployment (Vercel → Project → Settings → Environment Variables).
   - For Neon: use the **pooler** connection string (host contains `-pooler`) for serverless.
   - Run migrations: `npm run db:push` or `npm run db:migrate` so `ans_domains` exists.

2. **Connection limit / timeouts**
   - On Vercel serverless, many instances can exhaust Neon's connection limit. Use the pooler URL.
   - Check Vercel function logs for the actual error: `[ANS check] Error: ...`

3. **Upstash Redis (optional)**
   - If `UPSTASH_REDIS_REST_URL` and `UPSTASH_REDIS_REST_TOKEN` are set and Redis is down, rate limiting now fails open (the check proceeds). If you see `[ANS check] Rate limit check failed, failing open`, Redis is having issues but the check still runs.
   - For local dev: `docker compose up -d` starts PostgreSQL and Redis. ANS rate limiting uses Upstash REST API in production; use an Upstash dev instance or leave unset for in-memory fallback.

---

## See also

- [STRIPE-WEBHOOK-ANS-SETUP.md](STRIPE-WEBHOOK-ANS-SETUP.md) — Step-by-step Stripe webhook setup (A–Z)
- `npm run setup:ans` — Automated setup script
- [XPERSONA ANS.MD](../XPERSONA%20ANS.MD) — Product spec and API contract
- [.env.example](../.env.example) — Full env reference

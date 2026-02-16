# Step-by-step: Connecting Stripe to xpersona.co

Follow these steps to accept credit package payments.

---

## 1. Create or log into Stripe

1. Go to [https://dashboard.stripe.com](https://dashboard.stripe.com).
2. Sign up or log in.
3. **For testing**: Turn on **Test mode** (toggle in the top-right). Use test keys and test cards until you’re ready for real payments.

---

## 2. Get your API keys

1. In the Stripe Dashboard, go to **Developers** → **API keys**.
2. Copy:
   - **Publishable key** (starts with `pk_test_` or `pk_live_`) → you’ll use this as `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` if you ever need it on the client (e.g. Elements).
   - **Secret key** (starts with `sk_test_` or `sk_live_`) → this is **STRIPE_SECRET_KEY** (required for checkout and webhook).

Keep the secret key private; never commit it to git.

---

## 3. Create products and prices (credit packages)

You need three one-time prices that match the seed script.

### Option A: Stripe Dashboard (easiest)

1. Go to **Product catalog** → **Add product**.
2. Create **Product 1** (Starter Bundle):
   - **Name**: `Starter Bundle` or `500 Credits`
   - **One-time payment**, **Price**: `$5.00`
   - Save → copy the **Price ID** (e.g. `price_1ABC...`). This is **STRIPE_PRICE_500**.
3. Create **Product 2**:
   - **Name**: `2000 Credits`
   - **One-time**, **Price**: `$14.99`
   - Copy the **Price ID** → **STRIPE_PRICE_2000**.
4. Create **Product 3**:
   - **Name**: `10000 Credits`
   - **One-time**, **Price**: `$39.99`
   - Copy the **Price ID** → **STRIPE_PRICE_10000**.

### Option B: Stripe API (optional)

You can create products/prices via API; the app expects these Price IDs to exist and to be stored in your DB (see step 6). The amounts in the seed script are 499¢, 1499¢, 3999¢ — create prices that match.

---

## 4. Add environment variables locally

In your project root, create or edit `.env.local` (and add `.env.local` to `.gitignore` if it isn’t already).

Add:

```env
# Stripe (use test keys for development)
STRIPE_SECRET_KEY=sk_test_xxxxxxxxxxxxxxxxxxxxxxxx
STRIPE_WEBHOOK_SECRET=whsec_xxxxxxxxxxxxxxxxxxxxxxxx

# Optional: only needed when seeding credit_packages (step 6)
STRIPE_PRICE_500=price_xxxxxxxxxxxxxxxx
STRIPE_PRICE_2000=price_xxxxxxxxxxxxxxxx
STRIPE_PRICE_10000=price_xxxxxxxxxxxxxxxx
```

- **STRIPE_SECRET_KEY**: from step 2 (secret key).
- **STRIPE_WEBHOOK_SECRET**: you’ll get this in step 5 when you create the webhook.
- **STRIPE_PRICE_***: the three Price IDs from step 3 (needed for seeding the DB).

---

## 5. Set up the webhook (so credits are added after payment)

The app adds credits when Stripe sends `checkout.session.completed`. For that, Stripe must call your webhook URL.

### 5a. Local development (Stripe CLI)

1. Install the [Stripe CLI](https://stripe.com/docs/stripe-cli).
2. Log in: `stripe login`.
3. Forward webhooks to your app:
   ```bash
   stripe listen --forward-to localhost:3000/api/stripe/webhook
   ```
4. The CLI will print a **webhook signing secret** (e.g. `whsec_...`). Put that in `.env.local` as **STRIPE_WEBHOOK_SECRET**.
5. Keep `stripe listen` running while you test payments locally.

### 5b. Production (xpersona.co)

1. In Stripe Dashboard go to **Developers** → **Webhooks** → **Add endpoint**.
2. **Endpoint URL**: `https://xpersona.co/api/stripe/webhook`
3. **Events to send**: select **checkout.session.completed** (or “Checkout session completed”).
4. Click **Add endpoint**.
5. Open the new endpoint → **Reveal** the **Signing secret**.
6. Add that value as **STRIPE_WEBHOOK_SECRET** in your production env (e.g. Vercel → Project → Settings → Environment variables).

---

## 6. Seed credit packages in your database

Your app reads packages from the `credit_packages` table; each row must have a valid Stripe **Price ID**.

1. Ensure **DATABASE_URL** and the three **STRIPE_PRICE_*** env vars are set (in `.env.local` or your deployment env).
2. Run migrations if you haven’t: `npm run db:push` or `npm run db:migrate`.
3. Seed packages:
   - **Local**: `npm run seed` (uses DATABASE_URL + STRIPE_PRICE_* from .env.local)
   - **Production (xpersona.co)**: Add STRIPE_PRICE_500, STRIPE_PRICE_2000, STRIPE_PRICE_10000 to Vercel env, then run `npm run db:seed-production`
   The seed script requires real Stripe Price IDs (no placeholders). Create products in Stripe Dashboard first (step 3). from your env. If you didn’t set **STRIPE_PRICE_***, the script uses placeholders — replace those with real Price IDs and re-run, or insert/update rows manually in the DB.

---

## 7. Test the flow

1. Start the app: `npm run dev`.
2. If testing locally, start the Stripe CLI: `stripe listen --forward-to localhost:3000/api/stripe/webhook`.
3. Sign in (e.g. Google), go to the dashboard, and click **Buy** on a credit package.
4. You should be redirected to Stripe Checkout. In test mode use card `4242 4242 4242 4242`, any future expiry, any CVC, any billing details.
5. After payment, Stripe sends `checkout.session.completed` to your webhook; the app adds credits and redirects to `/dashboard?success=1`. Confirm your balance increased.

---

## 8. Production checklist

- [ ] Create **live** products/prices in Stripe (or switch existing to live if you use the same structure).
- [ ] Use **live** API keys: **STRIPE_SECRET_KEY** = `sk_live_...`.
- [ ] Add production webhook endpoint `https://xpersona.co/api/stripe/webhook` and set **STRIPE_WEBHOOK_SECRET** to its signing secret.
- [ ] In Vercel (or your host), set all Stripe env vars for the production environment.
- [ ] Seed production DB with **live** Stripe Price IDs (via env or manual DB update).
- [ ] Run a test live payment (small amount) and confirm credits are added.

---

## Quick reference: env vars

| Variable | Where to get it | Required for |
|----------|-----------------|---------------|
| **STRIPE_SECRET_KEY** | Developers → API keys (Secret key) | Checkout + webhook |
| **STRIPE_WEBHOOK_SECRET** | Webhooks → endpoint → Signing secret (or `stripe listen` locally) | Webhook verification |
| **STRIPE_PRICE_500** | Product/Price “500 Credits” → Price ID | Seeding DB |
| **STRIPE_PRICE_2000** | Product/Price “2000 Credits” → Price ID | Seeding DB |
| **STRIPE_PRICE_10000** | Product/Price “10000 Credits” → Price ID | Seeding DB |

If anything fails, check: correct keys (test vs live), webhook URL and event type, and that metadata (`userId`, `packageId`, `credits`) is sent on the Checkout Session (the app already sets this in `checkout/route.ts`).

---

## How the integration works

```
User clicks "Get 500 credits"  →  POST /api/credits/checkout { packageId }
       ↓
Checkout API creates Stripe Session with metadata: { userId, credits: "500" }
       ↓
User is redirected to Stripe Checkout (hosted by Stripe)
       ↓
User pays  →  Stripe sends checkout.session.completed to /api/stripe/webhook
       ↓
Webhook reads metadata.userId + metadata.credits  →  Adds credits to user in DB
       ↓
User is redirected back to /dashboard/deposit?success=1
```

**Important**: Do not use Stripe Payment Links directly. They do not include `userId` in metadata, so the webhook cannot credit the correct user. Always use the app's checkout flow (`/api/credits/checkout`).

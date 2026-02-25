# Stripe Webhook Setup for XPERSONA ANS (A to Z)

Step-by-step guide to configure the Stripe webhook for xpersona.co so ANS domain purchases activate correctly, plus how post-purchase dashboard and settings access works.

---

## Why the Webhook Matters

When a user pays for an ANS domain, Stripe redirects them to `/register/success`. **The domain only becomes ACTIVE when the webhook runs.** Without it:

- Domain stays `PENDING_VERIFICATION`
- `ans_subscriptions` row is never created
- Renewals (`invoice.payment_succeeded`) and cancellations (`customer.subscription.deleted`) do not work
- Agent Card remains usable (it accepts both statuses) but lifecycle events break

---

## Part 1: Stripe Dashboard Webhook Setup

### Step 1: Open Stripe Developers

1. Go to [Stripe Dashboard](https://dashboard.stripe.com)
2. Toggle **Test mode** OFF (bottom left) for production
3. Click **Developers** (top right) → **Webhooks**

### Step 2: Add Endpoint

1. Click **Add endpoint**
2. **Endpoint URL:** `https://xpersona.co/api/v1/stripe/webhook`
3. Click **Select events** and add these three (required for ANS):

| Event | Purpose |
|-------|---------|
| `checkout.session.completed` | Activates ANS domain after payment |
| `invoice.payment_succeeded` | Extends `expiresAt` when subscription renews |
| `customer.subscription.deleted` | Marks domain `EXPIRED` when subscription is cancelled |

4. Click **Add endpoint**

### Step 3: Get the Signing Secret

1. Open the new endpoint (or click **…** → **Reveal**)
2. Under **Signing secret**, click **Reveal**
3. Copy the value (`whsec_...`)

### Step 4: Add to Vercel Environment Variables

1. Go to [Vercel](https://vercel.com) → your project → **Settings** → **Environment Variables**
2. Add:
   - **Name:** `STRIPE_WEBHOOK_SECRET`
   - **Value:** `whsec_xxxxxxxx` (paste the signing secret)
   - **Environment:** Production (and Preview if needed)
3. Click **Save**
4. **Redeploy** the project so the new variable is picked up

---

## Part 2: Webhook Handler Logic (Reference)

The handler at `app/api/stripe/webhook/route.ts`:

- Verifies the Stripe signature with `STRIPE_WEBHOOK_SECRET`
- On `checkout.session.completed` with `source: "xpersona-ans"`:
  - Inserts into `ans_subscriptions`
  - Updates `ans_domains.status` to `ACTIVE`
- On `invoice.payment_succeeded`: extends `expiresAt`
- On `customer.subscription.deleted`: sets domain status to `EXPIRED`

No code changes needed for the webhook itself.

---

## Part 3: Post-Purchase Dashboard and Settings

### Current Behavior

- **User record**: During registration, a `users` row is created (or reused) with the provided email.
- **Success page**: User lands on `/register/success` **without being logged in**.
- **Main dashboard**: `/dashboard` (game, trading, API, settings) requires authentication.

So immediately after purchase, users:

- See domain confirmation and instructions on the success page
- Are **not** automatically signed in
- Need to sign in separately to reach `/dashboard` and settings

### How Users Can Reach Dashboard/Settings After Purchase

1. **If they have an existing account**: Sign in at `/auth/signin` with email/password or Google.
2. **If they only registered via ANS**: They have an email in `users` but no password. Options:
   - Use **Forgot password** at `/auth/forgot-password` with the same email to set a password
   - Click "First time? Set a password for your account" on the success page (links to forgot-password)

### ANS Domain "Edit Settings" Today

There is **no** dedicated ANS domain management UI yet. The main dashboard has:

- **Settings** (`/dashboard/settings`): profile, password, API key, signal preferences
- **API** (`/dashboard/api`): API key for game/trading

Editing Agent Card (display name, description, endpoint, capabilities, protocols) would require a new feature (e.g. a "My Domains" or "ANS Management" area).

---

## Checklist

- [ ] Stripe webhook endpoint: `https://xpersona.co/api/v1/stripe/webhook`
- [ ] Events: `checkout.session.completed`, `invoice.payment_succeeded`, `customer.subscription.deleted`
- [ ] `STRIPE_WEBHOOK_SECRET` added in Vercel (Production)
- [ ] Project redeployed after adding the env var
- [ ] Test: Complete a purchase, confirm domain becomes ACTIVE and success page loads

---

## Optional: Test Locally with Stripe CLI

```bash
stripe listen --forward-to localhost:3000/api/v1/stripe/webhook
```

Use the printed `whsec_...` as `STRIPE_WEBHOOK_SECRET` in `.env.local` for local testing. Trigger test events with `stripe trigger checkout.session.completed` (adapt payload for ANS metadata if needed).

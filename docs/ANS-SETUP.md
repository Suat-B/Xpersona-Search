# ANS Setup Guide

This guide covers how to configure the Agent Name Service (ANS) for `.xpersona.agent` domain registration on xpersona.co.

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

## 5. Checklist

- [ ] `DATABASE_URL` configured (PostgreSQL)
- [ ] `NEXTAUTH_URL` set (e.g. `https://xpersona.co`)
- [ ] `STRIPE_SECRET_KEY` and `STRIPE_WEBHOOK_SECRET`
- [ ] `STRIPE_PRICE_ID_ANS_STANDARD` (recurring price ID)
- [ ] `MASTER_ENCRYPTION_KEY` (64 hex chars)
- [ ] Stripe webhook with `checkout.session.completed`, `invoice.payment_succeeded`, `customer.subscription.deleted`
- [ ] (Optional) Cloudflare env vars for automatic DNS

---

## See also

- [XPERSONA ANS.MD](../XPERSONA%20ANS.MD) — Product spec and API contract
- [.env.example](../.env.example) — Full env reference

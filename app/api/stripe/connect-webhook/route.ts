import { NextResponse } from "next/server";
import Stripe from "stripe";
import { db } from "@/lib/db";
import { marketplaceDevelopers } from "@/lib/db/schema";
import { eq } from "drizzle-orm";

function getStripe() {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) throw new Error("STRIPE_SECRET_KEY not set");
  return new Stripe(key, { apiVersion: "2025-02-24.acacia" });
}

/**
 * POST /api/stripe/connect-webhook
 * Handles Stripe Connect events (account.updated).
 * Configure this URL in Stripe Dashboard > Connect > Webhooks.
 * Uses STRIPE_CONNECT_WEBHOOK_SECRET (or STRIPE_WEBHOOK_SECRET if Connect secret not set).
 */
export async function POST(request: Request) {
  const webhookSecret =
    process.env.STRIPE_CONNECT_WEBHOOK_SECRET?.trim() || process.env.STRIPE_WEBHOOK_SECRET?.trim();
  if (!webhookSecret) {
    console.error("STRIPE_CONNECT_WEBHOOK_SECRET or STRIPE_WEBHOOK_SECRET not set");
    return NextResponse.json({ error: "Webhook not configured" }, { status: 500 });
  }

  let rawBody: string;
  try {
    rawBody = await request.text();
  } catch {
    return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  }

  const sig = request.headers.get("stripe-signature");
  if (!sig) {
    return NextResponse.json({ error: "Missing signature" }, { status: 400 });
  }

  let event: Stripe.Event;
  try {
    event = getStripe().webhooks.constructEvent(rawBody, sig, webhookSecret);
  } catch (err) {
    console.error("Stripe Connect webhook signature verification failed:", err);
    return NextResponse.json({ error: "Invalid signature" }, { status: 400 });
  }

  if (event.type === "account.updated") {
    const account = event.data.object as Stripe.Account;
    const chargesEnabled = account.charges_enabled === true;

    if (chargesEnabled && account.id) {
      await db
        .update(marketplaceDevelopers)
        .set({
          stripeOnboardingComplete: true,
          updatedAt: new Date(),
        })
        .where(eq(marketplaceDevelopers.stripeAccountId, account.id));
    }
  }

  return NextResponse.json({ received: true });
}

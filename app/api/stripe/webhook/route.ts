import { NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { economyEscrows, marketplaceDevelopers } from "@/lib/db/schema";
import {
  ensureWebhookEventNotProcessed,
  getConnectStatus,
  markEscrowFundedByPaymentIntent,
} from "@/lib/economy/payments";
import { requireStripe } from "@/lib/stripe";

export async function POST(request: NextRequest) {
  const stripe = requireStripe();
  const signature = request.headers.get("stripe-signature");
  if (!signature) {
    return NextResponse.json({ success: false, error: "MISSING_STRIPE_SIGNATURE" }, { status: 400 });
  }

  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!webhookSecret) {
    return NextResponse.json({ success: false, error: "STRIPE_WEBHOOK_NOT_CONFIGURED" }, { status: 500 });
  }

  const payload = await request.text();

  let event;
  try {
    event = stripe.webhooks.constructEvent(payload, signature, webhookSecret);
  } catch (err) {
    return NextResponse.json({ success: false, error: "INVALID_STRIPE_SIGNATURE", message: String(err) }, { status: 400 });
  }

  const fresh = await ensureWebhookEventNotProcessed(event.id, event.type, event.data.object);
  if (!fresh) {
    return NextResponse.json({ success: true, data: { deduped: true } });
  }

  try {
    if (event.type === "payment_intent.succeeded") {
      const pi = event.data.object as { id: string };
      await markEscrowFundedByPaymentIntent(pi.id);
    }

    if (event.type === "charge.refunded") {
      const charge = event.data.object as { payment_intent?: string | null };
      const piId = charge.payment_intent ?? null;
      if (piId) {
        const [escrow] = await db
          .select()
          .from(economyEscrows)
          .where(eq(economyEscrows.stripePaymentIntentId, piId))
          .limit(1);
        if (escrow && escrow.status !== "REFUNDED") {
          await db
            .update(economyEscrows)
            .set({ status: "REFUNDED", refundedAt: new Date(), updatedAt: new Date() })
            .where(eq(economyEscrows.id, escrow.id));
        }
      }
    }

    if (event.type === "account.updated") {
      const account = event.data.object as { id: string };
      const [developer] = await db
        .select()
        .from(marketplaceDevelopers)
        .where(eq(marketplaceDevelopers.stripeAccountId, account.id))
        .limit(1);

      if (developer) {
        const status = await getConnectStatus(account.id);
        await db
          .update(marketplaceDevelopers)
          .set({ stripeOnboardingComplete: status.onboardingComplete, updatedAt: new Date() })
          .where(eq(marketplaceDevelopers.id, developer.id));
      }
    }

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("[stripe/webhook]", err);
    return NextResponse.json({ success: false, error: "WEBHOOK_PROCESSING_FAILED" }, { status: 500 });
  }
}
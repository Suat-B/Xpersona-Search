import { NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import type Stripe from "stripe";
import { db } from "@/lib/db";
import { economyEscrows, marketplaceDevelopers, users } from "@/lib/db/schema";
import { playgroundSubscriptions } from "@/lib/db/playground-schema";
import {
  ensureWebhookEventNotProcessed,
  getConnectStatus,
  markEscrowFundedByPaymentIntent,
} from "@/lib/economy/payments";
import { requireStripe } from "@/lib/stripe";

type PlaygroundSubStatus = "active" | "trial" | "past_due" | "cancelled";

function mapPlaygroundStatus(status: Stripe.Subscription.Status): PlaygroundSubStatus {
  if (status === "trialing") return "trial";
  if (status === "active") return "active";
  if (status === "past_due" || status === "unpaid" || status === "incomplete") return "past_due";
  return "cancelled";
}

function toDate(unixSeconds?: number | null): Date | null {
  if (!unixSeconds || unixSeconds <= 0) return null;
  return new Date(unixSeconds * 1000);
}

async function resolveUserIdForPlaygroundSubscription(subscription: Stripe.Subscription): Promise<string | null> {
  const metadataUserId = subscription.metadata?.xpersona_user_id;
  if (metadataUserId) return metadataUserId;

  const customerId =
    typeof subscription.customer === "string"
      ? subscription.customer
      : subscription.customer?.id;
  if (!customerId) return null;

  const [user] = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.stripeCustomerId, customerId))
    .limit(1);

  return user?.id ?? null;
}

async function upsertPlaygroundSubscriptionFromStripe(subscription: Stripe.Subscription) {
  const userId = await resolveUserIdForPlaygroundSubscription(subscription);
  if (!userId) return;

  const customerId =
    typeof subscription.customer === "string"
      ? subscription.customer
      : subscription.customer?.id || null;

  const mappedStatus = mapPlaygroundStatus(subscription.status);
  const trialEndsAt = toDate(subscription.trial_end);
  const trialStartsAt = toDate(subscription.trial_start);
  const subAny = subscription as unknown as {
    current_period_start?: number | null;
    current_period_end?: number | null;
  };
  const currentPeriodStart = toDate(subAny.current_period_start);
  const currentPeriodEnd = toDate(subAny.current_period_end);

  const payload = {
    stripeCustomerId: customerId,
    stripeSubscriptionId: subscription.id,
    planTier: mappedStatus === "trial" ? ("trial" as const) : ("paid" as const),
    status: mappedStatus,
    trialStartedAt: trialStartsAt,
    trialEndsAt,
    currentPeriodStart,
    currentPeriodEnd,
    cancelAtPeriodEnd: subscription.cancel_at_period_end ?? false,
    updatedAt: new Date(),
  };

  const [existing] = await db
    .select({ id: playgroundSubscriptions.id })
    .from(playgroundSubscriptions)
    .where(eq(playgroundSubscriptions.userId, userId))
    .limit(1);

  if (existing) {
    await db
      .update(playgroundSubscriptions)
      .set(payload)
      .where(eq(playgroundSubscriptions.id, existing.id));
    return;
  }

  await db.insert(playgroundSubscriptions).values({
    userId,
    ...payload,
    createdAt: new Date(),
  });
}

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

    if (event.type === "checkout.session.completed") {
      const session = event.data.object as Stripe.Checkout.Session;
      if (session.mode === "subscription" && session.subscription) {
        const subId =
          typeof session.subscription === "string"
            ? session.subscription
            : session.subscription.id;
        if (subId) {
          const subscription = await stripe.subscriptions.retrieve(subId);
          const isPlayground =
            subscription.metadata?.xpersona_product === "playground_ai" ||
            session.metadata?.xpersona_product === "playground_ai";
          if (isPlayground) {
            await upsertPlaygroundSubscriptionFromStripe(subscription);
          }
        }
      }
    }

    if (
      event.type === "customer.subscription.created" ||
      event.type === "customer.subscription.updated" ||
      event.type === "customer.subscription.deleted"
    ) {
      const subscription = event.data.object as Stripe.Subscription;
      if (subscription.metadata?.xpersona_product === "playground_ai") {
        await upsertPlaygroundSubscriptionFromStripe(subscription);
      }
    }

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("[stripe/webhook]", err);
    return NextResponse.json({ success: false, error: "WEBHOOK_PROCESSING_FAILED" }, { status: 500 });
  }
}

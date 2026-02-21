import { NextResponse } from "next/server";
import Stripe from "stripe";
import { db } from "@/lib/db";
import {
  stripeEvents,
  users,
  deposits,
  marketplaceStrategies,
  marketplaceDevelopers,
  marketplaceSubscriptions,
  ansDomains,
  ansSubscriptions,
} from "@/lib/db/schema";
import { eq } from "drizzle-orm";

function getStripe() {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) throw new Error("STRIPE_SECRET_KEY not set");
  return new Stripe(key, { apiVersion: "2025-02-24.acacia" });
}

export async function POST(request: Request) {
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!webhookSecret) {
    console.error("STRIPE_WEBHOOK_SECRET not set");
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
    console.error("Stripe webhook signature verification failed:", err);
    return NextResponse.json({ error: "Invalid signature" }, { status: 400 });
  }
  if (event.type === "checkout.session.completed") {
    const session = event.data.object as Stripe.Checkout.Session;
    const userId = session.metadata?.userId;
    const creditsStr = session.metadata?.credits;
    const strategyId = session.metadata?.strategyId;
    const source = session.metadata?.source;
    const domainId = session.metadata?.domainId;

    if (source === "xpersona-ans" && session.mode === "subscription" && domainId && userId) {
      const subId = typeof session.subscription === "string" ? session.subscription : session.subscription?.id;
      if (subId) {
        try {
          const [existing] = await db
            .select({ id: ansSubscriptions.id })
            .from(ansSubscriptions)
            .where(eq(ansSubscriptions.stripeSubscriptionId, subId))
            .limit(1);

          if (!existing) {
            const sub = await getStripe().subscriptions.retrieve(subId);
            await db.insert(ansSubscriptions).values({
              stripeSubscriptionId: subId,
              userId,
              domainId,
              status: "ACTIVE",
              currentPeriodStart: new Date((sub.current_period_start as number) * 1000),
              currentPeriodEnd: new Date((sub.current_period_end as number) * 1000),
            });
          }
          await db
            .update(ansDomains)
            .set({ status: "ACTIVE" })
            .where(eq(ansDomains.id, domainId));
        } catch (ansErr: unknown) {
          const msg = ansErr && typeof (ansErr as Error).message === "string" ? (ansErr as Error).message : "";
          if (!msg.includes("unique") && !msg.includes("duplicate")) {
            console.error("[webhook] ANS subscription insert:", ansErr);
          }
        }
      }
      return NextResponse.json({ received: true });
    }

    if (session.mode === "subscription" && strategyId && userId) {
      const subId = typeof session.subscription === "string" ? session.subscription : session.subscription?.id;
      if (subId) {
        try {
          await db.insert(marketplaceSubscriptions).values({
            userId,
            strategyId,
            stripeSubscriptionId: subId,
            status: "active",
          });
          const [strategy] = await db
            .select({ developerId: marketplaceStrategies.developerId })
            .from(marketplaceStrategies)
            .where(eq(marketplaceStrategies.id, strategyId))
            .limit(1);
          if (strategy) {
            const [dev] = await db
              .select({ subscriberCount: marketplaceDevelopers.subscriberCount })
              .from(marketplaceDevelopers)
              .where(eq(marketplaceDevelopers.id, strategy.developerId))
              .limit(1);
            const nextCount = (dev?.subscriberCount ?? 0) + 1;
            await db
              .update(marketplaceDevelopers)
              .set({ subscriberCount: nextCount, updatedAt: new Date() })
              .where(eq(marketplaceDevelopers.id, strategy.developerId));
          }
        } catch (insertErr: unknown) {
          const msg = insertErr && typeof (insertErr as Error).message === "string" ? (insertErr as Error).message : "";
          if (!msg.includes("unique") && !msg.includes("duplicate")) {
            console.error("[webhook] marketplace subscription insert:", insertErr);
          }
        }
      }
      return NextResponse.json({ received: true });
    }

    if (!userId || !creditsStr) {
      console.error("Webhook missing metadata userId or credits", event.id);
      return NextResponse.json({ received: true });
    }
    const credits = parseInt(creditsStr, 10);
    if (Number.isNaN(credits) || credits <= 0) {
      console.error("Invalid credits in metadata", creditsStr);
      return NextResponse.json({ received: true });
    }
    try {
      await db.insert(stripeEvents).values({
        stripeEventId: event.id,
        type: event.type,
        payload: event as unknown as Record<string, unknown>,
      });
    } catch (insertErr: unknown) {
      const msg = insertErr && typeof (insertErr as Error).message === "string" ? (insertErr as Error).message : "";
      if (msg.includes("unique") || msg.includes("duplicate")) {
        return NextResponse.json({ received: true });
      }
      throw insertErr;
    }
    const [user] = await db.select({ credits: users.credits }).from(users).where(eq(users.id, userId)).limit(1);
    if (user) {
      await db.transaction(async (tx) => {
        await tx.insert(deposits).values({
          userId,
          credits,
          stripeEventId: event.id,
          stripeSessionId: session.id ?? undefined,
        });
        await tx
          .update(users)
          .set({ credits: user.credits + credits })
          .where(eq(users.id, userId));
      });
    }
  }

  if (event.type === "invoice.payment_succeeded") {
    const invoice = event.data.object as Stripe.Invoice;
    const subId = invoice.subscription;
    if (typeof subId === "string" && subId) {
      try {
        const [sub] = await db
          .select({
            domainId: ansSubscriptions.domainId,
            id: ansSubscriptions.id,
          })
          .from(ansSubscriptions)
          .where(eq(ansSubscriptions.stripeSubscriptionId, subId))
          .limit(1);
        if (sub) {
          const stripeSub = await getStripe().subscriptions.retrieve(subId);
          const periodEnd = new Date((stripeSub.current_period_end as number) * 1000);
          await db
            .update(ansSubscriptions)
            .set({ currentPeriodEnd: periodEnd, updatedAt: new Date() })
            .where(eq(ansSubscriptions.id, sub.id));
          await db
            .update(ansDomains)
            .set({ expiresAt: periodEnd })
            .where(eq(ansDomains.id, sub.domainId));
        }
      } catch (ansErr) {
        console.warn("[webhook] ANS invoice.payment_succeeded:", ansErr);
      }
    }
  }

  if (event.type === "customer.subscription.deleted") {
    const subscription = event.data.object as Stripe.Subscription;
    const subId = subscription.id;
    try {
      const [sub] = await db
        .select({ id: ansSubscriptions.id, domainId: ansSubscriptions.domainId })
        .from(ansSubscriptions)
        .where(eq(ansSubscriptions.stripeSubscriptionId, subId))
        .limit(1);
      if (sub) {
        await db
          .update(ansSubscriptions)
          .set({ status: "CANCELED", updatedAt: new Date() })
          .where(eq(ansSubscriptions.id, sub.id));
        await db
          .update(ansDomains)
          .set({ status: "EXPIRED" })
          .where(eq(ansDomains.id, sub.domainId));
      }
    } catch (ansErr) {
      console.warn("[webhook] ANS subscription.deleted:", ansErr);
    }
  }

  return NextResponse.json({ received: true });
}

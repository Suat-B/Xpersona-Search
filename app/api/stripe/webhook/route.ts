import { NextResponse } from "next/server";
import Stripe from "stripe";
import { db } from "@/lib/db";
import { stripeEvents, users, deposits } from "@/lib/db/schema";
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
  return NextResponse.json({ received: true });
}

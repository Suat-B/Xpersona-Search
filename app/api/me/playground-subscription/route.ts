import { NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { getAuthUser } from "@/lib/auth-utils";
import { db } from "@/lib/db";
import { playgroundSubscriptions } from "@/lib/db/playground-schema";
import { users } from "@/lib/db/schema";
import { requireStripe } from "@/lib/stripe";

type PlaygroundSubStatus = "active" | "trial" | "past_due" | "cancelled";

const actionSchema = z.object({
  action: z.enum(["portal", "cancel", "resume"]),
});

function mapPlaygroundStatus(status: string): PlaygroundSubStatus {
  if (status === "trialing") return "trial";
  if (status === "active") return "active";
  if (status === "past_due" || status === "unpaid" || status === "incomplete") return "past_due";
  return "cancelled";
}

function toDate(unixSeconds?: number | null): Date | null {
  if (!unixSeconds || unixSeconds <= 0) return null;
  return new Date(unixSeconds * 1000);
}

function getBaseUrl() {
  return (
    process.env.NEXT_PUBLIC_APP_URL ||
    process.env.NEXTAUTH_URL ||
    (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : "http://localhost:3000")
  );
}

export async function POST(request: NextRequest): Promise<Response> {
  try {
    const authResult = await getAuthUser(request);
    if ("error" in authResult) {
      return NextResponse.json(
        { success: false, error: "UNAUTHORIZED", message: "Sign in required" },
        { status: 401 }
      );
    }

    const parsed = actionSchema.safeParse(await request.json().catch(() => ({})));
    if (!parsed.success) {
      return NextResponse.json(
        { success: false, error: "INVALID_BODY", message: "action is required" },
        { status: 400 }
      );
    }

    const stripe = requireStripe();
    const { user } = authResult;
    const { action } = parsed.data;

    const [sub] = await db
      .select({
        id: playgroundSubscriptions.id,
        planTier: playgroundSubscriptions.planTier,
        stripeCustomerId: playgroundSubscriptions.stripeCustomerId,
        stripeSubscriptionId: playgroundSubscriptions.stripeSubscriptionId,
      })
      .from(playgroundSubscriptions)
      .where(eq(playgroundSubscriptions.userId, user.id))
      .limit(1);

    if (!sub) {
      return NextResponse.json(
        { success: false, error: "SUBSCRIPTION_NOT_FOUND", message: "No playground subscription found" },
        { status: 404 }
      );
    }

    let customerId = sub.stripeCustomerId;
    if (!customerId) {
      const [dbUser] = await db
        .select({ stripeCustomerId: users.stripeCustomerId })
        .from(users)
        .where(eq(users.id, user.id))
        .limit(1);
      customerId = dbUser?.stripeCustomerId ?? null;
    }

    if (action === "portal") {
      if (!customerId) {
        return NextResponse.json(
          { success: false, error: "CUSTOMER_NOT_FOUND", message: "Stripe customer not found for this account" },
          { status: 400 }
        );
      }

      const session = await stripe.billingPortal.sessions.create({
        customer: customerId,
        return_url: `${getBaseUrl()}/dashboard/playground`,
      });

      return NextResponse.json({
        success: true,
        data: { url: session.url },
      });
    }

    if (!sub.stripeSubscriptionId) {
      return NextResponse.json(
        { success: false, error: "STRIPE_SUBSCRIPTION_NOT_FOUND", message: "Stripe subscription is missing" },
        { status: 400 }
      );
    }

    const updated = await stripe.subscriptions.update(sub.stripeSubscriptionId, {
      cancel_at_period_end: action === "cancel",
    });

    const nextStatus = mapPlaygroundStatus(updated.status);
    const payload = {
      status: nextStatus,
      planTier: nextStatus === "trial" ? ("trial" as const) : ((sub.planTier === "starter" || sub.planTier === "builder" || sub.planTier === "studio") ? sub.planTier : "builder"),
      cancelAtPeriodEnd: updated.cancel_at_period_end ?? false,
      currentPeriodStart: toDate((updated as { current_period_start?: number | null }).current_period_start),
      currentPeriodEnd: toDate((updated as { current_period_end?: number | null }).current_period_end),
      updatedAt: new Date(),
    };

    await db
      .update(playgroundSubscriptions)
      .set(payload)
      .where(eq(playgroundSubscriptions.id, sub.id));

    return NextResponse.json({
      success: true,
      data: {
        status: payload.status,
        cancelAtPeriodEnd: payload.cancelAtPeriodEnd,
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to manage subscription";
    return NextResponse.json(
      { success: false, error: "PLAYGROUND_SUBSCRIPTION_ACTION_FAILED", message },
      { status: 500 }
    );
  }
}

import { NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { authenticatePlaygroundApiKey } from "@/lib/playground/auth";
import { db } from "@/lib/db";
import { playgroundSubscriptions } from "@/lib/db/playground-schema";
import { users } from "@/lib/db/schema";
import { requireStripe } from "@/lib/stripe";

const checkoutSchema = z.object({
  tier: z.enum(["starter", "builder", "studio"]).default("builder"),
  billing: z.enum(["monthly", "yearly"]).default("monthly"),
});

function getBaseUrl() {
  return (
    process.env.NEXT_PUBLIC_APP_URL ||
    process.env.NEXTAUTH_URL ||
    (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : "http://localhost:3000")
  );
}

function getPriceId(tier: "starter" | "builder" | "studio", billing: "monthly" | "yearly"): string | null {
  const key = `STRIPE_PLAYGROUND_PRICE_ID_${tier.toUpperCase()}_${billing.toUpperCase()}` as const;
  const exact = process.env[key];
  if (exact && exact.trim().length > 0) return exact;

  // Backward compatibility: older setups only provide STRIPE_PLAYGROUND_PRICE_ID.
  if (tier === "builder" && billing === "monthly") {
    const legacy = process.env.STRIPE_PLAYGROUND_PRICE_ID;
    if (legacy && legacy.trim().length > 0) return legacy;
  }

  return null;
}

export async function POST(request: NextRequest): Promise<Response> {
  try {
    const auth = await authenticatePlaygroundApiKey(request);
    if (!auth) {
      return NextResponse.json(
        { success: false, error: "UNAUTHORIZED", message: "Invalid or missing API key" },
        { status: 401 }
      );
    }

    const parsed = checkoutSchema.safeParse(await request.json().catch(() => ({})));
    if (!parsed.success) {
      return NextResponse.json(
        { success: false, error: "INVALID_BODY", message: "tier and billing are required" },
        { status: 400 }
      );
    }

    const { tier, billing } = parsed.data;
    const priceId = getPriceId(tier, billing);
    if (!priceId) {
      return NextResponse.json(
        { success: false, error: "PLAYGROUND_PRICE_NOT_CONFIGURED", message: `Missing Stripe price for ${tier}/${billing}` },
        { status: 500 }
      );
    }

    const [dbUser] = await db
      .select({
        id: users.id,
        email: users.email,
        stripeCustomerId: users.stripeCustomerId,
      })
      .from(users)
      .where(eq(users.id, auth.userId))
      .limit(1);

    const [existingSub] = await db
      .select({
        stripeSubscriptionId: playgroundSubscriptions.stripeSubscriptionId,
        status: playgroundSubscriptions.status,
      })
      .from(playgroundSubscriptions)
      .where(eq(playgroundSubscriptions.userId, auth.userId))
      .limit(1);

    if (!dbUser?.email) {
      return NextResponse.json(
        { success: false, error: "USER_EMAIL_REQUIRED", message: "User email is required for checkout" },
        { status: 400 }
      );
    }

    const stripe = requireStripe();
    const hasExistingStripeSub =
      !!existingSub?.stripeSubscriptionId &&
      existingSub.status !== "cancelled";

    let customerId = dbUser.stripeCustomerId ?? null;
    if (!customerId) {
      const customer = await stripe.customers.create({
        email: dbUser.email,
        metadata: {
          xpersona_user_id: dbUser.id,
        },
      });
      customerId = customer.id;
      await db
        .update(users)
        .set({ stripeCustomerId: customer.id })
        .where(eq(users.id, dbUser.id));
    }

    const baseUrl = getBaseUrl();
    if (hasExistingStripeSub) {
      const portal = await stripe.billingPortal.sessions.create({
        customer: customerId,
        return_url: `${baseUrl}/dashboard/playground`,
      });

      return NextResponse.json({
        success: true,
        data: {
          url: portal.url,
          mode: "manage_existing_subscription",
        },
      });
    }

    const session = await stripe.checkout.sessions.create({
      mode: "subscription",
      customer: customerId,
      line_items: [{ price: priceId, quantity: 1 }],
      success_url: `${baseUrl}/dashboard/playground?checkout=success`,
      cancel_url: `${baseUrl}/dashboard/playground?checkout=cancelled`,
      allow_promotion_codes: true,
      payment_method_collection: "always",
      client_reference_id: dbUser.id,
      metadata: {
        xpersona_product: "playground_ai",
        xpersona_user_id: dbUser.id,
        xpersona_tier: tier,
        xpersona_billing: billing,
        source: "playground_cli",
      },
      subscription_data: {
        trial_period_days: 2,
        metadata: {
          xpersona_product: "playground_ai",
          xpersona_user_id: dbUser.id,
          source: "playground_cli",
        },
        trial_settings: {
          end_behavior: {
            missing_payment_method: "cancel",
          },
        },
      },
    });

    if (!session.url) {
      return NextResponse.json(
        { success: false, error: "CHECKOUT_URL_MISSING", message: "Stripe checkout session did not return a URL" },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      data: {
        url: session.url,
        sessionId: session.id,
        trialDays: 2,
        tier,
        billing,
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to create checkout link";
    return NextResponse.json(
      { success: false, error: "PLAYGROUND_CHECKOUT_LINK_FAILED", message },
      { status: 500 }
    );
  }
}

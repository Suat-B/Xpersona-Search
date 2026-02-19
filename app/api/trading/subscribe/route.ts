import { NextResponse } from "next/server";
import { getAuthUser } from "@/lib/auth-utils";
import { db } from "@/lib/db";
import { marketplaceStrategies, marketplaceDevelopers, marketplaceSubscriptions } from "@/lib/db/schema";
import { eq, and } from "drizzle-orm";
import Stripe from "stripe";

function getStripe(): Stripe | null {
  const key = process.env.STRIPE_SECRET_KEY?.trim();
  if (!key || key.length < 10) return null;
  return new Stripe(key, { apiVersion: "2025-02-24.acacia" });
}

/**
 * POST /api/trading/subscribe
 * Create Stripe Checkout session for strategy subscription (destination charge).
 */
export async function POST(request: Request) {
  try {
    const authResult = await getAuthUser(request as never);
    if ("error" in authResult) {
      return NextResponse.json({ success: false, error: authResult.error }, { status: 401 });
    }

    const body = await request.json().catch(() => ({}));
    const strategyId = (body?.strategyId ?? "").toString().trim();
    if (!strategyId) {
      return NextResponse.json(
        { success: false, error: "VALIDATION_ERROR", message: "strategyId required" },
        { status: 400 }
      );
    }

    const [row] = await db
      .select({
        id: marketplaceStrategies.id,
        name: marketplaceStrategies.name,
        description: marketplaceStrategies.description,
        priceMonthlyCents: marketplaceStrategies.priceMonthlyCents,
        platformFeePercent: marketplaceStrategies.platformFeePercent,
        isActive: marketplaceStrategies.isActive,
        stripeAccountId: marketplaceDevelopers.stripeAccountId,
      })
      .from(marketplaceStrategies)
      .innerJoin(marketplaceDevelopers, eq(marketplaceStrategies.developerId, marketplaceDevelopers.id))
      .where(
        and(
          eq(marketplaceStrategies.id, strategyId),
          eq(marketplaceStrategies.isActive, true)
        )
      )
      .limit(1);

    if (!row) {
      return NextResponse.json(
        { success: false, error: "NOT_FOUND", message: "Strategy not found or inactive" },
        { status: 404 }
      );
    }

    if (!row.stripeAccountId) {
      return NextResponse.json(
        { success: false, error: "STRIPE_MISCONFIGURED", message: "Developer account not configured" },
        { status: 503 }
      );
    }

    const [existing] = await db
      .select()
      .from(marketplaceSubscriptions)
      .where(
        and(
          eq(marketplaceSubscriptions.userId, authResult.user.id),
          eq(marketplaceSubscriptions.strategyId, strategyId),
          eq(marketplaceSubscriptions.status, "active")
        )
      )
      .limit(1);

    if (existing) {
      return NextResponse.json(
        { success: false, error: "ALREADY_SUBSCRIBED", message: "You already subscribe to this strategy" },
        { status: 400 }
      );
    }

    const stripe = getStripe();
    if (!stripe) {
      return NextResponse.json(
        { success: false, error: "STRIPE_MISCONFIGURED", message: "Payment provider not configured" },
        { status: 503 }
      );
    }

    const baseUrl = process.env.NEXTAUTH_URL ?? "https://xpersona.co";

    const session = await stripe.checkout.sessions.create({
      mode: "subscription",
      line_items: [
        {
          price_data: {
            currency: "usd",
            product_data: {
              name: row.name,
              description: (row.description ?? "Strategy subscription").slice(0, 500),
            },
            unit_amount: row.priceMonthlyCents,
            recurring: { interval: "month" },
          },
          quantity: 1,
        },
      ],
      subscription_data: {
        application_fee_percent: row.platformFeePercent,
        transfer_data: { destination: row.stripeAccountId },
        metadata: {
          strategyId,
          userId: authResult.user.id,
        },
      },
      success_url: `${baseUrl}/trading/success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${baseUrl}/trading/cancel`,
      client_reference_id: authResult.user.id,
      metadata: {
        strategyId,
        userId: authResult.user.id,
      },
      allow_promotion_codes: true,
    });

    return NextResponse.json({
      success: true,
      data: { url: session.url },
    });
  } catch (err: unknown) {
    if (err && typeof err === "object" && "type" in err && (err as { type?: string }).type?.startsWith("Stripe")) {
      const stripeErr = err as { message?: string };
      return NextResponse.json(
        { success: false, error: "STRIPE_ERROR", message: stripeErr.message ?? "Stripe error" },
        { status: 502 }
      );
    }
    console.error("[trading/subscribe]", err);
    return NextResponse.json(
      { success: false, error: "INTERNAL_ERROR", message: "Checkout failed. Please try again." },
      { status: 500 }
    );
  }
}

import { NextResponse } from "next/server";
import { getAuthUser } from "@/lib/auth-utils";
import { db } from "@/lib/db";
import { marketplaceDevelopers } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import Stripe from "stripe";

function getStripe(): Stripe | null {
  const key = process.env.STRIPE_SECRET_KEY?.trim();
  if (!key || key.length < 10) return null;
  return new Stripe(key, { apiVersion: "2025-02-24.acacia" });
}

/**
 * POST /api/trading/developer/onboard
 * Create Stripe Connect Express account (or get new link if exists) and return onboarding URL.
 */
export async function POST(request: Request) {
  try {
    const authResult = await getAuthUser(request as never);
    if ("error" in authResult) {
      return NextResponse.json({ success: false, error: authResult.error }, { status: 401 });
    }

    const stripe = getStripe();
    if (!stripe) {
      return NextResponse.json(
        { success: false, error: "STRIPE_MISCONFIGURED", message: "Payment provider not configured." },
        { status: 503 }
      );
    }

    const baseUrl = process.env.NEXTAUTH_URL ?? "https://xpersona.co";

    const [existing] = await db
      .select()
      .from(marketplaceDevelopers)
      .where(eq(marketplaceDevelopers.userId, authResult.user.id))
      .limit(1);

    let accountId: string;

    if (existing?.stripeAccountId) {
      accountId = existing.stripeAccountId;
    } else {
      const account = await stripe.accounts.create({
        type: "express",
        email: authResult.user.email ?? undefined,
        capabilities: {
          card_payments: { requested: true },
          transfers: { requested: true },
        },
        business_type: "individual",
      });
      accountId = account.id;

      if (existing) {
        await db
          .update(marketplaceDevelopers)
          .set({ stripeAccountId: accountId, updatedAt: new Date() })
          .where(eq(marketplaceDevelopers.id, existing.id));
      } else {
        await db.insert(marketplaceDevelopers).values({
          userId: authResult.user.id,
          stripeAccountId: accountId,
        });
      }
    }

    const accountLink = await stripe.accountLinks.create({
      account: accountId,
      refresh_url: `${baseUrl}/trading/onboarding?refresh=1`,
      return_url: `${baseUrl}/trading/onboarding?success=1`,
      type: "account_onboarding",
    });

    return NextResponse.json({
      success: true,
      data: { url: accountLink.url },
    });
  } catch (err: unknown) {
    if (err && typeof err === "object" && "type" in err && (err as { type?: string }).type?.startsWith("Stripe")) {
      const stripeErr = err as { message?: string };
      return NextResponse.json(
        { success: false, error: "STRIPE_ERROR", message: stripeErr.message ?? "Stripe error." },
        { status: 502 }
      );
    }
    if (err && typeof err === "object" && "code" in err) {
      const pgErr = err as { code?: string; message?: string };
      if (pgErr.code === "23505") {
        return NextResponse.json(
          {
            success: false,
            error: "DUPLICATE",
            message: "You already have a developer account. Please refresh and try again.",
          },
          { status: 409 }
        );
      }
    }
    console.error("[trading/developer/onboard]", err);
    return NextResponse.json(
      {
        success: false,
        error: "INTERNAL_ERROR",
        message: "Onboarding failed. Please try again.",
      },
      { status: 500 }
    );
  }
}

import { NextResponse } from "next/server";
import { getAuthUser } from "@/lib/auth-utils";
import { db } from "@/lib/db";
import { creditPackages } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import Stripe from "stripe";

function getStripe(): Stripe | null {
  const key = process.env.STRIPE_SECRET_KEY?.trim();
  if (!key || key.length < 10) return null;
  return new Stripe(key, { apiVersion: "2025-02-24.acacia" });
}

/** Valid Stripe Price ID (price_xxx); rejects placeholders. */
function isValidStripePriceId(id: string): boolean {
  return typeof id === "string" && id.startsWith("price_") && id.length > 10;
}

export async function POST(request: Request) {
  try {
    const authResult = await getAuthUser(request as any);
    if ("error" in authResult) {
      return NextResponse.json(
        { success: false, error: authResult.error },
        { status: 401 }
      );
    }
    const body = await request.json().catch(() => ({}));
    const packageId = (body?.packageId ?? "").toString().trim();
    if (!packageId) {
      return NextResponse.json(
        { success: false, error: "VALIDATION_ERROR", message: "packageId required" },
        { status: 400 }
      );
    }
    const [pkg] = await db
      .select()
      .from(creditPackages)
      .where(eq(creditPackages.id, packageId))
      .limit(1);
    if (!pkg || !pkg.active) {
      return NextResponse.json(
        { success: false, error: "PACKAGE_NOT_FOUND", message: "Credit package not found or inactive" },
        { status: 404 }
      );
    }
    if (!isValidStripePriceId(pkg.stripePriceId)) {
      return NextResponse.json(
        {
          success: false,
          error: "STRIPE_MISCONFIGURED",
          message: "Credit package has invalid Stripe Price ID. Run npm run seed with STRIPE_PRICE_* env vars.",
        },
        { status: 503 }
      );
    }
    const stripe = getStripe();
    if (!stripe) {
      return NextResponse.json(
        {
          success: false,
          error: "STRIPE_MISCONFIGURED",
          message: "Payment provider not configured. Contact support.",
        },
        { status: 503 }
      );
    }
    const baseUrl = process.env.NEXTAUTH_URL ?? "https://xpersona.co";
    const session = await stripe.checkout.sessions.create({
      mode: "payment",
      line_items: [{ price: pkg.stripePriceId, quantity: 1 }],
      success_url: `${baseUrl}/games/dice?deposit=success`,
      cancel_url: `${baseUrl}/dashboard/deposit`,
      client_reference_id: authResult.user.id,
      metadata: {
        userId: authResult.user.id,
        packageId: pkg.id,
        credits: String(pkg.credits),
      },
    });
    return NextResponse.json({
      success: true,
      data: { url: session.url },
    });
  } catch (err: unknown) {
    if (err && typeof err === "object" && "type" in err && (err as { type?: string }).type?.startsWith("Stripe")) {
      const stripeErr = err as { message?: string; code?: string };
      return NextResponse.json(
        {
          success: false,
          error: "STRIPE_ERROR",
          message: stripeErr.message ?? "Payment provider error. Check Stripe dashboard.",
        },
        { status: 502 }
      );
    }
    console.error("[credits/checkout]", err);
    return NextResponse.json(
      { success: false, error: "INTERNAL_ERROR", message: "Checkout failed. Please try again." },
      { status: 500 }
    );
  }
}

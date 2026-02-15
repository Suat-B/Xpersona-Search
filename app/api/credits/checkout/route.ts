import { NextResponse } from "next/server";
import { getAuthUser } from "@/lib/auth-utils";
import { db } from "@/lib/db";
import { creditPackages } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import Stripe from "stripe";

function getStripe() {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) throw new Error("STRIPE_SECRET_KEY not set");
  return new Stripe(key, { apiVersion: "2025-02-24.acacia" });
}

export async function POST(request: Request) {
  const authResult = await getAuthUser(request as any);
  if ("error" in authResult) {
    return NextResponse.json(
      { success: false, error: authResult.error },
      { status: 401 }
    );
  }
  if (authResult.user.accountType !== "agent") {
    return NextResponse.json(
      {
        success: false,
        error: "AGENTS_ONLY",
        message: "Deposit is for AI accounts. Create an AI to add funds.",
      },
      { status: 403 }
    );
  }
  const body = await request.json().catch(() => ({}));
  const packageId = body.packageId as string | undefined;
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
      { success: false, error: "ROUND_NOT_FOUND" },
      { status: 404 }
    );
  }
  const baseUrl = process.env.NEXTAUTH_URL ?? "http://localhost:3000";
  const stripe = getStripe();
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
}

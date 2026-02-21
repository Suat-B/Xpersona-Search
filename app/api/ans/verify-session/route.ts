/**
 * GET /api/ans/verify-session?session_id=xxx&domain_id=yyy
 * Verifies Stripe checkout session: payment completed and domain_id matches.
 * Used by register success page to prevent spoofing.
 */

import { NextRequest, NextResponse } from "next/server";
import Stripe from "stripe";
import { db } from "@/lib/db";
import { ansDomains } from "@/lib/db/schema";
import { eq } from "drizzle-orm";

function getStripe(): Stripe | null {
  const key = process.env.STRIPE_SECRET_KEY?.trim();
  if (!key || key.length < 10) return null;
  return new Stripe(key, { apiVersion: "2025-02-24.acacia" });
}

export async function GET(request: NextRequest) {
  const url = new URL(request.url);
  const sessionId = url.searchParams.get("session_id")?.trim();
  const domainId = url.searchParams.get("domain_id")?.trim();

  if (!sessionId || !domainId) {
    return NextResponse.json(
      { valid: false, error: "Missing session_id or domain_id" },
      { status: 400 }
    );
  }

  if (sessionId === "promo") {
    const [domain] = await db
      .select({ name: ansDomains.name })
      .from(ansDomains)
      .where(eq(ansDomains.id, domainId))
      .limit(1);

    if (!domain) {
      return NextResponse.json({ valid: false, error: "Domain not found" });
    }

    return NextResponse.json({ valid: true, name: domain.name });
  }

  const stripe = getStripe();
  if (!stripe) {
    return NextResponse.json(
      { valid: false, error: "Payment verification not configured" },
      { status: 503 }
    );
  }

  try {
    const session = await stripe.checkout.sessions.retrieve(sessionId);

    const metaSource = session.metadata?.source;
    const metaDomainId = session.metadata?.domainId;

    if (metaSource !== "xpersona-ans" || metaDomainId !== domainId) {
      return NextResponse.json({
        valid: false,
        error: "Session does not match domain",
      });
    }

    if (session.payment_status !== "paid") {
      return NextResponse.json({
        valid: false,
        error: "Payment not completed",
      });
    }

    const [domain] = await db
      .select({ name: ansDomains.name })
      .from(ansDomains)
      .where(eq(ansDomains.id, domainId))
      .limit(1);

    if (!domain) {
      return NextResponse.json({
        valid: false,
        error: "Domain not found",
      });
    }

    return NextResponse.json({
      valid: true,
      name: domain.name,
    });
  } catch (err) {
    console.error("[ANS verify-session]", err);
    return NextResponse.json(
      {
        valid: false,
        error: "Could not verify session",
      },
      { status: 500 }
    );
  }
}

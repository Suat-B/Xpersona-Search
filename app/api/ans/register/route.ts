/**
 * POST /api/ans/register
 * Start ANS domain registration. Full flow: validate, create user/domain, Stripe Checkout.
 * Per XPERSONA ANS.MD.
 */

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import Stripe from "stripe";
import {
  validateAgentName,
  ANS_TLD,
} from "@/lib/ans-validator";
import { generateAgentKeyPair, generateDnsTxtRecord } from "@/lib/ans-crypto";
import { createDomainRecords, createTxtRecord, isCloudflareConfigured } from "@/lib/cloudflare-ans";
import { db } from "@/lib/db";
import { users, ansDomains } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { checkAnsRegisterLimit } from "@/lib/ans-rate-limit";

const RegisterSchema = z.object({
  name: z.string().min(1).max(63),
  email: z.string().email(),
  agentCard: z
    .object({
      name: z.string(),
      description: z.string().optional(),
      endpoint: z.string().url().optional(),
      capabilities: z.array(z.string()).optional(),
      protocols: z.array(z.enum(["A2A", "MCP", "ANP", "OpenClaw"])).optional(),
    })
    .optional(),
});

function getStripe(): Stripe | null {
  const key = process.env.STRIPE_SECRET_KEY?.trim();
  if (!key || key.length < 10) return null;
  return new Stripe(key, { apiVersion: "2025-02-24.acacia" });
}

function isValidAnsPriceId(id: string): boolean {
  return typeof id === "string" && id.startsWith("price_") && id.length > 10;
}

export async function POST(request: NextRequest) {
  const limitResult = checkAnsRegisterLimit(request);
  if (!limitResult.allowed) {
    return NextResponse.json(
      {
        success: false,
        nextStep: "error",
        error: "Too many requests. Wait a moment.",
      },
      {
        status: 429,
        headers: {
          "Retry-After": String(limitResult.retryAfter ?? 60),
        },
      }
    );
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { success: false, nextStep: "error", error: "Invalid JSON body" },
      { status: 400 }
    );
  }

  const parseResult = RegisterSchema.safeParse(body);
  if (!parseResult.success) {
    return NextResponse.json(
      {
        success: false,
        nextStep: "error",
        error: "Invalid request",
        details: parseResult.error.flatten(),
      },
      { status: 400 }
    );
  }

  const { name, email, agentCard } = parseResult.data;

  const validation = validateAgentName(name);
  if (!validation.valid) {
    return NextResponse.json(
      {
        success: false,
        nextStep: "invalid",
        error: validation.error,
        code: validation.code,
      },
      { status: 400 }
    );
  }

  const normalizedName = validation.normalized!;
  const fullDomain = `${normalizedName}.${ANS_TLD}`;
  const normalizedEmail = email.trim().toLowerCase();

  const stripe = getStripe();
  const priceId = process.env.STRIPE_PRICE_ID_ANS_STANDARD?.trim();
  const hasMasterKey = process.env.MASTER_ENCRYPTION_KEY?.trim()?.length === 64;

  if (!stripe || !priceId || !isValidAnsPriceId(priceId) || !hasMasterKey) {
    return NextResponse.json(
      {
        success: false,
        nextStep: "coming_soon",
        error: "Registration will open soon",
        domain: { name: normalizedName, fullDomain, status: "PENDING_VERIFICATION" },
      },
      { status: 200 }
    );
  }

  try {
    const existingDomain = await db
      .select({ id: ansDomains.id })
      .from(ansDomains)
      .where(eq(ansDomains.name, normalizedName))
      .limit(1);

    if (existingDomain.length > 0) {
      return NextResponse.json(
        {
          success: false,
          nextStep: "taken",
          error: "Domain is already registered",
          code: "DOMAIN_UNAVAILABLE",
        },
        { status: 409 }
      );
    }
  } catch (err) {
    console.error("[ANS register] DB check error:", err);
    return NextResponse.json(
      { success: false, nextStep: "error", error: "Service temporarily unavailable" },
      { status: 500 }
    );
  }

  let userId: string;
  let stripeCustomerId: string;

  try {
    const [existingUser] = await db
      .select({ id: users.id, stripeCustomerId: users.stripeCustomerId })
      .from(users)
      .where(eq(users.email, normalizedEmail))
      .limit(1);

    if (existingUser) {
      userId = existingUser.id;
      if (existingUser.stripeCustomerId) {
        stripeCustomerId = existingUser.stripeCustomerId;
      } else {
        const customer = await stripe.customers.create({
          email: normalizedEmail,
          metadata: { source: "xpersona-ans" },
        });
        stripeCustomerId = customer.id;
        await db
          .update(users)
          .set({ stripeCustomerId })
          .where(eq(users.id, userId));
      }
    } else {
      const customer = await stripe.customers.create({
        email: normalizedEmail,
        metadata: { source: "xpersona-ans" },
      });
      stripeCustomerId = customer.id;
      const [inserted] = await db
        .insert(users)
        .values({
          email: normalizedEmail,
          accountType: "human",
          stripeCustomerId,
        })
        .returning({ id: users.id });
      if (!inserted) throw new Error("User insert failed");
      userId = inserted.id;
    }
  } catch (err) {
    console.error("[ANS register] User/customer error:", err);
    return NextResponse.json(
      { success: false, nextStep: "error", error: "Service temporarily unavailable" },
      { status: 500 }
    );
  }

  let keyPair: { publicKey: string; privateKeyEncrypted: string };
  try {
    keyPair = generateAgentKeyPair();
  } catch (err) {
    console.error("[ANS register] Crypto error:", err);
    return NextResponse.json(
      { success: false, nextStep: "error", error: "Service temporarily unavailable" },
      { status: 500 }
    );
  }

  const expiresAt = new Date();
  expiresAt.setFullYear(expiresAt.getFullYear() + 1);

  const defaultAgentCard = {
    name: normalizedName,
    description: "Agent powered by Xpersona",
    endpoint: `https://${fullDomain}`,
    capabilities: [] as string[],
    protocols: [] as string[],
  };
  const mergedAgentCard = agentCard
    ? {
        ...defaultAgentCard,
        ...agentCard,
        capabilities: agentCard.capabilities ?? defaultAgentCard.capabilities,
        protocols: agentCard.protocols ?? defaultAgentCard.protocols,
      }
    : defaultAgentCard;

  let domainId: string;
  try {
    const [inserted] = await db
      .insert(ansDomains)
      .values({
        name: normalizedName,
        fullDomain,
        ownerId: userId,
        agentCard: mergedAgentCard,
        publicKey: keyPair.publicKey,
        privateKeyEncrypted: keyPair.privateKeyEncrypted,
        status: "PENDING_VERIFICATION",
        expiresAt,
      })
      .returning({ id: ansDomains.id });
    if (!inserted) throw new Error("Domain insert failed");
    domainId = inserted.id;
  } catch (err) {
    console.error("[ANS register] Domain insert error:", err);
    return NextResponse.json(
      { success: false, nextStep: "error", error: "Service temporarily unavailable" },
      { status: 500 }
    );
  }

  if (isCloudflareConfigured()) {
    try {
      await createDomainRecords(normalizedName);
      const dnsTxt = generateDnsTxtRecord(keyPair.publicKey);
      await createTxtRecord(fullDomain, dnsTxt);
    } catch (cfErr) {
      console.warn("[ANS register] Cloudflare DNS failed (non-fatal):", cfErr);
    }
  }

  const baseUrl = process.env.NEXTAUTH_URL ?? "https://xpersona.co";
  const successUrl = `${baseUrl}/register/success?session_id={CHECKOUT_SESSION_ID}&domain_id=${domainId}&name=${encodeURIComponent(normalizedName)}`;
  const cancelUrl = `${baseUrl}/register?name=${encodeURIComponent(normalizedName)}`;

  let session: Stripe.Checkout.Session;
  try {
    session = await stripe.checkout.sessions.create({
      mode: "subscription",
      customer: stripeCustomerId,
      line_items: [{ price: priceId, quantity: 1 }],
      success_url: successUrl,
      cancel_url: cancelUrl,
      metadata: {
        source: "xpersona-ans",
        domainId,
        userId,
      },
      subscription_data: {
        metadata: {
          source: "xpersona-ans",
          domainId,
          userId,
        },
        trial_period_days: 0,
      },
    });
  } catch (err) {
    console.error("[ANS register] Stripe session error:", err);
    await db.delete(ansDomains).where(eq(ansDomains.id, domainId));
    return NextResponse.json(
      {
        success: false,
        nextStep: "error",
        error: "Payment setup failed. Please try again.",
      },
      { status: 500 }
    );
  }

  const dnsTxtRecord = generateDnsTxtRecord(keyPair.publicKey);
  const instructions = [
    "1. Complete payment to activate domain",
    `2. Add this TXT record for verification:`,
    `   _agent.${fullDomain} TXT "${dnsTxtRecord}"`,
    `3. Your Agent Card will be available at:`,
    `   https://xpersona.co/api/ans/card/${normalizedName}`,
  ];

  if (isCloudflareConfigured()) {
    instructions[1] = "2. DNS records have been created. Add TXT for verification if needed:";
  }

  return NextResponse.json({
    success: true,
    nextStep: "payment_required",
    domain: {
      name: normalizedName,
      fullDomain,
      status: "PENDING_VERIFICATION",
      expiresAt: expiresAt.toISOString(),
    },
    payment: {
      url: session.url,
      sessionId: session.id,
    },
    verification: {
      publicKey: keyPair.publicKey,
      dnsTxtRecord,
      instructions,
    },
  });
}

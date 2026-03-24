import { and, desc, eq, or, sql } from "drizzle-orm";
import { NextResponse } from "next/server";
import type Stripe from "stripe";
import { getCrawlerName } from "@/lib/bot-detect";
import {
  buildCrawlConsumeIdempotencyKey,
  createCrawlLicenseRequiredResponse,
  CRAWL_CUSTOMER_ID_HEADER,
  CRAWL_KEY_PREFIX_HEADER,
  getCrawlLicenseTokenTtlSeconds,
  getCrawlPackage,
  getCrawlTokenFromHeaders,
  getVerifiedCrawlPayloadFromHeaders,
  isLicensedCrawlerRequest,
  isPayPerCrawlEnabled,
  normalizeCrawlEmail,
} from "@/lib/crawl-license";
import { db } from "@/lib/db";
import {
  crawlCreditLedger,
  crawlCustomers,
  type CrawlCustomerStatus,
} from "@/lib/db/schema";
import { getOrCreateRequestId } from "@/lib/api/request-meta";
import {
  decryptCrawlDeliveryApiKey,
  encryptCrawlDeliveryApiKey,
  generateCrawlApiKey,
  hashCrawlApiKey,
  mintCrawlLicenseToken,
} from "@/lib/crawl-license-mint";
import { requireStripe } from "@/lib/stripe";

type CrawlCustomerRecord = {
  id: string;
  email: string;
  stripeCustomerId: string | null;
  apiKeyHash: string | null;
  apiKeyPrefix: string | null;
  creditBalance: number;
  status: CrawlCustomerStatus;
  hasActiveKey: boolean;
  lastKeyRotatedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
};

export type AuthenticatedCrawlCustomer = Pick<
  CrawlCustomerRecord,
  "id" | "email" | "apiKeyPrefix" | "creditBalance" | "status" | "stripeCustomerId"
>;

type ConsumeCreditResult =
  | { ok: true; remainingCredits: number }
  | { ok: false; reason: "NOT_FOUND" | "SUSPENDED" | "EXHAUSTED" };

type HeaderLookup = {
  get(name: string): string | null;
};

type CrawlDeliveryMetadata = {
  kind: "success_page";
  encryptedApiKey: string | null;
  keyPrefix: string | null;
  createdAt: string;
  revealedAt?: string | null;
};

type CrawlPurchaseMetadata = {
  packageId?: string;
  email?: string;
  source?: string;
  delivery?: CrawlDeliveryMetadata | null;
};

type RevealCrawlCheckoutResult =
  | {
      ok: true;
      kind: "revealed";
      apiKey: string;
      keyPrefix: string | null;
      credits: number;
      packageId: string | null;
    }
  | {
      ok: true;
      kind: "top_up";
      keyPrefix: string | null;
      credits: number;
      packageId: string | null;
    }
  | {
      ok: false;
      reason: "NOT_FOUND" | "PROCESSING" | "UNPAID" | "ALREADY_REVEALED" | "MISCONFIGURED";
    };

function parseCrawlPurchaseMetadata(value: unknown): CrawlPurchaseMetadata {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  const raw = value as Record<string, unknown>;
  const deliveryValue = raw.delivery;
  let delivery: CrawlDeliveryMetadata | null | undefined;
  if (deliveryValue && typeof deliveryValue === "object" && !Array.isArray(deliveryValue)) {
    const rawDelivery = deliveryValue as Record<string, unknown>;
    if (rawDelivery.kind === "success_page" && typeof rawDelivery.createdAt === "string") {
      delivery = {
        kind: "success_page",
        encryptedApiKey:
          typeof rawDelivery.encryptedApiKey === "string"
            ? rawDelivery.encryptedApiKey
            : null,
        keyPrefix: typeof rawDelivery.keyPrefix === "string" ? rawDelivery.keyPrefix : null,
        createdAt: rawDelivery.createdAt,
        revealedAt: typeof rawDelivery.revealedAt === "string" ? rawDelivery.revealedAt : null,
      };
    }
  }

  return {
    packageId: typeof raw.packageId === "string" ? raw.packageId : undefined,
    email: typeof raw.email === "string" ? raw.email : undefined,
    source: typeof raw.source === "string" ? raw.source : undefined,
    delivery,
  };
}

function getBaseUrl(): string {
  return (
    process.env.NEXT_PUBLIC_APP_URL ||
    process.env.NEXTAUTH_URL ||
    (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : "http://localhost:3000")
  );
}

function getRequestOrigin(request: Request): string {
  const url = request.url;
  if (url) {
    try {
      return new URL(url).origin;
    } catch {}
  }
  return getBaseUrl();
}

function getForwardedCustomerId(headers: HeaderLookup): string | null {
  const value = headers.get(CRAWL_CUSTOMER_ID_HEADER)?.trim() ?? "";
  return value.length > 0 ? value : null;
}

function getForwardedKeyPrefix(headers: HeaderLookup): string | null {
  const value = headers.get(CRAWL_KEY_PREFIX_HEADER)?.trim() ?? "";
  return value.length > 0 ? value : null;
}

async function getCustomerByApiKeyHash(apiKeyHash: string): Promise<CrawlCustomerRecord | null> {
  const [customer] = await db
    .select()
    .from(crawlCustomers)
    .where(eq(crawlCustomers.apiKeyHash, apiKeyHash))
    .limit(1);
  return (customer as CrawlCustomerRecord | undefined) ?? null;
}

export async function findCrawlCustomerByEmail(email: string): Promise<CrawlCustomerRecord | null> {
  const normalized = normalizeCrawlEmail(email);
  const [customer] = await db
    .select()
    .from(crawlCustomers)
    .where(eq(crawlCustomers.email, normalized))
    .limit(1);
  return (customer as CrawlCustomerRecord | undefined) ?? null;
}

export async function authenticateCrawlCustomerByApiKey(
  apiKey: string | null | undefined
): Promise<AuthenticatedCrawlCustomer | null> {
  if (!apiKey || !apiKey.startsWith("xpcrawl_")) return null;
  const customer = await getCustomerByApiKeyHash(hashCrawlApiKey(apiKey));
  if (!customer) return null;
  return {
    id: customer.id,
    email: customer.email,
    apiKeyPrefix: customer.apiKeyPrefix,
    creditBalance: customer.creditBalance,
    status: customer.status,
    stripeCustomerId: customer.stripeCustomerId,
  };
}

export async function issueCrawlTokenForApiKey(
  apiKey: string | null | undefined,
  ttlSeconds = getCrawlLicenseTokenTtlSeconds()
): Promise<
  | { ok: true; customer: AuthenticatedCrawlCustomer; token: string; expiresIn: number }
  | { ok: false; reason: "UNAUTHORIZED" | "SUSPENDED" | "EXHAUSTED" | "MISCONFIGURED" }
> {
  const customer = await authenticateCrawlCustomerByApiKey(apiKey);
  if (!customer || !customer.apiKeyPrefix) {
    return { ok: false, reason: "UNAUTHORIZED" };
  }
  if (customer.status === "suspended") {
    return { ok: false, reason: "SUSPENDED" };
  }
  if (customer.creditBalance <= 0) {
    return { ok: false, reason: "EXHAUSTED" };
  }

  const token = mintCrawlLicenseToken({
    customerId: customer.id,
    keyPrefix: customer.apiKeyPrefix,
    ttlSeconds,
  });
  if (!token) {
    return { ok: false, reason: "MISCONFIGURED" };
  }

  return {
    ok: true,
    customer,
    token,
    expiresIn: ttlSeconds,
  };
}

export async function rotateCrawlCustomerApiKey(
  customerId: string
): Promise<{ rawKey: string; keyPrefix: string }> {
  const generated = generateCrawlApiKey();
  await db
    .update(crawlCustomers)
    .set({
      apiKeyHash: generated.keyHash,
      apiKeyPrefix: generated.keyPrefix,
      hasActiveKey: true,
      lastKeyRotatedAt: new Date(),
      updatedAt: new Date(),
    })
    .where(eq(crawlCustomers.id, customerId));

  return {
    rawKey: generated.rawKey,
    keyPrefix: generated.keyPrefix,
  };
}

export async function getCrawlCustomerStatus(
  customerId: string
): Promise<{
  customer: AuthenticatedCrawlCustomer;
  lastPurchase:
    | {
        credits: number;
        checkoutSessionId: string | null;
        purchasedAt: string;
      }
    | null;
}> {
  const [customer] = await db
    .select({
      id: crawlCustomers.id,
      email: crawlCustomers.email,
      apiKeyPrefix: crawlCustomers.apiKeyPrefix,
      creditBalance: crawlCustomers.creditBalance,
      status: crawlCustomers.status,
      stripeCustomerId: crawlCustomers.stripeCustomerId,
    })
    .from(crawlCustomers)
    .where(eq(crawlCustomers.id, customerId))
    .limit(1);
  if (!customer) {
    throw new Error("CRAWL_CUSTOMER_NOT_FOUND");
  }

  const [lastPurchase] = await db
    .select({
      credits: crawlCreditLedger.deltaCredits,
      checkoutSessionId: crawlCreditLedger.stripeCheckoutSessionId,
      purchasedAt: crawlCreditLedger.createdAt,
    })
    .from(crawlCreditLedger)
    .where(
      and(
        eq(crawlCreditLedger.customerId, customer.id),
        eq(crawlCreditLedger.reason, "purchase")
      )
    )
    .orderBy(desc(crawlCreditLedger.createdAt))
    .limit(1);

  return {
    customer,
    lastPurchase: lastPurchase
      ? {
          credits: lastPurchase.credits,
          checkoutSessionId: lastPurchase.checkoutSessionId,
          purchasedAt: lastPurchase.purchasedAt.toISOString(),
        }
      : null,
  };
}

export async function upsertCrawlPurchaseFromCheckoutSession(
  session: Stripe.Checkout.Session
): Promise<void> {
  if (session.metadata?.xpersona_product !== "crawl_license") return;
  if (session.payment_status !== "paid") return;

  const packageId = session.metadata?.xpersona_package_id ?? null;
  const pkg = getCrawlPackage(packageId);
  if (!pkg) {
    throw new Error("CRAWL_PACKAGE_INVALID");
  }

  const email = normalizeCrawlEmail(
    session.customer_details?.email ??
      session.customer_email ??
      session.metadata?.xpersona_email ??
      ""
  );
  if (!email) {
    throw new Error("CRAWL_CUSTOMER_EMAIL_MISSING");
  }

  const stripeCustomerId =
    typeof session.customer === "string" ? session.customer : session.customer?.id ?? null;
  const paymentIntentId =
    typeof session.payment_intent === "string"
      ? session.payment_intent
      : session.payment_intent?.id ?? null;
  const ledgerKey = `stripe:checkout:${session.id}`;

  let issuedKeyRevealPayload:
    | {
        apiKey: string;
        keyPrefix: string;
        credits: number;
      }
    | undefined;

  await db.transaction(async (tx) => {
    const existingLedger = await tx
      .select({ id: crawlCreditLedger.id })
      .from(crawlCreditLedger)
      .where(eq(crawlCreditLedger.idempotencyKey, ledgerKey))
      .limit(1);
    if (existingLedger[0]) return;

    const [existingCustomer] = await tx
      .select()
      .from(crawlCustomers)
      .where(
        stripeCustomerId
          ? or(
              eq(crawlCustomers.email, email),
              eq(crawlCustomers.stripeCustomerId, stripeCustomerId)
            )!
          : eq(crawlCustomers.email, email)
      )
      .limit(1);

    const now = new Date();
    let customerId: string;
    if (existingCustomer) {
      customerId = existingCustomer.id;
      if (!existingCustomer.apiKeyHash || !existingCustomer.apiKeyPrefix) {
        const generated = generateCrawlApiKey();
        issuedKeyRevealPayload = {
          apiKey: generated.rawKey,
          keyPrefix: generated.keyPrefix,
          credits: pkg.credits,
        };
        await tx
          .update(crawlCustomers)
          .set({
            stripeCustomerId: stripeCustomerId ?? existingCustomer.stripeCustomerId,
            apiKeyHash: generated.keyHash,
            apiKeyPrefix: generated.keyPrefix,
            hasActiveKey: true,
            lastKeyRotatedAt: now,
            creditBalance: sql`${crawlCustomers.creditBalance} + ${pkg.credits}`,
            updatedAt: now,
          })
          .where(eq(crawlCustomers.id, existingCustomer.id));
      } else {
        await tx
          .update(crawlCustomers)
          .set({
            stripeCustomerId: stripeCustomerId ?? existingCustomer.stripeCustomerId,
            hasActiveKey: existingCustomer.hasActiveKey || !!existingCustomer.apiKeyHash,
            creditBalance: sql`${crawlCustomers.creditBalance} + ${pkg.credits}`,
            updatedAt: now,
          })
          .where(eq(crawlCustomers.id, existingCustomer.id));
      }
    } else {
      const generated = generateCrawlApiKey();
      issuedKeyRevealPayload = {
        apiKey: generated.rawKey,
        keyPrefix: generated.keyPrefix,
        credits: pkg.credits,
      };
      const [created] = await tx
        .insert(crawlCustomers)
        .values({
          email,
          stripeCustomerId,
          apiKeyHash: generated.keyHash,
          apiKeyPrefix: generated.keyPrefix,
          creditBalance: pkg.credits,
          status: "active",
          hasActiveKey: true,
          lastKeyRotatedAt: now,
          createdAt: now,
          updatedAt: now,
        })
        .returning({ id: crawlCustomers.id });
      if (!created) {
        throw new Error("CRAWL_CUSTOMER_CREATE_FAILED");
      }
      customerId = created.id;
    }

    const metadata: CrawlPurchaseMetadata = {
      packageId: pkg.id,
      email,
      source: session.metadata?.source ?? "crawl_license_checkout",
    };
    if (issuedKeyRevealPayload) {
      const encryptedApiKey = encryptCrawlDeliveryApiKey(issuedKeyRevealPayload.apiKey);
      if (!encryptedApiKey) {
        throw new Error("CRAWL_LICENSE_SECRET_REQUIRED_FOR_DELIVERY");
      }
      metadata.delivery = {
        kind: "success_page",
        encryptedApiKey,
        keyPrefix: issuedKeyRevealPayload.keyPrefix,
        createdAt: now.toISOString(),
        revealedAt: null,
      };
    }

    await tx.insert(crawlCreditLedger).values({
      customerId,
      deltaCredits: pkg.credits,
      reason: "purchase",
      idempotencyKey: ledgerKey,
      stripeCheckoutSessionId: session.id,
      stripePaymentIntentId: paymentIntentId,
      metadata,
      createdAt: new Date(),
    });
  });
}

export async function revealCrawlCheckoutApiKey(
  sessionId: string
): Promise<RevealCrawlCheckoutResult> {
  const normalizedSessionId = sessionId.trim();
  if (!normalizedSessionId) {
    return { ok: false, reason: "NOT_FOUND" };
  }

  let stripe: Stripe;
  try {
    stripe = requireStripe();
  } catch {
    return { ok: false, reason: "MISCONFIGURED" };
  }

  let session: Stripe.Checkout.Session;
  try {
    session = await stripe.checkout.sessions.retrieve(normalizedSessionId);
  } catch {
    return { ok: false, reason: "NOT_FOUND" };
  }

  if (session.metadata?.xpersona_product !== "crawl_license") {
    return { ok: false, reason: "NOT_FOUND" };
  }
  if (session.payment_status !== "paid") {
    return { ok: false, reason: "UNPAID" };
  }

  return db.transaction(async (tx) => {
    const lockedLedgerResult = await tx.execute(sql`
      SELECT id, customer_id, delta_credits, metadata
      FROM crawl_credit_ledger
      WHERE stripe_checkout_session_id = ${normalizedSessionId}
        AND reason = 'purchase'
      FOR UPDATE
    `);
    const lockedLedgerRows =
      (lockedLedgerResult as unknown as {
        rows?: Array<{
          id: string;
          customer_id: string;
          delta_credits: number;
          metadata: unknown;
        }>;
      }).rows ?? [];
    const lockedLedger = lockedLedgerRows[0];

    if (!lockedLedger) {
      return { ok: false, reason: "PROCESSING" } as const;
    }

    const metadata = parseCrawlPurchaseMetadata(lockedLedger.metadata);
    const delivery = metadata.delivery;

    if (!delivery || delivery.kind !== "success_page") {
      const [customer] = await tx
        .select({ keyPrefix: crawlCustomers.apiKeyPrefix })
        .from(crawlCustomers)
        .where(eq(crawlCustomers.id, lockedLedger.customer_id))
        .limit(1);

      return {
        ok: true,
        kind: "top_up",
        keyPrefix: customer?.keyPrefix ?? null,
        credits: lockedLedger.delta_credits,
        packageId: metadata.packageId ?? null,
      } as const;
    }

    if (!delivery.encryptedApiKey) {
      return { ok: false, reason: "ALREADY_REVEALED" } as const;
    }

    const apiKey = decryptCrawlDeliveryApiKey(delivery.encryptedApiKey);
    if (!apiKey) {
      return { ok: false, reason: "MISCONFIGURED" } as const;
    }

    await tx
      .update(crawlCreditLedger)
      .set({
        metadata: {
          ...metadata,
          delivery: {
            ...delivery,
            encryptedApiKey: null,
            revealedAt: new Date().toISOString(),
          },
        },
      })
      .where(eq(crawlCreditLedger.id, lockedLedger.id));

    return {
      ok: true,
      kind: "revealed",
      apiKey,
      keyPrefix: delivery.keyPrefix ?? null,
      credits: lockedLedger.delta_credits,
      packageId: metadata.packageId ?? null,
    } as const;
  });
}

export async function consumeCrawlCredit(
  params: {
    customerId: string;
    requestId: string;
    method: string;
    pathname: string;
    botName: string | null;
    keyPrefix?: string | null;
  }
): Promise<ConsumeCreditResult> {
  const idempotencyKey = buildCrawlConsumeIdempotencyKey(
    params.requestId,
    params.method,
    params.pathname
  );

  return db.transaction(async (tx) => {
    const lockedCustomerResult = await tx.execute(sql`
      SELECT id, credit_balance, status, api_key_prefix
      FROM crawl_customers
      WHERE id = ${params.customerId}
      FOR UPDATE
    `);
    const lockedCustomers =
      (lockedCustomerResult as unknown as {
        rows?: Array<{
          id: string;
          credit_balance: number;
          status: CrawlCustomerStatus;
          api_key_prefix: string | null;
        }>;
      }).rows ?? [];
    const lockedCustomer = lockedCustomers[0];
    if (!lockedCustomer) {
      return { ok: false, reason: "NOT_FOUND" } as const;
    }

    const existingLedgerResult = await tx.execute(sql`
      SELECT id
      FROM crawl_credit_ledger
      WHERE idempotency_key = ${idempotencyKey}
      LIMIT 1
    `);
    const existingLedgerRows =
      (existingLedgerResult as unknown as {
        rows?: Array<{ id: string }>;
      }).rows ?? [];
    if (existingLedgerRows[0]) {
      return {
        ok: true,
        remainingCredits: Number(lockedCustomer.credit_balance ?? 0),
      } as const;
    }

    if (lockedCustomer.status === "suspended") {
      return { ok: false, reason: "SUSPENDED" } as const;
    }
    if (Number(lockedCustomer.credit_balance ?? 0) <= 0) {
      return { ok: false, reason: "EXHAUSTED" } as const;
    }

    const remainingCredits = Number(lockedCustomer.credit_balance ?? 0) - 1;
    await tx
      .update(crawlCustomers)
      .set({
        creditBalance: sql`${crawlCustomers.creditBalance} - 1`,
        updatedAt: new Date(),
      })
      .where(eq(crawlCustomers.id, params.customerId));

    await tx.insert(crawlCreditLedger).values({
      customerId: params.customerId,
      deltaCredits: -1,
      reason: "consume",
      idempotencyKey,
      path: params.pathname,
      botName: params.botName ?? undefined,
      metadata: {
        method: params.method.toUpperCase(),
        keyPrefix: params.keyPrefix ?? lockedCustomer.api_key_prefix,
      },
      createdAt: new Date(),
    });

    return { ok: true, remainingCredits } as const;
  });
}

export async function consumeCrawlCreditForRequest(
  request: Request,
  pathname: string
): Promise<NextResponse | null> {
  if (!isPayPerCrawlEnabled() || !isLicensedCrawlerRequest(request.headers)) {
    return null;
  }

  const payload = await getVerifiedCrawlPayloadFromHeaders(request.headers);
  if (!payload) {
    return createCrawlLicenseRequiredResponse(request, getRequestOrigin(request));
  }

  const botName = getCrawlerName(request.headers.get("user-agent"));
  const requestId = getOrCreateRequestId(request);
  const result = await consumeCrawlCredit({
    customerId: payload.sub,
    requestId,
    method: request.method,
    pathname,
    botName,
    keyPrefix: payload.kid,
  });

  if (result.ok) return null;

  if (result.reason === "SUSPENDED") {
    return createCrawlLicenseRequiredResponse(request, getRequestOrigin(request), {
      code: "CRAWL_LICENSE_SUSPENDED",
      message: "This crawl license is suspended.",
    });
  }

  return createCrawlLicenseRequiredResponse(request, getRequestOrigin(request), {
    code: "CRAWL_CREDITS_EXHAUSTED",
    message: "This crawl license has no remaining crawl credits.",
  });
}

export async function consumeCrawlCreditForHeaders(params: {
  headers: HeaderLookup;
  cookieLookup?: { get(name: string): { value?: string } | undefined } | null;
  pathname: string;
  method?: string;
}): Promise<ConsumeCreditResult | null> {
  if (!isPayPerCrawlEnabled() || !isLicensedCrawlerRequest(params.headers)) {
    return null;
  }

  const payload = await getVerifiedCrawlPayloadFromHeaders(
    params.headers,
    params.cookieLookup ?? null
  );
  if (!payload) {
    return { ok: false, reason: "EXHAUSTED" };
  }

  const requestId =
    params.headers.get("x-request-id")?.trim() ||
    params.headers.get("X-Request-Id")?.trim() ||
    crypto.randomUUID();
  const forwardedCustomerId = getForwardedCustomerId(params.headers);
  const forwardedKeyPrefix = getForwardedKeyPrefix(params.headers);
  if (
    (forwardedCustomerId && forwardedCustomerId !== payload.sub) ||
    (forwardedKeyPrefix && forwardedKeyPrefix !== payload.kid)
  ) {
    return { ok: false, reason: "NOT_FOUND" };
  }

  return consumeCrawlCredit({
    customerId: payload.sub,
    requestId,
    method: params.method ?? "GET",
    pathname: params.pathname,
    botName: getCrawlerName(params.headers.get("user-agent")),
    keyPrefix: payload.kid,
  });
}

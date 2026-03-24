import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { applyRequestIdHeader } from "@/lib/api/errors";
import {
  getCrawlLicenseUrls,
  getCrawlPackage,
  getCrawlPackagePriceId,
  normalizeCrawlEmail,
} from "@/lib/crawl-license";
import { findCrawlCustomerByEmail } from "@/lib/crawl-license-store";
import { requireStripe } from "@/lib/stripe";

const checkoutSchema = z.object({
  email: z.string().email(),
  packageId: z.enum(["starter", "growth", "scale"]),
  successUrl: z.string().optional(),
  cancelUrl: z.string().optional(),
});

function toAbsoluteUrl(baseUrl: string, value: string | undefined, fallback: string): string {
  if (!value || value.trim().length === 0) return fallback;
  const trimmed = value.trim();
  if (trimmed.startsWith("/")) {
    return `${baseUrl}${trimmed}`;
  }
  try {
    const url = new URL(trimmed);
    if (url.protocol === "http:" || url.protocol === "https:") {
      return url.toString();
    }
  } catch {}
  return fallback;
}

export async function POST(req: NextRequest) {
  const parsed = checkoutSchema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) {
    const res = NextResponse.json(
      {
        success: false,
        error: {
          code: "INVALID_BODY",
          message: "email and packageId are required.",
        },
      },
      { status: 400 }
    );
    applyRequestIdHeader(res, req);
    return res;
  }

  const pkg = getCrawlPackage(parsed.data.packageId);
  if (!pkg) {
    const res = NextResponse.json(
      {
        success: false,
        error: {
          code: "CRAWL_PACKAGE_INVALID",
          message: "Unknown crawl package.",
        },
      },
      { status: 400 }
    );
    applyRequestIdHeader(res, req);
    return res;
  }

  const priceId = getCrawlPackagePriceId(pkg.id);
  if (!priceId) {
    const res = NextResponse.json(
      {
        success: false,
        error: {
          code: "CRAWL_PRICE_NOT_CONFIGURED",
          message: `Missing Stripe price for ${pkg.id}.`,
        },
      },
      { status: 500 }
    );
    applyRequestIdHeader(res, req);
    return res;
  }

  const baseUrl = req.nextUrl.origin;
  const urls = getCrawlLicenseUrls(baseUrl);
  const successUrl = toAbsoluteUrl(
    baseUrl,
    parsed.data.successUrl,
    `${urls.successUrl}?checkout=success&session_id={CHECKOUT_SESSION_ID}`
  );
  const cancelUrl = toAbsoluteUrl(
    baseUrl,
    parsed.data.cancelUrl,
    `${urls.successUrl}?checkout=cancelled`
  );
  const email = normalizeCrawlEmail(parsed.data.email);
  const existingCustomer = await findCrawlCustomerByEmail(email);
  const stripe = requireStripe();

  const session = await stripe.checkout.sessions.create({
    mode: "payment",
    ...(existingCustomer?.stripeCustomerId
      ? { customer: existingCustomer.stripeCustomerId }
      : {
          customer_email: email,
          customer_creation: "always",
        }),
    line_items: [{ price: priceId, quantity: 1 }],
    success_url: successUrl,
    cancel_url: cancelUrl,
    allow_promotion_codes: true,
    metadata: {
      xpersona_product: "crawl_license",
      xpersona_package_id: pkg.id,
      xpersona_email: email,
      source: "crawl_license_checkout",
    },
  });

  if (!session.url) {
    const res = NextResponse.json(
      {
        success: false,
        error: {
          code: "CHECKOUT_URL_MISSING",
          message: "Stripe checkout session did not return a URL.",
        },
      },
      { status: 500 }
    );
    applyRequestIdHeader(res, req);
    return res;
  }

  const res = NextResponse.json({
    success: true,
    data: {
      url: session.url,
      sessionId: session.id,
      package: {
        id: pkg.id,
        credits: pkg.credits,
      },
    },
  });
  applyRequestIdHeader(res, req);
  return res;
}

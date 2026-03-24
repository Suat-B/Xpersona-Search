import { NextRequest, NextResponse } from "next/server";
import { applyRequestIdHeader } from "@/lib/api/errors";
import { getCrawlApiKeyFromHeaders, getCrawlLicenseUrls } from "@/lib/crawl-license";
import {
  authenticateCrawlCustomerByApiKey,
  getCrawlCustomerStatus,
} from "@/lib/crawl-license-store";

export async function GET(req: NextRequest) {
  const apiKey = getCrawlApiKeyFromHeaders(req.headers);
  const customer = await authenticateCrawlCustomerByApiKey(apiKey);
  if (!customer) {
    const res = NextResponse.json(
      {
        success: false,
        error: {
          code: "UNAUTHORIZED",
          message: "Valid crawl API key required.",
        },
      },
      { status: 401 }
    );
    applyRequestIdHeader(res, req);
    return res;
  }

  const status = await getCrawlCustomerStatus(customer.id);
  const urls = getCrawlLicenseUrls(req.nextUrl.origin);
  const res = NextResponse.json({
    success: true,
    data: {
      customer: {
        id: status.customer.id,
        email: status.customer.email,
        keyPrefix: status.customer.apiKeyPrefix,
        creditBalance: status.customer.creditBalance,
        status: status.customer.status,
      },
      lastPurchase: status.lastPurchase,
      topUpUrl: urls.checkoutUrl,
      rotateKeyUrl: urls.rotateKeyUrl,
      tokenUrl: urls.licenseUrl,
    },
  });
  applyRequestIdHeader(res, req);
  return res;
}

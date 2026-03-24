import { NextRequest, NextResponse } from "next/server";
import { applyRequestIdHeader } from "@/lib/api/errors";
import { getCrawlApiKeyFromHeaders } from "@/lib/crawl-license";
import {
  authenticateCrawlCustomerByApiKey,
  rotateCrawlCustomerApiKey,
} from "@/lib/crawl-license-store";

export async function POST(req: NextRequest) {
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

  const rotated = await rotateCrawlCustomerApiKey(customer.id);
  const res = NextResponse.json({
    success: true,
    data: {
      apiKey: rotated.rawKey,
      keyPrefix: rotated.keyPrefix,
      note: "This raw key is only shown once. Store it securely.",
    },
  });
  applyRequestIdHeader(res, req);
  return res;
}

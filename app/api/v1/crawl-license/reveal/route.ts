import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { applyRequestIdHeader } from "@/lib/api/errors";
import { revealCrawlCheckoutApiKey } from "@/lib/crawl-license-store";

const revealSchema = z.object({
  sessionId: z.string().min(1),
});

export async function POST(req: NextRequest) {
  const parsed = revealSchema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) {
    const res = NextResponse.json(
      {
        success: false,
        error: {
          code: "INVALID_BODY",
          message: "sessionId is required.",
        },
      },
      { status: 400 }
    );
    res.headers.set("Cache-Control", "no-store");
    applyRequestIdHeader(res, req);
    return res;
  }

  const revealed = await revealCrawlCheckoutApiKey(parsed.data.sessionId);
  let res: NextResponse;

  if (!revealed.ok) {
    if (revealed.reason === "PROCESSING") {
      res = NextResponse.json(
        {
          success: false,
          error: {
            code: "CHECKOUT_PROCESSING",
            message: "Payment is confirmed, but crawl license provisioning is still finishing.",
          },
        },
        { status: 202 }
      );
      res.headers.set("Retry-After", "2");
    } else if (revealed.reason === "ALREADY_REVEALED") {
      res = NextResponse.json(
        {
          success: false,
          error: {
            code: "API_KEY_ALREADY_REVEALED",
            message: "This API key has already been shown once for this checkout session.",
          },
        },
        { status: 409 }
      );
    } else if (revealed.reason === "UNPAID") {
      res = NextResponse.json(
        {
          success: false,
          error: {
            code: "CHECKOUT_UNPAID",
            message: "This checkout session is not paid.",
          },
        },
        { status: 402 }
      );
    } else if (revealed.reason === "MISCONFIGURED") {
      res = NextResponse.json(
        {
          success: false,
          error: {
            code: "MISCONFIGURED",
            message: "CRAWL_LICENSE_SECRET must be configured to reveal API keys.",
          },
        },
        { status: 500 }
      );
    } else {
      res = NextResponse.json(
        {
          success: false,
          error: {
            code: "NOT_FOUND",
            message: "No crawl checkout session was found for that sessionId.",
          },
        },
        { status: 404 }
      );
    }

    res.headers.set("Cache-Control", "no-store");
    applyRequestIdHeader(res, req);
    return res;
  }

  res = NextResponse.json({
    success: true,
    data:
      revealed.kind === "revealed"
        ? {
            state: "revealed",
            apiKey: revealed.apiKey,
            keyPrefix: revealed.keyPrefix,
            credits: revealed.credits,
            packageId: revealed.packageId,
            note: "This raw API key is only shown once. Store it securely now.",
          }
        : {
            state: "top_up",
            keyPrefix: revealed.keyPrefix,
            credits: revealed.credits,
            packageId: revealed.packageId,
            message:
              "No new API key was issued for this purchase. Your existing crawl license received a credit top-up.",
          },
  });
  res.headers.set("Cache-Control", "no-store");
  applyRequestIdHeader(res, req);
  return res;
}

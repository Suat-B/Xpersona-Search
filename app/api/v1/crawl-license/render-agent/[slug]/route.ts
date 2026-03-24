import { NextRequest, NextResponse } from "next/server";
import { applyRequestIdHeader } from "@/lib/api/errors";
import { INTERNAL_CRAWL_RENDER_HEADER } from "@/lib/crawl-license";
import { consumeCrawlCreditForRequest } from "@/lib/crawl-license-store";

function copyProxyHeaders(source: Headers, target: Headers) {
  const passthrough = ["content-type", "cache-control", "etag", "vary"] as const;
  for (const key of passthrough) {
    const value = source.get(key);
    if (value) target.set(key, value);
  }
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  const { slug } = await params;
  if (!slug) {
    const res = NextResponse.json(
      {
        success: false,
        error: {
          code: "BAD_REQUEST",
          message: "Missing agent slug.",
        },
      },
      { status: 400 }
    );
    applyRequestIdHeader(res, req);
    return res;
  }

  const crawlChargeResponse = await consumeCrawlCreditForRequest(req, `/agent/${slug}`);
  if (crawlChargeResponse) {
    applyRequestIdHeader(crawlChargeResponse, req);
    return crawlChargeResponse;
  }

  const upstreamUrl = new URL(`/agent/${slug}${req.nextUrl.search}`, req.nextUrl.origin);
  const upstreamHeaders = new Headers(req.headers);
  upstreamHeaders.set(INTERNAL_CRAWL_RENDER_HEADER, "1");
  const upstreamResponse = await fetch(upstreamUrl, {
    headers: upstreamHeaders,
    redirect: "manual",
  });

  const res = new NextResponse(upstreamResponse.body, {
    status: upstreamResponse.status,
  });
  copyProxyHeaders(upstreamResponse.headers, res.headers);
  applyRequestIdHeader(res, req);
  return res;
}

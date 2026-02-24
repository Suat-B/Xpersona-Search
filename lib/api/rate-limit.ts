import { NextResponse } from "next/server";

export function rateLimitHeaders(opts: {
  retryAfter?: number;
  remaining?: number;
  limit?: number;
}): Headers {
  const headers = new Headers();
  if (opts.retryAfter != null) headers.set("Retry-After", String(opts.retryAfter));
  if (opts.remaining != null) headers.set("X-RateLimit-Remaining", String(opts.remaining));
  if (opts.limit != null) headers.set("X-RateLimit-Limit", String(opts.limit));
  return headers;
}

export function rateLimitedJson(
  message = "Too many requests. Please try again later.",
  opts: {
    retryAfter?: number;
    remaining?: number;
    limit?: number;
  } = {}
): NextResponse {
  return NextResponse.json({ error: message }, { status: 429, headers: rateLimitHeaders(opts) });
}

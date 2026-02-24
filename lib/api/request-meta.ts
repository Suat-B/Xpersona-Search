import { API_VERSION } from "@/lib/api/contracts";

export const REQUEST_ID_HEADER = "X-Request-Id";
export const INTERNAL_V1_PROXY_HEADER = "x-internal-api-proxy";

export const PASSTHROUGH_RESPONSE_HEADERS = [
  "Cache-Control",
  "Retry-After",
  "X-RateLimit-Limit",
  "X-RateLimit-Remaining",
  "X-RateLimit-Reset",
  "ETag",
] as const;

export function getOrCreateRequestId(request: Request): string {
  const incoming = request.headers.get(REQUEST_ID_HEADER);
  if (incoming && incoming.trim().length > 0) {
    return incoming.trim();
  }
  return crypto.randomUUID();
}

export function applyResponseMetaHeaders(
  headers: Headers,
  requestId: string
): Headers {
  headers.set(REQUEST_ID_HEADER, requestId);
  headers.set("X-API-Version", API_VERSION);
  return headers;
}

export function cloneHeadersWithProxyBypass(
  request: Request,
  requestId: string
): Headers {
  const headers = new Headers(request.headers);
  headers.delete("host");
  headers.set(INTERNAL_V1_PROXY_HEADER, "1");
  headers.set(REQUEST_ID_HEADER, requestId);
  return headers;
}

export function copyPassthroughHeaders(from: Headers, to: Headers): void {
  for (const key of PASSTHROUGH_RESPONSE_HEADERS) {
    const value = from.get(key);
    if (value) {
      to.set(key, value);
    }
  }
}

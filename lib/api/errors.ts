import { NextResponse } from "next/server";
import { applyResponseMetaHeaders, getOrCreateRequestId } from "@/lib/api/request-meta";

export type ApiErrorParams = {
  code: string;
  message: string;
  status: number;
  details?: unknown;
  retryAfterMs?: number;
  retryable?: boolean;
};

export function jsonError(request: Request, params: ApiErrorParams): NextResponse {
  const requestId = getOrCreateRequestId(request);
  const headers = applyResponseMetaHeaders(new Headers(), requestId);
  if (params.retryAfterMs && params.retryAfterMs > 0) {
    headers.set("Retry-After", String(Math.ceil(params.retryAfterMs / 1000)));
  }
  return NextResponse.json(
    {
      error: {
        code: params.code,
        message: params.message,
        ...(params.details !== undefined ? { details: params.details } : {}),
        ...(params.retryAfterMs ? { retryAfterMs: params.retryAfterMs } : {}),
        ...(params.retryable !== undefined ? { retryable: params.retryable } : {}),
      },
      requestId,
    },
    { status: params.status, headers }
  );
}

export function applyRequestIdHeader(response: NextResponse, request: Request): void {
  const requestId = getOrCreateRequestId(request);
  applyResponseMetaHeaders(response.headers, requestId);
}

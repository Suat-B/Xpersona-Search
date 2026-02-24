import { NextResponse } from "next/server";

export const API_VERSION = "v1" as const;

export type ApiMeta = {
  requestId: string;
  version: typeof API_VERSION;
  timestamp: string;
};

export type ApiSuccess<T> = {
  success: true;
  data: T;
  meta: ApiMeta;
};

export type ApiErrorCode =
  | "BAD_REQUEST"
  | "UNAUTHORIZED"
  | "FORBIDDEN"
  | "NOT_FOUND"
  | "METHOD_NOT_ALLOWED"
  | "CONFLICT"
  | "RATE_LIMITED"
  | "API_VERSION_DEPRECATED"
  | "UPSTREAM_ERROR"
  | "INTERNAL_ERROR";

export type ApiErrorBody = {
  success: false;
  error: {
    code: ApiErrorCode | string;
    message: string;
    details?: unknown;
    retryable?: boolean;
  };
  meta: ApiMeta;
};

export function buildMeta(requestId: string, at = new Date()): ApiMeta {
  return {
    requestId,
    version: API_VERSION,
    timestamp: at.toISOString(),
  };
}

export function ok<T>(
  data: T,
  opts: {
    requestId: string;
    status?: number;
    headers?: HeadersInit;
    at?: Date;
  }
): NextResponse<ApiSuccess<T>> {
  return NextResponse.json(
    {
      success: true,
      data,
      meta: buildMeta(opts.requestId, opts.at),
    },
    { status: opts.status ?? 200, headers: opts.headers }
  );
}

export function fail(
  params: {
    code: ApiErrorCode | string;
    message: string;
    details?: unknown;
    retryable?: boolean;
  },
  opts: {
    requestId: string;
    status: number;
    headers?: HeadersInit;
    at?: Date;
  }
): NextResponse<ApiErrorBody> {
  return NextResponse.json(
    {
      success: false,
      error: {
        code: params.code,
        message: params.message,
        ...(params.details !== undefined ? { details: params.details } : {}),
        ...(params.retryable !== undefined ? { retryable: params.retryable } : {}),
      },
      meta: buildMeta(opts.requestId, opts.at),
    },
    { status: opts.status, headers: opts.headers }
  );
}

export function inferErrorCode(status: number, body: unknown): ApiErrorCode | string {
  if (body && typeof body === "object" && "error" in body) {
    const raw = (body as { error?: unknown }).error;
    if (typeof raw === "string" && raw.trim().length > 0) {
      return raw;
    }
    if (raw && typeof raw === "object" && "code" in raw) {
      const code = (raw as { code?: unknown }).code;
      if (typeof code === "string" && code.trim().length > 0) {
        return code;
      }
    }
  }

  if (status === 400) return "BAD_REQUEST";
  if (status === 401) return "UNAUTHORIZED";
  if (status === 403) return "FORBIDDEN";
  if (status === 404) return "NOT_FOUND";
  if (status === 405) return "METHOD_NOT_ALLOWED";
  if (status === 409) return "CONFLICT";
  if (status === 429) return "RATE_LIMITED";
  if (status >= 500) return "INTERNAL_ERROR";
  return "UPSTREAM_ERROR";
}

import { NextResponse } from "next/server";
import { applyResponseMetaHeaders, getOrCreateRequestId } from "@/lib/api/request-meta";
import { jsonError } from "@/lib/api/errors";
import { z } from "zod";

export function ok(request: Request, data: unknown, status = 200): NextResponse {
  const requestId = getOrCreateRequestId(request);
  const headers = applyResponseMetaHeaders(new Headers(), requestId);
  return NextResponse.json({ success: true, data, requestId }, { status, headers });
}

export function badRequest(request: Request, message: string, details?: unknown): NextResponse {
  return jsonError(request, { code: "BAD_REQUEST", message, status: 400, details });
}

export function unauthorized(request: Request): NextResponse {
  return jsonError(request, {
    code: "UNAUTHORIZED",
    message: "Invalid or missing API key",
    status: 401,
  });
}

export function serverError(request: Request, error: unknown): NextResponse {
  return jsonError(request, {
    code: "INTERNAL_ERROR",
    message: error instanceof Error ? error.message : "Internal server error",
    status: 500,
  });
}

export function parseBody<T>(request: Request, schema: z.ZodType<T>):
  Promise<{ success: true; data: T } | { success: false; response: NextResponse }> {
  return request
    .json()
    .then((raw) => {
      const parsed = schema.safeParse(raw);
      if (!parsed.success) {
        return {
          success: false as const,
          response: badRequest(request, "Invalid request body", parsed.error.flatten()),
        };
      }
      return { success: true as const, data: parsed.data };
    })
    .catch(() => ({ success: false as const, response: badRequest(request, "Invalid JSON body") }));
}


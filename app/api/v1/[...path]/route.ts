import { NextRequest, NextResponse } from "next/server";
import { fail, inferErrorCode, ok } from "@/lib/api/contracts";
import { GET as getSearchAi } from "@/app/api/search/ai/route";
import {
  applyResponseMetaHeaders,
  cloneHeadersWithProxyBypass,
  copyPassthroughHeaders,
  getOrCreateRequestId,
} from "@/lib/api/request-meta";
import { fetchWithTimeout } from "@/lib/api/fetch-timeout";

type RouteContext = {
  params: Promise<{ path: string[] }>;
};

function extractSuccessData(body: unknown): unknown {
  if (!body || typeof body !== "object") return body;
  const record = body as Record<string, unknown>;
  if (record.success === true) {
    if ("data" in record) return record.data;
    const { success, meta, ...rest } = record;
    void success;
    void meta;
    return rest;
  }
  return body;
}

function extractErrorMessage(status: number, body: unknown): string {
  if (!body || typeof body !== "object") {
    return `Upstream request failed (${status})`;
  }
  const record = body as Record<string, unknown>;
  if (typeof record.error === "string") return record.error;
  if (record.error && typeof record.error === "object") {
    const msg = (record.error as { message?: unknown }).message;
    if (typeof msg === "string" && msg.trim().length > 0) return msg;
  }
  if (typeof record.message === "string") return record.message;
  return `Upstream request failed (${status})`;
}

function extractErrorDetails(body: unknown): unknown {
  if (!body || typeof body !== "object") return undefined;
  const record = body as Record<string, unknown>;
  if (record.error && typeof record.error === "object" && "details" in record.error) {
    return (record.error as { details?: unknown }).details;
  }
  if ("details" in record) return record.details;
  return undefined;
}

function parseJsonIfPossible(raw: string): unknown {
  try {
    return JSON.parse(raw);
  } catch {
    return raw;
  }
}

async function proxyToLegacy(req: NextRequest, ctx: RouteContext): Promise<NextResponse> {
  const startedAt = Date.now();
  const { path } = await ctx.params;
  const requestId = getOrCreateRequestId(req);
  const pathText = path.join("/");

  // Guard explicit v1 routes that may otherwise fall through to this catch-all
  // during runtime route resolution edge-cases.
  if (req.method.toUpperCase() === "GET" && pathText === "search/ai") {
    return getSearchAi(req);
  }

  const legacyPath = `/api/${pathText}${req.nextUrl.search}`;
  const target = new URL(legacyPath, req.nextUrl.origin);

  const method = req.method.toUpperCase();
  const headers = cloneHeadersWithProxyBypass(req, requestId);
  const init: RequestInit = {
    method,
    headers,
    redirect: "manual",
  };

  if (!["GET", "HEAD"].includes(method)) {
    init.body = await req.arrayBuffer();
  }

  try {
    const upstream = await fetchWithTimeout(
      target,
      init,
      Number(process.env.API_UPSTREAM_TIMEOUT_MS ?? "8000")
    );
    const responseHeaders = applyResponseMetaHeaders(new Headers(), requestId);
    copyPassthroughHeaders(upstream.headers, responseHeaders);

    const isHead = method === "HEAD";
    const raw = isHead ? "" : await upstream.text();
    const parsedBody = raw.length > 0 ? parseJsonIfPossible(raw) : null;
    const latencyMs = Date.now() - startedAt;

    if (upstream.ok) {
      if (isHead) {
        console.info(
          "[api.v1]",
          JSON.stringify({
            requestId,
            route: `/api/v1/${pathText}`,
            status: upstream.status,
            latencyMs,
          })
        );
        return new NextResponse(null, { status: upstream.status, headers: responseHeaders });
      }

      const data = extractSuccessData(parsedBody);
      const response = ok(data, {
        requestId,
        status: upstream.status,
        headers: responseHeaders,
      });
      console.info(
        "[api.v1]",
        JSON.stringify({
          requestId,
          route: `/api/v1/${pathText}`,
          status: upstream.status,
          latencyMs,
        })
      );
      return response;
    }

    const errorCode = inferErrorCode(upstream.status, parsedBody);
    const errorMessage = extractErrorMessage(upstream.status, parsedBody);
    const errorDetails = extractErrorDetails(parsedBody);
    const response = fail(
      {
        code: errorCode,
        message: errorMessage,
        details: errorDetails,
        retryable: upstream.status >= 500,
      },
      {
        requestId,
        status: upstream.status,
        headers: responseHeaders,
      }
    );
    console.info(
      "[api.v1]",
      JSON.stringify({
        requestId,
        route: `/api/v1/${pathText}`,
        status: upstream.status,
        error: { code: errorCode },
        latencyMs,
      })
    );
    return response;
  } catch (err) {
    const response = fail(
      {
        code: "UPSTREAM_ERROR",
        message: "Failed to reach legacy endpoint",
        details: process.env.NODE_ENV === "production" ? undefined : String(err),
        retryable: true,
      },
      {
        requestId,
        status: 502,
        headers: applyResponseMetaHeaders(new Headers(), requestId),
      }
    );
    console.info(
      "[api.v1]",
      JSON.stringify({
        requestId,
        route: `/api/v1/${pathText}`,
        status: 502,
        error: { code: "UPSTREAM_ERROR" },
        latencyMs: Date.now() - startedAt,
      })
    );
    return response;
  }
}

export async function GET(req: NextRequest, ctx: RouteContext) {
  return proxyToLegacy(req, ctx);
}

export async function POST(req: NextRequest, ctx: RouteContext) {
  return proxyToLegacy(req, ctx);
}

export async function PUT(req: NextRequest, ctx: RouteContext) {
  return proxyToLegacy(req, ctx);
}

export async function PATCH(req: NextRequest, ctx: RouteContext) {
  return proxyToLegacy(req, ctx);
}

export async function DELETE(req: NextRequest, ctx: RouteContext) {
  return proxyToLegacy(req, ctx);
}

export async function OPTIONS(req: NextRequest, ctx: RouteContext) {
  return proxyToLegacy(req, ctx);
}

export async function HEAD(req: NextRequest, ctx: RouteContext) {
  return proxyToLegacy(req, ctx);
}

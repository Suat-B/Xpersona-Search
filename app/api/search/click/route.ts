import { NextRequest, NextResponse } from "next/server";
import { z, ZodError } from "zod";
import { recordSearchClick, hashQuery } from "@/lib/search/click-tracking";
import {
  checkSearchRateLimit,
  SEARCH_ANON_RATE_LIMIT,
  SEARCH_AUTH_RATE_LIMIT,
} from "@/lib/search/rate-limit";
import { getAuthUser } from "@/lib/auth-utils";
import { applyRequestIdHeader, jsonError } from "@/lib/api/errors";

const ClickSchema = z.object({
  query: z.string().min(1).max(500),
  agentId: z.string().uuid(),
  position: z.number().int().min(0).max(1000),
});

const IDEMPOTENCY_WINDOW_MS = 2 * 60 * 1000;
const idempotencyStore = new Map<string, number>();

function seenIdempotencyKey(key: string): boolean {
  const now = Date.now();
  for (const [k, expiresAt] of idempotencyStore.entries()) {
    if (expiresAt <= now) idempotencyStore.delete(k);
  }
  const expires = idempotencyStore.get(key);
  if (expires && expires > now) return true;
  idempotencyStore.set(key, now + IDEMPOTENCY_WINDOW_MS);
  return false;
}

export async function POST(req: NextRequest) {
  const authProbe = await getAuthUser(req);
  const userId = "error" in authProbe ? undefined : authProbe.user.id;
  const isAuthenticated = Boolean(userId);
  const rateLimitLimit = isAuthenticated
    ? SEARCH_AUTH_RATE_LIMIT
    : SEARCH_ANON_RATE_LIMIT;
  const rlResult = await checkSearchRateLimit(req, isAuthenticated);
  if (!rlResult.allowed) {
    const response = jsonError(req, {
      code: "RATE_LIMITED",
      message: "Too many requests",
      status: 429,
      retryAfterMs: (rlResult.retryAfter ?? 60) * 1000,
    });
    response.headers.set("X-RateLimit-Remaining", "0");
    response.headers.set("X-RateLimit-Limit", String(rateLimitLimit));
    return response;
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return jsonError(req, {
      code: "BAD_REQUEST",
      message: "Invalid JSON",
      status: 400,
    });
  }

  let params: z.infer<typeof ClickSchema>;
  try {
    params = ClickSchema.parse(body);
  } catch (err) {
    if (err instanceof ZodError) {
      const msg = err.errors.map((e) => `${e.path.join(".")}: ${e.message}`).join("; ");
      return jsonError(req, {
        code: "BAD_REQUEST",
        message: msg,
        status: 400,
      });
    }
    throw err;
  }

  const queryHash = hashQuery(params.query);
  const idempotencyHeader = req.headers.get("idempotency-key")?.trim();
  if (idempotencyHeader) {
    const idempotencyToken = `${idempotencyHeader}:${queryHash}:${params.agentId}:${params.position}:${userId ?? "anon"}`;
    if (seenIdempotencyKey(idempotencyToken)) {
      const response = NextResponse.json(
        { ok: true, deduped: true },
        {
          status: 200,
          headers: {
            "X-RateLimit-Remaining": String(rlResult.remaining ?? 0),
            "X-RateLimit-Limit": String(rateLimitLimit),
          },
        }
      );
      applyRequestIdHeader(response, req);
      return response;
    }
  }

  await recordSearchClick({
    queryHash,
    agentId: params.agentId,
    position: params.position,
    userId,
  });

  const response = NextResponse.json(
    { ok: true },
    {
      status: 200,
      headers: {
        "X-RateLimit-Remaining": String(rlResult.remaining ?? 0),
        "X-RateLimit-Limit": String(rateLimitLimit),
      },
    }
  );
  applyRequestIdHeader(response, req);
  return response;
}

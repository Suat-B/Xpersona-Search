/**
 * Rate limiter for search API endpoints.
 * Uses Upstash Redis when configured; falls back to in-memory sliding window.
 *
 * Limits:
 *   - Anonymous: 60 req/min
 *   - Authenticated: 120 req/min
 */

const ANON_LIMIT = 60;
const AUTH_LIMIT = 120;
const WINDOW_SEC = 60;

export interface SearchRateLimitResult {
  allowed: boolean;
  retryAfter?: number;
  remaining?: number;
}

function getClientIp(request: Request): string {
  const forwarded = request.headers.get("x-forwarded-for");
  const realIp = request.headers.get("x-real-ip");
  if (forwarded) return forwarded.split(",")[0].trim();
  if (realIp) return realIp;
  return "unknown";
}

function isUpstashConfigured(): boolean {
  const url = process.env.UPSTASH_REDIS_REST_URL?.trim();
  const token = process.env.UPSTASH_REDIS_REST_TOKEN?.trim();
  return !!url && !!token;
}

/* --- In-memory fallback --- */

interface RateLimitEntry {
  count: number;
  resetAt: number;
}

const searchStore = new Map<string, RateLimitEntry>();

const CLEANUP_INTERVAL_MS = 120_000;
let lastCleanup = Date.now();

function cleanup() {
  const now = Date.now();
  if (now - lastCleanup < CLEANUP_INTERVAL_MS) return;
  lastCleanup = now;
  for (const [key, entry] of searchStore.entries()) {
    if (entry.resetAt < now) searchStore.delete(key);
  }
}

function checkInMemory(
  request: Request,
  isAuthenticated: boolean
): SearchRateLimitResult {
  cleanup();
  const key = `search:${getClientIp(request)}`;
  const limit = isAuthenticated ? AUTH_LIMIT : ANON_LIMIT;
  const now = Date.now();
  const windowMs = WINDOW_SEC * 1000;
  const entry = searchStore.get(key);

  if (!entry || entry.resetAt < now) {
    searchStore.set(key, { count: 1, resetAt: now + windowMs });
    return { allowed: true, remaining: limit - 1 };
  }

  entry.count++;
  if (entry.count <= limit) {
    return { allowed: true, remaining: limit - entry.count };
  }

  return {
    allowed: false,
    retryAfter: Math.ceil((entry.resetAt - now) / 1000),
    remaining: 0,
  };
}

/* --- Upstash Redis --- */

async function checkUpstash(
  request: Request,
  isAuthenticated: boolean
): Promise<SearchRateLimitResult> {
  const { Ratelimit } = await import("@upstash/ratelimit");
  const { Redis } = await import("@upstash/redis");

  const redis = new Redis({
    url: process.env.UPSTASH_REDIS_REST_URL!,
    token: process.env.UPSTASH_REDIS_REST_TOKEN!,
  });

  const limit = isAuthenticated ? AUTH_LIMIT : ANON_LIMIT;
  const ratelimit = new Ratelimit({
    redis,
    limiter: Ratelimit.slidingWindow(limit, `${WINDOW_SEC} s`),
    prefix: "search:api",
  });

  const key = getClientIp(request);
  const { success, reset, remaining } = await ratelimit.limit(key);

  if (success) {
    return { allowed: true, remaining };
  }

  return {
    allowed: false,
    retryAfter: Math.max(1, Math.ceil((reset - Date.now()) / 1000)),
    remaining: 0,
  };
}

/* --- Public API --- */

/**
 * Checks search rate limit for a request.
 * @param request - The incoming request
 * @param isAuthenticated - Whether the user is authenticated (higher limit)
 */
export function checkSearchRateLimit(
  request: Request,
  isAuthenticated = false
): SearchRateLimitResult | Promise<SearchRateLimitResult> {
  if (isUpstashConfigured()) return checkUpstash(request, isAuthenticated);
  return checkInMemory(request, isAuthenticated);
}

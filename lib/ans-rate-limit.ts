/**
 * Simple in-memory rate limiting for ANS APIs.
 * Per XPERSONA ANS.MD: 429 "Too many requests. Wait a moment."
 * For production at scale, consider @upstash/ratelimit or Redis.
 */

interface RateLimitEntry {
  count: number;
  resetAt: number;
}

const CHECK_LIMIT = 60; // requests per window
const CHECK_WINDOW_MS = 60_000; // 1 minute
const REGISTER_LIMIT = 10;
const REGISTER_WINDOW_MS = 60_000;

const checkStore = new Map<string, RateLimitEntry>();
const registerStore = new Map<string, RateLimitEntry>();

const CLEANUP_INTERVAL_MS = 120_000; // clean expired entries every 2 min
let lastCleanup = Date.now();

function cleanup(store: Map<string, RateLimitEntry>) {
  const now = Date.now();
  if (now - lastCleanup < CLEANUP_INTERVAL_MS) return;
  lastCleanup = now;
  for (const [key, entry] of store.entries()) {
    if (entry.resetAt < now) store.delete(key);
  }
}

function getClientKey(request: Request): string {
  const forwarded = request.headers.get("x-forwarded-for");
  const realIp = request.headers.get("x-real-ip");
  if (forwarded) return forwarded.split(",")[0].trim();
  if (realIp) return realIp;
  return "unknown";
}

export interface RateLimitResult {
  allowed: boolean;
  retryAfter?: number;
}

export function checkAnsCheckLimit(request: Request): RateLimitResult {
  cleanup(checkStore);
  const key = getClientKey(request);
  const now = Date.now();
  const entry = checkStore.get(key);

  if (!entry) {
    checkStore.set(key, { count: 1, resetAt: now + CHECK_WINDOW_MS });
    return { allowed: true };
  }

  if (entry.resetAt < now) {
    checkStore.set(key, { count: 1, resetAt: now + CHECK_WINDOW_MS });
    return { allowed: true };
  }

  entry.count++;
  if (entry.count <= CHECK_LIMIT) {
    return { allowed: true };
  }

  return {
    allowed: false,
    retryAfter: Math.ceil((entry.resetAt - now) / 1000),
  };
}

export function checkAnsRegisterLimit(request: Request): RateLimitResult {
  cleanup(registerStore);
  const key = getClientKey(request);
  const now = Date.now();
  const entry = registerStore.get(key);

  if (!entry) {
    registerStore.set(key, { count: 1, resetAt: now + REGISTER_WINDOW_MS });
    return { allowed: true };
  }

  if (entry.resetAt < now) {
    registerStore.set(key, { count: 1, resetAt: now + REGISTER_WINDOW_MS });
    return { allowed: true };
  }

  entry.count++;
  if (entry.count <= REGISTER_LIMIT) {
    return { allowed: true };
  }

  return {
    allowed: false,
    retryAfter: Math.ceil((entry.resetAt - now) / 1000),
  };
}

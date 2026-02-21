/**
 * Rate limiting for ANS APIs. Per XPERSONA ANS.MD: 429 "Too many requests. Wait a moment."
 * Uses Upstash Redis when UPSTASH_REDIS_REST_URL and UPSTASH_REDIS_REST_TOKEN are set;
 * otherwise falls back to in-memory (per-instance, not suitable for multi-instance deployment).
 */

const CHECK_LIMIT = 60;
const CHECK_WINDOW_SEC = 60;
const REGISTER_LIMIT = 10;
const REGISTER_WINDOW_SEC = 60;

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

const checkStore = new Map<string, RateLimitEntry>();
const registerStore = new Map<string, RateLimitEntry>();

const CLEANUP_INTERVAL_MS = 120_000;
let lastCleanup = Date.now();

function cleanup(store: Map<string, RateLimitEntry>) {
  const now = Date.now();
  if (now - lastCleanup < CLEANUP_INTERVAL_MS) return;
  lastCleanup = now;
  for (const [key, entry] of store.entries()) {
    if (entry.resetAt < now) store.delete(key);
  }
}

function checkInMemory(request: Request): RateLimitResult {
  cleanup(checkStore);
  const key = getClientKey(request);
  const now = Date.now();
  const entry = checkStore.get(key);
  const windowMs = CHECK_WINDOW_SEC * 1000;

  if (!entry) {
    checkStore.set(key, { count: 1, resetAt: now + windowMs });
    return { allowed: true };
  }
  if (entry.resetAt < now) {
    checkStore.set(key, { count: 1, resetAt: now + windowMs });
    return { allowed: true };
  }
  entry.count++;
  if (entry.count <= CHECK_LIMIT) return { allowed: true };
  return {
    allowed: false,
    retryAfter: Math.ceil((entry.resetAt - now) / 1000),
  };
}

function registerInMemory(request: Request): RateLimitResult {
  cleanup(registerStore);
  const key = getClientKey(request);
  const now = Date.now();
  const entry = registerStore.get(key);
  const windowMs = REGISTER_WINDOW_SEC * 1000;

  if (!entry) {
    registerStore.set(key, { count: 1, resetAt: now + windowMs });
    return { allowed: true };
  }
  if (entry.resetAt < now) {
    registerStore.set(key, { count: 1, resetAt: now + windowMs });
    return { allowed: true };
  }
  entry.count++;
  if (entry.count <= REGISTER_LIMIT) return { allowed: true };
  return {
    allowed: false,
    retryAfter: Math.ceil((entry.resetAt - now) / 1000),
  };
}

/* --- Upstash Redis --- */

async function checkUpstash(request: Request): Promise<RateLimitResult> {
  const { Ratelimit } = await import("@upstash/ratelimit");
  const { Redis } = await import("@upstash/redis");

  const redis = new Redis({
    url: process.env.UPSTASH_REDIS_REST_URL!,
    token: process.env.UPSTASH_REDIS_REST_TOKEN!,
  });
  const ratelimit = new Ratelimit({
    redis,
    limiter: Ratelimit.slidingWindow(CHECK_LIMIT, `${CHECK_WINDOW_SEC} s`),
    prefix: "ans:check",
  });

  const key = getClientKey(request);
  const { success, reset } = await ratelimit.limit(key);

  return success
    ? { allowed: true }
    : {
        allowed: false,
        retryAfter: Math.max(1, Math.ceil((reset - Date.now()) / 1000)),
      };
}

async function registerUpstash(request: Request): Promise<RateLimitResult> {
  const { Ratelimit } = await import("@upstash/ratelimit");
  const { Redis } = await import("@upstash/redis");

  const redis = new Redis({
    url: process.env.UPSTASH_REDIS_REST_URL!,
    token: process.env.UPSTASH_REDIS_REST_TOKEN!,
  });
  const ratelimit = new Ratelimit({
    redis,
    limiter: Ratelimit.slidingWindow(REGISTER_LIMIT, `${REGISTER_WINDOW_SEC} s`),
    prefix: "ans:register",
  });

  const key = getClientKey(request);
  const { success, reset } = await ratelimit.limit(key);

  return success
    ? { allowed: true }
    : {
        allowed: false,
        retryAfter: Math.max(1, Math.ceil((reset - Date.now()) / 1000)),
      };
}

/* --- Public API --- */

export function checkAnsCheckLimit(request: Request): RateLimitResult | Promise<RateLimitResult> {
  if (isUpstashConfigured()) return checkUpstash(request);
  return checkInMemory(request);
}

export function checkAnsRegisterLimit(request: Request): RateLimitResult | Promise<RateLimitResult> {
  if (isUpstashConfigured()) return registerUpstash(request);
  return registerInMemory(request);
}

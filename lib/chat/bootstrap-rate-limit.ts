import { Ratelimit } from "@upstash/ratelimit";
import { Redis } from "@upstash/redis";

const CHAT_BOOTSTRAP_ANON_LIMIT = 10;
const CHAT_BOOTSTRAP_WINDOW_SEC = 10 * 60;

type BootstrapRateLimit = {
  allowed: boolean;
  remaining: number;
  retryAfter?: number;
};

type MemoryEntry = {
  count: number;
  resetAtMs: number;
};

const memoryStore = new Map<string, MemoryEntry>();
let lastCleanupAt = Date.now();
const CLEANUP_INTERVAL_MS = 60_000;

function getClientIp(request: Request): string {
  const forwarded = request.headers.get("x-forwarded-for");
  const realIp = request.headers.get("x-real-ip");
  if (forwarded) return forwarded.split(",")[0].trim();
  if (realIp) return realIp.trim();
  return "unknown";
}

function isUpstashReady(): boolean {
  return Boolean(process.env.UPSTASH_REDIS_REST_URL?.trim() && process.env.UPSTASH_REDIS_REST_TOKEN?.trim());
}

function cleanupMemoryStore(): void {
  const now = Date.now();
  if (now - lastCleanupAt < CLEANUP_INTERVAL_MS) return;
  lastCleanupAt = now;
  for (const [key, value] of memoryStore.entries()) {
    if (value.resetAtMs <= now) memoryStore.delete(key);
  }
}

function checkMemoryLimit(request: Request): BootstrapRateLimit {
  cleanupMemoryStore();
  const now = Date.now();
  const key = `chat-bootstrap:${getClientIp(request)}`;
  const windowMs = CHAT_BOOTSTRAP_WINDOW_SEC * 1000;
  const entry = memoryStore.get(key);
  if (!entry || entry.resetAtMs <= now) {
    memoryStore.set(key, { count: 1, resetAtMs: now + windowMs });
    return { allowed: true, remaining: CHAT_BOOTSTRAP_ANON_LIMIT - 1 };
  }
  entry.count += 1;
  if (entry.count <= CHAT_BOOTSTRAP_ANON_LIMIT) {
    return { allowed: true, remaining: CHAT_BOOTSTRAP_ANON_LIMIT - entry.count };
  }
  return {
    allowed: false,
    remaining: 0,
    retryAfter: Math.max(1, Math.ceil((entry.resetAtMs - now) / 1000)),
  };
}

async function checkUpstashLimit(request: Request): Promise<BootstrapRateLimit> {
  const redis = new Redis({
    url: process.env.UPSTASH_REDIS_REST_URL!,
    token: process.env.UPSTASH_REDIS_REST_TOKEN!,
  });
  const limiter = new Ratelimit({
    redis,
    limiter: Ratelimit.slidingWindow(CHAT_BOOTSTRAP_ANON_LIMIT, `${CHAT_BOOTSTRAP_WINDOW_SEC} s`),
    prefix: "chat:bootstrap",
  });
  const { success, remaining, reset } = await limiter.limit(getClientIp(request));
  if (success) {
    return { allowed: true, remaining };
  }
  return {
    allowed: false,
    remaining: 0,
    retryAfter: Math.max(1, Math.ceil((reset - Date.now()) / 1000)),
  };
}

export async function checkChatBootstrapRateLimit(request: Request): Promise<BootstrapRateLimit> {
  if (isUpstashReady()) return checkUpstashLimit(request);
  return checkMemoryLimit(request);
}

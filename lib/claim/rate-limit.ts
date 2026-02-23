/**
 * In-memory sliding window rate limiter for claim operations.
 * Resets on server restart. For production scale, use Redis.
 */

type Entry = { count: number; resetAt: number };

const CLAIM_INIT_WINDOW_MS = 60 * 60 * 1000; // 1 hour
const CLAIM_INIT_MAX = 5;

const CLAIM_VERIFY_WINDOW_MS = 60 * 60 * 1000;
const CLAIM_VERIFY_MAX = 20;

const claimInitStore = new Map<string, Entry>();
const claimVerifyStore = new Map<string, Entry>();

function check(
  store: Map<string, Entry>,
  key: string,
  windowMs: number,
  max: number
): { ok: boolean; retryAfter?: number } {
  const now = Date.now();
  const entry = store.get(key);

  if (!entry || now >= entry.resetAt) {
    store.set(key, { count: 1, resetAt: now + windowMs });
    return { ok: true };
  }

  if (entry.count >= max) {
    return { ok: false, retryAfter: Math.ceil((entry.resetAt - now) / 1000) };
  }

  entry.count++;
  return { ok: true };
}

export function checkClaimInitRateLimit(userId: string): {
  ok: boolean;
  retryAfter?: number;
} {
  return check(
    claimInitStore,
    `claim-init:${userId}`,
    CLAIM_INIT_WINDOW_MS,
    CLAIM_INIT_MAX
  );
}

export function checkClaimVerifyRateLimit(userId: string): {
  ok: boolean;
  retryAfter?: number;
} {
  return check(
    claimVerifyStore,
    `claim-verify:${userId}`,
    CLAIM_VERIFY_WINDOW_MS,
    CLAIM_VERIFY_MAX
  );
}

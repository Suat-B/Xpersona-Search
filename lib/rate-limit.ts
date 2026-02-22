/**
 * Simple in-memory rate limiter for forgot-password and similar endpoints.
 * Resets on server restart. For production at scale, use Redis (e.g. Upstash).
 */

const WINDOW_MS = 15 * 60 * 1000; // 15 minutes
const MAX_REQUESTS = 3;

type Entry = { count: number; resetAt: number };

const store = new Map<string, Entry>();

function getKey(ip: string, prefix: string): string {
  return `${prefix}:${ip}`;
}

export function checkRateLimit(ip: string, prefix = "forgot-password"): { ok: boolean; retryAfter?: number } {
  const key = getKey(ip, prefix);
  const now = Date.now();
  const entry = store.get(key);

  if (!entry) {
    store.set(key, { count: 1, resetAt: now + WINDOW_MS });
    return { ok: true };
  }

  if (now >= entry.resetAt) {
    store.set(key, { count: 1, resetAt: now + WINDOW_MS });
    return { ok: true };
  }

  if (entry.count >= MAX_REQUESTS) {
    const retryAfter = Math.ceil((entry.resetAt - now) / 1000);
    return { ok: false, retryAfter };
  }

  entry.count++;
  return { ok: true };
}

const AGENT_SUBMIT_WINDOW_MS = 60 * 60 * 1000; // 1 hour
const AGENT_SUBMIT_MAX = 10;

const agentSubmitStore = new Map<string, Entry>();

export function checkAgentSubmitRateLimit(ip: string): {
  ok: boolean;
  retryAfter?: number;
} {
  const key = `agent-submit:${ip}`;
  const now = Date.now();
  const entry = agentSubmitStore.get(key);

  if (!entry) {
    agentSubmitStore.set(key, {
      count: 1,
      resetAt: now + AGENT_SUBMIT_WINDOW_MS,
    });
    return { ok: true };
  }

  if (now >= entry.resetAt) {
    agentSubmitStore.set(key, {
      count: 1,
      resetAt: now + AGENT_SUBMIT_WINDOW_MS,
    });
    return { ok: true };
  }

  if (entry.count >= AGENT_SUBMIT_MAX) {
    return {
      ok: false,
      retryAfter: Math.ceil((entry.resetAt - now) / 1000),
    };
  }

  entry.count++;
  return { ok: true };
}

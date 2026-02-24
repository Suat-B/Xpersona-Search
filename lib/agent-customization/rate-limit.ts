type Entry = { count: number; resetAt: number };

const UPDATE_WINDOW_MS = 60 * 60 * 1000;
const UPDATE_MAX = 30;

const store = new Map<string, Entry>();

export function checkCustomizationUpdateRateLimit(userId: string): {
  ok: boolean;
  retryAfter?: number;
} {
  const key = `customization:${userId}`;
  const now = Date.now();
  const current = store.get(key);

  if (!current || now >= current.resetAt) {
    store.set(key, { count: 1, resetAt: now + UPDATE_WINDOW_MS });
    return { ok: true };
  }

  if (current.count >= UPDATE_MAX) {
    return {
      ok: false,
      retryAfter: Math.ceil((current.resetAt - now) / 1000),
    };
  }

  current.count += 1;
  return { ok: true };
}

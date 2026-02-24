"use client";

import { useState, useEffect } from "react";

/**
 * Valid API key prefix: non-empty string starting with "xp_" (e.g. "xp_a1b2c3d4e5").
 * Rejects null, undefined, empty string, and malformed values.
 */
function isValidApiKeyPrefix(value: unknown): boolean {
  if (typeof value !== "string") return false;
  const s = value.trim();
  return s.length >= 11 && s.startsWith("xp_");
}

/**
 * Fetches GET /api/me and derives whether the user has connected their AI.
 * "AI connected" = valid apiKeyPrefix AND apiKeyViewedAt (user has seen/copied key).
 * Avoids showing "AI connected" for first-session guests who have a key but never viewed it.
 */
export function useAiConnectionStatus(): { hasApiKey: boolean | null } {
  const [hasApiKey, setHasApiKey] = useState<boolean | null>(null);

  useEffect(() => {
    fetch("/api/v1/me", { credentials: "include", cache: "no-store" })
      .then(async (r) => {
        if (!r.ok) return { ok: false, data: null };
        try {
          const d = await r.json();
          return { ok: true, data: d };
        } catch {
          return { ok: false, data: null };
        }
      })
      .then(({ ok, data }) => {
        const hasPrefix = ok && data?.success && isValidApiKeyPrefix(data?.data?.apiKeyPrefix);
        const hasViewed = !!data?.data?.apiKeyViewedAt;
        setHasApiKey(hasPrefix && hasViewed);
      })
      .catch(() => setHasApiKey(false));
  }, []);

  return { hasApiKey };
}




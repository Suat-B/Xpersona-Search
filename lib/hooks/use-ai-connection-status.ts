"use client";

import { useState, useEffect } from "react";

/**
 * Fetches GET /api/me and derives whether the user has an active API key.
 * "AI connected" = hasApiKey === true.
 */
export function useAiConnectionStatus(): { hasApiKey: boolean | null } {
  const [hasApiKey, setHasApiKey] = useState<boolean | null>(null);

  useEffect(() => {
    fetch("/api/me", { credentials: "include" })
      .then((r) => r.json())
      .then((d) => setHasApiKey(!!d?.data?.apiKeyPrefix))
      .catch(() => setHasApiKey(false));
  }, []);

  return { hasApiKey };
}

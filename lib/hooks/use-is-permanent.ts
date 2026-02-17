"use client";

import { useState, useEffect, useCallback } from "react";

/**
 * Fetches /api/me to get isPermanent. Use this for nav/sidebar to correctly
 * hide Sign in/Sign up after credentials sign-in, since server layout may
 * resolve a different auth source (e.g. agent cookie) before NextAuth session.
 */
export function useIsPermanent(serverIsPermanent: boolean): boolean {
  const [isPermanent, setIsPermanent] = useState(serverIsPermanent);

  const fetchMe = useCallback(async () => {
    try {
      const res = await fetch("/api/me", { credentials: "include" });
      const data = await res.json().catch(() => ({}));
      if (data?.success && data?.data?.isPermanent === true) {
        setIsPermanent(true);
      } else if (data?.success && data?.data?.isPermanent === false) {
        setIsPermanent(false);
      }
    } catch {
      // Keep current value on error
    }
  }, []);

  useEffect(() => {
    if (serverIsPermanent) {
      setIsPermanent(true);
      return;
    }
    fetchMe();
    const handler = () => fetchMe();
    window.addEventListener("balance-updated", handler);
    return () => window.removeEventListener("balance-updated", handler);
  }, [serverIsPermanent, fetchMe]);

  return isPermanent;
}

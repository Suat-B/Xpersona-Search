"use client";

import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";

interface EnsureGuestProps {
  /** When true, will create a guest session and refresh. */
  needsGuest: boolean;
}

/**
 * Auto-creates a human session when user accesses dashboard/games without auth.
 * Login is not required; this provides seamless play.
 */
export function EnsureGuest({ needsGuest }: EnsureGuestProps) {
  const router = useRouter();
  const started = useRef(false);

  useEffect(() => {
    if (!needsGuest || started.current) return;
    started.current = true;

    fetch("/api/v1/auth/play", {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
    })
      .then(async (r) => {
        if (!r.ok) {
          const text = await r.text();
          try {
            const d = text ? JSON.parse(text) : {};
            return { ok: false, ...d };
          } catch {
            return { ok: false };
          }
        }
        return { ok: true };
      })
      .then((result) => {
        if ((result as { ok?: boolean }).ok) {
          window.dispatchEvent(new Event("balance-updated"));
          router.refresh();
        }
      })
      .catch(() => {
        started.current = false;
      });
  }, [needsGuest, router]);

  return null;
}




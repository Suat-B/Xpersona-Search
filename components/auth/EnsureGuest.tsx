"use client";

import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";

interface EnsureGuestProps {
  /** When true, will create a guest session and refresh. */
  needsGuest: boolean;
}

/**
 * Auto-creates a guest session when user accesses dashboard/games without auth.
 * Login is not required; this provides seamless guest play.
 */
export function EnsureGuest({ needsGuest }: EnsureGuestProps) {
  const router = useRouter();
  const started = useRef(false);

  useEffect(() => {
    if (!needsGuest || started.current) return;
    started.current = true;

    fetch("/api/auth/guest", {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
    })
      .then((r) => {
        if (!r.ok) return r.json().then((d) => ({ ok: false, ...d }));
        return { ok: true };
      })
      .then((result) => {
        if ((result as { ok?: boolean }).ok) {
          router.refresh();
        }
      })
      .catch(() => {
        started.current = false;
      });
  }, [needsGuest, router]);

  return null;
}

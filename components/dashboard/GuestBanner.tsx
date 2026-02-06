"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

export function GuestBanner() {
  const [isGuest, setIsGuest] = useState<boolean | null>(null);

  useEffect(() => {
    fetch("/api/me")
      .then((res) => res.json())
      .then((data) => {
        if (data?.success && data?.data?.email?.endsWith?.("@xpersona.guest")) {
          setIsGuest(true);
        } else {
          setIsGuest(false);
        }
      })
      .catch(() => setIsGuest(false));
  }, []);

  if (!isGuest) return null;

  return (
    <div
      className="rounded-lg border border-[var(--border)] bg-[var(--bg-card)] px-4 py-3 text-sm text-[var(--text-secondary)]"
      role="status"
      aria-live="polite"
    >
      Playing as guest.{" "}
      <Link
        href="/api/auth/signin"
        className="font-medium text-[var(--accent-heart)] hover:underline"
      >
        Sign in with Google
      </Link>{" "}
      to save your progress and use API keys.
    </div>
  );
}

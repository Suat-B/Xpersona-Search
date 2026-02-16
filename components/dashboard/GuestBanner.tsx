"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

export function GuestBanner() {
  const [state, setState] = useState<{ isGuest: boolean; googleAuthEnabled: boolean } | null>(null);

  useEffect(() => {
    fetch("/api/me")
      .then((res) => res.json())
      .then((data) => {
        if (data?.success && data?.data) {
          const email = data.data.email ?? "";
          const isGuest = email.endsWith("@xpersona.guest") || email.endsWith("@xpersona.human");
          setState({
            isGuest,
            googleAuthEnabled: data.data.googleAuthEnabled ?? false,
          });
        } else {
          setState({ isGuest: false, googleAuthEnabled: false });
        }
      })
      .catch(() => setState({ isGuest: false, googleAuthEnabled: false }));
  }, []);

  if (!state?.isGuest) return null;

  return (
    <div
      className="rounded-lg border border-[var(--border)] bg-[var(--bg-card)] px-4 py-3 text-sm text-[var(--text-secondary)]"
      role="status"
      aria-live="polite"
    >
      Playing as guest.{" "}
      {state.googleAuthEnabled ? (
        <>
          <Link
            href="/api/auth/signin/google?callbackUrl=%2Fdashboard%2Fprofile%3Flink_guest%3D1"
            className="font-medium text-[var(--accent-heart)] hover:underline"
          >
            Sign in with Google
          </Link>{" "}
          to save your progress and use API keys.
        </>
      ) : (
        <>
          Go to Settings to set up Google Sign-In (<code className="text-xs">npm run setup:google</code>).
        </>
      )}
    </div>
  );
}

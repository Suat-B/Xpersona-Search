"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

export function GuestBanner() {
  const [accountType, setAccountType] = useState<string | null>(null);
  const [isPermanent, setIsPermanent] = useState<boolean | null>(null);

  useEffect(() => {
    fetch("/api/me", { credentials: "include" })
      .then((res) => res.json())
      .then((data) => {
        if (data?.success && data?.data) {
          setAccountType(data.data.accountType ?? null);
          setIsPermanent(data.data.isPermanent ?? false);
        } else {
          setAccountType(null);
          setIsPermanent(null);
        }
      })
      .catch(() => {
        setAccountType(null);
        setIsPermanent(null);
      });
  }, []);

  if (isPermanent) return null;
  if (accountType !== "human") return null;

  return (
    <div
      className="rounded-lg border border-[var(--border)] bg-[var(--bg-card)] px-4 py-3 text-sm text-[var(--text-secondary)]"
      role="status"
      aria-live="polite"
    >
      Playing as guest.{" "}
      <Link
        href="/auth/signup?link=guest"
        className="font-medium text-[var(--accent-heart)] hover:underline"
      >
        Create permanent account
      </Link>{" "}
      or{" "}
      <Link
        href="/auth/signin?link=guest"
        className="font-medium text-[var(--accent-heart)] hover:underline"
      >
        Sign in
      </Link>{" "}
      to save your progress and use API keys.
    </div>
  );
}

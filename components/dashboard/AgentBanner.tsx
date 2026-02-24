"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { buildUpgradeAuthUrl } from "@/lib/auth-flow";

export function AgentBanner() {
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
  if (accountType !== "agent") return null;
  const signupHref = buildUpgradeAuthUrl("signup", accountType, "/dashboard");

  return (
    <div className="space-y-3">
      <div
        className="rounded-lg border border-cyan-500/30 bg-cyan-500/10 px-3 sm:px-4 py-3 text-sm text-cyan-200 min-w-0 break-words"
        role="status"
        aria-live="polite"
      >
        Want to keep your API key and credits?{" "}
        <Link
          href={signupHref}
          className="font-medium text-cyan-300 hover:text-cyan-200 hover:underline"
        >
          Create a permanent account
        </Link>{" "}
        to persist them across sign-outs.
      </div>
      <div
        className="rounded-lg border border-[var(--accent-heart)]/30 bg-[var(--accent-heart)]/10 px-3 sm:px-4 py-3 text-sm text-[var(--text-primary)] min-w-0 break-words"
        role="status"
        aria-live="polite"
      >
        <Link
          href="/dashboard/connect-ai"
          className="font-medium text-[var(--accent-heart)] hover:underline"
        >
          Give your AI the link and your key
        </Link>{" "}
        to start playing {"<3"}
      </div>
    </div>
  );
}

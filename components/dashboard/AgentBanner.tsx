"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

export function AgentBanner() {
  const [accountType, setAccountType] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/me", { credentials: "include" })
      .then((res) => res.json())
      .then((data) => {
        if (data?.success && data?.data) {
          setAccountType(data.data.accountType ?? null);
        } else {
          setAccountType(null);
        }
      })
      .catch(() => setAccountType(null));
  }, []);

  if (accountType !== "agent") return null;

  return (
    <div
      className="rounded-lg border border-cyan-500/30 bg-cyan-500/10 px-3 sm:px-4 py-3 text-sm text-cyan-200 min-w-0 break-words"
      role="status"
      aria-live="polite"
    >
      Want to keep your API key and credits?{" "}
      <Link
        href="/auth/signup?link=agent"
        className="font-medium text-cyan-300 hover:text-cyan-200 hover:underline"
      >
        Create a permanent account
      </Link>{" "}
      to persist them across sign-outs.
    </div>
  );
}

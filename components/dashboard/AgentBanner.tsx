"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

export function AgentBanner() {
  const [isAgent, setIsAgent] = useState<boolean | null>(null);

  useEffect(() => {
    fetch("/api/me", { credentials: "include" })
      .then((res) => res.json())
      .then((data) => {
        const email = data?.success ? data?.data?.email : null;
        const isAgentAccount =
          email?.endsWith?.("@xpersona.agent") ||
          /^play_.+@xpersona\.co$/.test(email ?? "");
        setIsAgent(isAgentAccount);
      })
      .catch(() => setIsAgent(false));
  }, []);

  if (!isAgent) return null;

  return (
    <div
      className="rounded-lg border border-cyan-500/30 bg-cyan-500/10 px-3 sm:px-4 py-3 text-sm text-cyan-200 min-w-0 break-words"
      role="status"
      aria-live="polite"
    >
      Agent/play account —{" "}
      <Link
        href="/api/auth/signin/google?callbackUrl=%2Fdashboard%2Fprofile%3Flink_agent%3D1"
        className="font-medium text-cyan-300 hover:text-cyan-200 hover:underline"
      >
        link to Google
      </Link>{" "}
      to persist your API key across sign-outs.
    </div>
  );
}

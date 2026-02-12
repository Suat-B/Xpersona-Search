"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { GlassCard } from "@/components/ui/GlassCard";

export function AgentReadyBadge() {
  const [hasApiKey, setHasApiKey] = useState<boolean | null>(null);

  useEffect(() => {
    fetch("/api/me", { credentials: "include" })
      .then((r) => r.json())
      .then((d) => setHasApiKey(!!d?.data?.apiKeyPrefix))
      .catch(() => setHasApiKey(false));
  }, []);

  if (hasApiKey === null) return null;

  return (
    <Link href="/dashboard/api" className="block">
      <GlassCard className={`p-4 border transition-all duration-300 hover:scale-[1.02] ${hasApiKey ? "border-emerald-500/30 bg-emerald-500/5" : "border-amber-500/20 bg-amber-500/5"}`}>
        <div className="flex items-center gap-3">
          <span className="relative flex h-8 w-8 items-center justify-center">
            {hasApiKey && (
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400/30 opacity-75" />
            )}
            <span className="text-xl" aria-hidden>{hasApiKey ? "🤖" : "🔑"}</span>
          </div>
          <div>
            <div className="text-xs font-mono text-[var(--text-secondary)] uppercase tracking-wider">
              Agent Status
            </div>
            <div className={`text-sm font-bold ${hasApiKey ? "text-emerald-400" : "text-amber-400"}`}>
              {hasApiKey ? "API Ready" : "Add API key"}
            </div>
          </div>
        </div>
        <p className="mt-2 text-[10px] text-[var(--text-secondary)]">
          {hasApiKey ? "OpenClaw, LangChain, REST — you're set." : "Get your key to let agents play."}
        </p>
      </GlassCard>
    </Link>
  );
}

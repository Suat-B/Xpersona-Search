"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { cn } from "@/lib/utils";

export function AgentReadyBadge() {
  const [hasApiKey, setHasApiKey] = useState<boolean | null>(null);

  useEffect(() => {
    fetch("/api/me", { credentials: "include" })
      .then((r) => r.json())
      .then((d) => setHasApiKey(!!d?.data?.apiKeyPrefix))
      .catch(() => setHasApiKey(false));
  }, []);

  if (hasApiKey === null) return null;

  const config = hasApiKey
    ? {
        iconBg: "bg-[#30d158]/10 border-[#30d158]/20 text-[#30d158]",
        border: "border-[#30d158]/30",
        title: "API Ready",
        subtitle: "OpenClaw • LangChain • REST",
        text: "text-[#30d158]",
        ping: true,
        glow: "",
        icon: (
          <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
          </svg>
        ),
      }
    : {
        iconBg: "bg-[#ff9f0a]/10 border-[#ff9f0a]/20 text-[#ff9f0a]",
        border: "border-[#ff9f0a]/30",
        title: "Setup API Key",
        subtitle: "Generate key for AI access",
        text: "text-[#ff9f0a]",
        ping: false,
        glow: "",
        icon: (
          <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 7a2 2 0 012 2m4 0a6 6 0 01-7.743 5.743L11 17H9v2H7v2H4a1 1 0 01-1-1v-2.586a1 1 0 01.293-.707l5.964-5.964A6 6 0 1121 9z" />
          </svg>
        ),
      };

  return (
    <Link href={hasApiKey ? "/dashboard/api" : "/dashboard/connect-ai"} className="block group">
      <div className={cn(
        "agent-card p-5 h-[140px] flex flex-col justify-between transition-all duration-300",
        config.border,
        config.glow,
        "hover:border-[var(--border-strong)]"
      )}
      >
        <div className="flex items-center gap-3">
          <span className="relative flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border">
            <div className={cn("absolute inset-0 rounded-xl", config.iconBg)} />
            
            {config.ping && (
              <span className="absolute -inset-1 rounded-xl bg-[#30d158]/20 animate-ping" />
            )}
            
            <span className={cn("relative", config.text)}>
              {config.icon}
            </span>
          </span>
          
          <div>
            <div className="text-xs font-semibold text-[var(--text-tertiary)] uppercase tracking-wider">
              AI Status
            </div>
            <div className={cn("text-sm font-semibold", config.text)}>
              {config.title}
            </div>
          </div>
        </div>
        
        <p className="text-xs text-[var(--text-secondary)]">
          {config.subtitle}
        </p>
        
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-1.5">
            {config.ping ? (
              <>
                <span className="w-1.5 h-1.5 rounded-full bg-[#30d158]" />
                <span className="text-[10px] text-[#30d158]/70">Online</span>
              </>
            ) : (
              <>
                <span className="w-1.5 h-1.5 rounded-full bg-[#ff9f0a]" />
                <span className="text-[10px] text-[#ff9f0a]/70">Setup Required</span>
              </>
            )}
          </div>
          
          <svg className="w-4 h-4 text-[var(--text-quaternary)] group-hover:text-[var(--text-secondary)] group-hover:translate-x-0.5 transition-all" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
          </svg>
        </div>
      </div>
    </Link>
  );
}

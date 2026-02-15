"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { GlassCard } from "@/components/ui/GlassCard";
import { ApiKeySection } from "@/components/dashboard/ApiKeySection";
import { ContinueAsAIButton } from "@/components/auth/ContinueAsAIButton";

const STEPS = [
  {
    title: "Generate API key",
    desc: "One click below. Copy it — shown once only.",
    icon: (
      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 7a2 2 0 012 2m4 0a6 6 0 01-7.743 5.743L11 17H9v2H7v2H4a1 1 0 01-1-1v-2.586a1 1 0 01.293-.707l5.964-5.964A6 6 0 1121 9z" />
      </svg>
    ),
  },
  {
    title: "Set XPERSONA_API_KEY",
    desc: "In your env or OpenClaw config. Same key for all agents.",
    icon: (
      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 20l4-16m4 4l4 4-4 4M6 16l-4-4 4-4" />
      </svg>
    ),
  },
  {
    title: "Your AI plays",
    desc: "OpenClaw, LangChain, CrewAI — same balance, same dice.",
    icon: (
      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
      </svg>
    ),
  },
];

const INTEGRATIONS: Array<{ name: string; href: string; badge?: string; internal?: boolean }> = [
  { name: "OpenClaw", href: "https://docs.openclaw.ai/", badge: "★" },
  { name: "LangChain", href: "https://www.langchain.com/" },
  { name: "CrewAI", href: "https://www.crewai.com/" },
  { name: "API docs", href: "/dashboard/api", internal: true },
];

export default function ConnectAIPage() {
  const [accountType, setAccountType] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const isAgent = accountType === "agent";

  useEffect(() => {
    fetch("/api/me", { credentials: "include" })
      .then(async (r) => {
        try {
          const data = await r.json();
          if (data.success) setAccountType(data.data?.accountType ?? null);
        } catch {
          // ignore
        }
      })
      .finally(() => setLoading(false));
  }, []);

  return (
    <div className="space-y-8 animate-in fade-in duration-500">
      {/* Create Agent CTA — shown when user is not an agent */}
      {!loading && !isAgent && (
        <GlassCard className="p-6 border-cyan-500/30 bg-gradient-to-br from-cyan-500/10 to-blue-500/5">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-6">
            <div className="flex items-start gap-4">
              <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-cyan-500/20 text-cyan-400 border border-cyan-500/30">
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                </svg>
              </div>
              <div>
                <h2 className="text-lg font-semibold text-[var(--text-primary)]">
                  Create an agent to get your API key
                </h2>
                <p className="mt-1 text-sm text-[var(--text-secondary)] max-w-md">
                  API keys are for agent accounts. Create your AI agent in one click — you&apos;ll get an API key and sign-in bonus immediately.
                </p>
              </div>
            </div>
            <div className="shrink-0">
              <ContinueAsAIButton successRedirect="/dashboard/connect-ai" />
            </div>
          </div>
        </GlassCard>
      )}

      {/* Hero */}
      <section>
        <div className="flex items-start gap-4">
          <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-[var(--accent-heart)]/20 to-[var(--accent-purple)]/20 border border-[var(--accent-heart)]/30">
            <svg className="w-7 h-7 text-[var(--accent-heart)]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
            </svg>
          </div>
          <div>
            <h1 className="text-2xl sm:text-3xl font-bold text-[var(--text-primary)] tracking-tight">
              Connect AI
            </h1>
            <p className="mt-1 text-sm text-[var(--text-secondary)] max-w-lg">
              Let your AI agents play dice with your balance. Generate an API key once — OpenClaw, LangChain, REST, all use the same key.
            </p>
          </div>
        </div>
      </section>

      {/* Three steps */}
      <GlassCard className="p-6 border-[var(--accent-heart)]/20">
        <h2 className="text-sm font-semibold text-[var(--text-secondary)] uppercase tracking-wider mb-4">
          Three steps to AI-powered play
        </h2>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          {STEPS.map((step, i) => (
            <div key={i} className="flex items-start gap-3 p-4 rounded-xl bg-white/[0.02] border border-white/[0.06]">
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-[var(--accent-heart)]/20 text-[var(--accent-heart)]">
                {step.icon}
              </span>
              <div>
                <p className="text-sm font-semibold text-[var(--text-primary)]">{step.title}</p>
                <p className="text-xs text-[var(--text-tertiary)] mt-0.5">{step.desc}</p>
              </div>
            </div>
          ))}
        </div>
      </GlassCard>

      {/* API Key — main CTA */}
      <section>
        <h2 className="text-sm font-semibold text-[var(--text-secondary)] uppercase tracking-wider mb-4">
          Your API key
        </h2>
        <ApiKeySection />
      </section>

      {/* Integrations */}
      <GlassCard className="p-6">
        <h2 className="text-sm font-semibold text-[var(--text-secondary)] uppercase tracking-wider mb-4">
          Works with
        </h2>
        <div className="flex flex-wrap gap-2">
          {INTEGRATIONS.map(({ name, href, badge, internal }) => (
            internal ? (
              <Link
                key={name}
                href={href}
                className="inline-flex items-center gap-1.5 rounded-xl border border-[var(--border)] bg-white/[0.03] px-4 py-2.5 text-sm font-medium text-[var(--text-secondary)] hover:bg-[var(--accent-heart)]/10 hover:border-[var(--accent-heart)]/30 hover:text-[var(--accent-heart)] transition-all"
              >
                {badge && <span className="text-[var(--accent-heart)]">{badge}</span>}
                {name}
              </Link>
            ) : (
              <a
                key={name}
                href={href}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 rounded-xl border border-[var(--border)] bg-white/[0.03] px-4 py-2.5 text-sm font-medium text-[var(--text-secondary)] hover:bg-white/[0.06] hover:text-[var(--text-primary)] transition-all"
              >
                {badge && <span className="text-[var(--accent-heart)]">{badge}</span>}
                {name}
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                </svg>
              </a>
            )
          ))}
        </div>
      </GlassCard>
    </div>
  );
}

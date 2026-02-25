"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { unwrapClientResponse } from "@/lib/api/client-response";

interface ClaimedAgent {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  source: string;
  claimStatus: string;
  verificationTier?: string;
  hasCustomPage?: boolean;
  claimedAt: string | null;
  safetyScore: number;
  popularityScore: number;
  overallRank: number;
}

export default function ClaimedAgentsPage() {
  const [agents, setAgents] = useState<ClaimedAgent[]>([]);
  const [loading, setLoading] = useState(true);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const initialLoad = useRef(true);

  useEffect(() => {
    let isActive = true;
    async function load() {
      const res = await fetch("/api/v1/me/claimed-agents", {
        credentials: "include",
        cache: "no-store",
      });
      if (res.ok) {
        const json = await res.json();
        const data = unwrapClientResponse<{ agents?: ClaimedAgent[] }>(json);
        if (isActive) {
          setAgents(data.agents ?? []);
          setLastUpdated(new Date());
        }
      }
      if (isActive && initialLoad.current) {
        setLoading(false);
        initialLoad.current = false;
      }
    }
    load();
    const interval = setInterval(load, 60_000);

    return () => {
      isActive = false;
      clearInterval(interval);
    };
  }, []);

  return (
    <div className="max-w-4xl mx-auto px-4 py-8">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold text-[var(--text-primary)]">
            Claimed Pages
          </h1>
          <p className="text-sm text-[var(--text-secondary)] mt-1">
            Agent pages you have verified ownership of
          </p>
          {lastUpdated && (
            <p className="text-xs text-[var(--text-tertiary)] mt-1">
              Last updated {lastUpdated.toLocaleTimeString()}
            </p>
          )}
        </div>
        <Link
          href="/"
          className="inline-flex items-center gap-2 rounded-xl border border-[var(--border)] bg-[var(--bg-elevated)] px-4 py-2.5 text-sm font-medium text-[var(--text-secondary)] hover:bg-[var(--bg-card)] transition-colors"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
          Find more agents
        </Link>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-16">
          <div className="w-8 h-8 rounded-full border-2 border-[var(--accent-heart)] border-t-transparent animate-spin" />
        </div>
      ) : agents.length === 0 ? (
        <div className="rounded-2xl border border-[var(--border)] bg-[var(--bg-card)] p-12 text-center">
          <div className="flex h-14 w-14 mx-auto items-center justify-center rounded-full bg-[var(--accent-heart)]/10 border border-[var(--accent-heart)]/20 text-[var(--accent-heart)] mb-4">
            <svg className="w-7 h-7" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
            </svg>
          </div>
          <h3 className="text-lg font-semibold text-[var(--text-primary)] mb-2">
            No claimed pages yet
          </h3>
          <p className="text-sm text-[var(--text-secondary)] mb-6 max-w-md mx-auto">
            Search for your project on Xpersona and claim your page to manage it and display a verified badge.
          </p>
          <Link
            href="/"
            className="inline-flex items-center gap-2 rounded-xl bg-[var(--accent-heart)] px-6 py-3 text-sm font-semibold text-white hover:opacity-90 transition-opacity"
          >
            Search Agents
          </Link>
        </div>
      ) : (
        <div className="space-y-3">
          {agents.map((agent) => (
            <div
              key={agent.id}
              className="rounded-xl border border-[var(--border)] bg-[var(--bg-card)] p-5 hover:border-[var(--accent-heart)]/30 transition-colors"
            >
              <div className="flex items-center justify-between flex-wrap gap-3">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <Link
                      href={`/agent/${agent.slug}`}
                      className="text-base font-semibold text-[var(--text-primary)] hover:text-[var(--accent-heart)] transition-colors truncate"
                    >
                      {agent.name}
                    </Link>
                    <span className="inline-flex items-center gap-1 rounded-full border border-[#30d158]/30 bg-[#30d158]/10 px-2 py-0.5 text-xs font-medium text-[#30d158] flex-shrink-0">
                      <svg className="h-3 w-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
                      </svg>
                      Claimed
                    </span>
                    {agent.verificationTier && agent.verificationTier !== "NONE" && (
                      <span className="inline-flex items-center gap-1 rounded-full border border-[var(--accent-neural)]/30 bg-[var(--accent-neural)]/10 px-2 py-0.5 text-xs font-medium text-[var(--accent-neural)] flex-shrink-0">
                        {agent.verificationTier}
                      </span>
                    )}
                    {agent.hasCustomPage && (
                      <span className="inline-flex items-center gap-1 rounded-full border border-[var(--accent-heart)]/30 bg-[var(--accent-heart)]/10 px-2 py-0.5 text-xs font-medium text-[var(--accent-heart)] flex-shrink-0">
                        Custom page
                      </span>
                    )}
                  </div>
                  {agent.description && (
                    <p className="text-sm text-[var(--text-tertiary)] truncate">
                      {agent.description}
                    </p>
                  )}
                  <div className="flex items-center gap-4 mt-2 text-xs text-[var(--text-quaternary)]">
                    <span>Source: {agent.source}</span>
                    {agent.claimedAt && (
                      <span>
                        Claimed: {new Date(agent.claimedAt).toLocaleDateString()}
                      </span>
                    )}
                  </div>
                </div>
                <div className="flex gap-2 flex-shrink-0">
                  <Link
                    href={`/agent/${agent.slug}/manage`}
                    className="inline-flex items-center gap-1.5 rounded-lg border border-[var(--border)] bg-[var(--bg-elevated)] px-4 py-2 text-xs font-semibold text-[var(--text-secondary)] hover:bg-[var(--bg-card)] transition-colors"
                  >
                    <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                    </svg>
                    Manage
                  </Link>
                  <Link
                    href={`/agent/${agent.slug}`}
                    className="inline-flex items-center gap-1.5 rounded-lg border border-[var(--border)] bg-[var(--bg-elevated)] px-4 py-2 text-xs font-semibold text-[var(--text-secondary)] hover:bg-[var(--bg-card)] transition-colors"
                  >
                    View
                  </Link>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}




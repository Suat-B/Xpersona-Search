"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

interface ClaimedAgent {
  id: string;
  name: string;
  slug: string;
  source: string;
  claimedAt: string | null;
}

export default function DashboardPage() {
  const [claimedAgents, setClaimedAgents] = useState<ClaimedAgent[]>([]);
  const [claimCount, setClaimCount] = useState(0);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      try {
        const res = await fetch("/api/v1/me/claimed-agents", { credentials: "include" });
        if (res.ok) {
          const data = await res.json();
          const agents = data.agents ?? [];
          setClaimedAgents(agents.slice(0, 5));
          setClaimCount(agents.length);
        }
      } catch {
        /* network error is non-fatal */
      }
      setLoading(false);
    }
    load();
  }, []);

  return (
    <div className="space-y-8 animate-fade-in-up">
      <header>
        <div className="flex items-center gap-2 mb-2">
          <div className="w-2 h-2 rounded-full bg-[var(--accent-heart)] animate-pulse" />
          <span className="text-xs font-medium text-[var(--dash-text-secondary)] uppercase tracking-wider">Developer Hub</span>
        </div>
        <h1 className="text-2xl sm:text-3xl md:text-4xl font-semibold tracking-tight text-gradient-primary">
          Dashboard
        </h1>
        <p className="mt-2 text-sm text-[var(--dash-text-secondary)] max-w-lg">
          Manage your claimed agent pages and discover new agents on Xpersona.
        </p>
      </header>

      {/* Search CTA */}
      <Link href="/" className="group block">
        <div className="agent-card p-6 transition-all duration-300 group-hover:scale-[1.01] group-hover:border-[var(--accent-heart)]/30">
          <div className="flex items-center gap-4">
            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-[var(--accent-heart)]/10 text-[var(--accent-heart)] border border-[var(--accent-heart)]/20">
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
            </div>
            <div className="flex-1 min-w-0">
              <h3 className="font-semibold text-[var(--text-primary)] group-hover:text-[var(--accent-heart)] transition-colors">
                Search Agents
              </h3>
              <p className="text-sm text-[var(--text-tertiary)]">
                Discover AI agents, MCP servers, and tools across npm, PyPI, and GitHub
              </p>
            </div>
            <svg className="w-5 h-5 text-[var(--text-tertiary)] group-hover:text-[var(--accent-heart)] group-hover:translate-x-0.5 transition-all" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
            </svg>
          </div>
        </div>
      </Link>

      {/* Stats Row */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
        <div className="agent-card p-6">
          <div className="flex items-center gap-3 mb-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-[#30d158]/10 text-[#30d158] border border-[#30d158]/20">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
              </svg>
            </div>
            <div>
              <p className="text-xs text-[var(--dash-text-secondary)] uppercase tracking-wider font-medium">Claimed Pages</p>
              <p className="text-2xl font-bold text-[var(--text-primary)]">
                {loading ? (
                  <span className="inline-block w-8 h-7 rounded bg-white/5 animate-pulse" />
                ) : (
                  claimCount
                )}
              </p>
            </div>
          </div>
          <Link
            href="/dashboard/claimed-agents"
            className="text-sm text-[#30d158] hover:text-[#30d158]/80 font-medium transition-colors"
          >
            View all claimed agents &rarr;
          </Link>
        </div>

        <Link href="/" className="group block">
          <div className="agent-card h-full p-6 transition-all group-hover:border-[var(--accent-heart)]/30">
            <div className="flex items-center gap-3 mb-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-[var(--accent-heart)]/10 text-[var(--accent-heart)] border border-[var(--accent-heart)]/20">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
                </svg>
              </div>
              <div>
                <p className="text-xs text-[var(--dash-text-secondary)] uppercase tracking-wider font-medium">Claim an Agent</p>
              </div>
            </div>
            <p className="text-sm text-[var(--text-tertiary)]">
              Search for your project and claim your page to display a verified badge and manage your listing.
            </p>
          </div>
        </Link>
      </div>

      {/* Recent Claimed Agents */}
      {!loading && claimedAgents.length > 0 && (
        <section>
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-3">
              <div className="w-1 h-6 rounded-full bg-[#30d158]" />
              <h2 className="text-lg font-semibold text-[var(--text-primary)]">
                Recently Claimed
              </h2>
            </div>
            <Link
              href="/dashboard/claimed-agents"
              className="text-sm text-[var(--dash-text-secondary)] hover:text-[#30d158] transition-colors"
            >
              View all &rarr;
            </Link>
          </div>
          <div className="space-y-2">
            {claimedAgents.map((agent) => (
              <div
                key={agent.id}
                className="agent-card p-4 flex items-center justify-between gap-3"
              >
                <div className="flex-1 min-w-0">
                  <Link
                    href={`/agent/${agent.slug}`}
                    className="text-sm font-medium text-[var(--text-primary)] hover:text-[var(--accent-heart)] transition-colors truncate block"
                  >
                    {agent.name}
                  </Link>
                  <div className="flex items-center gap-3 mt-0.5 text-xs text-[var(--text-quaternary)]">
                    <span>{agent.source}</span>
                    {agent.claimedAt && (
                      <span>Claimed {new Date(agent.claimedAt).toLocaleDateString()}</span>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <Link
                    href={`/agent/${agent.slug}/manage`}
                    className="inline-flex items-center gap-1 rounded-lg border border-[var(--border)] bg-[var(--bg-elevated)] px-3 py-1.5 text-xs font-medium text-[var(--text-secondary)] hover:bg-[var(--bg-card)] transition-colors"
                  >
                    <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                    </svg>
                    Manage
                  </Link>
                  <span className="inline-flex items-center gap-1 rounded-full border border-[#30d158]/30 bg-[#30d158]/10 px-2 py-0.5 text-[10px] font-medium text-[#30d158]">
                    <svg className="h-3 w-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
                    </svg>
                    Verified
                  </span>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Empty state for no claimed agents */}
      {!loading && claimedAgents.length === 0 && (
        <section className="agent-card p-10 text-center">
          <div className="flex h-14 w-14 mx-auto items-center justify-center rounded-full bg-[var(--accent-heart)]/10 border border-[var(--accent-heart)]/20 text-[var(--accent-heart)] mb-4">
            <svg className="w-7 h-7" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
            </svg>
          </div>
          <h3 className="text-lg font-semibold text-[var(--text-primary)] mb-2">
            No claimed pages yet
          </h3>
          <p className="text-sm text-[var(--text-secondary)] mb-6 max-w-md mx-auto">
            Search for your project on Xpersona and claim your agent page to manage it and display a verified owner badge.
          </p>
          <Link
            href="/"
            className="inline-flex items-center gap-2 rounded-xl bg-[var(--accent-heart)] px-6 py-3 text-sm font-semibold text-white hover:opacity-90 transition-opacity"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
            Search Agents
          </Link>
        </section>
      )}

      {/* Footer */}
      <footer className="mt-12 pt-6 border-t border-[var(--dash-divider)]">
        <div className="flex flex-col gap-6">
          <nav className="flex flex-wrap items-center gap-x-6 gap-y-2 text-sm">
            <Link href="/" className="text-[var(--dash-text-secondary)] hover:text-[var(--accent-heart)] transition-colors">
              Home
            </Link>
            <Link href="/dashboard/claimed-agents" className="text-[var(--dash-text-secondary)] hover:text-[var(--accent-heart)] transition-colors">
              Claimed Agents
            </Link>
            <Link href="/dashboard/profile" className="text-[var(--dash-text-secondary)] hover:text-[var(--accent-heart)] transition-colors">
              Profile
            </Link>
            <Link href="/dashboard/settings" className="text-[var(--dash-text-secondary)] hover:text-[var(--accent-heart)] transition-colors">
              Settings
            </Link>
          </nav>
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 pt-4 border-t border-[var(--dash-divider)]">
            <p className="text-xs text-[var(--dash-text-secondary)] order-2 sm:order-1">
              Xpersona &middot; AI Agent Search Engine
            </p>
            <div className="flex items-center gap-2 order-1 sm:order-2">
              <span className="w-1.5 h-1.5 rounded-full bg-[#30d158] animate-pulse shrink-0" aria-hidden />
              <span className="text-[11px] text-[var(--dash-text-secondary)]">All systems operational</span>
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}




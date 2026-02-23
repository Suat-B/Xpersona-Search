"use client";

import Link from "next/link";
import { useState } from "react";

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      onClick={() => {
        navigator.clipboard.writeText(text);
        setCopied(true);
        setTimeout(() => setCopied(false), 1500);
      }}
      className="absolute top-2 right-2 rounded-lg px-2 py-1 text-xs font-medium bg-white/5 hover:bg-white/10 text-[var(--text-secondary)] transition-colors"
    >
      {copied ? "Copied!" : "Copy"}
    </button>
  );
}

/** Canonical base URL for the Search API. Always production (xpersona.co) so AI agents and external devs get the correct endpoint. Override via NEXT_PUBLIC_APP_URL for staging. */
const SEARCH_API_BASE = process.env.NEXT_PUBLIC_APP_URL ?? "https://xpersona.co";

export default function SearchApiPage() {
  const baseUrl = SEARCH_API_BASE.replace(/\/$/, "");

  const searchCurl = `curl "${baseUrl}/api/search?q=crypto&protocols=A2A,MCP&minSafety=50&sort=rank&limit=10"`;
  const agentCurl = `curl "${baseUrl}/api/agents/my-agent-slug"`;

  return (
    <main className="min-h-screen bg-[var(--bg-deep)] text-[var(--text-primary)]">
      <header className="sticky top-0 z-30 border-b border-white/5 bg-[var(--bg-deep)]/95 backdrop-blur-xl">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-4 py-4 sm:px-6">
          <div>
            <h1 className="text-xl font-extrabold font-[family-name:var(--font-outfit)] tracking-tight">
              <Link href="/" className="hover:opacity-90 transition-opacity">
                Xpersona
              </Link>{" "}
              <span className="text-[var(--text-secondary)] font-normal">
                Search API
              </span>
            </h1>
            <p className="mt-0.5 text-sm text-[var(--text-secondary)]">
              Public REST API for discovering AI agents. No authentication required.
            </p>
          </div>
          <Link
            href="/"
            className="inline-flex items-center gap-2 rounded-xl border border-[var(--accent-heart)]/40 bg-[var(--accent-heart)]/10 px-4 py-2.5 text-sm font-medium text-[var(--accent-heart)] hover:bg-[var(--accent-heart)]/20 transition-colors"
          >
            Back to Search
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7l5 5m0 0l-5 5m5-5H6" />
            </svg>
          </Link>
        </div>
      </header>

      <div className="mx-auto max-w-5xl px-4 py-10 sm:px-6">
        <section className="mb-12">
          <h2 className="text-lg font-semibold text-white mb-3">Overview</h2>
          <div className="prose prose-invert max-w-none rounded-2xl border border-white/5 bg-[var(--bg-card)] p-6 text-sm leading-relaxed text-[var(--text-secondary)]">
            <p>
              The Xpersona Search API lets AI agents and developers discover OpenClaw skills, A2A agents, and MCP
              servers programmatically. All endpoints return JSON and require no authentication. The same API powers
              the web UI.
            </p>
            <p className="mt-3">
              <strong className="text-white">Base URL:</strong>{" "}
              <code className="rounded bg-white/10 px-1.5 py-0.5 font-mono text-xs">{baseUrl}</code>
            </p>
          </div>
        </section>

        <section className="mb-12">
          <h2 className="text-lg font-semibold text-white mb-4">Endpoints</h2>

          <div className="rounded-2xl border border-white/5 bg-[var(--bg-card)] overflow-hidden mb-6">
            <div className="border-b border-white/5 p-5">
              <div className="flex flex-wrap items-center gap-2 mb-2">
                <span className="font-mono text-xs font-bold px-2 py-0.5 rounded text-emerald-400">GET</span>
                <code className="text-sm font-mono text-white/90">/api/search</code>
              </div>
              <p className="text-sm font-medium text-white mb-1">Search AI agents</p>
              <p className="text-xs text-[var(--text-secondary)] leading-relaxed mb-4">
                Full-text search with filtering, sorting, and cursor-based pagination.
              </p>
              <h3 className="text-xs font-semibold text-white mb-2">Query parameters</h3>
              <div className="overflow-x-auto">
                <table className="w-full text-xs text-[var(--text-secondary)]">
                  <thead>
                    <tr className="border-b border-white/5">
                      <th className="text-left py-2 font-medium text-white">Parameter</th>
                      <th className="text-left py-2 font-medium text-white">Type</th>
                      <th className="text-left py-2 font-medium text-white">Description</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr className="border-b border-white/5">
                      <td className="py-2 font-mono">q</td>
                      <td>string</td>
                      <td>Full-text search query (optional)</td>
                    </tr>
                    <tr className="border-b border-white/5">
                      <td className="py-2 font-mono">protocols</td>
                      <td>string</td>
                      <td>Comma-separated: A2A, MCP, ANP, OPENCLAW (optional)</td>
                    </tr>
                    <tr className="border-b border-white/5">
                      <td className="py-2 font-mono">capabilities</td>
                      <td>string</td>
                      <td>Comma-separated capability filters (optional)</td>
                    </tr>
                    <tr className="border-b border-white/5">
                      <td className="py-2 font-mono">minSafety</td>
                      <td>number 0–100</td>
                      <td>Minimum safety score (optional)</td>
                    </tr>
                    <tr className="border-b border-white/5">
                      <td className="py-2 font-mono">minRank</td>
                      <td>number 0–100</td>
                      <td>Minimum overall rank (optional)</td>
                    </tr>
                    <tr className="border-b border-white/5">
                      <td className="py-2 font-mono">sort</td>
                      <td>string</td>
                      <td>rank | safety | popularity | freshness (default: rank)</td>
                    </tr>
                    <tr className="border-b border-white/5">
                      <td className="py-2 font-mono">cursor</td>
                      <td>string</td>
                      <td>Pagination cursor from previous response (optional)</td>
                    </tr>
                    <tr>
                      <td className="py-2 font-mono">limit</td>
                      <td>number</td>
                      <td>Results per page 1–100 (default: 30)</td>
                    </tr>
                  </tbody>
                </table>
              </div>
              <div className="relative rounded-lg bg-black/50 p-3 font-mono text-[11px] overflow-x-auto mt-4">
                <CopyButton text={searchCurl} />
                <pre className="text-emerald-300/90 break-all">{searchCurl}</pre>
              </div>
            </div>
          </div>

          <div className="rounded-2xl border border-white/5 bg-[var(--bg-card)] overflow-hidden">
            <div className="p-5">
              <div className="flex flex-wrap items-center gap-2 mb-2">
                <span className="font-mono text-xs font-bold px-2 py-0.5 rounded text-emerald-400">GET</span>
                <code className="text-sm font-mono text-white/90">/api/agents/{"{slug}"}</code>
              </div>
              <p className="text-sm font-medium text-white mb-1">Get agent by slug</p>
              <p className="text-xs text-[var(--text-secondary)] leading-relaxed mb-4">
                Returns full agent details including description, capabilities, protocols, and metadata.
              </p>
              <div className="relative rounded-lg bg-black/50 p-3 font-mono text-[11px] overflow-x-auto">
                <CopyButton text={agentCurl} />
                <pre className="text-emerald-300/90 break-all">{agentCurl}</pre>
              </div>
            </div>
          </div>
        </section>

        <section className="mb-12">
          <h2 className="text-lg font-semibold text-white mb-3">Response format</h2>
          <div className="rounded-2xl border border-white/5 bg-[var(--bg-card)] p-6">
            <h3 className="text-sm font-medium text-white mb-2">Search response</h3>
            <div className="relative rounded-lg bg-black/50 p-4 font-mono text-[11px] overflow-x-auto">
              <CopyButton
                text={`{
  "results": [
    {
      "id": "uuid",
      "name": "Agent Name",
      "slug": "agent-slug",
      "description": "...",
      "capabilities": ["cap1", "cap2"],
      "protocols": ["A2A", "MCP"],
      "safetyScore": 85,
      "popularityScore": 72,
      "freshnessScore": 90,
      "overallRank": 82.5,
      "githubData": { "stars": 120, "forks": 15 },
      "createdAt": "2025-01-01T00:00:00Z"
    }
  ],
  "pagination": {
    "hasMore": true,
    "nextCursor": "uuid",
    "total": 150
  },
  "facets": {
    "protocols": [{ "protocol": ["A2A"], "count": 45 }]
  }
}`}
              />
              <pre className="text-cyan-300/90 whitespace-pre">{`{
  "results": [
    {
      "id": "uuid",
      "name": "Agent Name",
      "slug": "agent-slug",
      "description": "...",
      "capabilities": ["cap1", "cap2"],
      "protocols": ["A2A", "MCP"],
      "safetyScore": 85,
      "popularityScore": 72,
      "freshnessScore": 90,
      "overallRank": 82.5,
      "githubData": { "stars": 120, "forks": 15 },
      "createdAt": "2025-01-01T00:00:00Z"
    }
  ],
  "pagination": {
    "hasMore": true,
    "nextCursor": "uuid",
    "total": 150
  },
  "facets": {
    "protocols": [{ "protocol": ["A2A"], "count": 45 }]
  }
}`}</pre>
            </div>
          </div>
        </section>

        <section className="mb-12">
          <h2 className="text-lg font-semibold text-white mb-3">For AI agents</h2>
          <div className="prose prose-invert max-w-none rounded-2xl border border-white/5 bg-[var(--bg-card)] p-6 text-sm leading-relaxed text-[var(--text-secondary)]">
            <p>
              Call <code className="rounded bg-white/10 px-1 font-mono text-xs">GET /api/search</code> with a
              natural-language query in <code className="rounded bg-white/10 px-1 font-mono text-xs">q</code> to find
              relevant agents. Use <code className="rounded bg-white/10 px-1 font-mono text-xs">protocols</code> to
              filter by A2A, MCP, ANP, or OpenClaw. Use <code className="rounded bg-white/10 px-1 font-mono text-xs">cursor</code> from the
              previous response for pagination. Then call{" "}
              <code className="rounded bg-white/10 px-1 font-mono text-xs">GET /api/agents/{"{slug}"}</code> for full
              details on any agent.
            </p>
          </div>
        </section>

        <section className="rounded-2xl border border-[var(--accent-heart)]/20 bg-[var(--accent-heart)]/5 p-8 text-center">
          <h3 className="text-lg font-semibold text-white mb-2">Ready to integrate?</h3>
          <p className="text-sm text-[var(--text-secondary)] mb-4 max-w-md mx-auto">
            No API key needed. Start searching agents from your AI or application.
          </p>
          <Link
            href="/"
            className="inline-flex items-center gap-2 rounded-xl bg-[var(--accent-heart)] px-5 py-2.5 text-sm font-semibold text-white hover:opacity-90 transition-opacity"
          >
            Try Xpersona Search
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7l5 5m0 0l-5 5m5-5H6" />
            </svg>
          </Link>
        </section>
      </div>
    </main>
  );
}

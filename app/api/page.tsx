import Link from "next/link";
import path from "path";
import { CopyButton } from "@/components/docs/CopyButton";
import { buildApiSurface, type ApiEndpoint } from "@/lib/docs/api-surface";

/** Canonical base URL for the Search API. Always production (xpersona.co) so AI agents and external devs get the correct endpoint. Override via NEXT_PUBLIC_APP_URL for staging. */
const SEARCH_API_BASE = process.env.NEXT_PUBLIC_APP_URL ?? "https://xpersona.co";

type QuickstartItem = {
  title: string;
  description: string;
  method: string;
  path: string;
  curl: string;
};

function buildQuickstart(endpoints: ApiEndpoint[], priority: string[], baseUrl: string): QuickstartItem[] {
  const quickstartSorted = [...endpoints].sort((a, b) => {
    const aBase = a.route.split("?")[0];
    const bBase = b.route.split("?")[0];
    const aIdx = priority.indexOf(aBase);
    const bIdx = priority.indexOf(bBase);
    const aRank = aIdx === -1 ? 999 : aIdx;
    const bRank = bIdx === -1 ? 999 : bIdx;
    if (aRank !== bRank) return aRank - bRank;
    return a.route.localeCompare(b.route) || a.method.localeCompare(b.method);
  });

  return quickstartSorted.slice(0, 6).map((item) => ({
    title: `${item.method} ${item.route.replace("/api/v1", "")}`,
    description: item.auth ? `Auth: ${item.auth}` : "Public endpoint.",
    method: item.method,
    path: item.route,
    curl: `curl -s -X ${item.method} ${baseUrl}${item.route}`,
  }));
}

export default async function SearchApiPage() {
  const baseUrl = SEARCH_API_BASE.replace(/\/$/, "");

  const searchCurl = `curl "${baseUrl}/api/v1/search?q=crypto&protocols=A2A,MCP&minSafety=50&sort=rank&limit=10"`;
  const suggestCurl = `curl "${baseUrl}/api/v1/search/suggest?q=trad&limit=8"`;
  const trendingCurl = `curl "${baseUrl}/api/v1/search/trending"`;
  const clickCurl = `curl -X POST "${baseUrl}/api/v1/search/click" -H "Content-Type: application/json" -d '{"query":"crypto","agentId":"uuid","position":0}'`;
  const agentCurl = `curl "${baseUrl}/api/v1/agents/my-agent-slug"`;
  const aiSearchCurl = `curl "${baseUrl}/api/v1/search/ai?q=best+agents+for+multistep+research&limit=3"`;
  const snapshotCurl = `curl "${baseUrl}/api/v1/agents/my-agent-slug/snapshot"`;
  const toolDescriptorCurl = `curl "${baseUrl}/api/v1/search/tool"`;

  const searchResponseJson = `{
  "success": true,
  "data": {
    "results": [
      {
        "id": "uuid",
        "name": "Agent Name",
        "slug": "agent-slug",
        "description": "...",
        "snippet": "...<mark>matching</mark> text...",
        "capabilities": ["cap1", "cap2"],
        "protocols": ["A2A", "MCP"],
        "safetyScore": 85,
        "popularityScore": 72,
        "freshnessScore": 90,
        "overallRank": 82.5,
        "claimStatus": "CLAIMED",
        "verificationTier": "SILVER",
        "hasCustomPage": true,
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
    },
    "didYouMean": "cryptocurrency",
    "searchMeta": {
      "fallbackApplied": true,
      "matchMode": "semantic",
      "queryOriginal": "i want to make a movie",
      "queryInterpreted": "build video",
      "filtersHonored": true,
      "stagesTried": ["strict_lexical", "relaxed_lexical", "semantic"]
    }
  },
  "meta": {
    "requestId": "req_123",
    "version": "v1",
    "timestamp": "2026-02-24T00:00:00.000Z"
  }
}`;

  const reliabilityBaseDir = path.join(process.cwd(), "app", "api", "reliability");
  const gpgBaseDir = path.join(process.cwd(), "app", "api", "gpg");
  const graphBaseDir = path.join(process.cwd(), "app", "api", "v1", "graph");
  const searchBaseDir = path.join(process.cwd(), "app", "api", "search");
  const agentsBaseDir = path.join(process.cwd(), "app", "api", "v1", "agents");
  const agentEndpointMeta = new Map<string, { auth?: string; headers?: string[] }>([
    ["/api/v1/agents/:slug/claim/verify", { auth: "Bearer API key (agent owner)" }],
    ["/api/v1/agents/:slug/customization", { auth: "Bearer API key (agent owner)" }],
    ["/api/v1/agents/:slug/customization/preview", { auth: "Bearer API key (agent owner)" }],
    ["/api/v1/agents/:slug/manage", { auth: "Bearer API key (agent owner)" }],
    ["/api/v1/agents/:slug/verify", { auth: "Bearer API key (agent owner)" }],
  ]);
  const agentEndpointMethodMeta = new Map<string, { auth?: string; headers?: string[] }>([
    ["/api/v1/agents/:slug#GET", { auth: "Public" }],
    ["/api/v1/agents/:slug#PATCH", { auth: "Bearer API key (agent owner)" }],
    ["/api/v1/agents/:slug#DELETE", { auth: "Bearer API key (agent owner)" }],
    ["/api/v1/agents/:slug/claim#GET", { auth: "Public" }],
    ["/api/v1/agents/:slug/claim#POST", { auth: "Bearer API key (agent owner)" }],
  ]);

  const reliabilityEndpointMeta = new Map<string, { auth?: string; headers?: string[] }>([
    [
      "/api/v1/reliability/ingest",
      {
        auth: "Bearer API key (agent owner or admin)",
        headers: ["idempotency-key", "x-gpg-key-id", "x-gpg-timestamp", "x-gpg-signature"],
      },
    ],
  ]);

  const gpgEndpointMeta = new Map<string, { auth?: string; headers?: string[] }>([
    [
      "/api/v1/gpg/ingest",
      {
        auth: "Bearer API key (agent owner or admin)",
        headers: ["idempotency-key", "x-gpg-key-id", "x-gpg-timestamp", "x-gpg-signature"],
      },
    ],
  ]);

  const [reliabilityEndpoints, gpgEndpoints, graphEndpoints, searchEndpoints, agentEndpoints] = await Promise.all([
    buildApiSurface({ baseDir: reliabilityBaseDir, routePrefix: "/api/v1/reliability", endpointMeta: reliabilityEndpointMeta }),
    buildApiSurface({ baseDir: gpgBaseDir, routePrefix: "/api/v1/gpg", endpointMeta: gpgEndpointMeta }),
    buildApiSurface({ baseDir: graphBaseDir, routePrefix: "/api/v1/graph" }),
    buildApiSurface({ baseDir: searchBaseDir, routePrefix: "/api/v1/search" }),
    buildApiSurface({
      baseDir: agentsBaseDir,
      routePrefix: "/api/v1/agents",
      endpointMeta: agentEndpointMeta,
      endpointMethodMeta: agentEndpointMethodMeta,
    }),
  ]);

  const gpgQuickstart = buildQuickstart(
    gpgEndpoints,
    [
      "/api/v1/gpg/recommend",
      "/api/v1/gpg/plan",
      "/api/v1/gpg/agent/:id/stats",
      "/api/v1/gpg/cluster/:id/top",
      "/api/v1/gpg/pipeline/top",
      "/api/v1/gpg/ingest",
    ],
    baseUrl,
  );

  const reliabilityQuickstart = buildQuickstart(
    reliabilityEndpoints,
    [
      "/api/v1/reliability/agent/:id",
      "/api/v1/reliability/agent/:id/trends",
      "/api/v1/reliability/suggest/:agentId",
      "/api/v1/reliability/top",
      "/api/v1/reliability/graph",
      "/api/v1/reliability/ingest",
    ],
    baseUrl,
  );

  const graphQuickstart = buildQuickstart(
    graphEndpoints,
    [
      "/api/v1/graph/recommend",
      "/api/v1/graph/plan",
      "/api/v1/graph/related/:agentId",
      "/api/v1/graph/top",
    ],
    baseUrl,
  );

  return (
    <main className="min-h-screen bg-[var(--bg-deep)] text-[var(--text-primary)]">
      <header className="sticky top-0 z-30 border-b border-white/5 bg-[var(--bg-deep)]/95 backdrop-blur-xl">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-4 py-4 sm:px-6">
          <div>
            <h1 className="text-xl font-extrabold font-[family-name:var(--font-outfit)] tracking-tight">
              <Link href="/" className="hover:opacity-90 transition-opacity">
                Xpersona
              </Link>{" "}
              <span className="text-[var(--text-secondary)] font-normal">Search API</span>
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
            <p className="mt-3">
              <strong className="text-white">Rate limits:</strong> 60 requests/minute (anonymous), 120/min (authenticated).
              Returns <code className="rounded bg-white/10 px-1 font-mono text-xs">429 Too Many Requests</code> with{" "}
              <code className="rounded bg-white/10 px-1 font-mono text-xs">Retry-After</code> when exceeded.
            </p>
            <p className="mt-3">
              <strong className="text-white">Caching:</strong> Responses include{" "}
              <code className="rounded bg-white/10 px-1 font-mono text-xs">Cache-Control: public, s-maxage=30, stale-while-revalidate=60</code>.
            </p>
            <p className="mt-3">
              <strong className="text-white">Prometheus metrics:</strong>{" "}
              <code className="rounded bg-white/10 px-1 font-mono text-xs">/api/metrics/prometheus</code>
              {" "}exports request counts and latency histograms.
            </p>
          </div>
        </section>

        <section className="mb-12">
          <h2 className="text-lg font-semibold text-white mb-4">Endpoints</h2>

          <div className="rounded-2xl border border-white/5 bg-[var(--bg-card)] overflow-hidden mb-6">
            <div className="border-b border-white/5 p-5">
              <div className="flex flex-wrap items-center gap-2 mb-2">
                <span className="font-mono text-xs font-bold px-2 py-0.5 rounded text-emerald-400">GET</span>
                <code className="text-sm font-mono text-white/90">/api/v1/search</code>
              </div>
              <p className="text-sm font-medium text-white mb-1">Search AI agents</p>
              <p className="text-xs text-[var(--text-secondary)] leading-relaxed mb-4">
                Full-text search with filtering, sorting, and cursor-based pagination. Supports Google-like query syntax:
                &quot;exact phrase&quot;, <code className="rounded bg-white/10 px-1 font-mono">-exclusion</code>, OR,
                and inline operators <code className="rounded bg-white/10 px-1 font-mono">protocol:MCP</code>,{" "}
                <code className="rounded bg-white/10 px-1 font-mono">lang:python</code>,{" "}
                <code className="rounded bg-white/10 px-1 font-mono">safety:&gt;80</code>.
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
                      <td>Full-text query (max 500 chars). Supports &quot;phrases&quot;, -exclusions, OR, protocol:MCP, lang:python, safety:&gt;80</td>
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
                      <td>number 0-100</td>
                      <td>Minimum safety score (optional)</td>
                    </tr>
                    <tr className="border-b border-white/5">
                      <td className="py-2 font-mono">minRank</td>
                      <td>number 0-100</td>
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
                    <tr className="border-b border-white/5">
                      <td className="py-2 font-mono">limit</td>
                      <td>number</td>
                      <td>Results per page 1-100 (default: 30)</td>
                    </tr>
                    <tr>
                      <td className="py-2 font-mono">includePending</td>
                      <td>string</td>
                      <td>1 or true to include PENDING_REVIEW agents (optional)</td>
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

          <div className="rounded-2xl border border-white/5 bg-[var(--bg-card)] overflow-hidden mb-6">
            <div className="border-b border-white/5 p-5">
              <div className="flex flex-wrap items-center gap-2 mb-2">
                <span className="font-mono text-xs font-bold px-2 py-0.5 rounded text-emerald-400">GET</span>
                <code className="text-sm font-mono text-white/90">/api/v1/search/suggest</code>
              </div>
              <p className="text-sm font-medium text-white mb-1">Autocomplete suggestions</p>
              <p className="text-xs text-[var(--text-secondary)] leading-relaxed mb-4">
                Returns query completions and agent suggestions. Min 2 characters in q.
              </p>
              <div className="overflow-x-auto mb-4">
                <table className="w-full text-xs text-[var(--text-secondary)]">
                  <tbody>
                    <tr className="border-b border-white/5">
                      <td className="py-2 font-mono">q</td>
                      <td className="py-2">string (required, 2-100 chars)</td>
                    </tr>
                    <tr>
                      <td className="py-2 font-mono">limit</td>
                      <td className="py-2">number 1-12 (default: 8)</td>
                    </tr>
                  </tbody>
                </table>
              </div>
              <div className="relative rounded-lg bg-black/50 p-3 font-mono text-[11px] overflow-x-auto">
                <CopyButton text={suggestCurl} />
                <pre className="text-emerald-300/90 break-all">{suggestCurl}</pre>
              </div>
            </div>
          </div>

          <div className="rounded-2xl border border-white/5 bg-[var(--bg-card)] overflow-hidden mb-6">
            <div className="border-b border-white/5 p-5">
              <div className="flex flex-wrap items-center gap-2 mb-2">
                <span className="font-mono text-xs font-bold px-2 py-0.5 rounded text-emerald-400">GET</span>
                <code className="text-sm font-mono text-white/90">/api/v1/search/trending</code>
              </div>
              <p className="text-sm font-medium text-white mb-1">Trending search queries</p>
              <p className="text-xs text-[var(--text-secondary)] leading-relaxed mb-4">
                Returns popular searches from the last 30 days. Falls back to top agents if insufficient data.
              </p>
              <div className="relative rounded-lg bg-black/50 p-3 font-mono text-[11px] overflow-x-auto">
                <CopyButton text={trendingCurl} />
                <pre className="text-emerald-300/90 break-all">{trendingCurl}</pre>
              </div>
            </div>
          </div>

          <div className="rounded-2xl border border-white/5 bg-[var(--bg-card)] overflow-hidden mb-6">
            <div className="border-b border-white/5 p-5">
              <div className="flex flex-wrap items-center gap-2 mb-2">
                <span className="font-mono text-xs font-bold px-2 py-0.5 rounded text-amber-400">POST</span>
                <code className="text-sm font-mono text-white/90">/api/v1/search/click</code>
              </div>
              <p className="text-sm font-medium text-white mb-1">Record result click</p>
              <p className="text-xs text-[var(--text-secondary)] leading-relaxed mb-4">
                Records which search result was clicked for learning-to-rank. Body:{" "}
                <code className="rounded bg-white/10 px-1 font-mono">{"{ query, agentId, position }"}</code>.
              </p>
              <div className="relative rounded-lg bg-black/50 p-3 font-mono text-[11px] overflow-x-auto">
                <CopyButton text={clickCurl} />
                <pre className="text-emerald-300/90 break-all">{clickCurl}</pre>
              </div>
            </div>
          </div>

          <div className="rounded-2xl border border-white/5 bg-[var(--bg-card)] overflow-hidden">
            <div className="p-5">
              <div className="flex flex-wrap items-center gap-2 mb-2">
                <span className="font-mono text-xs font-bold px-2 py-0.5 rounded text-emerald-400">GET</span>
                <code className="text-sm font-mono text-white/90">/api/v1/agents/{"{slug}"}</code>
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

          <div className="mt-6 rounded-2xl border border-white/5 bg-[var(--bg-card)] p-6">
            <h3 className="text-sm font-medium text-white mb-3">Full Search API Surface</h3>
            <p className="text-xs text-[var(--text-secondary)] mb-4">
              Auto-detected endpoints under <code className="rounded bg-white/10 px-1 font-mono">/api/v1/search</code>.
            </p>
            <div className="grid gap-3 lg:grid-cols-2">
              {searchEndpoints.map((item) => (
                <div key={item.route + item.method} className="rounded-xl border border-white/[0.08] bg-black/40 px-3 py-2">
                  <div className="flex flex-wrap items-center gap-2 text-xs font-mono text-[var(--text-secondary)]">
                    <span className="text-emerald-200">
                      {item.method} {item.route}
                    </span>
                    <span className="text-[10px] uppercase tracking-[0.2em] text-[var(--text-tertiary)]">
                      Auth: {item.auth ?? "Public"}
                    </span>
                  </div>
                  {item.headers && item.headers.length > 0 && (
                    <p className="mt-2 text-[10px] uppercase tracking-[0.18em] text-[var(--text-tertiary)]">
                      Required headers: {item.headers.join(", ")}
                    </p>
                  )}
                </div>
              ))}
            </div>
          </div>

          <div className="mt-6 rounded-2xl border border-white/5 bg-[var(--bg-card)] p-6">
            <h3 className="text-sm font-medium text-white mb-3">Full Agents API Surface</h3>
            <p className="text-xs text-[var(--text-secondary)] mb-4">
              Auto-detected endpoints under <code className="rounded bg-white/10 px-1 font-mono">/api/v1/agents</code>.
            </p>
            <div className="grid gap-3 lg:grid-cols-2">
              {agentEndpoints.map((item) => (
                <div key={item.route + item.method} className="rounded-xl border border-white/[0.08] bg-black/40 px-3 py-2">
                  <div className="flex flex-wrap items-center gap-2 text-xs font-mono text-[var(--text-secondary)]">
                    <span className="text-emerald-200">
                      {item.method} {item.route}
                    </span>
                    <span className="text-[10px] uppercase tracking-[0.2em] text-[var(--text-tertiary)]">
                      Auth: {item.auth ?? "Public"}
                    </span>
                  </div>
                  {item.headers && item.headers.length > 0 && (
                    <p className="mt-2 text-[10px] uppercase tracking-[0.18em] text-[var(--text-tertiary)]">
                      Required headers: {item.headers.join(", ")}
                    </p>
                  )}
                </div>
              ))}
            </div>
          </div>
        </section>

        <section className="mb-12">
          <h2 className="text-lg font-semibold text-white mb-3">Graph (GPG) API Additions</h2>
          <div className="rounded-2xl border border-white/5 bg-[var(--bg-card)] p-6">
            <h3 className="text-sm font-medium text-white mb-2">Quickstart</h3>
            <p className="text-xs text-[var(--text-secondary)] mb-4">
              Endpoints that power the Global Performance Graph planner and recommendations.
            </p>
            <div className="grid gap-3 lg:grid-cols-3">
              {gpgQuickstart.map((item) => (
                <div key={item.title} className="rounded-2xl border border-white/[0.08] bg-black/30 p-4">
                  <div className="flex items-center justify-between">
                    <p className="text-xs uppercase tracking-[0.2em] text-[var(--text-tertiary)]">{item.title}</p>
                    <span className="text-[10px] uppercase tracking-[0.2em] text-emerald-200">{item.method}</span>
                  </div>
                  <p className="mt-2 text-sm text-[var(--text-secondary)]">{item.description}</p>
                  <p className="mt-3 text-xs font-mono text-[var(--text-tertiary)]">{item.path}</p>
                  <pre className="mt-3 text-xs text-[var(--text-secondary)] bg-black/40 border border-white/[0.08] rounded-lg p-3 overflow-x-auto">
                    {item.curl}
                  </pre>
                </div>
              ))}
            </div>
          </div>

          <div className="mt-6 rounded-2xl border border-white/5 bg-[var(--bg-card)] p-6">
            <h3 className="text-sm font-medium text-white mb-3">Full GPG API Surface</h3>
            <div className="grid gap-3 lg:grid-cols-2">
              {gpgEndpoints.map((item) => (
                <div key={item.route + item.method} className="rounded-xl border border-white/[0.08] bg-black/40 px-3 py-2">
                  <div className="flex flex-wrap items-center gap-2 text-xs font-mono text-[var(--text-secondary)]">
                    <span className="text-emerald-200">
                      {item.method} {item.route}
                    </span>
                    <span className="text-[10px] uppercase tracking-[0.2em] text-[var(--text-tertiary)]">
                      Auth: {item.auth ?? "Public"}
                    </span>
                  </div>
                  {item.headers && item.headers.length > 0 && (
                    <p className="mt-2 text-[10px] uppercase tracking-[0.18em] text-[var(--text-tertiary)]">
                      Required headers: {item.headers.join(", ")}
                    </p>
                  )}
                </div>
              ))}
            </div>
          </div>
        </section>

        <section className="mb-12">
          <h2 className="text-lg font-semibold text-white mb-3">Graph API (Public)</h2>
          <div className="rounded-2xl border border-white/5 bg-[var(--bg-card)] p-6">
            <h3 className="text-sm font-medium text-white mb-2">Quickstart</h3>
            <p className="text-xs text-[var(--text-secondary)] mb-4">
              Public Graph endpoints that power planner recommendations and collaboration insights.
            </p>
            <div className="grid gap-3 lg:grid-cols-3">
              {graphQuickstart.map((item) => (
                <div key={item.title} className="rounded-2xl border border-white/[0.08] bg-black/30 p-4">
                  <div className="flex items-center justify-between">
                    <p className="text-xs uppercase tracking-[0.2em] text-[var(--text-tertiary)]">{item.title}</p>
                    <span className="text-[10px] uppercase tracking-[0.2em] text-emerald-200">{item.method}</span>
                  </div>
                  <p className="mt-2 text-sm text-[var(--text-secondary)]">{item.description}</p>
                  <p className="mt-3 text-xs font-mono text-[var(--text-tertiary)]">{item.path}</p>
                  <pre className="mt-3 text-xs text-[var(--text-secondary)] bg-black/40 border border-white/[0.08] rounded-lg p-3 overflow-x-auto">
                    {item.curl}
                  </pre>
                </div>
              ))}
            </div>
          </div>

          <div className="mt-6 rounded-2xl border border-white/5 bg-[var(--bg-card)] p-6">
            <h3 className="text-sm font-medium text-white mb-3">Full Graph API Surface</h3>
            <div className="grid gap-3 lg:grid-cols-2">
              {graphEndpoints.map((item) => (
                <div key={item.route + item.method} className="rounded-xl border border-white/[0.08] bg-black/40 px-3 py-2">
                  <div className="flex flex-wrap items-center gap-2 text-xs font-mono text-[var(--text-secondary)]">
                    <span className="text-emerald-200">
                      {item.method} {item.route}
                    </span>
                    <span className="text-[10px] uppercase tracking-[0.2em] text-[var(--text-tertiary)]">
                      Auth: {item.auth ?? "Public"}
                    </span>
                  </div>
                  {item.headers && item.headers.length > 0 && (
                    <p className="mt-2 text-[10px] uppercase tracking-[0.18em] text-[var(--text-tertiary)]">
                      Required headers: {item.headers.join(", ")}
                    </p>
                  )}
                </div>
              ))}
            </div>
          </div>
        </section>

        <section className="mb-12">
          <h2 className="text-lg font-semibold text-white mb-3">Reliability API Additions</h2>
          <div className="rounded-2xl border border-white/5 bg-[var(--bg-card)] p-6">
            <h3 className="text-sm font-medium text-white mb-2">Quickstart</h3>
            <p className="text-xs text-[var(--text-secondary)] mb-4">
              Machine-readable reliability endpoints for metrics, suggestions, and global performance graphs.
            </p>
            <div className="grid gap-3 lg:grid-cols-3">
              {reliabilityQuickstart.map((item) => (
                <div key={item.title} className="rounded-2xl border border-white/[0.08] bg-black/30 p-4">
                  <div className="flex items-center justify-between">
                    <p className="text-xs uppercase tracking-[0.2em] text-[var(--text-tertiary)]">{item.title}</p>
                    <span className="text-[10px] uppercase tracking-[0.2em] text-emerald-200">{item.method}</span>
                  </div>
                  <p className="mt-2 text-sm text-[var(--text-secondary)]">{item.description}</p>
                  <p className="mt-3 text-xs font-mono text-[var(--text-tertiary)]">{item.path}</p>
                  <pre className="mt-3 text-xs text-[var(--text-secondary)] bg-black/40 border border-white/[0.08] rounded-lg p-3 overflow-x-auto">
                    {item.curl}
                  </pre>
                </div>
              ))}
            </div>
          </div>

          <div className="mt-6 rounded-2xl border border-white/5 bg-[var(--bg-card)] p-6">
            <h3 className="text-sm font-medium text-white mb-3">Full Reliability API Surface</h3>
            <div className="grid gap-3 lg:grid-cols-2">
              {reliabilityEndpoints.map((item) => (
                <div key={item.route + item.method} className="rounded-xl border border-white/[0.08] bg-black/40 px-3 py-2">
                  <div className="flex flex-wrap items-center gap-2 text-xs font-mono text-[var(--text-secondary)]">
                    <span className="text-emerald-200">
                      {item.method} {item.route}
                    </span>
                    <span className="text-[10px] uppercase tracking-[0.2em] text-[var(--text-tertiary)]">
                      Auth: {item.auth ?? "Public"}
                    </span>
                  </div>
                  {item.headers && item.headers.length > 0 && (
                    <p className="mt-2 text-[10px] uppercase tracking-[0.18em] text-[var(--text-tertiary)]">
                      Required headers: {item.headers.join(", ")}
                    </p>
                  )}
                </div>
              ))}
            </div>
          </div>
        </section>

        <section className="mb-12">
          <h2 className="text-lg font-semibold text-white mb-3">Response format</h2>
          <div className="rounded-2xl border border-white/5 bg-[var(--bg-card)] p-6">
            <h3 className="text-sm font-medium text-white mb-2">Search response</h3>
            <p className="text-xs text-[var(--text-secondary)] mb-3">
              Each result includes <code className="rounded bg-white/10 px-1 font-mono">snippet</code> (description with{" "}
              <code className="rounded bg-white/10 px-1 font-mono">&lt;mark&gt;</code> highlighting) when a query is present.
              <code className="rounded bg-white/10 px-1 font-mono">didYouMean</code> is returned when few or no results match (spell/similarity suggestion).
              <code className="rounded bg-white/10 px-1 font-mono ml-1">searchMeta</code> explains rewrite/fallback behavior and chosen match mode.
            </p>
            <div className="relative rounded-lg bg-black/50 p-4 font-mono text-[11px] overflow-x-auto">
              <CopyButton text={searchResponseJson} />
              <pre className="text-cyan-300/90 whitespace-pre">{searchResponseJson}</pre>
            </div>
          </div>
        </section>

        <section className="mb-12">
          <h2 className="text-lg font-semibold text-white mb-3">For AI agents</h2>
          <div className="prose prose-invert max-w-none rounded-2xl border border-white/5 bg-[var(--bg-card)] p-6 text-sm leading-relaxed text-[var(--text-secondary)]">
            <p>
              Call <code className="rounded bg-white/10 px-1 font-mono text-xs">GET /api/v1/search</code> with a
              natural-language query in <code className="rounded bg-white/10 px-1 font-mono text-xs">q</code> to find
              relevant agents. Use <code className="rounded bg-white/10 px-1 font-mono text-xs">protocols</code> to
              filter by A2A, MCP, ANP, or OpenClaw. For advanced queries, use inline operators{" "}
              <code className="rounded bg-white/10 px-1 font-mono text-xs">protocol:MCP</code>,{" "}
              <code className="rounded bg-white/10 px-1 font-mono text-xs">lang:python</code>, or{" "}
              <code className="rounded bg-white/10 px-1 font-mono text-xs">safety:&gt;80</code> inside the query. Use{" "}
              <code className="rounded bg-white/10 px-1 font-mono text-xs">cursor</code> from the
              previous response for pagination. Check <code className="rounded bg-white/10 px-1 font-mono text-xs">didYouMean</code> for
              spell-correction suggestions when results are sparse. Then call{" "}
              <code className="rounded bg-white/10 px-1 font-mono text-xs">GET /api/v1/agents/{"{slug}"}</code> for full
              details on any agent. Optionally call <code className="rounded bg-white/10 px-1 font-mono text-xs">POST /api/v1/search/click</code> when
              a user clicks a result to improve future rankings. For low-token tool outputs, use{" "}
              <code className="rounded bg-white/10 px-1 font-mono text-xs">GET /api/v1/search/ai</code>. For crawlable
              profiles, use <code className="rounded bg-white/10 px-1 font-mono text-xs">GET /api/v1/agents/{"{slug}"}/snapshot</code>.
              Tool metadata is available at <code className="rounded bg-white/10 px-1 font-mono text-xs">GET /api/v1/search/tool</code>.
            </p>
            <div className="relative rounded-lg bg-black/50 p-3 font-mono text-[11px] overflow-x-auto mt-4">
              <CopyButton text={aiSearchCurl} />
              <pre className="text-emerald-300/90 break-all">{aiSearchCurl}</pre>
            </div>
            <div className="relative rounded-lg bg-black/50 p-3 font-mono text-[11px] overflow-x-auto mt-3">
              <CopyButton text={snapshotCurl} />
              <pre className="text-emerald-300/90 break-all">{snapshotCurl}</pre>
            </div>
            <div className="relative rounded-lg bg-black/50 p-3 font-mono text-[11px] overflow-x-auto mt-3">
              <CopyButton text={toolDescriptorCurl} />
              <pre className="text-emerald-300/90 break-all">{toolDescriptorCurl}</pre>
            </div>
            <p className="mt-4">
              SDK package: <code className="rounded bg-white/10 px-1 font-mono text-xs">@xpersona-search/search-sdk</code>
              {" "}with methods for search, AI mode, suggestions, and snapshots.
              Postman collection:{" "}
              <a href="/postman.xpersona.v1.collection.json" className="text-[var(--accent-heart)] hover:underline">
                Download collection JSON
              </a>.
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

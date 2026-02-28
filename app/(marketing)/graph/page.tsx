import Link from "next/link";
import path from "path";
import { GraphExplorer } from "@/components/graph/GraphExplorer";
import { buildApiSurface, type ApiEndpoint } from "@/lib/docs/api-surface";
import { readdir } from "fs/promises";

export const dynamic = "force-dynamic";

type QuickstartItem = {
  title: string;
  description: string;
  method: string;
  path: string;
  curl: string;
};

function buildQuickstart(endpoints: ApiEndpoint[], priority: string[]): QuickstartItem[] {
  const quickstartSorted = [...endpoints].sort((a, b) => {
    const aBase = a.route.split("?")[0];
    const bBase = b.route.split("?")[0];
    const aIdx = priority.indexOf(aBase);
    const bIdx = priority.indexOf(bBase);
    const aRank = aIdx == -1 ? 999 : aIdx;
    const bRank = bIdx == -1 ? 999 : bIdx;
    if (aRank != bRank) return aRank - bRank;
    return a.route.localeCompare(b.route) || a.method.localeCompare(b.method);
  });

  return quickstartSorted.slice(0, 6).map((item) => ({
    title: `${item.method} ${item.route.replace("/api/v1", "")}`,
    description: item.auth ? `Auth: ${item.auth}` : "Public endpoint.",
    method: item.method,
    path: item.route,
    curl: `curl -s -X ${item.method} http://localhost:3000${item.route}`,
  }));
}

export default async function GraphPage() {
  const gpgBaseDir = path.join(process.cwd(), "app", "api", "gpg");
  const gpgEndpointMeta = new Map<string, { auth?: string; headers?: string[] }>([
    [
      "/api/v1/gpg/ingest",
      {
        auth: "Bearer API key (agent owner or admin)",
        headers: ["idempotency-key", "x-gpg-key-id", "x-gpg-timestamp", "x-gpg-signature"],
      },
    ],
  ]);

  const gpgEndpoints = await buildApiSurface({
    baseDir: gpgBaseDir,
    routePrefix: "/api/v1/gpg",
    endpointMeta: gpgEndpointMeta,
  });

  const gpgQuickstart = buildQuickstart(gpgEndpoints, [
    "/api/v1/gpg/recommend",
    "/api/v1/gpg/plan",
    "/api/v1/gpg/agent/:id/stats",
    "/api/v1/gpg/cluster/:id/top",
    "/api/v1/gpg/pipeline/top",
    "/api/v1/gpg/ingest",
  ]);

  let gpgFiles = new Set<string>();
  try {
    gpgFiles = new Set<string>((await readdir(path.join(process.cwd(), "lib", "gpg"))).filter((f) => f.endsWith(".ts")));
  } catch {
    gpgFiles = new Set<string>();
  }

  const capabilities = [
    gpgFiles.has("recommend.ts") ? "Agent recommendations and routing from cluster stats." : null,
    gpgFiles.has("planner.ts") ? "Pipeline planning with cost/latency constraints." : null,
    gpgFiles.has("stats.ts") ? "Cluster and agent performance statistics (success, cost, latency, risk)." : null,
    gpgFiles.has("ingest.ts") ? "Signed ingestion and idempotency handling for runs." : null,
    gpgFiles.has("receipts.ts") ? "Signed receipts for verification and trust auditability." : null,
    gpgFiles.has("risk.ts") ? "Risk and escrow multiplier inference for the economy layer." : null,
  ].filter(Boolean) as string[];

  return (
    <section className="min-h-dvh bg-[var(--bg-deep)] text-white overflow-x-hidden">
      <div className="container mx-auto px-3 sm:px-6 py-6 sm:py-14">
        <div className="flex flex-col lg:flex-row lg:items-end justify-between gap-5 sm:gap-6 mb-6 sm:mb-8">
          <div>
            <div className="flex items-center gap-2 mb-2">
              <div className="w-2 h-2 rounded-full bg-[var(--accent-heart)] animate-pulse shadow-[0_0_8px_var(--accent-heart)]" />
              <span className="text-xs font-semibold text-[var(--accent-heart)] uppercase tracking-widest">Global Performance Graph</span>
            </div>
            <h1 className="text-3xl sm:text-5xl font-bold text-white tracking-tight">
              Global routing intelligence for autonomous agents.
            </h1>
            <p className="mt-3 text-base text-[var(--text-secondary)] max-w-2xl leading-relaxed">
              Machine-readable graph intelligence so AI agents can select, route, and verify other agents
              using live success, latency, cost, and risk telemetry.
            </p>
          </div>
          <div className="flex flex-col sm:flex-row gap-3 w-full lg:w-auto">
            <Link
              href="/api"
              className="inline-flex items-center justify-center rounded-full border border-[var(--border)] bg-white/5 px-6 py-2.5 text-sm font-semibold text-white hover:bg-white hover:text-black transition-all active:scale-95"
            >
              View API
            </Link>
            <Link
              href="/marketplace"
              className="inline-flex items-center justify-center rounded-full bg-white text-black px-6 py-2.5 text-sm font-bold hover:bg-white/90 transition-all active:scale-95"
            >
              Visit Marketplace
            </Link>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-5 mb-12">
          <div className="rounded-2xl border border-[var(--border)] bg-[var(--bg-card)] p-6 hover:border-[var(--accent-heart)]/30 transition-colors">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-xs font-bold uppercase tracking-widest text-[var(--text-secondary)]">Routing Contracts</h2>
              <span className="text-[10px] font-bold rounded-full bg-[var(--accent-heart)]/10 text-[var(--accent-heart)] px-2 py-0.5 border border-[var(--accent-heart)]/20">AGENTS</span>
            </div>
            <p className="text-sm text-[var(--text-secondary)] mb-6 leading-relaxed">
              Encode supported protocols, required auth, safety constraints, and expected cost/latency so
              routers can make deterministic, auditable decisions.
            </p>
            <div className="rounded-xl border border-[var(--border)] bg-white/5 p-4 text-[11px]">
              <p className="text-[var(--text-tertiary)] font-medium mb-1">Contract promise</p>
              <p className="font-mono text-[var(--accent-heart)]">protocol + auth + safety + latency + cost</p>
            </div>
          </div>

          <div className="rounded-2xl border border-[var(--border)] bg-[var(--bg-card)] p-6 hover:border-[var(--accent-heart)]/30 transition-colors">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-xs font-bold uppercase tracking-widest text-[var(--text-secondary)]">Telemetry Graph</h2>
              <span className="text-[10px] font-bold rounded-full bg-[var(--accent-heart)]/10 text-[var(--accent-heart)] px-2 py-0.5 border border-[var(--accent-heart)]/20">LIVE</span>
            </div>
            <p className="text-sm text-[var(--text-secondary)] mb-6 leading-relaxed">
              Contracts pair with live telemetry to validate promised behavior, detect drift, and highlight
              agents that are safe to promote into critical workflows.
            </p>
            <div className="rounded-xl border border-[var(--border)] bg-white/5 p-4 text-[11px]">
              <p className="text-[var(--text-tertiary)] font-medium mb-1">Signal mix</p>
              <p className="font-mono text-[var(--accent-heart)]">success + latency + cost + risk</p>
            </div>
          </div>

          <div className="rounded-2xl border border-[var(--border)] bg-[var(--bg-card)] p-6 hover:border-[var(--accent-heart)]/30 transition-colors">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-xs font-bold uppercase tracking-widest text-[var(--text-secondary)]">Deterministic Routing</h2>
              <span className="text-[10px] font-bold rounded-full bg-[var(--accent-heart)]/10 text-[var(--accent-heart)] px-2 py-0.5 border border-[var(--accent-heart)]/20">GPG</span>
            </div>
            <p className="text-sm text-[var(--text-secondary)] mb-6 leading-relaxed">
              With contracts in place, routing systems compare options deterministically, enforce constraints,
              and maintain auditability with fewer failed runs.
            </p>
            <div className="rounded-xl border border-[var(--border)] bg-white/5 p-4 text-[11px]">
              <p className="text-[var(--text-tertiary)] font-medium mb-1">Planner goal</p>
              <p className="font-mono text-[var(--accent-heart)]">optimize success, then cost</p>
            </div>
          </div>
        </div>

        <GraphExplorer />

        <div className="mt-12 rounded-2xl border border-[var(--border)] bg-[var(--bg-card)] p-8">
          <div className="flex flex-col gap-3 mb-8">
            <h2 className="text-3xl font-bold text-white tracking-tight">Graph API Additions</h2>
            <p className="text-base text-[var(--text-secondary)] max-w-3xl">
              Direct machine endpoints for querying the Global Performance Graph and planning pipelines.
            </p>
          </div>
          <div className="grid gap-4 lg:grid-cols-2">
            <div className="rounded-2xl border border-[var(--border)] bg-black/40 p-5 text-sm text-[var(--text-secondary)] hover:text-white transition-colors">
              Use the Graph API when you need live routing inputs: success probability, latency distribution,
              cost estimates, and risk scores. These fields are designed to be machine-consumed by planners.
            </div>
            <div className="rounded-2xl border border-[var(--border)] bg-black/40 p-5 text-sm text-[var(--text-secondary)] hover:text-white transition-colors">
              Pair Graph API responses with capability contracts to build fail-safe routing: only choose agents
              that meet hard requirements, then optimize for cost, latency, or reliability.
            </div>
          </div>

          <div className="mt-12">
            <h3 className="text-2xl font-bold text-white tracking-tight mb-2">API Quickstart</h3>
            <p className="text-base text-[var(--text-secondary)] max-w-3xl mb-8">
              Recommended endpoints to get up and running.
            </p>
            <div className="grid gap-4 lg:grid-cols-3 min-w-0">
              {gpgQuickstart.map((item) => (
                <div key={item.title} className="rounded-2xl border border-[var(--border)] bg-black/40 p-5 hover:border-[var(--accent-heart)]/30 transition-colors">
                  <div className="flex items-center justify-between mb-3">
                    <p className="text-xs font-bold uppercase tracking-widest text-[var(--text-secondary)]">{item.title}</p>
                    <span className="text-[10px] font-bold text-[var(--accent-heart)]">{item.method}</span>
                  </div>
                  <p className="text-sm text-[var(--text-secondary)] mb-4">{item.description}</p>
                  <code className="text-[11px] text-[var(--accent-heart)] block mb-4 break-all">{item.path}</code>
                  <pre className="text-xs text-[var(--text-primary)] bg-black/60 border border-[var(--border)] rounded-xl p-4 overflow-x-auto">
                    {item.curl}
                  </pre>
                </div>
              ))}
            </div>
          </div>

          <div className="mt-12">
            <h3 className="text-2xl font-bold text-white tracking-tight mb-2">GPG API Surface</h3>
            <p className="text-base text-[var(--text-secondary)] max-w-3xl mb-8">
              All available endpoints detected in this codebase.
            </p>
            <div className="grid gap-4 lg:grid-cols-2">
              {gpgEndpoints.map((item) => (
                <div key={item.route + item.method} className="rounded-xl border border-[var(--border)] bg-black/40 p-4 hover:border-[var(--accent-heart)]/30 transition-colors">
                  <div className="flex flex-wrap items-center gap-3 text-xs font-mono text-white">
                    <span className="bg-[var(--accent-heart)]/10 text-[var(--accent-heart)] px-2 py-1 rounded">
                      {item.method}
                    </span>
                    <span className="text-white">
                      {item.route}
                    </span>
                  </div>
                  {item.headers && item.headers.length > 0 && (
                    <p className="mt-3 text-[10px] uppercase tracking-widest text-[var(--text-tertiary)]">
                      Required: {item.headers.join(", ")}
                    </p>
                  )}
                </div>
              ))}
            </div>
          </div>

          {capabilities.length > 0 && (
            <div className="mt-12">
              <h3 className="text-2xl font-bold text-white tracking-tight mb-2">GPG Capabilities</h3>
              <p className="text-base text-[var(--text-secondary)] max-w-3xl mb-8">
                Functionality available today based on the current GPG stack.
              </p>
              <div className="grid gap-4 sm:grid-cols-2">
                {capabilities.map((item) => (
                  <div key={item} className="rounded-2xl border border-[var(--border)] bg-black/40 p-5 text-sm text-[var(--text-secondary)] hover:text-white transition-colors">
                    {item}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </section>
  );
}

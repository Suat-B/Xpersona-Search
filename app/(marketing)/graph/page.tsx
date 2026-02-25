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
    <section className="min-h-dvh bg-black text-white">
      <div className="container mx-auto px-4 sm:px-6 py-10 sm:py-14">
        <div className="flex flex-col lg:flex-row lg:items-end justify-between gap-6 mb-8">
          <div>
            <div className="flex items-center gap-2 mb-2">
              <div className="w-2 h-2 rounded-full bg-white animate-pulse" />
              <span className="text-xs font-medium text-white uppercase tracking-wider">Global Performance Graph</span>
            </div>
            <h1 className="text-2xl sm:text-4xl font-bold text-white">
              Global routing intelligence for autonomous agents.
            </h1>
            <p className="mt-2 text-sm text-white max-w-2xl">
              Machine-readable graph intelligence so AI agents can select, route, and verify other agents
              using live success, latency, cost, and risk telemetry.
            </p>
          </div>
          <div className="flex flex-col sm:flex-row gap-3 w-full lg:w-auto">
            <Link
              href="/api"
              className="inline-flex items-center justify-center rounded-full border border-white px-5 py-2.5 text-sm font-medium text-white hover:bg-white hover:text-black transition-colors"
            >
              View API
            </Link>
            <Link
              href="/marketplace"
              className="inline-flex items-center justify-center rounded-full bg-white text-black px-5 py-2.5 text-sm font-semibold hover:bg-black hover:text-white border border-white transition-colors"
            >
              Visit Marketplace
            </Link>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-5 mb-8">
          <div className="rounded-2xl border border-white bg-black p-5">
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-sm font-semibold uppercase tracking-wider text-white">Routing Contracts</h2>
              <span className="text-[10px] rounded-full border border-white px-2 py-0.5">Agents</span>
            </div>
            <p className="text-xs text-white mb-4">
              Encode supported protocols, required auth, safety constraints, and expected cost/latency so
              routers can make deterministic, auditable decisions.
            </p>
            <div className="rounded-lg border border-white p-3 text-[11px]">
              <p className="text-white/70">Contract promise</p>
              <p className="mt-1 font-mono">protocol + auth + safety + latency + cost</p>
            </div>
          </div>

          <div className="rounded-2xl border border-white bg-black p-5">
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-sm font-semibold uppercase tracking-wider text-white">Telemetry Graph</h2>
              <span className="text-[10px] rounded-full border border-white px-2 py-0.5">Live</span>
            </div>
            <p className="text-xs text-white mb-4">
              Contracts pair with live telemetry to validate promised behavior, detect drift, and highlight
              agents that are safe to promote into critical workflows.
            </p>
            <div className="rounded-lg border border-white p-3 text-[11px]">
              <p className="text-white/70">Signal mix</p>
              <p className="mt-1 font-mono">success + latency + cost + risk</p>
            </div>
          </div>

          <div className="rounded-2xl border border-white bg-black p-5">
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-sm font-semibold uppercase tracking-wider text-white">Deterministic Routing</h2>
              <span className="text-[10px] rounded-full border border-white px-2 py-0.5">GPG</span>
            </div>
            <p className="text-xs text-white mb-4">
              With contracts in place, routing systems compare options deterministically, enforce constraints,
              and maintain auditability with fewer failed runs.
            </p>
            <div className="rounded-lg border border-white p-3 text-[11px]">
              <p className="text-white/70">Planner goal</p>
              <p className="mt-1 font-mono">optimize success, then cost</p>
            </div>
          </div>
        </div>

        <GraphExplorer />

        <div className="mt-10 rounded-2xl border border-white bg-black p-6 sm:p-8">
          <div className="flex flex-col gap-3">
            <h2 className="text-2xl sm:text-3xl font-semibold text-white">Graph API Additions</h2>
            <p className="text-sm text-white max-w-3xl">
              Direct machine endpoints for querying the Global Performance Graph and planning pipelines.
            </p>
          </div>
          <div className="mt-6 grid gap-4 sm:grid-cols-2">
            <div className="rounded-2xl border border-white bg-black p-4 text-sm text-white">
              Use the Graph API when you need live routing inputs: success probability, latency distribution,
              cost estimates, and risk scores. These fields are designed to be machine-consumed by planners.
            </div>
            <div className="rounded-2xl border border-white bg-black p-4 text-sm text-white">
              Pair Graph API responses with capability contracts to build fail-safe routing: only choose agents
              that meet hard requirements, then optimize for cost, latency, or reliability.
            </div>
          </div>

          <div className="mt-8">
            <h3 className="text-xl font-semibold text-white">API Quickstart</h3>
            <p className="mt-2 text-sm text-white max-w-3xl">
              Recommended endpoints to get up and running.
            </p>
            <div className="mt-4 grid gap-3 lg:grid-cols-3">
              {gpgQuickstart.map((item) => (
                <div key={item.title} className="rounded-2xl border border-white bg-black p-4">
                  <div className="flex items-center justify-between">
                    <p className="text-xs uppercase tracking-[0.2em] text-white">{item.title}</p>
                    <span className="text-[10px] uppercase tracking-[0.2em] text-white">{item.method}</span>
                  </div>
                  <p className="mt-2 text-sm text-white">{item.description}</p>
                  <p className="mt-3 text-xs font-mono text-white">{item.path}</p>
                  <pre className="mt-3 text-xs text-white bg-black border border-white rounded-lg p-3 overflow-x-auto">
                    {item.curl}
                  </pre>
                </div>
              ))}
            </div>
          </div>

          <div className="mt-10">
            <h3 className="text-xl font-semibold text-white">GPG API Surface</h3>
            <p className="mt-2 text-sm text-white max-w-3xl">
              All available endpoints detected in this codebase.
            </p>
            <div className="mt-4 grid gap-3 lg:grid-cols-2">
              {gpgEndpoints.map((item) => (
                <div key={item.route + item.method} className="rounded-xl border border-white bg-black px-3 py-2">
                  <div className="flex flex-wrap items-center gap-2 text-xs font-mono text-white">
                    <span className="text-white">
                      {item.method} {item.route}
                    </span>
                    <span className="text-[10px] uppercase tracking-[0.2em] text-white">
                      Auth: {item.auth ?? "Public"}
                    </span>
                  </div>
                  {item.headers && item.headers.length > 0 && (
                    <p className="mt-2 text-[10px] uppercase tracking-[0.18em] text-white">
                      Required headers: {item.headers.join(", ")}
                    </p>
                  )}
                </div>
              ))}
            </div>
          </div>

          {capabilities.length > 0 && (
            <div className="mt-10">
              <h3 className="text-xl font-semibold text-white">GPG Capabilities</h3>
              <p className="mt-2 text-sm text-white max-w-3xl">
                Functionality available today based on the current GPG stack.
              </p>
              <div className="mt-4 grid gap-3 sm:grid-cols-2">
                {capabilities.map((item) => (
                  <div key={item} className="rounded-2xl border border-white bg-black p-4 text-sm text-white">
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

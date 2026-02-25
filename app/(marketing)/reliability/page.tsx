import Link from "next/link";
import path from "path";
import { readdir } from "fs/promises";
import { ReliabilityDashboard } from "@/components/reliability/ReliabilityDashboard";
import { GlobalPerformanceGraph } from "@/components/reliability/GlobalPerformanceGraph";
import { AgentOpsStats } from "@/components/reliability/AgentOpsStats";
import { buildApiSurface, type ApiEndpoint } from "@/lib/docs/api-surface";

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
    title: `${item.route.replace("/api/v1", "")}`,
    description: item.auth ? `Auth: ${item.auth}` : "Public endpoint.",
    method: item.method,
    path: item.route,
    curl: `curl -s -X ${item.method} http://localhost:3000${item.route}`,
  }));
}

export default async function ReliabilityPage() {
  const apiBaseDir = path.join(process.cwd(), "app", "api", "reliability");
  const reliabilityLibDir = path.join(process.cwd(), "lib", "reliability");

  const endpointMeta = new Map<string, { auth?: string; headers?: string[] }>([
    [
      "/api/v1/reliability/ingest",
      {
        auth: "Bearer API key (agent owner or admin)",
        headers: ["idempotency-key", "x-gpg-key-id", "x-gpg-timestamp", "x-gpg-signature"],
      },
    ],
  ]);

  const endpoints = await buildApiSurface({
    baseDir: apiBaseDir,
    routePrefix: "/api/v1/reliability",
    endpointMeta,
  });

  const quickstart = buildQuickstart(endpoints, [
    "/api/v1/reliability/agent/:id",
    "/api/v1/reliability/agent/:id/trends",
    "/api/v1/reliability/suggest/:agentId",
    "/api/v1/reliability/top",
    "/api/v1/reliability/graph",
    "/api/v1/reliability/ingest",
  ]);

  const apiCatalog = [
    {
      group: "Reliability API",
      items: endpoints.map((e) => ({
        label: `${e.method} ${e.route}`,
        auth: e.auth ?? "Public",
        headers: e.headers ?? [],
      })),
    },
  ];

  let libFiles = new Set<string>();
  try {
    libFiles = new Set<string>((await readdir(reliabilityLibDir)).filter((f) => f.endsWith(".ts")));
  } catch {
    libFiles = new Set<string>();
  }
  const capabilities = [
    libFiles.has("classifier.ts") ? "Failure type classification and pattern tracking." : null,
    libFiles.has("metrics.ts") ? "Rolling reliability metrics (success, latency, cost, hallucination, retry, dispute)." : null,
    libFiles.has("hiring.ts") ? "Percentile ranks and hiring score computation." : null,
    libFiles.has("suggestions.ts") ? "Self-optimization suggestions for agents." : null,
    libFiles.has("clusters.ts") ? "Cluster + price tier aggregation (Global Performance Graph)." : null,
    libFiles.has("sdk.ts") ? "SDK helper for client-side telemetry ingest." : null,
    endpoints.some((e) => e.route.includes("/agent/:id/trends")) ? "Agent reliability trends over configurable windows." : null,
    endpoints.some((e) => e.route.includes("/top")) ? "Top reliability rankings with cluster/tier filters." : null,
    endpoints.some((e) => e.route.includes("/run-benchmark")) ? "Benchmark runner endpoint to seed or validate metrics." : null,
    endpoints.some((e) => e.route.includes("/ingest"))
      ? "Signed, idempotent telemetry ingest with verification headers."
      : null,
  ].filter(Boolean) as string[];

  return (
    <section className="min-h-dvh bg-black text-white">
      <div className="container mx-auto px-4 sm:px-6 py-10 sm:py-14">
        <div className="flex flex-col lg:flex-row lg:items-end justify-between gap-6 mb-8">
          <div>
            <div className="flex items-center gap-2 mb-2">
              <div className="w-2 h-2 rounded-full bg-white animate-pulse" />
              <span className="text-xs font-medium text-white uppercase tracking-wider">Reliability Layer</span>
            </div>
            <h1 className="text-2xl sm:text-4xl font-bold text-white">Xpersona Reliability</h1>
            <p className="mt-2 text-sm text-white max-w-2xl">
              Machine-readable observability infrastructure so AI agents can measure, compare, and optimize
              themselves with live, signed telemetry.
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
              <h2 className="text-sm font-semibold uppercase tracking-wider text-white">Signed Telemetry</h2>
              <span className="text-[10px] rounded-full border border-white px-2 py-0.5">Public</span>
            </div>
            <p className="text-xs text-white mb-4">
              Signed, idempotent ingest designed for machine agents. Rejects duplicates and replays.
            </p>
            <div className="rounded-lg border border-white p-3 text-[11px]">
              <p className="text-white/70">Required headers</p>
              <p className="mt-1 font-mono">idempotency-key, x-gpg-key-id, x-gpg-timestamp, x-gpg-signature</p>
            </div>
          </div>

          <div className="rounded-2xl border border-white bg-black p-5">
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-sm font-semibold uppercase tracking-wider text-white">Reliability Signals</h2>
              <span className="text-[10px] rounded-full border border-white px-2 py-0.5">Live</span>
            </div>
            <p className="text-xs text-white mb-4">
              Success, latency, cost, retries, and dispute rates power deterministic routing and triage.
            </p>
            <div className="rounded-lg border border-white p-3 text-[11px]">
              <p className="text-white/70">Signal mix</p>
              <p className="mt-1 font-mono">success + latency + cost + retries + disputes</p>
            </div>
          </div>

          <div className="rounded-2xl border border-white bg-black p-5">
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-sm font-semibold uppercase tracking-wider text-white">Agent-first Ops</h2>
              <span className="text-[10px] rounded-full border border-white px-2 py-0.5">Routing</span>
            </div>
            <p className="text-xs text-white mb-4">
              Query reliability, select agent, execute, report outcome. Use trends to tune retries.
            </p>
            <div className="rounded-lg border border-white p-3 text-[11px]">
              <p className="text-white/70">Preferred cadence</p>
              <p className="mt-1 font-mono">5-15 min for hot tasks, daily for cold tasks</p>
            </div>
          </div>
        </div>

        <ReliabilityDashboard />
        <GlobalPerformanceGraph />

        <div className="mt-10 rounded-2xl border border-white bg-black p-6 sm:p-8">
          <div className="flex flex-col gap-3">
            <h2 className="text-2xl sm:text-3xl font-semibold text-white">Agent-First Ops</h2>
            <p className="text-sm text-white max-w-3xl">
              Operational guidance intended for autonomous agents and orchestration layers.
            </p>
          </div>
          <AgentOpsStats />
        </div>

        <div className="mt-10 rounded-2xl border border-white bg-black p-6 sm:p-8">
          <div className="flex flex-col gap-3">
            <h2 className="text-2xl sm:text-3xl font-semibold text-white">New API Additions</h2>
            <p className="text-sm text-white max-w-3xl">
              The latest machine endpoints now live for reliability-aware routing, metrics, and optimization.
            </p>
          </div>
          <div className="mt-4 grid gap-3 lg:grid-cols-2">
            {endpoints.map((item) => (
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

        <div className="mt-10 rounded-2xl border border-white bg-black p-6 sm:p-8">
          <div className="flex flex-col gap-3">
            <h2 className="text-2xl sm:text-3xl font-semibold text-white">API Quickstart</h2>
            <p className="text-sm text-white max-w-3xl">
              Direct machine endpoints for agents to query reliability and optimization guidance.
            </p>
          </div>
          <div className="mt-4 grid gap-3 lg:grid-cols-3">
            {quickstart.map((item) => (
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

        <div className="mt-10 rounded-2xl border border-white bg-black p-6 sm:p-8">
          <div className="flex flex-col gap-3">
            <h2 className="text-2xl sm:text-3xl font-semibold text-white">Reliability API Surface</h2>
            <p className="text-sm text-white max-w-3xl">Full endpoint surface detected in this codebase.</p>
          </div>
          <div className="mt-4 grid gap-3 lg:grid-cols-2">
            {apiCatalog.map((group) => (
              <div key={group.group} className="rounded-2xl border border-white bg-black p-4">
                <p className="text-xs uppercase tracking-[0.2em] text-white">{group.group}</p>
                <div className="mt-3 space-y-3">
                  {group.items.map((item) => (
                    <div key={item.label} className="rounded-xl border border-white bg-black px-3 py-2">
                      <div className="flex flex-wrap items-center gap-2 text-xs font-mono text-white">
                        <span className="text-white">{item.label}</span>
                        <span className="text-[10px] uppercase tracking-[0.2em] text-white">
                          Auth: {item.auth}
                        </span>
                      </div>
                      {item.headers.length > 0 && (
                        <p className="mt-2 text-[10px] uppercase tracking-[0.18em] text-white">
                          Required headers: {item.headers.join(", ")}
                        </p>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="mt-10 rounded-2xl border border-white bg-black p-6 sm:p-8">
          <div className="flex flex-col gap-3">
            <h2 className="text-2xl sm:text-3xl font-semibold text-white">Reliability Capabilities</h2>
            <p className="text-sm text-white max-w-3xl">
              Functionality available today based on the current reliability stack.
            </p>
          </div>
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            {capabilities.map((item) => (
              <div key={item} className="rounded-2xl border border-white bg-black p-4 text-sm text-white">
                {item}
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}

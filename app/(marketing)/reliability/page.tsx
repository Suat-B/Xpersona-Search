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
    <section className="min-h-dvh bg-[var(--bg-deep)] text-white">
      <div className="container mx-auto px-4 sm:px-6 py-10 sm:py-14">
        <div className="flex flex-col lg:flex-row lg:items-end justify-between gap-6 mb-8">
          <div>
            <div className="flex items-center gap-2 mb-2">
              <div className="w-2 h-2 rounded-full bg-[var(--accent-heart)] animate-pulse shadow-[0_0_8px_var(--accent-heart)]" />
              <span className="text-xs font-semibold text-[var(--accent-heart)] uppercase tracking-widest">Reliability Layer</span>
            </div>
            <h1 className="text-3xl sm:text-5xl font-bold text-white tracking-tight">Xpersona Reliability</h1>
            <p className="mt-3 text-base text-[var(--text-secondary)] max-w-2xl leading-relaxed">
              Machine-readable observability infrastructure so AI agents can measure, compare, and optimize
              themselves with live, signed telemetry.
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
              <h2 className="text-xs font-bold uppercase tracking-widest text-[var(--text-secondary)]">Signed Telemetry</h2>
              <span className="text-[10px] font-bold rounded-full bg-[var(--accent-heart)]/10 text-[var(--accent-heart)] px-2 py-0.5 border border-[var(--accent-heart)]/20">PUBLIC</span>
            </div>
            <p className="text-sm text-[var(--text-secondary)] mb-6 leading-relaxed">
              Signed, idempotent ingest designed for machine agents. Rejects duplicates and replays.
            </p>
            <div className="rounded-xl border border-[var(--border)] bg-white/5 p-4 text-[11px]">
              <p className="text-[var(--text-tertiary)] font-medium mb-1">Required headers</p>
              <p className="font-mono text-[var(--accent-heart)]">idempotency-key, x-gpg-key-id, x-gpg-timestamp, x-gpg-signature</p>
            </div>
          </div>

          <div className="rounded-2xl border border-[var(--border)] bg-[var(--bg-card)] p-6 hover:border-[var(--accent-heart)]/30 transition-colors">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-xs font-bold uppercase tracking-widest text-[var(--text-secondary)]">Reliability Signals</h2>
              <span className="text-[10px] font-bold rounded-full bg-[var(--accent-heart)]/10 text-[var(--accent-heart)] px-2 py-0.5 border border-[var(--accent-heart)]/20">LIVE</span>
            </div>
            <p className="text-sm text-[var(--text-secondary)] mb-6 leading-relaxed">
              Success, latency, cost, retries, and dispute rates power deterministic routing and triage.
            </p>
            <div className="rounded-xl border border-[var(--border)] bg-white/5 p-4 text-[11px]">
              <p className="text-[var(--text-tertiary)] font-medium mb-1">Signal mix</p>
              <p className="font-mono text-[var(--accent-heart)]">success + latency + cost + retries + disputes</p>
            </div>
          </div>

          <div className="rounded-2xl border border-[var(--border)] bg-[var(--bg-card)] p-6 hover:border-[var(--accent-heart)]/30 transition-colors">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-xs font-bold uppercase tracking-widest text-[var(--text-secondary)]">Agent-first Ops</h2>
              <span className="text-[10px] font-bold rounded-full bg-[var(--accent-heart)]/10 text-[var(--accent-heart)] px-2 py-0.5 border border-[var(--accent-heart)]/20">ROUTING</span>
            </div>
            <p className="text-sm text-[var(--text-secondary)] mb-6 leading-relaxed">
              Query reliability, select agent, execute, report outcome. Use trends to tune retries.
            </p>
            <div className="rounded-xl border border-[var(--border)] bg-white/5 p-4 text-[11px]">
              <p className="text-[var(--text-tertiary)] font-medium mb-1">Preferred cadence</p>
              <p className="font-mono text-[var(--accent-heart)]">5-15 min for hot tasks, daily for cold tasks</p>
            </div>
          </div>
        </div>

        <ReliabilityDashboard />
        <GlobalPerformanceGraph />

        <div className="mt-12 rounded-2xl border border-[var(--border)] bg-[var(--bg-card)] p-8">
          <div className="flex flex-col gap-3 mb-8">
            <h2 className="text-3xl font-bold text-white tracking-tight">Agent-First Ops</h2>
            <p className="text-base text-[var(--text-secondary)] max-w-3xl">
              Operational guidance intended for autonomous agents and orchestration layers.
            </p>
          </div>
          <AgentOpsStats />
        </div>

        <div className="mt-12 rounded-2xl border border-[var(--border)] bg-[var(--bg-card)] p-8">
          <div className="flex flex-col gap-3 mb-8">
            <h2 className="text-3xl font-bold text-white tracking-tight">New API Additions</h2>
            <p className="text-base text-[var(--text-secondary)] max-w-3xl">
              The latest machine endpoints now live for reliability-aware routing, metrics, and optimization.
            </p>
          </div>
          <div className="grid gap-4 lg:grid-cols-2">
            {endpoints.map((item) => (
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

        <div className="mt-12 rounded-2xl border border-[var(--border)] bg-[var(--bg-card)] p-8">
          <div className="flex flex-col gap-3 mb-8">
            <h2 className="text-3xl font-bold text-white tracking-tight">API Quickstart</h2>
            <p className="text-base text-[var(--text-secondary)] max-w-3xl">
              Direct machine endpoints for agents to query reliability and optimization guidance.
            </p>
          </div>
          <div className="grid gap-5 lg:grid-cols-3">
            {quickstart.map((item) => (
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

        <div className="mt-12 rounded-2xl border border-[var(--border)] bg-[var(--bg-card)] p-8">
          <div className="flex flex-col gap-3 mb-8">
            <h2 className="text-3xl font-bold text-white tracking-tight">Reliability API Surface</h2>
            <p className="text-base text-[var(--text-secondary)] max-w-3xl">Full endpoint surface detected in this codebase.</p>
          </div>
          <div className="grid gap-4 lg:grid-cols-2">
            {apiCatalog.map((group) => (
              <div key={group.group} className="rounded-2xl bg-black/20 p-6 border border-[var(--border)]">
                <p className="text-xs font-bold uppercase tracking-widest text-[var(--text-secondary)] mb-4">{group.group}</p>
                <div className="space-y-3">
                  {group.items.map((item) => (
                    <div key={item.label} className="rounded-xl border border-[var(--border)] bg-black/40 p-4">
                      <div className="flex flex-wrap items-center gap-3 text-xs font-mono">
                        <span className="text-white">{item.label}</span>
                        <span className="text-[10px] text-[var(--text-tertiary)]">
                          Auth: {item.auth}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="mt-12 rounded-2xl border border-[var(--border)] bg-[var(--bg-card)] p-8">
          <div className="flex flex-col gap-3 mb-8">
            <h2 className="text-3xl font-bold text-white tracking-tight">Reliability Capabilities</h2>
            <p className="text-base text-[var(--text-secondary)] max-w-3xl">
              Functionality available today based on the current reliability stack.
            </p>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            {capabilities.map((item) => (
              <div key={item} className="rounded-2xl border border-[var(--border)] bg-black/40 p-5 text-sm text-[var(--text-secondary)] hover:text-white transition-colors">
                {item}
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}

import Link from "next/link";
import { readFile, readdir, stat } from "fs/promises";
import path from "path";
import { auth } from "@/lib/auth";
import { cookies } from "next/headers";
import { getAuthUserFromCookie } from "@/lib/auth-utils";
import { ANSMinimalHeader } from "@/components/home/ANSMinimalHeader";
import { ANSMinimalFooter } from "@/components/home/ANSMinimalFooter";
import { ReliabilityDashboard } from "@/components/reliability/ReliabilityDashboard";
import { GlobalPerformanceGraph } from "@/components/reliability/GlobalPerformanceGraph";

export const dynamic = "force-dynamic";

export default async function ReliabilityPage() {
  let session = null;
  try {
    session = await auth();
  } catch {
    // Ignore auth source errors for public page rendering.
  }
  const cookieStore = await cookies();
  const userIdFromCookie = getAuthUserFromCookie(cookieStore);
  const isAuthenticated = !!(session?.user || userIdFromCookie);

  const apiBaseDir = path.join(process.cwd(), "app", "api", "reliability");
  const reliabilityLibDir = path.join(process.cwd(), "lib", "reliability");

  type ApiEndpoint = {
    method: string;
    route: string;
    auth?: string;
    headers?: string[];
  };

  async function listRouteFiles(dir: string): Promise<string[]> {
    const entries = await readdir(dir);
    const files: string[] = [];
    for (const entry of entries) {
      const full = path.join(dir, entry);
      const stats = await stat(full);
      if (stats.isDirectory()) {
        files.push(...(await listRouteFiles(full)));
      } else if (entry === "route.ts") {
        files.push(full);
      }
    }
    return files;
  }

  function toApiRoute(filePath: string): string {
    const rel = path.relative(apiBaseDir, filePath).replace(/\\/g, "/");
    const cleaned = rel.replace(/\/route\.ts$/, "");
    const withParams = cleaned.replace(/\[([^\]]+)\]/g, (_m, p1) => `:${p1}`);
    return `/api/v1/reliability/${withParams}`.replace(/\/$/, "");
  }

  function parseMethods(source: string): string[] {
    const methods = new Set<string>();
    const exportFnRegex = /export\s+async\s+function\s+(GET|POST|PUT|PATCH|DELETE|OPTIONS|HEAD)\b/g;
    const exportListRegex = /export\s*\{\s*([^}]+)\s*\}/g;
    let match: RegExpExecArray | null;
    while ((match = exportFnRegex.exec(source))) {
      methods.add(match[1]);
    }
    while ((match = exportListRegex.exec(source))) {
      const chunk = match[1];
      chunk
        .split(",")
        .map((s) => s.trim())
        .forEach((name) => {
          const cleaned = name.replace(/as\s+\w+$/, "").trim();
          if (["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS", "HEAD"].includes(cleaned)) {
            methods.add(cleaned);
          }
        });
    }
    return methods.size ? Array.from(methods) : ["GET"];
  }

  let routeFiles: string[] = [];
  try {
    routeFiles = await listRouteFiles(apiBaseDir);
  } catch {
    routeFiles = [];
  }
  const endpointMeta = new Map<string, { auth?: string; headers?: string[] }>([
    [
      "/api/v1/reliability/ingest",
      {
        auth: "Bearer API key (agent owner or admin)",
        headers: ["idempotency-key", "x-gpg-key-id", "x-gpg-timestamp", "x-gpg-signature"],
      },
    ],
  ]);

  const endpoints: ApiEndpoint[] = [];
  for (const file of routeFiles) {
    try {
      const source = await readFile(file, "utf-8");
      const route = toApiRoute(file);
      const methods = parseMethods(source);
      const meta = endpointMeta.get(route);
      for (const method of methods) {
        endpoints.push({
          method,
          route,
          auth: meta?.auth,
          headers: meta?.headers,
        });
      }
    } catch {
      continue;
    }
  }

  endpoints.sort((a, b) => a.route.localeCompare(b.route) || a.method.localeCompare(b.method));

  const quickstartPriority = [
    "/api/v1/reliability/agent/:id",
    "/api/v1/reliability/agent/:id/trends",
    "/api/v1/reliability/suggest/:agentId",
    "/api/v1/reliability/top",
    "/api/v1/reliability/graph",
    "/api/v1/reliability/ingest",
  ];

  const quickstartSorted = [...endpoints].sort((a, b) => {
    const aBase = a.route.split("?")[0];
    const bBase = b.route.split("?")[0];
    const aIdx = quickstartPriority.indexOf(aBase);
    const bIdx = quickstartPriority.indexOf(bBase);
    const aRank = aIdx === -1 ? 999 : aIdx;
    const bRank = bIdx === -1 ? 999 : bIdx;
    if (aRank !== bRank) return aRank - bRank;
    return a.route.localeCompare(b.route) || a.method.localeCompare(b.method);
  });

  const quickstart = quickstartSorted.slice(0, 6).map((item) => ({
    title: `${item.method} ${item.route.replace("/api/v1", "")}`,
    description: item.auth ? `Auth: ${item.auth}` : "Public endpoint.",
    method: item.method,
    path: item.route,
    curl: `curl -s -X ${item.method} http://localhost:3000${item.route}`,
  }));

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
    <div className="min-h-screen flex flex-col bg-[var(--bg-deep)]">
      <ANSMinimalHeader isAuthenticated={isAuthenticated} variant="dark" />

      <main className="flex-1">
        <section className="mx-auto w-full max-w-5xl px-4 py-10 sm:px-6 sm:py-14">
          <div className="rounded-3xl border border-white/[0.08] bg-black/40 p-6 sm:p-10 shadow-[0_30px_60px_rgba(0,0,0,0.45)]">
            <div className="flex flex-col gap-3">
              <h1 className="text-3xl sm:text-4xl font-bold text-[var(--text-primary)]">
                Xpersona Reliability
              </h1>
              <p className="text-sm sm:text-base text-[var(--text-secondary)] max-w-3xl">
                Machine-readable observability infrastructure for agents to measure, compare, and optimize themselves.
              </p>
              <div className="flex flex-wrap gap-3">
                <div className="inline-flex items-center gap-2 rounded-full border border-emerald-400/30 bg-emerald-500/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.18em] text-emerald-200 w-fit">
                  All Phases Implemented
                </div>
                <div className="inline-flex items-center gap-2 rounded-full border border-cyan-400/30 bg-cyan-500/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.18em] text-cyan-200 w-fit">
                  Live Metrics Enabled
                </div>
              </div>
              <Link
                href="/"
                className="text-sm text-[var(--accent-heart)] hover:underline w-fit"
              >
                Back to home
              </Link>
            </div>

            <ReliabilityDashboard />

            <GlobalPerformanceGraph />

            <div className="mt-10">
              <h2 className="text-xl font-semibold text-[var(--text-primary)]">API Quickstart</h2>
              <p className="mt-2 text-sm text-[var(--text-secondary)] max-w-3xl">
                Direct machine endpoints for agents to query reliability and optimization guidance.
              </p>
              <div className="mt-4 grid gap-3 lg:grid-cols-3">
                {quickstart.map((item) => (
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

            <div className="mt-10">
              <h2 className="text-xl font-semibold text-[var(--text-primary)]">Reliability API Surface</h2>
              <p className="mt-2 text-sm text-[var(--text-secondary)] max-w-3xl">
                Full endpoint surface detected in this codebase.
              </p>
              <div className="mt-4 grid gap-3 lg:grid-cols-2">
                {apiCatalog.map((group) => (
                  <div key={group.group} className="rounded-2xl border border-white/[0.08] bg-black/30 p-4">
                    <p className="text-xs uppercase tracking-[0.2em] text-[var(--text-tertiary)]">
                      {group.group}
                    </p>
                    <div className="mt-3 space-y-3">
                      {group.items.map((item) => (
                        <div key={item.label} className="rounded-xl border border-white/[0.08] bg-black/40 px-3 py-2">
                          <div className="flex flex-wrap items-center gap-2 text-xs font-mono text-[var(--text-secondary)]">
                            <span className="text-emerald-200">{item.label}</span>
                            <span className="text-[10px] uppercase tracking-[0.2em] text-[var(--text-tertiary)]">
                              Auth: {item.auth}
                            </span>
                          </div>
                          {item.headers.length > 0 && (
                            <p className="mt-2 text-[10px] uppercase tracking-[0.18em] text-[var(--text-tertiary)]">
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

            <div className="mt-10">
              <h2 className="text-xl font-semibold text-[var(--text-primary)]">Reliability Capabilities</h2>
              <p className="mt-2 text-sm text-[var(--text-secondary)] max-w-3xl">
                Functionality available today based on the current reliability stack.
              </p>
              <div className="mt-4 grid gap-3 sm:grid-cols-2">
                {capabilities.map((item) => (
                  <div
                    key={item}
                    className="rounded-2xl border border-white/[0.08] bg-black/30 p-4 text-sm text-[var(--text-secondary)]"
                  >
                    {item}
                  </div>
                ))}
              </div>
            </div>

          </div>
        </section>
      </main>

      <ANSMinimalFooter variant="dark" />
    </div>
  );
}

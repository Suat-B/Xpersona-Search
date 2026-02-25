import path from "path";
import { auth } from "@/lib/auth";
import { cookies } from "next/headers";
import { getAuthUserFromCookie } from "@/lib/auth-utils";
import { ANSMinimalHeader } from "@/components/home/ANSMinimalHeader";
import { ANSMinimalFooter } from "@/components/home/ANSMinimalFooter";
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
    curl: `curl -s -X ${item.method} http://localhost:3000${item.route}`,
  }));
}

export default async function GraphPage() {
  let session = null;
  try {
    session = await auth();
  } catch {
    // Ignore auth errors for public page rendering.
  }
  const cookieStore = await cookies();
  const userIdFromCookie = getAuthUserFromCookie(cookieStore);
  const isAuthenticated = !!(session?.user || userIdFromCookie);

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
    <div className="min-h-screen flex flex-col bg-[var(--bg-deep)]">
      <ANSMinimalHeader isAuthenticated={isAuthenticated} variant="dark" />

      <main className="flex-1">
        <GraphExplorer />

        <section className="mx-auto w-full max-w-5xl px-4 pb-12 sm:px-6">
          <div className="rounded-3xl border border-white/[0.08] bg-black/40 p-6 sm:p-10 shadow-[0_30px_60px_rgba(0,0,0,0.45)]">
            <div className="flex flex-col gap-3">
              <h2 className="text-2xl sm:text-3xl font-semibold text-[var(--text-primary)]">Graph API Additions</h2>
              <p className="text-sm text-[var(--text-secondary)] max-w-3xl">
                Direct machine endpoints for querying the Global Performance Graph and planning pipelines.
              </p>
            </div>

            <div className="mt-8">
              <h3 className="text-xl font-semibold text-[var(--text-primary)]">API Quickstart</h3>
              <p className="mt-2 text-sm text-[var(--text-secondary)] max-w-3xl">
                Recommended endpoints to get up and running.
              </p>
              <div className="mt-4 grid gap-3 lg:grid-cols-3">
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

            <div className="mt-10">
              <h3 className="text-xl font-semibold text-[var(--text-primary)]">GPG API Surface</h3>
              <p className="mt-2 text-sm text-[var(--text-secondary)] max-w-3xl">
                All available endpoints detected in this codebase.
              </p>
              <div className="mt-4 grid gap-3 lg:grid-cols-2">
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

            {capabilities.length > 0 && (
              <div className="mt-10">
                <h3 className="text-xl font-semibold text-[var(--text-primary)]">GPG Capabilities</h3>
                <p className="mt-2 text-sm text-[var(--text-secondary)] max-w-3xl">
                  Functionality available today based on the current GPG stack.
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
            )}
          </div>
        </section>
      </main>

      <ANSMinimalFooter variant="dark" />
    </div>
  );
}

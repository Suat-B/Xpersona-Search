import { readFile } from "fs/promises";
import path from "path";
import Link from "next/link";
import { auth } from "@/lib/auth";
import { cookies } from "next/headers";
import { getAuthUserFromCookie } from "@/lib/auth-utils";
import { ANSMinimalHeader } from "@/components/home/ANSMinimalHeader";
import { ANSMinimalFooter } from "@/components/home/ANSMinimalFooter";
import { SkillMarkdown } from "@/components/agent/SkillMarkdown";
import { ReliabilityDashboard } from "@/components/reliability/ReliabilityDashboard";

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

  const filePath = path.join(process.cwd(), "XPERSONA-RELIABILITY.MD");
  const content = await readFile(filePath, "utf-8");
  const phases = [
    { title: "Phase 0", subtitle: "Database Extensions", status: "Implemented" },
    { title: "Phase 1", subtitle: "Telemetry Ingestion", status: "Implemented" },
    { title: "Phase 2", subtitle: "Metric Engine", status: "Implemented" },
    { title: "Phase 3", subtitle: "Failure Classifier", status: "Implemented" },
    { title: "Phase 4", subtitle: "Reliability API", status: "Implemented" },
    { title: "Phase 5", subtitle: "Self-Optimization Loop", status: "Implemented" },
    { title: "Phase 6", subtitle: "Economy Integration", status: "Implemented" },
    { title: "Phase 7", subtitle: "Benchmark Suites", status: "Implemented" },
    { title: "Phase 8", subtitle: "Global Performance Graph", status: "Implemented" },
  ];
  const quickstart = [
    {
      title: "Agent Metrics",
      description: "Fetch live reliability metrics for an agent by slug or id.",
      method: "GET",
      path: "/api/reliability/agent/:id",
      curl: "curl -s http://localhost:3000/api/reliability/agent/AGENT_SLUG",
    },
    {
      title: "Suggestions",
      description: "Get self-optimization suggestions for an agent.",
      method: "GET",
      path: "/api/reliability/suggest/:agentId",
      curl: "curl -s http://localhost:3000/api/reliability/suggest/AGENT_SLUG",
    },
    {
      title: "Top Agents",
      description: "List top agents by reliability ranking.",
      method: "GET",
      path: "/api/reliability/top?limit=5",
      curl: "curl -s \"http://localhost:3000/api/reliability/top?limit=5\"",
    },
  ];

  return (
    <div className="min-h-screen flex flex-col bg-[var(--bg-deep)]">
      <ANSMinimalHeader isAuthenticated={isAuthenticated} variant="dark" />

      <main className="flex-1">
        <section className="mx-auto w-full max-w-5xl px-4 py-10 sm:px-6 sm:py-14">
          <div className="rounded-3xl border border-white/[0.08] bg-black/40 p-6 sm:p-10 shadow-[0_30px_60px_rgba(0,0,0,0.45)]">
            <div className="flex flex-col gap-3">
              <div className="inline-flex items-center rounded-full border border-white/[0.12] bg-white/5 px-3 py-1 text-xs font-semibold uppercase tracking-[0.2em] text-[var(--text-tertiary)]">
                Reliability Blueprint
              </div>
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
              <h2 className="text-xl font-semibold text-[var(--text-primary)]">Phase Overview</h2>
              <p className="mt-2 text-sm text-[var(--text-secondary)] max-w-3xl">
                Each phase builds the machine-readable reliability stack. All phases listed below are represented in the live stack.
              </p>
              <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {phases.map((phase) => (
                  <div
                    key={phase.title}
                    className="rounded-2xl border border-white/[0.08] bg-black/30 p-4"
                  >
                    <p className="text-xs uppercase tracking-[0.25em] text-[var(--text-tertiary)]">{phase.title}</p>
                    <p className="mt-2 text-base font-semibold text-[var(--text-primary)]">{phase.subtitle}</p>
                    <div className="mt-3 inline-flex items-center gap-2 rounded-full border border-emerald-400/30 bg-emerald-500/10 px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.18em] text-emerald-200">
                      {phase.status}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="mt-8 rounded-2xl border border-white/[0.08] bg-black/30 p-5 sm:p-8">
              <SkillMarkdown content={content} />
            </div>
          </div>
        </section>
      </main>

      <ANSMinimalFooter variant="dark" />
    </div>
  );
}

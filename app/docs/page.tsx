"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

type OpenAPISpec = {
  info?: { title?: string; description?: string; version?: string };
  servers?: Array<{ url: string }>;
  paths?: Record<string, Record<string, { summary?: string; description?: string }>>;
};

export default function DocsPage() {
  const [spec, setSpec] = useState<OpenAPISpec | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/v1/openapi/public")
      .then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json();
      })
      .then(setSpec)
      .catch((err) => setError(err instanceof Error ? err.message : "Failed to load"));
  }, []);

  if (error) {
    return <main className="p-8 text-red-400">Failed to load docs: {error}</main>;
  }
  if (!spec) {
    return <main className="p-8 text-[var(--text-secondary)]">Loading API docs...</main>;
  }

  const paths = spec.paths ?? {};
  const base = spec.servers?.[0]?.url ?? "https://xpersona.co";
  const searchCurl = `curl -s "${base}/api/v1/search?q=crypto+trading&protocols=A2A,MCP&limit=5"`;
  const aiCurl = `curl -s "${base}/api/v1/search/ai?q=best+agents+for+research&limit=3"`;
  const graphPlanCurl = `curl -s -X POST "${base}/api/v1/graph/plan" -H "Content-Type: application/json" -d '{"q":"Research Tesla stock","preferences":{"optimizeFor":"success_then_cost"}}'`;
  const snapshotCurl = `curl -s "${base}/api/v1/agents/my-agent-slug/snapshot"`;
  const toolDescriptorCurl = `curl -s "${base}/api/v1/search/tool"`;

  return (
    <main className="min-h-screen bg-[var(--bg-deep)] text-[var(--text-primary)] p-6">
      <div className="mx-auto max-w-4xl space-y-6">
        <header>
          <h1 className="text-2xl font-semibold">
            <Link href="/">Xpersona</Link> API Docs
          </h1>
          <p className="text-sm text-[var(--text-secondary)] mt-1">
            Search + agent ownership endpoints.
          </p>
        </header>

        <section className="agent-card p-5">
          <p className="text-sm text-[var(--text-secondary)]">Base URL: <code>{base}</code></p>
          <p className="text-sm text-[var(--text-secondary)] mt-1">Use <code>Authorization: Bearer &lt;API_KEY&gt;</code> for protected routes.</p>
        </section>

        <section className="agent-card p-5">
          <h2 className="text-sm font-semibold text-[var(--text-primary)]">Quickstart in 3 Steps</h2>
          <ol className="mt-2 list-decimal pl-5 space-y-2 text-sm text-[var(--text-secondary)]">
            <li>Discover agents with <code>GET /api/v1/search</code> or low-token mode <code>GET /api/v1/search/ai</code>.</li>
            <li>Inspect candidates via <code>GET /api/v1/agents/{`{slug}`}/snapshot</code>.</li>
            <li>For orchestration, query Graph planning at <code>POST /api/v1/graph/plan</code>.</li>
          </ol>
        </section>

        <section className="agent-card p-5 space-y-4">
          <h2 className="text-sm font-semibold text-[var(--text-primary)]">Copy-Paste Examples</h2>
          <div>
            <p className="text-xs uppercase tracking-wide text-[var(--text-secondary)]">Search</p>
            <pre className="mt-1 overflow-x-auto rounded bg-black/40 p-3 text-xs text-emerald-300">{searchCurl}</pre>
          </div>
          <div>
            <p className="text-xs uppercase tracking-wide text-[var(--text-secondary)]">AI Mode</p>
            <pre className="mt-1 overflow-x-auto rounded bg-black/40 p-3 text-xs text-emerald-300">{aiCurl}</pre>
          </div>
          <div>
            <p className="text-xs uppercase tracking-wide text-[var(--text-secondary)]">Graph Plan</p>
            <pre className="mt-1 overflow-x-auto rounded bg-black/40 p-3 text-xs text-emerald-300">{graphPlanCurl}</pre>
          </div>
          <div>
            <p className="text-xs uppercase tracking-wide text-[var(--text-secondary)]">Agent Snapshot</p>
            <pre className="mt-1 overflow-x-auto rounded bg-black/40 p-3 text-xs text-emerald-300">{snapshotCurl}</pre>
          </div>
          <div>
            <p className="text-xs uppercase tracking-wide text-[var(--text-secondary)]">Tool Descriptor</p>
            <pre className="mt-1 overflow-x-auto rounded bg-black/40 p-3 text-xs text-emerald-300">{toolDescriptorCurl}</pre>
          </div>
        </section>

        <section className="agent-card p-5">
          <h2 className="text-sm font-semibold text-[var(--text-primary)]">Error & Retry Semantics</h2>
          <ul className="mt-2 space-y-1 text-sm text-[var(--text-secondary)]">
            <li><code>400</code>: invalid input (fix parameters).</li>
            <li><code>429</code>: rate-limited; respect <code>Retry-After</code>.</li>
            <li><code>503</code>/<code>504</code>: temporary service issue; retry with backoff.</li>
            <li>Errors include <code>error.code</code>, <code>error.message</code>, and request metadata headers.</li>
          </ul>
        </section>

        <section className="agent-card p-5">
          <h2 className="text-sm font-semibold text-[var(--text-primary)]">Agent-Only Resources</h2>
          <p className="text-sm text-[var(--text-secondary)] mt-1">
            Machine-readable surfaces intended for agents and automation tooling.
          </p>
          <div className="mt-3">
            <Link
              href="/docs/capability-contracts"
              className="text-sm text-[var(--accent-heart)] hover:underline"
            >
              Capability Contracts
            </Link>
          </div>
        </section>

        <section className="space-y-3">
          {Object.entries(paths).map(([path, methods]) => (
            <div key={path} className="agent-card p-4">
              <p className="font-mono text-sm">{path}</p>
              <div className="mt-2 space-y-1">
                {Object.entries(methods).map(([method, op]) => (
                  <p key={`${path}-${method}`} className="text-sm text-[var(--text-secondary)]">
                    <strong className="uppercase text-[var(--text-primary)]">{method}</strong> {op.summary ?? op.description ?? ""}
                  </p>
                ))}
              </div>
            </div>
          ))}
        </section>

        <div className="flex gap-4">
          <a href="/openapi.v1.public.json" className="text-sm text-[var(--accent-heart)] hover:underline">Download OpenAPI JSON</a>
          <a href="/openapi.yaml" className="text-sm text-[var(--accent-heart)] hover:underline">Download OpenAPI YAML</a>
        </div>
      </div>
    </main>
  );
}




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

        <a href="/openapi.v1.public.json" className="text-sm text-[var(--accent-heart)] hover:underline">Download OpenAPI JSON</a>
      </div>
    </main>
  );
}




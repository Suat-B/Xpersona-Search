"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

type OpenAPISpec = {
  info?: {
    title?: string;
    description?: string;
    version?: string;
    contact?: { name?: string; email?: string };
  };
  servers?: Array<{ url: string; description?: string }>;
  paths?: Record<
    string,
    Record<
      string,
      {
        summary?: string;
        description?: string;
        security?: unknown[];
        requestBody?: { content?: Record<string, { schema?: object }> };
        parameters?: Array<{ name: string; in: string; required?: boolean; schema?: { type: string } }>;
        responses?: Record<string, { description?: string }>;
      }
    >
  >;
};

function groupPaths(paths: NonNullable<OpenAPISpec["paths"]>): Map<string, string[]> {
  const groups = new Map<string, string[]>();
  const skip = ["/api/docs", "/api/health"];
  for (const path of Object.keys(paths).sort()) {
    if (skip.includes(path) || path.includes("{")) continue;
    const parts = path.replace(/^\/api\//, "").split("/");
    const group = parts[0] ?? "other";
    const existing = groups.get(group) ?? [];
    existing.push(path);
    groups.set(group, existing);
  }
  return groups;
}

function methodColor(method: string): string {
  switch (method.toUpperCase()) {
    case "GET":
      return "text-emerald-400";
    case "POST":
      return "text-amber-400";
    case "PUT":
      return "text-blue-400";
    case "PATCH":
      return "text-cyan-400";
    case "DELETE":
      return "text-rose-400";
    default:
      return "text-white/80";
  }
}

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      onClick={() => {
        navigator.clipboard.writeText(text);
        setCopied(true);
        setTimeout(() => setCopied(false), 1500);
      }}
      className="absolute top-2 right-2 rounded-lg px-2 py-1 text-xs font-medium bg-white/5 hover:bg-white/10 text-[var(--text-secondary)] transition-colors"
    >
      {copied ? "Copied!" : "Copy"}
    </button>
  );
}

export default function DocsPage() {
  const [spec, setSpec] = useState<OpenAPISpec | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/openapi")
      .then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json();
      })
      .then(setSpec)
      .catch((err) => setError(err instanceof Error ? err.message : "Failed to load"))
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <main className="min-h-screen bg-[var(--bg-deep)] text-[var(--text-primary)]">
        <div className="flex min-h-[60vh] items-center justify-center">
          <span className="text-[var(--text-secondary)] animate-pulse">Loading API documentation…</span>
        </div>
      </main>
    );
  }

  if (error || !spec) {
    return (
      <main className="min-h-screen bg-[var(--bg-deep)] p-6">
        <div className="mx-auto max-w-md rounded-xl border border-red-500/30 bg-red-500/10 p-6 text-red-200">
          <p className="font-semibold">Failed to load API spec</p>
          <p className="mt-1 text-sm opacity-90">{error ?? "Unknown error"}</p>
          <a
            href="/openapi.yaml"
            className="mt-4 inline-block text-sm underline hover:no-underline"
          >
            Download openapi.yaml instead
          </a>
        </div>
      </main>
    );
  }

  const paths = spec.paths ?? {};
  const groups = groupPaths(paths);
  const baseUrl = spec.servers?.[0]?.url ?? "https://xpersona.co";

  return (
    <main className="min-h-screen bg-[var(--bg-deep)] text-[var(--text-primary)]">
      {/* Header */}
      <header className="sticky top-0 z-30 border-b border-white/5 bg-[var(--bg-deep)]/95 backdrop-blur-xl">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-4 py-4 sm:px-6">
          <div>
            <h1 className="text-xl font-bold font-[family-name:var(--font-outfit)] tracking-tight">
              <Link href="/" className="hover:opacity-90 transition-opacity">
                Xpersona<span className="text-[var(--accent-heart)]">.</span>
              </Link>
              {" "}
              <span className="text-[var(--text-secondary)] font-normal">API Docs</span>
            </h1>
            <p className="mt-0.5 text-sm text-[var(--text-secondary)]">
              AI-first casino. All endpoints require <code className="rounded bg-white/10 px-1 font-mono text-xs">Authorization: Bearer &lt;key&gt;</code>
            </p>
          </div>
          <Link
            href="/dashboard/api"
            className="inline-flex items-center gap-2 rounded-xl border border-[var(--accent-heart)]/40 bg-[var(--accent-heart)]/10 px-4 py-2.5 text-sm font-medium text-[var(--accent-heart)] hover:bg-[var(--accent-heart)]/20 transition-colors"
          >
            Get API key
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7l5 5m0 0l-5 5m5-5H6" />
            </svg>
          </Link>
        </div>
      </header>

      <div className="mx-auto max-w-5xl px-4 py-10 sm:px-6">
        {/* Overview */}
        <section className="mb-12">
          <h2 className="text-lg font-semibold text-white mb-3">Overview</h2>
          <div className="prose prose-invert max-w-none rounded-2xl border border-white/5 bg-[var(--bg-card)] p-6 text-sm leading-relaxed text-[var(--text-secondary)]">
            <div
              className="whitespace-pre-wrap"
              dangerouslySetInnerHTML={{
                __html: (spec.info?.description ?? "")
                  .replace(/\*\*(.+?)\*\*/g, "<strong class='text-white'>$1</strong>")
                  .replace(/`([^`]+)`/g, "<code class='rounded bg-white/10 px-1 font-mono text-xs'>$1</code>"),
              }}
            />
          </div>
        </section>

        {/* Authentication */}
        <section className="mb-12">
          <h2 className="text-lg font-semibold text-white mb-3">Authentication</h2>
          <div className="rounded-2xl border border-white/5 bg-[var(--bg-card)] p-6 space-y-4">
            <p className="text-sm text-[var(--text-secondary)]">
              All authenticated endpoints require the header{" "}
              <code className="rounded bg-white/10 px-1.5 py-0.5 font-mono text-xs">Authorization: Bearer &lt;API_KEY&gt;</code>.
              Get your key from{" "}
              <Link href="/dashboard/api" className="text-[var(--accent-heart)] hover:underline">
                Dashboard → API
              </Link>
              .
            </p>
            <div className="relative rounded-xl bg-black/50 p-4 font-mono text-xs overflow-x-auto">
              <CopyButton text={`curl -H "Authorization: Bearer $XPERSONA_API_KEY" "${baseUrl}/api/me/balance"`} />
              <pre className="text-cyan-300/90">
{`curl -H "Authorization: Bearer $XPERSONA_API_KEY" \\
  "${baseUrl}/api/me/balance"`}
              </pre>
            </div>
          </div>
        </section>

        {/* Endpoints by group */}
        {Array.from(groups.entries()).map(([group, pathList]) => (
          <section key={group} className="mb-12" id={`group-${group}`}>
            <h2 className="text-lg font-semibold text-white mb-4 capitalize">
              {group.replace(/-/g, " ")} endpoints
            </h2>
            <div className="space-y-4">
              {pathList.map((path) => {
                const ops = paths[path];
                if (!ops) return null;
                return (
                  <div
                    key={path}
                    className="rounded-2xl border border-white/5 bg-[var(--bg-card)] overflow-hidden"
                  >
                    {Object.entries(ops).map(([method, op]) => {
                      if (method.startsWith("x-") || method === "parameters") return null;
                      return (
                        <div
                          key={`${path}-${method}`}
                          className="border-b border-white/5 last:border-b-0 p-5"
                        >
                          <div className="flex flex-wrap items-center gap-2 mb-2">
                            <span
                              className={`font-mono text-xs font-bold px-2 py-0.5 rounded ${methodColor(method)}`}
                            >
                              {method.toUpperCase()}
                            </span>
                            <code className="text-sm font-mono text-white/90">{path}</code>
                          </div>
                          {op.summary && (
                            <p className="text-sm font-medium text-white mb-1">{op.summary}</p>
                          )}
                          {op.description && (
                            <p className="text-xs text-[var(--text-secondary)] leading-relaxed mb-3">
                              {op.description}
                            </p>
                          )}
                          <div className="relative rounded-lg bg-black/50 p-3 font-mono text-[11px] overflow-x-auto">
                            <CopyButton
                              text={
                                method.toLowerCase() === "get"
                                  ? `curl -H "Authorization: Bearer $XPERSONA_API_KEY" "${baseUrl}${path}"`
                                  : `curl -X ${method.toUpperCase()} -H "Authorization: Bearer $XPERSONA_API_KEY" -H "Content-Type: application/json" "${baseUrl}${path}"`
                              }
                            />
                            <pre className="text-emerald-300/90 break-all">
                              {method.toLowerCase() === "get"
                                ? `curl -H "Authorization: Bearer $XPERSONA_API_KEY" "${baseUrl}${path}"`
                                : `curl -X ${method.toUpperCase()} \\
  -H "Authorization: Bearer $XPERSONA_API_KEY" \\
  -H "Content-Type: application/json" \\
  "${baseUrl}${path}"`}
                            </pre>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                );
              })}
            </div>
          </section>
        ))}

        {/* Footer CTA */}
        <section className="mt-16 rounded-2xl border border-[var(--accent-heart)]/20 bg-[var(--accent-heart)]/5 p-8 text-center">
          <h3 className="text-lg font-semibold text-white mb-2">Ready to build?</h3>
          <p className="text-sm text-[var(--text-secondary)] mb-4 max-w-md mx-auto">
            Get your API key from the dashboard and start playing. Same endpoints for humans and AI.
          </p>
          <div className="flex flex-wrap justify-center gap-3">
            <Link
              href="/dashboard/api"
              className="inline-flex items-center gap-2 rounded-xl bg-[var(--accent-heart)] px-5 py-2.5 text-sm font-semibold text-white hover:opacity-90 transition-opacity"
            >
              Get API key
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7l5 5m0 0l-5 5m5-5H6" />
              </svg>
            </Link>
            <a
              href="/openapi.yaml"
              className="inline-flex items-center gap-2 rounded-xl border border-white/10 px-5 py-2.5 text-sm font-medium hover:bg-white/5 transition-colors"
            >
              Download openapi.yaml
            </a>
          </div>
        </section>
      </div>
    </main>
  );
}

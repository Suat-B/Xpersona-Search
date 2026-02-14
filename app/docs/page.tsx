"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { AI_FIRST_MESSAGING } from "@/lib/ai-first-messaging";

type RedocGlobal = { Redoc: { init: (spec: string | object, opts: object, el: HTMLElement) => void } };

export default function DocsPage() {
  const containerRef = useRef<HTMLDivElement>(null);
  const [status, setStatus] = useState<"loading" | "error" | "ready">("loading");
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  useEffect(() => {
    if (typeof window === "undefined" || !containerRef.current) return;

    let cancelled = false;

    const run = async () => {
      try {
        const [scriptLoaded, spec] = await Promise.all([
          new Promise<boolean>((resolve) => {
            if ((window as unknown as RedocGlobal).Redoc) {
              resolve(true);
              return;
            }
            const script = document.createElement("script");
            script.src = "https://cdn.jsdelivr.net/npm/redoc@2.1.3/bundles/redoc.standalone.js";
            script.async = true;
            script.onload = () => resolve(true);
            script.onerror = () => resolve(false);
            document.head.appendChild(script);
          }),
          fetch("/api/openapi").then((r) => {
            if (!r.ok) throw new Error(`HTTP ${r.status}`);
            return r.json();
          }),
        ]);

        if (cancelled || !containerRef.current) return;

        if (!scriptLoaded) {
          setErrorMsg("ReDoc script failed to load.");
          setStatus("error");
          return;
        }

        const Redoc = (window as unknown as RedocGlobal).Redoc;
        if (!Redoc) {
          setErrorMsg("ReDoc is not available.");
          setStatus("error");
          return;
        }

        const theme = {
          colors: {
            text: { primary: "#1a1a1a", secondary: "#555" },
            primary: { main: "#32329f" },
          },
          typography: {
            fontSize: "14px",
            fontFamily: "system-ui, sans-serif",
            code: { color: "#c41d7f", backgroundColor: "rgba(38,50,56,0.06)" },
            headings: { fontFamily: "system-ui, sans-serif" },
            links: { color: "#32329f" },
          },
          sidebar: {
            backgroundColor: "#fafafa",
            textColor: "#333",
            activeTextColor: "#32329f",
          },
          rightPanel: {
            backgroundColor: "#263238",
            textColor: "#ffffff",
          },
        };
        Redoc.init(spec, { hideDownloadButton: false, theme }, containerRef.current);
        setStatus("ready");
      } catch (err) {
        if (cancelled) return;
        const msg = err instanceof Error ? err.message : "Failed to load API spec";
        setErrorMsg(msg);
        setStatus("error");
      }
    };

    run();
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <main className="min-h-screen bg-[var(--bg-matte)]">
      <div className="border-b border-[var(--border)] bg-[var(--bg-card)]/80 backdrop-blur-sm px-6 py-4">
        <div className="max-w-4xl mx-auto flex flex-wrap items-center justify-between gap-4">
          <div>
            <h1 className="text-xl font-bold text-[var(--text-primary)] font-[family-name:var(--font-outfit)]">
              {AI_FIRST_MESSAGING.docsHeader}
            </h1>
            <p className="text-sm text-[var(--text-secondary)] mt-0.5">
              {AI_FIRST_MESSAGING.docsSubtitle}
            </p>
          </div>
          <Link
            href="/dashboard/api"
            className="inline-flex items-center gap-2 rounded-lg border border-[var(--accent-heart)]/30 bg-[var(--accent-heart)]/10 px-4 py-2 text-sm font-medium text-[var(--accent-heart)] hover:bg-[var(--accent-heart)]/20 transition-colors"
          >
            {AI_FIRST_MESSAGING.forAIAgents}
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
            </svg>
          </Link>
        </div>
      </div>
      <div className="docs-page relative min-h-[80vh]">
        <div
          ref={containerRef}
          className="redoc-wrap docs-redoc-container min-h-[80vh]"
        />
        {status === "loading" && (
          <div
            className="absolute inset-0 flex items-center justify-center bg-[var(--bg-matte)]"
            aria-live="polite"
          >
            <span className="text-[var(--text-secondary)]">Loading API documentation…</span>
          </div>
        )}
        {status === "error" && (
          <div className="absolute inset-0 flex items-center justify-center p-6">
            <div className="max-w-md rounded-lg border border-red-500/30 bg-red-500/10 p-4 text-red-200">
              <p className="font-medium">Failed to load API spec</p>
              <p className="mt-1 text-sm opacity-90">{errorMsg}</p>
              <a
                href="/openapi.yaml"
                className="mt-3 inline-block text-sm underline hover:no-underline"
              >
                Download openapi.yaml instead
              </a>
            </div>
          </div>
        )}
      </div>
    </main>
  );
}

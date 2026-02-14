"use client";

import { useEffect, useRef } from "react";
import Link from "next/link";
import { AI_FIRST_MESSAGING } from "@/lib/ai-first-messaging";

export default function DocsPage() {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (typeof window === "undefined" || !containerRef.current) return;
    const script = document.createElement("script");
    script.src = "https://cdn.redoc.ly/redoc/latest/redoc.standalone.js";
    script.async = true;
    script.onload = () => {
      if (containerRef.current && (window as unknown as { Redoc: unknown }).Redoc) {
        (window as unknown as { Redoc: { init: (path: string, opts: object, el: HTMLElement) => void } }).Redoc.init(
          "/openapi.yaml",
          { hideDownloadButton: false },
          containerRef.current
        );
      }
    };
    document.head.appendChild(script);
    return () => {
      script.remove();
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
      <div ref={containerRef} className="redoc-wrap" />
    </main>
  );
}

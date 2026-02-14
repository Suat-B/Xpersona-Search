"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { cn } from "@/lib/utils";

export function ApiKeySection() {
  const [prefix, setPrefix] = useState<string | null>(null);
  const [modalKey, setModalKey] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/me", { credentials: "include" })
      .then(async (r) => {
        const text = await r.text();
        try {
          return { ok: r.ok, data: text ? JSON.parse(text) : {} };
        } catch {
          return { ok: false, data: {} };
        }
      })
      .then(({ ok, data }) => {
        if (ok && data.success) setPrefix(data.data?.apiKeyPrefix ?? null);
      });
  }, []);

  const generate = async () => {
    setError(null);
    setLoading(true);
    const res = await fetch("/api/me/api-key", { method: "POST", credentials: "include" });
    const text = await res.text();
    let data: { success?: boolean; data?: { apiKey?: string; apiKeyPrefix?: string }; error?: string };
    try {
      data = text ? JSON.parse(text) : {};
    } catch {
      data = {};
    }
    setLoading(false);
    if (data.success && data.data) {
      setModalKey(data.data.apiKey ?? null);
      setPrefix(data.data.apiKeyPrefix ?? null);
    } else if (res.status === 401) {
      setError("auth");
    } else {
      setError("generic");
    }
  };

  const copyAndClose = () => {
    if (modalKey) navigator.clipboard.writeText(modalKey);
    setModalKey(null);
  };

  return (
    <div className="agent-card p-5"
    >
      <div className="flex items-start gap-3 mb-4">
        <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-[#0a84ff]/10 border border-[#0a84ff]/20 text-[#0a84ff]"
        >
          <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M10 20l4-16m4 4l4 4-4 4M6 16l-4-4 4-4" />
          </svg>
        </div>
        
        <div className="flex-1">
          <h2 className="text-base font-semibold text-[var(--text-primary)]">
            API Key
          </h2>
          <p className="text-xs text-[var(--text-secondary)]">
            For agents & integrations
          </p>
        </div>
      </div>
      
      {prefix ? (
        <div className="mb-4 p-3 rounded-xl bg-white/[0.03] border border-[var(--border)] flex items-center justify-between"
        >
          <div className="flex items-center gap-2">
            <div className="w-2 h-2 rounded-full bg-[#30d158] animate-pulse" />
            <p className="font-mono text-sm text-[var(--text-primary)]">{(prefix as string).slice(0, 11)}…</p>
          </div>
          <span className="text-[10px] text-[#30d158] font-medium px-2 py-0.5 rounded-full bg-[#30d158]/10 border border-[#30d158]/20">
            Active
          </span>
        </div>
      ) : (
        <div className="mb-4 p-3 rounded-xl bg-white/[0.03] border border-[var(--border)] border-dashed flex items-center justify-between"
        >
          <div className="flex items-center gap-2">
            <div className="w-2 h-2 rounded-full bg-[var(--text-tertiary)]" />
            <p className="text-sm text-[var(--text-tertiary)]">No active key</p>
          </div>
          <span className="text-[10px] text-[var(--text-tertiary)] font-medium px-2 py-0.5 rounded-full bg-white/[0.04] border border-white/[0.08]">
            Inactive
          </span>
        </div>
      )}
      
      <button
        type="button"
        onClick={generate}
        disabled={loading}
        className={cn(
          "w-full rounded-xl border px-4 py-3 text-sm font-medium transition-all duration-300",
          "border-[#0a84ff]/30 bg-[#0a84ff]/10 text-[#0a84ff]",
          "hover:bg-[#0a84ff]/20 hover:border-[#0a84ff]/50 hover:shadow-[0_0_20px_rgba(10,132,255,0.15)]",
          "disabled:opacity-50 disabled:cursor-not-allowed"
        )}
      >
        {loading ? (
          <span className="flex items-center justify-center gap-2">
            <svg className="w-4 h-4 animate-spin" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
            </svg>
            Generating...
          </span>
        ) : prefix ? (
          <span className="flex items-center justify-center gap-2">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
            </svg>
            Regenerate Key
          </span>
        ) : (
          <span className="flex items-center justify-center gap-2">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
            </svg>
            Generate API Key
          </span>
        )}
      </button>

      {error === "auth" && (
        <div className="mt-4 rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-200">
          <p className="font-medium">Sign in to generate an API key</p>
          <p className="mt-1 text-xs text-amber-200/90">
            Continue as Human or Continue as AI to create your key.
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            <Link
              href="/api/auth/human"
              className="inline-flex items-center rounded-lg bg-[var(--accent-heart)] px-3 py-1.5 text-xs font-medium text-white hover:opacity-90"
            >
              Continue as Human
            </Link>
            <Link
              href="/"
              className="inline-flex items-center rounded-lg border border-white/20 px-3 py-1.5 text-xs font-medium hover:bg-white/5"
            >
              Home
            </Link>
          </div>
        </div>
      )}
      {error === "generic" && (
        <div className="mt-4 rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-200">
          <p className="font-medium">Something went wrong</p>
          <p className="mt-1 text-xs opacity-90">Please try again or sign in first.</p>
          <button
            type="button"
            onClick={() => setError(null)}
            className="mt-2 text-xs font-medium hover:underline"
          >
            Dismiss
          </button>
        </div>
      )}
      
      {modalKey && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/90 backdrop-blur-sm"
          role="dialog"
          aria-label="API key"
        >
          <div className="mx-4 max-w-md w-full rounded-2xl agent-card p-6 shadow-2xl"
          >
            <div className="flex items-center gap-3 mb-4">
              <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-[#ff2d55]/10 border border-[#ff2d55]/20 text-[#ff2d55]"
              >
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                </svg>
              </div>
              <div>
                <p className="text-sm font-semibold text-[var(--text-primary)]">Secure your key</p>
                <p className="text-xs text-[var(--text-tertiary)]">Copy now — won&apos;t be shown again</p>
              </div>
            </div>
            
            <pre className="mb-4 overflow-x-auto rounded-xl bg-black/50 p-4 text-xs text-[var(--text-primary)] border border-[var(--border)] font-mono"
            >
              {modalKey}
            </pre>
            
            <button
              type="button"
              onClick={copyAndClose}
              className="w-full rounded-xl bg-[#0a84ff] px-4 py-3 text-sm font-medium text-white hover:bg-[#0a84ff]/90 transition-colors shadow-lg shadow-[#0a84ff]/20"
            >
              Copy to Clipboard
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

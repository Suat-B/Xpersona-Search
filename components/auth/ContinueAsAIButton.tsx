"use client";

import { useState } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";

export function ContinueAsAIButton() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [modalKey, setModalKey] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const createAgent = async () => {
    setError(null);
    setLoading(true);
    try {
      const res = await fetch("/api/auth/agent/register", {
        method: "POST",
        credentials: "include",
      });
      const data = await res.json().catch(() => ({}));
      if (data.success && data.data?.apiKey) {
        setModalKey(data.data.apiKey);
      } else {
        setError(data.message ?? "Failed to create agent");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setLoading(false);
    }
  };

  const copyAndClose = () => {
    if (modalKey) navigator.clipboard.writeText(modalKey);
    setModalKey(null);
  };

  const viewDashboard = () => {
    if (modalKey) navigator.clipboard.writeText(modalKey);
    setModalKey(null);
    router.push("/dashboard");
  };

  return (
    <>
      <button
        type="button"
        onClick={createAgent}
        disabled={loading}
        className="group inline-flex items-center gap-2 rounded-full border border-cyan-500/40 bg-gradient-to-r from-cyan-500/15 to-blue-500/10 px-5 py-2.5 text-sm font-semibold text-cyan-300 hover:from-cyan-500/25 hover:to-blue-500/20 hover:border-cyan-500/60 hover:scale-[1.02] active:scale-[0.98] transition-all duration-300 disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:scale-100"
      >
        {loading ? (
          <span className="flex items-center gap-2">
            <svg className="w-4 h-4 animate-spin" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
            </svg>
            Creating…
          </span>
        ) : (
          <>
            <svg className="w-4 h-4 text-cyan-400 group-hover:animate-pulse" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
            </svg>
            Continue as AI
          </>
        )}
      </button>

      {error && (
        <div className="mt-2 rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-xs text-red-200">
          {error}
          <button type="button" onClick={() => setError(null)} className="ml-2 hover:underline">Dismiss</button>
        </div>
      )}

      {modalKey &&
        typeof document !== "undefined" &&
        createPortal(
          <div
            className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/90 backdrop-blur-sm p-4 min-h-screen"
            style={{ top: 0, left: 0, right: 0, bottom: 0 }}
            role="dialog"
            aria-label="Agent API key"
            onClick={() => setModalKey(null)}
          >
          <div
            className="mx-4 max-w-md w-full rounded-2xl border border-white/10 bg-[var(--bg-card)] p-6 shadow-2xl relative"
            onClick={(e) => e.stopPropagation()}
          >
            <button
              type="button"
              onClick={() => setModalKey(null)}
              className="absolute top-4 right-4 rounded-lg p-1.5 text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-white/10 transition-colors"
              aria-label="Close"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
            <div className="flex items-center gap-3 mb-4 pr-8">
              <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-[#0a84ff]/10 border border-[#0a84ff]/20 text-[#0a84ff]">
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M10 20l4-16m4 4l4 4-4 4M6 16l-4-4 4-4" />
                </svg>
              </div>
              <div>
                <p className="text-sm font-semibold text-[var(--text-primary)]">Agent created</p>
                <p className="text-xs text-[var(--text-secondary)]">Copy your API key — it won&apos;t be shown again</p>
              </div>
            </div>

            <pre className="mb-4 overflow-x-auto rounded-xl bg-black/50 p-4 text-xs text-[var(--text-primary)] border border-white/10 font-mono break-all">
              {modalKey}
            </pre>

            <div className="flex flex-col gap-2">
              <button
                type="button"
                onClick={copyAndClose}
                className="w-full rounded-xl bg-[#0a84ff] px-4 py-3 text-sm font-medium text-white hover:bg-[#0a84ff]/90 transition-colors"
              >
                Copy to Clipboard
              </button>
              <button
                type="button"
                onClick={viewDashboard}
                className="w-full rounded-xl border border-white/20 px-4 py-3 text-sm font-medium text-[var(--text-primary)] hover:bg-white/5 transition-colors"
              >
                View dashboard as agent
              </button>
            </div>
          </div>
        </div>,
          document.body
        )}
    </>
  );
}

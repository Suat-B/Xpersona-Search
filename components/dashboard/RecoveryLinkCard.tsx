"use client";

import { useState, useCallback } from "react";

const CASINO_URL = typeof window !== "undefined" ? window.location.origin : "https://xpersona.co";

export function RecoveryLinkCard() {
  const [recoveryUrl, setRecoveryUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [copied, setCopied] = useState<"url" | "recovery" | null>(null);

  const copyUrl = useCallback(async (url: string, key: "url" | "recovery") => {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(key);
      setTimeout(() => setCopied(null), 2000);
    } catch {
      // Fallback for older browsers
    }
  }, []);

  const generateRecoveryLink = useCallback(async () => {
    setLoading(true);
    setRecoveryUrl(null);
    try {
      const res = await fetch("/api/me/recovery-link", {
        method: "POST",
        credentials: "include",
      });
      const data = await res.json().catch(() => ({}));
      if (data.success && data.data?.url) {
        setRecoveryUrl(data.data.url);
      }
    } catch {
      // Silently fail
    } finally {
      setLoading(false);
    }
  }, []);

  return (
    <div className="agent-card p-5">
      <div className="flex items-start gap-4">
        <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-amber-500/20 to-orange-500/10 text-amber-400 border border-amber-500/20">
          <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" />
          </svg>
        </div>
        <div className="min-w-0 flex-1">
          <h3 className="font-semibold text-[var(--text-primary)]">Never lose access</h3>
          <p className="mt-1 text-xs text-[var(--text-secondary)]">
            Bookmark your xpersona URL. Generate a recovery link to restore your session if cookies are cleared.
          </p>

          <div className="mt-3 flex flex-wrap items-center gap-2">
            <div className="flex items-center gap-1.5 rounded-lg bg-white/[0.04] border border-[var(--border)] px-3 py-2 min-w-0">
              <span className="text-xs font-mono text-[var(--text-secondary)] truncate max-w-[180px]">
                {CASINO_URL}
              </span>
              <button
                type="button"
                onClick={() => copyUrl(CASINO_URL, "url")}
                className="shrink-0 p-1 rounded hover:bg-white/5 text-[var(--text-tertiary)] hover:text-[var(--text-primary)] transition-colors"
                title="Copy URL"
              >
                {copied === "url" ? (
                  <svg className="w-4 h-4 text-emerald-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                ) : (
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                  </svg>
                )}
              </button>
            </div>
            <button
              type="button"
              onClick={generateRecoveryLink}
              disabled={loading}
              className="inline-flex items-center gap-1.5 rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs font-medium text-amber-400 hover:bg-amber-500/20 disabled:opacity-50 transition-colors"
            >
              {loading ? (
                <>
                  <span className="w-3 h-3 border border-amber-400 border-t-transparent rounded-full animate-spin" />
                  Generating…
                </>
              ) : (
                <>
                  <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a2 2 0 00-2-2H4a2 2 0 00-2 2v4h16z" />
                  </svg>
                  Get recovery link
                </>
              )}
            </button>
          </div>

          {recoveryUrl && (
            <div className="mt-3 space-y-2">
              <p className="text-[10px] text-amber-400/90">
                Save this link somewhere safe. Opens in 7 days if you lose your session.
              </p>
              <div className="flex items-center gap-1.5 rounded-lg bg-amber-500/5 border border-amber-500/20 px-3 py-2">
                <span className="text-xs font-mono text-[var(--text-primary)] truncate flex-1 min-w-0">
                  {recoveryUrl}
                </span>
                <button
                  type="button"
                  onClick={() => copyUrl(recoveryUrl, "recovery")}
                  className="shrink-0 px-2 py-1 rounded text-xs font-medium bg-amber-500/20 text-amber-400 hover:bg-amber-500/30 transition-colors"
                >
                  {copied === "recovery" ? "Copied!" : "Copy"}
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

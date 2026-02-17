"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { cn } from "@/lib/utils";

const POLL_INTERVAL_MS = 1500;
const POLL_MAX_ATTEMPTS = 6; // ~9s total; EnsureGuest typically creates session in 1–2s

interface ApiKeySectionProps {
  /** Compact layout for sidebar: key prefix + regenerate in a single row */
  compact?: boolean;
}

async function fetchMe(): Promise<{ ok: boolean; data: Record<string, unknown> }> {
  const r = await fetch("/api/me", { credentials: "include" });
  const text = await r.text();
  try {
    return { ok: r.ok, data: (text ? JSON.parse(text) : {}) as Record<string, unknown> };
  } catch {
    return { ok: false, data: {} };
  }
}

function applyMeResult(resp: Record<string, unknown>): string | null {
  const inner = resp?.data as { apiKeyPrefix?: string } | undefined;
  const p = inner?.apiKeyPrefix ?? null;
  return typeof p === "string" && p.length >= 11 && p.startsWith("xp_") ? p : null;
}

export function ApiKeySection({ compact = false }: ApiKeySectionProps) {
  const [prefix, setPrefix] = useState<string | null>(null);
  const [modalKey, setModalKey] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [sessionCreating, setSessionCreating] = useState(false);
  const [guestCreating, setGuestCreating] = useState(false);
  const copyButtonRef = useRef<HTMLButtonElement>(null);
  const router = useRouter();

  useEffect(() => {
    let cancelled = false;
    let attempts = 0;

    const poll = async () => {
      const { ok, data } = await fetchMe();
      if (cancelled) return;
      if (ok && (data?.success as boolean)) {
        setPrefix(applyMeResult(data as Record<string, unknown>));
        setSessionCreating(false);
        return;
      }
      attempts++;
      if (attempts < POLL_MAX_ATTEMPTS) {
        setSessionCreating(true);
        setTimeout(poll, POLL_INTERVAL_MS);
      } else {
        setSessionCreating(false);
      }
    };

    fetchMe().then(({ ok, data }) => {
      if (cancelled) return;
      if (ok && (data?.success as boolean)) {
        setPrefix(applyMeResult(data as Record<string, unknown>));
        return;
      }
      setSessionCreating(true);
      setTimeout(poll, POLL_INTERVAL_MS);
    });

    return () => {
      cancelled = true;
    };
  }, []);

  /** Create guest session + generate key in one flow. Returns true if key was generated. */
  const createGuestAndGenerate = async (): Promise<boolean> => {
    setGuestCreating(true);
    setError(null);
    try {
      const r = await fetch("/api/auth/guest", { method: "POST", credentials: "include" });
      const json = (await r.json().catch(() => ({}))) as { success?: boolean };
      if (!r.ok || !json.success) return false;
      setError(null);
      window.dispatchEvent(new Event("balance-updated"));
      router.refresh();
      // Now we have a cookie; generate the key immediately (no second click)
      const res = await fetch("/api/me/api-key", { method: "POST", credentials: "include" });
      const text = await res.text();
      let data: { success?: boolean; data?: { apiKey?: string; apiKeyPrefix?: string } };
      try {
        data = text ? JSON.parse(text) : {};
      } catch {
        data = {};
      }
      if (data.success && data.data) {
        setModalKey(data.data.apiKey ?? null);
        setPrefix(data.data.apiKeyPrefix ?? null);
        return true;
      }
      return false;
    } catch {
      return false;
    } finally {
      setGuestCreating(false);
    }
  };

  const createGuestAndRetry = async () => {
    const ok = await createGuestAndGenerate();
    if (!ok) {
      setError("generic");
      setErrorMessage("Could not create session. Try Play or Home.");
    }
  };

  const generate = async () => {
    setError(null);
    setErrorMessage(null);
    setLoading(true);
    try {
      const res = await fetch("/api/me/api-key", { method: "POST", credentials: "include" });
      const text = await res.text();
      let data: { success?: boolean; data?: { apiKey?: string; apiKeyPrefix?: string }; error?: string; message?: string };
      try {
        data = text ? JSON.parse(text) : {};
      } catch {
        data = {};
      }
      if (data.success && data.data) {
        setModalKey(data.data.apiKey ?? null);
        setPrefix(data.data.apiKeyPrefix ?? null);
        return;
      }
      if (res.status === 401) {
        // Auto-recover: create guest + generate in one flow. No extra clicks.
        const ok = await createGuestAndGenerate();
        if (!ok) setError("auth");
        return;
      }
      setError("generic");
      setErrorMessage(data.message ?? (res.ok ? null : `Request failed (${res.status})`));
    } catch (fetchErr) {
      setError("generic");
      setErrorMessage(fetchErr instanceof Error ? fetchErr.message : "Network error");
    } finally {
      setLoading(false);
    }
  };

  const copyAndClose = () => {
    if (modalKey) navigator.clipboard.writeText(modalKey);
    setModalKey(null);
  };

  const closeModal = useCallback(() => {
    setModalKey(null);
  }, []);

  useEffect(() => {
    if (!modalKey) return;
    const onEscape = (e: KeyboardEvent) => e.key === "Escape" && closeModal();
    window.addEventListener("keydown", onEscape);
    return () => window.removeEventListener("keydown", onEscape);
  }, [modalKey, closeModal]);

  useEffect(() => {
    if (!modalKey) return;
    navigator.clipboard?.writeText(modalKey).catch(() => {});
    const t = setTimeout(() => copyButtonRef.current?.focus({ preventScroll: true }), 50);
    return () => clearTimeout(t);
  }, [modalKey]);

  if (compact) {
    return (
      <>
        <div className="space-y-2">
          <div className="flex items-center gap-2">
            {prefix ? (
              <>
                <div className="w-2 h-2 rounded-full bg-[#30d158] animate-pulse flex-shrink-0" />
                <p className="font-mono text-[11px] text-[var(--text-primary)] tabular-nums truncate">{(prefix as string).slice(0, 11)}…</p>
              </>
            ) : (
              <>
                <div className="w-2 h-2 rounded-full bg-[var(--text-tertiary)] flex-shrink-0" />
                <p className="text-[11px] text-[var(--text-tertiary)]">No key</p>
              </>
            )}
            <button
              type="button"
              onClick={generate}
              disabled={loading || sessionCreating}
              className="ml-auto flex-shrink-0 px-2 py-1 text-[10px] rounded-sm border border-[#0a84ff]/40 bg-[#0a84ff]/10 text-[#0a84ff] hover:bg-[#0a84ff]/20 disabled:opacity-50 transition-colors"
            >
              {loading ? "…" : sessionCreating ? "…" : "Generate"}
            </button>
          </div>
          {error === "auth" && (
            <div className="flex flex-wrap gap-1.5 text-[10px]">
              <Link href="/api/auth/play" className="text-amber-400 hover:underline">Play</Link>
              <button type="button" onClick={createGuestAndRetry} disabled={guestCreating} className="text-amber-400 hover:underline disabled:opacity-50">Continue as guest</button>
            </div>
          )}
          {error === "generic" && (
            <button type="button" onClick={() => setError(null)} className="text-[10px] text-red-400 hover:underline">Retry</button>
          )}
        </div>
        {modalKey && typeof document !== "undefined" && createPortal(
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/90 backdrop-blur-sm min-h-screen min-w-full" style={{ top: 0, left: 0, right: 0, bottom: 0 }} role="dialog" aria-modal="true" onClick={(e) => e.target === e.currentTarget && closeModal()}>
            <div className="w-full max-w-[95vw] sm:max-w-md rounded-2xl border border-white/10 bg-[var(--bg-card)] p-6 shadow-2xl shadow-black/50 relative" onClick={(e) => e.stopPropagation()}>
              <button type="button" onClick={closeModal} className="absolute top-4 right-4 p-2 rounded-lg text-[var(--text-tertiary)] hover:text-white hover:bg-white/10 transition-colors" aria-label="Close">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
              </button>
              <p className="text-sm font-semibold text-[var(--text-primary)] mb-2">Your API key &lt;3 — copied to clipboard</p>
              <pre className="mb-4 overflow-x-auto rounded-xl bg-black/40 p-4 text-xs font-mono break-all border border-white/10">{modalKey}</pre>
              <div className="flex gap-3">
                <button ref={copyButtonRef} type="button" onClick={copyAndClose} className="flex-1 flex items-center justify-center gap-2 rounded-xl bg-[#0a84ff] px-4 py-3 text-sm font-medium text-white hover:bg-[#0a84ff]/90">
                  Copy to Clipboard
                </button>
                <button type="button" onClick={closeModal} className="dash-btn px-4 py-3 text-sm font-medium transition-colors">Skip</button>
              </div>
            </div>
          </div>,
          document.body
        )}
      </>
    );
  }

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
            For AI & integrations
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
        disabled={loading || sessionCreating || guestCreating}
        className={cn(
          "w-full rounded-xl border px-4 py-3 text-sm font-medium transition-all duration-300",
          "border-[#0a84ff]/30 bg-[#0a84ff]/10 text-[#0a84ff]",
          "hover:bg-[#0a84ff]/20 hover:border-[#0a84ff]/50 hover:shadow-[0_0_20px_rgba(10,132,255,0.15)]",
          "disabled:opacity-50 disabled:cursor-not-allowed"
        )}
      >
        {loading || guestCreating ? (
          <span className="flex items-center justify-center gap-2">
            <svg className="w-4 h-4 animate-spin" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
            </svg>
            {guestCreating ? "Setting up your key…" : "Generating…"}
          </span>
        ) : sessionCreating ? (
          <span className="flex items-center justify-center gap-2">
            <svg className="w-4 h-4 animate-spin" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
            </svg>
            Creating session…
          </span>
        ) : prefix ? (
          <span className="flex items-center justify-center gap-2">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
            </svg>
            Generate Key
          </span>
        ) : (
          <span className="flex items-center justify-center gap-2">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
            </svg>
            Get API Key
          </span>
        )}
      </button>

      {error === "auth" && (
        <div className="mt-4 rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-200">
          <p className="font-medium">Couldn&apos;t create a session automatically</p>
          <p className="mt-1 text-xs text-amber-200/90">
            Try Play or Continue as guest to get your API key.
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            <Link
              href="/api/auth/play"
              className="inline-flex items-center rounded-lg bg-[var(--accent-heart)] px-3 py-1.5 text-xs font-medium text-white hover:opacity-90"
            >
              Play
            </Link>
            <button
              type="button"
              onClick={createGuestAndRetry}
              disabled={guestCreating}
              className="inline-flex items-center rounded-lg border border-white/30 px-3 py-1.5 text-xs font-medium bg-white/5 hover:bg-white/10 disabled:opacity-50"
            >
              {guestCreating ? "Creating…" : "Continue as guest"}
            </button>
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
          <p className="mt-1 text-xs opacity-90">
            {errorMessage ?? "Please try again or sign in first."}
          </p>
          <button
            type="button"
            onClick={() => { setError(null); setErrorMessage(null); }}
            className="mt-2 text-xs font-medium hover:underline"
          >
            Dismiss
          </button>
        </div>
      )}
      
      {modalKey &&
        typeof document !== "undefined" &&
        createPortal(
          <div
            className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/90 backdrop-blur-sm min-h-screen min-w-full"
            style={{ top: 0, left: 0, right: 0, bottom: 0 }}
            role="dialog"
            aria-modal="true"
            aria-labelledby="secure-key-title"
            aria-label="Secure your API key"
            onClick={(e) => e.target === e.currentTarget && closeModal()}
          >
            <div
              className="w-full max-w-[95vw] sm:max-w-md rounded-2xl border border-white/10 bg-[var(--bg-card)] p-6 shadow-2xl shadow-black/50 relative"
              onClick={(e) => e.stopPropagation()}
            >
              <button
                type="button"
                onClick={closeModal}
                className="absolute top-4 right-4 p-2 rounded-lg text-[var(--text-tertiary)] hover:text-white hover:bg-white/10 transition-colors cursor-pointer"
                aria-label="Close"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
              <div className="flex items-center gap-3 mb-4 pr-10">
                <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-[var(--accent-heart)]/10 border border-[var(--accent-heart)]/20 text-[var(--accent-heart)]">
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                  </svg>
                </div>
                <div>
                  <p id="secure-key-title" className="text-sm font-semibold text-[var(--text-primary)]">Your API key &lt;3</p>
                  <p className="text-xs text-[#30d158]">Copied to clipboard — paste anywhere</p>
                </div>
              </div>
              
              <pre
                className="mb-4 overflow-x-auto rounded-xl bg-black/40 p-4 text-xs text-[var(--text-primary)] font-mono break-all border border-white/10 cursor-text select-text"
                tabIndex={0}
              >
                {modalKey}
              </pre>
              
              <div className="flex gap-3">
                <button
                  ref={copyButtonRef}
                  type="button"
                  onClick={copyAndClose}
                  className="flex-1 flex items-center justify-center gap-2 rounded-xl bg-[#0a84ff] px-4 py-3 text-sm font-medium text-white hover:bg-[#0a84ff]/90 active:scale-[0.98] transition-all cursor-pointer focus:outline-none focus:ring-2 focus:ring-[#0a84ff] focus:ring-offset-2 focus:ring-offset-[var(--bg-deep)] shadow-lg shadow-[#0a84ff]/25"
                >
                  <svg className="w-4 h-4 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                  </svg>
                  Copy to Clipboard
                </button>
                <button
                  type="button"
                  onClick={closeModal}
                  className="dash-btn px-4 py-3 text-sm font-medium transition-colors cursor-pointer focus:outline-none focus:ring-2 focus:ring-white/20 focus:ring-offset-2 focus:ring-offset-[var(--dash-bg)]"
                >
                  Skip
                </button>
              </div>
            </div>
          </div>,
          document.body
        )}
    </div>
  );
}

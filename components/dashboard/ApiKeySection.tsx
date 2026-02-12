"use client";

import { useEffect, useState } from "react";

export function ApiKeySection() {
  const [prefix, setPrefix] = useState<string | null>(null);
  const [modalKey, setModalKey] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    fetch("/api/me", { credentials: "include" })
      .then(async (r) => {
        const text = await r.text();
        try {
          return text ? JSON.parse(text) : {};
        } catch {
          return {};
        }
      })
      .then((data) => data.success && setPrefix(data.data?.apiKeyPrefix ?? null));
  }, []);

  const generate = async () => {
    setLoading(true);
    const res = await fetch("/api/me/api-key", { method: "POST", credentials: "include" });
    const text = await res.text();
    let data: { success?: boolean; data?: { apiKey?: string; apiKeyPrefix?: string } };
    try {
      data = text ? JSON.parse(text) : {};
    } catch {
      data = {};
    }
    setLoading(false);
    if (data.success && data.data) {
      setModalKey(data.data.apiKey ?? null);
      setPrefix(data.data.apiKeyPrefix ?? null);
    }
  };

  const copyAndClose = () => {
    if (modalKey) navigator.clipboard.writeText(modalKey);
    setModalKey(null);
  };

  return (
    <div className="rounded-xl border border-[var(--border)] bg-white/5 backdrop-blur-sm p-5">
      <h2 className="text-sm font-semibold text-[var(--text-primary)] mb-1">
        API key
      </h2>
      <p className="mb-3 text-xs text-[var(--text-secondary)]">
        For OpenClaw and agents. <code className="rounded bg-white/10 px-1 text-[10px]">Bearer</code> auth.
      </p>
      {prefix ? (
        <p className="mb-2 font-mono text-sm">{(prefix as string).slice(0, 11)}…</p>
      ) : (
        <p className="mb-2 text-sm text-[var(--text-secondary)]">Not set</p>
      )}
      <button
        type="button"
        onClick={generate}
        disabled={loading}
        className="w-full rounded-lg border border-[var(--accent-heart)]/30 bg-[var(--accent-heart)]/10 px-4 py-2.5 text-sm font-medium text-[var(--accent-heart)] hover:bg-[var(--accent-heart)]/20 disabled:opacity-50 transition-colors"
      >
        {loading ? "Generating..." : "Generate API key"}
      </button>
      {modalKey && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/70"
          role="dialog"
          aria-label="API key"
        >
          <div className="mx-4 max-w-md rounded-lg bg-[var(--bg-card)] p-6">
            <p className="mb-2 text-sm font-medium">Copy your key. You won&apos;t see it again.</p>
            <pre className="mb-4 overflow-x-auto rounded bg-[var(--bg-matte)] p-3 text-xs">
              {modalKey}
            </pre>
            <button
              type="button"
              onClick={copyAndClose}
              className="rounded bg-[var(--accent-heart)] px-4 py-2 text-sm text-white"
            >
              Copy and close
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

"use client";

import { useEffect, useState } from "react";

export function ApiKeySection() {
  const [prefix, setPrefix] = useState<string | null>(null);
  const [modalKey, setModalKey] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    fetch("/api/me")
      .then((r) => r.json())
      .then((data) => data.success && setPrefix(data.data.apiKeyPrefix ?? null));
  }, []);

  const generate = async () => {
    setLoading(true);
    const res = await fetch("/api/me/api-key", { method: "POST" });
    const data = await res.json();
    setLoading(false);
    if (data.success) {
      setModalKey(data.data.apiKey);
      setPrefix(data.data.apiKeyPrefix);
    }
  };

  const copyAndClose = () => {
    if (modalKey) navigator.clipboard.writeText(modalKey);
    setModalKey(null);
  };

  return (
    <div className="rounded-lg border border-[var(--border)] bg-[var(--bg-card)] p-6">
      <h2 className="mb-2 text-sm font-medium text-[var(--text-secondary)]">
        For AI agents
      </h2>
      <p className="mb-4 text-sm text-[var(--text-secondary)]">
        Use this API key in OpenClaw or any client. Send{" "}
        <code className="rounded bg-[var(--bg-matte)] px-1">Authorization: Bearer &lt;key&gt;</code>{" "}
        on every request.
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
        className="rounded border border-[var(--border)] px-4 py-2 text-sm hover:bg-[var(--bg-matte)] disabled:opacity-50"
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

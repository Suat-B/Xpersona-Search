"use client";

import { useState } from "react";
import Link from "next/link";

const CODE = "export XPERSONA_API_KEY=your_key_here";

export function AgentProofBlock() {
  const [copied, setCopied] = useState(false);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(CODE);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // ignore
    }
  };

  return (
    <div className="rounded-xl border border-[var(--accent-heart)]/20 bg-[var(--accent-heart)]/5 p-4 max-w-md w-full">
      <p className="text-xs text-[var(--text-primary)] mb-2">
        Your AI assistant can play right now. Set <code className="bg-white/10 px-1 rounded font-mono text-[10px]">XPERSONA_API_KEY</code> and go.
      </p>
      <div className="flex items-center gap-2">
        <pre className="flex-1 text-[10px] font-mono text-emerald-400 bg-black/30 rounded px-3 py-2 overflow-x-auto">
          {CODE}
        </pre>
        <button
          type="button"
          onClick={copy}
          className="shrink-0 px-3 py-2 rounded-lg border border-white/10 bg-white/5 text-xs font-medium text-[var(--text-secondary)] hover:text-white hover:bg-white/10 transition-colors"
        >
          {copied ? "Copied" : "Copy"}
        </button>
      </div>
      <Link href="/dashboard/api" className="mt-2 inline-block text-[10px] text-[var(--accent-heart)] hover:underline">
        Get API key in Dashboard →
      </Link>
    </div>
  );
}

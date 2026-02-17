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
    <div className="rounded-xl border border-white/[0.08] bg-white/[0.03] p-4 max-w-md w-full">
      <p className="text-xs text-[var(--text-primary)] mb-2">
        Give your AI the link to https://xpersona.co. Give it your API key. Done.
      </p>
      <div className="flex items-center gap-2">
        <pre className="flex-1 text-[10px] font-mono text-emerald-400/90 bg-emerald-500/10 border border-emerald-500/20 rounded-lg px-3 py-2 overflow-x-auto">
          {CODE}
        </pre>
        <button
          type="button"
          onClick={copy}
          className="shrink-0 px-3 py-2 rounded-lg border border-white/[0.08] bg-white/[0.03] text-xs font-medium text-[var(--text-secondary)] hover:text-white hover:bg-white/[0.08] transition-colors"
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

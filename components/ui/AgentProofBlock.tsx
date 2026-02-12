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
    <div className="frosted rounded-2xl p-6 max-w-md w-full">
      <p className="text-sm text-white/80 mb-4">
        Your AI assistant can play right now. Set <code className="bg-white/5 px-1.5 py-0.5 rounded font-mono text-xs">XPERSONA_API_KEY</code> and go.
      </p>
      <div className="flex items-center gap-3">
        <pre className="flex-1 text-xs font-mono text-white/70 bg-black/20 rounded-lg px-4 py-3 overflow-x-auto">
          {CODE}
        </pre>
        <button
          type="button"
          onClick={copy}
          className="shrink-0 px-4 py-3 rounded-full bg-white/10 text-xs font-medium text-white/90 hover:bg-white/15 transition-colors"
        >
          {copied ? "Copied" : "Copy"}
        </button>
      </div>
      <Link href="/dashboard/api" className="mt-4 inline-block text-xs font-medium text-white/70 hover:text-white transition-colors">
        Get API key in Dashboard →
      </Link>
    </div>
  );
}

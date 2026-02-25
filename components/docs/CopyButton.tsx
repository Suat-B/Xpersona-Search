"use client";

import { useState } from "react";

export function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      onClick={() => {
        navigator.clipboard.writeText(text);
        setCopied(true);
        setTimeout(() => setCopied(false), 1500);
      }}
      className="absolute top-2 right-2 rounded-lg px-2 py-1 text-xs font-medium bg-white/5 hover:bg-white/10 text-[var(--text-secondary)] transition-colors"
    >
      {copied ? "Copied!" : "Copy"}
    </button>
  );
}

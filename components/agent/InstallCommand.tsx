"use client";

import { useState, useCallback } from "react";

interface InstallCommandProps {
  command: string;
  label?: string;
}

export function InstallCommand({ command, label = "Copy" }: InstallCommandProps) {
  const [copied, setCopied] = useState(false);

  const handleCopy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(command);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setCopied(false);
    }
  }, [command]);

  return (
    <div className="flex items-center gap-3 p-4 rounded-xl bg-[var(--bg-elevated)] border border-[var(--border)] min-w-0">
      <code className="flex-1 font-mono text-sm text-[var(--text-secondary)] truncate select-all">
        {command}
      </code>
      <button
        type="button"
        onClick={handleCopy}
        className="flex-shrink-0 px-4 py-2 rounded-lg font-medium text-sm transition-colors bg-[var(--accent-heart)] hover:bg-[var(--accent-heart)]/90 text-white border-0 cursor-pointer focus:outline-none focus:ring-2 focus:ring-[var(--accent-heart)]/50 focus:ring-offset-2 focus:ring-offset-[var(--bg-deep)]"
      >
        {copied ? "Copied!" : label}
      </button>
    </div>
  );
}

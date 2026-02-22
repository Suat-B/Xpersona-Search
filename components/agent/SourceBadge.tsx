"use client";

const SOURCE_CONFIG: Record<string, { label: string; className: string }> = {
  GITHUB_OPENCLEW: {
    label: "GitHub",
    className: "bg-[var(--bg-elevated)] text-[var(--text-primary)] border-[var(--border)]",
  },
  GITHUB_MCP: {
    label: "GitHub",
    className: "bg-[var(--bg-elevated)] text-[var(--text-primary)] border-[var(--border)]",
  },
  GITHUB_A2A: {
    label: "GitHub",
    className: "bg-[var(--bg-elevated)] text-[var(--text-primary)] border-[var(--border)]",
  },
  CLAWHUB: {
    label: "ClawHub",
    className: "bg-[var(--accent-warning)]/20 text-[var(--accent-warning)] border-[var(--accent-warning)]/30",
  },
  NPM: {
    label: "npm",
    className: "bg-[var(--accent-danger)]/20 text-[var(--accent-danger)] border-[var(--accent-danger)]/30",
  },
  PYPI: {
    label: "PyPI",
    className: "bg-[var(--accent-teal)]/20 text-[var(--accent-teal)] border-[var(--accent-teal)]/30",
  },
  HUGGINGFACE: {
    label: "Hugging Face",
    className: "bg-[var(--accent-heart)]/20 text-[var(--accent-heart)] border-[var(--accent-heart)]/30",
  },
  MCP_REGISTRY: {
    label: "MCP Registry",
    className: "bg-[var(--accent-purple)]/20 text-[var(--accent-purple)] border-[var(--accent-purple)]/30",
  },
  A2A_REGISTRY: {
    label: "A2A Registry",
    className: "bg-[var(--accent-purple)]/20 text-[var(--accent-purple)] border-[var(--accent-purple)]/30",
  },
  DOCKER: {
    label: "Docker",
    className: "bg-[var(--accent-teal)]/20 text-[var(--accent-teal)] border-[var(--accent-teal)]/30",
  },
  REPLICATE: {
    label: "Replicate",
    className: "bg-[var(--bg-elevated)] text-[var(--text-secondary)] border-[var(--border)]",
  },
  HOL: {
    label: "HOL",
    className: "bg-[var(--bg-elevated)] text-[var(--text-secondary)] border-[var(--border)]",
  },
  MANUAL_SUBMISSION: {
    label: "Manual",
    className: "bg-[var(--accent-success)]/20 text-[var(--accent-success)] border-[var(--accent-success)]/30",
  },
};

interface SourceBadgeProps {
  source: string;
}

export function SourceBadge({ source }: SourceBadgeProps) {
  const config = SOURCE_CONFIG[source] ?? {
    label: source.replace(/_/g, " ") || "Other",
    className: "bg-[var(--bg-elevated)] text-[var(--text-tertiary)] border-[var(--border)]",
  };

  return (
    <span
      className={`px-2.5 py-0.5 rounded text-xs font-medium border ${config.className}`}
      title={`Indexed from ${config.label}`}
    >
      {config.label}
    </span>
  );
}

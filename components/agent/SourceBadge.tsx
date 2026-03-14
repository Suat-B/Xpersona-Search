"use client";

import React from "react";
import { canonicalizeSource, sourceDisplayLabel } from "@/lib/search/source-taxonomy";

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
  SMITHERY: {
    label: "Smithery",
    className: "bg-[var(--accent-purple)]/20 text-[var(--accent-purple)] border-[var(--accent-purple)]/30",
  },
  AGENTSCAPE: {
    label: "AgentScape",
    className: "bg-[var(--accent-purple)]/20 text-[var(--accent-purple)] border-[var(--accent-purple)]/30",
  },
  DIFY_MARKETPLACE: {
    label: "Dify",
    className: "bg-[var(--accent-teal)]/20 text-[var(--accent-teal)] border-[var(--accent-teal)]/30",
  },
  N8N_TEMPLATES: {
    label: "n8n",
    className: "bg-[var(--accent-success)]/20 text-[var(--accent-success)] border-[var(--accent-success)]/30",
  },
  GOOGLE_CLOUD_MARKETPLACE: {
    label: "Google Cloud",
    className: "bg-[var(--accent-neural)]/20 text-[var(--accent-neural)] border-[var(--accent-neural)]/30",
  },
  LANGFLOW_STARTER_PROJECTS: {
    label: "Langflow",
    className: "bg-[var(--accent-heart)]/20 text-[var(--accent-heart)] border-[var(--accent-heart)]/30",
  },
  NACOS_AGENT_REGISTRY: {
    label: "Nacos",
    className: "bg-[var(--accent-warning)]/20 text-[var(--accent-warning)] border-[var(--accent-warning)]/30",
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
  const normalizedSource = canonicalizeSource(source);
  const config = SOURCE_CONFIG[normalizedSource] ?? {
    label: sourceDisplayLabel(normalizedSource) || "Other",
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

"use client";

import Link from "next/link";

interface Agent {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  capabilities: string[];
  protocols: string[];
  safetyScore: number;
  popularityScore: number;
  overallRank: number;
  githubData?: { stars?: number; forks?: number };
  claimStatus?: string;
  verificationTier?: "NONE" | "BRONZE" | "SILVER" | "GOLD";
  lastCrawledAt?: string;
  updatedAt?: string;
}

interface HFModelCardProps {
  agent: Agent;
}

// Protocol color mapping
const PROTOCOL_COLORS: Record<string, string> = {
  A2A: "#8b5cf6",
  MCP: "#10b981",
  ANP: "#f59e0b",
  OPENCLEW: "#ec4899",
  CUSTOM: "#6b7280",
};

// Task type icons
const TASK_ICONS: Record<string, string> = {
  "text-generation": "💬",
  "image-text": "🖼️",
  "image-generation": "🎨",
  code: "💻",
  trading: "📈",
  research: "🔬",
  "data-analysis": "📊",
  automation: "⚙️",
};

// Get the primary task from capabilities
function getPrimaryTask(capabilities: string[]): string {
  const taskPriority = [
    "trading",
    "code",
    "image-generation",
    "image-text",
    "data-analysis",
    "research",
    "automation",
    "text-generation",
  ];
  for (const task of taskPriority) {
    if (capabilities.some((c) => c.toLowerCase().includes(task))) {
      return task;
    }
  }
  return "text-generation";
}

// Format number with K/M suffix
function formatNumber(num: number): string {
  if (num >= 1000000) {
    return (num / 1000000).toFixed(1) + "M";
  }
  if (num >= 1000) {
    return (num / 1000).toFixed(1) + "k";
  }
  return num.toString();
}

// Time ago formatter
function timeAgo(date: string): string {
  const now = new Date();
  const then = new Date(date);
  const diffMs = now.getTime() - then.getTime();
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

  if (diffDays === 0) {
    const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
    if (diffHours === 0) {
      const diffMins = Math.floor(diffMs / (1000 * 60));
      return diffMins === 0 ? "just now" : `${diffMins} min ago`;
    }
    return `${diffHours}h ago`;
  }
  if (diffDays === 1) return "yesterday";
  if (diffDays < 7) return `${diffDays} days ago`;
  if (diffDays < 30) return `${Math.floor(diffDays / 7)}w ago`;
  if (diffDays < 365) return `${Math.floor(diffDays / 30)}mo ago`;
  return `${Math.floor(diffDays / 365)}y ago`;
}

export function HFModelCard({ agent }: HFModelCardProps) {
  const primaryTask = getPrimaryTask(agent.capabilities);
  const taskIcon = TASK_ICONS[primaryTask] || "🤖";
  const primaryProtocol = agent.protocols[0] || "CUSTOM";
  const protocolColor = PROTOCOL_COLORS[primaryProtocol] || "#6b7280";
  const stars = agent.githubData?.stars || 0;
  const forks = agent.githubData?.forks || 0;

  // Extract org and name from full name
  const nameParts = agent.name.split("/");
  const orgName = nameParts.length > 1 ? nameParts[0] : "";
  const modelName = nameParts.length > 1 ? nameParts[1] : agent.name;

  return (
    <Link href={`/agent/${agent.slug}`} className="block h-full">
      <article className="group flex h-full min-h-[132px] items-start gap-3 p-4 rounded-xl border border-[var(--border)] bg-[var(--bg-card)] hover:border-[var(--accent-heart)]/40 hover:bg-[var(--bg-card-hover)] transition-all duration-200">
        {/* Org Avatar */}
        <div className="flex-shrink-0">
          <div
            className="w-10 h-10 rounded-lg flex items-center justify-center text-lg font-bold text-white"
            style={{
              background: `linear-gradient(135deg, ${protocolColor}80 0%, ${protocolColor}40 100%)`,
            }}
          >
            {orgName ? orgName.charAt(0).toUpperCase() : "X"}
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 min-w-0">
          {/* Header */}
          <div className="flex items-start gap-2">
            <h3 className="text-sm font-semibold text-[var(--text-primary)] group-hover:text-[var(--accent-heart)] transition-colors truncate">
              {agent.name}
            </h3>
          </div>

          {/* Task Badge */}
          <div className="flex items-center gap-2 mt-1.5">
            <span className="inline-flex items-center gap-1.5 text-xs text-[var(--text-tertiary)]">
              <span>{taskIcon}</span>
              <span className="capitalize">{primaryTask.replace(/-/g, "-")}</span>
            </span>
            <span className="text-[var(--text-quaternary)]">·</span>
            <span
              className="text-xs font-medium px-1.5 py-0.5 rounded"
              style={{
                backgroundColor: `${protocolColor}15`,
                color: protocolColor,
              }}
            >
              {agent.overallRank.toFixed(0)} score
            </span>
          </div>

          {/* Meta Info */}
          <div className="flex items-center gap-3 mt-2 text-xs text-[var(--text-quaternary)]">
            {stars > 0 && (
              <span className="inline-flex items-center gap-1">
                <svg className="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 20 20">
                  <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
                </svg>
                {formatNumber(stars)}
              </span>
            )}
            {forks > 0 && (
              <span className="inline-flex items-center gap-1">
                <svg className="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M7.707 3.293a1 1 0 010 1.414L5.414 7H11a7 7 0 017 7v2a1 1 0 11-2 0v-2a5 5 0 00-5-5H5.414l2.293 2.293a1 1 0 11-1.414 1.414l-4-4a1 1 0 010-1.414l4-4a1 1 0 011.414 0z" clipRule="evenodd" />
                </svg>
                {formatNumber(forks)}
              </span>
            )}
            <span className="text-[var(--text-quaternary)]">·</span>
            <span>Updated {agent.updatedAt ? timeAgo(agent.updatedAt) : "recently"}</span>
          </div>
        </div>

        {/* Safety Score Badge */}
        <div className="flex-shrink-0">
          <div
            className="flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium"
            style={{
              backgroundColor:
                agent.safetyScore >= 80
                  ? "rgba(16, 185, 129, 0.15)"
                  : agent.safetyScore >= 50
                  ? "rgba(245, 158, 11, 0.15)"
                  : "rgba(239, 68, 68, 0.15)",
              color:
                agent.safetyScore >= 80
                  ? "#10b981"
                  : agent.safetyScore >= 50
                  ? "#f59e0b"
                  : "#ef4444",
            }}
          >
            <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 20 20">
              <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
            </svg>
            {agent.safetyScore}
          </div>
        </div>
      </article>
    </Link>
  );
}

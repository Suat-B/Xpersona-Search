export type ReliabilityCluster =
  | "general"
  | "research"
  | "coding"
  | "automation"
  | "voice"
  | "vision"
  | "data"
  | "security";

export type PriceTier = "budget" | "standard" | "premium";

export const CLUSTERS: Array<{ id: ReliabilityCluster; label: string; tags: string[] }> = [
  { id: "research", label: "Research", tags: ["research", "analysis", "search", "summarization", "writing"] },
  { id: "coding", label: "Coding", tags: ["code", "coding", "dev", "developer", "programming", "debug"] },
  { id: "automation", label: "Automation", tags: ["automation", "workflow", "agent", "mcp", "tooling"] },
  { id: "voice", label: "Voice", tags: ["voice", "audio", "speech", "tts", "asr"] },
  { id: "vision", label: "Vision", tags: ["vision", "image", "video", "ocr"] },
  { id: "data", label: "Data", tags: ["data", "etl", "sql", "analytics", "database"] },
  { id: "security", label: "Security", tags: ["security", "safety", "policy", "compliance"] },
  { id: "general", label: "General", tags: [] },
];

export function inferClusters(capabilities: string[] | null | undefined): ReliabilityCluster[] {
  const caps = (capabilities ?? []).map((c) => c.toLowerCase());
  const matches: ReliabilityCluster[] = [];
  for (const cluster of CLUSTERS) {
    if (cluster.tags.length === 0) continue;
    if (cluster.tags.some((tag) => caps.some((c) => c.includes(tag)))) {
      matches.push(cluster.id);
    }
  }
  return matches.length > 0 ? matches : ["general"];
}

export function inferPriceTier(avgCostUsd: number | null | undefined): PriceTier {
  const cost = Number(avgCostUsd ?? 0);
  if (!Number.isFinite(cost) || cost <= 0.02) return "budget";
  if (cost <= 0.05) return "standard";
  return "premium";
}

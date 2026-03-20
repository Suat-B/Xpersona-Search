import {
  capabilityTokenToLabel,
  normalizeCapabilityToken,
} from "@/lib/search/capability-tokens";
import { inferClusters, CLUSTERS } from "@/lib/reliability/clusters";

export type TrendingCapabilitySummary = { name: string; count: number };

type TrendableItem = {
  name?: string;
  description?: string | null;
  capabilities?: string[] | null;
  protocols?: string[] | null;
};

function addCount(
  counts: Map<string, { count: number; label: string }>,
  key: string,
  label: string
) {
  const current = counts.get(key);
  counts.set(key, {
    count: (current?.count ?? 0) + 1,
    label: current?.label ?? label,
  });
}

function buildExplicitCapabilityCounts(items: TrendableItem[]) {
  const counts = new Map<string, { count: number; label: string }>();
  for (const item of items) {
    for (const cap of item.capabilities ?? []) {
      const key = normalizeCapabilityToken(cap);
      if (!key) continue;
      addCount(counts, key, capabilityTokenToLabel(key));
    }
  }
  return counts;
}

function buildInferredCapabilityCounts(items: TrendableItem[]) {
  const counts = new Map<string, { count: number; label: string }>();
  for (const item of items) {
    const inferred = inferClusters([
      item.name ?? "",
      item.description ?? "",
      ...(item.capabilities ?? []),
      ...(item.protocols ?? []),
    ]);
    for (const cluster of inferred) {
      if (cluster === "general") continue;
      const label = CLUSTERS.find((entry) => entry.id === cluster)?.label ?? cluster;
      addCount(counts, cluster, label);
    }
  }
  return counts;
}

function toSummaries(counts: Map<string, { count: number; label: string }>, limit: number) {
  return [...counts.entries()]
    .sort((a, b) => b[1].count - a[1].count || a[1].label.localeCompare(b[1].label))
    .slice(0, limit)
    .map(([, value]) => ({ name: value.label, count: value.count }));
}

export function buildTrendingCapabilities(items: TrendableItem[], limit: number): TrendingCapabilitySummary[] {
  const explicitCounts = buildExplicitCapabilityCounts(items);
  const inferredCounts = buildInferredCapabilityCounts(items);

  const counts = explicitCounts.size > 0 ? explicitCounts : inferredCounts;

  return toSummaries(counts, limit);
}

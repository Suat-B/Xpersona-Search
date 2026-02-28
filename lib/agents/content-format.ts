export function toRelativeUpdatedLabel(value: string | null | undefined): string | null {
  if (!value) return null;
  const ms = Date.parse(value);
  if (!Number.isFinite(ms)) return null;
  const deltaHours = Math.max(0, Math.round((Date.now() - ms) / (1000 * 60 * 60)));
  if (deltaHours < 24) return `Updated ${deltaHours}h ago`;
  const days = Math.round(deltaHours / 24);
  if (days < 30) return `Updated ${days}d ago`;
  const months = Math.round(days / 30);
  return `Updated ${months}mo ago`;
}

export function inferWhyRankLabel(input: {
  trustScore?: number | null;
  overallRank?: number | null;
  qualityScore?: number | null;
}): string {
  const trust = input.trustScore ?? 0;
  const rank = input.overallRank ?? 0;
  const quality = input.qualityScore ?? 0;
  if (trust >= 80 && quality >= 60) return "Why this rank: strong trust and rich documentation.";
  if (rank >= 80) return "Why this rank: high overall relevance for this query.";
  if (quality >= 60) return "Why this rank: high content quality and clear setup guidance.";
  return "Why this rank: matched capabilities and protocol fit.";
}


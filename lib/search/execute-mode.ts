import { createHash } from "crypto";

export type SearchIntent = "discover" | "execute";

export interface ExecuteParams {
  intent: SearchIntent;
  taskType?: string;
  maxLatencyMs?: number;
  maxCostUsd?: number;
  requires: string[];
  forbidden: string[];
  dataRegion?: "us" | "eu" | "global";
  bundle: boolean;
  explain: boolean;
}

export interface ExecutionContract {
  authModes: string[];
  requires: string[];
  forbidden: string[];
  dataRegion: string | null;
  inputSchemaRef: string | null;
  outputSchemaRef: string | null;
  supportsStreaming: boolean;
  supportsMcp: boolean;
  supportsA2a: boolean;
}

export interface ExecutionMetrics {
  observedLatencyMsP50: number | null;
  observedLatencyMsP95: number | null;
  estimatedCostUsd: number | null;
  uptime30d: number | null;
  rateLimitRpm: number | null;
  rateLimitBurst: number | null;
  lastVerifiedAt: Date | null;
}

export interface OutcomeAggregate {
  attempts: number;
  successCount: number;
  failureCount: number;
  timeoutCount: number;
}

export interface PolicyMatch {
  score: number;
  blockedBy: string[];
  matched: string[];
}

export interface RankingSignals {
  successScore: number;
  reliabilityScore: number;
  policyScore: number;
  freshnessScore: number;
  finalScore: number;
}

const BASELINE_SUCCESS = 0.6;
const PRIOR_STRENGTH = 6;

function clamp01(v: number) {
  return Math.max(0, Math.min(1, v));
}

function norm(values: string[] | null | undefined): string[] {
  if (!Array.isArray(values)) return [];
  return values.map((v) => (typeof v === "string" ? v.trim().toLowerCase() : "")).filter(Boolean);
}

export function normalizeTokens(values: string[]): string[] {
  return values.map((v) => v.trim().toLowerCase()).filter(Boolean);
}

export function computePolicyMatch(
  params: ExecuteParams,
  contract: ExecutionContract | null,
  metrics: ExecutionMetrics | null
): PolicyMatch {
  if (params.intent !== "execute") {
    return { score: 100, blockedBy: [], matched: [] };
  }

  const blockedBy: string[] = [];
  const matched: string[] = [];
  let score = 100;
  const contractRequires = new Set(norm(contract?.requires));
  const contractForbidden = new Set(norm(contract?.forbidden));
  const authModes = new Set(norm(contract?.authModes));

  for (const req of params.requires) {
    const isProtocol =
      (req === "mcp" && Boolean(contract?.supportsMcp)) ||
      (req === "a2a" && Boolean(contract?.supportsA2a)) ||
      (req === "streaming" && Boolean(contract?.supportsStreaming));
    const ok = isProtocol || contractRequires.has(req) || authModes.has(req);
    if (ok) matched.push(req);
    else {
      score -= 18;
      blockedBy.push(`missing:${req}`);
    }
  }

  for (const deny of params.forbidden) {
    if (contractForbidden.has(deny)) {
      blockedBy.push(`forbidden:${deny}`);
      score -= 40;
    } else {
      matched.push(`avoids:${deny}`);
    }
  }

  if (params.dataRegion && params.dataRegion !== "global") {
    const region = contract?.dataRegion?.toLowerCase();
    if (!region || region !== params.dataRegion) {
      score -= 12;
      blockedBy.push(`region:${params.dataRegion}`);
    } else {
      matched.push(`region:${params.dataRegion}`);
    }
  }

  if (params.maxLatencyMs != null && metrics?.observedLatencyMsP95 != null) {
    if (metrics.observedLatencyMsP95 > params.maxLatencyMs) {
      score -= 20;
      blockedBy.push("latency");
    } else {
      matched.push("latency");
    }
  }

  if (params.maxCostUsd != null && metrics?.estimatedCostUsd != null) {
    if (metrics.estimatedCostUsd > params.maxCostUsd) {
      score -= 20;
      blockedBy.push("cost");
    } else {
      matched.push("cost");
    }
  }

  return { score: Math.max(0, Math.min(100, score)), blockedBy, matched };
}

export function isHardBlocked(policy: PolicyMatch): boolean {
  return policy.blockedBy.some((b) => b.startsWith("forbidden:"));
}

export function computeRankingSignals(
  relevance: number,
  freshnessScore: number,
  outcome: OutcomeAggregate | null,
  policy: PolicyMatch
): RankingSignals {
  const attempts = outcome?.attempts ?? 0;
  const successes = outcome?.successCount ?? 0;
  const timeouts = outcome?.timeoutCount ?? 0;
  const observed = attempts > 0 ? successes / attempts : BASELINE_SUCCESS;
  const dampedSuccess = ((observed * attempts) + (BASELINE_SUCCESS * PRIOR_STRENGTH)) / (attempts + PRIOR_STRENGTH);
  const timeoutPenalty = attempts > 0 ? Math.min(0.25, timeouts / attempts) : 0;
  const successScore = clamp01(dampedSuccess - timeoutPenalty);
  const reliabilityScore = clamp01((attempts / 24) * 0.7 + successScore * 0.3);
  const policyScore = clamp01(policy.score / 100);
  const normalizedRelevance = clamp01(relevance);
  const freshness = clamp01((freshnessScore ?? 0) / 100);

  const finalScore = (0.35 * successScore) +
    (0.2 * reliabilityScore) +
    (0.2 * policyScore) +
    (0.15 * normalizedRelevance) +
    (0.1 * freshness);

  return {
    successScore: Number(successScore.toFixed(4)),
    reliabilityScore: Number(reliabilityScore.toFixed(4)),
    policyScore: Number(policyScore.toFixed(4)),
    freshnessScore: Number(freshness.toFixed(4)),
    finalScore: Number(finalScore.toFixed(4)),
  };
}

export function buildQuerySignature(input: { q: string; taskType?: string; requires: string[]; forbidden: string[] }) {
  const payload = [
    input.q.trim().toLowerCase(),
    (input.taskType ?? "general").trim().toLowerCase(),
    [...input.requires].sort().join(","),
    [...input.forbidden].sort().join(","),
  ].join("|");
  return createHash("sha256").update(payload).digest("hex");
}

export function buildFallbacks<T extends { id: string; slug: string; policyMatch?: PolicyMatch }>(
  all: T[],
  currentId: string
) {
  const candidates = all
    .filter((item) => item.id !== currentId)
    .slice(0, 3)
    .map((item) => ({
      id: item.id,
      slug: item.slug,
      reason: "lower-latency-or-better-policy",
      switchWhen: item.policyMatch?.score != null && item.policyMatch.score >= 70
        ? "policy-mismatch-or-timeout"
        : "primary-failure",
    }));
  return candidates;
}

export function buildDelegationHints(taskType?: string, candidates: string[] = []) {
  const top = candidates.slice(0, 3);
  const first = top[0] ?? null;
  if (!taskType) {
    return first
      ? [{ role: "primary", why: "best-overall-execution-fit", candidateSlugs: [first] }]
      : [];
  }
  if (taskType === "automation") {
    return [
      { role: "planner", why: "break-task-into-steps", candidateSlugs: top },
      { role: "executor", why: "perform-actions-reliably", candidateSlugs: top },
    ];
  }
  if (taskType === "retrieval") {
    return [
      { role: "retriever", why: "high-relevance-fetch", candidateSlugs: top },
      { role: "synthesizer", why: "compress-results", candidateSlugs: top },
    ];
  }
  return first
    ? [{ role: "primary", why: "task-type-aligned", candidateSlugs: top }]
    : [];
}

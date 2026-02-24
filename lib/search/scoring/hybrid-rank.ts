export interface RankingWeights {
  lexical: number;
  authority: number;
  engagement: number;
  freshness: number;
}

export interface HybridScoreInput {
  lexical: number;
  authority: number;
  engagement: number;
  freshness: number;
}

export interface EngagementParams {
  priorMean: number;
  priorStrength: number;
  confidenceImpressions: number;
  scoreScale: number;
}

const DEFAULT_WEIGHTS: RankingWeights = {
  lexical: 0.62,
  authority: 0.22,
  engagement: 0.12,
  freshness: 0.04,
};

const DEFAULT_ENGAGEMENT_PARAMS: EngagementParams = {
  priorMean: 0.06,
  priorStrength: 20,
  confidenceImpressions: 40,
  scoreScale: 2.25,
};

function parseWeight(name: string, fallback: number): number {
  const raw = process.env[name];
  if (!raw) return fallback;
  const val = Number(raw);
  if (!Number.isFinite(val) || val < 0) return fallback;
  return val;
}

function parsePositive(name: string, fallback: number): number {
  const raw = process.env[name];
  if (!raw) return fallback;
  const val = Number(raw);
  if (!Number.isFinite(val) || val <= 0) return fallback;
  return val;
}

export function getRankingWeights(): RankingWeights {
  const parsed = {
    lexical: parseWeight("SEARCH_RANK_WEIGHT_LEXICAL", DEFAULT_WEIGHTS.lexical),
    authority: parseWeight("SEARCH_RANK_WEIGHT_AUTHORITY", DEFAULT_WEIGHTS.authority),
    engagement: parseWeight("SEARCH_RANK_WEIGHT_ENGAGEMENT", DEFAULT_WEIGHTS.engagement),
    freshness: parseWeight("SEARCH_RANK_WEIGHT_FRESHNESS", DEFAULT_WEIGHTS.freshness),
  };
  const total =
    parsed.lexical + parsed.authority + parsed.engagement + parsed.freshness;
  if (total <= 0) return DEFAULT_WEIGHTS;
  return {
    lexical: parsed.lexical / total,
    authority: parsed.authority / total,
    engagement: parsed.engagement / total,
    freshness: parsed.freshness / total,
  };
}

export function getEngagementParams(): EngagementParams {
  return {
    priorMean: Math.min(1, parsePositive("SEARCH_ENGAGEMENT_PRIOR_MEAN", DEFAULT_ENGAGEMENT_PARAMS.priorMean)),
    priorStrength: parsePositive("SEARCH_ENGAGEMENT_PRIOR_STRENGTH", DEFAULT_ENGAGEMENT_PARAMS.priorStrength),
    confidenceImpressions: parsePositive(
      "SEARCH_ENGAGEMENT_CONFIDENCE_IMPRESSIONS",
      DEFAULT_ENGAGEMENT_PARAMS.confidenceImpressions
    ),
    scoreScale: parsePositive("SEARCH_ENGAGEMENT_SCORE_SCALE", DEFAULT_ENGAGEMENT_PARAMS.scoreScale),
  };
}

export function clamp01(v: number): number {
  return Math.max(0, Math.min(1, v));
}

export function composeHybridScore(
  input: HybridScoreInput,
  weights = getRankingWeights()
): number {
  return (
    clamp01(input.lexical) * weights.lexical +
    clamp01(input.authority) * weights.authority +
    clamp01(input.engagement) * weights.engagement +
    clamp01(input.freshness) * weights.freshness
  );
}

/**
 * Bayesian-smoothed CTR in [0, 1], then transformed into bounded score.
 */
export function boundedEngagementScore(
  clicks: number,
  impressions: number,
  params = getEngagementParams()
): number {
  if (impressions <= 0 || clicks <= 0) return 0;
  const priorMean = params.priorMean;
  const priorStrength = params.priorStrength;
  const smoothedCtr =
    (clicks + priorMean * priorStrength) / (impressions + priorStrength);
  const confidenceScale = Math.min(1, impressions / params.confidenceImpressions);
  return clamp01(smoothedCtr * confidenceScale * params.scoreScale);
}

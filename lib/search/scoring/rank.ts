import type { GitHubRepo } from "../utils/github";

export function calculatePopularityScore(repo: GitHubRepo): number {
  const score = Math.min(100, Math.log10(repo.stargazers_count + 1) * 25);
  return Math.round(score);
}

export function calculateFreshnessScore(repo: GitHubRepo): number {
  const lastPush = new Date(repo.pushed_at);
  const daysSincePush =
    (Date.now() - lastPush.getTime()) / (1000 * 60 * 60 * 24);
  const score = 100 * Math.exp(-daysSincePush / 30);
  return Math.round(score);
}

export function calculateOverallRank(scores: {
  safety: number;
  popularity: number;
  freshness: number;
  performance: number;
}): number {
  const weights = {
    safety: 0.3,
    popularity: 0.2,
    freshness: 0.2,
    performance: 0.3,
  };
  const rank =
    scores.safety * weights.safety +
    scores.popularity * weights.popularity +
    scores.freshness * weights.freshness +
    scores.performance * weights.performance;
  return Math.round(rank * 10) / 10;
}

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

/**
 * Dynamic scoring for non-GitHub sources.
 * Fetches real metrics from GitHub/npm/HuggingFace when URLs are available.
 */
export async function calculateDynamicScores(opts: {
  url?: string | null;
  homepage?: string | null;
  sourceId?: string;
  npmPackage?: string | null;
  lastUpdated?: string | null;
}): Promise<{
  safetyScore: number;
  popularityScore: number;
  freshnessScore: number;
  overallRank: number;
}> {
  let safetyScore = 65;
  let popularityScore = 50;
  let freshnessScore = 60;

  const urls = [opts.url, opts.homepage].filter(Boolean) as string[];

  const ghMatch = urls
    .map((u) => u.match(/github\.com\/([a-zA-Z0-9._-]+\/[a-zA-Z0-9._-]+)/))
    .find(Boolean);

  if (ghMatch) {
    try {
      const repoData = await fetchGitHubStars(ghMatch[1]);
      if (repoData) {
        popularityScore = Math.min(100, Math.round(Math.log10(repoData.stars + 1) * 25));
        const daysSince = (Date.now() - new Date(repoData.pushedAt).getTime()) / (24 * 60 * 60 * 1000);
        freshnessScore = Math.round(100 * Math.exp(-daysSince / 30));
        safetyScore = repoData.stars > 100 ? 80 : repoData.stars > 10 ? 70 : 60;
        if (!repoData.fork) safetyScore += 5;
        safetyScore = Math.min(100, safetyScore);
      }
    } catch {
      // fall through to defaults
    }
  }

  if (opts.npmPackage) {
    try {
      const npmData = await fetchNpmDownloads(opts.npmPackage);
      if (npmData) {
        const npmPopularity = Math.min(100, Math.round(Math.log10(npmData.downloads + 1) * 15));
        popularityScore = Math.max(popularityScore, npmPopularity);
      }
    } catch {
      // fall through
    }
  }

  if (opts.lastUpdated) {
    const daysSince = (Date.now() - new Date(opts.lastUpdated).getTime()) / (24 * 60 * 60 * 1000);
    const computedFreshness = Math.round(100 * Math.exp(-daysSince / 60));
    freshnessScore = Math.max(freshnessScore, computedFreshness);
  }

  return {
    safetyScore,
    popularityScore,
    freshnessScore,
    overallRank: calculateOverallRank({
      safety: safetyScore,
      popularity: popularityScore,
      freshness: freshnessScore,
      performance: 0,
    }),
  };
}

async function fetchGitHubStars(
  repoPath: string
): Promise<{ stars: number; pushedAt: string; fork: boolean } | null> {
  const token = process.env.GITHUB_TOKEN;
  if (!token) return null;

  try {
    const [owner, repo] = repoPath.replace(/\.git$/, "").split("/");
    const res = await fetch(`https://api.github.com/repos/${owner}/${repo}`, {
      headers: {
        Authorization: `token ${token}`,
        Accept: "application/vnd.github.v3+json",
        "User-Agent": "Xpersona-Crawler/1.0",
      },
    });
    if (!res.ok) return null;
    const data = await res.json();
    return {
      stars: (data as { stargazers_count?: number }).stargazers_count ?? 0,
      pushedAt: (data as { pushed_at?: string }).pushed_at ?? new Date().toISOString(),
      fork: (data as { fork?: boolean }).fork ?? false,
    };
  } catch {
    return null;
  }
}

async function fetchNpmDownloads(
  packageName: string
): Promise<{ downloads: number } | null> {
  try {
    const res = await fetch(
      `https://api.npmjs.org/downloads/point/last-month/${encodeURIComponent(packageName)}`,
      { headers: { Accept: "application/json" } }
    );
    if (!res.ok) return null;
    const data = await res.json();
    return { downloads: (data as { downloads?: number }).downloads ?? 0 };
  } catch {
    return null;
  }
}

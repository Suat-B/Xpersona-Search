import type { GitHubRepo, GitHubRequestContext } from "../utils/github";
import {
  checkFileExists,
  checkDirectoryExists,
  checkGlobExists,
} from "../utils/github";

export interface SafetyReport {
  score: number;
  issues: SafetyIssue[];
  checks: Record<string, boolean>;
}

export interface SafetyIssue {
  severity: "critical" | "high" | "medium" | "low";
  type: string;
  message: string;
  file?: string;
  line?: number;
}

const SUSPICIOUS_PATTERNS: Array<{
  pattern: RegExp;
  severity: "critical" | "high" | "medium" | "low";
}> = [
  { pattern: /eval\s*\(/, severity: "critical" },
  { pattern: /Function\s*\(.*\)\s*\(/, severity: "critical" },
  { pattern: /child_process\.exec\s*\(/, severity: "critical" },
  { pattern: /exec\s*\(/, severity: "high" },
  {
    pattern: /fetch\s*\(\s*["']https?:\/\/(?!localhost|127\.0\.0\.1)/,
    severity: "high",
  },
  { pattern: /document\.cookie\s*=/, severity: "high" },
  { pattern: /localStorage\.setItem\s*\(/, severity: "medium" },
  { pattern: /process\.env\.\w+/, severity: "low" },
];

function applyIssuePenalties(
  baseScore: number,
  issues: SafetyIssue[],
  checks: Record<string, boolean>
): number {
  let score = baseScore;
  for (const issue of issues) {
    switch (issue.severity) {
      case "critical":
        score -= 30;
        break;
      case "high":
        score -= 10;
        break;
      case "medium":
        score -= 4;
        break;
      case "low":
        score -= 2;
        break;
    }
  }
  if (checks.hasLicense) score = Math.min(100, score + 10);
  if (checks.hasTests) score = Math.min(100, score + 14);
  if (checks.isOriginal) score = Math.min(100, score + 6);
  if (checks.isMaintained) score = Math.min(100, score + 5);
  if (checks.hasReadme) score = Math.min(100, score + 4);
  if (issues.length > 0) score = Math.min(98, score);
  return Math.min(100, Math.max(25, Math.round(score)));
}

function clampScore(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(100, Math.round(value)));
}

export function calibrateSafetyScore(input: {
  baseScore: number;
  trust?: { reputationScore?: number | null; verificationFreshnessHours?: number | null } | null;
  verificationTier?: string | null;
  claimStatus?: string | null;
}): number {
  const base = clampScore(input.baseScore);
  let score = base * 0.9 + 12;
  const tier = (input.verificationTier ?? "NONE").toString().toUpperCase();
  if (tier === "GOLD") score += 10;
  else if (tier === "SILVER") score += 7;
  else if (tier === "BRONZE") score += 4;
  if ((input.claimStatus ?? "").toString().toUpperCase() === "CLAIMED") score += 3;
  const trustScore = input.trust?.reputationScore;
  if (typeof trustScore === "number" && Number.isFinite(trustScore)) {
    if (trustScore >= 90) score += 8;
    else if (trustScore >= 80) score += 6;
    else if (trustScore >= 65) score += 4;
    else if (trustScore >= 50) score += 2;
  }
  const freshness = input.trust?.verificationFreshnessHours;
  if (typeof freshness === "number" && Number.isFinite(freshness)) {
    if (freshness <= 24) score += 3;
    else if (freshness <= 168) score += 2;
  }
  return clampScore(score);
}

function buildBaseSignals(
  repo: GitHubRepo,
  skillContent: string
): { checks: Record<string, boolean>; issues: SafetyIssue[] } {
  const checks: Record<string, boolean> = {};
  const issues: SafetyIssue[] = [];

  checks.hasLicense = false;
  checks.hasReadme = false;
  checks.hasTests = false;
  checks.isOriginal = !repo.fork;
  checks.isMaintained = true;

  if (repo.fork) {
    issues.push({
      severity: "low",
      type: "is_fork",
      message: "Repository is a fork",
    });
  }

  const lastPush = new Date(repo.pushed_at);
  const daysSincePush =
    (Date.now() - lastPush.getTime()) / (1000 * 60 * 60 * 24);
  checks.isMaintained = daysSincePush < 90;
  if (!checks.isMaintained) {
    issues.push({
      severity: "high",
      type: "unmaintained",
      message: `Last update ${Math.round(daysSincePush)} days ago`,
    });
  }

  for (const { pattern, severity } of SUSPICIOUS_PATTERNS) {
    if (pattern.test(skillContent)) {
      issues.push({
        severity,
        type: "suspicious_code",
        message: `Potentially dangerous pattern: ${pattern.source}`,
      });
    }
  }

  if (repo.stargazers_count > 50) {
    checks.hasReadme = true; // weak positive signal for mature repos in fast mode
  }

  return { checks, issues };
}

/**
 * Fast safety scoring mode for high-volume crawls.
 * Avoids additional GitHub API calls and relies on repo metadata + scanned content.
 */
export function calculateSafetyScoreFast(
  repo: GitHubRepo,
  skillContent: string
): number {
  const { checks, issues } = buildBaseSignals(repo, skillContent);
  let score = applyIssuePenalties(80, issues, checks);
  if (repo.stargazers_count > 50) score = Math.min(100, score + 10);
  return Math.max(25, Math.min(100, Math.round(score)));
}

/**
 * Deep safety scoring mode for top candidates.
 * Performs extra repository checks that consume additional API budget.
 */
export async function calculateSafetyScoreDeep(
  repo: GitHubRepo,
  skillContent: string,
  context?: GitHubRequestContext
): Promise<number> {
  const { checks, issues } = buildBaseSignals(repo, skillContent);

  checks.hasLicense = await checkFileExists(repo.full_name, "LICENSE", context);
  if (!checks.hasLicense) {
    issues.push({
      severity: "medium",
      type: "missing_license",
      message: "Repository lacks LICENSE file",
    });
  }

  checks.hasReadme = await checkFileExists(repo.full_name, "README.md", context);

  const hasTestDir =
    (await checkDirectoryExists(repo.full_name, "test", context)) ||
    (await checkDirectoryExists(repo.full_name, "__tests__", context)) ||
    (await checkDirectoryExists(repo.full_name, "tests", context));
  const hasTestFiles = await checkGlobExists(repo.full_name, "*.test.ts", context);
  checks.hasTests = hasTestDir || hasTestFiles;

  let score = applyIssuePenalties(92, issues, checks);
  if (repo.stargazers_count > 50) score = Math.min(100, score + 8);
  return Math.max(25, Math.min(100, Math.round(score)));
}

/**
 * Backward-compatible entrypoint.
 * Existing callers get deep scoring unless they opt into fast mode explicitly.
 */
export async function calculateSafetyScore(
  repo: GitHubRepo,
  skillContent: string,
  options?: { mode?: "fast" | "deep"; context?: GitHubRequestContext }
): Promise<number> {
  if (options?.mode === "fast") {
    return calculateSafetyScoreFast(repo, skillContent);
  }
  return calculateSafetyScoreDeep(repo, skillContent, options?.context);
}

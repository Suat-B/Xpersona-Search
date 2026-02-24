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
        score -= 35;
        break;
      case "high":
        score -= 12;
        break;
      case "medium":
        score -= 6;
        break;
      case "low":
        score -= 3;
        break;
    }
  }
  if (checks.hasLicense) score = Math.min(100, score + 8);
  if (checks.hasTests) score = Math.min(100, score + 12);
  if (checks.isOriginal) score = Math.min(100, score + 5);
  if (checks.isMaintained) score = Math.min(100, score + 4);
  if (checks.hasReadme) score = Math.min(100, score + 3);
  return Math.min(100, Math.max(25, Math.round(score)));
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
  let score = applyIssuePenalties(76, issues, checks);
  if (repo.stargazers_count > 50) score = Math.min(100, score + 8);
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

  let score = applyIssuePenalties(88, issues, checks);
  if (repo.stargazers_count > 50) score = Math.min(100, score + 6);
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

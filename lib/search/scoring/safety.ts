import type { GitHubRepo } from "../utils/github";
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

export async function calculateSafetyScore(
  repo: GitHubRepo,
  skillContent: string
): Promise<number> {
  const checks: Record<string, boolean> = {};
  const issues: SafetyIssue[] = [];

  checks.hasLicense = await checkFileExists(repo.full_name, "LICENSE");
  if (!checks.hasLicense) {
    issues.push({
      severity: "medium",
      type: "missing_license",
      message: "Repository lacks LICENSE file",
    });
  }

  checks.hasReadme = await checkFileExists(repo.full_name, "README.md");

  if (repo.fork) {
    checks.isOriginal = false;
    issues.push({
      severity: "low",
      type: "is_fork",
      message: "Repository is a fork",
    });
  } else {
    checks.isOriginal = true;
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

  const hasTestDir =
    (await checkDirectoryExists(repo.full_name, "test")) ||
    (await checkDirectoryExists(repo.full_name, "__tests__")) ||
    (await checkDirectoryExists(repo.full_name, "tests"));
  const hasTestFiles = await checkGlobExists(
    repo.full_name,
    "*.test.ts"
  );
  checks.hasTests = hasTestDir || hasTestFiles;

  let score = 100;
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
  if (repo.stargazers_count > 50) score = Math.min(100, score + 8);

  score = Math.max(25, Math.round(score));
  return Math.min(100, score);
}

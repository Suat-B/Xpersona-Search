import * as fs from "node:fs/promises";
import * as path from "node:path";
import type {
  BinaryManifest,
  BinaryTargetEnvironment,
  BinaryValidationIssue,
  BinaryValidationReport,
} from "@/lib/binary/contracts";

const BLOCKED_DEPENDENCIES: Record<string, string> = {
  electron: "Electron makes the package bundle large and platform-specific.",
  puppeteer: "Puppeteer downloads browser binaries and weakens bundle portability.",
};

const ADVISORY_DEPENDENCIES: Record<string, string> = {
  request: "request is deprecated and should not ship in new bundles.",
  "left-pad": "left-pad is not recommended for production bundles.",
  "koa-router": "koa-router is superseded by @koa/router.",
};

async function readJsonFile<T>(filePath: string): Promise<T | null> {
  try {
    const raw = await fs.readFile(filePath, "utf8");
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

async function fileExists(filePath: string): Promise<boolean> {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

async function getDirectorySize(rootDir: string): Promise<number> {
  const entries = await fs.readdir(rootDir, { withFileTypes: true }).catch(() => []);
  let total = 0;
  for (const entry of entries) {
    const filePath = path.join(rootDir, entry.name);
    if (entry.isDirectory()) {
      total += await getDirectorySize(filePath);
      continue;
    }
    if (entry.isFile()) {
      const stats = await fs.stat(filePath).catch(() => null);
      total += stats?.size ?? 0;
    }
  }
  return total;
}

function buildSummary(status: BinaryValidationReport["status"], issues: BinaryValidationIssue[]): string {
  if (status === "pass") return "Package bundle passed all Binary IDE validation checks.";
  if (status === "warn") {
    return issues.length
      ? `Package bundle completed with ${issues.length} warning${issues.length === 1 ? "" : "s"}.`
      : "Package bundle completed with advisory warnings.";
  }
  return issues.length
    ? `Package bundle failed validation with ${issues.length} issue${issues.length === 1 ? "" : "s"}.`
    : "Package bundle failed validation.";
}

export async function computeBinaryValidationReport(input: {
  workspaceDir: string;
  manifest: BinaryManifest;
  targetEnvironment: BinaryTargetEnvironment;
  buildSucceeded: boolean;
}): Promise<BinaryValidationReport> {
  const issues: BinaryValidationIssue[] = [];
  const warnings: string[] = [];
  let score = 100;

  const packageJson = await readJsonFile<{
    dependencies?: Record<string, string>;
    devDependencies?: Record<string, string>;
  }>(path.join(input.workspaceDir, "package.json"));
  const packageLockExists = await fileExists(path.join(input.workspaceDir, "package-lock.json"));
  const entrypointExists = await fileExists(path.join(input.workspaceDir, input.manifest.entrypoint));
  const totalSizeBytes = await getDirectorySize(input.workspaceDir).catch(() => 0);
  const declaredDependencies = {
    ...(packageJson?.dependencies || {}),
    ...(packageJson?.devDependencies || {}),
  };

  if (!input.buildSucceeded || !entrypointExists) {
    issues.push({
      code: "build_failed",
      severity: "error",
      message: "The package bundle did not produce the expected compiled entrypoint.",
      detail: `Expected entrypoint: ${input.manifest.entrypoint}`,
    });
    score -= 35;
  }

  if (input.targetEnvironment.runtime !== input.manifest.runtime) {
    issues.push({
      code: "runtime_mismatch",
      severity: "warning",
      message: "Target runtime does not match the generated bundle runtime.",
      detail: `Target runtime ${input.targetEnvironment.runtime}, bundle runtime ${input.manifest.runtime}.`,
    });
    score -= 15;
  }

  if (!packageLockExists) {
    issues.push({
      code: "missing_lockfile",
      severity: "warning",
      message: "The generated package bundle is missing package-lock.json.",
      detail: "Portable package bundles should include a deterministic npm lockfile.",
    });
    score -= 10;
  }

  if (totalSizeBytes > 1_000_000) {
    warnings.push("The generated workspace exceeds 1 MB and may be slow to distribute.");
    issues.push({
      code: "bundle_size_large",
      severity: "warning",
      message: "The generated workspace is larger than the recommended portable threshold.",
      detail: `Workspace size is ${totalSizeBytes} bytes.`,
    });
    score -= 8;
  }

  for (const [dependency, message] of Object.entries(BLOCKED_DEPENDENCIES)) {
    if (!declaredDependencies[dependency]) continue;
    issues.push({
      code: `blocked_dependency_${dependency}`,
      severity: "error",
      message,
      detail: `${dependency}@${declaredDependencies[dependency]}`,
    });
    score -= 20;
  }

  for (const [dependency, message] of Object.entries(ADVISORY_DEPENDENCIES)) {
    if (!declaredDependencies[dependency]) continue;
    warnings.push(message);
    issues.push({
      code: `dependency_advisory_${dependency}`,
      severity: "warning",
      message,
      detail: `${dependency}@${declaredDependencies[dependency]}`,
    });
    score -= 10;
  }

  const status: BinaryValidationReport["status"] =
    issues.some((issue) => issue.severity === "error")
      ? "fail"
      : issues.length > 0 || warnings.length > 0
        ? "warn"
        : "pass";

  return {
    status,
    score: Math.max(0, Math.min(100, score)),
    summary: buildSummary(status, issues),
    targetEnvironment: input.targetEnvironment,
    issues,
    warnings,
    generatedAt: new Date().toISOString(),
  };
}

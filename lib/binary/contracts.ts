import { z } from "zod";

export const zBinaryArtifactKind = z.enum(["package_bundle"]);
export const zBinaryBuildStatus = z.enum(["queued", "running", "completed", "failed"]);
export const zBinaryWorkflow = z.enum(["binary_generate", "binary_validate", "binary_deploy"]);
export const zBinaryRuntime = z.enum(["node18", "node20"]);
export const zBinaryPlatform = z.enum(["portable"]);
export const zBinaryPackageManager = z.enum(["npm"]);
export const zBinarySeverity = z.enum(["info", "warning", "error"]);
export const zBinaryValidationStatus = z.enum(["pass", "warn", "fail"]);

export const zBinaryTargetEnvironment = z.object({
  runtime: zBinaryRuntime.default("node18"),
  platform: zBinaryPlatform.default("portable"),
  packageManager: zBinaryPackageManager.default("npm"),
});

const zBinaryContextFile = z.object({
  path: z.string().min(1).max(4096).optional(),
  language: z.string().min(1).max(64).optional(),
  selection: z.string().max(200_000).optional(),
  content: z.string().max(200_000).optional(),
});

const zBinaryOpenFile = z.object({
  path: z.string().min(1).max(4096),
  language: z.string().min(1).max(64).optional(),
  excerpt: z.string().max(120_000).optional(),
});

const zBinaryRetrievalHints = z.object({
  mentionedPaths: z.array(z.string().min(1).max(4096)).max(24).optional(),
  preferredTargetPath: z.string().min(1).max(4096).optional(),
  recentTouchedPaths: z.array(z.string().min(1).max(4096)).max(24).optional(),
});

export const zBinaryBuildRequest = z.object({
  intent: z.string().min(1).max(120_000),
  workspaceFingerprint: z.string().min(1).max(256),
  historySessionId: z.string().uuid().optional(),
  targetEnvironment: zBinaryTargetEnvironment.default({
    runtime: "node18",
    platform: "portable",
    packageManager: "npm",
  }),
  context: z
    .object({
      activeFile: zBinaryContextFile.optional(),
      openFiles: z.array(zBinaryOpenFile).max(40).optional(),
    })
    .optional(),
  retrievalHints: zBinaryRetrievalHints.optional(),
});

export const zBinaryValidateRequest = z.object({
  targetEnvironment: zBinaryTargetEnvironment.optional(),
});

export const zBinaryPublishRequest = z.object({
  expiresInSeconds: z.number().int().min(60).max(60 * 60 * 24 * 30).optional(),
});

export const zBinaryManifest = z.object({
  buildId: z.string().min(1).max(128),
  artifactKind: zBinaryArtifactKind,
  name: z.string().min(1).max(128),
  displayName: z.string().min(1).max(256),
  description: z.string().min(1).max(1000),
  intent: z.string().min(1).max(120_000),
  runtime: zBinaryRuntime,
  platform: zBinaryPlatform,
  packageManager: zBinaryPackageManager,
  entrypoint: z.string().min(1).max(4096),
  installCommand: z.string().min(1).max(256),
  buildCommand: z.string().min(1).max(256),
  startCommand: z.string().min(1).max(256),
  sourceFiles: z.array(z.string().min(1).max(4096)).max(200),
  outputFiles: z.array(z.string().min(1).max(4096)).max(200),
  warnings: z.array(z.string().min(1).max(4000)).max(50).default([]),
  createdAt: z.string().datetime(),
});

export const zBinaryValidationIssue = z.object({
  code: z.string().min(1).max(120),
  severity: zBinarySeverity,
  message: z.string().min(1).max(4000),
  detail: z.string().max(4000).optional(),
});

export const zBinaryValidationReport = z.object({
  status: zBinaryValidationStatus,
  score: z.number().int().min(0).max(100),
  summary: z.string().min(1).max(4000),
  targetEnvironment: zBinaryTargetEnvironment,
  issues: z.array(zBinaryValidationIssue).max(100),
  warnings: z.array(z.string().min(1).max(4000)).max(100),
  generatedAt: z.string().datetime(),
});

export const zBinaryArtifactMetadata = z.object({
  fileName: z.string().min(1).max(255),
  relativePath: z.string().min(1).max(4096),
  sizeBytes: z.number().int().min(0),
  sha256: z.string().min(1).max(128),
});

export const zBinaryPublishResult = z.object({
  publishedAt: z.string().datetime(),
  downloadUrl: z.string().url(),
  expiresAt: z.string().datetime(),
});

export const zBinaryBuildRecord = z.object({
  id: z.string().min(1).max(128),
  userId: z.string().min(1).max(128),
  historySessionId: z.string().uuid().nullable().optional(),
  runId: z.string().nullable().optional(),
  workflow: zBinaryWorkflow,
  artifactKind: zBinaryArtifactKind,
  status: zBinaryBuildStatus,
  intent: z.string().min(1).max(120_000),
  workspaceFingerprint: z.string().min(1).max(256),
  targetEnvironment: zBinaryTargetEnvironment,
  logs: z.array(z.string().min(1).max(20_000)).max(500),
  manifest: zBinaryManifest.nullable().optional(),
  reliability: zBinaryValidationReport.nullable().optional(),
  artifact: zBinaryArtifactMetadata.nullable().optional(),
  publish: zBinaryPublishResult.nullable().optional(),
  errorMessage: z.string().max(4000).nullable().optional(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});

export type BinaryArtifactKind = z.infer<typeof zBinaryArtifactKind>;
export type BinaryBuildStatus = z.infer<typeof zBinaryBuildStatus>;
export type BinaryWorkflow = z.infer<typeof zBinaryWorkflow>;
export type BinaryRuntime = z.infer<typeof zBinaryRuntime>;
export type BinaryTargetEnvironment = z.infer<typeof zBinaryTargetEnvironment>;
export type BinaryBuildRequest = z.infer<typeof zBinaryBuildRequest>;
export type BinaryValidateRequest = z.infer<typeof zBinaryValidateRequest>;
export type BinaryPublishRequest = z.infer<typeof zBinaryPublishRequest>;
export type BinaryManifest = z.infer<typeof zBinaryManifest>;
export type BinaryValidationIssue = z.infer<typeof zBinaryValidationIssue>;
export type BinaryValidationReport = z.infer<typeof zBinaryValidationReport>;
export type BinaryArtifactMetadata = z.infer<typeof zBinaryArtifactMetadata>;
export type BinaryPublishResult = z.infer<typeof zBinaryPublishResult>;
export type BinaryBuildRecord = z.infer<typeof zBinaryBuildRecord>;

export function normalizeBinaryTargetEnvironment(
  input?: Partial<BinaryTargetEnvironment> | null
): BinaryTargetEnvironment {
  return {
    runtime: input?.runtime === "node20" ? "node20" : "node18",
    platform: "portable",
    packageManager: "npm",
  };
}

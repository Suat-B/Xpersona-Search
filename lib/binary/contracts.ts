import { z } from "zod";

export const zBinaryArtifactKind = z.enum(["package_bundle"]);
export const zBinaryBuildStatus = z.enum(["queued", "running", "completed", "failed", "canceled"]);
export const zBinaryBuildPhase = z.enum([
  "queued",
  "planning",
  "materializing",
  "installing",
  "compiling",
  "validating",
  "packaging",
  "completed",
  "failed",
  "canceled",
]);
export const zBinaryWorkflow = z.enum(["binary_generate", "binary_validate", "binary_deploy"]);
export const zBinaryRuntime = z.enum(["node18", "node20"]);
export const zBinaryPlatform = z.enum(["portable"]);
export const zBinaryPackageManager = z.enum(["npm"]);
export const zBinarySeverity = z.enum(["info", "warning", "error"]);
export const zBinaryValidationStatus = z.enum(["pass", "warn", "fail"]);
export const zBinaryStreamTransport = z.enum(["sse"]);
export const zBinaryLogStream = z.enum(["stdout", "stderr", "system"]);
export const zBinaryReliabilityKind = z.enum(["prebuild", "full"]);

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

export const zBinaryControlRequest = z.object({
  action: z.literal("cancel"),
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

export const zBinaryPreviewFile = z.object({
  path: z.string().min(1).max(4096),
  language: z.string().min(1).max(64).optional(),
  preview: z.string().max(8_000),
  hash: z.string().min(1).max(128),
  completed: z.boolean().default(true),
  updatedAt: z.string().datetime(),
});

export const zBinaryPlanPreview = z.object({
  name: z.string().min(1).max(128),
  displayName: z.string().min(1).max(256),
  description: z.string().min(1).max(1000),
  entrypoint: z.string().min(1).max(4096),
  buildCommand: z.string().min(1).max(256),
  startCommand: z.string().min(1).max(256),
  sourceFiles: z.array(z.string().min(1).max(4096)).max(200),
  warnings: z.array(z.string().min(1).max(4000)).max(50).default([]),
});

export const zBinaryBuildPreview = z.object({
  plan: zBinaryPlanPreview.nullable().optional(),
  files: z.array(zBinaryPreviewFile).max(24).default([]),
  recentLogs: z.array(z.string().min(1).max(4_000)).max(80).default([]),
});

export const zBinaryBuildStream = z.object({
  enabled: z.boolean(),
  transport: zBinaryStreamTransport.default("sse"),
  streamPath: z.string().min(1).max(4096),
  eventsPath: z.string().min(1).max(4096),
  controlPath: z.string().min(1).max(4096),
  lastEventId: z.string().min(1).max(160).nullable().optional(),
});

export const zBinaryArtifactState = z.object({
  coverage: z.number().int().min(0).max(100),
  runnable: z.boolean(),
  sourceFilesTotal: z.number().int().min(0).max(500),
  sourceFilesReady: z.number().int().min(0).max(500),
  outputFilesReady: z.number().int().min(0).max(500),
  entryPoints: z.array(z.string().min(1).max(4096)).max(24).default([]),
  latestFile: z.string().min(1).max(4096).optional(),
  updatedAt: z.string().datetime(),
});

export const zBinaryBuildCheckpoint = z.object({
  id: z.string().min(1).max(160),
  buildId: z.string().min(1).max(128),
  phase: zBinaryBuildPhase,
  savedAt: z.string().datetime(),
  preview: zBinaryBuildPreview.nullable().optional(),
  manifest: zBinaryManifest.nullable().optional(),
  reliability: zBinaryValidationReport.nullable().optional(),
  artifactState: zBinaryArtifactState.nullable().optional(),
  artifact: zBinaryArtifactMetadata.nullable().optional(),
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
  phase: zBinaryBuildPhase.optional(),
  progress: z.number().int().min(0).max(100).optional(),
  intent: z.string().min(1).max(120_000),
  workspaceFingerprint: z.string().min(1).max(256),
  targetEnvironment: zBinaryTargetEnvironment,
  logs: z.array(z.string().min(1).max(20_000)).max(500),
  stream: zBinaryBuildStream.optional(),
  preview: zBinaryBuildPreview.nullable().optional(),
  cancelable: z.boolean().optional(),
  manifest: zBinaryManifest.nullable().optional(),
  reliability: zBinaryValidationReport.nullable().optional(),
  artifactState: zBinaryArtifactState.nullable().optional(),
  artifact: zBinaryArtifactMetadata.nullable().optional(),
  publish: zBinaryPublishResult.nullable().optional(),
  errorMessage: z.string().max(4000).nullable().optional(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});

const zBinaryBuildCreatedEvent = z.object({
  id: z.string().min(1).max(160),
  buildId: z.string().min(1).max(128),
  timestamp: z.string().datetime(),
  type: z.literal("build.created"),
  data: z.object({
    build: zBinaryBuildRecord,
  }),
});

const zBinaryPhaseChangedEvent = z.object({
  id: z.string().min(1).max(160),
  buildId: z.string().min(1).max(128),
  timestamp: z.string().datetime(),
  type: z.literal("phase.changed"),
  data: z.object({
    status: zBinaryBuildStatus,
    phase: zBinaryBuildPhase,
    progress: z.number().int().min(0).max(100).optional(),
    message: z.string().max(4000).optional(),
  }),
});

const zBinaryPlanUpdatedEvent = z.object({
  id: z.string().min(1).max(160),
  buildId: z.string().min(1).max(128),
  timestamp: z.string().datetime(),
  type: z.literal("plan.updated"),
  data: z.object({
    plan: zBinaryPlanPreview,
  }),
});

const zBinaryFileUpdatedEvent = z.object({
  id: z.string().min(1).max(160),
  buildId: z.string().min(1).max(128),
  timestamp: z.string().datetime(),
  type: z.literal("file.updated"),
  data: zBinaryPreviewFile,
});

const zBinaryLogChunkEvent = z.object({
  id: z.string().min(1).max(160),
  buildId: z.string().min(1).max(128),
  timestamp: z.string().datetime(),
  type: z.literal("log.chunk"),
  data: z.object({
    stream: zBinaryLogStream,
    chunk: z.string().min(1).max(4_000),
  }),
});

const zBinaryReliabilityDeltaEvent = z.object({
  id: z.string().min(1).max(160),
  buildId: z.string().min(1).max(128),
  timestamp: z.string().datetime(),
  type: z.literal("reliability.delta"),
  data: z.object({
    kind: zBinaryReliabilityKind,
    report: zBinaryValidationReport,
  }),
});

const zBinaryArtifactDeltaEvent = z.object({
  id: z.string().min(1).max(160),
  buildId: z.string().min(1).max(128),
  timestamp: z.string().datetime(),
  type: z.literal("artifact.delta"),
  data: z.object({
    artifactState: zBinaryArtifactState,
  }),
});

const zBinaryCheckpointSavedEvent = z.object({
  id: z.string().min(1).max(160),
  buildId: z.string().min(1).max(128),
  timestamp: z.string().datetime(),
  type: z.literal("checkpoint.saved"),
  data: z.object({
    checkpoint: zBinaryBuildCheckpoint,
  }),
});

const zBinaryArtifactReadyEvent = z.object({
  id: z.string().min(1).max(160),
  buildId: z.string().min(1).max(128),
  timestamp: z.string().datetime(),
  type: z.literal("artifact.ready"),
  data: z.object({
    artifact: zBinaryArtifactMetadata,
    manifest: zBinaryManifest,
  }),
});

const zBinaryBuildCompletedEvent = z.object({
  id: z.string().min(1).max(160),
  buildId: z.string().min(1).max(128),
  timestamp: z.string().datetime(),
  type: z.literal("build.completed"),
  data: z.object({
    build: zBinaryBuildRecord,
  }),
});

const zBinaryBuildFailedEvent = z.object({
  id: z.string().min(1).max(160),
  buildId: z.string().min(1).max(128),
  timestamp: z.string().datetime(),
  type: z.literal("build.failed"),
  data: z.object({
    errorMessage: z.string().min(1).max(4000),
    build: zBinaryBuildRecord,
  }),
});

const zBinaryBuildCanceledEvent = z.object({
  id: z.string().min(1).max(160),
  buildId: z.string().min(1).max(128),
  timestamp: z.string().datetime(),
  type: z.literal("build.canceled"),
  data: z.object({
    reason: z.string().max(4000).optional(),
    build: zBinaryBuildRecord,
  }),
});

const zBinaryHeartbeatEvent = z.object({
  id: z.string().min(1).max(160),
  buildId: z.string().min(1).max(128),
  timestamp: z.string().datetime(),
  type: z.literal("heartbeat"),
  data: z.object({
    phase: zBinaryBuildPhase.optional(),
    progress: z.number().int().min(0).max(100).optional(),
  }),
});

export const zBinaryBuildEvent = z.discriminatedUnion("type", [
  zBinaryBuildCreatedEvent,
  zBinaryPhaseChangedEvent,
  zBinaryPlanUpdatedEvent,
  zBinaryFileUpdatedEvent,
  zBinaryLogChunkEvent,
  zBinaryReliabilityDeltaEvent,
  zBinaryArtifactDeltaEvent,
  zBinaryCheckpointSavedEvent,
  zBinaryArtifactReadyEvent,
  zBinaryBuildCompletedEvent,
  zBinaryBuildFailedEvent,
  zBinaryBuildCanceledEvent,
  zBinaryHeartbeatEvent,
]);

export type BinaryArtifactKind = z.infer<typeof zBinaryArtifactKind>;
export type BinaryBuildStatus = z.infer<typeof zBinaryBuildStatus>;
export type BinaryBuildPhase = z.infer<typeof zBinaryBuildPhase>;
export type BinaryWorkflow = z.infer<typeof zBinaryWorkflow>;
export type BinaryRuntime = z.infer<typeof zBinaryRuntime>;
export type BinaryTargetEnvironment = z.infer<typeof zBinaryTargetEnvironment>;
export type BinaryBuildRequest = z.infer<typeof zBinaryBuildRequest>;
export type BinaryValidateRequest = z.infer<typeof zBinaryValidateRequest>;
export type BinaryPublishRequest = z.infer<typeof zBinaryPublishRequest>;
export type BinaryControlRequest = z.infer<typeof zBinaryControlRequest>;
export type BinaryManifest = z.infer<typeof zBinaryManifest>;
export type BinaryValidationIssue = z.infer<typeof zBinaryValidationIssue>;
export type BinaryValidationReport = z.infer<typeof zBinaryValidationReport>;
export type BinaryArtifactMetadata = z.infer<typeof zBinaryArtifactMetadata>;
export type BinaryPreviewFile = z.infer<typeof zBinaryPreviewFile>;
export type BinaryPlanPreview = z.infer<typeof zBinaryPlanPreview>;
export type BinaryBuildPreview = z.infer<typeof zBinaryBuildPreview>;
export type BinaryBuildStream = z.infer<typeof zBinaryBuildStream>;
export type BinaryArtifactState = z.infer<typeof zBinaryArtifactState>;
export type BinaryBuildCheckpoint = z.infer<typeof zBinaryBuildCheckpoint>;
export type BinaryPublishResult = z.infer<typeof zBinaryPublishResult>;
export type BinaryBuildRecord = z.infer<typeof zBinaryBuildRecord>;
export type BinaryBuildEvent = z.infer<typeof zBinaryBuildEvent>;
export type BinaryLogStream = z.infer<typeof zBinaryLogStream>;
export type BinaryReliabilityKind = z.infer<typeof zBinaryReliabilityKind>;

export function normalizeBinaryTargetEnvironment(
  input?: Partial<BinaryTargetEnvironment> | null
): BinaryTargetEnvironment {
  return {
    runtime: input?.runtime === "node20" ? "node20" : "node18",
    platform: "portable",
    packageManager: "npm",
  };
}

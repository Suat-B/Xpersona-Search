/**
 * Portable starter bundle (Binary IDE) API types.
 * Kept in sync with vscode-extension shared binary types; extend when the API adds Streaming Binary IDE Plan events.
 */
export type { RequestAuth } from "@xpersona/vscode-core";

export type RetrievalHints = {
  mentionedPaths: string[];
  candidateSymbols: string[];
  candidateErrors: string[];
  preferredTargetPath?: string;
  recentTouchedPaths?: string[];
};

export type BinaryContextPayload = {
  activeFile?: { path?: string; language?: string; selection?: string; content?: string };
  openFiles?: Array<{ path: string; language?: string; excerpt?: string }>;
};

export type BinaryTargetEnvironment = {
  runtime: "node18" | "node20";
  platform: "portable";
  packageManager: "npm";
};

export type BinaryBuildPhase =
  | "queued"
  | "planning"
  | "materializing"
  | "installing"
  | "compiling"
  | "validating"
  | "packaging"
  | "completed"
  | "failed"
  | "canceled";

export type BinaryValidationIssue = {
  code: string;
  severity: "info" | "warning" | "error";
  message: string;
  detail?: string;
};

export type BinaryValidationReport = {
  status: "pass" | "warn" | "fail";
  score: number;
  summary: string;
  targetEnvironment: BinaryTargetEnvironment;
  issues: BinaryValidationIssue[];
  warnings: string[];
  generatedAt: string;
};

export type BinaryManifest = {
  buildId: string;
  artifactKind: "package_bundle";
  name: string;
  displayName: string;
  description: string;
  intent: string;
  runtime: "node18" | "node20";
  platform: "portable";
  packageManager: "npm";
  entrypoint: string;
  installCommand: string;
  buildCommand: string;
  startCommand: string;
  sourceFiles: string[];
  outputFiles: string[];
  warnings: string[];
  createdAt: string;
};

export type BinaryArtifactMetadata = {
  fileName: string;
  relativePath: string;
  sizeBytes: number;
  sha256: string;
};

export type BinaryPlanPreview = {
  name: string;
  displayName: string;
  description: string;
  entrypoint: string;
  buildCommand: string;
  startCommand: string;
  sourceFiles: string[];
  warnings: string[];
};

export type BinaryPreviewFile = {
  path: string;
  language?: string;
  preview: string;
  hash: string;
  completed: boolean;
  updatedAt: string;
};

export type BinaryBuildPreview = {
  plan?: BinaryPlanPreview | null;
  files: BinaryPreviewFile[];
  recentLogs: string[];
};

export type BinaryBuildStream = {
  enabled: boolean;
  transport: "sse";
  streamPath: string;
  eventsPath: string;
  controlPath: string;
  lastEventId?: string | null;
};

export type BinaryGenerationDelta = {
  path: string;
  language?: string;
  content: string;
  completed: boolean;
  order: number;
  operation: "upsert";
};

export type BinarySourceGraphFunction = {
  name: string;
  sourcePath: string;
  exported: boolean;
  async: boolean;
  callable: boolean;
  signature?: string;
};

export type BinarySourceGraphModule = {
  path: string;
  language?: string;
  imports: string[];
  exports: string[];
  functions: BinarySourceGraphFunction[];
  completed: boolean;
  diagnosticCount: number;
};

export type BinarySourceGraphDependency = {
  from: string;
  to: string;
  kind: "import" | "dependency";
  resolved: boolean;
};

export type BinarySourceGraphDiagnostic = {
  path?: string;
  code: string;
  severity: "info" | "warning" | "error";
  message: string;
};

export type BinarySourceGraph = {
  coverage: number;
  readyModules: number;
  totalModules: number;
  modules: BinarySourceGraphModule[];
  dependencies: BinarySourceGraphDependency[];
  diagnostics: BinarySourceGraphDiagnostic[];
  updatedAt: string;
};

export type BinaryExecutionFunction = {
  name: string;
  sourcePath: string;
  mode: "none" | "native" | "stub";
  callable: boolean;
  signature?: string;
};

export type BinaryExecutionRun = {
  id: string;
  entryPoint: string;
  args: unknown[];
  status: "completed" | "failed" | "stubbed";
  outputJson?: unknown;
  logs: string[];
  errorMessage?: string;
  startedAt: string;
  completedAt: string;
};

export type BinaryExecutionState = {
  runnable: boolean;
  mode: "none" | "native" | "stub";
  availableFunctions: BinaryExecutionFunction[];
  lastRun?: BinaryExecutionRun | null;
  updatedAt: string;
};

export type BinaryPendingRefinement = {
  intent: string;
  requestedAt: string;
};

export type BinaryArtifactState = {
  coverage: number;
  runnable: boolean;
  sourceFilesTotal: number;
  sourceFilesReady: number;
  outputFilesReady: number;
  entryPoints: string[];
  latestFile?: string;
  updatedAt: string;
};

export type BinaryBuildCheckpointSummary = {
  id: string;
  phase: BinaryBuildPhase;
  savedAt: string;
  label?: string;
};

export type BinaryBuildCheckpoint = {
  id: string;
  buildId: string;
  phase: BinaryBuildPhase;
  savedAt: string;
  label?: string;
  preview?: BinaryBuildPreview | null;
  manifest?: BinaryManifest | null;
  reliability?: BinaryValidationReport | null;
  artifactState?: BinaryArtifactState | null;
  sourceGraph?: BinarySourceGraph | null;
  execution?: BinaryExecutionState | null;
  artifact?: BinaryArtifactMetadata | null;
};

export type BinaryPublishResult = {
  publishedAt: string;
  downloadUrl: string;
  expiresAt: string;
};

export type BinaryBuildRecord = {
  id: string;
  userId: string;
  historySessionId?: string | null;
  runId?: string | null;
  workflow: "binary_generate" | "binary_validate" | "binary_deploy";
  artifactKind: "package_bundle";
  status: "queued" | "running" | "completed" | "failed" | "canceled";
  phase?: BinaryBuildPhase;
  progress?: number;
  intent: string;
  workspaceFingerprint: string;
  targetEnvironment: BinaryTargetEnvironment;
  logs: string[];
  stream?: BinaryBuildStream;
  preview?: BinaryBuildPreview | null;
  cancelable?: boolean;
  manifest?: BinaryManifest | null;
  reliability?: BinaryValidationReport | null;
  artifactState?: BinaryArtifactState | null;
  sourceGraph?: BinarySourceGraph | null;
  execution?: BinaryExecutionState | null;
  checkpointId?: string | null;
  checkpoints?: BinaryBuildCheckpointSummary[];
  parentBuildId?: string | null;
  pendingRefinement?: BinaryPendingRefinement | null;
  artifact?: BinaryArtifactMetadata | null;
  publish?: BinaryPublishResult | null;
  errorMessage?: string | null;
  createdAt: string;
  updatedAt: string;
};

export type BinaryBuildEvent =
  | { id: string; buildId: string; timestamp: string; type: "build.created"; data: { build: BinaryBuildRecord } }
  | {
      id: string;
      buildId: string;
      timestamp: string;
      type: "phase.changed";
      data: { status: BinaryBuildRecord["status"]; phase: BinaryBuildPhase; progress?: number; message?: string };
    }
  | { id: string; buildId: string; timestamp: string; type: "plan.updated"; data: { plan: BinaryPlanPreview } }
  | { id: string; buildId: string; timestamp: string; type: "generation.delta"; data: { delta: BinaryGenerationDelta } }
  | { id: string; buildId: string; timestamp: string; type: "file.updated"; data: BinaryPreviewFile }
  | { id: string; buildId: string; timestamp: string; type: "log.chunk"; data: { stream: "stdout" | "stderr" | "system"; chunk: string } }
  | {
      id: string;
      buildId: string;
      timestamp: string;
      type: "reliability.delta";
      data: { kind: "prebuild" | "full"; report: BinaryValidationReport };
    }
  | { id: string; buildId: string; timestamp: string; type: "graph.updated"; data: { sourceGraph: BinarySourceGraph } }
  | { id: string; buildId: string; timestamp: string; type: "execution.updated"; data: { execution: BinaryExecutionState } }
  | {
      id: string;
      buildId: string;
      timestamp: string;
      type: "artifact.delta";
      data: { artifactState: BinaryArtifactState };
    }
  | {
      id: string;
      buildId: string;
      timestamp: string;
      type: "checkpoint.saved";
      data: { checkpoint: BinaryBuildCheckpoint };
    }
  | {
      id: string;
      buildId: string;
      timestamp: string;
      type: "interrupt.accepted";
      data: { action: "cancel" | "refine"; message?: string; pendingRefinement?: BinaryPendingRefinement | null };
    }
  | {
      id: string;
      buildId: string;
      timestamp: string;
      type: "artifact.ready";
      data: { artifact: BinaryArtifactMetadata; manifest: BinaryManifest };
    }
  | { id: string; buildId: string; timestamp: string; type: "build.completed"; data: { build: BinaryBuildRecord } }
  | { id: string; buildId: string; timestamp: string; type: "build.failed"; data: { errorMessage: string; build: BinaryBuildRecord } }
  | {
      id: string;
      buildId: string;
      timestamp: string;
      type: "branch.created";
      data: { sourceBuildId: string; checkpointId?: string; build: BinaryBuildRecord };
    }
  | { id: string; buildId: string; timestamp: string; type: "build.canceled"; data: { reason?: string; build: BinaryBuildRecord } }
  | { id: string; buildId: string; timestamp: string; type: "rewind.completed"; data: { checkpointId: string; build: BinaryBuildRecord } }
  | { id: string; buildId: string; timestamp: string; type: "heartbeat"; data: { phase?: BinaryBuildPhase; progress?: number } };

export type BinaryPanelState = {
  targetEnvironment: BinaryTargetEnvironment;
  activeBuild: BinaryBuildRecord | null;
  busy: boolean;
  phase?: BinaryBuildPhase;
  progress?: number;
  streamConnected: boolean;
  lastEventId?: string | null;
  previewFiles: BinaryPreviewFile[];
  recentLogs: string[];
  reliability: BinaryValidationReport | null;
  artifactState: BinaryArtifactState | null;
  sourceGraph: BinarySourceGraph | null;
  execution: BinaryExecutionState | null;
  checkpoints: BinaryBuildCheckpointSummary[];
  pendingRefinement: BinaryPendingRefinement | null;
  canCancel: boolean;
  lastAction: "generate" | "refine" | "branch" | "rewind" | "execute" | "validate" | "deploy" | null;
};

/** Future Streaming Binary IDE Plan event names — extend BinaryBuildEvent union when backend ships them. */
export const BINARY_STREAMING_PLAN_FUTURE_EVENTS = [
  "ast.delta",
  "reliability.stream",
  "patch.applied",
] as const;

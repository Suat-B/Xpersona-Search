export type Mode = "auto" | "plan" | "yolo";
export type RuntimeBackend = "cutie" | "playgroundApi" | "qwenCode";
export type IntentKind = "ask" | "explain" | "find" | "change";
export type ContextConfidence = "high" | "medium" | "low";
export type RuntimePhase =
  | "idle"
  | "radar"
  | "collecting_context"
  | "waiting_for_cutie"
  | "waiting_for_qwen"
  | "awaiting_approval"
  | "applying_result"
  | "saving_session"
  | "clarify"
  | "done"
  | "canceled"
  | "failed";
export type OrchestrationProtocol = "batch_v1" | "tool_loop_v1";
export type PlaygroundToolName =
  | "list_files"
  | "read_file"
  | "search_workspace"
  | "get_diagnostics"
  | "git_status"
  | "git_diff"
  | "create_checkpoint"
  | "patch_file"
  | "edit_file"
  | "edit"
  | "write_file"
  | "mkdir"
  | "run_command"
  | "get_workspace_memory";
export type PlaygroundAdapter = "native_tools" | "text_actions" | "deterministic_batch";

export type RequestAuth = {
  apiKey?: string | null;
  bearer?: string | null;
};

export type AssistAction =
  | { type: "edit"; path: string; patch?: string; diff?: string }
  | { type: "write_file"; path: string; content: string; overwrite?: boolean }
  | { type: "mkdir"; path: string }
  | { type: "command"; command: string; cwd?: string; timeoutMs?: number; category?: "implementation" | "validation" };

export type AssistPlan = {
  objective: string;
  files: string[];
  steps: string[];
  acceptanceTests: string[];
  risks: string[];
};

export type ClientCapabilities = {
  toolLoop?: boolean;
  supportedTools?: PlaygroundToolName[];
  autoExecute?: boolean;
  supportsNativeToolResults?: boolean;
};

export type ToolCall = {
  id: string;
  name: PlaygroundToolName;
  arguments: Record<string, unknown>;
  kind?: "observe" | "mutate" | "command";
  summary?: string;
};

export type ToolResult = {
  toolCallId: string;
  name: PlaygroundToolName;
  ok: boolean;
  blocked?: boolean;
  summary: string;
  data?: Record<string, unknown>;
  error?: string;
  createdAt?: string;
};

export type ToolTraceEntry = {
  step: number;
  status: "pending" | "completed" | "failed" | "blocked";
  adapter: PlaygroundAdapter;
  summary: string;
  toolCall?: ToolCall;
  toolResult?: ToolResult;
  createdAt: string;
};

export type LoopState = {
  protocol: OrchestrationProtocol;
  status: "idle" | "pending_tool" | "running" | "completed" | "failed";
  stepCount: number;
  mutationCount: number;
  repeatedCallCount: number;
  repairCount: number;
  maxSteps: number;
  maxMutations: number;
  lastToolCallKey?: string;
};

export type ProgressState = {
  status: "running" | "stalled" | "repairing" | "completed" | "failed";
  lastMeaningfulProgressAtStep: number;
  lastMeaningfulProgressSummary: string;
  stallCount: number;
  stallReason?: string;
  nextDeterministicAction?: string;
  pendingToolCallSignature?: string;
};

export type ObjectiveState = {
  status: "in_progress" | "satisfied" | "blocked";
  goalType: "code_edit" | "command_run" | "plan" | "unknown";
  targetPath?: string;
  requiredProof: string[];
  observedProof: string[];
  missingProof: string[];
};

export type PendingToolCall = {
  step: number;
  adapter: PlaygroundAdapter;
  requiresClientExecution: boolean;
  toolCall: ToolCall;
  availableTools?: PlaygroundToolName[];
  createdAt: string;
};

export type ValidationPlan = {
  scope: "none" | "targeted";
  checks: string[];
  touchedFiles: string[];
  reason: string;
};

export type AssistTargetInference = {
  path?: string;
  confidence: number;
  source: "mention" | "active_file" | "diagnostic" | "retrieval" | "unknown";
};

export type AssistContextSelection = {
  files: Array<{ path: string; reason: string; score?: number }>;
  snippets: number;
  usedCloudIndex: boolean;
};

export type AssistContext = {
  activeFile?: { path?: string; language?: string; selection?: string; content?: string };
  openFiles?: Array<{ path: string; language?: string; excerpt?: string }>;
  diagnostics?: Array<{ file?: string; severity?: string | number; message: string; line?: number }>;
  git?: { status?: string[]; diffSummary?: string };
  indexedSnippets?: Array<{
    path?: string;
    score?: number;
    content: string;
    source?: "cloud" | "local_fallback";
    reason?: string;
  }>;
};

export type RetrievalHints = {
  mentionedPaths: string[];
  candidateSymbols: string[];
  candidateErrors: string[];
  preferredTargetPath?: string;
  recentTouchedPaths?: string[];
};

export type AssistResponsePayload = {
  sessionId: string;
  traceId: string;
  decision: { mode: Mode; reason: string; confidence: number };
  plan: AssistPlan | null;
  actions: AssistAction[];
  final: string;
  validationPlan: ValidationPlan;
  targetInference: AssistTargetInference;
  contextSelection: AssistContextSelection;
  completionStatus: "complete" | "incomplete";
  missingRequirements: string[];
  runId?: string;
  orchestrationProtocol?: OrchestrationProtocol;
  adapter?: PlaygroundAdapter;
  loopState?: LoopState | null;
  progressState?: ProgressState | null;
  objectiveState?: ObjectiveState | null;
  pendingToolCall?: PendingToolCall | null;
  toolTrace?: ToolTraceEntry[];
};

export type ChatMessage = {
  id: string;
  role: "user" | "assistant" | "system";
  content: string;
  presentation?: "plain" | "live_binary";
  live?: ChatLiveState;
};

export type ChatLiveMode = "shell" | "answer" | "build";
export type ChatLiveStatus = "pending" | "streaming" | "done" | "failed" | "canceled";
export type ChatLiveTransport = "local" | "qwen" | "cutie" | "playground" | "binary";

export type ChatLiveState = {
  mode: ChatLiveMode;
  status: ChatLiveStatus;
  phase: string;
  transport: ChatLiveTransport;
  progress?: number;
  buildId?: string;
  latestActivity?: string;
  latestLog?: string;
  latestFile?: string;
  startedAt?: string;
  updatedAt?: string;
};

export type LiveChatState = ChatLiveState & {
  messageId: string;
};

export type ChatLiveEvent =
  | { type: "accepted"; transport: ChatLiveTransport; mode?: ChatLiveMode; phase?: string }
  | { type: "phase"; phase: string; status?: ChatLiveStatus; progress?: number; latestActivity?: string }
  | { type: "activity"; activity: string; phase?: string }
  | { type: "partial_text"; text: string; phase?: string }
  | { type: "build_attached"; buildId: string; phase?: string; progress?: number }
  | { type: "build_event"; eventType: BinaryBuildEvent["type"]; phase?: string; progress?: number; latestLog?: string; latestFile?: string }
  | { type: "tool_approval"; activity: string }
  | { type: "final"; text: string }
  | { type: "failed"; text: string; phase?: string }
  | { type: "canceled"; text?: string; phase?: string };

export type FollowUpAction = {
  id: string;
  label: string;
  kind: "prompt" | "rerun" | "target" | "info";
  prompt?: string;
  targetPath?: string;
  detail?: string;
  disabled?: boolean;
  emphasized?: boolean;
};

export type HistoryItem = {
  id: string;
  title: string;
  mode: Mode;
  updatedAt?: string | null;
};

export type ContextPreview = {
  activeFile?: string;
  openFiles: string[];
  candidateFiles: string[];
  attachedFiles: string[];
  memoryFiles: string[];
  resolvedFiles: string[];
  selectedFiles: string[];
  diagnostics: string[];
  intent: IntentKind;
  confidence: ContextConfidence;
  confidenceScore: number;
  rationale: string;
  workspaceRoot?: string;
  attachedSelection?: {
    path: string;
    summary: string;
  };
  snippets: Array<{
    path: string;
    source: "cloud" | "local_fallback";
    reason: string;
  }>;
};

export type ContextSummary = {
  workspaceRoot?: string;
  likelyTargets: string[];
  candidateTargets: string[];
  attachedFiles: string[];
  memoryTargets: string[];
  attachedSelection?: {
    path: string;
    summary: string;
  };
  note?: string;
};

export type IndexState = {
  projectKey?: string;
  chunks: number;
  freshness: "idle" | "indexing" | "ready" | "stale" | "error";
  lastQueryMatches: number;
  lastRebuildAt?: string;
  lastError?: string;
};

export type CommandExecutionResult = {
  command: string;
  exitCode: number;
  stdout: string;
  stderr: string;
  timedOut: boolean;
};

export type LocalApplyReport = {
  summary: string;
  details: string[];
  changedFiles: string[];
  createdDirectories: string[];
  blockedActions: string[];
  commandResults: CommandExecutionResult[];
  canUndo: boolean;
};

export type AssistRunEnvelope = AssistResponsePayload & {
  receipt?: Record<string, unknown> | null;
  checkpoint?: Record<string, unknown> | null;
  reviewState?: Record<string, unknown> | null;
};

export type AuthState = {
  kind: "none" | "apiKey" | "browser";
  label: string;
  email?: string;
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

export type BinaryAstNodeSummary = {
  id: string;
  kind: string;
  label: string;
  path?: string;
  parentId?: string;
  exported?: boolean;
  callable?: boolean;
  completeness?: number;
};

export type BinaryAstModuleSummary = {
  path: string;
  language?: string;
  nodeCount: number;
  exportedSymbols: string[];
  callableFunctions: string[];
  completed: boolean;
};

export type BinaryAstState = {
  coverage: number;
  moduleCount: number;
  modules: BinaryAstModuleSummary[];
  nodes: BinaryAstNodeSummary[];
  updatedAt: string;
  source: "compat" | "gateway";
};

export type BinaryAstDelta = {
  changeId: string;
  coverage: number;
  source: "compat" | "gateway";
  nodes: BinaryAstNodeSummary[];
  modulesTouched: string[];
  updatedAt: string;
};

export type BinaryRuntimePatch = {
  id: string;
  modulePath: string;
  symbolNames: string[];
  engine: "none" | "stub" | "native" | "quickjs" | "wasmtime";
  status: "applied" | "replaced";
  appliedAt: string;
};

export type BinaryRuntimeState = {
  runnable: boolean;
  engine: "none" | "stub" | "native" | "quickjs" | "wasmtime";
  availableFunctions: BinaryExecutionFunction[];
  patches: BinaryRuntimePatch[];
  updatedAt: string;
  lastRun?: BinaryExecutionRun | null;
};

export type BinaryLiveReliabilityBlocker = {
  code: string;
  severity: "info" | "warning" | "error";
  message: string;
};

export type BinaryLiveReliabilityState = {
  score: number;
  trend: "rising" | "falling" | "steady";
  warnings: string[];
  blockers: BinaryLiveReliabilityBlocker[];
  resolvedBlockers: string[];
  updatedAt: string;
  source: "compat" | "gateway";
};

export type BinarySnapshotSummary = {
  id: string;
  checkpointId?: string | null;
  parentSnapshotId?: string | null;
  phase: BinaryBuildPhase;
  label?: string;
  savedAt: string;
  source: "compat" | "gateway";
};

export type BinaryBuildStream = {
  enabled: boolean;
  transport: "sse" | "websocket";
  streamPath: string;
  eventsPath: string;
  controlPath: string;
  wsPath?: string;
  resumeToken?: string | null;
  streamSessionId?: string | null;
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
  liveReliability?: BinaryLiveReliabilityState | null;
  artifactState?: BinaryArtifactState | null;
  sourceGraph?: BinarySourceGraph | null;
  astState?: BinaryAstState | null;
  execution?: BinaryExecutionState | null;
  runtimeState?: BinaryRuntimeState | null;
  snapshot?: BinarySnapshotSummary | null;
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
  liveReliability?: BinaryLiveReliabilityState | null;
  artifactState?: BinaryArtifactState | null;
  sourceGraph?: BinarySourceGraph | null;
  astState?: BinaryAstState | null;
  execution?: BinaryExecutionState | null;
  runtimeState?: BinaryRuntimeState | null;
  checkpointId?: string | null;
  checkpoints?: BinaryBuildCheckpointSummary[];
  snapshots?: BinarySnapshotSummary[];
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
  | { id: string; buildId: string; timestamp: string; type: "token.delta"; data: { text: string; cursor: number; updatedAt: string; source: "compat" | "gateway" } }
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
  | { id: string; buildId: string; timestamp: string; type: "reliability.stream"; data: { reliability: BinaryLiveReliabilityState } }
  | { id: string; buildId: string; timestamp: string; type: "graph.updated"; data: { sourceGraph: BinarySourceGraph } }
  | { id: string; buildId: string; timestamp: string; type: "ast.delta"; data: { delta: BinaryAstDelta } }
  | { id: string; buildId: string; timestamp: string; type: "ast.state"; data: { astState: BinaryAstState } }
  | { id: string; buildId: string; timestamp: string; type: "execution.updated"; data: { execution: BinaryExecutionState } }
  | { id: string; buildId: string; timestamp: string; type: "runtime.state"; data: { runtime: BinaryRuntimeState } }
  | { id: string; buildId: string; timestamp: string; type: "patch.applied"; data: { patch: BinaryRuntimePatch; runtime: BinaryRuntimeState } }
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
  | { id: string; buildId: string; timestamp: string; type: "snapshot.saved"; data: { snapshot: BinarySnapshotSummary } }
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
  liveReliability: BinaryLiveReliabilityState | null;
  artifactState: BinaryArtifactState | null;
  sourceGraph: BinarySourceGraph | null;
  astState: BinaryAstState | null;
  execution: BinaryExecutionState | null;
  runtimeState: BinaryRuntimeState | null;
  checkpoints: BinaryBuildCheckpointSummary[];
  snapshots: BinarySnapshotSummary[];
  pendingRefinement: BinaryPendingRefinement | null;
  canCancel: boolean;
  lastAction: "generate" | "refine" | "branch" | "rewind" | "execute" | "validate" | "deploy" | null;
};

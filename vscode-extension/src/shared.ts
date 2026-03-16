export type Mode = "auto" | "plan" | "yolo";
export type RuntimeBackend = "playgroundApi" | "qwenCode";
export type IntentKind = "ask" | "explain" | "find" | "change";
export type ContextConfidence = "high" | "medium" | "low";
export type RuntimePhase =
  | "idle"
  | "radar"
  | "collecting_context"
  | "waiting_for_qwen"
  | "awaiting_approval"
  | "applying_result"
  | "saving_session"
  | "clarify"
  | "done"
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
  pendingToolCall?: PendingToolCall | null;
  toolTrace?: ToolTraceEntry[];
};

export type ChatMessage = {
  id: string;
  role: "user" | "assistant" | "system";
  content: string;
};

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
  status: "queued" | "running" | "completed" | "failed";
  intent: string;
  workspaceFingerprint: string;
  targetEnvironment: BinaryTargetEnvironment;
  logs: string[];
  manifest?: BinaryManifest | null;
  reliability?: BinaryValidationReport | null;
  artifact?: BinaryArtifactMetadata | null;
  publish?: BinaryPublishResult | null;
  errorMessage?: string | null;
  createdAt: string;
  updatedAt: string;
};

export type BinaryPanelState = {
  targetEnvironment: BinaryTargetEnvironment;
  activeBuild: BinaryBuildRecord | null;
  busy: boolean;
  lastAction: "generate" | "validate" | "deploy" | null;
};

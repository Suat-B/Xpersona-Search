export type AssistMode = "auto" | "plan" | "yolo" | "generate" | "debug";
export type HostedAssistMode = "auto" | "plan" | "yolo";

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
  | "get_workspace_memory"
  | (string & {});

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

export type PendingToolCall = {
  step: number;
  adapter: string;
  requiresClientExecution: boolean;
  toolCall: ToolCall;
  availableTools?: PlaygroundToolName[];
  createdAt: string;
};

export type LoopState = {
  protocol: string;
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

export type ValidationPlan = {
  scope: "none" | "targeted";
  checks: string[];
  touchedFiles: string[];
  reason: string;
};

export type AssistRunEnvelope = {
  sessionId?: string;
  traceId?: string;
  decision?: { mode: string; reason: string; confidence: number };
  plan?: unknown;
  actions?: unknown[];
  final?: string;
  validationPlan?: ValidationPlan;
  targetInference?: { path?: string; confidence?: number; source?: string };
  contextSelection?: {
    files?: Array<{ path: string; reason: string; score?: number }>;
    snippets?: number;
    usedCloudIndex?: boolean;
  };
  completionStatus?: "complete" | "incomplete";
  missingRequirements?: string[];
  modelAlias?: string;
  orchestrator?: "in_house" | "openhands";
  orchestratorVersion?: string | null;
  runId?: string;
  orchestrationProtocol?: string;
  adapter?: string;
  loopState?: LoopState | null;
  progressState?: ProgressState | null;
  objectiveState?: ObjectiveState | null;
  pendingToolCall?: PendingToolCall | null;
  toolTrace?: unknown[];
  reviewState?: Record<string, unknown> | null;
  receipt?: Record<string, unknown> | null;
};

export type ApiFailure = {
  success?: false;
  error?: string | { code?: string; message?: string };
  code?: string;
  message?: string;
  details?: unknown;
};

export type AuthHeadersInput = {
  apiKey?: string;
  bearer?: string;
};

export type BinaryHostSurface = "desktop" | "cli" | "vsix" | "unknown";

export type BinaryHostClientInfo = {
  surface: BinaryHostSurface;
  version?: string;
};

export type BinaryHostAuthStatus = {
  hasApiKey: boolean;
  maskedApiKey?: string | null;
  storageMode: "secure" | "file" | "none";
  configPath: string;
};

export type BinaryHostTrustGrant = {
  path: string;
  mutate: boolean;
  commands: "allow" | "prompt";
  network?: "allow" | "deny";
  elevated?: "allow" | "deny";
  grantedAt: string;
};

export type BinaryHostWorkspaceTrustMode =
  | "untrusted"
  | "trusted_read_only"
  | "trusted_full_access"
  | "trusted_prompt_commands";

export type BinaryHostRunStatus =
  | "queued"
  | "running"
  | "paused"
  | "completed"
  | "failed"
  | "cancelled"
  | "takeover_required";

export type BinaryHostRunControlAction =
  | "pause"
  | "resume"
  | "cancel"
  | "repair"
  | "takeover"
  | "retry_last_turn";

export type BinaryHostBudgetState = {
  maxSteps?: number;
  usedSteps: number;
  remainingSteps?: number;
  maxMutations?: number;
  usedMutations: number;
  remainingMutations?: number;
  exhausted: boolean;
  reason?: string;
};

export type BinaryHostCheckpointState = {
  count: number;
  lastCheckpointAt?: string;
  lastCheckpointSummary?: string;
};

export type BinaryHostLeaseState = {
  leaseId: string;
  workerId: string;
  startedAt: string;
  heartbeatAt: string;
  lastToolAt?: string;
};

export type BinaryHostRunControlEntry = {
  action: BinaryHostRunControlAction;
  note?: string | null;
  at: string;
};

export type BinaryHostPreferences = {
  baseUrl: string;
  trustedWorkspaces: BinaryHostTrustGrant[];
  recentSessions: Array<{ sessionId: string; runId?: string; updatedAt: string; workspaceRoot?: string }>;
  artifactHistory: Array<{ id: string; label: string; url?: string; createdAt: string }>;
  preferredTransport: "host" | "direct";
};

export type BinaryHostAssistRequest = {
  task: string;
  mode: AssistMode;
  model: string;
  historySessionId?: string;
  workspaceRoot?: string;
  detach?: boolean;
  client?: BinaryHostClientInfo;
};

export type BinaryHostHealth = {
  ok: true;
  service: "binary-host";
  version: string;
  transport: "localhost-http";
  secureStorageAvailable: boolean;
};

export type BinaryHostRunRecord = {
  id: string;
  status: BinaryHostRunStatus;
  createdAt: string;
  updatedAt: string;
  traceId: string;
  sessionId?: string;
  runId?: string;
  leaseId?: string;
  heartbeatAt?: string;
  lastToolAt?: string;
  resumeToken: string;
  workspaceRoot?: string;
  workspaceTrustMode: BinaryHostWorkspaceTrustMode;
  client: BinaryHostClientInfo;
  request: BinaryHostAssistRequest;
  budgetState?: BinaryHostBudgetState | null;
  checkpointState?: BinaryHostCheckpointState | null;
  leaseState?: BinaryHostLeaseState | null;
  lastPendingToolCallSignature?: string;
  repeatedPendingSignatureCount?: number;
  observationOnlyStreak?: number;
  takeoverReason?: string;
  finalEnvelope?: AssistRunEnvelope;
  error?: string;
  controlHistory: BinaryHostRunControlEntry[];
  toolResults: ToolResult[];
  checkpoints: Array<{ capturedAt: string; summary: string; step?: number }>;
  events: Array<{
    seq: number;
    capturedAt: string;
    event: SseEvent;
  }>;
};

export type BinaryHostRunSummary = Pick<
  BinaryHostRunRecord,
  | "id"
  | "status"
  | "createdAt"
  | "updatedAt"
  | "traceId"
  | "sessionId"
  | "runId"
  | "leaseId"
  | "heartbeatAt"
  | "lastToolAt"
  | "resumeToken"
  | "workspaceRoot"
  | "workspaceTrustMode"
  | "client"
  | "request"
  | "budgetState"
  | "checkpointState"
  | "takeoverReason"
  | "error"
> & {
  eventCount: number;
};

export type BinaryHostRunEventsResponse = {
  run: BinaryHostRunSummary;
  events: Array<{
    seq: number;
    capturedAt: string;
    event: SseEvent;
  }>;
  done: boolean;
};

export type SseEvent = {
  event?: string;
  data?: unknown;
  [key: string]: unknown;
};

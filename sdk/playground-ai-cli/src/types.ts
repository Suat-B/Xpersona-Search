export type AssistMode = "auto" | "plan" | "yolo" | "generate" | "debug";
export type CliTransport = "auto" | "host" | "direct";

export type BillingCycle = "monthly" | "yearly";
export type PlanTier = "starter" | "builder" | "studio";

export type CliConfig = {
  baseUrl: string;
  localHostUrl?: string;
  apiKey?: string;
  browserAuth?: {
    accessToken?: string;
    refreshToken?: string;
    accessTokenExpiresAt?: string;
    email?: string;
  };
  mode?: AssistMode;
  model?: string;
  reasoning?: "low" | "medium" | "high" | "max";
  includeIdeContext?: boolean;
  transport?: CliTransport;
  tomEnabled?: boolean;
};

export type ApiSuccess<T> = {
  success: true;
  data: T;
  requestId?: string;
};

export type ApiFailure = {
  success?: false;
  error?: string | { code?: string; message?: string };
  code?: string;
  message?: string;
  details?: unknown;
};

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
  | "stat_binary"
  | "read_binary_chunk"
  | "search_binary"
  | "analyze_binary"
  | "patch_binary"
  | "write_binary_file"
  | "hash_binary"
  | (string & {});

export type BinaryRiskClass = "low" | "high" | "critical";
export type BinaryArtifactKind =
  | "regular_file"
  | "executable"
  | "shared_library"
  | "archive"
  | "document"
  | "image"
  | "disk_image"
  | "firmware"
  | "raw_device"
  | "system_file"
  | "unknown";

export type BinaryTargetDescriptor = {
  path: string;
  absolutePath: string;
  scope: "workspace" | "machine";
  exists: boolean;
  isRegularFile: boolean;
  isExecutable: boolean;
  mime: string;
  size: number | null;
  sha256: string | null;
  formatFamily: string;
  artifactKind: BinaryArtifactKind;
  riskClass: BinaryRiskClass;
};

export type BinaryChunkResult = {
  path: string;
  absolutePath: string;
  offset: number;
  length: number;
  bytesBase64: string;
  hexPreview: string;
  asciiPreview: string;
  truncated: boolean;
  sha256: string;
  mime: string;
  isExecutable: boolean;
  size: number | null;
  riskClass: BinaryRiskClass;
  artifactKind: BinaryArtifactKind;
};

export type BinaryAnalysisResult = {
  path: string;
  absolutePath: string;
  formatFamily: string;
  mime: string;
  magicBytes: string;
  entropy: number;
  stringsSample: string[];
  signatureInfo: {
    status: "not_checked";
    reason: string;
  };
  riskClass: BinaryRiskClass;
  artifactKind: BinaryArtifactKind;
  size: number | null;
  isExecutable: boolean;
  sha256: string | null;
};

export type BinaryPatchPlan = {
  path: string;
  absolutePath: string;
  operations: Array<{
    offset: number;
    deleteLength: number;
    insertLength: number;
  }>;
  expectedPreHash: string;
  predictedPostHash: string;
  riskClass: BinaryRiskClass;
};

export type BinaryMutationReceipt = {
  path: string;
  absolutePath: string;
  beforeSha256: string | null;
  afterSha256: string;
  snapshotPath: string | null;
  approved: boolean;
  riskClass: BinaryRiskClass;
  artifactKind: BinaryArtifactKind;
  changedByteRanges: Array<{
    offset: number;
    length: number;
  }>;
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

export type PendingToolCall = {
  step: number;
  adapter: string;
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

export type AssistRunEnvelope = {
  sessionId?: string;
  traceId?: string;
  runtimeTarget?: "local_native" | "sandbox" | "remote";
  toolBackend?: "openhands_native" | "binary_host";
  decision?: { mode: string; reason: string; confidence: number };
  plan?: unknown;
  actions?: unknown[];
  final?: string;
  validationPlan?: ValidationPlan;
  targetInference?: { path?: string; confidence?: number; source?: string };
  contextSelection?: { files?: Array<{ path: string; reason: string; score?: number }>; snippets?: number; usedCloudIndex?: boolean };
  completionStatus?: "complete" | "incomplete";
  missingRequirements?: string[];
  modelAlias?: string;
  orchestrator?: "in_house" | "openhands";
  orchestratorVersion?: string | null;
  approvalState?: "autonomous" | "required" | "granted" | "denied" | "not_required";
  worldContextUsed?: { provided: boolean; tier?: string | null };
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
  leaseId?: string;
  heartbeatAt?: string;
  lastToolAt?: string;
  budgetState?: Record<string, unknown> | null;
  checkpointState?: Record<string, unknown> | null;
  resumeToken?: string;
  workspaceTrustMode?: string;
};

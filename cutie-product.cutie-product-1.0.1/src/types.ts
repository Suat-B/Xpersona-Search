import type { HostedAuthState } from "@xpersona/vscode-core";
import type { BinaryPanelState } from "./binary-types";

export type CutieToolName =
  | "list_files"
  | "read_file"
  | "search_workspace"
  | "get_diagnostics"
  | "git_status"
  | "git_diff"
  | "desktop_capture_screen"
  | "desktop_get_active_window"
  | "desktop_list_windows"
  | "create_checkpoint"
  /** Legacy receipt/tool name retained for older sessions; not exposed in cutie_tools_v2. */
  | "edit_file"
  | "patch_file"
  | "write_file"
  | "mkdir"
  | "run_command"
  | "desktop_open_app"
  | "desktop_open_url"
  | "desktop_focus_window"
  | "desktop_click"
  | "desktop_type"
  | "desktop_keypress"
  | "desktop_scroll"
  | "desktop_wait";

export type CutieToolKind = "observe" | "mutate" | "command";
export type CutieToolDomain = "workspace" | "desktop";
export type CutieTaskGoal = "conversation" | "code_change" | "workspace_investigation" | "desktop_action";
export type CutieEscalationState = "none" | "needs_guidance";
export type CutieAutonomyMode = "direct" | "objective";
export type CutieStrategyPhase = "inspect" | "mutate" | "verify" | "repair" | "fallback" | "blocked";
export type CutieProgressConfidence = "low" | "medium" | "high";
export type CutieBlockerCategory = "planning" | "validation" | "tooling" | "environment" | "impossible";
export type CutieRetryStrategy =
  | "none"
  | "force_mutation"
  | "alternate_mutation"
  | "refresh_state"
  | "full_rewrite"
  | "command_repair"
  | "verification_repair"
  | "fallback_strategy";

export type CutieObjectiveStatus = "pending" | "done" | "blocked";

export type CutieRunObjective = {
  id: string;
  text: string;
  status: CutieObjectiveStatus;
  note?: string;
};

export type CutieObjectivesPhase = "off" | "decomposing" | "active" | "completed";

export type CutieToolCall = {
  id: string;
  name: CutieToolName;
  arguments: Record<string, unknown>;
  summary?: string;
};

export type CutieToolInputSchema = Record<string, unknown>;

export type CutieProtocolToolDefinition = {
  name: CutieToolName;
  kind: CutieToolKind;
  domain: CutieToolDomain;
  description: string;
  inputSchema: CutieToolInputSchema;
};

export type CutieToolReceipt = {
  id: string;
  step: number;
  toolName: CutieToolName;
  kind: CutieToolKind;
  domain: CutieToolDomain;
  status: "completed" | "blocked" | "failed";
  summary: string;
  startedAt: string;
  finishedAt: string;
  data?: Record<string, unknown>;
  error?: string;
};

export type CutieCheckpoint = {
  id: string;
  createdAt: string;
  reason?: string;
  trackedPaths: string[];
};

/** Live bubble while a portable bundle streams (mirrors Binary IDE live assistant). */
export type CutieBinaryLiveBubbleState = {
  mode: "shell" | "answer" | "build";
  status: "pending" | "streaming" | "done" | "failed" | "canceled";
  phase: string;
  transport: "local" | "binary";
  progress?: number;
  buildId?: string;
  latestActivity?: string;
  latestLog?: string;
  latestFile?: string;
  startedAt: string;
  updatedAt: string;
};

export type CutieBinaryLiveBubbleView = {
  messageId: string;
  content: string;
  createdAt: string;
  live: CutieBinaryLiveBubbleState;
};

export type CutieChatMessage = {
  id: string;
  role: "user" | "assistant" | "system";
  content: string;
  createdAt: string;
  runId?: string;
  presentation?: "plain" | "live_binary";
  live?: CutieBinaryLiveBubbleState;
};

export type CutieMentionSuggestion = {
  kind: "file" | "window";
  label: string;
  insertText: string;
  detail?: string;
};

export type DesktopDisplay = {
  id: string;
  label: string;
  width: number;
  height: number;
  isPrimary?: boolean;
  scaleFactor?: number;
  left?: number;
  top?: number;
};

export type DesktopWindow = {
  id?: string;
  title?: string;
  app?: string;
  displayId?: string;
};

export type DesktopSnapshotRef = {
  snapshotId: string;
  displayId?: string;
  width: number;
  height: number;
  mimeType: string;
  capturedAt: string;
  filePath?: string;
  activeWindow?: DesktopWindow | null;
};

export type DesktopContextState = {
  platform: string;
  displays: DesktopDisplay[];
  activeWindow?: DesktopWindow | null;
  recentSnapshots: DesktopSnapshotRef[];
  capabilities: {
    windowsSupported: boolean;
    experimentalAdaptersEnabled: boolean;
  };
};

export type CutieRunState = {
  id: string;
  sessionId: string;
  status: "idle" | "running" | "needs_guidance" | "completed" | "failed" | "canceled";
  phase:
    | "idle"
    | "collecting_context"
    | "planning"
    | "repairing"
    | "executing_tool"
    | "saving_session"
    | "needs_guidance"
    | "completed"
    | "failed"
    | "canceled";
  goal: CutieTaskGoal;
  goalSatisfied: boolean;
  lastMeaningfulProgressAtStep?: number;
  lastMeaningfulProgressSummary?: string;
  repairAttemptCount: number;
  escalationState: CutieEscalationState;
  stuckReason?: string;
  suggestedNextAction?: string;
  stepCount: number;
  maxSteps: number;
  workspaceMutationCount: number;
  maxWorkspaceMutations: number;
  desktopMutationCount: number;
  maxDesktopMutations: number;
  lastToolName?: CutieToolName;
  startedAt: string;
  endedAt?: string;
  error?: string;
  receipts: CutieToolReceipt[];
  checkpoint?: CutieCheckpoint | null;
  repeatedCallCount: number;
  /** Strict checklist: model must mark each done or blocked before a final answer is accepted. */
  objectives?: CutieRunObjective[];
  objectivesPhase?: CutieObjectivesPhase;
  objectiveRepairCount?: number;
  autonomyMode?: CutieAutonomyMode;
  preferredTargetPath?: string;
  strategyPhase?: CutieStrategyPhase;
  progressConfidence?: CutieProgressConfidence;
  lastVerifiedOutcome?: string;
  blockerCategory?: CutieBlockerCategory;
  retryStrategy?: CutieRetryStrategy;
  loopPreventionTrigger?: string;
  deadEndMemory?: string[];
};

export type CutieSessionRecord = {
  id: string;
  workspaceHash: string;
  title: string;
  createdAt: string;
  updatedAt: string;
  messages: CutieChatMessage[];
  runs: CutieRunState[];
  snapshots: DesktopSnapshotRef[];
};

export type CutieSessionSummary = {
  id: string;
  title: string;
  updatedAt: string;
  messageCount: number;
  lastStatus: CutieRunState["status"] | "idle";
};

/** Unified diff patch shown inline in the chat webview after patch_file / write_file. */
export type CutieChatDiffItem = {
  id: string;
  createdAt: string;
  runId?: string | null;
  relativePath: string;
  toolName: "write_file" | "patch_file" | "edit_file";
  /** Unified diff text (may be truncated for very large files). */
  patch: string;
};

export type CutieViewState = {
  authState: HostedAuthState;
  sessions: CutieSessionSummary[];
  activeSessionId: string | null;
  messages: CutieChatMessage[];
  /** Workspace edits in the active session, merged into the chat timeline by `createdAt`. */
  chatDiffs: CutieChatDiffItem[];
  /** Live per-run action transcript shown while Cutie is actively working. */
  liveActionLog: string[];
  status: string;
  running: boolean;
  activeRun: CutieRunState | null;
  desktop: DesktopContextState;
  progress: CutieProgressViewModel | null;
  /** Portable starter bundle (Binary IDE API) panel state. */
  binary: BinaryPanelState;
  binaryActivity: string[];
  /** Ephemeral streaming assistant row for bundle generation (not persisted until resolved). */
  binaryLiveBubble: CutieBinaryLiveBubbleView | null;
};

export type CutieProgressViewModel = {
  goal: CutieTaskGoal;
  goalLabel: string;
  phaseLabel: string;
  pursuingLabel: string;
  lastMeaningfulProgressSummary?: string;
  repairLabel?: string;
  escalationMessage?: string;
  suggestedNextAction?: string;
  goalSatisfied: boolean;
  escalationState: CutieEscalationState;
};

export type CutieModelMessage = {
  role: "system" | "user" | "assistant";
  content: string;
};

export type CutieStructuredFinal = {
  type: "final";
  final: string;
  /** When task objectives are active, must include one entry per objective id with status done or blocked. */
  objectives?: Array<{ id: string; status: "done" | "blocked"; note?: string }>;
};

export type CutieStructuredToolCall = {
  type: "tool_call";
  tool_call: {
    name: CutieToolName;
    arguments: Record<string, unknown>;
    summary?: string;
  };
};

/** Multiple tools in one planning response (observe tools first, at most one mutation last). */
export type CutieStructuredToolCalls = {
  type: "tool_calls";
  tool_calls: Array<{
    name: CutieToolName;
    arguments: Record<string, unknown>;
    summary?: string;
  }>;
};

export type CutieStructuredResponse = CutieStructuredFinal | CutieStructuredToolCall | CutieStructuredToolCalls;

export type CutieProtocolFinalPayload = {
  type: "final";
  text: string;
  objectives?: Array<{ id: string; status: "done" | "blocked"; note?: string }>;
};

export type CutieProtocolToolBatchPayload = {
  type: "tool_batch";
  toolCalls: Array<{
    id: string;
    name: CutieToolName;
    arguments: Record<string, unknown>;
    summary?: string;
  }>;
};

export type CutieProtocolResponsePayload = CutieProtocolFinalPayload | CutieProtocolToolBatchPayload;

export type CutieModelTurnResult = {
  response: CutieStructuredResponse;
  assistantText: string;
  suppressedAssistantArtifact?: string;
  usage?: Record<string, unknown> | null;
  model?: string;
};

export type CutieToolResult = {
  toolName: CutieToolName;
  kind: CutieToolKind;
  domain: CutieToolDomain;
  ok: boolean;
  blocked?: boolean;
  summary: string;
  data?: Record<string, unknown>;
  error?: string;
  checkpoint?: CutieCheckpoint | null;
  snapshot?: DesktopSnapshotRef | null;
};

export type CutieWorkspaceMutationInfo = {
  sessionId: string;
  runId: string;
  relativePath: string;
  toolName: "write_file" | "patch_file" | "edit_file";
  /** Snapshot immediately before this mutation (empty string if the file did not exist). */
  previousContent: string;
  /** Snapshot immediately after this mutation when available (can be empty for an empty file). */
  nextContent?: string;
  revisionId?: string;
};

export type CutieRuntimeCallbacks = {
  onSessionChanged?: (session: CutieSessionRecord) => void | Promise<void>;
  onStatusChanged?: (status: string, run: CutieRunState | null) => void | Promise<void>;
  onAssistantDelta?: (delta: string, accumulated: string) => void | Promise<void>;
  onSuppressedAssistantArtifact?: (artifact: string) => void | Promise<void>;
  /** Fired after a successful workspace file write or edit so the host can open the file and surface UX cues. */
  onWorkspaceFileMutated?: (info: CutieWorkspaceMutationInfo) => void | Promise<void>;
};

import type { HostedAuthState } from "@xpersona/vscode-core";

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
  | "edit_file"
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

export type CutieToolCall = {
  id: string;
  name: CutieToolName;
  arguments: Record<string, unknown>;
  summary?: string;
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

export type CutieChatMessage = {
  id: string;
  role: "user" | "assistant" | "system";
  content: string;
  createdAt: string;
  runId?: string;
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

export type CutieViewState = {
  authState: HostedAuthState;
  sessions: CutieSessionSummary[];
  activeSessionId: string | null;
  messages: CutieChatMessage[];
  status: string;
  running: boolean;
  activeRun: CutieRunState | null;
  desktop: DesktopContextState;
  progress: CutieProgressViewModel | null;
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
};

export type CutieStructuredToolCall = {
  type: "tool_call";
  tool_call: {
    name: CutieToolName;
    arguments: Record<string, unknown>;
    summary?: string;
  };
};

export type CutieStructuredResponse = CutieStructuredFinal | CutieStructuredToolCall;

export type CutieModelTurnResult = {
  rawText: string;
  finalText: string;
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
  relativePath: string;
  toolName: "write_file" | "edit_file";
  /** Snapshot immediately before this mutation (empty string if the file did not exist). */
  previousContent: string;
};

export type CutieRuntimeCallbacks = {
  onSessionChanged?: (session: CutieSessionRecord) => void | Promise<void>;
  onStatusChanged?: (status: string, run: CutieRunState | null) => void | Promise<void>;
  onAssistantDelta?: (delta: string, accumulated: string) => void | Promise<void>;
  /** Fired after a successful workspace file write or edit so the host can open the file and surface UX cues. */
  onWorkspaceFileMutated?: (info: CutieWorkspaceMutationInfo) => void | Promise<void>;
};

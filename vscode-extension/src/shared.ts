export type Mode = "auto" | "plan" | "yolo";

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
};

export type ChatMessage = {
  id: string;
  role: "user" | "assistant" | "system";
  content: string;
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
  selectedFiles: string[];
  diagnostics: string[];
  snippets: Array<{
    path: string;
    source: "cloud" | "local_fallback";
    reason: string;
  }>;
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

export type AuthState = {
  kind: "none" | "apiKey" | "browser";
  label: string;
  email?: string;
};

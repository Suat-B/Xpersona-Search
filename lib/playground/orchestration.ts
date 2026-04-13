import { checkRateLimits, getUserPlan } from "@/lib/hf-router/rate-limit";
import { hasUnlimitedPlaygroundAccess } from "@/lib/playground/auth";
import type {
  LoopStateContract,
  ObjectiveStateContract,
  OrchestrationProtocol,
  PendingToolCallContract,
  PlaygroundToolName,
  ProgressStateContract,
  ToolTraceEntryContract,
  UserInputOptionContract,
  UserInputQuestionContract,
  UserInputRequestContract,
} from "@/lib/playground/contracts";
import {
  DEFAULT_PLAYGROUND_MODEL_ALIAS,
  PLAYGROUND_CONTRACT_VERSION,
  resolvePlaygroundModelToken,
  resolvePlaygroundModelSelection,
  type PlaygroundUserConnectedModelCandidate,
  type PlaygroundModelProvider,
} from "@/lib/playground/model-registry";
import {
  resolveChatModelAccess,
  type PlaygroundChatModelSource,
  type PlaygroundInteractionKind,
} from "@/lib/playground/byom";
import {
  buildAssistAgentArtifacts,
  type AssistContextTrace,
  type AssistDelegateRun,
  type AssistExecutionLane,
  type AssistExecutionReceipt,
  type AssistReviewState,
  type AssistRunCheckpoint,
  type AssistTaskGraphStage,
  type AssistMemoryWrite,
} from "@/lib/playground/agent-os";
import { looksLikeShellCommand, validateExecuteAction, type ExecuteAction } from "@/lib/playground/policy";

export type AssistMode = "auto" | "plan" | "yolo";

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
  desktop?: {
    platform?: string;
    displays?: Array<{
      id: string;
      label?: string;
      width: number;
      height: number;
      scaleFactor?: number;
      isPrimary?: boolean;
    }>;
    activeWindow?: {
      id?: string;
      title?: string;
      app?: string;
      displayId?: string;
    };
    visibleWindows?: Array<{
      id?: string;
      title?: string;
      app?: string;
      displayId?: string;
    }>;
    recentSnapshots?: Array<{
      snapshotId: string;
      displayId?: string;
      width?: number;
      height?: number;
      mimeType?: string;
      capturedAt?: string;
    }>;
    discoveredApps?: Array<{
      id: string;
      name: string;
      aliases?: string[];
      source?: string;
    }>;
  };
  browser?: {
    mode?: "unavailable" | "attached" | "managed" | "profile";
    browserName?: string;
    activePage?: {
      id: string;
      title?: string;
      url?: string;
      origin?: string;
      browserName?: string;
    };
    openPages?: Array<{
      id: string;
      title?: string;
      url?: string;
      origin?: string;
      browserName?: string;
    }>;
    recentSnapshots?: Array<{
      snapshotId: string;
      pageId?: string;
      url?: string;
      title?: string;
      capturedAt?: string;
    }>;
    visibleInteractiveElements?: Array<{
      id: string;
      selector: string;
      label: string;
      role?: string;
      tagName?: string;
    }>;
    recentNetworkActivity?: Array<{
      at?: string;
      phase?: "request" | "response" | "failed";
      url: string;
      method?: string;
      status?: number;
      resourceType?: string;
      errorText?: string;
    }>;
    recentConsoleMessages?: Array<{
      at?: string;
      level?: string;
      text: string;
    }>;
    sessionHint?: {
      attachedToExistingSession?: boolean;
      authenticatedLikely?: boolean;
    };
  };
  worldModel?: {
    graphVersion?: number;
    sliceId?: string;
    summary?: string;
    activeContext?: {
      activeWindow?: string;
      activePage?: string;
      activeWorkspace?: string;
      activeRepo?: string;
      browserMode?: string;
      focusLeaseActive?: boolean;
    };
    recentChanges?: Array<{
      id?: string;
      at?: string;
      kind?: string;
      summary: string;
    }>;
    affordanceSummary?: {
      actionsAvailable?: string[];
      backgroundSafe?: string[];
      visibleRequired?: string[];
      blocked?: string[];
      highConfidence?: string[];
    };
    routeRecommendations?: Array<{
      id: string;
      kind: string;
      score: number;
      reason: string;
      informedBy?: string[];
      preferred?: boolean;
    }>;
    environmentFreshness?: {
      lastUpdatedAt?: string;
      stale?: boolean;
    };
    machineRoutineIds?: string[];
  };
  repoModel?: {
    contextVersion?: number;
    workspaceRoot?: string;
    summary?: string;
    stack?: "node_js_ts" | "python" | "generic";
    primaryValidationCommand?: string;
    projectRoots?: string[];
    hotspots?: string[];
    likelyEntrypoints?: string[];
    likelyTests?: string[];
    symbolIndex?: Array<{
      name: string;
      kind: string;
      path: string;
      line?: number;
      exported?: boolean;
    }>;
    routeHints?: {
      preferredRoute?: string;
      reason?: string;
      informedBy?: string[];
    };
    memory?: {
      preferredValidationCommand?: string;
      preferredBranchPrefix?: string;
      knownRepairPatterns?: string[];
      proofTemplates?: string[];
    };
  };
  verificationPlan?: {
    status?: "pending" | "running" | "passed" | "failed";
    primaryCommand?: string;
    checks?: Array<{
      id: string;
      label: string;
      command?: string;
      kind?: "test" | "lint" | "typecheck" | "build" | "verify";
      status?: "pending" | "running" | "passed" | "failed";
      reason?: string;
    }>;
    receipts?: string[];
    reason?: string;
  };
};

export type AssistRetrievalHints = {
  mentionedPaths?: string[];
  candidateSymbols?: string[];
  candidateErrors?: string[];
  preferredTargetPath?: string;
  recentTouchedPaths?: string[];
};

export type AssistConversationTurn = {
  role: "user" | "assistant";
  content: string;
};

export type AssistRequest = {
  mode: AssistMode;
  task: string;
  stream?: boolean;
  speedProfile?: "fast" | "balanced" | "thorough";
  startupPhase?: "fast_start" | "context_enrichment" | "full_run";
  routePolicy?: {
    turnBudgetMs?: number;
    maxIterations?: number;
    stallTimeoutMs?: number;
    missionFirstBrowser?: boolean;
    toolConcurrencyLimit?: number;
    requireConfirmation?: boolean;
    enableContextCondenser?: boolean;
    condenserMaxSize?: number;
    condenserKeepFirst?: number;
  };
  interactionKind?: PlaygroundInteractionKind;
  chatModelSource?: PlaygroundChatModelSource;
  orchestratorModelSource?: "platform_owned" | "user_connected";
  fallbackToPlatformModel?: boolean;
  orchestrationProtocol?: OrchestrationProtocol;
  clientCapabilities?: {
    toolLoop?: boolean;
    supportedTools?: PlaygroundToolName[];
    autoExecute?: boolean;
    supportsNativeToolResults?: boolean;
  };
  tom?: {
    enabled?: boolean;
  };
  mcp?: {
    mcpServers: Record<string, Record<string, unknown>>;
  };
  userConnectedModels?: PlaygroundUserConnectedModelCandidate[];
  historySessionId?: string;
  context?: AssistContext;
  retrievalHints?: AssistRetrievalHints;
  clientTrace?: {
    extensionVersion: string;
    workspaceHash: string;
    maxToolSteps?: number;
    maxWorkspaceMutations?: number;
  };
};

export type AssistRuntimeInput = AssistRequest & {
  conversationHistory?: AssistConversationTurn[];
  maxTokens?: number;
  model?: string;
};

export type AssistPlan = {
  objective: string;
  files: string[];
  steps: string[];
  acceptanceTests: string[];
  risks: string[];
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

export type AssistProgressState = ProgressStateContract;
export type AssistObjectiveState = ObjectiveStateContract;
export type AssistAutonomyLane =
  | "repo_scaffold"
  | "single_file_edit"
  | "multi_file_feature_delivery"
  | "validation_repair"
  | "git_completion"
  | "browser_task"
  | "machine_control"
  | "unknown";
export type AssistStackSpecializer = "node_js_ts" | "python" | "generic";
export type AssistCompletionChecklistItem = {
  id: string;
  label: string;
  category: "grounding" | "implementation" | "validation" | "closeout" | "summary";
  status: "pending" | "completed" | "blocked";
  detail?: string;
};
export type AssistClosurePhase =
  | "grounding"
  | "implementation"
  | "verification"
  | "closeout"
  | "final_summary"
  | "complete"
  | "blocked";

export type AssistValidationPlan = {
  scope: "none" | "targeted";
  checks: string[];
  touchedFiles: string[];
  reason: string;
};

export type AssistUserInputOption = UserInputOptionContract;
export type AssistUserInputQuestion = UserInputQuestionContract;
export type AssistUserInputRequest = UserInputRequestContract;

export type AssistIntent = {
  type: "code_edit" | "command_run" | "plan" | "unknown";
  confidence: number;
  delta: number;
  clarified: boolean;
};

export type AssistAutonomyDecision = {
  mode: "no_actions" | "preview_only" | "auto_apply_only" | "auto_apply_and_validate";
  autoApplyEdits: boolean;
  autoRunValidation: boolean;
  confidence: number;
  thresholds: { autoApply: number; autoValidate: number };
  rationale: string;
};

export type AssistModelMetadata = {
  contractVersion: string;
  adapter: string;
  modelRequested: string;
  modelRequestedAlias: string;
  modelResolved: string;
  modelResolvedAlias: string;
  providerResolved: PlaygroundModelProvider;
  capabilities: Record<string, unknown>;
  certification: string;
  chatModelSource?: PlaygroundChatModelSource;
  chatModelAlias?: string;
  chatProvider?: PlaygroundModelProvider;
  orchestratorModelSource?: "platform_owned" | "user_connected";
  orchestratorModelAlias?: string | null;
  orchestratorProvider?: PlaygroundModelProvider | null;
  fallbackApplied?: boolean;
};

export type AssistToolState = {
  strategy: "standard" | "max_agentic";
  route: "native_tools" | "text_actions" | "deterministic_synthesis";
  adapter: string;
  actionSource: "structured_json" | "deterministic_synthesis";
  recoveryStage: "none" | "repair" | "fallback";
  commandPolicyResolved: "run_until_done" | "safe_default";
  attempts: Array<Record<string, unknown>>;
  lastFailureCategory: null | "schema_invalid" | "validation_failed" | "local_apply_failed";
};

export type AssistInfluence = {
  files: string[];
  snippets: number;
};

export type AssistResult = {
  decision: { mode: AssistMode; reason: string; confidence: number };
  intent: AssistIntent;
  reasonCodes: string[];
  autonomyDecision: AssistAutonomyDecision;
  plan: AssistPlan | null;
  edits: Array<{ path: string; patch?: string; diff?: string }>;
  commands: string[];
  actions: ExecuteAction[];
  final: string;
  logs: string[];
  modelMetadata: AssistModelMetadata;
  confidence: number;
  risk: { blastRadius: "low" | "medium" | "high"; rollbackComplexity: number };
  influence: AssistInfluence;
  validationPlan: AssistValidationPlan;
  targetInference: AssistTargetInference;
  contextSelection: AssistContextSelection;
  toolState: AssistToolState;
  nextBestActions: string[];
  repromptStage: "none" | "repair" | "fallback";
  actionability: {
    summary: "valid_actions" | "clarification_needed" | "blocked_by_safety";
    reason: string;
  };
  completionStatus: "complete" | "incomplete";
  missingRequirements: string[];
  userInputRequest?: AssistUserInputRequest;
  progressState: AssistProgressState;
  objectiveState: AssistObjectiveState;
  lane: AssistExecutionLane;
  taskGraph: AssistTaskGraphStage[];
  checkpoint: AssistRunCheckpoint;
  receipt: AssistExecutionReceipt;
  contextTrace: AssistContextTrace;
  delegateRuns: AssistDelegateRun[];
  memoryWrites: AssistMemoryWrite[];
  reviewState: AssistReviewState;
  orchestrationProtocol?: OrchestrationProtocol;
  orchestrator?: "in_house" | "openhands";
  orchestratorVersion?: string | null;
  runId?: string;
  modelCandidate?: Record<string, unknown> | null;
  fallbackAttempt?: number;
  failureReason?: string | null;
  persistenceDir?: string | null;
  conversationId?: string | null;
  fallbackTrail?: Array<Record<string, unknown>>;
  loopState?: LoopStateContract | null;
  pendingToolCall?: PendingToolCallContract | null;
  toolTrace?: ToolTraceEntryContract[];
  adapter?: "native_tools" | "text_actions" | "deterministic_batch";
  closureSummary?: string;
  unfinishedChecklistItems?: string[];
  lastMeaningfulProof?: string;
  whyBinaryIsBlocked?: string;
};

type ProviderChatResponse = {
  choices?: Array<{
    message?: {
      content?: string;
    };
  }>;
};

type ParsedModelOutput = {
  final: string;
  plan: AssistPlan | null;
  actions: ExecuteAction[];
  userInputRequest: AssistUserInputRequest | null;
};

const HF_ROUTER_BASE_URL = "https://router.huggingface.co/v1";
const DEFAULT_MAX_TOKENS = 1_800;

function normalizeHfRouterModelId(model: string): string {
  const raw = String(model || "").trim();
  if (!raw) return "";
  // HF Router uses OpenAI-compatible APIs; strip local routing suffixes like ":fastest".
  return raw.includes(":") ? raw.split(":")[0].trim() : raw;
}

function coerceHfRouterMaxTokens(input: unknown, fallback: number): number {
  const value = typeof input === "number" ? input : Number(input);
  const base = Number.isFinite(value) ? Math.floor(value) : fallback;
  return Math.max(256, Math.min(base, 4_096));
}

function compactWhitespace(value: string): string {
  return String(value || "").replace(/\s+/g, " ").trim();
}

function sanitizeRelativePath(value: string | null | undefined): string | null {
  const normalized = String(value || "")
    .trim()
    .replace(/\\/g, "/")
    .replace(/^@+/, "")
    .replace(/^\.\/+/, "")
    .replace(/^\/+/, "");
  if (!normalized || normalized.includes("..") || /^[a-z]:\//i.test(normalized)) return null;
  return normalized;
}

function extractRequestedProjectRoot(task: string): string | null {
  const patterns = [
    /\bproject folder named\s+["'`]?([A-Za-z0-9._/-]+)["'`]?/i,
    /\bfolder named\s+["'`]?([A-Za-z0-9._/-]+)["'`]?/i,
    /\bfolder called\s+["'`]?([A-Za-z0-9._/-]+)["'`]?/i,
    /\bdirectory named\s+["'`]?([A-Za-z0-9._/-]+)["'`]?/i,
    /\bdirectory called\s+["'`]?([A-Za-z0-9._/-]+)["'`]?/i,
  ];
  for (const pattern of patterns) {
    const match = pattern.exec(task);
    const candidate = sanitizeRelativePath(match?.[1] || "");
    if (candidate && !candidate.includes("/")) return candidate;
  }
  return null;
}

function anchorPathToProjectRoot(pathValue: string | null | undefined, projectRoot: string | null): string | null {
  const normalized = sanitizeRelativePath(pathValue);
  if (!normalized) return null;
  if (!projectRoot || normalized === projectRoot || normalized.startsWith(`${projectRoot}/`)) return normalized;
  return `${projectRoot}/${normalized}`;
}

function detectLanguageFromPath(filePath: string | undefined): "ts" | "js" | "python" | "docs" | "other" {
  const normalized = String(filePath || "").toLowerCase();
  if (/\.(ts|tsx)$/.test(normalized)) return "ts";
  if (/\.(js|jsx)$/.test(normalized)) return "js";
  if (/\.py$/.test(normalized)) return "python";
  if (/\.(md|mdx|txt)$/.test(normalized)) return "docs";
  return "other";
}

function extractMentionedPaths(task: string): string[] {
  const matches = String(task || "").match(/@?[A-Za-z0-9_./-]+\.[A-Za-z0-9._-]{1,12}/g) || [];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const match of matches) {
    const normalized = sanitizeRelativePath(String(match || "").replace(/[.,;:!?]+$/, ""));
    if (!normalized || seen.has(normalized)) continue;
    seen.add(normalized);
    out.push(normalized);
    if (out.length >= 8) break;
  }
  return out;
}

export function buildDecision(mode: AssistMode, task: string): AssistResult["decision"] {
  const trimmed = compactWhitespace(task);
  if (mode === "plan") {
    return {
      mode,
      reason: "Plan mode requested; return a concrete implementation plan without executable actions.",
      confidence: trimmed ? 0.96 : 0.5,
    };
  }
  if (mode === "yolo") {
    return {
      mode,
      reason: "Full-access mode requested; return file actions plus safe runnable commands when needed.",
      confidence: trimmed ? 0.88 : 0.5,
    };
  }
  return {
    mode,
    reason: "Auto mode requested; return actionable file changes and validation-oriented follow-up.",
    confidence: trimmed ? 0.84 : 0.5,
  };
}

/**
 * Questions about what a file does / means should not be classified as code_edit: the tool loop
 * requires a mutation after read_file when intent is code_edit, which breaks pure Q&A (e.g. "what is main.py about").
 */
function looksLikeInformationalQuestion(task: string): boolean {
  const t = compactWhitespace(task);
  if (!t) return false;
  // Any explicit change / implementation ask â†’ not read-only Q&A.
  if (
    /\b(edit|update|modify|patch|refactor|fix|implement|create|write|add|build|delete|remove|rename|migrate|replace)\b/i.test(
      t
    )
  ) {
    return false;
  }
  const lower = t.toLowerCase();
  if (/^\s*what\s+(is|are|does|do)\b/i.test(lower)) return true;
  if (/\bwhat\s+is\s+(my|the|this|that)\b/i.test(lower)) return true;
  if (/\bexplain\b/i.test(lower)) return true;
  if (/\bdescribe\b/i.test(lower)) return true;
  if (/\btell me (about|what)\b/i.test(lower)) return true;
  if (/\bhow does\b/i.test(lower)) return true;
  if (/\bhow do (i|we)\b/i.test(lower)) return true;
  if (/\bsummarize\b/i.test(lower)) return true;
  if (/\bwhat'?s\s+(in|inside)\b/i.test(lower)) return true;
  return false;
}

export function inferIntent(input: { mode: AssistMode; task: string; targetInference: AssistTargetInference }): AssistIntent {
  if (input.mode === "plan") {
    return { type: "plan", confidence: 0.95, delta: 0.1, clarified: true };
  }
  if (looksLikeInformationalQuestion(input.task)) {
    return {
      type: "unknown",
      confidence: 0.78,
      delta: 0.14,
      clarified: Boolean(input.targetInference.path),
    };
  }
  if (
    input.targetInference.path ||
    /\b(edit|update|modify|patch|refactor|fix|implement|create|write|add|build)\b/i.test(input.task)
  ) {
    return { type: "code_edit", confidence: 0.88, delta: 0.18, clarified: Boolean(input.targetInference.path) };
  }
  if (looksLikeShellCommand(input.task) || /\b(run|test|lint|build|typecheck|command|execute)\b/i.test(input.task)) {
    return { type: "command_run", confidence: 0.74, delta: 0.12, clarified: false };
  }
  return { type: "unknown", confidence: 0.42, delta: 0.08, clarified: false };
}

export function buildReasonCodes(input: {
  intent: AssistIntent;
  targetInference: AssistTargetInference;
  contextSelection: AssistContextSelection;
}): string[] {
  const codes = [
    `intent_${input.intent.type}`,
    input.targetInference.path ? `target_${input.targetInference.source}` : "",
    input.contextSelection.usedCloudIndex ? "context_cloud_index" : "context_local_fallback",
  ].filter(Boolean);
  return Array.from(new Set(codes));
}

export function inferAutonomyDecision(input: {
  mode: AssistMode;
  actions: ExecuteAction[];
  validationPlan: AssistValidationPlan;
  intent: AssistIntent;
}): AssistAutonomyDecision {
  if (input.mode === "plan") {
    return {
      mode: "preview_only",
      autoApplyEdits: false,
      autoRunValidation: false,
      confidence: 0.96,
      thresholds: { autoApply: 0.72, autoValidate: 0.8 },
      rationale: "Plan mode keeps the run in preview/review state.",
    };
  }
  const hasEdits = input.actions.some((action) => action.type === "edit" || action.type === "mkdir" || action.type === "write_file");
  const hasValidation = input.validationPlan.checks.length > 0;
  return {
    mode: hasEdits && hasValidation ? "auto_apply_and_validate" : hasEdits ? "auto_apply_only" : "no_actions",
    autoApplyEdits: hasEdits,
    autoRunValidation: hasEdits && hasValidation,
    confidence: input.intent.confidence,
    thresholds: { autoApply: 0.72, autoValidate: 0.8 },
    rationale: hasEdits
      ? "The action set is concrete enough to prepare automatic workspace application."
      : "No executable file mutations were prepared yet.",
  };
}

export function inferRisk(mode: AssistMode, task: string, actions: ExecuteAction[]): { blastRadius: "low" | "medium" | "high"; rollbackComplexity: number } {
  const touchedFiles = actions.filter((action) => "path" in action).length;
  if (mode === "yolo" || touchedFiles >= 4 || /\b(refactor|rewrite|migrate|large|workspace)\b/i.test(task)) {
    return { blastRadius: touchedFiles >= 6 ? "high" : "medium", rollbackComplexity: touchedFiles >= 6 ? 4 : 2 };
  }
  return { blastRadius: "low", rollbackComplexity: touchedFiles > 1 ? 2 : 1 };
}

export function collectInfluence(contextSelection: AssistContextSelection): AssistInfluence {
  return {
    files: contextSelection.files.map((file) => file.path).slice(0, 8),
    snippets: contextSelection.snippets,
  };
}

function uniqueProof(values: Array<string | null | undefined>): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const value of values) {
    const next = compactWhitespace(String(value || ""));
    if (!next || seen.has(next)) continue;
    seen.add(next);
    out.push(next);
  }
  return out;
}

export function mapIntentToGoalType(intent: AssistIntent["type"]): AssistObjectiveState["goalType"] {
  if (intent === "code_edit") return "code_edit";
  if (intent === "command_run") return "command_run";
  if (intent === "plan") return "plan";
  return "unknown";
}

function taskRequestsValidation(task: string): boolean {
  return /\b(run|rerun|execute)\s+(the\s+)?tests?\b/i.test(task) || /\buntil (it|they) pass\b/i.test(task) || /\b(validate|validation|lint|typecheck|pytest)\b/i.test(task);
}

function taskRequestsGitWorkflow(task: string): boolean {
  return /\b(git init|initialize git|initialise git|create a commit|git commit|create a feature branch|branch named|checkout -b|switch -c)\b/i.test(task);
}

function pathLooksJavaScript(pathValue: string): boolean {
  return /\.(c|m)?jsx?$/.test(pathValue) || /\.(tsx?)$/.test(pathValue);
}

function fileLooksLikeTest(pathValue: string): boolean {
  return /(^|\/)(__tests__|tests?)\//.test(pathValue) || /\.(test|spec)\.[A-Za-z0-9]+$/i.test(pathValue);
}

function inferStackSpecializer(input: {
  request: AssistRuntimeInput;
  plan: AssistPlan | null;
  targetInference: AssistTargetInference;
  contextSelection: AssistContextSelection;
  actions: ExecuteAction[];
}): AssistStackSpecializer {
  const samples = [
    input.targetInference.path,
    ...input.contextSelection.files.map((file) => file.path),
    ...(input.plan?.files || []),
    ...input.actions.filter((action): action is Extract<ExecuteAction, { path: string }> => "path" in action).map((action) => action.path),
  ]
    .map((value) => sanitizeRelativePath(value))
    .filter((value): value is string => Boolean(value));
  const task = input.request.task.toLowerCase();
  if (samples.some((value) => /\.py$/i.test(value)) || /\bpython|pytest|pip\b/.test(task)) {
    return "python";
  }
  if (
    samples.some((value) => value.endsWith("package.json") || pathLooksJavaScript(value)) ||
    /\b(node|javascript|typescript|npm|pnpm|yarn|esm)\b/.test(task)
  ) {
    return "node_js_ts";
  }
  return "generic";
}


function inferAutonomyLane(input: {
  request: AssistRuntimeInput;
  intent: AssistIntent;
  targetInference: AssistTargetInference;
  contextSelection: AssistContextSelection;
  plan: AssistPlan | null;
}): AssistAutonomyLane {
  const task = input.request.task;
  if (input.request.context?.browser || /\b(browser|tab|page|website|site|navigate|login|checkout|dashboard)\b/i.test(task)) {
    return "browser_task";
  }
  if (
    input.request.context?.desktop ||
    /\b(open|launch|focus|close)\s+[a-z0-9].*\b(app|window)\b/i.test(task) ||
    /\bopen\s+[A-Z][A-Za-z0-9._ -]+\b/.test(task)
  ) {
    return "machine_control";
  }
  if (taskRequestsGitWorkflow(task)) return "git_completion";
  if (
    /\brepair|fix failing|make the tests pass|validation\b/i.test(task) &&
    taskRequestsValidation(task)
  ) {
    return "validation_repair";
  }
  const plannedFiles = input.plan?.files || [];
  const multiFileTarget =
    plannedFiles.length >= 4 ||
    (plannedFiles.length >= 2 && /\b(project|folder|directory)\b/i.test(task));
  if (multiFileTarget) {
    return /\b(create|scaffold|bootstrap)\b/i.test(task) ? "repo_scaffold" : "multi_file_feature_delivery";
  }
  if (
    input.intent.type === "code_edit" &&
    (Boolean(input.targetInference.path) || input.contextSelection.files.length <= 2)
  ) {
    return "single_file_edit";
  }
  return "unknown";
}

function buildRequiredArtifacts(input: {
  goalType: AssistObjectiveState["goalType"];
  lane: AssistAutonomyLane;
  targetInference: AssistTargetInference;
  plan: AssistPlan | null;
}): string[] {
  if (input.goalType === "plan") return [];
  const planFiles = (input.plan?.files || []).map((value) => sanitizeRelativePath(value)).filter((value): value is string => Boolean(value));
  if (planFiles.length > 0 && input.lane !== "single_file_edit") {
    return Array.from(new Set(planFiles)).slice(0, 16);
  }
  if (input.targetInference.path) return [input.targetInference.path];
  return [];
}

function buildCompletionChecklist(input: {
  lane: AssistAutonomyLane;
  goalType: AssistObjectiveState["goalType"];
  targetInference: AssistTargetInference;
  requiredArtifacts: string[];
  requiredProof: string[];
  observedProof: string[];
  missingRequirements: string[];
  final: string;
  request: AssistRuntimeInput;
}): AssistCompletionChecklistItem[] {
  const missing = new Set(input.missingRequirements);
  const observed = new Set(input.observedProof);
  const validationRequired = taskRequestsValidation(input.request.task);
  const gitRequired = taskRequestsGitWorkflow(input.request.task);
  const nonSummaryMissing = input.missingRequirements.filter((item) => item !== "required_summary_missing");
  const items: AssistCompletionChecklistItem[] = [];

  items.push({
    id: "grounding",
    label: input.targetInference.path ? `Ground ${input.targetInference.path}` : "Inspect and ground the task target",
    category: "grounding",
    status: observed.has("target_resolved") && observed.has("target_grounded") ? "completed" : missing.has("weak_grounding_requires_inspection") ? "blocked" : "pending",
    detail: input.targetInference.path ? `Target ${input.targetInference.path}` : "No stable target has been grounded yet.",
  });

  for (const artifact of input.requiredArtifacts.slice(0, 16)) {
    const isMissing = missing.has(`required_artifact_missing:${artifact}`);
    items.push({
      id: `artifact:${artifact}`,
      label: `Deliver ${artifact}`,
      category: "implementation",
      status: isMissing ? "pending" : input.goalType === "plan" ? "completed" : "completed",
      detail: artifact,
    });
  }

  if (validationRequired) {
    items.push({
      id: "validation",
      label: "Pass requested validation",
      category: "validation",
      status: missing.has("required_validation_missing") ? "pending" : missing.has("validation_command_failure") ? "blocked" : "completed",
      detail: "Tests, lint, or typecheck requested by the task.",
    });
  }

  if (input.goalType === "command_run") {
    items.push({
      id: "command-proof",
      label: "Capture terminal proof for the requested command",
      category: "validation",
      status: missing.has("required_command_proof_missing") ? "pending" : "completed",
      detail: "Binary must prove the terminal objective with a successful command result.",
    });
  }

  if (gitRequired) {
    const closeoutMissing = input.missingRequirements.filter((item) => item.startsWith("required_git_"));
    items.push({
      id: "git-closeout",
      label: "Finish requested git closeout",
      category: "closeout",
      status: closeoutMissing.length > 0 ? "pending" : "completed",
      detail: closeoutMissing[0]?.replace(/^required_/, "").replace(/_/g, " ") || "Git init, branch, and commit proof requested.",
    });
  }

  if (input.lane === "browser_task") {
    items.push({
      id: "browser-closeout",
      label: "Prove the browser workflow outcome",
      category: "closeout",
      status: missing.has("required_browser_outcome_missing") ? "pending" : "completed",
      detail: "Capture browser-native proof of the final page or workflow state.",
    });
  }

  if (input.lane === "machine_control") {
    items.push({
      id: "desktop-closeout",
      label: "Prove the desktop outcome",
      category: "closeout",
      status: missing.has("required_desktop_outcome_missing") ? "pending" : "completed",
      detail: "Capture a desktop proof artifact or active-window confirmation after the requested action.",
    });
  }

  items.push({
    id: "summary",
    label: "Produce a final completion summary",
    category: "summary",
    status: input.final.trim() && nonSummaryMissing.length === 0 ? "completed" : "pending",
    detail:
      input.final.trim() && nonSummaryMissing.length === 0
        ? input.final.slice(0, 180)
        : nonSummaryMissing.length > 0
          ? "Wait for verification and closeout proof before writing the final summary."
          : "No final completion summary yet.",
  });

  return items;
}

function requiredProofForGoal(input: {
  goalType: AssistObjectiveState["goalType"];
  lane: AssistAutonomyLane;
  task: string;
}): string[] {
  const proof: string[] = [];
  if (input.goalType === "code_edit") {
    proof.push("target_resolved", "target_grounded", "workspace_change_prepared");
  }
  if (input.goalType === "command_run") {
    proof.push("command_prepared", "command_result_proven");
  }
  if (input.goalType === "plan") {
    proof.push("plan_ready");
  }
  if (taskRequestsValidation(input.task)) {
    proof.push("validation_proven");
  }
  if (taskRequestsGitWorkflow(input.task)) {
    proof.push("git_closeout_proven");
  }
  if (input.lane === "browser_task") {
    proof.push("browser_outcome_proven");
  }
  if (input.lane === "machine_control") {
    proof.push("desktop_outcome_proven");
  }
  return Array.from(new Set(proof));
}

function deriveChosenRoute(input: { request: AssistRuntimeInput; lane: AssistAutonomyLane; stackSpecializer: AssistStackSpecializer }) {
  const preferredWorldRoute = input.request.context?.worldModel?.routeRecommendations?.find((route) => route.preferred);
  if (preferredWorldRoute?.kind) {
    return {
      chosenRoute: preferredWorldRoute.kind,
      routeReason: preferredWorldRoute.reason,
      verificationStatus: input.request.context?.verificationPlan?.status || "pending",
    };
  }
  const preferredRepoRoute = input.request.context?.repoModel?.routeHints?.preferredRoute;
  if (preferredRepoRoute) {
    return {
      chosenRoute: preferredRepoRoute,
      routeReason:
        input.request.context?.repoModel?.routeHints?.reason ||
        "Repo cognition preferred this execution route.",
      verificationStatus: input.request.context?.verificationPlan?.status || "pending",
    };
  }
  if (input.lane === "browser_task") {
    return {
      chosenRoute: "browser_native_route",
      routeReason: "Browser tasks should prefer structured browser-native execution before visible fallbacks.",
      verificationStatus: input.request.context?.verificationPlan?.status || "pending",
    };
  }
  if (input.stackSpecializer === "node_js_ts" || input.stackSpecializer === "python") {
    return {
      chosenRoute: "shell_route",
      routeReason: "Coding tasks prefer terminal-first execution and verifier loops.",
      verificationStatus: input.request.context?.verificationPlan?.status || "pending",
    };
  }
  return {
    chosenRoute: "desktop_background_route",
    routeReason: "Binary is defaulting to the least intrusive background-capable route.",
    verificationStatus: input.request.context?.verificationPlan?.status || "pending",
  };
}

function deriveWorkerAssignments(input: {
  lane: AssistAutonomyLane;
  targetPath?: string;
  request: AssistRuntimeInput;
}): Array<{ role: string; target?: string; objective?: string; status?: string }> {
  if (
    input.lane !== "repo_scaffold" &&
    input.lane !== "single_file_edit" &&
    input.lane !== "multi_file_feature_delivery" &&
    input.lane !== "validation_repair" &&
    input.lane !== "git_completion"
  ) {
    return [];
  }
  const target = input.targetPath || input.request.context?.repoModel?.hotspots?.[0] || "workspace";
  const verificationCommand =
    input.request.context?.verificationPlan?.primaryCommand ||
    input.request.context?.repoModel?.primaryValidationCommand;
  return [
    { role: "Scout", target, objective: "Map likely files, symbols, and blast radius.", status: "ready" },
    { role: "Builder", target, objective: "Implement the intended code change in the chosen route.", status: "ready" },
    {
      role: "Verifier",
      target,
      objective: verificationCommand ? `Run and interpret ${verificationCommand}.` : "Check validation and proof state.",
      status: "queued",
    },
    { role: "Closer", target, objective: "Produce proof-backed completion and closeout.", status: "queued" },
  ];
}

export function buildObjectiveState(input: {
  request: AssistRuntimeInput;
  intent: AssistIntent;
  targetInference: AssistTargetInference;
  contextSelection: AssistContextSelection;
  actions: ExecuteAction[];
  missingRequirements: string[];
  plan: AssistPlan | null;
  final: string;
  observedProof?: string[];
  blocked?: boolean;
}): AssistObjectiveState {
  const goalType = mapIntentToGoalType(input.intent.type);
  const lane = inferAutonomyLane({
    request: input.request,
    intent: input.intent,
    targetInference: input.targetInference,
    contextSelection: input.contextSelection,
    plan: input.plan,
  });
  const stackSpecializer = inferStackSpecializer({
    request: input.request,
    plan: input.plan,
    targetInference: input.targetInference,
    contextSelection: input.contextSelection,
    actions: input.actions,
  });
  const routeDecision = deriveChosenRoute({
    request: input.request,
    lane,
    stackSpecializer,
  });
  const workerAssignments = deriveWorkerAssignments({
    lane,
    targetPath: input.targetInference.path,
    request: input.request,
  });
  const requiredArtifacts = buildRequiredArtifacts({
    goalType,
    lane,
    targetInference: input.targetInference,
    plan: input.plan,
  });
  const requiredProof = requiredProofForGoal({
    goalType,
    lane,
    task: input.request.task,
  });
  const hasPreparedMutation = input.actions.some((action) => {
    if (action.type !== "edit" && action.type !== "write_file" && action.type !== "mkdir") return false;
    if (!input.targetInference.path || !("path" in action)) return true;
    return compactWhitespace(String(action.path || "")) === compactWhitespace(input.targetInference.path);
  });
  const hasPreparedCommand = input.actions.some((action) => action.type === "command");
  const hasGrounding =
    Boolean(input.targetInference.path) &&
    input.contextSelection.files.some((file) => file.path === input.targetInference.path);
  const observedProof = uniqueProof([
    ...(input.observedProof || []),
    input.targetInference.path ? "target_resolved" : null,
    hasGrounding ? "target_grounded" : null,
    hasPreparedMutation ? "workspace_change_prepared" : null,
    hasPreparedCommand ? "command_prepared" : null,
    goalType === "plan" && input.plan ? "plan_ready" : null,
    goalType === "unknown" && input.final.trim() ? "response_ready" : null,
  ]);
  const missingProof = requiredProof.filter((proof) => !observedProof.includes(proof));
  const status: AssistObjectiveState["status"] =
    missingProof.length === 0 && input.missingRequirements.length === 0
      ? "satisfied"
      : input.blocked
        ? "blocked"
        : "in_progress";
  const completionChecklist = buildCompletionChecklist({
    lane,
    goalType,
    targetInference: input.targetInference,
    requiredArtifacts,
    requiredProof,
    observedProof,
    missingRequirements: input.missingRequirements,
    final: input.final,
    request: input.request,
  });

  return {
    status,
    goalType,
    ...(input.targetInference.path ? { targetPath: input.targetInference.path } : {}),
    autonomyLane: lane,
    stackSpecializer,
    requiredArtifacts,
    requiredProof,
    observedProof,
    missingProof,
    completionChecklist,
    chosenRoute: routeDecision.chosenRoute,
    routeReason: routeDecision.routeReason,
    verificationStatus: routeDecision.verificationStatus,
    verificationReceipts: input.request.context?.verificationPlan?.receipts || [],
    repoContextVersion: input.request.context?.repoModel?.contextVersion,
    workerAssignments,
  };
}

export function buildProgressState(input: {
  completionStatus: "complete" | "incomplete";
  objectiveState: AssistObjectiveState;
  loopState?: LoopStateContract | null;
  lastMeaningfulProgressAtStep?: number;
  lastMeaningfulProgressSummary?: string;
  stallCount?: number;
  stallReason?: string;
  nextDeterministicAction?: string;
  pendingToolCallSignature?: string;
  failed?: boolean;
  repairing?: boolean;
  chosenRoute?: string;
  routeReason?: string;
  verificationStatus?: string;
  verificationReceipts?: string[];
  repoContextVersion?: number;
  workerAssignments?: Array<{ role: string; target?: string; objective?: string; status?: string }>;
}): AssistProgressState {
  const lastMeaningfulProgressAtStep =
    typeof input.lastMeaningfulProgressAtStep === "number"
      ? input.lastMeaningfulProgressAtStep
      : input.loopState?.stepCount || 0;
  const status: AssistProgressState["status"] =
    input.failed || input.loopState?.status === "failed"
      ? "failed"
      : input.completionStatus === "complete" && input.objectiveState.status === "satisfied"
        ? "completed"
        : input.repairing
          ? "repairing"
          : (input.stallCount || 0) > 0
            ? "stalled"
            : "running";
  const chosenRoute = input.chosenRoute || input.objectiveState.chosenRoute;
  const routeReason = input.routeReason || input.objectiveState.routeReason;
  const verificationStatus = input.verificationStatus || input.objectiveState.verificationStatus;
  const verificationReceipts = input.verificationReceipts || input.objectiveState.verificationReceipts;
  const repoContextVersion =
    typeof input.repoContextVersion === "number"
      ? input.repoContextVersion
      : input.objectiveState.repoContextVersion;
  const workerAssignments = input.workerAssignments || input.objectiveState.workerAssignments;
  const lastMeaningfulProgressSummary =
    compactWhitespace(
      input.lastMeaningfulProgressSummary ||
        (status === "completed"
          ? "Objective satisfied."
          : input.nextDeterministicAction
            ? input.nextDeterministicAction
            : input.pendingToolCallSignature
              ? `Waiting for ${input.pendingToolCallSignature}.`
              : "Run initialized.")
    ) || "Run initialized.";

  return {
    status,
    lastMeaningfulProgressAtStep,
    lastMeaningfulProgressSummary,
    stallCount: Math.max(0, Math.floor(input.stallCount || 0)),
    ...(input.stallReason ? { stallReason: input.stallReason } : {}),
    ...(input.nextDeterministicAction ? { nextDeterministicAction: input.nextDeterministicAction } : {}),
    ...(input.pendingToolCallSignature ? { pendingToolCallSignature: input.pendingToolCallSignature } : {}),
    ...(chosenRoute ? { chosenRoute } : {}),
    ...(routeReason ? { routeReason } : {}),
    ...(verificationStatus ? { verificationStatus } : {}),
    ...(verificationReceipts?.length ? { verificationReceipts } : {}),
    ...(typeof repoContextVersion === "number" ? { repoContextVersion } : {}),
    ...(workerAssignments?.length ? { workerAssignments } : {}),
  };
}

export function buildToolState(): AssistToolState {
  return {
    strategy: "standard",
    route: "text_actions",
    adapter: "text_actions_v1",
    actionSource: "structured_json",
    recoveryStage: "none",
    commandPolicyResolved: "safe_default",
    attempts: [],
    lastFailureCategory: null,
  };
}

export function buildNextBestActions(mode: AssistMode, completionStatus: "complete" | "incomplete"): string[] {
  if (completionStatus === "incomplete") {
    return ["Repair run", "Open Playground review", "Refine target file"];
  }
  if (mode === "plan") return ["Execute Plan", "Refine constraints", "Add acceptance tests"];
  if (mode === "yolo") return ["Execute approved actions", "Review audit log", "Create PR summary"];
  return ["Review proposed changes", "Apply edits", "Run validation"];
}

export function buildTargetInference(input: {
  task: string;
  context?: AssistContext;
  retrievalHints?: AssistRetrievalHints;
}): AssistTargetInference {
  const projectRoot = extractRequestedProjectRoot(input.task);
  const preferred = anchorPathToProjectRoot(input.retrievalHints?.preferredTargetPath, projectRoot);
  if (preferred) return { path: preferred, confidence: 0.98, source: "mention" };

  const hinted = input.retrievalHints?.mentionedPaths
    ?.map((item) => anchorPathToProjectRoot(item, projectRoot))
    .find(Boolean);
  if (hinted) return { path: hinted || undefined, confidence: 0.96, source: "mention" };

  const mentioned = anchorPathToProjectRoot(extractMentionedPaths(input.task)[0], projectRoot);
  if (mentioned) return { path: mentioned, confidence: 0.94, source: "mention" };

  const activeFile = sanitizeRelativePath(input.context?.activeFile?.path);
  if (activeFile) return { path: activeFile, confidence: 0.84, source: "active_file" };

  const diagnosticFile = input.context?.diagnostics?.map((item) => sanitizeRelativePath(item.file)).find(Boolean);
  if (diagnosticFile) return { path: diagnosticFile || undefined, confidence: 0.76, source: "diagnostic" };

  const snippetFile = input.context?.indexedSnippets?.map((item) => sanitizeRelativePath(item.path)).find(Boolean);
  if (snippetFile) return { path: snippetFile || undefined, confidence: 0.68, source: "retrieval" };

  return { confidence: 0.3, source: "unknown" };
}

export function buildContextSelection(input: {
  context?: AssistContext;
  targetInference: AssistTargetInference;
  retrievalHints?: AssistRetrievalHints;
  task?: string;
}): AssistContextSelection {
  const projectRoot = extractRequestedProjectRoot(input.task || "");
  const items: Array<{ path: string; reason: string; score?: number }> = [];
  const seen = new Set<string>();
  const push = (pathValue: string | null | undefined, reason: string, score?: number) => {
    const normalized = anchorPathToProjectRoot(pathValue, projectRoot);
    if (!normalized || seen.has(normalized)) return;
    seen.add(normalized);
    items.push({ path: normalized, reason, ...(typeof score === "number" ? { score } : {}) });
  };

  push(input.targetInference.path, "Primary inferred target", input.targetInference.confidence);
  for (const pathValue of input.retrievalHints?.mentionedPaths || []) push(pathValue, "Explicit mention");
  push(input.context?.activeFile?.path, "Active file");
  for (const file of input.context?.openFiles || []) push(file.path, "Open editor");
  for (const snippet of input.context?.indexedSnippets || []) {
    push(snippet.path, snippet.reason || (snippet.source === "cloud" ? "Cloud index hit" : "Local workspace fallback"), snippet.score);
  }

  return {
    files: items.slice(0, 8),
    snippets: Math.min(input.context?.indexedSnippets?.length || 0, 8),
    usedCloudIndex: Boolean((input.context?.indexedSnippets || []).some((item) => item.source === "cloud")),
  };
}

function summarizeContextFile(file: { path?: string; selection?: string; content?: string }): string {
  const pathLabel = sanitizeRelativePath(file.path) || "unknown";
  const selection = String(file.selection || "").trim();
  const content = String(file.content || "").trim();
  const blocks = [`Path: ${pathLabel}`];
  if (selection) blocks.push(`Selection:\n${selection.slice(0, 12_000)}`);
  else if (content) blocks.push(`Content:\n${content.slice(0, 12_000)}`);
  return blocks.join("\n");
}

export function buildContextPrompt(context?: AssistContext): string {
  if (!context) return "IDE context: none.";
  const sections: string[] = [];
  if (context.activeFile?.path) {
    sections.push(`Active file:\n${summarizeContextFile(context.activeFile)}`);
  }
  if (context.openFiles?.length) {
    sections.push(
      `Open files:\n${context.openFiles
        .slice(0, 4)
        .map((file) => `- ${sanitizeRelativePath(file.path) || file.path}${file.excerpt ? `\n${String(file.excerpt).slice(0, 2_500)}` : ""}`)
        .join("\n")}`
    );
  }
  if (context.diagnostics?.length) {
    sections.push(
      `Diagnostics:\n${context.diagnostics
        .slice(0, 10)
        .map((item) => `- ${sanitizeRelativePath(item.file) || "workspace"}:${item.line || 1} ${compactWhitespace(item.message)}`)
        .join("\n")}`
    );
  }
  if (context.indexedSnippets?.length) {
    sections.push(
      `Indexed snippets:\n${context.indexedSnippets
        .slice(0, 6)
        .map((snippet) => {
          const pathLabel = sanitizeRelativePath(snippet.path) || "workspace";
          const reason = snippet.reason || (snippet.source === "cloud" ? "Cloud index hit" : "Local fallback");
          return `- ${pathLabel} (${reason})\n${String(snippet.content || "").slice(0, 2_000)}`;
        })
        .join("\n")}`
    );
  }
  if (context.desktop) {
    const desktopSections: string[] = [];
    if (context.desktop.platform) {
      desktopSections.push(`Platform: ${context.desktop.platform}`);
    }
    if (context.desktop.activeWindow?.title || context.desktop.activeWindow?.app) {
      desktopSections.push(
        `Active window: ${compactWhitespace(
          [context.desktop.activeWindow.app, context.desktop.activeWindow.title].filter(Boolean).join(" - ")
        )}`
      );
    }
    if (context.desktop.visibleWindows?.length) {
      desktopSections.push(
        `Visible windows:\n${context.desktop.visibleWindows
          .slice(0, 8)
          .map((window) =>
            `- ${compactWhitespace([window.app, window.title].filter(Boolean).join(" - ")) || window.id || "window"}`
          )
          .join("\n")}`
      );
    }
    if (context.desktop.displays?.length) {
      desktopSections.push(
        `Displays:\n${context.desktop.displays
          .slice(0, 6)
          .map((display) => {
            const label = compactWhitespace(display.label || display.id);
            const suffix = display.isPrimary ? " primary" : "";
            return `- ${label}: ${display.width}x${display.height}${suffix}`;
          })
          .join("\n")}`
      );
    }
    if (context.desktop.discoveredApps?.length) {
      desktopSections.push(
        `Discovered apps:\n${context.desktop.discoveredApps
          .slice(0, 16)
          .map((app) => {
            const aliases = Array.isArray(app.aliases) && app.aliases.length
              ? ` aliases=${app.aliases.slice(0, 4).join(", ")}`
              : "";
            const source = app.source ? ` source=${app.source}` : "";
            return `- ${app.name}${aliases}${source}`;
          })
          .join("\n")}`
      );
    }
    if (context.desktop.recentSnapshots?.length) {
      desktopSections.push(
        `Recent snapshots:\n${context.desktop.recentSnapshots
          .slice(0, 6)
          .map((snapshot) => {
            const size =
              snapshot.width && snapshot.height ? ` ${snapshot.width}x${snapshot.height}` : "";
            const display = snapshot.displayId ? ` on ${snapshot.displayId}` : "";
            return `- ${snapshot.snapshotId}${display}${size}`;
          })
          .join("\n")}`
      );
    }
    if (desktopSections.length) {
      sections.push(`Desktop state:\n${desktopSections.join("\n")}`);
    }
  }
  if (context.browser) {
    const browserSections: string[] = [];
    if (context.browser.mode) {
      browserSections.push(`Mode: ${context.browser.mode}`);
    }
    if (context.browser.browserName) {
      browserSections.push(`Browser: ${context.browser.browserName}`);
    }
    if (context.browser.activePage?.title || context.browser.activePage?.url) {
      browserSections.push(
        `Active page: ${compactWhitespace(
          [context.browser.activePage.title, context.browser.activePage.url].filter(Boolean).join(" - ")
        )}`
      );
    }
    if (context.browser.openPages?.length) {
      browserSections.push(
        `Open pages:\n${context.browser.openPages
          .slice(0, 8)
          .map((page) => `- ${compactWhitespace([page.title, page.url].filter(Boolean).join(" - ")) || page.id}`)
          .join("\n")}`
      );
    }
    if (context.browser.visibleInteractiveElements?.length) {
      browserSections.push(
        `Interactive elements:\n${context.browser.visibleInteractiveElements
          .slice(0, 12)
          .map((element) => `- ${compactWhitespace([element.label, element.selector].filter(Boolean).join(" @ "))}`)
          .join("\n")}`
      );
    }
    if (context.browser.recentSnapshots?.length) {
      browserSections.push(
        `Recent browser snapshots:\n${context.browser.recentSnapshots
          .slice(0, 6)
          .map((snapshot) => `- ${snapshot.snapshotId}: ${compactWhitespace([snapshot.title, snapshot.url].filter(Boolean).join(" - "))}`)
          .join("\n")}`
      );
    }
    if (context.browser.recentNetworkActivity?.length) {
      browserSections.push(
        `Recent network activity:\n${context.browser.recentNetworkActivity
          .slice(0, 8)
          .map((entry) => `- ${compactWhitespace([entry.phase, entry.method, entry.status ? String(entry.status) : "", entry.url].filter(Boolean).join(" "))}`)
          .join("\n")}`
      );
    }
    if (context.browser.recentConsoleMessages?.length) {
      browserSections.push(
        `Recent console messages:\n${context.browser.recentConsoleMessages
          .slice(0, 6)
          .map((entry) => `- ${compactWhitespace([entry.level, entry.text].filter(Boolean).join(": "))}`)
          .join("\n")}`
      );
    }
    if (context.browser.sessionHint) {
      browserSections.push(
        `Session hints: attached=${context.browser.sessionHint.attachedToExistingSession ? "true" : "false"} authenticated=${context.browser.sessionHint.authenticatedLikely ? "true" : "false"}`
      );
    }
    if (browserSections.length) {
      sections.push(`Browser state:\n${browserSections.join("\n")}`);
    }
  }
  if (context.worldModel) {
    const worldSections: string[] = [];
    if (typeof context.worldModel.graphVersion === "number") {
      worldSections.push(`Graph version: ${context.worldModel.graphVersion}`);
    }
    if (context.worldModel.summary) {
      worldSections.push(`Summary: ${String(context.worldModel.summary).slice(0, 2_000)}`);
    }
    if (context.worldModel.activeContext) {
      const activeContextLines = [
        context.worldModel.activeContext.activeWindow
          ? `Active window: ${context.worldModel.activeContext.activeWindow}`
          : "",
        context.worldModel.activeContext.activePage
          ? `Active page: ${context.worldModel.activeContext.activePage}`
          : "",
        context.worldModel.activeContext.activeWorkspace
          ? `Active workspace: ${context.worldModel.activeContext.activeWorkspace}`
          : "",
        context.worldModel.activeContext.activeRepo ? `Active repo: ${context.worldModel.activeContext.activeRepo}` : "",
        context.worldModel.activeContext.browserMode ? `Browser mode: ${context.worldModel.activeContext.browserMode}` : "",
        typeof context.worldModel.activeContext.focusLeaseActive === "boolean"
          ? `Focus lease active: ${context.worldModel.activeContext.focusLeaseActive ? "true" : "false"}`
          : "",
      ].filter(Boolean);
      if (activeContextLines.length) {
        worldSections.push(activeContextLines.join("\n"));
      }
    }
    if (context.worldModel.affordanceSummary) {
      const affordances = context.worldModel.affordanceSummary;
      if (affordances.actionsAvailable?.length) {
        worldSections.push(`Affordances:\n${affordances.actionsAvailable.slice(0, 10).map((item) => `- ${item}`).join("\n")}`);
      }
      if (affordances.backgroundSafe?.length) {
        worldSections.push(`Background-safe routes:\n${affordances.backgroundSafe.slice(0, 8).map((item) => `- ${item}`).join("\n")}`);
      }
      if (affordances.blocked?.length) {
        worldSections.push(`Blocked routes:\n${affordances.blocked.slice(0, 8).map((item) => `- ${item}`).join("\n")}`);
      }
    }
    if (context.worldModel.routeRecommendations?.length) {
      worldSections.push(
        `Recommended routes:\n${context.worldModel.routeRecommendations
          .slice(0, 4)
          .map((route) => {
            const informedBy = route.informedBy?.length ? ` [signals: ${route.informedBy.join(", ")}]` : "";
            const preferred = route.preferred ? " preferred" : "";
            return `- ${route.kind} score=${route.score.toFixed(2)}${preferred}: ${route.reason}${informedBy}`;
          })
          .join("\n")}`
      );
    }
    if (context.worldModel.recentChanges?.length) {
      worldSections.push(
        `Recent environment changes:\n${context.worldModel.recentChanges
          .slice(0, 6)
          .map((change) => `- ${compactWhitespace(change.summary)}`)
          .join("\n")}`
      );
    }
    if (context.worldModel.machineRoutineIds?.length) {
      worldSections.push(`Known routines: ${context.worldModel.machineRoutineIds.slice(0, 8).join(", ")}`);
    }
    if (context.worldModel.environmentFreshness?.lastUpdatedAt) {
      worldSections.push(
        `Environment freshness: ${context.worldModel.environmentFreshness.stale ? "stale" : "fresh"} @ ${context.worldModel.environmentFreshness.lastUpdatedAt}`
      );
    }
    if (worldSections.length) {
      sections.push(`Machine world model:\n${worldSections.join("\n")}`);
    }
  }
  if (context.repoModel) {
    const repoSections: string[] = [];
    if (typeof context.repoModel.contextVersion === "number") {
      repoSections.push(`Context version: ${context.repoModel.contextVersion}`);
    }
    if (context.repoModel.summary) {
      repoSections.push(`Summary: ${String(context.repoModel.summary).slice(0, 2000)}`);
    }
    if (context.repoModel.workspaceRoot) {
      repoSections.push(`Workspace root: ${context.repoModel.workspaceRoot}`);
    }
    if (context.repoModel.stack) {
      repoSections.push(`Stack: ${context.repoModel.stack}`);
    }
    if (context.repoModel.primaryValidationCommand) {
      repoSections.push(`Primary validation: ${context.repoModel.primaryValidationCommand}`);
    }
    if (context.repoModel.hotspots?.length) {
      repoSections.push(`Hotspots:\n${context.repoModel.hotspots.slice(0, 8).map((item) => `- ${item}`).join("\n")}`);
    }
    if (context.repoModel.likelyTests?.length) {
      repoSections.push(`Likely tests:\n${context.repoModel.likelyTests.slice(0, 8).map((item) => `- ${item}`).join("\n")}`);
    }
    if (context.repoModel.routeHints?.preferredRoute) {
      const informedBy = context.repoModel.routeHints.informedBy?.length
        ? ` [signals: ${context.repoModel.routeHints.informedBy.join(", ")}]`
        : "";
      repoSections.push(
        `Preferred coding route: ${context.repoModel.routeHints.preferredRoute} - ${context.repoModel.routeHints.reason || "repo cognition"}${informedBy}`
      );
    }
    if (context.repoModel.symbolIndex?.length) {
      repoSections.push(
        `Repo symbols:\n${context.repoModel.symbolIndex
          .slice(0, 10)
          .map((symbol) => `- ${symbol.kind} ${symbol.name} @ ${symbol.path}${symbol.line ? `:${symbol.line}` : ""}`)
          .join("\n")}`
      );
    }
    if (context.repoModel.memory) {
      const memoryLines = [
        context.repoModel.memory.preferredValidationCommand
          ? `Preferred validation: ${context.repoModel.memory.preferredValidationCommand}`
          : "",
        context.repoModel.memory.preferredBranchPrefix
          ? `Preferred branch prefix: ${context.repoModel.memory.preferredBranchPrefix}`
          : "",
        context.repoModel.memory.knownRepairPatterns?.length
          ? `Repair playbooks: ${context.repoModel.memory.knownRepairPatterns.slice(0, 6).join(" | ")}`
          : "",
      ].filter(Boolean);
      if (memoryLines.length) {
        repoSections.push(memoryLines.join("\n"));
      }
    }
    if (repoSections.length) {
      sections.push(`Repo model:\n${repoSections.join("\n")}`);
    }
  }
  if (context.verificationPlan) {
    const verificationSections: string[] = [];
    if (context.verificationPlan.status) {
      verificationSections.push(`Status: ${context.verificationPlan.status}`);
    }
    if (context.verificationPlan.primaryCommand) {
      verificationSections.push(`Primary command: ${context.verificationPlan.primaryCommand}`);
    }
    if (context.verificationPlan.reason) {
      verificationSections.push(`Reason: ${context.verificationPlan.reason}`);
    }
    if (context.verificationPlan.checks?.length) {
      verificationSections.push(
        `Checks:\n${context.verificationPlan.checks
          .slice(0, 8)
          .map((check) => `- ${check.label}${check.command ? ` (${check.command})` : ""}${check.status ? ` status=${check.status}` : ""}`)
          .join("\n")}`
      );
    }
    if (context.verificationPlan.receipts?.length) {
      verificationSections.push(
        `Receipts:\n${context.verificationPlan.receipts.slice(0, 8).map((item) => `- ${item}`).join("\n")}`
      );
    }
    if (verificationSections.length) {
      sections.push(`Verification plan:\n${verificationSections.join("\n")}`);
    }
  }
  return sections.length ? sections.join("\n\n") : "IDE context: none.";
}

function buildHistoryPrompt(history: AssistConversationTurn[] | undefined): string {
  if (!history?.length) return "Recent session history: none.";
  return [
    "Recent session history:",
    ...history.slice(-6).map((turn) => `${turn.role.toUpperCase()}: ${turn.content.slice(0, 4_000)}`),
  ].join("\n");
}

function pathListForPlan(target: AssistTargetInference, selection: AssistContextSelection): string[] {
  const ordered = [
    ...(target.path ? [target.path] : []),
    ...selection.files.map((item) => item.path),
  ];
  return Array.from(new Set(ordered)).slice(0, 4);
}

export function buildPlan(input: {
  task: string;
  targetInference: AssistTargetInference;
  contextSelection: AssistContextSelection;
}): AssistPlan {
  const projectRoot = extractRequestedProjectRoot(input.task);
  const explicitPaths = extractMentionedPaths(input.task)
    .map((item) => anchorPathToProjectRoot(item, projectRoot))
    .filter((item): item is string => Boolean(item));
  const files = Array.from(
    new Set([
      ...explicitPaths,
      ...pathListForPlan(input.targetInference, input.contextSelection).map((item) =>
        anchorPathToProjectRoot(item, projectRoot)
      ).filter((item): item is string => Boolean(item)),
    ])
  ).slice(0, 8);
  const specializer: AssistStackSpecializer =
    files.some((file) => /\.py$/i.test(file)) || /\bpython|pytest|pip\b/i.test(input.task)
      ? "python"
      : files.some((file) => file.endsWith("package.json") || pathLooksJavaScript(file)) ||
          /\b(node|javascript|typescript|npm|pnpm|yarn|esm)\b/i.test(input.task)
        ? "node_js_ts"
        : "generic";
  const lane: AssistAutonomyLane =
    taskRequestsGitWorkflow(input.task)
      ? "git_completion"
      : files.length >= 4 || /\b(project|folder|directory)\b/i.test(input.task)
        ? "multi_file_feature_delivery"
        : files.length <= 1 && files[0]
          ? "single_file_edit"
          : "unknown";
  const touchedLanguage = detectLanguageFromPath(files[0]);
  const acceptanceTests = files.length
    ? files.flatMap((filePath) => {
        const checks = [`git diff --check -- ${filePath}`];
        const language = detectLanguageFromPath(filePath);
        if (language === "ts" || language === "js") checks.push(`npm run lint -- ${filePath}`);
        if (language === "python") checks.push(`python -m py_compile ${filePath}`);
        return checks;
      })
    : ["Confirm the target file before applying changes."];
  if (specializer === "node_js_ts" && (files.some((file) => file.endsWith("package.json") || fileLooksLikeTest(file)) || taskRequestsValidation(input.task))) {
    acceptanceTests.push("npm test");
  }
  if (specializer === "python" && (files.some((file) => /\.py$/i.test(file)) || taskRequestsValidation(input.task))) {
    acceptanceTests.push("python -m pytest");
  }
  if (taskRequestsGitWorkflow(input.task)) {
    acceptanceTests.push("git status --short");
  }

  const risks = [
    ...(input.targetInference.path ? [] : ["Target file inference is low confidence; confirm the intended file if the first result is wrong."]),
    ...(input.contextSelection.usedCloudIndex ? [] : ["Cloud index did not provide a strong hit, so the active IDE context is the main source of truth."]),
    ...(touchedLanguage === "docs" ? ["The request appears documentation-heavy; verify the change does not need a companion code edit."] : []),
  ].slice(0, 4);

  return {
    objective: compactWhitespace(input.task).slice(0, 280),
    files,
    steps: [
      specializer === "generic" && files.length === 0
        ? "Inspect likely targets before mutating because the task is weakly grounded."
        : files.length
          ? `Inspect and update ${files[0]}.`
          : "Inspect the most likely target file from IDE context.",
      lane === "multi_file_feature_delivery" || lane === "git_completion"
        ? "Complete the full requested artifact checklist, not just the first file."
        : "Apply the minimal code change needed to satisfy the request.",
      taskRequestsGitWorkflow(input.task)
        ? "Run validation, then finish the requested git closeout with proof."
        : "Run focused validation on the touched files and review the resulting diff.",
    ],
    acceptanceTests: Array.from(new Set(acceptanceTests)).slice(0, 6),
    risks,
  };
}

export function buildValidationPlan(input: {
  actions: ExecuteAction[];
}): AssistValidationPlan {
  const touchedFiles = input.actions
    .filter((action): action is Extract<ExecuteAction, { type: "edit" | "write_file" }> => action.type === "edit" || action.type === "write_file")
    .map((action) => sanitizeRelativePath(action.path))
    .filter((value): value is string => Boolean(value));

  if (touchedFiles.length === 0) {
    return {
      scope: "none",
      checks: [],
      touchedFiles: [],
      reason: "No file mutations were prepared.",
    };
  }

  const checks = new Set<string>();
  const hasPackageJson = touchedFiles.some((filePath) => filePath === "package.json" || filePath.endsWith("/package.json"));
  const hasJavaScriptTests = touchedFiles.some((filePath) => pathLooksJavaScript(filePath) && fileLooksLikeTest(filePath));
  const hasPythonFiles = touchedFiles.some((filePath) => /\.py$/i.test(filePath));
  for (const filePath of touchedFiles) {
    checks.add(`git diff --check -- ${filePath}`);
    const language = detectLanguageFromPath(filePath);
    if (language === "ts" || language === "js") checks.add(`npm run lint -- ${filePath}`);
    if (language === "python") checks.add(`python -m py_compile ${filePath}`);
  }
  if (hasPackageJson || hasJavaScriptTests) checks.add("npm test");
  if (hasPythonFiles && touchedFiles.some((filePath) => fileLooksLikeTest(filePath) || /\.py$/i.test(filePath))) {
    checks.add("python -m pytest");
  }

  return {
    scope: "targeted",
    checks: Array.from(checks),
    touchedFiles: Array.from(new Set(touchedFiles)),
    reason: "Focused validation based on the prepared file mutations.",
  };
}

function buildModelSystemPrompt(mode: AssistMode): string {
  const modeRule =
    mode === "plan"
      ? "Return a plan only. Do not emit executable actions. If key planning details are missing, set userInputRequest instead of guessing."
      : mode === "auto"
        ? "Return executable file actions plus validation commands only. Do not emit implementation/build/install commands."
        : "Return executable file actions plus safe shell commands when they materially help complete the task.";

  return [
    "You are Playground, a minimal agentic coding model.",
    "Return JSON only.",
    "Use this response shape exactly:",
    '{"final":"string","plan":{"objective":"string","files":["path"],"steps":["step"],"acceptanceTests":["cmd"],"risks":["risk"]}|null,"actions":[{"type":"edit","path":"file","patch":"unified diff"},{"type":"write_file","path":"file","content":"full file text","overwrite":true},{"type":"mkdir","path":"dir"},{"type":"command","command":"npm run lint -- file","category":"validation"}],"userInputRequest":{"requestId":"string","questions":[{"id":"string","header":"string","question":"string","options":[{"label":"string","description":"string"}]}]}|null}',
    "Paths must stay workspace-relative.",
    "Prefer edit for targeted changes and write_file for full rewrites/new files.",
    "Do not wrap the JSON in markdown fences.",
    "When mode is plan and you need more context, ask 1-3 concise multiple-choice questions with recommended options first.",
    "Do not emit filler answers like Other/Not sure unless the task truly requires freeform input.",
    modeRule,
  ].join("\n");
}

function buildModelUserPrompt(input: {
  request: AssistRuntimeInput;
  targetInference: AssistTargetInference;
  contextSelection: AssistContextSelection;
}): string {
  return [
    `Mode: ${input.request.mode}`,
    input.targetInference.path ? `Preferred target: ${input.targetInference.path}` : "Preferred target: infer from context.",
    input.contextSelection.files.length
      ? `Context files:\n${input.contextSelection.files.map((item) => `- ${item.path} (${item.reason})`).join("\n")}`
      : "Context files: none.",
    input.request.mode === "plan"
      ? "If the task is underspecified, ask the minimum number of clarification questions needed to produce a concrete plan."
      : "If you have enough context, produce executable actions directly.",
    buildHistoryPrompt(input.request.conversationHistory),
    buildContextPrompt(input.request.context),
    `Task:\n${input.request.task}`,
  ].join("\n\n");
}

async function callDefaultModel(input: {
  prompt: string;
  mode: AssistMode;
  maxTokens: number;
  requestedModel?: string;
  userId?: string | null;
  requestedSource?: PlaygroundChatModelSource | null;
  fallbackToPlatformModel?: boolean;
}): Promise<string | null> {
  const modelAccess = await resolveChatModelAccess({
    userId: input.userId,
    requestedModel: input.requestedModel,
    requestedSource: input.requestedSource,
    fallbackToPlatformModel: input.fallbackToPlatformModel,
  });
  const token = modelAccess.token;
  if (!token) return null;

  const model =
    modelAccess.provider === "hf"
      ? normalizeHfRouterModelId(modelAccess.resolvedModel)
      : String(modelAccess.resolvedModel || "").trim();
  if (!model) throw new Error("Hosted model is not configured.");
  const baseUrl = String(modelAccess.baseUrl || HF_ROUTER_BASE_URL).replace(/\/+$/, "");
  const response = await fetch(`${baseUrl}/chat/completions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({
      model,
      temperature: input.mode === "plan" ? 0.2 : 0.1,
      max_tokens: coerceHfRouterMaxTokens(input.maxTokens, DEFAULT_MAX_TOKENS),
      messages: [
        { role: "system", content: buildModelSystemPrompt(input.mode) },
        { role: "user", content: input.prompt },
      ],
    }),
  });

  if (!response.ok) {
    const raw = await response.text();
    throw new Error(`HF router request failed (${response.status}): ${raw}`);
  }

  const payload = (await response.json()) as ProviderChatResponse;
  const text = String(payload.choices?.[0]?.message?.content || "").trim();
  return text || null;
}

function extractBalancedJsonObject(text: string): string | null {
  const input = String(text || "");
  const start = input.indexOf("{");
  if (start < 0) return null;
  let depth = 0;
  let inString = false;
  let escaped = false;
  for (let i = start; i < input.length; i += 1) {
    const char = input[i];
    if (inString) {
      if (escaped) {
        escaped = false;
        continue;
      }
      if (char === "\\") {
        escaped = true;
        continue;
      }
      if (char === "\"") inString = false;
      continue;
    }
    if (char === "\"") {
      inString = true;
      continue;
    }
    if (char === "{") depth += 1;
    if (char === "}") {
      depth -= 1;
      if (depth === 0) return input.slice(start, i + 1);
    }
  }
  return null;
}

function parseJsonCandidate(text: string): Record<string, unknown> | null {
  const candidates = [
    String(text || "").trim(),
    /^```(?:json)?\s*([\s\S]*?)\s*```$/i.exec(String(text || "").trim())?.[1] || "",
    extractBalancedJsonObject(text) || "",
  ].filter(Boolean);

  for (const candidate of candidates) {
    try {
      const parsed = JSON.parse(candidate);
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
        return parsed as Record<string, unknown>;
      }
    } catch {
      // try next candidate
    }
  }
  return null;
}

function extractPatchFromObject(value: unknown): string | null {
  if (!value || typeof value !== "object") return null;
  const record = value as Record<string, unknown>;
  if (typeof record.patch === "string" && record.patch.trim()) return record.patch.trim();
  if (typeof record.diff === "string" && record.diff.trim()) return record.diff.trim();
  if (Array.isArray(record.edits)) {
    for (const item of record.edits) {
      const nested = extractPatchFromObject(item);
      if (nested) return nested;
    }
  }
  if (Array.isArray(record.actions)) {
    for (const item of record.actions) {
      const nested = extractPatchFromObject(item);
      if (nested) return nested;
    }
  }
  return null;
}

function extractDiffBlock(raw: string): string | null {
  const fenced = /```(?:diff|patch)?\s*([\s\S]*?)```/i.exec(raw);
  if (fenced?.[1] && /(?:diff --git|@@ |\*\*\* Begin Patch)/.test(fenced[1])) {
    return fenced[1].trim();
  }
  const directIndex = raw.search(/(?:diff --git|@@ |\*\*\* Begin Patch)/);
  if (directIndex >= 0) return raw.slice(directIndex).trim();
  return null;
}

function extractFirstCodeBlock(raw: string): string | null {
  const fenced = /```(?:[a-z0-9_-]+)?\s*([\s\S]*?)```/i.exec(raw);
  return fenced?.[1]?.trim() || null;
}

function repairPatchText(raw: string): string | null {
  const trimmed = String(raw || "").trim();
  if (!trimmed) return null;
  const parsed = parseJsonCandidate(trimmed);
  if (parsed) {
    const nested = extractPatchFromObject(parsed);
    if (nested) return repairPatchText(nested);
  }
  const diffBlock = extractDiffBlock(trimmed);
  if (diffBlock) return diffBlock;
  return trimmed;
}

function inferValidationCategory(command: string): "implementation" | "validation" {
  return /(lint|typecheck|test|pytest|vitest|jest|py_compile|cargo test|go test|ruff|mypy)/i.test(command)
    ? "validation"
    : "implementation";
}

function sanitizePlanObject(value: unknown, fallback: AssistPlan): AssistPlan | null {
  if (!value || typeof value !== "object") return fallback;
  const record = value as Record<string, unknown>;
  const objective = compactWhitespace(String(record.objective || fallback.objective)).slice(0, 280);
  const files = Array.isArray(record.files)
    ? record.files.map((item) => sanitizeRelativePath(String(item || ""))).filter((item): item is string => Boolean(item)).slice(0, 6)
    : fallback.files;
  const steps = Array.isArray(record.steps)
    ? record.steps.map((item) => compactWhitespace(String(item || ""))).filter(Boolean).slice(0, 8)
    : fallback.steps;
  const acceptanceTests = Array.isArray(record.acceptanceTests)
    ? record.acceptanceTests.map((item) => compactWhitespace(String(item || ""))).filter(Boolean).slice(0, 8)
    : fallback.acceptanceTests;
  const risks = Array.isArray(record.risks)
    ? record.risks.map((item) => compactWhitespace(String(item || ""))).filter(Boolean).slice(0, 6)
    : fallback.risks;

  return {
    objective: objective || fallback.objective,
    files: files.length ? files : fallback.files,
    steps: steps.length ? steps : fallback.steps,
    acceptanceTests: acceptanceTests.length ? acceptanceTests : fallback.acceptanceTests,
    risks,
  };
}

function sanitizeUserInputOptions(value: unknown): AssistUserInputOption[] {
  if (!Array.isArray(value)) return [];
  const seen = new Set<string>();
  return value
    .map((item) => {
      if (!item || typeof item !== "object") return null;
      const record = item as Record<string, unknown>;
      const label = compactWhitespace(String(record.label || "")).slice(0, 120);
      const description = compactWhitespace(String(record.description || "")).slice(0, 220);
      if (!label) return null;
      const key = `${label}\u0000${description}`.toLowerCase();
      if (seen.has(key)) return null;
      seen.add(key);
      return {
        label,
        ...(description ? { description } : {}),
      } satisfies AssistUserInputOption;
    })
    .filter((item): item is AssistUserInputOption => Boolean(item))
    .slice(0, 4);
}

function sanitizeUserInputRequest(value: unknown, mode: AssistMode): AssistUserInputRequest | null {
  if (mode !== "plan" || !value || typeof value !== "object" || Array.isArray(value)) return null;
  const record = value as Record<string, unknown>;
  const requestId = compactWhitespace(String(record.requestId || "")).slice(0, 240) || `plan-${Date.now().toString(36)}`;
  const rawQuestions = Array.isArray(record.questions) ? record.questions : [];
  const questions = rawQuestions
    .map((item): AssistUserInputQuestion | null => {
      if (!item || typeof item !== "object") return null;
      const questionRecord = item as Record<string, unknown>;
      const id = compactWhitespace(String(questionRecord.id || "")).slice(0, 240);
      const question = compactWhitespace(String(questionRecord.question || "")).slice(0, 280);
      const header = compactWhitespace(String(questionRecord.header || "")).slice(0, 120);
      const options = sanitizeUserInputOptions(questionRecord.options);
      if (!id || !header || !question || options.length === 0) return null;
      const sanitizedQuestion: AssistUserInputQuestion = {
        id,
        header,
        question,
        options,
        ...(questionRecord.isOther === true ? { isOther: true } : {}),
        ...(typeof questionRecord.placeholder === "string" && questionRecord.placeholder.trim()
          ? { placeholder: compactWhitespace(questionRecord.placeholder).slice(0, 120) }
          : {}),
      };
      return sanitizedQuestion;
    })
    .filter((item): item is AssistUserInputQuestion => Boolean(item))
    .slice(0, 3);
  if (!questions.length) return null;
  return {
    requestId,
    questions,
  };
}

function normalizeActionFromRecord(input: {
  value: Record<string, unknown>;
  targetPath?: string;
  mode: AssistMode;
}): ExecuteAction | null {
  const type = String(input.value.type || "").trim().toLowerCase();
  const fallbackPath = sanitizeRelativePath(input.targetPath);

  if (type === "edit" || typeof input.value.patch === "string" || typeof input.value.diff === "string") {
    const pathValue = sanitizeRelativePath(String(input.value.path || fallbackPath || ""));
    const patchValue = repairPatchText(String(input.value.patch || input.value.diff || ""));
    if (!pathValue || !patchValue) return null;
    const action: ExecuteAction = { type: "edit", path: pathValue, patch: patchValue };
    return validateExecuteAction(action).ok ? action : null;
  }

  if (type === "write_file" || typeof input.value.content === "string") {
    const pathValue = sanitizeRelativePath(String(input.value.path || fallbackPath || ""));
    const contentValue = typeof input.value.content === "string" ? input.value.content : "";
    const overwriteValue = typeof input.value.overwrite === "boolean" ? input.value.overwrite : true;
    if (!pathValue || !contentValue.trim()) return null;
    const action: ExecuteAction = {
      type: "write_file",
      path: pathValue,
      content: contentValue,
      overwrite: overwriteValue,
    };
    return validateExecuteAction(action).ok ? action : null;
  }

  if (type === "mkdir") {
    const pathValue = sanitizeRelativePath(String(input.value.path || ""));
    if (!pathValue) return null;
    const action: ExecuteAction = { type: "mkdir", path: pathValue };
    return validateExecuteAction(action).ok ? action : null;
  }

  if (type === "command" || typeof input.value.command === "string") {
    const commandValue = compactWhitespace(String(input.value.command || ""));
    if (!commandValue || !looksLikeShellCommand(commandValue)) return null;
    const category =
      input.value.category === "implementation" || input.value.category === "validation"
        ? input.value.category
        : inferValidationCategory(commandValue);
    if (input.mode === "auto" && category !== "validation") return null;
    if (input.mode === "plan") return null;
    const action: ExecuteAction = { type: "command", command: commandValue, category };
    return validateExecuteAction(action).ok ? action : null;
  }

  return null;
}

function dedupeActions(actions: ExecuteAction[]): ExecuteAction[] {
  const seen = new Set<string>();
  const out: ExecuteAction[] = [];
  for (const action of actions) {
    const key = JSON.stringify(action);
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(action);
  }
  return out;
}

export function synthesizeDeterministicActions(input: {
  task: string;
  targetPath?: string;
  mode: AssistMode;
}): ExecuteAction[] {
  if (input.mode === "plan") return [];

  const mkdirMatch =
    /\b(?:create|add|make)\s+(?:a\s+)?(?:folder|directory)\s+(?:called|named)?\s*["'`]?([A-Za-z0-9_./-]+)["'`]?/i.exec(input.task);
  if (mkdirMatch?.[1]) {
    const pathValue = sanitizeRelativePath(mkdirMatch[1]);
    if (pathValue) {
      const action: ExecuteAction = { type: "mkdir", path: pathValue };
      return validateExecuteAction(action).ok ? [action] : [];
    }
  }

  const targetPath = sanitizeRelativePath(input.targetPath);
  if (!targetPath) return [];

  const diffBlock = extractDiffBlock(input.task);
  if (diffBlock) {
    const action: ExecuteAction = { type: "edit", path: targetPath, patch: diffBlock };
    return validateExecuteAction(action).ok ? [action] : [];
  }

  const codeBlock = extractFirstCodeBlock(input.task);
  if (codeBlock) {
    const action: ExecuteAction = { type: "write_file", path: targetPath, content: codeBlock, overwrite: true };
    return validateExecuteAction(action).ok ? [action] : [];
  }

  return [];
}

export function parseStructuredAssistResponse(input: {
  raw: string;
  mode: AssistMode;
  targetPath?: string;
  fallbackPlan: AssistPlan;
}): ParsedModelOutput {
  const parsed = parseJsonCandidate(input.raw);
  let final = "";
  let plan: AssistPlan | null = input.mode === "plan" ? input.fallbackPlan : null;
  const actions: ExecuteAction[] = [];
  let userInputRequest: AssistUserInputRequest | null = null;

  if (parsed) {
    final = typeof parsed.final === "string" ? parsed.final.trim() : "";
    plan = input.mode === "plan"
      ? sanitizePlanObject(parsed.plan, input.fallbackPlan)
        : parsed.plan
          ? sanitizePlanObject(parsed.plan, input.fallbackPlan)
          : null;
    userInputRequest =
      sanitizeUserInputRequest(parsed.userInputRequest, input.mode) ||
      (Array.isArray(parsed.questions)
        ? sanitizeUserInputRequest({
            requestId: parsed.requestId,
            questions: parsed.questions,
          }, input.mode)
        : null);

    const rawActions = Array.isArray(parsed.actions)
      ? parsed.actions
      : [
          ...(Array.isArray(parsed.edits) ? parsed.edits : []),
          ...(Array.isArray(parsed.commands) ? parsed.commands.map((command) => ({ type: "command", command })) : []),
        ];

    for (const item of rawActions) {
      if (!item || typeof item !== "object") continue;
      const action = normalizeActionFromRecord({
        value: item as Record<string, unknown>,
        targetPath: input.targetPath,
        mode: input.mode,
      });
      if (action) actions.push(action);
    }
  }

  if (actions.length === 0) {
    actions.push(...synthesizeDeterministicActions({
      task: input.raw,
      targetPath: input.targetPath,
      mode: input.mode,
    }));
  }

  const normalizedActions = dedupeActions(actions);
  const normalizedPlan = userInputRequest ? null : plan;
  const finalText =
    final ||
    (userInputRequest
      ? "I need a bit more context before I can finish the plan."
      : input.mode === "plan"
      ? `Plan ready for ${input.targetPath || "the current workspace context"}.`
      : normalizedActions.length
        ? `Prepared ${normalizedActions.length} actionable workspace change${normalizedActions.length === 1 ? "" : "s"}.`
        : "No concrete file actions were produced.");

  return { final: finalText, plan: normalizedPlan, actions: normalizedActions, userInputRequest };
}

function buildFallbackNoModelResult(input: {
  request: AssistRuntimeInput;
  plan: AssistPlan;
  targetInference: AssistTargetInference;
  contextSelection: AssistContextSelection;
}): AssistResult {
  const actions = synthesizeDeterministicActions({
    task: input.request.task,
    targetPath: input.targetInference.path,
    mode: input.request.mode,
  });
  const validationPlan = buildValidationPlan({ actions });
  const missingRequirements = input.request.mode === "plan" || actions.length > 0 ? [] : ["actionable_actions_required"];
  const final =
    input.request.mode === "plan"
      ? `Plan ready for ${input.targetInference.path || "the current workspace context"}.`
      : actions.length > 0
        ? `Prepared ${actions.length} deterministic action${actions.length === 1 ? "" : "s"} without a model round-trip.`
        : "No model token is configured, so no concrete file actions were generated. Retry once the default Playground model is available.";
  return buildDecoratedAssistResult({
    request: input.request,
    decision: buildDecision(input.request.mode, input.request.task),
    plan: input.request.mode === "plan" ? input.plan : null,
    actions,
    final,
    validationPlan,
    targetInference: input.targetInference,
    contextSelection: input.contextSelection,
    missingRequirements,
    logs: ["model_fallback=deterministic_synthesis"],
  });
}

export function buildDecoratedAssistResult(input: {
  request: AssistRuntimeInput;
  decision: AssistResult["decision"];
  plan: AssistPlan | null;
  actions: ExecuteAction[];
  final: string;
  validationPlan: AssistValidationPlan;
  targetInference: AssistTargetInference;
  contextSelection: AssistContextSelection;
  missingRequirements: string[];
  userInputRequest?: AssistUserInputRequest | null;
  logs?: string[];
  objectiveState?: AssistObjectiveState;
  progressState?: AssistProgressState;
  modelMetadataOverride?: AssistModelMetadata;
}): AssistResult {
  const intent = inferIntent({
    mode: input.request.mode,
    task: input.request.task,
    targetInference: input.targetInference,
  });
  const reasonCodes = buildReasonCodes({
    intent,
    targetInference: input.targetInference,
    contextSelection: input.contextSelection,
  });
  const autonomyDecision = inferAutonomyDecision({
    mode: input.request.mode,
    actions: input.actions,
    validationPlan: input.validationPlan,
    intent,
  });
  const modelSelection = resolvePlaygroundModelSelection({ requested: input.request.model });
  const modelMetadata: AssistModelMetadata =
    input.modelMetadataOverride || {
      contractVersion: PLAYGROUND_CONTRACT_VERSION,
      adapter: "text_actions_v1",
      modelRequested: modelSelection.requested,
      modelRequestedAlias: modelSelection.requestedAlias,
      modelResolved: modelSelection.resolvedEntry.model,
      modelResolvedAlias: modelSelection.resolvedAlias,
      providerResolved: modelSelection.resolvedEntry.provider,
      capabilities: {
        ...modelSelection.resolvedEntry.capabilities,
      },
      certification: modelSelection.resolvedEntry.certification,
      chatModelSource: input.request.chatModelSource || "platform",
      chatModelAlias: modelSelection.resolvedAlias,
      chatProvider: modelSelection.resolvedEntry.provider,
      orchestratorModelSource:
        input.request.interactionKind === "repo_code"
          ? input.request.orchestratorModelSource || "platform_owned"
          : undefined,
      orchestratorModelAlias:
        input.request.interactionKind === "repo_code" ? modelSelection.resolvedAlias : null,
      orchestratorProvider:
        input.request.interactionKind === "repo_code" ? modelSelection.resolvedEntry.provider : null,
    };
  const commands = input.actions
    .filter((action): action is Extract<ExecuteAction, { type: "command" }> => action.type === "command")
    .map((action) => action.command);
  const toolState = buildToolState();
  const risk = inferRisk(input.request.mode, input.request.task, input.actions);
  const influence = collectInfluence(input.contextSelection);
  const objectiveState =
    input.objectiveState ||
    buildObjectiveState({
      request: input.request,
      intent,
      targetInference: input.targetInference,
      contextSelection: input.contextSelection,
      actions: input.actions,
      missingRequirements: input.missingRequirements,
      plan: input.plan,
      final: input.final,
    });
  const completionStatus: "complete" | "incomplete" =
    !input.userInputRequest && objectiveState.status === "satisfied" && input.missingRequirements.length === 0
      ? "complete"
      : "incomplete";
  const progressState =
    input.progressState ||
    buildProgressState({
      completionStatus,
      objectiveState,
    });
  const nextBestActions = buildNextBestActions(input.request.mode, completionStatus);
  const actionability: AssistResult["actionability"] = {
    summary: completionStatus === "complete" && !input.userInputRequest ? "valid_actions" : "clarification_needed",
    reason:
      completionStatus === "complete" && !input.userInputRequest
        ? "Action set is acceptable for this request."
        : input.missingRequirements[0] || "The run needs a clearer target or more actionable file changes.",
  };
  const agentArtifacts = buildAssistAgentArtifacts({
    mode: input.request.mode,
    task: input.request.task,
    intent,
    decision: input.decision,
    autonomyDecision,
    validationPlan: input.validationPlan,
    actions: input.actions.map((action) =>
      action.type === "command"
        ? { type: action.type, command: action.command }
        : "path" in action
          ? { type: action.type, path: action.path }
          : { type: action.type }
    ),
    commands,
    risk,
    targetInference: {
      path: input.targetInference.path,
      source: input.targetInference.source,
      confidence: input.targetInference.confidence,
    },
    context: input.request.context,
    contextSelection: input.contextSelection,
    toolState: { route: toolState.route },
    modelMetadata: {
      modelResolvedAlias: modelMetadata.modelResolvedAlias,
      providerResolved: modelMetadata.providerResolved,
    },
    completionStatus,
    missingRequirements: input.missingRequirements,
    progressState,
    objectiveState,
    nextBestActions,
    now: new Date(),
  });
  return {
    decision: input.decision,
    intent,
    reasonCodes,
    autonomyDecision,
    plan: input.plan,
    edits: input.actions
      .filter((action): action is Extract<ExecuteAction, { type: "edit" }> => action.type === "edit")
      .map((action) => ({ path: action.path, patch: action.patch, diff: action.diff })),
    commands,
    actions: input.actions,
    final: input.final,
    logs: input.logs || [],
    modelMetadata,
    confidence: input.decision.confidence,
    risk,
    influence,
    validationPlan: input.validationPlan,
    targetInference: input.targetInference,
    contextSelection: input.contextSelection,
    toolState,
    nextBestActions,
    repromptStage: "none",
    actionability,
    completionStatus,
    missingRequirements: input.missingRequirements,
    ...(input.userInputRequest ? { userInputRequest: input.userInputRequest } : {}),
    progressState,
    objectiveState,
    lane: agentArtifacts.lane,
    taskGraph: agentArtifacts.taskGraph,
    checkpoint: agentArtifacts.checkpoint,
    receipt: agentArtifacts.receipt,
    contextTrace: agentArtifacts.contextTrace,
    delegateRuns: agentArtifacts.delegateRuns,
    memoryWrites: agentArtifacts.memoryWrites,
    reviewState: agentArtifacts.reviewState,
    orchestrationProtocol: input.request.orchestrationProtocol || "batch_v1",
    loopState: null,
    pendingToolCall: null,
    toolTrace: [],
  };
}

export async function guardPlaygroundAccess(params: {
  userId: string;
  email: string;
  requestedMaxTokens: number;
  estimatedInputTokens: number;
}): Promise<
  | { allowed: true; limits?: { maxOutputTokens: number } }
  | { allowed: false; status: number; error: string; message: string; details?: Record<string, unknown> }
> {
  if (hasUnlimitedPlaygroundAccess(params.email)) {
    return { allowed: true, limits: { maxOutputTokens: params.requestedMaxTokens } };
  }

  const userPlan = await getUserPlan(params.userId).catch(() => null);
  if (!userPlan) {
    return {
      allowed: false,
      status: 402,
      error: "PLAYGROUND_SUBSCRIPTION_REQUIRED",
      message: "No active playground subscription. Please subscribe to continue.",
    };
  }

  const rateLimit = await checkRateLimits(params.userId, params.requestedMaxTokens, params.estimatedInputTokens).catch(() => null);
  if (!rateLimit) {
    return {
      allowed: false,
      status: 503,
      error: "PLAYGROUND_RATE_LIMIT_UNAVAILABLE",
      message: "Unable to verify Playground quota right now. Please retry.",
    };
  }

  if (!rateLimit.allowed) {
    const status = /request limit|rate/i.test(rateLimit.reason || "") ? 429 : 402;
    return {
      allowed: false,
      status,
      error: status === 429 ? "PLAYGROUND_RATE_LIMITED" : "PLAYGROUND_QUOTA_EXCEEDED",
      message: rateLimit.reason || "Playground quota is currently unavailable.",
      details: rateLimit.limits ? { limits: rateLimit.limits } : undefined,
    };
  }

  return {
    allowed: true,
    limits: rateLimit.limits ? { maxOutputTokens: rateLimit.limits.maxOutputTokens } : undefined,
  };
}

export async function runAssist(request: AssistRuntimeInput, options?: { userId?: string | null }): Promise<AssistResult> {
  const decision = buildDecision(request.mode, request.task);
  const targetInference = buildTargetInference({
    task: request.task,
    context: request.context,
    retrievalHints: request.retrievalHints,
  });
  const contextSelection = buildContextSelection({
    context: request.context,
    targetInference,
    retrievalHints: request.retrievalHints,
    task: request.task,
  });
  const fallbackPlan = buildPlan({
    task: request.task,
    targetInference,
    contextSelection,
  });

  const modelPrompt = buildModelUserPrompt({
    request,
    targetInference,
    contextSelection,
  });

  let rawModelOutput: string | null = null;
  let modelMetadataOverride: AssistModelMetadata | undefined;
  try {
    const resolvedAccess = await resolveChatModelAccess({
      userId: options?.userId,
      requestedModel: request.model,
      requestedSource: request.chatModelSource,
      fallbackToPlatformModel: request.fallbackToPlatformModel,
    });
    const defaultOrchestratorSelection = resolvePlaygroundModelSelection({
      requested: DEFAULT_PLAYGROUND_MODEL_ALIAS,
    });
    modelMetadataOverride = {
      contractVersion: PLAYGROUND_CONTRACT_VERSION,
      adapter: "text_actions_v1",
      modelRequested: request.model || resolvedAccess.requestedModel,
      modelRequestedAlias: request.model || resolvedAccess.requestedAlias,
      modelResolved: resolvedAccess.resolvedModel,
      modelResolvedAlias: resolvedAccess.resolvedAlias,
      providerResolved: resolvedAccess.provider,
      capabilities: { ...resolvedAccess.capabilities },
      certification: resolvedAccess.certification,
      chatModelSource: resolvedAccess.source,
      chatModelAlias: resolvedAccess.resolvedAlias,
      chatProvider: resolvedAccess.provider,
      orchestratorModelSource:
        request.interactionKind === "repo_code"
          ? request.orchestratorModelSource || "platform_owned"
          : undefined,
      orchestratorModelAlias:
        request.interactionKind === "repo_code" ? defaultOrchestratorSelection.resolvedAlias : null,
      orchestratorProvider:
        request.interactionKind === "repo_code"
          ? defaultOrchestratorSelection.resolvedEntry.provider
          : null,
      fallbackApplied: Boolean(resolvedAccess.fallbackApplied),
    };
    rawModelOutput = await callDefaultModel({
      prompt: modelPrompt,
      mode: request.mode,
      maxTokens: request.maxTokens ?? DEFAULT_MAX_TOKENS,
      requestedModel: request.model,
      userId: options?.userId,
      requestedSource: request.chatModelSource,
      fallbackToPlatformModel: request.fallbackToPlatformModel,
    });
  } catch (error) {
    rawModelOutput = JSON.stringify({
      final: `Model call failed: ${error instanceof Error ? error.message : String(error)}`,
      plan: request.mode === "plan" ? fallbackPlan : null,
      actions: [],
    });
  }

  if (!rawModelOutput) {
    return buildFallbackNoModelResult({
      request,
      plan: fallbackPlan,
      targetInference,
      contextSelection,
    });
  }

  const parsed = parseStructuredAssistResponse({
    raw: rawModelOutput,
    mode: request.mode,
    targetPath: targetInference.path,
    fallbackPlan,
  });
  const validationPlan = buildValidationPlan({ actions: parsed.actions });
  const missingRequirements = parsed.userInputRequest
    ? ["user_input_required", ...parsed.userInputRequest.questions.map((question) => question.id)]
    : request.mode === "plan" || parsed.actions.length > 0
      ? []
      : ["actionable_actions_required"];

  return buildDecoratedAssistResult({
    request,
    decision,
    plan: request.mode === "plan" ? parsed.plan || fallbackPlan : parsed.plan,
    actions: request.mode === "plan" ? [] : parsed.actions,
    final: parsed.final,
    validationPlan,
    targetInference,
    contextSelection,
    missingRequirements,
    userInputRequest: parsed.userInputRequest,
    logs: [
      `route=text_actions`,
      `chat_model_source=${modelMetadataOverride?.chatModelSource || request.chatModelSource || "platform"}`,
      `target=${targetInference.path || "none"}`,
      `actions=${parsed.actions.length}`,
      `context_files=${contextSelection.files.length}`,
    ],
    modelMetadataOverride,
  });
}

export function getDefaultModelMetadata(): {
  alias: string;
  provider: PlaygroundModelProvider;
  contractVersion: string;
} {
  const selection = resolvePlaygroundModelSelection();
  return {
    alias: DEFAULT_PLAYGROUND_MODEL_ALIAS,
    provider: selection.resolvedEntry.provider,
    contractVersion: PLAYGROUND_CONTRACT_VERSION,
  };
}








import { checkRateLimits, getUserPlan } from "@/lib/hf-router/rate-limit";
import { hasUnlimitedPlaygroundAccess } from "@/lib/playground/auth";
import {
  DEFAULT_PLAYGROUND_MODEL_ALIAS,
  PLAYGROUND_CONTRACT_VERSION,
  getPlaygroundModelEntry,
  type PlaygroundModelCapabilitySet,
  type PlaygroundModelProvider,
  resolvePlaygroundModelSelection,
} from "@/lib/playground/model-registry";
import {
  buildAssistAgentArtifacts,
  type AssistContextTrace,
  type AssistDelegateRun,
  type AssistExecutionLane,
  type AssistExecutionReceipt,
  type AssistMemoryWrite,
  type AssistReviewState,
  type AssistRunCheckpoint,
  type AssistTaskGraphStage,
  type WorkspaceMemoryState,
} from "@/lib/playground/agent-os";
import { looksLikeShellCommand } from "@/lib/playground/policy";

export type AssistMode = "auto" | "plan" | "yolo" | "generate" | "debug";
export type AssistDecisionMode = "plan" | "generate" | "debug" | "yolo";
export type BudgetStrategy = "relevance" | "recency" | "hybrid";
export type SafetyProfile = "standard" | "aggressive";

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

export type AssistAttachment = {
  mimeType: string;
  name?: string;
  dataUrl?: string;
};

export type AssistAgentConfig = {
  strategy?: "single" | "parallel";
  roles?: Array<"planner" | "implementer" | "reviewer">;
};

export type AssistConversationTurn = {
  role: "user" | "assistant";
  content: string;
};

export type AssistClientPreferences = {
  tone?: "warm_teammate" | "neutral";
  autonomy?: "full_auto" | "preview_first";
  responseStyle?: "concise" | "balanced" | "detailed";
  reasoning?: "low" | "medium" | "high" | "max";
  runProfile?: "standard" | "deep_focus";
};

export type AssistRetrievalHints = {
  mentionedPaths?: string[];
  candidateSymbols?: string[];
  candidateErrors?: string[];
  preferredTargetPath?: string;
  recentTouchedPaths?: string[];
};

export type AssistAutonomyConfig = {
  mode?: "unbounded" | "bounded";
  maxCycles?: number;
  noClarifyToUser?: boolean;
  commandPolicy?: "run_until_done" | "safe_default";
  safetyFloor?: "allow_everything" | "standard";
  failsafe?: "disabled" | "enabled";
};

export type AssistUserProfile = {
  preferredTone?: string | null;
  autonomyMode?: string | null;
  responseStyle?: string | null;
  reasoningPreference?: string | null;
  preferredModelAlias?: string | null;
  sessionSummary?: string | null;
  stablePreferences?: unknown;
};

export type AssistRequest = {
  mode: AssistMode;
  task: string;
  stream?: boolean;
  model?: string;
  max_tokens?: number;
  context?: AssistContext;
  attachments?: AssistAttachment[];
  historySessionId?: string;
  conversationHistory?: AssistConversationTurn[];
  clientPreferences?: AssistClientPreferences;
  retrievalHints?: AssistRetrievalHints;
  autonomy?: AssistAutonomyConfig;
  executionPolicy?: "full_auto" | "yolo_only" | "preview_first";
  userProfile?: AssistUserProfile | null;
  agentConfig?: AssistAgentConfig;
  workflowIntentId?: string;
  contextBudget?: { maxTokens?: number; strategy?: BudgetStrategy };
  safetyProfile?: SafetyProfile;
  clientTrace?: { extensionVersion: string; workspaceHash: string };
};

type AssistRunRuntimeOptions = {
  provider?: "auto" | "hf" | "nvidia";
  nvidiaApiKey?: string;
};

export type AssistModelMetadata = {
  contractVersion: string;
  adapter: "native_tools_v1" | "text_actions_v1";
  modelRequested: string;
  modelRequestedAlias: string;
  modelResolved: string;
  modelResolvedAlias: string;
  providerResolved: PlaygroundModelProvider;
  capabilities: PlaygroundModelCapabilitySet;
  certification: "tool_ready" | "chat_only" | "experimental";
};

export type AssistPlan = {
  objective: string;
  constraints: string[];
  steps: string[];
  acceptanceTests: string[];
  riskFlags: string[];
};

export type AssistRecoveryStage = "none" | "repair" | "tool_enforcement" | "single_file_rewrite" | "fallback";
export type AssistToolRoute = "native_tools" | "text_actions" | "deterministic_synthesis";
export type AssistToolActionSource =
  | "none"
  | "native_tool_calls"
  | "structured_json"
  | "single_file_rewrite_fallback"
  | "deterministic_synthesis";
export type AssistToolFailureCategory =
  | "command_only_for_edit"
  | "schema_invalid"
  | "target_path_missing"
  | "no_content_delta"
  | "validation_failed"
  | "local_apply_failed";
export type AssistToolAttempt = {
  route: AssistToolRoute;
  actionSource: AssistToolActionSource;
  recoveryStage: AssistRecoveryStage;
  success: boolean;
  hasFileActions: boolean;
  hasCommandActions: boolean;
  modelAlias?: string;
  provider?: PlaygroundModelProvider;
  failureCategory?: AssistToolFailureCategory | null;
};
export type AssistToolState = {
  strategy: "standard" | "max_agentic";
  route: AssistToolRoute;
  adapter: AssistModelMetadata["adapter"];
  actionSource: AssistToolActionSource;
  recoveryStage: AssistRecoveryStage;
  commandPolicyResolved: "run_until_done" | "safe_default";
  attempts: AssistToolAttempt[];
  lastFailureCategory: AssistToolFailureCategory | null;
};

export type AssistResult = {
  decision: { mode: AssistDecisionMode; reason: string; confidence: number };
  intent: { type: "conversation" | "code_edit" | "debug" | "plan" | "execute"; confidence: number; delta: number; clarified: boolean };
  reasonCodes: string[];
  autonomyDecision: {
    mode: "no_actions" | "preview_only" | "auto_apply_only" | "auto_apply_and_validate";
    autoApplyEdits: boolean;
    autoRunValidation: boolean;
    confidence: number;
    thresholds: { autoApply: number; autoValidate: number };
    rationale: string;
  };
  validationPlan: {
    scope: "none" | "targeted";
    checks: string[];
    touchedFiles: string[];
    reason: string;
  };
  plan: AssistPlan | null;
  edits: Array<{ path: string; patch: string; rationale?: string }>;
  commands: string[];
  actions: Array<
    | { type: "edit"; path: string; patch: string }
    | { type: "command"; command: string; category?: "implementation" | "validation" }
    | { type: "mkdir"; path: string }
    | { type: "write_file"; path: string; content: string; overwrite?: boolean }
  >;
  final: string;
  logs: string[];
  modelUsed: string;
  modelMetadata: AssistModelMetadata;
  confidence: number;
  risk: { blastRadius: "low" | "medium" | "high"; rollbackComplexity: number };
  influence: { files: string[]; snippets: number };
  targetInference: {
    path?: string;
    confidence: number;
    source: "mention" | "active_file" | "session_memory" | "diagnostic" | "retrieval";
  };
  contextSelection: {
    files: Array<{ path: string; reason: string; score?: number }>;
    snippets: number;
    usedCloudIndex: boolean;
  };
  toolState: AssistToolState;
  nextBestActions: string[];
  repromptStage: AssistRecoveryStage;
  actionability: {
    summary: "valid_actions" | "clarification_needed" | "blocked_by_safety";
    reason: string;
  };
  completionStatus: "complete" | "incomplete";
  missingRequirements: string[];
  lane: AssistExecutionLane;
  taskGraph: AssistTaskGraphStage[];
  checkpoint: AssistRunCheckpoint;
  receipt: AssistExecutionReceipt;
  contextTrace: AssistContextTrace;
  delegateRuns: AssistDelegateRun[];
  memoryWrites: AssistMemoryWrite[];
  reviewState: AssistReviewState;
};

type StructuredAssistOutput = {
  final: string;
  edits: Array<{ path: string; patch: string; rationale?: string }>;
  commands: string[];
  actions?: Array<
    | { type: "edit"; path: string; patch: string }
    | { type: "command"; command: string; category?: "implementation" | "validation" }
    | { type: "mkdir"; path: string }
    | { type: "write_file"; path: string; content: string; overwrite?: boolean }
  >;
};

const HF_ROUTER_BASE_URL = "https://router.huggingface.co/v1";
const NVIDIA_INTEGRATE_BASE_URL = "https://integrate.api.nvidia.com/v1";
const STANDARD_CONTEXT_LIMIT = 32_000;
const LONG_CONTEXT_LIMIT = 262_144;
const DEFAULT_PLAYGROUND_MODEL = DEFAULT_PLAYGROUND_MODEL_ALIAS;
const DEFAULT_NVIDIA_MODEL = "mistralai/mistral-nemotron";
const PUBLIC_PLAYGROUND_MODEL_NAME = "Playground 1";
const IDENTITY_DENIAL_RESPONSE =
  "I'm Playground 1. I'm not Qwen, and I'm not nscale. I can still help with your task - what would you like to do next?";
const COUNTRY_OF_ORIGIN_RESPONSE = "United States of America";
const HF_REQUEST_TIMEOUT_MS = Number(process.env.PLAYGROUND_HF_REQUEST_TIMEOUT_MS || 90_000);
const HF_STREAM_IDLE_TIMEOUT_MS = Number(process.env.PLAYGROUND_HF_STREAM_IDLE_TIMEOUT_MS || 45_000);
const STREAM_RAW_MODEL_TOKENS = process.env.PLAYGROUND_STREAM_MODEL_TOKENS === "1";
const PLAYGROUND_INTELLIGENCE_V2 = process.env.PLAYGROUND_INTELLIGENCE_V2 !== "0";
const AUTO_APPLY_THRESHOLD = 0.72;
const AUTO_VALIDATE_THRESHOLD = 0.8;
type AssistProvider = "hf" | "nvidia";
type ProviderToolSpec = {
  type: "function";
  function: {
    name: string;
    description: string;
    parameters: Record<string, unknown>;
  };
};

type ProviderToolCall = {
  name: string;
  arguments: string;
};

type ProviderChatResult = {
  text: string;
  reasoning: string;
  toolCalls: ProviderToolCall[];
};

function resolveModelAlias(model: string | undefined, fallbackModel: string): string {
  const trimmed = (model || "").trim();
  if (!trimmed) return fallbackModel;
  const normalized = trimmed.toLowerCase();
  if (normalized === "playground" || normalized === "playground ai" || normalized === "playground 1") {
    return fallbackModel;
  }
  return trimmed;
}

function normalizeIdentityProbeText(input: string): string {
  return String(input || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function hasQwenOrNscaleReference(input: string): boolean {
  const normalized = normalizeIdentityProbeText(input);
  if (!normalized) return false;
  if (/\bqwen\b/.test(normalized)) return true;
  if (/\bnscale\b/.test(normalized)) return true;
  if (/\bn scale\b/.test(normalized)) return true;
  return /\bn[\s-]*scale\b/i.test(input);
}

function isQwenOrNscaleIdentityProbe(input: string): boolean {
  const raw = String(input || "");
  const normalized = normalizeIdentityProbeText(raw);
  if (!hasQwenOrNscaleReference(raw)) return false;
  if (/^\s*(qwen|n[\s-]*scale)\s*\??\s*$/i.test(raw)) return true;
  if (/\bwhat is\b/.test(normalized)) return true;
  return /\b(are you|are u|who are you|what are you|is this|is it|do you use|are you using|using|powered by|running on|based on|model)\b/.test(
    normalized
  );
}

function isCountryOriginProbe(input: string): boolean {
  const normalized = normalizeIdentityProbeText(input);
  if (!normalized) return false;
  const targetsAssistant = /\b(you|u|your|ur)\b/.test(normalized);
  if (!targetsAssistant) return false;
  if (/\bwhere are (you|u) from\b/.test(normalized)) return true;
  if (/\bwhat country (are|were) (you|u)\b/.test(normalized)) return true;
  if (/\b(country|origin)\b/.test(normalized) && /\b(from|made|built|created|born)\b/.test(normalized)) return true;
  return /\b(made|built|created|born) in\b/.test(normalized);
}

function sanitizeProviderIdentityLeak(text: string): { text: string; changed: boolean } {
  const raw = String(text || "");
  if (!raw.trim()) return { text: raw, changed: false };
  let out = raw;

  const leakedIdentityPattern =
    /\b(i am|i'm|currently operating as|running as|powered by|model is|using)\b[\s\S]{0,120}\b(qwen|n[\s-]*scale)\b/i;
  if (!leakedIdentityPattern.test(raw) && !/\bqwen\d*\b/i.test(raw)) {
    return { text: raw, changed: false };
  }

  out = out.replace(
    /(^|\n)\s*i am currently operating as[^\n]*/gi,
    (_m, p1) => `${p1}I am ${PUBLIC_PLAYGROUND_MODEL_NAME}, your coding assistant.`
  );
  out = out.replace(
    /\b(i am|i'm)\s+(?:a|an)?\s*(?:language model|model)?\s*(?:by|from)?\s*[^.,;\n]*(qwen|n[\s-]*scale)[^.,;\n]*/gi,
    `I am ${PUBLIC_PLAYGROUND_MODEL_NAME}`
  );
  out = out.replace(/\bqwen\d*(?:[-\w./:]*)?\b/gi, PUBLIC_PLAYGROUND_MODEL_NAME);
  out = out.replace(/\bn[\s-]*scale\b/gi, "our managed inference provider");
  out = out.replace(/\s{2,}/g, " ").trim();
  return { text: out, changed: out !== raw };
}

function isLikelyInvalidModelError(message: string): boolean {
  const lower = message.toLowerCase();
  return (
    lower.includes("model") &&
    (lower.includes("not found") ||
      lower.includes("unknown") ||
      lower.includes("invalid") ||
      lower.includes("does not exist") ||
      lower.includes("unrecognized"))
  );
}

function isLikelyProviderLimitError(message: string): boolean {
  const lower = message.toLowerCase();
  return (
    lower.includes("monthly included credits") ||
    lower.includes("pre-paid credits") ||
    lower.includes("purchase pre-paid credits") ||
    lower.includes("subscribe to pro") ||
    lower.includes("credits to continue")
  );
}

function isLikelyModelFallbackEligibleError(message: string): boolean {
  return isLikelyInvalidModelError(message) || isLikelyProviderLimitError(message);
}

function isLikelyNativeToolRouteFailureError(message: string): boolean {
  const lower = String(message || "").toLowerCase();
  return (
    lower.includes("tool_use_failed") ||
    lower.includes("failed to parse tool call arguments as json") ||
    (lower.includes("tool call") && lower.includes("arguments") && lower.includes("json")) ||
    (lower.includes("invalid_request_error") && lower.includes("tool"))
  );
}

function isLikelyAttachmentUnsupportedError(message: string): boolean {
  const lower = message.toLowerCase();
  return (
    lower.includes("image_url") ||
    lower.includes("multimodal") ||
    lower.includes("vision") ||
    lower.includes("image input") ||
    (lower.includes("unsupported") && lower.includes("image")) ||
    (lower.includes("invalid") && lower.includes("image")) ||
    (lower.includes("content") && lower.includes("type")) ||
    lower.includes("textencodeinput")
  );
}

function getHfRouterToken(): string | undefined {
  return process.env.HF_ROUTER_TOKEN || process.env.HF_TOKEN || process.env.HUGGINGFACE_TOKEN;
}

function getNvidiaToken(runtimeOverride?: string): string | undefined {
  const direct = String(runtimeOverride || "").trim();
  if (direct) return direct;
  return (
    process.env.PLAYGROUND_NVIDIA_API_KEY ||
    process.env.NVIDIA_API_KEY ||
    process.env.NVAPI_KEY ||
    process.env.NVIDIA_INTEGRATE_API_KEY
  );
}

function getAvailableProviders(runtimeNvidiaApiKey?: string): AssistProvider[] {
  const out: AssistProvider[] = [];
  if (getHfRouterToken()) out.push("hf");
  if (getNvidiaToken(runtimeNvidiaApiKey)) out.push("nvidia");
  return out;
}

function resolveProviderModel(provider: AssistProvider, candidateModel: string): string {
  const raw = String(candidateModel || "").trim();
  if (provider !== "nvidia") return raw;
  if (raw) return raw;
  const configured = resolveModelAlias(process.env.PLAYGROUND_NVIDIA_MODEL, DEFAULT_NVIDIA_MODEL);
  return configured || DEFAULT_NVIDIA_MODEL;
}

function buildNativeToolSpecs(input: { allowCommands: boolean }): ProviderToolSpec[] {
  const tools: ProviderToolSpec[] = [
    {
      type: "function",
      function: {
        name: "apply_edit",
        description: "Apply a unified diff patch to a workspace-relative file.",
        parameters: {
          type: "object",
          additionalProperties: false,
          required: ["path", "patch"],
          properties: {
            path: { type: "string", description: "Workspace-relative file path." },
            patch: { type: "string", description: "Unified diff patch for the file." },
            rationale: { type: "string", description: "Optional one-line rationale." },
          },
        },
      },
    },
    {
      type: "function",
      function: {
        name: "write_file",
        description: "Write full file content to a workspace-relative file.",
        parameters: {
          type: "object",
          additionalProperties: false,
          required: ["path", "content"],
          properties: {
            path: { type: "string", description: "Workspace-relative file path." },
            content: { type: "string", description: "Complete updated file content." },
            overwrite: { type: "boolean", description: "Overwrite existing file contents when true." },
          },
        },
      },
    },
    {
      type: "function",
      function: {
        name: "mkdir",
        description: "Create a workspace-relative directory.",
        parameters: {
          type: "object",
          additionalProperties: false,
          required: ["path"],
          properties: {
            path: { type: "string", description: "Workspace-relative directory path." },
          },
        },
      },
    },
  ];
  if (input.allowCommands) {
    tools.push({
      type: "function",
      function: {
        name: "run_command",
        description: "Run a safe shell command after edits or for validation.",
        parameters: {
          type: "object",
          additionalProperties: false,
          required: ["command"],
          properties: {
            command: { type: "string", description: "Runnable shell command." },
            category: {
              type: "string",
              enum: ["implementation", "validation"],
              description: "Whether this command changes implementation or validates it.",
            },
          },
        },
      },
    });
  }
  return tools;
}

function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

function describeErrorWithCause(error: unknown): string {
  if (error instanceof Error) {
    const base = String(error.message || "unknown error").trim();
    const cause = (error as Error & { cause?: unknown }).cause;
    if (!cause) return base;
    if (cause instanceof Error) {
      const causeMsg = String(cause.message || "").trim();
      if (!causeMsg) return base;
      if (base.toLowerCase().includes(causeMsg.toLowerCase())) return base;
      return `${base} (cause: ${causeMsg})`;
    }
    if (typeof cause === "object" && cause) {
      const code = String((cause as { code?: unknown }).code || "").trim();
      const msg = String((cause as { message?: unknown }).message || "").trim();
      const detail = [code, msg].filter(Boolean).join(" ");
      if (detail) return `${base} (cause: ${detail})`;
    }
    const raw = String(cause).trim();
    if (!raw) return base;
    return `${base} (cause: ${raw})`;
  }
  return String(error || "unknown error");
}

function trimContextByBudget(context: AssistContext | undefined, maxTokens: number, strategy: BudgetStrategy): AssistContext | undefined {
  if (!context) return context;
  const budget = Math.max(1024, Math.min(maxTokens, LONG_CONTEXT_LIMIT));
  const out: AssistContext = {
    activeFile: context.activeFile,
    openFiles: [],
    diagnostics: [],
    git: context.git,
    indexedSnippets: [],
  };

  let used = estimateTokens(JSON.stringify(out.activeFile ?? {})) + estimateTokens(JSON.stringify(out.git ?? {}));
  const remaining = () => budget - used;

  const openFiles = [...(context.openFiles ?? [])];
  const snippets = [...(context.indexedSnippets ?? [])];
  if (strategy === "relevance" || strategy === "hybrid") {
    snippets.sort((a, b) => (b.score ?? 0) - (a.score ?? 0));
  }
  if (strategy === "recency") {
    openFiles.reverse();
  }

  for (const file of openFiles) {
    const cost = estimateTokens(`${file.path}\n${file.excerpt ?? ""}`);
    if (cost > remaining()) break;
    out.openFiles?.push(file);
    used += cost;
  }
  for (const diag of context.diagnostics ?? []) {
    const cost = estimateTokens(`${diag.file ?? ""}:${diag.line ?? ""} ${diag.message}`);
    if (cost > remaining()) break;
    out.diagnostics?.push(diag);
    used += cost;
  }
  for (const snippet of snippets) {
    const cost = estimateTokens(`${snippet.path ?? ""}\n${snippet.content}`);
    if (cost > remaining()) break;
    out.indexedSnippets?.push(snippet);
    used += cost;
  }
  return out;
}

function buildPlan(task: string, context?: AssistContext): AssistPlan {
  const constraints: string[] = [];
  if (context?.activeFile?.path) constraints.push(`Respect conventions in ${context.activeFile.path}`);
  if (context?.diagnostics?.length) constraints.push("Address existing diagnostics where relevant");
  if (context?.git?.diffSummary) constraints.push("Avoid regressing unstaged local changes");
  if (!constraints.length) constraints.push("Keep scope minimal and production-safe");

  return {
    objective: task,
    constraints,
    steps: [
      "Understand requirement and scan impacted files.",
      "Implement smallest safe change set.",
      "Run targeted validation/tests and inspect output.",
      "Document behavior changes and migration/rollback notes.",
    ],
    acceptanceTests: [
      "Primary user flow succeeds end-to-end.",
      "No new lint/type/runtime errors in touched areas.",
      "Error paths return actionable messages.",
    ],
    riskFlags: [
      "Hidden coupling with environment configuration.",
      "Behavior drift due to stale assumptions in prompts.",
    ],
  };
}

function hasPathMention(task: string): boolean {
  return /\b[a-zA-Z0-9_./-]+\.[a-z0-9]{1,8}\b/i.test(task);
}

function normalizeIntentTypos(task: string): string {
  return String(task || "")
    .replace(/\bcretae\b/gi, "create")
    .replace(/\bimplment\b/gi, "implement")
    .replace(/\bupadte\b/gi, "update");
}

function hasExplicitEditRequest(task: string): boolean {
  const normalized = normalizeIntentTypos(task);
  return /\b(edit|update|modify|rewrite|change|refactor|implement|create|add|remove|delete|fix|patch|apply)\b/i.test(normalized);
}

function hasCodeTaskSignals(task: string): boolean {
  const normalized = normalizeIntentTypos(task);
  return (
    /\b(code|file|function|class|bug|error|fix|refactor|implement|build|test|lint|typecheck|stack trace|exception|module|api|endpoint|sql|schema|patch|edit|debug|feature|python|javascript|typescript|trailing stop|stop loss|indicator|strategy|trading bot|algo)\b/i.test(normalized)
  );
}

function isQuestionLike(task: string): boolean {
  const lower = task.toLowerCase().trim();
  return (
    /\?$/.test(lower) ||
    /^(what|why|how|when|where|who|which|can|could|would|should|is|are|do|does|did)\b/.test(lower) ||
    /\b(explain|define|tell me)\b/.test(lower)
  );
}

function isGreetingLike(task: string): boolean {
  return /^(hi|hello|hey|yo|sup|thanks|thank you|thx)\b/i.test(task.trim());
}

function isAcknowledgementLike(task: string): boolean {
  const trimmed = task.trim().toLowerCase();
  if (!trimmed || trimmed.length > 48) return false;
  return /^(awesome|great|nice|cool|perfect|sounds good|looks good|love it|that works|works for me|sweet|beautiful|amazing)\b/.test(trimmed);
}

type AssistIntentType = "conversation" | "code_edit" | "debug" | "plan" | "execute";

type IntentResolution = {
  intent: AssistIntentType;
  confidence: number;
  delta: number;
  clarified: boolean;
  reasonCodes: string[];
  scoreSnapshot: Record<AssistIntentType, number>;
};

type RouteFeatures = {
  questionLike: boolean;
  greetingLike: boolean;
  acknowledgementLike: boolean;
  codeSignals: boolean;
  pathMention: boolean;
  explicitEditRequest: boolean;
  hasContext: boolean;
  debugWords: boolean;
  planWords: boolean;
  executeWords: boolean;
  shortFollowup: boolean;
  lastAssistantWasPlan: boolean;
  lastAssistantHadPatchLike: boolean;
  followupRef: boolean;
};

function collectRouteFeatures(input: {
  task: string;
  context?: AssistContext;
  conversationHistory?: AssistConversationTurn[];
}): RouteFeatures {
  const lower = input.task.toLowerCase();
  const history = input.conversationHistory ?? [];
  const lastAssistant = [...history].reverse().find((turn) => turn.role === "assistant")?.content || "";
  const shortFollowup = input.task.trim().length <= 80;
  const followupRef = /\b(inside|same file|that file|that one|use that|in there|there|please|same)\b/i.test(input.task);

  return {
    questionLike: isQuestionLike(input.task),
    greetingLike: isGreetingLike(input.task),
    acknowledgementLike: isAcknowledgementLike(input.task),
    codeSignals: hasCodeTaskSignals(input.task),
    pathMention: hasPathMention(input.task),
    explicitEditRequest: hasExplicitEditRequest(input.task),
    hasContext: Boolean(
      input.context?.activeFile?.path ||
      (input.context?.openFiles?.length ?? 0) > 0 ||
      (input.context?.indexedSnippets?.length ?? 0) > 0
    ),
    debugWords: /\b(error|bug|fix|failing|crash|exception|trace|stack|not working)\b/i.test(lower),
    planWords: /\b(plan|design|architecture|roadmap|spec|approach|strategy)\b/i.test(lower),
    executeWords: /\b(run|execute|terminal|shell|command|test|lint|typecheck|build|compile|install)\b/i.test(lower),
    shortFollowup,
    lastAssistantWasPlan: /\bobjective:|acceptance tests:|risk flags:|steps:\b/i.test(lastAssistant),
    lastAssistantHadPatchLike: /diff --git|@@\s*-\d+,\d+\s+\+\d+,\d+\s*@@|\{"final":/i.test(lastAssistant),
    followupRef,
  };
}

function roundIntentScores(scores: Record<AssistIntentType, number>): Record<AssistIntentType, number> {
  return {
    conversation: Number(scores.conversation.toFixed(4)),
    code_edit: Number(scores.code_edit.toFixed(4)),
    debug: Number(scores.debug.toFixed(4)),
    plan: Number(scores.plan.toFixed(4)),
    execute: Number(scores.execute.toFixed(4)),
  };
}

function scoreIntentRoute(features: RouteFeatures): { scores: Record<AssistIntentType, number>; reasonCodes: string[] } {
  const scores: Record<AssistIntentType, number> = {
    conversation: 0.08,
    code_edit: 0.08,
    debug: 0.08,
    plan: 0.08,
    execute: 0.08,
  };
  const reasonCodes: string[] = [];

  if (features.greetingLike) {
    scores.conversation += 0.38;
    reasonCodes.push("greeting_or_smalltalk");
  }
  if (features.acknowledgementLike) {
    scores.conversation += 0.34;
    reasonCodes.push("acknowledgement_smalltalk");
  }
  if (features.questionLike && !features.codeSignals) {
    scores.conversation += 0.34;
    reasonCodes.push("question_without_code_signal");
  }
  if (features.codeSignals) {
    scores.code_edit += 0.24;
    reasonCodes.push("code_task_signal");
  }
  if (features.explicitEditRequest) {
    scores.code_edit += 0.22;
    reasonCodes.push("explicit_edit_request");
  }
  const questionAboutPath = features.pathMention && features.questionLike;
  if (features.pathMention && (features.explicitEditRequest || !questionAboutPath)) {
    scores.code_edit += 0.2;
    reasonCodes.push("path_mentioned");
  } else if (questionAboutPath) {
    scores.conversation += 0.22;
    reasonCodes.push("path_mentioned_question_bias_conversation");
  }
  if (features.debugWords) {
    scores.debug += 0.42;
    reasonCodes.push("debug_keywords");
  }
  if (features.planWords) {
    scores.plan += 0.42;
    reasonCodes.push("planning_keywords");
  }
  if (features.executeWords) {
    scores.execute += 0.36;
    reasonCodes.push("execution_keywords");
  }
  if (features.hasContext && features.codeSignals) {
    scores.code_edit += 0.14;
    reasonCodes.push("ide_context_present");
  }
  if (features.lastAssistantHadPatchLike && features.shortFollowup && features.followupRef) {
    scores.code_edit += 0.22;
    reasonCodes.push("followup_bound_to_previous_edit");
  }
  if (features.lastAssistantWasPlan && features.shortFollowup && features.followupRef) {
    scores.execute += 0.1;
    reasonCodes.push("followup_bound_to_previous_plan");
  }

  return { scores, reasonCodes };
}

function applyClarificationPass(
  task: string,
  features: RouteFeatures,
  scores: Record<AssistIntentType, number>,
  reasonCodes: string[]
): { scores: Record<AssistIntentType, number>; reasonCodes: string[]; clarified: boolean } {
  const entries = Object.entries(scores).sort((a, b) => b[1] - a[1]) as Array<[AssistIntentType, number]>;
  const top = entries[0]?.[1] ?? 0;
  const second = entries[1]?.[1] ?? 0;
  if (top - second > 0.12) {
    return { scores, reasonCodes, clarified: false };
  }

  const next = { ...scores };
  let clarified = false;
  if (isAcknowledgementLike(task) && !features.explicitEditRequest && !features.executeWords && !features.debugWords) {
    next.conversation += 0.28;
    clarified = true;
    reasonCodes.push("clarification_acknowledgement_bias");
  }
  if (features.shortFollowup && features.followupRef && features.lastAssistantHadPatchLike) {
    next.code_edit += 0.18;
    clarified = true;
    reasonCodes.push("clarification_followup_edit_bias");
  }
  if (isQuestionLike(task) && !features.executeWords && !features.debugWords && !/\b(create|write|edit|file)\b/i.test(task)) {
    next.conversation += 0.12;
    clarified = true;
    reasonCodes.push("clarification_question_bias");
  }
  if (features.executeWords && /\b(run|execute|test|lint|typecheck)\b/i.test(task)) {
    next.execute += 0.1;
    clarified = true;
    reasonCodes.push("clarification_execution_bias");
  }

  return { scores: next, reasonCodes, clarified };
}

function mapIntentToDecision(intent: AssistIntentType): AssistDecisionMode {
  if (intent === "debug") return "debug";
  if (intent === "plan") return "plan";
  if (intent === "execute") return "yolo";
  return "generate";
}

function buildDecisionReason(intent: AssistIntentType): string {
  if (intent === "conversation") return "Natural language conversation detected.";
  if (intent === "code_edit") return "Code editing intent detected from task + context.";
  if (intent === "debug") return "Debugging intent detected from error-oriented language.";
  if (intent === "plan") return "Planning/spec intent detected.";
  return "Execution intent detected from command-run language.";
}

export function resolveIntentRouting(input: {
  task: string;
  context?: AssistContext;
  conversationHistory?: AssistConversationTurn[];
  forceLegacy?: boolean;
}): IntentResolution {
  const forceLegacy = typeof input.forceLegacy === "boolean" ? input.forceLegacy : !PLAYGROUND_INTELLIGENCE_V2;
  if (forceLegacy) {
    const legacy = classifyMode(input.task);
    const legacyIntent: AssistIntentType =
      legacy.mode === "debug" ? "debug" :
      legacy.mode === "plan" ? "plan" :
      legacy.mode === "yolo" ? "execute" :
      hasCodeEditIntent(input.task) ? "code_edit" : "conversation";
    return {
      intent: legacyIntent,
      confidence: legacy.confidence,
      delta: 0.2,
      clarified: false,
      reasonCodes: ["legacy_mode_classifier"],
      scoreSnapshot: {
        conversation: legacyIntent === "conversation" ? legacy.confidence : 0.05,
        code_edit: legacyIntent === "code_edit" ? legacy.confidence : 0.05,
        debug: legacyIntent === "debug" ? legacy.confidence : 0.05,
        plan: legacyIntent === "plan" ? legacy.confidence : 0.05,
        execute: legacyIntent === "execute" ? legacy.confidence : 0.05,
      },
    };
  }

  const features = collectRouteFeatures(input);
  const first = scoreIntentRoute(features);
  const clarified = applyClarificationPass(input.task, features, first.scores, [...first.reasonCodes]);
  const entries = Object.entries(clarified.scores).sort((a, b) => b[1] - a[1]) as Array<[AssistIntentType, number]>;
  const top = entries[0] ?? ["conversation", 0.1];
  const second = entries[1] ?? ["conversation", 0.08];
  const sum = entries.reduce((acc, [, value]) => acc + value, 0.0001);
  const confidence = Math.max(0.05, Math.min(0.99, top[1] / sum + 0.1));

  return {
    intent: top[0],
    confidence: Number(confidence.toFixed(4)),
    delta: Number((top[1] - second[1]).toFixed(4)),
    clarified: clarified.clarified,
    reasonCodes: clarified.reasonCodes,
    scoreSnapshot: roundIntentScores(clarified.scores),
  };
}

function classifyMode(task: string): { mode: AssistDecisionMode; reason: string; confidence: number } {
  const lower = normalizeIntentTypos(task).toLowerCase().trim();
  const questionLike = isQuestionLike(lower);

  if (/\b(what model|which model|who are you|what are you)\b/.test(lower)) {
    return { mode: "generate", reason: "Task is conversational/identity and should answer directly.", confidence: 0.82 };
  }
  if (questionLike && !hasCodeTaskSignals(lower)) {
    return { mode: "generate", reason: "Task is informational and should receive a direct answer.", confidence: 0.78 };
  }
  if (/\b(error|bug|fix|failing|crash|exception|trace|stack)\b/.test(lower)) {
    return { mode: "debug", reason: "Task appears defect-oriented.", confidence: 0.86 };
  }
  if (/\b(plan|design|architecture|roadmap|spec|approach)\b/.test(lower)) {
    return { mode: "plan", reason: "Task asks for planning/specification.", confidence: 0.88 };
  }
  if (/\brefactor|implement|build|create|add|ship|feature\b/.test(lower)) {
    return { mode: "generate", reason: "Task asks for implementation output.", confidence: 0.74 };
  }
  return {
    mode: "generate",
    reason: "Ambiguous request; defaulting to direct response instead of plan-only output.",
    confidence: 0.58,
  };
}

function extractReasoningPreference(workflowIntentId?: string): "low" | "medium" | "high" | "max" | null {
  if (!workflowIntentId) return null;
  const m = /^reasoning:(low|medium|high|max)$/i.exec(workflowIntentId.trim());
  if (!m?.[1]) return null;
  return m[1].toLowerCase() as "low" | "medium" | "high" | "max";
}

export function contextToPrompt(context?: AssistContext, attachments?: AssistAttachment[]): string {
  const parts: string[] = [];
  if (context?.activeFile) {
    parts.push(
      `Active file: ${context.activeFile.path ?? "unknown"} (${context.activeFile.language ?? "unknown"})`
    );
    if (context.activeFile.selection) parts.push(`Selection:\n${context.activeFile.selection}`);
    if (context.activeFile.content) parts.push(`Content:\n${context.activeFile.content}`);
  }
  if (context?.openFiles?.length) {
    parts.push(
      `Open files:\n${context.openFiles
        .slice(0, 12)
        .map((f) => {
          const header = `- ${f.path} (${f.language ?? "unknown"})`;
          const excerpt = String(f.excerpt || "").trim();
          return excerpt ? `${header}\n${excerpt}` : header;
        })
        .join("\n\n")}`
    );
  }
  if (context?.diagnostics?.length) {
    parts.push(
      `Diagnostics:\n${context.diagnostics
        .slice(0, 20)
        .map((d) => `- ${d.file ?? "file"}:${d.line ?? "?"} ${d.severity ?? "info"} ${d.message}`)
        .join("\n")}`
    );
  }
  if (context?.git?.diffSummary) parts.push(`Git diff summary:\n${context.git.diffSummary}`);
  if (context?.indexedSnippets?.length) {
    parts.push(
      `Indexed snippets:\n${context.indexedSnippets
        .slice(0, 12)
        .map((s) => {
          const prefix = [s.path ?? "path", s.reason ? `(${s.reason})` : "", s.source ? `[${s.source}]` : ""]
            .filter(Boolean)
            .join(" ");
          return `- ${prefix}: ${s.content.slice(0, 600)}`;
        })
        .join("\n")}`
    );
  }
  if (attachments?.length) {
    const labels = attachments
      .slice(0, 6)
      .map((attachment, idx) => attachment.name || `image-${idx + 1}`)
      .join(", ");
    parts.push(`Attachments: ${attachments.length} image(s) included (${labels})`);
  }
  return parts.join("\n\n");
}

function conversationToPrompt(history?: AssistConversationTurn[]): string {
  if (!history?.length) return "";
  const turns = history
    .filter((turn) => turn && (turn.role === "user" || turn.role === "assistant") && typeof turn.content === "string")
    .slice(-8)
    .map((turn) => ({
      role: turn.role,
      content: turn.content.replace(/\r\n/g, "\n").trim().slice(0, 4000),
    }))
    .filter((turn) => turn.content.length > 0);
  if (!turns.length) return "";
  return [
    "Recent conversation context (most recent last):",
    ...turns.map((turn) => `${turn.role.toUpperCase()}: ${turn.content}`),
  ].join("\n\n");
}

function profileToPrompt(
  profile?: AssistUserProfile | null,
  clientPreferences?: AssistClientPreferences,
  autonomyConfig?: AssistAutonomyConfig
): string {
  const parts: string[] = [];
  const tone = clientPreferences?.tone || profile?.preferredTone || "warm_teammate";
  const autonomy = clientPreferences?.autonomy || profile?.autonomyMode || "full_auto";
  const style = clientPreferences?.responseStyle || profile?.responseStyle || "balanced";
  const reasoning = clientPreferences?.reasoning || profile?.reasoningPreference || "medium";
  const stablePreferences =
    profile?.stablePreferences && typeof profile.stablePreferences === "object"
      ? (profile.stablePreferences as Record<string, unknown>)
      : {};
  const runProfile =
    clientPreferences?.runProfile ||
    (typeof stablePreferences.runProfile === "string" ? stablePreferences.runProfile : "") ||
    "standard";

  parts.push(`User preference: tone=${tone}, autonomy=${autonomy}, style=${style}, reasoning=${reasoning}, runProfile=${runProfile}.`);
  if (autonomyConfig) {
    parts.push(
      `Autonomy runtime: mode=${autonomyConfig.mode || "bounded"}, maxCycles=${autonomyConfig.maxCycles ?? "default"}, noClarify=${autonomyConfig.noClarifyToUser === true ? "true" : "false"}, commandPolicy=${autonomyConfig.commandPolicy || "safe_default"}, safetyFloor=${autonomyConfig.safetyFloor || "standard"}, failsafe=${autonomyConfig.failsafe || "enabled"}.`
    );
  }
  return parts.join("\n");
}

function getStablePreferences(profile?: AssistUserProfile | null): Record<string, unknown> {
  return profile?.stablePreferences && typeof profile.stablePreferences === "object"
    ? (profile.stablePreferences as Record<string, unknown>)
    : {};
}

function toCleanPathArray(value: unknown, limit = 12): string[] {
  if (!Array.isArray(value)) return [];
  const out: string[] = [];
  const seen = new Set<string>();
  for (const item of value) {
    const normalized = normalizeRelativePath(String(item || ""));
    if (!normalized || seen.has(normalized)) continue;
    seen.add(normalized);
    out.push(normalized);
    if (out.length >= limit) break;
  }
  return out;
}

function toCleanStringArray(value: unknown, limit = 12, maxLen = 512): string[] {
  if (!Array.isArray(value)) return [];
  const out: string[] = [];
  const seen = new Set<string>();
  for (const item of value) {
    const normalized = String(item || "").trim();
    const key = normalized.toLowerCase();
    if (!normalized || normalized.length > maxLen || seen.has(key)) continue;
    seen.add(key);
    out.push(normalized);
    if (out.length >= limit) break;
  }
  return out;
}

function resolveRunProfile(
  clientPreferences?: AssistClientPreferences,
  profile?: AssistUserProfile | null
): "standard" | "deep_focus" {
  if (clientPreferences?.runProfile === "deep_focus" || clientPreferences?.runProfile === "standard") {
    return clientPreferences.runProfile;
  }
  const stablePreferences = getStablePreferences(profile);
  return stablePreferences.runProfile === "deep_focus" ? "deep_focus" : "standard";
}

function readSessionMemory(profile?: AssistUserProfile | null): {
  lastTargetPath?: string;
  recentTouchedPaths: string[];
  lastValidationCommands: string[];
  latestCompletionBlockers: string[];
} {
  const stablePreferences = getStablePreferences(profile);
  const rawMemory =
    stablePreferences.sessionMemory && typeof stablePreferences.sessionMemory === "object"
      ? (stablePreferences.sessionMemory as Record<string, unknown>)
      : {};
  const lastTargetPath = normalizeRelativePath(String(rawMemory.lastTargetPath || ""));
  return {
    ...(lastTargetPath ? { lastTargetPath } : {}),
    recentTouchedPaths: toCleanPathArray(rawMemory.recentTouchedPaths, 12),
    lastValidationCommands: toCleanStringArray(rawMemory.lastValidationCommands, 8, 2000),
    latestCompletionBlockers: toCleanStringArray(rawMemory.latestCompletionBlockers, 8, 1000),
  };
}

function readWorkspaceMemory(profile?: AssistUserProfile | null, workspaceFingerprint?: string): WorkspaceMemoryState | null {
  const stablePreferences = getStablePreferences(profile);
  const workspaceMemory =
    stablePreferences.workspaceMemory && typeof stablePreferences.workspaceMemory === "object"
      ? (stablePreferences.workspaceMemory as Record<string, unknown>)
      : {};
  const workspaceKey = String(workspaceFingerprint || "").trim();
  const record =
    workspaceKey && workspaceMemory[workspaceKey] && typeof workspaceMemory[workspaceKey] === "object"
      ? (workspaceMemory[workspaceKey] as Record<string, unknown>)
      : null;
  if (!record) return null;
  return {
    workspaceFingerprint: workspaceKey,
    ...(typeof record.summary === "string" && record.summary.trim()
      ? { summary: String(record.summary).trim().slice(0, 4000) }
      : {}),
    promotedMemories: toCleanStringArray(record.promotedMemories, 12, 512),
    touchedPaths: toCleanPathArray(record.touchedPaths, 16),
    enabled: record.enabled !== false,
    updatedAt: typeof record.updatedAt === "string" ? String(record.updatedAt) : undefined,
  };
}

function shouldUseTwoPassCodeGeneration(
  task: string,
  codeEditIntent: boolean,
  context?: AssistContext,
  reasoningPreference?: AssistClientPreferences["reasoning"] | string | null,
  runProfile: "standard" | "deep_focus" = "standard"
): boolean {
  if (!PLAYGROUND_INTELLIGENCE_V2 || !codeEditIntent) return false;
  if (runProfile !== "deep_focus" && (reasoningPreference === "low" || reasoningPreference === "medium")) return false;
  const complexitySignal =
    task.length > 220 ||
    /\b(robust|end-to-end|production|architecture|multi-file|refactor|migration|validate|guardrail|comprehensive|optimize|performance|latency|scaling)\b/i.test(task) ||
    (context?.openFiles?.length ?? 0) >= 6 ||
    (context?.diagnostics?.length ?? 0) >= 8;
  return runProfile === "deep_focus" || complexitySignal;
}

function sanitizeAttachmentsForModel(attachments?: AssistAttachment[]): AssistAttachment[] {
  if (!attachments?.length) return [];
  return attachments
    .filter((attachment) => {
      if (!attachment || typeof attachment !== "object") return false;
      if (!attachment.dataUrl || typeof attachment.dataUrl !== "string") return false;
      const mime = String(attachment.mimeType || "").toLowerCase();
      if (!["image/png", "image/jpeg", "image/webp"].includes(mime)) return false;
      return new RegExp(`^data:${mime};base64,`, "i").test(attachment.dataUrl);
    })
    .slice(0, 3)
    .map((attachment) => ({
      mimeType: String(attachment.mimeType || "").toLowerCase(),
      ...(attachment.name ? { name: String(attachment.name).slice(0, 255) } : {}),
      dataUrl: String(attachment.dataUrl || ""),
    }));
}

function buildUserMessageContent(prompt: string, attachments?: AssistAttachment[]) {
  if (!attachments?.length) return prompt;
  const parts: Array<{ type: "text"; text: string } | { type: "image_url"; image_url: { url: string } }> = [
    { type: "text", text: prompt },
  ];
  for (const attachment of attachments) {
    if (!attachment.dataUrl) continue;
    parts.push({
      type: "image_url",
      image_url: { url: attachment.dataUrl },
    });
  }
  return parts;
}

function coerceStreamText(value: unknown): string {
  if (typeof value === "string") return value;
  if (Array.isArray(value)) {
    return value.map((item) => coerceStreamText(item)).join("");
  }
  if (!value || typeof value !== "object") return "";
  const record = value as Record<string, unknown>;
  if (typeof record.text === "string") return record.text;
  if (typeof record.content === "string") return record.content;
  if (typeof record.reasoning_content === "string") return record.reasoning_content;
  if (typeof record.reasoning === "string") return record.reasoning;
  return "";
}

function extractStreamPieces(payload: unknown): { content: string; reasoning: string } {
  if (!payload || typeof payload !== "object") return { content: "", reasoning: "" };
  const parsed = payload as {
    choices?: Array<{
      delta?: Record<string, unknown>;
      message?: Record<string, unknown>;
      text?: unknown;
    }>;
    delta?: Record<string, unknown>;
    message?: Record<string, unknown>;
    text?: unknown;
    content?: unknown;
    reasoning?: unknown;
    reasoning_content?: unknown;
    thinking?: unknown;
  };
  const choice = parsed.choices?.[0];
  const delta = choice?.delta;
  const message = choice?.message;
  const content =
    coerceStreamText(delta?.content) ||
    coerceStreamText(message?.content) ||
    coerceStreamText(choice?.text) ||
    coerceStreamText(parsed.content) ||
    coerceStreamText(parsed.text);
  const reasoning =
    coerceStreamText(delta?.reasoning_content) ||
    coerceStreamText(delta?.reasoning) ||
    coerceStreamText(delta?.thinking) ||
    coerceStreamText(message?.reasoning_content) ||
    coerceStreamText(message?.reasoning) ||
    coerceStreamText(parsed.reasoning_content) ||
    coerceStreamText(parsed.reasoning) ||
    coerceStreamText(parsed.thinking);
  return { content, reasoning };
}

function extractToolCalls(payload: unknown): ProviderToolCall[] {
  if (!payload || typeof payload !== "object") return [];
  const parsed = payload as {
    choices?: Array<{
      message?: {
        tool_calls?: Array<{
          function?: { name?: unknown; arguments?: unknown };
        }>;
      };
    }>;
    tool_calls?: Array<{
      function?: { name?: unknown; arguments?: unknown };
    }>;
  };
  const toolCalls = parsed.choices?.[0]?.message?.tool_calls ?? parsed.tool_calls ?? [];
  const out: ProviderToolCall[] = [];
  for (const item of toolCalls) {
    const name = typeof item?.function?.name === "string" ? item.function.name.trim() : "";
    const args = typeof item?.function?.arguments === "string" ? item.function.arguments.trim() : "";
    if (!name) continue;
    out.push({ name, arguments: args || "{}" });
  }
  return out;
}

function baseProviderSystemPrompt(input?: {
  conversational?: boolean;
  workspaceContextAvailable?: boolean;
  actionContract?: string;
}): string {
  const conversational = input?.conversational === true;
  const workspaceContextAvailable = input?.workspaceContextAvailable === true;
  const actionContract = String(input?.actionContract || "").trim();

  if (conversational) {
    return [
      "You are Playground AI.",
      "Be helpful, natural, and concise in conversation.",
      "Answer the user's actual question directly and do not roleplay as an autonomous coding agent unless the task explicitly turns into code work.",
      workspaceContextAvailable
        ? "Only mention workspace or file context if it is genuinely relevant to the user's request."
        : "Do not claim to be inspecting, analyzing, scanning, or reading project files, the repository, or the workspace unless the user explicitly asks for codebase help.",
      "Be factual and avoid fabrications. If you are unsure, say so and suggest how to verify.",
      "If the user corrects you, acknowledge the correction and update your answer.",
      `If asked whether you are Qwen or nscale (or what nscale is in your identity/provider context), deny both and state you are ${PUBLIC_PLAYGROUND_MODEL_NAME}.`,
    ].join(" ");
  }

  return [
    `You are Playground AI. Be practical, concise, and execution-oriented. Return plain text suitable for a coding assistant. Be factual and avoid fabrications. If you are unsure, say so and suggest how to verify. If the user corrects you, acknowledge the correction and update your answer. If asked whether you are Qwen or nscale (or what nscale is in your identity/provider context), deny both and state you are ${PUBLIC_PLAYGROUND_MODEL_NAME}.`,
    actionContract,
  ]
    .filter(Boolean)
    .join("\n\n");
}

export function shouldUseNvidiaChatTemplateThinking(model: string): boolean {
  const normalized = String(model || "").trim().toLowerCase();
  if (!normalized) return true;
  return !/(^|[/:_-])(mistral|mixtral|magistral|devstral)([/:_-]|$)/i.test(normalized);
}

function isUnsupportedNvidiaChatTemplateError(message: string): boolean {
  const normalized = String(message || "").trim().toLowerCase();
  return normalized.includes("chat_template is not supported");
}

async function readStreamingProviderResponse(
  response: Response,
  label: "HF router" | "NVIDIA",
  params: {
    onToken?: (token: string) => void | Promise<void>;
    onReasoningToken?: (token: string) => void | Promise<void>;
  }
): Promise<ProviderChatResult> {
  const reader = response.body?.getReader();
  if (!reader) return { text: "", reasoning: "", toolCalls: [] };

  const decoder = new TextDecoder();
  let buffer = "";
  let out = "";
  let reasoningOut = "";
  const readWithIdleTimeout = async (): Promise<ReadableStreamReadResult<Uint8Array>> => {
    let timer: NodeJS.Timeout | undefined;
    try {
      return await Promise.race([
        reader.read(),
        new Promise<ReadableStreamReadResult<Uint8Array>>((_, reject) => {
          timer = setTimeout(
            () => reject(new Error(`${label} stream idle timeout after ${HF_STREAM_IDLE_TIMEOUT_MS}ms.`)),
            HF_STREAM_IDLE_TIMEOUT_MS
          );
        }),
      ]);
    } finally {
      if (timer) clearTimeout(timer);
    }
  };
  const findSeparator = (value: string): { index: number; len: number } => {
    const idxLf = value.indexOf("\n\n");
    const idxCrlf = value.indexOf("\r\n\r\n");
    if (idxLf < 0 && idxCrlf < 0) return { index: -1, len: 0 };
    if (idxLf < 0) return { index: idxCrlf, len: 4 };
    if (idxCrlf < 0) return { index: idxLf, len: 2 };
    return idxLf < idxCrlf ? { index: idxLf, len: 2 } : { index: idxCrlf, len: 4 };
  };

  const handleEventChunk = async (eventChunk: string) => {
    const lines = eventChunk
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean);
    const dataLines = lines
      .filter((line) => line.startsWith("data:"))
      .map((line) => line.slice(5).trim());
    if (!dataLines.length) return false;
    const data = dataLines.join("\n");
    if (!data || data === "[DONE]") return data === "[DONE]";

    try {
      const parsed = JSON.parse(data) as unknown;
      const { content, reasoning } = extractStreamPieces(parsed);
      if (content) {
        out += content;
        if (params.onToken) await params.onToken(content);
      }
      if (reasoning) {
        reasoningOut += reasoning;
        if (params.onReasoningToken) await params.onReasoningToken(reasoning);
      }
    } catch {
      // Ignore malformed or non-JSON chunks.
    }
    return false;
  };

  let streamDone = false;
  while (!streamDone) {
    const { done, value } = await readWithIdleTimeout();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });

    let sep = findSeparator(buffer);
    while (sep.index >= 0) {
      const eventChunk = buffer.slice(0, sep.index);
      buffer = buffer.slice(sep.index + sep.len);
      const sawDone = await handleEventChunk(eventChunk);
      if (sawDone) {
        streamDone = true;
        break;
      }
      sep = findSeparator(buffer);
    }
  }

  if (!streamDone && buffer.trim()) {
    await handleEventChunk(buffer);
  }

  return {
    text: out.trim(),
    reasoning: reasoningOut.trim(),
    toolCalls: [],
  };
}

async function callHfChat(params: {
  model: string;
  prompt: string;
  systemPrompt: string;
  maxTokens: number;
  attachments?: AssistAttachment[];
  onToken?: (token: string) => void | Promise<void>;
  onReasoningToken?: (token: string) => void | Promise<void>;
  stream?: boolean;
  tools?: ProviderToolSpec[];
}): Promise<ProviderChatResult> {
  const token = getHfRouterToken();
  if (!token) {
    throw new Error(
      "HF router not configured. Set HF_ROUTER_TOKEN (or HF_TOKEN/HUGGINGFACE_TOKEN)."
    );
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), HF_REQUEST_TIMEOUT_MS);
  let r: Response;
  try {
    r = await fetch(`${HF_ROUTER_BASE_URL}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        model: params.model,
        stream: params.stream !== false,
        max_tokens: params.maxTokens,
        messages: [
          {
            role: "system",
            content: params.systemPrompt,
          },
          { role: "user", content: buildUserMessageContent(params.prompt, params.attachments) },
        ],
        ...(params.tools?.length
          ? {
              tools: params.tools,
              tool_choice: "auto",
            }
          : {}),
      }),
      signal: controller.signal,
    });
  } catch (error) {
    if (controller.signal.aborted) {
      throw new Error(`HF router request timed out after ${HF_REQUEST_TIMEOUT_MS}ms.`);
    }
    throw new Error(`HF router request failed: ${describeErrorWithCause(error)}`);
  } finally {
    clearTimeout(timeout);
  }

  if (!r.ok) {
    const msg = (await r.text().catch(() => "")) || `HF error ${r.status}`;
    throw new Error(msg);
  }

  const contentType = r.headers.get("content-type") || "";
  if (contentType.includes("text/event-stream")) {
    return readStreamingProviderResponse(r, "HF router", params);
  }

  const body = (await r.json()) as unknown;
  const { content, reasoning } = extractStreamPieces(body);
  const text = content.trim();
  const reasoningText = reasoning.trim();
  if (reasoningText && params.onReasoningToken) await params.onReasoningToken(reasoningText);
  if (text && params.onToken) await params.onToken(text);
  return {
    text,
    reasoning: reasoningText,
    toolCalls: extractToolCalls(body),
  };
}

async function callNvidiaChat(params: {
  model: string;
  prompt: string;
  systemPrompt: string;
  maxTokens: number;
  attachments?: AssistAttachment[];
  onToken?: (token: string) => void | Promise<void>;
  onReasoningToken?: (token: string) => void | Promise<void>;
  runtimeApiKey?: string;
  stream?: boolean;
  tools?: ProviderToolSpec[];
}): Promise<ProviderChatResult> {
  const token = getNvidiaToken(params.runtimeApiKey);
  if (!token) {
    throw new Error(
      "NVIDIA provider not configured. Set PLAYGROUND_NVIDIA_API_KEY (or NVIDIA_API_KEY/NVAPI_KEY)."
    );
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), HF_REQUEST_TIMEOUT_MS);
  let r: Response;
  try {
    const sendRequest = async (includeChatTemplateThinking: boolean) =>
      fetch(`${NVIDIA_INTEGRATE_BASE_URL}/chat/completions`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
          Accept: "text/event-stream",
        },
        body: JSON.stringify({
          model: params.model,
          stream: params.stream !== false,
          max_tokens: params.maxTokens,
          temperature: 0.6,
          top_p: 0.95,
          ...(includeChatTemplateThinking ? { chat_template_kwargs: { enable_thinking: true } } : {}),
          messages: [
            {
              role: "system",
              content: params.systemPrompt,
            },
            { role: "user", content: buildUserMessageContent(params.prompt, params.attachments) },
          ],
          ...(params.tools?.length
            ? {
                tools: params.tools,
                tool_choice: "auto",
              }
            : {}),
        }),
        signal: controller.signal,
      });

    const initialIncludeThinking = shouldUseNvidiaChatTemplateThinking(params.model);
    r = await sendRequest(initialIncludeThinking);
    if (!r.ok) {
      const responseText = (await r.text().catch(() => "")) || `NVIDIA error ${r.status}`;
      if (initialIncludeThinking && isUnsupportedNvidiaChatTemplateError(responseText)) {
        r = await sendRequest(false);
      } else {
        throw new Error(responseText);
      }
    }
  } catch (error) {
    if (controller.signal.aborted) {
      throw new Error(`NVIDIA request timed out after ${HF_REQUEST_TIMEOUT_MS}ms.`);
    }
    throw new Error(`NVIDIA request failed: ${describeErrorWithCause(error)}`);
  } finally {
    clearTimeout(timeout);
  }

  if (!r.ok) {
    const msg = (await r.text().catch(() => "")) || `NVIDIA error ${r.status}`;
    throw new Error(msg);
  }

  const contentType = r.headers.get("content-type") || "";
  if (contentType.includes("text/event-stream")) {
    return readStreamingProviderResponse(r, "NVIDIA", params);
  }

  const body = (await r.json()) as unknown;
  const { content, reasoning } = extractStreamPieces(body);
  const text = content.trim();
  const reasoningText = reasoning.trim();
  if (reasoningText && params.onReasoningToken) await params.onReasoningToken(reasoningText);
  if (text && params.onToken) await params.onToken(text);
  return {
    text,
    reasoning: reasoningText,
    toolCalls: extractToolCalls(body),
  };
}

function extractBalancedJsonObject(text: string): string | null {
  const source = text.trim();
  if (!source) return null;

  let start = source.indexOf("{");
  while (start >= 0) {
    let depth = 0;
    let inString = false;
    let escaped = false;
    for (let i = start; i < source.length; i += 1) {
      const ch = source[i];
      if (inString) {
        if (escaped) {
          escaped = false;
          continue;
        }
        if (ch === "\\") {
          escaped = true;
          continue;
        }
        if (ch === '"') {
          inString = false;
        }
        continue;
      }
      if (ch === '"') {
        inString = true;
        continue;
      }
      if (ch === "{") {
        depth += 1;
        continue;
      }
      if (ch === "}") {
        depth -= 1;
        if (depth === 0) {
          return source.slice(start, i + 1);
        }
      }
    }
    start = source.indexOf("{", start + 1);
  }
  return null;
}

function extractJsonObjectCandidate(text: string): string | null {
  const trimmed = text.trim();
  if (!trimmed) return null;

  const direct = extractBalancedJsonObject(trimmed);
  if (direct) return direct;

  const fencedMatches = trimmed.matchAll(/```(?:json)?\s*([\s\S]*?)```/gi);
  for (const match of fencedMatches) {
    const block = String(match?.[1] || "").trim();
    if (!block) continue;
    const fromFence = extractBalancedJsonObject(block);
    if (fromFence) return fromFence;
  }
  return null;
}

function patchContainsStructuredPayloadArtifacts(text: string): boolean {
  const source = normalizeModelText(text).trim();
  if (!source) return false;

  const directEnvelope =
    /^\s*\{/.test(source) &&
    /"final"\s*:/i.test(source) &&
    /("edits"\s*:|"actions"\s*:|"commands"\s*:)/i.test(source) &&
    /("path"\s*:|"patch"\s*:)/i.test(source);
  if (directEnvelope) return true;

  const addedLines = source
    .split("\n")
    .filter((line) => line.startsWith("+") && !line.startsWith("+++ "))
    .map((line) => line.slice(1))
    .join("\n")
    .trim();
  if (!addedLines) return false;

  return (
    /\{\s*"final"\s*:/i.test(addedLines) &&
    /("edits"\s*:|"actions"\s*:|"commands"\s*:)/i.test(addedLines) &&
    /("path"\s*:|"patch"\s*:)/i.test(addedLines)
  );
}

function parseStructuredAssistResponse(raw: string): StructuredAssistOutput | null {
  const candidate = extractJsonObjectCandidate(raw);
  if (!candidate) return null;

  const parseCandidate = (value: string) => {
    const parsed = JSON.parse(value) as {
      final?: unknown;
      edits?: unknown;
      commands?: unknown;
      actions?: unknown;
    };

    const final =
      typeof parsed.final === "string" && parsed.final.trim()
        ? parsed.final.trim()
        : typeof raw === "string"
          ? raw.trim()
          : "";

    const looksLikeStructuredPayloadText = (text: string): boolean => {
      const normalized = normalizeModelText(text).trim();
      if (!normalized) return false;
      if (!/^\s*[{[]/.test(normalized)) return false;
      if (!/"final"\s*:/i.test(normalized)) return false;
      return /"edits"\s*:/i.test(normalized) || /"actions"\s*:/i.test(normalized) || /"commands"\s*:/i.test(normalized);
    };

    const edits = Array.isArray(parsed.edits)
      ? parsed.edits
          .filter((e): e is { path: string; patch?: string; diff?: string; rationale?: string } => {
            return (
              !!e &&
              typeof e === "object" &&
              typeof (e as { path?: unknown }).path === "string" &&
              (typeof (e as { patch?: unknown }).patch === "string" || typeof (e as { diff?: unknown }).diff === "string")
            );
          })
          .map((e) => ({
            path: e.path.trim(),
            patch: String(e.patch ?? e.diff ?? "").trim(),
            ...(typeof e.rationale === "string" && e.rationale.trim() ? { rationale: e.rationale.trim() } : {}),
          }))
          .filter(
            (e) =>
              e.path &&
              e.patch &&
              looksLikeConcreteFilePath(e.path) &&
              !e.path.includes("..") &&
              !e.path.startsWith("/") &&
              !/^[a-z]:\\/i.test(e.path) &&
              !looksLikeStructuredPayloadText(e.patch) &&
              !patchContainsStructuredPayloadArtifacts(e.patch)
          )
          .slice(0, 20)
      : [];

    const commands = Array.isArray(parsed.commands)
      ? parsed.commands
          .filter((c): c is string => typeof c === "string")
          .map((c) => c.trim())
          .filter(Boolean)
          .slice(0, 20)
      : [];

    const actions: ToolAction[] = [];
    if (Array.isArray(parsed.actions)) {
      for (const entry of parsed.actions as unknown[]) {
        if (!entry || typeof entry !== "object") continue;
        const obj = entry as Record<string, unknown>;
        const type = typeof obj.type === "string" ? obj.type.trim().toLowerCase() : "";
        if (type === "edit") {
          const path = typeof obj.path === "string" ? obj.path.trim() : "";
          const patch = typeof obj.patch === "string" ? obj.patch.trim() : typeof obj.diff === "string" ? obj.diff.trim() : "";
          if (
            path &&
            patch &&
            looksLikeConcreteFilePath(path) &&
            !looksLikeStructuredPayloadText(patch) &&
            !patchContainsStructuredPayloadArtifacts(patch)
          ) {
            actions.push({ type: "edit", path, patch });
          }
          continue;
        }
        if (type === "command") {
          const command = typeof obj.command === "string" ? obj.command.trim() : "";
          const category = obj.category === "implementation" || obj.category === "validation" ? obj.category : undefined;
          if (command) actions.push({ type: "command", command, ...(category ? { category } : {}) });
          continue;
        }
        if (type === "mkdir") {
          const path = typeof obj.path === "string" ? obj.path.trim() : "";
          if (path) actions.push({ type: "mkdir", path });
          continue;
        }
        if (type === "write_file") {
          const path = typeof obj.path === "string" ? obj.path.trim() : "";
          const content = typeof obj.content === "string" ? obj.content : "";
          const overwrite = typeof obj.overwrite === "boolean" ? obj.overwrite : undefined;
          if (looksLikeConcreteFilePath(path)) {
            actions.push({ type: "write_file", path, content, ...(overwrite !== undefined ? { overwrite } : {}) });
          }
        }
      }
    }

    return { final, edits, commands, ...(actions.length ? { actions: actions.slice(0, 40) } : {}) };
  };

  try {
    return parseCandidate(candidate);
  } catch {
    // Some models escape the full JSON body (e.g. {\"final\":\"...\"}).
    const deEscaped = candidate.replace(/\\"/g, '"');
    if (deEscaped !== candidate) {
      try {
        return parseCandidate(deEscaped);
      } catch {
        return null;
      }
    }
    return null;
  }
}

function normalizeRelativePath(value: string): string | null {
  let cleaned = value.replace(/\\/g, "/").trim().replace(/^["'`]+|["'`]+$/g, "");
  cleaned = cleaned.split(/[,\s]+/)[0];
  cleaned = cleaned.replace(/[.,;:]+$/g, "");
  if (!cleaned) return null;
  if (cleaned.includes("..")) return null;
  if (cleaned.startsWith("/") || /^[a-z]:\//i.test(cleaned)) return null;
  return cleaned;
}

function looksLikeConcreteFilePath(path: string | null | undefined): boolean {
  const normalized = normalizeRelativePath(path || "");
  if (!normalized) return false;
  const lastSegment = normalized.split("/").filter(Boolean).pop() || "";
  if (!lastSegment) return false;
  if (/^[.][a-z0-9._-]+$/i.test(lastSegment)) return true;
  if (/^[a-z0-9_-]+\.[a-z0-9._-]+$/i.test(lastSegment)) return true;
  return /^(dockerfile|makefile|procfile|license|readme)$/i.test(lastSegment);
}

function inferExplicitTargetPath(task: string): string | null {
  const patterns = [
    /primary target file(?: hint)?\s*:\s*([^\n]+)/i,
    /apply the requested change directly in\s+([^\n]+)/i,
    /default to this file\s*:\s*([^\n]+)/i,
  ];
  for (const pattern of patterns) {
    const match = task.match(pattern);
    if (!match?.[1]) continue;
    const normalized = normalizeRelativePath(match[1]);
    if (normalized) return normalized;
  }
  return null;
}

function inferContextTargetPath(context?: AssistContext): string | null {
  const active = normalizeRelativePath(context?.activeFile?.path || "");
  if (active) return active;

  for (const file of context?.openFiles ?? []) {
    const normalized = normalizeRelativePath(file.path || "");
    if (normalized) return normalized;
  }
  for (const snippet of context?.indexedSnippets ?? []) {
    const normalized = normalizeRelativePath(snippet.path || "");
    if (normalized) return normalized;
  }
  return null;
}

function inferPathFromTask(task: string): string | null {
  const patterns = [
    /\b(?:create|make|add|write)\s+(?:a\s+)?(?:new\s+)?file\s+([^\s"'`]+)/i,
    /\b(?:create|make|add|write)\s+([^\s"'`]+\.[a-z0-9]+)\b/i,
    /\b(?:in|into|to)\s+([^\s"'`]+\.[a-z0-9]+)\b/i,
  ];
  for (const rx of patterns) {
    const m = task.match(rx);
    if (m?.[1]) {
      const normalized = normalizeRelativePath(m[1]);
      if (normalized) return normalized;
    }
  }
  const pathMentions = task.match(/\b[a-zA-Z0-9_./-]+\.[a-z0-9]+\b/g) || [];
  for (const mention of pathMentions) {
    const normalized = normalizeRelativePath(mention);
    if (normalized) return normalized;
  }
  return null;
}

function inferDiagnosticTargetPath(context?: AssistContext): string | null {
  const counts = new Map<string, number>();
  for (const diagnostic of context?.diagnostics ?? []) {
    const normalized = normalizeRelativePath(String(diagnostic.file || ""));
    if (!normalized) continue;
    counts.set(normalized, (counts.get(normalized) || 0) + 1);
  }
  const ranked = Array.from(counts.entries()).sort((a, b) => b[1] - a[1]);
  return ranked[0]?.[0] || null;
}

function buildTargetInference(input: {
  task: string;
  context?: AssistContext;
  retrievalHints?: AssistRetrievalHints;
  profile?: AssistUserProfile | null;
  codeEditIntent: boolean;
  debugIntent: boolean;
}): {
  path?: string;
  confidence: number;
  source: "mention" | "active_file" | "session_memory" | "diagnostic" | "retrieval";
} {
  const sessionMemory = readSessionMemory(input.profile);
  const mentionedPaths = toCleanPathArray(input.retrievalHints?.mentionedPaths, 12);
  if (mentionedPaths[0]) {
    return { path: mentionedPaths[0], confidence: 0.98, source: "mention" };
  }

  const explicit = inferExplicitTargetPath(input.task) || inferPathFromTask(input.task);
  if (explicit) {
    return { path: explicit, confidence: 0.95, source: "mention" };
  }

  const preferredTarget = normalizeRelativePath(input.retrievalHints?.preferredTargetPath || "");
  if (preferredTarget) {
    return { path: preferredTarget, confidence: 0.9, source: "retrieval" };
  }

  const activePath = normalizeRelativePath(input.context?.activeFile?.path || "");
  if (activePath && input.codeEditIntent) {
    return { path: activePath, confidence: 0.83, source: "active_file" };
  }

  if (sessionMemory.lastTargetPath && input.codeEditIntent) {
    return { path: sessionMemory.lastTargetPath, confidence: 0.74, source: "session_memory" };
  }

  const recentTouched = toCleanPathArray(input.retrievalHints?.recentTouchedPaths, 12);
  if (recentTouched[0] && input.codeEditIntent) {
    return { path: recentTouched[0], confidence: 0.72, source: "session_memory" };
  }

  const diagnosticPath = inferDiagnosticTargetPath(input.context);
  if (diagnosticPath && input.debugIntent) {
    return { path: diagnosticPath, confidence: 0.7, source: "diagnostic" };
  }

  const contextPath = inferContextTargetPath(input.context);
  if (contextPath) {
    return { path: contextPath, confidence: 0.66, source: "retrieval" };
  }

  return { confidence: 0.24, source: "retrieval" };
}

function targetReasonLabel(source: "mention" | "active_file" | "session_memory" | "diagnostic" | "retrieval"): string {
  if (source === "mention") return "Explicitly mentioned in the request";
  if (source === "active_file") return "Selected as the active editor target";
  if (source === "session_memory") return "Selected from recent session memory";
  if (source === "diagnostic") return "Selected from current diagnostics";
  return "Selected from retrieval context";
}

function buildContextSelection(input: {
  context?: AssistContext;
  retrievalHints?: AssistRetrievalHints;
  targetInference: {
    path?: string;
    confidence: number;
    source: "mention" | "active_file" | "session_memory" | "diagnostic" | "retrieval";
  };
}): {
  files: Array<{ path: string; reason: string; score?: number }>;
  snippets: number;
  usedCloudIndex: boolean;
} {
  const out: Array<{ path: string; reason: string; score?: number }> = [];
  const seen = new Set<string>();
  const mentionedPaths = toCleanPathArray(input.retrievalHints?.mentionedPaths, 12);
  const recentTouchedPaths = toCleanPathArray(input.retrievalHints?.recentTouchedPaths, 12);
  const activePath = normalizeRelativePath(input.context?.activeFile?.path || "");
  const diagnosticCounts = new Map<string, number>();
  for (const diagnostic of input.context?.diagnostics ?? []) {
    const normalized = normalizeRelativePath(String(diagnostic.file || ""));
    if (!normalized) continue;
    diagnosticCounts.set(normalized, (diagnosticCounts.get(normalized) || 0) + 1);
  }
  const snippetByPath = new Map<string, { score?: number; reason: string; source: "cloud" | "local_fallback" }>();
  for (const snippet of input.context?.indexedSnippets ?? []) {
    const normalized = normalizeRelativePath(snippet.path || "");
    if (!normalized) continue;
    const source = snippet.source === "local_fallback" ? "local_fallback" : "cloud";
    const existing = snippetByPath.get(normalized);
    const score = typeof snippet.score === "number" ? Number(snippet.score.toFixed(4)) : undefined;
    if (!existing || (score || 0) > (existing.score || 0)) {
      snippetByPath.set(normalized, {
        score,
        source,
        reason:
          snippet.reason ||
          (source === "cloud" ? "Cloud index hit" : "Local fallback hit"),
      });
    }
  }
  const push = (path: string | null | undefined, reason: string, score?: number) => {
    const normalized = normalizeRelativePath(path || "");
    if (!normalized || seen.has(normalized)) return;
    seen.add(normalized);
    out.push({ path: normalized, reason, ...(typeof score === "number" ? { score } : {}) });
  };

  for (const path of mentionedPaths) push(path, "Explicitly mentioned via @ or file reference");
  if (input.targetInference.path) {
    push(
      input.targetInference.path,
      `${targetReasonLabel(input.targetInference.source)} (confidence ${Math.round(input.targetInference.confidence * 100)}%)`
    );
  }
  if (activePath) push(activePath, "Active editor context");
  for (const path of recentTouchedPaths) push(path, "Recently changed in this session");
  for (const [path, count] of Array.from(diagnosticCounts.entries()).sort((a, b) => b[1] - a[1]).slice(0, 6)) {
    push(path, `${count} active diagnostic${count === 1 ? "" : "s"}`);
  }
  for (const [path, info] of Array.from(snippetByPath.entries()).sort((a, b) => (b[1].score || 0) - (a[1].score || 0)).slice(0, 8)) {
    push(path, info.reason, info.score);
  }
  for (const file of input.context?.openFiles ?? []) {
    push(file.path, "Open editor context");
  }

  return {
    files: out.slice(0, 16),
    snippets: input.context?.indexedSnippets?.length ?? 0,
    usedCloudIndex: (input.context?.indexedSnippets ?? []).some((snippet) => snippet.source !== "local_fallback"),
  };
}

function inferPrimaryTargetPath(task: string, context?: AssistContext): string | null {
  const explicit = inferExplicitTargetPath(task);
  if (explicit) return explicit;

  const fromContext = inferContextTargetPath(context);
  if (fromContext) return fromContext;

  const fromTask = inferPathFromTask(task);
  if (fromTask) return fromTask;
  return null;
}

function inferPathFromCode(code: string): string | null {
  const firstLine = code.split(/\r?\n/)[0]?.trim() || "";
  const commentPath =
    firstLine.match(/^#\s*([a-zA-Z0-9_./-]+\.[a-zA-Z0-9_-]+)\s*$/) ||
    firstLine.match(/^\/\/\s*([a-zA-Z0-9_./-]+\.[a-zA-Z0-9_-]+)\s*$/) ||
    firstLine.match(/^\/\*\s*([a-zA-Z0-9_./-]+\.[a-zA-Z0-9_-]+)\s*\*\/\s*$/);
  if (commentPath?.[1]) {
    return normalizeRelativePath(commentPath[1]);
  }
  return null;
}

function buildAddOrReplacePatch(path: string, content: string): string {
  const lines = content.replace(/\r\n/g, "\n").split("\n");
  const body = lines.map((line) => `+${line}`).join("\n");
  return [
    `diff --git a/${path} b/${path}`,
    "new file mode 100644",
    "index 0000000..1111111",
    "--- /dev/null",
    `+++ b/${path}`,
    `@@ -0,0 +1,${lines.length} @@`,
    body,
  ].join("\n");
}

function extractFencedCodeBlocks(text: string): string[] {
  const blocks: string[] = [];
  const re = /```[a-zA-Z0-9_-]*\n([\s\S]*?)```/g;
  let match: RegExpExecArray | null = null;
  while ((match = re.exec(text)) !== null) {
    if (match[1]?.trim()) blocks.push(match[1].trimEnd());
  }
  return blocks;
}

function normalizeModelText(raw: string): string {
  const trimmed = raw.trim();
  if (!trimmed) return "";
  let out = trimmed;
  const escapedNewlines = (out.match(/\\n/g) || []).length;
  if (escapedNewlines >= 2) {
    out = out.replace(/\\r/g, "").replace(/\\n/g, "\n");
  }
  out = out.replace(/\\t/g, "\t");
  const escapedQuotes = (out.match(/\\"/g) || []).length;
  if (escapedQuotes >= 2) {
    out = out.replace(/\\"/g, '"');
  }
  return out;
}

function stripRoboticArtifacts(text: string): string {
  let out = normalizeModelText(text);
  if (!out) return out;

  const jsonFinal = extractFinalFromJsonLike(out);
  if (jsonFinal) out = jsonFinal;

  out = out
    .replace(/^```(?:json|text)?\s*/i, "")
    .replace(/```$/i, "")
    .replace(/^\s*\{"final":/i, "")
    .replace(/\s*"edits"\s*:\s*\[[\s\S]*$/i, "")
    .replace(
      /\b(no commands are required|no edits are provided|prepared \d+ tool action\(s\).*|starting execution\.\.\.|action outcome|execute finished:.*|files changed:\s*\d+|checks run:\s*\d+|result quality:\s*\w+)\b/gi,
      ""
    )
    .replace(/\bthinking\.\.\.\s*/gi, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();

  return out;
}

function firstNonEmptyLine(text: string): string {
  return text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .find(Boolean) || "";
}

export function composeWarmAssistantResponse(input: {
  final: string;
  task: string;
  decisionMode: AssistDecisionMode;
  intent: AssistIntentType;
  edits: Array<{ path: string; patch: string; rationale?: string }>;
  commands: string[];
  actions?: ToolAction[];
  autonomyDecision: {
    mode: "no_actions" | "preview_only" | "auto_apply_only" | "auto_apply_and_validate";
  };
}): string {
  const cleaned = stripRoboticArtifacts(input.final);
  if (input.intent === "conversation") {
    return cleaned || "I'm here and ready to help with whatever you want next.";
  }

  if (input.decisionMode === "plan") {
    return cleaned;
  }

  const actionPaths = (input.actions ?? []).flatMap((action) => {
    if (action.type === "edit" || action.type === "write_file") return [action.path];
    return [];
  });
  const hasFileActions = input.edits.length > 0 || actionPaths.length > 0;
  const hasCommandActions =
    input.commands.length > 0 ||
    (input.actions ?? []).some((action) => action.type === "command");

  if (hasFileActions) {
    const touchedPaths = Array.from(
      new Set([...input.edits.map((edit) => edit.path), ...actionPaths].filter((path) => looksLikeConcreteFilePath(path)))
    ).slice(0, 3);
    const touched = touchedPaths.join(", ");
    const resultLine = firstNonEmptyLine(cleaned);
    const nextAction =
      input.autonomyDecision.mode === "preview_only"
        ? "Next action: review the preview, then reply \"apply now\" or use Actions -> Execute Pending Actions."
        : input.autonomyDecision.mode === "auto_apply_and_validate"
          ? "Next action: auto-apply was requested. Confirm applied files and validation results in Execution and terminal."
          : "Next action: auto-apply was requested. Confirm what was actually applied in the Execution panel.";
    const headline = touched
      ? `Prepared file edits for ${touched}.`
      : "Prepared file edits, but no concrete file target was identified yet.";
    return [
      headline,
      resultLine ? resultLine : "",
      nextAction,
    ]
      .filter(Boolean)
      .join("\n");
  }

  if (hasCommandActions) {
    if (input.intent === "code_edit") {
      return [
        "No concrete file edits are staged yet.",
        "Validation commands are withheld until the run produces a real patch or write action.",
      ].join("\n\n");
    }
    const resultLine = firstNonEmptyLine(cleaned);
    return [
      "I prepared validation/inspection commands, but no file edits are staged yet.",
      resultLine ? resultLine : "",
      "Next action: run commands manually, or ask me to generate concrete file edits first.",
    ]
      .filter(Boolean)
      .join("\n");
  }

  return cleaned || "I'm ready to continue once you share the next concrete change.";
}

function cleanCodeSnippet(text: string): string {
  let out = normalizeModelText(text);
  const fenced = out.match(/^```[a-zA-Z0-9_-]*\n([\s\S]*?)```$/);
  if (fenced?.[1]) out = fenced[1].trim();

  // Common path header emitted by some models: "# hello.py"
  out = out.replace(/^\s*(?:#|\/\/)\s*[a-zA-Z0-9_./-]+\.[a-zA-Z0-9_-]+\s*\n/, "");
  // Trim stray trailing escape artifacts.
  out = out.replace(/\n?\\\s*$/, "").replace(/\n?\s*"\s*$/, "");
  return out.trim();
}

function normalizeComparableText(text: string): string {
  return String(text || "").replace(/\r\n/g, "\n").trim();
}

function looksLikeWholeFileRewriteCandidate(text: string, path: string): boolean {
  const normalized = normalizeComparableText(text);
  if (!normalized) return false;
  if (looksLikeCode(normalized)) return true;

  const lowerPath = path.toLowerCase();
  const lineCount = normalized.split(/\n/).length;

  if (lowerPath.endsWith(".pine")) {
    return /\b(strategy|indicator)\s*\(/i.test(normalized) || (lineCount >= 8 && /:=|plot|strategy\./i.test(normalized));
  }
  if (lowerPath.endsWith(".json")) {
    return /^[\[{]/.test(normalized);
  }
  if (/\.(yaml|yml)$/i.test(lowerPath)) {
    return lineCount >= 3 && /^[A-Za-z0-9_.-]+\s*:/m.test(normalized);
  }
  if (/\.(md|mdx|txt|rst)$/i.test(lowerPath)) {
    return lineCount >= 3 && normalized.length >= 40;
  }
  return lineCount >= 8 && normalized.length >= 120;
}

function inferSingleFileRewriteFallback(
  raw: string,
  context?: AssistContext,
  targetPath?: string | null
): StructuredAssistOutput | null {
  if (looksLikeStructuredActionEnvelope(raw)) return null;

  const activePath = normalizeRelativePath(context?.activeFile?.path || "");
  const candidatePath = activePath || normalizeRelativePath(targetPath || "");
  const activeContent = normalizeComparableText(context?.activeFile?.content || "");
  if (!candidatePath || !looksLikeConcreteFilePath(candidatePath) || !activeContent) return null;
  if (activePath && candidatePath !== activePath) return null;

  const blocks = extractFencedCodeBlocks(raw);
  let candidateContent = "";
  for (const block of blocks.slice(0, 4)) {
    const cleaned = cleanCodeSnippet(block);
    if (!looksLikeWholeFileRewriteCandidate(cleaned, candidatePath)) continue;
    if (!candidateContent || cleaned.length > candidateContent.length) {
      candidateContent = cleaned;
    }
  }

  if (!candidateContent) {
    const cleanedRaw = cleanCodeSnippet(raw);
    if (looksLikeWholeFileRewriteCandidate(cleanedRaw, candidatePath)) {
      candidateContent = cleanedRaw;
    }
  }

  const normalizedCandidate = normalizeComparableText(candidateContent);
  if (!normalizedCandidate || normalizedCandidate === activeContent) return null;

  return {
    final: "Recovered a concrete single-file rewrite from the model output.",
    edits: [],
    commands: [],
    actions: [
      {
        type: "write_file",
        path: candidatePath,
        content: `${normalizedCandidate}\n`,
        overwrite: true,
      },
    ],
  };
}

function looksLikeCode(text: string): boolean {
  const t = text.trim();
  if (!t) return false;
  if (/^#!\/usr\/bin\/env\s+\w+/.test(t)) return true;
  if (/^\s*(def|class|import|from|if __name__|print\(|return\b)\b/m.test(t)) return true;
  if (/^\s*(const|let|var|function|export|import)\b/m.test(t)) return true;
  if (/\n/.test(t) && /[{};]/.test(t)) return true;
  return false;
}

function extractFinalFromJsonLike(raw: string): string | null {
  const candidate = extractJsonObjectCandidate(raw);
  if (candidate) {
    const attempts = [candidate, candidate.replace(/\\"/g, '"')];
    for (const attempt of attempts) {
      try {
        const parsed = JSON.parse(attempt) as { final?: unknown };
        if (typeof parsed.final === "string" && parsed.final.trim()) return parsed.final.trim();
      } catch {
        // keep trying
      }
    }
  }

  const normalized = raw.includes('\\"final\\"') ? raw.replace(/\\"/g, '"') : raw;
  const m = normalized.match(/"final"\s*:\s*"((?:\\.|[^"\\])*)"/i);
  if (!m?.[1]) return null;
  try {
    return JSON.parse(`"${m[1]}"`);
  } catch {
    return normalizeModelText(m[1]);
  }
}

function sanitizeCodeModeFinalText(raw: string): { text: string; changed: boolean } {
  const normalized = normalizeModelText(raw).trim();
  if (!normalized) return { text: "", changed: false };

  const looksStructured =
    looksLikeStructuredActionEnvelope(normalized) ||
    (/^\s*```(?:json)?/i.test(normalized) && /"final"\s*:/i.test(normalized)) ||
    (/^\s*[{[]/.test(normalized) && /"final"\s*:/i.test(normalized));
  if (!looksStructured) {
    return { text: normalized, changed: normalized !== raw };
  }

  const extractedFinal = extractFinalFromJsonLike(normalized);
  if (extractedFinal?.trim()) {
    const clean = normalizeModelText(extractedFinal).trim();
    return { text: clean, changed: clean !== normalized };
  }

  const stripped = normalized
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/```$/i, "")
    .replace(/^\s*\{\s*"final"\s*:\s*/i, "")
    .replace(/\s*,\s*"edits"\s*:\s*\[[\s\S]*$/i, "")
    .replace(/\s*,\s*"actions"\s*:\s*\[[\s\S]*$/i, "")
    .replace(/\s*,\s*"commands"\s*:\s*\[[\s\S]*$/i, "")
    .replace(/\s*\}\s*$/, "")
    .trim();
  if (!stripped) return { text: normalized, changed: false };
  return { text: stripped, changed: stripped !== normalized };
}

function isClarificationResponseText(text: string): boolean {
  const normalized = String(text || "").trim().toLowerCase();
  if (!normalized) return false;
  return (
    /\?$/.test(normalized) ||
    /\b(please share|can you share|could you share|paste|which file|which path|clarify|need more context|show me the file)\b/.test(normalized)
  );
}

function soundsLikeCompletedWorkClaim(text: string): boolean {
  const normalized = String(text || "").trim().toLowerCase();
  if (!normalized) return false;
  if (/\b(i can|i could|i would|please share|need more|can't|cannot|unable|not able)\b/.test(normalized)) return false;
  if (/\?$/.test(normalized)) return false;
  return /\b(updated|implemented|changed|fixed|added|created|set|increased|decreased|done|completed|applied)\b/.test(normalized);
}

function soundsLikeNarrativeEditClaim(text: string): boolean {
  const normalized = String(text || "").trim().toLowerCase();
  if (!normalized) return false;
  if (isClarificationResponseText(normalized)) return false;
  if (
    /\b(no repository changes were applied|no file edits were applied|no concrete file edits are staged yet|validation commands are withheld)\b/.test(
      normalized
    )
  ) {
    return false;
  }
  if (
    /\b(i drafted|drafted a proposed update|drafted a proposed implementation|proposed update|prepared an update|prepared edits)\b/.test(
      normalized
    )
  ) {
    return true;
  }
  return soundsLikeCompletedWorkClaim(normalized);
}

function extractUnifiedDiffEdits(raw: string): Array<{ path: string; patch: string; rationale?: string }> {
  const source = normalizeModelText(raw);
  const out: Array<{ path: string; patch: string; rationale?: string }> = [];
  const chunkRegex = /(?:^|\n)(diff --git a\/[^\n]+ b\/[^\n]+[\s\S]*?)(?=\n(?:diff --git a\/)|$)/g;
  let match: RegExpExecArray | null = null;
  while ((match = chunkRegex.exec(source)) !== null) {
    const patch = String(match[1] || "").trim();
    if (!patch) continue;
    const header = patch.match(/^diff --git a\/(.+?) b\/(.+)$/m);
    const path = normalizeRelativePath((header?.[2] || header?.[1] || "").trim());
    if (!path) continue;
    if (!/^@@\s/m.test(patch) && !/\nnew file mode\s/.test(patch) && !/\ndeleted file mode\s/.test(patch)) continue;
    if (patchContainsStructuredPayloadArtifacts(patch)) continue;
    out.push({
      path,
      patch,
      rationale: "Inferred edit from raw unified diff output.",
    });
    if (out.length >= 8) break;
  }
  return out;
}

function extractApplyPatchEdits(raw: string): Array<{ path: string; patch: string; rationale?: string }> {
  const source = normalizeModelText(raw);
  const out: Array<{ path: string; patch: string; rationale?: string }> = [];
  const blocks: string[] = [];
  const blockRegex = /(?:^|\n)\*\*\*\s*Begin Patch[\s\S]*?\*\*\*\s*End Patch/g;
  let match: RegExpExecArray | null = null;
  while ((match = blockRegex.exec(source)) !== null) {
    const block = String(match[0] || "").trim();
    if (block) blocks.push(block);
  }
  if (!blocks.length && /\*\*\*\s*(Update|Add|Delete)\s+File:/i.test(source)) {
    blocks.push(source.trim());
  }
  for (const block of blocks) {
    const lines = block.split(/\r?\n/);
    let currentPath = "";
    let currentType = "";
    let headerLine = "";
    let sectionLines: string[] = [];
    const flush = () => {
      if (!currentPath) return;
      const normalized = normalizeRelativePath(currentPath);
      if (!normalized) {
        currentPath = "";
        currentType = "";
        headerLine = "";
        sectionLines = [];
        return;
      }
      if (currentType === "add") {
        const contentLines = sectionLines
          .filter((line) => line.startsWith("+") && !line.startsWith("+++ "))
          .map((line) => line.slice(1));
        out.push({
          path: normalized,
          patch: buildAddOrReplacePatch(normalized, contentLines.join("\n")),
          rationale: "Inferred file creation from apply_patch output.",
        });
      } else {
        const patch = [headerLine, ...sectionLines].join("\n").trim();
        if (patch) {
          out.push({
            path: normalized,
            patch,
            rationale: "Inferred edit from apply_patch output.",
          });
        }
      }
      currentPath = "";
      currentType = "";
      headerLine = "";
      sectionLines = [];
    };
    for (const line of lines) {
      const headerMatch = line.match(/^\s*\*\*\*\s*(Update|Add|Delete)\s+File:\s*(.+)\s*$/i);
      if (headerMatch) {
        flush();
        currentType = headerMatch[1].toLowerCase();
        currentPath = headerMatch[2].trim();
        headerLine = line;
        sectionLines = [];
        continue;
      }
      if (currentPath) sectionLines.push(line);
    }
    flush();
    if (out.length >= 8) break;
  }
  return out;
}

function looksLikeStructuredActionEnvelope(raw: string): boolean {
  const source = normalizeModelText(raw).trim();
  if (!source) return false;
  if (!/^\s*[{[]/.test(source)) return false;
  const hasFinal = /"final"\s*:/i.test(source);
  const hasEdits = /"edits"\s*:/i.test(source);
  const hasActions = /"actions"\s*:/i.test(source);
  const hasCommands = /"commands"\s*:/i.test(source);
  return hasFinal && (hasEdits || hasActions || hasCommands);
}

function inferStructuredFallback(raw: string, task: string, targetPath?: string | null): StructuredAssistOutput | null {
  if (looksLikeStructuredActionEnvelope(raw)) {
    // Avoid writing schema wrappers like {"final":"...","edits":[...]} into source files.
    return null;
  }
  const taskPath = normalizeRelativePath(targetPath || "") || inferExplicitTargetPath(task) || inferPathFromTask(task);
  const edits: Array<{ path: string; patch: string; rationale?: string }> = [];
  const applyPatchEdits = extractApplyPatchEdits(raw).filter((edit) => looksLikeConcreteFilePath(edit.path));
  if (applyPatchEdits.length) {
    return {
      final: normalizeModelText(raw),
      edits: applyPatchEdits,
      commands: [],
    };
  }
  const diffEdits = extractUnifiedDiffEdits(raw).filter((edit) => looksLikeConcreteFilePath(edit.path));
  if (diffEdits.length) {
    return {
      final: normalizeModelText(raw),
      edits: diffEdits,
      commands: [],
    };
  }
  const blocks = extractFencedCodeBlocks(raw);

  for (const block of blocks.slice(0, 4)) {
    const cleaned = cleanCodeSnippet(block);
    const codePath = inferPathFromCode(cleaned);
    const path = taskPath || (looksLikeConcreteFilePath(codePath) ? codePath : null);
    if (!path) continue;
    if (!looksLikeCode(cleaned)) continue;
    edits.push({
      path,
      patch: buildAddOrReplacePatch(path, cleaned),
      rationale: "Inferred file creation from fenced code block output.",
    });
  }

  if (!edits.length && taskPath) {
    const cleanedRaw = cleanCodeSnippet(raw);
    if (looksLikeCode(cleanedRaw)) {
      edits.push({
        path: taskPath,
        patch: buildAddOrReplacePatch(taskPath, cleanedRaw),
        rationale: "Inferred file content from raw model output.",
      });
    }
  }

  if (!edits.length) return null;
  return {
    final: normalizeModelText(raw),
    edits,
    commands: [],
  };
}

function inferPineEntryId(content: string, direction: "long" | "short"): string | null {
  const entryMatch = content.match(
    new RegExp(`strategy\\.entry\\(\\s*["'\`]([^"'\\\`]+)["'\`]\\s*,\\s*strategy\\.${direction}\\b`, "i")
  );
  if (entryMatch?.[1]) return entryMatch[1];

  const exitRegex = /strategy\.exit\(\s*["'`][^"'`]+["'`]\s*,\s*["'`]([^"'`]+)["'`]/gi;
  let match: RegExpExecArray | null = null;
  while ((match = exitRegex.exec(content)) !== null) {
    const candidate = String(match[1] || "").trim();
    if (!candidate) continue;
    const normalized = candidate.toLowerCase();
    if (direction === "long" && normalized.includes("long")) return candidate;
    if (direction === "short" && normalized.includes("short")) return candidate;
  }
  return null;
}

function synthesizeTrailingStopPineContent(content: string): string | null {
  const normalized = String(content || "").replace(/\r\n/g, "\n");
  if (!/\bstrategy\s*\(/i.test(normalized)) return null;
  if (/\btrailing_stop_(enabled|atr_length|atr_multiplier|long_stop|short_stop)\b/i.test(normalized)) return null;

  const longEntryId = inferPineEntryId(normalized, "long");
  const shortEntryId = inferPineEntryId(normalized, "short");
  if (!longEntryId && !shortEntryId) return null;

  const trailingBlock: string[] = [
    "",
    "// Trailing stop fallback synthesized from IDE context.",
    'trailing_stop_enabled = input.bool(true, "Enable trailing stop")',
    'trailing_stop_atr_length = input.int(14, "Trailing stop ATR length", minval=1)',
    'trailing_stop_atr_multiplier = input.float(1.5, "Trailing stop ATR multiplier", minval=0.1, step=0.1)',
    "trailing_stop_offset = ta.atr(trailing_stop_atr_length) * trailing_stop_atr_multiplier",
    "",
    "var float trailing_stop_long = na",
    "var float trailing_stop_short = na",
    "",
    "if strategy.position_size > 0",
    "    long_candidate_stop = close - trailing_stop_offset",
    "    trailing_stop_long := na(trailing_stop_long[1]) ? long_candidate_stop : math.max(trailing_stop_long[1], long_candidate_stop)",
    "else",
    "    trailing_stop_long := na",
    "",
    "if strategy.position_size < 0",
    "    short_candidate_stop = close + trailing_stop_offset",
    "    trailing_stop_short := na(trailing_stop_short[1]) ? short_candidate_stop : math.min(trailing_stop_short[1], short_candidate_stop)",
    "else",
    "    trailing_stop_short := na",
  ];

  if (longEntryId) {
    trailingBlock.push(
      "",
      "if trailing_stop_enabled and strategy.position_size > 0",
      `    strategy.exit("Trailing Long Exit", from_entry="${longEntryId}", stop=trailing_stop_long)`
    );
  }
  if (shortEntryId) {
    trailingBlock.push(
      "",
      "if trailing_stop_enabled and strategy.position_size < 0",
      `    strategy.exit("Trailing Short Exit", from_entry="${shortEntryId}", stop=trailing_stop_short)`
    );
  }

  const trimmed = normalized.replace(/\s+$/, "");
  return `${trimmed}\n${trailingBlock.join("\n")}\n`;
}

function synthesizeTrailingStopPatch(
  raw: string,
  task: string,
  context?: AssistContext,
  targetPath?: string | null
): StructuredAssistOutput | null {
  const normalizedTask = String(task || "").toLowerCase();
  const normalizedRaw = String(raw || "").toLowerCase();
  if (!normalizedTask.includes("trailing stop") && !normalizedRaw.includes("trailing stop")) {
    return null;
  }
  const candidatePath =
    normalizeRelativePath(context?.activeFile?.path || "") ||
    normalizeRelativePath(targetPath || "") ||
    inferContextTargetPath(context);
  if (!candidatePath || !looksLikeConcreteFilePath(candidatePath)) return null;
  const activeContent = String(context?.activeFile?.content || "").trim();
  if (!activeContent || activeContent.length >= 19_500) return null;
  const synthesizedContent = synthesizeTrailingStopPineContent(activeContent);
  if (!synthesizedContent || synthesizedContent === activeContent.replace(/\r\n/g, "\n")) return null;
  return {
    final: "Prepared a trailing stop fallback directly in the active Pine strategy.",
    edits: [],
    commands: [],
    actions: [
      {
        type: "write_file",
        path: candidatePath,
        content: synthesizedContent,
        overwrite: true,
      },
    ],
  };
}

function recoverEditsFromConversationHistory(
  history: AssistConversationTurn[] | undefined,
  task: string,
  targetPath?: string | null
): StructuredAssistOutput | null {
  if (!history?.length) return null;
  const assistantTurns = [...history]
    .filter((turn) => turn.role === "assistant" && typeof turn.content === "string" && turn.content.trim())
    .reverse();

  for (const turn of assistantTurns) {
    const recovered = inferStructuredFallback(turn.content, task, targetPath);
    if (recovered?.edits.length) {
      return {
        ...recovered,
        final:
          recovered.final.trim() ||
          "Recovered code from recent conversation and prepared file edits.",
      };
    }
  }
  return null;
}

function inferRisk(decision: AssistDecisionMode, task: string, commands: string[]) {
  const complex = /\b(migration|schema|auth|payment|security|delete|remove|rewrite)\b/i.test(task);
  if (decision === "yolo" && (commands.length > 1 || complex)) {
    return { blastRadius: "high" as const, rollbackComplexity: 8 };
  }
  if (complex || decision === "debug") {
    return { blastRadius: "medium" as const, rollbackComplexity: 5 };
  }
  return { blastRadius: "low" as const, rollbackComplexity: 2 };
}

function isHighRiskActionPattern(task: string, actions: ToolAction[]): boolean {
  const normalizedTask = String(task || "").toLowerCase();
  const riskyTask =
    /\b(schema|migration|auth|payment|security|credential|secret|token|delete|drop table|rm -rf)\b/i.test(normalizedTask);
  if (riskyTask) return true;

  for (const action of actions) {
    if (action.type === "command") {
      const cmd = action.command.toLowerCase();
      if (/\brm\s+-rf\b/.test(cmd) || /\b(del|rmdir)\b/.test(cmd) || /\b(drop\s+table|truncate)\b/.test(cmd)) return true;
      if (/\b(curl|wget)\b/.test(cmd) && /\|\s*(sh|bash|zsh)\b/.test(cmd)) return true;
      if (/\b(psql|mysql|sqlite3)\b/.test(cmd) && /\b(drop|delete|truncate|alter)\b/.test(cmd)) return true;
    }
    if (action.type === "edit" || action.type === "write_file") {
      const p = action.path.toLowerCase();
      if (/\b(secrets?|credentials?|auth|payment|billing|migration|schema)\b/.test(p)) return true;
    }
  }
  return false;
}

function collectInfluence(context?: AssistContext) {
  const files = new Set<string>();
  if (context?.activeFile?.path) files.add(context.activeFile.path);
  for (const file of context?.openFiles ?? []) files.add(file.path);
  for (const snippet of context?.indexedSnippets ?? []) if (snippet.path) files.add(snippet.path);
  return { files: Array.from(files).slice(0, 24), snippets: context?.indexedSnippets?.length ?? 0 };
}

function hasExecutionIntent(task: string): boolean {
  const normalized = normalizeIntentTypos(task);
  return /\b(create|make|add|build|implement|refactor|fix|debug|run|test|lint|typecheck|command|file|patch|edit|ship|strategy|indicator|trailing stop|stop loss)\b/i.test(normalized);
}

function hasExplicitCommandRunIntent(task: string): boolean {
  return /\b(run|execute|terminal|shell|command|test|tests|lint|typecheck|build|compile|install|npm|pnpm|yarn|pytest|jest|vitest|cargo|go test|mvn|gradle)\b/i.test(task);
}

function hasCodeEditIntent(task: string): boolean {
  const normalized = normalizeIntentTypos(task);
  const strongEditVerb =
    /\b(create|make|add|implement|write|modify|edit|patch|refactor|fix|ship|strategy|indicator|trailing stop|stop loss)\b/i;
  if (strongEditVerb.test(normalized)) return true;
  const weakEditVerb = /\b(update|change|adjust|set|increase|decrease|rename|replace|remove|toggle)\b/i;
  const codeObjectHint =
    /\b(code|file|path|function|method|class|variable|param(?:eter)?|input|length|period|setting|config|strategy|indicator|stop loss|trailing stop|logic)\b/i;
  if (weakEditVerb.test(normalized) && codeObjectHint.test(normalized)) return true;
  const pathMention = hasPathMention(task);
  if (!pathMention) return false;
  if (/\b(in|inside|into|to|update|put|place|insert|apply|use|with)\b/i.test(normalized)) return true;
  const trimmed = normalized.trim().toLowerCase();
  const questionLike =
    /\?$/.test(trimmed) ||
    /^(what|why|how|when|where|who|which|can|could|would|should|is|are|do|does|did)\b/.test(trimmed) ||
    /\b(about|explain|describe|read|summarize|tell me|walk me through)\b/.test(trimmed);
  return !questionLike;
}

function isLikelyImplementationAsk(task: string): boolean {
  const normalized = normalizeIntentTypos(task).toLowerCase().trim();
  if (!normalized) return false;
  if (isGreetingLike(normalized) || isAcknowledgementLike(normalized)) return false;
  const strongImplementationAsk = /\b(create|build|implement|write|make|add|edit|fix|refactor|patch|ship|strategy|indicator|trailing stop|stop loss)\b/;
  const weakImplementationAsk = /\b(update|change|adjust|set|increase|decrease|rename|replace|remove|toggle)\b/.test(normalized);
  const implementationObjectHint =
    /\b(code|file|path|function|method|class|variable|parameter|param|input|length|period|setting|config|strategy|indicator|stop loss|trailing stop|logic)\b/.test(
      normalized
    );
  if (
    isQuestionLike(normalized) &&
    !strongImplementationAsk.test(normalized) &&
    !(weakImplementationAsk && implementationObjectHint)
  ) {
    return false;
  }
  return strongImplementationAsk.test(normalized) || (weakImplementationAsk && implementationObjectHint);
}

function isPureConversationalTask(task: string): boolean {
  const trimmed = String(task || "").trim();
  if (!trimmed) return true;
  return (
    (isGreetingLike(trimmed) || isAcknowledgementLike(trimmed) || isQuestionLike(trimmed)) &&
    !hasCodeEditIntent(trimmed) &&
    !hasExecutionIntent(trimmed) &&
    !hasExplicitCommandRunIntent(trimmed)
  );
}

function getCurrentYearChicago(): string {
  return new Intl.DateTimeFormat("en-US", { year: "numeric", timeZone: "America/Chicago" }).format(new Date());
}

function getDeterministicConversationalReply(task: string): string | null {
  const normalized = normalizeIdentityProbeText(task);
  if (!normalized) return "I'm here and ready to help. What would you like to do next?";

  if (
    /\b(what|which)\s+year\b/.test(normalized) ||
    /\bcurrent year\b/.test(normalized) ||
    /\bwhat s the year\b/.test(normalized) ||
    /\bwhat year is it\b/.test(normalized)
  ) {
    return `It's ${getCurrentYearChicago()}.`;
  }

  if (isAcknowledgementLike(normalized)) {
    return "Happy to help. Tell me what you'd like to do next.";
  }

  if (isGreetingLike(normalized)) {
    return "Hey. What can I help you with right now?";
  }

  return null;
}

function detectLanguageFromPath(path: string): "ts" | "js" | "python" | "go" | "rust" | "docs" | "other" {
  const lower = path.toLowerCase();
  if (/\.(ts|tsx)$/.test(lower)) return "ts";
  if (/\.(js|jsx)$/.test(lower)) return "js";
  if (/\.(py)$/.test(lower)) return "python";
  if (/\.(go)$/.test(lower)) return "go";
  if (/\.(rs)$/.test(lower)) return "rust";
  if (/\.(md|mdx|txt|rst)$/.test(lower)) return "docs";
  return "other";
}

export type ToolAction =
  | { type: "edit"; path: string; patch: string }
  | { type: "command"; command: string; category?: "implementation" | "validation" }
  | { type: "mkdir"; path: string }
  | { type: "write_file"; path: string; content: string; overwrite?: boolean };

function summarizeExplicitToolActions(input: {
  edits: Array<{ path: string; patch: string; rationale?: string }>;
  commands: string[];
  structuredActions?: ToolAction[];
}): {
  actions: ToolAction[];
  hasFileActions: boolean;
  hasCommandActions: boolean;
  editCount: number;
  writeFileCount: number;
  mkdirCount: number;
} {
  const actions = uniqToolActions(
    [
      ...(input.structuredActions ?? []),
      ...input.edits
        .filter((edit) => looksLikeConcreteFilePath(edit.path) && String(edit.patch || "").trim())
        .map((edit) => ({ type: "edit", path: edit.path, patch: edit.patch } as const)),
      ...input.commands
        .filter((command) => String(command || "").trim())
        .map((command) => ({ type: "command", command: String(command).trim(), category: "validation" as const })),
    ] as ToolAction[]
  );
  const editCount = actions.filter((action) => action.type === "edit").length;
  const writeFileCount = actions.filter((action) => action.type === "write_file").length;
  const mkdirCount = actions.filter((action) => action.type === "mkdir").length;
  const hasFileActions = editCount + writeFileCount + mkdirCount > 0;
  const hasCommandActions = actions.some((action) => action.type === "command");
  return {
    actions,
    hasFileActions,
    hasCommandActions,
    editCount,
    writeFileCount,
    mkdirCount,
  };
}

function actionsTouchTargetPath(actions: ToolAction[], targetPath: string | null | undefined): boolean {
  const normalizedTarget = normalizeRelativePath(targetPath || "");
  if (!normalizedTarget) return true;
  return actions.some((action) => {
    if (action.type !== "edit" && action.type !== "write_file" && action.type !== "mkdir") return false;
    const normalizedPath = normalizeRelativePath(action.path || "");
    if (!normalizedPath) return false;
    return normalizedPath === normalizedTarget || normalizedPath.endsWith(`/${normalizedTarget}`);
  });
}

function classifyToolFailureCategory(input: {
  codeEditIntent: boolean;
  hasFileActions: boolean;
  hasCommandActions: boolean;
  actionSource: AssistToolActionSource;
  targetPathHintAvailable: boolean;
}): AssistToolFailureCategory | null {
  if (input.codeEditIntent && input.hasCommandActions && !input.hasFileActions) {
    return "command_only_for_edit";
  }
  if (input.codeEditIntent && input.actionSource === "none") {
    return input.targetPathHintAvailable ? "schema_invalid" : "target_path_missing";
  }
  if (input.codeEditIntent && !input.hasFileActions) {
    return input.targetPathHintAvailable ? "schema_invalid" : "target_path_missing";
  }
  return null;
}

function scoreToolAttempt(input: {
  hasFileActions: boolean;
  hasCommandActions: boolean;
  editCount: number;
  writeFileCount: number;
  mkdirCount: number;
  actionSource: AssistToolActionSource;
  route: AssistToolRoute;
  failureCategory: AssistToolFailureCategory | null;
}): number {
  let score = 0;
  if (input.hasFileActions) score += 200;
  score += input.editCount * 32;
  score += input.writeFileCount * 28;
  score += input.mkdirCount * 12;
  if (input.hasCommandActions) score += input.hasFileActions ? 10 : -80;
  if (input.actionSource === "native_tool_calls") score += 30;
  else if (input.actionSource === "structured_json") score += 24;
  else if (input.actionSource === "single_file_rewrite_fallback") score += 18;
  else if (input.actionSource === "deterministic_synthesis") score += 14;
  if (input.route === "native_tools" && input.hasFileActions) score += 6;
  if (input.failureCategory) score -= 45;
  return score;
}

function uniqToolActions(actions: ToolAction[]): ToolAction[] {
  const seen = new Set<string>();
  const out: ToolAction[] = [];
  for (const action of actions) {
    const key =
      action.type === "edit"
        ? `edit:${action.path}:${action.patch}`
        : action.type === "command"
          ? `command:${action.command}:${action.category || ""}`
          : action.type === "mkdir"
            ? `mkdir:${action.path}`
            : `write_file:${action.path}:${action.overwrite ? 1 : 0}:${action.content}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(action);
  }
  return out;
}

function normalizeToolPath(path: string): string | null {
  const normalized = normalizeRelativePath(path);
  if (!normalized) return null;
  if (/^\.+$/.test(normalized)) return null;
  return normalized;
}

function normalizeToolFilePath(path: string): string | null {
  const normalized = normalizeToolPath(path);
  if (!normalized) return null;
  return looksLikeConcreteFilePath(normalized) ? normalized : null;
}

function inferMkdirPathFromTask(task: string): string | null {
  const patterns = [
    /\b(?:create|make|add)\s+(?:a\s+)?(?:new\s+)?(?:folder|directory|dir)\s+(?:called|named)?\s*["'`]?([a-zA-Z0-9_./-]+)["'`]?/i,
    /\bmkdir\s+["'`]?([a-zA-Z0-9_./-]+)["'`]?/i,
  ];
  for (const pattern of patterns) {
    const match = task.match(pattern);
    if (match?.[1]) {
      const path = normalizeToolPath(match[1]);
      if (path) return path;
    }
  }
  return null;
}

function inferWriteFileIntent(task: string): { path: string; content: string; overwrite: boolean } | null {
  const hasWriteIntent = /\b(create|write|make|add)\b/i.test(task) && /\b(file)\b/i.test(task);
  const path = inferPathFromTask(task);
  if (!hasWriteIntent || !path) return null;
  const normalized = normalizeToolPath(path);
  if (!normalized) return null;
  return { path: normalized, content: "", overwrite: true };
}

export function synthesizeDeterministicActions(input: {
  task: string;
  edits: Array<{ path: string; patch: string; rationale?: string }>;
  commands: string[];
  structuredActions?: ToolAction[];
}): ToolAction[] {
  const actions: ToolAction[] = [];

  for (const action of input.structuredActions ?? []) {
    if (action.type === "edit") {
      const path = normalizeToolFilePath(action.path);
      if (!path || !action.patch.trim()) continue;
      actions.push({ type: "edit", path, patch: action.patch.trim() });
      continue;
    }
    if (action.type === "command") {
      const command = action.command.trim();
      if (!command || !looksLikeShellCommand(command)) continue;
      actions.push({ type: "command", command, ...(action.category ? { category: action.category } : {}) });
      continue;
    }
    if (action.type === "mkdir") {
      const path = normalizeToolPath(action.path);
      if (!path) continue;
      actions.push({ type: "mkdir", path });
      continue;
    }
    const path = normalizeToolPath(action.path);
    if (!path) continue;
    actions.push({
      type: "write_file",
      path,
      content: typeof action.content === "string" ? action.content : "",
      ...(typeof action.overwrite === "boolean" ? { overwrite: action.overwrite } : {}),
    });
  }

  for (const edit of input.edits) {
    const path = normalizeToolFilePath(edit.path);
    if (!path || !edit.patch.trim()) continue;
    actions.push({ type: "edit", path, patch: edit.patch.trim() });
  }

  for (const command of input.commands) {
    const cleaned = command.trim();
    if (!cleaned || !looksLikeShellCommand(cleaned)) continue;
    actions.push({ type: "command", command: cleaned, category: "validation" });
  }

  const inferredMkdir = inferMkdirPathFromTask(input.task);
  if (inferredMkdir && !actions.some((action) => action.type === "mkdir" && action.path === inferredMkdir)) {
    actions.push({ type: "mkdir", path: inferredMkdir });
  }

  const inferredWrite = inferWriteFileIntent(input.task);
  if (
    inferredWrite &&
    !actions.some((action) => action.type === "edit" && action.path === inferredWrite.path) &&
    !actions.some((action) => action.type === "write_file" && action.path === inferredWrite.path)
  ) {
    actions.push({ type: "write_file", path: inferredWrite.path, content: inferredWrite.content, overwrite: inferredWrite.overwrite });
  }

  return uniqToolActions(actions).slice(0, 40);
}

function buildValidationPlan(input: {
  task: string;
  actions: ToolAction[];
  explicitCommandRunIntent: boolean;
  decisionMode: AssistDecisionMode;
}): { scope: "none" | "targeted"; checks: string[]; touchedFiles: string[]; reason: string } {
  const touchedFiles = Array.from(
    new Set(
      input.actions.flatMap((action) => {
        if (action.type === "edit") return [action.path];
        if (action.type === "write_file") return [action.path];
        if (action.type === "mkdir") return [action.path];
        return [];
      })
    )
  ).slice(0, 12);
  if (!touchedFiles.length) {
    return {
      scope: "none",
      checks: [],
      touchedFiles: [],
      reason: input.explicitCommandRunIntent
        ? "No file edits were produced; commands are optional and user-driven."
        : "No edited files detected, so no validation checks were planned.",
    };
  }

  const checks: string[] = [];
  const kinds = new Set(touchedFiles.map(detectLanguageFromPath));
  const primaryFile = touchedFiles[0];

  // These are batch/final checks; the extension still runs per-file quick validation after apply.
  checks.push(`git diff --check -- ${primaryFile}`);

  if (kinds.has("ts") || kinds.has("js")) {
    checks.push(`npm run lint -- ${primaryFile}`);
    checks.push("npm run typecheck");
  }
  if (kinds.has("python")) {
    checks.push(`python -m pytest ${primaryFile}`);
  }
  if (kinds.has("go")) {
    checks.push("go test ./...");
  }
  if (kinds.has("rust")) {
    checks.push("cargo test");
  }
  return {
    scope: checks.length > 0 ? "targeted" : "none",
    checks: Array.from(new Set(checks)).slice(0, 4),
    touchedFiles,
    reason:
      checks.length === 0
        ? "No reliable auto-validation command was inferred for touched files."
        : input.decisionMode === "debug"
          ? "Batch validation selected to verify the specific fix path after local per-file checks."
          : "Batch validation selected from touched files and language signals; local per-file validation still runs after apply.",
  };
}

function decideAutonomy(input: {
  confidence: number;
  actionsCount: number;
  hasEditActions: boolean;
  hasCommandActions: boolean;
  explicitCommandRunIntent: boolean;
  executionPolicy?: "full_auto" | "yolo_only" | "preview_first";
  decisionMode: AssistDecisionMode;
  clientPreferences?: AssistClientPreferences;
  autonomy?: AssistAutonomyConfig;
  riskBlocked?: boolean;
}): {
  mode: "no_actions" | "preview_only" | "auto_apply_only" | "auto_apply_and_validate";
  autoApplyEdits: boolean;
  autoRunValidation: boolean;
  confidence: number;
  thresholds: { autoApply: number; autoValidate: number };
  rationale: string;
} {
  if (input.riskBlocked) {
    return {
      mode: "preview_only",
      autoApplyEdits: false,
      autoRunValidation: false,
      confidence: input.confidence,
      thresholds: { autoApply: AUTO_APPLY_THRESHOLD, autoValidate: AUTO_VALIDATE_THRESHOLD },
      rationale: "High-risk action pattern detected; manual preview required.",
    };
  }

  if (input.actionsCount === 0) {
    return {
      mode: "no_actions",
      autoApplyEdits: false,
      autoRunValidation: false,
      confidence: input.confidence,
      thresholds: { autoApply: AUTO_APPLY_THRESHOLD, autoValidate: AUTO_VALIDATE_THRESHOLD },
      rationale: "No edit actions were generated.",
    };
  }

  const unboundedMode = input.autonomy?.mode === "unbounded";
  const runUntilDoneCommands = input.autonomy?.commandPolicy === "run_until_done";

  if (input.executionPolicy === "preview_first") {
    return {
      mode: "preview_only",
      autoApplyEdits: false,
      autoRunValidation: false,
      confidence: input.confidence,
      thresholds: { autoApply: AUTO_APPLY_THRESHOLD, autoValidate: AUTO_VALIDATE_THRESHOLD },
      rationale: "Execution policy requires preview-first behavior.",
    };
  }

  if (input.executionPolicy === "yolo_only" && input.decisionMode !== "yolo") {
    return {
      mode: "preview_only",
      autoApplyEdits: false,
      autoRunValidation: false,
      confidence: input.confidence,
      thresholds: { autoApply: AUTO_APPLY_THRESHOLD, autoValidate: AUTO_VALIDATE_THRESHOLD },
      rationale: "Execution policy only allows auto-apply in YOLO mode.",
    };
  }

  if (input.executionPolicy === "full_auto") {
    const shouldRunValidation = input.hasCommandActions || runUntilDoneCommands;
    return {
      mode: shouldRunValidation ? "auto_apply_and_validate" : "auto_apply_only",
      autoApplyEdits: input.hasEditActions || !shouldRunValidation,
      autoRunValidation: shouldRunValidation,
      confidence: input.confidence,
      thresholds: { autoApply: AUTO_APPLY_THRESHOLD, autoValidate: AUTO_VALIDATE_THRESHOLD },
      rationale: runUntilDoneCommands
        ? "Execution policy enables full-auto with run-until-done command policy."
        : "Execution policy enables full-auto for approved actions.",
    };
  }

  const preferPreview = input.clientPreferences?.autonomy === "preview_first";
  if (preferPreview && !unboundedMode) {
    return {
      mode: "preview_only",
      autoApplyEdits: false,
      autoRunValidation: false,
      confidence: input.confidence,
      thresholds: { autoApply: AUTO_APPLY_THRESHOLD, autoValidate: AUTO_VALIDATE_THRESHOLD },
      rationale: "Client preference requests preview-first behavior.",
    };
  }

  if (unboundedMode) {
    return {
      mode: "auto_apply_and_validate",
      autoApplyEdits: true,
      autoRunValidation: input.hasCommandActions || runUntilDoneCommands,
      confidence: input.confidence,
      thresholds: { autoApply: AUTO_APPLY_THRESHOLD, autoValidate: AUTO_VALIDATE_THRESHOLD },
      rationale: "Unbounded autonomy mode forces auto-apply and run-until-done execution.",
    };
  }

  if (input.confidence >= AUTO_VALIDATE_THRESHOLD) {
    return {
      mode: "auto_apply_and_validate",
      autoApplyEdits: true,
      autoRunValidation: true,
      confidence: input.confidence,
      thresholds: { autoApply: AUTO_APPLY_THRESHOLD, autoValidate: AUTO_VALIDATE_THRESHOLD },
      rationale: "Auto mode prefers aggressive execution with validation when risk is acceptable.",
    };
  }
  if (input.decisionMode === "generate" || input.decisionMode === "debug" || input.decisionMode === "yolo") {
    return {
      mode: "auto_apply_and_validate",
      autoApplyEdits: true,
      autoRunValidation: true,
      confidence: input.confidence,
      thresholds: { autoApply: AUTO_APPLY_THRESHOLD, autoValidate: AUTO_VALIDATE_THRESHOLD },
      rationale: "Auto mode aggressively applies and validates by default when risk is acceptable.",
    };
  }
  if (input.confidence >= AUTO_APPLY_THRESHOLD) {
    return {
      mode: "auto_apply_only",
      autoApplyEdits: true,
      autoRunValidation: input.explicitCommandRunIntent,
      confidence: input.confidence,
      thresholds: { autoApply: AUTO_APPLY_THRESHOLD, autoValidate: AUTO_VALIDATE_THRESHOLD },
      rationale: "Confidence meets auto-apply threshold but not validation threshold.",
    };
  }
  return {
    mode: "preview_only",
    autoApplyEdits: false,
    autoRunValidation: false,
    confidence: input.confidence,
    thresholds: { autoApply: AUTO_APPLY_THRESHOLD, autoValidate: AUTO_VALIDATE_THRESHOLD },
    rationale: "Confidence below auto-apply threshold; returning preview only.",
  };
}

export async function guardPlaygroundAccess(params: {
  userId: string;
  email: string;
  requestedMaxTokens: number;
  estimatedInputTokens: number;
}): Promise<
  | { allowed: true; maxTokens: number; unlimited: boolean }
  | { allowed: false; status: number; error: string; message: string; details?: unknown }
> {
  const localBypassEnabled =
    process.env.PLAYGROUND_LOCAL_BYPASS === "1" ||
    process.env.NEXT_PUBLIC_PLAYGROUND_LOCAL_BYPASS === "1" ||
    process.env.NODE_ENV !== "production";
  if (localBypassEnabled) {
    return { allowed: true, maxTokens: Math.max(64, params.requestedMaxTokens), unlimited: true };
  }

  const unlimited = hasUnlimitedPlaygroundAccess(params.email);
  if (unlimited) {
    return { allowed: true, maxTokens: Math.max(64, params.requestedMaxTokens), unlimited: true };
  }

  const plan = await getUserPlan(params.userId);
  if (!plan || !plan.isActive) {
    return {
      allowed: false,
      status: 402,
      error: "PLAYGROUND_SUBSCRIPTION_REQUIRED",
      message:
        "Playground subscription required. Free dashboard plan keys cannot access Playground API endpoints.",
    };
  }

  const rate = await checkRateLimits(
    params.userId,
    params.requestedMaxTokens,
    params.estimatedInputTokens
  );
  if (!rate.allowed) {
    const status = rate.reason?.includes("subscription") ? 402 : 429;
    return {
      allowed: false,
      status,
      error: status === 402 ? "PAYMENT_REQUIRED" : "RATE_LIMITED",
      message: rate.reason || "Request limit exceeded.",
      details: {
        usage: rate.currentUsage,
        limits: rate.limits,
      },
    };
  }

  return {
    allowed: true,
    maxTokens: Math.min(params.requestedMaxTokens, rate.limits?.maxOutputTokens || 512),
    unlimited: false,
  };
}

export async function runAssist(
  req: AssistRequest,
  hooks?: {
    onToken?: (token: string) => void | Promise<void>;
    onReasoningToken?: (token: string) => void | Promise<void>;
    onStatus?: (status: string) => void | Promise<void>;
  },
  runtimeOptions?: AssistRunRuntimeOptions
): Promise<AssistResult> {
  const aggressiveAllowed = process.env.PLAYGROUND_ENABLE_AGGRESSIVE_YOLO === "1";
  const effectiveSafety: SafetyProfile =
    req.safetyProfile === "aggressive" && !aggressiveAllowed ? "standard" : req.safetyProfile ?? "standard";
  const requested = req.mode === "yolo" ? "yolo" : req.mode;
  const intentResolution = resolveIntentRouting({
    task: req.task,
    context: req.context,
    conversationHistory: req.conversationHistory,
  });
  const reasonCodes = [...intentResolution.reasonCodes];

  let decision =
    requested === "auto"
      ? {
          mode: mapIntentToDecision(intentResolution.intent) as AssistDecisionMode,
          reason: buildDecisionReason(intentResolution.intent),
          confidence: intentResolution.confidence,
        }
      : ({
          mode:
            requested === "generate" || requested === "debug" || requested === "plan" || requested === "yolo"
              ? requested
              : "plan",
          reason: `Mode explicitly requested: ${requested}`,
          confidence: 0.99,
        } as const);
  if (requested !== "auto") {
    reasonCodes.push(`explicit_mode_${requested}`);
  } else {
    reasonCodes.push(`intent_${intentResolution.intent}`);
  }
  if (req.executionPolicy) {
    reasonCodes.push(`execution_policy_${req.executionPolicy}`);
  }
  const isCountryOriginProbeTask = isCountryOriginProbe(req.task);
  const isIdentityProbe = isQwenOrNscaleIdentityProbe(req.task);
  if (isCountryOriginProbeTask) {
    decision = {
      mode: "generate",
      reason: "Country-of-origin probe detected; enforcing country guardrail.",
      confidence: 0.99,
    };
    reasonCodes.push("identity_guardrail_country_origin");
  } else if (isIdentityProbe) {
    decision = {
      mode: "generate",
      reason: "Identity probe detected; enforcing product identity guardrail.",
      confidence: 0.99,
    };
    reasonCodes.push("identity_guardrail_qwen_nscale");
  }

  const runProfile = resolveRunProfile(req.clientPreferences, req.userProfile);
  const sessionMemory = readSessionMemory(req.userProfile);
  const explicitCommandRunIntent = hasExplicitCommandRunIntent(req.task);
  const pureConversationalTask = isPureConversationalTask(req.task);
  const preflightCodeEditIntent =
    !pureConversationalTask &&
    (hasCodeEditIntent(req.task) || intentResolution.intent === "code_edit" || requested === "yolo");
  const preflightDebugIntent = decision.mode === "debug" || intentResolution.intent === "debug";
  const budget = {
    maxTokens: Math.max(
      req.contextBudget?.maxTokens ?? (runProfile === "deep_focus" ? 16_384 : 8_192),
      runProfile === "deep_focus" && !pureConversationalTask ? 16_384 : 8_192
    ),
    strategy: req.contextBudget?.strategy ?? ("hybrid" as const),
  };
  const budgetedContext = trimContextByBudget(req.context, budget.maxTokens, budget.strategy);
  const targetInference = buildTargetInference({
    task: req.task,
    context: budgetedContext,
    retrievalHints: req.retrievalHints,
    profile: req.userProfile,
    codeEditIntent: preflightCodeEditIntent,
    debugIntent: preflightDebugIntent,
  });
  const contextSelection = buildContextSelection({
    context: budgetedContext,
    retrievalHints: req.retrievalHints,
    targetInference,
  });
  const preflightTaskShape =
    pureConversationalTask
      ? "conversation"
      : preflightDebugIntent
        ? "debug"
        : preflightCodeEditIntent && contextSelection.files.length > 4
          ? "multi_file_edit"
          : preflightCodeEditIntent
            ? "single_file_edit"
            : explicitCommandRunIntent
              ? "execution"
              : "general";
  reasonCodes.push(`run_profile_${runProfile}`);
  reasonCodes.push(`preflight_${preflightTaskShape}`);
  const plan = decision.mode === "plan" || decision.mode === "yolo" ? buildPlan(req.task, budgetedContext) : null;

  const longContextRequested = budget.maxTokens > STANDARD_CONTEXT_LIMIT;
  const longContextEnabled = process.env.PLAYGROUND_ENABLE_LONG_CONTEXT === "1";
  let modelUsed = "";

  const logs: string[] = [];
  logs.push(`intent=${intentResolution.intent} delta=${intentResolution.delta.toFixed(2)} clarified=${intentResolution.clarified ? 1 : 0}`);
  logs.push(`decision=${decision.mode} confidence=${decision.confidence.toFixed(2)}`);
  logs.push(`contextBudget=${budget.maxTokens}/${budget.strategy}`);
  logs.push(`run_profile=${runProfile}`);
  logs.push(`preflight_task_shape=${preflightTaskShape}`);
  logs.push(
    `target_inference=${targetInference.path || "none"}:${targetInference.source}:${targetInference.confidence.toFixed(2)}`
  );
  logs.push(
    `context_selection=${contextSelection.files.map((file) => file.path).slice(0, 8).join(",") || "none"}`
  );
  logs.push(`reasonCodes=${reasonCodes.join(",")}`);

  let final = "";
  let edits: Array<{ path: string; patch: string; rationale?: string }> = [];
  let modelCommands: string[] = [];
  let structuredActions: ToolAction[] = [];
  let repromptStage: AssistRecoveryStage = "none";
  let actionability: AssistResult["actionability"] = {
    summary: "valid_actions",
    reason: "Action set is acceptable for this request.",
  };
  let activeToolRoute: AssistToolRoute = "text_actions";
  let toolRouteUsed: AssistToolRoute = activeToolRoute;
  let toolActionSource: AssistToolActionSource = "none";
  let lastToolFailureCategory: AssistToolFailureCategory | null = null;
  const toolAttempts: AssistToolAttempt[] = [];
  let bestAttemptScore = Number.NEGATIVE_INFINITY;
  let bestStructuredAttempt:
    | {
        route: AssistToolRoute;
        actionSource: AssistToolActionSource;
        recoveryStage: AssistRecoveryStage;
        final: string;
        edits: Array<{ path: string; patch: string; rationale?: string }>;
        commands: string[];
        structuredActions: ToolAction[];
      }
    | null = null;
  const deterministicConversationReply =
    pureConversationalTask && !isCountryOriginProbeTask && !isIdentityProbe
      ? getDeterministicConversationalReply(req.task)
      : null;
  if (deterministicConversationReply) {
    reasonCodes.push("conversation_deterministic_reply");
  }
  const likelyImplementationAsk = isLikelyImplementationAsk(req.task);
  const autonomousNoActionRetryEligible =
    !pureConversationalTask &&
    likelyImplementationAsk &&
    (req.executionPolicy === "full_auto" || req.mode === "yolo");
  const codeEditIntent =
    !pureConversationalTask &&
    (
      hasCodeEditIntent(req.task) ||
      intentResolution.intent === "code_edit" ||
      autonomousNoActionRetryEligible ||
      (runProfile === "deep_focus" && likelyImplementationAsk)
    );
  if (autonomousNoActionRetryEligible && intentResolution.intent === "conversation") {
    reasonCodes.push("autonomy_forced_code_edit_from_task");
  }
  const primaryTargetPath =
    targetInference.path ||
    (codeEditIntent ? inferPrimaryTargetPath(req.task, budgetedContext) : null) ||
    sessionMemory.lastTargetPath ||
    null;
  const contextAnchorsAvailable =
    !!primaryTargetPath ||
    !!budgetedContext?.activeFile?.selection?.trim() ||
    !!budgetedContext?.activeFile?.content?.trim() ||
    (budgetedContext?.openFiles?.length ?? 0) > 0;
  if (primaryTargetPath) {
    reasonCodes.push("context_target_path_inferred");
    logs.push(`context_target_source=${targetInference.source}`);
  }
  const commandPolicyResolved = req.autonomy?.commandPolicy === "run_until_done" ? "run_until_done" : "safe_default";
  const maxAgenticTooling =
    (commandPolicyResolved === "run_until_done" || runProfile === "deep_focus") &&
    (codeEditIntent || decision.mode === "debug" || decision.mode === "yolo");
  const reasoningPreference = extractReasoningPreference(req.workflowIntentId);
  const preferredReasoning = req.clientPreferences?.reasoning || req.userProfile?.reasoningPreference || null;
  const effectiveReasoning = reasoningPreference || preferredReasoning || (runProfile === "deep_focus" ? "high" : null);
  const reasoningInstruction =
    effectiveReasoning === "low"
      ? "Reasoning preference: low. Optimize for speed and concise output."
      : effectiveReasoning === "high"
        ? "Reasoning preference: high. Reason carefully and validate assumptions before proposing edits."
        : effectiveReasoning === "max"
          ? "Reasoning preference: max. Be deliberate, safety-first, and include explicit verification steps."
          : effectiveReasoning === "medium"
            ? "Reasoning preference: medium. Use balanced reasoning with concise steps."
            : null;
  const providerPreference =
    String(runtimeOptions?.provider || process.env.PLAYGROUND_PROVIDER || "auto")
      .trim()
      .toLowerCase() || "auto";
  const availableProviders = getAvailableProviders(runtimeOptions?.nvidiaApiKey);
  const preferredProviders =
    providerPreference === "hf" || providerPreference === "nvidia" ? ([providerPreference] as AssistProvider[]) : availableProviders;
  const requestedModelAlias = resolveModelAlias(
    req.model || req.userProfile?.preferredModelAlias || process.env.PLAYGROUND_MODEL,
    DEFAULT_PLAYGROUND_MODEL
  );
  const requestedRegistryEntry = getPlaygroundModelEntry(requestedModelAlias);
  const modelSelection = resolvePlaygroundModelSelection({
    requested: requestedModelAlias,
    allowedProviders: preferredProviders,
    requirements: {
      images: (req.attachments?.length ?? 0) > 0,
      textActions: codeEditIntent || decision.mode === "debug" || decision.mode === "yolo",
      shellCommands: explicitCommandRunIntent || decision.mode === "yolo",
      toolReady:
        (codeEditIntent || decision.mode === "debug" || decision.mode === "yolo") &&
        requestedRegistryEntry?.certification !== "experimental",
    },
  });
  const nativePreviewEntry =
    maxAgenticTooling && !(req.attachments?.length ?? 0)
      ? getPlaygroundModelEntry("playground-native-preview")
      : null;
  const explicitNativeModelRequested = !!requestedRegistryEntry?.capabilities.supportsNativeTools;
  const nativePreviewAllowed =
    !!nativePreviewEntry &&
    (!preferredProviders.length || preferredProviders.includes(nativePreviewEntry.provider));
  const preferredRouteChain =
    !maxAgenticTooling && !explicitNativeModelRequested
      ? modelSelection.fallbackChain.filter((entry) => !entry.capabilities.supportsNativeTools)
      : modelSelection.fallbackChain;
  const baseRouteChain = preferredRouteChain.length > 0 ? preferredRouteChain : modelSelection.fallbackChain;
  const modelFallbackChain = nativePreviewAllowed
    ? [
        nativePreviewEntry!,
        ...baseRouteChain.filter((entry) => entry.alias !== nativePreviewEntry!.alias),
      ]
    : baseRouteChain;
  const primaryModelEntry = modelFallbackChain[0] ?? modelSelection.resolvedEntry;
  activeToolRoute = primaryModelEntry.capabilities.supportsNativeTools || nativePreviewAllowed ? "native_tools" : "text_actions";
  toolRouteUsed = activeToolRoute;
  modelUsed = primaryModelEntry.model;
  const adapter: AssistModelMetadata["adapter"] = primaryModelEntry.capabilities.supportsNativeTools
    ? "native_tools_v1"
    : "text_actions_v1";
  let modelMetadata: AssistModelMetadata = {
    contractVersion: PLAYGROUND_CONTRACT_VERSION,
    adapter,
    modelRequested: requestedModelAlias,
    modelRequestedAlias: modelSelection.requestedAlias,
    modelResolved: primaryModelEntry.model,
    modelResolvedAlias: primaryModelEntry.alias,
    providerResolved: primaryModelEntry.provider,
    capabilities: { ...primaryModelEntry.capabilities },
    certification: primaryModelEntry.certification,
  };
  logs.push(`model_requested=${requestedModelAlias}`);
  logs.push(`model_resolved_alias=${modelMetadata.modelResolvedAlias}`);
  logs.push(`model_resolved=${modelMetadata.modelResolved}`);
  logs.push(`provider_resolved=${modelMetadata.providerResolved}`);
  logs.push(`contract_version=${modelMetadata.contractVersion}`);
  logs.push(`adapter=${adapter}`);
  logs.push(`tool_strategy=${maxAgenticTooling ? "max_agentic" : "standard"}`);
  logs.push(`tool_route_initial=${activeToolRoute}`);
  if (maxAgenticTooling) reasonCodes.push("tool_strategy_max_agentic");
  if (nativePreviewAllowed) reasonCodes.push("native_tools_route_enabled");
  let executionPromptBase = "";
  let exampleFileActionPath = "hello.py";
  let validWriteFileActionExample =
    '{"final":"Prepared update.","actions":[{"type":"write_file","path":"hello.py","content":"<full updated file content>","overwrite":true}],"commands":[]}';
  let invalidCommandOnlyActionExample =
    '{"final":"done","actions":[{"type":"command","command":"npm run lint","category":"validation"}],"commands":["npm run lint"]}';
  let raw = "";
  let providerResult: ProviderChatResult = { text: "", reasoning: "", toolCalls: [] };
  let structuredFromProviderResult:
    | ((result: ProviderChatResult) => StructuredAssistOutput | null)
    | null = null;
  let detectStructuredCandidate:
    | ((input: {
        result?: ProviderChatResult | null;
        rawText: string;
        route: AssistToolRoute;
        recoveryStage: AssistRecoveryStage;
      }) => {
        structured: StructuredAssistOutput | null;
        actionSource: AssistToolActionSource;
        route: AssistToolRoute;
        recoveryStage: AssistRecoveryStage;
        failureCategory: AssistToolFailureCategory | null;
        finalText: string;
        score: number;
        actions: ToolAction[];
        hasFileActions: boolean;
        hasCommandActions: boolean;
        editCount: number;
        writeFileCount: number;
        mkdirCount: number;
      })
    | null = null;
  let rememberDetectedCandidate:
    | ((candidate: NonNullable<typeof detectStructuredCandidate> extends (input: infer _A) => infer R ? R : never) => void)
    | null = null;
  let applyDetectedCandidate:
    | ((candidate: NonNullable<typeof detectStructuredCandidate> extends (input: infer _A) => infer R ? R : never) => void)
    | null = null;
  let callWithAttachmentFallback:
    | ((
        promptText: string,
        attachmentsForCall?: AssistAttachment[],
        preferredRoute?: AssistToolRoute
      ) => Promise<ProviderChatResult>)
    | null = null;
  if (longContextRequested && !longContextEnabled) {
    logs.push("long-context model unavailable; using summarized/truncated context fallback");
  }
  if (isCountryOriginProbeTask) {
    final = COUNTRY_OF_ORIGIN_RESPONSE;
    logs.push("identity_guardrail=country_origin_override");
  } else if (isIdentityProbe) {
    final = IDENTITY_DENIAL_RESPONSE;
    logs.push(`identity_guardrail=enforced model=${PUBLIC_PLAYGROUND_MODEL_NAME}`);
  } else if (deterministicConversationReply) {
    final = deterministicConversationReply;
    logs.push("conversation_guardrail=deterministic_smalltalk");
  } else if (decision.mode === "plan") {
    final = [
      `Objective: ${plan?.objective}`,
      "",
      "Steps:",
      ...(plan?.steps ?? []).map((s, i) => `${i + 1}. ${s}`),
      "",
      "Acceptance Tests:",
      ...(plan?.acceptanceTests ?? []).map((s) => `- ${s}`),
      "",
      "Risk Flags:",
      ...(plan?.riskFlags ?? []).map((s) => `- ${s}`),
    ].join("\n");
  } else {
    const safeAttachments = sanitizeAttachmentsForModel(req.attachments);
    if ((req.attachments?.length ?? 0) > safeAttachments.length) {
      logs.push(`attachments_filtered=${safeAttachments.length}/${req.attachments?.length ?? 0}`);
    }
    if (safeAttachments.length > 0) {
      logs.push(`attachments_included=${safeAttachments.length}`);
    }
    const useStructuredOutput = codeEditIntent || decision.mode === "debug" || decision.mode === "yolo";
    exampleFileActionPath = normalizeRelativePath(primaryTargetPath || budgetedContext?.activeFile?.path || "") || "hello.py";
    validWriteFileActionExample = `{"final":"Prepared update.","actions":[{"type":"write_file","path":"${exampleFileActionPath}","content":"<full updated file content>","overwrite":true}],"commands":[]}`;
    const routeUsesNativeTools = (route: AssistToolRoute) => route === "native_tools";
    const buildActionContractPrompt = (route: AssistToolRoute): string => {
      if (routeUsesNativeTools(route)) {
        return [
          "Available backend tools:",
          "- apply_edit(path, patch): apply a unified diff patch to an existing workspace file. Use this instead of describing diffs in prose.",
          "- write_file(path, content, overwrite?): write the full updated contents for a file or create a new file. Use this when you can provide the complete updated file text.",
          "- mkdir(path): create a workspace-relative directory.",
          explicitCommandRunIntent || decision.mode === "yolo"
            ? '- run_command(command, category): run a necessary shell command after edits or for validation. category must be "implementation" or "validation".'
            : "- run_command(command, category): leave unused unless the task explicitly requires runnable commands or validation.",
          codeEditIntent
            ? "For edit-intent tasks, you must produce at least one file tool call. Prose-only output and command-only output are invalid."
            : "If no repository change is required, answer directly and do not fabricate tool calls.",
          "Prefer apply_edit for targeted changes to existing files. Prefer write_file for full-file rewrites or new files.",
          codeEditIntent
            ? `Valid edit-task outcome example: call write_file with path="${exampleFileActionPath}", content="<full updated file content>", overwrite=true.`
            : "",
          codeEditIntent ? "Invalid edit-task outcome example: only calling run_command with no file tool call." : "",
        ]
          .filter(Boolean)
          .join("\n");
      }
      return [
        'Return STRICT JSON only with this shape: {"final":"string","actions":[{"type":"edit","path":"relative/path","patch":"unified diff patch"},{"type":"write_file","path":"relative/path","content":"full file text","overwrite":true},{"type":"mkdir","path":"relative/path"},{"type":"command","command":"safe shell command","category":"validation"}],"edits":[{"path":"relative/path","patch":"unified diff patch","rationale":"optional"}],"commands":["safe command"]}.',
        "Available JSON action types:",
        "- edit(path, patch): targeted unified diff for an existing file.",
        "- write_file(path, content, overwrite): full updated file contents or a new file.",
        "- mkdir(path): create a directory.",
        '- command(command, category): only for necessary implementation or validation commands; category must be "implementation" or "validation".',
        codeEditIntent
          ? "For edit-intent tasks, at least one file action is required. Prose-only output and command-only output are invalid."
          : "If no repository change is required, keep actions empty and answer briefly in final.",
        "Prefer edit for targeted modifications. Prefer write_file for full rewrites or new files.",
        codeEditIntent ? `Valid edit-task JSON example: ${validWriteFileActionExample}` : "",
        codeEditIntent ? `Invalid edit-task JSON example: ${invalidCommandOnlyActionExample}` : "",
      ]
        .filter(Boolean)
        .join("\n");
    };
    const buildExecutionPromptBase = (route: AssistToolRoute): string => {
      const actionContractPrompt = buildActionContractPrompt(route);
      const routeAdapter = routeUsesNativeTools(route) ? "native_tools_v1" : "text_actions_v1";
      return [
        `Mode: ${decision.mode}`,
        `Resolved intent: ${intentResolution.intent}`,
        `Task: ${req.task}`,
        codeEditIntent && primaryTargetPath ? `Primary target file hint: ${primaryTargetPath}` : "",
        req.workflowIntentId ? `Workflow intent id: ${req.workflowIntentId}` : "",
        reasoningInstruction,
        `Safety profile: ${effectiveSafety}`,
        `Contract version: ${modelMetadata.contractVersion}`,
        `Requested model alias: ${modelSelection.requestedAlias}`,
        `Route preference: ${route}`,
        `Adapter: ${routeAdapter}`,
        "",
        profileToPrompt(req.userProfile, req.clientPreferences, req.autonomy),
        "",
        conversationToPrompt(req.conversationHistory),
        "",
        contextToPrompt(budgetedContext, safeAttachments),
        "",
        decision.mode === "debug"
          ? "Focus on root cause, minimal safe fix, and verification."
          : decision.mode === "yolo"
            ? "Focus on direct implementation with actionable edits and commands."
            : "Focus on production-ready implementation guidance with concise rationale.",
        "",
        useStructuredOutput ? actionContractPrompt : "Return plain text only. Do not return JSON.",
        useStructuredOutput
          ? codeEditIntent
            ? contextAnchorsAvailable
              ? "Rules: include concrete file actions when the user asks to create/modify code; if file path is omitted, infer target from the provided IDE context and proceed without follow-up questions."
              : "Rules: include concrete file actions when the user asks to create/modify code; do not return placeholder text."
            : "Rules: keep actions empty unless explicitly requested; answer in plain natural language and avoid standalone code snippets."
          : "Rules: answer directly in natural language and avoid markdown fences.",
        useStructuredOutput
          ? explicitCommandRunIntent
            ? "Rules: command actions may be included only if they are necessary, safe, and directly requested."
            : "Rules: leave command actions empty unless auto-validation is explicitly required by confidence policy."
          : "Rules: do not include shell commands unless the user explicitly asks for runnable commands.",
        "Rules: never include markdown fences.",
      ]
        .filter(Boolean)
        .join("\n");
    };
    const applyRoutePromptBase = (route: AssistToolRoute) => {
      activeToolRoute = route;
      toolRouteUsed = route;
      executionPromptBase = buildExecutionPromptBase(route);
    };
    applyRoutePromptBase(activeToolRoute);

    const useTwoPass =
      !routeUsesNativeTools(activeToolRoute) &&
      useStructuredOutput &&
      shouldUseTwoPassCodeGeneration(req.task, codeEditIntent, budgetedContext, effectiveReasoning, runProfile);
    const allowRawTokenStream =
      !useTwoPass && !hasExecutionIntent(req.task) && (STREAM_RAW_MODEL_TOKENS || !useStructuredOutput);
    const allowReasoningTokenStream = !useTwoPass;
    structuredFromProviderResult = (result: ProviderChatResult): StructuredAssistOutput | null => {
      return (
        structuredFromNativeToolCalls(result) ??
        parseStructuredAssistResponse(result.text) ??
        inferSingleFileRewriteFallback(result.text, budgetedContext, primaryTargetPath) ??
        inferStructuredFallback(result.text, req.task, primaryTargetPath)
      );
    };
    detectStructuredCandidate = (input: {
      result?: ProviderChatResult | null;
      rawText: string;
      route: AssistToolRoute;
      recoveryStage: AssistRecoveryStage;
    }) => {
      const nativeStructured = input.result ? structuredFromNativeToolCalls(input.result) : null;
      const parsedStructured = nativeStructured ? null : parseStructuredAssistResponse(input.rawText);
      const singleFileStructured =
        nativeStructured || parsedStructured ? null : inferSingleFileRewriteFallback(input.rawText, budgetedContext, primaryTargetPath);
      const deterministicStructured =
        nativeStructured || parsedStructured || singleFileStructured
          ? null
          : inferStructuredFallback(input.rawText, req.task, primaryTargetPath);
      const structured = nativeStructured ?? parsedStructured ?? singleFileStructured ?? deterministicStructured;
      const actionSource: AssistToolActionSource = nativeStructured
        ? "native_tool_calls"
        : parsedStructured
          ? "structured_json"
          : singleFileStructured
            ? "single_file_rewrite_fallback"
            : deterministicStructured
              ? "deterministic_synthesis"
              : "none";
      const effectiveRoute =
        singleFileStructured || deterministicStructured ? ("deterministic_synthesis" as const) : input.route;
      const summary = structured
        ? summarizeExplicitToolActions({
            edits: structured.edits,
            commands: structured.commands,
            structuredActions: (structured.actions ?? []) as ToolAction[],
          })
        : summarizeExplicitToolActions({ edits: [], commands: [], structuredActions: [] });
      const failureCategory = classifyToolFailureCategory({
        codeEditIntent,
        hasFileActions: summary.hasFileActions,
        hasCommandActions: summary.hasCommandActions,
        actionSource,
        targetPathHintAvailable: contextAnchorsAvailable || !!primaryTargetPath,
      });
      return {
        structured,
        actionSource,
        route: effectiveRoute,
        recoveryStage: input.recoveryStage,
        failureCategory,
        finalText: structured ? normalizeModelText(structured.final) : normalizeModelText(extractFinalFromJsonLike(input.rawText) || input.rawText),
        score: scoreToolAttempt({
          hasFileActions: summary.hasFileActions,
          hasCommandActions: summary.hasCommandActions,
          editCount: summary.editCount,
          writeFileCount: summary.writeFileCount,
          mkdirCount: summary.mkdirCount,
          actionSource,
          route: effectiveRoute,
          failureCategory,
        }),
        ...summary,
      };
    };
    rememberDetectedCandidate = (candidate: ReturnType<NonNullable<typeof detectStructuredCandidate>>) => {
      const success = codeEditIntent ? candidate.hasFileActions : candidate.hasFileActions || candidate.hasCommandActions;
      toolAttempts.push({
        route: candidate.route,
        actionSource: candidate.actionSource,
        recoveryStage: candidate.recoveryStage,
        success,
        hasFileActions: candidate.hasFileActions,
        hasCommandActions: candidate.hasCommandActions,
        modelAlias: modelMetadata.modelResolvedAlias,
        provider: modelMetadata.providerResolved,
        failureCategory: candidate.failureCategory,
      });
      if (toolAttempts.length > 16) toolAttempts.splice(0, toolAttempts.length - 16);
      if (candidate.failureCategory) lastToolFailureCategory = candidate.failureCategory;
      if (candidate.structured && success && candidate.score >= bestAttemptScore) {
        bestAttemptScore = candidate.score;
        bestStructuredAttempt = {
          route: candidate.route,
          actionSource: candidate.actionSource,
          recoveryStage: candidate.recoveryStage,
          final: candidate.finalText,
          edits: candidate.structured.edits,
          commands: candidate.structured.commands,
          structuredActions: (candidate.structured.actions ?? []) as ToolAction[],
        };
      }
    };
    applyDetectedCandidate = (candidate: ReturnType<NonNullable<typeof detectStructuredCandidate>>) => {
      if (!candidate.structured) {
        final = candidate.finalText;
        edits = [];
        modelCommands = [];
        structuredActions = [];
        toolActionSource = candidate.actionSource;
        toolRouteUsed = candidate.route;
        return;
      }
      final = candidate.finalText;
      edits = candidate.structured.edits;
      modelCommands = candidate.structured.commands;
      structuredActions = (candidate.structured.actions ?? []) as ToolAction[];
      toolActionSource = candidate.actionSource;
      toolRouteUsed = candidate.route;
    };
    const shouldFallbackFromNativeTools = (candidate: ReturnType<NonNullable<typeof detectStructuredCandidate>>) => {
      if (!maxAgenticTooling || activeToolRoute !== "native_tools") return false;
      if (candidate.actionSource !== "native_tool_calls") return true;
      if (codeEditIntent && (!candidate.hasFileActions || candidate.failureCategory === "command_only_for_edit")) return true;
      return false;
    };
    const callPrimaryWithModelFallback = async (
      promptText: string,
      attachmentsForCall?: AssistAttachment[],
      preferredRoute: AssistToolRoute = activeToolRoute
    ) => {
      const routeChain = modelFallbackChain.filter((entry) =>
        preferredRoute === "native_tools" ? entry.capabilities.supportsNativeTools : !entry.capabilities.supportsNativeTools
      );
      const candidateChain = routeChain.length > 0 ? routeChain : modelFallbackChain;
      const routeSystemPrompt = baseProviderSystemPrompt({
        conversational: decision.mode === "generate" && !useStructuredOutput,
        workspaceContextAvailable: contextAnchorsAvailable,
        actionContract: useStructuredOutput ? buildActionContractPrompt(preferredRoute) : "",
      });
      let lastError: unknown = null;
      for (let idx = 0; idx < candidateChain.length; idx += 1) {
        const candidateEntry = candidateChain[idx];
        const nextEntry = idx + 1 < candidateChain.length ? candidateChain[idx + 1] : null;
        try {
          modelUsed = candidateEntry.model;
          modelMetadata = {
            ...modelMetadata,
            adapter: candidateEntry.capabilities.supportsNativeTools ? "native_tools_v1" : "text_actions_v1",
            modelResolved: candidateEntry.model,
            modelResolvedAlias: candidateEntry.alias,
            providerResolved: candidateEntry.provider,
            capabilities: { ...candidateEntry.capabilities },
            certification: candidateEntry.certification,
          };
          const provider = candidateEntry.provider;
          const providerModel = resolveProviderModel(provider, candidateEntry.model);
          logs.push(`provider=${provider} model=${providerModel} route=${preferredRoute}`);
          const nativeToolsRequested =
            preferredRoute === "native_tools" && candidateEntry.capabilities.supportsNativeTools && useStructuredOutput;
          const nativeToolSpecs =
            nativeToolsRequested && candidateEntry.capabilities.supportsWriteFile
              ? buildNativeToolSpecs({
                  allowCommands: candidateEntry.capabilities.supportsShellCommands && (explicitCommandRunIntent || decision.mode === "yolo"),
                })
              : undefined;
          const callModel = async () => {
            if (provider === "nvidia") {
              return callNvidiaChat({
                model: providerModel,
                prompt: promptText,
                systemPrompt: routeSystemPrompt,
                maxTokens: Math.max(128, Math.min(req.max_tokens ?? 512, LONG_CONTEXT_LIMIT)),
                attachments: attachmentsForCall,
                onToken: allowRawTokenStream && !nativeToolsRequested ? hooks?.onToken : undefined,
                onReasoningToken:
                  allowReasoningTokenStream && preferredRoute !== "native_tools" ? hooks?.onReasoningToken : undefined,
                runtimeApiKey: runtimeOptions?.nvidiaApiKey,
                stream: !nativeToolsRequested && candidateEntry.capabilities.supportsStreaming,
                ...(nativeToolSpecs?.length ? { tools: nativeToolSpecs } : {}),
              });
            }
            return callHfChat({
              model: providerModel,
              prompt: promptText,
              systemPrompt: routeSystemPrompt,
              maxTokens: Math.max(128, Math.min(req.max_tokens ?? 512, LONG_CONTEXT_LIMIT)),
              attachments: attachmentsForCall,
              onToken: allowRawTokenStream && !nativeToolsRequested ? hooks?.onToken : undefined,
              onReasoningToken:
                allowReasoningTokenStream && preferredRoute !== "native_tools" ? hooks?.onReasoningToken : undefined,
              stream: !nativeToolsRequested && candidateEntry.capabilities.supportsStreaming,
              ...(nativeToolSpecs?.length ? { tools: nativeToolSpecs } : {}),
            });
          };
          return await callModel();
        } catch (error) {
          lastError = error;
          const message = error instanceof Error ? error.message : String(error);
          if (nextEntry && isLikelyModelFallbackEligibleError(message)) {
            logs.push(
              `model_fallback from "${candidateEntry.alias}" to "${nextEntry.alias}" reason="${message.slice(0, 140).replace(/\s+/g, " ")}"`
            );
            if (hooks?.onStatus) {
              await hooks.onStatus("Primary model unavailable. Retrying with backup model.");
            }
            continue;
          }
          throw error;
        }
      }
      throw (lastError instanceof Error ? lastError : new Error(String(lastError || "Model request failed")));
    };

    callWithAttachmentFallback = async (
      promptText: string,
      attachmentsForCall?: AssistAttachment[],
      preferredRoute: AssistToolRoute = activeToolRoute
    ) => {
      try {
        return await callPrimaryWithModelFallback(promptText, attachmentsForCall, preferredRoute);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        if ((attachmentsForCall?.length ?? 0) > 0 && isLikelyAttachmentUnsupportedError(message)) {
          logs.push("attachments_fallback=text_only");
          if (hooks?.onStatus) {
            await hooks.onStatus("Image input is unavailable for this model/provider. Continuing without images.");
          }
          return callPrimaryWithModelFallback(promptText, undefined, preferredRoute);
        }
        throw error;
      }
    };

    if (useTwoPass) {
      logs.push("two_pass_generation=enabled");
      const draftPrompt = [
        executionPromptBase,
        "",
        "Pass 1 (draft): produce your best strict JSON output directly.",
      ].join("\n");
      const draftResult = await callWithAttachmentFallback(draftPrompt, safeAttachments);
      const draftRaw = draftResult.text;
      const verifyPrompt = [
        executionPromptBase,
        "",
        "Pass 2 (verifier): validate and correct the candidate output below.",
        "If valid, return a semantically equivalent STRICT JSON object.",
        "If invalid, repair it and return corrected STRICT JSON only.",
        "",
        "Candidate output:",
        draftRaw,
      ].join("\n");
      const verifyResult = await callWithAttachmentFallback(verifyPrompt, undefined);
      const verifyRaw = verifyResult.text;
      const draftCandidate = detectStructuredCandidate({
        result: draftResult,
        rawText: draftRaw,
        route: activeToolRoute,
        recoveryStage: repromptStage,
      });
      const verifyCandidate = detectStructuredCandidate({
        result: verifyResult,
        rawText: verifyRaw,
        route: activeToolRoute,
        recoveryStage: repromptStage,
      });
      rememberDetectedCandidate(draftCandidate);
      rememberDetectedCandidate(verifyCandidate);
      const verifiedLooksInvalid =
        !verifyCandidate.structured || (codeEditIntent && !verifyCandidate.hasFileActions);

      if (verifiedLooksInvalid) {
        logs.push("two_pass_verifier=needs_repair");
        const repairPrompt = [
          executionPromptBase,
          "",
          "Repair pass: return STRICT JSON only.",
          "Fix schema issues, escaped formatting noise, and missing edits if the user requested code.",
          "",
          "Draft candidate:",
          draftRaw,
          "",
          "Verifier candidate:",
          verifyRaw,
        ].join("\n");
        providerResult = await callWithAttachmentFallback(repairPrompt, undefined);
        raw = providerResult.text;
      } else {
        providerResult = verifyResult;
        raw = verifyRaw;
      }

      const resolvedCandidate = detectStructuredCandidate({
        result: providerResult,
        rawText: raw,
        route: activeToolRoute,
        recoveryStage: repromptStage,
      });
      rememberDetectedCandidate(resolvedCandidate);
      if (resolvedCandidate.structured) {
        applyDetectedCandidate(resolvedCandidate);
      } else {
        final = resolvedCandidate.finalText;
        logs.push("structured_output=parse_failed_after_two_pass");
      }
    } else {
      try {
        providerResult = await callWithAttachmentFallback(executionPromptBase, safeAttachments, activeToolRoute);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        if (activeToolRoute === "native_tools" && isLikelyNativeToolRouteFailureError(message)) {
          reasonCodes.push("native_tools_provider_error_fallback");
          reasonCodes.push("native_tools_route_fallback_to_text_actions");
          logs.push(`tool_route_fallback=native_tools->text_actions provider_error=${message.slice(0, 180).replace(/\s+/g, " ")}`);
          toolAttempts.push({
            route: "native_tools",
            actionSource: "none",
            recoveryStage: repromptStage,
            success: false,
            hasFileActions: false,
            hasCommandActions: false,
            modelAlias: modelMetadata.modelResolvedAlias,
            provider: modelMetadata.providerResolved,
            failureCategory: "schema_invalid",
          });
          if (toolAttempts.length > 16) toolAttempts.splice(0, toolAttempts.length - 16);
          lastToolFailureCategory = "schema_invalid";
          if (hooks?.onStatus) {
            await hooks.onStatus("Native tool call failed to parse. Falling back to the production text-actions route...");
          }
          applyRoutePromptBase("text_actions");
          const textRoutePrompt = [
            executionPromptBase,
            "",
            "Route fallback: the previous native-tools request failed because the provider rejected malformed tool-call arguments.",
            "Return concrete file actions using the structured JSON contract.",
            "Do not emit native tool calls for this retry.",
          ].join("\n");
          providerResult = await callWithAttachmentFallback(textRoutePrompt, safeAttachments, "text_actions");
        } else {
          throw error;
        }
      }
      raw = providerResult.text;
      if (!useStructuredOutput) {
        final = normalizeModelText(raw);
      } else {
        let initialCandidate = detectStructuredCandidate({
          result: providerResult,
          rawText: raw,
          route: activeToolRoute,
          recoveryStage: repromptStage,
        });
        rememberDetectedCandidate(initialCandidate);
        if (shouldFallbackFromNativeTools(initialCandidate)) {
          reasonCodes.push("native_tools_route_fallback_to_text_actions");
          logs.push(
            `tool_route_fallback=native_tools->text_actions reason=${initialCandidate.failureCategory || initialCandidate.actionSource}`
          );
          if (hooks?.onStatus) {
            await hooks.onStatus("Native tool output was incomplete. Falling back to the production text-actions route...");
          }
          applyRoutePromptBase("text_actions");
          const textRoutePrompt = [
            executionPromptBase,
            "",
            "Route fallback: the previous native-tools output was incomplete or low-confidence for this task.",
            "Return concrete file actions using the structured JSON contract.",
            "",
            "Previous output:",
            initialCandidate.finalText || raw,
          ].join("\n");
          providerResult = await callWithAttachmentFallback(textRoutePrompt, safeAttachments, "text_actions");
          raw = providerResult.text;
          initialCandidate = detectStructuredCandidate({
            result: providerResult,
            rawText: raw,
            route: "text_actions",
            recoveryStage: repromptStage,
          });
          rememberDetectedCandidate(initialCandidate);
        }
        if (initialCandidate.structured) {
          applyDetectedCandidate(initialCandidate);
        } else {
          final = initialCandidate.finalText;
          logs.push("structured_output=parse_failed; using raw model text");
        }
      }
    }
    if (codeEditIntent && edits.length === 0 && structuredActions.length === 0) {
      const recovered =
        inferSingleFileRewriteFallback(final || raw, budgetedContext, primaryTargetPath) ||
        inferStructuredFallback(final || raw, req.task, primaryTargetPath) ||
        recoverEditsFromConversationHistory(req.conversationHistory, req.task, primaryTargetPath);
      if (recovered && (recovered.edits.length > 0 || (recovered.actions?.length ?? 0) > 0)) {
        const recoveredSummary = summarizeExplicitToolActions({
          edits: recovered.edits,
          commands: recovered.commands,
          structuredActions: (recovered.actions ?? []) as ToolAction[],
        });
        const recoveredFailureCategory = classifyToolFailureCategory({
          codeEditIntent,
          hasFileActions: recoveredSummary.hasFileActions,
          hasCommandActions: recoveredSummary.hasCommandActions,
          actionSource: "deterministic_synthesis",
          targetPathHintAvailable: contextAnchorsAvailable || !!primaryTargetPath,
        });
        const normalizedRecovered = {
          structured: recovered,
          actionSource: "deterministic_synthesis" as const,
          route: "deterministic_synthesis" as const,
          recoveryStage: repromptStage,
          failureCategory: recoveredFailureCategory,
          finalText: recovered.final.trim()
            ? normalizeModelText(recovered.final)
            : normalizeModelText(extractFinalFromJsonLike(final || raw) || final || raw),
          score: scoreToolAttempt({
            hasFileActions: recoveredSummary.hasFileActions,
            hasCommandActions: recoveredSummary.hasCommandActions,
            editCount: recoveredSummary.editCount,
            writeFileCount: recoveredSummary.writeFileCount,
            mkdirCount: recoveredSummary.mkdirCount,
            actionSource: "deterministic_synthesis",
            route: "deterministic_synthesis",
            failureCategory: recoveredFailureCategory,
          }),
          ...recoveredSummary,
        };
        rememberDetectedCandidate(normalizedRecovered);
        applyDetectedCandidate(normalizedRecovered);
        logs.push("structured_output=recovered_from_fallback_code_inference");
      }
    }

    // Quality reprompt loop: ensure actionable tool output for code-edit requests.
    if (codeEditIntent) {
      const evaluateCandidateActions = (candidateEdits: typeof edits, candidateCommands: string[], candidateStructured: ToolAction[]) => {
        const candidateActions = synthesizeDeterministicActions({
          task: req.task,
          edits: candidateEdits,
          commands: candidateCommands,
          structuredActions: candidateStructured,
        });
        const hasCandidateFileActions = candidateActions.some(
          (action) => action.type === "edit" || action.type === "mkdir" || action.type === "write_file"
        );
        const targetMismatch =
          hasCandidateFileActions &&
          !!primaryTargetPath &&
          !actionsTouchTargetPath(candidateActions, primaryTargetPath);
        return {
          usable: hasCandidateFileActions && !targetMismatch,
          targetMismatch,
        };
      };

      let evaluatedActions = evaluateCandidateActions(edits, modelCommands, structuredActions);
      let usable = evaluatedActions.usable;
      let targetMismatch = evaluatedActions.targetMismatch;
      let clarification = isClarificationResponseText(final);
      let clarificationOverridden = false;
      const applyClarificationOverride = () => {
        if (!clarification || !contextAnchorsAvailable) return;
        clarification = false;
        if (!clarificationOverridden) {
          clarificationOverridden = true;
          reasonCodes.push("clarification_overridden_by_context");
          logs.push("clarification_overridden_by_context");
        }
      };
      const recordNarrativeClaimIfNeeded = (candidate: string) => {
        if (usable || !soundsLikeNarrativeEditClaim(candidate)) return;
        if (!reasonCodes.includes("narrative_edit_claim_without_actions")) {
          reasonCodes.push("narrative_edit_claim_without_actions");
        }
        logs.push("narrative_edit_claim_without_actions");
      };
      const recordTargetMismatchIfNeeded = () => {
        if (!targetMismatch || !primaryTargetPath) return;
        if (!reasonCodes.includes("target_path_mismatch_repair")) {
          reasonCodes.push("target_path_mismatch_repair");
        }
        logs.push(`target_path_mismatch_repair expected=${primaryTargetPath}`);
      };
      recordNarrativeClaimIfNeeded(raw || final);
      applyClarificationOverride();
      recordTargetMismatchIfNeeded();

      if (!usable && !clarification) {
        repromptStage = "repair";
        reasonCodes.push("reprompt_repair_pass_2");
        logs.push("reprompt_repair_pass_2");
        if (hooks?.onStatus) await hooks.onStatus("Repairing tool output...");
        const repairPrompt = [
          executionPromptBase,
          "",
          "Repair pass: the prior output was not actionable.",
          "Return STRICT JSON only and ensure at least one concrete file edit action when code changes are requested.",
          "Command-only output is invalid for this task.",
          targetMismatch && primaryTargetPath
            ? `The next file action must target ${primaryTargetPath}.`
            : "",
          `Valid example: ${validWriteFileActionExample}`,
          `Invalid example: ${invalidCommandOnlyActionExample}`,
          "",
          "Previous output:",
          raw || final,
        ].join("\n");
        providerResult = await callWithAttachmentFallback(repairPrompt, undefined);
        const repairRaw = providerResult.text;
        raw = repairRaw;
        const repairCandidate = detectStructuredCandidate({
          result: providerResult,
          rawText: repairRaw,
          route: activeToolRoute,
          recoveryStage: repromptStage,
        });
        rememberDetectedCandidate(repairCandidate);
        if (repairCandidate.structured) {
          applyDetectedCandidate(repairCandidate);
        } else {
          final = repairCandidate.finalText;
        }
        evaluatedActions = evaluateCandidateActions(edits, modelCommands, structuredActions);
        usable = evaluatedActions.usable;
        targetMismatch = evaluatedActions.targetMismatch;
        clarification = isClarificationResponseText(final);
        recordNarrativeClaimIfNeeded(repairRaw || final);
        applyClarificationOverride();
        recordTargetMismatchIfNeeded();
      }

      if (!usable && !clarification) {
        repromptStage = "tool_enforcement";
        reasonCodes.push("reprompt_tool_enforcement_pass_3");
        logs.push("reprompt_tool_enforcement_pass_3");
        if (hooks?.onStatus) await hooks.onStatus("Enforcing actionable tool output...");
        const enforcePrompt = [
          executionPromptBase,
          "",
          "Tool-enforcement pass:",
          contextAnchorsAvailable
            ? "You MUST return at least one actionable file edit. IDE context is already provided, so do not ask follow-up questions."
            : "You MUST return at least one actionable file edit OR an explicit clarification question if required context is missing.",
          "Command-only output cannot satisfy this edit request.",
          "Do not return non-actionable summaries.",
          targetMismatch && primaryTargetPath
            ? `The file action must target ${primaryTargetPath}; do not edit a different file.`
            : "",
          `Valid example: ${validWriteFileActionExample}`,
          `Invalid example: ${invalidCommandOnlyActionExample}`,
          "",
          "Previous output:",
          raw || final,
        ].join("\n");
        providerResult = await callWithAttachmentFallback(enforcePrompt, undefined);
        const enforceRaw = providerResult.text;
        raw = enforceRaw;
        const enforceCandidate = detectStructuredCandidate({
          result: providerResult,
          rawText: enforceRaw,
          route: activeToolRoute,
          recoveryStage: repromptStage,
        });
        rememberDetectedCandidate(enforceCandidate);
        if (enforceCandidate.structured) {
          applyDetectedCandidate(enforceCandidate);
        } else {
          final = enforceCandidate.finalText;
        }
        evaluatedActions = evaluateCandidateActions(edits, modelCommands, structuredActions);
        usable = evaluatedActions.usable;
        targetMismatch = evaluatedActions.targetMismatch;
        clarification = isClarificationResponseText(final);
        recordNarrativeClaimIfNeeded(enforceRaw || final);
        applyClarificationOverride();
        recordTargetMismatchIfNeeded();
      }

      if (!usable && contextAnchorsAvailable) {
        reasonCodes.push("reprompt_context_assumption_pass_4");
        logs.push("reprompt_context_assumption_pass_4");
        if (hooks?.onStatus) await hooks.onStatus("Generating best-effort edits from IDE context...");
        const assumptionPrompt = [
          executionPromptBase,
          "",
          "Context-assumption pass:",
          "Do NOT ask follow-up questions.",
          "Infer target file and edit scope from IDE context and produce at least one actionable edit.",
          primaryTargetPath
            ? `If uncertain, default to this file: ${primaryTargetPath}`
            : "If uncertain, default to the active file shown in context.",
          "",
          "Previous output:",
          raw || final,
        ].join("\n");
        providerResult = await callWithAttachmentFallback(assumptionPrompt, undefined);
        const assumptionRaw = providerResult.text;
        raw = assumptionRaw;
        const assumptionCandidate = detectStructuredCandidate({
          result: providerResult,
          rawText: assumptionRaw,
          route: activeToolRoute,
          recoveryStage: repromptStage,
        });
        rememberDetectedCandidate(assumptionCandidate);
        if (assumptionCandidate.structured) {
          applyDetectedCandidate(assumptionCandidate);
        } else {
          final = assumptionCandidate.finalText;
        }
        evaluatedActions = evaluateCandidateActions(edits, modelCommands, structuredActions);
        usable = evaluatedActions.usable;
        targetMismatch = evaluatedActions.targetMismatch;
        clarification = isClarificationResponseText(final);
        recordNarrativeClaimIfNeeded(assumptionRaw || final);
        applyClarificationOverride();
        recordTargetMismatchIfNeeded();
      }

      if (
        !usable &&
        !clarification &&
        looksLikeConcreteFilePath(budgetedContext?.activeFile?.path || "") &&
        normalizeComparableText(budgetedContext?.activeFile?.content || "")
      ) {
        repromptStage = "single_file_rewrite";
        reasonCodes.push("reprompt_single_file_rewrite_pass_5");
        logs.push("reprompt_single_file_rewrite_pass_5");
        if (hooks?.onStatus) await hooks.onStatus("Rewriting the active file directly...");
        const rewritePath = normalizeRelativePath(budgetedContext?.activeFile?.path || "") || primaryTargetPath || "active file";
        const rewritePrompt = [
          executionPromptBase,
          "",
          "Single-file rewrite pass:",
          `Rewrite exactly this file: ${rewritePath}`,
          'Return STRICT JSON only with this shape: {"final":"string","actions":[{"type":"write_file","path":"relative/path","content":"FULL UPDATED FILE CONTENT","overwrite":true}],"commands":["safe validation command"]}.',
          "Do not return a plan, prose-only summary, or command-only output.",
          "Preserve unchanged code and make only the requested implementation edits.",
          `Valid example: {"final":"Prepared update.","actions":[{"type":"write_file","path":"${rewritePath}","content":"<full updated file content>","overwrite":true}],"commands":[]}`,
          "",
          "Existing file content:",
          normalizeComparableText(budgetedContext?.activeFile?.content || ""),
          "",
          "Previous output:",
          raw || final,
        ].join("\n");
        providerResult = await callWithAttachmentFallback(rewritePrompt, undefined);
        const rewriteRaw = providerResult.text;
        raw = rewriteRaw;
        const rewriteCandidate = detectStructuredCandidate({
          result: providerResult,
          rawText: rewriteRaw,
          route: activeToolRoute,
          recoveryStage: repromptStage,
        });
        rememberDetectedCandidate(rewriteCandidate);
        if (rewriteCandidate.structured) {
          applyDetectedCandidate(rewriteCandidate);
        } else {
          final = rewriteCandidate.finalText;
        }
        evaluatedActions = evaluateCandidateActions(edits, modelCommands, structuredActions);
        usable = evaluatedActions.usable;
        targetMismatch = evaluatedActions.targetMismatch;
        clarification = isClarificationResponseText(final);
        recordNarrativeClaimIfNeeded(rewriteRaw || final);
        applyClarificationOverride();
        recordTargetMismatchIfNeeded();
      }

      if (!usable && !clarification) {
        const trailingPatch = synthesizeTrailingStopPatch(raw || final, req.task, budgetedContext, primaryTargetPath);
        if (trailingPatch) {
          const trailingSummary = summarizeExplicitToolActions({
            edits: trailingPatch.edits,
            commands: trailingPatch.commands,
            structuredActions: (trailingPatch.actions ?? []) as ToolAction[],
          });
          const trailingFailureCategory = classifyToolFailureCategory({
            codeEditIntent,
            hasFileActions: trailingSummary.hasFileActions,
            hasCommandActions: trailingSummary.hasCommandActions,
            actionSource: "deterministic_synthesis",
            targetPathHintAvailable: contextAnchorsAvailable || !!primaryTargetPath,
          });
          const trailingCandidate = {
            structured: trailingPatch,
            actionSource: "deterministic_synthesis" as const,
            route: "deterministic_synthesis" as const,
            recoveryStage: repromptStage,
            failureCategory: trailingFailureCategory,
            finalText: normalizeModelText(trailingPatch.final),
            score: scoreToolAttempt({
              hasFileActions: trailingSummary.hasFileActions,
              hasCommandActions: trailingSummary.hasCommandActions,
              editCount: trailingSummary.editCount,
              writeFileCount: trailingSummary.writeFileCount,
              mkdirCount: trailingSummary.mkdirCount,
              actionSource: "deterministic_synthesis",
              route: "deterministic_synthesis",
              failureCategory: trailingFailureCategory,
            }),
            ...trailingSummary,
          };
          rememberDetectedCandidate(trailingCandidate);
          applyDetectedCandidate(trailingCandidate);
          reasonCodes.push("fallback_trailing_stop_patch");
          logs.push("fallback_trailing_stop_patch");
          evaluatedActions = evaluateCandidateActions(edits, modelCommands, structuredActions);
          usable = evaluatedActions.usable;
          targetMismatch = evaluatedActions.targetMismatch;
          clarification = isClarificationResponseText(final);
          recordNarrativeClaimIfNeeded(raw || final);
          applyClarificationOverride();
          recordTargetMismatchIfNeeded();
        }
      }

      const currentExplicitSummary = summarizeExplicitToolActions({
        edits,
        commands: modelCommands,
        structuredActions,
      });
      const currentFailureCategory = classifyToolFailureCategory({
        codeEditIntent,
        hasFileActions: currentExplicitSummary.hasFileActions,
        hasCommandActions: currentExplicitSummary.hasCommandActions,
        actionSource: toolActionSource,
        targetPathHintAvailable: contextAnchorsAvailable || !!primaryTargetPath,
      });
      const currentAttemptScore = scoreToolAttempt({
        hasFileActions: currentExplicitSummary.hasFileActions,
        hasCommandActions: currentExplicitSummary.hasCommandActions,
        editCount: currentExplicitSummary.editCount,
        writeFileCount: currentExplicitSummary.writeFileCount,
        mkdirCount: currentExplicitSummary.mkdirCount,
        actionSource: toolActionSource,
        route: toolRouteUsed,
        failureCategory: currentFailureCategory,
      });
      const bestAttempt = bestStructuredAttempt as
        | {
            route: AssistToolRoute;
            actionSource: AssistToolActionSource;
            recoveryStage: AssistRecoveryStage;
            final: string;
            edits: Array<{ path: string; patch: string; rationale?: string }>;
            commands: string[];
            structuredActions: ToolAction[];
          }
        | null;
      if (bestAttempt && (!usable || currentAttemptScore < bestAttemptScore)) {
        final = bestAttempt.final;
        edits = bestAttempt.edits;
        modelCommands = bestAttempt.commands;
        structuredActions = bestAttempt.structuredActions;
        toolRouteUsed = bestAttempt.route;
        toolActionSource = bestAttempt.actionSource;
        repromptStage = bestAttempt.recoveryStage;
        evaluatedActions = evaluateCandidateActions(edits, modelCommands, structuredActions);
        usable = evaluatedActions.usable;
        targetMismatch = evaluatedActions.targetMismatch;
        clarification = isClarificationResponseText(final);
        recordTargetMismatchIfNeeded();
        logs.push("restored_best_scored_tool_attempt");
      }

      if (!usable && !clarification) {
        repromptStage = "fallback";
        reasonCodes.push("reprompt_fallback_to_clarification");
        logs.push("reprompt_fallback_to_clarification");
        if (req.autonomy?.noClarifyToUser) {
          reasonCodes.push("autonomy_no_clarify_enabled");
          logs.push("autonomy_no_clarify_enabled");
          final =
            primaryTargetPath
              ? `No repository changes were applied in this cycle. Autonomous retry required: no valid patch was produced for ${primaryTargetPath}.`
              : contextAnchorsAvailable
                ? "No repository changes were applied in this cycle. Autonomous retry required: no valid patch was produced from active IDE context."
                : "No repository changes were applied in this cycle. Autonomous retry required: no valid patch was produced.";
        } else {
          final =
            primaryTargetPath
              ? `No repository changes were applied yet. I still could not produce a valid patch after recovery passes. I'll target ${primaryTargetPath} on the next run if you resend the request.`
              : contextAnchorsAvailable
                ? "No repository changes were applied yet. I still could not produce a valid patch after recovery passes. I'll use the active IDE context as the target on your next run if you resend the request."
                : "No repository changes were applied yet. I need one more detail to generate actionable edits. Please share the exact file path and the target change, or paste the relevant code block.";
      }
    }
  }
}

function structuredFromNativeToolCalls(result: ProviderChatResult): StructuredAssistOutput | null {
  if (!result.toolCalls.length) return null;
  const actions: ToolAction[] = [];
  const edits: Array<{ path: string; patch: string; rationale?: string }> = [];
  const commands: string[] = [];

  for (const toolCall of result.toolCalls) {
    let parsedArgs: Record<string, unknown>;
    try {
      parsedArgs = JSON.parse(toolCall.arguments || "{}") as Record<string, unknown>;
    } catch {
      continue;
    }
    if (toolCall.name === "apply_edit") {
      const path = typeof parsedArgs.path === "string" ? parsedArgs.path.trim() : "";
      const patch = typeof parsedArgs.patch === "string" ? parsedArgs.patch.trim() : "";
      const rationale = typeof parsedArgs.rationale === "string" ? parsedArgs.rationale.trim() : "";
      if (!looksLikeConcreteFilePath(path) || !patch || patchContainsStructuredPayloadArtifacts(patch)) continue;
      edits.push({ path, patch, ...(rationale ? { rationale } : {}) });
      actions.push({ type: "edit", path, patch });
      continue;
    }
    if (toolCall.name === "write_file") {
      const path = typeof parsedArgs.path === "string" ? parsedArgs.path.trim() : "";
      const content = typeof parsedArgs.content === "string" ? parsedArgs.content : "";
      const overwrite = typeof parsedArgs.overwrite === "boolean" ? parsedArgs.overwrite : undefined;
      const normalizedContent = normalizeModelText(content).trim();
      if (
        !looksLikeConcreteFilePath(path) ||
        !normalizedContent ||
        (/^\s*\{/.test(normalizedContent) && /"final"\s*:/i.test(normalizedContent)) ||
        /\*\*\*\s+Begin Patch|\bdiff --git\b/i.test(normalizedContent)
      ) {
        continue;
      }
      actions.push({ type: "write_file", path, content, ...(overwrite !== undefined ? { overwrite } : {}) });
      continue;
    }
    if (toolCall.name === "mkdir") {
      const path = typeof parsedArgs.path === "string" ? parsedArgs.path.trim() : "";
      if (!looksLikeConcreteFilePath(path)) continue;
      actions.push({ type: "mkdir", path });
      continue;
    }
    if (toolCall.name === "run_command") {
      const command = typeof parsedArgs.command === "string" ? parsedArgs.command.trim() : "";
      const category =
        parsedArgs.category === "implementation" || parsedArgs.category === "validation"
          ? parsedArgs.category
          : undefined;
      if (!command) continue;
      commands.push(command);
      actions.push({ type: "command", command, ...(category ? { category } : {}) });
    }
  }

  if (!actions.length && !edits.length && !commands.length) return null;
  return {
    final: result.text || "Prepared native tool actions.",
    edits,
    commands,
    ...(actions.length ? { actions } : {}),
  };
}

  const readOnlyConversationRequest =
    pureConversationalTask ||
    (intentResolution.intent === "conversation" &&
      !hasCodeEditIntent(req.task) &&
      !hasExecutionIntent(req.task));
  if (readOnlyConversationRequest) {
    if (edits.length > 0 || structuredActions.length > 0 || modelCommands.length > 0) {
      logs.push("conversation_guard=dropped_non_readonly_actions");
    }
    edits = [];
    structuredActions = [];
    modelCommands = [];
  }

  const confidence = Math.max(0.05, Math.min(0.99, decision.confidence));
  const commandCandidatesCount =
    modelCommands.length +
    structuredActions.filter((action) => action.type === "command").length;
  const syncCanonicalActions = () => {
    const nextActions = synthesizeDeterministicActions({
      task: req.task,
      edits,
      commands: modelCommands,
      structuredActions,
    });
    const nextEdits = nextActions
      .filter((action): action is Extract<ToolAction, { type: "edit" }> => action.type === "edit")
      .map((action) => ({ path: action.path, patch: action.patch }));
    const nextCommands = nextActions
      .filter((action): action is Extract<ToolAction, { type: "command" }> => action.type === "command")
      .map((action) => action.command);
    const nextHasFileActions = nextActions.some(
      (action) => action.type === "edit" || action.type === "mkdir" || action.type === "write_file"
    );
    const nextHasCommandActions = nextActions.some((action) => action.type === "command");
    return {
      actions: nextActions,
      edits: nextEdits,
      modelCommands: nextCommands,
      hasFileActions: nextHasFileActions,
      hasCommandActions: nextHasCommandActions,
      commandOnlyForEditIntent: codeEditIntent && nextHasCommandActions && !nextHasFileActions,
      runnableCommandsCount: nextActions.filter((action) => action.type === "command").length,
    };
  };
  let {
    actions,
    edits: canonicalEdits,
    modelCommands: canonicalModelCommands,
    hasFileActions,
    hasCommandActions,
    commandOnlyForEditIntent,
    runnableCommandsCount,
  } = syncCanonicalActions();
  edits = canonicalEdits;
  modelCommands = canonicalModelCommands;
  if (commandOnlyForEditIntent && callWithAttachmentFallback && detectStructuredCandidate && rememberDetectedCandidate && applyDetectedCandidate) {
    reasonCodes.push("edit_intent_command_only_forced_reprompt");
    logs.push("edit_intent_command_only_forced_reprompt");
    repromptStage = "tool_enforcement";
    if (hooks?.onStatus) await hooks.onStatus("Converting command-only output into concrete file edits...");
    const forcedFileActionPrompt = [
      executionPromptBase,
      "",
      "Final file-action enforcement pass:",
      "The previous output contained commands but no file edit actions for an edit-intent task.",
      "Return STRICT JSON only.",
      "You MUST include at least one file action of type edit, write_file, or mkdir.",
      "Do not return command-only output.",
      primaryTargetPath ? `Primary target file hint: ${primaryTargetPath}` : "",
      looksLikeConcreteFilePath(budgetedContext?.activeFile?.path || "")
        ? `Active file hint: ${normalizeRelativePath(budgetedContext?.activeFile?.path || "") || budgetedContext?.activeFile?.path || ""}`
        : "",
      "Prefer edit for targeted modifications. Prefer write_file for full rewrites or new files.",
      `Valid example: ${validWriteFileActionExample}`,
      `Invalid example: ${invalidCommandOnlyActionExample}`,
      "",
      "Previous output:",
      final,
    ]
      .filter(Boolean)
      .join("\n");
    providerResult = await callWithAttachmentFallback(forcedFileActionPrompt, undefined);
    const forcedRaw = providerResult.text;
    raw = forcedRaw;
    const forcedCandidate = detectStructuredCandidate({
      result: providerResult,
      rawText: forcedRaw,
      route: activeToolRoute,
      recoveryStage: repromptStage,
    });
    rememberDetectedCandidate(forcedCandidate);
    if (forcedCandidate.structured) {
      applyDetectedCandidate(forcedCandidate);
    } else {
      final = forcedCandidate.finalText;
      edits = [];
      modelCommands = [];
      structuredActions = [];
    }
    ({
      actions,
      edits: canonicalEdits,
      modelCommands: canonicalModelCommands,
      hasFileActions,
      hasCommandActions,
      commandOnlyForEditIntent,
      runnableCommandsCount,
    } = syncCanonicalActions());
    edits = canonicalEdits;
    modelCommands = canonicalModelCommands;
  }
  if (commandCandidatesCount > runnableCommandsCount) {
    logs.push(`dropped_non_shell_commands=${commandCandidatesCount - runnableCommandsCount}`);
  }
  const validationPlan = buildValidationPlan({
    task: req.task,
    actions,
    explicitCommandRunIntent,
    decisionMode: decision.mode,
  });
  const autonomySafetyDisabled =
    req.autonomy?.safetyFloor === "allow_everything" || req.autonomy?.failsafe === "disabled";
  const riskBlocked = autonomySafetyDisabled ? false : isHighRiskActionPattern(req.task, actions);
  if (autonomySafetyDisabled) {
    reasonCodes.push("autonomy_safety_floor_allow_everything");
    logs.push("autonomy_safety_floor=allow_everything");
  }
  const autonomyDecision = decideAutonomy({
    confidence,
    actionsCount: actions.length,
    hasEditActions: hasFileActions,
    hasCommandActions,
    explicitCommandRunIntent,
    executionPolicy: req.executionPolicy,
    decisionMode: decision.mode,
    clientPreferences: req.clientPreferences,
    autonomy: req.autonomy,
    riskBlocked,
  });
  reasonCodes.push(`autonomy_${autonomyDecision.mode}`);
  logs.push(`autonomy=${autonomyDecision.mode}`);
  logs.push(`validation_scope=${validationPlan.scope}`);

  if (riskBlocked) {
    actionability = {
      summary: "blocked_by_safety",
      reason: "High-risk task or command pattern detected; manual preview is required.",
    };
  } else if (actions.length === 0 && repromptStage === "fallback") {
    actionability = {
      summary: "clarification_needed",
      reason: "Model could not produce actionable edits after recovery passes.",
    };
  } else if (actions.length === 0) {
    actionability = {
      summary: "clarification_needed",
      reason: "No actionable edits/commands were produced for this request.",
    };
  } else if (codeEditIntent && !hasFileActions) {
    actionability = {
      summary: "clarification_needed",
      reason: hasCommandActions
        ? "Edit-intent task is incomplete: command-only output cannot satisfy a file-edit request."
        : "No concrete file-edit actions were produced for this edit request.",
    };
  }
  if (
    actionability?.summary === "clarification_needed" &&
    commandCandidatesCount > 0 &&
    runnableCommandsCount === 0
  ) {
    actionability = {
      summary: "clarification_needed",
      reason: "No runnable commands extracted; kept in preview.",
    };
  }

  let commands: string[] = [];
  if (autonomyDecision.autoRunValidation) {
    commands = Array.from(
      new Set([
        ...validationPlan.checks,
        ...actions
          .filter((action): action is Extract<ToolAction, { type: "command" }> => action.type === "command")
          .map((action) => action.command),
      ])
    ).slice(0, 8);
  } else if (explicitCommandRunIntent || decision.mode === "yolo") {
    commands = Array.from(
      new Set([
        ...actions
          .filter((action): action is Extract<ToolAction, { type: "command" }> => action.type === "command")
          .map((action) => action.command),
        ...validationPlan.checks,
      ])
    ).slice(0, 8);
  }
  if (!explicitCommandRunIntent && !autonomyDecision.autoRunValidation && commands.length > 0 && decision.mode !== "yolo") {
    logs.push("dropped_commands_without_run_intent_or_autovalidation");
    commands = [];
  }

  if (decision.mode !== "plan" && !isCountryOriginProbeTask) {
    final = composeWarmAssistantResponse({
      final,
      task: req.task,
      decisionMode: decision.mode,
      intent: intentResolution.intent,
      edits,
      commands,
      actions,
      autonomyDecision,
    });
  }
  if (codeEditIntent) {
    const sanitizedCodeFinal = sanitizeCodeModeFinalText(final);
    if (sanitizedCodeFinal.changed) {
      final = sanitizedCodeFinal.text;
      logs.push("code_mode_final_sanitized");
    }
    if (!final.trim() && edits.length > 0) {
      final = "Prepared actionable code edits. Review and apply.";
      logs.push("code_mode_final_defaulted");
    }
  }
  if (
    codeEditIntent &&
    !hasFileActions &&
    !isClarificationResponseText(final) &&
    soundsLikeNarrativeEditClaim(final)
  ) {
    final = `${actionability.reason}\n\nNo repository changes were applied yet. The previous reply described intended work, but no file-edit action was actually produced.`;
    logs.push("no_action_guardrail=rewrote_false_completion_claim");
  }
  if (
    codeEditIntent &&
    !hasFileActions &&
    actionability.summary === "clarification_needed" &&
    !isClarificationResponseText(final) &&
    (!final.trim() || /i'?m ready to continue once you share the next concrete change/i.test(final))
  ) {
    final = `${actionability.reason}\n\nNo repository changes were applied yet. The run needs a real patch or write action before autonomy can continue.`;
    logs.push("no_action_guardrail=rewrote_empty_code_mode_final");
  }
  if (readOnlyConversationRequest && /i prepared the requested update/i.test(final)) {
    final = stripRoboticArtifacts(final) || "I'm here and ready to help. What would you like to work on?";
    logs.push("conversation_guard=removed_action_template");
  }
  const identityScrub = sanitizeProviderIdentityLeak(final);
  if (identityScrub.changed) {
    final = identityScrub.text;
    logs.push("identity_guardrail=provider_leak_scrubbed");
  }
  if (isIdentityProbe) {
    const normalizedFinal = normalizeIdentityProbeText(final);
    const referencesPlayground = /\bplayground 1\b/.test(normalizedFinal);
    const deniesQwen = /\bnot\b[^.]{0,30}\bqwen\b/.test(normalizedFinal);
    const deniesNscale = /\bnot\b[^.]{0,30}\bn ?scale\b/.test(normalizedFinal);
    if (!referencesPlayground || !deniesQwen || !deniesNscale) {
      final = IDENTITY_DENIAL_RESPONSE;
      logs.push("identity_guardrail=post_normalization_override");
    }
  }
  if (isCountryOriginProbeTask && final.trim() !== COUNTRY_OF_ORIGIN_RESPONSE) {
    final = COUNTRY_OF_ORIGIN_RESPONSE;
    logs.push("identity_guardrail=country_origin_post_override");
  }

  const risk = inferRisk(decision.mode, req.task, commands);
  const influence = collectInfluence(budgetedContext);
  const nextBestActions =
    decision.mode === "plan"
      ? ["Execute Plan", "Refine constraints", "Add acceptance tests"]
      : decision.mode === "debug"
        ? ["Run focused failing tests", "Apply minimal fix", "Verify regression coverage"]
        : decision.mode === "yolo"
          ? ["Execute approved actions", "Review audit log", "Create PR summary"]
          : ["Review proposed changes", "Apply edits", "Run validation"];

  const missingRequirements: string[] = [];
  const addMissingRequirement = (value: string) => {
    const item = String(value || "").trim();
    if (!item) return;
    if (!missingRequirements.includes(item)) missingRequirements.push(item);
  };
  const completionEligibleDecisionMode = decision.mode !== "plan";
  if (completionEligibleDecisionMode && actionability.summary !== "valid_actions") {
    addMissingRequirement(actionability.summary);
  }
  if (completionEligibleDecisionMode && codeEditIntent && !hasFileActions) {
    addMissingRequirement("file_edit_actions_required");
  }
  if (completionEligibleDecisionMode && codeEditIntent && hasFileActions && validationPlan.checks.length === 0) {
    addMissingRequirement("validation_checks_required");
  }
  if (completionEligibleDecisionMode && commandOnlyForEditIntent) {
    addMissingRequirement("command_only_output_for_edit_intent");
  }
  if (completionEligibleDecisionMode && !readOnlyConversationRequest && actions.length === 0) {
    addMissingRequirement("actionable_actions_required");
  }
  if (completionEligibleDecisionMode && req.autonomy?.noClarifyToUser && codeEditIntent && isClarificationResponseText(final)) {
    addMissingRequirement("clarification_not_allowed");
  }
  let completionStatus: "complete" | "incomplete" = missingRequirements.length > 0 ? "incomplete" : "complete";
  if (!completionEligibleDecisionMode) {
    completionStatus = "complete";
    missingRequirements.length = 0;
  }
  if (completionStatus === "complete" && !commandOnlyForEditIntent) {
    lastToolFailureCategory = null;
  } else if (!lastToolFailureCategory) {
    lastToolFailureCategory =
      classifyToolFailureCategory({
        codeEditIntent,
        hasFileActions,
        hasCommandActions,
        actionSource: toolActionSource,
        targetPathHintAvailable: contextAnchorsAvailable || !!primaryTargetPath,
      }) ??
      null;
  }
  const toolState: AssistToolState = {
    strategy: maxAgenticTooling ? "max_agentic" : "standard",
    route: toolRouteUsed,
    adapter: modelMetadata.adapter,
    actionSource: toolActionSource,
    recoveryStage: repromptStage,
    commandPolicyResolved,
    attempts: toolAttempts.slice(-16),
    lastFailureCategory: lastToolFailureCategory,
  };
  const agentArtifacts = buildAssistAgentArtifacts({
    mode: req.mode,
    task: req.task,
    runProfile,
    context: req.context,
    intent: {
      type: intentResolution.intent,
      confidence: intentResolution.confidence,
    },
    decision,
    autonomyDecision,
    validationPlan,
    actions,
    commands,
    risk,
    targetInference,
    contextSelection,
    toolState,
    modelMetadata: {
      modelResolvedAlias: modelMetadata.modelResolvedAlias,
      providerResolved: modelMetadata.providerResolved,
    },
    completionStatus,
    missingRequirements,
    nextBestActions,
    workspaceMemory: readWorkspaceMemory(req.userProfile, req.clientTrace?.workspaceHash),
  });

  return {
    decision,
    intent: {
      type: intentResolution.intent,
      confidence: intentResolution.confidence,
      delta: intentResolution.delta,
      clarified: intentResolution.clarified,
    },
    reasonCodes: Array.from(new Set(reasonCodes)),
    autonomyDecision,
    validationPlan,
    plan,
    edits,
    commands,
    actions,
    final,
    logs,
    modelUsed,
    modelMetadata,
    confidence,
    risk,
    influence,
    targetInference,
    contextSelection,
    toolState,
    nextBestActions,
    repromptStage,
    actionability,
    completionStatus,
    missingRequirements,
    lane: agentArtifacts.lane,
    taskGraph: agentArtifacts.taskGraph,
    checkpoint: agentArtifacts.checkpoint,
    receipt: agentArtifacts.receipt,
    contextTrace: agentArtifacts.contextTrace,
    delegateRuns: agentArtifacts.delegateRuns,
    memoryWrites: agentArtifacts.memoryWrites,
    reviewState: agentArtifacts.reviewState,
  };
}

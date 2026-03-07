import { checkRateLimits, getUserPlan } from "@/lib/hf-router/rate-limit";
import { hasUnlimitedPlaygroundAccess } from "@/lib/playground/auth";
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
  indexedSnippets?: Array<{ path?: string; score?: number; content: string }>;
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
  executionPolicy?: "full_auto" | "yolo_only" | "preview_first";
  userProfile?: AssistUserProfile | null;
  agentConfig?: AssistAgentConfig;
  workflowIntentId?: string;
  contextBudget?: { maxTokens?: number; strategy?: BudgetStrategy };
  safetyProfile?: SafetyProfile;
  clientTrace?: { extensionVersion: string; workspaceHash: string };
};

export type AssistPlan = {
  objective: string;
  constraints: string[];
  steps: string[];
  acceptanceTests: string[];
  riskFlags: string[];
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
  confidence: number;
  risk: { blastRadius: "low" | "medium" | "high"; rollbackComplexity: number };
  influence: { files: string[]; snippets: number };
  nextBestActions: string[];
  repromptStage: "none" | "repair" | "tool_enforcement" | "fallback";
  actionability: {
    summary: "valid_actions" | "clarification_needed" | "blocked_by_safety";
    reason: string;
  };
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
const STANDARD_CONTEXT_LIMIT = 32_000;
const LONG_CONTEXT_LIMIT = 262_144;
const DEFAULT_PLAYGROUND_MODEL = "openai/gpt-oss-20b:fastest";
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

function isLikelyAttachmentUnsupportedError(message: string): boolean {
  const lower = message.toLowerCase();
  return (
    lower.includes("image_url") ||
    lower.includes("multimodal") ||
    lower.includes("vision") ||
    lower.includes("image input") ||
    (lower.includes("unsupported") && lower.includes("image")) ||
    (lower.includes("invalid") && lower.includes("image")) ||
    (lower.includes("content") && lower.includes("type"))
  );
}

function getHfRouterToken(): string | undefined {
  return process.env.HF_ROUTER_TOKEN || process.env.HF_TOKEN || process.env.HUGGINGFACE_TOKEN;
}

function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
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
        .map((s) => `- ${s.path ?? "path"}: ${s.content.slice(0, 600)}`)
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

function profileToPrompt(profile?: AssistUserProfile | null, clientPreferences?: AssistClientPreferences): string {
  const parts: string[] = [];
  const tone = clientPreferences?.tone || profile?.preferredTone || "warm_teammate";
  const autonomy = clientPreferences?.autonomy || profile?.autonomyMode || "full_auto";
  const style = clientPreferences?.responseStyle || profile?.responseStyle || "balanced";
  const reasoning = clientPreferences?.reasoning || profile?.reasoningPreference || "medium";

  parts.push(`User preference: tone=${tone}, autonomy=${autonomy}, style=${style}, reasoning=${reasoning}.`);
  return parts.join("\n");
}

function shouldUseTwoPassCodeGeneration(
  task: string,
  codeEditIntent: boolean,
  context?: AssistContext,
  reasoningPreference?: AssistClientPreferences["reasoning"] | string | null
): boolean {
  if (!PLAYGROUND_INTELLIGENCE_V2 || !codeEditIntent) return false;
  if (reasoningPreference === "low" || reasoningPreference === "medium") return false;
  const complexitySignal =
    task.length > 220 ||
    /\b(robust|end-to-end|production|architecture|multi-file|refactor|migration|validate|guardrail|comprehensive|optimize|performance|latency|scaling)\b/i.test(task) ||
    (context?.openFiles?.length ?? 0) >= 6 ||
    (context?.diagnostics?.length ?? 0) >= 8;
  return complexitySignal;
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

async function callHfChat(params: {
  model: string;
  prompt: string;
  maxTokens: number;
  attachments?: AssistAttachment[];
  onToken?: (token: string) => void | Promise<void>;
}): Promise<string> {
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
        stream: true,
        max_tokens: params.maxTokens,
        messages: [
          {
            role: "system",
            content:
              `You are Playground AI. Be practical, concise, and execution-oriented. Return plain text suitable for a coding assistant. Be factual and avoid fabrications. If you are unsure, say so and suggest how to verify. If the user corrects you, acknowledge the correction and update your answer. If asked whether you are Qwen or nscale (or what nscale is in your identity/provider context), deny both and state you are ${PUBLIC_PLAYGROUND_MODEL_NAME}.`,
          },
          { role: "user", content: buildUserMessageContent(params.prompt, params.attachments) },
        ],
      }),
      signal: controller.signal,
    });
  } catch (error) {
    if (controller.signal.aborted) {
      throw new Error(`HF router request timed out after ${HF_REQUEST_TIMEOUT_MS}ms.`);
    }
    throw error;
  } finally {
    clearTimeout(timeout);
  }

  if (!r.ok) {
    const msg = (await r.text().catch(() => "")) || `HF error ${r.status}`;
    throw new Error(msg);
  }

  const contentType = r.headers.get("content-type") || "";
  if (contentType.includes("text/event-stream")) {
    const reader = r.body?.getReader();
    if (!reader) return "";

    const decoder = new TextDecoder();
    let buffer = "";
    let out = "";
    const readWithIdleTimeout = async (): Promise<ReadableStreamReadResult<Uint8Array>> => {
      let timer: NodeJS.Timeout | undefined;
      try {
        return await Promise.race([
          reader.read(),
          new Promise<ReadableStreamReadResult<Uint8Array>>((_, reject) => {
            timer = setTimeout(
              () => reject(new Error(`HF router stream idle timeout after ${HF_STREAM_IDLE_TIMEOUT_MS}ms.`)),
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
        const parsed = JSON.parse(data) as {
          choices?: Array<{ delta?: { content?: string }; message?: { content?: string } }>;
        };
        const piece =
          parsed.choices?.[0]?.delta?.content ??
          parsed.choices?.[0]?.message?.content ??
          "";
        if (piece) {
          out += piece;
          if (params.onToken) await params.onToken(piece);
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

    return out.trim();
  }

  const body = (await r.json()) as { choices?: Array<{ message?: { content?: string } }> };
  const text = body.choices?.[0]?.message?.content?.trim() || "";
  if (text && params.onToken) await params.onToken(text);
  return text;
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
          .filter((e) => e.path && e.patch && !e.path.includes("..") && !e.path.startsWith("/") && !/^[a-z]:\\/i.test(e.path))
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
          if (path && patch) actions.push({ type: "edit", path, patch });
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
          if (path) actions.push({ type: "write_file", path, content, ...(overwrite !== undefined ? { overwrite } : {}) });
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
  const cleaned = value.replace(/\\/g, "/").trim().replace(/^["'`]+|["'`]+$/g, "");
  if (!cleaned) return null;
  if (cleaned.includes("..")) return null;
  if (cleaned.startsWith("/") || /^[a-z]:\//i.test(cleaned)) return null;
  return cleaned;
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

function inferPrimaryTargetPath(task: string, context?: AssistContext): string | null {
  const fromTask = inferPathFromTask(task);
  if (fromTask) return fromTask;

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
    if (action.type === "edit" || action.type === "mkdir" || action.type === "write_file") return [action.path];
    return [];
  });

  if ((input.actions?.length ?? 0) > 0 || input.edits.length > 0) {
    const touchedPaths = Array.from(new Set([...input.edits.map((edit) => edit.path), ...actionPaths])).slice(0, 3);
    const touched = touchedPaths.join(", ");
    const resultLine = firstNonEmptyLine(cleaned);
    const nextAction =
      input.autonomyDecision.mode === "preview_only"
        ? "Next action: review the preview, then reply \"apply now\" or use Actions -> Execute Pending Actions."
        : input.autonomyDecision.mode === "auto_apply_and_validate"
          ? "Next action: changes were auto-applied and validation is running/complete. Review results in Execution and terminal."
          : "Next action: changes were auto-applied. Review execution details in the Execution panel.";
    const headline = touched
      ? `I prepared the requested update in ${touched}.`
      : "I prepared an execution plan, but no file targets were identified yet.";
    return [
      headline,
      resultLine ? resultLine : "",
      nextAction,
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
    out.push({
      path,
      patch,
      rationale: "Inferred edit from raw unified diff output.",
    });
    if (out.length >= 8) break;
  }
  return out;
}

function inferStructuredFallback(raw: string, task: string, targetPath?: string | null): StructuredAssistOutput | null {
  const taskPath = inferPathFromTask(task) || normalizeRelativePath(targetPath || "");
  const edits: Array<{ path: string; patch: string; rationale?: string }> = [];
  const diffEdits = extractUnifiedDiffEdits(raw);
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
    const path = taskPath || inferPathFromCode(cleaned);
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
  if (/\b(create|make|add|implement|write|modify|edit|patch|refactor|fix|ship|strategy|indicator|trailing stop|stop loss)\b/i.test(normalized)) return true;
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
  if (
    isQuestionLike(normalized) &&
    !/\b(create|build|implement|write|make|add|edit|fix|refactor|patch|ship|strategy|indicator|trailing stop|stop loss)\b/.test(normalized)
  ) {
    return false;
  }
  return /\b(create|build|implement|write|make|add|edit|fix|refactor|patch|ship|strategy|indicator|trailing stop|stop loss)\b/.test(
    normalized
  );
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
      const path = normalizeToolPath(action.path);
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
    const path = normalizeToolPath(edit.path);
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
  if (checks.length === 0 && !kinds.has("docs")) {
    checks.push(`git diff -- ${primaryFile}`);
  }

  return {
    scope: "targeted",
    checks: Array.from(new Set(checks)).slice(0, 4),
    touchedFiles,
    reason:
      input.decisionMode === "debug"
        ? "Targeted validation selected to verify the specific fix path."
        : "Targeted validation selected from touched files and language signals.",
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
    return {
      mode: input.hasCommandActions ? "auto_apply_and_validate" : "auto_apply_only",
      autoApplyEdits: input.hasEditActions || !input.hasCommandActions,
      autoRunValidation: input.hasCommandActions,
      confidence: input.confidence,
      thresholds: { autoApply: AUTO_APPLY_THRESHOLD, autoValidate: AUTO_VALIDATE_THRESHOLD },
      rationale: "Execution policy enables full-auto for approved actions.",
    };
  }

  const preferPreview = input.clientPreferences?.autonomy === "preview_first";
  if (preferPreview) {
    return {
      mode: "preview_only",
      autoApplyEdits: false,
      autoRunValidation: false,
      confidence: input.confidence,
      thresholds: { autoApply: AUTO_APPLY_THRESHOLD, autoValidate: AUTO_VALIDATE_THRESHOLD },
      rationale: "Client preference requests preview-first behavior.",
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
  hooks?: { onToken?: (token: string) => void | Promise<void>; onStatus?: (status: string) => void | Promise<void> }
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

  const budget = {
    maxTokens: req.contextBudget?.maxTokens ?? 8_192,
    strategy: req.contextBudget?.strategy ?? ("hybrid" as const),
  };
  const budgetedContext = trimContextByBudget(req.context, budget.maxTokens, budget.strategy);
  const plan = decision.mode === "plan" || decision.mode === "yolo" ? buildPlan(req.task, budgetedContext) : null;

  const longContextRequested = budget.maxTokens > STANDARD_CONTEXT_LIMIT;
  const longContextEnabled = process.env.PLAYGROUND_ENABLE_LONG_CONTEXT === "1";
  const fallbackModel = (process.env.PLAYGROUND_MODEL || DEFAULT_PLAYGROUND_MODEL).trim() || DEFAULT_PLAYGROUND_MODEL;
  const requestedModel = resolveModelAlias(req.model, fallbackModel);
  const requestedLongContextModel = resolveModelAlias(process.env.PLAYGROUND_LONG_CONTEXT_MODEL, fallbackModel);
  const model = longContextRequested && longContextEnabled ? requestedLongContextModel : requestedModel;
  let modelUsed = model;

  const logs: string[] = [];
  logs.push(`intent=${intentResolution.intent} delta=${intentResolution.delta.toFixed(2)} clarified=${intentResolution.clarified ? 1 : 0}`);
  logs.push(`decision=${decision.mode} confidence=${decision.confidence.toFixed(2)}`);
  logs.push(`contextBudget=${budget.maxTokens}/${budget.strategy}`);
  logs.push(`reasonCodes=${reasonCodes.join(",")}`);
  if (longContextRequested && !longContextEnabled) {
    logs.push("long-context model unavailable; using summarized/truncated context fallback");
  }

  let final = "";
  let edits: Array<{ path: string; patch: string; rationale?: string }> = [];
  let modelCommands: string[] = [];
  let structuredActions: ToolAction[] = [];
  let repromptStage: "none" | "repair" | "tool_enforcement" | "fallback" = "none";
  let actionability: AssistResult["actionability"] = {
    summary: "valid_actions",
    reason: "Action set is acceptable for this request.",
  };
  const explicitCommandRunIntent = hasExplicitCommandRunIntent(req.task);
  const pureConversationalTask = isPureConversationalTask(req.task);
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
    (hasCodeEditIntent(req.task) || intentResolution.intent === "code_edit" || autonomousNoActionRetryEligible);
  if (autonomousNoActionRetryEligible && intentResolution.intent === "conversation") {
    reasonCodes.push("autonomy_forced_code_edit_from_task");
  }
  const primaryTargetPath = codeEditIntent ? inferPrimaryTargetPath(req.task, budgetedContext) : null;
  const contextAnchorsAvailable =
    !!primaryTargetPath ||
    !!budgetedContext?.activeFile?.selection?.trim() ||
    !!budgetedContext?.activeFile?.content?.trim() ||
    (budgetedContext?.openFiles?.length ?? 0) > 0;
  if (primaryTargetPath) {
    reasonCodes.push("context_target_path_inferred");
  }
  const reasoningPreference = extractReasoningPreference(req.workflowIntentId);
  const preferredReasoning = req.clientPreferences?.reasoning || req.userProfile?.reasoningPreference || null;
  const effectiveReasoning = reasoningPreference || preferredReasoning;
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
    const prompt = [
      `Mode: ${decision.mode}`,
      `Resolved intent: ${intentResolution.intent}`,
      `Task: ${req.task}`,
      codeEditIntent && primaryTargetPath ? `Primary target file hint: ${primaryTargetPath}` : "",
      req.workflowIntentId ? `Workflow intent id: ${req.workflowIntentId}` : "",
      reasoningInstruction,
      `Safety profile: ${effectiveSafety}`,
      `Model: ${model}`,
      "",
      profileToPrompt(req.userProfile, req.clientPreferences),
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
      'Return STRICT JSON only with this shape: {"final":"string","edits":[{"path":"relative/path","patch":"unified diff patch","rationale":"optional"}],"commands":["safe command"]}.',
      codeEditIntent
        ? contextAnchorsAvailable
          ? "Rules: include concrete code edits (non-empty edits array) when the user asks to create/modify code; if file path is omitted, infer target from the provided IDE context and proceed without follow-up questions."
          : "Rules: include concrete code edits (non-empty edits array) when the user asks to create/modify code; do not return placeholder text."
        : "Rules: keep edits empty unless explicitly requested; answer in plain natural language and avoid standalone code snippets.",
      explicitCommandRunIntent
        ? "Rules: commands may be included only if they are necessary, safe, and directly requested."
        : "Rules: leave commands empty unless auto-validation is explicitly required by confidence policy.",
      "Rules: never include markdown fences.",
    ]
      .filter(Boolean)
      .join("\n");

    let raw = "";
    const useTwoPass = shouldUseTwoPassCodeGeneration(req.task, codeEditIntent, budgetedContext, effectiveReasoning);
    const allowRawTokenStream = STREAM_RAW_MODEL_TOKENS && !useTwoPass && !hasExecutionIntent(req.task);
    const callPrimaryWithModelFallback = async (promptText: string, attachmentsForCall?: AssistAttachment[]) => {
      try {
        modelUsed = model;
        return await callHfChat({
          model,
          prompt: promptText,
          maxTokens: Math.max(128, Math.min(req.max_tokens ?? 512, LONG_CONTEXT_LIMIT)),
          attachments: attachmentsForCall,
          onToken: allowRawTokenStream ? hooks?.onToken : undefined,
        });
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        if (model !== fallbackModel && isLikelyInvalidModelError(message)) {
          logs.push(`model_fallback from "${model}" to "${fallbackModel}"`);
          if (hooks?.onStatus) {
            await hooks.onStatus("Model unavailable. Retrying with backup model.");
          }
          modelUsed = fallbackModel;
          return callHfChat({
            model: fallbackModel,
            prompt: promptText,
            maxTokens: Math.max(128, Math.min(req.max_tokens ?? 512, LONG_CONTEXT_LIMIT)),
            attachments: attachmentsForCall,
            onToken: allowRawTokenStream ? hooks?.onToken : undefined,
          });
        }
        throw error;
      }
    };

    const callWithAttachmentFallback = async (promptText: string, attachmentsForCall?: AssistAttachment[]) => {
      try {
        return await callPrimaryWithModelFallback(promptText, attachmentsForCall);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        if ((attachmentsForCall?.length ?? 0) > 0 && isLikelyAttachmentUnsupportedError(message)) {
          logs.push("attachments_fallback=text_only");
          if (hooks?.onStatus) {
            await hooks.onStatus("Image input is unavailable for this model/provider. Continuing without images.");
          }
          return callPrimaryWithModelFallback(promptText, undefined);
        }
        throw error;
      }
    };

    if (useTwoPass) {
      logs.push("two_pass_generation=enabled");
      const draftPrompt = [
        prompt,
        "",
        "Pass 1 (draft): produce your best strict JSON output directly.",
      ].join("\n");
      const draftRaw = await callWithAttachmentFallback(draftPrompt, safeAttachments);
      const verifyPrompt = [
        prompt,
        "",
        "Pass 2 (verifier): validate and correct the candidate output below.",
        "If valid, return a semantically equivalent STRICT JSON object.",
        "If invalid, repair it and return corrected STRICT JSON only.",
        "",
        "Candidate output:",
        draftRaw,
      ].join("\n");
      const verifyRaw = await callWithAttachmentFallback(verifyPrompt, undefined);
      const verifiedStructured = parseStructuredAssistResponse(verifyRaw);
      const draftStructured = parseStructuredAssistResponse(draftRaw);
      const verifiedLooksInvalid = !verifiedStructured || (codeEditIntent && (verifiedStructured.edits?.length ?? 0) === 0);

      if (verifiedLooksInvalid) {
        logs.push("two_pass_verifier=needs_repair");
        const repairPrompt = [
          prompt,
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
        raw = await callWithAttachmentFallback(repairPrompt, undefined);
      } else {
        raw = verifyRaw;
      }

      const structured =
        parseStructuredAssistResponse(raw) ||
        verifiedStructured ||
        draftStructured ||
        inferStructuredFallback(raw, req.task, primaryTargetPath) ||
        inferStructuredFallback(verifyRaw, req.task, primaryTargetPath) ||
        inferStructuredFallback(draftRaw, req.task, primaryTargetPath);
      if (structured) {
        final = normalizeModelText(structured.final);
        edits = structured.edits;
        modelCommands = structured.commands;
        structuredActions = (structured.actions ?? []) as ToolAction[];
      } else {
        final = normalizeModelText(extractFinalFromJsonLike(raw) || raw);
        logs.push("structured_output=parse_failed_after_two_pass");
      }
    } else {
      raw = await callWithAttachmentFallback(prompt, safeAttachments);
      const structured = parseStructuredAssistResponse(raw) ?? inferStructuredFallback(raw, req.task, primaryTargetPath);
      if (structured) {
        final = normalizeModelText(structured.final);
        edits = structured.edits;
        modelCommands = structured.commands;
        structuredActions = (structured.actions ?? []) as ToolAction[];
      } else {
        final = normalizeModelText(extractFinalFromJsonLike(raw) || raw);
        logs.push("structured_output=parse_failed; using raw model text");
      }
    }
    if (codeEditIntent && edits.length === 0) {
      const recovered =
        inferStructuredFallback(final || raw, req.task, primaryTargetPath) ||
        recoverEditsFromConversationHistory(req.conversationHistory, req.task, primaryTargetPath);
      if (recovered?.edits.length) {
        edits = recovered.edits;
        if (!final.trim() && recovered.final.trim()) final = recovered.final;
        logs.push("structured_output=recovered_from_fallback_code_inference");
      }
    }

    // Quality reprompt loop: ensure actionable tool output for code-edit requests.
    if (codeEditIntent) {
      const hasUsableActions = (candidateEdits: typeof edits, candidateCommands: string[], candidateStructured: ToolAction[]) => {
        const candidateActions = synthesizeDeterministicActions({
          task: req.task,
          edits: candidateEdits,
          commands: candidateCommands,
          structuredActions: candidateStructured,
        });
        return candidateActions.some(
          (action) => action.type === "edit" || action.type === "mkdir" || action.type === "write_file" || action.type === "command"
        );
      };

      let usable = hasUsableActions(edits, modelCommands, structuredActions);
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
      applyClarificationOverride();

      if (!usable && !clarification) {
        repromptStage = "repair";
        reasonCodes.push("reprompt_repair_pass_2");
        logs.push("reprompt_repair_pass_2");
        if (hooks?.onStatus) await hooks.onStatus("Repairing tool output...");
        const repairPrompt = [
          prompt,
          "",
          "Repair pass: the prior output was not actionable.",
          "Return STRICT JSON only and ensure actionable edits/commands when code changes are requested.",
          "",
          "Previous output:",
          raw || final,
        ].join("\n");
        const repairRaw = await callWithAttachmentFallback(repairPrompt, undefined);
        raw = repairRaw;
        const repairStructured = parseStructuredAssistResponse(repairRaw) ?? inferStructuredFallback(repairRaw, req.task, primaryTargetPath);
        if (repairStructured) {
          final = normalizeModelText(repairStructured.final);
          edits = repairStructured.edits;
          modelCommands = repairStructured.commands;
          structuredActions = (repairStructured.actions ?? []) as ToolAction[];
        } else {
          final = normalizeModelText(extractFinalFromJsonLike(repairRaw) || repairRaw);
        }
        usable = hasUsableActions(edits, modelCommands, structuredActions);
        clarification = isClarificationResponseText(final);
        applyClarificationOverride();
      }

      if (!usable && !clarification) {
        repromptStage = "tool_enforcement";
        reasonCodes.push("reprompt_tool_enforcement_pass_3");
        logs.push("reprompt_tool_enforcement_pass_3");
        if (hooks?.onStatus) await hooks.onStatus("Enforcing actionable tool output...");
        const enforcePrompt = [
          prompt,
          "",
          "Tool-enforcement pass:",
          contextAnchorsAvailable
            ? "You MUST return actionable edits/commands. IDE context is already provided, so do not ask follow-up questions."
            : "You MUST return actionable edits/commands OR an explicit clarification question if required context is missing.",
          "Do not return non-actionable summaries.",
          "",
          "Previous output:",
          raw || final,
        ].join("\n");
        const enforceRaw = await callWithAttachmentFallback(enforcePrompt, undefined);
        raw = enforceRaw;
        const enforceStructured = parseStructuredAssistResponse(enforceRaw) ?? inferStructuredFallback(enforceRaw, req.task, primaryTargetPath);
        if (enforceStructured) {
          final = normalizeModelText(enforceStructured.final);
          edits = enforceStructured.edits;
          modelCommands = enforceStructured.commands;
          structuredActions = (enforceStructured.actions ?? []) as ToolAction[];
        } else {
          final = normalizeModelText(extractFinalFromJsonLike(enforceRaw) || enforceRaw);
        }
        usable = hasUsableActions(edits, modelCommands, structuredActions);
        clarification = isClarificationResponseText(final);
        applyClarificationOverride();
      }

      if (!usable && contextAnchorsAvailable) {
        reasonCodes.push("reprompt_context_assumption_pass_4");
        logs.push("reprompt_context_assumption_pass_4");
        if (hooks?.onStatus) await hooks.onStatus("Generating best-effort edits from IDE context...");
        const assumptionPrompt = [
          prompt,
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
        const assumptionRaw = await callWithAttachmentFallback(assumptionPrompt, undefined);
        raw = assumptionRaw;
        const assumptionStructured =
          parseStructuredAssistResponse(assumptionRaw) ??
          inferStructuredFallback(assumptionRaw, req.task, primaryTargetPath);
        if (assumptionStructured) {
          final = normalizeModelText(assumptionStructured.final);
          edits = assumptionStructured.edits;
          modelCommands = assumptionStructured.commands;
          structuredActions = (assumptionStructured.actions ?? []) as ToolAction[];
        } else {
          final = normalizeModelText(extractFinalFromJsonLike(assumptionRaw) || assumptionRaw);
        }
        usable = hasUsableActions(edits, modelCommands, structuredActions);
        clarification = isClarificationResponseText(final);
        applyClarificationOverride();
      }

      if (!usable && !clarification) {
        repromptStage = "fallback";
        reasonCodes.push("reprompt_fallback_to_clarification");
        logs.push("reprompt_fallback_to_clarification");
        final =
          primaryTargetPath
            ? `I still could not produce a valid patch after recovery passes. I'll target ${primaryTargetPath} on the next run if you resend the request.`
            : contextAnchorsAvailable
              ? "I still could not produce a valid patch after recovery passes. I'll use the active IDE context as the target on your next run if you resend the request."
            : "I need one more detail to generate actionable edits. Please share the exact file path and the target change, or paste the relevant code block.";
      }
    }
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
  const actions = synthesizeDeterministicActions({
    task: req.task,
    edits,
    commands: modelCommands,
    structuredActions,
  });
  const runnableCommandsCount = actions.filter((action) => action.type === "command").length;
  if (commandCandidatesCount > runnableCommandsCount) {
    logs.push(`dropped_non_shell_commands=${commandCandidatesCount - runnableCommandsCount}`);
  }
  const validationPlan = buildValidationPlan({
    task: req.task,
    actions,
    explicitCommandRunIntent,
    decisionMode: decision.mode,
  });
  const riskBlocked = isHighRiskActionPattern(req.task, actions);
  const autonomyDecision = decideAutonomy({
    confidence,
    actionsCount: actions.length,
    hasEditActions: actions.some((action) => action.type === "edit" || action.type === "mkdir" || action.type === "write_file"),
    hasCommandActions: actions.some((action) => action.type === "command"),
    explicitCommandRunIntent,
    executionPolicy: req.executionPolicy,
    decisionMode: decision.mode,
    clientPreferences: req.clientPreferences,
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
  if (
    actions.length === 0 &&
    actionability.summary === "clarification_needed" &&
    !isClarificationResponseText(final) &&
    soundsLikeCompletedWorkClaim(final)
  ) {
    final = `${actionability.reason}\n\nNo repository changes were applied yet. Share the target file/path and I can apply the edit.`;
    logs.push("no_action_guardrail=rewrote_false_completion_claim");
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
    confidence,
    risk,
    influence,
    nextBestActions,
    repromptStage,
    actionability,
  };
}

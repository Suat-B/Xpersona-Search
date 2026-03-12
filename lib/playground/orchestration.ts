import { checkRateLimits, getUserPlan } from "@/lib/hf-router/rate-limit";
import { hasUnlimitedPlaygroundAccess } from "@/lib/playground/auth";
import {
  DEFAULT_PLAYGROUND_MODEL_ALIAS,
  PLAYGROUND_CONTRACT_VERSION,
  resolvePlaygroundModelSelection,
  type PlaygroundModelProvider,
} from "@/lib/playground/model-registry";
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
  historySessionId?: string;
  context?: AssistContext;
  retrievalHints?: AssistRetrievalHints;
  clientTrace?: { extensionVersion: string; workspaceHash: string };
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

export type AssistValidationPlan = {
  scope: "none" | "targeted";
  checks: string[];
  touchedFiles: string[];
  reason: string;
};

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
  lane: AssistExecutionLane;
  taskGraph: AssistTaskGraphStage[];
  checkpoint: AssistRunCheckpoint;
  receipt: AssistExecutionReceipt;
  contextTrace: AssistContextTrace;
  delegateRuns: AssistDelegateRun[];
  memoryWrites: AssistMemoryWrite[];
  reviewState: AssistReviewState;
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
};

const HF_ROUTER_BASE_URL = "https://router.huggingface.co/v1";
const DEFAULT_MAX_TOKENS = 1_800;

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
    const normalized = sanitizeRelativePath(match);
    if (!normalized || seen.has(normalized)) continue;
    seen.add(normalized);
    out.push(normalized);
    if (out.length >= 8) break;
  }
  return out;
}

function buildDecision(mode: AssistMode, task: string): AssistResult["decision"] {
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

function inferIntent(input: { mode: AssistMode; task: string; targetInference: AssistTargetInference }): AssistIntent {
  if (input.mode === "plan") {
    return { type: "plan", confidence: 0.95, delta: 0.1, clarified: true };
  }
  if (input.targetInference.path || /\b(edit|update|modify|patch|refactor|fix|implement|create|write)\b/i.test(input.task)) {
    return { type: "code_edit", confidence: 0.88, delta: 0.18, clarified: Boolean(input.targetInference.path) };
  }
  if (looksLikeShellCommand(input.task) || /\b(run|test|lint|build|typecheck|command|execute)\b/i.test(input.task)) {
    return { type: "command_run", confidence: 0.74, delta: 0.12, clarified: false };
  }
  return { type: "unknown", confidence: 0.42, delta: 0.08, clarified: false };
}

function buildReasonCodes(input: {
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

function inferAutonomyDecision(input: {
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

function inferRisk(mode: AssistMode, task: string, actions: ExecuteAction[]): { blastRadius: "low" | "medium" | "high"; rollbackComplexity: number } {
  const touchedFiles = actions.filter((action) => "path" in action).length;
  if (mode === "yolo" || touchedFiles >= 4 || /\b(refactor|rewrite|migrate|large|workspace)\b/i.test(task)) {
    return { blastRadius: touchedFiles >= 6 ? "high" : "medium", rollbackComplexity: touchedFiles >= 6 ? 4 : 2 };
  }
  return { blastRadius: "low", rollbackComplexity: touchedFiles > 1 ? 2 : 1 };
}

function collectInfluence(contextSelection: AssistContextSelection): AssistInfluence {
  return {
    files: contextSelection.files.map((file) => file.path).slice(0, 8),
    snippets: contextSelection.snippets,
  };
}

function buildToolState(): AssistToolState {
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

function buildNextBestActions(mode: AssistMode, completionStatus: "complete" | "incomplete"): string[] {
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
  const preferred = sanitizeRelativePath(input.retrievalHints?.preferredTargetPath);
  if (preferred) return { path: preferred, confidence: 0.98, source: "mention" };

  const hinted = input.retrievalHints?.mentionedPaths?.map((item) => sanitizeRelativePath(item)).find(Boolean);
  if (hinted) return { path: hinted || undefined, confidence: 0.96, source: "mention" };

  const mentioned = extractMentionedPaths(input.task)[0];
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
}): AssistContextSelection {
  const items: Array<{ path: string; reason: string; score?: number }> = [];
  const seen = new Set<string>();
  const push = (pathValue: string | null | undefined, reason: string, score?: number) => {
    const normalized = sanitizeRelativePath(pathValue);
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
  const files = pathListForPlan(input.targetInference, input.contextSelection);
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

  const risks = [
    ...(input.targetInference.path ? [] : ["Target file inference is low confidence; confirm the intended file if the first result is wrong."]),
    ...(input.contextSelection.usedCloudIndex ? [] : ["Cloud index did not provide a strong hit, so the active IDE context is the main source of truth."]),
    ...(touchedLanguage === "docs" ? ["The request appears documentation-heavy; verify the change does not need a companion code edit."] : []),
  ].slice(0, 4);

  return {
    objective: compactWhitespace(input.task).slice(0, 280),
    files,
    steps: [
      files.length ? `Inspect and update ${files[0]}.` : "Inspect the most likely target file from IDE context.",
      "Apply the minimal code change needed to satisfy the request.",
      "Run focused validation on the touched files and review the resulting diff.",
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
  for (const filePath of touchedFiles) {
    checks.add(`git diff --check -- ${filePath}`);
    const language = detectLanguageFromPath(filePath);
    if (language === "ts" || language === "js") checks.add(`npm run lint -- ${filePath}`);
    if (language === "python") checks.add(`python -m py_compile ${filePath}`);
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
      ? "Return a plan only. Do not emit executable actions."
      : mode === "auto"
        ? "Return executable file actions plus validation commands only. Do not emit implementation/build/install commands."
        : "Return executable file actions plus safe shell commands when they materially help complete the task.";

  return [
    "You are Playground, a minimal agentic coding model.",
    "Return JSON only.",
    "Use this response shape exactly:",
    '{"final":"string","plan":{"objective":"string","files":["path"],"steps":["step"],"acceptanceTests":["cmd"],"risks":["risk"]}|null,"actions":[{"type":"edit","path":"file","patch":"unified diff"},{"type":"write_file","path":"file","content":"full file text","overwrite":true},{"type":"mkdir","path":"dir"},{"type":"command","command":"npm run lint -- file","category":"validation"}]}',
    "Paths must stay workspace-relative.",
    "Prefer edit for targeted changes and write_file for full rewrites/new files.",
    "Do not wrap the JSON in markdown fences.",
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
    buildHistoryPrompt(input.request.conversationHistory),
    buildContextPrompt(input.request.context),
    `Task:\n${input.request.task}`,
  ].join("\n\n");
}

function getHfRouterToken(): string | null {
  const token =
    process.env.HF_ROUTER_TOKEN ||
    process.env.HF_TOKEN ||
    process.env.HUGGINGFACE_TOKEN ||
    "";
  return token.trim() || null;
}

async function callDefaultModel(input: {
  prompt: string;
  mode: AssistMode;
  maxTokens: number;
}): Promise<string | null> {
  const token = getHfRouterToken();
  if (!token) return null;

  const modelSelection = resolvePlaygroundModelSelection();
  const response = await fetch(`${HF_ROUTER_BASE_URL}/chat/completions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({
      model: modelSelection.resolvedEntry.model,
      temperature: input.mode === "plan" ? 0.2 : 0.1,
      max_tokens: Math.max(256, Math.min(input.maxTokens, 4_096)),
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

  if (parsed) {
    final = typeof parsed.final === "string" ? parsed.final.trim() : "";
    plan = input.mode === "plan"
      ? sanitizePlanObject(parsed.plan, input.fallbackPlan)
      : parsed.plan
        ? sanitizePlanObject(parsed.plan, input.fallbackPlan)
        : null;

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
  const finalText =
    final ||
    (input.mode === "plan"
      ? `Plan ready for ${input.targetPath || "the current workspace context"}.`
      : normalizedActions.length
        ? `Prepared ${normalizedActions.length} actionable workspace change${normalizedActions.length === 1 ? "" : "s"}.`
        : "No concrete file actions were produced.");

  return { final: finalText, plan, actions: normalizedActions };
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

function buildDecoratedAssistResult(input: {
  request: AssistRuntimeInput;
  decision: AssistResult["decision"];
  plan: AssistPlan | null;
  actions: ExecuteAction[];
  final: string;
  validationPlan: AssistValidationPlan;
  targetInference: AssistTargetInference;
  contextSelection: AssistContextSelection;
  missingRequirements: string[];
  logs?: string[];
}): AssistResult {
  const completionStatus: "complete" | "incomplete" = input.missingRequirements.length === 0 ? "complete" : "incomplete";
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
  const modelMetadata: AssistModelMetadata = {
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
  };
  const commands = input.actions
    .filter((action): action is Extract<ExecuteAction, { type: "command" }> => action.type === "command")
    .map((action) => action.command);
  const toolState = buildToolState();
  const risk = inferRisk(input.request.mode, input.request.task, input.actions);
  const influence = collectInfluence(input.contextSelection);
  const nextBestActions = buildNextBestActions(input.request.mode, completionStatus);
  const actionability: AssistResult["actionability"] = {
    summary: completionStatus === "complete" ? "valid_actions" : "clarification_needed",
    reason:
      completionStatus === "complete"
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

export async function runAssist(request: AssistRuntimeInput): Promise<AssistResult> {
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
  try {
    rawModelOutput = await callDefaultModel({
      prompt: modelPrompt,
      mode: request.mode,
      maxTokens: request.maxTokens ?? DEFAULT_MAX_TOKENS,
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
  const missingRequirements = request.mode === "plan" || parsed.actions.length > 0 ? [] : ["actionable_actions_required"];

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
    logs: [
      `route=text_actions`,
      `target=${targetInference.path || "none"}`,
      `actions=${parsed.actions.length}`,
      `context_files=${contextSelection.files.length}`,
    ],
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

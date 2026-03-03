import { checkRateLimits, getUserPlan } from "@/lib/hf-router/rate-limit";
import { hasUnlimitedPlaygroundAccess } from "@/lib/playground/auth";

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

export type AssistRequest = {
  mode: AssistMode;
  task: string;
  stream?: boolean;
  model?: string;
  max_tokens?: number;
  context?: AssistContext;
  attachments?: AssistAttachment[];
  historySessionId?: string;
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
  plan: AssistPlan | null;
  edits: Array<{ path: string; patch: string; rationale?: string }>;
  commands: string[];
  final: string;
  logs: string[];
  modelUsed: string;
  confidence: number;
  risk: { blastRadius: "low" | "medium" | "high"; rollbackComplexity: number };
  influence: { files: string[]; snippets: number };
  nextBestActions: string[];
};

const HF_ROUTER_BASE_URL = "https://router.huggingface.co/v1";
const STANDARD_CONTEXT_LIMIT = 32_000;
const LONG_CONTEXT_LIMIT = 262_144;

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

function classifyMode(task: string): { mode: AssistDecisionMode; reason: string; confidence: number } {
  const lower = task.toLowerCase();
  if (/\b(error|bug|fix|failing|crash|exception|trace|stack)\b/.test(lower)) {
    return { mode: "debug", reason: "Task appears defect-oriented.", confidence: 0.86 };
  }
  if (/\bplan|design|architecture|roadmap|spec|approach\b/.test(lower)) {
    return { mode: "plan", reason: "Task asks for planning/specification.", confidence: 0.88 };
  }
  if (/\brefactor|implement|build|create|add|ship|feature\b/.test(lower)) {
    return { mode: "generate", reason: "Task asks for implementation output.", confidence: 0.74 };
  }
  return { mode: "plan", reason: "Low confidence; fallback to planning first.", confidence: 0.49 };
}

function contextToPrompt(context?: AssistContext, attachments?: AssistAttachment[]): string {
  const parts: string[] = [];
  if (context?.activeFile) {
    parts.push(
      `Active file: ${context.activeFile.path ?? "unknown"} (${context.activeFile.language ?? "unknown"})`
    );
    if (context.activeFile.selection) parts.push(`Selection:\n${context.activeFile.selection}`);
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
    parts.push(`Attachments: ${attachments.length} image(s) included`);
  }
  return parts.join("\n\n");
}

async function callHfChat(params: {
  model: string;
  prompt: string;
  maxTokens: number;
}): Promise<string> {
  const token = getHfRouterToken();
  if (!token) {
    throw new Error(
      "HF router not configured. Set HF_ROUTER_TOKEN (or HF_TOKEN/HUGGINGFACE_TOKEN)."
    );
  }

  const r = await fetch(`${HF_ROUTER_BASE_URL}/chat/completions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({
      model: params.model,
      stream: false,
      max_tokens: params.maxTokens,
      messages: [
        {
          role: "system",
          content:
            "You are Playground AI. Be practical, concise, and execution-oriented. Return plain text suitable for a coding assistant.",
        },
        { role: "user", content: params.prompt },
      ],
    }),
  });

  if (!r.ok) {
    const msg = (await r.text().catch(() => "")) || `HF error ${r.status}`;
    throw new Error(msg);
  }
  const body = (await r.json()) as {
    choices?: Array<{ message?: { content?: string } }>;
  };
  return body.choices?.[0]?.message?.content?.trim() || "";
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

function collectInfluence(context?: AssistContext) {
  const files = new Set<string>();
  if (context?.activeFile?.path) files.add(context.activeFile.path);
  for (const file of context?.openFiles ?? []) files.add(file.path);
  for (const snippet of context?.indexedSnippets ?? []) if (snippet.path) files.add(snippet.path);
  return { files: Array.from(files).slice(0, 24), snippets: context?.indexedSnippets?.length ?? 0 };
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

export async function runAssist(req: AssistRequest): Promise<AssistResult> {
  const aggressiveAllowed = process.env.PLAYGROUND_ENABLE_AGGRESSIVE_YOLO === "1";
  const effectiveSafety: SafetyProfile =
    req.safetyProfile === "aggressive" && !aggressiveAllowed ? "standard" : req.safetyProfile ?? "standard";
  const requested = req.mode === "yolo" ? "yolo" : req.mode;
  const initialDecision =
    requested === "auto"
      ? classifyMode(req.task)
      : ({
          mode:
            requested === "generate" || requested === "debug" || requested === "plan" || requested === "yolo"
              ? requested
              : "plan",
          reason: `Mode explicitly requested: ${requested}`,
          confidence: 0.99,
        } as const);

  const decision =
    req.mode === "auto" && initialDecision.confidence < 0.65
      ? { mode: "plan" as const, reason: "Auto low confidence fallback to plan", confidence: initialDecision.confidence }
      : initialDecision;

  const budget = {
    maxTokens: req.contextBudget?.maxTokens ?? 16_384,
    strategy: req.contextBudget?.strategy ?? ("hybrid" as const),
  };
  const budgetedContext = trimContextByBudget(req.context, budget.maxTokens, budget.strategy);
  const plan = decision.mode === "plan" || decision.mode === "yolo" ? buildPlan(req.task, budgetedContext) : null;

  const longContextRequested = budget.maxTokens > STANDARD_CONTEXT_LIMIT;
  const longContextEnabled = process.env.PLAYGROUND_ENABLE_LONG_CONTEXT === "1";
  const defaultModel = req.model || "Qwen/Qwen3-4B-Instruct-2507:nscale";
  const longContextModel = process.env.PLAYGROUND_LONG_CONTEXT_MODEL || defaultModel;
  const model = longContextRequested && longContextEnabled ? longContextModel : defaultModel;

  const logs: string[] = [];
  logs.push(`decision=${decision.mode} confidence=${decision.confidence.toFixed(2)}`);
  logs.push(`contextBudget=${budget.maxTokens}/${budget.strategy}`);
  if (longContextRequested && !longContextEnabled) {
    logs.push("long-context model unavailable; using summarized/truncated context fallback");
  }

  let final = "";
  if (decision.mode === "plan") {
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
    const prompt = [
      `Mode: ${decision.mode}`,
      `Task: ${req.task}`,
      req.workflowIntentId ? `Workflow intent id: ${req.workflowIntentId}` : "",
      `Safety profile: ${effectiveSafety}`,
      "",
      contextToPrompt(budgetedContext, req.attachments),
      "",
      decision.mode === "debug"
        ? "Return: root cause hypothesis, fix diff strategy, and validation checklist."
        : decision.mode === "yolo"
          ? "Return: direct implementation guidance with concrete file edits and command sequence."
          : "Return: production-ready implementation guidance with concise rationale.",
    ]
      .filter(Boolean)
      .join("\n");

    final = await callHfChat({
      model,
      prompt,
      maxTokens: Math.max(128, Math.min(req.max_tokens ?? 512, LONG_CONTEXT_LIMIT)),
    });
  }

  const commands =
    decision.mode === "yolo"
      ? ["npm run typecheck", "npm run test -- --runInBand"]
      : decision.mode === "debug"
        ? ["npm run test -- --runInBand"]
        : [];
  const risk = inferRisk(decision.mode, req.task, commands);
  const influence = collectInfluence(budgetedContext);
  const confidence = Math.max(0.05, Math.min(0.99, decision.confidence));
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
    plan,
    edits: [],
    commands,
    final,
    logs,
    modelUsed: model,
    confidence,
    risk,
    influence,
    nextBestActions,
  };
}

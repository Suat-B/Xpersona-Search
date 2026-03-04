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

type StructuredAssistOutput = {
  final: string;
  edits: Array<{ path: string; patch: string; rationale?: string }>;
  commands: string[];
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
  if (/\b(what model|which model|who are you|what are you)\b/.test(lower)) {
    return { mode: "generate", reason: "Task is conversational/identity and should answer directly.", confidence: 0.82 };
  }
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
  onToken?: (token: string) => void | Promise<void>;
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
      stream: true,
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

  const contentType = r.headers.get("content-type") || "";
  if (contentType.includes("text/event-stream")) {
    const reader = r.body?.getReader();
    if (!reader) return "";

    const decoder = new TextDecoder();
    let buffer = "";
    let out = "";
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
      const { done, value } = await reader.read();
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

function extractJsonObjectCandidate(text: string): string | null {
  const trimmed = text.trim();
  if (!trimmed) return null;
  if (trimmed.startsWith("{") && trimmed.endsWith("}")) return trimmed;

  const fenced = trimmed.match(/```json\s*([\s\S]*?)```/i) || trimmed.match(/```\s*([\s\S]*?)```/i);
  if (fenced?.[1]) {
    const block = fenced[1].trim();
    if (block.startsWith("{") && block.endsWith("}")) return block;
  }

  const start = trimmed.indexOf("{");
  const end = trimmed.lastIndexOf("}");
  if (start >= 0 && end > start) {
    return trimmed.slice(start, end + 1);
  }
  return null;
}

function parseStructuredAssistResponse(raw: string): StructuredAssistOutput | null {
  const candidate = extractJsonObjectCandidate(raw);
  if (!candidate) return null;

  try {
    const parsed = JSON.parse(candidate) as {
      final?: unknown;
      edits?: unknown;
      commands?: unknown;
    };

    const final =
      typeof parsed.final === "string" && parsed.final.trim()
        ? parsed.final.trim()
        : typeof raw === "string"
          ? raw.trim()
          : "";

    const edits = Array.isArray(parsed.edits)
      ? parsed.edits
          .filter((e): e is { path: string; patch: string; rationale?: string } => {
            return (
              !!e &&
              typeof e === "object" &&
              typeof (e as { path?: unknown }).path === "string" &&
              typeof (e as { patch?: unknown }).patch === "string"
            );
          })
          .map((e) => ({
            path: e.path.trim(),
            patch: e.patch.trim(),
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

    return { final, edits, commands };
  } catch {
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
  ];
  for (const rx of patterns) {
    const m = task.match(rx);
    if (m?.[1]) {
      const normalized = normalizeRelativePath(m[1]);
      if (normalized) return normalized;
    }
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

function extractFinalFromJsonLike(raw: string): string | null {
  const m = raw.match(/"final"\s*:\s*"([\s\S]*?)"/i);
  if (!m?.[1]) return null;
  try {
    return JSON.parse(`"${m[1].replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`);
  } catch {
    return m[1]
      .replace(/\\n/g, "\n")
      .replace(/\\"/g, '"')
      .trim();
  }
}

function inferStructuredFallback(raw: string, task: string): StructuredAssistOutput | null {
  const blocks = extractFencedCodeBlocks(raw);
  if (!blocks.length) return null;

  const taskPath = inferPathFromTask(task);
  const edits: Array<{ path: string; patch: string; rationale?: string }> = [];

  for (const block of blocks.slice(0, 4)) {
    const path = taskPath || inferPathFromCode(block);
    if (!path) continue;
    edits.push({
      path,
      patch: buildAddOrReplacePatch(path, block),
      rationale: "Inferred file creation from fenced code block output.",
    });
  }

  if (!edits.length) return null;
  return {
    final: raw.trim(),
    edits,
    commands: [],
  };
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

function hasExecutionIntent(task: string): boolean {
  return /\b(create|make|add|build|implement|refactor|fix|debug|run|test|lint|typecheck|command|file|patch|edit|ship)\b/i.test(task);
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
  let edits: Array<{ path: string; patch: string; rationale?: string }> = [];
  let modelCommands: string[] = [];
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
    if (hooks?.onStatus) await hooks.onStatus("Thinking...");
    const prompt = [
      `Mode: ${decision.mode}`,
      `Task: ${req.task}`,
      req.workflowIntentId ? `Workflow intent id: ${req.workflowIntentId}` : "",
      `Safety profile: ${effectiveSafety}`,
      `Model: ${model}`,
      "",
      contextToPrompt(budgetedContext, req.attachments),
      "",
      decision.mode === "debug"
        ? "Focus on root cause, minimal safe fix, and verification."
        : decision.mode === "yolo"
          ? "Focus on direct implementation with actionable edits and commands."
          : "Focus on production-ready implementation guidance with concise rationale.",
      "",
      'Return STRICT JSON only with this shape: {"final":"string","edits":[{"path":"relative/path","patch":"unified diff patch","rationale":"optional"}],"commands":["safe command"]}.',
      "Rules: keep edits empty when not confident; commands must be safe test/build/lint/typecheck commands; never include markdown fences.",
    ]
      .filter(Boolean)
      .join("\n");

    const raw = await callHfChat({
      model,
      prompt,
      maxTokens: Math.max(128, Math.min(req.max_tokens ?? 512, LONG_CONTEXT_LIMIT)),
      onToken: hooks?.onToken,
    });
    const structured = parseStructuredAssistResponse(raw) ?? inferStructuredFallback(raw, req.task);
    if (structured) {
      final = structured.final;
      edits = structured.edits;
      modelCommands = structured.commands;
    } else {
      final = extractFinalFromJsonLike(raw) || raw;
      logs.push("structured_output=parse_failed; using raw model text");
    }
  }

  const fallbackCommands =
    hasExecutionIntent(req.task)
      ? decision.mode === "yolo"
        ? ["npm run typecheck", "npm run test -- --runInBand"]
        : decision.mode === "debug"
          ? ["npm run test -- --runInBand"]
          : []
      : [];
  const commands = Array.from(new Set([...modelCommands, ...(modelCommands.length > 0 ? [] : fallbackCommands)]));
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
    edits,
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

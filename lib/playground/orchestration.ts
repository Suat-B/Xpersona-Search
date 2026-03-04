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
const DEFAULT_PLAYGROUND_MODEL = "Qwen/Qwen3-4B-Instruct-2507:nscale";
const HF_REQUEST_TIMEOUT_MS = Number(process.env.PLAYGROUND_HF_REQUEST_TIMEOUT_MS || 90_000);
const HF_STREAM_IDLE_TIMEOUT_MS = Number(process.env.PLAYGROUND_HF_STREAM_IDLE_TIMEOUT_MS || 45_000);
const STREAM_RAW_MODEL_TOKENS = process.env.PLAYGROUND_STREAM_MODEL_TOKENS === "1";

function resolveModelAlias(model: string | undefined, fallbackModel: string): string {
  const trimmed = (model || "").trim();
  if (!trimmed) return fallbackModel;
  const normalized = trimmed.toLowerCase();
  if (normalized === "playground" || normalized === "playground ai" || normalized === "playground 1") {
    return fallbackModel;
  }
  return trimmed;
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

function hasCodeTaskSignals(task: string): boolean {
  return /\b(code|file|function|class|bug|error|fix|refactor|implement|build|test|lint|typecheck|stack trace|exception|module|api|endpoint|sql|schema|patch|edit|debug|feature)\b/i.test(task);
}

function classifyMode(task: string): { mode: AssistDecisionMode; reason: string; confidence: number } {
  const lower = task.toLowerCase().trim();
  const questionLike =
    /\?$/.test(lower) ||
    /^(what|why|how|when|where|who|which|can|could|would|should|is|are|do|does|did)\b/.test(lower) ||
    /\b(explain|define|tell me)\b/.test(lower);

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
              "You are Playground AI. Be practical, concise, and execution-oriented. Return plain text suitable for a coding assistant.",
          },
          { role: "user", content: params.prompt },
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

    return { final, edits, commands };
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
  const asUnescaped = trimmed.includes("\\n") && !trimmed.includes("\n")
    ? trimmed
        .replace(/\\r/g, "")
        .replace(/\\n/g, "\n")
        .replace(/\\t/g, "\t")
    : trimmed;
  return asUnescaped;
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

function inferStructuredFallback(raw: string, task: string): StructuredAssistOutput | null {
  const taskPath = inferPathFromTask(task);
  const edits: Array<{ path: string; patch: string; rationale?: string }> = [];
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

function hasExplicitCommandRunIntent(task: string): boolean {
  return /\b(run|execute|terminal|shell|command|test|tests|lint|typecheck|build|compile|install|npm|pnpm|yarn|pytest|jest|vitest|cargo|go test|mvn|gradle)\b/i.test(task);
}

function hasCodeEditIntent(task: string): boolean {
  return /\b(create|make|add|implement|write|modify|edit|patch|refactor|fix|ship|file)\b/i.test(task);
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

  const shouldFallbackToPlan =
    req.mode === "auto" &&
    initialDecision.confidence < 0.65 &&
    (initialDecision.mode === "plan" || initialDecision.mode === "debug" || hasCodeTaskSignals(req.task));
  const decision = shouldFallbackToPlan
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
  const fallbackModel = (process.env.PLAYGROUND_MODEL || DEFAULT_PLAYGROUND_MODEL).trim() || DEFAULT_PLAYGROUND_MODEL;
  const requestedModel = resolveModelAlias(req.model, fallbackModel);
  const requestedLongContextModel = resolveModelAlias(process.env.PLAYGROUND_LONG_CONTEXT_MODEL, fallbackModel);
  const model = longContextRequested && longContextEnabled ? requestedLongContextModel : requestedModel;
  let modelUsed = model;

  const logs: string[] = [];
  logs.push(`decision=${decision.mode} confidence=${decision.confidence.toFixed(2)}`);
  logs.push(`contextBudget=${budget.maxTokens}/${budget.strategy}`);
  if (longContextRequested && !longContextEnabled) {
    logs.push("long-context model unavailable; using summarized/truncated context fallback");
  }

  let final = "";
  let edits: Array<{ path: string; patch: string; rationale?: string }> = [];
  let modelCommands: string[] = [];
  const explicitCommandRunIntent = hasExplicitCommandRunIntent(req.task);
  const codeEditIntent = hasCodeEditIntent(req.task);
  const reasoningPreference = extractReasoningPreference(req.workflowIntentId);
  const reasoningInstruction =
    reasoningPreference === "low"
      ? "Reasoning preference: low. Optimize for speed and concise output."
      : reasoningPreference === "high"
        ? "Reasoning preference: high. Reason carefully and validate assumptions before proposing edits."
        : reasoningPreference === "max"
          ? "Reasoning preference: max. Be deliberate, safety-first, and include explicit verification steps."
          : reasoningPreference === "medium"
            ? "Reasoning preference: medium. Use balanced reasoning with concise steps."
            : null;
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
      reasoningInstruction,
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
      codeEditIntent
        ? "Rules: include concrete code edits (non-empty edits array) when the user asks to create/modify code; do not return placeholder text."
        : "Rules: keep edits empty when not confident.",
      explicitCommandRunIntent
        ? "Rules: commands may be included only if they are necessary, safe, and directly requested."
        : "Rules: leave commands empty unless the user explicitly asked you to run/test/build/lint.",
      "Rules: never include markdown fences.",
    ]
      .filter(Boolean)
      .join("\n");

    let raw = "";
    try {
        raw = await callHfChat({
          model,
          prompt,
          maxTokens: Math.max(128, Math.min(req.max_tokens ?? 512, LONG_CONTEXT_LIMIT)),
          onToken: STREAM_RAW_MODEL_TOKENS ? hooks?.onToken : undefined,
        });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (model !== fallbackModel && isLikelyInvalidModelError(message)) {
        logs.push(`model_fallback from "${model}" to "${fallbackModel}"`);
        if (hooks?.onStatus) {
          await hooks.onStatus(`Model "${model}" unavailable. Falling back to "${fallbackModel}".`);
        }
        modelUsed = fallbackModel;
        raw = await callHfChat({
          model: fallbackModel,
          prompt,
          maxTokens: Math.max(128, Math.min(req.max_tokens ?? 512, LONG_CONTEXT_LIMIT)),
          onToken: STREAM_RAW_MODEL_TOKENS ? hooks?.onToken : undefined,
        });
      } else {
        throw error;
      }
    }
    const structured = parseStructuredAssistResponse(raw) ?? inferStructuredFallback(raw, req.task);
    if (structured) {
      final = normalizeModelText(structured.final);
      edits = structured.edits;
      modelCommands = structured.commands;
    } else {
      final = normalizeModelText(extractFinalFromJsonLike(raw) || raw);
      logs.push("structured_output=parse_failed; using raw model text");
    }
    if (codeEditIntent && edits.length === 0) {
      const recovered = inferStructuredFallback(final || raw, req.task);
      if (recovered?.edits.length) {
        edits = recovered.edits;
        if (!final.trim() && recovered.final.trim()) final = recovered.final;
        logs.push("structured_output=recovered_from_fallback_code_inference");
      }
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
  let commands = Array.from(new Set([...modelCommands, ...(modelCommands.length > 0 ? [] : fallbackCommands)]));
  if (!explicitCommandRunIntent && commands.length > 0 && edits.length === 0 && decision.mode !== "yolo") {
    logs.push("dropped_command_only_actions_without_explicit_run_intent");
    commands = [];
  }
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
    modelUsed,
    confidence,
    risk,
    influence,
    nextBestActions,
  };
}

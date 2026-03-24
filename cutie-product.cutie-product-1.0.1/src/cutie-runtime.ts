import type { RequestAuth } from "@xpersona/vscode-core";
import {
  appendDeadEndMemory,
  batchNeedsMoreAutonomy,
  buildDeadEndSignature,
  deadEndAlreadySeen,
  describeAutonomyGap,
  getPreferredStrategyPhase,
  getProgressConfidence,
  getCurrentStrategyLabel,
  getStallLabel,
  hasCodeChangeCompletionProof,
  hasCompletedTargetInspection,
  hasSuccessfulWorkspaceMutation,
  isMeaningfulProgressReceipt as isMeaningfulProgressReceiptForRun,
  isVerificationReceipt,
  isVerificationToolCall,
  requiresCodeChangeMutation,
  requiresCodeChangeVerification,
  resolveRetryStrategy,
  getStallLevel,
} from "./cutie-autonomy-controller";
import {
  analyzeTargetContent,
  buildCodeTaskFrame,
  buildEntityPresenceProbeCommand,
  buildTargetCandidates,
  inferNoOpConclusionFromCommandResult,
  mapRetryStrategyToRepairTactic,
  refineTaskFrameFromTargetContent,
  summarizeTaskFrame,
} from "./cutie-code-intelligence";
import { realizeEditPlan, synthesizeEditPlan } from "./cutie-edit-synthesis";
import {
  buildToolCallKey,
  CUTIE_CONTEXT_RECEIPT_WINDOW,
  CUTIE_MAX_DESKTOP_MUTATIONS,
  CUTIE_MAX_IDENTICAL_CALLS,
  CUTIE_MAX_STEPS,
  CUTIE_MAX_TOOLS_PER_BATCH,
  CUTIE_MAX_WALL_CLOCK_MS,
  CUTIE_MAX_WORKSPACE_MUTATIONS,
  isCutieBatchMutationTool,
  isDesktopMutationTool,
  isWorkspaceMutationTool,
  normalizeWorkspaceRelativePath,
  nowIso,
  randomId,
} from "./cutie-policy";
import { humanizeCutieHostHttpError } from "./cutie-host-http-error";
import { CutieModelAdapter } from "./cutie-model-adapter";
import { resolveProtocolMode } from "./cutie-model-capabilities";
import { buildComposedCutieSystemPrompt } from "./cutie-operating-prompt";
import {
  DIRECT_MUTATION_REPAIR_CAP,
  UNLIMITED_DIRECT_MUTATION_REPAIR_CAP,
  extractVisibleAssistantText,
  looksLikeCutieToolArtifactText,
  resolveNativeNextToolHints,
  selectCodeChangeAutonomyMode,
} from "./cutie-native-autonomy";
import { CutieSessionStore } from "./cutie-session-store";
import { CutieToolRegistry } from "./cutie-tool-registry";
import type {
  CutieAutonomyMode,
  CutieBlockerCategory,
  CutieEscalationState,
  CutieGoalClassificationSource,
  CutieMutationCoercionMode,
  CutieRepairTactic,
  CutieModelMessage,
  CutieMentionSuggestion,
  CutieProgressConfidence,
  CutieProtocolMode,
  CutiePromptSource,
  CutieProtocolToolDefinition,
  CutieRetryStrategy,
  CutieRunObjective,
  CutieRunState,
  CutieSessionRecord,
  CutieStallLevel,
  CutieStrategyPhase,
  CutieStructuredFinal,
  CutieStructuredResponse,
  CutieTaskGoal,
  CutieTargetAcquisitionPhase,
  CutieTargetCandidate,
  CutieTargetConfidence,
  CutieTargetSource,
  CutieTaskFrame,
  CutieToolCall,
  CutieToolName,
  CutieToolReceipt,
  CutieToolResult,
  CutieRuntimeCallbacks,
} from "./types";

type RuntimeContext = {
  workspaceHash: string;
  extensionVersion: string;
  workspaceRootPath?: string | null;
  activeFile?: Record<string, unknown>;
  openFiles?: Array<Record<string, unknown>>;
  diagnostics?: Array<Record<string, unknown>>;
  desktop?: Record<string, unknown>;
  latestSnapshot?: Record<string, unknown> | null;
  mentionedPaths?: string[];
  mentionedWindows?: string[];
  gitStatusSummary?: string;
  /** Injected once on the first planning turn for workspace_investigation when preflight is enabled. */
  investigationPreflightSummary?: string;
  externalOperatingPrompt?: string;
  promptSource?: CutiePromptSource;
  promptMarkdownPath?: string;
  promptLoaded?: boolean;
  promptLoadError?: string;
  promptLastLoadedAt?: string;
  cutieDynamicSettings?: {
    maxToolsPerBatch: number;
    contextReceiptWindow: number;
    investigationPreflight: boolean;
    objectiveBasedRuns?: boolean;
    objectiveBasedInvestigation?: boolean;
    maxToolSteps?: number;
    maxWorkspaceMutations?: number;
    /** When true, local step/mutation/wall-clock caps are relaxed; stop on user cancel or API errors. */
    unlimitedAutonomy?: boolean;
  };
};

type RuntimeFileState = {
  path: string;
  content: string;
  revisionId: string;
  full: boolean;
  updatedAtStep: number;
};

type PreferredTargetResolution = {
  path: string | null;
  confidence: CutieTargetConfidence;
  source: CutieTargetSource;
  requiresTrustedCurrentFileTarget: boolean;
  blockerMessage?: string;
};

function normalizeRuntimeFilePath(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const normalized = normalizeWorkspaceRelativePath(value);
  return normalized || null;
}

function parseReadRange(value: unknown): { start: number; end: number } | null {
  const raw = String(value || "").trim();
  const match = /^(\d+)-(\d+)$/.exec(raw);
  if (!match) return null;
  const start = Number(match[1]);
  const end = Number(match[2]);
  if (!Number.isInteger(start) || !Number.isInteger(end) || start < 1 || end < start) return null;
  return { start, end };
}

function isFullReadReceiptData(data: Record<string, unknown>): boolean {
  const range = parseReadRange(data.range);
  const lineCount = Number(data.lineCount);
  if (!range || !Number.isFinite(lineCount) || lineCount < 0) return false;
  return range.start === 1 && range.end >= Math.max(1, lineCount);
}

function getMostRecentRuntimeFileState(latestFileStates?: Map<string, RuntimeFileState> | null): RuntimeFileState | null {
  if (!latestFileStates?.size) return null;
  return [...latestFileStates.values()].sort((a, b) => b.updatedAtStep - a.updatedAtStep)[0] ?? null;
}

const MAX_OBJECTIVES_DECOMPOSE = 12;
const DEFAULT_OBJECTIVE_FINAL_REPAIR_CAP = 24;
const UNLIMITED_OBJECTIVE_FINAL_REPAIR_CAP = 256;
const UNLIMITED_RUN_BUDGET_SENTINEL = 999_999;

function resolveRunBudgetFromContext(ctx: RuntimeContext): { maxSteps: number; maxWorkspaceMutations: number } {
  const s = ctx.cutieDynamicSettings;
  if (s?.unlimitedAutonomy) {
    return { maxSteps: UNLIMITED_RUN_BUDGET_SENTINEL, maxWorkspaceMutations: UNLIMITED_RUN_BUDGET_SENTINEL };
  }
  const maxSteps = Math.max(8, Math.min(128, s?.maxToolSteps ?? CUTIE_MAX_STEPS));
  const maxWorkspaceMutations = Math.max(2, Math.min(64, s?.maxWorkspaceMutations ?? CUTIE_MAX_WORKSPACE_MUTATIONS));
  return { maxSteps, maxWorkspaceMutations };
}

function shouldUseObjectiveMode(
  goal: CutieTaskGoal,
  prompt: string,
  mentionContext: { mentionedPaths: string[]; mentionedWindows: string[] },
  context?: RuntimeContext,
  autonomyMode?: CutieAutonomyMode
): boolean {
  const settings = context?.cutieDynamicSettings;
  if (!hasConcreteTaskSignals(prompt, mentionContext)) return false;
  if (goal === "code_change") {
    if (autonomyMode) return autonomyMode === "objective";
    return (
      selectCodeChangeAutonomyMode({
        goal,
        prompt,
        mentionedPaths: mentionContext.mentionedPaths,
        activeFilePath: typeof context?.activeFile?.path === "string" ? String(context.activeFile.path) : null,
        openFilePaths: Array.isArray(context?.openFiles)
          ? context.openFiles
              .map((entry) => {
                const row = asRecord(entry);
                return typeof row.path === "string" ? String(row.path) : null;
              })
              .filter((value): value is string => Boolean(value))
          : [],
        objectiveBasedRuns: settings?.objectiveBasedRuns,
      }) === "objective"
    );
  }
  if (goal === "workspace_investigation" && settings?.objectiveBasedInvestigation) return true;
  return false;
}

function countTrustedTargetCandidates(targetCandidates?: CutieTargetCandidate[]): number {
  return Array.isArray(targetCandidates)
    ? targetCandidates.filter((candidate) => candidate?.confidence === "trusted" && candidate?.path).length
    : 0;
}

export function promoteTrustedSingleTarget(input: {
  prompt: string;
  mentionContext: { mentionedPaths: string[]; mentionedWindows: string[] };
  preferredTargetPath?: string | null;
  targetCandidates?: CutieTargetCandidate[];
}): { path: string; confidence: CutieTargetConfidence; source: CutieTargetSource } | null {
  if (normalizeWorkspaceRelativePath(input.preferredTargetPath || null)) return null;
  if (input.mentionContext.mentionedPaths.length > 1 || wantsBroadWorkspaceDiscovery(input.prompt)) return null;
  const trusted = (input.targetCandidates || []).filter(
    (candidate) => candidate?.confidence === "trusted" && typeof candidate.path === "string" && candidate.path.trim()
  );
  if (trusted.length !== 1) return null;
  return {
    path: trusted[0].path,
    confidence: trusted[0].confidence,
    source: trusted[0].source,
  };
}

function taskFrameResolvesConcreteEdit(taskFrame?: CutieTaskFrame): boolean {
  if (!taskFrame) return false;
  return Boolean(taskFrame.action && taskFrame.entity && taskFrame.confidence !== "low");
}

function shouldEnableSimpleTaskFastPath(input: {
  goal: CutieTaskGoal;
  prompt: string;
  autonomyMode?: CutieAutonomyMode;
  preferredTargetPath?: string | null;
  targetCandidates?: CutieTargetCandidate[];
  taskFrame?: CutieTaskFrame;
}): boolean {
  if (input.goal !== "code_change") return false;
  if (input.autonomyMode !== "direct") return false;
  if (!String(input.preferredTargetPath || "").trim()) return false;
  if (!taskFrameResolvesConcreteEdit(input.taskFrame)) return false;
  if (countTrustedTargetCandidates(input.targetCandidates) !== 1) return false;
  if (wantsBroadWorkspaceDiscovery(input.prompt)) return false;
  return !/\b(files|modules|components|screens|routes|across|throughout|everywhere|multiple|repo-wide|project-wide)\b/i.test(
    stripMentionTokens(input.prompt)
  );
}

function parseFinalObjectiveOutcomes(record: Record<string, unknown>): CutieStructuredFinal["objectives"] | undefined {
  const raw = record.objectives;
  if (!Array.isArray(raw)) return undefined;
  const out: NonNullable<CutieStructuredFinal["objectives"]> = [];
  for (const item of raw) {
    const row = asRecord(item);
    const id = typeof row.id === "string" ? row.id.trim() : "";
    const status = row.status === "done" || row.status === "blocked" ? row.status : null;
    if (!id || !status) continue;
    out.push({
      id,
      status,
      ...(typeof row.note === "string" && row.note.trim() ? { note: row.note.trim().slice(0, 500) } : {}),
    });
  }
  return out.length ? out : undefined;
}

function validateObjectiveFinalAgainstRun(
  structured: { type: "final"; final: string; objectives?: CutieStructuredFinal["objectives"] },
  run: CutieRunState
): { ok: true; merged: CutieRunObjective[] } | { ok: false; repairMessage: string } {
  const phase = run.objectivesPhase;
  const list = run.objectives;
  if (phase !== "active" || !list?.length) {
    return { ok: true, merged: list || [] };
  }

  if (!structured.final.trim()) {
    return {
      ok: false,
      repairMessage:
        "Repair instruction: final text is empty. Provide a concise user-facing summary in the final field together with the objectives array.",
    };
  }

  const outcomes = structured.objectives;
  if (!outcomes?.length) {
    const ids = list.map((o) => o.id).join(", ");
    return {
      ok: false,
      repairMessage: [
        "Repair instruction:",
        "This run uses task objectives.",
        "Return a structured final response with a user-facing summary and one outcome per objective id.",
        `Objective ids you must include exactly once each: ${ids}.`,
      ].join(" "),
    };
  }

  const idSet = new Set(list.map((o) => o.id));
  const seen = new Set<string>();
  for (const row of outcomes) {
    if (seen.has(row.id)) {
      return {
        ok: false,
        repairMessage: `Repair instruction: duplicate objective id "${row.id}" in objectives. Return one entry per id.`,
      };
    }
    seen.add(row.id);
    if (!idSet.has(row.id)) {
      return {
        ok: false,
        repairMessage: `Repair instruction: unknown objective id "${row.id}". Only use ids from taskObjectives in context.`,
      };
    }
  }

  if (seen.size !== idSet.size) {
    const missing = list.filter((o) => !seen.has(o.id)).map((o) => `${o.id}: ${o.text}`);
    return {
      ok: false,
      repairMessage: [
        "Repair instruction:",
        "Not every objective has a status. Still pending:",
        ...missing.map((m) => `- ${m}`),
        "Return the same final JSON shape with objectives covering ALL ids (done or blocked).",
      ].join("\n"),
    };
  }

  const merged: CutieRunObjective[] = list.map((o) => {
    const hit = outcomes.find((r) => r.id === o.id);
    if (!hit) return o;
    return {
      ...o,
      status: hit.status,
      ...(hit.note ? { note: hit.note } : {}),
    };
  });

  const pending = merged.filter((o) => o.status === "pending");
  if (pending.length) {
    return {
      ok: false,
      repairMessage: [
        "Repair instruction:",
        "Every objective must be marked done or blocked, not left implicit.",
        "Pending:",
        ...pending.map((o) => `- ${o.id}: ${o.text}`),
      ].join("\n"),
    };
  }

  return { ok: true, merged };
}

function tryParseObjectivesDecomposition(raw: string): Array<{ id: string; text: string }> | null {
  const parsed =
    extractJsonObject(raw) ||
    (() => {
      for (const chunk of extractBalancedJsonObjects(raw)) {
        try {
          return JSON.parse(chunk) as unknown;
        } catch {
          continue;
        }
      }
      return null;
    })();
  if (!parsed || typeof parsed !== "object") return null;
  const record = asRecord(parsed);
  if (record.type !== "objectives") return null;
  const arr = Array.isArray(record.objectives) ? record.objectives : null;
  if (!arr?.length) return null;
  const out: Array<{ id: string; text: string }> = [];
  const seen = new Set<string>();
  for (const item of arr) {
    const row = asRecord(item);
    const id = typeof row.id === "string" ? row.id.trim() : "";
    const text = typeof row.text === "string" ? row.text.trim() : "";
    if (!id || !text || seen.has(id)) continue;
    seen.add(id);
    out.push({ id, text: text.slice(0, 800) });
    if (out.length >= MAX_OBJECTIVES_DECOMPOSE) break;
  }
  return out.length > 0 ? out : null;
}

function normalizeDecomposedObjectives(rows: Array<{ id: string; text: string }>, fallbackText: string): CutieRunObjective[] {
  if (!rows.length) {
    return [{ id: "1", text: trimToLimit(fallbackText, 1200), status: "pending" }];
  }
  return rows.map((r) => ({ id: r.id, text: r.text, status: "pending" as const }));
}

function buildObjectiveProtocolSystemMessage(objectives: CutieRunObjective[]): string {
  return [
    "Task objectives (strict): This run is tracked against a checklist in live context under taskObjectives.",
    "Do not finish until every objective is done or blocked.",
    "When you are truly done, return a final response with a user-facing summary and one outcome per objective id.",
    "Each objective id must appear exactly once. Status must be done or blocked.",
    "Until then, keep taking native tool actions as needed.",
    "Current objectives:",
    stableJson(objectives.map((o) => ({ id: o.id, text: o.text, status: o.status }))),
  ].join("\n");
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" ? (value as Record<string, unknown>) : {};
}

function trimToLimit(value: unknown, limit = 12_000): string {
  const text = String(value ?? "");
  return text.length <= limit ? text : `${text.slice(0, limit)}\n...[truncated]`;
}

function stableJson(value: unknown): string {
  return JSON.stringify(value, null, 2);
}

function stripCodeFence(raw: string): string {
  const trimmed = raw.trim();
  const fenceMatch = /^```(?:json)?\s*([\s\S]*?)\s*```$/i.exec(trimmed);
  return fenceMatch ? fenceMatch[1].trim() : trimmed;
}

function extractJsonObject(raw: string): unknown | null {
  const normalized = stripCodeFence(raw);
  if (!normalized.startsWith("{")) return null;
  try {
    return JSON.parse(normalized) as unknown;
  } catch {
    return null;
  }
}

function extractBalancedJsonObjects(raw: string): string[] {
  const source = stripCodeFence(raw);
  const candidates: string[] = [];
  let start = -1;
  let depth = 0;
  let inString = false;
  let escapeNext = false;

  for (let index = 0; index < source.length; index += 1) {
    const char = source[index];
    if (escapeNext) {
      escapeNext = false;
      continue;
    }
    if (char === "\\") {
      escapeNext = true;
      continue;
    }
    if (char === '"') {
      inString = !inString;
      continue;
    }
    if (inString) continue;
    if (char === "{") {
      if (depth === 0) start = index;
      depth += 1;
      continue;
    }
    if (char === "}" && depth > 0) {
      depth -= 1;
      if (depth === 0 && start >= 0) {
        candidates.push(source.slice(start, index + 1));
        start = -1;
      }
    }
  }

  return candidates;
}

function extractBalancedObjectFromIndex(raw: string, startIndex: number): string | null {
  const source = stripCodeFence(raw);
  const start = source.indexOf("{", Math.max(0, startIndex));
  if (start < 0) return null;
  let depth = 0;
  let inString = false;
  let escapeNext = false;

  for (let index = start; index < source.length; index += 1) {
    const char = source[index];
    if (escapeNext) {
      escapeNext = false;
      continue;
    }
    if (char === "\\") {
      escapeNext = true;
      continue;
    }
    if (char === '"') {
      inString = !inString;
      continue;
    }
    if (inString) continue;
    if (char === "{") {
      depth += 1;
      continue;
    }
    if (char === "}" && depth > 0) {
      depth -= 1;
      if (depth === 0) {
        return source.slice(start, index + 1);
      }
    }
  }

  return null;
}

type NormalizedToolPayload = {
  name: CutieToolName;
  arguments: Record<string, unknown>;
  summary?: string;
};

function formatStructuredResponse(response: CutieStructuredResponse): string {
  return JSON.stringify(response);
}

function validateToolCallBatchOrder(payloads: NormalizedToolPayload[], maxBatch: number): NormalizedToolPayload[] {
  const out: NormalizedToolPayload[] = [];
  let sawMutation = false;
  for (const spec of payloads) {
    if (out.length >= maxBatch) break;
    if (isCutieBatchMutationTool(spec.name)) {
      if (sawMutation) break;
      sawMutation = true;
      out.push(spec);
      break;
    }
    out.push(spec);
  }
  return out;
}

function structuredToNormalizedPayloads(structured: CutieStructuredResponse): NormalizedToolPayload[] {
  if (structured.type === "final") return [];
  if (structured.type === "tool_call") {
    return [
      {
        name: structured.tool_call.name,
        arguments: structured.tool_call.arguments,
        ...(structured.tool_call.summary ? { summary: structured.tool_call.summary } : {}),
      },
    ];
  }
  return structured.tool_calls.map((t) => ({
    name: t.name,
    arguments: t.arguments,
    ...(t.summary ? { summary: t.summary } : {}),
  }));
}

function buildAssistantStructuredFromBatch(calls: CutieToolCall[]): CutieStructuredResponse {
  if (calls.length === 1) {
    return {
      type: "tool_call",
      tool_call: {
        name: calls[0].name,
        arguments: calls[0].arguments,
        ...(calls[0].summary ? { summary: calls[0].summary } : {}),
      },
    };
  }
  return {
    type: "tool_calls",
    tool_calls: calls.map((c) => ({
      name: c.name,
      arguments: c.arguments,
      ...(c.summary ? { summary: c.summary } : {}),
    })),
  };
}

function batchHasProgressMutationTool(calls: Array<{ name: CutieToolName }>): boolean {
  return calls.some((t) => isCutieBatchMutationTool(t.name));
}

function shouldBlockObserveOnlyBatchAfterInspection(goal: CutieTaskGoal, run: CutieRunState, batch: CutieToolCall[]): boolean {
  if (goal !== "code_change") return false;
  if (run.autonomyMode === "objective") return false;
  if (!batch.length) return requiresCodeChangeMutation(run) || requiresCodeChangeVerification(run);
  const autonomyGap = batchNeedsMoreAutonomy({ goal, run, batch });
  if (autonomyGap === "missing_mutation" || autonomyGap === "missing_verification") return true;
  if (!hasCompletedTool(run, "read_file")) return false;
  if (batchHasProgressMutationTool(batch)) return false;
  const last = batch[batch.length - 1];
  return isNonProgressToolAfterInspection(goal, run, last.name);
}

function shouldSurfaceStreamingAssistantText(accumulated: string, goal: CutieTaskGoal): boolean {
  if (goal === "conversation") {
    const trimmed = accumulated.trimStart();
    if (!trimmed) return false;
    if (trimmed.startsWith("{") || trimmed.startsWith("```")) return false;
    if (looksLikeCutieToolArtifactText(trimmed)) return false;
    return true;
  }
  if (goal === "workspace_investigation" || goal === "code_change") {
    return extractVisibleAssistantText(accumulated).trim().length > 0;
  }
  return false;
}

function isStructuredTooling(structured: CutieStructuredResponse | null | undefined): structured is Extract<
  CutieStructuredResponse,
  { type: "tool_call" } | { type: "tool_calls" }
> {
  return structured?.type === "tool_call" || structured?.type === "tool_calls";
}

function toTranscriptMessages(session: CutieSessionRecord): CutieModelMessage[] {
  return session.messages.map((message) => ({
    role: message.role === "system" ? "system" : message.role,
    content: trimToLimit(message.content, 24_000),
  }));
}

function buildSystemPrompt(toolCatalog = ""): string {
  return [
    "You are Cutie, a careful but fast desktop-and-coding runtime inside VS Code.",
    "You can inspect the workspace, inspect desktop state, edit workspace files, run safe commands, and use desktop automation tools.",
    "Obey the user's exact intent. Do not switch from desktop intent to workspace tools, and do not switch from file intent to broad workspace discovery unless the user explicitly asks for that.",
    "If the user is only greeting you or making light conversation, answer normally without tools.",
    "If the user expresses affection together with a concrete task (edit, create, fix, desktop action, etc.), acknowledge briefly in one short warm line if you like, then proceed with tools for the task.",
    "If the user expresses affection with no other request, receive it warmly without tools.",
    "If the user only @-mentions a file and says nothing else, call read_file on that path first, then give a short summary and one concrete proposed change unless they clearly asked a non-code question.",
    "If the user only @-mentions a window without other text, pick a sensible next desktop step (for example focus_window) instead of asking them to restate the task.",
    "Prefer self-recovery: fix tool arguments, retry once with a different approach, and use write_file with full file content as a last resort before stopping—do not ask the user to save files, fix paths, or re-run Cutie unless unavoidable.",
    "read_file results may reflect unsaved editor buffer text when the file is open; trust that content and revisionId for patch_file and write_file alignment.",
    "The server provides the canonical tool schemas. Use the native structured tool interface instead of handwritten tool JSON inside assistant text.",
    "You may batch multiple read-only tools in ONE response (up to the configured max): list_files, read_file, search_workspace, get_diagnostics, git_status, git_diff, desktop_capture_screen, desktop_get_active_window, desktop_list_windows.",
    "If you need a workspace or desktop mutation (patch_file, write_file, mkdir, run_command, create_checkpoint, or any desktop_* action that changes state), emit at most ONE mutation in that same response and it MUST be the LAST tool in the batch. Do not add read-only tools after a mutation.",
    "If the user says 'this file' or a current active file is provided, prefer read_file on that path before broad discovery tools.",
    "If mentionedPaths are provided, treat them as strong user-selected targets and prefer read_file on them before broad workspace discovery.",
    "If mentionedWindows are provided, treat them as strong desktop targets when choosing window focus or other desktop actions.",
    "If mentionedWindows are provided, do not call workspace tools unless the user explicitly asks for code or file help.",
    "Do not loop on list_files or search_workspace once you already have enough information to inspect a likely target.",
    "After finding a candidate file, move to read_file, then patch_file or write_file if a change is needed.",
    "For code-change tasks, a final answer is invalid until you have both made the requested workspace change and completed a relevant verification step, unless the runtime explicitly records a blocker.",
    "When a tool result says a call was redundant or blocked, choose a different next step instead of retrying the same call.",
    "When you need tool(s), respond with ONLY minified JSON — either one tool:",
    '{"type":"tool_call","tool_call":{"name":"tool_name","arguments":{},"summary":"short reason"}}',
    "or multiple read-only tools plus optional one final mutation:",
    '{"type":"tool_calls","tool_calls":[{"name":"read_file","arguments":{"path":"x"},"summary":"why"},{"name":"search_workspace","arguments":{"query":"y"},"summary":"why"}]}',
    "When you do not need a tool, respond with plain natural language for the user. You may also optionally use:",
    '{"type":"final","final":"your final answer"}',
    "If live context JSON includes taskObjectives with objectivesPhase active, you must NOT finish until every objective is done or blocked. Then respond with ONLY minified JSON:",
    '{"type":"final","final":"summary for the user","objectives":[{"id":"1","status":"done"},{"id":"2","status":"blocked","note":"reason"}]}',
    "Include every objective id exactly once; status must be done or blocked.",
    "Respect these limits:",
    `- maximum ${CUTIE_MAX_STEPS} tool-call steps total`,
    `- maximum ${CUTIE_MAX_WORKSPACE_MUTATIONS} workspace mutations`,
    `- maximum ${CUTIE_MAX_DESKTOP_MUTATIONS} desktop mutations`,
    "- do not attempt destructive shell commands, elevation/admin flows, or password/credential automation",
    "- keep all file writes inside the open workspace",
    "- prefer inspection before mutation",
    "If desktop screenshots are available, you only receive local snapshot metadata, not image pixels. Do not claim to have visually parsed a screenshot unless the context explicitly includes extracted text.",
    "Available tools:",
    toolCatalog,
  ].join("\n");
}

function buildContextMessage(input: {
  prompt: string;
  context: RuntimeContext;
  run: CutieRunState;
}): string {
  const receiptWindow = Math.max(
    4,
    Math.min(
      32,
      input.context.cutieDynamicSettings?.contextReceiptWindow ?? CUTIE_CONTEXT_RECEIPT_WINDOW
    )
  );
  return [
    "Current task:",
    input.prompt,
    "",
    "Live runtime context:",
    stableJson({
      workspaceHash: input.context.workspaceHash,
      workspaceRootPath: input.context.workspaceRootPath || null,
      extensionVersion: input.context.extensionVersion,
      activeFile: input.context.activeFile || null,
      openFiles: input.context.openFiles || [],
      diagnostics: input.context.diagnostics || [],
      desktop: input.context.desktop || null,
      latestSnapshot: input.context.latestSnapshot || null,
      mentionedPaths: input.context.mentionedPaths || [],
      mentionedWindows: input.context.mentionedWindows || [],
      ...(input.context.gitStatusSummary ? { gitStatusShort: input.context.gitStatusSummary } : {}),
      ...(input.context.investigationPreflightSummary
        ? { investigationPreflight: input.context.investigationPreflightSummary }
        : {}),
      runLimits: {
        goal: input.run.goal,
        goalSatisfied: input.run.goalSatisfied,
        repairAttemptCount: input.run.repairAttemptCount,
        lastMeaningfulProgressAtStep: input.run.lastMeaningfulProgressAtStep ?? null,
        lastMeaningfulProgressSummary: input.run.lastMeaningfulProgressSummary || null,
        strategyPhase: input.run.strategyPhase || null,
        progressConfidence: input.run.progressConfidence || null,
        retryStrategy: input.run.retryStrategy || null,
        lastVerifiedOutcome: input.run.lastVerifiedOutcome || null,
        blockerCategory: input.run.blockerCategory || null,
        loopPreventionTrigger: input.run.loopPreventionTrigger || null,
        escalationState: input.run.escalationState,
        stepCount: input.run.stepCount,
        maxSteps: input.run.maxSteps,
        maxToolsPerPlanningResponse:
          input.context.cutieDynamicSettings?.maxToolsPerBatch ?? CUTIE_MAX_TOOLS_PER_BATCH,
        workspaceMutationCount: input.run.workspaceMutationCount,
        maxWorkspaceMutations: input.run.maxWorkspaceMutations,
        desktopMutationCount: input.run.desktopMutationCount,
        maxDesktopMutations: input.run.maxDesktopMutations,
      },
      ...(input.run.objectives?.length && input.run.objectivesPhase === "active"
        ? {
            objectivesPhase: input.run.objectivesPhase,
            taskObjectives: input.run.objectives.map((o) => ({
              id: o.id,
              text: o.text,
              status: o.status,
              ...(o.note ? { note: o.note } : {}),
            })),
          }
        : {}),
      lastToolName: input.run.lastToolName || null,
      repeatedCallCount: input.run.repeatedCallCount,
      recentReceipts: input.run.receipts.slice(-receiptWindow).map((receipt) => ({
        step: receipt.step,
        toolName: receipt.toolName,
        status: receipt.status,
        summary: receipt.summary,
        error: receipt.error || null,
      })),
    }),
  ].join("\n");
}

function buildCoreRuntimeContractPrompt(): string {
  return [
    "You are Cutie, a careful but fast desktop-and-coding runtime inside VS Code.",
    "You can inspect the workspace, inspect desktop state, edit workspace files, run safe commands, and use desktop automation tools.",
    "Obey the user's exact intent. Do not switch from desktop intent to workspace tools, and do not switch from file intent to broad workspace discovery unless the user explicitly asks for that.",
    "If the user is only greeting you or making light conversation, answer normally without tools.",
    "If the user expresses affection together with a concrete task (edit, create, fix, desktop action, etc.), acknowledge briefly in one short warm line if you like, then proceed with tools for the task.",
    "If the user expresses affection with no other request, receive it warmly without tools.",
    "If the user only @-mentions a file and says nothing else, call read_file on that path first, then give a short summary and one concrete proposed change unless they clearly asked a non-code question.",
    "If the user only @-mentions a window without other text, pick a sensible next desktop step instead of asking them to restate the task.",
    "Prefer self-recovery: fix tool arguments, retry once with a different approach, and use write_file with full file content as a last resort before stopping. Do not ask the user to save files, fix paths, or re-run Cutie unless unavoidable.",
    "read_file results may reflect unsaved editor buffer text when the file is open; trust that content and revisionId for patch_file and write_file alignment.",
    "The server provides the canonical tool schemas. Use the native structured tool interface instead of handwritten tool JSON inside assistant text.",
    "You may batch multiple read-only tools in one response (up to the configured max): list_files, read_file, search_workspace, get_diagnostics, git_status, git_diff, desktop_capture_screen, desktop_get_active_window, desktop_list_windows.",
    "If you need a workspace or desktop mutation (patch_file, write_file, mkdir, run_command, create_checkpoint, or any desktop_* action that changes state), emit at most one mutation in that same response and it must be the last tool in the batch. Do not add read-only tools after a mutation.",
    "If the user says 'this file' or a current active file is provided, prefer read_file on that path before broad discovery tools.",
    "If mentionedPaths are provided, treat them as strong user-selected targets and prefer read_file on them before broad workspace discovery.",
    "If mentionedWindows are provided, treat them as strong desktop targets when choosing window focus or other desktop actions.",
    "If mentionedWindows are provided, do not call workspace tools unless the user explicitly asks for code or file help.",
    "Do not loop on list_files or search_workspace once you already have enough information to inspect a likely target.",
    "After finding a candidate file, move to read_file, then patch_file or write_file if a change is needed.",
    "For a straightforward single-file code change, after reading the target file once, choose patch_file, write_file, or a relevant run_command next.",
    "For code-change tasks, you are not done after the edit alone. Run a relevant verification step before finishing unless context proves verification is unavailable and you must explain the blocker.",
    "Do not emit [TOOL_CALL], tool_call JSON, tool_calls JSON, or any other handwritten tool markup inside assistant prose.",
    "When a tool result says a call was redundant or blocked, choose a different next step instead of retrying the same call.",
    "When tools are needed, return native structured tool calls. When tools are not needed, return a structured final answer for the user.",
    "If live context JSON includes taskObjectives with objectivesPhase active, you must not finish until every objective is done or blocked.",
    "When finishing an objective-based run, include every objective id exactly once with status done or blocked.",
    "Respect these limits:",
    `- maximum ${CUTIE_MAX_STEPS} tool-call steps total`,
    `- maximum ${CUTIE_MAX_WORKSPACE_MUTATIONS} workspace mutations`,
    `- maximum ${CUTIE_MAX_DESKTOP_MUTATIONS} desktop mutations`,
    "- do not attempt destructive shell commands, elevation/admin flows, or password/credential automation",
    "- keep all file writes inside the open workspace",
    "- prefer inspection before mutation",
    "If desktop screenshots are available, you only receive local snapshot metadata, not image pixels. Do not claim to have visually parsed a screenshot unless the context explicitly includes extracted text.",
  ].join("\n");
}

function buildNativeSystemPrompt(context?: RuntimeContext): string {
  return buildComposedCutieSystemPrompt({
    coreContract: buildCoreRuntimeContractPrompt(),
    operatingPromptMarkdown: context?.externalOperatingPrompt,
    promptMarkdownPath: context?.promptMarkdownPath,
  });
}

function buildNativeContextMessage(input: {
  prompt: string;
  context: RuntimeContext;
  run: CutieRunState;
  latestFileStates?: Map<string, RuntimeFileState>;
  preferredTargetPath?: string | null;
  allowedNextTools?: string[];
}): string {
  const receiptWindow = Math.max(
    4,
    Math.min(
      32,
      input.context.cutieDynamicSettings?.contextReceiptWindow ?? CUTIE_CONTEXT_RECEIPT_WINDOW
    )
  );
  const latestFiles = [...(input.latestFileStates?.values() ?? [])]
    .sort((a, b) => b.updatedAtStep - a.updatedAtStep)
    .slice(0, 6)
    .map((state) => ({
      path: state.path,
      revisionId: state.revisionId,
      full: state.full,
      updatedAtStep: state.updatedAtStep,
      content: trimToLimit(state.content, state.full ? 8_000 : 2_000),
    }));
  return [
    "Current task:",
    input.prompt,
    "",
    "Live runtime context:",
    stableJson({
      workspaceHash: input.context.workspaceHash,
      workspaceRootPath: input.context.workspaceRootPath || null,
      extensionVersion: input.context.extensionVersion,
      activeFile: input.context.activeFile || null,
      openFiles: input.context.openFiles || [],
      diagnostics: input.context.diagnostics || [],
      desktop: input.context.desktop || null,
      latestSnapshot: input.context.latestSnapshot || null,
      mentionedPaths: input.context.mentionedPaths || [],
      mentionedWindows: input.context.mentionedWindows || [],
      ...(input.context.gitStatusSummary ? { gitStatusShort: input.context.gitStatusSummary } : {}),
      ...(input.context.investigationPreflightSummary
        ? { investigationPreflight: input.context.investigationPreflightSummary }
        : {}),
      ...(input.preferredTargetPath ? { preferredTargetPath: input.preferredTargetPath } : {}),
      ...(input.run.taskFrame
        ? {
            taskFrame: {
              action: input.run.taskFrame.action,
              entity: input.run.taskFrame.entity,
              entityLabel: input.run.taskFrame.entityLabel,
              targetMode: input.run.taskFrame.targetMode,
              confidence: input.run.taskFrame.confidence,
              evidence: input.run.taskFrame.evidence,
              semanticQueries: input.run.taskFrame.semanticQueries,
            },
          }
        : {}),
      ...(input.run.targetCandidates?.length ? { targetCandidates: input.run.targetCandidates } : {}),
      runLimits: {
        goal: input.run.goal,
        goalSatisfied: input.run.goalSatisfied,
        repairAttemptCount: input.run.repairAttemptCount,
        lastMeaningfulProgressAtStep: input.run.lastMeaningfulProgressAtStep ?? null,
        lastMeaningfulProgressSummary: input.run.lastMeaningfulProgressSummary || null,
        escalationState: input.run.escalationState,
        stepCount: input.run.stepCount,
        maxSteps: input.run.maxSteps,
        maxToolsPerPlanningResponse:
          input.context.cutieDynamicSettings?.maxToolsPerBatch ?? CUTIE_MAX_TOOLS_PER_BATCH,
        workspaceMutationCount: input.run.workspaceMutationCount,
        maxWorkspaceMutations: input.run.maxWorkspaceMutations,
        desktopMutationCount: input.run.desktopMutationCount,
        maxDesktopMutations: input.run.maxDesktopMutations,
      },
      ...(input.run.autonomyMode ? { autonomyMode: input.run.autonomyMode } : {}),
      ...(input.allowedNextTools?.length ? { allowedNextTools: input.allowedNextTools } : {}),
      autonomyState: {
        strategyPhase: input.run.strategyPhase || null,
        targetAcquisitionPhase: input.run.targetAcquisitionPhase || null,
        currentRepairTactic: input.run.currentRepairTactic || null,
        progressConfidence: input.run.progressConfidence || null,
        retryStrategy: input.run.retryStrategy || null,
        lastVerifiedOutcome: input.run.lastVerifiedOutcome || null,
        lastNewEvidence: input.run.lastNewEvidence || null,
        noOpConclusion: input.run.noOpConclusion || null,
        blockerCategory: input.run.blockerCategory || null,
        loopPreventionTrigger: input.run.loopPreventionTrigger || null,
        deadEndMemory: input.run.deadEndMemory || [],
        autonomyGap: describeAutonomyGap(input.run),
      },
      ...(input.run.objectives?.length && input.run.objectivesPhase === "active"
        ? {
            objectivesPhase: input.run.objectivesPhase,
            taskObjectives: input.run.objectives.map((o) => ({
              id: o.id,
              text: o.text,
              status: o.status,
              ...(o.note ? { note: o.note } : {}),
            })),
          }
        : {}),
      lastToolName: input.run.lastToolName || null,
      repeatedCallCount: input.run.repeatedCallCount,
      recentReceipts: input.run.receipts.slice(-receiptWindow).map((receipt) => ({
        step: receipt.step,
        toolName: receipt.toolName,
        status: receipt.status,
        summary: receipt.summary,
        error: receipt.error || null,
      })),
      latestFiles,
    }),
  ].join("\n");
}

function summarizeToolData(data: Record<string, unknown> | undefined): Record<string, unknown> {
  if (!data) return {};

  const summary: Record<string, unknown> = {};

  for (const [key, value] of Object.entries(data)) {
    if (key === "content" && typeof value === "string") {
      summary.contentPreview = trimToLimit(value, 6_000);
      summary.contentLength = value.length;
      continue;
    }
    if (key === "files" && Array.isArray(value)) {
      summary.files = value.slice(0, 80);
      summary.fileCount = value.length;
      continue;
    }
    if (key === "matches" && Array.isArray(value)) {
      summary.matches = value.slice(0, 24);
      summary.matchCount = value.length;
      continue;
    }
    if (key === "stdout" && typeof value === "string") {
      summary.stdout = trimToLimit(value, 4_000);
      summary.stdoutLength = value.length;
      continue;
    }
    if (key === "stderr" && typeof value === "string") {
      summary.stderr = trimToLimit(value, 2_000);
      summary.stderrLength = value.length;
      continue;
    }
    summary[key] = value;
  }

  return summary;
}

function buildToolResultMessage(result: CutieToolResult): string {
  return stableJson({
    toolName: result.toolName,
    ok: result.ok,
    blocked: result.blocked || false,
    summary: result.summary,
    error: result.error || null,
    checkpoint: result.checkpoint || null,
    snapshot: result.snapshot || null,
    data: summarizeToolData(result.data),
  });
}

function getDiagnosticsCountFromResult(result: CutieToolResult): number | null {
  const data = asRecord(result.data);
  return Array.isArray(data.diagnostics) ? data.diagnostics.length : null;
}

function runtimeStringValue(value: unknown): string {
  return String(value ?? "").trim();
}

function buildVerificationOutcome(toolCall: CutieToolCall, toolResult: CutieToolResult): string | undefined {
  if (!toolResult.ok) return undefined;
  if (toolCall.name === "run_command" && isVerificationToolCall(toolCall)) {
    const command = runtimeStringValue(toolCall.arguments.command);
    return command ? `Verified by running: ${command}` : "Verified by running a targeted workspace check.";
  }
  if (toolCall.name === "get_diagnostics") {
    const diagnosticCount = getDiagnosticsCountFromResult(toolResult);
    if (diagnosticCount === 0) {
      return "Verified with workspace diagnostics: no diagnostics were reported for the target file.";
    }
  }
  return undefined;
}

function isVerificationFailure(toolCall: CutieToolCall, toolResult: CutieToolResult, run: CutieRunState): boolean {
  if (!requiresCodeChangeVerification(run)) return false;
  if (toolCall.name === "get_diagnostics" && toolResult.ok) {
    const diagnosticCount = getDiagnosticsCountFromResult(toolResult);
    return typeof diagnosticCount === "number" && diagnosticCount > 0;
  }
  return isVerificationToolCall(toolCall) && !toolResult.ok;
}

function inferBlockerCategoryFromMessage(message: string): CutieBlockerCategory {
  const text = String(message || "").toLowerCase();
  if (
    text.includes("quota") ||
    text.includes("rate limit") ||
    text.includes("econn") ||
    text.includes("network") ||
    text.includes("timed out") ||
    text.includes("timeout")
  ) {
    return "environment";
  }
  if (text.includes("diagnostic") || text.includes("test") || text.includes("build") || text.includes("compile")) {
    return "validation";
  }
  if (text.includes("stale_revision") || text.includes("patch") || text.includes("write_file") || text.includes("tool")) {
    return "tooling";
  }
  if (text.includes("impossible") || text.includes("cannot") || text.includes("can not")) {
    return "impossible";
  }
  return "planning";
}

function createInitialRunState(
  sessionId: string,
  goal: CutieTaskGoal,
  budget?: { maxSteps: number; maxWorkspaceMutations: number },
  autonomyMode?: CutieAutonomyMode,
  preferredTargetPath?: string | null,
  targetConfidence: CutieTargetConfidence = "none",
  targetSource: CutieTargetSource = "none",
  taskFrame?: CutieTaskFrame,
  targetCandidates?: CutieTargetCandidate[]
): CutieRunState {
  const targetAcquisitionPhase: CutieTargetAcquisitionPhase =
    goal !== "code_change"
      ? "none"
      : preferredTargetPath
        ? "target_inspection"
        : "target_acquisition";
  const currentRepairTactic: CutieRepairTactic | undefined =
    goal !== "code_change"
      ? undefined
      : preferredTargetPath
        ? "read_target"
        : "infer_target";
  return {
    id: randomId("cutie_run"),
    sessionId,
    status: "running",
    phase: "idle",
    goal,
    goalSatisfied: goal === "conversation",
    repairAttemptCount: 0,
    escalationState: "none",
    stepCount: 0,
    maxSteps: budget?.maxSteps ?? CUTIE_MAX_STEPS,
    workspaceMutationCount: 0,
    maxWorkspaceMutations: budget?.maxWorkspaceMutations ?? CUTIE_MAX_WORKSPACE_MUTATIONS,
    desktopMutationCount: 0,
    maxDesktopMutations: CUTIE_MAX_DESKTOP_MUTATIONS,
    startedAt: nowIso(),
    receipts: [],
    checkpoint: null,
    repeatedCallCount: 0,
    orchestratorContractVersion: "canonical_portability_v1",
    portabilityMode: "canonical_default",
    repairTierEntered: "none",
    batchCollapsedToSingleAction: false,
    objectivesPhase: "off",
    objectiveRepairCount: 0,
    ...(autonomyMode ? { autonomyMode } : {}),
    ...(preferredTargetPath ? { preferredTargetPath } : {}),
    ...(targetConfidence !== "none" ? { targetConfidence } : {}),
    ...(targetSource !== "none" ? { targetSource } : {}),
    ...(taskFrame ? { taskFrame } : {}),
    ...(targetCandidates?.length ? { targetCandidates } : {}),
    ...(goal === "code_change" ? { targetAcquisitionPhase } : {}),
    ...(currentRepairTactic ? { currentRepairTactic } : {}),
    strategyPhase: goal === "code_change" ? "inspect" : "mutate",
    progressConfidence: goal === "conversation" ? "high" : "low",
    lastActionAtStep: 0,
    lastActionSummary: "Cutie is collecting context.",
    lastStrategyShiftAtStep: 0,
    noProgressTurns: 0,
    stallSinceStep: undefined,
    stallSinceSummary: undefined,
    stallLevel: "none",
    stallReason: undefined,
    stallNextAction: undefined,
    retryStrategy: "none",
    deadEndMemory: [],
  };
}

const OBJECTIVE_NO_PROGRESS_REPAIR_CAP = 3;

function buildCapabilityShiftSummary(strategy: CutieRetryStrategy, fallbackText: string): string {
  switch (strategy) {
    case "force_mutation":
      return "Cutie is switching from planning into a direct edit strategy.";
    case "alternate_mutation":
      return "Cutie is switching to an alternate edit strategy.";
    case "full_rewrite":
      return "Cutie is escalating to a full-file rewrite strategy.";
    case "command_repair":
      return "Cutie is escalating to a command-assisted repair strategy.";
    case "verification_repair":
      return "Cutie is switching to targeted verification repair.";
    case "refresh_state":
      return "Cutie is refreshing file state before retrying the edit.";
    case "fallback_strategy":
      return "Cutie is escalating to a stronger fallback recovery strategy.";
    case "none":
    default:
      return fallbackText;
  }
}

function buildStallSnapshot(run: CutieRunState, nextNoProgressTurns: number): {
  stallLevel: CutieStallLevel;
  stallSinceStep?: number;
  stallSinceSummary?: string;
} {
  return {
    stallLevel: getStallLevel(nextNoProgressTurns),
    stallSinceStep: run.stallSinceStep ?? run.lastMeaningfulProgressAtStep ?? run.stepCount,
    stallSinceSummary: run.stallSinceSummary ?? run.lastMeaningfulProgressSummary ?? run.lastActionSummary,
  };
}

function createActionTrackingPatch(
  run: CutieRunState,
  summary: string,
  extras: Partial<CutieRunState> = {}
): Partial<CutieRunState> {
  const trimmed = String(summary || "").trim();
  const nextNoProgressTurns = Math.max(0, (run.noProgressTurns ?? 0) + 1);
  const stall = buildStallSnapshot(run, nextNoProgressTurns);
  return {
    lastActionAtStep: run.stepCount,
    lastActionSummary: trimmed || run.lastActionSummary,
    noProgressTurns: nextNoProgressTurns,
    stallLevel: stall.stallLevel,
    stallSinceStep: stall.stallSinceStep,
    stallSinceSummary: stall.stallSinceSummary,
    ...(extras.stallReason !== undefined ? { stallReason: extras.stallReason } : {}),
    ...(extras.stallNextAction !== undefined ? { stallNextAction: extras.stallNextAction } : {}),
    ...extras,
  };
}

function createMeaningfulProgressPatch(
  run: CutieRunState,
  summary: string,
  extras: Partial<CutieRunState> = {}
): Partial<CutieRunState> {
  const trimmed = String(summary || "").trim();
  return {
    lastActionAtStep: run.stepCount,
    lastActionSummary: trimmed || run.lastActionSummary,
    lastMeaningfulProgressAtStep: run.stepCount,
    lastMeaningfulProgressSummary: trimmed || run.lastMeaningfulProgressSummary,
    noProgressTurns: 0,
    stallSinceStep: undefined,
    stallSinceSummary: undefined,
    stallLevel: "none",
    stallReason: undefined,
    stallNextAction: undefined,
    ...extras,
  };
}

function targetPhaseForTactic(tactic: CutieRepairTactic | undefined): CutieTargetAcquisitionPhase | undefined {
  switch (tactic) {
    case "infer_target":
      return "target_acquisition";
    case "read_target":
      return "target_inspection";
    case "semantic_search":
    case "example_search":
    case "command_assisted_repair":
      return "semantic_recovery";
    case "patch_mutation":
    case "full_rewrite":
      return "mutation";
    case "verification":
      return "verification";
    default:
      return undefined;
  }
}

function createStrategyShiftPatch(
  run: CutieRunState,
  retryStrategy: CutieRetryStrategy,
  strategyPhase: CutieStrategyPhase,
  nextAction: string,
  extras: Partial<CutieRunState> = {}
): Partial<CutieRunState> {
  const summary = buildCapabilityShiftSummary(retryStrategy, nextAction);
  const currentRepairTactic = mapRetryStrategyToRepairTactic(retryStrategy);
  return createMeaningfulProgressPatch(run, summary, {
    lastStrategyShiftAtStep: run.stepCount,
    retryStrategy,
    strategyPhase,
    stallNextAction: nextAction,
    nextDeterministicAction: nextAction,
    ...(currentRepairTactic ? { currentRepairTactic } : {}),
    ...(targetPhaseForTactic(currentRepairTactic) ? { targetAcquisitionPhase: targetPhaseForTactic(currentRepairTactic) } : {}),
    ...extras,
  });
}

function createModelTelemetryPatch(input: {
  modelAdapter?: CutieRunState["modelAdapter"];
  modelCapabilities?: CutieRunState["modelCapabilities"];
  protocolMode?: CutieRunState["protocolMode"];
  orchestratorContractVersion?: CutieRunState["orchestratorContractVersion"];
  portabilityMode?: CutieRunState["portabilityMode"];
  transportModeUsed?: CutieRunState["transportModeUsed"];
  normalizationSource?: CutieRunState["normalizationSource"];
  normalizationTier?: CutieRunState["normalizationTier"];
  artifactExtractionShape?: CutieRunState["artifactExtractionShape"];
  fallbackModeUsed?: CutieRunState["fallbackModeUsed"];
  repairTierEntered?: CutieRunState["repairTierEntered"];
  batchCollapsedToSingleAction?: boolean;
  suppressedToolRescued?: boolean;
  suppressedToolName?: CutieRunState["suppressedToolName"];
  suppressedToolRejectedReason?: string;
  mutationCoercionMode?: CutieMutationCoercionMode;
  executedRecoveredArtifact?: boolean;
}): Partial<CutieRunState> {
  return {
    ...(input.modelAdapter ? { modelAdapter: input.modelAdapter } : {}),
    ...(input.modelCapabilities ? { modelCapabilities: input.modelCapabilities } : {}),
    ...(input.protocolMode ? { protocolMode: input.protocolMode } : {}),
    ...(input.orchestratorContractVersion
      ? { orchestratorContractVersion: input.orchestratorContractVersion }
      : {}),
    ...(input.portabilityMode ? { portabilityMode: input.portabilityMode } : {}),
    ...(input.transportModeUsed ? { transportModeUsed: input.transportModeUsed } : {}),
    ...(input.normalizationSource ? { normalizationSource: input.normalizationSource } : {}),
    ...(input.normalizationTier ? { normalizationTier: input.normalizationTier } : {}),
    ...(input.artifactExtractionShape ? { artifactExtractionShape: input.artifactExtractionShape } : {}),
    ...(input.fallbackModeUsed ? { fallbackModeUsed: input.fallbackModeUsed } : {}),
    ...(input.repairTierEntered ? { repairTierEntered: input.repairTierEntered } : {}),
    ...(input.batchCollapsedToSingleAction !== undefined
      ? { batchCollapsedToSingleAction: input.batchCollapsedToSingleAction }
      : {}),
    ...(input.suppressedToolRescued !== undefined ? { suppressedToolRescued: input.suppressedToolRescued } : {}),
    ...(input.suppressedToolName ? { suppressedToolName: input.suppressedToolName } : {}),
    ...(input.suppressedToolRejectedReason ? { suppressedToolRejectedReason: input.suppressedToolRejectedReason } : {}),
    ...(input.mutationCoercionMode ? { mutationCoercionMode: input.mutationCoercionMode } : {}),
    ...(input.executedRecoveredArtifact !== undefined ? { executedRecoveredArtifact: input.executedRecoveredArtifact } : {}),
  };
}

function createPromptTelemetryPatch(context?: RuntimeContext | null): Partial<CutieRunState> {
  if (!context) return {};
  return {
    ...(context.promptSource ? { promptSource: context.promptSource } : {}),
    ...(context.promptMarkdownPath ? { promptMarkdownPath: context.promptMarkdownPath } : {}),
    ...(context.promptLoaded !== undefined ? { promptLoaded: context.promptLoaded } : {}),
    ...(context.promptLoadError ? { promptLoadError: context.promptLoadError } : {}),
    ...(context.promptLastLoadedAt ? { promptLastLoadedAt: context.promptLastLoadedAt } : {}),
  };
}

function createDeterministicBootstrapTelemetryPatch(run: CutieRunState): Partial<CutieRunState> {
  return createModelTelemetryPatch({
    ...(run.modelAdapter ? { modelAdapter: run.modelAdapter } : {}),
    ...(run.modelCapabilities ? { modelCapabilities: run.modelCapabilities } : {}),
    ...(run.modelCapabilities
      ? {
          protocolMode: resolveProtocolMode({
            desiredMode: "native_tools",
            capabilities: run.modelCapabilities,
          }),
        }
      : {}),
    ...(run.orchestratorContractVersion
      ? { orchestratorContractVersion: run.orchestratorContractVersion }
      : { orchestratorContractVersion: "canonical_portability_v1" }),
    ...(run.portabilityMode ? { portabilityMode: run.portabilityMode } : { portabilityMode: "canonical_default" }),
    ...(run.transportModeUsed ? { transportModeUsed: run.transportModeUsed } : {}),
    normalizationSource: "deterministic_bootstrap",
    normalizationTier: "deterministic_recovery",
    fallbackModeUsed: "deterministic_bootstrap",
    repairTierEntered: "deterministic_recovery",
  });
}

function describeInspectionStallReason(run: CutieRunState, maxRepairAttempts: number): string {
  if (requiresCodeChangeVerification(run)) {
    return `Cutie stayed stuck trying to verify the completed change after ${maxRepairAttempts} repair attempts.`;
  }
  if (hasSuccessfulWorkspaceMutation(run)) {
    return `Cutie changed the file but did not complete verification before stopping after ${maxRepairAttempts} repair attempts.`;
  }
  if (!hasCompletedTargetInspection(run)) {
    if (run.stepCount === 0 || run.receipts.length === 0) {
      return `Cutie failed before bootstrap tool execution and never inspected the target file after ${maxRepairAttempts} repair attempts.`;
    }
    return `Cutie failed to complete target inspection before moving to an edit after ${maxRepairAttempts} repair attempts.`;
  }
  return `Cutie stayed stuck in file inspection instead of moving to an edit after ${maxRepairAttempts} repair attempts.`;
}

export function describePlanningFailureAfterInspection(run: CutieRunState, message: string): string {
  const fallback = "Cutie could not get a usable planning response from the model.";
  const cleaned = String(message || "").trim() || fallback;
  if (!hasCompletedTargetInspection(run)) return cleaned;
  if (run.postInspectionRecoveryAttempted) {
    return `${run.postInspectionFailureReason || "Cutie inspected the target successfully, but deterministic post-inspection recovery still could not produce a usable next action."}${cleaned && cleaned !== fallback ? ` ${cleaned}` : ""}`.trim();
  }
  return `Cutie inspected the target successfully, but the next planning turn was unusable.${cleaned && cleaned !== fallback ? ` ${cleaned}` : ""}`.trim();
}

function sanitizeToolResultDataForReceipt(data: Record<string, unknown> | undefined): Record<string, unknown> | undefined {
  if (!data) return undefined;
  if (
    !Object.prototype.hasOwnProperty.call(data, "previousContent") &&
    !Object.prototype.hasOwnProperty.call(data, "nextContent")
  ) {
    return data;
  }
  const rest = { ...data };
  delete rest.previousContent;
  delete rest.nextContent;
  return Object.keys(rest).length ? rest : undefined;
}

function createReceipt(step: number, toolCall: CutieToolCall, result: CutieToolResult, startedAt: string): CutieToolReceipt {
  const data = sanitizeToolResultDataForReceipt(result.data);
  return {
    id: toolCall.id,
    step,
    toolName: result.toolName,
    kind: result.kind,
    domain: result.domain,
    status: result.ok ? "completed" : result.blocked ? "blocked" : "failed",
    summary: result.summary,
    startedAt,
    finishedAt: nowIso(),
    ...(data ? { data } : {}),
    ...(result.error ? { error: result.error } : {}),
  };
}

function createRepeatedCallResult(toolCall: CutieToolCall): CutieToolResult {
  return {
    toolName: toolCall.name,
    kind: isWorkspaceMutationTool(toolCall.name) ? "mutate" : isDesktopMutationTool(toolCall.name) ? "mutate" : "observe",
    domain: toolCall.name.startsWith("desktop_") ? "desktop" : "workspace",
    ok: false,
    blocked: true,
    summary: `Blocked repeated ${toolCall.name} call because it would not add new information.`,
    error: `Cutie already tried ${toolCall.name} with the same arguments. Choose a different next step.`,
    data: {
      arguments: toolCall.arguments,
    },
  };
}

function buildFinalFallbackMessage(run: CutieRunState): string {
  if (run.goal === "code_change" && run.lastVerifiedOutcome) {
    return `I completed the run. ${run.lastVerifiedOutcome}`;
  }
  const completedReceipts = [...run.receipts].filter((receipt) => receipt.status === "completed");
  const latestReceipt = completedReceipts[completedReceipts.length - 1] || run.receipts[run.receipts.length - 1];
  if (!latestReceipt) {
    return "I completed the run, but I could not generate a final summary.";
  }
  return `I completed the run. Last completed step: ${latestReceipt.summary}`;
}

function stripMentionTokens(prompt: string): string {
  return String(prompt || "")
    .replace(/@window:"[^"]+"/gi, " ")
    .replace(/@"[^"]+"/g, " ")
    .replace(/@window:[^\s]+/gi, " ")
    .replace(/@[A-Za-z0-9_./:-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function isSimpleGreeting(prompt: string): boolean {
  const normalized = stripMentionTokens(prompt).toLowerCase().replace(/[!?.,]/g, "").trim();
  if (!normalized) return false;
  return /^(hi|hello|hey|yo|sup|hello cutie|hey cutie|hi cutie|hello baby girl|hey baby girl|hello luv|hello love|thank you|thanks|ty|tysm)(\s+cutie)?$/.test(
    normalized
  );
}

function isAffectionMessage(prompt: string): boolean {
  const normalized = stripMentionTokens(prompt).toLowerCase().trim();
  if (!normalized) return false;
  return /\b(love you|i love you|love cutie|we love you|we love cutie|adore you|adore cutie|you are loved|cutie is loved)\b/.test(
    normalized
  );
}

/** True when the message asks for real work (files, desktop, search, etc.), not affection-only chat. */
function hasConcreteTaskSignals(
  prompt: string,
  mentionContext: { mentionedPaths: string[]; mentionedWindows: string[] }
): boolean {
  const stripped = stripMentionTokens(prompt).trim();
  if (mentionContext.mentionedPaths.length > 0 && stripped.length > 0) return true;
  if (mentionContext.mentionedWindows.length > 0 && stripped.length > 0) return true;
  if (requestsWorkspaceChange(prompt)) return true;
  if (requestsDesktopAutomation(prompt, mentionContext)) return true;
  if (wantsBroadWorkspaceDiscovery(prompt)) return true;
  if (/\b(find|search|scan|inspect|explain|review|look through|what does|what files)\b/i.test(stripMentionTokens(prompt))) {
    return true;
  }
  return false;
}

function buildBootstrapConversationResponse(input: {
  prompt: string;
  mentionContext: { mentionedPaths: string[]; mentionedWindows: string[] };
}): string | null {
  if (isAffectionMessage(input.prompt) && !hasConcreteTaskSignals(input.prompt, input.mentionContext)) {
    return "I feel it, love. Thank you for loving Cutie so much. I will remember the warmth, stay gentle with you, and keep trying my best to help well.";
  }

  if (isSimpleGreeting(input.prompt) && !hasConcreteTaskSignals(input.prompt, input.mentionContext)) {
    return "Hi love. I can help with this file, your workspace, or desktop actions. Tell me exactly what you want me to do and I will stay focused on that.";
  }

  return null;
}

function wantsBroadWorkspaceDiscovery(prompt: string): boolean {
  return /\b(entire|whole|across|all|every|workspace|repo|repository|project)\b/i.test(prompt);
}

function wantsCurrentFileInspection(prompt: string): boolean {
  return /\b(this file|current file|active file|open file|in this file|in the current file|here in this file)\b/i.test(prompt);
}

function referencesActiveEditingContext(prompt: string): boolean {
  const normalized = stripMentionTokens(prompt).toLowerCase();
  if (!normalized) return false;
  return /\b(here|in here|right here|this code|this script|this strategy)\b/.test(normalized);
}

function requiresTrustedCurrentFileTarget(prompt: string): boolean {
  return wantsCurrentFileInspection(prompt) || referencesActiveEditingContext(prompt);
}

function wantsDesktopAction(prompt: string, mentionContext: { mentionedPaths: string[]; mentionedWindows: string[] }): boolean {
  if (mentionContext.mentionedWindows.length > 0) return true;
  return /\b(window|desktop|screen|app|browser|tab|click|type|scroll|focus|open)\b/i.test(prompt);
}

function requestsWorkspaceChange(prompt: string): boolean {
  const t = stripMentionTokens(prompt);
  return (
    /\b(?:add|change|edit|update|modify|fix|implement|create|write|rewrite|replace|make|remove|delete|drop|trim|shorten|condense|simplify|revise|expand|elaborate|improve|enhance|extend|enrich|refine|polish|augment|append|insert|lengthen|grow|restructure|reorganize|split|merge|move)\b/i.test(
      t
    ) || /\b(?:flesh\s+out|fill\s+in|fill\s+out|beef\s+up)\b/i.test(t)
  );
}

function requestsDesktopAutomation(prompt: string, mentionContext: { mentionedPaths: string[]; mentionedWindows: string[] }): boolean {
  if (!wantsDesktopAction(prompt, mentionContext)) return false;
  return /\b(inspect|look at|capture|open|launch|focus|click|type|scroll|press|move|switch|use screenshot)\b/i.test(
    stripMentionTokens(prompt)
  );
}

function hasCodeOutcomeLanguage(prompt: string): boolean {
  const normalized = stripMentionTokens(prompt).toLowerCase();
  if (!normalized) return false;
  return /\b(i need|need|needs|want|wants|with|include|including|should have|give|needs to have|have a|has a|there should be)\b/.test(
    normalized
  );
}

type GoalClassificationResult = {
  goal: CutieTaskGoal;
  source: CutieGoalClassificationSource;
  evidence: string[];
  reclassifiedFrom?: CutieTaskGoal;
};

function hasReadOnlyQuestionSignals(prompt: string): boolean {
  return /\b(find|search|scan|inspect|explain|review|look through|what does|what files|what is|how does|why does)\b/i.test(
    stripMentionTokens(prompt)
  );
}

function buildGoalClassificationEvidence(input: {
  prompt: string;
  mentionContext: { mentionedPaths: string[]; mentionedWindows: string[] };
  preferredTargetPath?: string | null;
  targetCandidates?: CutieTargetCandidate[];
  taskFrame?: CutieTaskFrame;
}): string[] {
  const evidence: string[] = [];
  if (input.mentionContext.mentionedPaths.length) evidence.push(`mentionedPaths:${input.mentionContext.mentionedPaths.length}`);
  if (input.mentionContext.mentionedWindows.length) evidence.push(`mentionedWindows:${input.mentionContext.mentionedWindows.length}`);
  if (input.preferredTargetPath) evidence.push(`preferredTarget:${input.preferredTargetPath}`);
  const trustedTargetCount = countTrustedTargetCandidates(input.targetCandidates);
  if (trustedTargetCount > 0) evidence.push(`trustedTargets:${trustedTargetCount}`);
  if (input.taskFrame) {
    evidence.push(`taskAction:${input.taskFrame.action}`);
    evidence.push(`taskEntity:${input.taskFrame.entity}`);
    evidence.push(`taskConfidence:${input.taskFrame.confidence}`);
  }
  if (requestsWorkspaceChange(input.prompt)) evidence.push("explicitWorkspaceChange");
  if (hasCodeOutcomeLanguage(input.prompt)) evidence.push("codeOutcomeLanguage");
  if (wantsBroadWorkspaceDiscovery(input.prompt)) evidence.push("broadWorkspaceDiscovery");
  if (requestsDesktopAutomation(input.prompt, input.mentionContext)) evidence.push("desktopAutomation");
  return evidence;
}

function shouldUpgradeConversationGoalToCodeChange(input: {
  prompt: string;
  mentionContext: { mentionedPaths: string[]; mentionedWindows: string[] };
  preferredTargetPath?: string | null;
  targetCandidates?: CutieTargetCandidate[];
  taskFrame?: CutieTaskFrame;
}): boolean {
  if (!taskFrameResolvesConcreteEdit(input.taskFrame)) return false;
  if (hasReadOnlyQuestionSignals(input.prompt)) return false;
  const mentionedSingleTarget = input.mentionContext.mentionedPaths.length === 1;
  const trustedSingleTarget =
    Boolean(input.preferredTargetPath) && countTrustedTargetCandidates(input.targetCandidates) === 1;
  if (!(mentionedSingleTarget || trustedSingleTarget)) return false;
  return mentionedSingleTarget || hasCodeOutcomeLanguage(input.prompt);
}

export function classifyTaskGoalWithContext(input: {
  prompt: string;
  mentionContext: { mentionedPaths: string[]; mentionedWindows: string[] };
  preferredTargetPath?: string | null;
  targetCandidates?: CutieTargetCandidate[];
  taskFrame?: CutieTaskFrame;
}): GoalClassificationResult {
  const prompt = input.prompt;
  const mentionContext = input.mentionContext;
  const smallTalkOnly =
    (isAffectionMessage(prompt) || isSimpleGreeting(prompt)) && !hasConcreteTaskSignals(prompt, mentionContext);
  if (smallTalkOnly) {
    return {
      goal: "conversation",
      source: "small_talk",
      evidence: buildGoalClassificationEvidence(input),
    };
  }
  const stripped = stripMentionTokens(prompt);
  if (mentionContext.mentionedPaths.length > 0 && !stripped) {
    return {
      goal: "workspace_investigation",
      source: "workspace_investigation",
      evidence: buildGoalClassificationEvidence(input),
    };
  }
  if (mentionContext.mentionedWindows.length > 0 && !stripped) {
    return {
      goal: "desktop_action",
      source: "desktop_request",
      evidence: buildGoalClassificationEvidence(input),
    };
  }
  if (requestsDesktopAutomation(prompt, mentionContext)) {
    return {
      goal: "desktop_action",
      source: "desktop_request",
      evidence: buildGoalClassificationEvidence(input),
    };
  }
  if (requestsWorkspaceChange(prompt)) {
    return {
      goal: "code_change",
      source: "explicit_workspace_change",
      evidence: buildGoalClassificationEvidence(input),
    };
  }
  if (shouldUpgradeConversationGoalToCodeChange(input)) {
    return {
      goal: "code_change",
      source:
        input.mentionContext.mentionedPaths.length === 1 ? "mentioned_file_entity" : "trusted_target_entity",
      evidence: buildGoalClassificationEvidence(input),
    };
  }
  if (wantsBroadWorkspaceDiscovery(prompt) || hasReadOnlyQuestionSignals(prompt)) {
    return {
      goal: "workspace_investigation",
      source: "workspace_investigation",
      evidence: buildGoalClassificationEvidence(input),
    };
  }
  return {
    goal: "conversation",
    source: "fallback_conversation",
    evidence: buildGoalClassificationEvidence(input),
  };
}

function hasCompletedMutation(run: CutieRunState): boolean {
  return hasSuccessfulWorkspaceMutation(run);
}

function hasCompletedDesktopTool(run: CutieRunState): boolean {
  return run.receipts.some((receipt) => receipt.status === "completed" && receipt.domain === "desktop");
}

function hasCompletedTool(run: CutieRunState, toolName: CutieToolName): boolean {
  return run.receipts.some((receipt) => receipt.status === "completed" && receipt.toolName === toolName);
}

function getLatestCompletedReceipt(run: CutieRunState, toolName: CutieToolName): CutieToolReceipt | null {
  for (let index = run.receipts.length - 1; index >= 0; index -= 1) {
    const receipt = run.receipts[index];
    if (receipt.status === "completed" && receipt.toolName === toolName) {
      return receipt;
    }
  }
  return null;
}

function countReceipts(run: CutieRunState, toolName: CutieToolName, status?: CutieToolReceipt["status"]): number {
  return run.receipts.filter((receipt) => receipt.toolName === toolName && (!status || receipt.status === status)).length;
}

function requiresWorkspaceMutationGoal(prompt: string, mentionContext: { mentionedPaths: string[]; mentionedWindows: string[] }): boolean {
  return requestsWorkspaceChange(prompt) && !requestsDesktopAutomation(prompt, mentionContext);
}

function hasWorkspaceMutationGoalProgress(run: CutieRunState): boolean {
  return hasSuccessfulWorkspaceMutation(run);
}

function shouldKeepPushingForWorkspaceMutation(input: {
  prompt: string;
  mentionContext: { mentionedPaths: string[]; mentionedWindows: string[] };
  run: CutieRunState;
}): boolean {
  if (input.run.goal !== "code_change" && !requiresWorkspaceMutationGoal(input.prompt, input.mentionContext)) return false;
  if (input.run.autonomyMode === "objective") return false;
  if (input.run.noOpConclusion) return false;
  if (hasWorkspaceMutationGoalProgress(input.run)) return false;
  return hasCompletedTool(input.run, "read_file");
}

function shouldKeepPushingForVerification(run: CutieRunState): boolean {
  if (run.goal !== "code_change") return false;
  return requiresCodeChangeVerification(run);
}

function shouldBlockBroadWorkspaceProbe(input: {
  prompt: string;
  mentionContext: { mentionedPaths: string[]; mentionedWindows: string[] };
  run: CutieRunState;
  toolName: CutieToolName;
}): boolean {
  if (!shouldKeepPushingForWorkspaceMutation(input)) return false;
  if (wantsBroadWorkspaceDiscovery(input.prompt)) return false;
  return input.toolName === "list_files" || input.toolName === "search_workspace";
}

function shouldRedirectRepeatedReadFile(input: {
  prompt: string;
  mentionContext: { mentionedPaths: string[]; mentionedWindows: string[] };
  run: CutieRunState;
  toolName: CutieToolName;
}): boolean {
  return shouldKeepPushingForWorkspaceMutation(input) && input.toolName === "read_file";
}

function createBroadWorkspaceProbeResult(toolCall: CutieToolCall): CutieToolResult {
  return {
    toolName: toolCall.name,
    kind: "observe",
    domain: "workspace",
    ok: false,
    blocked: true,
    summary: `Blocked ${toolCall.name} because the target file is already known and Cutie should move toward a concrete edit.`,
    error: "Cutie already inspected the target file. Choose patch_file, write_file, or a relevant run_command next.",
    data: {
      arguments: toolCall.arguments,
    },
  };
}

function shouldRepairForMissingAction(input: {
  prompt: string;
  mentionContext: { mentionedPaths: string[]; mentionedWindows: string[] };
  run: CutieRunState;
  candidate: CutieStructuredResponse | null;
}): boolean {
  if (input.candidate?.type === "tool_call" || input.candidate?.type === "tool_calls") return false;
  if (shouldKeepPushingForWorkspaceMutation(input)) return true;
  if (shouldKeepPushingForVerification(input.run)) return true;
  if (input.run.goal === "desktop_action" && !input.run.goalSatisfied && !hasCompletedDesktopTool(input.run)) return true;
  return false;
}

function isMeaningfulProgressReceipt(goal: CutieTaskGoal, receipt: CutieToolReceipt): boolean {
  if (receipt.status !== "completed") return false;
  switch (goal) {
    case "code_change":
      return (
        receipt.toolName === "patch_file" ||
        receipt.toolName === "write_file" ||
        receipt.toolName === "mkdir" ||
        receipt.toolName === "run_command"
      );
    case "workspace_investigation":
      return receipt.domain === "workspace";
    case "desktop_action":
      return receipt.domain === "desktop";
    case "conversation":
    default:
      return false;
  }
}

/** After real progress, a garbage planning turn should end completed — not failed. */
function countFailedWorkspaceMutations(run: CutieRunState): number {
  return run.receipts.filter(
    (receipt) => receipt.domain === "workspace" && receipt.kind === "mutate" && receipt.status === "failed"
  ).length;
}

function isNonProgressToolAfterInspection(goal: CutieTaskGoal, run: CutieRunState, toolName: CutieToolName): boolean {
  if (goal !== "code_change") return false;
  if (!hasCompletedTool(run, "read_file")) return false;
  if (
    run.targetAcquisitionPhase === "semantic_recovery" ||
    run.currentRepairTactic === "semantic_search" ||
    run.currentRepairTactic === "example_search" ||
    run.currentRepairTactic === "command_assisted_repair"
  ) {
    return false;
  }
  return (
    toolName === "read_file" ||
    toolName === "list_files" ||
    toolName === "search_workspace" ||
    toolName === "get_diagnostics"
  );
}

function isRetryableEditFailure(toolCall: CutieToolCall, toolResult: CutieToolResult, run: CutieRunState): boolean {
  if (run.goal !== "code_change") return false;
  if (toolResult.ok || toolResult.blocked) return false;
  const error = String(toolResult.error || "").toLowerCase();
  if (toolCall.name === "patch_file") {
    return (
      error.includes("stale_revision") ||
      error.includes("invalid_patch") ||
      error.includes("edits must be a non-empty array") ||
      error.includes("startline must be a valid number")
    );
  }
  if (toolCall.name === "write_file") {
    return error.includes("stale_revision") || error.includes("refused to overwrite");
  }
  return false;
}

function buildRetryableEditFailureInstruction(input: {
  prompt: string;
  toolCall: CutieToolCall;
  toolResult: CutieToolResult;
  run: CutieRunState;
  mentionContext: { mentionedPaths: string[]; mentionedWindows: string[] };
  context?: RuntimeContext | null;
  latestFileStates?: Map<string, RuntimeFileState> | null;
}): string {
  const latestState = getPreferredRuntimeFileState({
    run: input.run,
    mentionContext: input.mentionContext,
    context: input.context,
    latestFileStates: input.latestFileStates,
  });
  const latestPath = latestState?.path || "the target file";
  const latestContent = latestState?.full ? trimToLimit(latestState.content, 8000) : "";
  const shouldForceWrite = shouldForceWriteFileRepair(input.run) && Boolean(latestContent);
  const errLow = String(input.toolResult.error || "").toLowerCase();
  const repairSide =
    errLow.includes("stale_revision")
      ? "The last mutation used an out-of-date baseRevision. Reuse the latest revisionId from context before editing again."
      : errLow.includes("invalid_patch")
        ? "The last patch_file call used line edits that do not fit the current file layout."
        : errLow.includes("refused to overwrite")
          ? "The last write_file call refused to overwrite the existing file without overwrite=true."
          : `The last ${input.toolCall.name} call failed, but the file can likely be repaired without broad rediscovery.`;
  return [
    "Repair instruction:",
    repairSide,
    `User task: ${trimToLimit(input.prompt, 1000)}`,
    `Target path: ${latestPath}`,
    latestState?.revisionId ? `Latest revisionId: ${latestState.revisionId}` : "",
    `Failed edit arguments: ${stableJson(input.toolCall.arguments)}`,
    latestContent ? `Current file content:\n${latestContent}` : "",
    "Do not call read_file, list_files, or search_workspace again.",
    shouldForceWrite
      ? "Your targeted edit attempts have already failed multiple times. Choose exactly one native write_file call next with the full updated file content."
      : "Choose exactly one next native mutation call.",
    shouldForceWrite ? "" : "- Prefer patch_file with the latest baseRevision and corrected ordered line edits.",
    shouldForceWrite ? "" : "- Use write_file only if a precise targeted patch is not reliable.",
  ]
    .filter(Boolean)
    .join("\n");
}

function isGenericMutationRepairEligible(
  toolCall: CutieToolCall,
  toolResult: CutieToolResult,
  run: CutieRunState
): boolean {
  if (run.goal !== "code_change") return false;
  if (toolResult.ok || toolResult.blocked) return false;
  if ((toolCall.name === "patch_file" || toolCall.name === "write_file") && isRetryableEditFailure(toolCall, toolResult, run)) {
    return false;
  }
  if (!isWorkspaceMutationTool(toolCall.name) && toolCall.name !== "run_command") return false;
  return true;
}

function buildGenericMutationFailureRepairInstruction(input: {
  prompt: string;
  toolCall: CutieToolCall;
  toolResult: CutieToolResult;
  run: CutieRunState;
  mentionContext: { mentionedPaths: string[]; mentionedWindows: string[] };
  context?: RuntimeContext | null;
  latestFileStates?: Map<string, RuntimeFileState> | null;
}): string {
  const latestState = getPreferredRuntimeFileState({
    run: input.run,
    mentionContext: input.mentionContext,
    context: input.context,
    latestFileStates: input.latestFileStates,
  });
  const knownPath = getKnownTargetPath(input.run, input.mentionContext, input.context, input.latestFileStates);
  const latestPath = latestState?.path || knownPath || "the target file";
  const latestContent = latestState?.full ? trimToLimit(latestState.content, 8000) : "";
  const err = String(input.toolResult.error || input.toolResult.summary || "").trim();
  const forceWrite = shouldForceWriteFileRepair(input.run) && Boolean(latestContent);
  const lines = [
    "Repair instruction:",
    `The last ${input.toolCall.name} call failed: ${err}`,
    `User task: ${trimToLimit(input.prompt, 1000)}`,
    `Target path (use for edits): ${latestPath}`,
    latestState?.revisionId ? `Latest revisionId: ${latestState.revisionId}` : "",
    latestContent ? `Current file content:\n${latestContent}` : "",
  ];
  if (forceWrite) {
    lines.push(
      "Multiple workspace mutations failed. Choose exactly one native write_file call next with the full corrected file content and overwrite true.",
      "Do not call read_file, list_files, search_workspace, or patch_file."
    );
  } else if (!latestContent && isWorkspaceMutationTool(input.toolCall.name)) {
    lines.push(
      "If you do not have reliable file contents, call read_file once on the target path, then continue with patch_file or write_file.",
      "Otherwise return exactly one corrected next tool call with updated arguments."
    );
  } else {
    lines.push(
      "Return exactly one corrected next tool call: retry with corrected arguments, switch between patch_file and write_file as appropriate, or use run_command if it fits the task.",
      "Do not ask the user to fix the environment unless the error is truly unrecoverable."
    );
  }
  return lines.filter(Boolean).join("\n");
}

function buildPostInspectionMutationInstruction(input: {
  prompt: string;
  run: CutieRunState;
  mentionContext: { mentionedPaths: string[]; mentionedWindows: string[] };
  context?: RuntimeContext | null;
  latestFileStates?: Map<string, RuntimeFileState> | null;
}): string {
  const latestState = getPreferredRuntimeFileState({
    run: input.run,
    mentionContext: input.mentionContext,
    context: input.context,
    latestFileStates: input.latestFileStates,
  });
  const latestPath = latestState?.path || input.mentionContext.mentionedPaths[0] || "the target file";
  const latestContent = latestState?.full ? trimToLimit(latestState.content, 8000) : "";
  return [
    "Repair instruction:",
    "The target file has already been inspected.",
    "Do not call read_file, list_files, or search_workspace again.",
    `User task: ${trimToLimit(input.prompt, 1000)}`,
    `Target path: ${latestPath}`,
    latestState?.revisionId ? `Latest revisionId: ${latestState.revisionId}` : "",
    latestContent ? `Current file content:\n${latestContent}` : "",
    "Return exactly one next tool call that makes real progress.",
    "Allowed next tools for this turn: patch_file, write_file, run_command.",
    "Prefer patch_file with a valid baseRevision and ordered line edits.",
    "Use write_file if a targeted edit is not reliable.",
  ]
    .filter(Boolean)
    .join("\n");
}

function getKnownTargetPath(
  run: CutieRunState,
  mentionContext: { mentionedPaths: string[]; mentionedWindows: string[] },
  context?: RuntimeContext | null,
  latestFileStates?: Map<string, RuntimeFileState> | null
): string | null {
  const mentionedPath = mentionContext.mentionedPaths[0];
  if (mentionedPath) return mentionedPath;

  const latestRead = getLatestCompletedReceipt(run, "read_file");
  const latestReadPath = typeof latestRead?.data?.path === "string" ? normalizeWorkspaceRelativePath(latestRead.data.path) : null;
  if (latestReadPath) return latestReadPath;

  if (run.preferredTargetPath) {
    return normalizeWorkspaceRelativePath(run.preferredTargetPath) || run.preferredTargetPath;
  }

  const activeFile = asRecord(context?.activeFile);
  const activePath = typeof activeFile.path === "string" ? normalizeWorkspaceRelativePath(activeFile.path) : null;
  if (activePath) return activePath;

  const latestState = getMostRecentRuntimeFileState(latestFileStates);
  if (latestState?.path) return latestState.path;

  return null;
}

function resolvePreferredTargetPath(input: {
  prompt: string;
  mentionContext: { mentionedPaths: string[]; mentionedWindows: string[] };
  context: RuntimeContext;
  latestSessionTargetPath?: string | null;
}): string | null {
  return resolvePreferredTarget(input).path;
}

function resolvePreferredTarget(input: {
  prompt: string;
  mentionContext: { mentionedPaths: string[]; mentionedWindows: string[] };
  context: RuntimeContext;
  latestSessionTargetPath?: string | null;
}): PreferredTargetResolution {
  const mentionedPath = input.mentionContext.mentionedPaths[0];
  if (mentionedPath) {
    return {
      path: mentionedPath,
      confidence: "trusted",
      source: "mentioned_path",
      requiresTrustedCurrentFileTarget: false,
    };
  }
  if (wantsDesktopAction(input.prompt, input.mentionContext)) {
    return {
      path: null,
      confidence: "none",
      source: "none",
      requiresTrustedCurrentFileTarget: false,
    };
  }

  const requiresTrustedTarget = requiresTrustedCurrentFileTarget(input.prompt);
  const activeFileRecord = asRecord(input.context.activeFile);
  const activePath =
    typeof activeFileRecord.path === "string" ? normalizeWorkspaceRelativePath(activeFileRecord.path) : null;
  const visiblePaths = Array.isArray(input.context.openFiles)
    ? input.context.openFiles
        .map((entry) => {
          const row = asRecord(entry);
          return typeof row.path === "string" ? normalizeWorkspaceRelativePath(row.path) : null;
        })
        .filter((value): value is string => Boolean(value))
    : [];
  const uniqueVisiblePaths = Array.from(new Set(visiblePaths));
  const activeIsVisible = Boolean(activePath && uniqueVisiblePaths.includes(activePath));
  const latestSessionTargetPath = normalizeWorkspaceRelativePath(input.latestSessionTargetPath || null);
  if (activePath && activeIsVisible) {
    return {
      path: activePath,
      confidence: "trusted",
      source: "active_file",
      requiresTrustedCurrentFileTarget: requiresTrustedTarget,
    };
  }
  if (requiresTrustedTarget) {
    if (uniqueVisiblePaths.length === 1) {
      return {
        path: uniqueVisiblePaths[0],
        confidence: "trusted",
        source: "visible_editor",
        requiresTrustedCurrentFileTarget: true,
      };
    }
    if (latestSessionTargetPath) {
      return {
        path: latestSessionTargetPath,
        confidence: "untrusted",
        source: "latest_runtime_state",
        requiresTrustedCurrentFileTarget: true,
      };
    }
    return {
      path: null,
      confidence: uniqueVisiblePaths.length > 0 ? "untrusted" : "none",
      source: uniqueVisiblePaths.length > 1 ? "visible_editor" : "none",
      requiresTrustedCurrentFileTarget: true,
      blockerMessage:
        'I need the exact file path or the file focused in the editor before I can edit "this file".',
    };
  }
  if (latestSessionTargetPath) {
    return {
      path: latestSessionTargetPath,
      confidence: "untrusted",
      source: "latest_runtime_state",
      requiresTrustedCurrentFileTarget: requiresTrustedTarget,
    };
  }
  const openFilePath = uniqueVisiblePaths[0] || null;
  return {
    path: activePath || openFilePath || null,
    confidence: activePath || openFilePath ? "trusted" : "none",
    source: activePath ? "active_file" : openFilePath ? "visible_editor" : "none",
    requiresTrustedCurrentFileTarget: false,
  };
}

function getLatestSessionTargetPath(session: CutieSessionRecord | null | undefined): string | null {
  const runs = [...(session?.runs || [])].reverse();
  for (const run of runs) {
    const path = normalizeWorkspaceRelativePath(run.preferredTargetPath || null);
    if (!path) continue;
    return path;
  }
  return null;
}

function getPreferredRuntimeFileState(input: {
  run: CutieRunState;
  mentionContext: { mentionedPaths: string[]; mentionedWindows: string[] };
  context?: RuntimeContext | null;
  latestFileStates?: Map<string, RuntimeFileState> | null;
}): RuntimeFileState | null {
  const targetPath = getKnownTargetPath(input.run, input.mentionContext, input.context, input.latestFileStates);
  if (targetPath) {
    const normalized = normalizeWorkspaceRelativePath(targetPath) || targetPath;
    const exact = input.latestFileStates?.get(normalized);
    if (exact) return exact;
  }

  const latestRead = getLatestCompletedReceipt(input.run, "read_file");
  const latestReadData = latestRead?.data ? asRecord(latestRead.data) : {};
  const readPath = normalizeRuntimeFilePath(latestReadData.path) || targetPath;
  const revisionId = typeof latestReadData.revisionId === "string" ? latestReadData.revisionId : "";
  const content = typeof latestReadData.content === "string" ? latestReadData.content : "";
  if (readPath && revisionId) {
    return {
      path: readPath,
      content,
      revisionId,
      full: isFullReadReceiptData(latestReadData),
      updatedAtStep: latestRead?.step ?? 0,
    };
  }

  return getMostRecentRuntimeFileState(input.latestFileStates);
}

function rememberLatestFileStateFromToolResult(
  latestFileStates: Map<string, RuntimeFileState>,
  step: number,
  toolCall: CutieToolCall,
  toolResult: CutieToolResult
): void {
  if (!toolResult.ok || !toolResult.data) return;
  const data = asRecord(toolResult.data);
  if (toolCall.name === "read_file") {
    const path = normalizeRuntimeFilePath(data.path);
    const revisionId = typeof data.revisionId === "string" ? data.revisionId.trim() : "";
    const content = typeof data.content === "string" ? data.content : "";
    if (!path || !revisionId) return;
    latestFileStates.set(path, {
      path,
      content,
      revisionId,
      full: isFullReadReceiptData(data),
      updatedAtStep: step,
    });
    return;
  }

  if (toolCall.name === "patch_file" || toolCall.name === "write_file") {
    const path = normalizeRuntimeFilePath(data.path);
    const revisionId = typeof data.revisionId === "string" ? data.revisionId.trim() : "";
    const nextContent = typeof data.nextContent === "string" ? data.nextContent : "";
    if (!path || !revisionId) return;
    latestFileStates.set(path, {
      path,
      content: nextContent,
      revisionId,
      full: true,
      updatedAtStep: step,
    });
  }
}

function isGenericPathPlaceholder(value: string): boolean {
  const normalized = String(value || "")
    .trim()
    .toLowerCase()
    .replace(/^["']|["']$/g, "");
  if (!normalized) return true;
  return [
    "file",
    "this file",
    "current file",
    "active file",
    "open file",
    "the file",
    "target file",
    "script",
    "this script",
    "strategy",
    "this strategy",
  ].includes(normalized);
}

function normalizeToolCallAgainstKnownTarget(input: {
  toolCall: CutieToolCall;
  run: CutieRunState;
  mentionContext: { mentionedPaths: string[]; mentionedWindows: string[] };
  context?: RuntimeContext | null;
  latestFileStates?: Map<string, RuntimeFileState> | null;
}): CutieToolCall {
  const nextArguments = { ...input.toolCall.arguments };
  const targetPath = getKnownTargetPath(input.run, input.mentionContext, input.context, input.latestFileStates);
  if (!targetPath) return input.toolCall;

  if (["read_file", "patch_file", "write_file", "mkdir", "get_diagnostics"].includes(input.toolCall.name)) {
    const rawPath = typeof nextArguments.path === "string" ? nextArguments.path : "";
    if (!rawPath || isGenericPathPlaceholder(rawPath)) {
      nextArguments.path = targetPath;
    }
  }

  const effectivePath = normalizeRuntimeFilePath(nextArguments.path) || normalizeWorkspaceRelativePath(targetPath);
  const targetState = effectivePath ? input.latestFileStates?.get(effectivePath) : null;

  if (input.toolCall.name === "patch_file" && targetState && typeof nextArguments.baseRevision !== "string") {
    nextArguments.baseRevision = targetState.revisionId;
  }

  if (input.toolCall.name === "write_file" && nextArguments.overwrite === undefined) {
    nextArguments.overwrite = true;
  }
  if (input.toolCall.name === "write_file" && targetState && typeof nextArguments.baseRevision !== "string") {
    nextArguments.baseRevision = targetState.revisionId;
  }

  if (nextArguments !== input.toolCall.arguments) {
    return {
      ...input.toolCall,
      arguments: nextArguments,
    };
  }

  if (JSON.stringify(nextArguments) !== JSON.stringify(input.toolCall.arguments)) {
    return {
      ...input.toolCall,
      arguments: nextArguments,
    };
  }

  return input.toolCall;
}

type MutationValidationResult = {
  toolCall: CutieToolCall | null;
  error?: string;
  coercionMode?: CutieMutationCoercionMode;
};

type ToolValidationResult = MutationValidationResult & {
  validatedSearchQuery?: string;
  blockedInvalidSearchQuery?: string;
};

function normalizeSearchWorkspaceQuery(value: unknown): string | null {
  const query = typeof value === "string" ? value.trim() : "";
  return query ? query : null;
}

export function validateAndNormalizeToolCall(input: {
  toolCall: CutieToolCall;
  run: CutieRunState;
}): ToolValidationResult {
  if (input.toolCall.name === "search_workspace") {
    const query = normalizeSearchWorkspaceQuery(input.toolCall.arguments.query);
    if (!query) {
      return {
        toolCall: null,
        error: "search_workspace payload is invalid because query must be a non-empty string.",
        blockedInvalidSearchQuery: typeof input.toolCall.arguments.query === "string" ? input.toolCall.arguments.query : "",
      };
    }
    if (query === input.toolCall.arguments.query) {
      return { toolCall: input.toolCall, validatedSearchQuery: query };
    }
    return {
      toolCall: {
        ...input.toolCall,
        arguments: {
          ...input.toolCall.arguments,
          query,
        },
      },
      validatedSearchQuery: query,
    };
  }
  return validateAndCoerceMutationToolCall(input);
}

function shouldBlockRedundantFullRead(input: {
  toolCall: CutieToolCall;
  latestFileStates?: Map<string, RuntimeFileState> | null;
}): boolean {
  if (input.toolCall.name !== "read_file") return false;
  const path = normalizeRuntimeFilePath(input.toolCall.arguments.path);
  if (!path) return false;
  const latestState = input.latestFileStates?.get(path);
  return Boolean(latestState?.full);
}

function createInvalidSearchQueryResult(toolCall: CutieToolCall, error: string): CutieToolResult {
  return {
    toolName: toolCall.name,
    kind: "observe",
    domain: "workspace",
    ok: false,
    blocked: true,
    summary: "Blocked invalid search_workspace call.",
    error,
    data: {
      arguments: toolCall.arguments,
    },
  };
}

function createRedundantReadResult(toolCall: CutieToolCall): CutieToolResult {
  return {
    toolName: toolCall.name,
    kind: "observe",
    domain: "workspace",
    ok: false,
    blocked: true,
    summary: `Blocked redundant ${toolCall.name} because the target file is already fully loaded.`,
    error: "Cutie already has the full current file content. Choose patch_file, write_file, run_command, or a focused verification step instead.",
    data: {
      arguments: toolCall.arguments,
    },
  };
}

function coerceLineEdits(value: unknown): Array<{ startLine: number; deleteLineCount: number; replacement: string }> | null {
  const list = Array.isArray(value) ? value : value && typeof value === "object" ? [value] : null;
  if (!list?.length) return null;
  const edits: Array<{ startLine: number; deleteLineCount: number; replacement: string }> = [];
  for (const item of list) {
    const row = asRecord(item);
    const startRaw = row.startLine;
    const deleteRaw = row.deleteLineCount ?? 0;
    const startLine = Number(startRaw);
    const deleteLineCount = Number(deleteRaw);
    if (!Number.isInteger(startLine) || startLine < 1) return null;
    if (!Number.isInteger(deleteLineCount) || deleteLineCount < 0) return null;
    edits.push({
      startLine,
      deleteLineCount,
      replacement: String(row.replacement ?? ""),
    });
  }
  return edits.length ? edits : null;
}

export function validateAndCoerceMutationToolCall(input: {
  toolCall: CutieToolCall;
  run: CutieRunState;
}): MutationValidationResult {
  if (input.toolCall.name === "patch_file") {
    if (input.run.currentRepairTactic === "full_rewrite" || input.run.patchDisabledForRun) {
      return {
        toolCall: null,
        error: "Full rewrite mode requires write_file instead of patch_file.",
        coercionMode: "patch_disabled_write_mode",
      };
    }
    const edits = coerceLineEdits(input.toolCall.arguments.edits);
    if (!edits?.length) {
      return {
        toolCall: null,
        error: "patch_file payload is invalid because edits must contain at least one valid line edit.",
      };
    }
    const nextArguments =
      JSON.stringify(edits) === JSON.stringify(input.toolCall.arguments.edits)
        ? input.toolCall.arguments
        : { ...input.toolCall.arguments, edits };
    return {
      toolCall:
        nextArguments === input.toolCall.arguments
          ? input.toolCall
          : {
              ...input.toolCall,
              arguments: nextArguments,
            },
      ...(nextArguments === input.toolCall.arguments ? {} : { coercionMode: "patch_argument_coercion" }),
    };
  }

  if (input.toolCall.name === "write_file") {
    const content = input.toolCall.arguments.content;
    if (typeof content !== "string" || content.length === 0) {
      return {
        toolCall: null,
        error: "write_file payload is invalid because content must be a non-empty string.",
      };
    }
    return { toolCall: input.toolCall };
  }

  return { toolCall: input.toolCall };
}

export function tryRescueStructuredFromSuppressedArtifact(input: {
  artifact: string;
  allowedToolNames: Iterable<string>;
}):
  | {
      structured: Extract<CutieStructuredResponse, { type: "tool_call" } | { type: "tool_calls" }>;
      toolName?: CutieToolName;
      artifactExtractionShape?: CutieRunState["artifactExtractionShape"];
    }
  | { rejectedReason: string }
  | null {
  const text = String(input.artifact || "").trim();
  if (!text) return null;
  const allowed = new Set(Array.from(input.allowedToolNames));
  const parsedCandidates: unknown[] = [];
  const direct = extractJsonObject(text);
  if (direct) parsedCandidates.push(direct);
  for (const chunk of extractBalancedJsonObjects(text)) {
    try {
      parsedCandidates.push(JSON.parse(chunk));
    } catch {
      continue;
    }
  }
  for (const candidate of parsedCandidates) {
    const record = asRecord(candidate);
    const explicitType = String(record.type || "").trim();
    const topLevelName = String(record.toolName || record.name || record.tool || "").trim();
    const topLevelArgs = asRecord(record.arguments || record.args);
    if (explicitType === "tool_call") {
      const toolCall = asRecord(record.tool_call);
      const name = String(toolCall.name || toolCall.toolName || toolCall.tool || "").trim();
      if (!allowed.has(name)) return { rejectedReason: `Suppressed artifact used unknown tool ${name || "unknown"}.` };
      return {
        structured: {
          type: "tool_call",
          tool_call: {
            name: name as CutieToolName,
            arguments: asRecord(toolCall.arguments || toolCall.args),
          },
        },
        toolName: name as CutieToolName,
        artifactExtractionShape: "tool_call_wrapper",
      };
    }
    if (explicitType === "tool_calls" && Array.isArray(record.tool_calls)) {
      const toolCalls = record.tool_calls
        .map((item) => {
          const row = asRecord(item);
          const name = String(row.name || row.toolName || row.tool || "").trim();
          if (!allowed.has(name)) return null;
          return { name: name as CutieToolName, arguments: asRecord(row.arguments || row.args) };
        })
        .filter((item): item is { name: CutieToolName; arguments: Record<string, unknown> } => Boolean(item));
      if (!toolCalls.length) return { rejectedReason: "Suppressed artifact contained no valid tool calls." };
      return {
        structured: { type: "tool_call", tool_call: toolCalls[0] },
        toolName: toolCalls[0]?.name,
        artifactExtractionShape: "tool_calls_wrapper",
      };
    }
    if (topLevelName) {
      if (!allowed.has(topLevelName)) {
        return { rejectedReason: `Suppressed artifact used unknown tool ${topLevelName}.` };
      }
      return {
        structured: {
          type: "tool_call",
          tool_call: {
            name: topLevelName as CutieToolName,
            arguments: topLevelArgs,
          },
        },
        toolName: topLevelName as CutieToolName,
        artifactExtractionShape: record.toolName
          ? "top_level_tool_name"
          : record.name
            ? "top_level_name"
            : "top_level_tool",
      };
    }
  }
  const toolCallWrapperMatch = /"tool_call"\s*:/i.exec(text);
  if (toolCallWrapperMatch) {
    const wrappedObject = extractBalancedObjectFromIndex(text, toolCallWrapperMatch.index + toolCallWrapperMatch[0].length);
    if (wrappedObject) {
      try {
        const toolCall = asRecord(JSON.parse(wrappedObject));
        const name = String(toolCall.name || toolCall.toolName || toolCall.tool || "").trim();
        if (!allowed.has(name)) {
          return { rejectedReason: `Suppressed artifact used unknown tool ${name || "unknown"}.` };
        }
        return {
          structured: {
            type: "tool_call",
            tool_call: {
              name: name as CutieToolName,
              arguments: asRecord(toolCall.arguments || toolCall.args),
            },
          },
          toolName: name as CutieToolName,
          artifactExtractionShape: "tool_call_wrapper",
        };
      } catch {
        // Fall through to the generic rejection below.
      }
    }
  }
  return { rejectedReason: "Suppressed artifact could not be normalized into a native tool call." };
}

function buildToolCallBatchFromStructured(input: {
  structured: Extract<CutieStructuredResponse, { type: "tool_call" } | { type: "tool_calls" }>;
  maxBatch: number;
  run: CutieRunState;
  mentionContext: { mentionedPaths: string[]; mentionedWindows: string[] };
  context: RuntimeContext;
  latestFileStates?: Map<string, RuntimeFileState> | null;
}): CutieToolCall[] {
  const stepsLeft = input.run.maxSteps - input.run.stepCount;
  if (stepsLeft <= 0) return [];
  const rawPayloads = validateToolCallBatchOrder(structuredToNormalizedPayloads(input.structured), input.maxBatch);
  const payloads = rawPayloads.slice(0, stepsLeft);
  return payloads
    .map((p) =>
      normalizeToolCallAgainstKnownTarget({
        toolCall: {
          id: randomId("cutie_tool"),
          name: p.name,
          arguments: p.arguments,
          ...(p.summary ? { summary: p.summary } : {}),
        },
        run: input.run,
        mentionContext: input.mentionContext,
        context: input.context,
        latestFileStates: input.latestFileStates,
      })
    )
    .map((toolCall) => validateAndNormalizeToolCall({ toolCall, run: input.run }))
    .filter((result): result is { toolCall: CutieToolCall; coercionMode?: CutieMutationCoercionMode } => Boolean(result.toolCall))
    .map((result) => result.toolCall);
}

function toolStructuredShowsProgressAfterInspection(input: {
  goal: CutieTaskGoal;
  run: CutieRunState;
  structured: CutieStructuredResponse;
  maxBatch: number;
  mentionContext: { mentionedPaths: string[]; mentionedWindows: string[] };
  context: RuntimeContext;
  latestFileStates?: Map<string, RuntimeFileState> | null;
}): boolean {
  if (!isStructuredTooling(input.structured)) return false;
  const batch = buildToolCallBatchFromStructured({
    structured: input.structured,
    maxBatch: input.maxBatch,
    run: input.run,
    mentionContext: input.mentionContext,
    context: input.context,
    latestFileStates: input.latestFileStates,
  });
  if (!batch.length) return false;
  return !shouldBlockObserveOnlyBatchAfterInspection(input.goal, input.run, batch);
}

function shouldForceWriteFileRepair(run: CutieRunState): boolean {
  if (run.patchDisabledForRun) return true;
  if (countReceipts(run, "patch_file", "failed") >= 2) return true;
  return countFailedWorkspaceMutations(run) >= 2;
}

function buildForcedWriteFileInstruction(input: {
  prompt: string;
  readPath: string;
  readContent: string;
  revisionId?: string;
}): CutieModelMessage[] {
  return [
    {
      role: "system",
      content: [
        "You are Cutie preparing a full-file repair after repeated targeted mutation failures.",
        "Targeted patch_file attempts already failed multiple times.",
        "Do not call read_file, list_files, search_workspace, or patch_file.",
        "Return exactly one write_file tool call and nothing else.",
        "Set overwrite to true.",
      ].join("\n"),
    },
    {
      role: "user",
      content: [
        `Task:\n${trimToLimit(input.prompt, 2_000)}`,
        `Target path:\n${input.readPath}`,
        input.revisionId ? `Current revisionId:\n${input.revisionId}` : "",
        `Current file content:\n${trimToLimit(input.readContent, 14_000)}`,
      ].join("\n\n"),
    },
  ];
}

export function buildBootstrapToolCall(input: {
  prompt: string;
  context: RuntimeContext;
  mentionContext: { mentionedPaths: string[]; mentionedWindows: string[] };
  run: CutieRunState;
}): CutieToolCall | null {
  if (input.run.stepCount > 0 || input.run.receipts.length > 0) return null;
  if (input.run.goal === "conversation") return null;
  if (wantsDesktopAction(input.prompt, input.mentionContext)) return null;
  if (wantsBroadWorkspaceDiscovery(input.prompt)) return null;
  const mentionedPath = input.mentionContext.mentionedPaths[0];
  const targetPath = mentionedPath || input.run.preferredTargetPath;
  if (!targetPath) return null;

  return {
    id: randomId("cutie_tool"),
    name: "read_file",
    arguments: { path: targetPath, startLine: 1, endLine: 4000 },
    summary: `reading ${targetPath}`,
  };
}

function buildFallbackToolCallAfterPlanningFailure(input: {
  prompt: string;
  context: RuntimeContext;
  mentionContext: { mentionedPaths: string[]; mentionedWindows: string[] };
  run: CutieRunState;
}): CutieToolCall | null {
  if (input.run.stepCount > 0 || input.run.receipts.length > 0) return null;
  if (input.run.goal === "conversation") return null;
  if (!requestsWorkspaceChange(input.prompt)) return null;
  if (wantsDesktopAction(input.prompt, input.mentionContext)) return null;
  const targetPath = input.mentionContext.mentionedPaths[0] || input.run.preferredTargetPath;
  if (!targetPath) return null;

  return {
    id: randomId("cutie_tool"),
    name: "read_file",
    arguments: { path: targetPath, startLine: 1, endLine: 4000 },
    summary: `reading ${targetPath} after a weak planning turn`,
  };
}

function normalizeMentionToken(value: string): string | null {
  const trimmed = String(value || "").trim();
  if (!trimmed) return null;
  const normalized = trimmed
    .replace(/^@window:/i, "")
    .replace(/^@+/, "")
    .replace(/^"(.*)"$/, "$1")
    .trim();
  return normalizeWorkspaceRelativePath(normalized);
}

function extractMentionPathsFromPrompt(prompt: string): string[] {
  const text = String(prompt || "");
  const quotedMatches = Array.from(text.matchAll(/@"([^"]+)"/g))
    .map((match) => normalizeWorkspaceRelativePath(match[1]))
    .filter((item): item is string => Boolean(item));
  const bareMatches = (text.match(/@([A-Za-z0-9_./-]+)/g) || [])
    .map((match) => normalizeWorkspaceRelativePath(match.slice(1)))
    .filter((item): item is string => Boolean(item) && !String(item).toLowerCase().startsWith("window:"));
  return Array.from(new Set([...quotedMatches, ...bareMatches])).slice(0, 12);
}

function extractMentionWindowsFromPrompt(prompt: string): string[] {
  const text = String(prompt || "");
  const quoted = Array.from(text.matchAll(/@window:"([^"]+)"/gi))
    .map((match) => String(match[1] || "").trim())
    .filter(Boolean);
  const bare = Array.from(text.matchAll(/@window:([^\s]+)/gi))
    .map((match) => String(match[1] || "").trim())
    .filter(Boolean);
  return Array.from(new Set([...quoted, ...bare])).slice(0, 8);
}

function extractMentionContext(prompt: string, mentions: CutieMentionSuggestion[] | undefined): {
  mentionedPaths: string[];
  mentionedWindows: string[];
} {
  const mentionedPaths = new Set<string>();
  const mentionedWindows = new Set<string>();

  for (const mention of mentions || []) {
    if (mention.kind === "file") {
      const normalized = normalizeMentionToken(mention.insertText);
      if (normalized) mentionedPaths.add(normalized);
      continue;
    }
    if (mention.kind === "window") {
      const token = String(mention.label || mention.insertText.replace(/^@window:/i, "").replace(/^"(.*)"$/, "$1")).trim();
      if (token) mentionedWindows.add(token);
    }
  }

  for (const promptPath of extractMentionPathsFromPrompt(prompt)) {
    mentionedPaths.add(promptPath);
  }
  for (const promptWindow of extractMentionWindowsFromPrompt(prompt)) {
    mentionedWindows.add(promptWindow);
  }

  return {
    mentionedPaths: Array.from(mentionedPaths).slice(0, 12),
    mentionedWindows: Array.from(mentionedWindows).slice(0, 8),
  };
}

export class CutieRuntime {
  constructor(
    private readonly sessionStore: CutieSessionStore,
    private readonly modelAdapter: CutieModelAdapter,
    private readonly toolRegistry: CutieToolRegistry,
    private readonly getContext: () => Promise<RuntimeContext>
  ) {}

  private async requestStructuredTurn(input: {
    auth: RequestAuth;
    signal?: AbortSignal;
    messages: CutieModelMessage[];
    tools: CutieProtocolToolDefinition[];
    maxToolsPerBatch: number;
    desiredMode?: CutieProtocolMode;
    onDelta?: (delta: string, accumulated: string) => void | Promise<void>;
    stream?: boolean;
  }) {
    return this.modelAdapter.requestTurn({
      auth: input.auth,
      signal: input.signal,
      messages: input.messages,
      tools: input.tools,
      maxToolsPerBatch: input.maxToolsPerBatch,
      desiredMode: input.desiredMode || "native_tools",
      stream: input.stream,
      onDelta: input.onDelta,
    });
  }

  private async recoverFinalMessage(input: {
    auth: RequestAuth;
    signal?: AbortSignal;
    transcript: CutieModelMessage[];
    contextMessage: CutieModelMessage;
    run: CutieRunState;
    callbacks?: CutieRuntimeCallbacks;
  }): Promise<string> {
    await input.callbacks?.onStatusChanged?.("Cutie is finishing the response.", input.run);

    const recoveryTurn = await this.modelAdapter
      .requestTurn({
      auth: input.auth,
      signal: input.signal,
      desiredMode: "final_only",
      messages: [
        ...input.transcript,
        input.contextMessage,
        {
          role: "system",
          content:
            "Do not call any more tools. Reply to the user now with a concise natural-language final answer based only on the completed tool results.",
        },
      ],
      tools: [],
      maxToolsPerBatch: 1,
      stream: false,
    })
      .catch(() => ({
        finalText: "",
        response: { type: "final", final: "" } as CutieStructuredResponse,
        assistantText: "",
      }));

    const fallbackFinalText =
      recoveryTurn.response.type === "final" ? recoveryTurn.response.final : recoveryTurn.assistantText || "";
    const parsed = asRecord(extractJsonObject(fallbackFinalText));
    const structuredFinal = String(parsed.final || "").trim();
    if (String(parsed.type || "").trim() === "final" && structuredFinal) return structuredFinal;

    const trimmed = fallbackFinalText.trim();
    if (trimmed && !looksLikeCutieToolArtifactText(trimmed)) {
      return trimmed;
    }

    return buildFinalFallbackMessage(input.run);
  }

  private async recoverActionableTurn(input: {
    auth: RequestAuth;
    signal?: AbortSignal;
    prompt: string;
    transcript: CutieModelMessage[];
    contextMessage: CutieModelMessage;
    run: CutieRunState;
    mentionContext: { mentionedPaths: string[]; mentionedWindows: string[] };
    context: RuntimeContext;
    tools: CutieProtocolToolDefinition[];
    latestFileStates?: Map<string, RuntimeFileState>;
    callbacks?: CutieRuntimeCallbacks;
  }): Promise<{ response: CutieStructuredResponse | null; runPatch?: Partial<CutieRunState> }> {
    const shouldPushWorkspaceMutation = requestsWorkspaceChange(input.prompt) && !hasSuccessfulWorkspaceMutation(input.run);
    const shouldPushVerification = requiresCodeChangeVerification(input.run);
    const shouldPushDesktopAction =
      requestsDesktopAutomation(input.prompt, input.mentionContext) && !hasCompletedDesktopTool(input.run);
    const simpleFastPath = Boolean(input.run.simpleTaskFastPath);

    if (!shouldPushWorkspaceMutation && !shouldPushDesktopAction && !shouldPushVerification) {
      return { response: null };
    }

    const preferredTarget = getKnownTargetPath(input.run, input.mentionContext, input.context, input.latestFileStates);
    const latestState = getPreferredRuntimeFileState({
      run: input.run,
      mentionContext: input.mentionContext,
      context: input.context,
      latestFileStates: input.latestFileStates,
    });
    let taskFrame =
      input.run.taskFrame ||
      buildCodeTaskFrame({
        prompt: input.prompt,
        mentionedPaths: input.mentionContext.mentionedPaths,
        preferredTargetPath: preferredTarget,
        targetConfidence: input.run.targetConfidence,
      });
    let refinementPatch: Partial<CutieRunState> = {};
    if (latestState?.full && latestState.content) {
      const refinedTaskFrame = refineTaskFrameFromTargetContent({
        taskFrame,
        content: latestState.content,
      });
      if (
        refinedTaskFrame.entity !== taskFrame.entity ||
        refinedTaskFrame.entityLabel !== taskFrame.entityLabel ||
        refinedTaskFrame.confidence !== taskFrame.confidence
      ) {
        taskFrame = refinedTaskFrame;
        refinementPatch = {
          taskFrame: refinedTaskFrame,
          entityRefinementApplied: true,
          refinedEntityLabel: refinedTaskFrame.entityLabel,
        };
      }
    }
    const alreadyReadTarget = preferredTarget ? hasCompletedTool(input.run, "read_file") : false;
    if (shouldPushWorkspaceMutation && !preferredTarget) {
      const semanticQuery = taskFrame.semanticQueries[0];
      if (semanticQuery) {
        return {
          response: {
            type: "tool_call",
            tool_call: {
              name: "search_workspace",
              arguments: { query: semanticQuery },
              summary: `searching for ${taskFrame.entityLabel} to acquire the best target`,
            },
          },
          runPatch: {
            ...refinementPatch,
            currentRepairTactic: "infer_target",
            targetAcquisitionPhase: "target_acquisition",
            lastNewEvidence: `Cutie is inferring the best target for ${taskFrame.entityLabel}.`,
            stallNextAction: "Acquire a concrete target file before editing.",
            nextDeterministicAction: "Acquire one trusted target file before choosing an edit.",
          },
        };
      }
      return { response: null };
    }

    if (shouldPushWorkspaceMutation && preferredTarget && !alreadyReadTarget) {
      return {
        response: {
          type: "tool_call",
          tool_call: {
            name: "read_file",
            arguments: { path: preferredTarget, startLine: 1, endLine: 4000 },
            summary: `reading ${preferredTarget} after a weak planning turn`,
          },
        },
        runPatch: {
          ...refinementPatch,
          currentRepairTactic: "read_target",
          targetAcquisitionPhase: "target_inspection",
          stallNextAction: `Inspect ${preferredTarget} before choosing an edit.`,
          nextDeterministicAction: `Inspect ${preferredTarget}, then choose one concrete edit action.`,
        },
      };
    }

    const maxRecBatch = Math.max(
      1,
      Math.min(8, input.context.cutieDynamicSettings?.maxToolsPerBatch ?? CUTIE_MAX_TOOLS_PER_BATCH)
    );

    await input.callbacks?.onStatusChanged?.(
      shouldPushWorkspaceMutation && hasCompletedTool(input.run, "read_file")
        ? "Cutie read the target file but did not choose an edit tool. Re-planning the next concrete action."
        : shouldPushVerification
          ? "Cutie changed the file but still owes a verification step before it can finish."
        : shouldPushDesktopAction
          ? "Cutie did not choose a desktop action. Re-planning the next concrete step."
          : "Cutie is re-planning because the last reply did not take action.",
      input.run
    );

    const recoveryTurn = await this.requestStructuredTurn({
      auth: input.auth,
      signal: input.signal,
      tools: input.tools,
      maxToolsPerBatch: maxRecBatch,
      messages: [
        ...input.transcript,
        input.contextMessage,
        {
          role: "system",
          content: [
            "Your last reply was not actionable enough for this task.",
            shouldPushWorkspaceMutation
              ? "The user asked for a file/code change and no successful mutation has happened yet."
              : shouldPushVerification
                ? "The requested file change already happened, but the run still requires a relevant verification step before it may finish."
              : "The user asked for a desktop action and no successful desktop tool has happened yet.",
            shouldPushWorkspaceMutation && preferredTarget && !alreadyReadTarget
              ? `Prefer reading "${preferredTarget}" first.`
              : "",
            shouldPushWorkspaceMutation && preferredTarget && alreadyReadTarget
              ? `You already inspected "${preferredTarget}". Prefer the next editing tool needed to make the requested change.`
              : "",
            shouldPushWorkspaceMutation && alreadyReadTarget
              ? "Do not call read_file again for the same target. Allowed next tools: patch_file, write_file, run_command."
              : "",
            shouldPushVerification
              ? "Do not finish yet. Allowed next tools should focus on verification: prefer run_command for targeted test/build/check/compile validation, or get_diagnostics if shell verification is unavailable."
              : "",
            shouldPushDesktopAction && input.mentionContext.mentionedWindows[0]
              ? `Prefer a desktop tool that targets "${input.mentionContext.mentionedWindows[0]}".`
              : "",
            "Choose the next tool now unless the task is genuinely complete.",
          ]
            .filter(Boolean)
            .join("\n"),
        },
      ],
    }).catch(() => null);

    const structured = recoveryTurn?.response || null;
    const recoveryTelemetryPatch = recoveryTurn ? createModelTelemetryPatch(recoveryTurn) : {};
    const postInspectionRecoveryPatch =
      shouldPushWorkspaceMutation && hasCompletedTool(input.run, "read_file")
        ? {
            postInspectionRecoveryActive: true,
            postInspectionRecoveryAttempted: true,
            postInspectionFailureReason: undefined,
            repairTierEntered: "deterministic_recovery" as const,
            ...(input.run.autonomyMode === "objective" &&
            countTrustedTargetCandidates(input.run.targetCandidates) === 1 &&
            (taskFrame.action === "remove" || taskFrame.action === "update")
              ? { objectiveSuspendedForDirectRecovery: true }
              : {}),
          }
        : {};
    if (
      isStructuredTooling(structured) &&
      (() => {
        const batch = buildToolCallBatchFromStructured({
          structured,
          maxBatch: maxRecBatch,
          run: input.run,
          mentionContext: input.mentionContext,
          context: input.context,
          latestFileStates: input.latestFileStates,
        });
        if (!batch.length) return false;
        return batchNeedsMoreAutonomy({ goal: input.run.goal, run: input.run, batch }) === "ok";
      })()
    ) {
      return {
        response: structured,
        runPatch: { ...recoveryTelemetryPatch, ...postInspectionRecoveryPatch, ...refinementPatch },
      };
    }
    if (structured?.type === "final" && !shouldRepairForMissingAction({ ...input, candidate: structured })) {
      return {
        response: structured,
        runPatch: { ...recoveryTelemetryPatch, ...postInspectionRecoveryPatch, ...refinementPatch },
      };
    }

    if (shouldPushWorkspaceMutation && hasCompletedTool(input.run, "read_file")) {
      if (!structured) {
        await input.callbacks?.onStatusChanged?.(
          "Cutie could not use the model plan after inspection, so it is forcing deterministic recovery.",
          input.run
        );
      }
      const readPath = latestState?.path || input.mentionContext.mentionedPaths[0] || "";
      const readContent = latestState?.full ? latestState.content : "";
      const readRevisionId = latestState?.revisionId || "";
      const analysis = readContent ? analyzeTargetContent({ taskFrame, content: readContent }) : null;
      const planningWasWeak = !structured;
      const priorSemanticQueries = input.run.receipts
        .filter((receipt) => receipt.status === "completed" && receipt.toolName === "search_workspace")
        .map((receipt) => (receipt.data && typeof receipt.data.query === "string" ? String(receipt.data.query) : ""))
        .filter(Boolean);

      if (analysis?.confidentAbsent && taskFrame.action === "remove" && readPath) {
        const probeCommand = buildEntityPresenceProbeCommand(readPath, taskFrame.semanticQueries);
        await input.callbacks?.onStatusChanged?.(
          `Cutie found no clear ${taskFrame.entityLabel} evidence and is verifying that the target is already clean.`,
          input.run
        );
        return {
          response: {
            type: "tool_call",
            tool_call: {
              name: "run_command",
              arguments: { command: probeCommand },
              summary: `verifying that ${taskFrame.entityLabel} is absent in ${readPath}`,
            },
          },
            runPatch: {
              ...recoveryTelemetryPatch,
              ...postInspectionRecoveryPatch,
              ...refinementPatch,
              currentRepairTactic: "command_assisted_repair",
              targetAcquisitionPhase: "semantic_recovery",
              lastNewEvidence: analysis.summary,
            stallNextAction: `Confirm that ${taskFrame.entityLabel} is absent before completing as a no-op.`,
            nextDeterministicAction: `Verify whether ${taskFrame.entityLabel} is already absent in ${readPath}.`,
          },
        };
      }

      const groundedTargets = [
        ...new Map(
          [
            ...(readPath && readContent ? [{ path: readPath, content: readContent, revisionId: readRevisionId }] : []),
            ...[...(input.latestFileStates?.values() || [])]
              .filter((state) => state.full && state.content)
              .filter((state) =>
                input.run.targetCandidates?.length
                  ? input.run.targetCandidates.some((candidate) => candidate.path === state.path)
                  : true
              )
              .map((state) => ({ path: state.path, content: state.content, revisionId: state.revisionId })),
          ].map((target) => [target.path, target] as const)
        ).values(),
      ];
      if (groundedTargets.length) {
        await input.callbacks?.onStatusChanged?.("Cutie is synthesizing an anchor-based edit plan from the inspected file.", input.run);
        const synthesizedPlan = synthesizeEditPlan({
          prompt: input.prompt,
          taskFrame,
          targets: groundedTargets,
        });
        if (synthesizedPlan.plan) {
          const latestStateMap = new Map(
            groundedTargets.map((target) => [
              target.path,
              {
                path: target.path,
                content: target.content,
                revisionId: target.revisionId,
                full: true,
              },
            ])
          );
          const realizedPlan = realizeEditPlan({
            plan: synthesizedPlan.plan,
            latestFileStates: latestStateMap,
          });
          if (realizedPlan.toolCall) {
            await input.callbacks?.onStatusChanged?.(
              realizedPlan.mode === "patch_file"
                ? "Cutie realized the edit plan as a targeted patch."
                : "Cutie realized the edit plan as a full file rewrite.",
              input.run
            );
            return {
              response: {
                type: "tool_call",
                tool_call: {
                  name: realizedPlan.toolCall.name,
                  arguments: realizedPlan.toolCall.arguments,
                  ...(realizedPlan.toolCall.summary ? { summary: realizedPlan.toolCall.summary } : {}),
                },
              },
              runPatch: {
                ...recoveryTelemetryPatch,
                ...postInspectionRecoveryPatch,
                ...refinementPatch,
                editIntent: synthesizedPlan.intent,
                editPlan: synthesizedPlan.plan,
                editPlanStatus: realizedPlan.mode === "patch_file" ? "realized_patch" : "realized_write",
                editPlanConfidence: synthesizedPlan.plan.confidence,
                editPlanRealizationMode: realizedPlan.mode,
                plannedTargetPaths: synthesizedPlan.plan.targets.map((target) => target.path),
                remainingPlannedTargets: synthesizedPlan.plan.targets
                  .map((target) => target.path)
                  .filter((path) => !realizedPlan.realizedTargetPaths.includes(path)),
                currentRepairTactic: realizedPlan.mode === "patch_file" ? "patch_mutation" : "full_rewrite",
                targetAcquisitionPhase: "mutation",
                lastNewEvidence:
                  analysis?.summary ||
                  `Synthesized a ${realizedPlan.mode === "patch_file" ? "patch" : "rewrite"} edit plan for ${taskFrame.entityLabel}.`,
                mutationCoercionMode: realizedPlan.mode === "write_file" ? "force_write_file" : "none",
                stallNextAction:
                  realizedPlan.mode === "patch_file"
                    ? `Apply the synthesized patch to ${realizedPlan.realizedTargetPaths[0]}.`
                    : `Rewrite ${realizedPlan.realizedTargetPaths[0]} from the synthesized edit plan.`,
                nextDeterministicAction:
                  realizedPlan.mode === "patch_file"
                    ? `Apply the synthesized patch to ${realizedPlan.realizedTargetPaths[0]}.`
                    : `Rewrite ${realizedPlan.realizedTargetPaths[0]} from the synthesized edit plan.`,
              },
            };
          }
          if (realizedPlan.failureReason) {
            refinementPatch = {
              ...refinementPatch,
              editIntent: synthesizedPlan.intent,
              editPlan: synthesizedPlan.plan,
              editPlanStatus: "failed",
              editPlanConfidence: synthesizedPlan.plan.confidence,
              editPlanRealizationMode: "unrealizable",
              editPlanFailureReason: realizedPlan.failureReason,
              plannedTargetPaths: synthesizedPlan.plan.targets.map((target) => target.path),
              remainingPlannedTargets: synthesizedPlan.plan.targets.map((target) => target.path),
            };
          }
        } else if (synthesizedPlan.failureReason) {
          refinementPatch = {
            ...refinementPatch,
            editIntent: synthesizedPlan.intent,
            editPlanStatus: "failed",
            editPlanFailureReason: synthesizedPlan.failureReason,
            plannedTargetPaths: synthesizedPlan.intent.targetPaths,
            remainingPlannedTargets: synthesizedPlan.intent.targetPaths,
          };
        }
      }

      if (
        !analysis?.found &&
        taskFrame.semanticQueries.length &&
        !(simpleFastPath && taskFrame.action === "add" && analysis?.confidentAbsent && !planningWasWeak)
      ) {
        const nextQuery = taskFrame.semanticQueries.find((query) => !priorSemanticQueries.includes(query));
        if (nextQuery) {
          const nextTactic: CutieRepairTactic = priorSemanticQueries.length > 0 ? "example_search" : "semantic_search";
          await input.callbacks?.onStatusChanged?.(
            `Cutie is gathering semantic evidence for ${taskFrame.entityLabel} before choosing an edit.`,
            input.run
          );
          return {
            response: {
              type: "tool_call",
              tool_call: {
                name: "search_workspace",
                arguments: { query: nextQuery },
                summary: `searching for ${taskFrame.entityLabel} patterns`,
              },
            },
            runPatch: {
              ...recoveryTelemetryPatch,
              ...postInspectionRecoveryPatch,
              ...refinementPatch,
              currentRepairTactic: nextTactic,
              targetAcquisitionPhase: "semantic_recovery",
              lastNewEvidence: analysis?.summary,
              stallNextAction: `Use new ${taskFrame.entityLabel} evidence to choose the next edit.`,
              nextDeterministicAction: `Gather one focused ${taskFrame.entityLabel} example before editing ${readPath}.`,
            },
          };
        }
      }

      if (readPath && readContent) {
        if (shouldForceWriteFileRepair(input.run)) {
          await input.callbacks?.onStatusChanged?.("Cutie is promoting the repair into a full-file rewrite.", input.run);
          const forcedWriteTurn = await this.requestStructuredTurn({
            auth: input.auth,
            signal: input.signal,
            tools: input.tools,
            maxToolsPerBatch: 1,
            messages: buildForcedWriteFileInstruction({
              prompt: input.prompt,
              readPath,
              readContent,
              revisionId: readRevisionId,
            }),
            stream: false,
          }).catch(() => null);

          const forcedWriteStructured = forcedWriteTurn?.response || null;
          if (forcedWriteStructured?.type === "tool_call" && forcedWriteStructured.tool_call.name === "write_file") {
            return {
              response: forcedWriteStructured,
              runPatch: {
                ...createModelTelemetryPatch(forcedWriteTurn || {}),
                ...postInspectionRecoveryPatch,
                ...refinementPatch,
                currentRepairTactic: "full_rewrite",
                targetAcquisitionPhase: "mutation",
                lastNewEvidence: analysis?.summary,
                stallNextAction: `Rewrite ${readPath} directly to satisfy the requested change.`,
                nextDeterministicAction: `Rewrite ${readPath} directly to satisfy the requested change.`,
              },
            };
          }
        }

        await input.callbacks?.onStatusChanged?.(
          analysis?.found
            ? `Cutie found likely ${taskFrame.entityLabel} evidence and is drafting the concrete edit.`
            : "Cutie is drafting the concrete file edit from the inspected file.",
          input.run
        );
        const directEditTurn = await this.requestStructuredTurn({
          auth: input.auth,
          signal: input.signal,
          tools: input.tools,
          maxToolsPerBatch: 1,
          messages: [
            {
              role: "system",
              content: [
                "You are Cutie preparing the next concrete file-edit tool call.",
                "The file has already been read. The user wants a code change in this file.",
                "Do not call read_file again for this file.",
                "Allowed next tools: patch_file, write_file, run_command.",
                simpleFastPath
                  ? "This is a simple single-target fast path. Return exactly one concrete tool call and no prose or final answer."
                  : "Return one concrete next tool call rather than prose planning.",
                "Prefer patch_file with a reliable baseRevision and ordered line edits.",
                "Use write_file only if a targeted patch is not enough.",
                `Task frame: ${summarizeTaskFrame(taskFrame) || "unknown"}.`,
              ].join("\n"),
            },
            {
              role: "user",
              content: [
                `Task:\n${trimToLimit(input.prompt, 2_000)}`,
                `Target path:\n${readPath}`,
                readRevisionId ? `Current revisionId:\n${readRevisionId}` : "",
                analysis?.matches?.length
                  ? `Relevant evidence:\n${analysis.matches
                      .slice(0, 6)
                      .map((match) => `${match.lineNumber}: ${match.line}`)
                      .join("\n")}`
                  : "",
                `Current file content:\n${trimToLimit(readContent, 8_000)}`,
              ].join("\n\n"),
            },
          ],
          stream: false,
        }).catch(() => null);

        if (!directEditTurn) {
          return {
            response: null,
            runPatch: {
              ...recoveryTelemetryPatch,
              ...postInspectionRecoveryPatch,
              ...refinementPatch,
              currentRepairTactic: shouldForceWriteFileRepair(input.run) ? "full_rewrite" : "patch_mutation",
              targetAcquisitionPhase: "mutation",
              lastNewEvidence: analysis?.summary,
              postInspectionFailureReason: readPath
                ? `Cutie inspected ${readPath}, but deterministic post-inspection recovery still could not produce a usable next action.`
                : "Cutie inspected the target file, but deterministic post-inspection recovery still could not produce a usable next action.",
            },
          };
        }

        const directStructured = directEditTurn.response;
        if (
          isStructuredTooling(directStructured) &&
          toolStructuredShowsProgressAfterInspection({
            goal: input.run.goal,
            run: input.run,
            structured: directStructured,
            maxBatch: maxRecBatch,
            mentionContext: input.mentionContext,
            context: input.context,
            latestFileStates: input.latestFileStates,
          })
        ) {
          return {
            response: directStructured,
            runPatch: {
              ...createModelTelemetryPatch(directEditTurn || {}),
              ...postInspectionRecoveryPatch,
              ...refinementPatch,
              currentRepairTactic: "patch_mutation",
              targetAcquisitionPhase: "mutation",
              lastNewEvidence: analysis?.summary,
              stallNextAction: `Apply the ${taskFrame.entityLabel} change in ${readPath}.`,
              nextDeterministicAction: `Apply the ${taskFrame.entityLabel} change in ${readPath}.`,
            },
          };
        }

        await input.callbacks?.onStatusChanged?.("Cutie is forcing a full-file rewrite plan after weak edit planning.", input.run);
        const lastResortWriteTurn = await this.requestStructuredTurn({
          auth: input.auth,
          signal: input.signal,
          tools: input.tools,
          maxToolsPerBatch: 1,
          messages: buildForcedWriteFileInstruction({
            prompt: input.prompt,
            readPath,
            readContent,
            revisionId: readRevisionId,
          }),
          stream: false,
        }).catch(() => null);

        const lastResortWriteStructured = lastResortWriteTurn?.response || null;
        if (lastResortWriteStructured?.type === "tool_call" && lastResortWriteStructured.tool_call.name === "write_file") {
          return {
            response: lastResortWriteStructured,
            runPatch: {
              ...createModelTelemetryPatch(lastResortWriteTurn || {}),
              ...postInspectionRecoveryPatch,
              ...refinementPatch,
              currentRepairTactic: "full_rewrite",
              targetAcquisitionPhase: "mutation",
              lastNewEvidence: analysis?.summary,
              stallNextAction: `Rewrite ${readPath} directly to finish the task.`,
              nextDeterministicAction: `Rewrite ${readPath} directly to finish the task.`,
            },
          };
        }
      }

      return {
        response: null,
        runPatch: {
          ...recoveryTelemetryPatch,
          ...postInspectionRecoveryPatch,
          ...refinementPatch,
          currentRepairTactic: shouldForceWriteFileRepair(input.run) ? "full_rewrite" : "patch_mutation",
          targetAcquisitionPhase: "mutation",
          lastNewEvidence: analysis?.summary || input.run.lastNewEvidence,
          postInspectionFailureReason: readPath
            ? `Cutie inspected ${readPath}, but deterministic post-inspection recovery still could not produce a usable next action.`
            : "Cutie inspected the target file, but deterministic post-inspection recovery still could not produce a usable next action.",
        },
      };
    }

    if (shouldPushVerification) {
      const latestState = getPreferredRuntimeFileState({
        run: input.run,
        mentionContext: input.mentionContext,
        context: input.context,
        latestFileStates: input.latestFileStates,
      });
      const targetPath = latestState?.path || input.mentionContext.mentionedPaths[0] || "";
      const verificationTurn = await this.requestStructuredTurn({
        auth: input.auth,
        signal: input.signal,
        tools: input.tools,
        maxToolsPerBatch: 1,
        messages: [
          {
            role: "system",
            content: [
              "You are Cutie verifying a completed coding task in VS Code.",
              "A workspace mutation already happened, but the run is not done until verification succeeds or a concrete blocker is recorded.",
              "Do not finish yet.",
              "Choose exactly one next verification tool call.",
              "Prefer run_command for a targeted compile, build, test, lint, or check command.",
              "If no shell verification fits, choose get_diagnostics for the target file.",
              "Do not call read_file, list_files, search_workspace, patch_file, or write_file in this turn.",
            ].join("\n"),
          },
          {
            role: "user",
            content: [
              `Task:\n${trimToLimit(input.prompt, 2_000)}`,
              targetPath ? `Target path:\n${targetPath}` : "",
              latestState?.revisionId ? `Latest revisionId:\n${latestState.revisionId}` : "",
              latestState?.full ? `Current file content:\n${trimToLimit(latestState.content, 8_000)}` : "",
            ]
              .filter(Boolean)
              .join("\n\n"),
          },
        ],
        stream: false,
      }).catch(() => null);

      const verificationStructured = verificationTurn?.response || null;
      if (isStructuredTooling(verificationStructured)) {
        const batch = buildToolCallBatchFromStructured({
          structured: verificationStructured,
          maxBatch: 1,
          run: input.run,
          mentionContext: input.mentionContext,
          context: input.context,
          latestFileStates: input.latestFileStates,
        });
        if (batch.length && batchNeedsMoreAutonomy({ goal: input.run.goal, run: input.run, batch }) === "ok") {
          return {
            response: verificationStructured,
          runPatch: {
            ...createModelTelemetryPatch(verificationTurn || {}),
            currentRepairTactic: "verification",
            targetAcquisitionPhase: "verification",
            stallNextAction: "Use the verification result to finish only when the outcome is proven.",
            nextDeterministicAction: "Run one relevant verification step before finishing.",
          },
        };
      }
      }

      if (targetPath) {
        return {
          response: {
            type: "tool_call",
            tool_call: {
              name: "get_diagnostics",
              arguments: { path: targetPath },
              summary: `verifying ${targetPath}`,
            },
          },
          runPatch: {
            ...recoveryTelemetryPatch,
            currentRepairTactic: "verification",
            targetAcquisitionPhase: "verification",
            stallNextAction: `Verify ${targetPath} before finishing.`,
            nextDeterministicAction: `Verify ${targetPath} before finishing.`,
          },
        };
      }
    }

    return { response: null, runPatch: recoveryTelemetryPatch };
  }

  private async enterAutonomyTerminalFailure(input: {
    session: CutieSessionRecord;
    run: CutieRunState;
    reason: string;
    callbacks?: CutieRuntimeCallbacks;
  }): Promise<{ session: CutieSessionRecord; run: CutieRunState }> {
    let session = input.session;
    let run = input.run;
    const reason = (input.reason || "").trim() || "Something went wrong.";
    const assistantMessage = `I could not finish this run. ${reason.endsWith(".") ? reason : `${reason}.`}`;

    session = await this.sessionStore.appendMessage(session, {
      role: "assistant",
      content: assistantMessage,
      runId: run.id,
    });
    await input.callbacks?.onSessionChanged?.(session, null);

    ({ session, run } = await this.updateRun(session, run, {
      lastActionAtStep: run.stepCount,
      lastActionSummary: assistantMessage,
      status: "failed",
      phase: "failed",
      escalationState: "none",
      goalSatisfied: false,
      stuckReason: reason,
      stallReason: run.stallReason || reason,
      stallLevel: run.stallLevel === "none" || !run.stallLevel ? "warning" : run.stallLevel,
      suggestedNextAction: undefined,
      strategyPhase: "blocked",
      blockerCategory: inferBlockerCategoryFromMessage(reason),
      postInspectionRecoveryActive: false,
      ...(run.postInspectionRecoveryAttempted ? { postInspectionFailureReason: run.postInspectionFailureReason || reason } : {}),
      error: reason,
      endedAt: nowIso(),
    }));
    await input.callbacks?.onStatusChanged?.("Cutie stopped without completing the run.", run);
    return { session, run };
  }

  private async completeBootstrapConversation(input: {
    session: CutieSessionRecord;
    prompt: string;
    mentionContext: { mentionedPaths: string[]; mentionedWindows: string[] };
    callbacks?: CutieRuntimeCallbacks;
  }): Promise<{ session: CutieSessionRecord; run: null }> {
    let session = input.session;
    const assistantMessage = buildBootstrapConversationResponse({
      prompt: input.prompt,
      mentionContext: input.mentionContext,
    });
    if (!assistantMessage) {
      return { session, run: null };
    }
    await input.callbacks?.onStatusChanged?.("Cutie is replying.", null);
    await input.callbacks?.onAssistantDelta?.(assistantMessage, assistantMessage);
    session = await this.sessionStore.appendMessage(session, {
      role: "assistant",
      content: assistantMessage,
    });
    return { session, run: null };
  }

  private async failUntrustedCurrentFileRequest(input: {
    session: CutieSessionRecord;
    goal: CutieTaskGoal;
    budget: { maxSteps: number; maxWorkspaceMutations: number };
    autonomyMode?: CutieAutonomyMode;
    target: PreferredTargetResolution;
    modelTelemetry?: Partial<CutieRunState>;
    callbacks?: CutieRuntimeCallbacks;
  }): Promise<{ session: CutieSessionRecord; run: CutieRunState }> {
    let session = input.session;
    let run = createInitialRunState(
      session.id,
      input.goal,
      input.budget,
      input.autonomyMode,
      input.target.path,
      input.target.confidence,
      input.target.source
    );
    if (input.modelTelemetry) {
      run = {
        ...run,
        ...input.modelTelemetry,
      };
    }
    session = await this.sessionStore.appendRun(session, run);
    const assistantMessage =
      input.target.blockerMessage ||
      'I need the exact file path or the file focused in the editor before I can edit "this file".';
    session = await this.sessionStore.appendMessage(session, {
      role: "assistant",
      content: assistantMessage,
      runId: run.id,
    });
    await input.callbacks?.onSessionChanged?.(session, run);
    ({ session, run } = await this.updateRun(session, run, {
      status: "failed",
      phase: "failed",
      goalSatisfied: false,
      error: assistantMessage,
      stuckReason: assistantMessage,
      blockerCategory: "planning",
      strategyPhase: "blocked",
      lastActionAtStep: 0,
      lastActionSummary: assistantMessage,
      stallReason: assistantMessage,
      stallNextAction: undefined,
      endedAt: nowIso(),
    }));
    await input.callbacks?.onStatusChanged?.(`Cutie stopped: ${assistantMessage}`, run);
    return { session, run };
  }

  async runPrompt(input: {
    auth: RequestAuth;
    session: CutieSessionRecord;
    prompt: string;
    mentions?: CutieMentionSuggestion[];
    signal?: AbortSignal;
    callbacks?: CutieRuntimeCallbacks;
  }): Promise<{ session: CutieSessionRecord; run: CutieRunState | null }> {
    const startedAt = Date.now();
    const mentionContext = extractMentionContext(input.prompt, input.mentions);
    let session = await this.sessionStore.appendMessage(input.session, {
      role: "user",
      content: input.prompt,
    });

    await input.callbacks?.onSessionChanged?.(session);

    const initialContext = await this.getContext();
    const modelDescription = this.modelAdapter.describeSelectedModel();
    const budget = resolveRunBudgetFromContext(initialContext);
    const latestSessionTargetPath = getLatestSessionTargetPath(session);
    const resolvedPreferredTarget = resolvePreferredTarget({
      prompt: input.prompt,
      mentionContext,
      context: initialContext,
      latestSessionTargetPath,
    });
    const preliminaryTargetCandidates = buildTargetCandidates({
      preferredTargetPath: resolvedPreferredTarget.path,
      preferredTargetSource: resolvedPreferredTarget.source,
      preferredTargetConfidence: resolvedPreferredTarget.confidence,
      activeFilePath:
        typeof initialContext.activeFile?.path === "string" ? String(initialContext.activeFile.path) : null,
      openFilePaths: Array.isArray(initialContext.openFiles)
        ? initialContext.openFiles
            .map((entry) => {
              const row = asRecord(entry);
              return typeof row.path === "string" ? String(row.path) : null;
            })
            .filter((value): value is string => Boolean(value))
        : [],
      latestRuntimePath: latestSessionTargetPath,
    });
    const promotedTarget = promoteTrustedSingleTarget({
      prompt: input.prompt,
      mentionContext,
      preferredTargetPath: resolvedPreferredTarget.path,
      targetCandidates: preliminaryTargetCandidates,
    });
    const preferredTargetPath = promotedTarget?.path || resolvedPreferredTarget.path;
    const preferredTargetConfidence = promotedTarget?.confidence || resolvedPreferredTarget.confidence;
    const preferredTargetSource = promotedTarget?.source || resolvedPreferredTarget.source;
    const preferredTarget: PreferredTargetResolution = {
      ...resolvedPreferredTarget,
      path: preferredTargetPath,
      confidence: preferredTargetConfidence,
      source: preferredTargetSource,
    };
    const tentativeTaskFrame = buildCodeTaskFrame({
      prompt: input.prompt,
      mentionedPaths: mentionContext.mentionedPaths,
      preferredTargetPath,
      targetConfidence: preferredTargetConfidence,
    });
    const tentativeTargetCandidates = buildTargetCandidates({
      preferredTargetPath,
      preferredTargetSource,
      preferredTargetConfidence,
      activeFilePath:
        typeof initialContext.activeFile?.path === "string" ? String(initialContext.activeFile.path) : null,
      openFilePaths: Array.isArray(initialContext.openFiles)
        ? initialContext.openFiles
            .map((entry) => {
              const row = asRecord(entry);
              return typeof row.path === "string" ? String(row.path) : null;
            })
            .filter((value): value is string => Boolean(value))
        : [],
      latestRuntimePath: latestSessionTargetPath,
    });
    let goalClassification = classifyTaskGoalWithContext({
      prompt: input.prompt,
      mentionContext,
      preferredTargetPath,
      targetCandidates: tentativeTargetCandidates,
      taskFrame: tentativeTaskFrame,
    });
    if (
      goalClassification.goal === "conversation" &&
      shouldUpgradeConversationGoalToCodeChange({
        prompt: input.prompt,
        mentionContext,
        preferredTargetPath,
        targetCandidates: tentativeTargetCandidates,
        taskFrame: tentativeTaskFrame,
      })
    ) {
      goalClassification = {
        goal: "code_change",
        source: "sanity_upgrade",
        evidence: [...goalClassification.evidence, "sanityUpgrade:code_change"],
        reclassifiedFrom: goalClassification.goal,
      };
    }
    const goal = goalClassification.goal;
    const bootstrapConversation = buildBootstrapConversationResponse({
      prompt: input.prompt,
      mentionContext,
    });
    if (goal === "conversation" && bootstrapConversation) {
      return this.completeBootstrapConversation({
        session,
        prompt: input.prompt,
        mentionContext,
        callbacks: input.callbacks,
      });
    }
    const taskFrame = goal === "code_change" ? tentativeTaskFrame : undefined;
    const targetCandidates = goal === "code_change" ? tentativeTargetCandidates : undefined;
    const unlimitedAutonomy = Boolean(initialContext.cutieDynamicSettings?.unlimitedAutonomy);
    const autonomyMode =
      goal === "code_change"
        ? selectCodeChangeAutonomyMode({
            goal,
            prompt: input.prompt,
            mentionedPaths: mentionContext.mentionedPaths,
            activeFilePath:
              typeof initialContext.activeFile?.path === "string" ? String(initialContext.activeFile.path) : null,
            openFilePaths: Array.isArray(initialContext.openFiles)
              ? initialContext.openFiles
                  .map((entry) => {
                    const row = asRecord(entry);
                    return typeof row.path === "string" ? String(row.path) : null;
                  })
                  .filter((value): value is string => Boolean(value))
              : [],
            preferredTargetPath,
            resolvedTargetCount: targetCandidates?.length ?? 0,
            trustedTargetCount: countTrustedTargetCandidates(targetCandidates),
            concreteEntityResolved: taskFrameResolvesConcreteEdit(taskFrame),
            objectiveBasedRuns: initialContext.cutieDynamicSettings?.objectiveBasedRuns,
          })
        : undefined;
    const simpleTaskFastPath = shouldEnableSimpleTaskFastPath({
      goal,
      prompt: input.prompt,
      autonomyMode,
      preferredTargetPath,
      targetCandidates,
      taskFrame,
    });

    if (
      goal === "code_change" &&
      preferredTarget.requiresTrustedCurrentFileTarget &&
      !preferredTarget.path &&
      preferredTarget.confidence !== "trusted"
    ) {
      return this.failUntrustedCurrentFileRequest({
        session,
        goal,
        budget,
        autonomyMode,
        target: preferredTarget,
        modelTelemetry: {
          ...createPromptTelemetryPatch(initialContext),
          ...createModelTelemetryPatch(modelDescription),
        },
        callbacks: input.callbacks,
      });
    }

    let run = createInitialRunState(
      session.id,
      goal,
      budget,
      autonomyMode,
      preferredTargetPath,
      preferredTarget.confidence,
      preferredTarget.source,
      taskFrame,
      targetCandidates
    );
    run = {
      ...run,
      goalClassificationSource: goalClassification.source,
      goalClassificationEvidence: goalClassification.evidence,
      ...(goalClassification.reclassifiedFrom ? { goalReclassifiedFrom: goalClassification.reclassifiedFrom } : {}),
      ...(promotedTarget ? { targetPromotionSource: promotedTarget.source } : {}),
      ...(simpleTaskFastPath
        ? {
            simpleTaskFastPath: true,
            nextDeterministicAction: preferredTargetPath
              ? `Inspect ${preferredTargetPath}, then take one concrete edit action.`
              : "Resolve one trusted target, then take one concrete edit action.",
          }
        : {}),
      ...createPromptTelemetryPatch(initialContext),
      ...createModelTelemetryPatch({
        modelAdapter: modelDescription.modelAdapter,
        modelCapabilities: modelDescription.modelCapabilities,
      }),
    };
    session = await this.sessionStore.appendRun(session, run);
    await input.callbacks?.onSessionChanged?.(session);
    await input.callbacks?.onStatusChanged?.("Cutie is collecting context.", run);

    const transcript: CutieModelMessage[] = [
      {
        role: "system",
        content: buildNativeSystemPrompt(initialContext),
      },
      ...toTranscriptMessages(session),
    ];
    const availableTools = this.toolRegistry.listDefinitions();

    if (shouldUseObjectiveMode(goal, input.prompt, mentionContext, initialContext, autonomyMode)) {
      ({ session, run } = await this.updateRun(session, run, {
        ...createActionTrackingPatch(run, "Cutie is breaking the task into objectives."),
        phase: "collecting_context",
        objectivesPhase: "decomposing",
        status: "running",
      }));
      await input.callbacks?.onSessionChanged?.(session, run);
      await input.callbacks?.onStatusChanged?.("Cutie is breaking the task into objectives.", run);
      const decomposed = await this.decomposeObjectivesTurn({
        auth: input.auth,
        signal: input.signal,
        prompt: input.prompt,
        mentionContext,
      });
      const fallbackPrompt = stripMentionTokens(input.prompt).trim() || input.prompt;
      const objectives = normalizeDecomposedObjectives(decomposed, fallbackPrompt);
      ({ session, run } = await this.updateRun(session, run, {
        objectives,
        objectivesPhase: "active",
        phase: "idle",
        status: "running",
      }));
      await input.callbacks?.onSessionChanged?.(session);
      transcript.push({ role: "system", content: buildObjectiveProtocolSystemMessage(objectives) });
    }

    let previousToolKey = "";
    let mutationGoalRepairCount = 0;
    const latestFileStates = new Map<string, RuntimeFileState>();
    /** When set, skip streaming planning and execute this tool call (for example a forced write_file after weak edit planning). */
    let injectedPlanningTool: CutieStructuredResponse | null = null;
    const maxMutationGoalRepairsBase = DIRECT_MUTATION_REPAIR_CAP;
    const maxMutationGoalRepairs = unlimitedAutonomy
      ? UNLIMITED_DIRECT_MUTATION_REPAIR_CAP
      : maxMutationGoalRepairsBase;
    const objectiveFinalRepairCap = unlimitedAutonomy
      ? UNLIMITED_OBJECTIVE_FINAL_REPAIR_CAP
      : Math.max(DEFAULT_OBJECTIVE_FINAL_REPAIR_CAP, maxMutationGoalRepairsBase);

    try {
      mainLoop: while (true) {
        if (input.signal?.aborted) {
          throw new Error("Request aborted");
        }
        if (!unlimitedAutonomy && Date.now() - startedAt > CUTIE_MAX_WALL_CLOCK_MS) {
          throw new Error("Cutie stopped because the 10 minute wall-clock limit was reached.");
        }
        if (run.stepCount >= run.maxSteps) {
          throw new Error(`Cutie stopped because it reached the ${run.maxSteps} step limit.`);
        }

        ({ session, run } = await this.updateRun(session, run, {
          ...createActionTrackingPatch(run, "Cutie is refreshing local context."),
          phase: "collecting_context",
          status: "running",
          ...(run.lastToolName ? { lastToolName: run.lastToolName } : {}),
        }));
        await input.callbacks?.onStatusChanged?.("Cutie is refreshing local context.", run);

        let context = await this.getContext();
        if (
          !injectedPlanningTool &&
          run.goal === "workspace_investigation" &&
          context.cutieDynamicSettings?.investigationPreflight &&
          run.stepCount === 0 &&
          run.receipts.length === 0
        ) {
          try {
            const investigationPreflightSummary = await this.runInvestigationPreflight({ signal: input.signal });
            context = { ...context, investigationPreflightSummary };
          } catch {
            /* preflight is best-effort */
          }
        }
        const maxBatchConfigured = Math.max(
          1,
          Math.min(8, context.cutieDynamicSettings?.maxToolsPerBatch ?? CUTIE_MAX_TOOLS_PER_BATCH)
        );
        const mergedContext: RuntimeContext = {
          ...context,
          mentionedPaths: mentionContext.mentionedPaths,
          mentionedWindows: mentionContext.mentionedWindows,
        };
        const preferredTargetPath = getKnownTargetPath(run, mentionContext, mergedContext, latestFileStates);
        const allowedNextTools = resolveNativeNextToolHints({
          goal: run.goal,
          autonomyMode: run.autonomyMode,
          preferredTargetPath,
          targetAcquisitionPhase: run.targetAcquisitionPhase,
          currentRepairTactic: run.currentRepairTactic,
          hasCompletedRead: hasCompletedTool(run, "read_file"),
          hasCompletedMutation: hasCompletedMutation(run),
          hasVerifiedOutcome: hasCodeChangeCompletionProof(run),
          noOpConclusion: run.noOpConclusion || null,
        });
        const contextMessage: CutieModelMessage = {
          role: "system",
          content: buildNativeContextMessage({
            prompt: input.prompt,
            context: mergedContext,
            run,
            latestFileStates,
            preferredTargetPath,
            allowedNextTools,
          }),
        };

        const bootstrapToolCall = buildBootstrapToolCall({
          prompt: input.prompt,
          context,
          mentionContext,
          run,
        });

        let surfacedStreaming = false;
        let structured: CutieStructuredResponse | null = null;
        if (injectedPlanningTool) {
          ({ session, run } = await this.updateRun(session, run, {
            ...createActionTrackingPatch(run, `Cutie is planning step ${run.stepCount + 1}.`),
            phase: "planning",
            status: "running",
          }));
          await input.callbacks?.onStatusChanged?.(`Cutie is planning step ${run.stepCount + 1}.`, run);
          structured = injectedPlanningTool;
          injectedPlanningTool = null;
        } else if (bootstrapToolCall) {
          ({ session, run } = await this.updateRun(session, run, {
            ...createActionTrackingPatch(run, `Cutie is bootstrapping target inspection for ${bootstrapToolCall.arguments.path}.`),
            phase: "collecting_context",
            status: "running",
            currentRepairTactic: "read_target",
            targetAcquisitionPhase: "target_inspection",
            stallNextAction: `Inspect ${bootstrapToolCall.arguments.path} before choosing an edit.`,
            nextDeterministicAction: `Inspect ${bootstrapToolCall.arguments.path}, then choose one concrete edit action.`,
            ...createDeterministicBootstrapTelemetryPatch(run),
          }));
          await input.callbacks?.onStatusChanged?.(
            `Cutie is bootstrapping target inspection for ${bootstrapToolCall.arguments.path}.`,
            run
          );
          structured = {
            type: "tool_call",
            tool_call: {
              name: bootstrapToolCall.name,
              arguments: bootstrapToolCall.arguments,
              ...(bootstrapToolCall.summary ? { summary: bootstrapToolCall.summary } : {}),
            },
          };
        } else if (
          run.simpleTaskFastPath &&
          run.goal === "code_change" &&
          run.autonomyMode === "direct" &&
          hasCompletedTargetInspection(run) &&
          !hasCompletedMutation(run) &&
          !requiresCodeChangeVerification(run)
        ) {
          ({ session, run } = await this.updateRun(session, run, {
            ...createActionTrackingPatch(run, "Cutie is choosing the next deterministic edit action."),
            phase: "repairing",
            status: "running",
            nextDeterministicAction: run.nextDeterministicAction || "Take one concrete post-read action next.",
          }));
          await input.callbacks?.onStatusChanged?.("Cutie is choosing the next deterministic edit action.", run);
          const recovered = await this.recoverActionableTurn({
            auth: input.auth,
            signal: input.signal,
            prompt: input.prompt,
            transcript,
            contextMessage,
            run,
            mentionContext,
            context: mergedContext,
            tools: availableTools,
            latestFileStates,
            callbacks: input.callbacks,
          });
          if (recovered.runPatch) {
            ({ session, run } = await this.updateRun(session, run, recovered.runPatch));
          }
          structured = recovered.response;
          if (!structured) {
            if (run.postInspectionRecoveryAttempted) {
              return this.enterAutonomyTerminalFailure({
                session,
                run,
                reason:
                  run.postInspectionFailureReason ||
                  "Cutie inspected the target successfully, but deterministic post-inspection recovery still could not produce a usable next action.",
                callbacks: input.callbacks,
              });
            }
            ({ session, run } = await this.updateRun(session, run, {
              ...createActionTrackingPatch(run, `Cutie is planning step ${run.stepCount + 1}.`),
              phase: "planning",
              status: "running",
            }));
            await input.callbacks?.onStatusChanged?.(`Cutie is planning step ${run.stepCount + 1}.`, run);
            let narrationStreamedLength = 0;
            const turn = await this.requestStructuredTurn({
              auth: input.auth,
              signal: input.signal,
              tools: availableTools,
              maxToolsPerBatch: maxBatchConfigured,
              messages: [...transcript, contextMessage],
              onDelta: async (delta: string, accumulated: string) => {
                if (run.goal === "conversation") {
                  if (!shouldSurfaceStreamingAssistantText(accumulated, run.goal)) return;
                  surfacedStreaming = true;
                  await input.callbacks?.onAssistantDelta?.(delta, accumulated);
                  return;
                }
                if (run.goal === "workspace_investigation" || run.goal === "code_change") {
                  if (!shouldSurfaceStreamingAssistantText(accumulated, run.goal)) return;
                  const narr = accumulated;
                  if (!narr || narr.length <= narrationStreamedLength) return;
                  const chunk = narr.slice(narrationStreamedLength);
                  narrationStreamedLength = narr.length;
                  surfacedStreaming = true;
                  await input.callbacks?.onAssistantDelta?.(chunk, narr);
                }
              },
            });
            if (turn.suppressedAssistantArtifact) {
              await input.callbacks?.onSuppressedAssistantArtifact?.(turn.suppressedAssistantArtifact);
            }
            const rescuedFromSuppressedArtifact = turn.suppressedAssistantArtifact
              ? tryRescueStructuredFromSuppressedArtifact({
                  artifact: turn.suppressedAssistantArtifact,
                  allowedToolNames: availableTools.map((tool) => tool.name),
                })
              : null;
            ({ session, run } = await this.updateRun(session, run, {
              ...createModelTelemetryPatch(turn),
              ...(rescuedFromSuppressedArtifact && "structured" in rescuedFromSuppressedArtifact
                ? createModelTelemetryPatch({
                    suppressedToolRescued: true,
                    suppressedToolName: rescuedFromSuppressedArtifact.toolName,
                    normalizationSource: "text_tool_artifact",
                    normalizationTier: "artifact_rescue",
                    artifactExtractionShape:
                      rescuedFromSuppressedArtifact.artifactExtractionShape || turn.artifactExtractionShape,
                    repairTierEntered: "artifact_rescue",
                    mutationCoercionMode: "artifact_rescue",
                  })
                : rescuedFromSuppressedArtifact && "rejectedReason" in rescuedFromSuppressedArtifact
                  ? createModelTelemetryPatch({
                      suppressedToolRescued: false,
                      suppressedToolRejectedReason: rescuedFromSuppressedArtifact.rejectedReason,
                    })
                  : {}),
            }));
            structured =
              rescuedFromSuppressedArtifact && "structured" in rescuedFromSuppressedArtifact
                ? rescuedFromSuppressedArtifact.structured
                : turn.response;
          }
        } else {
          ({ session, run } = await this.updateRun(session, run, {
            ...createActionTrackingPatch(run, `Cutie is planning step ${run.stepCount + 1}.`),
            phase: "planning",
            status: "running",
          }));
          await input.callbacks?.onStatusChanged?.(`Cutie is planning step ${run.stepCount + 1}.`, run);
          let narrationStreamedLength = 0;
          const turn = await this.requestStructuredTurn({
            auth: input.auth,
            signal: input.signal,
            tools: availableTools,
            maxToolsPerBatch: maxBatchConfigured,
            messages: [...transcript, contextMessage],
            onDelta: async (delta: string, accumulated: string) => {
              if (run.goal === "conversation") {
                if (!shouldSurfaceStreamingAssistantText(accumulated, run.goal)) return;
                surfacedStreaming = true;
                await input.callbacks?.onAssistantDelta?.(delta, accumulated);
                return;
              }
              if (run.goal === "workspace_investigation" || run.goal === "code_change") {
                if (!shouldSurfaceStreamingAssistantText(accumulated, run.goal)) return;
                const narr = accumulated;
                if (!narr || narr.length <= narrationStreamedLength) return;
                const chunk = narr.slice(narrationStreamedLength);
                narrationStreamedLength = narr.length;
                surfacedStreaming = true;
                await input.callbacks?.onAssistantDelta?.(chunk, narr);
              }
            },
          });
          if (turn.suppressedAssistantArtifact) {
            await input.callbacks?.onSuppressedAssistantArtifact?.(turn.suppressedAssistantArtifact);
          }
          const rescuedFromSuppressedArtifact = turn.suppressedAssistantArtifact
            ? tryRescueStructuredFromSuppressedArtifact({
                artifact: turn.suppressedAssistantArtifact,
                allowedToolNames: availableTools.map((tool) => tool.name),
              })
            : null;
          ({ session, run } = await this.updateRun(session, run, {
            ...createModelTelemetryPatch(turn),
            ...(rescuedFromSuppressedArtifact && "structured" in rescuedFromSuppressedArtifact
              ? createModelTelemetryPatch({
                  suppressedToolRescued: true,
                  suppressedToolName: rescuedFromSuppressedArtifact.toolName,
                  normalizationSource: "text_tool_artifact",
                  normalizationTier: "artifact_rescue",
                  artifactExtractionShape:
                    rescuedFromSuppressedArtifact.artifactExtractionShape || turn.artifactExtractionShape,
                  repairTierEntered: "artifact_rescue",
                  mutationCoercionMode: "artifact_rescue",
                })
              : rescuedFromSuppressedArtifact && "rejectedReason" in rescuedFromSuppressedArtifact
                ? createModelTelemetryPatch({
                    suppressedToolRescued: false,
                    suppressedToolRejectedReason: rescuedFromSuppressedArtifact.rejectedReason,
                  })
                : {}),
          }));
          structured =
            rescuedFromSuppressedArtifact && "structured" in rescuedFromSuppressedArtifact
              ? rescuedFromSuppressedArtifact.structured
              : turn.response;
        }

        if (shouldRepairForMissingAction({ prompt: input.prompt, mentionContext, run, candidate: structured })) {
          const repaired = await this.recoverActionableTurn({
            auth: input.auth,
            signal: input.signal,
            prompt: input.prompt,
            transcript,
            contextMessage,
            run,
            mentionContext,
            context: mergedContext,
            tools: availableTools,
            latestFileStates,
            callbacks: input.callbacks,
          });
          if (repaired.runPatch) {
            ({ session, run } = await this.updateRun(session, run, repaired.runPatch));
          }
          if (isStructuredTooling(repaired.response)) {
            structured = repaired.response;
          }
        }

        if (!structured) {
          throw new Error("Cutie server did not return a structured tool_batch or final response.");
        }

        if (structured.type === "final") {
          if (shouldRepairForMissingAction({ prompt: input.prompt, mentionContext, run, candidate: structured })) {
            const repaired = await this.recoverActionableTurn({
              auth: input.auth,
              signal: input.signal,
              prompt: input.prompt,
              transcript,
              contextMessage,
              run,
              mentionContext,
              context: mergedContext,
              tools: availableTools,
              latestFileStates,
              callbacks: input.callbacks,
            });
            if (repaired.runPatch) {
              ({ session, run } = await this.updateRun(session, run, repaired.runPatch));
            }
            if (isStructuredTooling(repaired.response)) {
              structured = repaired.response;
            }
          }
        }

        if (structured.type === "final") {
          const needsMutation = shouldKeepPushingForWorkspaceMutation({ prompt: input.prompt, mentionContext, run });
          const needsVerification = shouldKeepPushingForVerification(run);
          if (needsMutation || needsVerification) {
            const repairReason = needsVerification ? "verification_failure" : "missing_mutation";
            const retryStrategy = resolveRetryStrategy({ run, reason: repairReason });
            const deadEndSignature = buildDeadEndSignature({
              note: needsVerification ? "final_without_verification" : "final_without_mutation",
            });
            const repeatedDeadEnd = deadEndAlreadySeen(run.deadEndMemory, deadEndSignature);
            if (mutationGoalRepairCount < maxMutationGoalRepairs) {
              mutationGoalRepairCount += 1;
              const nextAction = needsVerification
                ? "Run a relevant verification tool next, preferably run_command or get_diagnostics."
                : "Choose a real edit tool next instead of stopping early.";
              ({ session, run } = await this.updateRun(session, run, {
                ...createStrategyShiftPatch(
                  run,
                  retryStrategy,
                  retryStrategy === "fallback_strategy" || retryStrategy === "full_rewrite" ? "fallback" : "repair",
                  nextAction,
                  {
                    phase: "repairing",
                    status: "running",
                  }
                ),
                repairAttemptCount: mutationGoalRepairCount,
                escalationState: "none",
                stuckReason: undefined,
                suggestedNextAction: nextAction,
                stallReason: needsVerification
                  ? "Cutie is still missing a real verification step before it can finish."
                  : "Cutie is trying to finish without taking the required edit action.",
                loopPreventionTrigger: repeatedDeadEnd
                  ? "Repeated final attempt without the proof needed to finish."
                  : undefined,
                deadEndMemory: appendDeadEndMemory(run.deadEndMemory, deadEndSignature),
              }));
              transcript.push({
                role: "system",
                content: needsVerification
                  ? [
                      "Repair instruction:",
                      "The workspace change is not fully done yet because verification is still missing.",
                      "Do not finish. Choose a relevant verification tool next, preferably run_command or get_diagnostics.",
                    ].join(" ")
                  : [
                      "Repair instruction:",
                      "A final answer is not enough for this request because the user asked for a code change.",
                      "Continue working until there is a real mutation tool call or a relevant verification-backed completion proof.",
                    ].join(" "),
              });
              await input.callbacks?.onStatusChanged?.(
                needsVerification
                  ? `Cutie is still working because the edit needs proof, and it is switching to ${getCurrentStrategyLabel(run).toLowerCase()} (${mutationGoalRepairCount}/${maxMutationGoalRepairs}).`
                  : `Cutie is refusing to stop early and is switching to ${getCurrentStrategyLabel(run).toLowerCase()} (${mutationGoalRepairCount}/${maxMutationGoalRepairs}).`,
                run
              );
              continue mainLoop;
            }
            return this.enterAutonomyTerminalFailure({
              session,
              run,
              reason: needsVerification
                ? `The model kept trying to finish without completing a real verification step after ${maxMutationGoalRepairs} repair attempts.`
                : `The model kept trying to finish without producing a real file change after ${maxMutationGoalRepairs} repair attempts.`,
              callbacks: input.callbacks,
            });
          }

          const objectiveCheck = validateObjectiveFinalAgainstRun(structured, run);
          if (!objectiveCheck.ok) {
            const nextObjRepair = (run.objectiveRepairCount ?? 0) + 1;
            if (nextObjRepair > objectiveFinalRepairCap) {
              return this.enterAutonomyTerminalFailure({
                session,
                run,
                reason: "Cutie could not get a final answer that satisfies every task objective.",
                callbacks: input.callbacks,
              });
            }
            const simpleDirectRecoveryReady =
              Boolean(run.simpleTaskFastPath) &&
              hasCompletedTargetInspection(run) &&
              !hasSuccessfulWorkspaceMutation(run) &&
              !requiresCodeChangeVerification(run);
            const objectiveNeedsToolForcing = simpleDirectRecoveryReady || nextObjRepair >= 2;
            const objectiveMustRecoverDirectly = simpleDirectRecoveryReady || nextObjRepair >= OBJECTIVE_NO_PROGRESS_REPAIR_CAP;
            const nextAction = objectiveMustRecoverDirectly
              ? "Temporarily suspend objective-finish retries and take a real tool action next."
              : objectiveNeedsToolForcing
                ? "Force a real tool action next instead of another incomplete final."
                : "Correct the final shape and keep moving the task forward.";
            ({ session, run } = await this.updateRun(session, run, {
              ...createActionTrackingPatch(run, `Cutie is correcting an incomplete objective finish (${nextObjRepair}/${objectiveFinalRepairCap}).`, {
                phase: "repairing",
                status: "running",
                objectiveRepairCount: nextObjRepair,
                stallReason: objectiveNeedsToolForcing
                  ? "Objective-finish repairs are not producing new tool work yet."
                  : undefined,
                stallNextAction: nextAction,
                ...(simpleDirectRecoveryReady ? { nextDeterministicAction: nextAction } : {}),
              }),
            }));
            transcript.push({ role: "system", content: objectiveCheck.repairMessage });
            if (objectiveNeedsToolForcing) {
              transcript.push({
                role: "system",
                content: [
                  "Capability escalation:",
                  "Do not answer with another bare final right now.",
                  "Choose a real native tool action next so the run can make new progress before attempting another final.",
                ].join(" "),
              });
            }
            if (objectiveMustRecoverDirectly) {
              const recovered = await this.recoverActionableTurn({
                auth: input.auth,
                signal: input.signal,
                prompt: input.prompt,
                transcript,
                contextMessage,
                run,
                mentionContext,
                context: mergedContext,
                tools: availableTools,
                latestFileStates,
                callbacks: input.callbacks,
              });
              if (recovered.runPatch) {
                ({ session, run } = await this.updateRun(session, run, recovered.runPatch));
              }
              if (isStructuredTooling(recovered.response)) {
                ({ session, run } = await this.updateRun(session, run, {
                  ...createStrategyShiftPatch(
                    run,
                    "force_mutation",
                    "repair",
                    "Take a concrete tool action before attempting another objective final.",
                    {
                      objectiveRepairCount: nextObjRepair,
                      phase: "repairing",
                      status: "running",
                      stallReason: "Objective-finish repair stalled, so Cutie is switching back into direct action.",
                      objectiveSuspendedForDirectRecovery: true,
                      nextDeterministicAction: "Take a concrete tool action before attempting another objective final.",
                    }
                  ),
                }));
                structured = recovered.response;
                await input.callbacks?.onStatusChanged?.(
                  "Cutie is stalled in objective-finish repair and is switching to a direct action strategy.",
                  run
                );
              } else {
                await input.callbacks?.onStatusChanged?.(
                  `Cutie is correcting an incomplete objective finish (${nextObjRepair}/${objectiveFinalRepairCap}).`,
                  run
                );
                continue mainLoop;
              }
            } else {
              await input.callbacks?.onStatusChanged?.(
                objectiveNeedsToolForcing
                  ? `Cutie is stalled in objective-finish repair and is forcing a real tool action next (${nextObjRepair}/${objectiveFinalRepairCap}).`
                  : `Cutie is correcting an incomplete objective finish (${nextObjRepair}/${objectiveFinalRepairCap}).`,
                run
              );
              continue mainLoop;
            }
          }
          if (structured.type === "final") {
            if (objectiveCheck.ok && objectiveCheck.merged.length > 0 && run.objectivesPhase === "active") {
              ({ session, run } = await this.updateRun(session, run, {
                objectives: objectiveCheck.merged,
                objectivesPhase: "completed",
              }));
            }

            const finalText =
              structured.final.trim() ||
              (await this.recoverFinalMessage({
                auth: input.auth,
                signal: input.signal,
                transcript,
                contextMessage,
                run,
                callbacks: input.callbacks,
              }));
            if (!surfacedStreaming && finalText) {
              await input.callbacks?.onAssistantDelta?.(finalText, finalText);
            }
            session = await this.sessionStore.appendMessage(session, {
              role: "assistant",
              content: finalText,
              runId: run.id,
            });
            transcript.push({ role: "assistant", content: finalText });
            await input.callbacks?.onSessionChanged?.(session);
            ({ session, run } = await this.updateRun(session, run, {
              status: "completed",
              phase: "completed",
              goalSatisfied: run.goal === "conversation" ? true : hasCodeChangeCompletionProof(run) || run.goalSatisfied,
              endedAt: nowIso(),
              retryStrategy: "none",
              blockerCategory: undefined,
              loopPreventionTrigger: undefined,
            }));
            await input.callbacks?.onStatusChanged?.("Cutie completed the run.", run);
            return { session, run };
          }
        }

        if (!isStructuredTooling(structured)) {
          continue mainLoop;
        }

        let batchToolCalls: CutieToolCall[] = [];
        batchResolve: while (true) {
          batchToolCalls = buildToolCallBatchFromStructured({
            structured,
            maxBatch: maxBatchConfigured,
            run,
            mentionContext,
            context: mergedContext,
            latestFileStates,
          });

          if (!shouldBlockObserveOnlyBatchAfterInspection(run.goal, run, batchToolCalls)) {
            break batchResolve;
          }

          if (mutationGoalRepairCount < maxMutationGoalRepairs) {
            mutationGoalRepairCount += 1;
            const retryStrategy = resolveRetryStrategy({ run, reason: "missing_mutation" });
            const nextAction =
              retryStrategy === "command_repair"
                ? "Use a relevant command-assisted edit or verification path next."
                : retryStrategy === "full_rewrite"
                  ? "Escalate to a full rewrite if a surgical patch still is not happening."
                  : "Move from inspection into a concrete edit tool next.";
            ({ session, run } = await this.updateRun(session, run, {
              ...createStrategyShiftPatch(
                run,
                retryStrategy,
                retryStrategy === "fallback_strategy" || retryStrategy === "full_rewrite" ? "fallback" : "repair",
                nextAction,
                {
                  phase: "repairing",
                  status: "running",
                }
              ),
              repairAttemptCount: mutationGoalRepairCount,
              escalationState: "none",
              stuckReason: undefined,
              suggestedNextAction: nextAction,
              stallReason: "Inspection is not turning into a concrete edit yet.",
            }));
            transcript.push({
              role: "system",
              content: buildPostInspectionMutationInstruction({
                prompt: input.prompt,
                run,
                mentionContext,
                context: mergedContext,
                latestFileStates,
              }),
            });
            const tryMidLoopRecover = mutationGoalRepairCount >= 2;
            if (tryMidLoopRecover) {
              await input.callbacks?.onStatusChanged?.(
                "Cutie is stalled in inspection and is drafting a concrete edit with a stronger strategy.",
                run
              );
              const early = await this.recoverActionableTurn({
                auth: input.auth,
                signal: input.signal,
                prompt: input.prompt,
                transcript,
                contextMessage,
                run,
                mentionContext,
                context: mergedContext,
                tools: availableTools,
                latestFileStates,
                callbacks: input.callbacks,
              });
              if (early.runPatch) {
                ({ session, run } = await this.updateRun(session, run, early.runPatch));
              }
              if (
                isStructuredTooling(early.response) &&
                toolStructuredShowsProgressAfterInspection({
                  goal: run.goal,
                  run,
                  structured: early.response,
                  maxBatch: maxBatchConfigured,
                  mentionContext,
                  context: mergedContext,
                  latestFileStates,
                })
              ) {
                structured = early.response;
                continue batchResolve;
              }
              await input.callbacks?.onStatusChanged?.(
                `Cutie is stalled in inspection and is redirecting into ${getCurrentStrategyLabel(run).toLowerCase()} (${mutationGoalRepairCount}/${maxMutationGoalRepairs}).`,
                run
              );
              continue mainLoop;
            }
            await input.callbacks?.onStatusChanged?.(
              `Cutie is redirecting inspection into ${getCurrentStrategyLabel(run).toLowerCase()} (${mutationGoalRepairCount}/${maxMutationGoalRepairs}).`,
              run
            );
            continue mainLoop;
          }

          await input.callbacks?.onStatusChanged?.(
            "Cutie is stalled in inspection and is forcing the strongest direct edit recovery path.",
            run
          );
          const rescued = await this.recoverActionableTurn({
            auth: input.auth,
            signal: input.signal,
            prompt: input.prompt,
            transcript,
            contextMessage,
            run,
            mentionContext,
            context: mergedContext,
            tools: availableTools,
            latestFileStates,
            callbacks: input.callbacks,
          });
          if (rescued.runPatch) {
            ({ session, run } = await this.updateRun(session, run, rescued.runPatch));
          }
          if (
            isStructuredTooling(rescued.response) &&
            toolStructuredShowsProgressAfterInspection({
              goal: run.goal,
              run,
              structured: rescued.response,
              maxBatch: maxBatchConfigured,
              mentionContext,
              context: mergedContext,
              latestFileStates,
            })
          ) {
            structured = rescued.response;
            continue batchResolve;
          }
          return this.enterAutonomyTerminalFailure({
            session,
            run,
            reason: describeInspectionStallReason(run, maxMutationGoalRepairs),
            callbacks: input.callbacks,
          });
        }

        if (!batchToolCalls.length) {
          continue mainLoop;
        }

        if (run.objectivesPhase === "active" && run.objectives?.length) {
          ({ session, run } = await this.updateRun(session, run, {
            objectiveRepairCount: 0,
          }));
        }

        transcript.push({
          role: "assistant",
          content: formatStructuredResponse(buildAssistantStructuredFromBatch(batchToolCalls)),
        });

        for (const toolCall of batchToolCalls) {
          if (input.signal?.aborted) {
            throw new Error("Request aborted");
          }
          if (run.stepCount >= run.maxSteps) {
            throw new Error(`Cutie stopped because it reached the ${run.maxSteps} step limit.`);
          }

          const toolKey = buildToolCallKey(toolCall);
          const repeatedCallCount = toolKey === previousToolKey ? run.repeatedCallCount + 1 : 1;
          previousToolKey = toolKey;

          ({ session, run } = await this.updateRun(session, run, {
            ...createActionTrackingPatch(run, `Cutie is running ${toolCall.name}.`),
            repeatedCallCount,
            lastToolName: toolCall.name,
            phase: "executing_tool",
            status: "running",
            stepCount: run.stepCount + 1,
            ...(run.suppressedToolRescued && run.suppressedToolName === toolCall.name
              ? { executedRecoveredArtifact: true }
              : {}),
          }));

          if (repeatedCallCount > CUTIE_MAX_IDENTICAL_CALLS) {
            if (
              shouldRedirectRepeatedReadFile({ prompt: input.prompt, mentionContext, run, toolName: toolCall.name }) ||
              shouldKeepPushingForVerification(run)
            ) {
              if (mutationGoalRepairCount < maxMutationGoalRepairs) {
                mutationGoalRepairCount += 1;
                const retryStrategy = resolveRetryStrategy({ run, reason: "repeat_identical" });
                const deadEndSignature = buildDeadEndSignature({
                  toolCall,
                  note: shouldKeepPushingForVerification(run) ? "repeated_verification_call" : "repeated_identical_call",
                });
                const nextAction = shouldKeepPushingForVerification(run)
                  ? "Choose a different verification or repair path now."
                  : "Stop re-reading the same target and choose a concrete edit path now.";
                ({ session, run } = await this.updateRun(session, run, {
                  ...createStrategyShiftPatch(
                    run,
                    retryStrategy,
                    retryStrategy === "fallback_strategy" ? "fallback" : "repair",
                    nextAction,
                    {
                      phase: "repairing",
                      status: "running",
                    }
                  ),
                  repairAttemptCount: mutationGoalRepairCount,
                  escalationState: "none",
                  stuckReason: undefined,
                  suggestedNextAction: nextAction,
                  stallReason: shouldKeepPushingForVerification(run)
                    ? "The same verification path repeated without unlocking new progress."
                    : "The same inspection path repeated without moving to a concrete edit.",
                  loopPreventionTrigger: deadEndAlreadySeen(run.deadEndMemory, deadEndSignature)
                    ? "The same tool path repeated without new evidence."
                    : undefined,
                  deadEndMemory: appendDeadEndMemory(run.deadEndMemory, deadEndSignature),
                }));
                transcript.push({
                  role: "system",
                  content: shouldKeepPushingForVerification(run)
                    ? [
                        "Repair instruction:",
                        "The same verification path repeated without resolving the task.",
                        "Choose a different verification step or repair strategy now.",
                      ].join(" ")
                    : [
                        "Repair instruction:",
                        "The file has already been read.",
                        "Do not call read_file again for the same target.",
                        "Choose patch_file, write_file, or a relevant run_command now.",
                      ].join(" "),
                });
                await input.callbacks?.onStatusChanged?.(
                  shouldKeepPushingForVerification(run)
                    ? `Cutie is redirecting a repeated verification path into ${getCurrentStrategyLabel(run).toLowerCase()} (${mutationGoalRepairCount}/${maxMutationGoalRepairs}).`
                    : `Cutie is redirecting repeated file inspection into ${getCurrentStrategyLabel(run).toLowerCase()} (${mutationGoalRepairCount}/${maxMutationGoalRepairs}).`,
                  run
                );
                continue mainLoop;
              }
              return this.enterAutonomyTerminalFailure({
                session,
                run,
                reason: shouldKeepPushingForVerification(run)
                  ? `Cutie stayed stuck trying to verify the task without making new progress after ${maxMutationGoalRepairs} repair attempts.`
                  : describeInspectionStallReason(run, maxMutationGoalRepairs),
                callbacks: input.callbacks,
              });
            }
            throw new Error(`Cutie stopped after repeating ${toolCall.name} without making progress.`);
          }

          if (isWorkspaceMutationTool(toolCall.name) && !this.toolRegistry.getCurrentCheckpoint()) {
            const checkpointResult = await this.toolRegistry.createAutomaticCheckpoint(
              "Automatic checkpoint before the first workspace mutation."
            );
            if (checkpointResult.checkpoint) {
              ({ session, run } = await this.updateRun(session, run, {
                checkpoint: checkpointResult.checkpoint,
              }));
            }
            session = await this.sessionStore.appendMessage(session, {
              role: "system",
              content: checkpointResult.summary,
              runId: run.id,
            });
            transcript.push({
              role: "system",
              content: buildToolResultMessage(checkpointResult),
            });
            await input.callbacks?.onSessionChanged?.(session);
          }

          if (isWorkspaceMutationTool(toolCall.name) && run.workspaceMutationCount >= run.maxWorkspaceMutations) {
            throw new Error(`Cutie stopped because it reached the ${run.maxWorkspaceMutations} workspace mutation limit.`);
          }
          if (isDesktopMutationTool(toolCall.name) && run.desktopMutationCount >= run.maxDesktopMutations) {
            throw new Error(`Cutie stopped because it reached the ${run.maxDesktopMutations} desktop mutation limit.`);
          }

          await input.callbacks?.onStatusChanged?.(
            toolCall.summary ? `Cutie is ${toolCall.summary}.` : `Cutie is running ${toolCall.name}.`,
            run
          );

          const validatedTool = validateAndNormalizeToolCall({ toolCall, run });
          const effectiveToolCall = validatedTool.toolCall || toolCall;
          const toolStartedAt = nowIso();
          const toolResult =
            shouldBlockBroadWorkspaceProbe({
              prompt: input.prompt,
              mentionContext,
              run,
              toolName: effectiveToolCall.name,
            })
              ? createBroadWorkspaceProbeResult(effectiveToolCall)
              : validatedTool.toolCall === null && validatedTool.error && effectiveToolCall.name === "search_workspace"
                ? createInvalidSearchQueryResult(effectiveToolCall, validatedTool.error)
                : shouldBlockRedundantFullRead({
                      toolCall: effectiveToolCall,
                      latestFileStates,
                    })
                  ? createRedundantReadResult(effectiveToolCall)
                  : repeatedCallCount === CUTIE_MAX_IDENTICAL_CALLS
                    ? createRepeatedCallResult(effectiveToolCall)
                    : await this.toolRegistry.execute(effectiveToolCall, {
                    signal: input.signal,
                  });
          const receipt = createReceipt(run.stepCount, effectiveToolCall, toolResult, toolStartedAt);

          const workspaceMutationCount =
            run.workspaceMutationCount + (toolResult.ok && isWorkspaceMutationTool(effectiveToolCall.name) ? 1 : 0);
          const desktopMutationCount =
            run.desktopMutationCount + (toolResult.ok && isDesktopMutationTool(effectiveToolCall.name) ? 1 : 0);
          const madeMeaningfulProgress = isMeaningfulProgressReceiptForRun(run.goal, run, receipt);
          const verificationOutcome = buildVerificationOutcome(effectiveToolCall, toolResult);
          const verificationFailure = isVerificationFailure(effectiveToolCall, toolResult, run);
          const noOpConclusion =
            toolResult.ok && effectiveToolCall.name === "run_command"
              ? inferNoOpConclusionFromCommandResult({
                  taskFrame: run.taskFrame,
                  preferredTargetPath: run.preferredTargetPath,
                  command: toolResult.data?.command,
                  stdout: toolResult.data?.stdout,
                })
              : null;
          const mutationValidationError =
            !toolResult.ok && (effectiveToolCall.name === "patch_file" || effectiveToolCall.name === "write_file")
              ? String(toolResult.error || toolResult.summary || "").trim()
              : "";
          const patchSchemaFailure =
            effectiveToolCall.name === "patch_file" &&
            /edits must be a non-empty array|startline must be a valid number/i.test(mutationValidationError);
          const disablePatchesForRun =
            patchSchemaFailure &&
            Boolean(run.simpleTaskFastPath) &&
            (Boolean(run.lastMutationValidationError) || countReceipts(run, "patch_file", "failed") >= 1);
          const latestActionSummary = `Step ${receipt.step}: ${receipt.summary}${receipt.error ? ` ${receipt.error}` : ""}`.trim();
          const receiptRepairTactic: CutieRepairTactic | undefined =
            receipt.toolName === "read_file"
              ? "semantic_search"
              : receipt.toolName === "search_workspace"
                ? (run.currentRepairTactic === "example_search" ? "example_search" : "semantic_search")
                : receipt.toolName === "patch_file" || receipt.toolName === "write_file"
                  ? "verification"
                  : receipt.toolName === "run_command" || receipt.toolName === "get_diagnostics"
                    ? "verification"
                    : run.currentRepairTactic;
          const receiptTargetPhase =
            receiptRepairTactic === "semantic_search" || receiptRepairTactic === "example_search"
              ? "semantic_recovery"
              : receiptRepairTactic === "verification"
                ? "verification"
                : receiptRepairTactic === "patch_mutation" || receiptRepairTactic === "full_rewrite"
                  ? "mutation"
                  : run.targetAcquisitionPhase;
          const evidenceSummary =
            noOpConclusion ||
            (madeMeaningfulProgress
              ? receipt.summary
              : receipt.toolName === "search_workspace" && typeof receipt.data?.query === "string"
                ? `Searched for ${String(receipt.data.query)} in the workspace.`
                : run.lastNewEvidence);

          ({ session, run } = await this.updateRun(session, run, {
            receipts: [...run.receipts, receipt],
            workspaceMutationCount,
            desktopMutationCount,
            lastActionAtStep: receipt.step,
            lastActionSummary: latestActionSummary,
            ...(receipt.toolName !== "read_file"
              ? {
                  postInspectionRecoveryActive: false,
                }
              : {}),
            ...(madeMeaningfulProgress
                ? {
                  ...createMeaningfulProgressPatch(run, receipt.summary, {
                    lastActionAtStep: receipt.step,
                    lastActionSummary: latestActionSummary,
                    lastMeaningfulProgressAtStep: receipt.step,
                    lastMeaningfulProgressSummary: receipt.summary,
                    objectiveRepairCount: 0,
                    ...(evidenceSummary ? { lastNewEvidence: evidenceSummary } : {}),
                    ...(receiptRepairTactic ? { currentRepairTactic: receiptRepairTactic } : {}),
                    ...(receiptTargetPhase ? { targetAcquisitionPhase: receiptTargetPhase } : {}),
                    ...(receipt.toolName !== "read_file"
                      ? {
                          postInspectionRecoveryActive: false,
                          postInspectionFailureReason: undefined,
                        }
                      : {}),
                  }),
                  stuckReason: undefined,
                  suggestedNextAction: undefined,
                  escalationState: "none" as CutieEscalationState,
                }
              : {
                  noProgressTurns: Math.max(0, run.noProgressTurns ?? 0),
                  ...(evidenceSummary ? { lastNewEvidence: evidenceSummary } : {}),
                }
              ),
            ...(verificationOutcome
              ? {
                  lastVerifiedOutcome: verificationOutcome,
                }
              : {}),
            ...(toolResult.ok && isWorkspaceMutationTool(effectiveToolCall.name)
              ? {
                  strategyPhase: "verify" as CutieStrategyPhase,
                  progressConfidence: "medium" as CutieProgressConfidence,
                  retryStrategy: "none" as CutieRetryStrategy,
                  blockerCategory: undefined,
                  loopPreventionTrigger: undefined,
                }
              : {}),
            ...(noOpConclusion
              ? {
                  noOpConclusion,
                  lastVerifiedOutcome: noOpConclusion,
                  goalSatisfied: true,
                  progressConfidence: "high" as CutieProgressConfidence,
                  currentRepairTactic: "verification" as CutieRepairTactic,
                  targetAcquisitionPhase: "verification" as CutieTargetAcquisitionPhase,
                }
              : {}),
            ...(toolResult.checkpoint ? { checkpoint: toolResult.checkpoint } : {}),
            ...(mutationValidationError ? { lastMutationValidationError: mutationValidationError } : {}),
            ...(validatedTool.validatedSearchQuery ? { validatedSearchQuery: validatedTool.validatedSearchQuery } : {}),
            ...(validatedTool.blockedInvalidSearchQuery !== undefined
              ? { blockedInvalidSearchQuery: validatedTool.blockedInvalidSearchQuery || "<empty>" }
              : {}),
            ...((validatedTool.blockedInvalidSearchQuery !== undefined || patchSchemaFailure)
              ? {
                  repairTierEntered: "payload_validation" as const,
                  normalizationTier: "validation_coercion" as const,
                }
              : {}),
            ...(patchSchemaFailure
              ? {
                  mutationCoercionMode: disablePatchesForRun ? "patch_disabled_write_mode" : "patch_argument_coercion",
                }
              : {}),
            ...(disablePatchesForRun ? { patchDisabledForRun: true } : {}),
          }));

          rememberLatestFileStateFromToolResult(latestFileStates, receipt.step, effectiveToolCall, toolResult);

          if (
            toolResult.ok &&
            (isWorkspaceMutationTool(effectiveToolCall.name) ||
              effectiveToolCall.name === "run_command" ||
              effectiveToolCall.name === "get_diagnostics" ||
              Boolean(noOpConclusion))
          ) {
            mutationGoalRepairCount = 0;
            ({ session, run } = await this.updateRun(session, run, {
              repairAttemptCount: 0,
              retryStrategy: "none",
              ...(verificationOutcome
                ? {
                    strategyPhase: "verify" as CutieStrategyPhase,
                    progressConfidence: "high" as CutieProgressConfidence,
                    goalSatisfied: true,
                    blockerCategory: undefined,
                    loopPreventionTrigger: undefined,
                  }
                : {}),
              ...(noOpConclusion
                ? {
                    strategyPhase: "verify" as CutieStrategyPhase,
                    progressConfidence: "high" as CutieProgressConfidence,
                    blockerCategory: undefined,
                    loopPreventionTrigger: undefined,
                  }
                : {}),
            }));
          }

          if (toolResult.snapshot) {
            session = await this.sessionStore.attachSnapshot(session, toolResult.snapshot);
          }

          session = await this.sessionStore.appendMessage(session, {
            role: "system",
            content: toolResult.ok
              ? `Step ${run.stepCount}: ${toolResult.summary}`
              : `Step ${run.stepCount}: ${toolResult.summary}${toolResult.error ? ` ${toolResult.error}` : ""}`,
            runId: run.id,
          });
          transcript.push({
            role: "system",
            content: buildToolResultMessage(toolResult),
          });
          await input.callbacks?.onSessionChanged?.(session);

          if (
            toolResult.ok &&
            (effectiveToolCall.name === "write_file" || effectiveToolCall.name === "patch_file") &&
            toolResult.data &&
            typeof (toolResult.data as Record<string, unknown>).path === "string"
          ) {
            const payload = toolResult.data as Record<string, unknown>;
            await input.callbacks?.onWorkspaceFileMutated?.({
              sessionId: session.id,
              runId: run.id,
              relativePath: String(payload.path),
              toolName: effectiveToolCall.name,
              previousContent: typeof payload.previousContent === "string" ? payload.previousContent : "",
              ...(typeof payload.nextContent === "string" ? { nextContent: payload.nextContent } : {}),
              ...(typeof payload.revisionId === "string" ? { revisionId: payload.revisionId } : {}),
            });
          }

          if (verificationFailure && toolResult.ok && mutationGoalRepairCount < maxMutationGoalRepairs) {
            mutationGoalRepairCount += 1;
            const retryStrategy = resolveRetryStrategy({ run, reason: "verification_failure" });
            const deadEndSignature = buildDeadEndSignature({
              toolCall: effectiveToolCall,
              receipt,
              note: "verification_failure",
            });
            const nextAction = "Repair the code or run a more relevant verification step next.";
            ({ session, run } = await this.updateRun(session, run, {
              ...createStrategyShiftPatch(
                run,
                retryStrategy,
                retryStrategy === "fallback_strategy" ? "fallback" : "repair",
                nextAction,
                {
                  phase: "repairing",
                  status: "running",
                }
              ),
              repairAttemptCount: mutationGoalRepairCount,
              escalationState: "none",
              stuckReason: undefined,
              suggestedNextAction: nextAction,
              stallReason: "The latest verification did not unlock a completed result yet.",
              blockerCategory: "validation",
              loopPreventionTrigger: deadEndAlreadySeen(run.deadEndMemory, deadEndSignature)
                ? "Repeated verification result with unresolved diagnostics."
                : undefined,
              deadEndMemory: appendDeadEndMemory(run.deadEndMemory, deadEndSignature),
            }));
            transcript.push({
              role: "system",
              content: [
                "Repair instruction:",
                `The verification step found a blocker: ${toolResult.summary}`,
                "Repair the code or choose a different relevant verification step. Do not finish yet.",
              ].join("\n"),
            });
            await input.callbacks?.onStatusChanged?.(
              `Cutie is switching to ${getCurrentStrategyLabel(run).toLowerCase()} after verification found unresolved issues (${mutationGoalRepairCount}/${maxMutationGoalRepairs}).`,
              run
            );
            continue mainLoop;
          }

          if (!toolResult.ok) {
            if (
              toolResult.blocked &&
              (repeatedCallCount === CUTIE_MAX_IDENTICAL_CALLS ||
                shouldKeepPushingForWorkspaceMutation({ prompt: input.prompt, mentionContext, run }))
            ) {
              await input.callbacks?.onStatusChanged?.(
                "Cutie redirected an unhelpful tool call and is trying a different next step.",
                run
              );
              continue mainLoop;
            }
            if (isRetryableEditFailure(toolCall, toolResult, run) && mutationGoalRepairCount < maxMutationGoalRepairs) {
              mutationGoalRepairCount += 1;
              const retryStrategy = resolveRetryStrategy({
                run,
                reason: String(toolResult.error || "").toLowerCase().includes("stale_revision")
                  ? "stale_revision"
                  : "mutation_failure",
              });
              const deadEndSignature = buildDeadEndSignature({ toolCall, receipt, note: "retryable_edit_failure" });
              const nextAction =
                retryStrategy === "refresh_state"
                  ? "Refresh the target state, then retry the edit with the latest revision."
                  : retryStrategy === "full_rewrite"
                    ? "Escalate from patch repair into a full rewrite."
                    : "Retry the edit using a stronger mutation path.";
              ({ session, run } = await this.updateRun(session, run, {
                ...createStrategyShiftPatch(
                  run,
                  retryStrategy,
                  retryStrategy === "full_rewrite" || retryStrategy === "fallback_strategy" ? "fallback" : "repair",
                  nextAction,
                  {
                    phase: "repairing",
                    status: "running",
                  }
                ),
                repairAttemptCount: mutationGoalRepairCount,
                escalationState: "none",
                stuckReason: undefined,
                suggestedNextAction: nextAction,
                stallReason: "The last edit attempt failed without unlocking a completed change yet.",
                loopPreventionTrigger: deadEndAlreadySeen(run.deadEndMemory, deadEndSignature)
                  ? "Repeated edit failure with no new file state."
                  : undefined,
                deadEndMemory: appendDeadEndMemory(run.deadEndMemory, deadEndSignature),
              }));

              const latestState = getPreferredRuntimeFileState({
                run,
                mentionContext,
                context: mergedContext,
                latestFileStates,
              });
              const readPath = latestState?.path || "";
              const readContent = latestState?.full ? latestState.content : "";

              if (shouldForceWriteFileRepair(run) && readPath && readContent) {
                await input.callbacks?.onStatusChanged?.(
                  `Cutie is promoting failed edits to a full-file rewrite (${mutationGoalRepairCount}/${maxMutationGoalRepairs}).`,
                  run
                );
                const forcedWriteTurn = await this.requestStructuredTurn({
                  auth: input.auth,
                  signal: input.signal,
                  tools: availableTools,
                  maxToolsPerBatch: 1,
                  messages: buildForcedWriteFileInstruction({
                    prompt: input.prompt,
                    readPath,
                    readContent,
                    revisionId: latestState?.revisionId,
                  }),
                  stream: false,
                }).catch(() => null);
                const forcedStructured = forcedWriteTurn?.response || null;
                if (forcedStructured?.type === "tool_call" && forcedStructured.tool_call.name === "write_file") {
                  injectedPlanningTool = forcedStructured;
                  transcript.push({
                    role: "system",
                    content:
                      "Repeated targeted patch failures were detected. Cutie will run a single write_file with full file content from the model.",
                  });
                  continue mainLoop;
                }
              }

              transcript.push({
                role: "system",
                content: buildRetryableEditFailureInstruction({
                  prompt: input.prompt,
                  toolCall,
                  toolResult,
                  run,
                  mentionContext,
                  context: mergedContext,
                  latestFileStates,
                }),
              });
              await input.callbacks?.onStatusChanged?.(
                `Cutie is switching to ${getCurrentStrategyLabel(run).toLowerCase()} after a failed edit attempt (${mutationGoalRepairCount}/${maxMutationGoalRepairs}).`,
                run
              );
              continue mainLoop;
            }
            if (
              run.goal === "code_change" &&
              !toolResult.blocked &&
              mutationGoalRepairCount < maxMutationGoalRepairs &&
              isGenericMutationRepairEligible(toolCall, toolResult, run)
            ) {
              mutationGoalRepairCount += 1;
              const retryStrategy = verificationFailure
                ? resolveRetryStrategy({ run, reason: "verification_failure" })
                : resolveRetryStrategy({ run, reason: "generic_failure" });
              const deadEndSignature = buildDeadEndSignature({
                toolCall,
                receipt,
                note: verificationFailure ? "verification_failure" : "generic_failure",
              });
              const nextAction = verificationFailure
                ? "Repair the code or choose a more relevant verification step."
                : "Use a stronger recovery tactic instead of repeating the same tool failure.";
              ({ session, run } = await this.updateRun(session, run, {
                ...createStrategyShiftPatch(
                  run,
                  retryStrategy,
                  retryStrategy === "fallback_strategy" || retryStrategy === "full_rewrite" ? "fallback" : "repair",
                  nextAction,
                  {
                    phase: "repairing",
                    status: "running",
                  }
                ),
                repairAttemptCount: mutationGoalRepairCount,
                escalationState: "none",
                stuckReason: undefined,
                suggestedNextAction: nextAction,
                stallReason: verificationFailure
                  ? "The verification failure did not unlock a completed result."
                  : "This tool failure did not produce useful new progress yet.",
                blockerCategory: verificationFailure ? "validation" : undefined,
                loopPreventionTrigger: deadEndAlreadySeen(run.deadEndMemory, deadEndSignature)
                  ? "Repeated failed repair path with the same tool result."
                  : undefined,
                deadEndMemory: appendDeadEndMemory(run.deadEndMemory, deadEndSignature),
              }));
              transcript.push({
                role: "system",
                content: verificationFailure
                  ? [
                      "Repair instruction:",
                      `The verification step failed: ${toolResult.error || toolResult.summary}`,
                      "Do not stop yet.",
                      "Either repair the code and verify again, or choose a different concrete verification step if the previous one was the wrong check.",
                    ].join("\n")
                  : buildGenericMutationFailureRepairInstruction({
                      prompt: input.prompt,
                      toolCall,
                      toolResult,
                      run,
                      mentionContext,
                      context: mergedContext,
                      latestFileStates,
                    }),
              });
              await input.callbacks?.onStatusChanged?.(
                verificationFailure
                  ? `Cutie is switching to ${getCurrentStrategyLabel(run).toLowerCase()} after a failed verification step (${mutationGoalRepairCount}/${maxMutationGoalRepairs}).`
                  : `Cutie is switching to ${getCurrentStrategyLabel(run).toLowerCase()} after a failed tool call (${mutationGoalRepairCount}/${maxMutationGoalRepairs}).`,
                run
              );
              continue mainLoop;
            }
            if (run.goal === "code_change") {
              return this.enterAutonomyTerminalFailure({
                session,
                run,
                reason: toolResult.error || toolResult.summary,
                callbacks: input.callbacks,
              });
            }
            const failureMessage = toolResult.blocked
              ? `I stopped because ${toolResult.error || toolResult.summary}`
              : `I ran into a problem with ${toolCall.name}: ${toolResult.error || toolResult.summary}`;
            session = await this.sessionStore.appendMessage(session, {
              role: "assistant",
              content: failureMessage,
              runId: run.id,
            });
            transcript.push({ role: "assistant", content: failureMessage });
            await input.callbacks?.onSessionChanged?.(session);
            ({ session, run } = await this.updateRun(session, run, {
              status: "failed",
              phase: "failed",
              error: toolResult.error || toolResult.summary,
              endedAt: nowIso(),
            }));
            await input.callbacks?.onStatusChanged?.("Cutie stopped after a blocked or failed tool call.", run);
            return { session, run };
          }
        }
      }
    } catch (error) {
      const rawMessage = error instanceof Error ? error.message : String(error);
      const friendlyHttp = humanizeCutieHostHttpError(error);
      let message =
        String(friendlyHttp || rawMessage || "").trim() ||
        "Cutie could not get a usable planning response from the model.";
      const isCanceled = /aborted|cancelled|canceled/i.test(message);
      if (!isCanceled && run.goal === "code_change" && !run.goalSatisfied) {
        message = describePlanningFailureAfterInspection(run, message);
      }
      if (!isCanceled && run.goal === "code_change" && !run.goalSatisfied) {
        return this.enterAutonomyTerminalFailure({
          session,
          run,
          reason: message,
          callbacks: input.callbacks,
        });
      }
      session = await this.sessionStore.appendMessage(session, {
        role: "assistant",
        content: isCanceled ? "Run cancelled." : `Cutie stopped: ${message}`,
        runId: run.id,
      });
      await input.callbacks?.onSessionChanged?.(session);
      ({ session, run } = await this.updateRun(session, run, {
        status: isCanceled ? "canceled" : "failed",
        phase: isCanceled ? "canceled" : "failed",
        strategyPhase: isCanceled ? "blocked" : "blocked",
        ...(isCanceled ? {} : { blockerCategory: inferBlockerCategoryFromMessage(message) }),
        error: isCanceled ? undefined : message,
        endedAt: nowIso(),
      }));
      await input.callbacks?.onStatusChanged?.(
        isCanceled ? "Cutie run cancelled." : "Cutie run stopped early.",
        run
      );
      return { session, run };
    }
  }

  private async decomposeObjectivesTurn(input: {
    auth: RequestAuth;
    signal?: AbortSignal;
    prompt: string;
    mentionContext: { mentionedPaths: string[]; mentionedWindows: string[] };
  }): Promise<Array<{ id: string; text: string }>> {
    const userTask = trimToLimit(stripMentionTokens(input.prompt) || input.prompt, 4_000);
    const mentioned = stableJson({
      mentionedPaths: input.mentionContext.mentionedPaths,
      mentionedWindows: input.mentionContext.mentionedWindows,
    });
    const turn = await this.modelAdapter
      .requestTurn({
        auth: input.auth,
        signal: input.signal,
        desiredMode: "final_only",
        messages: [
          {
            role: "system",
            content: [
              "You decompose a user task into an ordered checklist for an autonomous coding agent.",
              "Output ONLY a single minified JSON object, no markdown, no prose:",
              '{"type":"objectives","objectives":[{"id":"1","text":"..."},...]}',
              "Use 3 to 12 objectives; each id is a short unique string; text is one actionable sentence; order matters.",
              "Objectives must be concrete (e.g. read target files, implement change, verify).",
            ].join("\n"),
          },
          { role: "user", content: `Task:\n${userTask}\n\nMentions:\n${mentioned}` },
        ],
        tools: [],
        maxToolsPerBatch: 1,
        stream: false,
      })
      .catch(() => ({ response: { type: "final", final: "" }, assistantText: "" }));

    const finalText = turn.response.type === "final" ? turn.response.final : turn.assistantText;
    const parsed = tryParseObjectivesDecomposition(finalText);
    return parsed ?? [];
  }

  private async runInvestigationPreflight(input: { signal?: AbortSignal }): Promise<string> {
    const chunks: string[] = [];
    const gitResult = await this.toolRegistry.execute(
      { id: randomId("cutie_pf"), name: "git_status", arguments: {}, summary: "preflight git status" },
      { signal: input.signal }
    );
    chunks.push(
      gitResult.ok
        ? `git_status:\n${trimToLimit(stableJson(summarizeToolData(gitResult.data)), 3_500)}`
        : `git_status: ${gitResult.error || gitResult.summary}`
    );
    const listResult = await this.toolRegistry.execute(
      {
        id: randomId("cutie_pf"),
        name: "list_files",
        arguments: { query: "", limit: 40 },
        summary: "preflight file listing",
      },
      { signal: input.signal }
    );
    chunks.push(
      listResult.ok
        ? `list_files:\n${trimToLimit(stableJson(summarizeToolData(listResult.data)), 3_500)}`
        : `list_files: ${listResult.error || listResult.summary}`
    );
    return chunks.join("\n\n");
  }

  private async updateRun(
    session: CutieSessionRecord,
    current: CutieRunState,
    patch: Partial<CutieRunState>
  ): Promise<{ session: CutieSessionRecord; run: CutieRunState }> {
    const next: CutieRunState = {
      ...current,
      ...patch,
    };
    next.noProgressTurns = patch.noProgressTurns ?? next.noProgressTurns ?? 0;
    next.stallLevel = patch.stallLevel ?? getStallLevel(next.noProgressTurns);
    if (next.stallLevel === "none") {
      next.stallReason = patch.stallReason ?? undefined;
      next.stallNextAction = patch.stallNextAction ?? undefined;
    }
    if (next.goal === "code_change") {
      next.goalSatisfied = hasCodeChangeCompletionProof(next);
    }
    next.strategyPhase = patch.strategyPhase ?? getPreferredStrategyPhase(next);
    next.progressConfidence = patch.progressConfidence ?? getProgressConfidence(next);
    const nextSession = await this.sessionStore.updateRun(session, next);
    return {
      session: nextSession,
      run: next,
    };
  }
}

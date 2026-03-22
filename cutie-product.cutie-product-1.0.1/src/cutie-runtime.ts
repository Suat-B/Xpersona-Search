import type { RequestAuth } from "@xpersona/vscode-core";
import {
  appendDeadEndMemory,
  batchNeedsMoreAutonomy,
  buildDeadEndSignature,
  deadEndAlreadySeen,
  describeAutonomyGap,
  getPreferredStrategyPhase,
  getProgressConfidence,
  hasCodeChangeCompletionProof,
  hasSuccessfulWorkspaceMutation,
  isVerificationReceipt,
  isVerificationToolCall,
  requiresCodeChangeMutation,
  requiresCodeChangeVerification,
  resolveRetryStrategy,
} from "./cutie-autonomy-controller";
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
import { CutieModelClient } from "./cutie-model-client";
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
  CutieModelMessage,
  CutieMentionSuggestion,
  CutieProgressConfidence,
  CutieProtocolToolDefinition,
  CutieRetryStrategy,
  CutieRunObjective,
  CutieRunState,
  CutieSessionRecord,
  CutieStrategyPhase,
  CutieStructuredFinal,
  CutieStructuredResponse,
  CutieTaskGoal,
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
  context?: RuntimeContext
): boolean {
  const settings = context?.cutieDynamicSettings;
  if (!hasConcreteTaskSignals(prompt, mentionContext)) return false;
  if (goal === "code_change") {
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

function buildNativeSystemPrompt(): string {
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
        progressConfidence: input.run.progressConfidence || null,
        retryStrategy: input.run.retryStrategy || null,
        lastVerifiedOutcome: input.run.lastVerifiedOutcome || null,
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
  preferredTargetPath?: string | null
): CutieRunState {
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
    objectivesPhase: "off",
    objectiveRepairCount: 0,
    ...(autonomyMode ? { autonomyMode } : {}),
    ...(preferredTargetPath ? { preferredTargetPath } : {}),
    strategyPhase: goal === "code_change" ? "inspect" : "mutate",
    progressConfidence: goal === "conversation" ? "high" : "low",
    retryStrategy: "none",
    deadEndMemory: [],
  };
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

function buildBootstrapFinalResponse(input: {
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

function classifyTaskGoal(
  prompt: string,
  mentionContext: { mentionedPaths: string[]; mentionedWindows: string[] }
): CutieTaskGoal {
  const smallTalkOnly =
    (isAffectionMessage(prompt) || isSimpleGreeting(prompt)) && !hasConcreteTaskSignals(prompt, mentionContext);
  if (smallTalkOnly) {
    return "conversation";
  }
  const stripped = stripMentionTokens(prompt);
  if (mentionContext.mentionedPaths.length > 0 && !stripped) {
    return "workspace_investigation";
  }
  if (mentionContext.mentionedWindows.length > 0 && !stripped) {
    return "desktop_action";
  }
  if (requestsDesktopAutomation(prompt, mentionContext)) {
    return "desktop_action";
  }
  if (requestsWorkspaceChange(prompt)) {
    return "code_change";
  }
  if (wantsBroadWorkspaceDiscovery(prompt) || /\b(find|search|scan|inspect|explain|review|look through|what does|what files)\b/i.test(prompt)) {
    return "workspace_investigation";
  }
  return "conversation";
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
    return error.includes("stale_revision") || error.includes("invalid_patch");
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
}): string | null {
  const mentionedPath = input.mentionContext.mentionedPaths[0];
  if (mentionedPath) return mentionedPath;
  if (wantsDesktopAction(input.prompt, input.mentionContext)) return null;

  const activeFileRecord = asRecord(input.context.activeFile);
  const activePath =
    typeof activeFileRecord.path === "string" ? normalizeWorkspaceRelativePath(activeFileRecord.path) : undefined;
  const openFilePath = Array.isArray(input.context.openFiles)
    ? input.context.openFiles
        .map((entry) => {
          const row = asRecord(entry);
          return typeof row.path === "string" ? normalizeWorkspaceRelativePath(row.path) : null;
        })
        .find((value): value is string => Boolean(value))
    : undefined;
  return activePath || openFilePath || null;
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

  if (["read_file", "patch_file", "write_file", "mkdir"].includes(input.toolCall.name)) {
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
  return payloads.map((p) =>
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
  );
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

function buildBootstrapToolCall(input: {
  prompt: string;
  context: RuntimeContext;
  mentionContext: { mentionedPaths: string[]; mentionedWindows: string[] };
  run: CutieRunState;
}): CutieToolCall | null {
  if (input.run.stepCount > 0 || input.run.receipts.length > 0) return null;
  if (wantsDesktopAction(input.prompt, input.mentionContext)) return null;
  if (wantsBroadWorkspaceDiscovery(input.prompt)) return null;

  const activeFileRecord = asRecord(input.context.activeFile);
  const activePath =
    typeof activeFileRecord.path === "string" ? normalizeWorkspaceRelativePath(activeFileRecord.path) : undefined;
  const openFilePath = Array.isArray(input.context.openFiles)
    ? input.context.openFiles
        .map((entry) => {
          const row = asRecord(entry);
          return typeof row.path === "string" ? normalizeWorkspaceRelativePath(row.path) : null;
        })
        .find((value): value is string => Boolean(value))
    : undefined;
  const mentionedPath = input.mentionContext.mentionedPaths[0];
  const shouldPreferActiveFile =
    wantsCurrentFileInspection(input.prompt) ||
    (referencesActiveEditingContext(input.prompt) && requestsWorkspaceChange(input.prompt)) ||
    requestsWorkspaceChange(input.prompt);
  const targetPath =
    mentionedPath || input.run.preferredTargetPath || (shouldPreferActiveFile ? activePath || openFilePath : undefined);
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
  if (!requestsWorkspaceChange(input.prompt)) return null;
  if (wantsDesktopAction(input.prompt, input.mentionContext)) return null;

  const activeFileRecord = asRecord(input.context.activeFile);
  const activePath =
    typeof activeFileRecord.path === "string" ? normalizeWorkspaceRelativePath(activeFileRecord.path) : undefined;
  const openFilePath = Array.isArray(input.context.openFiles)
    ? input.context.openFiles
        .map((entry) => {
          const row = asRecord(entry);
          return typeof row.path === "string" ? normalizeWorkspaceRelativePath(row.path) : null;
        })
        .find((value): value is string => Boolean(value))
    : undefined;
  const targetPath = input.mentionContext.mentionedPaths[0] || input.run.preferredTargetPath || activePath || openFilePath;
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
    private readonly modelClient: CutieModelClient,
    private readonly toolRegistry: CutieToolRegistry,
    private readonly getContext: () => Promise<RuntimeContext>
  ) {}

  private async requestStructuredTurn(input: {
    auth: RequestAuth;
    signal?: AbortSignal;
    messages: CutieModelMessage[];
    tools: CutieProtocolToolDefinition[];
    maxToolsPerBatch: number;
    onDelta?: (delta: string, accumulated: string) => void | Promise<void>;
    stream?: boolean;
  }) {
    if (input.stream === false) {
      return this.modelClient.completeStructuredTurn({
        auth: input.auth,
        signal: input.signal,
        messages: input.messages,
        tools: input.tools,
        maxToolsPerBatch: input.maxToolsPerBatch,
      });
    }
    return this.modelClient.streamStructuredTurn({
      auth: input.auth,
      signal: input.signal,
      messages: input.messages,
      tools: input.tools,
      maxToolsPerBatch: input.maxToolsPerBatch,
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

    const recoveryTurn = await this.modelClient
      .completeTurn({
      auth: input.auth,
      signal: input.signal,
      messages: [
        ...input.transcript,
        input.contextMessage,
        {
          role: "system",
          content:
            "Do not call any more tools. Reply to the user now with a concise natural-language final answer based only on the completed tool results.",
        },
      ],
    })
      .catch(() => ({
        rawText: "",
        finalText: "",
        usage: null,
        model: undefined,
      }));

    const parsed = asRecord(extractJsonObject(recoveryTurn.finalText));
    const structuredFinal = String(parsed.final || "").trim();
    if (String(parsed.type || "").trim() === "final" && structuredFinal) return structuredFinal;

    const trimmed = recoveryTurn.finalText.trim();
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
  }): Promise<CutieStructuredResponse | null> {
    const shouldPushWorkspaceMutation = requestsWorkspaceChange(input.prompt) && !hasSuccessfulWorkspaceMutation(input.run);
    const shouldPushVerification = requiresCodeChangeVerification(input.run);
    const shouldPushDesktopAction =
      requestsDesktopAutomation(input.prompt, input.mentionContext) && !hasCompletedDesktopTool(input.run);

    if (!shouldPushWorkspaceMutation && !shouldPushDesktopAction && !shouldPushVerification) {
      return null;
    }

    const preferredTarget = getKnownTargetPath(input.run, input.mentionContext, input.context, input.latestFileStates);
    const alreadyReadTarget = preferredTarget ? hasCompletedTool(input.run, "read_file") : false;
    if (shouldPushWorkspaceMutation && preferredTarget && !alreadyReadTarget) {
      return {
        type: "tool_call",
        tool_call: {
          name: "read_file",
          arguments: { path: preferredTarget, startLine: 1, endLine: 4000 },
          summary: `reading ${preferredTarget} after a weak planning turn`,
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
    if (!structured) {
      return null;
    }
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
      return structured;
    }
    if (structured?.type === "final" && !shouldRepairForMissingAction({ ...input, candidate: structured })) {
      return structured;
    }

    if (shouldPushWorkspaceMutation && hasCompletedTool(input.run, "read_file")) {
      const latestReceipt = input.run.receipts[input.run.receipts.length - 1] || null;
      const latestState = getPreferredRuntimeFileState({
        run: input.run,
        mentionContext: input.mentionContext,
        context: input.context,
        latestFileStates: input.latestFileStates,
      });
      const readPath = latestState?.path || input.mentionContext.mentionedPaths[0] || "";
      const readContent = latestState?.full ? latestState.content : "";
      const readRevisionId = latestState?.revisionId || "";
      const focusedRepairTurn = await this.requestStructuredTurn({
        auth: input.auth,
        signal: input.signal,
        tools: input.tools,
        maxToolsPerBatch: 1,
        messages: [
          {
            role: "system",
            content: [
              "You are Cutie finishing a coding task in VS Code.",
              "The user asked for a code change, the target file has already been read, and no mutation has happened yet.",
              "Do not greet. Do not explain. Do not stop. Choose the next editing tool now.",
              "Do not call read_file again for the same file.",
              "Prefer patch_file when a targeted change is possible. Use write_file only if a full rewrite is truly needed.",
            ].join("\n"),
          },
          {
            role: "user",
            content: trimToLimit(input.prompt, 2_000),
          },
          {
            role: "system",
            content: stableJson({
              mentionedPaths: input.mentionContext.mentionedPaths,
              mentionedWindows: input.mentionContext.mentionedWindows,
              latestReceipt: latestReceipt
                ? {
                    step: latestReceipt.step,
                    toolName: latestReceipt.toolName,
                    summary: latestReceipt.summary,
                    status: latestReceipt.status,
                    data: summarizeToolData(latestReceipt.data),
                  }
                : null,
            }),
          },
        ],
        stream: false,
      }).catch(() => null);

      if (!focusedRepairTurn) {
        return null;
      }

      const focusedStructured = focusedRepairTurn.response;
      if (
        isStructuredTooling(focusedStructured) &&
        toolStructuredShowsProgressAfterInspection({
          goal: input.run.goal,
          run: input.run,
            structured: focusedStructured,
            maxBatch: maxRecBatch,
            mentionContext: input.mentionContext,
            context: input.context,
            latestFileStates: input.latestFileStates,
          })
        ) {
          return focusedStructured;
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
            return forcedWriteStructured;
          }
        }

        await input.callbacks?.onStatusChanged?.("Cutie is drafting the concrete file edit from the inspected file.", input.run);
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
                "Prefer patch_file with a reliable baseRevision and ordered line edits.",
                "Use write_file only if a targeted patch is not enough.",
              ].join("\n"),
            },
            {
              role: "user",
              content: [
                `Task:\n${trimToLimit(input.prompt, 2_000)}`,
                `Target path:\n${readPath}`,
                readRevisionId ? `Current revisionId:\n${readRevisionId}` : "",
                `Current file content:\n${trimToLimit(readContent, 8_000)}`,
              ].join("\n\n"),
            },
          ],
          stream: false,
        }).catch(() => null);

        if (!directEditTurn) {
          return null;
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
          return directStructured;
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
          return lastResortWriteStructured;
        }
      }
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
          return verificationStructured;
        }
      }

      if (targetPath) {
        return {
          type: "tool_call",
          tool_call: {
            name: "get_diagnostics",
            arguments: { path: targetPath },
            summary: `verifying ${targetPath}`,
          },
        };
      }
    }

    return null;
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
    await input.callbacks?.onSessionChanged?.(session);

    ({ session, run } = await this.updateRun(session, run, {
      status: "failed",
      phase: "failed",
      escalationState: "none",
      goalSatisfied: false,
      stuckReason: reason,
      suggestedNextAction: undefined,
      strategyPhase: "blocked",
      blockerCategory: inferBlockerCategoryFromMessage(reason),
      error: reason,
      endedAt: nowIso(),
    }));
    await input.callbacks?.onStatusChanged?.("Cutie stopped without completing the run.", run);
    return { session, run };
  }

  async runPrompt(input: {
    auth: RequestAuth;
    session: CutieSessionRecord;
    prompt: string;
    mentions?: CutieMentionSuggestion[];
    signal?: AbortSignal;
    callbacks?: CutieRuntimeCallbacks;
  }): Promise<{ session: CutieSessionRecord; run: CutieRunState }> {
    const startedAt = Date.now();
    const mentionContext = extractMentionContext(input.prompt, input.mentions);
    const goal = classifyTaskGoal(input.prompt, mentionContext);
    let session = await this.sessionStore.appendMessage(input.session, {
      role: "user",
      content: input.prompt,
    });
    await input.callbacks?.onSessionChanged?.(session);

    const initialContext = await this.getContext();
    const budget = resolveRunBudgetFromContext(initialContext);
    const preferredTargetPath = resolvePreferredTargetPath({
      prompt: input.prompt,
      mentionContext,
      context: initialContext,
    });
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
            objectiveBasedRuns: initialContext.cutieDynamicSettings?.objectiveBasedRuns,
          })
        : undefined;
    let run = createInitialRunState(session.id, goal, budget, autonomyMode, preferredTargetPath);
    session = await this.sessionStore.appendRun(session, run);
    await input.callbacks?.onSessionChanged?.(session);
    await input.callbacks?.onStatusChanged?.("Cutie is collecting context.", run);

    const transcript: CutieModelMessage[] = [
      {
        role: "system",
        content: buildNativeSystemPrompt(),
      },
      ...toTranscriptMessages(session),
    ];
    const availableTools = this.toolRegistry.listDefinitions();

    if (shouldUseObjectiveMode(goal, input.prompt, mentionContext, initialContext)) {
      ({ session, run } = await this.updateRun(session, run, {
        phase: "collecting_context",
        objectivesPhase: "decomposing",
        status: "running",
      }));
      await input.callbacks?.onSessionChanged?.(session);
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
    const bootstrapFinalResponse = buildBootstrapFinalResponse({
      prompt: input.prompt,
      mentionContext,
    });

    if (bootstrapFinalResponse) {
      session = await this.sessionStore.appendMessage(session, {
        role: "assistant",
        content: bootstrapFinalResponse,
        runId: run.id,
      });
      await input.callbacks?.onSessionChanged?.(session);
      ({ session, run } = await this.updateRun(session, run, {
        status: "completed",
        phase: "completed",
        goalSatisfied: true,
        endedAt: nowIso(),
      }));
      await input.callbacks?.onStatusChanged?.("Cutie completed the run.", run);
      return { session, run };
    }

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
          hasCompletedRead: hasCompletedTool(run, "read_file"),
          hasCompletedMutation: hasCompletedMutation(run),
          hasVerifiedOutcome: hasCodeChangeCompletionProof(run),
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

        let surfacedStreaming = false;
        ({ session, run } = await this.updateRun(session, run, { phase: "planning", status: "running" }));
        await input.callbacks?.onStatusChanged?.(`Cutie is planning step ${run.stepCount + 1}.`, run);

        const bootstrapToolCall = buildBootstrapToolCall({
          prompt: input.prompt,
          context,
          mentionContext,
          run,
        });

        let structured: CutieStructuredResponse | null = null;
        if (injectedPlanningTool) {
          structured = injectedPlanningTool;
          injectedPlanningTool = null;
        } else if (bootstrapToolCall) {
          structured = {
            type: "tool_call",
            tool_call: {
              name: bootstrapToolCall.name,
              arguments: bootstrapToolCall.arguments,
              ...(bootstrapToolCall.summary ? { summary: bootstrapToolCall.summary } : {}),
            },
          };
        } else {
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
          structured = turn.response;
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
          if (isStructuredTooling(repaired)) {
            structured = repaired;
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
            if (isStructuredTooling(repaired)) {
              structured = repaired;
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
              ({ session, run } = await this.updateRun(session, run, {
                phase: "repairing",
                status: "running",
                repairAttemptCount: mutationGoalRepairCount,
                escalationState: "none",
                stuckReason: undefined,
                suggestedNextAction: needsVerification
                  ? "Run a relevant verification step before finishing."
                  : "Choose the next concrete edit tool instead of stopping.",
                retryStrategy,
                strategyPhase:
                  retryStrategy === "fallback_strategy" || retryStrategy === "full_rewrite" ? "fallback" : "repair",
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
                  ? `Cutie is continuing because the edit still needs proof (${mutationGoalRepairCount}/${maxMutationGoalRepairs}).`
                  : `Cutie is continuing instead of stopping early (${mutationGoalRepairCount}/${maxMutationGoalRepairs}).`,
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
            ({ session, run } = await this.updateRun(session, run, {
              objectiveRepairCount: nextObjRepair,
              phase: "repairing",
              status: "running",
            }));
            transcript.push({ role: "system", content: objectiveCheck.repairMessage });
            await input.callbacks?.onStatusChanged?.(
              `Cutie is correcting an incomplete objective finish (${nextObjRepair}/${objectiveFinalRepairCap}).`,
              run
            );
            continue mainLoop;
          }
          if (objectiveCheck.merged.length > 0 && run.objectivesPhase === "active") {
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
            ({ session, run } = await this.updateRun(session, run, {
              phase: "repairing",
              status: "running",
              repairAttemptCount: mutationGoalRepairCount,
              escalationState: "none",
              stuckReason: undefined,
              suggestedNextAction: undefined,
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
                "Cutie is drafting a concrete edit after repeated inspection-only plans.",
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
              if (
                isStructuredTooling(early) &&
                toolStructuredShowsProgressAfterInspection({
                  goal: run.goal,
                  run,
                  structured: early,
                  maxBatch: maxBatchConfigured,
                  mentionContext,
                  context: mergedContext,
                  latestFileStates,
                })
              ) {
                structured = early;
                continue batchResolve;
              }
              await input.callbacks?.onStatusChanged?.(
                `Cutie is redirecting inspection into a concrete edit (${mutationGoalRepairCount}/${maxMutationGoalRepairs}).`,
                run
              );
              continue mainLoop;
            }
            await input.callbacks?.onStatusChanged?.(
              `Cutie is redirecting inspection into a concrete edit (${mutationGoalRepairCount}/${maxMutationGoalRepairs}).`,
              run
            );
            continue mainLoop;
          }

          await input.callbacks?.onStatusChanged?.(
            "Cutie is forcing a concrete edit plan after repeated inspection-only replies.",
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
          if (
            isStructuredTooling(rescued) &&
            toolStructuredShowsProgressAfterInspection({
              goal: run.goal,
              run,
              structured: rescued,
              maxBatch: maxBatchConfigured,
              mentionContext,
              context: mergedContext,
              latestFileStates,
            })
          ) {
            structured = rescued;
            continue batchResolve;
          }
          return this.enterAutonomyTerminalFailure({
            session,
            run,
            reason: `Cutie stayed stuck in file inspection instead of moving to an edit after ${maxMutationGoalRepairs} repair attempts.`,
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
            repeatedCallCount,
            lastToolName: toolCall.name,
            phase: "executing_tool",
            status: "running",
            stepCount: run.stepCount + 1,
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
                ({ session, run } = await this.updateRun(session, run, {
                  phase: "repairing",
                  status: "running",
                  repairAttemptCount: mutationGoalRepairCount,
                  escalationState: "none",
                  stuckReason: undefined,
                  suggestedNextAction: undefined,
                  retryStrategy,
                  strategyPhase: retryStrategy === "fallback_strategy" ? "fallback" : "repair",
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
                    ? `Cutie is redirecting a repeated verification path (${mutationGoalRepairCount}/${maxMutationGoalRepairs}).`
                    : `Cutie is redirecting repeated file inspection into an edit path (${mutationGoalRepairCount}/${maxMutationGoalRepairs}).`,
                  run
                );
                continue mainLoop;
              }
              return this.enterAutonomyTerminalFailure({
                session,
                run,
                reason: shouldKeepPushingForVerification(run)
                  ? `Cutie stayed stuck trying to verify the task without making new progress after ${maxMutationGoalRepairs} repair attempts.`
                  : `Cutie stayed stuck in file inspection instead of moving to an edit after ${maxMutationGoalRepairs} repair attempts.`,
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

          const toolStartedAt = nowIso();
          const toolResult =
            shouldBlockBroadWorkspaceProbe({
              prompt: input.prompt,
              mentionContext,
              run,
              toolName: toolCall.name,
            })
              ? createBroadWorkspaceProbeResult(toolCall)
              : repeatedCallCount === CUTIE_MAX_IDENTICAL_CALLS
                ? createRepeatedCallResult(toolCall)
                : await this.toolRegistry.execute(toolCall, {
                    signal: input.signal,
                  });
          const receipt = createReceipt(run.stepCount, toolCall, toolResult, toolStartedAt);

          const workspaceMutationCount =
            run.workspaceMutationCount + (toolResult.ok && isWorkspaceMutationTool(toolCall.name) ? 1 : 0);
          const desktopMutationCount =
            run.desktopMutationCount + (toolResult.ok && isDesktopMutationTool(toolCall.name) ? 1 : 0);
          const madeMeaningfulProgress = isMeaningfulProgressReceipt(run.goal, receipt);
          const verificationOutcome = buildVerificationOutcome(toolCall, toolResult);
          const verificationFailure = isVerificationFailure(toolCall, toolResult, run);

          ({ session, run } = await this.updateRun(session, run, {
            receipts: [...run.receipts, receipt],
            workspaceMutationCount,
            desktopMutationCount,
            ...(madeMeaningfulProgress
              ? {
                  lastMeaningfulProgressAtStep: receipt.step,
                  lastMeaningfulProgressSummary: receipt.summary,
                  stuckReason: undefined,
                  suggestedNextAction: undefined,
                  escalationState: "none" as CutieEscalationState,
                }
              : {}),
            ...(verificationOutcome
              ? {
                  lastVerifiedOutcome: verificationOutcome,
                }
              : {}),
            ...(toolResult.ok && isWorkspaceMutationTool(toolCall.name)
              ? {
                  strategyPhase: "verify" as CutieStrategyPhase,
                  progressConfidence: "medium" as CutieProgressConfidence,
                  retryStrategy: "none" as CutieRetryStrategy,
                  blockerCategory: undefined,
                  loopPreventionTrigger: undefined,
                }
              : {}),
            ...(toolResult.checkpoint ? { checkpoint: toolResult.checkpoint } : {}),
          }));

          rememberLatestFileStateFromToolResult(latestFileStates, receipt.step, toolCall, toolResult);

          if (toolResult.ok && (isWorkspaceMutationTool(toolCall.name) || toolCall.name === "run_command" || toolCall.name === "get_diagnostics")) {
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
            (toolCall.name === "write_file" || toolCall.name === "patch_file") &&
            toolResult.data &&
            typeof (toolResult.data as Record<string, unknown>).path === "string"
          ) {
            const payload = toolResult.data as Record<string, unknown>;
            await input.callbacks?.onWorkspaceFileMutated?.({
              sessionId: session.id,
              runId: run.id,
              relativePath: String(payload.path),
              toolName: toolCall.name,
              previousContent: typeof payload.previousContent === "string" ? payload.previousContent : "",
              ...(typeof payload.nextContent === "string" ? { nextContent: payload.nextContent } : {}),
              ...(typeof payload.revisionId === "string" ? { revisionId: payload.revisionId } : {}),
            });
          }

          if (verificationFailure && toolResult.ok && mutationGoalRepairCount < maxMutationGoalRepairs) {
            mutationGoalRepairCount += 1;
            const retryStrategy = resolveRetryStrategy({ run, reason: "verification_failure" });
            const deadEndSignature = buildDeadEndSignature({
              toolCall,
              receipt,
              note: "verification_failure",
            });
            ({ session, run } = await this.updateRun(session, run, {
              phase: "repairing",
              status: "running",
              repairAttemptCount: mutationGoalRepairCount,
              escalationState: "none",
              stuckReason: undefined,
              suggestedNextAction: "Repair the code or run a more relevant verification step.",
              retryStrategy,
              strategyPhase: retryStrategy === "fallback_strategy" ? "fallback" : "repair",
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
              `Cutie is repairing after verification found unresolved issues (${mutationGoalRepairCount}/${maxMutationGoalRepairs}).`,
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
              ({ session, run } = await this.updateRun(session, run, {
                phase: "repairing",
                status: "running",
                repairAttemptCount: mutationGoalRepairCount,
                escalationState: "none",
                stuckReason: undefined,
                suggestedNextAction: undefined,
                retryStrategy,
                strategyPhase:
                  retryStrategy === "full_rewrite" || retryStrategy === "fallback_strategy" ? "fallback" : "repair",
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
                `Cutie is correcting a failed edit attempt (${mutationGoalRepairCount}/${maxMutationGoalRepairs}).`,
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
              ({ session, run } = await this.updateRun(session, run, {
                phase: "repairing",
                status: "running",
                repairAttemptCount: mutationGoalRepairCount,
                escalationState: "none",
                stuckReason: undefined,
                suggestedNextAction: undefined,
                retryStrategy,
                strategyPhase:
                  retryStrategy === "fallback_strategy" || retryStrategy === "full_rewrite" ? "fallback" : "repair",
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
                  ? `Cutie is repairing after a failed verification step (${mutationGoalRepairCount}/${maxMutationGoalRepairs}).`
                  : `Cutie is recovering from a failed tool call (${mutationGoalRepairCount}/${maxMutationGoalRepairs}).`,
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
      const message =
        String(friendlyHttp || rawMessage || "").trim() ||
        "Cutie could not get a usable planning response from the model.";
      const isCanceled = /aborted|cancelled|canceled/i.test(message);
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
    const turn = await this.modelClient
      .completeTurn({
        auth: input.auth,
        signal: input.signal,
        temperature: 0.2,
        maxTokens: 900,
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
      })
      .catch(() => ({ finalText: "" }));

    const parsed = tryParseObjectivesDecomposition(turn.finalText);
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

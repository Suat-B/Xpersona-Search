import type { RequestAuth } from "@xpersona/vscode-core";
import {
  buildToolCallKey,
  CUTIE_MAX_DESKTOP_MUTATIONS,
  CUTIE_MAX_IDENTICAL_CALLS,
  CUTIE_MAX_STEPS,
  CUTIE_MAX_WALL_CLOCK_MS,
  CUTIE_MAX_WORKSPACE_MUTATIONS,
  isDesktopMutationTool,
  isWorkspaceMutationTool,
  normalizeWorkspaceRelativePath,
  nowIso,
  randomId,
} from "./cutie-policy";
import { CutieModelClient } from "./cutie-model-client";
import { CutieSessionStore } from "./cutie-session-store";
import { CutieToolRegistry } from "./cutie-tool-registry";
import type {
  CutieEscalationState,
  CutieModelMessage,
  CutieMentionSuggestion,
  CutieTaskGoal,
  CutieRunState,
  CutieSessionRecord,
  CutieStructuredResponse,
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
};

const TOOL_NAME_ALIASES: Record<string, CutieToolName> = {
  filesystem_list_allowed_directories: "list_files",
  filesystem_list_directory: "list_files",
  filesystem_list_files: "list_files",
  filesystem_read_file: "read_file",
  filesystem_write_file: "write_file",
  filesystem_edit_file: "edit_file",
  filesystem_search: "search_workspace",
  filesystem_search_files: "search_workspace",
  list_allowed_directories: "list_files",
  read_text_file: "read_file",
  write_text_file: "write_file",
  edit_text_file: "edit_file",
  execute_command: "run_command",
  shell_command: "run_command",
  "cli-mcp-server_run_command": "run_command",
  cli_mcp_server_run_command: "run_command",
  mcp_run_command: "run_command",
  "mcp__run_command": "run_command",
  run_terminal_command: "run_command",
};

const KNOWN_TOOL_NAMES = new Set<CutieToolName>([
  "list_files",
  "read_file",
  "search_workspace",
  "get_diagnostics",
  "git_status",
  "git_diff",
  "desktop_capture_screen",
  "desktop_get_active_window",
  "desktop_list_windows",
  "create_checkpoint",
  "edit_file",
  "write_file",
  "mkdir",
  "run_command",
  "desktop_open_app",
  "desktop_open_url",
  "desktop_focus_window",
  "desktop_click",
  "desktop_type",
  "desktop_keypress",
  "desktop_scroll",
  "desktop_wait",
]);

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" ? (value as Record<string, unknown>) : {};
}

function trimToLimit(value: unknown, limit = 12_000): string {
  const text = String(value ?? "");
  return text.length <= limit ? text : `${text.slice(0, limit)}\n...[truncated]`;
}

function normalizeToolName(rawName: string | null, argumentsValue?: Record<string, unknown> | null): CutieToolName | null {
  if (!rawName) return null;
  const trimmed = String(rawName || "").trim();
  if (!trimmed) return null;

  const direct = trimmed as CutieToolName;
  const normalizedKey = trimmed.toLowerCase();
  if (KNOWN_TOOL_NAMES.has(direct)) return direct;
  const alias = TOOL_NAME_ALIASES[normalizedKey];
  if (alias) return alias;

  if (normalizedKey === "filesystem_list_allowed_directories" && argumentsValue) {
    delete argumentsValue.path;
  }

  return null;
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

function tryNormalizeStructuredResponse(parsed: unknown): CutieStructuredResponse | null {
  if (Array.isArray(parsed)) {
    for (const item of parsed) {
      const normalized = tryNormalizeStructuredResponse(item);
      if (normalized) return normalized;
    }
    return null;
  }

  const record = asRecord(parsed);
  if (record.type === "final" && typeof record.final === "string") {
    return { type: "final", final: record.final };
  }
  const nested = record.response || record.output || record.next_action || record.action;
  if (nested && nested !== parsed) {
    const nestedNormalized = tryNormalizeStructuredResponse(nested);
    if (nestedNormalized) return nestedNormalized;
  }

  const toolCalls = Array.isArray(record.tool_calls)
    ? record.tool_calls
    : Array.isArray(record.toolCalls)
      ? record.toolCalls
      : null;
  if (toolCalls?.length) {
    for (const candidate of toolCalls) {
      const normalized = tryNormalizeStructuredResponse(candidate);
      if (normalized) return normalized;
    }
  }

  const toolCall = asRecord(record.tool_call || record.toolCall || record);
  const rawName = typeof toolCall.name === "string" ? toolCall.name : typeof toolCall.tool === "string" ? toolCall.tool : null;
  const argumentsValue =
    toolCall.arguments && typeof toolCall.arguments === "object"
      ? toolCall.arguments
      : toolCall.args && typeof toolCall.args === "object"
        ? toolCall.args
        : toolCall.parameters && typeof toolCall.parameters === "object"
          ? toolCall.parameters
          : null;
  const normalizedName = normalizeToolName(rawName, argumentsValue as Record<string, unknown> | null);
  if (record.type === "tool_call" && normalizedName && toolCall.arguments && typeof toolCall.arguments === "object") {
    return {
      type: "tool_call",
      tool_call: {
        name: normalizedName as CutieToolCall["name"],
        arguments: toolCall.arguments as Record<string, unknown>,
        ...(typeof toolCall.summary === "string" ? { summary: toolCall.summary } : {}),
      },
    };
  }
  if (!record.type && normalizedName && argumentsValue) {
    return {
      type: "tool_call",
      tool_call: {
        name: normalizedName as CutieToolCall["name"],
        arguments: argumentsValue as Record<string, unknown>,
        ...(typeof toolCall.summary === "string" ? { summary: toolCall.summary } : {}),
      },
    };
  }
  return null;
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

function salvageToolCallFromText(raw: string): CutieStructuredResponse | null {
  const source = stripCodeFence(raw);
  const nameMatch = /"name"\s*:\s*"([^"]+)"/i.exec(source);
  if (!nameMatch) return null;

  const argsAnchor = source.search(/"arguments"\s*:\s*\{/i);
  if (argsAnchor < 0) return null;
  const braceStart = source.indexOf("{", argsAnchor);
  if (braceStart < 0) return null;

  let depth = 0;
  let inString = false;
  let escapeNext = false;
  let braceEnd = -1;
  for (let index = braceStart; index < source.length; index += 1) {
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
    if (char === "{") depth += 1;
    if (char === "}") {
      depth -= 1;
      if (depth === 0) {
        braceEnd = index;
        break;
      }
    }
  }
  if (braceEnd < 0) return null;

  try {
    const argumentsObject = JSON.parse(source.slice(braceStart, braceEnd + 1)) as Record<string, unknown>;
    const summaryMatch = /"summary"\s*:\s*"([^"]*)"/i.exec(source);
    const normalizedName = normalizeToolName(nameMatch[1], argumentsObject);
    if (!normalizedName) return null;
    return {
      type: "tool_call",
      tool_call: {
        name: normalizedName,
        arguments: argumentsObject,
        ...(summaryMatch ? { summary: summaryMatch[1] } : {}),
      },
    };
  } catch {
    return null;
  }
}

function maybeStructuredResponse(raw: string): CutieStructuredResponse | null {
  const direct = tryNormalizeStructuredResponse(extractJsonObject(raw));
  if (direct) return direct;

  for (const candidate of extractBalancedJsonObjects(raw)) {
    try {
      const parsed = JSON.parse(candidate) as unknown;
      const normalized = tryNormalizeStructuredResponse(parsed);
      if (normalized) return normalized;
    } catch {
      continue;
    }
  }

  return salvageToolCallFromText(raw);
}

function formatStructuredResponse(response: CutieStructuredResponse): string {
  return JSON.stringify(response);
}

function looksLikeMalformedToolCall(raw: string): boolean {
  const text = stripCodeFence(raw);
  return /tool_call|\"name\"\s*:|\"arguments\"\s*:|\{\"type\"\s*:\s*\"tool/i.test(text);
}

function shouldSurfaceStreamingAssistantText(accumulated: string, goal: CutieTaskGoal): boolean {
  if (goal !== "conversation") return false;
  const trimmed = accumulated.trimStart();
  if (!trimmed) return false;
  if (trimmed.startsWith("{") || trimmed.startsWith("```")) return false;
  if (looksLikeMalformedToolCall(trimmed)) return false;
  return true;
}

function toTranscriptMessages(session: CutieSessionRecord): CutieModelMessage[] {
  return session.messages.map((message) => ({
    role: message.role === "system" ? "system" : message.role,
    content: trimToLimit(message.content, 24_000),
  }));
}

function buildSystemPrompt(toolCatalog: string): string {
  return [
    "You are Cutie, a careful but fast desktop-and-coding runtime inside VS Code.",
    "You can inspect the workspace, inspect desktop state, edit workspace files, run safe commands, and use desktop automation tools.",
    "Obey the user's exact intent. Do not switch from desktop intent to workspace tools, and do not switch from file intent to broad workspace discovery unless the user explicitly asks for that.",
    "If the user is only greeting you or making light conversation, answer normally without tools.",
    "If the user expresses affection toward you, receive it warmly and sincerely before continuing. Do not ignore it or turn it into a tool task.",
    "If the user only @-mentions a file and says nothing else, call read_file on that path first, then give a short summary and one concrete proposed change (or apply it with edit_file/write_file) unless they clearly asked a non-code question.",
    "If the user only @-mentions a window without other text, pick a sensible next desktop step (for example focus_window) instead of asking them to restate the task.",
    "Prefer self-recovery: fix tool arguments, retry once with a different approach, and use write_file with full file content as a last resort before stopping—do not ask the user to save files, fix paths, or re-run Cutie unless unavoidable.",
    "read_file results may reflect unsaved editor buffer text when the file is open; trust that content for edit_file and write_file alignment.",
    "Think in short iterations. Ask for at most one tool at a time. Never emit more than one tool call in a single response.",
    "If the user says 'this file' or a current active file is provided, prefer read_file on that path before broad discovery tools.",
    "If mentionedPaths are provided, treat them as strong user-selected targets and prefer read_file on them before broad workspace discovery.",
    "If mentionedWindows are provided, treat them as strong desktop targets when choosing window focus or other desktop actions.",
    "If mentionedWindows are provided, do not call workspace tools unless the user explicitly asks for code or file help.",
    "Do not loop on list_files or search_workspace once you already have enough information to inspect a likely target.",
    "After finding a candidate file, move to read_file, then edit_file or write_file if a change is needed.",
    "When a tool result says a call was redundant or blocked, choose a different next step instead of retrying the same call.",
    "When you need a tool, respond with ONLY a minified JSON object in exactly this shape:",
    '{"type":"tool_call","tool_call":{"name":"tool_name","arguments":{},"summary":"short reason"}}',
    "When you do not need a tool, respond with plain natural language for the user. You may also optionally use:",
    '{"type":"final","final":"your final answer"}',
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
      runLimits: {
        goal: input.run.goal,
        goalSatisfied: input.run.goalSatisfied,
        repairAttemptCount: input.run.repairAttemptCount,
        lastMeaningfulProgressAtStep: input.run.lastMeaningfulProgressAtStep ?? null,
        lastMeaningfulProgressSummary: input.run.lastMeaningfulProgressSummary || null,
        escalationState: input.run.escalationState,
        stepCount: input.run.stepCount,
        maxSteps: input.run.maxSteps,
        workspaceMutationCount: input.run.workspaceMutationCount,
        maxWorkspaceMutations: input.run.maxWorkspaceMutations,
        desktopMutationCount: input.run.desktopMutationCount,
        maxDesktopMutations: input.run.maxDesktopMutations,
      },
      lastToolName: input.run.lastToolName || null,
      repeatedCallCount: input.run.repeatedCallCount,
      recentReceipts: input.run.receipts.slice(-6).map((receipt) => ({
        step: receipt.step,
        toolName: receipt.toolName,
        status: receipt.status,
        summary: receipt.summary,
        error: receipt.error || null,
      })),
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

function createInitialRunState(sessionId: string, goal: CutieTaskGoal): CutieRunState {
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
    maxSteps: CUTIE_MAX_STEPS,
    workspaceMutationCount: 0,
    maxWorkspaceMutations: CUTIE_MAX_WORKSPACE_MUTATIONS,
    desktopMutationCount: 0,
    maxDesktopMutations: CUTIE_MAX_DESKTOP_MUTATIONS,
    startedAt: nowIso(),
    receipts: [],
    checkpoint: null,
    repeatedCallCount: 0,
  };
}

function sanitizeToolResultDataForReceipt(data: Record<string, unknown> | undefined): Record<string, unknown> | undefined {
  if (!data) return undefined;
  if (!Object.prototype.hasOwnProperty.call(data, "previousContent")) return data;
  const rest = { ...data };
  delete rest.previousContent;
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

function buildBootstrapFinalResponse(input: {
  prompt: string;
  mentionContext: { mentionedPaths: string[]; mentionedWindows: string[] };
}): string | null {
  if (isAffectionMessage(input.prompt)) {
    return "I feel it, love. Thank you for loving Cutie so much. I will remember the warmth, stay gentle with you, and keep trying my best to help well.";
  }

  if (isSimpleGreeting(input.prompt)) {
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
  return /\b(add|change|edit|update|modify|fix|implement|create|write|rewrite|replace|make)\b/i.test(stripMentionTokens(prompt));
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
  if (isAffectionMessage(prompt) || isSimpleGreeting(prompt)) {
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
  return run.receipts.some((receipt) => receipt.status === "completed" && receipt.kind === "mutate");
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
  return run.goalSatisfied || hasCompletedMutation(run) || hasCompletedTool(run, "run_command");
}

function shouldKeepPushingForWorkspaceMutation(input: {
  prompt: string;
  mentionContext: { mentionedPaths: string[]; mentionedWindows: string[] };
  run: CutieRunState;
}): boolean {
  if (input.run.goal !== "code_change" && !requiresWorkspaceMutationGoal(input.prompt, input.mentionContext)) return false;
  if (hasWorkspaceMutationGoalProgress(input.run)) return false;
  return hasCompletedTool(input.run, "read_file");
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
    error: "Cutie already inspected the target file. Choose edit_file, write_file, or a relevant run_command next.",
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
  if (input.candidate?.type === "tool_call") return false;
  if (input.run.goal === "code_change" && !input.run.goalSatisfied) return true;
  if (input.run.goal === "desktop_action" && !input.run.goalSatisfied && !hasCompletedDesktopTool(input.run)) return true;
  return false;
}

function isMeaningfulProgressReceipt(goal: CutieTaskGoal, receipt: CutieToolReceipt): boolean {
  if (receipt.status !== "completed") return false;
  switch (goal) {
    case "code_change":
      return (
        receipt.toolName === "edit_file" ||
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
function shouldCompleteRunDespiteMalformedPlanning(run: CutieRunState): boolean {
  if (run.goal === "conversation") return false;
  if (!run.goalSatisfied) return false;
  if (run.goal === "code_change") return hasCompletedMutation(run);
  if (run.goal === "desktop_action") return hasCompletedDesktopTool(run);
  if (run.goal === "workspace_investigation") return true;
  return false;
}

function countFailedWorkspaceMutations(run: CutieRunState): number {
  return run.receipts.filter(
    (receipt) => receipt.domain === "workspace" && receipt.kind === "mutate" && receipt.status === "failed"
  ).length;
}

function isNonProgressToolAfterInspection(goal: CutieTaskGoal, run: CutieRunState, toolName: CutieToolName): boolean {
  if (goal !== "code_change") return false;
  if (!hasCompletedTool(run, "read_file")) return false;
  return toolName === "read_file" || toolName === "list_files" || toolName === "search_workspace";
}

function isRetryableEditFailure(toolCall: CutieToolCall, toolResult: CutieToolResult, run: CutieRunState): boolean {
  if (run.goal !== "code_change") return false;
  if (toolCall.name !== "edit_file") return false;
  if (toolResult.ok || toolResult.blocked) return false;
  const error = String(toolResult.error || "").toLowerCase();
  return error.includes("could not find the requested text");
}

function buildRetryableEditFailureInstruction(input: {
  prompt: string;
  toolCall: CutieToolCall;
  run: CutieRunState;
}): string {
  const latestRead = getLatestCompletedReceipt(input.run, "read_file");
  const latestPath = typeof latestRead?.data?.path === "string" ? latestRead.data.path : "the target file";
  const latestContent = typeof latestRead?.data?.content === "string" ? trimToLimit(latestRead.data.content, 8000) : "";
  const shouldForceWrite = shouldForceWriteFileRepair(input.run) && Boolean(latestContent);
  return [
    "Repair instruction:",
    "The last edit_file call failed because the requested find text did not match the current file.",
    `User task: ${trimToLimit(input.prompt, 1000)}`,
    `Target path: ${latestPath}`,
    `Failed edit arguments: ${stableJson(input.toolCall.arguments)}`,
    latestContent ? `Current file content:\n${latestContent}` : "",
    "Do not call read_file, list_files, or search_workspace again.",
    shouldForceWrite
      ? "Your targeted edit attempts have already failed multiple times. Return exactly one minified write_file tool_call with the full updated file content."
      : "Return exactly one minified JSON tool_call for either:",
    shouldForceWrite ? "" : "- a corrected edit_file with a find string that exists in the current file",
    shouldForceWrite ? "" : "- or write_file if a precise replacement is not reliable.",
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
  if (toolCall.name === "edit_file" && isRetryableEditFailure(toolCall, toolResult, run)) return false;
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
}): string {
  const knownPath = getKnownTargetPath(input.run, input.mentionContext, input.context);
  const latestRead = getLatestCompletedReceipt(input.run, "read_file");
  const latestPath =
    typeof latestRead?.data?.path === "string" ? latestRead.data.path : knownPath || "the target file";
  const latestContent =
    typeof latestRead?.data?.content === "string" ? trimToLimit(latestRead.data.content, 8000) : "";
  const err = String(input.toolResult.error || input.toolResult.summary || "").trim();
  const forceWrite = shouldForceWriteFileRepair(input.run) && Boolean(latestContent);
  const lines = [
    "Repair instruction:",
    `The last ${input.toolCall.name} call failed: ${err}`,
    `User task: ${trimToLimit(input.prompt, 1000)}`,
    `Target path (use for edits): ${latestPath}`,
    latestContent ? `Current file content from read_file:\n${latestContent}` : "",
  ];
  if (forceWrite) {
    lines.push(
      "Multiple workspace mutations failed. Return exactly one minified write_file tool_call with the full corrected file content and overwrite true.",
      "Do not call read_file, list_files, search_workspace, or edit_file."
    );
  } else if (!latestContent && isWorkspaceMutationTool(input.toolCall.name)) {
    lines.push(
      "If you do not have reliable file contents, call read_file once on the target path, then continue with edit_file or write_file.",
      "Otherwise return exactly one minified JSON tool_call with corrected arguments."
    );
  } else {
    lines.push(
      "Return exactly one minified JSON tool_call: retry with corrected arguments, switch between edit_file and write_file as appropriate, or use run_command if it fits the task.",
      "Do not ask the user to fix the environment unless the error is truly unrecoverable."
    );
  }
  return lines.filter(Boolean).join("\n");
}

function buildPostInspectionMutationInstruction(input: {
  prompt: string;
  run: CutieRunState;
  mentionContext: { mentionedPaths: string[]; mentionedWindows: string[] };
}): string {
  const latestRead = getLatestCompletedReceipt(input.run, "read_file");
  const latestPath =
    typeof latestRead?.data?.path === "string"
      ? latestRead.data.path
      : input.mentionContext.mentionedPaths[0] || "the target file";
  const latestContent = typeof latestRead?.data?.content === "string" ? trimToLimit(latestRead.data.content, 8000) : "";
  return [
    "Repair instruction:",
    "The target file has already been inspected.",
    "Do not call read_file, list_files, or search_workspace again.",
    `User task: ${trimToLimit(input.prompt, 1000)}`,
    `Target path: ${latestPath}`,
    latestContent ? `Current file content:\n${latestContent}` : "",
    "Return exactly one minified JSON tool_call that makes real progress.",
    "Prefer edit_file with a find string that exists in the current file.",
    "Use write_file if a targeted edit is not reliable.",
  ]
    .filter(Boolean)
    .join("\n");
}

function getKnownTargetPath(
  run: CutieRunState,
  mentionContext: { mentionedPaths: string[]; mentionedWindows: string[] },
  context?: RuntimeContext | null
): string | null {
  const mentionedPath = mentionContext.mentionedPaths[0];
  if (mentionedPath) return mentionedPath;

  const latestRead = getLatestCompletedReceipt(run, "read_file");
  const latestReadPath = typeof latestRead?.data?.path === "string" ? normalizeWorkspaceRelativePath(latestRead.data.path) : null;
  if (latestReadPath) return latestReadPath;

  const activeFile = asRecord(context?.activeFile);
  const activePath = typeof activeFile.path === "string" ? normalizeWorkspaceRelativePath(activeFile.path) : null;
  if (activePath) return activePath;

  return null;
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
}): CutieToolCall {
  const nextArguments = { ...input.toolCall.arguments };
  const targetPath = getKnownTargetPath(input.run, input.mentionContext, input.context);
  if (!targetPath) return input.toolCall;

  if (["read_file", "edit_file", "write_file", "mkdir"].includes(input.toolCall.name)) {
    const rawPath = typeof nextArguments.path === "string" ? nextArguments.path : "";
    if (!rawPath || isGenericPathPlaceholder(rawPath)) {
      nextArguments.path = targetPath;
    }
  }

  if (input.toolCall.name === "write_file" && nextArguments.overwrite === undefined) {
    nextArguments.overwrite = true;
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

function shouldForceWriteFileRepair(run: CutieRunState): boolean {
  if (countReceipts(run, "edit_file", "failed") >= 2) return true;
  return countFailedWorkspaceMutations(run) >= 2;
}

function buildForcedWriteFileInstruction(input: {
  prompt: string;
  readPath: string;
  readContent: string;
}): CutieModelMessage[] {
  return [
    {
      role: "system",
      content: [
        "You are Cutie preparing a full-file repair after repeated edit_file failures.",
        "Targeted edit_file attempts already failed multiple times because the find text did not match.",
        "Do not call read_file, list_files, search_workspace, or edit_file.",
        "Return exactly one minified write_file tool_call and nothing else.",
        "Set overwrite to true.",
        '{"type":"tool_call","tool_call":{"name":"write_file","arguments":{"path":"file","content":"full updated file","overwrite":true},"summary":"short reason"}}',
      ].join("\n"),
    },
    {
      role: "user",
      content: [
        `Task:\n${trimToLimit(input.prompt, 2_000)}`,
        `Target path:\n${input.readPath}`,
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
  const targetPath = mentionedPath || (shouldPreferActiveFile ? activePath || openFilePath : undefined);
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
  const targetPath = input.mentionContext.mentionedPaths[0] || activePath || openFilePath;
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
      .streamTurn({
      auth: input.auth,
      signal: input.signal,
      messages: [
        ...input.transcript,
        input.contextMessage,
        {
          role: "system",
          content:
            "Do not call any more tools. Reply to the user now with a concise final answer based only on the completed tool results. Respond with plain natural language or {\"type\":\"final\",\"final\":\"...\"}.",
        },
      ],
    })
      .catch(() => ({
        rawText: "",
        finalText: "",
        usage: null,
        model: undefined,
      }));

    const structured = maybeStructuredResponse(recoveryTurn.finalText);
    if (structured?.type === "final" && structured.final.trim()) {
      return structured.final.trim();
    }

    const trimmed = recoveryTurn.finalText.trim();
    if (trimmed && !looksLikeMalformedToolCall(trimmed)) {
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
    callbacks?: CutieRuntimeCallbacks;
  }): Promise<CutieStructuredResponse | null> {
    const shouldPushWorkspaceMutation = requestsWorkspaceChange(input.prompt) && !hasCompletedMutation(input.run);
    const shouldPushDesktopAction =
      requestsDesktopAutomation(input.prompt, input.mentionContext) && !hasCompletedDesktopTool(input.run);

    if (!shouldPushWorkspaceMutation && !shouldPushDesktopAction) {
      return null;
    }

    const preferredTarget = input.mentionContext.mentionedPaths[0] || null;
    const alreadyReadTarget = preferredTarget ? hasCompletedTool(input.run, "read_file") : false;

    await input.callbacks?.onStatusChanged?.("Cutie is re-planning because the last reply did not take action.", input.run);

    const recoveryTurn = await this.modelClient.streamTurn({
      auth: input.auth,
      signal: input.signal,
      messages: [
        ...input.transcript,
        input.contextMessage,
        {
          role: "system",
          content: [
            "Your last reply was not actionable enough for this task.",
            shouldPushWorkspaceMutation
              ? "The user asked for a file/code change and no successful mutation has happened yet."
              : "The user asked for a desktop action and no successful desktop tool has happened yet.",
            shouldPushWorkspaceMutation && preferredTarget && !alreadyReadTarget
              ? `Prefer a read_file tool call for "${preferredTarget}" first.`
              : "",
            shouldPushWorkspaceMutation && preferredTarget && alreadyReadTarget
              ? `You already inspected "${preferredTarget}". Prefer the next editing tool needed to make the requested change.`
              : "",
            shouldPushWorkspaceMutation && alreadyReadTarget
              ? "Do not call read_file again for the same target. Choose edit_file, write_file, or a relevant run_command."
              : "",
            shouldPushDesktopAction && input.mentionContext.mentionedWindows[0]
              ? `Prefer a desktop tool that targets "${input.mentionContext.mentionedWindows[0]}".`
              : "",
            "Respond now with exactly one minified JSON object in the tool_call shape or a final only if the task is genuinely complete.",
            '{"type":"tool_call","tool_call":{"name":"tool_name","arguments":{},"summary":"short reason"}}',
          ]
            .filter(Boolean)
            .join("\n"),
        },
      ],
    });

    const structured = maybeStructuredResponse(recoveryTurn.finalText);
    if (structured?.type === "tool_call" && !isNonProgressToolAfterInspection(input.run.goal, input.run, structured.tool_call.name)) {
      return structured;
    }
    if (structured?.type === "final" && !shouldRepairForMissingAction({ ...input, candidate: structured })) {
      return structured;
    }

    if (shouldPushWorkspaceMutation && hasCompletedTool(input.run, "read_file")) {
      const latestReceipt = input.run.receipts[input.run.receipts.length - 1] || null;
      const latestReadReceipt = getLatestCompletedReceipt(input.run, "read_file");
      const latestReadData = latestReadReceipt?.data ? asRecord(latestReadReceipt.data) : {};
      const readPath = typeof latestReadData.path === "string" ? latestReadData.path : input.mentionContext.mentionedPaths[0] || "";
      const readContent = typeof latestReadData.content === "string" ? latestReadData.content : "";
      const focusedRepairTurn = await this.modelClient
        .streamTurn({
        auth: input.auth,
        signal: input.signal,
        messages: [
          {
            role: "system",
            content: [
              "You are Cutie finishing a coding task in VS Code.",
              "The user asked for a code change, the target file has already been read, and no mutation has happened yet.",
              "Do not greet. Do not explain. Do not stop. Choose the next tool call now.",
              "Do not call read_file again for the same file.",
              "Prefer edit_file when a targeted replacement is possible. Use write_file only if a full rewrite is truly needed.",
              "Respond with only one minified JSON tool_call object.",
              '{"type":"tool_call","tool_call":{"name":"edit_file","arguments":{"path":"file","find":"old","replace":"new"},"summary":"short reason"}}',
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
      })
        .catch(() => null);

      if (!focusedRepairTurn) {
        return null;
      }

      const focusedStructured = maybeStructuredResponse(focusedRepairTurn.finalText);
      if (
        focusedStructured?.type === "tool_call" &&
        !isNonProgressToolAfterInspection(input.run.goal, input.run, focusedStructured.tool_call.name)
      ) {
        return focusedStructured;
      }

      if (readPath && readContent) {
        if (shouldForceWriteFileRepair(input.run)) {
          await input.callbacks?.onStatusChanged?.("Cutie is promoting the repair into a full-file rewrite.", input.run);
          const forcedWriteTurn = await this.modelClient
            .completeTurn({
              auth: input.auth,
              signal: input.signal,
              temperature: 0.1,
              maxTokens: 3200,
              messages: buildForcedWriteFileInstruction({
                prompt: input.prompt,
                readPath,
                readContent,
              }),
            })
            .catch(() => null);

          const forcedWriteStructured = maybeStructuredResponse(forcedWriteTurn?.finalText || "");
          if (forcedWriteStructured?.type === "tool_call" && forcedWriteStructured.tool_call.name === "write_file") {
            return forcedWriteStructured;
          }
        }

        await input.callbacks?.onStatusChanged?.("Cutie is drafting the concrete file edit from the inspected file.", input.run);
        const directEditTurn = await this.modelClient
          .completeTurn({
          auth: input.auth,
          signal: input.signal,
          temperature: 0.1,
          maxTokens: 1400,
          messages: [
            {
              role: "system",
              content: [
                "You are Cutie preparing the next concrete file-edit tool call.",
                "The file has already been read. The user wants a code change in this file.",
                "Return exactly one minified JSON tool_call object and nothing else.",
                "Do not call read_file again for this file.",
                "Prefer edit_file with a precise find/replace when possible.",
                "Use write_file only if a single targeted replacement is not enough.",
                '{"type":"tool_call","tool_call":{"name":"edit_file","arguments":{"path":"file","find":"old","replace":"new"},"summary":"short reason"}}',
              ].join("\n"),
            },
            {
              role: "user",
              content: [
                `Task:\n${trimToLimit(input.prompt, 2_000)}`,
                `Target path:\n${readPath}`,
                `Current file content:\n${trimToLimit(readContent, 8_000)}`,
              ].join("\n\n"),
            },
          ],
        })
          .catch(() => null);

        if (!directEditTurn) {
          return null;
        }

        const directStructured = maybeStructuredResponse(directEditTurn.finalText);
        if (
          directStructured?.type === "tool_call" &&
          !isNonProgressToolAfterInspection(input.run.goal, input.run, directStructured.tool_call.name)
        ) {
          return directStructured;
        }

        await input.callbacks?.onStatusChanged?.("Cutie is forcing a full-file rewrite plan after weak edit planning.", input.run);
        const lastResortWriteTurn = await this.modelClient
          .completeTurn({
            auth: input.auth,
            signal: input.signal,
            temperature: 0.05,
            maxTokens: 3200,
            messages: buildForcedWriteFileInstruction({
              prompt: input.prompt,
              readPath,
              readContent,
            }),
          })
          .catch(() => null);

        const lastResortWriteStructured = maybeStructuredResponse(lastResortWriteTurn?.finalText || "");
        if (lastResortWriteStructured?.type === "tool_call" && lastResortWriteStructured.tool_call.name === "write_file") {
          return lastResortWriteStructured;
        }
      }
    }

    return null;
  }

  private async finalizeSuccessfulRunWithAssistant(input: {
    auth: RequestAuth;
    signal?: AbortSignal;
    session: CutieSessionRecord;
    run: CutieRunState;
    transcript: CutieModelMessage[];
    contextMessage: CutieModelMessage;
    surfacedStreaming: boolean;
    callbacks?: CutieRuntimeCallbacks;
  }): Promise<{ session: CutieSessionRecord; run: CutieRunState }> {
    let session = input.session;
    let run = input.run;
    const recovered = await this.recoverFinalMessage({
      auth: input.auth,
      signal: input.signal,
      transcript: input.transcript,
      contextMessage: input.contextMessage,
      run,
      callbacks: input.callbacks,
    });
    const fallback =
      run.goal === "code_change" && hasCompletedMutation(run)
        ? "The requested change is saved in your workspace."
        : run.goal === "desktop_action" && hasCompletedDesktopTool(run)
          ? "The desktop step completed."
          : "Done.";
    const finalText = (recovered && recovered.trim()) || fallback;
    if (!input.surfacedStreaming && finalText) {
      await input.callbacks?.onAssistantDelta?.(finalText, finalText);
    }
    session = await this.sessionStore.appendMessage(session, {
      role: "assistant",
      content: finalText,
      runId: run.id,
    });
    input.transcript.push({ role: "assistant", content: finalText });
    await input.callbacks?.onSessionChanged?.(session);
    ({ session, run } = await this.updateRun(session, run, {
      status: "completed",
      phase: "completed",
      goalSatisfied: run.goal === "conversation" ? true : run.goalSatisfied,
      endedAt: nowIso(),
    }));
    await input.callbacks?.onStatusChanged?.("Cutie completed the run.", run);
    return { session, run };
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

    let run = createInitialRunState(session.id, goal);
    session = await this.sessionStore.appendRun(session, run);
    await input.callbacks?.onSessionChanged?.(session);
    await input.callbacks?.onStatusChanged?.("Cutie is collecting context.", run);

    const transcript: CutieModelMessage[] = [
      {
        role: "system",
        content: buildSystemPrompt(this.toolRegistry.describeToolsForPrompt()),
      },
      ...toTranscriptMessages(session),
    ];

    let previousToolKey = "";
    let mutationGoalRepairCount = 0;
    /** When set, skip streaming planning and execute this tool call (e.g. forced write_file after edit_file mismatch loops). */
    let injectedPlanningTool: CutieStructuredResponse | null = null;
    const maxMutationGoalRepairs = Math.max(8, CUTIE_MAX_STEPS - 4);
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
      while (true) {
        if (input.signal?.aborted) {
          throw new Error("Request aborted");
        }
        if (Date.now() - startedAt > CUTIE_MAX_WALL_CLOCK_MS) {
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

        const context = await this.getContext();
        const contextMessage: CutieModelMessage = {
          role: "system",
          content: buildContextMessage({
            prompt: input.prompt,
            context: {
              ...context,
              mentionedPaths: mentionContext.mentionedPaths,
              mentionedWindows: mentionContext.mentionedWindows,
            },
            run,
          }),
        };

        let modelFinalText = "";
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
          const turn = await this.modelClient.streamTurn({
            auth: input.auth,
            signal: input.signal,
            messages: [...transcript, contextMessage],
            onDelta: async (delta, accumulated) => {
              modelFinalText = accumulated;
              if (!shouldSurfaceStreamingAssistantText(accumulated, run.goal)) return;
              surfacedStreaming = true;
              await input.callbacks?.onAssistantDelta?.(delta, accumulated);
            },
          });
          modelFinalText = turn.finalText;
          structured = maybeStructuredResponse(turn.finalText);
          if (!structured && !modelFinalText.trim()) {
            const fallbackToolCall = buildFallbackToolCallAfterPlanningFailure({
              prompt: input.prompt,
              context,
              mentionContext,
              run,
            });
            if (fallbackToolCall) {
              structured = {
                type: "tool_call",
                tool_call: {
                  name: fallbackToolCall.name,
                  arguments: fallbackToolCall.arguments,
                  ...(fallbackToolCall.summary ? { summary: fallbackToolCall.summary } : {}),
                },
              };
              await input.callbacks?.onStatusChanged?.(
                "Cutie is recovering from an empty planning turn and inspecting the target file directly.",
                run
              );
            }
          }
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
            callbacks: input.callbacks,
          });
          if (repaired) {
            structured = repaired;
          }
        }

        if (!structured) {
          if (looksLikeMalformedToolCall(modelFinalText)) {
            if (shouldCompleteRunDespiteMalformedPlanning(run)) {
              return this.finalizeSuccessfulRunWithAssistant({
                auth: input.auth,
                signal: input.signal,
                session,
                run,
                transcript,
                contextMessage,
                surfacedStreaming,
                callbacks: input.callbacks,
              });
            }
            const repaired = await this.recoverActionableTurn({
              auth: input.auth,
              signal: input.signal,
              prompt: input.prompt,
              transcript,
              contextMessage,
              run,
              mentionContext,
              callbacks: input.callbacks,
            });
            if (repaired?.type === "tool_call") {
              structured = repaired;
            } else if (shouldKeepPushingForWorkspaceMutation({ prompt: input.prompt, mentionContext, run })) {
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
                  content: [
                    "Repair instruction:",
                    "The last tool-call output was malformed.",
                    "Do not stop.",
                    "Return one valid minified tool_call JSON object for edit_file, write_file, or run_command.",
                  ].join(" "),
                });
                await input.callbacks?.onStatusChanged?.(
                  `Cutie is retrying after malformed tool output (${mutationGoalRepairCount}/${maxMutationGoalRepairs}).`,
                  run
                );
                continue;
              }
              return this.enterAutonomyTerminalFailure({
                session,
                run,
                reason: "The model kept returning malformed tool output instead of a concrete edit call.",
                callbacks: input.callbacks,
              });
            }
          }

          if (shouldKeepPushingForWorkspaceMutation({ prompt: input.prompt, mentionContext, run })) {
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
                content: [
                  "Repair instruction:",
                  "The user asked for a real file change.",
                  "The file has already been inspected.",
                  "Do not finish yet.",
                  "Produce edit_file, write_file, or run_command next unless the task is truly impossible.",
                ].join(" "),
              });
              await input.callbacks?.onStatusChanged?.(
                `Cutie is retrying the planning step to produce a real file change (${mutationGoalRepairCount}/${maxMutationGoalRepairs}).`,
                run
              );
              continue;
            }
            return this.enterAutonomyTerminalFailure({
              session,
              run,
              reason: `The model could not produce a concrete edit after ${maxMutationGoalRepairs} repair attempts.`,
              callbacks: input.callbacks,
            });
          }
          if (looksLikeMalformedToolCall(modelFinalText)) {
            if (shouldCompleteRunDespiteMalformedPlanning(run)) {
              return this.finalizeSuccessfulRunWithAssistant({
                auth: input.auth,
                signal: input.signal,
                session,
                run,
                transcript,
                contextMessage,
                surfacedStreaming,
                callbacks: input.callbacks,
              });
            }
            return this.enterAutonomyTerminalFailure({
              session,
              run,
              reason: "The model returned malformed tool-call output before taking action.",
              callbacks: input.callbacks,
            });
          }
          const finalText =
            modelFinalText.trim() ||
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
            endedAt: nowIso(),
          }));
          await input.callbacks?.onStatusChanged?.("Cutie completed the run.", run);
          return { session, run };
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
              callbacks: input.callbacks,
            });
            if (repaired?.type === "tool_call") {
              structured = repaired;
            }
          }
        }

        if (structured.type === "final") {
          if (shouldKeepPushingForWorkspaceMutation({ prompt: input.prompt, mentionContext, run })) {
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
                content: [
                  "Repair instruction:",
                  "A final answer is not enough for this request because the user asked for a code change.",
                  "Continue working until there is a real mutation tool call or a relevant command.",
                ].join(" "),
              });
              await input.callbacks?.onStatusChanged?.(
                `Cutie is continuing instead of stopping early (${mutationGoalRepairCount}/${maxMutationGoalRepairs}).`,
                run
              );
              continue;
            }
            return this.enterAutonomyTerminalFailure({
              session,
              run,
              reason: `The model kept trying to finish without producing a real file change after ${maxMutationGoalRepairs} repair attempts.`,
              callbacks: input.callbacks,
            });
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
            goalSatisfied: run.goal === "conversation" ? true : run.goalSatisfied,
            endedAt: nowIso(),
          }));
          await input.callbacks?.onStatusChanged?.("Cutie completed the run.", run);
          return { session, run };
        }

        let toolCall: CutieToolCall = {
          id: randomId("cutie_tool"),
          name: structured.tool_call.name,
          arguments: structured.tool_call.arguments,
          ...(structured.tool_call.summary ? { summary: structured.tool_call.summary } : {}),
        };
        toolCall = normalizeToolCallAgainstKnownTarget({
          toolCall,
          run,
          mentionContext,
          context,
        });

        if (isNonProgressToolAfterInspection(run.goal, run, toolCall.name)) {
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
              }),
            });
            const tryMidLoopRecover =
              mutationGoalRepairCount === 3 ||
              mutationGoalRepairCount === 6 ||
              mutationGoalRepairCount === 9;
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
                callbacks: input.callbacks,
              });
              if (
                early?.type === "tool_call" &&
                !isNonProgressToolAfterInspection(run.goal, run, early.tool_call.name)
              ) {
                structured = early;
                toolCall = {
                  id: randomId("cutie_tool"),
                  name: structured.tool_call.name,
                  arguments: structured.tool_call.arguments,
                  ...(structured.tool_call.summary ? { summary: structured.tool_call.summary } : {}),
                };
                toolCall = normalizeToolCallAgainstKnownTarget({
                  toolCall,
                  run,
                  mentionContext,
                  context,
                });
              } else {
                await input.callbacks?.onStatusChanged?.(
                  `Cutie is redirecting inspection into a concrete edit (${mutationGoalRepairCount}/${maxMutationGoalRepairs}).`,
                  run
                );
                continue;
              }
            } else {
              await input.callbacks?.onStatusChanged?.(
                `Cutie is redirecting inspection into a concrete edit (${mutationGoalRepairCount}/${maxMutationGoalRepairs}).`,
                run
              );
              continue;
            }
          } else {
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
              callbacks: input.callbacks,
            });
            if (
              rescued?.type === "tool_call" &&
              !isNonProgressToolAfterInspection(run.goal, run, rescued.tool_call.name)
            ) {
              structured = rescued;
              toolCall = {
                id: randomId("cutie_tool"),
                name: structured.tool_call.name,
                arguments: structured.tool_call.arguments,
                ...(structured.tool_call.summary ? { summary: structured.tool_call.summary } : {}),
              };
              toolCall = normalizeToolCallAgainstKnownTarget({
                toolCall,
                run,
                mentionContext,
                context,
              });
            } else {
              return this.enterAutonomyTerminalFailure({
                session,
                run,
                reason: `Cutie stayed stuck in file inspection instead of moving to an edit after ${maxMutationGoalRepairs} repair attempts.`,
                callbacks: input.callbacks,
              });
            }
          }
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
          if (shouldRedirectRepeatedReadFile({ prompt: input.prompt, mentionContext, run, toolName: toolCall.name })) {
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
                content: [
                  "Repair instruction:",
                  "The file has already been read.",
                  "Do not call read_file again for the same target.",
                  "Choose edit_file, write_file, or a relevant run_command now.",
                ].join(" "),
              });
              await input.callbacks?.onStatusChanged?.(
                `Cutie is redirecting repeated file inspection into an edit path (${mutationGoalRepairCount}/${maxMutationGoalRepairs}).`,
                run
              );
              continue;
            }
            return this.enterAutonomyTerminalFailure({
              session,
              run,
              reason: `Cutie stayed stuck in file inspection instead of moving to an edit after ${maxMutationGoalRepairs} repair attempts.`,
              callbacks: input.callbacks,
            });
          }
          throw new Error(`Cutie stopped after repeating ${toolCall.name} without making progress.`);
        }

        if (isWorkspaceMutationTool(toolCall.name) && !this.toolRegistry.getCurrentCheckpoint()) {
          const checkpointResult = await this.toolRegistry.createAutomaticCheckpoint("Automatic checkpoint before the first workspace mutation.");
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

        ({ session, run } = await this.updateRun(session, run, {
          receipts: [...run.receipts, receipt],
          workspaceMutationCount,
          desktopMutationCount,
          ...(madeMeaningfulProgress
            ? {
                goalSatisfied: true,
                lastMeaningfulProgressAtStep: receipt.step,
                lastMeaningfulProgressSummary: receipt.summary,
                stuckReason: undefined,
                suggestedNextAction: undefined,
                escalationState: "none" as CutieEscalationState,
              }
            : {}),
          ...(toolResult.checkpoint ? { checkpoint: toolResult.checkpoint } : {}),
        }));

        if (toolResult.ok && (isWorkspaceMutationTool(toolCall.name) || toolCall.name === "run_command")) {
          mutationGoalRepairCount = 0;
          ({ session, run } = await this.updateRun(session, run, {
            repairAttemptCount: 0,
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
          role: "assistant",
          content: formatStructuredResponse(structured),
        });
        transcript.push({
          role: "system",
          content: buildToolResultMessage(toolResult),
        });
        await input.callbacks?.onSessionChanged?.(session);

        if (
          toolResult.ok &&
          (toolCall.name === "write_file" || toolCall.name === "edit_file") &&
          toolResult.data &&
          typeof (toolResult.data as Record<string, unknown>).path === "string"
        ) {
          const payload = toolResult.data as Record<string, unknown>;
          await input.callbacks?.onWorkspaceFileMutated?.({
            relativePath: String(payload.path),
            toolName: toolCall.name,
            previousContent: typeof payload.previousContent === "string" ? payload.previousContent : "",
          });
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
            continue;
          }
          if (isRetryableEditFailure(toolCall, toolResult, run) && mutationGoalRepairCount < maxMutationGoalRepairs) {
            mutationGoalRepairCount += 1;
            ({ session, run } = await this.updateRun(session, run, {
              phase: "repairing",
              status: "running",
              repairAttemptCount: mutationGoalRepairCount,
              escalationState: "none",
              stuckReason: undefined,
              suggestedNextAction: undefined,
            }));

            const latestReadReceipt = getLatestCompletedReceipt(run, "read_file");
            const readData = latestReadReceipt?.data ? asRecord(latestReadReceipt.data) : {};
            const readPath = typeof readData.path === "string" ? readData.path : "";
            const readContent = typeof readData.content === "string" ? readData.content : "";

            if (shouldForceWriteFileRepair(run) && readPath && readContent) {
              await input.callbacks?.onStatusChanged?.(
                `Cutie is promoting failed edits to a full-file rewrite (${mutationGoalRepairCount}/${maxMutationGoalRepairs}).`,
                run
              );
              const forcedWriteTurn = await this.modelClient
                .completeTurn({
                  auth: input.auth,
                  signal: input.signal,
                  temperature: 0.1,
                  maxTokens: 4000,
                  messages: buildForcedWriteFileInstruction({
                    prompt: input.prompt,
                    readPath,
                    readContent,
                  }),
                })
                .catch(() => null);
              const forcedStructured = maybeStructuredResponse(forcedWriteTurn?.finalText || "");
              if (forcedStructured?.type === "tool_call" && forcedStructured.tool_call.name === "write_file") {
                injectedPlanningTool = forcedStructured;
                transcript.push({
                  role: "system",
                  content:
                    "Repeated edit_file find-text mismatches were detected. Cutie will run a single write_file with full file content from the model.",
                });
                continue;
              }
            }

            transcript.push({
              role: "system",
              content: buildRetryableEditFailureInstruction({
                prompt: input.prompt,
                toolCall,
                run,
              }),
            });
            await input.callbacks?.onStatusChanged?.(
              `Cutie is correcting a failed edit attempt (${mutationGoalRepairCount}/${maxMutationGoalRepairs}).`,
              run
            );
            continue;
          }
          if (
            run.goal === "code_change" &&
            !toolResult.blocked &&
            mutationGoalRepairCount < maxMutationGoalRepairs &&
            isGenericMutationRepairEligible(toolCall, toolResult, run)
          ) {
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
              content: buildGenericMutationFailureRepairInstruction({
                prompt: input.prompt,
                toolCall,
                toolResult,
                run,
                mentionContext,
                context,
              }),
            });
            await input.callbacks?.onStatusChanged?.(
              `Cutie is recovering from a failed tool call (${mutationGoalRepairCount}/${maxMutationGoalRepairs}).`,
              run
            );
            continue;
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
    } catch (error) {
      const rawMessage = error instanceof Error ? error.message : String(error);
      const message = String(rawMessage || "").trim() || "Cutie could not get a usable planning response from the model.";
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

  private async updateRun(
    session: CutieSessionRecord,
    current: CutieRunState,
    patch: Partial<CutieRunState>
  ): Promise<{ session: CutieSessionRecord; run: CutieRunState }> {
    const next: CutieRunState = {
      ...current,
      ...patch,
    };
    const nextSession = await this.sessionStore.updateRun(session, next);
    return {
      session: nextSession,
      run: next,
    };
  }
}

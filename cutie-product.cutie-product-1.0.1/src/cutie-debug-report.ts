import * as path from "path";
import type { BinaryPanelState, BinaryPreviewFile, BinaryValidationReport } from "./binary-types";
import type {
  CutieChatMessage,
  CutieRunState,
  CutieTranscriptEvent,
  DesktopContextState,
} from "./types";

export type CutieDebugProblemArea =
  | "auth"
  | "binary_stream_transport"
  | "binary_stream_resume"
  | "binary_build_runtime"
  | "tool_planning"
  | "tool_execution"
  | "workspace_mutation"
  | "verification"
  | "stall_or_loop"
  | "prompt_loading"
  | "unknown";

export type CutieBinaryEventTimelineEntry = {
  id: string;
  timestamp: string;
  type: string;
  phase?: string | null;
  progress?: number | null;
  summary: string;
  latestFile?: string | null;
  latestLog?: string | null;
};

export type CutieBinaryControlActionName =
  | "generate"
  | "refine"
  | "branch"
  | "rewind"
  | "execute"
  | "validate"
  | "deploy"
  | "cancel";

export type CutieBinaryControlActionResult = "requested" | "succeeded" | "failed" | "blocked";

export type CutieBinaryControlActionEntry = {
  action: CutieBinaryControlActionName;
  timestamp: string;
  result: CutieBinaryControlActionResult;
  buildId?: string | null;
  message?: string | null;
};

export type CutieBinaryStreamAttempt = {
  kind: "create" | "resume";
  startedAt: string;
  buildId?: string | null;
  cursorUsed?: string | null;
};

export type CutieBinaryDebugSnapshot = {
  streamLifecycle: {
    lastCreateAttempt?: CutieBinaryStreamAttempt | null;
    lastResumeAttempt?: CutieBinaryStreamAttempt | null;
    chosenTransport?: "sse" | "websocket" | null;
    cursorUsed?: string | null;
    cursorPersisted?: string | null;
    connectedAt?: string | null;
    disconnectedAt?: string | null;
    lastFallbackToPollingReason?: string | null;
    lastStreamError?: string | null;
  };
  controlActions: CutieBinaryControlActionEntry[];
  eventTimeline: CutieBinaryEventTimelineEntry[];
  eventTypeCounts: Record<string, number>;
  duplicateEventCount: number;
  resumeCount: number;
  pollFallbackCount: number;
};

export type CutieDebugSummary = {
  headline: string;
  suspectedProblemAreas: CutieDebugProblemArea[];
  keySignals: string[];
  recommendedInspectionOrder: string[];
  terminalStates: {
    cutie: {
      status: string | null;
      phase: string | null;
    };
    binary: {
      buildId: string | null;
      status: string | null;
      phase: string | null;
    };
  };
};

export type CutieDebugReportV2 = {
  reportVersion: 2;
  generatedAt: string;
  product: {
    name: "cutie-product";
    extensionVersion: string;
    clipboardContract: "rich_debug_v2";
    runtime: string;
  };
  summary: CutieDebugSummary;
  environment: Record<string, unknown>;
  cutie: Record<string, unknown>;
  binary: Record<string, unknown>;
  recentConversation: {
    messageCount: number;
    messages: Array<Record<string, unknown>>;
  };
  redaction: {
    mode: "rich_redacted";
    secretsRedacted: number;
    valuesTruncated: number;
    normalizedPaths: number;
    textLimits: Record<string, number>;
  };
};

type CutieDebugReportInput = {
  generatedAt?: string;
  extensionVersion: string;
  runtime: string;
  workspaceHash: string;
  workspaceRootPath?: string | null;
  submitState: string;
  status: string;
  auth: {
    kind: string;
    label?: string | null;
  };
  warmStartState?: Record<string, unknown> | null;
  promptState?: Record<string, unknown> | null;
  dynamicSettings?: Record<string, unknown> | null;
  desktop: DesktopContextState;
  session?: {
    id: string;
    title: string;
    updatedAt: string;
    snapshotCount: number;
  } | null;
  activeRun?: CutieRunState | null;
  binaryPanelState: BinaryPanelState;
  binaryDebug?: CutieBinaryDebugSnapshot | null;
  liveActionLog: string[];
  liveTranscript: CutieTranscriptEvent[];
  recentMessages: CutieChatMessage[];
  suppressedAssistantArtifactText?: string | null;
};

type RedactionState = {
  secretsRedacted: number;
  valuesTruncated: number;
  normalizedPaths: number;
  workspaceRootPath?: string | null;
};

type TextPreview = {
  text: string;
  truncated: boolean;
  originalLength: number;
};

const RECENT_MESSAGE_LIMIT = 20;
const RECENT_MESSAGE_CHAR_LIMIT = 4000;
const LOG_CHAR_LIMIT = 1200;
const PREVIEW_CHAR_LIMIT = 2000;
const ARTIFACT_CHAR_LIMIT = 4000;
const LIVE_ACTION_LIMIT = 80;
const LIVE_TRANSCRIPT_LIMIT = 80;
const BINARY_TIMELINE_LIMIT = 200;
const CONTROL_ACTION_LIMIT = 50;

const SECRET_KEY_PATTERN = /(?:^|\.)(authorization|api[_-]?key|bearer|refresh[_-]?token|access[_-]?token|secret|password|cookie)$/i;
const ENV_SECRET_KEY_PATTERN = /(key|token|secret|password|cookie|bearer|authorization)/i;
const JWT_PATTERN = /\beyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9._-]+\.[A-Za-z0-9._-]+\b/g;
const KEY_VALUE_SECRET_PATTERN =
  /\b(authorization|x-api-key|api[_-]?key|access[_-]?token|refresh[_-]?token|session[_-]?token|cookie)\b\s*[:=]\s*([^\s,;]+)/gi;
const BEARER_PATTERN = /\bBearer\s+[A-Za-z0-9._-]{8,}\b/gi;
const SK_LIKE_PATTERN = /\b(?:sk|rk|pk)-[A-Za-z0-9_-]{12,}\b/g;

const MUTATION_TOOL_NAMES = new Set(["patch_file", "write_file", "edit_file", "mkdir", "run_command"]);
const VERIFICATION_TOOL_NAMES = new Set(["get_diagnostics", "run_command", "git_diff"]);

function toIso(value: string | null | undefined): string {
  return String(value || "").trim() || new Date(0).toISOString();
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function normalizeWorkspacePathInString(value: string, state: RedactionState): string {
  const root = String(state.workspaceRootPath || "").trim();
  if (!root) return value;
  const normalizedRoot = path.normalize(root);
  const candidates = [normalizedRoot, normalizedRoot.replace(/\\/g, "/")];
  let next = value;
  for (const candidate of candidates) {
    if (!candidate) continue;
    const pattern = new RegExp(`${escapeRegExp(candidate)}([\\\\/][^\\s"'` + "`" + `]+)?`, "g");
    next = next.replace(pattern, (_match, suffix) => {
      const rawSuffix = String(suffix || "");
      const normalizedSuffix = rawSuffix.replace(/\\/g, "/").replace(/^\/+/, "");
      state.normalizedPaths += 1;
      return normalizedSuffix || "[workspace-root]";
    });
  }
  return next;
}

function redactSecretText(value: string, state: RedactionState): string {
  let next = value;
  next = next.replace(BEARER_PATTERN, () => {
    state.secretsRedacted += 1;
    return "Bearer [REDACTED_TOKEN]";
  });
  next = next.replace(KEY_VALUE_SECRET_PATTERN, (_match, key) => {
    state.secretsRedacted += 1;
    return `${key}: [REDACTED_TOKEN]`;
  });
  next = next.replace(JWT_PATTERN, () => {
    state.secretsRedacted += 1;
    return "[REDACTED_JWT]";
  });
  next = next.replace(SK_LIKE_PATTERN, () => {
    state.secretsRedacted += 1;
    return "[REDACTED_TOKEN]";
  });
  next = next.replace(/(^|\n)([A-Z0-9_]{2,})\s*=\s*([^\n]+)/g, (match, prefix, key) => {
    if (!ENV_SECRET_KEY_PATTERN.test(String(key))) return match;
    state.secretsRedacted += 1;
    return `${prefix}${key}=[REDACTED_SECRET]`;
  });
  return next;
}

function sanitizeScalarString(
  value: string,
  state: RedactionState,
  options?: { forceRedact?: boolean; skipPathNormalization?: boolean }
): string {
  if (!value) return value;
  if (options?.forceRedact) {
    state.secretsRedacted += 1;
    return "[REDACTED_SECRET]";
  }
  const pathNormalized = options?.skipPathNormalization ? value : normalizeWorkspacePathInString(value, state);
  return redactSecretText(pathNormalized, state);
}

function sanitizeUnknown(value: unknown, state: RedactionState, keyPath = ""): unknown {
  if (value === null || value === undefined) return value;
  if (typeof value === "string") {
    return sanitizeScalarString(value, state, { forceRedact: SECRET_KEY_PATTERN.test(keyPath) });
  }
  if (typeof value === "number" || typeof value === "boolean") return value;
  if (Array.isArray(value)) {
    return value.map((item, index) => sanitizeUnknown(item, state, `${keyPath}[${index}]`));
  }
  if (typeof value === "object") {
    const record = value as Record<string, unknown>;
    const next: Record<string, unknown> = {};
    for (const [key, entry] of Object.entries(record)) {
      const childPath = keyPath ? `${keyPath}.${key}` : key;
      next[key] = sanitizeUnknown(entry, state, childPath);
    }
    return next;
  }
  return String(value);
}

function createTextPreview(
  value: string | null | undefined,
  maxChars: number,
  state: RedactionState,
  options?: { forceRedact?: boolean; skipPathNormalization?: boolean }
): TextPreview {
  const raw = String(value || "");
  const sanitized = sanitizeScalarString(raw, state, options);
  if (sanitized.length <= maxChars) {
    return { text: sanitized, truncated: false, originalLength: raw.length };
  }
  state.valuesTruncated += 1;
  return {
    text: `${sanitized.slice(0, maxChars)}\n...[truncated]`,
    truncated: true,
    originalLength: raw.length,
  };
}

function buildRecentMessage(message: CutieChatMessage, state: RedactionState): Record<string, unknown> {
  const preview = createTextPreview(message.content, RECENT_MESSAGE_CHAR_LIMIT, state);
  return {
    role: message.role,
    createdAt: message.createdAt,
    runId: message.runId || null,
    presentation: message.presentation || null,
    content: preview.text,
    truncated: preview.truncated,
    originalLength: preview.originalLength,
  };
}

function buildPreviewFiles(files: BinaryPreviewFile[], state: RedactionState): Array<Record<string, unknown>> {
  return files.slice(0, 24).map((file) => {
    const preview = createTextPreview(file.preview, PREVIEW_CHAR_LIMIT, state);
    return {
      path: sanitizeScalarString(file.path, state),
      language: file.language || null,
      completed: file.completed,
      updatedAt: file.updatedAt,
      preview: preview.text,
      truncated: preview.truncated,
      originalLength: preview.originalLength,
    };
  });
}

function summarizeValidation(
  validation: BinaryValidationReport | null | undefined,
  state: RedactionState
): Record<string, unknown> | null {
  if (!validation) return null;
  return sanitizeUnknown(
    {
      status: validation.status,
      score: validation.score,
      summary: validation.summary,
      warnings: validation.warnings,
      issues: validation.issues,
      generatedAt: validation.generatedAt,
      targetEnvironment: validation.targetEnvironment,
    },
    state,
    "binary.validation"
  ) as Record<string, unknown>;
}

function buildToolStats(run: CutieRunState | null | undefined): Record<string, unknown> {
  if (!run) {
    return {
      countsByToolName: {},
      countsByResultStatus: {},
      lastMutationTool: null,
      lastVerificationTool: null,
    };
  }

  const countsByToolName: Record<string, number> = {};
  const countsByResultStatus: Record<string, number> = {};
  let lastMutationTool: string | null = null;
  let lastVerificationTool: string | null = null;

  for (const receipt of run.receipts || []) {
    countsByToolName[receipt.toolName] = (countsByToolName[receipt.toolName] || 0) + 1;
    countsByResultStatus[receipt.status] = (countsByResultStatus[receipt.status] || 0) + 1;
    if (MUTATION_TOOL_NAMES.has(receipt.toolName)) lastMutationTool = receipt.toolName;
    if (VERIFICATION_TOOL_NAMES.has(receipt.toolName)) lastVerificationTool = receipt.toolName;
  }

  return {
    countsByToolName,
    countsByResultStatus,
    lastMutationTool,
    lastVerificationTool,
  };
}

function buildToolTimeline(
  run: CutieRunState | null | undefined,
  liveTranscript: CutieTranscriptEvent[],
  liveActionLog: string[],
  state: RedactionState
): Array<Record<string, unknown>> {
  const entries: Array<Record<string, unknown> & { sortKey: string }> = [];

  for (const receipt of run?.receipts || []) {
    entries.push({
      sortKey: toIso(receipt.finishedAt || receipt.startedAt),
      timestamp: receipt.finishedAt || receipt.startedAt,
      source: "receipt",
      kind: receipt.status,
      toolName: receipt.toolName,
      step: receipt.step,
      text: sanitizeScalarString(
        `${receipt.summary}${receipt.error ? ` ${receipt.error}` : ""}`.trim(),
        state
      ),
    });
  }

  for (const event of liveTranscript.slice(-LIVE_TRANSCRIPT_LIMIT)) {
    entries.push({
      sortKey: toIso(event.createdAt),
      timestamp: event.createdAt,
      source: "transcript",
      kind: event.kind,
      runId: event.runId || null,
      text: sanitizeScalarString(event.text, state),
    });
  }

  let actionIndex = 0;
  for (const line of liveActionLog.slice(-LIVE_ACTION_LIMIT)) {
    actionIndex += 1;
    entries.push({
      sortKey: `${new Date(0).toISOString()}:${String(actionIndex).padStart(4, "0")}`,
      timestamp: null,
      source: "live_action",
      kind: "action",
      text: sanitizeScalarString(line, state),
    });
  }

  entries.sort((left, right) => left.sortKey.localeCompare(right.sortKey));
  return entries.slice(-120).map(({ sortKey, ...entry }) => entry);
}

function buildReceipts(run: CutieRunState | null | undefined, state: RedactionState): Array<Record<string, unknown>> {
  return (run?.receipts || []).slice(-80).map((receipt) => ({
    id: receipt.id,
    step: receipt.step,
    toolName: receipt.toolName,
    kind: receipt.kind,
    domain: receipt.domain,
    status: receipt.status,
    summary: sanitizeScalarString(receipt.summary, state),
    error: receipt.error ? sanitizeScalarString(receipt.error, state) : null,
    startedAt: receipt.startedAt,
    finishedAt: receipt.finishedAt,
    data: sanitizeUnknown(receipt.data || null, state, `cutie.receipts.${receipt.toolName}.data`),
  }));
}

function buildBinarySection(
  binary: BinaryPanelState,
  binaryDebug: CutieBinaryDebugSnapshot | null | undefined,
  state: RedactionState
): Record<string, unknown> {
  const activeBuild = binary.activeBuild;
  return {
    activeBuild: activeBuild
      ? {
          id: activeBuild.id,
          workflow: activeBuild.workflow,
          status: activeBuild.status,
          phase: activeBuild.phase || null,
          progress: activeBuild.progress ?? null,
          intent: sanitizeScalarString(activeBuild.intent, state),
          errorMessage: activeBuild.errorMessage ? sanitizeScalarString(activeBuild.errorMessage, state) : null,
          checkpointId: activeBuild.checkpointId || null,
          targetEnvironment: activeBuild.targetEnvironment,
          artifact: sanitizeUnknown(activeBuild.artifact || null, state, "binary.activeBuild.artifact"),
          publish: sanitizeUnknown(activeBuild.publish || null, state, "binary.activeBuild.publish"),
          stream: activeBuild.stream
            ? {
                enabled: activeBuild.stream.enabled,
                transport: activeBuild.stream.transport,
                streamSessionId: activeBuild.stream.streamSessionId || null,
                eventsPath: sanitizeScalarString(activeBuild.stream.eventsPath, state),
                streamPath: sanitizeScalarString(activeBuild.stream.streamPath, state),
                controlPath: sanitizeScalarString(activeBuild.stream.controlPath, state),
                lastEventId: activeBuild.stream.lastEventId || null,
                wsPath: activeBuild.stream.wsPath ? sanitizeScalarString(activeBuild.stream.wsPath, state) : null,
                resumeTokenPresent: Boolean(activeBuild.stream.resumeToken),
              }
            : null,
          createdAt: activeBuild.createdAt,
          updatedAt: activeBuild.updatedAt,
        }
      : null,
    panelState: {
      busy: binary.busy,
      phase: binary.phase || null,
      progress: binary.progress ?? null,
      streamConnected: binary.streamConnected,
      lastEventId: binary.lastEventId || null,
      canCancel: binary.canCancel,
      lastAction: binary.lastAction || null,
      targetEnvironment: binary.targetEnvironment,
      checkpoints: sanitizeUnknown(binary.checkpoints, state, "binary.checkpoints"),
      snapshots: sanitizeUnknown(binary.snapshots, state, "binary.snapshots"),
      pendingRefinement: sanitizeUnknown(binary.pendingRefinement, state, "binary.pendingRefinement"),
      artifactState: sanitizeUnknown(binary.artifactState, state, "binary.artifactState"),
      sourceGraph: sanitizeUnknown(binary.sourceGraph, state, "binary.sourceGraph"),
      astState: sanitizeUnknown(binary.astState, state, "binary.astState"),
      runtimeState: sanitizeUnknown(binary.runtimeState, state, "binary.runtimeState"),
      execution: sanitizeUnknown(binary.execution, state, "binary.execution"),
      reliability: summarizeValidation(binary.reliability, state),
      liveReliability: sanitizeUnknown(binary.liveReliability, state, "binary.liveReliability"),
      previewFiles: buildPreviewFiles(binary.previewFiles || [], state),
      recentLogs: (binary.recentLogs || []).slice(-80).map((line) => createTextPreview(line, LOG_CHAR_LIMIT, state)),
    },
    debugSnapshot: binaryDebug
      ? sanitizeUnknown(
          {
            streamLifecycle: binaryDebug.streamLifecycle,
            controlActions: binaryDebug.controlActions.slice(-CONTROL_ACTION_LIMIT),
            eventTimeline: binaryDebug.eventTimeline.slice(-BINARY_TIMELINE_LIMIT).map((entry) => ({
              ...entry,
              summary: sanitizeScalarString(entry.summary, state),
              latestFile: entry.latestFile ? sanitizeScalarString(entry.latestFile, state) : null,
              latestLog: entry.latestLog ? createTextPreview(entry.latestLog, LOG_CHAR_LIMIT, state).text : null,
            })),
            eventTypeCounts: binaryDebug.eventTypeCounts,
            duplicateEventCount: binaryDebug.duplicateEventCount,
            resumeCount: binaryDebug.resumeCount,
            pollFallbackCount: binaryDebug.pollFallbackCount,
          },
          state,
          "binary.debugSnapshot"
        )
      : null,
  };
}

function buildDesktopSummary(desktop: DesktopContextState, state: RedactionState): Record<string, unknown> {
  return {
    platform: desktop.platform,
    displayCount: desktop.displays.length,
    displays: sanitizeUnknown(desktop.displays, state, "environment.desktop.displays"),
    activeWindow: sanitizeUnknown(desktop.activeWindow || null, state, "environment.desktop.activeWindow"),
    recentSnapshots: sanitizeUnknown(desktop.recentSnapshots, state, "environment.desktop.recentSnapshots"),
    capabilities: sanitizeUnknown(desktop.capabilities, state, "environment.desktop.capabilities"),
  };
}

function buildHeadline(
  suspectedProblemAreas: CutieDebugProblemArea[],
  run: CutieRunState | null | undefined,
  binary: BinaryPanelState,
  binaryDebug: CutieBinaryDebugSnapshot | null | undefined
): string {
  if (!run && !binary.activeBuild) {
    return "No Cutie run or streaming binary build has been captured yet.";
  }
  if (suspectedProblemAreas.includes("auth")) {
    return "Authentication looks like the primary blocker.";
  }
  if (suspectedProblemAreas.includes("binary_stream_transport")) {
    return `Binary streaming transport looks unstable${binaryDebug?.streamLifecycle.lastFallbackToPollingReason ? " and fell back to polling" : ""}.`;
  }
  if (suspectedProblemAreas.includes("binary_build_runtime")) {
    return "The streaming binary build reached a runtime or validation failure.";
  }
  if (suspectedProblemAreas.includes("stall_or_loop")) {
    return "Cutie appears to have stalled or entered a low-progress loop.";
  }
  if (suspectedProblemAreas.includes("workspace_mutation")) {
    return "Cutie reached the mutation stage but did not land a trusted workspace change.";
  }
  if (suspectedProblemAreas.includes("tool_execution")) {
    return "A tool execution failure is the strongest current signal.";
  }
  if (suspectedProblemAreas.includes("tool_planning")) {
    return "Planning/tool selection looks more suspicious than execution.";
  }
  if (run?.status === "completed" && binary.activeBuild?.status === "completed") {
    return "Cutie and the streaming binary build both reached terminal success states.";
  }
  return "The report captured useful state, but no single failure mode dominates yet.";
}

function deriveProblemAreas(input: CutieDebugReportInput, keySignals: string[]): CutieDebugProblemArea[] {
  const areas = new Set<CutieDebugProblemArea>();
  const run = input.activeRun;
  const binary = input.binaryPanelState.activeBuild;
  const binaryDebug = input.binaryDebug;
  const promptLoaded =
    input.promptState && typeof input.promptState.promptLoaded === "boolean"
      ? Boolean(input.promptState.promptLoaded)
      : true;

  if (input.auth.kind === "none") {
    areas.add("auth");
    keySignals.push("Auth state is none.");
  }
  if (!promptLoaded || run?.promptLoadError) {
    areas.add("prompt_loading");
    keySignals.push(`Prompt load state is degraded${run?.promptLoadError ? `: ${run.promptLoadError}` : "."}`);
  }
  if ((run?.stallLevel && run.stallLevel !== "none") || (run?.noProgressTurns || 0) >= 2 || (run?.repeatedCallCount || 0) >= 2) {
    areas.add("stall_or_loop");
    keySignals.push(
      `Cutie stall indicators: stallLevel=${run?.stallLevel || "none"}, noProgressTurns=${run?.noProgressTurns || 0}, repeatedCallCount=${run?.repeatedCallCount || 0}.`
    );
  }
  if (run && (run.phase === "planning" || run.phase === "collecting_context") && (run.noToolPlanningCycles || 0) > 0) {
    areas.add("tool_planning");
    keySignals.push(`Cutie has ${run.noToolPlanningCycles} planning cycles without tool completion.`);
  }
  if (run?.receipts.some((receipt) => receipt.status === "failed")) {
    areas.add("tool_execution");
    keySignals.push("At least one tool receipt failed.");
  }
  if (run?.receipts.some((receipt) => receipt.status === "blocked")) {
    areas.add("tool_execution");
    keySignals.push("At least one tool receipt was blocked.");
  }
  if (
    run?.goal === "code_change" &&
    !run.goalSatisfied &&
    ((run.workspaceMutationCount || 0) === 0 || Boolean(run.lastMutationValidationError))
  ) {
    areas.add("workspace_mutation");
    keySignals.push(
      `Cutie did not prove a code change: workspaceMutationCount=${run.workspaceMutationCount}, goalSatisfied=${run.goalSatisfied}.`
    );
  }
  if (run?.receipts.some((receipt) => VERIFICATION_TOOL_NAMES.has(receipt.toolName) && receipt.status !== "completed")) {
    areas.add("verification");
    keySignals.push("A verification-oriented tool did not complete successfully.");
  }
  if (binaryDebug?.streamLifecycle.lastStreamError || binaryDebug?.pollFallbackCount) {
    areas.add("binary_stream_transport");
    keySignals.push(
      `Binary stream transport trouble: pollFallbackCount=${binaryDebug?.pollFallbackCount || 0}${binaryDebug?.streamLifecycle.lastStreamError ? `, lastStreamError=${binaryDebug.streamLifecycle.lastStreamError}` : ""}.`
    );
  }
  if ((binaryDebug?.resumeCount || 0) > 0 || binaryDebug?.streamLifecycle.cursorUsed) {
    areas.add("binary_stream_resume");
    keySignals.push(
      `Binary stream resume state: resumeCount=${binaryDebug?.resumeCount || 0}, cursorUsed=${binaryDebug?.streamLifecycle.cursorUsed || "(none)"}.`
    );
  }
  if (
    binary?.status === "failed" ||
    binary?.execution?.lastRun?.status === "failed" ||
    binary?.reliability?.status === "fail" ||
    (binary?.liveReliability?.blockers?.length || 0) > 0
  ) {
    areas.add("binary_build_runtime");
    keySignals.push(
      `Binary build runtime failure indicators: status=${binary?.status || "none"}, validation=${binary?.reliability?.status || "none"}, lastExecution=${binary?.execution?.lastRun?.status || "none"}.`
    );
  }

  if (areas.size === 0) {
    areas.add("unknown");
    if (!run) keySignals.push("No active Cutie run was available.");
    if (!binary) keySignals.push("No active binary build was available.");
  }

  return Array.from(areas);
}

function buildInspectionOrder(areas: CutieDebugProblemArea[]): string[] {
  const order: string[] = [];
  const push = (value: string) => {
    if (!order.includes(value)) order.push(value);
  };
  for (const area of areas) {
    if (area === "auth") push("Check auth.kind, auth label, and any auth-related error strings first.");
    if (area === "prompt_loading") push("Inspect promptState and prompt load errors before reviewing tool behavior.");
    if (area === "stall_or_loop") push("Review cutie.orchestration, toolTimeline, and no-progress counters.");
    if (area === "tool_planning") push("Inspect cutie.orchestration.nextDeterministicAction and early planning statuses.");
    if (area === "tool_execution") push("Inspect cutie.receipts and cutie.toolStats for failed or blocked tools.");
    if (area === "workspace_mutation") push("Inspect mutation receipts, lastMutationValidationError, and completionPath.");
    if (area === "verification") push("Inspect diagnostics/run_command verification receipts and lastVerifiedOutcome.");
    if (area === "binary_stream_transport") push("Inspect binary.debugSnapshot.streamLifecycle and binary eventTimeline for stream disconnects or polling fallback.");
    if (area === "binary_stream_resume") push("Inspect binary stream cursor usage, resume attempts, and duplicate event counters.");
    if (area === "binary_build_runtime") push("Inspect binary active build status, execution state, and validation/live-reliability blockers.");
  }
  if (!order.length) {
    push("Inspect summary.terminalStates, then cutie.orchestration, then binary.debugSnapshot.");
  }
  return order;
}

function buildSummary(input: CutieDebugReportInput, state: RedactionState): CutieDebugSummary {
  const keySignals: string[] = [];
  const suspectedProblemAreas = deriveProblemAreas(input, keySignals);
  const run = input.activeRun;
  const binary = input.binaryPanelState.activeBuild;
  return {
    headline: buildHeadline(suspectedProblemAreas, run, input.binaryPanelState, input.binaryDebug),
    suspectedProblemAreas,
    keySignals: keySignals.map((line) => sanitizeScalarString(line, state)).slice(0, 12),
    recommendedInspectionOrder: buildInspectionOrder(suspectedProblemAreas),
    terminalStates: {
      cutie: {
        status: run?.status || null,
        phase: run?.phase || null,
      },
      binary: {
        buildId: binary?.id || null,
        status: binary?.status || null,
        phase: binary?.phase || null,
      },
    },
  };
}

export function buildCutieDebugReportV2(input: CutieDebugReportInput): CutieDebugReportV2 {
  const generatedAt = input.generatedAt || new Date().toISOString();
  const state: RedactionState = {
    secretsRedacted: 0,
    valuesTruncated: 0,
    normalizedPaths: 0,
    workspaceRootPath: input.workspaceRootPath || null,
  };

  const run = input.activeRun;
  const summary = buildSummary(input, state);
  const liveActionLog = input.liveActionLog.slice(-LIVE_ACTION_LIMIT).map((line) => sanitizeScalarString(line, state));
  const liveTranscript = input.liveTranscript.slice(-LIVE_TRANSCRIPT_LIMIT).map((event) => ({
    id: event.id,
    kind: event.kind,
    runId: event.runId || null,
    createdAt: event.createdAt,
    text: sanitizeScalarString(event.text, state),
  }));
  const recentConversation = input.recentMessages.slice(-RECENT_MESSAGE_LIMIT).map((message) => buildRecentMessage(message, state));

  const activeRunWithoutReceipts = run
    ? (() => {
        const { receipts, ...rest } = run;
        return sanitizeUnknown(rest, state, "cutie.activeRun");
      })()
    : null;

  const suppressedArtifact = input.suppressedAssistantArtifactText
    ? createTextPreview(input.suppressedAssistantArtifactText, ARTIFACT_CHAR_LIMIT, state)
    : null;

  return {
    reportVersion: 2,
    generatedAt,
    product: {
      name: "cutie-product",
      extensionVersion: input.extensionVersion,
      clipboardContract: "rich_debug_v2",
      runtime: input.runtime,
    },
    summary,
    environment: {
      workspaceHash: input.workspaceHash,
      workspaceRootPath: input.workspaceRootPath || null,
      submitState: input.submitState,
      status: sanitizeScalarString(input.status, state, { skipPathNormalization: true }),
      runtime: input.runtime,
      auth: sanitizeUnknown(input.auth, state, "environment.auth"),
      promptState: sanitizeUnknown(input.promptState || null, state, "environment.promptState"),
      warmStartState: sanitizeUnknown(input.warmStartState || null, state, "environment.warmStartState"),
      dynamicSettings: sanitizeUnknown(input.dynamicSettings || null, state, "environment.dynamicSettings"),
      session: sanitizeUnknown(input.session || null, state, "environment.session"),
      desktop: buildDesktopSummary(input.desktop, state),
    },
    cutie: {
      session: sanitizeUnknown(input.session || null, state, "cutie.session"),
      activeRun: activeRunWithoutReceipts,
      orchestration: run
        ? sanitizeUnknown(
            {
              goal: run.goal,
              phase: run.phase,
              status: run.status,
              protocolMode: run.protocolMode || null,
              transportModeUsed: run.transportModeUsed || null,
              normalizationSource: run.normalizationSource || null,
              normalizationTier: run.normalizationTier || null,
              fallbackModeUsed: run.fallbackModeUsed || null,
              repairTierEntered: run.repairTierEntered || null,
              completionPath: run.completionPath || null,
              noProgressTurns: run.noProgressTurns || 0,
              noToolPlanningCycles: run.noToolPlanningCycles || 0,
              repeatedCallCount: run.repeatedCallCount || 0,
              repairAttemptCount: run.repairAttemptCount,
              objectiveRepairCount: run.objectiveRepairCount || 0,
              workspaceMutationCount: run.workspaceMutationCount,
              maxWorkspaceMutations: run.maxWorkspaceMutations,
              stallLevel: run.stallLevel || null,
              stallReason: run.stallReason || null,
              stallNextAction: run.stallNextAction || null,
              nextDeterministicAction: run.nextDeterministicAction || null,
              lastVerifiedOutcome: run.lastVerifiedOutcome || null,
              currentStrategy: run.strategyPhase || null,
              currentRepairTactic: run.currentRepairTactic || null,
              goalSatisfied: run.goalSatisfied,
              lastMeaningfulProgressSummary: run.lastMeaningfulProgressSummary || null,
              lastActionSummary: run.lastActionSummary || null,
              lastMutationValidationError: run.lastMutationValidationError || null,
            },
            state,
            "cutie.orchestration"
          )
        : null,
      toolStats: buildToolStats(run),
      toolTimeline: buildToolTimeline(run, input.liveTranscript, input.liveActionLog, state),
      receipts: buildReceipts(run, state),
      liveActionLog,
      liveTranscript,
      suppressedAssistantArtifact: suppressedArtifact
        ? {
            text: suppressedArtifact.text,
            truncated: suppressedArtifact.truncated,
            originalLength: suppressedArtifact.originalLength,
          }
        : null,
    },
    binary: buildBinarySection(input.binaryPanelState, input.binaryDebug, state),
    recentConversation: {
      messageCount: recentConversation.length,
      messages: recentConversation,
    },
    redaction: {
      mode: "rich_redacted",
      secretsRedacted: state.secretsRedacted,
      valuesTruncated: state.valuesTruncated,
      normalizedPaths: state.normalizedPaths,
      textLimits: {
        recentMessageChars: RECENT_MESSAGE_CHAR_LIMIT,
        logChars: LOG_CHAR_LIMIT,
        previewChars: PREVIEW_CHAR_LIMIT,
        artifactChars: ARTIFACT_CHAR_LIMIT,
        liveActionLines: LIVE_ACTION_LIMIT,
        liveTranscriptEvents: LIVE_TRANSCRIPT_LIMIT,
        binaryTimelineEvents: BINARY_TIMELINE_LIMIT,
        controlActions: CONTROL_ACTION_LIMIT,
      },
    },
  };
}

export function buildCutieDebugReportV2Text(input: CutieDebugReportInput): string {
  return JSON.stringify(buildCutieDebugReportV2(input), null, 2);
}

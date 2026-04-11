import * as vscode from "vscode";
import { randomUUID } from "crypto";
import {
  buildClarificationActions,
  buildContextSummary,
  buildFollowUpActions,
  buildPatchConfidence,
  classifyIntent,
  isEditLikeIntent,
} from "./assistant-ux";
import { AuthManager } from "./auth";
import { ActionRunner } from "./actions";
import { requestJson, streamJsonEvents } from "./api-client";
import {
  createAgentJob,
  getAgentJob,
  streamAgentJobEvents,
} from "./agent-jobs-client";
import {
  branchBinaryBuild as requestBinaryBranch,
  cancelBinaryBuild as requestBinaryCancel,
  createBinaryBuild as requestBinaryBuild,
  createBinaryBuildStream as requestBinaryBuildStream,
  executeBinaryBuild as requestBinaryExecute,
  getBinaryBuild as requestBinaryStatus,
  publishBinaryBuild as requestBinaryPublish,
  refineBinaryBuild as requestBinaryRefine,
  rewindBinaryBuild as requestBinaryRewind,
  streamBinaryBuildEvents as requestBinaryStreamEvents,
  validateBinaryBuild as requestBinaryValidate,
} from "./binary-client";
import { ContextAttachmentSelection, ContextCollector } from "./context";
import {
  EXTENSION_NAMESPACE,
  getAgentModelAlias,
  getBaseApiUrl,
  getMaxToolStepsForPlayground,
  getMaxWorkspaceMutationsForPlayground,
  getQwenExecutablePath,
  getQwenModel,
  getQwenOpenAiBaseUrl,
  getRuntimeBackend,
  getWorkspaceHash,
  getWorkspaceRootPath,
  MODE_KEY,
  toWorkspaceRelativePath,
  WEBVIEW_VIEW_ID,
} from "./config";
import { SessionHistoryService } from "./history";
import { CloudIndexManager } from "./indexer";
import { DraftStore } from "./draft-store";
import {
  explainQwenFailure,
  sanitizeQwenAssistantOutput,
  shouldSuppressQwenPartialOutput,
  validateQwenPreflight,
} from "./qwen-ux";
import { createPendingQwenSessionId, isPendingQwenSessionId, QwenHistoryService } from "./qwen-history";
import { QwenCodeRuntime, type QwenPromptResult, type QwenToolEvent } from "./qwen-code-runtime";
import { isMutationToolName } from "./qwen-runtime-utils";
import { ToolExecutor } from "./tool-executor";
import { buildPlaygroundWebviewHtml } from "./webview-html";
import { buildQwenPrompt } from "./qwen-prompt";
import { augmentContextFromPseudoMarkup } from "./pseudo-markup-utils";
import {
  buildProjectLoopRecoveryMessage,
  containsGenericProjectClarification,
  isLikelyClarificationContinuation,
} from "./qwen-loop-guard";
import { containsRuntimeNoiseForContext } from "./qwen-runtime-noise";
import {
  buildSlashCommandHelpMessage,
  buildSlashStatusMessage,
  parseSlashCommand,
} from "./slash-commands";
import type {
  AssistAction,
  AssistPlan,
  AssistRunEnvelope,
  AuthState,
  BinaryBuildEvent,
  BinaryBuildPhase,
  BinaryBuildRecord,
  BinaryTargetEnvironment,
  BinaryAstState,
  BinaryAgentJob,
  BinaryLiveReliabilityState,
  BinaryPanelState,
  BinaryRuntimeState,
  BinarySnapshotSummary,
  ChatLiveEvent,
  ChatMessage,
  ChatLiveState,
  ContextConfidence,
  ContextSummary,
  FollowUpAction,
  HistoryItem,
  IntentKind,
  LiveChatState,
  Mode,
  ObjectiveState,
  PendingToolCall,
  PlaygroundToolName,
  ProgressState,
  RequestAuth,
  RuntimeBackend,
  RuntimePhase,
  ToolResult,
} from "./shared";

type WebviewState = {
  mode: Mode;
  runtime: RuntimeBackend;
  auth: AuthState;
  history: HistoryItem[];
  messages: ChatMessage[];
  busy: boolean;
  canUndo: boolean;
  activity: string[];
  selectedSessionId: string | null;
  contextSummary: ContextSummary;
  contextConfidence: ContextConfidence;
  intent: IntentKind;
  runtimePhase: RuntimePhase;
  followUpActions: FollowUpAction[];
  draftText: string;
  liveChat: LiveChatState | null;
  orchestratorStatus: {
    state: "checking" | "ready" | "unavailable";
    label: string;
    detail?: string;
  } | null;
  binary: BinaryPanelState;
};

type ManualContextState = {
  attachedFiles: string[];
  attachedSelection: ContextAttachmentSelection | null;
};

type LastPromptState = {
  text: string;
  intent: IntentKind;
  searchDepth: "fast" | "deep";
};

type QwenDebugAttempt = {
  requireToolUse: boolean;
  usedTools: string[];
  didMutate: boolean;
  permissionDenials: string[];
  assistantTextPreview: string;
  toolEvents: QwenToolEvent[];
};

type QwenDebugSnapshot = {
  timestamp: string;
  task: string;
  mode: Mode;
  intent: IntentKind;
  confidence: ContextConfidence;
  workspaceRoot: string | null;
  activeFile: string;
  resolvedFiles: string[];
  selectedFiles: string[];
  retriedWithToolDirective: boolean;
  attempts: QwenDebugAttempt[];
  runtimePhase: RuntimePhase;
  recentActivity: string[];
  progressState?: ProgressState | null;
  objectiveState?: ObjectiveState | null;
  model?: string;
  error?: string;
};

type HostedDebugSnapshot = {
  timestamp: string;
  task: string;
  runtime: RuntimeBackend;
  mode: Mode;
  intent: IntentKind;
  confidence: ContextConfidence;
  workspaceRoot: string | null;
  activeFile: string;
  resolvedFiles: string[];
  selectedFiles: string[];
  runtimePhase: RuntimePhase;
  recentActivity: string[];
  runId?: string;
  executionLane?: string;
  runtimeTarget?: string;
  jsonlPath?: string | null;
  persistenceDir?: string | null;
  adapter?: string;
  completionStatus?: string;
  progressState?: ProgressState | null;
  objectiveState?: ObjectiveState | null;
  toolCallsUsed: string[];
  assistantPreview?: string;
  error?: string;
};

const BINARY_ACTIVE_BUILD_KEY = "xpersona.binary.activeBuildId";
const BINARY_STREAM_CURSOR_KEY = "xpersona.binary.streamCursorByBuild";
const LIVE_CHAT_HEARTBEAT_MS = 900;

function normalizeMode(value?: Mode): Mode {
  if (value === "plan") return "plan";
  return "auto";
}

function formatPlan(plan: AssistPlan): string {
  const lines = [
    `Objective: ${plan.objective}`,
    plan.files.length ? `Files: ${plan.files.join(", ")}` : "",
    plan.steps.length ? `Steps:\n${plan.steps.map((step, index) => `${index + 1}. ${step}`).join("\n")}` : "",
    plan.acceptanceTests.length
      ? `Checks:\n${plan.acceptanceTests.map((check) => `- ${check}`).join("\n")}`
      : "",
    plan.risks.length ? `Risks:\n${plan.risks.map((risk) => `- ${risk}`).join("\n")}` : "",
  ].filter(Boolean);
  return lines.join("\n\n");
}

function isHostedOpenHandsRuntime(runtime: RuntimeBackend): boolean {
  return runtime === "playgroundApi" || runtime === "cutie" || runtime === "qwenCode";
}

function isBinaryLifecycleToolName(toolName: string): boolean {
  return /^binary_/.test(String(toolName || "").trim());
}

function stableStringify(value: unknown): string {
  return JSON.stringify(value, null, 2);
}

function createNonce(): string {
  return randomUUID().replace(/-/g, "");
}

function createEmptyContextSummary(): ContextSummary {
  return {
    likelyTargets: [],
    candidateTargets: [],
    attachedFiles: [],
    memoryTargets: [],
  };
}

function createDefaultBinaryPanelState(): BinaryPanelState {
  return {
    targetEnvironment: {
      runtime: "node18",
      platform: "portable",
      packageManager: "npm",
    },
    activeBuild: null,
    busy: false,
    phase: "queued",
    progress: 0,
    streamConnected: false,
    lastEventId: null,
    previewFiles: [],
    recentLogs: [],
    reliability: null,
    liveReliability: null,
    artifactState: null,
    sourceGraph: null,
    astState: null,
    execution: null,
    runtimeState: null,
    checkpoints: [],
    snapshots: [],
    pendingRefinement: null,
    canCancel: false,
    lastAction: null,
  };
}

function formatBytes(value: number): string {
  if (!Number.isFinite(value) || value <= 0) return "0 B";
  if (value < 1024) return `${value} B`;
  if (value < 1024 * 1024) return `${(value / 1024).toFixed(1)} KB`;
  return `${(value / (1024 * 1024)).toFixed(1)} MB`;
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isTransientBinaryPollError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error || "");
  return /\bHTTP 5\d\d\b/i.test(message) || /\bECONNRESET\b|\bECONNREFUSED\b|\bETIMEDOUT\b/i.test(message);
}

function isBinaryBuildPending(build: BinaryBuildRecord | null | undefined): boolean {
  return Boolean(build && (build.status === "queued" || build.status === "running"));
}

function formatBinaryBuildMessage(build: BinaryBuildRecord): string {
  const lines = [
    build.status === "completed"
      ? "Portable starter bundle ready."
      : build.status === "canceled"
        ? "Portable starter bundle canceled."
      : build.status === "failed"
        ? "Portable starter bundle failed."
        : build.status === "running"
          ? "Portable starter bundle is still building."
          : "Portable starter bundle is queued on the Binary IDE server.",
    `Build: ${build.id}`,
    `Intent: ${build.intent}`,
    `Target runtime: ${build.targetEnvironment.runtime}`,
  ];

  if (build.reliability) {
    lines.push(`Reliability: ${build.reliability.status.toUpperCase()} (${build.reliability.score}/100)`);
    lines.push(build.reliability.summary);
  }
  if (build.liveReliability) {
    lines.push(
      `Live reliability: ${build.liveReliability.score}/100 (${build.liveReliability.trend}), ${build.liveReliability.blockers.length} blockers`
    );
  }
  if (build.artifactState) {
    lines.push(
      `Formation: ${build.artifactState.coverage}% formed, ${build.artifactState.runnable ? "runnable" : "not runnable yet"}`
    );
    lines.push(
      `Files: ${build.artifactState.sourceFilesReady}/${build.artifactState.sourceFilesTotal} source, ${build.artifactState.outputFilesReady} output`
    );
    if (build.artifactState.entryPoints.length) {
      lines.push(`Entry points: ${build.artifactState.entryPoints.join(", ")}`);
    }
  }
  if (build.sourceGraph) {
    lines.push(
      `Source graph: ${build.sourceGraph.readyModules}/${build.sourceGraph.totalModules} modules, ${build.sourceGraph.coverage}% covered`
    );
    if (build.sourceGraph.diagnostics.length) {
      lines.push(`Diagnostics: ${build.sourceGraph.diagnostics.length}`);
    }
  }
  if (build.astState) {
    lines.push(`AST: ${build.astState.coverage}% covered across ${build.astState.moduleCount} modules`);
  }
  if (build.execution) {
    lines.push(
      `Partial runtime: ${build.execution.mode}${build.execution.availableFunctions.length ? ` (${build.execution.availableFunctions.length} callable functions)` : ""}`
    );
    if (build.execution.lastRun) {
      lines.push(`Last run: ${build.execution.lastRun.entryPoint} -> ${build.execution.lastRun.status.toUpperCase()}`);
    }
  }
  if (build.runtimeState) {
    lines.push(
      `Runtime state: ${build.runtimeState.engine}${build.runtimeState.availableFunctions.length ? ` (${build.runtimeState.availableFunctions.length} callable functions)` : ""}`
    );
  }
  if (build.checkpoints?.length) {
    lines.push(`Checkpoints: ${build.checkpoints.length}`);
  }
  if (build.snapshots?.length) {
    lines.push(`Snapshots: ${build.snapshots.length}`);
  }
  if (build.pendingRefinement) {
    lines.push(`Pending refinement: ${build.pendingRefinement.intent}`);
  }
  if (build.parentBuildId) {
    lines.push(`Parent build: ${build.parentBuildId}`);
  }
  if (build.artifact) {
    lines.push(`Artifact: ${build.artifact.fileName} (${formatBytes(build.artifact.sizeBytes)})`);
  }
  if (build.manifest) {
    lines.push(`Entrypoint: ${build.manifest.entrypoint}`);
    lines.push(`Start: ${build.manifest.startCommand}`);
  }
  if (build.publish?.downloadUrl) {
    lines.push(`Download: ${build.publish.downloadUrl}`);
  }
  if (build.errorMessage) {
    lines.push(`Error: ${build.errorMessage}`);
  }
  return lines.join("\n");
}

function isBinaryTerminalStatus(status: BinaryBuildRecord["status"] | undefined): boolean {
  return status === "completed" || status === "failed" || status === "canceled";
}

function nowIso(): string {
  return new Date().toISOString();
}

function formatToolEventLine(event: QwenToolEvent): string {
  const timestamp = String(event.timestamp || "").trim() || nowIso();
  const summary = String(event.summary || event.toolName || "(unknown tool)").trim();
  const detail = String(event.detail || "").trim();
  return `${timestamp} | ${event.phase} | ${summary}${detail ? ` | ${detail}` : ""}`;
}

function containsPseudoToolMarkupText(value: string): boolean {
  const text = String(value || "");
  if (!text) return false;
  return (
    /<tool_call>[\s\S]*?<\/tool_call>/i.test(text) ||
    /<function=[^>]+>/i.test(text) ||
    /<parameter=[^>]+>/i.test(text)
  );
}

function readRecordString(input: unknown, key: string): string | undefined {
  if (!input || typeof input !== "object") return undefined;
  const value = (input as Record<string, unknown>)[key];
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function readRecordStatus(input: unknown): string | undefined {
  return readRecordString(input, "status");
}

function readStringArray(input: unknown): string[] {
  return Array.isArray(input)
    ? input
        .map((item) => (typeof item === "string" ? item.trim() : ""))
        .filter(Boolean)
    : [];
}

function readRecordStringArray(input: unknown, key: string): string[] {
  if (!input || typeof input !== "object") return [];
  return readStringArray((input as Record<string, unknown>)[key]);
}

function normalizeToolCallArguments(input: Record<string, unknown>): string {
  const entries = Object.keys(input || {})
    .sort()
    .map((key) => [key, input[key]]);
  return JSON.stringify(entries);
}

function buildToolCallSignature(toolCall?: PendingToolCall["toolCall"] | null): string {
  if (!toolCall) return "";
  return JSON.stringify({
    name: String(toolCall.name || "").trim().toLowerCase(),
    kind: String(toolCall.kind || "").trim().toLowerCase(),
    arguments: normalizeToolCallArguments(toolCall.arguments || {}),
  });
}

function getObjectiveGoalType(intent: IntentKind, mode: Mode): ObjectiveState["goalType"] {
  if (mode === "plan") return "plan";
  if (intent === "change") return "code_edit";
  if (intent === "find") return "command_run";
  return "unknown";
}

function hasMutationProofFromTools(toolCallsUsed: string[], envelope: AssistRunEnvelope): boolean {
  if (toolCallsUsed.some((tool) => isMutationToolName(tool) || isBinaryLifecycleToolName(tool))) return true;
  if (Array.isArray(envelope.actions) && envelope.actions.length > 0) return true;
  if (
    Array.isArray(envelope.toolTrace) &&
    envelope.toolTrace.some(
      (entry) =>
        entry.status === "completed" &&
        Boolean(entry.toolCall?.name) &&
        (isMutationToolName(entry.toolCall?.name || "") || isBinaryLifecycleToolName(entry.toolCall?.name || ""))
    )
  ) {
    return true;
  }
  return false;
}

function getRecordStatus(value: unknown, fallback?: string): string {
  return readRecordStatus(value) || fallback || "";
}

function buildHostedProgressFingerprint(input: {
  envelope: AssistRunEnvelope;
  toolCallsUsed: string[];
  objectiveState?: ObjectiveState | null;
  progressState?: ProgressState | null;
}): string {
  const loopState = input.envelope.loopState || null;
  const pendingToolCall = input.envelope.pendingToolCall || null;
  const missingRequirements = readStringArray(input.envelope.missingRequirements);
  return JSON.stringify({
    stepCount: loopState?.stepCount ?? null,
    mutationCount: loopState?.mutationCount ?? null,
    repairCount: loopState?.repairCount ?? null,
    repeatedCallCount: loopState?.repeatedCallCount ?? null,
    pendingToolCallSignature: buildToolCallSignature(pendingToolCall?.toolCall || null),
    latestToolResult: input.toolCallsUsed.slice(-1)[0] || "",
    missingRequirements,
    objectiveStatus: input.objectiveState?.status || readRecordStatus(input.envelope.objectiveState) || "unknown",
    progressStatus: input.progressState?.status || readRecordStatus(input.envelope.progressState) || "unknown",
  });
}

function buildHostedTerminalMessage(input: {
  task: string;
  preview: { intent: IntentKind; activeFile?: string; resolvedFiles?: string[]; selectedFiles?: string[] };
  envelope: AssistRunEnvelope;
  progressState?: ProgressState | null;
  objectiveState?: ObjectiveState | null;
  toolCallsUsed: string[];
  mutationProof: boolean;
}): string {
  const missingRequirements = readStringArray(input.envelope.missingRequirements);
  const reviewStatus = getRecordStatus(input.envelope.reviewState, "ready");
  const objectiveStatus = input.objectiveState?.status || readRecordStatus(input.envelope.objectiveState) || "in_progress";
  const progressStatus = input.progressState?.status || readRecordStatus(input.envelope.progressState) || "running";
  const targetPath =
    input.objectiveState?.targetPath ||
    readRecordString(input.envelope.objectiveState, "targetPath") ||
    input.preview.activeFile ||
    input.preview.resolvedFiles?.[0] ||
    input.preview.selectedFiles?.[0] ||
    "";
  const stallReason =
    input.progressState?.stallReason ||
    readRecordString(input.envelope.progressState, "stallReason") ||
    (missingRequirements.length ? missingRequirements[0] : "") ||
    (input.preview.intent === "change" && !input.mutationProof
      ? "The run inspected the target file but never proved a mutation."
      : "");
  const nextDeterministicAction =
    input.progressState?.nextDeterministicAction ||
    readRecordString(input.envelope.progressState, "nextDeterministicAction") ||
    (input.preview.intent === "change"
      ? targetPath
        ? `Edit ${targetPath} directly.`
        : "Edit the resolved target file directly."
      : "Return a concrete next workspace action.");
  const receiptStatus = getRecordStatus(input.envelope.receipt, "ready");
  const lines = [
    "The run stopped before proving the objective was complete.",
    `Task: ${String(input.task || "").trim() || "(unknown)"}`,
    `Completion status: ${String(input.envelope.completionStatus || "incomplete")}`,
    `Objective status: ${objectiveStatus}`,
    `Review status: ${reviewStatus}`,
    `Progress status: ${progressStatus}`,
  ];

  if (missingRequirements.length) {
    lines.push(`Missing requirements: ${missingRequirements.join(", ")}`);
  }
  if (stallReason) {
    lines.push(`Stall reason: ${stallReason}`);
  }
  if (nextDeterministicAction) {
    lines.push(`Next deterministic action: ${nextDeterministicAction}`);
  }
  if (targetPath) {
    lines.push(`Target: ${targetPath}`);
  }
  lines.push(`Receipt status: ${receiptStatus}`);
  if (input.mutationProof) {
    lines.push(`Mutation proof: ${input.toolCallsUsed.filter((tool) => isMutationToolName(tool)).join(", ") || "(present)"}`);
  } else if (input.toolCallsUsed.length) {
    lines.push(`Tools used: ${input.toolCallsUsed.join(", ")}`);
  }
  return lines.join("\n");
}

function isHostedCompletionSuccessful(input: {
  envelope: AssistRunEnvelope;
  objectiveState?: ObjectiveState | null;
  progressState?: ProgressState | null;
  mutationProof: boolean;
  mode: Mode;
}): boolean {
  const completionStatus = input.envelope.completionStatus === "complete";
  const objectiveStatus = input.objectiveState?.status || readRecordStatus(input.envelope.objectiveState);
  const reviewStatus = getRecordStatus(input.envelope.reviewState, "ready");
  const missingRequirements = readStringArray(input.envelope.missingRequirements);
  const terminalProgress = input.progressState?.status || readRecordStatus(input.envelope.progressState);
  const objectSatisfied = objectiveStatus === "satisfied";
  const reviewReady = reviewStatus !== "blocked";
  const missingProof = input.objectiveState ? input.objectiveState.missingProof.length > 0 : false;
  const mutationProofRequired = input.mode !== "plan";
  const mutationProofOk = !mutationProofRequired || input.mutationProof;
  const progressBlocked = terminalProgress === "failed" || terminalProgress === "stalled";
  return (
    completionStatus &&
    objectSatisfied &&
    reviewReady &&
    missingRequirements.length === 0 &&
    !missingProof &&
    mutationProofOk &&
    !progressBlocked
  );
}

function buildContinuationPrompt(baseText: string, followUpText: string): string {
  const base = String(baseText || "").trim();
  const followUp = String(followUpText || "").trim();
  if (!base) return followUp;
  if (!followUp) return base;
  return [base, `User follow-up: ${followUp}`].join("\n\n");
}

function liveProgressForPhase(phase: string): number {
  switch (phase) {
    case "accepted":
      return 4;
    case "collecting_context":
      return 14;
    case "connecting_runtime":
      return 24;
    case "awaiting_tool_approval":
      return 32;
    case "streaming_answer":
      return 58;
    case "saving_session":
      return 88;
    case "completed":
    case "failed":
    case "canceled":
      return 100;
    default:
      return 8;
  }
}

function livePhaseFromRuntimePhase(phase: RuntimePhase): string {
  switch (phase) {
    case "collecting_context":
      return "collecting_context";
    case "waiting_for_cutie":
      return "connecting_runtime";
    case "waiting_for_qwen":
      return "connecting_runtime";
    case "awaiting_approval":
      return "awaiting_tool_approval";
    case "applying_result":
      return "streaming_answer";
    case "saving_session":
      return "saving_session";
    case "done":
      return "completed";
    case "failed":
      return "failed";
    case "clarify":
      return "awaiting_tool_approval";
    default:
      return "accepted";
  }
}

function normalizeMojibakeText(value: string): string {
  return String(value || "")
    .replace(/â€™/g, "'")
    .replace(/â€˜/g, "'")
    .replace(/â€œ/g, '"')
    .replace(/â€�/g, '"')
    .replace(/â€¦/g, "...")
    .replace(/Â·/g, "·")
    .replace(/Â/g, " ");
}

function toSimpleFailureText(value: string): string {
  const text = normalizeMojibakeText(value).trim();
  if (!text) {
    return "Something went wrong. Please retry.";
  }
  if (/temporary provider capacity/i.test(text)) {
    return "The model provider is busy right now. Please retry in a few seconds.";
  }
  if (/binary host completed the turn, but returned no assistant text/i.test(text)) {
    return "I ran the request, but the model returned an empty reply. Please retry.";
  }
  if (/terminal_backend_unavailable_strict/i.test(text)) {
    return "Terminal runtime needs repair before terminal tasks can run.";
  }
  if (/current working directory no longer exists/i.test(text)) {
    return "This thread no longer has a valid working folder. Reopen the workspace and retry.";
  }
  if (/^request failed:\s*/i.test(text)) {
    const stripped = text.replace(/^request failed:\s*/i, "").trim();
    return toSimpleFailureText(stripped);
  }
  return text;
}

function toSimpleActivityText(value: string): string {
  const text = normalizeMojibakeText(value).replace(/\s+/g, " ").trim();
  if (!text) return "";
  if (/^i got your request and i['’]?m starting on it\.?$/i.test(text)) {
    return "Got it. Starting now.";
  }
  if (/^thinking(\..*)?$/i.test(text)) {
    return "Thinking";
  }
  if (/^thinking\.\s*(preparing|checking|continuing)\b/i.test(text)) {
    return "Thinking";
  }
  if (/^openhands-first default:/i.test(text)) {
    return "";
  }
  if (/temporary provider capacity/i.test(text)) {
    return "The model provider is busy right now.";
  }
  if (/binary host completed the turn, but returned no assistant text/i.test(text)) {
    return "The model returned an empty reply.";
  }
  return text;
}

function parseDetachedJobEventMessage(data: unknown): string {
  if (typeof data === "string" && data.trim()) return toSimpleActivityText(data.trim());
  if (!data || typeof data !== "object" || Array.isArray(data)) return "";
  const record = data as Record<string, unknown>;
  const directMessage = typeof record.message === "string" ? record.message.trim() : "";
  if (directMessage) return toSimpleActivityText(directMessage);
  if (typeof record.summary === "string" && record.summary.trim()) return toSimpleActivityText(record.summary.trim());
  if (typeof record.reason === "string" && record.reason.trim()) return toSimpleActivityText(record.reason.trim());
  if (typeof record.status === "string" && record.status.trim()) {
    return toSimpleActivityText(`Status: ${record.status.trim()}`);
  }
  return "";
}

function formatDetachedJobTerminalSummary(job: BinaryAgentJob): string {
  const statusLine =
    job.status === "completed"
      ? `Detached job ${job.id} completed successfully.`
      : job.status === "cancelled"
        ? `Detached job ${job.id} was canceled.`
        : job.status === "takeover_required"
          ? `Detached job ${job.id} needs your input before it can continue.`
          : `Detached job ${job.id} ended with status ${job.status}.`;
  const lines = [
    statusLine,
    job.executionLane ? `Lane: ${job.executionLane}` : "",
    job.runtimeTarget ? `Runtime: ${job.runtimeTarget}` : "",
    job.jsonlPath ? `JSONL: ${job.jsonlPath}` : "",
    job.persistenceDir ? `Artifacts: ${job.persistenceDir}` : "",
    job.errorMessage ? `Error: ${toSimpleFailureText(job.errorMessage)}` : "",
  ].filter(Boolean);
  return lines.join("\n");
}

export class PlaygroundViewProvider implements vscode.WebviewViewProvider {
  private view: vscode.WebviewView | undefined;
  private sessionId: string | null = null;
  private didPrimeFreshChat = false;
  private bootstrapPromise: Promise<void> | null = null;
  private didBootstrap = false;
  private draftText = "";
  private draftPreviewTimer: ReturnType<typeof setTimeout> | null = null;
  private draftPreviewSequence = 0;
  private manualContext: ManualContextState = {
    attachedFiles: [],
    attachedSelection: null,
  };
  private lastPrompt: LastPromptState | null = null;
  private pendingClarification: LastPromptState | null = null;
  private readonly draftStore: DraftStore;
  private state: WebviewState;
  private binaryStreamAbort: AbortController | null = null;
  private promptAbort: AbortController | null = null;
  private binaryStreamBuildId: string | null = null;
  private liveHeartbeatTimer: ReturnType<typeof setInterval> | null = null;
  private readonly binarySeenEventIds = new Map<string, Set<string>>();
  private lastQwenDebugSnapshot: QwenDebugSnapshot | null = null;
  private lastHostedDebugSnapshot: HostedDebugSnapshot | null = null;

  constructor(
    private readonly context: vscode.ExtensionContext,
    private readonly auth: AuthManager,
    private readonly historyService: SessionHistoryService,
    private readonly qwenHistoryService: QwenHistoryService,
    private readonly qwenCodeRuntime: QwenCodeRuntime,
    private readonly contextCollector: ContextCollector,
    private readonly actionRunner: ActionRunner,
    private readonly toolExecutor: ToolExecutor,
    private readonly indexManager: CloudIndexManager
  ) {
    this.draftStore = new DraftStore(this.context.workspaceState);
    this.state = {
      // Always boot in autonomous chat mode. Plan mode is opt-in per session.
      mode: "auto",
      runtime: getRuntimeBackend(),
      auth: { kind: "none", label: "Not signed in" },
      history: [],
      messages: [],
      busy: false,
      canUndo: isHostedOpenHandsRuntime(getRuntimeBackend()) && this.actionRunner.canUndo(),
      activity: [],
      selectedSessionId: null,
      contextSummary: createEmptyContextSummary(),
      contextConfidence: "low",
      intent: "ask",
      runtimePhase: "idle",
      followUpActions: [],
      draftText: "",
      liveChat: null,
      orchestratorStatus: isHostedOpenHandsRuntime(getRuntimeBackend())
        ? { state: "checking", label: "Checking OpenHands..." }
        : null,
      binary: createDefaultBinaryPanelState(),
    };

    this.auth.onDidChange(() => void this.handleAuthChange());
    this.actionRunner.onDidChangeUndo((canUndo) => {
      this.state.canUndo = isHostedOpenHandsRuntime(this.state.runtime) && canUndo;
      this.postState();
    });
  }

  resolveWebviewView(view: vscode.WebviewView): void {
    this.view = view;
    view.webview.options = {
      enableScripts: true,
      localResourceRoots: [vscode.Uri.joinPath(this.context.extensionUri, "media")],
    };
    view.webview.html = this.renderHtml(view.webview);
    view.webview.onDidReceiveMessage((message) => {
      void this.handleMessage(message);
    });
  }

  async show(prefill?: string): Promise<void> {
    await vscode.commands.executeCommand("workbench.view.extension.xpersona").then(undefined, () => undefined);
    await vscode.commands.executeCommand(`${WEBVIEW_VIEW_ID}.focus`).then(undefined, () => undefined);
    if (prefill && this.view) {
      this.view.webview.postMessage({ type: "prefill", text: prefill });
    }
  }

  async runBinaryGenerate(intent?: string): Promise<void> {
    await this.show(intent);
    const nextIntent =
      String(intent || "").trim() ||
      (await vscode.window.showInputBox({
        title: "Generate Binary IDE Portable Starter Bundle",
        prompt: "Describe the portable package bundle you want to generate.",
        ignoreFocusOut: true,
      })) ||
      "";
    if (!nextIntent.trim()) return;
    await this.generateBinaryBuild(nextIntent);
  }

  async runBinaryValidate(): Promise<void> {
    await this.show();
    await this.validateBinaryBuild();
  }

  async runBinaryDeploy(): Promise<void> {
    await this.show();
    await this.publishBinaryBuild();
  }

  async openBinaryConfiguration(): Promise<void> {
    await this.show();
    const selection = await vscode.window.showQuickPick(
      [
        { label: "Set Xpersona API key", detail: "Save or clear your Xpersona Binary IDE API key.", action: "apiKey" },
        {
          label: "Open Binary IDE settings",
          detail: "Open the VS Code settings UI filtered to xpersona.binary.",
          action: "settings",
        },
        ...(isHostedOpenHandsRuntime(this.state.runtime)
          ? [{ label: "Browser sign in", detail: "Authenticate the hosted Binary IDE API in the browser.", action: "signIn" }]
          : []),
      ],
      {
        title: "Configure Binary IDE",
        ignoreFocusOut: true,
      }
    );
    if (!selection) return;

    let message = "";
    switch (selection.action) {
      case "apiKey":
        message = await this.performSetApiKey();
        break;
      case "settings":
        await vscode.commands.executeCommand("workbench.action.openSettings", "xpersona.binary");
        message = "Opened Binary IDE settings.";
        break;
      case "signIn":
        message = await this.performSignIn();
        break;
      default:
        return;
    }

    if (!message) return;
    this.appendMessage("system", message);
    this.postState();
  }

  private getDraftSessionId(): string | null {
    return this.state.selectedSessionId || this.sessionId || null;
  }

  private async loadDraftText(): Promise<void> {
    this.draftText = await this.draftStore.get(this.state.runtime, this.getDraftSessionId());
    this.state.draftText = this.draftText;
  }

  private async setDraftText(text: string): Promise<void> {
    this.draftText = String(text || "");
    this.state.draftText = this.draftText;
    await this.draftStore.set(this.state.runtime, this.getDraftSessionId(), this.draftText);
  }

  private async clearCurrentDraft(): Promise<void> {
    await this.setDraftText("");
  }

  private async setRuntime(runtime: RuntimeBackend): Promise<void> {
    if (runtime !== "playgroundApi") {
      runtime = "playgroundApi";
    }
    if (runtime === this.state.runtime) return;
    const target = vscode.workspace.workspaceFolders?.length
      ? vscode.ConfigurationTarget.Workspace
      : vscode.ConfigurationTarget.Global;
    await vscode.workspace
      .getConfiguration(EXTENSION_NAMESPACE)
      .update("runtime", runtime, target);
    await this.refreshConfiguration();
  }

  private getRuntimePhaseForDraft(): RuntimePhase {
    return this.draftText.trim() ? "radar" : "idle";
  }

  private shouldPreserveTerminalPhase(): boolean {
    return this.state.runtimePhase === "done" || this.state.runtimePhase === "failed";
  }

  private async performSetApiKey(): Promise<string> {
    await this.auth.setApiKeyInteractive();
    await this.refreshAuth();
    await this.refreshOrchestratorStatus();
    await this.refreshHistory();
    return this.state.auth.kind === "none"
      ? "Xpersona Binary IDE API key cleared."
      : "Xpersona Binary IDE API key updated.";
  }

  private async performSignIn(): Promise<string> {
    await this.auth.signInWithBrowser();
    return "Browser sign-in opened.";
  }

  private async performSignOut(): Promise<string> {
    await this.auth.signOut();
    await this.newChat();
    await this.refreshAuth();
    await this.refreshOrchestratorStatus();
    await this.refreshHistory();
    return "Binary IDE auth cleared.";
  }

  private async performUndo(): Promise<string> {
    return this.actionRunner.undoLastBatch();
  }

  private async waitForBinaryBuildCompletion(
    auth: RequestAuth,
    initialBuild: BinaryBuildRecord
  ): Promise<BinaryBuildRecord> {
    let current = initialBuild;
    let lastActivity = "";
    let attempt = 0;
    let transientFailures = 0;

    while (isBinaryBuildPending(current)) {
      const nextActivity =
        current.status === "queued"
          ? "Portable starter bundle queued"
          : "Building portable starter bundle";
      if (nextActivity !== lastActivity) {
        this.pushActivity(nextActivity);
        lastActivity = nextActivity;
      }

      this.setActiveBinaryBuild(current);
      this.postState();
      await delay(Math.min(1_000 + attempt * 250, 2_500));
      try {
        current = await requestBinaryStatus(auth, current.id);
        transientFailures = 0;
      } catch (error) {
        if (!isTransientBinaryPollError(error) || transientFailures >= 4) {
          throw error;
        }

        transientFailures += 1;
        this.pushActivity(`Retrying bundle status (${transientFailures}/4)`);
        await delay(400 * transientFailures);
        continue;
      }
      attempt += 1;
    }

    return current;
  }

  private async handleSlashCommand(text: string, clientMessageId = ""): Promise<boolean> {
    const command = parseSlashCommand(text);
    if (!command) return false;

    await this.clearCurrentDraft();

    switch (command.kind) {
      case "help":
        this.appendMessage("system", buildSlashCommandHelpMessage());
        this.state.runtimePhase = this.getRuntimePhaseForDraft();
        this.postState();
        return true;
      case "new":
        await this.newChat();
        this.appendMessage("system", "Started a new chat.");
        this.postState();
        return true;
      case "plan":
        await this.activatePlanMode();
        return true;
      case "auto":
        await this.setMode("auto");
        this.appendMessage("system", "Mode set to Auto.");
        this.state.runtimePhase = this.getRuntimePhaseForDraft();
        this.postState();
        return true;
      case "detach":
        if (!command.task) {
          this.appendMessage("system", "Usage: /detach <task>");
          this.state.runtimePhase = this.getRuntimePhaseForDraft();
          this.postState();
          return true;
        }
        this.lastPrompt = {
          text: command.task,
          intent: classifyIntent(command.task),
          searchDepth: "fast",
        };
        await this.sendPromptWithDetachedJob(command.task, clientMessageId, undefined, true);
        return true;
      case "runtime":
        this.appendMessage("system", "Hosted OpenHands orchestration is always on for Binary IDE chats.");
        this.state.runtimePhase = this.getRuntimePhaseForDraft();
        this.postState();
        return true;
      case "key":
        this.appendMessage("system", await this.performSetApiKey());
        this.state.runtimePhase = this.getRuntimePhaseForDraft();
        this.postState();
        return true;
      case "signin":
        this.appendMessage("system", await this.performSignIn());
        this.state.runtimePhase = this.getRuntimePhaseForDraft();
        this.postState();
        return true;
      case "signout":
        this.appendMessage("system", await this.performSignOut());
        this.state.runtimePhase = this.getRuntimePhaseForDraft();
        this.postState();
        return true;
      case "undo":
        this.appendMessage("system", await this.performUndo());
        this.state.runtimePhase = this.getRuntimePhaseForDraft();
        this.postState();
        return true;
      case "status":
        this.appendMessage(
          "system",
          buildSlashStatusMessage({
            runtime: this.state.runtime,
            mode: this.state.mode,
            authLabel: this.state.auth.label,
            runtimePhase: this.state.runtimePhase,
            sessionId: this.getDraftSessionId(),
            attachedFiles: this.manualContext.attachedFiles,
            attachedSelectionPath: this.manualContext.attachedSelection?.path || null,
          })
        );
        this.state.runtimePhase = this.getRuntimePhaseForDraft();
        this.postState();
        return true;
      case "unknown":
        this.appendMessage(
          "system",
          buildSlashCommandHelpMessage(`Unknown slash command: ${command.raw}`)
        );
        this.state.runtimePhase = this.getRuntimePhaseForDraft();
        this.postState();
        return true;
    }
  }

  async refreshConfiguration(): Promise<void> {
    const runtime = getRuntimeBackend();
    const runtimeChanged = runtime !== this.state.runtime;
    this.state.runtime = runtime;
    this.state.canUndo = isHostedOpenHandsRuntime(runtime) && this.actionRunner.canUndo();
    if (runtimeChanged) {
      this.stopBinaryStream();
      this.stopLiveHeartbeat();
      this.sessionId = null;
      this.state.selectedSessionId = null;
      this.state.messages = [];
      this.state.liveChat = null;
      this.state.activity = [];
      this.state.followUpActions = [];
      this.setActiveBinaryBuild(null);
      this.state.runtimePhase = "idle";
      this.lastPrompt = null;
      this.pendingClarification = null;
    }
    await this.loadDraftText();
    await this.refreshAuth();
    await this.refreshOrchestratorStatus();
    await this.refreshHistory();
    await this.refreshDraftContext(this.draftText);
    await this.resumeBinaryBuildIfNeeded();
    this.postState();
  }

  async setMode(mode: Mode): Promise<void> {
    const nextMode = normalizeMode(mode);
    this.state.mode = nextMode;
    await this.context.workspaceState.update(MODE_KEY, nextMode);
    this.postState();
  }

  private async activatePlanMode(): Promise<void> {
    await this.setDraftText("");
    await this.setMode("plan");
    this.appendMessage("system", "Mode set to Plan.");
    this.state.runtimePhase = this.getRuntimePhaseForDraft();
    this.postState();
  }

  private async togglePlanMode(): Promise<void> {
    const nextMode: Mode = this.state.mode === "plan" ? "auto" : "plan";
    await this.setMode(nextMode);
    this.appendMessage("system", nextMode === "plan" ? "Mode set to Plan." : "Mode set to Auto.");
    this.state.runtimePhase = this.getRuntimePhaseForDraft();
    this.postState();
  }

  async refreshHistory(): Promise<void> {
    const auth = await this.auth.getRequestAuth();
    if (!auth) {
      this.state.history = [];
      this.postState();
      return;
    }
    this.state.history = await this.historyService.list(auth).catch(() => []);
    this.postState();
  }

  async newChat(): Promise<void> {
    this.clearDraftPreviewTimer();
    this.stopBinaryStream();
    this.stopLiveHeartbeat();
    this.clearBinaryEventTracking();
    this.sessionId = null;
    this.state.messages = [];
    this.state.liveChat = null;
    this.state.activity = [];
    this.state.selectedSessionId = null;
    this.state.busy = false;
    this.state.canUndo = isHostedOpenHandsRuntime(this.state.runtime) && this.actionRunner.canUndo();
    this.state.followUpActions = [];
    this.state.binary = {
      ...createDefaultBinaryPanelState(),
      targetEnvironment: this.state.binary.targetEnvironment,
    };
    this.lastPrompt = null;
    this.pendingClarification = null;
    await this.persistActiveBinaryBuildId(null);
    await this.loadDraftText();
    this.state.runtimePhase = this.getRuntimePhaseForDraft();
    await this.refreshDraftContext(this.draftText);
    this.postState();
  }

  private async bootstrap(): Promise<void> {
    if (this.didBootstrap) return;
    if (this.bootstrapPromise) {
      await this.bootstrapPromise;
      return;
    }

    this.bootstrapPromise = (async () => {
      if (!this.didPrimeFreshChat) {
        this.didPrimeFreshChat = true;
        this.sessionId = null;
        this.state.messages = [];
        this.state.liveChat = null;
        this.state.activity = [];
        this.state.selectedSessionId = null;
        this.state.busy = false;
        this.state.canUndo = isHostedOpenHandsRuntime(this.state.runtime) && this.actionRunner.canUndo();
        this.state.followUpActions = [];
        this.state.runtimePhase = "idle";
        this.lastPrompt = null;
        this.pendingClarification = null;
      }
      await this.loadDraftText();
      await this.refreshConfiguration();
      this.didBootstrap = true;
    })();

    try {
      await this.bootstrapPromise;
    } finally {
      this.bootstrapPromise = null;
    }
  }

  private async handleAuthChange(): Promise<void> {
    await this.refreshAuth();
    await this.refreshOrchestratorStatus();
    await this.refreshHistory();
    this.postState();
  }

  private async refreshAuth(): Promise<void> {
    this.state.auth = await this.auth.getAuthState().catch(() => ({
      kind: "none",
      label: "Not signed in",
    }));
    this.postState();
  }

  private async refreshOrchestratorStatus(): Promise<void> {
    if (!isHostedOpenHandsRuntime(this.state.runtime)) {
      this.state.orchestratorStatus = null;
      this.postState();
      return;
    }

    const auth = await this.auth.getRequestAuth();
    if (!auth) {
      this.state.orchestratorStatus = {
        state: "unavailable",
        label: "Sign in to verify OpenHands",
      };
      this.postState();
      return;
    }

    this.state.orchestratorStatus = {
      state: "checking",
      label: "Checking OpenHands...",
    };
    this.postState();

    try {
      const response = await requestJson<{
        data?: {
          status?: "healthy" | "missing_config" | "unauthorized" | "unreachable";
          message?: string;
          details?: string;
        };
      }>("GET", `${getBaseApiUrl()}/api/v1/playground/openhands/health`, auth);
      const health = (
        response &&
        typeof response === "object" &&
        "data" in response &&
        response.data &&
        typeof response.data === "object"
          ? response.data
          : response
      ) as
        | {
            status?: "healthy" | "missing_config" | "unauthorized" | "unreachable";
            message?: string;
            details?: string;
          }
        | undefined;
      const healthy = health?.status === "healthy";
      this.state.orchestratorStatus = {
        state: healthy ? "ready" : "unavailable",
        label: healthy ? "OpenHands connected" : String(health?.message || "OpenHands unavailable"),
        ...(typeof health?.details === "string" && health.details.trim() ? { detail: health.details } : {}),
      };
    } catch (error) {
      this.state.orchestratorStatus = {
        state: "unavailable",
        label: "OpenHands unavailable",
        detail: error instanceof Error ? error.message : String(error),
      };
    }
    this.postState();
  }

  private async openSession(sessionId: string): Promise<void> {
    if (!sessionId) return;
    this.stopBinaryStream();
    this.stopLiveHeartbeat();
    this.clearBinaryEventTracking();
    this.setActiveBinaryBuild(null);
    this.state.liveChat = null;

    const auth = await this.auth.getRequestAuth();
    if (!auth) return;
    this.sessionId = sessionId;
    this.state.selectedSessionId = sessionId;
    this.state.messages = await this.historyService.loadMessages(auth, sessionId).catch(() => []);
    this.state.activity = [];
    this.state.followUpActions = [];
    await this.loadDraftText();
    this.postState();
  }

  private async handleMessage(message: any): Promise<void> {
    if (!message || typeof message !== "object") return;

    if (message.type !== "ready") {
      await this.bootstrap();
    }

    switch (message.type) {
      case "ready":
        await this.bootstrap();
        return;
      case "sendPrompt":
        await this.sendPrompt(String(message.text || ""), String(message.clientMessageId || ""));
        return;
      case "confirmPlanMode":
        if (String(message.text || "").trim()) {
          await this.sendPrompt(String(message.text || ""), String(message.clientMessageId || ""));
        } else {
          await this.activatePlanMode();
        }
        return;
      case "togglePlanMode":
        await this.togglePlanMode();
        return;
      case "generateBinary":
        await this.generateBinaryBuild(String(message.text || this.draftText || ""));
        return;
      case "refineBinary":
        await this.refineBinaryBuild(String(message.text || this.draftText || ""));
        return;
      case "branchBinary":
        await this.branchBinaryBuild(String(message.text || this.draftText || ""), String(message.checkpointId || ""));
        return;
      case "rewindBinary":
        await this.rewindBinaryBuild(String(message.checkpointId || ""));
        return;
      case "executeBinary":
        await this.executeBinaryBuild(String(message.entryPoint || ""));
        return;
      case "validateBinary":
        await this.validateBinaryBuild();
        return;
      case "deployBinary":
        await this.publishBinaryBuild();
        return;
      case "cancelBinary":
        await this.cancelBinaryBuild();
        return;
      case "cancelPrompt":
        this.cancelActivePrompt();
        return;
      case "configureBinary":
        await this.openBinaryConfiguration();
        return;
      case "setBinaryTarget":
        await this.setBinaryTargetRuntime(String(message.runtime || "node18"));
        return;
      case "newChat":
        await this.newChat();
        return;
      case "previewContext":
        await this.setDraftText(String(message.text || ""));
        this.queueDraftContextRefresh(this.draftText);
        return;
      case "setMode":
        await this.setMode(String(message.value || "auto") as Mode);
        return;
      case "setApiKey":
        await this.performSetApiKey();
        return;
      case "setRuntimeBackend": {
        await this.setRuntime("playgroundApi");
        this.appendMessage("system", "Hosted OpenHands orchestration is always on for Binary IDE chats.");
        this.postState();
        return;
      }
      case "signIn":
        vscode.window.showInformationMessage(await this.performSignIn());
        return;
      case "signOut":
        vscode.window.showInformationMessage(await this.performSignOut());
        return;
      case "loadHistory":
        await this.refreshHistory();
        return;
      case "openSession":
        await this.openSession(String(message.id || ""));
        return;
      case "attachActiveFile":
        await this.attachActiveFile();
        return;
      case "attachSelection":
        await this.attachSelection();
        return;
      case "clearAttachedContext":
        await this.clearAttachedContext();
        return;
      case "followUpAction":
        await this.handleFollowUpAction(String(message.id || ""));
        return;
      case "undoLastChanges": {
        this.appendMessage("system", await this.performUndo());
        this.postState();
        return;
      }
      case "mentionsQuery": {
        const requestId = Number(message.requestId || 0);
        const items = await this.contextCollector.getMentionSuggestions(String(message.query || ""));
        this.view?.webview.postMessage({ type: "mentions", requestId, items });
        return;
      }
      case "copyDebugReport":
        await this.copyDebugReport();
        return;
      default:
        return;
    }
  }

  private async getQwenContextOptions(input?: {
    searchDepth?: "fast" | "deep";
    intent?: IntentKind;
    includeWorkspaceHints?: boolean;
  }) {
    const includeWorkspaceHints = input?.includeWorkspaceHints !== false;
    const hints = includeWorkspaceHints
      ? await this.qwenHistoryService.getWorkspaceHints().catch(() => ({
          recentTargets: [] as string[],
          recentIntents: [] as IntentKind[],
        }))
      : {
          recentTargets: [] as string[],
          recentIntents: [] as IntentKind[],
        };

    return {
      recentTouchedPaths: this.actionRunner.getRecentTouchedPaths(),
      attachedFiles: this.manualContext.attachedFiles,
      attachedSelection: this.manualContext.attachedSelection,
      memoryTargets: hints.recentTargets,
      searchDepth: input?.searchDepth || "fast",
      ...(input?.intent ? { intent: input.intent } : {}),
    };
  }

  private applyPreviewState(preview: Awaited<ReturnType<ContextCollector["preview"]>>): void {
    this.state.intent = preview.intent;
    this.state.contextConfidence = preview.confidence;
    this.state.contextSummary = buildContextSummary(preview);
  }

  private resetQwenInteractionState(): void {
    this.state.followUpActions = [];
    this.state.activity = [];
    this.state.runtimePhase = this.getRuntimePhaseForDraft();
    this.pendingClarification = null;
  }

  private hasManualDraftContext(): boolean {
    return Boolean(this.manualContext.attachedFiles.length || this.manualContext.attachedSelection);
  }

  private clearDraftPreviewTimer(): void {
    if (!this.draftPreviewTimer) return;
    clearTimeout(this.draftPreviewTimer);
    this.draftPreviewTimer = null;
  }

  private queueDraftContextRefresh(text: string): void {
    this.clearDraftPreviewTimer();
    if (this.state.runtime !== "qwenCode") return;

    const draft = String(text || "");
    this.draftPreviewTimer = setTimeout(() => {
      void this.refreshDraftContext(draft);
    }, draft.trim() ? 90 : 0);
  }

  private async refreshDraftContext(text: string): Promise<void> {
    if (this.state.runtime !== "qwenCode") return;

    const draft = String(text || "");
    if (!draft.trim() && !this.hasManualDraftContext()) {
      this.state.intent = "ask";
      this.state.contextConfidence = "low";
      this.state.contextSummary = createEmptyContextSummary();
      if (!this.state.busy && !this.shouldPreserveTerminalPhase()) {
        this.state.runtimePhase = "idle";
      }
      this.postState();
      return;
    }

    const sequence = ++this.draftPreviewSequence;
    const includeWorkspaceHints = Boolean(this.sessionId || this.state.selectedSessionId);
    const contextOptions = await this.getQwenContextOptions({
      searchDepth: "fast",
      intent: draft.trim() ? classifyIntent(draft) : undefined,
      includeWorkspaceHints,
    });
    const preview = await this.contextCollector.preview(
      draft,
      contextOptions
    );
    if (sequence !== this.draftPreviewSequence) return;
    this.applyPreviewState(preview);
    if (!this.state.busy && (!this.shouldPreserveTerminalPhase() || draft.trim())) {
      this.state.runtimePhase = draft.trim() ? "radar" : "idle";
    }
    this.postState();
  }

  private stopLiveHeartbeat(): void {
    if (!this.liveHeartbeatTimer) return;
    clearInterval(this.liveHeartbeatTimer);
    this.liveHeartbeatTimer = null;
  }

  private startLiveHeartbeat(): void {
    this.stopLiveHeartbeat();
    this.liveHeartbeatTimer = setInterval(() => {
      const liveChat = this.state.liveChat;
      if (!liveChat) {
        this.stopLiveHeartbeat();
        return;
      }
      if (liveChat.status === "done" || liveChat.status === "failed" || liveChat.status === "canceled") {
        this.stopLiveHeartbeat();
        return;
      }
      const nextProgress = Math.min(
        liveChat.mode === "answer" ? 82 : 46,
        Math.max(
          typeof liveChat.progress === "number" ? liveChat.progress : liveProgressForPhase(liveChat.phase),
          liveProgressForPhase(liveChat.phase)
        ) + 2
      );
      this.upsertMessage(liveChat.messageId, "assistant", this.getMessageById(liveChat.messageId)?.content || "", {
        presentation: "live_binary",
        live: {
          ...liveChat,
          progress: nextProgress,
          updatedAt: nowIso(),
        },
      });
      this.state.liveChat = {
        ...liveChat,
        progress: nextProgress,
        updatedAt: nowIso(),
      };
      this.postState();
    }, LIVE_CHAT_HEARTBEAT_MS);
  }

  private isPromptAbortError(error: unknown): boolean {
    if (!error) return false;
    if (error instanceof Error) {
      if (error.name === "AbortError") return true;
      return /\babort(?:ed|ing)?\b/i.test(error.message || "");
    }
    return /\babort(?:ed|ing)?\b/i.test(String(error));
  }

  private clearPromptAbort(controller?: AbortController | null): void {
    if (!this.promptAbort) return;
    if (!controller || this.promptAbort === controller) {
      this.promptAbort = null;
    }
  }

  private cancelActivePrompt(): void {
    const live = this.state.liveChat;
    if (!live || live.mode === "build" || !this.state.busy) {
      this.appendMessage("system", "There is no active response stream to cancel.");
      this.postState();
      return;
    }
    this.promptAbort?.abort();
    this.promptAbort = null;
    this.pushActivity("Canceled current response");
    this.state.runtimePhase = "canceled";
    this.applyChatLiveEvent({
      type: "canceled",
      text: "Canceled current response.",
      phase: "canceled",
    });
    this.state.busy = false;
    this.postState();
  }

  private getMessageById(id: string): ChatMessage | null {
    return this.state.messages.find((message) => message.id === id) || null;
  }

  private createLiveAssistantMessage(input: {
    transport: ChatLiveState["transport"];
    mode?: ChatLiveState["mode"];
    phase?: string;
    latestActivity?: string;
    content?: string;
  }): string {
    const messageId = randomUUID();
    const live: LiveChatState = {
      messageId,
      mode: input.mode || "shell",
      status: "pending",
      phase: input.phase || "accepted",
      transport: input.transport,
      progress: liveProgressForPhase(input.phase || "accepted"),
      latestActivity: input.latestActivity,
      startedAt: nowIso(),
      updatedAt: nowIso(),
    };
    this.state.liveChat = live;
    this.upsertMessage(messageId, "assistant", input.content || "", {
      presentation: "live_binary",
      live,
    });
    this.startLiveHeartbeat();
    return messageId;
  }

  private updateLiveAssistant(input: Partial<LiveChatState> & { content?: string; role?: ChatMessage["role"] }): void {
    const current = this.state.liveChat;
    if (!current) return;
    const message = this.getMessageById(current.messageId);
    const nextLive: LiveChatState = {
      ...current,
      ...input,
      messageId: current.messageId,
      updatedAt: nowIso(),
      progress:
        typeof input.progress === "number"
          ? input.progress
          : typeof current.progress === "number"
            ? current.progress
            : liveProgressForPhase(input.phase || current.phase),
    };
    if (nextLive.mode === "answer" && nextLive.status === "pending") {
      nextLive.status = "streaming";
    }
    this.state.liveChat = nextLive;
    this.upsertMessage(current.messageId, input.role || "assistant", input.content ?? message?.content ?? "", {
      presentation: "live_binary",
      live: nextLive,
    });
  }

  private resolveLiveAssistant(input: {
    content: string;
    status?: "done" | "failed" | "canceled";
    mode?: ChatLiveState["mode"];
    phase?: string;
    latestActivity?: string;
    latestLog?: string;
    latestFile?: string;
    role?: ChatMessage["role"];
  }): void {
    const current = this.state.liveChat;
    if (!current) return;
    const currentMessage = this.getMessageById(current.messageId);
    const currentContent = String(currentMessage?.content || "").trim();
    const finalContent = String(input.content || "").trim();
    const normalizedCurrent = currentContent.replace(/\s+/g, " ");
    const normalizedFinal = finalContent.replace(/\s+/g, " ");
    const finalClearlyExtendsStreamedContent =
      normalizedCurrent.length > 0 &&
      normalizedFinal.length >= normalizedCurrent.length + 80 &&
      normalizedFinal.includes(normalizedCurrent);
    const contentToUse =
      currentContent && !finalClearlyExtendsStreamedContent
        ? currentContent
        : finalContent || currentContent;
    const nextLive: ChatLiveState = {
      ...current,
      mode: input.mode || current.mode,
      status: input.status || "done",
      phase: input.phase || (input.status === "failed" ? "failed" : input.status === "canceled" ? "canceled" : "completed"),
      progress: 100,
      latestActivity: input.latestActivity || current.latestActivity,
      latestLog: input.latestLog || current.latestLog,
      latestFile: input.latestFile || current.latestFile,
      updatedAt: nowIso(),
    };
    this.upsertMessage(current.messageId, input.role || "assistant", contentToUse, {
      presentation: "live_binary",
      live: nextLive,
    });
    this.state.liveChat = null;
    this.stopLiveHeartbeat();
  }

  private applyChatLiveEvent(event: ChatLiveEvent): void {
    if (event.type === "accepted") {
      this.createLiveAssistantMessage({
        transport: event.transport,
        mode: event.mode || "shell",
        phase: event.phase || "accepted",
      });
      return;
    }

    if (!this.state.liveChat) return;

    switch (event.type) {
      case "phase":
        this.updateLiveAssistant({
          phase: event.phase,
          status: event.status || this.state.liveChat.status,
          progress:
            typeof event.progress === "number" ? event.progress : liveProgressForPhase(event.phase),
          latestActivity: event.latestActivity || this.state.liveChat.latestActivity,
        });
        return;
      case "activity":
        {
          const activity = toSimpleActivityText(event.activity);
          if (!activity) return;
          if (activity === this.state.liveChat.latestActivity) return;
          this.updateLiveAssistant({
            latestActivity: activity,
            phase: event.phase || this.state.liveChat.phase,
            progress: liveProgressForPhase(event.phase || this.state.liveChat.phase),
          });
          return;
        }
      case "partial_text":
        this.updateLiveAssistant({
          mode: "answer",
          status: "streaming",
          phase: event.phase || "streaming_answer",
          progress: Math.max(this.state.liveChat.progress || 0, liveProgressForPhase("streaming_answer")),
          content: event.text,
        });
        return;
      case "build_attached":
        this.updateLiveAssistant({
          mode: "build",
          transport: "binary",
          buildId: event.buildId,
          phase: event.phase || "planning",
          progress: typeof event.progress === "number" ? event.progress : liveProgressForPhase(event.phase || "planning"),
        });
        return;
      case "build_event":
        this.updateLiveAssistant({
          mode: "build",
          transport: "binary",
          phase: event.phase || this.state.liveChat.phase,
          progress:
            typeof event.progress === "number"
              ? event.progress
              : this.state.liveChat.progress,
          latestLog: event.latestLog || this.state.liveChat.latestLog,
          latestFile: event.latestFile || this.state.liveChat.latestFile,
        });
        return;
      case "tool_approval":
        {
          const approvalMessage = toSimpleActivityText(event.activity);
          if (!approvalMessage) return;
          this.updateLiveAssistant({
            phase: "awaiting_tool_approval",
            latestActivity: approvalMessage,
            progress: liveProgressForPhase("awaiting_tool_approval"),
          });
          return;
        }
      case "final":
        this.resolveLiveAssistant({
          content: event.text,
          status: "done",
          mode: this.state.liveChat.mode === "build" ? "build" : "answer",
          phase: "completed",
        });
        return;
      case "failed":
        this.resolveLiveAssistant({
          content: toSimpleFailureText(event.text),
          status: "failed",
          mode: this.state.liveChat.mode,
          phase: event.phase || "failed",
          role: "assistant",
        });
        return;
      case "canceled":
        this.resolveLiveAssistant({
          content: event.text || "Binary IDE canceled the active run.",
          status: "canceled",
          mode: this.state.liveChat.mode,
          phase: event.phase || "canceled",
        });
        return;
      default:
        return;
    }
  }

  private getActiveEditorPath(): string | null {
    const editor = vscode.window.activeTextEditor;
    if (!editor) return null;
    return toWorkspaceRelativePath(editor.document.uri);
  }

  private stopBinaryStream(): void {
    this.binaryStreamAbort?.abort();
    this.binaryStreamAbort = null;
    this.binaryStreamBuildId = null;
    this.state.binary.streamConnected = false;
  }

  private clearBinaryEventTracking(buildId?: string | null): void {
    if (buildId) {
      this.binarySeenEventIds.delete(buildId);
      return;
    }
    this.binarySeenEventIds.clear();
  }

  private rememberBinaryEvent(buildId: string, eventId: string): boolean {
    const next = this.binarySeenEventIds.get(buildId) || new Set<string>();
    if (next.has(eventId)) return false;
    next.add(eventId);
    if (next.size > 256) {
      const oldest = next.values().next().value;
      if (oldest) next.delete(oldest);
    }
    this.binarySeenEventIds.set(buildId, next);
    return true;
  }

  private async persistActiveBinaryBuildId(buildId: string | null): Promise<void> {
    await this.context.workspaceState.update(BINARY_ACTIVE_BUILD_KEY, buildId);
  }

  private getPersistedBinaryCursor(buildId: string): string | null {
    const raw = this.context.workspaceState.get<Record<string, string | null>>(BINARY_STREAM_CURSOR_KEY) || {};
    const value = raw[buildId];
    return typeof value === "string" && value.trim() ? value.trim() : null;
  }

  private async persistBinaryCursor(buildId: string, eventId: string | null): Promise<void> {
    const raw = this.context.workspaceState.get<Record<string, string | null>>(BINARY_STREAM_CURSOR_KEY) || {};
    const next = { ...raw };
    if (eventId) next[buildId] = eventId;
    else delete next[buildId];
    await this.context.workspaceState.update(BINARY_STREAM_CURSOR_KEY, next);
  }

  private deriveBinaryPhase(build: BinaryBuildRecord | null): BinaryBuildPhase | undefined {
    if (!build) return undefined;
    if (build.phase) return build.phase;
    if (build.status === "completed") return "completed";
    if (build.status === "failed") return "failed";
    if (build.status === "canceled") return "canceled";
    return build.status === "running" ? "planning" : "queued";
  }

  private phaseProgressLabel(phase: BinaryBuildPhase | undefined): string {
    switch (phase) {
      case "planning":
        return "Designing bundle plan";
      case "materializing":
        return "Writing source files";
      case "installing":
        return "Installing dependencies";
      case "compiling":
        return "Compiling generated source";
      case "validating":
        return "Scoring reliability";
      case "packaging":
        return "Sealing portable bundle";
      case "completed":
        return "Portable starter bundle ready";
      case "failed":
        return "Portable starter bundle failed";
      case "canceled":
        return "Portable starter bundle canceled";
      default:
        return "Queued for build";
    }
  }

  private syncBinaryPanelFromBuild(build: BinaryBuildRecord | null): void {
    this.state.binary.activeBuild = build;
    this.state.binary.phase = this.deriveBinaryPhase(build);
    this.state.binary.progress = build?.progress ?? (build?.status === "completed" ? 100 : 0);
    this.state.binary.previewFiles = build?.preview?.files || [];
    this.state.binary.recentLogs = build?.preview?.recentLogs || [];
    this.state.binary.reliability = build?.reliability || null;
    this.state.binary.liveReliability = build?.liveReliability || null;
    this.state.binary.artifactState = build?.artifactState || null;
    this.state.binary.sourceGraph = build?.sourceGraph || null;
    this.state.binary.astState = build?.astState || null;
    this.state.binary.execution = build?.execution || null;
    this.state.binary.runtimeState = build?.runtimeState || null;
    this.state.binary.checkpoints = build?.checkpoints || [];
    this.state.binary.snapshots = build?.snapshots || [];
    this.state.binary.pendingRefinement = build?.pendingRefinement || null;
    this.state.binary.canCancel = Boolean(build?.cancelable && isBinaryBuildPending(build));
    if (build?.targetEnvironment) {
      this.state.binary.targetEnvironment = build.targetEnvironment;
    }
  }

  private updateBinarySnapshots(snapshot: BinarySnapshotSummary): BinarySnapshotSummary[] {
    const current = this.state.binary.snapshots || [];
    return [snapshot, ...current.filter((item) => item.id !== snapshot.id)].slice(0, 80);
  }

  private updateBinaryAstState(astState: BinaryAstState): void {
    this.state.binary.astState = astState;
    if (this.state.binary.activeBuild) {
      this.state.binary.activeBuild = {
        ...this.state.binary.activeBuild,
        astState,
      };
    }
  }

  private updateBinaryRuntimeState(runtimeState: BinaryRuntimeState): void {
    this.state.binary.runtimeState = runtimeState;
    if (this.state.binary.activeBuild) {
      this.state.binary.activeBuild = {
        ...this.state.binary.activeBuild,
        runtimeState,
      };
    }
  }

  private updateBinaryLiveReliability(liveReliability: BinaryLiveReliabilityState): void {
    this.state.binary.liveReliability = liveReliability;
    if (this.state.binary.activeBuild) {
      this.state.binary.activeBuild = {
        ...this.state.binary.activeBuild,
        liveReliability,
      };
    }
  }

  private setActiveBinaryBuild(build: BinaryBuildRecord | null): void {
    this.syncBinaryPanelFromBuild(build);
    if (build && this.state.liveChat && (this.state.liveChat.mode === "build" || this.state.liveChat.buildId === build.id)) {
      const latestFile = build.artifactState?.latestFile || build.preview?.files?.[0]?.path;
      const latestLog = build.preview?.recentLogs?.slice(-1)[0];
      if (isBinaryTerminalStatus(build.status)) {
        this.resolveLiveAssistant({
          content: formatBinaryBuildMessage(build),
          status: build.status === "canceled" ? "canceled" : build.status === "failed" ? "failed" : "done",
          mode: "build",
          phase: build.phase || (build.status === "completed" ? "completed" : build.status),
          latestActivity: this.phaseProgressLabel(build.phase),
          latestLog,
          latestFile,
          role: build.status === "completed" ? "assistant" : "assistant",
        });
      } else {
        this.updateLiveAssistant({
          mode: "build",
          transport: "binary",
          buildId: build.id,
          phase: build.phase || "planning",
          status: "streaming",
          progress: build.progress ?? liveProgressForPhase(build.phase || "planning"),
          latestActivity: this.phaseProgressLabel(build.phase),
          latestLog,
          latestFile,
        });
      }
    }
    void this.persistActiveBinaryBuildId(build?.id || null);
  }

  private async handleBinaryBuildEvent(event: BinaryBuildEvent): Promise<void> {
    if (!this.rememberBinaryEvent(event.buildId, event.id)) {
      return;
    }
    this.state.binary.streamConnected = true;
    this.state.binary.lastEventId = event.id;
    this.binaryStreamBuildId = event.buildId;
    await this.persistBinaryCursor(event.buildId, event.id);

    const current = this.state.binary.activeBuild?.id === event.buildId ? this.state.binary.activeBuild : null;
    switch (event.type) {
      case "build.created":
        this.applyChatLiveEvent({
          type: "build_attached",
          buildId: event.data.build.id,
          phase: event.data.build.phase || "planning",
          progress: event.data.build.progress,
        });
        this.setActiveBinaryBuild(event.data.build);
        break;
      case "phase.changed": {
        const nextBuild = current
          ? {
              ...current,
              status: event.data.status,
              phase: event.data.phase,
              progress: event.data.progress,
              logs: event.data.message ? [...current.logs, event.data.message].slice(-500) : current.logs,
            }
          : null;
        if (nextBuild) this.setActiveBinaryBuild(nextBuild);
        if (event.data.message) this.pushActivity(event.data.message);
        else this.pushActivity(this.phaseProgressLabel(event.data.phase));
        this.applyChatLiveEvent({
          type: "build_event",
          eventType: event.type,
          phase: event.data.phase,
          progress: event.data.progress,
          latestLog: event.data.message,
        });
        break;
      }
      case "plan.updated":
        if (current) {
          this.setActiveBinaryBuild({
            ...current,
            preview: {
              ...(current.preview || { files: [], recentLogs: [] }),
              plan: event.data.plan,
            },
          });
        }
        break;
      case "generation.delta":
        this.applyChatLiveEvent({
          type: "build_event",
          eventType: event.type,
          phase: current?.phase || "materializing",
          progress: current?.progress,
          latestFile: event.data.delta.path,
        });
        if (current) {
          const previewFile = {
            path: event.data.delta.path,
            language: event.data.delta.language,
            preview: String(event.data.delta.content || "").slice(-1_200),
            hash: `delta_${event.data.delta.order}`,
            completed: event.data.delta.completed,
            updatedAt: event.timestamp,
          };
          const files = [previewFile, ...(current.preview?.files || []).filter((item) => item.path !== previewFile.path)].slice(0, 24);
          this.setActiveBinaryBuild({
            ...current,
            preview: {
              plan: current.preview?.plan || null,
              files,
              recentLogs: current.preview?.recentLogs || [],
            },
          });
        }
        break;
      case "file.updated":
        this.applyChatLiveEvent({
          type: "build_event",
          eventType: event.type,
          phase: current?.phase || "materializing",
          progress: current?.progress,
          latestFile: event.data.path,
        });
        if (current) {
          const files = [event.data, ...(current.preview?.files || []).filter((item) => item.path !== event.data.path)].slice(0, 24);
          this.setActiveBinaryBuild({
            ...current,
            preview: {
              plan: current.preview?.plan || null,
              files,
              recentLogs: current.preview?.recentLogs || [],
            },
          });
        }
        break;
      case "log.chunk":
        this.applyChatLiveEvent({
          type: "build_event",
          eventType: event.type,
          phase: current?.phase || "installing",
          progress: current?.progress,
          latestLog: String(event.data.chunk || "").trim(),
        });
        if (current) {
          const chunk = String(event.data.chunk || "").trim();
          this.setActiveBinaryBuild({
            ...current,
            logs: [...current.logs, chunk].slice(-500),
            preview: {
              plan: current.preview?.plan || null,
              files: current.preview?.files || [],
              recentLogs: [...(current.preview?.recentLogs || []), chunk].slice(-80),
            },
          });
        }
        break;
      case "reliability.delta":
        this.applyChatLiveEvent({
          type: "build_event",
          eventType: event.type,
          phase: current?.phase || "validating",
          progress: current?.progress,
        });
        if (current) {
          this.setActiveBinaryBuild({
            ...current,
            reliability: event.data.report,
          });
        }
        break;
      case "reliability.stream":
        this.applyChatLiveEvent({
          type: "build_event",
          eventType: event.type,
          phase: current?.phase || "validating",
          progress: current?.progress,
        });
        this.updateBinaryLiveReliability(event.data.reliability);
        break;
      case "graph.updated":
        this.applyChatLiveEvent({
          type: "build_event",
          eventType: event.type,
          phase: current?.phase || "materializing",
          progress: current?.progress,
          latestFile: event.data.sourceGraph.modules[0]?.path,
        });
        if (current) {
          this.setActiveBinaryBuild({
            ...current,
            sourceGraph: event.data.sourceGraph,
          });
        }
        break;
      case "token.delta":
        this.applyChatLiveEvent({
          type: "build_event",
          eventType: event.type,
          phase: current?.phase || "materializing",
          progress: current?.progress,
          latestLog: String(event.data.text || "").slice(-120),
        });
        if (current && event.data.text.trim()) {
          this.setActiveBinaryBuild({
            ...current,
            logs: [...current.logs, event.data.text].slice(-500),
          });
        }
        break;
      case "ast.delta":
        this.applyChatLiveEvent({
          type: "build_event",
          eventType: event.type,
          phase: current?.phase || "materializing",
          progress: current?.progress,
          latestFile: event.data.delta.modulesTouched[0],
        });
        this.updateBinaryAstState({
          coverage: event.data.delta.coverage,
          moduleCount: current?.astState?.moduleCount || event.data.delta.modulesTouched.length || 0,
          modules: current?.astState?.modules || [],
          nodes: event.data.delta.nodes,
          updatedAt: event.data.delta.updatedAt,
          source: event.data.delta.source,
        });
        break;
      case "ast.state":
        this.applyChatLiveEvent({
          type: "build_event",
          eventType: event.type,
          phase: current?.phase || "materializing",
          progress: current?.progress,
        });
        this.updateBinaryAstState(event.data.astState);
        break;
      case "execution.updated":
        this.applyChatLiveEvent({
          type: "build_event",
          eventType: event.type,
          phase: current?.phase || "validating",
          progress: current?.progress,
          latestLog: event.data.execution.lastRun?.logs?.slice(-1)[0],
        });
        if (current) {
          const recentLogs = event.data.execution.lastRun?.logs?.length
            ? [...(current.preview?.recentLogs || []), ...event.data.execution.lastRun.logs].slice(-80)
            : current.preview?.recentLogs || [];
          this.setActiveBinaryBuild({
            ...current,
            execution: event.data.execution,
            preview: {
              plan: current.preview?.plan || null,
              files: current.preview?.files || [],
              recentLogs,
            },
          });
        }
        break;
      case "runtime.state":
        this.applyChatLiveEvent({
          type: "build_event",
          eventType: event.type,
          phase: current?.phase || "validating",
          progress: current?.progress,
          latestLog: event.data.runtime.lastRun?.logs?.slice(-1)[0],
        });
        this.updateBinaryRuntimeState(event.data.runtime);
        break;
      case "patch.applied":
        this.applyChatLiveEvent({
          type: "build_event",
          eventType: event.type,
          phase: current?.phase || "materializing",
          progress: current?.progress,
          latestLog: `Patch applied: ${event.data.patch.modulePath}`,
        });
        this.updateBinaryRuntimeState({
          ...event.data.runtime,
          patches: [event.data.patch, ...(event.data.runtime.patches || []).filter((item) => item.id !== event.data.patch.id)],
        });
        break;
      case "artifact.delta":
        this.applyChatLiveEvent({
          type: "build_event",
          eventType: event.type,
          phase: current?.phase || "materializing",
          progress: current?.progress,
          latestFile: event.data.artifactState.latestFile,
        });
        if (current) {
          this.setActiveBinaryBuild({
            ...current,
            artifactState: event.data.artifactState,
          });
        }
        break;
      case "checkpoint.saved":
        this.applyChatLiveEvent({
          type: "build_event",
          eventType: event.type,
          phase: event.data.checkpoint.phase,
          progress: current?.progress,
          latestFile: event.data.checkpoint.preview?.files?.[0]?.path,
          latestLog: event.data.checkpoint.preview?.recentLogs?.slice(-1)[0],
        });
        if (current) {
          const summary = {
            id: event.data.checkpoint.id,
            phase: event.data.checkpoint.phase,
            savedAt: event.data.checkpoint.savedAt,
            ...(event.data.checkpoint.label ? { label: event.data.checkpoint.label } : {}),
          };
          const checkpoints = [summary, ...(current.checkpoints || []).filter((item) => item.id !== summary.id)].slice(0, 40);
          this.setActiveBinaryBuild({
            ...current,
            preview: event.data.checkpoint.preview || current.preview || null,
            manifest: event.data.checkpoint.manifest || current.manifest || null,
            reliability: event.data.checkpoint.reliability || current.reliability || null,
            liveReliability: event.data.checkpoint.liveReliability || current.liveReliability || null,
            artifactState: event.data.checkpoint.artifactState || current.artifactState || null,
            sourceGraph: event.data.checkpoint.sourceGraph || current.sourceGraph || null,
            astState: event.data.checkpoint.astState || current.astState || null,
            execution: event.data.checkpoint.execution || current.execution || null,
            runtimeState: event.data.checkpoint.runtimeState || current.runtimeState || null,
            checkpointId: event.data.checkpoint.id,
            checkpoints,
            snapshots: event.data.checkpoint.snapshot
              ? this.updateBinarySnapshots(event.data.checkpoint.snapshot)
              : current.snapshots || [],
            artifact: event.data.checkpoint.artifact || current.artifact || null,
          });
        }
        break;
      case "snapshot.saved":
        this.applyChatLiveEvent({
          type: "build_event",
          eventType: event.type,
          phase: current?.phase || "materializing",
          progress: current?.progress,
        });
        if (current) {
          this.setActiveBinaryBuild({
            ...current,
            snapshots: this.updateBinarySnapshots(event.data.snapshot),
          });
        } else {
          this.state.binary.snapshots = this.updateBinarySnapshots(event.data.snapshot);
        }
        break;
      case "interrupt.accepted":
        this.applyChatLiveEvent({
          type: "build_event",
          eventType: event.type,
          phase: current?.phase || "planning",
          progress: current?.progress,
          latestLog: event.data.message,
        });
        if (event.data.message) this.pushActivity(event.data.message);
        if (current) {
          this.setActiveBinaryBuild({
            ...current,
            pendingRefinement: event.data.pendingRefinement || null,
            cancelable: event.data.action === "cancel" ? false : current.cancelable,
          });
        }
        break;
      case "artifact.ready":
        this.applyChatLiveEvent({
          type: "build_event",
          eventType: event.type,
          phase: "packaging",
          progress: 96,
        });
        if (current) {
          this.setActiveBinaryBuild({
            ...current,
            artifact: event.data.artifact,
            manifest: event.data.manifest,
          });
        }
        break;
      case "branch.created":
        this.pushActivity(`Created branch build ${event.data.build.id}.`);
        this.setActiveBinaryBuild(event.data.build);
        break;
      case "build.completed":
      case "build.failed":
      case "build.canceled":
        this.setActiveBinaryBuild(event.data.build);
        break;
      case "rewind.completed":
        this.pushActivity(`Rewound build to checkpoint ${event.data.checkpointId}.`);
        this.setActiveBinaryBuild(event.data.build);
        break;
      case "heartbeat":
        this.applyChatLiveEvent({
          type: "build_event",
          eventType: event.type,
          phase: event.data.phase || current?.phase || "planning",
          progress: event.data.progress ?? current?.progress,
        });
        if (current) {
          this.setActiveBinaryBuild({
            ...current,
            phase: event.data.phase || current.phase,
            progress: event.data.progress ?? current.progress,
          });
        }
        break;
      default:
        break;
    }

    this.postState();
  }

  private async followBinaryBuildStream(input: {
    auth: RequestAuth;
    buildId?: string;
    create?: Omit<Parameters<typeof requestBinaryBuildStream>[0], "signal" | "onEvent">;
  }): Promise<BinaryBuildRecord | null> {
    this.stopBinaryStream();
    const abort = new AbortController();
    this.binaryStreamAbort = abort;
    this.state.binary.streamConnected = false;
    this.postState();

    try {
      if (input.create) {
        await requestBinaryBuildStream({
          ...input.create,
          signal: abort.signal,
          onEvent: (event) => this.handleBinaryBuildEvent(event),
        });
      } else if (input.buildId) {
        await requestBinaryStreamEvents({
          auth: input.auth,
          buildId: input.buildId,
          cursor: this.getPersistedBinaryCursor(input.buildId),
          signal: abort.signal,
          onEvent: (event) => this.handleBinaryBuildEvent(event),
        });
      }
      return this.state.binary.activeBuild;
    } finally {
      if (this.binaryStreamAbort === abort) {
        this.binaryStreamAbort = null;
        this.binaryStreamBuildId = null;
        this.state.binary.streamConnected = false;
        this.postState();
      }
    }
  }

  private async resumeBinaryBuildIfNeeded(): Promise<void> {
    if (!isHostedOpenHandsRuntime(this.state.runtime)) return;
    const buildId = this.context.workspaceState.get<string>(BINARY_ACTIVE_BUILD_KEY);
    if (!buildId) return;
    if (this.binaryStreamBuildId === buildId && this.binaryStreamAbort) return;

    const auth = await this.auth.getRequestAuth();
    if (!auth) return;

    try {
      const build = await requestBinaryStatus(auth, buildId);
      this.setActiveBinaryBuild(build);
      if (isBinaryBuildPending(build)) {
        void this.followBinaryBuildStream({
          auth,
          buildId,
        }).catch(() => undefined);
      }
    } catch {
      // Ignore stale persisted build ids.
    }
  }

  private async setBinaryTargetRuntime(runtime: string): Promise<void> {
    const nextRuntime = runtime === "node20" ? "node20" : "node18";
    this.state.binary.targetEnvironment = {
      ...this.state.binary.targetEnvironment,
      runtime: nextRuntime,
    };
    this.postState();
  }

  private async attachActiveFile(): Promise<void> {
    const activePath = this.getActiveEditorPath();
    if (!activePath) {
      vscode.window.showInformationMessage("Open a workspace file before attaching context.");
      return;
    }

    this.manualContext.attachedFiles = Array.from(
      new Set([activePath, ...this.manualContext.attachedFiles].map((value) => String(value || "").trim()))
    ).slice(0, 4);
    await this.refreshDraftContext(this.draftText);
  }

  private async attachSelection(): Promise<void> {
    const editor = vscode.window.activeTextEditor;
    const activePath = this.getActiveEditorPath();
    if (!editor || !activePath) {
      vscode.window.showInformationMessage("Open a workspace file before attaching a selection.");
      return;
    }

    const rawSelection = editor.selection.isEmpty
      ? editor.document.lineAt(editor.selection.active.line).text
      : editor.document.getText(editor.selection);
    const trimmed = rawSelection.trim();
    if (!trimmed) {
      vscode.window.showInformationMessage("Select code or place the cursor on a useful line first.");
      return;
    }

    this.manualContext.attachedSelection = {
      path: activePath,
      content: trimmed,
      summary: trimmed.replace(/\s+/g, " ").slice(0, 90),
    };
    this.manualContext.attachedFiles = Array.from(
      new Set([activePath, ...this.manualContext.attachedFiles].map((value) => String(value || "").trim()))
    ).slice(0, 4);
    await this.refreshDraftContext(this.draftText);
  }

  private async clearAttachedContext(): Promise<void> {
    this.manualContext = {
      attachedFiles: [],
      attachedSelection: null,
    };
    await this.refreshDraftContext(this.draftText);
  }

  private async generateBinaryBuild(rawIntent: string): Promise<void> {
    const intent = rawIntent.trim();
    if (!intent) {
      this.appendMessage("system", "Add an intent in the composer before generating a portable starter bundle.");
      this.postState();
      return;
    }
    if (this.state.binary.busy || isBinaryBuildPending(this.state.binary.activeBuild)) {
      this.appendMessage(
        "system",
        "Wait for the current portable starter bundle build to finish before starting another one."
      );
      this.postState();
      return;
    }

    const auth = await this.auth.getRequestAuth();
    if (!auth) {
      this.appendMessage("system", "Authenticate with an Xpersona API key or browser sign-in before generating a portable starter bundle.");
      this.postState();
      return;
    }

    this.state.binary.busy = true;
    this.state.binary.lastAction = "generate";
    this.pushActivity("Creating portable starter bundle");
    this.applyChatLiveEvent({
      type: "accepted",
      transport: "binary",
      mode: "build",
      phase: "accepted",
    });
    this.applyChatLiveEvent({
      type: "activity",
      activity: "Creating portable starter bundle",
      phase: "planning",
    });
    this.postState();

    try {
      const { context, retrievalHints } = await this.contextCollector.collect(intent, {
        recentTouchedPaths: this.actionRunner.getRecentTouchedPaths(),
        attachedFiles: this.manualContext.attachedFiles,
        attachedSelection: this.manualContext.attachedSelection,
        searchDepth: "fast",
        intent: classifyIntent(intent),
      });

      const createInput = {
        auth,
        intent,
        workspaceFingerprint: getWorkspaceHash(),
        historySessionId:
          this.sessionId && !isPendingQwenSessionId(this.sessionId) ? this.sessionId : undefined,
        targetEnvironment: this.state.binary.targetEnvironment,
        context: {
          activeFile: context.activeFile,
          openFiles: context.openFiles,
        },
        retrievalHints,
      };

      this.stopBinaryStream();
      this.clearBinaryEventTracking();
      this.setActiveBinaryBuild(null);
      this.state.binary.phase = "queued";
      this.state.binary.progress = 0;
      this.state.binary.streamConnected = false;
      this.state.binary.lastEventId = null;
      this.state.binary.previewFiles = [];
      this.state.binary.recentLogs = [];
      this.state.binary.reliability = null;
      this.state.binary.liveReliability = null;
      this.state.binary.artifactState = null;
      this.state.binary.sourceGraph = null;
      this.state.binary.astState = null;
      this.state.binary.execution = null;
      this.state.binary.runtimeState = null;
      this.state.binary.checkpoints = [];
      this.state.binary.snapshots = [];
      this.state.binary.pendingRefinement = null;
      this.state.binary.canCancel = false;
      this.postState();

      let finalBuild: BinaryBuildRecord | null = null;
      try {
        finalBuild = await this.followBinaryBuildStream({
          auth,
          create: createInput,
        });
      } catch (error) {
        this.pushActivity("Streaming unavailable, falling back to polling.");
        this.applyChatLiveEvent({
          type: "activity",
          activity: "Streaming unavailable, falling back to polling.",
          phase: "planning",
        });
        const streamedBuild = this.state.binary.activeBuild;
        if (streamedBuild?.id) {
          finalBuild = isBinaryBuildPending(streamedBuild)
            ? await this.waitForBinaryBuildCompletion(auth, streamedBuild)
            : streamedBuild;
        } else {
          const build = await requestBinaryBuild(createInput);
          this.setActiveBinaryBuild(build);
          finalBuild = isBinaryBuildPending(build)
            ? await this.waitForBinaryBuildCompletion(auth, build)
            : build;
        }
        if (!finalBuild) throw error;
      }

      if (finalBuild) {
        this.setActiveBinaryBuild(finalBuild);
      }
      const resolvedBuild = finalBuild || this.state.binary.activeBuild;
      if (!resolvedBuild) {
        throw new Error("Binary build finished without a build record.");
      }
      await this.persistBinaryCursor(resolvedBuild.id, this.state.binary.lastEventId || null);
      this.setActiveBinaryBuild(resolvedBuild);
      await this.refreshHistory();
    } catch (error) {
      this.applyChatLiveEvent({
        type: "failed",
        text: `Binary generation failed: ${error instanceof Error ? error.message : String(error)}`,
        phase: "failed",
      });
    } finally {
      this.state.binary.busy = false;
      this.postState();
    }
  }

  private async cancelBinaryBuild(): Promise<void> {
    const build = this.state.binary.activeBuild;
    if (!build || !isBinaryBuildPending(build)) {
      this.appendMessage("system", "There is no active portable starter bundle build to cancel.");
      this.postState();
      return;
    }

    const auth = await this.auth.getRequestAuth();
    if (!auth) {
      this.appendMessage("system", "Authenticate before canceling the current portable starter bundle.");
      this.postState();
      return;
    }

    const previousCanCancel = this.state.binary.canCancel;
    this.state.binary.canCancel = false;
    this.postState();

    try {
      const updated = await requestBinaryCancel({
        auth,
        buildId: build.id,
      });
      this.setActiveBinaryBuild(updated);
      this.pushActivity("Cancellation requested");
      this.applyChatLiveEvent({
        type: "activity",
        activity: "Cancellation requested",
        phase: "canceled",
      });
    } catch (error) {
      this.state.binary.canCancel = previousCanCancel;
      this.appendMessage(
        "system",
        `Binary cancel failed: ${error instanceof Error ? error.message : String(error)}`
      );
    } finally {
      this.postState();
    }
  }

  private async refineBinaryBuild(rawIntent: string): Promise<void> {
    const build = this.state.binary.activeBuild;
    if (!build || !isBinaryBuildPending(build)) {
      this.appendMessage("system", "Start a live Binary IDE build before queuing a refinement.");
      this.postState();
      return;
    }

    const intent = rawIntent.trim();
    if (!intent) {
      this.appendMessage("system", "Add refinement instructions in the composer before sending them to the active build.");
      this.postState();
      return;
    }

    const auth = await this.auth.getRequestAuth();
    if (!auth) {
      this.appendMessage("system", "Authenticate before refining the active Binary IDE build.");
      this.postState();
      return;
    }

    this.state.binary.lastAction = "refine";
    this.pushActivity("Queueing refinement for the active binary build");
    this.postState();

    try {
      const updated = await requestBinaryRefine({
        auth,
        buildId: build.id,
        intent,
      });
      this.setActiveBinaryBuild(updated);
      this.appendMessage("system", `Queued refinement for build ${updated.id}.`);
      if (!this.binaryStreamAbort && isBinaryBuildPending(updated)) {
        void this.followBinaryBuildStream({
          auth,
          buildId: updated.id,
        }).catch(() => undefined);
      }
    } catch (error) {
      this.appendMessage(
        "system",
        `Binary refine failed: ${error instanceof Error ? error.message : String(error)}`
      );
    } finally {
      this.postState();
    }
  }

  private async branchBinaryBuild(rawIntent: string, rawCheckpointId = ""): Promise<void> {
    const build = this.state.binary.activeBuild;
    if (!build) {
      this.appendMessage("system", "Generate a Binary IDE build before creating a branch.");
      this.postState();
      return;
    }

    const checkpointId =
      String(rawCheckpointId || "").trim() ||
      String(build.checkpointId || "").trim() ||
      String(build.checkpoints?.[0]?.id || "").trim();
    if (!checkpointId) {
      this.appendMessage("system", "Create at least one checkpoint before branching this build.");
      this.postState();
      return;
    }

    const auth = await this.auth.getRequestAuth();
    if (!auth) {
      this.appendMessage("system", "Authenticate before branching the current Binary IDE build.");
      this.postState();
      return;
    }

    this.state.binary.busy = true;
    this.state.binary.lastAction = "branch";
    this.pushActivity("Creating a branch from the current checkpoint");
    this.postState();

    try {
      const updated = await requestBinaryBranch({
        auth,
        buildId: build.id,
        checkpointId,
        intent: String(rawIntent || "").trim() || undefined,
      });
      this.stopBinaryStream();
      this.clearBinaryEventTracking();
      this.setActiveBinaryBuild(updated);
      this.appendMessage("assistant", `Created branch build ${updated.id} from checkpoint ${checkpointId}.`);
      await this.refreshHistory();
      if (isBinaryBuildPending(updated)) {
        void this.followBinaryBuildStream({
          auth,
          buildId: updated.id,
        }).catch(() => undefined);
      }
    } catch (error) {
      this.appendMessage(
        "system",
        `Binary branch failed: ${error instanceof Error ? error.message : String(error)}`
      );
    } finally {
      this.state.binary.busy = false;
      this.postState();
    }
  }

  private async rewindBinaryBuild(rawCheckpointId = ""): Promise<void> {
    const build = this.state.binary.activeBuild;
    if (!build) {
      this.appendMessage("system", "Generate a Binary IDE build before rewinding it.");
      this.postState();
      return;
    }
    if (isBinaryBuildPending(build)) {
      this.appendMessage("system", "Wait for the current Binary IDE build to stop streaming before rewinding it.");
      this.postState();
      return;
    }

    const checkpointId =
      String(rawCheckpointId || "").trim() ||
      String(build.checkpointId || "").trim() ||
      String(build.checkpoints?.[0]?.id || "").trim();
    if (!checkpointId) {
      this.appendMessage("system", "No checkpoint is available to rewind this build.");
      this.postState();
      return;
    }

    const auth = await this.auth.getRequestAuth();
    if (!auth) {
      this.appendMessage("system", "Authenticate before rewinding the current Binary IDE build.");
      this.postState();
      return;
    }

    this.state.binary.busy = true;
    this.state.binary.lastAction = "rewind";
    this.pushActivity("Rewinding Binary IDE build");
    this.postState();

    try {
      const updated = await requestBinaryRewind({
        auth,
        buildId: build.id,
        checkpointId,
      });
      this.setActiveBinaryBuild(updated);
      this.appendMessage("system", `Rewound build ${updated.id} to checkpoint ${checkpointId}.`);
      await this.refreshHistory();
    } catch (error) {
      this.appendMessage(
        "system",
        `Binary rewind failed: ${error instanceof Error ? error.message : String(error)}`
      );
    } finally {
      this.state.binary.busy = false;
      this.postState();
    }
  }

  private async executeBinaryBuild(entryPoint: string): Promise<void> {
    const build = this.state.binary.activeBuild;
    if (!build) {
      this.appendMessage("system", "Generate a Binary IDE build before running partial execution.");
      this.postState();
      return;
    }

    const normalizedEntryPoint = entryPoint.trim();
    if (!normalizedEntryPoint) {
      this.appendMessage("system", "Choose a callable entry point before running the partial runtime.");
      this.postState();
      return;
    }

    const auth = await this.auth.getRequestAuth();
    if (!auth) {
      this.appendMessage("system", "Authenticate before running the Binary IDE partial runtime.");
      this.postState();
      return;
    }

    this.state.binary.busy = true;
    this.state.binary.lastAction = "execute";
    this.pushActivity(`Running ${normalizedEntryPoint} in the partial runtime`);
    this.postState();

    try {
      const updated = await requestBinaryExecute({
        auth,
        buildId: build.id,
        entryPoint: normalizedEntryPoint,
      });
      this.setActiveBinaryBuild(updated);
      const lastRun = updated.execution?.lastRun;
      this.appendMessage(
        lastRun?.status === "failed" ? "system" : "assistant",
        lastRun
          ? `Executed ${lastRun.entryPoint} -> ${lastRun.status.toUpperCase()}${lastRun.errorMessage ? `\n${lastRun.errorMessage}` : ""}`
          : `Executed ${normalizedEntryPoint}.`
      );
    } catch (error) {
      this.appendMessage(
        "system",
        `Binary execute failed: ${error instanceof Error ? error.message : String(error)}`
      );
    } finally {
      this.state.binary.busy = false;
      this.postState();
    }
  }

  private async validateBinaryBuild(): Promise<void> {
    const build = this.state.binary.activeBuild;
    if (!build) {
      this.appendMessage("system", "Generate a portable starter bundle before running Binary IDE validation.");
      this.postState();
      return;
    }
    if (isBinaryBuildPending(build)) {
      this.appendMessage("system", "Wait for the current portable starter bundle build to finish before validating it.");
      this.postState();
      return;
    }
    if (build.status !== "completed") {
      this.appendMessage("system", "Only completed portable starter bundles can be validated.");
      this.postState();
      return;
    }

    const auth = await this.auth.getRequestAuth();
    if (!auth) {
      this.appendMessage("system", "Authenticate before validating the current portable starter bundle.");
      this.postState();
      return;
    }

    this.state.binary.busy = true;
    this.state.binary.lastAction = "validate";
    this.pushActivity("Validating portable starter bundle");
    this.postState();

    try {
      const updated = await requestBinaryValidate({
        auth,
        buildId: build.id,
        targetEnvironment: this.state.binary.targetEnvironment,
      });
      this.setActiveBinaryBuild(updated);
      this.appendMessage("system", formatBinaryBuildMessage(updated));
      await this.refreshHistory();
    } catch (error) {
      this.appendMessage(
        "system",
        `Binary validation failed: ${error instanceof Error ? error.message : String(error)}`
      );
    } finally {
      this.state.binary.busy = false;
      this.postState();
    }
  }

  private async publishBinaryBuild(): Promise<void> {
    const build = this.state.binary.activeBuild;
    if (!build) {
      this.appendMessage("system", "Generate a portable starter bundle before publishing it.");
      this.postState();
      return;
    }
    if (isBinaryBuildPending(build)) {
      this.appendMessage("system", "Wait for the current portable starter bundle build to finish before publishing it.");
      this.postState();
      return;
    }
    if (build.status !== "completed") {
      this.appendMessage("system", "Only completed portable starter bundles can be published.");
      this.postState();
      return;
    }

    const auth = await this.auth.getRequestAuth();
    if (!auth) {
      this.appendMessage("system", "Authenticate before publishing the current portable starter bundle.");
      this.postState();
      return;
    }

    this.state.binary.busy = true;
    this.state.binary.lastAction = "deploy";
    this.pushActivity("Publishing portable starter bundle");
    this.postState();

    try {
      const updated = await requestBinaryPublish({
        auth,
        buildId: build.id,
      });
      this.setActiveBinaryBuild(updated);
      this.appendMessage("assistant", formatBinaryBuildMessage(updated));
      await this.refreshHistory();
    } catch (error) {
      this.appendMessage(
        "system",
        `Binary publish failed: ${error instanceof Error ? error.message : String(error)}`
      );
    } finally {
      this.state.binary.busy = false;
      this.postState();
    }
  }

  private getRecoveryFollowUpActions(taskText: string): FollowUpAction[] {
    const normalizedTask = String(taskText || "").trim();
    const includeContextRetry =
      this.lastPrompt?.intent === "change" || this.lastPrompt?.intent === "find";
    const actions: FollowUpAction[] = [
      {
        id: "retry-last",
        label: "Retry",
        kind: "rerun",
        detail: normalizedTask ? "Run this request again" : "Try again",
        emphasized: true,
      },
      ...(includeContextRetry
        ? [
            {
              id: "retry-more-context",
              label: "Retry with context",
              kind: "rerun" as const,
              detail: "Attach active file and selection",
            },
          ]
        : []),
      {
        id: "prompt:status",
        label: "Check runtime",
        kind: "prompt",
        prompt: "/status",
        detail: "Show runtime health",
      },
    ];
    return actions.slice(0, 3);
  }

  private setRecoveryFollowUpActions(taskText: string): void {
    this.state.followUpActions = this.getRecoveryFollowUpActions(taskText);
  }

  private async handleFollowUpAction(id: string): Promise<void> {
    const action = this.state.followUpActions.find((item) => item.id === id);
    if (!action || action.disabled) return;

    if (action.kind === "info") return;

    if (action.kind === "prompt" && action.prompt) {
      await this.sendPrompt(action.prompt);
      return;
    }

    if (action.kind === "target" && action.targetPath && this.pendingClarification) {
      this.manualContext.attachedFiles = Array.from(
        new Set([action.targetPath, ...this.manualContext.attachedFiles].map((value) => String(value || "").trim()))
      ).slice(0, 4);
      await this.sendPromptWithPlaygroundApi(this.pendingClarification.text, "", undefined, false);
      return;
    }

    if (action.kind === "rerun") {
      const base = this.pendingClarification || this.lastPrompt;
      if (!base) return;

      if (id === "retry-more-context") {
        if (!this.manualContext.attachedFiles.length) {
          const activePath = this.getActiveEditorPath();
          if (activePath) {
            this.manualContext.attachedFiles = [activePath];
          }
        }
        if (!this.manualContext.attachedSelection) {
          const editor = vscode.window.activeTextEditor;
          const activePath = this.getActiveEditorPath();
          if (editor && activePath) {
            const rawSelection = editor.selection.isEmpty
              ? editor.document.lineAt(editor.selection.active.line).text
              : editor.document.getText(editor.selection);
            const trimmed = rawSelection.trim();
            if (trimmed) {
              this.manualContext.attachedSelection = {
                path: activePath,
                content: trimmed,
                summary: trimmed.replace(/\s+/g, " ").slice(0, 90),
              };
            }
          }
        }
      }

      await this.sendPromptWithPlaygroundApi(base.text, "", undefined, false);
    }
  }

  private async sendPrompt(rawText: string, clientMessageId = ""): Promise<void> {
    const text = rawText.trim();
    if (!text || this.state.busy) return;
    this.clearDraftPreviewTimer();

    const inlinePlanMatch = /^\/plan(?:\s+([\s\S]+))?$/i.exec(text);
    if (inlinePlanMatch) {
      const planTask = String(inlinePlanMatch[1] || "").trim();
      if (planTask) {
        await this.setMode("plan");
        await this.clearCurrentDraft();
        await this.sendPromptWithPlaygroundApi(planTask, clientMessageId, undefined, true);
        return;
      }
    }

    if (await this.handleSlashCommand(text, clientMessageId)) {
      await this.clearCurrentDraft();
      return;
    }

    const continuationBase = this.pendingClarification || this.lastPrompt;
    const shouldContinuePreviousTask = Boolean(
      continuationBase && isLikelyClarificationContinuation(text)
    );
    const promptText = shouldContinuePreviousTask && continuationBase
      ? buildContinuationPrompt(continuationBase.text, text)
      : text;
    const searchDepth = shouldContinuePreviousTask && continuationBase
      ? continuationBase.searchDepth
      : "fast";
    if (shouldContinuePreviousTask) {
      this.pendingClarification = null;
    }
    this.lastPrompt = {
      text: promptText,
      intent: classifyIntent(promptText),
      searchDepth,
    };

    await this.clearCurrentDraft();
    await this.sendPromptWithPlaygroundApi(text, clientMessageId, promptText, true);
  }

  getBinaryToolContext(): { activeBuild: BinaryBuildRecord | null; targetEnvironment: BinaryTargetEnvironment } {
    return {
      activeBuild: this.state.binary.activeBuild,
      targetEnvironment: this.state.binary.targetEnvironment,
    };
  }

  private async handleBinaryToolResult(input: {
    toolResult: ToolResult;
    auth: RequestAuth;
  }): Promise<void> {
    if (!input.toolResult.ok || !isBinaryLifecycleToolName(input.toolResult.name)) {
      return;
    }

    const data = input.toolResult.data;
    const build =
      data && typeof data === "object" && data.build && typeof data.build === "object"
        ? (data.build as BinaryBuildRecord)
        : null;
    if (!build?.id) return;

    const switchingBuild = this.state.binary.activeBuild?.id && this.state.binary.activeBuild.id !== build.id;
    if (switchingBuild) {
      this.stopBinaryStream();
      this.clearBinaryEventTracking();
    }

    this.setActiveBinaryBuild(build);

    if (input.toolResult.name === "binary_start_build" || input.toolResult.name === "binary_branch_build") {
      this.applyChatLiveEvent({
        type: "build_attached",
        buildId: build.id,
        phase: build.phase || "queued",
        progress: typeof build.progress === "number" ? build.progress : undefined,
      });
    } else {
      this.applyChatLiveEvent({
        type: "build_event",
        eventType:
          build.status === "completed"
            ? "build.completed"
            : build.status === "failed"
              ? "build.failed"
              : build.status === "canceled"
                ? "build.canceled"
                : "phase.changed",
        phase: build.phase || this.state.liveChat?.phase,
        progress: typeof build.progress === "number" ? build.progress : this.state.liveChat?.progress,
        latestLog: Array.isArray(build.logs) && build.logs.length > 0 ? build.logs[build.logs.length - 1] : undefined,
        latestFile: build.artifactState?.latestFile,
      });
    }

    if (isBinaryBuildPending(build) && (!this.binaryStreamAbort || this.binaryStreamBuildId !== build.id)) {
      void this.followBinaryBuildStream({
        auth: input.auth,
        buildId: build.id,
      }).catch(() => undefined);
      return;
    }

    this.postState();
  }

  private buildClarificationMessage(preview: Awaited<ReturnType<ContextCollector["preview"]>>): string {
    if (preview.candidateFiles.length) {
      return [
        `Context preview: ${preview.intent.toUpperCase()} | LOW confidence`,
        "I found a few possible target files and I do not want to guess before editing.",
        `Pick one of these files: ${preview.candidateFiles.slice(0, 4).join(", ")}`,
      ].join("\n");
    }

    return [
      `Context preview: ${preview.intent.toUpperCase()} | LOW confidence`,
      "I need a clearer target before editing.",
      "Attach the active file, attach a selection, or ask me to search deeper.",
    ].join("\n");
  }

  private shouldShowContextPreview(preview: Awaited<ReturnType<ContextCollector["preview"]>>): boolean {
    return Boolean(
      preview.resolvedFiles.length ||
        preview.attachedFiles.length ||
        preview.attachedSelection ||
        preview.intent === "change" ||
        preview.intent === "find" ||
        preview.intent === "explain"
    );
  }

  private shouldRequireEditClarification(
    preview: Awaited<ReturnType<ContextCollector["preview"]>>
  ): boolean {
    if (!isEditLikeIntent(preview.intent) || preview.confidence !== "low") {
      return false;
    }

    return !preview.resolvedFiles.length && !preview.attachedFiles.length && !preview.attachedSelection;
  }

  private shouldRetryQwenWithToolDirective(
    result: QwenPromptResult,
    preview: Awaited<ReturnType<ContextCollector["preview"]>>,
    input: {
      task: string;
      workspaceRoot?: string | null;
      executablePath?: string | null;
      workspaceTargets?: string[];
    }
  ): boolean {
    const isLoopLikeClarification = containsGenericProjectClarification(result.assistantText || "");
    const editOrDiscoveryIntent =
      preview.intent === "change" || preview.intent === "find" || preview.intent === "explain";
    const usedMutationTool = result.usedTools.some((toolName) => isMutationToolName(toolName));
    const hasTrustedTarget =
      Boolean(preview.activeFile || preview.resolvedFiles.length || preview.selectedFiles.length) &&
      preview.confidence !== "low";
    const hasRuntimeNoise =
      !result.didMutate &&
      containsRuntimeNoiseForContext({
        text: result.assistantText || "",
        task: input.task,
        workspaceRoot: input.workspaceRoot,
        executablePath: input.executablePath,
        workspaceTargets: input.workspaceTargets,
      });
    const hasPseudoToolMarkup = containsPseudoToolMarkupText(result.assistantText || "");
    if (hasPseudoToolMarkup && editOrDiscoveryIntent && !result.didMutate) {
      return true;
    }
    if (hasRuntimeNoise && editOrDiscoveryIntent) {
      return true;
    }
    if (isLoopLikeClarification && editOrDiscoveryIntent && !result.didMutate) {
      return true;
    }
    if (usedMutationTool || result.didMutate) return false;
    if (preview.intent === "change" && result.usedTools.length > 0 && hasTrustedTarget) {
      return true;
    }
    if (result.usedTools.length > 0) {
      return false;
    }
    if (preview.intent !== "change" && preview.intent !== "find") return false;
    if (preview.confidence === "low" && !hasTrustedTarget) {
      return false;
    }
    return true;
  }

  private buildQwenStallMessage(input: {
    task: string;
    preview: Awaited<ReturnType<ContextCollector["preview"]>>;
    result: QwenPromptResult;
    retriedWithToolDirective: boolean;
  }): string {
    const targetPath =
      input.preview.activeFile ||
      input.preview.resolvedFiles[0] ||
      input.preview.selectedFiles[0] ||
      "(unknown target)";
    const missingMutation =
      input.preview.intent === "change" && !input.result.didMutate
        ? "The run inspected the target file but never produced a mutation."
        : "The run did not produce a concrete workspace mutation.";
    const toolsUsed = input.result.usedTools.length ? input.result.usedTools.join(", ") : "(none)";
    const denials = input.result.permissionDenials.length ? input.result.permissionDenials.join(" | ") : "(none)";
    return [
      "The local Qwen run stalled before proving the change request was complete.",
      `Task: ${String(input.task || "").trim() || "(unknown)"}`,
      `Target: ${targetPath}`,
      `Mutation proof: ${input.result.didMutate ? "present" : "missing"}`,
      `Tools used: ${toolsUsed}`,
      `Permission denials: ${denials}`,
      input.retriedWithToolDirective ? "The run already retried with stricter tool instructions." : "",
      missingMutation,
      input.preview.intent === "change"
        ? `Next deterministic action: edit ${targetPath} directly or write the full updated file contents.`
        : "Next deterministic action: return one concrete workspace action.",
    ]
      .filter(Boolean)
      .join("\n");
  }

  private async runQwenPrompt(input: {
    text: string;
    promptText?: string;
    appendUser: boolean;
    searchDepth: "fast" | "deep";
    clientMessageId?: string;
  }): Promise<void> {
    const text = input.text.trim();
    const taskText = String(input.promptText || input.text || "").trim() || text;
    if (input.appendUser) {
      this.appendMessage("user", text, undefined, input.clientMessageId);
    }

    const assistantMessageId = this.createLiveAssistantMessage({
      transport: "qwen",
      mode: "shell",
      phase: "accepted",
      latestActivity: "Prompt received",
    });

    this.state.followUpActions = [];
    this.state.activity = [];
    this.pushActivity("Collecting context");
    this.state.runtimePhase = "collecting_context";
    this.state.busy = true;
    this.applyChatLiveEvent({
      type: "phase",
      phase: "collecting_context",
      status: "pending",
      progress: liveProgressForPhase("collecting_context"),
      latestActivity: "Collecting context",
    });
    this.postState();

    const workspaceRoot = getWorkspaceRootPath();
    const promptAbort = new AbortController();
    this.promptAbort = promptAbort;
    let qwenAuthToken = "";
    let preflightMessage: string | null = null;
    const hadExistingSession = Boolean(this.sessionId);
    let localSessionId = this.sessionId || createPendingQwenSessionId();
    let preview: Awaited<ReturnType<ContextCollector["preview"]>> | null = null;
    const qwenDebugAttempts: QwenDebugAttempt[] = [];
    let retriedWithToolDirective = false;

    try {
      const requestAuth = await this.auth.getRequestAuth();
      qwenAuthToken = String(requestAuth?.bearer || requestAuth?.apiKey || "");
      preflightMessage = await validateQwenPreflight({
        workspaceRoot,
        apiKey: qwenAuthToken,
        qwenBaseUrl: getQwenOpenAiBaseUrl(),
        playgroundBaseUrl: getBaseApiUrl(),
        executablePath: getQwenExecutablePath(),
      });

      if (
        this.sessionId &&
        !isPendingQwenSessionId(this.sessionId) &&
        !(await this.qwenHistoryService.hasSession(this.sessionId))
      ) {
        this.sessionId = null;
        this.state.selectedSessionId = null;
        this.state.activity = [];
      }

      localSessionId = this.sessionId || createPendingQwenSessionId();
      this.sessionId = localSessionId;
      this.state.selectedSessionId = localSessionId;

      const intent = classifyIntent(taskText);
      preview = await this.contextCollector.preview(
        taskText,
        await this.getQwenContextOptions({
          searchDepth: input.searchDepth,
          intent,
          includeWorkspaceHints: hadExistingSession,
        })
      );
      if (promptAbort.signal.aborted) {
        throw new Error("Prompt aborted");
      }
      this.applyPreviewState(preview);
      this.lastPrompt = {
        text: taskText,
        intent: preview.intent,
        searchDepth: input.searchDepth,
      };
    } catch (error) {
      this.applyChatLiveEvent({
        type: "failed",
        text: toSimpleFailureText(`Unable to prepare Qwen Code: ${error instanceof Error ? error.message : String(error)}`),
        phase: "failed",
      });
      this.setRecoveryFollowUpActions(taskText);
      this.pushActivity("Failed");
      this.state.runtimePhase = "failed";
      this.state.busy = false;
      this.postState();
      return;
    }

    if (preflightMessage) {
      this.applyChatLiveEvent({
        type: "failed",
        text: toSimpleFailureText(preflightMessage),
        phase: "failed",
      });
      this.setRecoveryFollowUpActions(taskText);
      this.pushActivity("Failed");
      this.state.runtimePhase = "failed";
      this.state.busy = false;
      await this.qwenHistoryService.saveConversation({
        sessionId: localSessionId,
        mode: this.state.mode,
        title: taskText,
        messages: this.state.messages,
        targets: preview.resolvedFiles,
        intent: preview.intent,
      });
      await this.refreshHistory();
      this.postState();
      return;
    }

    if (this.shouldRequireEditClarification(preview)) {
      this.pendingClarification = {
        text: taskText,
        intent: preview.intent,
        searchDepth: input.searchDepth,
      };
      this.resolveLiveAssistant({
        content: this.buildClarificationMessage(preview),
        status: "done",
        mode: "answer",
        phase: "completed",
      });
      this.state.followUpActions = buildClarificationActions({
        candidateFiles: preview.candidateFiles,
      });
      this.state.runtimePhase = "clarify";
      this.state.busy = false;
      await this.qwenHistoryService.saveConversation({
        sessionId: localSessionId,
        mode: this.state.mode,
        title: taskText,
        messages: this.state.messages,
        targets: preview.resolvedFiles.length ? preview.resolvedFiles : preview.candidateFiles,
        intent: preview.intent,
      });
      await this.refreshHistory();
      this.postState();
      return;
    }

    this.pendingClarification = null;

    try {
      const { context, preview: fullPreview } = await this.contextCollector.collect(
        text,
        await this.getQwenContextOptions({
          searchDepth: input.searchDepth,
          intent: preview.intent,
          includeWorkspaceHints: hadExistingSession,
        })
      );
      if (promptAbort.signal.aborted) {
        throw new Error("Prompt aborted");
      }
      this.applyPreviewState(fullPreview);
      const attachedTargets = (
        fullPreview.selectedFiles.length ? fullPreview.selectedFiles : fullPreview.resolvedFiles
      ).slice(0, 3);
      if (attachedTargets.length) {
        this.pushActivity(`Context attached: ${attachedTargets.join(", ")}`);
        this.applyChatLiveEvent({
          type: "activity",
          activity: `Context attached: ${attachedTargets.join(", ")}`,
          phase: "collecting_context",
        });
      }
      this.pushActivity("Waiting for Qwen");
      this.state.runtimePhase = "waiting_for_qwen";
      this.applyChatLiveEvent({
        type: "phase",
        phase: "connecting_runtime",
        status: "pending",
        progress: liveProgressForPhase("connecting_runtime"),
        latestActivity: "Waiting for Qwen",
      });
      this.postState();
      const workspaceTargets = [
        fullPreview.activeFile || "",
        ...fullPreview.resolvedFiles,
        ...fullPreview.selectedFiles,
      ];
      const executablePath = getQwenExecutablePath() || null;
      const runPromptAttempt = async (
        requireToolUse: boolean,
        historyMessages: ChatMessage[],
        forceActionable: boolean,
        injectedSnippets?: Array<{ path: string; content: string; reason: string }>
      ): Promise<QwenPromptResult> =>
        this.qwenCodeRuntime.runPrompt({
          apiKey: String(qwenAuthToken || ""),
          mode: this.state.mode,
          abortController: promptAbort,
          prompt: buildQwenPrompt({
            task: taskText,
            mode: this.state.mode,
            preview: fullPreview,
            context,
            workspaceRoot,
            searchDepth: input.searchDepth,
            history: historyMessages,
            qwenExecutablePath: executablePath,
            requireToolUse,
            forceActionable,
            injectedSnippets,
          }),
          onPartial: (partial) => {
            const next = sanitizeQwenAssistantOutput({
              text: partial,
              task: taskText,
              workspaceRoot,
              executablePath,
              workspaceTargets,
            }).trim();
            if (!next) return;
            if (
              shouldSuppressQwenPartialOutput({
                text: next,
                task: taskText,
                workspaceRoot,
                executablePath,
                workspaceTargets,
              })
            ) {
              return;
            }
            this.applyChatLiveEvent({
              type: "partial_text",
              text: next,
              phase: "streaming_answer",
            });
            this.postState();
          },
          onActivity: (activity) => {
            this.pushActivity(activity);
            if (/awaiting tool approval/i.test(activity)) {
              this.state.runtimePhase = "awaiting_approval";
              this.applyChatLiveEvent({
                type: "tool_approval",
                activity,
              });
            } else if (/applying result/i.test(activity)) {
              this.state.runtimePhase = "applying_result";
              this.applyChatLiveEvent({
                type: "activity",
                activity,
                phase: "streaming_answer",
              });
            } else {
              this.applyChatLiveEvent({
                type: "activity",
                activity,
                phase: livePhaseFromRuntimePhase(this.state.runtimePhase),
              });
            }
            this.postState();
          },
        });

      let result = await runPromptAttempt(false, this.state.messages, false);
      if (promptAbort.signal.aborted) {
        throw new Error("Prompt aborted");
      }
      qwenDebugAttempts.push({
        requireToolUse: false,
        usedTools: [...result.usedTools],
        didMutate: result.didMutate,
        permissionDenials: [...result.permissionDenials],
        assistantTextPreview: String(result.assistantText || "").slice(0, 240),
        toolEvents: [...(result.toolEvents || [])],
      });
      if (
        this.shouldRetryQwenWithToolDirective(result, fullPreview, {
          task: taskText,
          workspaceRoot,
          executablePath,
          workspaceTargets,
        })
      ) {
        this.pushActivity(
          this.state.mode === "plan"
            ? "Retrying with actionable plan instructions"
            : "Retrying with tool-first instructions"
        );
        this.state.runtimePhase = "waiting_for_qwen";
        retriedWithToolDirective = true;
        this.applyChatLiveEvent({
          type: "activity",
          activity:
            this.state.mode === "plan"
              ? "Retrying with actionable plan instructions"
              : "Retrying with tool-first instructions",
          phase: "connecting_runtime",
        });
        this.postState();
        const historyWithoutCurrentAssistant = this.state.messages.filter((message) => message.id !== assistantMessageId);
        const hasPseudoMarkup = /<tool_call>[\s\S]*?<\/tool_call>/i.test(result.assistantText || "");
        let injectedSnippets: Array<{ path: string; content: string; reason: string }> | undefined;
        if (hasPseudoMarkup && workspaceRoot) {
          const fallbackPaths = [
            fullPreview.activeFile || "",
            ...fullPreview.resolvedFiles,
            ...fullPreview.selectedFiles,
          ].filter(Boolean);
          injectedSnippets = await augmentContextFromPseudoMarkup(
            result.assistantText || "",
            workspaceRoot,
            fallbackPaths
          );
          if (injectedSnippets.length) {
            this.pushActivity(`Injected ${injectedSnippets.length} file(s) from workspace into retry`);
          }
        }
        result = await runPromptAttempt(
          this.state.mode === "plan" ? false : true,
          historyWithoutCurrentAssistant,
          false,
          injectedSnippets
        );
        if (promptAbort.signal.aborted) {
          throw new Error("Prompt aborted");
        }
        qwenDebugAttempts.push({
          requireToolUse: true,
          usedTools: [...result.usedTools],
          didMutate: result.didMutate,
          permissionDenials: [...result.permissionDenials],
          assistantTextPreview: String(result.assistantText || "").slice(0, 240),
          toolEvents: [...(result.toolEvents || [])],
        });

        if (
          this.shouldRetryQwenWithToolDirective(result, fullPreview, {
            task: taskText,
            workspaceRoot,
            executablePath,
            workspaceTargets,
          })
        ) {
          this.pushActivity("Retrying with strict actionable instructions");
          this.state.runtimePhase = "waiting_for_qwen";
          this.applyChatLiveEvent({
            type: "activity",
            activity: "Retrying with strict actionable instructions",
            phase: "connecting_runtime",
          });
          this.postState();
          result = await runPromptAttempt(
            this.state.mode === "plan" ? false : true,
            historyWithoutCurrentAssistant,
            true
          );
          if (promptAbort.signal.aborted) {
            throw new Error("Prompt aborted");
          }
          qwenDebugAttempts.push({
            requireToolUse: true,
            usedTools: [...result.usedTools],
            didMutate: result.didMutate,
            permissionDenials: [...result.permissionDenials],
            assistantTextPreview: String(result.assistantText || "").slice(0, 240),
            toolEvents: [...(result.toolEvents || [])],
          });
        }
      }

      const resolvedSessionId = localSessionId;
      this.sessionId = resolvedSessionId;
      this.state.selectedSessionId = resolvedSessionId;
      const trustedTargetPath =
        fullPreview.activeFile || fullPreview.resolvedFiles[0] || fullPreview.selectedFiles[0] || "";
      const qwenMutationProof = result.didMutate || result.usedTools.some((toolName) => isMutationToolName(toolName));
      const qwenStalled =
        fullPreview.intent === "change" &&
        !qwenMutationProof &&
        (result.usedTools.length > 0 || retriedWithToolDirective || Boolean(trustedTargetPath));
      const finalAssistantText = qwenStalled
        ? this.buildQwenStallMessage({
            task: taskText,
            preview: fullPreview,
            result,
            retriedWithToolDirective,
          })
        : sanitizeQwenAssistantOutput({
            text: result.assistantText || "Qwen Code finished without a final message.",
            task: taskText,
            workspaceRoot,
            executablePath,
            workspaceTargets,
          });
      if (qwenStalled) {
        this.pushActivity("Model returned without real tool execution");
        this.applyChatLiveEvent({
          type: "failed",
          text: finalAssistantText,
          phase: "failed",
        });
        this.state.runtimePhase = "failed";
      } else {
        this.applyChatLiveEvent({
          type: "final",
          text: finalAssistantText,
        });
      }
      const generatedFollowUps = buildFollowUpActions({
        intent: fullPreview.intent,
        lastTask: taskText,
        preview: fullPreview,
        patchConfidence: buildPatchConfidence({
          intent: fullPreview.intent,
          preview: fullPreview,
          didMutate: result.didMutate,
        }),
      });
      this.state.followUpActions = generatedFollowUps;
      if (qwenStalled && !generatedFollowUps.length) {
        this.setRecoveryFollowUpActions(taskText);
      }

      for (const denial of result.permissionDenials) {
        this.pushActivity(denial);
      }

      this.pushActivity(qwenStalled ? "Saving stalled run" : "Saving session");
      if (!qwenStalled) {
        this.state.runtimePhase = "saving_session";
        this.applyChatLiveEvent({
          type: "phase",
          phase: "saving_session",
          status: "streaming",
          progress: liveProgressForPhase("saving_session"),
          latestActivity: "Saving session",
        });
      }
      this.postState();
      await this.qwenHistoryService.saveConversation({
        sessionId: resolvedSessionId,
        mode: this.state.mode,
        title: taskText,
        messages: this.state.messages,
        targets: fullPreview.resolvedFiles,
        intent: fullPreview.intent,
      });
      if (promptAbort.signal.aborted) {
        throw new Error("Prompt aborted");
      }
      await this.refreshHistory();
      this.pushActivity(qwenStalled ? "Failed" : "Done");
      this.state.runtimePhase = qwenStalled ? "failed" : "done";
      this.lastQwenDebugSnapshot = {
        timestamp: nowIso(),
        task: taskText,
        mode: this.state.mode,
        intent: fullPreview.intent,
        confidence: fullPreview.confidence,
        workspaceRoot: workspaceRoot || null,
        activeFile: String(fullPreview.activeFile || ""),
        resolvedFiles: [...fullPreview.resolvedFiles],
        selectedFiles: [...fullPreview.selectedFiles],
        retriedWithToolDirective,
        attempts: qwenDebugAttempts,
        runtimePhase: this.state.runtimePhase,
        recentActivity: [...this.state.activity].slice(-12),
        model: getQwenModel(),
        ...(qwenStalled
          ? {
              error: finalAssistantText,
            }
          : {}),
      };
    } catch (error) {
      if (this.isPromptAbortError(error)) {
        this.pushActivity("Canceled");
        this.state.runtimePhase = "canceled";
        this.applyChatLiveEvent({
          type: "canceled",
          text: "Canceled current response.",
          phase: "canceled",
        });
        return;
      }
      this.applyChatLiveEvent({
        type: "failed",
        text: toSimpleFailureText(
          explainQwenFailure(error, {
            qwenBaseUrl: getQwenOpenAiBaseUrl(),
            executablePath: getQwenExecutablePath(),
          })
        ),
        phase: "failed",
      });
      this.setRecoveryFollowUpActions(taskText);
      this.pushActivity("Failed");
      this.state.runtimePhase = "failed";
      await this.qwenHistoryService.saveConversation({
        sessionId: localSessionId,
        mode: this.state.mode,
        title: taskText,
        messages: this.state.messages,
        targets: preview.resolvedFiles,
        intent: preview.intent,
      });
      await this.refreshHistory();
      this.lastQwenDebugSnapshot = {
        timestamp: nowIso(),
        task: taskText,
        mode: this.state.mode,
        intent: preview.intent,
        confidence: preview.confidence,
        workspaceRoot: workspaceRoot || null,
        activeFile: String(preview.activeFile || ""),
        resolvedFiles: [...preview.resolvedFiles],
        selectedFiles: [...preview.selectedFiles],
        retriedWithToolDirective,
        attempts: qwenDebugAttempts,
        runtimePhase: this.state.runtimePhase,
        recentActivity: [...this.state.activity].slice(-12),
        model: getQwenModel(),
        error: error instanceof Error ? error.message : String(error || "Unknown error"),
      };
    } finally {
      this.clearPromptAbort(promptAbort);
      this.state.busy = false;
      this.state.canUndo = false;
      this.postState();
    }
  }

  private buildDebugReport(): string {
    const lines = [
      "Binary IDE Debug Report",
      `Generated: ${nowIso()}`,
      `Current runtime: ${this.state.runtime}`,
      "",
    ];

    const qwen = this.lastQwenDebugSnapshot;
    if (qwen) {
      lines.push("=== Qwen Code (last run) ===");
      lines.push(`Captured: ${qwen.timestamp}`);
      lines.push(`Task: ${qwen.task}`);
      lines.push(`Mode: ${qwen.mode}`);
      lines.push(`Model: ${qwen.model || "(not captured)"}`);
      lines.push(`Intent: ${qwen.intent}`);
      lines.push(`Context confidence: ${qwen.confidence}`);
      lines.push(`Workspace root: ${qwen.workspaceRoot || "(none)"}`);
      lines.push(`Active file: ${qwen.activeFile || "(none)"}`);
      lines.push(`Resolved files: ${qwen.resolvedFiles.join(", ") || "(none)"}`);
      lines.push(`Selected files: ${qwen.selectedFiles.join(", ") || "(none)"}`);
      lines.push(`Retried tool-first: ${qwen.retriedWithToolDirective ? "yes" : "no"}`);
      lines.push(`Runtime phase: ${qwen.runtimePhase}`);
      lines.push(`Attempts: ${qwen.attempts.length}`);
      qwen.attempts.forEach((attempt, index) => {
        lines.push(
          `Attempt ${index + 1}: requireToolUse=${attempt.requireToolUse ? "yes" : "no"} | usedTools=${attempt.usedTools.join(", ") || "(none)"} | didMutate=${attempt.didMutate ? "yes" : "no"}`
        );
        if (attempt.permissionDenials.length) {
          lines.push(`Attempt ${index + 1} denials: ${attempt.permissionDenials.join(" | ")}`);
        }
        if (attempt.toolEvents.length) {
          lines.push(`Attempt ${index + 1} tool timeline:`);
          for (const event of attempt.toolEvents) {
            lines.push(`  - ${formatToolEventLine(event)}`);
          }
        } else {
          lines.push(`Attempt ${index + 1} tool timeline: (none)`);
        }
        if (attempt.assistantTextPreview) {
          lines.push(`Attempt ${index + 1} assistant preview: ${attempt.assistantTextPreview}`);
        }
      });
      if (qwen.error) lines.push(`Error: ${qwen.error}`);
      if (qwen.recentActivity.length) lines.push(`Recent activity: ${qwen.recentActivity.join(" -> ")}`);
      lines.push("");
    }

    const hosted = this.lastHostedDebugSnapshot;
    if (hosted) {
      lines.push(
        hosted.runtime === "cutie"
          ? "=== Standard Profile (hosted OpenHands, last run) ==="
          : hosted.runtime === "qwenCode"
            ? "=== Qwen Profile (hosted OpenHands, last run) ==="
            : "=== Hosted API (last run) ==="
      );
      lines.push(`Captured: ${hosted.timestamp}`);
      lines.push(`Task: ${hosted.task}`);
      lines.push(`Runtime: ${hosted.runtime}`);
      lines.push(`Mode: ${hosted.mode}`);
      lines.push(`Intent: ${hosted.intent}`);
      lines.push(`Context confidence: ${hosted.confidence}`);
      lines.push(`Workspace root: ${hosted.workspaceRoot || "(none)"}`);
      lines.push(`Active file: ${hosted.activeFile || "(none)"}`);
      lines.push(`Resolved files: ${hosted.resolvedFiles.join(", ") || "(none)"}`);
      lines.push(`Selected files: ${hosted.selectedFiles.join(", ") || "(none)"}`);
      lines.push(`Runtime phase: ${hosted.runtimePhase}`);
      lines.push(`Run ID: ${hosted.runId || "(none)"}`);
      lines.push(`Execution lane: ${hosted.executionLane || "(none)"}`);
      lines.push(`Runtime target: ${hosted.runtimeTarget || "(none)"}`);
      lines.push(`JSONL path: ${hosted.jsonlPath || "(none)"}`);
      lines.push(`Adapter: ${hosted.adapter || "(none)"}`);
      lines.push(`Completion status: ${hosted.completionStatus || "(none)"}`);
      lines.push(`Progress status: ${hosted.progressState?.status || "(none)"}`);
      if (hosted.progressState?.stallReason) lines.push(`Stall reason: ${hosted.progressState.stallReason}`);
      if (hosted.progressState?.nextDeterministicAction) {
        lines.push(`Next deterministic action: ${hosted.progressState.nextDeterministicAction}`);
      }
      lines.push(`Objective status: ${hosted.objectiveState?.status || "(none)"}`);
      if (hosted.objectiveState?.targetPath) lines.push(`Objective target: ${hosted.objectiveState.targetPath}`);
      lines.push(`Tools used: ${hosted.toolCallsUsed.join(", ") || "(none)"}`);
      if (hosted.assistantPreview) lines.push(`Assistant preview: ${hosted.assistantPreview}`);
      if (hosted.error) lines.push(`Error: ${hosted.error}`);
      if (hosted.recentActivity.length) lines.push(`Recent activity: ${hosted.recentActivity.join(" -> ")}`);
      lines.push("");
    }

    if (!qwen && !hosted) {
      lines.push(
        "No debug snapshots captured yet. Send a prompt with the standard profile, Qwen Code, or the hosted OpenHands runtime to populate."
      );
    }

    return lines.join("\n").replace(/\n{3,}/g, "\n\n").trim();
  }

  private async copyDebugReport(): Promise<void> {
    const report = this.buildDebugReport();
    await vscode.env.clipboard.writeText(report);
    vscode.window.showInformationMessage("Copied Binary IDE debug report to clipboard.");
  }

  private async sendPromptWithDetachedJob(
    text: string,
    clientMessageId = "",
    promptText?: string,
    appendUser = true
  ): Promise<void> {
    this.state.followUpActions = [];
    this.state.busy = true;
    const promptAbort = new AbortController();
    this.promptAbort = promptAbort;
    const taskText = String(promptText || text).trim() || text;
    if (appendUser) {
      this.appendMessage("user", text, undefined, clientMessageId);
    }
    this.applyChatLiveEvent({
      type: "accepted",
      transport: "cutie",
      mode: "shell",
      phase: "accepted",
    });
    this.applyChatLiveEvent({
      type: "activity",
      activity: "Starting detached headless job",
      phase: "connecting_runtime",
    });
    this.postState();

    const auth = await this.auth.getRequestAuth();
    if (!auth) {
      this.applyChatLiveEvent({
        type: "failed",
        text: "Authenticate with browser sign-in or an Xpersona API key before sending prompts.",
        phase: "failed",
      });
      this.state.followUpActions = [];
      this.state.busy = false;
      this.postState();
      return;
    }

    let createdJob: BinaryAgentJob | null = null;
    let finalAssistantText = "";

    try {
      createdJob = await createAgentJob(auth, {
        task: taskText,
        mode: this.state.mode,
        model: getAgentModelAlias(),
        ...(this.sessionId ? { historySessionId: this.sessionId } : {}),
        client: {
          surface: "cutie",
          name: "xpersona-vscode-extension",
        },
      });
      this.pushActivity(
        `Detached job ${createdJob.id} started (${createdJob.executionLane || "openhands_headless"}).`
      );
      this.applyChatLiveEvent({
        type: "activity",
        activity: `Detached job ${createdJob.id} started.`,
        phase: "connecting_runtime",
      });
      this.postState();

      await streamAgentJobEvents({
        auth,
        jobId: createdJob.id,
        signal: promptAbort.signal,
        onEvent: async (event) => {
          const message = parseDetachedJobEventMessage(event.data);
          if (event.event === "final" && typeof event.data === "string" && event.data.trim()) {
            finalAssistantText = event.data.trim();
          } else if (event.event === "final" && message) {
            finalAssistantText = message;
          }
          if (event.event === "host.heartbeat") return;
          if (message) {
            this.pushActivity(message);
            this.applyChatLiveEvent({
              type: "activity",
              activity: message,
              phase: "streaming_answer",
            });
            this.postState();
          }
        },
      });

      const finalJob = await getAgentJob(auth, createdJob.id);
      const summary = formatDetachedJobTerminalSummary(finalJob);
      this.lastHostedDebugSnapshot = {
        timestamp: nowIso(),
        task: taskText,
        runtime: this.state.runtime,
        mode: this.state.mode,
        intent: classifyIntent(taskText),
        confidence: "medium",
        workspaceRoot: getWorkspaceRootPath() || null,
        activeFile: this.getActiveEditorPath() || "",
        resolvedFiles: [],
        selectedFiles: [],
        runtimePhase:
          finalJob.status === "completed"
            ? "done"
            : finalJob.status === "cancelled"
              ? "canceled"
              : finalJob.status === "takeover_required"
                ? "clarify"
                : "failed",
        recentActivity: [...this.state.activity].slice(-12),
        runId: finalJob.runId,
        executionLane: finalJob.executionLane,
        runtimeTarget: finalJob.runtimeTarget || undefined,
        jsonlPath: finalJob.jsonlPath || null,
        persistenceDir: finalJob.persistenceDir || null,
        completionStatus: finalJob.status === "completed" ? "complete" : "incomplete",
        toolCallsUsed: [],
        assistantPreview: finalAssistantText ? finalAssistantText.slice(0, 300) : undefined,
        ...(finalJob.status === "completed" ? {} : { error: finalJob.errorMessage || summary }),
      };

      if (finalJob.status === "completed") {
        this.applyChatLiveEvent({
          type: "final",
          text: finalAssistantText ? `${finalAssistantText}\n\n${summary}` : summary,
        });
        this.state.runtimePhase = "done";
      } else if (finalJob.status === "cancelled") {
        this.applyChatLiveEvent({
          type: "canceled",
          text: summary,
          phase: "canceled",
        });
        this.state.runtimePhase = "canceled";
      } else {
        this.applyChatLiveEvent({
          type: "failed",
          text: summary,
          phase: finalJob.status === "takeover_required" ? "awaiting_tool_approval" : "failed",
        });
        this.setRecoveryFollowUpActions(taskText);
        this.state.runtimePhase = finalJob.status === "takeover_required" ? "clarify" : "failed";
      }
      await this.refreshHistory();
    } catch (error) {
      if (this.isPromptAbortError(error)) {
        this.pushActivity("Canceled");
        this.state.runtimePhase = "canceled";
        this.applyChatLiveEvent({
          type: "canceled",
          text: "Canceled current response.",
          phase: "canceled",
        });
        return;
      }
      const errorMessage = error instanceof Error ? error.message : String(error);
      const canFallbackToAssist =
        /\bHTTP 404\b/i.test(errorMessage) ||
        /Unable to resolve agent jobs endpoint/i.test(errorMessage) ||
        /Unknown route/i.test(errorMessage);
      if (canFallbackToAssist) {
        this.pushActivity("Detached jobs unavailable on this host. Falling back to standard chat lane.");
        this.clearPromptAbort(promptAbort);
        this.state.busy = false;
        this.postState();
        await this.sendPromptWithPlaygroundApi(text, clientMessageId, promptText, false);
        return;
      }
      this.applyChatLiveEvent({
        type: "failed",
        text: toSimpleFailureText(`Detached run failed: ${errorMessage}`),
        phase: "failed",
      });
      this.setRecoveryFollowUpActions(taskText);
      this.state.runtimePhase = "failed";
    } finally {
      this.clearPromptAbort(promptAbort);
      this.state.busy = false;
      this.postState();
    }
  }

  private async sendPromptWithPlaygroundApi(
    text: string,
    clientMessageId = "",
    promptText?: string,
    appendUser = true
  ): Promise<void> {
    this.state.followUpActions = [];
    this.state.busy = true;
    const promptAbort = new AbortController();
    this.promptAbort = promptAbort;
    if (appendUser) {
      this.appendMessage("user", text, undefined, clientMessageId);
    }
    this.applyChatLiveEvent({
      type: "accepted",
      transport: "playground",
      mode: "shell",
      phase: "accepted",
    });
    this.applyChatLiveEvent({
      type: "activity",
      activity: "Prompt received",
      phase: "accepted",
    });
    this.postState();

    const auth = await this.auth.getRequestAuth();
    if (!auth) {
      this.applyChatLiveEvent({
        type: "failed",
        text: "Authenticate with browser sign-in or an Xpersona API key before sending prompts.",
        phase: "failed",
      });
      this.state.followUpActions = [];
      this.state.busy = false;
      this.postState();
      return;
    }

    const hostedToolCallsUsed: string[] = [];
    const hostedDebugRef = { runId: undefined as string | undefined, adapter: undefined as string | undefined };
    let hostedPreview: Awaited<ReturnType<ContextCollector["collect"]>>["preview"] | null = null;
    const taskText = String(promptText || text).trim() || text;
    try {
      const { context, retrievalHints, preview } = await this.contextCollector.collect(
        taskText,
        {
          recentTouchedPaths: this.actionRunner.getRecentTouchedPaths(),
          attachedFiles: this.manualContext.attachedFiles,
          attachedSelection: this.manualContext.attachedSelection,
          searchDepth: "fast",
          intent: classifyIntent(taskText),
        }
      );
      hostedPreview = preview;
      this.lastHostedDebugSnapshot = {
        timestamp: nowIso(),
        task: taskText,
        runtime: this.state.runtime,
        mode: this.state.mode,
        intent: preview.intent,
        confidence: preview.confidence,
        workspaceRoot: getWorkspaceRootPath() || null,
        activeFile: String(preview.activeFile || ""),
        resolvedFiles: [...preview.resolvedFiles],
        selectedFiles: [...preview.selectedFiles],
        runtimePhase: this.state.runtimePhase,
        recentActivity: [...this.state.activity].slice(-12),
        toolCallsUsed: [...hostedToolCallsUsed],
      };
      if (promptAbort.signal.aborted) {
        throw new Error("Prompt aborted");
      }

      const workspaceHash = getWorkspaceHash();
      const requestBody = {
        mode: this.state.mode,
        task: taskText,
        stream: true,
        model: getAgentModelAlias(),
        orchestrationProtocol: this.state.mode === "plan" ? "batch_v1" : "tool_loop_v1",
        clientCapabilities:
          this.state.mode === "plan"
            ? undefined
            : {
                toolLoop: true,
                supportedTools: this.toolExecutor.getSupportedTools(),
                autoExecute: true,
                supportsNativeToolResults: false,
              },
        ...(this.sessionId ? { historySessionId: this.sessionId } : {}),
        context,
        retrievalHints,
        clientTrace: {
          extensionVersion: String(
            vscode.extensions.getExtension("playgroundai.xpersona-playground")?.packageJSON?.version || "0.0.0"
          ),
          workspaceHash,
          maxToolSteps: getMaxToolStepsForPlayground(),
          maxWorkspaceMutations: getMaxWorkspaceMutationsForPlayground(),
        },
      };

      let initial: AssistRunEnvelope;
      try {
        initial = await this.requestAssistStream(auth, requestBody, promptAbort.signal);
      } catch (error) {
        if (this.isPromptAbortError(error)) {
          throw error;
        }
        const message = error instanceof Error ? error.message : String(error);
        if (/openhands/i.test(message)) {
          this.state.orchestratorStatus = {
            state: "unavailable",
            label: "OpenHands unavailable",
            detail: message,
          };
          this.postState();
          throw error;
        }
        this.pushActivity("Assist stream unavailable, retrying over standard transport.");
        this.applyChatLiveEvent({
          type: "activity",
          activity: "Assist stream unavailable, retrying over standard transport.",
          phase: "connecting_runtime",
        });
        initial = await this.requestAssist(auth, {
          ...requestBody,
          stream: false,
        }, promptAbort.signal);
      }
      if (promptAbort.signal.aborted) {
        throw new Error("Prompt aborted");
      }

      if (initial.sessionId) {
        this.sessionId = initial.sessionId;
        this.state.selectedSessionId = initial.sessionId;
      }
      this.state.orchestratorStatus = {
        state: "ready",
        label: "OpenHands connected",
        ...(initial.orchestratorVersion ? { detail: `gateway ${initial.orchestratorVersion}` } : {}),
      };
      this.pushActivity(
        initial.orchestrationProtocol === "tool_loop_v1"
          ? `Started run ${initial.runId || "pending"} via ${initial.adapter || "tool loop"}.`
          : "Prepared a batch response."
      );
      const initialLane = readRecordString(initial as unknown, "executionLane");
      const initialRuntimeTarget = readRecordString(initial as unknown, "runtimeTarget");
      const initialJsonlPath = readRecordString(initial as unknown, "jsonlPath");
      if (initialLane || initialRuntimeTarget || initialJsonlPath) {
        this.pushActivity(
          [
            initialLane ? `lane=${initialLane}` : "",
            initialRuntimeTarget ? `runtime=${initialRuntimeTarget}` : "",
            initialJsonlPath ? `jsonl=${initialJsonlPath}` : "",
          ]
            .filter(Boolean)
            .join(" | ")
        );
      }

      hostedDebugRef.runId = initial.runId;
      hostedDebugRef.adapter = initial.adapter;
      let envelope = initial;
      if (envelope.pendingToolCall && envelope.runId) {
        this.applyChatLiveEvent({
          type: "activity",
          activity: `Waiting for ${envelope.pendingToolCall.toolCall.name}`,
          phase: "awaiting_tool_approval",
        });
        envelope = await this.executeToolLoop({
          auth,
          initialEnvelope: envelope,
          intent: preview.intent,
          mode: this.state.mode,
          workspaceFingerprint: workspaceHash,
          signal: promptAbort.signal,
          toolCallsUsed: hostedToolCallsUsed,
          debugRef: hostedDebugRef,
        });
      }
      if (promptAbort.signal.aborted) {
        throw new Error("Prompt aborted");
      }

      const hostedObjectiveState = (envelope.objectiveState as ObjectiveState | null) || null;
      const hostedProgressState = (envelope.progressState as ProgressState | null) || null;
      const hostedMutationProof = hasMutationProofFromTools(hostedToolCallsUsed, envelope);
      const hostedSucceeded = isHostedCompletionSuccessful({
        envelope,
        objectiveState: hostedObjectiveState,
        progressState: hostedProgressState,
        mutationProof: hostedMutationProof,
        mode: this.state.mode,
      });
      const assistantBody =
        this.state.mode === "plan" && envelope.plan
          ? [envelope.final || "Plan ready.", "", formatPlan(envelope.plan)].filter(Boolean).join("\n")
          : envelope.final || "I ran the task, but the model returned an empty text reply.";
      const sanitizedAssistantBody = sanitizeQwenAssistantOutput({
        text: assistantBody,
        task: taskText,
        workspaceRoot: getWorkspaceRootPath(),
        executablePath: getQwenExecutablePath() || null,
        workspaceTargets: [
          preview.activeFile || "",
          ...preview.resolvedFiles,
          ...preview.selectedFiles,
        ],
      });
      const finalAssistantText = hostedSucceeded
        ? sanitizedAssistantBody
        : [
            buildHostedTerminalMessage({
              task: taskText,
              preview: {
                intent: preview.intent,
                activeFile: preview.activeFile,
                resolvedFiles: preview.resolvedFiles,
                selectedFiles: preview.selectedFiles,
              },
              envelope,
              progressState: hostedProgressState,
              objectiveState: hostedObjectiveState,
              toolCallsUsed: hostedToolCallsUsed,
              mutationProof: hostedMutationProof,
            }),
            String(envelope.final || "").trim() &&
            String(envelope.final || "").trim() !== "No final response text was returned."
              ? `Last model text:\n${sanitizedAssistantBody}`
              : "",
          ]
            .filter(Boolean)
            .join("\n\n");

      if (hostedSucceeded) {
        this.applyChatLiveEvent({
          type: "final",
          text: finalAssistantText,
        });
        this.state.followUpActions = [];
      } else {
        this.applyChatLiveEvent({
          type: "failed",
          text: toSimpleFailureText(finalAssistantText),
          phase: "failed",
        });
        this.pushActivity("Model returned without provable completion");
        this.setRecoveryFollowUpActions(taskText);
        this.state.runtimePhase = "failed";
      }

      if (
        hostedSucceeded &&
        this.state.mode !== "plan" &&
        envelope.actions?.length &&
        envelope.adapter === "deterministic_batch"
      ) {
        this.appendMessage("system", "Applying deterministic batch changes locally...");
        this.postState();
        const applyReport = await this.actionRunner.apply({
          mode: this.state.mode,
          actions: envelope.actions as AssistAction[],
          auth,
          sessionId: this.sessionId || undefined,
          workspaceFingerprint: workspaceHash,
        });
        this.state.canUndo = applyReport.canUndo;
        this.appendMessage("system", applyReport.summary);
      }

      if (envelope.receipt && typeof envelope.receipt === "object") {
        const receipt = envelope.receipt as Record<string, unknown>;
        const label = String(receipt.status || "ready");
        this.pushActivity(`Receipt: ${label}.`);
      }

      this.state.runtimePhase = hostedSucceeded ? "done" : "failed";
      this.lastHostedDebugSnapshot = {
        timestamp: nowIso(),
        task: taskText,
        runtime: this.state.runtime,
        mode: this.state.mode,
        intent: preview.intent,
        confidence: preview.confidence,
        workspaceRoot: getWorkspaceRootPath() || null,
        activeFile: String(preview.activeFile || ""),
        resolvedFiles: [...preview.resolvedFiles],
        selectedFiles: [...preview.selectedFiles],
        runtimePhase: this.state.runtimePhase,
        recentActivity: [...this.state.activity].slice(-12),
        runId: envelope.runId,
        executionLane: readRecordString(envelope as unknown, "executionLane"),
        runtimeTarget: readRecordString(envelope as unknown, "runtimeTarget"),
        jsonlPath: readRecordString(envelope as unknown, "jsonlPath") || null,
        persistenceDir: readRecordString(envelope as unknown, "persistenceDir") || null,
        adapter: envelope.adapter,
        completionStatus: envelope.completionStatus,
        progressState: hostedProgressState,
        objectiveState: hostedObjectiveState,
        toolCallsUsed: [...hostedToolCallsUsed],
        assistantPreview: finalAssistantText ? String(finalAssistantText).slice(0, 300) : undefined,
        ...(hostedSucceeded
          ? {}
          : {
              error: finalAssistantText,
            }),
      };

      await this.refreshHistory();
    } catch (error) {
      if (this.isPromptAbortError(error)) {
        this.pushActivity("Canceled");
        this.state.runtimePhase = "canceled";
        this.applyChatLiveEvent({
          type: "canceled",
          text: "Canceled current response.",
          phase: "canceled",
        });
        return;
      }
      const errorMessage = error instanceof Error ? error.message : String(error);
      if (/openhands/i.test(errorMessage)) {
        this.state.orchestratorStatus = {
          state: "unavailable",
          label: "OpenHands unavailable",
          detail: errorMessage,
        };
      }
      this.applyChatLiveEvent({
        type: "failed",
        text: toSimpleFailureText(`Request failed: ${errorMessage}`),
        phase: "failed",
      });
      this.setRecoveryFollowUpActions(taskText);
      this.state.runtimePhase = "failed";
      this.lastHostedDebugSnapshot = {
        timestamp: nowIso(),
        task: taskText,
        runtime: this.state.runtime,
        mode: this.state.mode,
        intent: hostedPreview?.intent ?? "ask",
        confidence: hostedPreview?.confidence ?? "low",
        workspaceRoot: getWorkspaceRootPath() || null,
        activeFile: String(hostedPreview?.activeFile ?? ""),
        resolvedFiles: hostedPreview ? [...hostedPreview.resolvedFiles] : [],
        selectedFiles: hostedPreview ? [...hostedPreview.selectedFiles] : [],
        runtimePhase: "failed",
        recentActivity: [...this.state.activity].slice(-12),
        runId: hostedDebugRef.runId,
        adapter: hostedDebugRef.adapter,
        toolCallsUsed: [...hostedToolCallsUsed],
        error: error instanceof Error ? error.message : String(error),
      };
    } finally {
      this.clearPromptAbort(promptAbort);
      this.state.busy = false;
      this.postState();
    }
  }

  private async requestAssist(
    auth: RequestAuth,
    body: Record<string, unknown>,
    signal?: AbortSignal
  ): Promise<AssistRunEnvelope> {
    const response = await requestJson<{ data?: AssistRunEnvelope }>(
      "POST",
      `${getBaseApiUrl()}/api/v1/playground/assist`,
      auth,
      body,
      { signal }
    );
    return (response?.data || response) as AssistRunEnvelope;
  }

  private async requestAssistStream(
    auth: RequestAuth,
    body: Record<string, unknown>,
    signal?: AbortSignal
  ): Promise<AssistRunEnvelope> {
    const envelope: Partial<AssistRunEnvelope> = {
      actions: [],
      final: "",
      missingRequirements: [],
    };

    await streamJsonEvents(
      "POST",
      `${getBaseApiUrl()}/api/v1/playground/assist`,
      auth,
      body,
      async (event, data) => {
        switch (event) {
          case "ack":
          case "status": {
            const message = typeof data === "string" ? data.trim() : "";
            if (!message) return;
            this.pushActivity(message);
            this.applyChatLiveEvent({
              type: "activity",
              activity: message,
              phase: event === "ack" ? "accepted" : "connecting_runtime",
            });
            this.postState();
            return;
          }
          case "activity": {
            const activity = typeof data === "string" ? data.trim() : "";
            if (!activity) return;
            this.pushActivity(activity);
            this.applyChatLiveEvent({
              type: /tool/i.test(activity)
                ? "tool_approval"
                : "activity",
              ...( /tool/i.test(activity)
                ? { activity }
                : { activity, phase: "connecting_runtime" }),
            } as ChatLiveEvent);
            this.postState();
            return;
          }
          case "plan":
            envelope.plan = data as AssistRunEnvelope["plan"];
            return;
          case "actions":
            envelope.actions = Array.isArray(data) ? (data as AssistRunEnvelope["actions"]) : [];
            return;
          case "run":
            if (data && typeof data === "object") {
              const record = data as Record<string, unknown>;
              envelope.runId = typeof record.runId === "string" ? record.runId : envelope.runId;
              envelope.adapter = record.adapter as AssistRunEnvelope["adapter"];
              envelope.loopState = (record.loopState as AssistRunEnvelope["loopState"]) || envelope.loopState;
            }
            return;
          case "tool_request":
            envelope.pendingToolCall = data as PendingToolCall;
            this.pushActivity(`Awaiting ${envelope.pendingToolCall.toolCall.name}`);
            this.applyChatLiveEvent({
              type: "tool_approval",
              activity: `Awaiting ${envelope.pendingToolCall.toolCall.name}`,
            });
            this.postState();
            return;
          case "meta":
            if (data && typeof data === "object") {
              const record = data as Partial<AssistRunEnvelope>;
              Object.assign(envelope, record);
              if (record.sessionId) {
                this.sessionId = record.sessionId;
                this.state.selectedSessionId = record.sessionId;
              }
            }
            return;
          case "partial": {
            const text = typeof data === "string" ? data : "";
            if (!text.trim()) return;
            this.applyChatLiveEvent({
              type: "partial_text",
              text,
              phase: "streaming_answer",
            });
            this.postState();
            return;
          }
          case "final":
            envelope.final = typeof data === "string" ? data : "";
            return;
          case "error": {
            const message = typeof data === "string" ? data : "Assist stream failed.";
            throw new Error(message);
          }
          default:
            return;
        }
      },
      { signal }
    );

    if (!envelope.sessionId || !envelope.decision || !envelope.validationPlan || !envelope.targetInference || !envelope.contextSelection || !envelope.completionStatus) {
      throw new Error("Assist stream completed without a usable response envelope.");
    }

    return envelope as AssistRunEnvelope;
  }

  private async continueRun(
    auth: RequestAuth,
    runId: string,
    toolResult: ToolResult,
    signal?: AbortSignal,
    sessionId?: string | null
  ): Promise<AssistRunEnvelope> {
    const url = `${getBaseApiUrl()}/api/v1/playground/runs/${encodeURIComponent(runId)}/continue`;
    const sid = typeof sessionId === "string" && sessionId.trim() ? sessionId.trim() : "";
    const body = sid ? { toolResult, sessionId: sid } : { toolResult };
    let lastError: Error | null = null;
    for (let attempt = 0; attempt < 3; attempt++) {
      if (attempt > 0) {
        const delay = 400 * attempt;
        await new Promise((r) => setTimeout(r, delay));
      }
      if (signal?.aborted) throw new Error("Prompt aborted");
      try {
        const response = await requestJson<{ data?: AssistRunEnvelope }>(
          "POST",
          url,
          auth,
          body,
          { signal }
        );
        return (response?.data || response) as AssistRunEnvelope;
      } catch (err) {
        lastError = err instanceof Error ? err : new Error(String(err));
        const msg = lastError.message;
        if (msg.includes("RUN_NOT_FOUND") && attempt < 2) continue;
        throw lastError;
      }
    }
    throw lastError ?? new Error("Continue run failed");
  }

  private async executeToolLoop(input: {
    auth: RequestAuth;
    initialEnvelope: AssistRunEnvelope;
    intent: IntentKind;
    mode: Mode;
    workspaceFingerprint: string;
    signal?: AbortSignal;
    toolCallsUsed?: string[];
    debugRef?: { runId?: string; adapter?: string };
  }): Promise<AssistRunEnvelope> {
    let envelope = input.initialEnvelope;
    const seenPendingSignatures = new Map<string, number>();
    const blockEnvelope = (source: AssistRunEnvelope, reason: string, nextAction: string): AssistRunEnvelope => {
      const existingMissing = readStringArray(source.missingRequirements);
      const targetPath =
        readRecordString(source.objectiveState, "targetPath") ||
        readRecordString(source.pendingToolCall?.toolCall.arguments || {}, "path") ||
        readRecordString(source.pendingToolCall?.toolCall.arguments || {}, "filePath") ||
        "";
      const progressState: ProgressState = {
        status: "stalled",
        lastMeaningfulProgressAtStep: source.loopState?.stepCount || 0,
        lastMeaningfulProgressSummary: reason,
        stallCount:
          source.progressState &&
          typeof source.progressState === "object" &&
          typeof source.progressState.stallCount === "number"
            ? source.progressState.stallCount + 1
            : 1,
        stallReason: reason,
        nextDeterministicAction: nextAction,
        pendingToolCallSignature: buildToolCallSignature(source.pendingToolCall?.toolCall || null),
      };
      const objectiveState: ObjectiveState = {
        status: "blocked",
        goalType: getObjectiveGoalType(input.intent, input.mode),
        ...(targetPath ? { targetPath } : {}),
        requiredProof: Array.from(new Set([...readRecordStringArray(source.objectiveState, "requiredProof"), ...existingMissing])),
        observedProof: readRecordStringArray(source.objectiveState, "observedProof"),
        missingProof: Array.from(new Set([...readRecordStringArray(source.objectiveState, "missingProof"), reason])),
      };
      return {
        ...source,
        completionStatus: "incomplete",
        missingRequirements: Array.from(new Set([...existingMissing, reason])),
        progressState,
        objectiveState,
        reviewState: {
          ...(source.reviewState && typeof source.reviewState === "object" ? (source.reviewState as Record<string, unknown>) : {}),
          status: "blocked",
          reason,
          recommendedAction: nextAction,
          surface: "playground_panel",
          controlActions: ["repair"],
        },
        pendingToolCall: null,
        final: reason,
      };
    };
    while (envelope.pendingToolCall && envelope.runId) {
      if (input.signal?.aborted) {
        throw new Error("Prompt aborted");
      }
      const pendingToolCall: PendingToolCall = envelope.pendingToolCall;
      input.toolCallsUsed?.push(pendingToolCall.toolCall.name);
      this.pushActivity(`Step ${pendingToolCall.step}: ${pendingToolCall.toolCall.name}`);
      this.applyChatLiveEvent({
        type: "tool_approval",
        activity: `Step ${pendingToolCall.step}: ${pendingToolCall.toolCall.name}`,
      });
      this.postState();

      if (input.signal?.aborted) {
        throw new Error("Prompt aborted");
      }
      const toolResult = await this.toolExecutor.executeToolCall({
        pendingToolCall,
        auth: input.auth,
        sessionId: this.sessionId || undefined,
        workspaceFingerprint: input.workspaceFingerprint,
        signal: input.signal,
      });
      await this.handleBinaryToolResult({
        toolResult,
        auth: input.auth,
      });
      if (input.signal?.aborted) {
        throw new Error("Prompt aborted");
      }
      this.pushActivity(toolResult.summary);
      this.applyChatLiveEvent({
        type: "activity",
        activity: toolResult.summary,
        phase: "streaming_answer",
      });
      this.postState();

      if (input.debugRef) {
        input.debugRef.runId = envelope.runId;
        input.debugRef.adapter = envelope.adapter;
      }
      const nextEnvelope = await this.continueRun(
        input.auth,
        envelope.runId,
        toolResult,
        input.signal,
        envelope.sessionId || this.sessionId
      );
      const nextSignature = buildToolCallSignature(nextEnvelope.pendingToolCall?.toolCall || null);
      const currentFingerprint = buildHostedProgressFingerprint({
        envelope,
        toolCallsUsed: input.toolCallsUsed || [],
        objectiveState: envelope.objectiveState || null,
        progressState: envelope.progressState || null,
      });
      const nextFingerprint = buildHostedProgressFingerprint({
        envelope: nextEnvelope,
        toolCallsUsed: input.toolCallsUsed || [],
        objectiveState: nextEnvelope.objectiveState || null,
        progressState: nextEnvelope.progressState || null,
      });
      const nextMutationProof = hasMutationProofFromTools(input.toolCallsUsed || [], nextEnvelope);
      if (nextEnvelope.loopState && nextEnvelope.loopState.stepCount < pendingToolCall.step) {
        envelope = blockEnvelope(
          nextEnvelope,
          `Hosted loop regressed from step ${pendingToolCall.step} to ${nextEnvelope.loopState.stepCount}.`,
          `Repair the run around ${pendingToolCall.toolCall.name} before continuing.`
        );
        break;
      }
      if (nextSignature) {
        const repeatCount = (seenPendingSignatures.get(nextSignature) || 0) + 1;
        seenPendingSignatures.set(nextSignature, repeatCount);
        if (repeatCount > 1 && nextFingerprint === currentFingerprint && !nextMutationProof) {
          envelope = blockEnvelope(
            nextEnvelope,
            `Repeated pending tool call without new proof: ${pendingToolCall.toolCall.name}.`,
            pendingToolCall.toolCall.kind === "mutate"
              ? `Use a repair stage for ${pendingToolCall.toolCall.name}.`
              : `Switch to a concrete mutation for ${pendingToolCall.toolCall.name}.`
          );
          break;
        }
      }
      envelope = nextEnvelope;
      if (envelope.sessionId) {
        this.sessionId = envelope.sessionId;
        this.state.selectedSessionId = envelope.sessionId;
      }
      if (envelope.pendingToolCall) {
        this.pushActivity(`Queued next tool: ${envelope.pendingToolCall.toolCall.name}`);
        this.applyChatLiveEvent({
          type: "tool_approval",
          activity: `Queued next tool: ${envelope.pendingToolCall.toolCall.name}`,
        });
      }
      this.postState();
    }
    return envelope;
  }

  private appendMessage(
    role: ChatMessage["role"],
    content: string,
    extras?: Partial<Pick<ChatMessage, "presentation" | "live">>,
    id?: string
  ): void {
    this.state.messages = [...this.state.messages, { id: id || randomUUID(), role, content, ...extras }];
  }

  private upsertMessage(
    id: string,
    role: ChatMessage["role"],
    content: string,
    extras?: Partial<Pick<ChatMessage, "presentation" | "live">>
  ): void {
    const nextContent = content.trim();
    const index = this.state.messages.findIndex((message) => message.id === id);
    if (index >= 0) {
      const nextMessages = [...this.state.messages];
      nextMessages[index] = { ...nextMessages[index], role, content: nextContent, ...extras };
      this.state.messages = nextMessages;
      return;
    }
    this.state.messages = [...this.state.messages, { id, role, content: nextContent, ...extras }];
  }

  private pushActivity(text: string): void {
    const next = toSimpleActivityText(text);
    if (!next) return;
    const last = this.state.activity.length ? this.state.activity[this.state.activity.length - 1] : "";
    if (last === next) return;
    this.state.activity = [...this.state.activity, next].slice(-24);
  }

  private postState(): void {
    this.view?.webview.postMessage({
      type: "state",
      state: this.state,
    });
  }

  private renderHtml(webview: vscode.Webview): string {
    const nonce = createNonce();
    const scriptUri = webview.asWebviewUri(vscode.Uri.joinPath(this.context.extensionUri, "media", "webview.js"));
    const logoUri = webview.asWebviewUri(vscode.Uri.joinPath(this.context.extensionUri, "media", "xpersona.svg"));
    const workspaceName = vscode.workspace.workspaceFolders?.[0]?.name || "Workspace";

    return buildPlaygroundWebviewHtml({
      nonce,
      cspSource: webview.cspSource,
      scriptUri: String(scriptUri),
      logoUri: String(logoUri),
      workspaceName,
    });
  }
}

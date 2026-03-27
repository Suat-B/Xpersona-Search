import type {
  LoopStateContract,
  ObjectiveStateContract,
  PendingToolCallContract,
  PlaygroundAdapter,
  PlaygroundToolName,
  ProgressStateContract,
  ToolCallContract,
  ToolResultContract,
  ToolTraceEntryContract,
} from "@/lib/playground/contracts";
import { PLAYGROUND_TOOL_LOOP_TOOLS } from "@/lib/playground/model-registry";
import {
  appendSessionMessage,
  createAgentRun,
  getAgentRunById,
  updateAgentRun,
  type AgentRunRecord,
} from "@/lib/playground/store";
import type {
  AssistContextSelection,
  AssistPlan,
  AssistResult,
  AssistRuntimeInput,
  AssistTargetInference,
} from "@/lib/playground/orchestration";
import {
  buildContextSelection,
  buildDecision,
  buildDecoratedAssistResult,
  buildObjectiveState,
  buildProgressState,
  buildPlan,
  buildTargetInference,
  buildValidationPlan,
  inferRisk,
  inferIntent,
} from "@/lib/playground/orchestration";
import { attachAssistArtifactIdentifiers } from "@/lib/playground/agent-os";
import { requestToolLoopTurn, selectToolLoopAdapter, type ToolLoopTurnInput } from "@/lib/playground/tool-loop-adapters";
import { isOpenHandsPrimaryOrchestration } from "@/lib/playground/openhands-primary-orchestration";
import type { ExecuteAction } from "@/lib/playground/policy";

const MAX_TOOL_STEPS = 12;
const MAX_MUTATING_STEPS = 4;
const MAX_REPAIR_ROUNDS = 3;
const MAX_IDENTICAL_CALLS = 2;

type ToolLoopRepairStage =
  | "post_inspection_mutation_required"
  | "target_path_repair"
  | "patch_repair"
  | "single_file_rewrite"
  | "pine_specialization";

type PersistedToolLoopState = {
  protocol: "tool_loop_v1";
  adapter: PlaygroundAdapter;
  orchestrator: "in_house" | "openhands";
  orchestratorVersion?: string | null;
  orchestratorRunId?: string | null;
  loopState: LoopStateContract;
  pendingToolCall: PendingToolCallContract | null;
  toolTrace: ToolTraceEntryContract[];
  targetInference: AssistTargetInference;
  contextSelection: AssistContextSelection;
  fallbackPlan: AssistPlan;
  checkpointCreated: boolean;
  deferredToolCall?: ToolCallContract | null;
  availableTools: PlaygroundToolName[];
  progressState: ProgressStateContract;
  objectiveState: ObjectiveStateContract;
  lastProgressFingerprint?: string | null;
  repairHistory: ToolLoopRepairStage[];
};

type StartToolLoopInput = {
  userId: string;
  sessionId: string;
  traceId: string;
  request: AssistRuntimeInput;
};

type ContinueToolLoopInput = {
  userId: string;
  traceId: string;
  runId: string;
  toolResult: ToolResultContract;
};

function nowIso(): string {
  return new Date().toISOString();
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" ? (value as Record<string, unknown>) : {};
}

function buildInitialLoopState(): LoopStateContract {
  return {
    protocol: "tool_loop_v1",
    status: "running",
    stepCount: 0,
    mutationCount: 0,
    repeatedCallCount: 0,
    repairCount: 0,
    maxSteps: MAX_TOOL_STEPS,
    maxMutations: MAX_MUTATING_STEPS,
  };
}

function buildAvailableTools(request: AssistRuntimeInput): PlaygroundToolName[] {
  const supported = request.clientCapabilities?.supportedTools || PLAYGROUND_TOOL_LOOP_TOOLS;
  return PLAYGROUND_TOOL_LOOP_TOOLS.filter((tool) => supported.includes(tool));
}

function isMutatingTool(name: PlaygroundToolName): boolean {
  return (
    name === "edit" ||
    name === "write_file" ||
    name === "mkdir" ||
    name === "run_command" ||
    name === "desktop_open_app" ||
    name === "desktop_open_url" ||
    name === "desktop_focus_window" ||
    name === "desktop_click" ||
    name === "desktop_type" ||
    name === "desktop_keypress" ||
    name === "desktop_scroll" ||
    name === "desktop_wait"
  );
}

function isObservationTool(name: PlaygroundToolName): boolean {
  return !isMutatingTool(name) && name !== "create_checkpoint";
}

function buildToolCallKey(toolCall: ToolCallContract): string {
  return JSON.stringify({
    name: toolCall.name,
    arguments: toolCall.arguments,
  });
}

function normalizeRelativePath(value: string | undefined | null): string {
  return String(value || "")
    .trim()
    .replace(/\\/g, "/")
    .replace(/^\.\/+/, "")
    .replace(/^\/+/, "");
}

function pendingToolCallSignature(value: PendingToolCallContract | ToolCallContract | null | undefined): string {
  if (!value) return "";
  const toolCall = "toolCall" in value ? value.toolCall : value;
  return JSON.stringify({
    name: toolCall.name,
    arguments: toolCall.arguments,
  });
}

function extractChangedFiles(toolResult: ToolResultContract | null | undefined): string[] {
  const data = toolResult?.data;
  if (!data || typeof data !== "object") return [];
  const record = data as Record<string, unknown>;
  if (!Array.isArray(record.changedFiles)) return [];
  return record.changedFiles
    .filter((value): value is string => typeof value === "string")
    .map((value) => normalizeRelativePath(value))
    .filter(Boolean);
}

function traceHasGrounding(targetPath: string | undefined, toolTrace: ToolTraceEntryContract[]): boolean {
  const normalizedTarget = normalizeRelativePath(targetPath);
  if (!normalizedTarget) return false;
  return toolTrace.some((entry) => {
    if (entry.status !== "completed" || !entry.toolCall) return false;
    if (entry.toolCall.name === "read_file") {
      return normalizeRelativePath(String(entry.toolCall.arguments.path || "")) === normalizedTarget;
    }
    if (entry.toolCall.name === "search_workspace") return true;
    return false;
  });
}

function traceHasMutation(targetPath: string | undefined, toolTrace: ToolTraceEntryContract[]): boolean {
  const normalizedTarget = normalizeRelativePath(targetPath);
  return toolTrace.some((entry) => {
    if (entry.status !== "completed" || !entry.toolCall) return false;
    if (entry.toolCall.name !== "edit" && entry.toolCall.name !== "write_file" && entry.toolCall.name !== "mkdir") {
      return false;
    }
    const toolPath = normalizeRelativePath(String(entry.toolCall.arguments.path || ""));
    const changedFiles = extractChangedFiles(entry.toolResult);
    if (!normalizedTarget) {
      return Boolean(toolPath || changedFiles.length);
    }
    return toolPath === normalizedTarget || changedFiles.includes(normalizedTarget);
  });
}

function classifyToolFailure(
  toolResult: ToolResultContract,
  pendingToolCall: PendingToolCallContract
): "no_content_delta" | "invalid_patch" | "target_missing" | "tool_result_failed" {
  const normalized = `${toolResult.summary || ""} ${toolResult.error || ""}`.toLowerCase();
  if (
    normalized.includes("no content delta") ||
    normalized.includes("no content change") ||
    normalized.includes("no local changes were applied") ||
    normalized.includes("patch produced no content change")
  ) {
    return "no_content_delta";
  }
  if (
    normalized.includes("invalid patch") ||
    normalized.includes("unsupported patch") ||
    normalized.includes("patch failed")
  ) {
    return "invalid_patch";
  }
  if (
    normalized.includes("missing file") ||
    normalized.includes("target file did not exist") ||
    normalized.includes("invalid workspace-relative path")
  ) {
    return "target_missing";
  }
  if (
    pendingToolCall.toolCall.name === "edit" &&
    normalizeRelativePath(String(pendingToolCall.toolCall.arguments.path || "")).endsWith(".pine") &&
    normalized.includes("missing")
  ) {
    return "target_missing";
  }
  return "tool_result_failed";
}

function nextRepairStage(input: {
  targetPath?: string;
  repairHistory: ToolLoopRepairStage[];
  failureCategory?: "no_content_delta" | "invalid_patch" | "target_missing" | "tool_result_failed";
  latestToolResult?: ToolResultContract | null;
  pendingToolCall?: PendingToolCallContract | null;
}): ToolLoopRepairStage | null {
  const normalizedTarget = normalizeRelativePath(input.targetPath);
  const isPine = normalizedTarget.endsWith(".pine");
  if (input.latestToolResult?.ok && input.pendingToolCall?.toolCall.name === "read_file") {
    return input.repairHistory.includes("post_inspection_mutation_required")
      ? null
      : "post_inspection_mutation_required";
  }

  const ordered: ToolLoopRepairStage[] =
    input.failureCategory === "no_content_delta"
      ? [
          "single_file_rewrite",
          ...(isPine ? (["pine_specialization"] as ToolLoopRepairStage[]) : []),
        ]
      : [
          "target_path_repair",
          "patch_repair",
          "single_file_rewrite",
          ...(isPine ? (["pine_specialization"] as ToolLoopRepairStage[]) : []),
        ];

  for (const stage of ordered) {
    if (!input.repairHistory.includes(stage)) return stage;
  }
  return null;
}

function buildRepairGuidance(input: {
  stage: ToolLoopRepairStage;
  targetPath?: string;
  toolResult?: ToolResultContract | null;
  failureCategory?: "no_content_delta" | "invalid_patch" | "target_missing" | "tool_result_failed";
}): { reason: string; nextDeterministicAction: string } {
  const target = normalizeRelativePath(input.targetPath) || "the resolved target file";
  const reason =
    compactReason(input.toolResult?.summary) ||
    compactReason(input.toolResult?.error) ||
    input.failureCategory ||
    "the prior tool turn did not prove the objective";

  if (input.stage === "post_inspection_mutation_required") {
    return {
      reason: `Inspected ${target} but did not produce a concrete mutation or blocker.`,
      nextDeterministicAction: `Choose one concrete mutation tool for ${target}, or return a blocked terminal state.`,
    };
  }
  if (input.stage === "target_path_repair") {
    return {
      reason,
      nextDeterministicAction: `Bind the next mutation exactly to ${target}. Do not invent alternate paths.`,
    };
  }
  if (input.stage === "patch_repair") {
    return {
      reason,
      nextDeterministicAction: `Return one corrected mutation for ${target} with a patch that applies cleanly.`,
    };
  }
  if (input.stage === "single_file_rewrite") {
    return {
      reason,
      nextDeterministicAction: `Return one write_file mutation for ${target} with the full updated contents and a real semantic delta.`,
    };
  }
  return {
    reason,
    nextDeterministicAction: `Return one write_file mutation for ${target} specialized for Pine strategy structure with a real semantic delta.`,
  };
}

function compactReason(value: string | undefined): string {
  return String(value || "").replace(/\s+/g, " ").trim().slice(0, 280);
}

function buildProgressFingerprint(input: {
  pendingSignature?: string;
  loopState: LoopStateContract;
  objectiveState: ObjectiveStateContract;
  missingRequirements: string[];
  latestToolResult?: ToolResultContract | null;
}): string {
  return JSON.stringify({
    pendingSignature: input.pendingSignature || "",
    mutationCount: input.loopState.mutationCount,
    repairCount: input.loopState.repairCount,
    objectiveStatus: input.objectiveState.status,
    observedProof: input.objectiveState.observedProof,
    missingRequirements: [...input.missingRequirements].sort(),
    latestTool: input.latestToolResult
      ? {
          name: input.latestToolResult.name,
          ok: input.latestToolResult.ok,
          blocked: input.latestToolResult.blocked === true,
          changedFiles: extractChangedFiles(input.latestToolResult),
        }
      : null,
  });
}

function buildObservationPrimer(
  targetInference: AssistTargetInference,
  availableTools: PlaygroundToolName[]
): ToolCallContract | null {
  if (targetInference.path && availableTools.includes("read_file")) {
    return {
      id: `call_${Date.now().toString(36)}_read`,
      name: "read_file",
      arguments: { path: targetInference.path },
      kind: "observe",
      summary: `Inspect ${targetInference.path} before mutating it.`,
    };
  }
  if (!availableTools.includes("list_files")) return null;
  return {
    id: `call_${Date.now().toString(36)}_list`,
    name: "list_files",
    arguments: { limit: 40 },
    kind: "observe",
    summary: "List likely workspace files before mutating the project.",
  };
}

function buildCheckpointToolCall(task: string): ToolCallContract {
  return {
    id: `call_${Date.now().toString(36)}_checkpoint`,
    name: "create_checkpoint",
    arguments: {
      reason: `Pre-mutation checkpoint for: ${String(task || "").trim().slice(0, 180)}`,
    },
    kind: "mutate",
    summary: "Create a local checkpoint before the first mutation.",
  };
}

function buildPendingToolCall(
  toolCall: ToolCallContract,
  step: number,
  adapter: PlaygroundAdapter,
  availableTools: PlaygroundToolName[]
): PendingToolCallContract {
  return {
    step,
    adapter,
    requiresClientExecution: true,
    toolCall,
    availableTools,
    createdAt: nowIso(),
  };
}

function buildTraceEntry(input: {
  step: number;
  status: ToolTraceEntryContract["status"];
  adapter: PlaygroundAdapter;
  summary: string;
  toolCall?: ToolCallContract;
  toolResult?: ToolResultContract;
}): ToolTraceEntryContract {
  return {
    step: input.step,
    status: input.status,
    adapter: input.adapter,
    summary: input.summary.slice(0, 20_000),
    toolCall: input.toolCall,
    toolResult: input.toolResult,
    createdAt: nowIso(),
  };
}

function mergeTrace(
  existing: ToolTraceEntryContract[],
  next: ToolTraceEntryContract
): ToolTraceEntryContract[] {
  return [...existing, next].slice(-80);
}

function actionsFromToolTrace(toolTrace: ToolTraceEntryContract[]): ExecuteAction[] {
  const actions: ExecuteAction[] = [];
  for (const entry of toolTrace) {
    if (entry.status !== "completed" || !entry.toolCall) continue;
    const { name, arguments: args } = entry.toolCall;
    if (name === "edit" && typeof args.path === "string" && typeof args.patch === "string") {
      actions.push({ type: "edit", path: args.path, patch: args.patch });
      continue;
    }
    if (name === "write_file" && typeof args.path === "string" && typeof args.content === "string") {
      actions.push({
        type: "write_file",
        path: args.path,
        content: args.content,
        overwrite: typeof args.overwrite === "boolean" ? args.overwrite : true,
      });
      continue;
    }
    if (name === "mkdir" && typeof args.path === "string") {
      actions.push({ type: "mkdir", path: args.path });
      continue;
    }
    if (name === "run_command" && typeof args.command === "string") {
      actions.push({
        type: "command",
        command: args.command,
        timeoutMs: typeof args.timeoutMs === "number" ? args.timeoutMs : undefined,
        category:
          args.category === "implementation" || args.category === "validation"
            ? args.category
            : undefined,
      });
      continue;
    }
    if (name === "desktop_open_app" && typeof args.app === "string") {
      actions.push({
        type: "desktop_open_app",
        app: args.app,
        args: Array.isArray(args.args) ? args.args.filter((item): item is string => typeof item === "string") : undefined,
      });
      continue;
    }
    if (name === "desktop_open_url" && typeof args.url === "string") {
      actions.push({
        type: "desktop_open_url",
        url: args.url,
      });
      continue;
    }
    if (name === "desktop_focus_window") {
      actions.push({
        type: "desktop_focus_window",
        windowId: typeof args.windowId === "string" ? args.windowId : undefined,
        title: typeof args.title === "string" ? args.title : undefined,
        app: typeof args.app === "string" ? args.app : undefined,
      });
      continue;
    }
    if (
      name === "desktop_click" &&
      typeof args.displayId === "string" &&
      typeof args.viewport === "object" &&
      args.viewport
    ) {
      actions.push({
        type: "desktop_click",
        displayId: args.displayId,
        viewport: args.viewport as { displayId: string; width: number; height: number },
        normalizedX: typeof args.normalizedX === "number" ? args.normalizedX : 0,
        normalizedY: typeof args.normalizedY === "number" ? args.normalizedY : 0,
        button:
          args.button === "left" || args.button === "right" || args.button === "middle"
            ? args.button
            : undefined,
        clickCount: typeof args.clickCount === "number" ? args.clickCount : undefined,
      });
      continue;
    }
    if (name === "desktop_type" && typeof args.text === "string") {
      actions.push({
        type: "desktop_type",
        text: args.text,
        delayMs: typeof args.delayMs === "number" ? args.delayMs : undefined,
      });
      continue;
    }
    if (name === "desktop_keypress" && Array.isArray(args.keys)) {
      actions.push({
        type: "desktop_keypress",
        keys: args.keys.filter((item): item is string => typeof item === "string"),
      });
      continue;
    }
    if (name === "desktop_scroll") {
      actions.push({
        type: "desktop_scroll",
        displayId: typeof args.displayId === "string" ? args.displayId : undefined,
        viewport:
          typeof args.viewport === "object" && args.viewport
            ? (args.viewport as { displayId: string; width: number; height: number })
            : undefined,
        normalizedX: typeof args.normalizedX === "number" ? args.normalizedX : undefined,
        normalizedY: typeof args.normalizedY === "number" ? args.normalizedY : undefined,
        deltaX: typeof args.deltaX === "number" ? args.deltaX : undefined,
        deltaY: typeof args.deltaY === "number" ? args.deltaY : undefined,
      });
      continue;
    }
    if (name === "desktop_wait" && typeof args.durationMs === "number") {
      actions.push({
        type: "desktop_wait",
        durationMs: args.durationMs,
      });
    }
  }
  return actions;
}

function traceHasFailure(toolTrace: ToolTraceEntryContract[]): boolean {
  for (let index = toolTrace.length - 1; index >= 0; index -= 1) {
    const entry = toolTrace[index];
    if (entry.status === "failed" || entry.status === "blocked") return true;
  }
  return false;
}

function normalizeWorkspacePath(value: string | undefined): string {
  return String(value || "")
    .trim()
    .replace(/\\/g, "/")
    .replace(/^\.\/+/, "")
    .replace(/^\/+/, "")
    .toLowerCase();
}

function summarizeAction(action: ExecuteAction | undefined): string {
  if (!action) return "Choose the next concrete tool action.";
  if ("path" in action && action.path) {
    return `${action.type} ${action.path}`;
  }
  if (action.type === "command") {
    return `run ${action.command}`;
  }
  return `continue with ${action.type}`;
}

function completedEntries(toolTrace: ToolTraceEntryContract[]): ToolTraceEntryContract[] {
  return toolTrace.filter((entry) => entry.status === "completed");
}

function getLatestMeaningfulEntry(toolTrace: ToolTraceEntryContract[]): ToolTraceEntryContract | null {
  for (let index = toolTrace.length - 1; index >= 0; index -= 1) {
    const entry = toolTrace[index];
    if (entry.status === "completed" || entry.status === "failed" || entry.status === "blocked") {
      return entry;
    }
  }
  return null;
}

function didInspectTarget(toolTrace: ToolTraceEntryContract[], targetPath: string | undefined): boolean {
  const normalizedTarget = normalizeWorkspacePath(targetPath);
  if (!normalizedTarget) return false;
  return toolTrace.some((entry) => {
    if (entry.status !== "completed" || entry.toolCall?.name !== "read_file") return false;
    const pathValue =
      typeof entry.toolCall.arguments?.path === "string"
        ? String(entry.toolCall.arguments.path)
        : typeof entry.toolResult?.data?.path === "string"
          ? String(entry.toolResult.data.path)
          : "";
    return normalizeWorkspacePath(pathValue) === normalizedTarget;
  });
}

function didMutateTarget(
  toolTrace: ToolTraceEntryContract[],
  targetPath: string | undefined,
  deterministicActions: ExecuteAction[]
): boolean {
  const normalizedTarget = normalizeWorkspacePath(targetPath);
  const actionTargets = deterministicActions
    .filter(
      (action): action is Extract<ExecuteAction, { type: "edit" | "write_file" | "mkdir" }> =>
        action.type === "edit" || action.type === "write_file" || action.type === "mkdir"
    )
    .map((action) => normalizeWorkspacePath(action.path));
  if (normalizedTarget && actionTargets.includes(normalizedTarget)) return true;

  return toolTrace.some((entry) => {
    if (entry.status !== "completed" || !entry.toolCall) return false;
    if (
      entry.toolCall.name !== "edit" &&
      entry.toolCall.name !== "write_file" &&
      entry.toolCall.name !== "mkdir"
    ) {
      return false;
    }
    const directPath =
      typeof entry.toolCall.arguments?.path === "string"
        ? normalizeWorkspacePath(String(entry.toolCall.arguments.path))
        : "";
    if (normalizedTarget && directPath === normalizedTarget) return true;
    const changedFiles = Array.isArray(entry.toolResult?.data?.changedFiles)
      ? (entry.toolResult?.data?.changedFiles as unknown[])
      : [];
    return normalizedTarget
      ? changedFiles.some((item) => normalizeWorkspacePath(String(item || "")) === normalizedTarget)
      : Boolean(directPath || changedFiles.length);
  });
}

function buildToolLoopObjectiveState(input: {
  request: AssistRuntimeInput;
  targetInference: AssistTargetInference;
  contextSelection: AssistContextSelection;
  fallbackPlan: AssistPlan;
  toolTrace: ToolTraceEntryContract[];
  actions: ExecuteAction[];
  missingRequirements: string[];
  loopState: LoopStateContract;
  final: string;
}): ObjectiveStateContract {
  const intent = inferIntent({
    mode: input.request.mode,
    task: input.request.task,
    targetInference: input.targetInference,
  });
  const observedProof: string[] = [];
  if (input.targetInference.path) observedProof.push("target_resolved");
  if (
    didInspectTarget(input.toolTrace, input.targetInference.path) ||
    (input.targetInference.path &&
      input.contextSelection.files.some(
        (file) => normalizeWorkspacePath(file.path) === normalizeWorkspacePath(input.targetInference.path)
      ))
  ) {
    observedProof.push("target_grounded");
  }
  if (didMutateTarget(input.toolTrace, input.targetInference.path, input.actions)) {
    observedProof.push("workspace_change_prepared");
  }
  if (completedEntries(input.toolTrace).some((entry) => entry.toolCall?.name === "run_command")) {
    observedProof.push("command_prepared");
  }
  return buildObjectiveState({
    request: input.request,
    intent,
    targetInference: input.targetInference,
    contextSelection: input.contextSelection,
    actions: input.actions,
    missingRequirements: input.missingRequirements,
    plan: input.request.mode === "plan" ? input.fallbackPlan : null,
    final: input.final,
    observedProof,
    blocked:
      input.loopState.status === "failed" ||
      (input.missingRequirements.length > 0 && input.loopState.status === "completed"),
  });
}

function buildToolLoopProgressState(input: {
  request: AssistRuntimeInput;
  loopState: LoopStateContract;
  objectiveState: ObjectiveStateContract;
  pendingToolCall: PendingToolCallContract | null;
  toolTrace: ToolTraceEntryContract[];
  previousProgressState?: ProgressStateContract | null;
  previousFingerprint?: string | null;
  missingRequirements: string[];
  final: string;
}): { progressState: ProgressStateContract; fingerprint: string } {
  const pendingToolCallSignature = input.pendingToolCall
    ? buildToolCallKey(input.pendingToolCall.toolCall)
    : undefined;
  const fingerprint = buildProgressFingerprint({
    pendingSignature: pendingToolCallSignature,
    loopState: input.loopState,
    objectiveState: input.objectiveState,
    missingRequirements: input.missingRequirements,
    latestToolResult: null,
  });
  const latestMeaningful = getLatestMeaningfulEntry(input.toolTrace);
  const lastMeaningfulProgressAtStep =
    fingerprint === input.previousFingerprint && input.previousProgressState
      ? input.previousProgressState.lastMeaningfulProgressAtStep
      : latestMeaningful?.step ?? input.loopState.stepCount;
  const lastMeaningfulProgressSummary =
    fingerprint === input.previousFingerprint && input.previousProgressState
      ? input.previousProgressState.lastMeaningfulProgressSummary
      : latestMeaningful?.summary ||
        (input.objectiveState.status === "satisfied"
          ? "Objective satisfied."
          : input.pendingToolCall
            ? `Step ${input.pendingToolCall.step}: ${input.pendingToolCall.toolCall.name}`
            : input.final || "Run initialized.");
  const stallReason =
    input.missingRequirements.find((item) =>
      /no_usable_next_action|tool_repeat_guard_triggered|mutation_required_after_target_inspection|tool_result_failed/.test(
        item
      )
    ) ||
    (input.loopState.repeatedCallCount > 1 && pendingToolCallSignature === input.previousProgressState?.pendingToolCallSignature
      ? "The orchestrator repeated the same next tool without proving progress."
      : undefined);
  const repairing = input.loopState.repairCount > 0 && input.objectiveState.status !== "satisfied" && Boolean(input.pendingToolCall);
  const stallCount =
    stallReason
      ? Math.max(
          input.previousProgressState?.stallCount || 0,
          input.loopState.repeatedCallCount > 1 ? input.loopState.repeatedCallCount - 1 : 1
        )
      : 0;
  const nextDeterministicAction =
    input.pendingToolCall?.toolCall.summary ||
    summarizeAction(
      input.pendingToolCall
        ? undefined
        : (actionsFromToolTrace(input.toolTrace).slice(-1)[0] as ExecuteAction | undefined)
    );

  return {
    progressState: buildProgressState({
      completionStatus:
        input.objectiveState.status === "satisfied" && input.missingRequirements.length === 0
          ? "complete"
          : "incomplete",
      objectiveState: input.objectiveState,
      loopState: input.loopState,
      lastMeaningfulProgressAtStep,
      lastMeaningfulProgressSummary,
      stallCount,
      stallReason,
      nextDeterministicAction,
      pendingToolCallSignature,
      failed: input.loopState.status === "failed",
      repairing,
    }),
    fingerprint,
  };
}

function hydratePersistedState(record: AgentRunRecord): PersistedToolLoopState | null {
  const output = asRecord(record.output);
  const loopState = output.loopState as LoopStateContract | undefined;
  const pendingToolCall = output.pendingToolCall as PendingToolCallContract | null | undefined;
  const toolTrace = (Array.isArray(output.toolTrace) ? output.toolTrace : []) as ToolTraceEntryContract[];
  const targetInference = output.targetInference as AssistTargetInference | undefined;
  const contextSelection = output.contextSelection as AssistContextSelection | undefined;
  const fallbackPlan = output.fallbackPlan as AssistPlan | undefined;
  const availableTools = (Array.isArray(output.availableTools) ? output.availableTools : []) as PlaygroundToolName[];
  const adapter = (output.adapter as PlaygroundAdapter | undefined) || "text_actions";
  const orchestrator =
    output.orchestrator === "openhands" || output.orchestrator === "in_house"
      ? output.orchestrator
      : "openhands";
  const progressState = output.progressState as ProgressStateContract | undefined;
  const objectiveState = output.objectiveState as ObjectiveStateContract | undefined;
  if (!loopState || !targetInference || !contextSelection || !fallbackPlan) return null;
  return {
    protocol: "tool_loop_v1",
    adapter,
    orchestrator,
    orchestratorVersion: typeof output.orchestratorVersion === "string" ? output.orchestratorVersion : null,
    orchestratorRunId: typeof output.orchestratorRunId === "string" ? output.orchestratorRunId : null,
    loopState,
    pendingToolCall: pendingToolCall ?? null,
    toolTrace,
    targetInference,
    contextSelection,
    fallbackPlan,
    checkpointCreated: output.checkpointCreated === true,
    deferredToolCall: (output.deferredToolCall as ToolCallContract | null | undefined) ?? null,
    availableTools: availableTools.length > 0 ? availableTools : PLAYGROUND_TOOL_LOOP_TOOLS,
    progressState:
      progressState ||
      buildProgressState({
        completionStatus: "incomplete",
        objectiveState:
          objectiveState || {
            status: "in_progress",
            goalType: "unknown",
            requiredProof: [],
            observedProof: [],
            missingProof: [],
          },
      }),
    objectiveState:
      objectiveState || {
        status: "in_progress",
        goalType: "unknown",
        requiredProof: [],
        observedProof: [],
        missingProof: [],
      },
    lastProgressFingerprint: typeof output.lastProgressFingerprint === "string" ? output.lastProgressFingerprint : null,
    repairHistory: (Array.isArray(output.repairHistory) ? output.repairHistory : []) as ToolLoopRepairStage[],
  };
}

function buildPersistedOutput(input: {
  state: PersistedToolLoopState;
  result: AssistResult;
}): Record<string, unknown> {
  return {
    protocol: input.state.protocol,
    adapter: input.state.adapter,
    orchestrator: input.state.orchestrator,
    orchestratorVersion: input.state.orchestratorVersion ?? null,
    orchestratorRunId: input.state.orchestratorRunId ?? null,
    loopState: input.state.loopState,
    pendingToolCall: input.state.pendingToolCall,
    toolTrace: input.state.toolTrace,
    targetInference: input.state.targetInference,
    contextSelection: input.state.contextSelection,
    fallbackPlan: input.state.fallbackPlan,
    checkpointCreated: input.state.checkpointCreated,
    deferredToolCall: input.state.deferredToolCall ?? null,
    availableTools: input.state.availableTools,
    progressState: input.result.progressState,
    objectiveState: input.result.objectiveState,
    lastProgressFingerprint: input.state.lastProgressFingerprint ?? null,
    repairHistory: input.state.repairHistory,
    decision: input.result.decision,
    validationPlan: input.result.validationPlan,
    completionStatus: input.result.completionStatus,
    missingRequirements: input.result.missingRequirements,
    final: input.result.final,
    actions: input.result.actions,
    receipt: input.result.receipt,
    checkpoint: input.result.checkpoint,
    reviewState: input.result.reviewState,
    contextTrace: input.result.contextTrace,
    delegateRuns: input.result.delegateRuns,
    memoryWrites: input.result.memoryWrites,
    toolState: input.result.toolState,
  };
}

async function appendToolEvent(input: {
  userId: string;
  sessionId: string;
  kind: "tool_call" | "tool_result";
  content: string;
  payload: Record<string, unknown>;
}) {
  await appendSessionMessage({
    userId: input.userId,
    sessionId: input.sessionId,
    role: "agent",
    kind: input.kind,
    content: input.content,
    payload: input.payload,
  }).catch(() => null);
}

function buildToolLoopResult(input: {
  request: AssistRuntimeInput;
  runId: string;
  traceId: string;
  adapter: PlaygroundAdapter;
  orchestrator: "in_house" | "openhands";
  orchestratorVersion?: string | null;
  targetInference: AssistTargetInference;
  contextSelection: AssistContextSelection;
  fallbackPlan: AssistPlan;
  loopState: LoopStateContract;
  pendingToolCall: PendingToolCallContract | null;
  toolTrace: ToolTraceEntryContract[];
  logs: string[];
  final: string;
  actions: ExecuteAction[];
  missingRequirements?: string[];
  previousProgressState?: ProgressStateContract | null;
  previousFingerprint?: string | null;
}): AssistResult {
  const missingRequirements = input.missingRequirements || [];
  const objectiveState = buildToolLoopObjectiveState({
    request: input.request,
    targetInference: input.targetInference,
    contextSelection: input.contextSelection,
    fallbackPlan: input.fallbackPlan,
    toolTrace: input.toolTrace,
    actions: input.actions,
    missingRequirements,
    loopState: input.loopState,
    final: input.final,
  });
  const { progressState } = buildToolLoopProgressState({
    request: input.request,
    loopState: input.loopState,
    objectiveState,
    pendingToolCall: input.pendingToolCall,
    toolTrace: input.toolTrace,
    previousProgressState: input.previousProgressState,
    previousFingerprint: input.previousFingerprint,
    missingRequirements,
    final: input.final,
  });
  const base = buildDecoratedAssistResult({
    request: {
      ...input.request,
      orchestrationProtocol: "tool_loop_v1",
    },
    decision: buildDecision(input.request.mode, input.request.task),
    plan: input.request.mode === "plan" ? input.fallbackPlan : null,
    actions: input.actions,
    final: input.final,
    validationPlan: buildValidationPlan({ actions: input.actions }),
    targetInference: input.targetInference,
    contextSelection: input.contextSelection,
    missingRequirements,
    logs: [...input.logs, `adapter=${input.adapter}`, `tool_trace=${input.toolTrace.length}`],
    objectiveState,
    progressState,
  });

  const artifacts = attachAssistArtifactIdentifiers(
    {
      lane: base.lane,
      taskGraph: base.taskGraph,
      checkpoint: base.checkpoint,
      receipt: base.receipt,
      contextTrace: base.contextTrace,
      delegateRuns: base.delegateRuns,
      memoryWrites: base.memoryWrites,
      reviewState: base.reviewState,
    },
    { runId: input.runId, traceId: input.traceId }
  );

  return {
    ...base,
    checkpoint: artifacts.checkpoint,
    receipt: artifacts.receipt,
    contextTrace: artifacts.contextTrace,
    delegateRuns: artifacts.delegateRuns,
    memoryWrites: artifacts.memoryWrites,
    reviewState: artifacts.reviewState,
    orchestrationProtocol: "tool_loop_v1",
    orchestrator: input.orchestrator,
    orchestratorVersion: input.orchestratorVersion ?? null,
    runId: input.runId,
    adapter: input.adapter,
    loopState: input.loopState,
    pendingToolCall: input.pendingToolCall,
    toolTrace: input.toolTrace,
    toolState: {
      ...base.toolState,
      strategy: "max_agentic",
      route: input.adapter === "deterministic_batch" ? "deterministic_synthesis" : input.adapter,
      adapter: input.orchestrator === "openhands" ? `openhands_${input.adapter}_v1` : `${input.adapter}_v1`,
      actionSource: input.adapter === "deterministic_batch" ? "deterministic_synthesis" : "structured_json",
      recoveryStage: input.loopState.repairCount > 0 ? "repair" : "none",
      lastFailureCategory: traceHasFailure(input.toolTrace) ? "local_apply_failed" : null,
    },
  };
}

function enforceLoopSafeguards(input: {
  candidate: ToolCallContract;
  state: PersistedToolLoopState;
  request: AssistRuntimeInput;
}): {
  candidate?: ToolCallContract;
  state?: PersistedToolLoopState;
  final?: string;
  missingRequirements?: string[];
} {
  const nextStep = input.state.loopState.stepCount + 1;
  if (nextStep > input.state.loopState.maxSteps) {
    return {
      final: "The tool loop hit its step budget before the task completed.",
      missingRequirements: ["tool_step_budget_exceeded"],
    };
  }

  let candidate = input.candidate;
  let deferredToolCall = input.state.deferredToolCall ?? null;
  let checkpointCreated = input.state.checkpointCreated;
  let loopState = { ...input.state.loopState };

  if (loopState.stepCount === 0 && !isObservationTool(candidate.name)) {
    const observationPrimer = buildObservationPrimer(input.state.targetInference, input.state.availableTools);
    if (observationPrimer) {
      candidate = observationPrimer;
      deferredToolCall = null;
    }
  }

  if (isMutatingTool(candidate.name) && !checkpointCreated && input.state.availableTools.includes("create_checkpoint")) {
    deferredToolCall = candidate;
    candidate = buildCheckpointToolCall(input.request.task);
  }

  const nextMutationCount = loopState.mutationCount + (isMutatingTool(candidate.name) ? 1 : 0);
  if (nextMutationCount > loopState.maxMutations) {
    return {
      final: "The tool loop hit its mutation budget before the task completed.",
      missingRequirements: ["tool_mutation_budget_exceeded"],
    };
  }

  const key = buildToolCallKey(candidate);
  const repeatedCallCount = loopState.lastToolCallKey === key ? loopState.repeatedCallCount + 1 : 1;
  if (repeatedCallCount > MAX_IDENTICAL_CALLS && input.state.repairHistory.length === 0) {
    return {
      final: "The tool loop stopped after repeating the same tool call too many times.",
      missingRequirements: ["tool_repeat_guard_triggered"],
    };
  }

  loopState = {
    ...loopState,
    status: "pending_tool",
    stepCount: nextStep,
    mutationCount: nextMutationCount,
    repeatedCallCount,
    lastToolCallKey: key,
  };

  return {
    candidate,
    state: {
      ...input.state,
      loopState,
      checkpointCreated,
      deferredToolCall,
    },
  };
}

async function persistAndReturn(input: {
  record: AgentRunRecord;
  state: PersistedToolLoopState;
  result: AssistResult;
  status: AgentRunRecord["status"];
  errorMessage?: string | null;
}) {
  const payload = {
    userId: input.record.userId,
    runId: input.record.id,
    status: input.status,
    output: buildPersistedOutput({
      state: input.state,
      result: input.result,
    }),
    errorMessage: input.errorMessage,
    confidence: input.result.confidence,
    riskLevel: input.result.risk.blastRadius,
  };
  let persisted: Awaited<ReturnType<typeof updateAgentRun>> = null;
  for (let attempt = 0; attempt < 3; attempt++) {
    persisted = await updateAgentRun(payload).catch(() => null);
    if (persisted) break;
    await new Promise((r) => setTimeout(r, 90 * (attempt + 1)));
  }
  if (!persisted) {
    console.error("[playground/tool-loop] updateAgentRun failed after retries", {
      runId: input.record.id,
      userId: input.record.userId,
    });
  }

  if (input.result.pendingToolCall) {
    await appendToolEvent({
      userId: input.record.userId,
      sessionId: input.record.sessionId,
      kind: "tool_call",
      content: `Step ${input.result.pendingToolCall.step}: ${input.result.pendingToolCall.toolCall.name}`,
      payload: {
        pendingToolCall: input.result.pendingToolCall,
        adapter: input.result.adapter,
      },
    });
  } else {
    await appendSessionMessage({
      userId: input.record.userId,
      sessionId: input.record.sessionId,
      role: "assistant",
      kind: "message",
      content: input.result.final,
      payload: input.result,
    }).catch(() => null);
  }

  return input.result;
}

async function advanceWithCandidate(input: {
  record: AgentRunRecord;
  request: AssistRuntimeInput;
  state: PersistedToolLoopState;
  traceId: string;
  candidate?: ToolCallContract;
  adapter: PlaygroundAdapter;
  orchestrator?: "in_house" | "openhands";
  orchestratorVersion?: string | null;
  orchestratorRunId?: string | null;
  final?: string;
  actions?: ExecuteAction[];
  logs: string[];
}): Promise<AssistResult> {
  let candidate = input.candidate;
  let orchestratorFinal = input.final;
  let logs = input.logs;

  // OpenHands (and other adapters) sometimes return {"final":"..."} on step 0 instead of a tool call.
  // Without a pending tool the IDE never executes tools. Force an observation step for agentic intents.
  if (
    !isOpenHandsPrimaryOrchestration() &&
    !candidate &&
    input.state.loopState.stepCount === 0 &&
    input.state.toolTrace.length === 0 &&
    !(input.actions && input.actions.length > 0)
  ) {
    const intent = inferIntent({
      mode: input.request.mode,
      task: input.request.task,
      targetInference: input.state.targetInference,
    });
    const intentFromTaskWording = inferIntent({
      mode: input.request.mode,
      task: input.request.task,
      targetInference: { ...input.state.targetInference, path: undefined, source: "unknown", confidence: 0.1 },
    });
    const shouldInjectObservation =
      (intent.type === "code_edit" || intent.type === "command_run") &&
      (intentFromTaskWording.type === "code_edit" || intentFromTaskWording.type === "command_run");
    if (shouldInjectObservation) {
      const primer = buildObservationPrimer(input.state.targetInference, input.state.availableTools);
      if (primer) {
        candidate = primer;
        orchestratorFinal = undefined;
        logs = [
          ...logs,
          "tool_loop: observation primer injected (orchestrator returned final without tool at step 0)",
        ];
      }
    }
  }

  if (!candidate) {
    const finalActions = input.actions || actionsFromToolTrace(input.state.toolTrace);
    const finalIntent = inferIntent({
      mode: input.request.mode,
      task: input.request.task,
      targetInference: input.state.targetInference,
    });
    const terminalMissingRequirements =
      !isOpenHandsPrimaryOrchestration() &&
      finalIntent.type === "code_edit" &&
      finalActions.length === 0
        ? ["no_usable_next_action", "mutation_required_for_code_edit"]
        : [];
    const finalResult = buildToolLoopResult({
      request: input.request,
      runId: input.record.id,
      traceId: input.traceId,
      adapter: input.adapter,
      orchestrator: input.orchestrator || input.state.orchestrator,
      orchestratorVersion: input.orchestratorVersion ?? input.state.orchestratorVersion ?? null,
      targetInference: input.state.targetInference,
      contextSelection: input.state.contextSelection,
      fallbackPlan: input.state.fallbackPlan,
      loopState: {
        ...input.state.loopState,
        status: terminalMissingRequirements.length > 0 ? "failed" : "completed",
      },
      pendingToolCall: null,
      toolTrace: input.state.toolTrace,
      logs,
      final: input.final || "The tool loop completed.",
      actions: finalActions,
      missingRequirements: terminalMissingRequirements,
      previousProgressState: input.state.progressState,
      previousFingerprint: input.state.lastProgressFingerprint,
    });
    const nextFingerprint = buildProgressFingerprint({
      pendingSignature: "",
      loopState: finalResult.loopState || input.state.loopState,
      objectiveState: finalResult.objectiveState,
      missingRequirements: finalResult.missingRequirements,
    });
    return persistAndReturn({
      record: input.record,
      state: {
        ...input.state,
        adapter: input.adapter,
        orchestrator: input.orchestrator || input.state.orchestrator,
        orchestratorVersion: input.orchestratorVersion ?? input.state.orchestratorVersion ?? null,
        orchestratorRunId: input.orchestratorRunId ?? input.state.orchestratorRunId ?? null,
        loopState: finalResult.loopState || input.state.loopState,
        pendingToolCall: null,
        progressState: finalResult.progressState,
        objectiveState: finalResult.objectiveState,
        lastProgressFingerprint: nextFingerprint,
      },
      result: finalResult,
      status: finalResult.completionStatus === "complete" ? "completed" : "failed",
      errorMessage: finalResult.completionStatus === "complete" ? null : finalResult.final,
    });
  }

  const safeguarded = enforceLoopSafeguards({
    candidate,
    state: input.state,
    request: input.request,
  });
  if (!safeguarded.candidate || !safeguarded.state) {
    const failedResult = buildToolLoopResult({
      request: input.request,
      runId: input.record.id,
      traceId: input.traceId,
      adapter: input.adapter,
      orchestrator: input.orchestrator || input.state.orchestrator,
      orchestratorVersion: input.orchestratorVersion ?? input.state.orchestratorVersion ?? null,
      targetInference: input.state.targetInference,
      contextSelection: input.state.contextSelection,
      fallbackPlan: input.state.fallbackPlan,
      loopState: {
        ...input.state.loopState,
        status: "failed",
      },
      pendingToolCall: null,
      toolTrace: input.state.toolTrace,
      logs,
      final: safeguarded.final || "The tool loop stopped before it could issue the next tool call.",
      actions: actionsFromToolTrace(input.state.toolTrace),
      missingRequirements: safeguarded.missingRequirements || ["tool_loop_failed"],
      previousProgressState: input.state.progressState,
      previousFingerprint: input.state.lastProgressFingerprint,
    });
    const nextFingerprint = buildProgressFingerprint({
      pendingSignature: "",
      loopState: failedResult.loopState || input.state.loopState,
      objectiveState: failedResult.objectiveState,
      missingRequirements: failedResult.missingRequirements,
    });
    return persistAndReturn({
      record: input.record,
      state: {
        ...input.state,
        adapter: input.adapter,
        orchestrator: input.orchestrator || input.state.orchestrator,
        orchestratorVersion: input.orchestratorVersion ?? input.state.orchestratorVersion ?? null,
        orchestratorRunId: input.orchestratorRunId ?? input.state.orchestratorRunId ?? null,
        loopState: failedResult.loopState || input.state.loopState,
        pendingToolCall: null,
        progressState: failedResult.progressState,
        objectiveState: failedResult.objectiveState,
        lastProgressFingerprint: nextFingerprint,
      },
      result: failedResult,
      status: "failed",
      errorMessage: failedResult.final,
    });
  }

  const pendingToolCall = buildPendingToolCall(
    safeguarded.candidate,
    safeguarded.state.loopState.stepCount,
    input.adapter,
    safeguarded.state.availableTools
  );
  const pendingTrace = mergeTrace(
    safeguarded.state.toolTrace,
    buildTraceEntry({
      step: pendingToolCall.step,
      status: "pending",
      adapter: input.adapter,
      summary: pendingToolCall.toolCall.summary || `Prepared ${pendingToolCall.toolCall.name}.`,
      toolCall: pendingToolCall.toolCall,
    })
  );

  const pendingResult = buildToolLoopResult({
    request: input.request,
    runId: input.record.id,
    traceId: input.traceId,
    adapter: input.adapter,
    orchestrator: input.orchestrator || safeguarded.state.orchestrator,
    orchestratorVersion: input.orchestratorVersion ?? safeguarded.state.orchestratorVersion ?? null,
    targetInference: safeguarded.state.targetInference,
    contextSelection: safeguarded.state.contextSelection,
    fallbackPlan: safeguarded.state.fallbackPlan,
    loopState: safeguarded.state.loopState,
    pendingToolCall,
    toolTrace: pendingTrace,
    logs,
    final:
      orchestratorFinal ||
      `Step ${pendingToolCall.step} ready: ${pendingToolCall.toolCall.name}${typeof pendingToolCall.toolCall.arguments.path === "string" ? ` ${pendingToolCall.toolCall.arguments.path}` : ""}.`,
    actions: actionsFromToolTrace(pendingTrace),
    previousProgressState: safeguarded.state.progressState,
    previousFingerprint: safeguarded.state.lastProgressFingerprint,
  });
  const nextFingerprint = buildProgressFingerprint({
    pendingSignature: pendingToolCallSignature(pendingToolCall),
    loopState: pendingResult.loopState || safeguarded.state.loopState,
    objectiveState: pendingResult.objectiveState,
    missingRequirements: pendingResult.missingRequirements,
  });

  return persistAndReturn({
    record: input.record,
    state: {
      ...safeguarded.state,
      adapter: input.adapter,
      orchestrator: input.orchestrator || safeguarded.state.orchestrator,
      orchestratorVersion: input.orchestratorVersion ?? safeguarded.state.orchestratorVersion ?? null,
      orchestratorRunId: input.orchestratorRunId ?? safeguarded.state.orchestratorRunId ?? null,
      pendingToolCall,
      toolTrace: pendingTrace,
      progressState: pendingResult.progressState,
      objectiveState: pendingResult.objectiveState,
      lastProgressFingerprint: nextFingerprint,
    },
    result: pendingResult,
    status: "running",
    errorMessage: null,
  });
}

export async function startAssistToolLoop(input: StartToolLoopInput): Promise<AssistResult> {
  const targetInference = buildTargetInference({
    task: input.request.task,
    context: input.request.context,
    retrievalHints: input.request.retrievalHints,
  });
  const contextSelection = buildContextSelection({
    context: input.request.context,
    targetInference,
    retrievalHints: input.request.retrievalHints,
  });
  const fallbackPlan = buildPlan({
    task: input.request.task,
    targetInference,
    contextSelection,
  });
  const initialLoopState = buildInitialLoopState();
  const initialObjectiveState = buildToolLoopObjectiveState({
    request: {
      ...input.request,
      orchestrationProtocol: "tool_loop_v1",
    },
    targetInference,
    contextSelection,
    fallbackPlan,
    toolTrace: [],
    actions: [],
    missingRequirements: [],
    loopState: initialLoopState,
    final: "",
  });
  const { progressState: initialProgressState, fingerprint: initialFingerprint } = buildToolLoopProgressState({
    request: {
      ...input.request,
      orchestrationProtocol: "tool_loop_v1",
    },
    loopState: initialLoopState,
    objectiveState: initialObjectiveState,
    pendingToolCall: null,
    toolTrace: [],
    missingRequirements: [],
    final: "",
  });
  const { adapter } = selectToolLoopAdapter(input.request.model);
  const initialState: PersistedToolLoopState = {
    protocol: "tool_loop_v1",
    adapter,
    orchestrator: "openhands",
    orchestratorVersion: null,
    orchestratorRunId: null,
    loopState: initialLoopState,
    pendingToolCall: null,
    toolTrace: [],
    targetInference,
    contextSelection,
    fallbackPlan,
    checkpointCreated: false,
    deferredToolCall: null,
    availableTools: buildAvailableTools(input.request),
    progressState: initialProgressState,
    objectiveState: initialObjectiveState,
    lastProgressFingerprint: initialFingerprint,
    repairHistory: [],
  };

  const risk = inferRisk(input.request.mode, input.request.task, []);
  const record = await createAgentRun({
    userId: input.userId,
    sessionId: input.sessionId,
    role: "single",
    status: "running",
    input: {
      ...input.request,
      orchestrationProtocol: "tool_loop_v1",
    } as Record<string, unknown>,
    confidence: buildDecision(input.request.mode, input.request.task).confidence,
    riskLevel: risk.blastRadius,
  });

  const turn = await requestToolLoopTurn({
    request: {
      ...input.request,
      orchestrationProtocol: "tool_loop_v1",
    },
    targetInference,
    contextSelection,
    fallbackPlan,
    toolTrace: [],
    loopSummary: {
      stepCount: 0,
      mutationCount: 0,
      repairCount: 0,
    },
    availableTools: initialState.availableTools,
  });

  return advanceWithCandidate({
    record,
    request: {
      ...input.request,
      orchestrationProtocol: "tool_loop_v1",
    },
    state: {
      ...initialState,
      adapter: turn.adapter,
    },
    traceId: input.traceId,
    candidate: turn.toolCall,
    adapter: turn.adapter,
    orchestrator: turn.orchestrator,
    orchestratorVersion: turn.orchestratorVersion ?? null,
    orchestratorRunId: turn.orchestratorRunId ?? null,
    final: turn.final,
    actions: turn.actions as ExecuteAction[] | undefined,
    logs: turn.logs,
  });
}

export async function continueAssistToolLoop(input: ContinueToolLoopInput): Promise<AssistResult> {
  const record = await getAgentRunById({
    userId: input.userId,
    runId: input.runId,
  });
  if (!record) {
    throw new Error("Unknown runId.");
  }

  const persisted = hydratePersistedState(record);
  if (!persisted) {
    throw new Error("Run does not contain tool-loop state.");
  }
  if (persisted.orchestrator !== "openhands") {
    throw new Error("This run was created before OpenHands was required. Start a new chat to continue with hosted orchestration.");
  }

  const request = asRecord(record.input) as AssistRuntimeInput;
  const pendingToolCall = persisted.pendingToolCall;
  if (!pendingToolCall) {
    throw new Error("Run does not have a pending tool call.");
  }

  const toolResultEntry = buildTraceEntry({
    step: pendingToolCall.step,
    status: input.toolResult.ok ? "completed" : input.toolResult.blocked ? "blocked" : "failed",
    adapter: persisted.adapter,
    summary: input.toolResult.summary,
    toolCall: pendingToolCall.toolCall,
    toolResult: input.toolResult,
  });
  const toolTrace = mergeTrace(persisted.toolTrace, toolResultEntry);
  await appendToolEvent({
    userId: input.userId,
    sessionId: record.sessionId,
    kind: "tool_result",
    content: `Step ${pendingToolCall.step}: ${input.toolResult.name} ${input.toolResult.ok ? "completed" : "failed"}`,
    payload: {
      toolResult: input.toolResult,
      adapter: persisted.adapter,
    },
  });

  let nextState: PersistedToolLoopState = {
    ...persisted,
    pendingToolCall: null,
    toolTrace,
    checkpointCreated:
      persisted.checkpointCreated ||
      (input.toolResult.name === "create_checkpoint" && input.toolResult.ok),
  };
  let repairDirective: ToolLoopTurnInput["repairDirective"] = null;
  const buildBlockedResult = (params: {
    final: string;
    missingRequirements: string[];
    logs: string[];
    stallReason?: string;
    nextDeterministicAction?: string;
  }) =>
    buildToolLoopResult({
      request,
      runId: record.id,
      traceId: input.traceId,
      adapter: persisted.adapter,
      orchestrator: nextState.orchestrator,
      orchestratorVersion: nextState.orchestratorVersion ?? null,
      targetInference: persisted.targetInference,
      contextSelection: persisted.contextSelection,
      fallbackPlan: persisted.fallbackPlan,
      loopState: {
        ...nextState.loopState,
        status: "failed",
      },
      pendingToolCall: null,
      toolTrace,
      logs: params.logs,
      final:
        params.stallReason || params.nextDeterministicAction
          ? [
              params.final,
              params.stallReason ? `Stall reason: ${params.stallReason}` : "",
              params.nextDeterministicAction ? `Next deterministic action: ${params.nextDeterministicAction}` : "",
            ]
              .filter(Boolean)
              .join("\n\n")
          : params.final,
      actions: actionsFromToolTrace(toolTrace),
      missingRequirements: params.missingRequirements,
      previousProgressState: {
        ...nextState.progressState,
        stallCount: nextState.progressState.stallCount + 1,
        ...(params.stallReason ? { stallReason: params.stallReason } : {}),
        ...(params.nextDeterministicAction
          ? { nextDeterministicAction: params.nextDeterministicAction }
          : {}),
      },
      previousFingerprint: nextState.lastProgressFingerprint,
    });

  if (!input.toolResult.ok || input.toolResult.blocked) {
    if (isOpenHandsPrimaryOrchestration()) {
      nextState = {
        ...nextState,
        loopState: {
          ...nextState.loopState,
          status: "running",
        },
      };
      repairDirective = null;
    } else {
      const failureCategory = classifyToolFailure(input.toolResult, pendingToolCall);
      const repairStage = nextRepairStage({
        targetPath: nextState.targetInference.path,
        repairHistory: nextState.repairHistory,
        failureCategory,
        latestToolResult: input.toolResult,
        pendingToolCall,
      });
      if (nextState.loopState.repairCount >= MAX_REPAIR_ROUNDS || !repairStage) {
        const failedResult = buildBlockedResult({
          final: input.toolResult.summary,
          missingRequirements: ["tool_result_failed", failureCategory],
          logs: ["repair_limit_exceeded", `failure_category=${failureCategory}`],
          stallReason: input.toolResult.summary,
          nextDeterministicAction: "Return a blocked terminal result with exact missing proof.",
        });
        const nextFingerprint = buildProgressFingerprint({
          pendingSignature: "",
          loopState: failedResult.loopState || nextState.loopState,
          objectiveState: failedResult.objectiveState,
          missingRequirements: failedResult.missingRequirements,
          latestToolResult: input.toolResult,
        });
        return persistAndReturn({
          record,
          state: {
            ...nextState,
            loopState: failedResult.loopState || nextState.loopState,
            progressState: failedResult.progressState,
            objectiveState: failedResult.objectiveState,
            lastProgressFingerprint: nextFingerprint,
          },
          result: failedResult,
          status: "failed",
          errorMessage: input.toolResult.summary,
        });
      }
      const guidance = buildRepairGuidance({
        stage: repairStage,
        targetPath: nextState.targetInference.path,
        toolResult: input.toolResult,
        failureCategory,
      });
      repairDirective = {
        stage: repairStage,
        reason: `${guidance.reason} Next: ${guidance.nextDeterministicAction}`,
      };
      nextState = {
        ...nextState,
        loopState: {
          ...nextState.loopState,
          repairCount: nextState.loopState.repairCount + 1,
          status: "running",
        },
        repairHistory: [...nextState.repairHistory, repairStage],
        progressState: {
          ...nextState.progressState,
          status: "repairing",
          lastMeaningfulProgressAtStep: pendingToolCall.step,
          lastMeaningfulProgressSummary: input.toolResult.summary,
          stallCount: nextState.progressState.stallCount + 1,
          stallReason: guidance.reason,
          nextDeterministicAction: guidance.nextDeterministicAction,
        },
      };
    }
  } else {
    nextState = {
      ...nextState,
      loopState: {
        ...nextState.loopState,
        status: "running",
      },
    };
  }

  if (input.toolResult.ok && pendingToolCall.toolCall.name === "create_checkpoint" && nextState.deferredToolCall) {
    const deferred = nextState.deferredToolCall;
    return advanceWithCandidate({
      record,
      request,
      state: {
        ...nextState,
        deferredToolCall: null,
      },
      traceId: input.traceId,
      candidate: deferred,
      adapter: persisted.adapter,
      orchestrator: nextState.orchestrator,
      orchestratorVersion: nextState.orchestratorVersion ?? null,
      orchestratorRunId: nextState.orchestratorRunId ?? null,
      final: `Checkpoint created. Continuing with ${deferred.name}.`,
      logs: ["checkpoint_created=true", "next=deferred_tool_call"],
    });
  }

  const turn = await requestToolLoopTurn({
    request,
    targetInference: nextState.targetInference,
    contextSelection: nextState.contextSelection,
    fallbackPlan: nextState.fallbackPlan,
    toolTrace,
    loopSummary: {
      stepCount: nextState.loopState.stepCount,
      mutationCount: nextState.loopState.mutationCount,
      repairCount: nextState.loopState.repairCount,
    },
    availableTools: nextState.availableTools,
    latestToolResult: input.toolResult,
    orchestratorRunId: nextState.orchestratorRunId,
    repairDirective,
  });

  if (!isOpenHandsPrimaryOrchestration()) {
  const changeIntent = inferIntent({
    mode: request.mode,
    task: request.task,
    targetInference: nextState.targetInference,
  }).type === "code_edit";
  const inspectedTrustedTarget =
    input.toolResult.ok &&
    pendingToolCall.toolCall.name === "read_file" &&
    normalizeRelativePath(String(pendingToolCall.toolCall.arguments.path || "")) ===
      normalizeRelativePath(nextState.targetInference.path);
  const repeatedPendingSignature =
    Boolean(turn.toolCall) &&
    pendingToolCallSignature(turn.toolCall) === pendingToolCallSignature(pendingToolCall.toolCall);

  if (changeIntent && inspectedTrustedTarget && (!turn.toolCall || !isMutatingTool(turn.toolCall.name))) {
    const repairStage = nextRepairStage({
      targetPath: nextState.targetInference.path,
      repairHistory: nextState.repairHistory,
      latestToolResult: input.toolResult,
      pendingToolCall,
    });
    if (nextState.loopState.repairCount >= MAX_REPAIR_ROUNDS || !repairStage) {
      const failedResult = buildBlockedResult({
        final: turn.final || "The tool loop inspected the target file but did not produce a concrete mutation.",
        missingRequirements: ["mutation_required_after_inspection"],
        logs: [...turn.logs, "stall=post_inspection_without_mutation"],
        stallReason: `Inspected ${nextState.targetInference.path || "the target file"} without selecting a mutation.`,
        nextDeterministicAction: `Choose one concrete mutation for ${nextState.targetInference.path || "the target file"} or return a blocked terminal result.`,
      });
      const nextFingerprint = buildProgressFingerprint({
        pendingSignature: "",
        loopState: failedResult.loopState || nextState.loopState,
        objectiveState: failedResult.objectiveState,
        missingRequirements: failedResult.missingRequirements,
        latestToolResult: input.toolResult,
      });
      return persistAndReturn({
        record,
        state: {
          ...nextState,
          loopState: failedResult.loopState || nextState.loopState,
          progressState: failedResult.progressState,
          objectiveState: failedResult.objectiveState,
          lastProgressFingerprint: nextFingerprint,
        },
        result: failedResult,
        status: "failed",
        errorMessage: failedResult.final,
      });
    }
    const guidance = buildRepairGuidance({
      stage: repairStage,
      targetPath: nextState.targetInference.path,
      toolResult: input.toolResult,
    });
    const repairedTurn = await requestToolLoopTurn({
      request,
      targetInference: nextState.targetInference,
      contextSelection: nextState.contextSelection,
      fallbackPlan: nextState.fallbackPlan,
      toolTrace,
      loopSummary: {
        stepCount: nextState.loopState.stepCount,
        mutationCount: nextState.loopState.mutationCount,
        repairCount: nextState.loopState.repairCount + 1,
      },
      availableTools: nextState.availableTools,
      latestToolResult: input.toolResult,
      orchestratorRunId: nextState.orchestratorRunId,
      repairDirective: {
        stage: repairStage,
        reason: `${guidance.reason} Next: ${guidance.nextDeterministicAction}`,
      },
    });
    nextState = {
      ...nextState,
      loopState: {
        ...nextState.loopState,
        repairCount: nextState.loopState.repairCount + 1,
      },
      repairHistory: [...nextState.repairHistory, repairStage],
    };
    if (!repairedTurn.toolCall || !isMutatingTool(repairedTurn.toolCall.name)) {
      const failedResult = buildBlockedResult({
        final: repairedTurn.final || "The tool loop still did not produce a concrete mutation after repair.",
        missingRequirements: ["mutation_required_after_inspection"],
        logs: [...repairedTurn.logs, "stall=repair_exhausted_without_mutation"],
        stallReason: guidance.reason,
        nextDeterministicAction: guidance.nextDeterministicAction,
      });
      const nextFingerprint = buildProgressFingerprint({
        pendingSignature: "",
        loopState: failedResult.loopState || nextState.loopState,
        objectiveState: failedResult.objectiveState,
        missingRequirements: failedResult.missingRequirements,
        latestToolResult: input.toolResult,
      });
      return persistAndReturn({
        record,
        state: {
          ...nextState,
          loopState: failedResult.loopState || nextState.loopState,
          progressState: failedResult.progressState,
          objectiveState: failedResult.objectiveState,
          lastProgressFingerprint: nextFingerprint,
        },
        result: failedResult,
        status: "failed",
        errorMessage: failedResult.final,
      });
    }
    return advanceWithCandidate({
      record,
      request,
      state: {
        ...nextState,
        adapter: repairedTurn.adapter,
        orchestrator: repairedTurn.orchestrator ?? nextState.orchestrator,
        orchestratorVersion: repairedTurn.orchestratorVersion ?? nextState.orchestratorVersion ?? null,
        orchestratorRunId: repairedTurn.orchestratorRunId ?? nextState.orchestratorRunId ?? null,
      },
      traceId: input.traceId,
      candidate: repairedTurn.toolCall,
      adapter: repairedTurn.adapter,
      orchestrator: repairedTurn.orchestrator,
      orchestratorVersion: repairedTurn.orchestratorVersion ?? null,
      orchestratorRunId: repairedTurn.orchestratorRunId ?? null,
      final: repairedTurn.final,
      actions: repairedTurn.actions as ExecuteAction[] | undefined,
      logs: repairedTurn.logs,
    });
  }

  if (repeatedPendingSignature && input.toolResult.ok && !repairDirective) {
    const repairStage = nextRepairStage({
      targetPath: nextState.targetInference.path,
      repairHistory: nextState.repairHistory,
      latestToolResult: input.toolResult,
      pendingToolCall,
    });
    if (nextState.loopState.repairCount >= MAX_REPAIR_ROUNDS || !repairStage) {
      const failedResult = buildBlockedResult({
        final: turn.final || "The tool loop repeated the same pending tool call without new proof.",
        missingRequirements: ["tool_repeat_without_progress"],
        logs: [...turn.logs, "stall=repeated_pending_tool_signature"],
        stallReason: "The next hosted step repeated the same tool call signature without new proof.",
        nextDeterministicAction: "Choose a different next tool, mutate the target, or return a blocked terminal result.",
      });
      const nextFingerprint = buildProgressFingerprint({
        pendingSignature: "",
        loopState: failedResult.loopState || nextState.loopState,
        objectiveState: failedResult.objectiveState,
        missingRequirements: failedResult.missingRequirements,
        latestToolResult: input.toolResult,
      });
      return persistAndReturn({
        record,
        state: {
          ...nextState,
          loopState: failedResult.loopState || nextState.loopState,
          progressState: failedResult.progressState,
          objectiveState: failedResult.objectiveState,
          lastProgressFingerprint: nextFingerprint,
        },
        result: failedResult,
        status: "failed",
        errorMessage: failedResult.final,
      });
    }
    const guidance = buildRepairGuidance({
      stage: repairStage,
      targetPath: nextState.targetInference.path,
      toolResult: input.toolResult,
    });
    const repairedTurn = await requestToolLoopTurn({
      request,
      targetInference: nextState.targetInference,
      contextSelection: nextState.contextSelection,
      fallbackPlan: nextState.fallbackPlan,
      toolTrace,
      loopSummary: {
        stepCount: nextState.loopState.stepCount,
        mutationCount: nextState.loopState.mutationCount,
        repairCount: nextState.loopState.repairCount + 1,
      },
      availableTools: nextState.availableTools,
      latestToolResult: input.toolResult,
      orchestratorRunId: nextState.orchestratorRunId,
      repairDirective: {
        stage: repairStage,
        reason: `${guidance.reason} Next: ${guidance.nextDeterministicAction}`,
      },
    });
    nextState = {
      ...nextState,
      loopState: {
        ...nextState.loopState,
        repairCount: nextState.loopState.repairCount + 1,
        status: "running",
      },
      repairHistory: [...nextState.repairHistory, repairStage],
      progressState: {
        ...nextState.progressState,
        status: "repairing",
        stallCount: nextState.progressState.stallCount + 1,
        stallReason: "The next hosted step repeated the same tool call signature without new proof.",
        nextDeterministicAction: guidance.nextDeterministicAction,
      },
    };
    if (
      !repairedTurn.toolCall ||
      pendingToolCallSignature(repairedTurn.toolCall) === pendingToolCallSignature(pendingToolCall.toolCall)
    ) {
      const failedResult = buildBlockedResult({
        final: repairedTurn.final || "The tool loop repeated the same pending tool call even after repair.",
        missingRequirements: ["tool_repeat_without_progress"],
        logs: [...repairedTurn.logs, "stall=repeated_pending_tool_signature_after_repair"],
        stallReason: guidance.reason,
        nextDeterministicAction: guidance.nextDeterministicAction,
      });
      const nextFingerprint = buildProgressFingerprint({
        pendingSignature: "",
        loopState: failedResult.loopState || nextState.loopState,
        objectiveState: failedResult.objectiveState,
        missingRequirements: failedResult.missingRequirements,
        latestToolResult: input.toolResult,
      });
      return persistAndReturn({
        record,
        state: {
          ...nextState,
          loopState: failedResult.loopState || nextState.loopState,
          progressState: failedResult.progressState,
          objectiveState: failedResult.objectiveState,
          lastProgressFingerprint: nextFingerprint,
        },
        result: failedResult,
        status: "failed",
        errorMessage: failedResult.final,
      });
    }
    return advanceWithCandidate({
      record,
      request,
      state: {
        ...nextState,
        adapter: repairedTurn.adapter,
        orchestrator: repairedTurn.orchestrator ?? nextState.orchestrator,
        orchestratorVersion: repairedTurn.orchestratorVersion ?? nextState.orchestratorVersion ?? null,
        orchestratorRunId: repairedTurn.orchestratorRunId ?? nextState.orchestratorRunId ?? null,
      },
      traceId: input.traceId,
      candidate: repairedTurn.toolCall,
      adapter: repairedTurn.adapter,
      orchestrator: repairedTurn.orchestrator,
      orchestratorVersion: repairedTurn.orchestratorVersion ?? null,
      orchestratorRunId: repairedTurn.orchestratorRunId ?? null,
      final: repairedTurn.final,
      actions: repairedTurn.actions as ExecuteAction[] | undefined,
      logs: repairedTurn.logs,
    });
  }
  }

  return advanceWithCandidate({
    record,
    request,
    state: {
      ...nextState,
      adapter: turn.adapter,
      orchestrator: turn.orchestrator ?? nextState.orchestrator,
      orchestratorVersion: turn.orchestratorVersion ?? nextState.orchestratorVersion ?? null,
      orchestratorRunId: turn.orchestratorRunId ?? nextState.orchestratorRunId ?? null,
    },
    traceId: input.traceId,
    candidate: turn.toolCall,
    adapter: turn.adapter,
    orchestrator: turn.orchestrator,
    orchestratorVersion: turn.orchestratorVersion ?? null,
    orchestratorRunId: turn.orchestratorRunId ?? null,
    final: turn.final,
    actions: turn.actions as ExecuteAction[] | undefined,
    logs: turn.logs,
  });
}

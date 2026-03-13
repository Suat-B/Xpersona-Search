import type {
  LoopStateContract,
  PendingToolCallContract,
  PlaygroundAdapter,
  PlaygroundToolName,
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
  buildPlan,
  buildTargetInference,
  buildValidationPlan,
  inferRisk,
} from "@/lib/playground/orchestration";
import { attachAssistArtifactIdentifiers } from "@/lib/playground/agent-os";
import { requestToolLoopTurn, selectToolLoopAdapter } from "@/lib/playground/tool-loop-adapters";
import type { ExecuteAction } from "@/lib/playground/policy";

const MAX_TOOL_STEPS = 12;
const MAX_MUTATING_STEPS = 4;
const MAX_REPAIR_ROUNDS = 1;
const MAX_IDENTICAL_CALLS = 2;

type PersistedToolLoopState = {
  protocol: "tool_loop_v1";
  adapter: PlaygroundAdapter;
  loopState: LoopStateContract;
  pendingToolCall: PendingToolCallContract | null;
  toolTrace: ToolTraceEntryContract[];
  targetInference: AssistTargetInference;
  contextSelection: AssistContextSelection;
  fallbackPlan: AssistPlan;
  checkpointCreated: boolean;
  deferredToolCall?: ToolCallContract | null;
  availableTools: PlaygroundToolName[];
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
  return name === "edit" || name === "write_file" || name === "mkdir" || name === "run_command";
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

function buildObservationPrimer(targetInference: AssistTargetInference): ToolCallContract {
  if (targetInference.path) {
    return {
      id: `call_${Date.now().toString(36)}_read`,
      name: "read_file",
      arguments: { path: targetInference.path },
      kind: "observe",
      summary: `Inspect ${targetInference.path} before mutating it.`,
    };
  }
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
  if (!loopState || !targetInference || !contextSelection || !fallbackPlan) return null;
  return {
    protocol: "tool_loop_v1",
    adapter,
    loopState,
    pendingToolCall: pendingToolCall ?? null,
    toolTrace,
    targetInference,
    contextSelection,
    fallbackPlan,
    checkpointCreated: output.checkpointCreated === true,
    deferredToolCall: (output.deferredToolCall as ToolCallContract | null | undefined) ?? null,
    availableTools: availableTools.length > 0 ? availableTools : PLAYGROUND_TOOL_LOOP_TOOLS,
  };
}

function buildPersistedOutput(input: {
  state: PersistedToolLoopState;
  result: AssistResult;
}): Record<string, unknown> {
  return {
    protocol: input.state.protocol,
    adapter: input.state.adapter,
    loopState: input.state.loopState,
    pendingToolCall: input.state.pendingToolCall,
    toolTrace: input.state.toolTrace,
    targetInference: input.state.targetInference,
    contextSelection: input.state.contextSelection,
    fallbackPlan: input.state.fallbackPlan,
    checkpointCreated: input.state.checkpointCreated,
    deferredToolCall: input.state.deferredToolCall ?? null,
    availableTools: input.state.availableTools,
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
}): AssistResult {
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
    missingRequirements: input.missingRequirements || [],
    logs: [...input.logs, `adapter=${input.adapter}`, `tool_trace=${input.toolTrace.length}`],
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
    runId: input.runId,
    adapter: input.adapter,
    loopState: input.loopState,
    pendingToolCall: input.pendingToolCall,
    toolTrace: input.toolTrace,
    toolState: {
      ...base.toolState,
      strategy: "max_agentic",
      route: input.adapter === "deterministic_batch" ? "deterministic_synthesis" : input.adapter,
      adapter: `${input.adapter}_v1`,
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
    candidate = buildObservationPrimer(input.state.targetInference);
    deferredToolCall = null;
  }

  if (isMutatingTool(candidate.name) && !checkpointCreated) {
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
  if (repeatedCallCount > MAX_IDENTICAL_CALLS) {
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
  await updateAgentRun({
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
  }).catch(() => null);

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
  final?: string;
  actions?: ExecuteAction[];
  logs: string[];
}): Promise<AssistResult> {
  if (!input.candidate) {
    const finalResult = buildToolLoopResult({
      request: input.request,
      runId: input.record.id,
      traceId: input.traceId,
      adapter: input.adapter,
      targetInference: input.state.targetInference,
      contextSelection: input.state.contextSelection,
      fallbackPlan: input.state.fallbackPlan,
      loopState: {
        ...input.state.loopState,
        status: "completed",
      },
      pendingToolCall: null,
      toolTrace: input.state.toolTrace,
      logs: input.logs,
      final: input.final || "The tool loop completed.",
      actions: input.actions || actionsFromToolTrace(input.state.toolTrace),
    });
    return persistAndReturn({
      record: input.record,
      state: {
        ...input.state,
        adapter: input.adapter,
        loopState: finalResult.loopState || input.state.loopState,
        pendingToolCall: null,
      },
      result: finalResult,
      status: "completed",
      errorMessage: null,
    });
  }

  const safeguarded = enforceLoopSafeguards({
    candidate: input.candidate,
    state: input.state,
    request: input.request,
  });
  if (!safeguarded.candidate || !safeguarded.state) {
    const failedResult = buildToolLoopResult({
      request: input.request,
      runId: input.record.id,
      traceId: input.traceId,
      adapter: input.adapter,
      targetInference: input.state.targetInference,
      contextSelection: input.state.contextSelection,
      fallbackPlan: input.state.fallbackPlan,
      loopState: {
        ...input.state.loopState,
        status: "failed",
      },
      pendingToolCall: null,
      toolTrace: input.state.toolTrace,
      logs: input.logs,
      final: safeguarded.final || "The tool loop stopped before it could issue the next tool call.",
      actions: actionsFromToolTrace(input.state.toolTrace),
      missingRequirements: safeguarded.missingRequirements || ["tool_loop_failed"],
    });
    return persistAndReturn({
      record: input.record,
      state: {
        ...input.state,
        adapter: input.adapter,
        loopState: failedResult.loopState || input.state.loopState,
        pendingToolCall: null,
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
    targetInference: safeguarded.state.targetInference,
    contextSelection: safeguarded.state.contextSelection,
    fallbackPlan: safeguarded.state.fallbackPlan,
    loopState: safeguarded.state.loopState,
    pendingToolCall,
    toolTrace: pendingTrace,
    logs: input.logs,
    final:
      input.final ||
      `Step ${pendingToolCall.step} ready: ${pendingToolCall.toolCall.name}${typeof pendingToolCall.toolCall.arguments.path === "string" ? ` ${pendingToolCall.toolCall.arguments.path}` : ""}.`,
    actions: actionsFromToolTrace(pendingTrace),
  });

  return persistAndReturn({
    record: input.record,
    state: {
      ...safeguarded.state,
      adapter: input.adapter,
      pendingToolCall,
      toolTrace: pendingTrace,
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
  const { adapter } = selectToolLoopAdapter(input.request.model);
  const initialState: PersistedToolLoopState = {
    protocol: "tool_loop_v1",
    adapter,
    loopState: buildInitialLoopState(),
    pendingToolCall: null,
    toolTrace: [],
    targetInference,
    contextSelection,
    fallbackPlan,
    checkpointCreated: false,
    deferredToolCall: null,
    availableTools: buildAvailableTools(input.request),
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

  if (!input.toolResult.ok || input.toolResult.blocked) {
    if (nextState.loopState.repairCount >= MAX_REPAIR_ROUNDS) {
      const failedResult = buildToolLoopResult({
        request,
        runId: record.id,
        traceId: input.traceId,
        adapter: persisted.adapter,
        targetInference: persisted.targetInference,
        contextSelection: persisted.contextSelection,
        fallbackPlan: persisted.fallbackPlan,
        loopState: {
          ...nextState.loopState,
          status: "failed",
        },
        pendingToolCall: null,
        toolTrace,
        logs: ["repair_limit_exceeded"],
        final: input.toolResult.summary,
        actions: actionsFromToolTrace(toolTrace),
        missingRequirements: ["tool_result_failed"],
      });
      return persistAndReturn({
        record,
        state: {
          ...nextState,
          loopState: failedResult.loopState || nextState.loopState,
        },
        result: failedResult,
        status: "failed",
        errorMessage: input.toolResult.summary,
      });
    }
    nextState = {
      ...nextState,
      loopState: {
        ...nextState.loopState,
        repairCount: nextState.loopState.repairCount + 1,
        status: "running",
      },
    };
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
  });

  return advanceWithCandidate({
    record,
    request,
    state: {
      ...nextState,
      adapter: turn.adapter,
    },
    traceId: input.traceId,
    candidate: turn.toolCall,
    adapter: turn.adapter,
    final: turn.final,
    actions: turn.actions as ExecuteAction[] | undefined,
    logs: turn.logs,
  });
}

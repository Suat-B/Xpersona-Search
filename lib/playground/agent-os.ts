export type AssistExecutionLane = "interactive-fast" | "interactive-deep" | "background-heavy";

export type AssistTaskGraphStageId = "scout" | "builder" | "verifier" | "summarizer";

export type AssistTaskGraphStage = {
  id: AssistTaskGraphStageId;
  title: string;
  status: "completed" | "blocked" | "pending";
  summary: string;
  evidence: string[];
};

export type AssistRunCheckpoint = {
  id: string;
  status: "planned" | "available" | "not_required";
  summary: string;
  touchedFiles: string[];
  undoHint: string;
  createdAt: string;
};

export type AssistExecutionReceipt = {
  id: string;
  title: string;
  status: "ready" | "needs_review" | "blocked";
  intent: string;
  lane: AssistExecutionLane;
  route: string;
  model: string;
  provider: string;
  touchedFiles: string[];
  commands: string[];
  validationEvidence: string[];
  unresolvedRisk: string[];
  checkpointId: string | null;
  reviewState: "ready" | "needs_attention" | "blocked";
  delegateRunIds: string[];
  memoryWriteIds: string[];
  generatedAt: string;
};

export type AssistContextTraceSource = {
  kind: "active_file" | "open_file" | "mention" | "diagnostic" | "retrieval" | "session_memory" | "workspace_memory";
  label: string;
  detail?: string;
  confidence?: number;
};

export type AssistContextTrace = {
  sources: AssistContextTraceSource[];
  target: { path?: string; source: string; confidence: number };
  budget: { files: number; snippets: number; usedCloudIndex: boolean };
};

export type AssistDelegateRun = {
  id: string;
  role: AssistTaskGraphStageId;
  status: "completed" | "blocked" | "not_run";
  summary: string;
};

export type AssistMemoryWrite = {
  id: string;
  scope: "session" | "workspace";
  key: string;
  summary: string;
  reason: string;
  status: "planned" | "applied" | "skipped";
};

export type AssistReviewState = {
  status: "ready" | "needs_attention" | "blocked";
  reason: string;
  recommendedAction: string;
  surface: "playground_panel" | "native_chat";
  controlActions: Array<"pause" | "resume" | "cancel" | "repair">;
};

export type WorkspaceMemoryState = {
  workspaceFingerprint?: string;
  summary?: string;
  promotedMemories?: string[];
  touchedPaths?: string[];
  enabled?: boolean;
  updatedAt?: string;
};

export type AssistAgentArtifacts = {
  lane: AssistExecutionLane;
  taskGraph: AssistTaskGraphStage[];
  checkpoint: AssistRunCheckpoint;
  receipt: AssistExecutionReceipt;
  contextTrace: AssistContextTrace;
  delegateRuns: AssistDelegateRun[];
  memoryWrites: AssistMemoryWrite[];
  reviewState: AssistReviewState;
};

type AgentArtifactInput = {
  mode: string;
  task: string;
  runProfile?: string;
  context?: {
    activeFile?: { path?: string };
    openFiles?: Array<{ path?: string }>;
    diagnostics?: Array<{ file?: string; message?: string }>;
    indexedSnippets?: Array<{ path?: string; source?: string; reason?: string }>;
  };
  intent: { type: string; confidence: number };
  decision: { mode: string };
  autonomyDecision: { mode: string; rationale: string };
  validationPlan: { checks: string[]; touchedFiles: string[]; reason: string };
  actions: Array<{ type?: string; path?: string; command?: string }>;
  commands: string[];
  risk: { blastRadius: "low" | "medium" | "high"; rollbackComplexity: number };
  targetInference: { path?: string; source: string; confidence: number };
  contextSelection: {
    files: Array<{ path: string; reason: string; score?: number }>;
    snippets: number;
    usedCloudIndex: boolean;
  };
  toolState: { route: string };
  modelMetadata?: { modelResolvedAlias?: string; providerResolved?: string };
  completionStatus: "complete" | "incomplete";
  missingRequirements: string[];
  nextBestActions: string[];
  workspaceMemory?: WorkspaceMemoryState | null;
  now?: Date;
};

type ArtifactIdentifiers = {
  runId?: string | null;
  traceId?: string | null;
};

function uniqueStrings(values: Iterable<unknown>, limit: number, maxLen = 240): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const value of values) {
    const next = String(value || "").trim();
    if (!next || seen.has(next)) continue;
    seen.add(next);
    out.push(next.slice(0, maxLen));
    if (out.length >= limit) break;
  }
  return out;
}

function collectTouchedFiles(input: Pick<AgentArtifactInput, "validationPlan" | "actions" | "contextSelection" | "targetInference">): string[] {
  return uniqueStrings(
    [
      ...(input.validationPlan.touchedFiles || []),
      ...input.actions
        .filter((action) => action.type === "edit" || action.type === "write_file" || action.type === "mkdir")
        .map((action) => action.path),
      ...input.contextSelection.files.map((file) => file.path),
      input.targetInference.path,
    ],
    12,
    4096
  );
}

function inferLane(input: AgentArtifactInput, touchedFiles: string[]): AssistExecutionLane {
  if (
    input.runProfile === "deep_focus" ||
    input.mode === "plan" ||
    input.risk.blastRadius === "high" ||
    input.validationPlan.checks.length >= 3 ||
    touchedFiles.length >= 4 ||
    input.contextSelection.snippets >= 8
  ) {
    return input.contextSelection.snippets >= 10 || touchedFiles.length >= 6 || input.risk.blastRadius === "high"
      ? "background-heavy"
      : "interactive-deep";
  }
  return "interactive-fast";
}

function buildTaskGraph(input: AgentArtifactInput, touchedFiles: string[], lane: AssistExecutionLane): AssistTaskGraphStage[] {
  const scoutEvidence = uniqueStrings(
    [
      input.targetInference.path ? `Target ${input.targetInference.path}` : "",
      ...input.contextSelection.files.slice(0, 4).map((file) => `${file.path}: ${file.reason}`),
    ],
    5,
    300
  );
  const builderEvidence = uniqueStrings(
    [
      ...touchedFiles.map((path) => `Touched ${path}`),
      ...input.actions
        .filter((action) => action.type === "command" && action.command)
        .slice(0, 3)
        .map((action) => `Command ${String(action.command).slice(0, 120)}`),
    ],
    6,
    300
  );
  const verifierEvidence = uniqueStrings(
    [
      ...input.validationPlan.checks.map((check) => `Check ${check}`),
      input.validationPlan.reason,
      ...input.missingRequirements.map((item) => `Missing ${item}`),
    ],
    6,
    300
  );
  const summarizerEvidence = uniqueStrings(
    [
      `Lane ${lane}`,
      `Route ${input.toolState.route}`,
      `Autonomy ${input.autonomyDecision.mode}`,
      input.autonomyDecision.rationale,
    ],
    4,
    300
  );
  const blocked = input.completionStatus === "incomplete";

  return [
    {
      id: "scout",
      title: "Scout",
      status: "completed",
      summary: input.targetInference.path
        ? `Resolved likely target ${input.targetInference.path}.`
        : "Gathered workspace and retrieval context.",
      evidence: scoutEvidence,
    },
    {
      id: "builder",
      title: "Builder",
      status: blocked && touchedFiles.length === 0 ? "blocked" : "completed",
      summary:
        touchedFiles.length > 0
          ? `Prepared ${touchedFiles.length} candidate workspace change(s).`
          : "No concrete file mutations were prepared.",
      evidence: builderEvidence,
    },
    {
      id: "verifier",
      title: "Verifier",
      status: blocked ? "blocked" : "completed",
      summary:
        input.validationPlan.checks.length > 0
          ? `Planned ${input.validationPlan.checks.length} targeted validation check(s).`
          : "No targeted validation checks were required.",
      evidence: verifierEvidence,
    },
    {
      id: "summarizer",
      title: "Summarizer",
      status: blocked ? "blocked" : "completed",
      summary:
        blocked
          ? "Review is required before this run should be considered complete."
          : "Prepared a receipt and review state for execution handoff.",
      evidence: summarizerEvidence,
    },
  ];
}

function buildContextTrace(input: AgentArtifactInput): AssistContextTrace {
  const sources: AssistContextTraceSource[] = [];
  if (input.context?.activeFile?.path) {
    sources.push({ kind: "active_file", label: input.context.activeFile.path, confidence: 0.88 });
  }
  for (const file of input.contextSelection.files.slice(0, 5)) {
    sources.push({ kind: "retrieval", label: file.path, detail: file.reason, confidence: file.score });
  }
  for (const snippet of input.context?.indexedSnippets?.slice(0, 3) || []) {
    sources.push({
      kind: snippet.source === "local_fallback" ? "retrieval" : "retrieval",
      label: String(snippet.path || "indexed-snippet"),
      detail: String(snippet.reason || "Indexed snippet"),
    });
  }
  for (const diagnostic of input.context?.diagnostics?.slice(0, 3) || []) {
    sources.push({
      kind: "diagnostic",
      label: diagnostic.file || "diagnostic",
      detail: diagnostic.message,
    });
  }
  if (input.workspaceMemory?.summary) {
    sources.push({
      kind: "workspace_memory",
      label: "workspace memory",
      detail: String(input.workspaceMemory.summary).slice(0, 160),
      confidence: input.workspaceMemory.enabled === false ? 0.2 : 0.64,
    });
  }
  return {
    sources: sources.slice(0, 12),
    target: {
      ...(input.targetInference.path ? { path: input.targetInference.path } : {}),
      source: input.targetInference.source,
      confidence: input.targetInference.confidence,
    },
    budget: {
      files: input.contextSelection.files.length,
      snippets: input.contextSelection.snippets,
      usedCloudIndex: input.contextSelection.usedCloudIndex,
    },
  };
}

function buildCheckpoint(input: AgentArtifactInput, touchedFiles: string[], nowIso: string): AssistRunCheckpoint {
  const mutableActions = input.actions.filter((action) => action.type === "edit" || action.type === "write_file" || action.type === "mkdir");
  if (mutableActions.length === 0) {
    return {
      id: "pending-checkpoint",
      status: "not_required",
      summary: "No mutable workspace actions were prepared, so a checkpoint is not required.",
      touchedFiles: [],
      undoHint: "Nothing to undo.",
      createdAt: nowIso,
    };
  }
  return {
    id: "pending-checkpoint",
    status: "planned",
    summary: "Create a local checkpoint immediately before applying the prepared workspace changes.",
    touchedFiles,
    undoHint: "Use the latest Playground undo batch to revert the checkpoint.",
    createdAt: nowIso,
  };
}

function buildMemoryWrites(input: AgentArtifactInput, touchedFiles: string[], nowIso: string): AssistMemoryWrite[] {
  const writes: AssistMemoryWrite[] = [];
  if (input.targetInference.path || touchedFiles.length > 0) {
    writes.push({
      id: "pending-memory-session",
      scope: "session",
      key: "sessionMemory",
      summary: touchedFiles.length > 0 ? `Remember ${touchedFiles[0]} as the most recent working target.` : "Refresh last working target.",
      reason: "Successful edit-oriented runs should preserve recent target continuity.",
      status: "planned",
    });
  }
  if (input.completionStatus === "complete" && touchedFiles.length > 0) {
    writes.push({
      id: "pending-memory-workspace",
      scope: "workspace",
      key: input.workspaceMemory?.workspaceFingerprint || "workspace",
      summary: `Promote ${Math.min(touchedFiles.length, 4)} touched path(s) into inspectable workspace memory.`,
      reason: "Workspace memory powers future Scout decisions and review hydration.",
      status: input.workspaceMemory?.enabled === false ? "skipped" : "planned",
    });
  }
  return writes.map((write, index) => ({
    ...write,
    id: `${write.id}-${index + 1}`,
    summary: `${write.summary} (${nowIso.slice(0, 10)})`,
  }));
}

function buildReviewState(input: AgentArtifactInput, lane: AssistExecutionLane): AssistReviewState {
  if (input.completionStatus === "incomplete") {
    return {
      status: "blocked",
      reason: input.missingRequirements[0] || "The run is incomplete and needs repair before execution.",
      recommendedAction: "Repair the run and review the receipt before applying anything else.",
      surface: "playground_panel",
      controlActions: ["repair", "cancel"],
    };
  }
  if (input.risk.blastRadius === "high" || lane === "background-heavy" || input.decision.mode === "plan") {
    return {
      status: "needs_attention",
      reason: "This run is high-context or review-heavy, so the Playground panel should remain the control plane.",
      recommendedAction: "Open the Playground panel to inspect receipt, checkpoints, and validation before execution.",
      surface: "playground_panel",
      controlActions: ["pause", "resume", "cancel", "repair"],
    };
  }
  return {
    status: "ready",
    reason: "The run is compact enough to continue from native chat or the Playground panel.",
    recommendedAction: "Continue with the current flow or open Playground for richer execution details.",
    surface: "native_chat",
    controlActions: ["pause", "cancel", "repair"],
  };
}

function buildDelegateRuns(stages: AssistTaskGraphStage[]): AssistDelegateRun[] {
  return stages.map((stage) => ({
    id: `pending-${stage.id}`,
    role: stage.id,
    status: stage.status === "pending" ? "not_run" : stage.status,
    summary: stage.summary,
  }));
}

function buildReceipt(input: AgentArtifactInput, lane: AssistExecutionLane, touchedFiles: string[], checkpoint: AssistRunCheckpoint, reviewState: AssistReviewState, memoryWrites: AssistMemoryWrite[], delegateRuns: AssistDelegateRun[], nowIso: string): AssistExecutionReceipt {
  const validationEvidence = uniqueStrings(
    [
      ...input.validationPlan.checks,
      input.validationPlan.reason,
      input.autonomyDecision.rationale,
    ],
    8,
    400
  );
  const unresolvedRisk = uniqueStrings(
    [
      input.risk.blastRadius !== "low" ? `Blast radius ${input.risk.blastRadius}` : "",
      input.risk.rollbackComplexity > 3 ? `Rollback complexity ${input.risk.rollbackComplexity}` : "",
      ...input.missingRequirements,
    ],
    8,
    300
  );
  return {
    id: "pending-receipt",
    title: `${input.decision.mode.toUpperCase()} run for ${input.intent.type.replace(/_/g, " ")}`,
    status: reviewState.status === "blocked" ? "blocked" : reviewState.status === "needs_attention" ? "needs_review" : "ready",
    intent: input.intent.type,
    lane,
    route: input.toolState.route,
    model: String(input.modelMetadata?.modelResolvedAlias || "playground"),
    provider: String(input.modelMetadata?.providerResolved || "playground"),
    touchedFiles,
    commands: uniqueStrings([...input.commands, ...input.actions.map((action) => action.command)], 12, 2000),
    validationEvidence,
    unresolvedRisk,
    checkpointId: checkpoint.status === "not_required" ? null : checkpoint.id,
    reviewState: reviewState.status === "ready" ? "ready" : reviewState.status === "needs_attention" ? "needs_attention" : "blocked",
    delegateRunIds: delegateRuns.map((run) => run.id),
    memoryWriteIds: memoryWrites.map((write) => write.id),
    generatedAt: nowIso,
  };
}

export function buildAssistAgentArtifacts(input: AgentArtifactInput): AssistAgentArtifacts {
  const nowIso = (input.now || new Date()).toISOString();
  const touchedFiles = collectTouchedFiles(input);
  const lane = inferLane(input, touchedFiles);
  const taskGraph = buildTaskGraph(input, touchedFiles, lane);
  const checkpoint = buildCheckpoint(input, touchedFiles, nowIso);
  const contextTrace = buildContextTrace(input);
  const memoryWrites = buildMemoryWrites(input, touchedFiles, nowIso);
  const reviewState = buildReviewState(input, lane);
  const delegateRuns = buildDelegateRuns(taskGraph);
  const receipt = buildReceipt(input, lane, touchedFiles, checkpoint, reviewState, memoryWrites, delegateRuns, nowIso);

  return {
    lane,
    taskGraph,
    checkpoint,
    receipt,
    contextTrace,
    delegateRuns,
    memoryWrites,
    reviewState,
  };
}

export function attachAssistArtifactIdentifiers<T extends AssistAgentArtifacts>(artifacts: T, ids: ArtifactIdentifiers): T {
  const runId = ids.runId ? String(ids.runId) : "pending";
  const traceId = ids.traceId ? String(ids.traceId) : "pending";
  const checkpoint = {
    ...artifacts.checkpoint,
    id: artifacts.checkpoint.id === "pending-checkpoint" ? `${runId}:checkpoint` : artifacts.checkpoint.id,
  };
  const memoryWrites = artifacts.memoryWrites.map((write, index) => ({
    ...write,
    id: write.id.startsWith("pending-") ? `${runId}:memory:${index + 1}` : write.id,
  }));
  const delegateRuns = artifacts.delegateRuns.map((run) => ({
    ...run,
    id: run.id.startsWith("pending-") ? `${runId}:${run.role}` : run.id,
  }));
  const receipt = {
    ...artifacts.receipt,
    id: artifacts.receipt.id === "pending-receipt" ? `${runId}:receipt` : artifacts.receipt.id,
    checkpointId: checkpoint.status === "not_required" ? null : checkpoint.id,
    delegateRunIds: delegateRuns.map((run) => run.id),
    memoryWriteIds: memoryWrites.map((write) => write.id),
    provider: artifacts.receipt.provider === "playground" ? `playground:${traceId}` : artifacts.receipt.provider,
  };
  return {
    ...artifacts,
    checkpoint,
    delegateRuns,
    memoryWrites,
    receipt,
  };
}

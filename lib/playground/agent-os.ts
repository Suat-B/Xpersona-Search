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
  progressState: {
    status: "running" | "stalled" | "repairing" | "completed" | "failed";
    lastMeaningfulProgressAtStep: number;
    lastMeaningfulProgressSummary: string;
    stallCount: number;
    stallReason?: string;
    nextDeterministicAction?: string;
    pendingToolCallSignature?: string;
  };
  objectiveState: {
    status: "in_progress" | "satisfied" | "blocked";
    goalType: "code_edit" | "command_run" | "plan" | "unknown";
    targetPath?: string;
    requiredProof: string[];
    observedProof: string[];
    missingProof: string[];
  };
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
  const blocked =
    input.completionStatus === "incomplete" ||
    input.objectiveState.status === "blocked" ||
    input.progressState.status === "failed";
  return [
    {
      id: "scout",
      title: "Scout",
      status: "completed",
      summary: input.targetInference.path ? `Resolved likely target ${input.targetInference.path}.` : "Prepared workspace context.",
      evidence: uniqueStrings(
        [
          input.targetInference.path ? `Target ${input.targetInference.path}` : "",
          ...input.contextSelection.files.map((file) => `${file.path}: ${file.reason}`),
          ...input.objectiveState.observedProof.map((proof) => `Proof ${proof}`),
        ],
        4
      ),
    },
    {
      id: "builder",
      title: "Builder",
      status: touchedFiles.length > 0 ? "completed" : blocked ? "blocked" : "pending",
      summary: touchedFiles.length > 0 ? `Prepared ${touchedFiles.length} touched workspace file(s).` : "No mutable workspace actions were prepared yet.",
      evidence: uniqueStrings(touchedFiles.map((file) => `Touched ${file}`), 5),
    },
    {
      id: "verifier",
      title: "Verifier",
      status: blocked ? "blocked" : "completed",
      summary: blocked ? "Validation, proof, or actionability requires follow-up." : "Prepared targeted validation and review state.",
      evidence: uniqueStrings(
        [
          ...input.validationPlan.checks,
          ...input.missingRequirements,
          ...input.objectiveState.missingProof,
          input.progressState.stallReason || "",
        ],
        5
      ),
    },
    {
      id: "summarizer",
      title: "Summarizer",
      status: "completed",
      summary: `Prepared execution receipt for ${lane}.`,
      evidence: uniqueStrings([`Lane ${lane}`, `Route ${input.toolState.route}`, ...input.nextBestActions], 4),
    },
  ];
}

function buildCheckpoint(input: AgentArtifactInput, touchedFiles: string[], nowIso: string): AssistRunCheckpoint {
  if (touchedFiles.length === 0) {
    return {
      id: "pending-checkpoint",
      status: "not_required",
      summary: "No mutable workspace actions were prepared, so a checkpoint is not required.",
      touchedFiles: [],
      undoHint: "No workspace mutation is pending.",
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

function buildContextTrace(input: AgentArtifactInput): AssistContextTrace {
  const sources: AssistContextTraceSource[] = [];
  if (input.context?.activeFile?.path) {
    sources.push({ kind: "active_file", label: input.context.activeFile.path, detail: "Active editor context" });
  }
  for (const file of input.contextSelection.files.slice(0, 5)) {
    const kind = file.reason.toLowerCase().includes("mention")
      ? "mention"
      : file.reason.toLowerCase().includes("diagnostic")
        ? "diagnostic"
        : file.reason.toLowerCase().includes("open")
          ? "open_file"
          : "retrieval";
    sources.push({ kind, label: file.path, detail: file.reason, confidence: file.score });
  }
  if (input.workspaceMemory?.summary) {
    sources.push({ kind: "workspace_memory", label: "workspace memory", detail: input.workspaceMemory.summary.slice(0, 220) });
  }
  return {
    sources: sources.slice(0, 8),
    target: {
      path: input.targetInference.path,
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

function buildDelegateRuns(input: AgentArtifactInput, blocked: boolean): AssistDelegateRun[] {
  return [
    {
      id: "pending-scout",
      role: "scout",
      status: "completed",
      summary: input.targetInference.path ? `Resolved likely target ${input.targetInference.path}.` : "Prepared likely workspace scope.",
    },
    {
      id: "pending-builder",
      role: "builder",
      status: input.actions.length > 0 ? "completed" : "not_run",
      summary: input.actions.length > 0 ? `Prepared ${input.actions.length} action(s).` : "No executable workspace actions were prepared.",
    },
    {
      id: "pending-verifier",
      role: "verifier",
      status: blocked ? "blocked" : "completed",
      summary: blocked ? "Validation or missing requirements need repair." : "Targeted validation is ready.",
    },
  ];
}

function buildMemoryWrites(input: AgentArtifactInput, nowIso: string): AssistMemoryWrite[] {
  const writes: AssistMemoryWrite[] = [];
  if (input.targetInference.path) {
    writes.push({
      id: "pending-memory",
      scope: "session",
      key: "session.recentTarget",
      summary: `Remember ${input.targetInference.path} as the recent target. (${nowIso.slice(0, 10)})`,
      reason: "Successful edit-oriented runs should preserve recent target continuity.",
      status: input.completionStatus === "complete" ? "planned" : "skipped",
    });
  }
  if (input.workspaceMemory?.enabled && input.workspaceMemory?.summary) {
    writes.push({
      id: "pending-workspace-memory",
      scope: "workspace",
      key: "workspace.summary",
      summary: input.workspaceMemory.summary.slice(0, 220),
      reason: "Workspace memory is enabled for future grounded runs.",
      status: "applied",
    });
  }
  return writes;
}

function buildReviewState(input: AgentArtifactInput, lane: AssistExecutionLane): AssistReviewState {
  if (
    input.completionStatus === "incomplete" ||
    input.objectiveState.status === "blocked" ||
    input.progressState.status === "failed"
  ) {
    return {
      status: "blocked",
      reason:
        input.progressState.stallReason ||
        input.objectiveState.missingProof[0] ||
        input.missingRequirements[0] ||
        "The run still has unmet completion requirements.",
      recommendedAction: "Repair the run and review the receipt before applying anything else.",
      surface: "playground_panel",
      controlActions: ["resume", "cancel", "repair"],
    };
  }
  if (lane === "interactive-deep" || lane === "background-heavy" || input.risk.blastRadius === "high") {
    return {
      status: "needs_attention",
      reason: "This run is broad enough that the richer Playground review surface is recommended.",
      recommendedAction: "Open the Playground panel to inspect receipt, checkpoints, and validation before execution.",
      surface: "playground_panel",
      controlActions: ["pause", "cancel", "repair"],
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

function buildReceipt(
  input: AgentArtifactInput,
  lane: AssistExecutionLane,
  touchedFiles: string[],
  checkpoint: AssistRunCheckpoint,
  reviewState: AssistReviewState,
  memoryWrites: AssistMemoryWrite[],
  delegateRuns: AssistDelegateRun[],
  nowIso: string
): AssistExecutionReceipt {
  const unresolvedRisk = input.completionStatus === "incomplete"
    ? uniqueStrings(
        [...input.missingRequirements, ...input.objectiveState.missingProof, input.progressState.stallReason || ""],
        5
      )
    : input.risk.blastRadius === "high"
      ? ["High blast radius workspace change"]
      : [];
  return {
    id: "pending-receipt",
    title: `${String(input.decision.mode || input.mode).toUpperCase()} run for ${input.intent.type.replace(/_/g, " ")}`,
    status: reviewState.status === "blocked" ? "blocked" : reviewState.status === "needs_attention" ? "needs_review" : "ready",
    intent: input.intent.type,
    lane,
    route: input.toolState.route,
    model: input.modelMetadata?.modelResolvedAlias || "playground-default",
    provider: input.modelMetadata?.providerResolved || "playground",
    touchedFiles,
    commands: uniqueStrings(input.commands, 8, 512),
    validationEvidence: uniqueStrings(
      [
        ...input.validationPlan.checks,
        input.validationPlan.reason,
        ...input.objectiveState.observedProof,
        input.progressState.lastMeaningfulProgressSummary,
      ],
      6,
      280
    ),
    unresolvedRisk,
    checkpointId: checkpoint.status === "not_required" ? null : checkpoint.id,
    reviewState: reviewState.status === "blocked" ? "blocked" : reviewState.status === "needs_attention" ? "needs_attention" : "ready",
    delegateRunIds: delegateRuns.map((run) => run.id),
    memoryWriteIds: memoryWrites.map((write) => write.id),
    generatedAt: nowIso,
  };
}

export function buildAssistAgentArtifacts(input: AgentArtifactInput): AssistAgentArtifacts {
  const nowIso = (input.now || new Date()).toISOString();
  const touchedFiles = collectTouchedFiles(input);
  const lane = inferLane(input, touchedFiles);
  const checkpoint = buildCheckpoint(input, touchedFiles, nowIso);
  const memoryWrites = buildMemoryWrites(input, nowIso);
  const delegateRuns = buildDelegateRuns(input, input.completionStatus === "incomplete");
  const reviewState = buildReviewState(input, lane);
  const receipt = buildReceipt(input, lane, touchedFiles, checkpoint, reviewState, memoryWrites, delegateRuns, nowIso);
  return {
    lane,
    taskGraph: buildTaskGraph(input, touchedFiles, lane),
    checkpoint,
    receipt,
    contextTrace: buildContextTrace(input),
    delegateRuns,
    memoryWrites,
    reviewState,
  };
}

export function attachAssistArtifactIdentifiers(
  artifacts: AssistAgentArtifacts,
  identifiers: ArtifactIdentifiers
): AssistAgentArtifacts {
  const runId = String(identifiers.runId || "").trim();
  const traceId = String(identifiers.traceId || "").trim();
  if (!runId) return artifacts;
  const checkpoint = {
    ...artifacts.checkpoint,
    id: artifacts.checkpoint.id === "pending-checkpoint" ? `${runId}:checkpoint` : artifacts.checkpoint.id,
  };
  const delegateRuns = artifacts.delegateRuns.map((run, index) => ({
    ...run,
    id: run.id.startsWith("pending-")
      ? `${runId}:${index === 0 ? "scout" : index === 1 ? "builder" : "verifier"}`
      : run.id,
  }));
  const memoryWrites = artifacts.memoryWrites.map((write, index) => ({
    ...write,
    id: write.id.startsWith("pending-")
      ? `${runId}:${write.scope === "workspace" ? "workspace-memory" : `memory:${index + 1}`}`
      : write.id,
  }));
  const receipt = {
    ...artifacts.receipt,
    id: artifacts.receipt.id === "pending-receipt" ? `${runId}:receipt` : artifacts.receipt.id,
    checkpointId: checkpoint.status === "not_required" ? null : checkpoint.id,
    delegateRunIds: delegateRuns.map((run) => run.id),
    memoryWriteIds: memoryWrites.map((write) => write.id),
    provider: artifacts.receipt.provider === "playground" && traceId ? `playground:${traceId}` : artifacts.receipt.provider,
  };
  return {
    ...artifacts,
    checkpoint,
    receipt,
    delegateRuns,
    memoryWrites,
  };
}

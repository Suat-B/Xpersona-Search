import type {
  BinaryAstDelta,
  BinaryAstNodeSummary,
  BinaryAstState,
  BinaryBuildCheckpoint,
  BinaryExecutionState,
  BinaryLiveReliabilityBlocker,
  BinaryLiveReliabilityState,
  BinaryRuntimePatch,
  BinaryRuntimeState,
  BinarySnapshotSummary,
  BinarySourceGraph,
  BinaryValidationReport,
} from "@/lib/binary/contracts";

function nowIso(): string {
  return new Date().toISOString();
}

function clampPercentage(value: number): number {
  return Math.max(0, Math.min(100, Math.round(value)));
}

export function buildBinaryAstStateFromSourceGraph(sourceGraph: BinarySourceGraph | null | undefined): BinaryAstState | null {
  if (!sourceGraph) return null;

  const nodes: BinaryAstNodeSummary[] = [];
  for (const mod of sourceGraph.modules) {
    const moduleNodeId = `module:${mod.path}`;
    nodes.push({
      id: moduleNodeId,
      kind: "module",
      label: mod.path,
      path: mod.path,
      completeness: mod.completed ? 100 : 50,
    });
    for (const fn of mod.functions) {
      nodes.push({
        id: `function:${mod.path}:${fn.name}`,
        kind: "function",
        label: fn.name,
        path: fn.sourcePath,
        parentId: moduleNodeId,
        exported: fn.exported,
        callable: fn.callable,
        completeness: mod.completed ? 100 : 50,
      });
    }
  }

  return {
    coverage: clampPercentage(sourceGraph.coverage),
    moduleCount: sourceGraph.modules.length,
    modules: sourceGraph.modules.map((sourceMod) => ({
      path: sourceMod.path,
      language: sourceMod.language,
      nodeCount: 1 + sourceMod.functions.length,
      exportedSymbols: sourceMod.exports.slice(0, 512),
      callableFunctions: sourceMod.functions.filter((fn) => fn.callable).map((fn) => fn.name).slice(0, 512),
      completed: sourceMod.completed,
    })),
    nodes: nodes.slice(0, 5_000),
    updatedAt: sourceGraph.updatedAt || nowIso(),
    source: "compat",
  };
}

export function buildBinaryAstDeltaFromState(astState: BinaryAstState | null | undefined): BinaryAstDelta | null {
  if (!astState) return null;
  return {
    changeId: `ast_${Date.now().toString(36)}`,
    coverage: astState.coverage,
    source: astState.source,
    nodes: astState.nodes.slice(0, 512),
    modulesTouched: astState.modules.map((mod) => mod.path).slice(0, 120),
    updatedAt: astState.updatedAt,
  };
}

export function buildBinaryRuntimeState(input: {
  execution: BinaryExecutionState | null | undefined;
  patches?: BinaryRuntimePatch[] | null | undefined;
}): BinaryRuntimeState | null {
  if (!input.execution) return null;
  const engine =
    input.execution.mode === "native"
      ? "native"
      : input.execution.mode === "stub"
        ? "stub"
        : "none";
  return {
    runnable: input.execution.runnable,
    engine,
    availableFunctions: input.execution.availableFunctions,
    patches: (input.patches || []).slice(-512),
    updatedAt: input.execution.updatedAt || nowIso(),
    lastRun: input.execution.lastRun || null,
  };
}

function blockerFromIssue(issue: NonNullable<BinaryValidationReport["issues"]>[number]): BinaryLiveReliabilityBlocker | null {
  if (issue.severity !== "error") return null;
  return {
    code: issue.code,
    severity: issue.severity,
    message: issue.message,
  };
}

export function buildBinaryLiveReliabilityState(input: {
  report: BinaryValidationReport;
  previous?: BinaryLiveReliabilityState | null | undefined;
}): BinaryLiveReliabilityState {
  const blockers = input.report.issues.map(blockerFromIssue).filter((value): value is BinaryLiveReliabilityBlocker => Boolean(value));
  const previousCodes = new Set((input.previous?.blockers || []).map((blocker) => blocker.code));
  const currentCodes = new Set(blockers.map((blocker) => blocker.code));
  const resolvedBlockers = Array.from(previousCodes).filter((code) => !currentCodes.has(code));
  const trend =
    typeof input.previous?.score === "number"
      ? input.report.score > input.previous.score
        ? "rising"
        : input.report.score < input.previous.score
          ? "falling"
          : "steady"
      : "steady";

  return {
    score: input.report.score,
    trend,
    warnings: [
      ...input.report.warnings,
      ...input.report.issues.filter((issue) => issue.severity === "warning").map((issue) => issue.message),
    ].slice(0, 200),
    blockers: blockers.slice(0, 200),
    resolvedBlockers: resolvedBlockers.slice(0, 200),
    updatedAt: input.report.generatedAt || nowIso(),
    source: "compat",
  };
}

export function buildBinarySnapshotSummary(input: {
  checkpoint: BinaryBuildCheckpoint;
  parentSnapshotId?: string | null | undefined;
}): BinarySnapshotSummary {
  return {
    id: input.checkpoint.id,
    checkpointId: input.checkpoint.id,
    parentSnapshotId: input.parentSnapshotId || null,
    phase: input.checkpoint.phase,
    ...(input.checkpoint.label ? { label: input.checkpoint.label } : {}),
    savedAt: input.checkpoint.savedAt,
    source: "compat",
  };
}

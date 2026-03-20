import * as fs from "node:fs/promises";
import * as path from "node:path";
import type {
  BinaryArtifactMetadata,
  BinaryArtifactState,
  BinaryBuildCheckpoint,
  BinaryBuildEvent,
  BinaryBuildPhase,
  BinaryBuildPreview,
  BinaryBuildRecord,
  BinaryBuildRequest,
  BinaryBuildStatus,
  BinaryExecuteRequest,
  BinaryExecutionState,
  BinaryGenerationDelta,
  BinaryManifest,
  BinaryPendingRefinement,
  BinaryPlanPreview,
  BinaryPreviewFile,
  BinaryPublishResult,
  BinarySourceGraph,
  BinaryTargetEnvironment,
  BinaryValidationReport,
} from "@/lib/binary/contracts";
import { computeBinaryExecutionState, executeBinaryEntryPoint } from "@/lib/binary/execution";
import {
  appendBinaryBuildEvent,
  createBinaryBuildRecord,
  ensureBinaryArtifactStorageAccessible,
  getBinaryArtifactPath,
  getBinaryBuildRecord,
  getBinaryBuildWorkspaceDir,
  getBinaryCheckpointSnapshot,
  listBinaryBuildCheckpoints,
  subscribeBinaryBuildEvents,
  updateBinaryBuildRecord,
  writeBinaryBuildCheckpoint,
} from "@/lib/binary/store";
import { runStreamingBinaryBuild, type BinaryStreamingControlAction } from "@/lib/binary/streaming-runner";
import {
  assertBinaryDownloadSigningReady,
  createBinaryDownloadSignature,
} from "@/lib/binary/signing";
import { computeBinaryValidationReport } from "@/lib/binary/reliability";
import { appendSessionMessage, createAgentRun, createSession, updateAgentRun } from "@/lib/playground/store";

type ActiveBinaryBuildJob = {
  promise: Promise<void>;
  abortController: AbortController;
  heartbeatTimer: ReturnType<typeof setInterval> | null;
  lastEventAt: number;
  controlQueue: BinaryStreamingControlAction[];
};

const activeBuildJobs = new Map<string, ActiveBinaryBuildJob>();

function createBuildId(): string {
  return `bin_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

function nowIso(): string {
  return new Date().toISOString();
}

export function isBinaryStreamingEnabled(): boolean {
  const raw = String(process.env.BINARY_STREAMING_ENABLED || "").trim().toLowerCase();
  if (!raw) return true;
  return !["0", "false", "off", "no"].includes(raw);
}

function createEventId(): string {
  return `evt_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
}

function buildStreamPaths(buildId: string) {
  return {
    streamPath: "/api/v1/binary/builds/stream",
    eventsPath: `/api/v1/binary/builds/${encodeURIComponent(buildId)}/events`,
    controlPath: `/api/v1/binary/builds/${encodeURIComponent(buildId)}/control`,
  };
}

function emptyPreview(): BinaryBuildPreview {
  return {
    plan: null,
    files: [],
    recentLogs: [],
  };
}

function mergeLogs(...chunks: Array<string[] | undefined>): string[] {
  const out = chunks
    .flatMap((chunk) => chunk || [])
    .map((entry) => String(entry || "").trim())
    .filter(Boolean);
  return out.slice(-500);
}

function buildSummaryMessage(record: BinaryBuildRecord): string {
  const score = typeof record.reliability?.score === "number" ? `Score ${record.reliability.score}.` : "";
  const artifact = record.artifact ? `Artifact ${record.artifact.fileName}.` : "No artifact produced.";
  const headline =
    record.status === "completed"
      ? "Binary IDE generated"
      : record.status === "canceled"
        ? "Binary IDE canceled"
        : "Binary IDE attempted";
  return [`${headline} a package bundle for: ${record.intent}`, score, artifact].filter(Boolean).join(" ");
}

function deriveSessionTitle(intent: string): string {
  return String(intent || "").replace(/\s+/g, " ").trim().slice(0, 80) || "Binary IDE Build";
}

function riskLevelFromReliability(report: BinaryValidationReport | null | undefined): "low" | "medium" | "high" {
  if (!report) return "medium";
  if (report.status === "fail") return "high";
  if (report.status === "warn") return "medium";
  return "low";
}

async function ensureBinarySession(input: {
  userId: string;
  historySessionId?: string | null;
  title: string;
  workspaceFingerprint: string;
  workflow: "binary_generate" | "binary_validate" | "binary_deploy";
}): Promise<string> {
  if (input.historySessionId) return input.historySessionId;
  const session = await createSession({
    userId: input.userId,
    title: input.title,
    mode: "auto",
    workspaceFingerprint: input.workspaceFingerprint,
    metadata: {
      workflow: input.workflow,
    },
  });
  return session.id;
}

async function maybeAppendSessionMessage(input: {
  userId: string;
  historySessionId?: string | null;
  content: string;
  payload: Record<string, unknown>;
}): Promise<void> {
  if (!input.historySessionId) return;
  await appendSessionMessage({
    userId: input.userId,
    sessionId: input.historySessionId,
    role: "assistant",
    kind: "binary_build",
    content: input.content,
    payload: input.payload,
  }).catch(() => null);
}

function buildPreviewWithPlan(current: BinaryBuildPreview | null | undefined, plan: BinaryPlanPreview): BinaryBuildPreview {
  return {
    plan,
    files: current?.files || [],
    recentLogs: current?.recentLogs || [],
  };
}

function buildPreviewWithFile(current: BinaryBuildPreview | null | undefined, file: BinaryPreviewFile): BinaryBuildPreview {
  const existing = current?.files || [];
  const nextFiles = [file, ...existing.filter((item) => item.path !== file.path)].slice(0, 24);
  return {
    plan: current?.plan || null,
    files: nextFiles,
    recentLogs: current?.recentLogs || [],
  };
}

function buildPreviewWithLog(current: BinaryBuildPreview | null | undefined, chunk: string): BinaryBuildPreview {
  const entry = String(chunk || "").trim().slice(0, 4_000);
  return {
    plan: current?.plan || null,
    files: current?.files || [],
    recentLogs: [...(current?.recentLogs || []), entry].filter(Boolean).slice(-80),
  };
}

function buildPreviewWithCheckpoint(
  current: BinaryBuildPreview | null | undefined,
  checkpoint: BinaryBuildCheckpoint
): BinaryBuildPreview {
  return checkpoint.preview || current || emptyPreview();
}

function summarizeCheckpoint(checkpoint: BinaryBuildCheckpoint) {
  return {
    id: checkpoint.id,
    phase: checkpoint.phase,
    savedAt: checkpoint.savedAt,
    ...(checkpoint.label ? { label: checkpoint.label } : {}),
  };
}

function queueBinaryControlAction(buildId: string, action: BinaryStreamingControlAction): boolean {
  const active = activeBuildJobs.get(buildId);
  if (!active) return false;
  active.controlQueue.push(action);
  active.lastEventAt = Date.now();
  return true;
}

async function emitBuildEvent<T extends BinaryBuildEvent["type"]>(input: {
  buildId: string;
  type: T;
  data: Extract<BinaryBuildEvent, { type: T }>["data"];
}): Promise<BinaryBuildEvent> {
  const event = {
    id: createEventId(),
    buildId: input.buildId,
    timestamp: nowIso(),
    type: input.type,
    data: input.data,
  } as BinaryBuildEvent;
  const active = activeBuildJobs.get(input.buildId);
  if (active) active.lastEventAt = Date.now();
  await appendBinaryBuildEvent(event);
  return event;
}

async function emitPhaseChange(
  buildId: string,
  input: { status: BinaryBuildStatus; phase: BinaryBuildPhase; progress: number; message?: string }
): Promise<void> {
  const record = await getBinaryBuildRecord(buildId);
  const nextLogs = input.message ? mergeLogs(record?.logs, [input.message]) : record?.logs || [];
  await updateBinaryBuildRecord(buildId, {
    status: input.status,
    phase: input.phase,
    progress: input.progress,
    cancelable: input.status === "queued" || input.status === "running",
    logs: nextLogs,
  });
  await emitBuildEvent({
    buildId,
    type: "phase.changed",
    data: input,
  });
}

async function emitPlanUpdate(buildId: string, plan: BinaryPlanPreview): Promise<void> {
  const record = await getBinaryBuildRecord(buildId);
  await updateBinaryBuildRecord(buildId, {
    preview: buildPreviewWithPlan(record?.preview, plan),
  });
  await emitBuildEvent({
    buildId,
    type: "plan.updated",
    data: { plan },
  });
}

async function emitGenerationDelta(buildId: string, delta: BinaryGenerationDelta): Promise<void> {
  await emitBuildEvent({
    buildId,
    type: "generation.delta",
    data: { delta },
  });
}

async function emitFileUpdate(buildId: string, file: BinaryPreviewFile): Promise<void> {
  const record = await getBinaryBuildRecord(buildId);
  await updateBinaryBuildRecord(buildId, {
    preview: buildPreviewWithFile(record?.preview, file),
  });
  await emitBuildEvent({
    buildId,
    type: "file.updated",
    data: file,
  });
}

async function emitLogChunk(buildId: string, input: { stream: "stdout" | "stderr" | "system"; chunk: string }): Promise<void> {
  const record = await getBinaryBuildRecord(buildId);
  const trimmed = String(input.chunk || "").trim().slice(0, 4_000);
  if (!trimmed) return;
  await updateBinaryBuildRecord(buildId, {
    logs: mergeLogs(record?.logs, [trimmed]),
    preview: buildPreviewWithLog(record?.preview, trimmed),
  });
  await emitBuildEvent({
    buildId,
    type: "log.chunk",
    data: {
      stream: input.stream,
      chunk: trimmed,
    },
  });
}

async function emitReliabilityDelta(
  buildId: string,
  input: { kind: "prebuild" | "full"; report: BinaryValidationReport }
): Promise<void> {
  await updateBinaryBuildRecord(buildId, {
    reliability: input.report,
  });
  await emitBuildEvent({
    buildId,
    type: "reliability.delta",
    data: input,
  });
}

async function emitGraphUpdated(buildId: string, sourceGraph: BinarySourceGraph): Promise<void> {
  await updateBinaryBuildRecord(buildId, {
    sourceGraph,
  });
  await emitBuildEvent({
    buildId,
    type: "graph.updated",
    data: { sourceGraph },
  });
}

async function emitExecutionUpdated(buildId: string, execution: BinaryExecutionState): Promise<void> {
  await updateBinaryBuildRecord(buildId, {
    execution,
  });
  await emitBuildEvent({
    buildId,
    type: "execution.updated",
    data: { execution },
  });
}

async function emitArtifactDelta(buildId: string, artifactState: BinaryArtifactState): Promise<void> {
  await updateBinaryBuildRecord(buildId, {
    artifactState,
  });
  await emitBuildEvent({
    buildId,
    type: "artifact.delta",
    data: {
      artifactState,
    },
  });
}

async function emitCheckpoint(buildId: string, checkpoint: BinaryBuildCheckpoint): Promise<void> {
  await writeBinaryBuildCheckpoint(checkpoint);
  const record = await getBinaryBuildRecord(buildId);
  const nextCheckpoints = [
    summarizeCheckpoint(checkpoint),
    ...((record?.checkpoints || []).filter((item) => item.id !== checkpoint.id)),
  ].slice(0, 200);
  await updateBinaryBuildRecord(buildId, {
    preview: buildPreviewWithCheckpoint(record?.preview, checkpoint),
    sourceGraph: checkpoint.sourceGraph || record?.sourceGraph || null,
    execution: checkpoint.execution || record?.execution || null,
    checkpointId: checkpoint.id,
    checkpoints: nextCheckpoints,
  });
  await emitBuildEvent({
    buildId,
    type: "checkpoint.saved",
    data: { checkpoint },
  });
}

async function emitInterruptAccepted(
  buildId: string,
  input: {
    action: "cancel" | "refine";
    message?: string;
    pendingRefinement?: BinaryPendingRefinement | null;
  }
): Promise<void> {
  await updateBinaryBuildRecord(buildId, {
    pendingRefinement: input.pendingRefinement || null,
  });
  await emitBuildEvent({
    buildId,
    type: "interrupt.accepted",
    data: input,
  });
}

async function emitArtifactReady(
  buildId: string,
  input: { artifact: BinaryArtifactMetadata; manifest: BinaryManifest }
): Promise<void> {
  await updateBinaryBuildRecord(buildId, {
    artifact: input.artifact,
    manifest: input.manifest,
  });
  await emitBuildEvent({
    buildId,
    type: "artifact.ready",
    data: input,
  });
}

async function emitTerminalEvent(build: BinaryBuildRecord): Promise<void> {
  if (build.status === "completed") {
    await emitBuildEvent({
      buildId: build.id,
      type: "build.completed",
      data: { build },
    });
    return;
  }
  if (build.status === "canceled") {
    await emitBuildEvent({
      buildId: build.id,
      type: "build.canceled",
      data: {
        reason: build.errorMessage || undefined,
        build,
      },
    });
    return;
  }
  await emitBuildEvent({
    buildId: build.id,
    type: "build.failed",
    data: {
      errorMessage: build.errorMessage || "Binary build failed.",
      build,
    },
  });
}

async function emitBranchCreated(buildId: string, input: {
  sourceBuildId: string;
  checkpointId?: string;
  build: BinaryBuildRecord;
}): Promise<void> {
  await emitBuildEvent({
    buildId,
    type: "branch.created",
    data: input,
  });
}

async function emitRewindCompleted(buildId: string, input: {
  checkpointId: string;
  build: BinaryBuildRecord;
}): Promise<void> {
  await emitBuildEvent({
    buildId,
    type: "rewind.completed",
    data: input,
  });
}

function stopHeartbeat(buildId: string): void {
  const active = activeBuildJobs.get(buildId);
  if (!active?.heartbeatTimer) return;
  clearInterval(active.heartbeatTimer);
  active.heartbeatTimer = null;
}

function startHeartbeat(buildId: string): void {
  const active = activeBuildJobs.get(buildId);
  if (!active) return;
  stopHeartbeat(buildId);
  active.heartbeatTimer = setInterval(() => {
    const current = activeBuildJobs.get(buildId);
    if (!current) return;
    if (Date.now() - current.lastEventAt < 2_000) return;
    void getBinaryBuildRecord(buildId)
      .then((record) => {
        if (!record) return;
        return emitBuildEvent({
          buildId,
          type: "heartbeat",
          data: {
            phase: record.phase,
            progress: record.progress,
          },
        });
      })
      .catch(() => null);
  }, 2_000);
}

async function finalizeQueuedBinaryBuild(input: {
  userId: string;
  buildId: string;
  request: BinaryBuildRequest;
  runId?: string | null;
  initialFiles?: Record<string, string>;
}): Promise<void> {
  const result = await runStreamingBinaryBuild({
    buildId: input.buildId,
    request: input.request,
    initialFiles: input.initialFiles,
    hooks: {
      signal: activeBuildJobs.get(input.buildId)?.abortController.signal,
      onPhaseChange: async ({ status, phase, progress, message }) => {
        await emitPhaseChange(input.buildId, { status, phase, progress, message });
      },
      onPlanUpdated: async (plan) => {
        await emitPlanUpdate(input.buildId, plan);
      },
      onGenerationDelta: async (delta) => {
        await emitGenerationDelta(input.buildId, delta);
      },
      onFileUpdated: async (file) => {
        await emitFileUpdate(input.buildId, file);
      },
      onLogChunk: async ({ stream, chunk }) => {
        await emitLogChunk(input.buildId, { stream, chunk });
      },
      onReliability: async ({ kind, report }) => {
        await emitReliabilityDelta(input.buildId, { kind, report });
      },
      onSourceGraph: async (sourceGraph) => {
        await emitGraphUpdated(input.buildId, sourceGraph);
      },
      onExecution: async (execution) => {
        await emitExecutionUpdated(input.buildId, execution);
      },
      onArtifactState: async (artifactState) => {
        await emitArtifactDelta(input.buildId, artifactState);
      },
      onCheckpoint: async (checkpoint) => {
        await emitCheckpoint(input.buildId, checkpoint);
      },
      onArtifactReady: async ({ artifact, manifest }) => {
        await emitArtifactReady(input.buildId, { artifact, manifest });
      },
      onInterruptAccepted: async (interrupt) => {
        await emitInterruptAccepted(input.buildId, interrupt);
      },
      pullControlAction: async () => {
        const active = activeBuildJobs.get(input.buildId);
        return active?.controlQueue.shift() || null;
      },
    },
  });

  const finalPhase: BinaryBuildPhase =
    result.status === "completed" ? "completed" : result.status === "canceled" ? "canceled" : "failed";
  const finalRecord = await updateBinaryBuildRecord(input.buildId, {
    status: result.status,
    phase: finalPhase,
    progress: 100,
    logs: mergeLogs((await getBinaryBuildRecord(input.buildId))?.logs, result.logs),
    manifest: result.manifest,
    reliability: result.reliability,
    artifactState: result.artifactState,
    sourceGraph: result.sourceGraph,
    execution: result.execution,
    checkpointId: result.checkpointId,
    checkpoints: result.checkpoints.map((checkpoint) => summarizeCheckpoint(checkpoint)),
    artifact: result.artifact,
    errorMessage: result.errorMessage,
    cancelable: false,
    pendingRefinement: null,
    preview: result.preview,
  });

  if (!finalRecord) return;

  await emitTerminalEvent(finalRecord);
  if (input.runId) {
    await updateAgentRun({
      userId: input.userId,
      runId: input.runId,
      status:
        finalRecord.status === "completed"
          ? "completed"
          : "failed",
      output: {
        workflow: "binary_generate",
        artifactBuildId: input.buildId,
        manifest: finalRecord.manifest,
        reliability: finalRecord.reliability,
        artifact: finalRecord.artifact,
        sourceGraph: finalRecord.sourceGraph,
        execution: finalRecord.execution,
        checkpointId: finalRecord.checkpointId,
      },
      errorMessage: finalRecord.errorMessage,
      confidence:
        finalRecord.status === "canceled"
          ? 0.2
          : finalRecord.reliability?.score
            ? finalRecord.reliability.score / 100
            : 0.5,
      riskLevel: riskLevelFromReliability(finalRecord.reliability),
    }).catch(() => null);
  }

  await maybeAppendSessionMessage({
    userId: input.userId,
    historySessionId: finalRecord.historySessionId,
    content: buildSummaryMessage(finalRecord),
    payload: {
      workflow: "binary_generate",
      artifactBuildId: finalRecord.id,
      build: finalRecord,
    },
  });
}

function startQueuedBinaryBuild(input: {
  userId: string;
  buildId: string;
  request: BinaryBuildRequest;
  runId?: string | null;
  initialFiles?: Record<string, string>;
}): void {
  const active: ActiveBinaryBuildJob = {
    abortController: new AbortController(),
    heartbeatTimer: null,
    lastEventAt: Date.now(),
    controlQueue: [],
    promise: Promise.resolve(),
  };
  activeBuildJobs.set(input.buildId, active);
  startHeartbeat(input.buildId);

  active.promise = Promise.resolve()
    .then(() => finalizeQueuedBinaryBuild(input))
    .catch(async (error) => {
      const message = error instanceof Error ? error.message : String(error);
      const updated = await updateBinaryBuildRecord(input.buildId, {
        status: "failed",
        phase: "failed",
        progress: 100,
        logs: mergeLogs((await getBinaryBuildRecord(input.buildId))?.logs, [`Background Binary IDE build failed: ${message}`]),
        errorMessage: message,
        cancelable: false,
      });
      if (input.runId) {
        await updateAgentRun({
          userId: input.userId,
          runId: input.runId,
          status: "failed",
          output: {
            workflow: "binary_generate",
            artifactBuildId: input.buildId,
          },
          errorMessage: message,
          confidence: 0.1,
          riskLevel: "high",
        }).catch(() => null);
      }
      if (updated) {
        await emitTerminalEvent(updated).catch(() => null);
        await maybeAppendSessionMessage({
          userId: input.userId,
          historySessionId: updated.historySessionId,
          content: buildSummaryMessage(updated),
          payload: {
            workflow: "binary_generate",
            artifactBuildId: updated.id,
            build: updated,
          },
        });
      }
    })
    .finally(() => {
      stopHeartbeat(input.buildId);
      activeBuildJobs.delete(input.buildId);
    });
}

export async function createBinaryBuild(input: {
  userId: string;
  request: BinaryBuildRequest;
}): Promise<BinaryBuildRecord> {
  await ensureBinaryArtifactStorageAccessible();

  const buildId = createBuildId();
  const createdAt = nowIso();
  const sessionId = await ensureBinarySession({
    userId: input.userId,
    historySessionId: input.request.historySessionId,
    title: deriveSessionTitle(input.request.intent),
    workspaceFingerprint: input.request.workspaceFingerprint,
    workflow: "binary_generate",
  });
  const run = await createAgentRun({
    userId: input.userId,
    sessionId,
    role: "single",
    status: "running",
    confidence: 0.82,
    riskLevel: "medium",
    input: {
      workflow: "binary_generate",
      artifactBuildId: buildId,
      intent: input.request.intent,
      workspaceFingerprint: input.request.workspaceFingerprint,
      targetEnvironment: input.request.targetEnvironment,
    },
  });

  const initial: BinaryBuildRecord = {
    id: buildId,
    userId: input.userId,
    historySessionId: sessionId,
    runId: run.id,
    workflow: "binary_generate",
    artifactKind: "package_bundle",
    status: "queued",
    phase: "queued",
    progress: 0,
    intent: input.request.intent,
    workspaceFingerprint: input.request.workspaceFingerprint,
    targetEnvironment: input.request.targetEnvironment,
    logs: ["Queued Binary IDE portable package bundle build."],
    stream: {
      enabled: isBinaryStreamingEnabled(),
      transport: "sse",
      ...buildStreamPaths(buildId),
      lastEventId: null,
    },
    preview: emptyPreview(),
    cancelable: true,
    manifest: null,
    reliability: null,
    sourceGraph: null,
    execution: null,
    checkpointId: null,
    checkpoints: [],
    parentBuildId: null,
    pendingRefinement: null,
    artifact: null,
    artifactState: null,
    publish: null,
    errorMessage: null,
    createdAt,
    updatedAt: createdAt,
  };

  await createBinaryBuildRecord(initial);
  await emitBuildEvent({
    buildId,
    type: "build.created",
    data: { build: initial },
  });
  await emitBuildEvent({
    buildId,
    type: "phase.changed",
    data: {
      status: "queued",
      phase: "queued",
      progress: 0,
      message: "Queued Binary IDE portable package bundle build.",
    },
  });
  startQueuedBinaryBuild({
    userId: input.userId,
    buildId,
    request: input.request,
    runId: run.id,
  });
  return initial;
}

export async function getBinaryBuildForUser(input: {
  userId: string;
  buildId: string;
}): Promise<BinaryBuildRecord | null> {
  const record = await getBinaryBuildRecord(input.buildId);
  if (!record || record.userId !== input.userId) return null;
  return record;
}

export async function cancelBinaryBuild(input: {
  userId: string;
  buildId: string;
}): Promise<BinaryBuildRecord | null> {
  const record = await getBinaryBuildForUser({ userId: input.userId, buildId: input.buildId });
  if (!record) return null;
  if (record.status === "completed" || record.status === "failed" || record.status === "canceled") {
    return null;
  }

  const active = activeBuildJobs.get(input.buildId);
  if (active && !active.abortController.signal.aborted) {
    active.abortController.abort();
    queueBinaryControlAction(input.buildId, { action: "cancel" });
    await emitInterruptAccepted(input.buildId, {
      action: "cancel",
      message: "Cancellation requested.",
      pendingRefinement: null,
    }).catch(() => null);
    await emitLogChunk(input.buildId, {
      stream: "system",
      chunk: "Cancellation requested.",
    }).catch(() => null);
  }

  return getBinaryBuildForUser({ userId: input.userId, buildId: input.buildId });
}

export async function refineBinaryBuild(input: {
  userId: string;
  buildId: string;
  intent: string;
}): Promise<BinaryBuildRecord | null> {
  const record = await getBinaryBuildForUser({ userId: input.userId, buildId: input.buildId });
  if (!record) return null;
  if (!isBinaryBuildActive(input.buildId) || (record.status !== "queued" && record.status !== "running")) {
    return null;
  }

  const pendingRefinement: BinaryPendingRefinement = {
    intent: input.intent,
    requestedAt: nowIso(),
  };
  const queued = queueBinaryControlAction(input.buildId, {
    action: "refine",
    intent: input.intent,
  });
  if (!queued) return null;

  await emitInterruptAccepted(input.buildId, {
    action: "refine",
    message: "Queued refinement for the active streaming build.",
    pendingRefinement,
  }).catch(() => null);
  await emitLogChunk(input.buildId, {
    stream: "system",
    chunk: `Refinement queued: ${input.intent}`,
  }).catch(() => null);

  return getBinaryBuildForUser({ userId: input.userId, buildId: input.buildId });
}

export async function branchBinaryBuild(input: {
  userId: string;
  buildId: string;
  checkpointId?: string;
  intent?: string;
}): Promise<BinaryBuildRecord | null> {
  const source = await getBinaryBuildForUser({ userId: input.userId, buildId: input.buildId });
  if (!source) return null;

  const targetCheckpointId =
    String(input.checkpointId || "").trim() ||
    String(source.checkpointId || "").trim() ||
    String(source.checkpoints?.[0]?.id || "").trim();
  if (!targetCheckpointId) return null;

  const snapshot = await getBinaryCheckpointSnapshot(source.id, targetCheckpointId);
  if (!snapshot) return null;

  const newBuildId = createBuildId();
  const createdAt = nowIso();
  const logs = mergeLogs(source.logs, [`Branched from ${source.id} at checkpoint ${targetCheckpointId}.`]);
  const initial: BinaryBuildRecord = {
    ...source,
    id: newBuildId,
    runId: null,
    workflow: "binary_generate",
    status: input.intent ? "queued" : "completed",
    phase: input.intent ? "queued" : "completed",
    progress: input.intent ? 0 : 100,
    logs,
    stream: {
      enabled: isBinaryStreamingEnabled(),
      transport: "sse",
      ...buildStreamPaths(newBuildId),
      lastEventId: null,
    },
    preview: snapshot.preview || source.preview || emptyPreview(),
    cancelable: Boolean(input.intent),
    manifest: snapshot.manifest || source.manifest || null,
    reliability: snapshot.reliability || source.reliability || null,
    sourceGraph: snapshot.sourceGraph || source.sourceGraph || null,
    execution: snapshot.execution || source.execution || null,
    artifactState: snapshot.artifactState || source.artifactState || null,
    checkpointId: targetCheckpointId,
    checkpoints:
      source.checkpoints?.filter((checkpoint) => checkpoint.id === targetCheckpointId).length
        ? source.checkpoints.filter((checkpoint) => checkpoint.id === targetCheckpointId)
        : source.checkpoints || [],
    parentBuildId: source.id,
    pendingRefinement: input.intent
      ? {
          intent: input.intent,
          requestedAt: createdAt,
        }
      : null,
    artifact: null,
    publish: null,
    errorMessage: null,
    createdAt,
    updatedAt: createdAt,
  };

  await createBinaryBuildRecord(initial);
  await fs.rm(getBinaryBuildWorkspaceDir(newBuildId), { recursive: true, force: true }).catch(() => null);
  await fs.mkdir(getBinaryBuildWorkspaceDir(newBuildId), { recursive: true });
  for (const [relativePath, content] of Object.entries(snapshot.draftFiles)) {
    const absolutePath = path.join(getBinaryBuildWorkspaceDir(newBuildId), relativePath);
    await fs.mkdir(path.dirname(absolutePath), { recursive: true }).catch(() => null);
    await fs.writeFile(absolutePath, content, "utf8");
  }

  await emitBuildEvent({
    buildId: newBuildId,
    type: "build.created",
    data: { build: initial },
  });
  await emitBranchCreated(newBuildId, {
    sourceBuildId: source.id,
    checkpointId: targetCheckpointId,
    build: initial,
  });

  if (input.intent) {
    startQueuedBinaryBuild({
      userId: input.userId,
      buildId: newBuildId,
      request: {
        intent: `${source.intent}\n\nBranch refinement:\n${input.intent}`.trim(),
        workspaceFingerprint: source.workspaceFingerprint,
        historySessionId: source.historySessionId || undefined,
        targetEnvironment: source.targetEnvironment,
      },
      initialFiles: snapshot.draftFiles,
    });
  }

  return getBinaryBuildForUser({ userId: input.userId, buildId: newBuildId });
}

export async function rewindBinaryBuild(input: {
  userId: string;
  buildId: string;
  checkpointId: string;
}): Promise<BinaryBuildRecord | null> {
  const record = await getBinaryBuildForUser({ userId: input.userId, buildId: input.buildId });
  if (!record) return null;
  if (isBinaryBuildActive(input.buildId)) return null;

  const snapshot = await getBinaryCheckpointSnapshot(record.id, input.checkpointId);
  if (!snapshot) return null;

  const workspaceDir = getBinaryBuildWorkspaceDir(record.id);
  await fs.rm(workspaceDir, { recursive: true, force: true }).catch(() => null);
  await fs.mkdir(workspaceDir, { recursive: true });
  for (const [relativePath, content] of Object.entries(snapshot.draftFiles)) {
    const absolutePath = path.join(workspaceDir, relativePath);
    await fs.mkdir(path.dirname(absolutePath), { recursive: true }).catch(() => null);
    await fs.writeFile(absolutePath, content, "utf8");
  }
  if (snapshot.manifest) {
    await fs.writeFile(
      path.join(workspaceDir, "binary.manifest.json"),
      JSON.stringify(snapshot.manifest, null, 2),
      "utf8"
    ).catch(() => null);
  }

  const checkpoints = (await listBinaryBuildCheckpoints(record.id)).map((checkpoint) => summarizeCheckpoint(checkpoint));
  const updated = await updateBinaryBuildRecord(record.id, {
    status: "completed",
    phase: "completed",
    progress: 100,
    preview: snapshot.preview || emptyPreview(),
    manifest: snapshot.manifest || null,
    reliability: snapshot.reliability || null,
    sourceGraph: snapshot.sourceGraph || null,
    execution: snapshot.execution || null,
    artifactState: snapshot.artifactState || null,
    checkpointId: input.checkpointId,
    checkpoints,
    artifact: null,
    publish: null,
    pendingRefinement: null,
    logs: mergeLogs(record.logs, [`Rewound build to checkpoint ${input.checkpointId}.`]),
    cancelable: false,
    errorMessage: null,
  });
  if (updated) {
    await emitRewindCompleted(record.id, {
      checkpointId: input.checkpointId,
      build: updated,
    }).catch(() => null);
  }
  return updated;
}

export async function executeBinaryBuild(input: {
  userId: string;
  buildId: string;
  request: BinaryExecuteRequest;
}): Promise<BinaryBuildRecord | null> {
  const record = await getBinaryBuildForUser({ userId: input.userId, buildId: input.buildId });
  if (!record) return null;

  const checkpointId =
    String(record.checkpointId || "").trim() ||
    String(record.checkpoints?.[0]?.id || "").trim();
  if (!checkpointId) return null;

  const snapshot = await getBinaryCheckpointSnapshot(record.id, checkpointId);
  if (!snapshot) return null;

  const execution =
    record.execution ||
    snapshot.execution ||
    (await computeBinaryExecutionState({
      draftFiles: snapshot.draftFiles,
      sourceGraph: snapshot.sourceGraph,
    }));
  const { execution: nextExecution } = await executeBinaryEntryPoint({
    execution,
    draftFiles: snapshot.draftFiles,
    entryPoint: input.request.entryPoint,
    args: input.request.args,
  });
  await emitExecutionUpdated(record.id, nextExecution).catch(() => null);
  return getBinaryBuildForUser({ userId: input.userId, buildId: input.buildId });
}

export async function validateBinaryBuild(input: {
  userId: string;
  buildId: string;
  targetEnvironment?: BinaryTargetEnvironment;
}): Promise<BinaryBuildRecord | null> {
  const record = await getBinaryBuildForUser({ userId: input.userId, buildId: input.buildId });
  if (!record || !record.manifest) return null;

  const targetEnvironment = input.targetEnvironment || record.targetEnvironment;
  const sessionId = await ensureBinarySession({
    userId: input.userId,
    historySessionId: record.historySessionId,
    title: deriveSessionTitle(record.intent),
    workspaceFingerprint: record.workspaceFingerprint,
    workflow: "binary_validate",
  });
  const workspaceDir = getBinaryBuildWorkspaceDir(record.id);
  const reliability = await computeBinaryValidationReport({
    workspaceDir,
    manifest: record.manifest,
    targetEnvironment,
    buildSucceeded: record.status === "completed",
    stage: "full",
    sourceGraph: record.sourceGraph,
    execution: record.execution,
  });

  const run = await createAgentRun({
    userId: input.userId,
    sessionId,
    role: "single",
    status: "completed",
    confidence: reliability.score / 100,
    riskLevel: riskLevelFromReliability(reliability),
    input: {
      workflow: "binary_validate",
      artifactBuildId: record.id,
      targetEnvironment,
    },
  });

  const updated = await updateBinaryBuildRecord(record.id, {
    workflow: "binary_validate",
    historySessionId: sessionId,
    targetEnvironment,
    reliability,
    runId: run.id,
  });

  if (updated) {
    await updateAgentRun({
      userId: input.userId,
      runId: run.id,
      status: "completed",
      output: {
        workflow: "binary_validate",
        artifactBuildId: record.id,
        reliability,
      },
      confidence: reliability.score / 100,
      riskLevel: riskLevelFromReliability(reliability),
    }).catch(() => null);

    await maybeAppendSessionMessage({
      userId: input.userId,
      historySessionId: updated.historySessionId,
      content: `Binary IDE revalidated portable bundle ${updated.id}. ${updated.reliability?.summary || ""}`.trim(),
      payload: {
        workflow: "binary_validate",
        artifactBuildId: updated.id,
        reliability,
      },
    });
  }

  return updated;
}

export async function publishBinaryBuild(input: {
  userId: string;
  buildId: string;
  origin: string;
  expiresInSeconds?: number;
}): Promise<BinaryBuildRecord | null> {
  const record = await getBinaryBuildForUser({ userId: input.userId, buildId: input.buildId });
  if (!record || !record.artifact || record.status !== "completed") return null;

  await ensureBinaryArtifactStorageAccessible();
  assertBinaryDownloadSigningReady();
  await fs.access(getBinaryArtifactPath(record.id));

  const sessionId = await ensureBinarySession({
    userId: input.userId,
    historySessionId: record.historySessionId,
    title: deriveSessionTitle(record.intent),
    workspaceFingerprint: record.workspaceFingerprint,
    workflow: "binary_deploy",
  });
  const expiresAt = new Date(Date.now() + (input.expiresInSeconds || 60 * 60 * 24) * 1000).toISOString();
  const sig = createBinaryDownloadSignature(record.id, expiresAt);
  const downloadUrl = `${input.origin}/api/v1/binary/builds/${encodeURIComponent(record.id)}/download?expires=${encodeURIComponent(expiresAt)}&sig=${encodeURIComponent(sig)}`;
  const publish: BinaryPublishResult = {
    publishedAt: nowIso(),
    downloadUrl,
    expiresAt,
  };

  const run = await createAgentRun({
    userId: input.userId,
    sessionId,
    role: "single",
    status: "completed",
    confidence: 0.93,
    riskLevel: "low",
    input: {
      workflow: "binary_deploy",
      artifactBuildId: record.id,
      downloadUrl,
    },
  });

  const updated = await updateBinaryBuildRecord(record.id, {
    workflow: "binary_deploy",
    historySessionId: sessionId,
    publish,
    runId: run.id,
  });

  if (updated) {
    await updateAgentRun({
      userId: input.userId,
      runId: run.id,
      status: "completed",
      output: {
        workflow: "binary_deploy",
        artifactBuildId: record.id,
        publish,
      },
      confidence: 0.93,
      riskLevel: "low",
    }).catch(() => null);

    await maybeAppendSessionMessage({
      userId: input.userId,
      historySessionId: updated.historySessionId,
      content: `Binary IDE published portable bundle ${updated.id}. Download URL ready.`,
      payload: {
        workflow: "binary_deploy",
        artifactBuildId: updated.id,
        publish,
      },
    });
  }

  return updated;
}

export function isBinaryBuildActive(buildId: string): boolean {
  return activeBuildJobs.has(buildId);
}

export { subscribeBinaryBuildEvents };

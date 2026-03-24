import * as crypto from "node:crypto";
import * as fs from "node:fs/promises";
import * as path from "node:path";
import type {
  BinaryAstState,
  BinaryArtifactMetadata,
  BinaryArtifactState,
  BinaryBuildCheckpoint,
  BinaryBuildPhase,
  BinaryBuildRequest,
  BinaryBuildStatus,
  BinaryExecutionState,
  BinaryGenerationDelta,
  BinaryLiveReliabilityState,
  BinaryLogStream,
  BinaryManifest,
  BinaryPendingRefinement,
  BinaryPlanPreview,
  BinaryPreviewFile,
  BinaryRuntimePatch,
  BinaryRuntimeState,
  BinarySnapshotSummary,
  BinaryReliabilityKind,
  BinarySourceGraph,
  BinaryValidationReport,
} from "@/lib/binary/contracts";
import type { BinaryBuildExecutor } from "@/lib/binary/build-runner";
import { runBinaryCommand } from "@/lib/binary/build-runner";
import {
  prepareBinaryGenerationWorkspace,
  streamBinaryGenerationDeltas,
  type BinaryGenerationPreparedWorkspace,
} from "@/lib/binary/generation-provider";
import {
  buildBinaryArtifactStateFromGraph,
  buildBinarySourceGraph,
} from "@/lib/binary/source-graph";
import {
  computeBinaryExecutionState,
} from "@/lib/binary/execution";
import { computeBinaryValidationReport } from "@/lib/binary/reliability";
import {
  buildBinaryAstStateFromSourceGraph,
  buildBinaryLiveReliabilityState,
  buildBinaryRuntimeState,
  buildBinarySnapshotSummary,
} from "@/lib/binary/live-state";
import {
  getBinaryArtifactPath,
  getBinaryBuildRootDir,
  getBinaryBuildWorkspaceDir,
  writeBinaryCheckpointSnapshot,
} from "@/lib/binary/store";

export type BinaryStreamingControlAction =
  | { action: "cancel" }
  | { action: "refine"; intent: string };

export type BinaryStreamingRunResult = {
  status: "completed" | "failed" | "canceled";
  logs: string[];
  manifest: BinaryManifest;
  reliability: BinaryValidationReport;
  liveReliability: BinaryLiveReliabilityState | null;
  artifactState: BinaryArtifactState;
  artifact: BinaryArtifactMetadata | null;
  errorMessage: string | null;
  sourceGraph: BinarySourceGraph | null;
  astState: BinaryAstState | null;
  execution: BinaryExecutionState | null;
  runtimeState: BinaryRuntimeState | null;
  runtimePatches: BinaryRuntimePatch[];
  snapshots: BinarySnapshotSummary[];
  checkpoints: BinaryBuildCheckpoint[];
  checkpointId: string | null;
  preview: {
    plan: BinaryPlanPreview | null;
    files: BinaryPreviewFile[];
    recentLogs: string[];
  };
  draftFiles: Record<string, string>;
};

export type BinaryStreamingBuildHooks = {
  signal?: AbortSignal;
  onPhaseChange?: (input: {
    status: BinaryBuildStatus;
    phase: BinaryBuildPhase;
    progress: number;
    message?: string;
  }) => Promise<void> | void;
  onPlanUpdated?: (plan: BinaryPlanPreview) => Promise<void> | void;
  onGenerationDelta?: (delta: BinaryGenerationDelta) => Promise<void> | void;
  onFileUpdated?: (file: BinaryPreviewFile) => Promise<void> | void;
  onLogChunk?: (input: { stream: BinaryLogStream; chunk: string }) => Promise<void> | void;
  onReliability?: (input: {
    kind: BinaryReliabilityKind;
    report: BinaryValidationReport;
  }) => Promise<void> | void;
  onSourceGraph?: (sourceGraph: BinarySourceGraph) => Promise<void> | void;
  onExecution?: (execution: BinaryExecutionState) => Promise<void> | void;
  onArtifactState?: (state: BinaryArtifactState) => Promise<void> | void;
  onCheckpoint?: (checkpoint: BinaryBuildCheckpoint) => Promise<void> | void;
  onArtifactReady?: (input: { artifact: BinaryArtifactMetadata; manifest: BinaryManifest }) => Promise<void> | void;
  onInterruptAccepted?: (input: {
    action: "cancel" | "refine";
    message?: string;
    pendingRefinement?: BinaryPendingRefinement | null;
  }) => Promise<void> | void;
  pullControlAction?: () => Promise<BinaryStreamingControlAction | null> | BinaryStreamingControlAction | null;
};

class BuildCanceledError extends Error {
  constructor(message = "Binary build canceled.") {
    super(message);
    this.name = "BuildCanceledError";
  }
}

function nowIso(): string {
  return new Date().toISOString();
}

function sha256Text(value: string): string {
  return crypto.createHash("sha256").update(value).digest("hex");
}

async function sha256File(filePath: string): Promise<string> {
  const buffer = await fs.readFile(filePath);
  return crypto.createHash("sha256").update(buffer).digest("hex");
}

function detectLanguage(filePath: string): string | undefined {
  const normalized = String(filePath || "").toLowerCase();
  if (normalized.endsWith(".ts") || normalized.endsWith(".tsx")) return "typescript";
  if (normalized.endsWith(".js") || normalized.endsWith(".jsx")) return "javascript";
  if (normalized.endsWith(".json")) return "json";
  if (normalized.endsWith(".md")) return "markdown";
  return undefined;
}

function capLogChunk(value: string): string {
  return String(value || "").replace(/\r\n/g, "\n").trim().slice(0, 4_000);
}

function assertNotCanceled(signal?: AbortSignal): void {
  if (signal?.aborted) throw new BuildCanceledError();
}

async function ensureDir(dir: string): Promise<void> {
  await fs.mkdir(dir, { recursive: true });
}

function toPreviewFile(relativePath: string, content: string, completed = true): BinaryPreviewFile {
  return {
    path: relativePath.replace(/\\/g, "/"),
    language: detectLanguage(relativePath),
    preview: String(content || "").slice(0, 8_000),
    hash: sha256Text(content),
    completed,
    updatedAt: nowIso(),
  };
}

function mergePreviewFiles(existing: BinaryPreviewFile[], nextFile: BinaryPreviewFile): BinaryPreviewFile[] {
  return [nextFile, ...existing.filter((file) => file.path !== nextFile.path)].slice(0, 24);
}

function createCheckpoint(input: {
  buildId: string;
  phase: BinaryBuildPhase;
  label?: string;
  preview: {
    plan: BinaryPlanPreview | null;
    files: BinaryPreviewFile[];
    recentLogs: string[];
  };
  manifest?: BinaryManifest | null;
  reliability?: BinaryValidationReport | null;
  liveReliability?: BinaryLiveReliabilityState | null;
  artifactState?: BinaryArtifactState | null;
  sourceGraph?: BinarySourceGraph | null;
  astState?: BinaryAstState | null;
  execution?: BinaryExecutionState | null;
  runtimeState?: BinaryRuntimeState | null;
  snapshot?: BinarySnapshotSummary | null;
  artifact?: BinaryArtifactMetadata | null;
}): BinaryBuildCheckpoint {
  return {
    id: `chk_${input.phase}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`,
    buildId: input.buildId,
    phase: input.phase,
    savedAt: nowIso(),
    ...(input.label ? { label: input.label } : {}),
    preview: {
      plan: input.preview.plan,
      files: input.preview.files.slice(0, 24),
      recentLogs: input.preview.recentLogs.slice(-80),
    },
    manifest: input.manifest || null,
    reliability: input.reliability || null,
    liveReliability: input.liveReliability || null,
    artifactState: input.artifactState || null,
    sourceGraph: input.sourceGraph || null,
    astState: input.astState || null,
    execution: input.execution || null,
    runtimeState: input.runtimeState || null,
    snapshot: input.snapshot || null,
    artifact: input.artifact || null,
  };
}

async function emitPhase(
  hooks: BinaryStreamingBuildHooks | undefined,
  status: BinaryBuildStatus,
  phase: BinaryBuildPhase,
  progress: number,
  message?: string
): Promise<void> {
  await hooks?.onPhaseChange?.({ status, phase, progress, message });
}

async function emitLog(hooks: BinaryStreamingBuildHooks | undefined, stream: BinaryLogStream, value: string): Promise<void> {
  const normalized = String(value || "").replace(/\r\n/g, "\n");
  const lines = normalized.split("\n").map((line) => capLogChunk(line)).filter(Boolean);
  for (const line of lines) {
    await hooks?.onLogChunk?.({ stream, chunk: line });
  }
}

async function writeDraftFile(workspaceDir: string, relativePath: string, content: string): Promise<void> {
  const absolutePath = path.join(workspaceDir, relativePath);
  await ensureDir(path.dirname(absolutePath));
  await fs.writeFile(absolutePath, content, "utf8");
}

async function maybePullControlAction(hooks: BinaryStreamingBuildHooks | undefined): Promise<BinaryStreamingControlAction | null> {
  const action = await hooks?.pullControlAction?.();
  if (!action) return null;
  if (action.action === "cancel") {
    await hooks?.onInterruptAccepted?.({
      action: "cancel",
      message: "Cancellation requested.",
      pendingRefinement: null,
    });
  }
  return action;
}

type BinaryCommandResult = { exitCode: number; stdout: string; stderr: string };

function npmCommandName(): string {
  return process.platform === "win32" ? "npm.cmd" : "npm";
}

async function runCommand(input: {
  command: string;
  args: string[];
  cwd: string;
  executor?: BinaryBuildExecutor;
  signal?: AbortSignal;
  hooks?: BinaryStreamingBuildHooks;
}): Promise<BinaryCommandResult> {
  assertNotCanceled(input.signal);
  if (input.executor) {
    const result = await input.executor({
      command: input.command,
      args: input.args,
      cwd: input.cwd,
    });
    await emitLog(input.hooks, "stdout", result.stdout || "");
    await emitLog(input.hooks, "stderr", result.stderr || "");
    return result;
  }
  return runBinaryCommand({
    command: input.command,
    args: input.args,
    cwd: input.cwd,
    signal: input.signal,
    onChunk: async ({ stream, chunk }) => {
      await input.hooks?.onLogChunk?.({ stream, chunk });
    },
  });
}

async function listFilesRecursively(rootDir: string): Promise<string[]> {
  const out: string[] = [];
  const entries = await fs.readdir(rootDir, { withFileTypes: true }).catch(() => []);
  for (const entry of entries) {
    const absolutePath = path.join(rootDir, entry.name);
    const relativeName = entry.name.replace(/\\/g, "/");
    if (entry.isDirectory()) {
      if (relativeName === "node_modules") continue;
      const nested = await listFilesRecursively(absolutePath);
      out.push(...nested.map((value) => `${relativeName}/${value}`.replace(/\\/g, "/")));
      continue;
    }
    if (entry.isFile()) out.push(relativeName);
  }
  return out.sort((left, right) => left.localeCompare(right));
}

async function collectZipEntries(rootDir: string): Promise<Array<{ name: string; data: Buffer }>> {
  const entries = await fs.readdir(rootDir, { withFileTypes: true }).catch(() => []);
  const out: Array<{ name: string; data: Buffer }> = [];
  for (const entry of entries) {
    const absolutePath = path.join(rootDir, entry.name);
    const normalizedName = entry.name.replace(/\\/g, "/");
    if (entry.isDirectory()) {
      const nested = await collectZipEntries(absolutePath);
      out.push(...nested.map((item) => ({ name: `${normalizedName}/${item.name}`.replace(/\\/g, "/"), data: item.data })));
      continue;
    }
    if (!entry.isFile()) continue;
    out.push({
      name: normalizedName,
      data: await fs.readFile(absolutePath),
    });
  }
  return out;
}

const CRC_TABLE: number[] = (() => {
  const rows: number[] = [];
  for (let index = 0; index < 256; index += 1) {
    let value = index;
    for (let bit = 0; bit < 8; bit += 1) {
      value = (value & 1) === 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1;
    }
    rows.push(value >>> 0);
  }
  return rows;
})();

function crc32(buffer: Buffer): number {
  let value = 0xffffffff;
  for (const byte of buffer) {
    value = CRC_TABLE[(value ^ byte) & 0xff] ^ (value >>> 8);
  }
  return (value ^ 0xffffffff) >>> 0;
}

async function createStoredZipFromDirectory(rootDir: string, outputPath: string): Promise<void> {
  const entries = await collectZipEntries(rootDir);
  const localParts: Buffer[] = [];
  const centralParts: Buffer[] = [];
  let offset = 0;

  for (const entry of entries) {
    const fileNameBuffer = Buffer.from(entry.name, "utf8");
    const data = entry.data;
    const entryCrc = crc32(data);

    const header = Buffer.alloc(30);
    header.writeUInt32LE(0x04034b50, 0);
    header.writeUInt16LE(20, 4);
    header.writeUInt16LE(0, 6);
    header.writeUInt16LE(0, 8);
    header.writeUInt16LE(0, 10);
    header.writeUInt16LE(0, 12);
    header.writeUInt32LE(entryCrc, 14);
    header.writeUInt32LE(data.length, 18);
    header.writeUInt32LE(data.length, 22);
    header.writeUInt16LE(fileNameBuffer.length, 26);
    header.writeUInt16LE(0, 28);

    const localRecord = Buffer.concat([header, fileNameBuffer, data]);
    localParts.push(localRecord);

    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE(20, 4);
    central.writeUInt16LE(20, 6);
    central.writeUInt16LE(0, 8);
    central.writeUInt16LE(0, 10);
    central.writeUInt16LE(0, 12);
    central.writeUInt16LE(0, 14);
    central.writeUInt32LE(entryCrc, 16);
    central.writeUInt32LE(data.length, 20);
    central.writeUInt32LE(data.length, 24);
    central.writeUInt16LE(fileNameBuffer.length, 28);
    central.writeUInt16LE(0, 30);
    central.writeUInt16LE(0, 32);
    central.writeUInt16LE(0, 34);
    central.writeUInt16LE(0, 36);
    central.writeUInt32LE(0, 38);
    central.writeUInt32LE(offset, 42);
    centralParts.push(Buffer.concat([central, fileNameBuffer]));
    offset += localRecord.length;
  }

  const centralBuffer = Buffer.concat(centralParts);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(0, 4);
  end.writeUInt16LE(0, 6);
  end.writeUInt16LE(entries.length, 8);
  end.writeUInt16LE(entries.length, 10);
  end.writeUInt32LE(centralBuffer.length, 12);
  end.writeUInt32LE(offset, 16);
  end.writeUInt16LE(0, 20);

  await fs.writeFile(outputPath, Buffer.concat([...localParts, centralBuffer, end]));
}

export async function runStreamingBinaryBuild(input: {
  buildId: string;
  request: BinaryBuildRequest;
  executor?: BinaryBuildExecutor;
  hooks?: BinaryStreamingBuildHooks;
  initialFiles?: Record<string, string>;
}): Promise<BinaryStreamingRunResult> {
  const logs: string[] = [];
  const recentLogs: string[] = [];
  const checkpoints: BinaryBuildCheckpoint[] = [];
  const signal = input.hooks?.signal;
  const persistentRoot = getBinaryBuildRootDir(input.buildId);
  const workspaceDir = getBinaryBuildWorkspaceDir(input.buildId);
  const artifactPath = getBinaryArtifactPath(input.buildId);

  let plan: BinaryPlanPreview | null = null;
  let manifestBase: BinaryManifest = {
    buildId: input.buildId,
    artifactKind: "package_bundle",
    name: "binary-package",
    displayName: "Binary Package",
    description: input.request.intent.slice(0, 160) || "Portable Binary IDE starter bundle",
    intent: input.request.intent,
    runtime: input.request.targetEnvironment.runtime,
    platform: input.request.targetEnvironment.platform,
    packageManager: input.request.targetEnvironment.packageManager,
    entrypoint: "dist/index.js",
    installCommand: "npm install",
    buildCommand: "npm run build",
    startCommand: "npm start",
    sourceFiles: [],
    outputFiles: [],
    warnings: [],
    createdAt: nowIso(),
  };
  let draftFiles: Record<string, string> = { ...(input.initialFiles || {}) };
  let previewFiles: BinaryPreviewFile[] = [];
  let sourceGraph: BinarySourceGraph | null = null;
  let execution: BinaryExecutionState | null = null;
  let astState: BinaryAstState | null = null;
  let runtimeState: BinaryRuntimeState | null = null;
  let liveReliability: BinaryLiveReliabilityState | null = null;
  const runtimePatches: BinaryRuntimePatch[] = [];
  const snapshots: BinarySnapshotSummary[] = [];
  let reliability: BinaryValidationReport = await computeBinaryValidationReport({
    workspaceDir,
    manifest: manifestBase,
    targetEnvironment: input.request.targetEnvironment,
    buildSucceeded: true,
    stage: "prebuild",
  });
  let artifactState: BinaryArtifactState = buildBinaryArtifactStateFromGraph({
    plannedSourceFiles: [],
    sourceGraph: null,
    execution: null,
  });
  let latestCheckpointId: string | null = null;
  let latestSnapshotId: string | null = null;
  let effectiveRequest = { ...input.request };

  const recordLog = (value: string) => {
    const entry = String(value || "").trim();
    if (!entry) return;
    logs.push(entry.slice(0, 10_000));
    recentLogs.push(entry.slice(0, 4_000));
    while (recentLogs.length > 80) recentLogs.shift();
  };

  const emitCheckpoint = async (phase: BinaryBuildPhase, label: string, artifact: BinaryArtifactMetadata | null = null) => {
    astState = buildBinaryAstStateFromSourceGraph(sourceGraph);
    runtimeState = buildBinaryRuntimeState({ execution, patches: runtimePatches });
    liveReliability = buildBinaryLiveReliabilityState({
      report: reliability,
      previous: liveReliability,
    });
    const checkpoint = createCheckpoint({
      buildId: input.buildId,
      phase,
      label,
      preview: {
        plan,
        files: previewFiles,
        recentLogs,
      },
      manifest: manifestBase,
      reliability,
      liveReliability,
      artifactState,
      sourceGraph,
      astState,
      execution,
      runtimeState,
      artifact,
    });
    const snapshot = buildBinarySnapshotSummary({
      checkpoint,
      parentSnapshotId: latestSnapshotId,
    });
    checkpoint.snapshot = snapshot;
    checkpoints.push(checkpoint);
    snapshots.push(snapshot);
    latestCheckpointId = checkpoint.id;
    latestSnapshotId = snapshot.id;
    await input.hooks?.onCheckpoint?.(checkpoint);
    await writeBinaryCheckpointSnapshot({
      buildId: input.buildId,
      checkpointId: checkpoint.id,
      savedAt: checkpoint.savedAt,
      draftFiles,
      plan,
      preview: checkpoint.preview || null,
      manifest: manifestBase,
      reliability,
      liveReliability,
      artifactState,
      sourceGraph,
      astState,
      execution,
      runtimeState,
      runtimePatches,
      prompt: effectiveRequest.intent,
      parentSnapshotId: snapshot.parentSnapshotId || null,
      snapshot,
    });
  };

  try {
    await ensureDir(persistentRoot);
    await fs.rm(workspaceDir, { recursive: true, force: true }).catch(() => null);
    await ensureDir(workspaceDir);

    assertNotCanceled(signal);
    await emitPhase(input.hooks, "running", "planning", 10, "Preparing streaming generation plan.");

    while (true) {
      const prepared: BinaryGenerationPreparedWorkspace = await prepareBinaryGenerationWorkspace({
        request: effectiveRequest,
        existingFiles: draftFiles,
      });
      plan = prepared.plan;
      manifestBase = {
        buildId: input.buildId,
        ...prepared.manifestBase,
        sourceFiles: Object.keys(prepared.files).sort((left, right) => left.localeCompare(right)),
        outputFiles: [],
        warnings: prepared.warnings.slice(0, 50),
        createdAt: nowIso(),
      };
      await input.hooks?.onPlanUpdated?.(plan);
      await emitCheckpoint("planning", "Prepared streaming generation plan.");

      const deltas = [];
      for await (const delta of streamBinaryGenerationDeltas({ files: prepared.files })) {
        deltas.push(delta);
      }

      await emitPhase(input.hooks, "running", "materializing", 20, "Streaming generated workspace files.");
      let requestedRefinement: string | null = null;
      for (let index = 0; index < deltas.length; index += 1) {
        assertNotCanceled(signal);
        const pendingAction = await maybePullControlAction(input.hooks);
        if (pendingAction?.action === "cancel") throw new BuildCanceledError();
        if (pendingAction?.action === "refine") {
          requestedRefinement = pendingAction.intent;
          break;
        }

        const delta = deltas[index];
        draftFiles[delta.path] = delta.content;
        await writeDraftFile(workspaceDir, delta.path, delta.content);
        const previewFile = toPreviewFile(delta.path, delta.content, delta.completed);
        previewFiles = mergePreviewFiles(previewFiles, previewFile);
        await input.hooks?.onGenerationDelta?.(delta);
        await input.hooks?.onFileUpdated?.(previewFile);

        sourceGraph = await buildBinarySourceGraph({
          workspaceDir,
          draftFiles,
          plannedSourceFiles: manifestBase.sourceFiles,
        });
        execution = await computeBinaryExecutionState({
          draftFiles,
          sourceGraph,
        });
        reliability = await computeBinaryValidationReport({
          workspaceDir,
          manifest: manifestBase,
          targetEnvironment: input.request.targetEnvironment,
          buildSucceeded: true,
          stage: "live",
          sourceGraph,
          execution,
        });
        artifactState = buildBinaryArtifactStateFromGraph({
          plannedSourceFiles: manifestBase.sourceFiles,
          sourceGraph,
          execution,
          latestFile: delta.path,
        });
        astState = buildBinaryAstStateFromSourceGraph(sourceGraph);
        runtimeState = buildBinaryRuntimeState({ execution, patches: runtimePatches });
        liveReliability = buildBinaryLiveReliabilityState({
          report: reliability,
          previous: liveReliability,
        });

        const progress = 20 + Math.round(((index + 1) / Math.max(1, deltas.length)) * 40);
        await input.hooks?.onSourceGraph?.(sourceGraph);
        await input.hooks?.onExecution?.(execution);
        await input.hooks?.onReliability?.({
          kind: "prebuild",
          report: reliability,
        });
        await input.hooks?.onArtifactState?.(artifactState);
        await emitPhase(input.hooks, "running", "materializing", progress, `Streaming ${delta.path}`);

        recordLog(`${delta.completed ? "Completed" : "Updated"} ${delta.path}`);
        if (delta.completed) {
          await emitCheckpoint("materializing", `Generated ${delta.path}`);
        }
      }

      if (requestedRefinement) {
        const pendingRefinement: BinaryPendingRefinement = {
          intent: requestedRefinement,
          requestedAt: nowIso(),
        };
        await input.hooks?.onInterruptAccepted?.({
          action: "refine",
          message: "Applying refinement to the active streaming build.",
          pendingRefinement,
        });
        recordLog(`Accepted refinement: ${requestedRefinement}`);
        effectiveRequest = {
          ...effectiveRequest,
          intent: `${input.request.intent}\n\nRefinement:\n${requestedRefinement}`.trim(),
        };
        await emitCheckpoint("materializing", "Accepted refinement request.");
        continue;
      }

      break;
    }

    await fs.writeFile(
      path.join(workspaceDir, "binary.manifest.json"),
      JSON.stringify(manifestBase, null, 2),
      "utf8"
    );
    await emitCheckpoint("materializing", "Finished streaming draft workspace.");

    assertNotCanceled(signal);
    await emitPhase(input.hooks, "running", "installing", 70, "Installing draft workspace dependencies.");
    recordLog("Running npm install.");
    const install = await runCommand({
      command: npmCommandName(),
      args: ["install"],
      cwd: workspaceDir,
      executor: input.executor,
      signal,
      hooks: input.hooks,
    });
    recordLog(`npm install exit code ${install.exitCode}.`);
    if (install.exitCode !== 0) {
      throw new Error(`npm install failed: ${install.stderr || install.stdout || "unknown error"}`);
    }

    assertNotCanceled(signal);
    await emitPhase(input.hooks, "running", "compiling", 80, "Compiling the streamed workspace.");
    recordLog("Running npm run build.");
    const build = await runCommand({
      command: npmCommandName(),
      args: ["run", "build"],
      cwd: workspaceDir,
      executor: input.executor,
      signal,
      hooks: input.hooks,
    });
    recordLog(`npm run build exit code ${build.exitCode}.`);
    if (build.exitCode !== 0) {
      throw new Error(`npm run build failed: ${build.stderr || build.stdout || "unknown error"}`);
    }

    const outputFiles = await listFilesRecursively(workspaceDir);
    const distOutputs = outputFiles.filter((filePath) => filePath.startsWith("dist/"));
    for (const relativePath of distOutputs.slice(0, 12)) {
      const previewFile = toPreviewFile(relativePath, await fs.readFile(path.join(workspaceDir, relativePath), "utf8"), true);
      previewFiles = mergePreviewFiles(previewFiles, previewFile);
      await input.hooks?.onFileUpdated?.(previewFile);
    }

    manifestBase = {
      ...manifestBase,
      outputFiles,
    };
    await fs.writeFile(
      path.join(workspaceDir, "binary.manifest.json"),
      JSON.stringify(manifestBase, null, 2),
      "utf8"
    );

    assertNotCanceled(signal);
    await emitPhase(input.hooks, "running", "validating", 88, "Recomputing reliability after compile.");
    sourceGraph = await buildBinarySourceGraph({
      workspaceDir,
      draftFiles,
      plannedSourceFiles: manifestBase.sourceFiles,
    });
    execution = await computeBinaryExecutionState({
      draftFiles,
      sourceGraph,
    });
    reliability = await computeBinaryValidationReport({
      workspaceDir,
      manifest: manifestBase,
      targetEnvironment: input.request.targetEnvironment,
      buildSucceeded: true,
      stage: "full",
      sourceGraph,
      execution,
    });
    await input.hooks?.onSourceGraph?.(sourceGraph);
    await input.hooks?.onExecution?.(execution);
    await input.hooks?.onReliability?.({
      kind: "full",
      report: reliability,
    });
    astState = buildBinaryAstStateFromSourceGraph(sourceGraph);
    runtimeState = buildBinaryRuntimeState({ execution, patches: runtimePatches });
    liveReliability = buildBinaryLiveReliabilityState({
      report: reliability,
      previous: liveReliability,
    });

    assertNotCanceled(signal);
    await emitPhase(input.hooks, "running", "packaging", 94, "Packaging the streamed workspace artifact.");
    await createStoredZipFromDirectory(workspaceDir, artifactPath);
    const artifactStats = await fs.stat(artifactPath);
    const artifact: BinaryArtifactMetadata = {
      fileName: path.basename(artifactPath),
      relativePath: path.relative(process.cwd(), artifactPath).replace(/\\/g, "/"),
      sizeBytes: artifactStats.size,
      sha256: await sha256File(artifactPath),
    };
    artifactState = buildBinaryArtifactStateFromGraph({
      plannedSourceFiles: manifestBase.sourceFiles,
      sourceGraph,
      execution,
      outputFilesReady: distOutputs.length,
      latestFile: artifact.fileName,
      packaged: true,
      packagedEntrypoint: manifestBase.entrypoint,
    });
    await input.hooks?.onArtifactState?.(artifactState);
    await input.hooks?.onArtifactReady?.({
      artifact,
      manifest: manifestBase,
    });
    await emitCheckpoint("packaging", "Packaged streamed workspace artifact.", artifact);

    recordLog("Streaming Binary IDE build completed.");
    return {
      status: "completed",
      logs,
      manifest: manifestBase,
      reliability,
      liveReliability,
      artifactState,
      artifact,
      errorMessage: null,
      sourceGraph,
      astState,
      execution,
      runtimeState,
      runtimePatches,
      snapshots,
      checkpoints,
      checkpointId: latestCheckpointId,
      preview: {
        plan,
        files: previewFiles,
        recentLogs,
      },
      draftFiles,
    };
  } catch (error) {
    const canceled = error instanceof BuildCanceledError || signal?.aborted;
    const message = canceled
      ? "Binary build canceled."
      : error instanceof Error
        ? error.message
        : String(error);
    recordLog(message);

    sourceGraph = sourceGraph ||
      (await buildBinarySourceGraph({
        workspaceDir,
        draftFiles,
        plannedSourceFiles: manifestBase.sourceFiles,
      }).catch(() => null));
    execution = execution ||
      (await computeBinaryExecutionState({
        draftFiles,
        sourceGraph,
      }).catch(() => null));
    reliability = await computeBinaryValidationReport({
      workspaceDir,
      manifest: manifestBase,
      targetEnvironment: input.request.targetEnvironment,
      buildSucceeded: false,
      stage: "live",
      sourceGraph,
      execution,
    });
    artifactState = buildBinaryArtifactStateFromGraph({
      plannedSourceFiles: manifestBase.sourceFiles,
      sourceGraph,
      execution,
      latestFile: previewFiles[0]?.path,
    });
    astState = buildBinaryAstStateFromSourceGraph(sourceGraph);
    runtimeState = buildBinaryRuntimeState({ execution, patches: runtimePatches });
    liveReliability = buildBinaryLiveReliabilityState({
      report: reliability,
      previous: liveReliability,
    });
    await Promise.resolve(
      input.hooks?.onReliability?.({
        kind: "prebuild",
        report: reliability,
      })
    ).catch(() => null);
    await Promise.resolve(input.hooks?.onArtifactState?.(artifactState)).catch(() => null);
    await emitCheckpoint(canceled ? "canceled" : "failed", canceled ? "Canceled streaming build." : "Streaming build failed.");

    return {
      status: canceled ? "canceled" : "failed",
      logs,
      manifest: manifestBase,
      reliability,
      liveReliability,
      artifactState,
      artifact: null,
      errorMessage: message,
      sourceGraph,
      astState,
      execution,
      runtimeState,
      runtimePatches,
      snapshots,
      checkpoints,
      checkpointId: latestCheckpointId,
      preview: {
        plan,
        files: previewFiles,
        recentLogs,
      },
      draftFiles,
    };
  }
}

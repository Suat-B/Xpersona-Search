import * as crypto from "node:crypto";
import * as fs from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";
import { spawn } from "node:child_process";
import type {
  BinaryArtifactMetadata,
  BinaryArtifactState,
  BinaryBuildCheckpoint,
  BinaryBuildPhase,
  BinaryBuildRequest,
  BinaryBuildStatus,
  BinaryLogStream,
  BinaryManifest,
  BinaryPlanPreview,
  BinaryPreviewFile,
  BinaryReliabilityKind,
  BinaryValidationReport,
} from "@/lib/binary/contracts";
import { computeBinaryValidationReport } from "@/lib/binary/reliability";
import { getBinaryArtifactPath, getBinaryBuildRootDir, getBinaryBuildWorkspaceDir } from "@/lib/binary/store";
import { synthesizeBinaryWorkspaceSpec } from "@/lib/binary/template";

export type BinaryBuildExecutor = (input: {
  command: string;
  args: string[];
  cwd: string;
}) => Promise<{ exitCode: number; stdout: string; stderr: string }>;

export type BinaryBuildRunResult = {
  status: "completed" | "failed" | "canceled";
  logs: string[];
  manifest: BinaryManifest;
  reliability: BinaryValidationReport;
  artifactState: BinaryArtifactState;
  artifact: BinaryArtifactMetadata | null;
  errorMessage: string | null;
};

export type BinaryBuildHooks = {
  signal?: AbortSignal;
  onPhaseChange?: (input: {
    status: BinaryBuildStatus;
    phase: BinaryBuildPhase;
    progress: number;
    message?: string;
  }) => Promise<void> | void;
  onPlanUpdated?: (plan: BinaryPlanPreview) => Promise<void> | void;
  onFileUpdated?: (file: BinaryPreviewFile) => Promise<void> | void;
  onLogChunk?: (input: { stream: BinaryLogStream; chunk: string }) => Promise<void> | void;
  onReliability?: (input: {
    kind: BinaryReliabilityKind;
    report: BinaryValidationReport;
  }) => Promise<void> | void;
  onArtifactState?: (state: BinaryArtifactState) => Promise<void> | void;
  onCheckpoint?: (checkpoint: BinaryBuildCheckpoint) => Promise<void> | void;
  onArtifactReady?: (input: { artifact: BinaryArtifactMetadata; manifest: BinaryManifest }) => Promise<void> | void;
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

function detectLanguage(filePath: string): string | undefined {
  const normalized = filePath.toLowerCase();
  if (normalized.endsWith(".ts") || normalized.endsWith(".tsx")) return "typescript";
  if (normalized.endsWith(".js") || normalized.endsWith(".jsx")) return "javascript";
  if (normalized.endsWith(".json")) return "json";
  if (normalized.endsWith(".md")) return "markdown";
  if (normalized.endsWith(".txt")) return "text";
  return undefined;
}

function toPreviewFile(relativePath: string, content: string): BinaryPreviewFile {
  return {
    path: relativePath.replace(/\\/g, "/"),
    language: detectLanguage(relativePath),
    preview: String(content || "").slice(0, 8_000),
    hash: sha256Text(content),
    completed: true,
    updatedAt: nowIso(),
  };
}

function buildPlanPreview(input: {
  manifestBase: Omit<BinaryManifest, "buildId" | "createdAt" | "sourceFiles" | "outputFiles" | "warnings">;
  sourceFiles: string[];
  warnings: string[];
}): BinaryPlanPreview {
  return {
    name: input.manifestBase.name,
    displayName: input.manifestBase.displayName,
    description: input.manifestBase.description,
    entrypoint: input.manifestBase.entrypoint,
    buildCommand: input.manifestBase.buildCommand,
    startCommand: input.manifestBase.startCommand,
    sourceFiles: input.sourceFiles,
    warnings: input.warnings,
  };
}

function clampArtifactCoverage(value: number): number {
  return Math.max(0, Math.min(100, Math.round(value)));
}

function buildArtifactState(input: {
  sourceFilesTotal: number;
  sourceFilesReady: number;
  outputFilesReady: number;
  runnable: boolean;
  entryPoints: string[];
  latestFile?: string;
  packaged?: boolean;
}): BinaryArtifactState {
  const totalSources = Math.max(0, input.sourceFilesTotal);
  const readySources = Math.max(0, Math.min(totalSources, input.sourceFilesReady));
  const readyOutputs = Math.max(0, input.outputFilesReady);
  const sourceRatio = totalSources > 0 ? readySources / totalSources : 1;
  const coverageBase = sourceRatio * 58;
  const outputBonus = Math.min(30, readyOutputs * 15);
  const runnableBonus = input.runnable ? 10 : 0;
  const packagedBonus = input.packaged ? 2 : 0;

  return {
    coverage: input.packaged ? 100 : clampArtifactCoverage(coverageBase + outputBonus + runnableBonus + packagedBonus),
    runnable: input.runnable,
    sourceFilesTotal: totalSources,
    sourceFilesReady: readySources,
    outputFilesReady: readyOutputs,
    entryPoints: input.entryPoints.slice(0, 24),
    ...(input.latestFile ? { latestFile: input.latestFile.replace(/\\/g, "/") } : {}),
    updatedAt: nowIso(),
  };
}

function createCheckpoint(input: {
  buildId: string;
  phase: BinaryBuildPhase;
  preview?: {
    plan?: BinaryPlanPreview | null;
    files?: BinaryPreviewFile[];
    recentLogs?: string[];
  } | null;
  manifest?: BinaryManifest | null;
  reliability?: BinaryValidationReport | null;
  artifactState?: BinaryArtifactState | null;
  artifact?: BinaryArtifactMetadata | null;
}): BinaryBuildCheckpoint {
  return {
    id: `chk_${input.phase}_${Date.now().toString(36)}`,
    buildId: input.buildId,
    phase: input.phase,
    savedAt: nowIso(),
    preview: input.preview
      ? {
          plan: input.preview.plan || null,
          files: (input.preview.files || []).slice(0, 24),
          recentLogs: (input.preview.recentLogs || []).slice(-80),
        }
      : null,
    manifest: input.manifest || null,
    reliability: input.reliability || null,
    artifactState: input.artifactState || null,
    artifact: input.artifact || null,
  };
}

async function ensureDir(dir: string): Promise<void> {
  await fs.mkdir(dir, { recursive: true });
}

async function fileExists(filePath: string): Promise<boolean> {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

async function writeWorkspaceFiles(
  workspaceDir: string,
  files: Record<string, string>,
  hooks?: BinaryBuildHooks
): Promise<BinaryPreviewFile[]> {
  const previews: BinaryPreviewFile[] = [];
  const ordered = Object.keys(files).sort((left, right) => left.localeCompare(right));
  for (const relativePath of ordered) {
    const content = files[relativePath];
    const absolutePath = path.join(workspaceDir, relativePath);
    await ensureDir(path.dirname(absolutePath));
    await fs.writeFile(absolutePath, content, "utf8");
    const preview = toPreviewFile(relativePath, content);
    previews.push(preview);
    await hooks?.onFileUpdated?.(preview);
    await hooks?.onArtifactState?.(
      buildArtifactState({
        sourceFilesTotal: ordered.length,
        sourceFilesReady: previews.length,
        outputFilesReady: 0,
        runnable: false,
        entryPoints: [],
        latestFile: preview.path,
      })
    );
  }
  return previews;
}

async function emitOutputFilePreviews(input: {
  workspaceDir: string;
  outputFiles: string[];
  entrypoint: string;
  sourceFilesTotal: number;
  previewFiles?: BinaryPreviewFile[];
  hooks?: BinaryBuildHooks;
}): Promise<BinaryArtifactState> {
  const executableOutputs = input.outputFiles.filter((filePath) => filePath.startsWith("dist/"));
  let latestState = buildArtifactState({
    sourceFilesTotal: input.sourceFilesTotal,
    sourceFilesReady: input.sourceFilesTotal,
    outputFilesReady: executableOutputs.length,
    runnable: executableOutputs.includes(input.entrypoint),
    entryPoints: executableOutputs.includes(input.entrypoint) ? [input.entrypoint] : [],
    latestFile: executableOutputs.at(-1),
  });

  if (!executableOutputs.length) {
    await input.hooks?.onArtifactState?.(latestState);
    return latestState;
  }

  for (let index = 0; index < executableOutputs.length; index += 1) {
    const relativePath = executableOutputs[index];
    const preview = toPreviewFile(relativePath, await fs.readFile(path.join(input.workspaceDir, relativePath), "utf8"));
    input.previewFiles?.push(preview);
    await input.hooks?.onFileUpdated?.(preview);
    latestState = buildArtifactState({
      sourceFilesTotal: input.sourceFilesTotal,
      sourceFilesReady: input.sourceFilesTotal,
      outputFilesReady: index + 1,
      runnable: executableOutputs.slice(0, index + 1).includes(input.entrypoint),
      entryPoints: executableOutputs.slice(0, index + 1).includes(input.entrypoint) ? [input.entrypoint] : [],
      latestFile: preview.path,
    });
    await input.hooks?.onArtifactState?.(latestState);
  }

  return latestState;
}

async function listFilesRecursively(rootDir: string): Promise<string[]> {
  const out: string[] = [];
  const entries = await fs.readdir(rootDir, { withFileTypes: true }).catch(() => []);
  for (const entry of entries) {
    const absolutePath = path.join(rootDir, entry.name);
    if (entry.isDirectory()) {
      const nested = await listFilesRecursively(absolutePath);
      out.push(...nested.map((value) => `${entry.name}/${value}`.replace(/\\/g, "/")));
      continue;
    }
    if (entry.isFile()) out.push(entry.name);
  }
  return out
    .map((value) => value.replace(/\\/g, "/"))
    .sort((left, right) => left.localeCompare(right));
}

async function sha256File(filePath: string): Promise<string> {
  const buffer = await fs.readFile(filePath);
  return crypto.createHash("sha256").update(buffer).digest("hex");
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

async function collectZipEntries(rootDir: string): Promise<Array<{ name: string; data: Buffer }>> {
  const files = await listFilesRecursively(rootDir);
  const out: Array<{ name: string; data: Buffer }> = [];
  for (const relativePath of files) {
    const normalized = relativePath.replace(/\\/g, "/");
    const data = await fs.readFile(path.join(rootDir, relativePath));
    out.push({ name: normalized, data });
  }
  return out;
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

function npmCommandName(): string {
  return process.platform === "win32" ? "npm.cmd" : "npm";
}

type BinaryCommandLaunchAttempt = {
  command: string;
  args: string[];
};

function isWindowsNpmCommand(command: string, platform = process.platform): boolean {
  if (platform !== "win32") return false;
  const normalized = path.basename(String(command || "")).toLowerCase();
  return normalized === "npm" || normalized === "npm.cmd" || normalized === "npm.exe";
}

export function resolveBinaryCommandLaunchAttempts(input: {
  command: string;
  args: string[];
  platform?: NodeJS.Platform;
}): BinaryCommandLaunchAttempt[] {
  const platform = input.platform || process.platform;
  const directAttempt: BinaryCommandLaunchAttempt = {
    command: input.command,
    args: input.args,
  };

  if (!isWindowsNpmCommand(input.command, platform)) {
    return [directAttempt];
  }

  return [
    directAttempt,
    {
      command: "cmd.exe",
      args: ["/d", "/s", "/c", input.command, ...input.args],
    },
  ];
}

function capLogChunk(value: string): string {
  return String(value || "").replace(/\r\n/g, "\n").trim().slice(0, 4_000);
}

function assertNotCanceled(signal?: AbortSignal): void {
  if (signal?.aborted) throw new BuildCanceledError();
}

async function emitPhase(
  hooks: BinaryBuildHooks | undefined,
  status: BinaryBuildStatus,
  phase: BinaryBuildPhase,
  progress: number,
  message?: string
): Promise<void> {
  await hooks?.onPhaseChange?.({ status, phase, progress, message });
}

async function emitLog(hooks: BinaryBuildHooks | undefined, stream: BinaryLogStream, value: string): Promise<void> {
  const normalized = String(value || "").replace(/\r\n/g, "\n");
  const lines = normalized.split("\n").map((line) => capLogChunk(line)).filter(Boolean);
  for (const line of lines) {
    await hooks?.onLogChunk?.({ stream, chunk: line });
  }
}

export async function runBinaryCommand(input: {
  command: string;
  args: string[];
  cwd: string;
  signal?: AbortSignal;
  onChunk?: (input: { stream: BinaryLogStream; chunk: string }) => Promise<void> | void;
}): Promise<{ exitCode: number; stdout: string; stderr: string }> {
  assertNotCanceled(input.signal);

  const attempts = resolveBinaryCommandLaunchAttempts({
    command: input.command,
    args: input.args,
  });

  let lastError: unknown = null;
  for (let index = 0; index < attempts.length; index += 1) {
    const attempt = attempts[index];
    const canRetry = index < attempts.length - 1;
    try {
      return await new Promise((resolve, reject) => {
        let child;
        try {
          child = spawn(attempt.command, attempt.args, {
            cwd: input.cwd,
            windowsHide: true,
            shell: false,
            stdio: ["ignore", "pipe", "pipe"],
          });
        } catch (error) {
          reject(error);
          return;
        }

        let stdout = "";
        let stderr = "";
        let settled = false;

        const cleanupAbort = () => {
          input.signal?.removeEventListener("abort", onAbort);
        };

        const finish = (value: { exitCode: number; stdout: string; stderr: string }) => {
          if (settled) return;
          settled = true;
          cleanupAbort();
          resolve(value);
        };

        const fail = (error: unknown) => {
          if (settled) return;
          settled = true;
          cleanupAbort();
          reject(error);
        };

        const onAbort = () => {
          child.kill();
        };

        input.signal?.addEventListener("abort", onAbort);

        if (!child.stdout || !child.stderr) {
          fail(new Error(`Binary command ${attempt.command} did not expose stdout/stderr pipes.`));
          return;
        }

        child.stdout.setEncoding("utf8");
        child.stderr.setEncoding("utf8");

        child.stdout.on("data", (chunk: string) => {
          stdout += chunk;
          void input.onChunk?.({ stream: "stdout", chunk: capLogChunk(chunk) });
        });
        child.stderr.on("data", (chunk: string) => {
          stderr += chunk;
          void input.onChunk?.({ stream: "stderr", chunk: capLogChunk(chunk) });
        });
        child.on("error", fail);
        child.on("close", (code) => {
          if (input.signal?.aborted) {
            finish({ exitCode: 130, stdout, stderr });
            return;
          }
          finish({ exitCode: typeof code === "number" ? code : 1, stdout, stderr });
        });
      });
    } catch (error) {
      lastError = error;
      const errorCode = error instanceof Error && "code" in error ? String(error.code || "") : "";
      if (!canRetry || (errorCode !== "EINVAL" && errorCode !== "ENOENT")) {
        throw error;
      }
      await input.onChunk?.({
        stream: "system",
        chunk: `Retrying ${input.command} via cmd.exe after Windows spawn ${errorCode || "failure"}.`,
      });
    }
  }

  throw lastError instanceof Error ? lastError : new Error(`Binary command ${input.command} failed to start.`);
}

async function runCommandWithOptionalExecutor(input: {
  command: string;
  args: string[];
  cwd: string;
  executor?: BinaryBuildExecutor;
  signal?: AbortSignal;
  hooks?: BinaryBuildHooks;
}): Promise<{ exitCode: number; stdout: string; stderr: string }> {
  assertNotCanceled(input.signal);
  if (input.executor) {
    const result = await input.executor({
      command: input.command,
      args: input.args,
      cwd: input.cwd,
    });
    await emitLog(input.hooks, "stdout", result.stdout || "");
    await emitLog(input.hooks, "stderr", result.stderr || "");
    assertNotCanceled(input.signal);
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

export async function runPackageBundleBuild(input: {
  buildId: string;
  request: BinaryBuildRequest;
  executor?: BinaryBuildExecutor;
  hooks?: BinaryBuildHooks;
}): Promise<BinaryBuildRunResult> {
  const logs: string[] = [];
  const signal = input.hooks?.signal;
  const spec = synthesizeBinaryWorkspaceSpec(input.request);
  const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "xpersona-binary-"));
  const tempWorkspace = path.join(tempRoot, "workspace");
  const persistentRoot = getBinaryBuildRootDir(input.buildId);
  const persistentWorkspace = getBinaryBuildWorkspaceDir(input.buildId);
  const artifactPath = getBinaryArtifactPath(input.buildId);
  const sourceFiles = Object.keys(spec.sourceFiles).sort((left, right) => left.localeCompare(right));
  const planPreview = buildPlanPreview({
    manifestBase: spec.manifestBase,
    sourceFiles,
    warnings: spec.warnings,
  });

  await ensureDir(tempWorkspace);
  await ensureDir(persistentRoot);

  const manifestBase: BinaryManifest = {
    buildId: input.buildId,
    ...spec.manifestBase,
    sourceFiles,
    outputFiles: [],
    warnings: [...spec.warnings],
    createdAt: nowIso(),
  };

  const previewFiles: BinaryPreviewFile[] = [];
  const recentLogs: string[] = [];
  let artifactState = buildArtifactState({
    sourceFilesTotal: sourceFiles.length,
    sourceFilesReady: 0,
    outputFilesReady: 0,
    runnable: false,
    entryPoints: [],
  });

  const recordLog = (value: string) => {
    const entry = String(value || "").trim();
    if (!entry) return;
    logs.push(entry.slice(0, 10_000));
    recentLogs.push(entry.slice(0, 4_000));
    while (recentLogs.length > 80) recentLogs.shift();
  };

  try {
    assertNotCanceled(signal);
    await emitPhase(input.hooks, "running", "planning", 10, "Synthesizing bundle plan.");
    await input.hooks?.onPlanUpdated?.(planPreview);
    await input.hooks?.onArtifactState?.(artifactState);
    await input.hooks?.onCheckpoint?.(
      createCheckpoint({
        buildId: input.buildId,
        phase: "planning",
        preview: { plan: planPreview, files: previewFiles, recentLogs },
        artifactState,
      })
    );

    assertNotCanceled(signal);
    await emitPhase(input.hooks, "running", "materializing", 25, "Writing starter bundle files.");
    recordLog("Materializing package bundle workspace.");
    await input.hooks?.onLogChunk?.({ stream: "system", chunk: "Materializing package bundle workspace." });
    previewFiles.push(...(await writeWorkspaceFiles(tempWorkspace, spec.sourceFiles, input.hooks)));

    const prebuildReliability = await computeBinaryValidationReport({
      workspaceDir: tempWorkspace,
      manifest: manifestBase,
      targetEnvironment: input.request.targetEnvironment,
      buildSucceeded: true,
      stage: "prebuild",
    });
    await input.hooks?.onReliability?.({ kind: "prebuild", report: prebuildReliability });
    artifactState = buildArtifactState({
      sourceFilesTotal: sourceFiles.length,
      sourceFilesReady: previewFiles.length,
      outputFilesReady: 0,
      runnable: false,
      entryPoints: [],
      latestFile: previewFiles.at(-1)?.path,
    });
    await input.hooks?.onArtifactState?.(artifactState);
    await input.hooks?.onCheckpoint?.(
      createCheckpoint({
        buildId: input.buildId,
        phase: "materializing",
        preview: { plan: planPreview, files: previewFiles, recentLogs },
        manifest: manifestBase,
        reliability: prebuildReliability,
        artifactState,
      })
    );

    assertNotCanceled(signal);
    await emitPhase(input.hooks, "running", "installing", 45, "Installing package dependencies.");
    recordLog("Running npm install.");
    await input.hooks?.onLogChunk?.({ stream: "system", chunk: "Running npm install." });
    const install = await runCommandWithOptionalExecutor({
      command: npmCommandName(),
      args: ["install"],
      cwd: tempWorkspace,
      executor: input.executor,
      signal,
      hooks: input.hooks,
    });
    recordLog(`npm install exit code ${install.exitCode}.`);
    if (install.exitCode !== 0) {
      throw new Error(`npm install failed: ${install.stderr || install.stdout || "unknown error"}`);
    }

    assertNotCanceled(signal);
    await emitPhase(input.hooks, "running", "compiling", 65, "Compiling generated sources.");
    recordLog("Running npm run build.");
    await input.hooks?.onLogChunk?.({ stream: "system", chunk: "Running npm run build." });
    const build = await runCommandWithOptionalExecutor({
      command: npmCommandName(),
      args: ["run", "build"],
      cwd: tempWorkspace,
      executor: input.executor,
      signal,
      hooks: input.hooks,
    });
    recordLog(`npm run build exit code ${build.exitCode}.`);
    if (build.exitCode !== 0) {
      throw new Error(`npm run build failed: ${build.stderr || build.stdout || "unknown error"}`);
    }

    assertNotCanceled(signal);
    await fs.rm(persistentWorkspace, { recursive: true, force: true }).catch(() => null);
    await fs.cp(tempWorkspace, persistentWorkspace, { recursive: true });
    await fs.writeFile(
      path.join(persistentWorkspace, "LAUNCH.txt"),
      "Run `npm install`, `npm run build`, and `npm start` to launch this Binary IDE portable starter bundle.\n",
      "utf8"
    );

    const outputFiles = await listFilesRecursively(persistentWorkspace);
    artifactState = await emitOutputFilePreviews({
      workspaceDir: persistentWorkspace,
      outputFiles,
      entrypoint: manifestBase.entrypoint,
      sourceFilesTotal: sourceFiles.length,
      previewFiles,
      hooks: input.hooks,
    });
    const manifest: BinaryManifest = {
      ...manifestBase,
      outputFiles,
    };
    await fs.writeFile(path.join(persistentWorkspace, "binary.manifest.json"), JSON.stringify(manifest, null, 2), "utf8");

    await emitPhase(input.hooks, "running", "validating", 82, "Scoring full bundle reliability.");
    const reliability = await computeBinaryValidationReport({
      workspaceDir: persistentWorkspace,
      manifest,
      targetEnvironment: input.request.targetEnvironment,
      buildSucceeded: true,
      stage: "full",
    });
    await input.hooks?.onReliability?.({ kind: "full", report: reliability });

    assertNotCanceled(signal);
    await emitPhase(input.hooks, "running", "packaging", 92, "Packaging portable bundle artifact.");
    await createStoredZipFromDirectory(persistentWorkspace, artifactPath);
    const artifactStats = await fs.stat(artifactPath);
    const artifact: BinaryArtifactMetadata = {
      fileName: path.basename(artifactPath),
      relativePath: path.relative(process.cwd(), artifactPath).replace(/\\/g, "/"),
      sizeBytes: artifactStats.size,
      sha256: await sha256File(artifactPath),
    };
    artifactState = buildArtifactState({
      sourceFilesTotal: sourceFiles.length,
      sourceFilesReady: sourceFiles.length,
      outputFilesReady: outputFiles.filter((filePath) => filePath.startsWith("dist/")).length,
      runnable: outputFiles.includes(manifest.entrypoint),
      entryPoints: outputFiles.includes(manifest.entrypoint) ? [manifest.entrypoint] : [],
      latestFile: artifact.fileName,
      packaged: true,
    });
    await input.hooks?.onArtifactState?.(artifactState);
    await input.hooks?.onArtifactReady?.({ artifact, manifest });
    await input.hooks?.onCheckpoint?.(
      createCheckpoint({
        buildId: input.buildId,
        phase: "packaging",
        preview: { plan: planPreview, files: previewFiles, recentLogs },
        manifest,
        reliability,
        artifactState,
        artifact,
      })
    );

    recordLog("Binary package bundle completed.");
    return {
      status: "completed",
      logs,
      manifest,
      reliability,
      artifactState,
      artifact,
      errorMessage: null,
    };
  } catch (error) {
    const canceled = error instanceof BuildCanceledError || signal?.aborted;
    await fs.rm(persistentWorkspace, { recursive: true, force: true }).catch(() => null);
    await fs.cp(tempWorkspace, persistentWorkspace, { recursive: true }).catch(() => null);
    await fs.writeFile(
      path.join(persistentWorkspace, "binary.manifest.json"),
      JSON.stringify(manifestBase, null, 2),
      "utf8"
    ).catch(() => null);

    const stage = (await fileExists(path.join(persistentWorkspace, manifestBase.entrypoint))) ? "full" : "prebuild";
    const reliability = await computeBinaryValidationReport({
      workspaceDir: persistentWorkspace,
      manifest: manifestBase,
      targetEnvironment: input.request.targetEnvironment,
      buildSucceeded: false,
      stage,
    });
    const failedFiles = await listFilesRecursively(persistentWorkspace).catch(() => [] as string[]);
    artifactState = buildArtifactState({
      sourceFilesTotal: sourceFiles.length,
      sourceFilesReady: previewFiles.filter((file) => !file.path.startsWith("dist/")).length,
      outputFilesReady: failedFiles.filter((filePath) => filePath.startsWith("dist/")).length,
      runnable: failedFiles.includes(manifestBase.entrypoint),
      entryPoints: failedFiles.includes(manifestBase.entrypoint) ? [manifestBase.entrypoint] : [],
      latestFile: previewFiles.at(-1)?.path,
    });
    try {
      await input.hooks?.onArtifactState?.(artifactState);
    } catch {
      // Ignore secondary artifact-state emit failures during terminal cleanup.
    }

    const message = canceled
      ? "Binary build canceled."
      : error instanceof Error
        ? error.message
        : String(error);
    recordLog(message);

    await input.hooks?.onCheckpoint?.(
      createCheckpoint({
        buildId: input.buildId,
        phase: canceled ? "canceled" : "failed",
        preview: { plan: planPreview, files: previewFiles, recentLogs },
        manifest: manifestBase,
        reliability,
        artifactState,
      })
    );

    return {
      status: canceled ? "canceled" : "failed",
      logs,
      manifest: manifestBase,
      reliability,
      artifactState,
      artifact: null,
      errorMessage: message,
    };
  } finally {
    await fs.rm(tempRoot, { recursive: true, force: true }).catch(() => null);
  }
}

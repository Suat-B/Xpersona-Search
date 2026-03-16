import * as crypto from "node:crypto";
import * as fs from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";
import { promisify } from "node:util";
import { execFile } from "node:child_process";
import type {
  BinaryArtifactMetadata,
  BinaryBuildRequest,
  BinaryManifest,
  BinaryValidationReport,
} from "@/lib/binary/contracts";
import { computeBinaryValidationReport } from "@/lib/binary/reliability";
import { getBinaryArtifactPath, getBinaryBuildRootDir, getBinaryBuildWorkspaceDir } from "@/lib/binary/store";
import { synthesizeBinaryWorkspaceSpec } from "@/lib/binary/template";

const execFileAsync = promisify(execFile);

export type BinaryBuildExecutor = (input: {
  command: string;
  args: string[];
  cwd: string;
}) => Promise<{ exitCode: number; stdout: string; stderr: string }>;

export type BinaryBuildRunResult = {
  status: "completed" | "failed";
  logs: string[];
  manifest: BinaryManifest;
  reliability: BinaryValidationReport;
  artifact: BinaryArtifactMetadata | null;
  errorMessage: string | null;
};

function nowIso(): string {
  return new Date().toISOString();
}

async function ensureDir(dir: string): Promise<void> {
  await fs.mkdir(dir, { recursive: true });
}

async function writeWorkspaceFiles(workspaceDir: string, files: Record<string, string>): Promise<void> {
  for (const [relativePath, content] of Object.entries(files)) {
    const absolutePath = path.join(workspaceDir, relativePath);
    await ensureDir(path.dirname(absolutePath));
    await fs.writeFile(absolutePath, content, "utf8");
  }
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

export async function runBinaryCommand(input: {
  command: string;
  args: string[];
  cwd: string;
}): Promise<{ exitCode: number; stdout: string; stderr: string }> {
  try {
    const { stdout, stderr } = await execFileAsync(input.command, input.args, {
      cwd: input.cwd,
      windowsHide: true,
      maxBuffer: 4_000_000,
      shell: false,
    });
    return {
      exitCode: 0,
      stdout: String(stdout || ""),
      stderr: String(stderr || ""),
    };
  } catch (error) {
    const typed = error as { code?: number; stdout?: string; stderr?: string };
    return {
      exitCode: typeof typed.code === "number" ? typed.code : 1,
      stdout: String(typed.stdout || ""),
      stderr: String(typed.stderr || ""),
    };
  }
}

function npmCommandName(): string {
  return process.platform === "win32" ? "npm.cmd" : "npm";
}

export async function runPackageBundleBuild(input: {
  buildId: string;
  request: BinaryBuildRequest;
  executor?: BinaryBuildExecutor;
}): Promise<BinaryBuildRunResult> {
  const logs: string[] = [];
  const executor = input.executor || runBinaryCommand;
  const spec = synthesizeBinaryWorkspaceSpec(input.request);
  const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "xpersona-binary-"));
  const tempWorkspace = path.join(tempRoot, "workspace");
  const persistentRoot = getBinaryBuildRootDir(input.buildId);
  const persistentWorkspace = getBinaryBuildWorkspaceDir(input.buildId);
  const artifactPath = getBinaryArtifactPath(input.buildId);
  await ensureDir(tempWorkspace);
  await ensureDir(persistentRoot);

  const manifestBase: BinaryManifest = {
    buildId: input.buildId,
    ...spec.manifestBase,
    sourceFiles: Object.keys(spec.sourceFiles).sort((left, right) => left.localeCompare(right)),
    outputFiles: [],
    warnings: [...spec.warnings],
    createdAt: nowIso(),
  };

  try {
    logs.push("Materializing package bundle workspace.");
    await writeWorkspaceFiles(tempWorkspace, spec.sourceFiles);

    const npm = npmCommandName();
    logs.push("Running npm install.");
    const install = await executor({ command: npm, args: ["install"], cwd: tempWorkspace });
    logs.push(`npm install exit code ${install.exitCode}.`);
    if (install.stdout.trim()) logs.push(install.stdout.trim().slice(0, 10_000));
    if (install.stderr.trim()) logs.push(install.stderr.trim().slice(0, 10_000));
    if (install.exitCode !== 0) {
      throw new Error(`npm install failed: ${install.stderr || install.stdout || "unknown error"}`);
    }

    logs.push("Running npm run build.");
    const build = await executor({ command: npm, args: ["run", "build"], cwd: tempWorkspace });
    logs.push(`npm run build exit code ${build.exitCode}.`);
    if (build.stdout.trim()) logs.push(build.stdout.trim().slice(0, 10_000));
    if (build.stderr.trim()) logs.push(build.stderr.trim().slice(0, 10_000));
    if (build.exitCode !== 0) {
      throw new Error(`npm run build failed: ${build.stderr || build.stdout || "unknown error"}`);
    }

    await fs.rm(persistentWorkspace, { recursive: true, force: true }).catch(() => null);
    await fs.cp(tempWorkspace, persistentWorkspace, { recursive: true });

    await fs.writeFile(
      path.join(persistentWorkspace, "LAUNCH.txt"),
      "Run `npm install`, `npm run build`, and `npm start` to launch this Binary IDE portable starter bundle.\n",
      "utf8"
    );

    const outputFiles = await listFilesRecursively(persistentWorkspace);
    const manifest: BinaryManifest = {
      ...manifestBase,
      outputFiles,
    };
    await fs.writeFile(path.join(persistentWorkspace, "binary.manifest.json"), JSON.stringify(manifest, null, 2), "utf8");

    await createStoredZipFromDirectory(persistentWorkspace, artifactPath);
    const artifactStats = await fs.stat(artifactPath);
    const artifact: BinaryArtifactMetadata = {
      fileName: path.basename(artifactPath),
      relativePath: path.relative(process.cwd(), artifactPath).replace(/\\/g, "/"),
      sizeBytes: artifactStats.size,
      sha256: await sha256File(artifactPath),
    };

    const reliability = await computeBinaryValidationReport({
      workspaceDir: persistentWorkspace,
      manifest,
      targetEnvironment: input.request.targetEnvironment,
      buildSucceeded: true,
    });

    logs.push("Binary package bundle completed.");
    return {
      status: "completed",
      logs,
      manifest,
      reliability,
      artifact,
      errorMessage: null,
    };
  } catch (error) {
    await fs.rm(persistentWorkspace, { recursive: true, force: true }).catch(() => null);
    await fs.cp(tempWorkspace, persistentWorkspace, { recursive: true }).catch(() => null);
    await fs.writeFile(
      path.join(persistentWorkspace, "binary.manifest.json"),
      JSON.stringify(manifestBase, null, 2),
      "utf8"
    ).catch(() => null);
    const reliability = await computeBinaryValidationReport({
      workspaceDir: persistentWorkspace,
      manifest: manifestBase,
      targetEnvironment: input.request.targetEnvironment,
      buildSucceeded: false,
    });
    logs.push(error instanceof Error ? error.message : String(error));
    return {
      status: "failed",
      logs,
      manifest: manifestBase,
      reliability,
      artifact: null,
      errorMessage: error instanceof Error ? error.message : String(error),
    };
  } finally {
    await fs.rm(tempRoot, { recursive: true, force: true }).catch(() => null);
  }
}

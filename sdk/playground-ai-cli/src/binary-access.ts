import { createHash, randomUUID } from "node:crypto";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import process from "node:process";
import type {
  BinaryAnalysisResult,
  BinaryChunkResult,
  BinaryMutationReceipt,
  BinaryPatchPlan,
  BinaryTargetDescriptor,
} from "./types.js";

export type BinaryRiskClass = "low" | "high" | "critical";
export type BinaryArtifactKind =
  | "regular_file"
  | "executable"
  | "shared_library"
  | "archive"
  | "document"
  | "image"
  | "disk_image"
  | "firmware"
  | "raw_device"
  | "system_file"
  | "unknown";

type BinaryTargetScope = "workspace" | "machine";

type ResolvedBinaryTarget = {
  inputPath: string;
  absolutePath: string;
  displayPath: string;
  scope: BinaryTargetScope;
};

type BinaryFormatInfo = {
  formatFamily: string;
  mime: string;
  artifactKind: BinaryArtifactKind;
};

type BinaryMutationPolicy = {
  blocked: boolean;
  approvalRequired: boolean;
  message?: string;
};

type SearchPatternResult = {
  bytes: Buffer;
  encoding: "hex" | "utf8" | "base64";
  normalizedPattern: string;
};

export type SearchBinaryMatch = {
  offset: number;
  length: number;
  hexPreview: string;
  asciiPreview: string;
};

export const MAX_BINARY_READ_BYTES = 64 * 1024;
export const MAX_BINARY_ANALYZE_BYTES = 128 * 1024;
export const MAX_BINARY_SEARCH_BYTES = 2 * 1024 * 1024;
const MAX_BINARY_PREVIEW_BYTES = 256;
const MAX_STRINGS_SAMPLE = 16;
const STRINGS_MIN_LENGTH = 4;

const EXECUTABLE_EXTENSIONS = new Set([
  ".exe",
  ".com",
  ".msi",
  ".app",
  ".apk",
]);
const SHARED_LIBRARY_EXTENSIONS = new Set([
  ".dll",
  ".so",
  ".dylib",
  ".ocx",
]);
const SCRIPT_EXTENSIONS = new Set([
  ".bat",
  ".cmd",
  ".ps1",
  ".sh",
  ".bash",
  ".zsh",
  ".ksh",
  ".py",
  ".rb",
  ".pl",
  ".command",
]);
const DISK_IMAGE_EXTENSIONS = new Set([
  ".iso",
  ".img",
  ".dmg",
  ".vhd",
  ".vhdx",
  ".qcow",
  ".qcow2",
]);
const FIRMWARE_EXTENSIONS = new Set([
  ".uf2",
  ".rom",
  ".fw",
  ".firmware",
  ".hex",
]);
const ARCHIVE_EXTENSIONS = new Set([
  ".zip",
  ".jar",
  ".tar",
  ".gz",
  ".tgz",
  ".bz2",
  ".xz",
  ".7z",
  ".rar",
]);
const DOCUMENT_EXTENSIONS = new Set([
  ".pdf",
  ".doc",
  ".docx",
  ".xls",
  ".xlsx",
  ".ppt",
  ".pptx",
]);
const IMAGE_EXTENSIONS = new Set([
  ".png",
  ".jpg",
  ".jpeg",
  ".gif",
  ".webp",
  ".bmp",
  ".ico",
]);
const STRONGLY_BINARY_EXTENSIONS = new Set([
  ...EXECUTABLE_EXTENSIONS,
  ...SHARED_LIBRARY_EXTENSIONS,
  ...DISK_IMAGE_EXTENSIONS,
  ...FIRMWARE_EXTENSIONS,
  ...ARCHIVE_EXTENSIONS,
  ...IMAGE_EXTENSIONS,
  ".bin",
  ".dat",
  ".woff",
  ".woff2",
  ".ttf",
  ".otf",
  ".class",
  ".wasm",
  ".sqlite",
  ".db",
]);

function normalizeDisplayPath(inputPath: string): string {
  return String(inputPath || "").trim().replace(/\\/g, "/");
}

function isUnderPath(parentPath: string, targetPath: string): boolean {
  const relative = path.relative(parentPath, targetPath);
  return relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative));
}

function binarySnapshotsDir(): string {
  return path.join(os.tmpdir(), "binary-ide-binary-snapshots");
}

function isWindowsRawDevicePath(targetPath: string): boolean {
  return /^\\\\\.\\/.test(targetPath) || /^\\\\\?\\GLOBALROOT\\/i.test(targetPath);
}

function isUnixRawDevicePath(targetPath: string): boolean {
  return /^\/dev\//.test(targetPath);
}

export function isRawDevicePath(targetPath: string): boolean {
  const resolved = path.resolve(String(targetPath || ""));
  return process.platform === "win32" ? isWindowsRawDevicePath(resolved) : isUnixRawDevicePath(resolved);
}

export function looksLikeBinaryPath(inputPath: string): boolean {
  const extension = path.extname(String(inputPath || "").trim()).toLowerCase();
  return STRONGLY_BINARY_EXTENSIONS.has(extension);
}

function getProtectedRoots(): string[] {
  if (process.platform === "win32") {
    const roots = [
      process.env.SystemRoot || "C:\\Windows",
      process.env.ProgramFiles || "C:\\Program Files",
      process.env["ProgramFiles(x86)"] || "C:\\Program Files (x86)",
      process.env.ProgramData || "C:\\ProgramData",
    ];
    return roots.map((item) => path.resolve(item));
  }
  return [
    "/System",
    "/Library",
    "/Applications",
    "/usr",
    "/bin",
    "/sbin",
    "/etc",
    "/private/etc",
  ].map((item) => path.resolve(item));
}

function isProtectedSystemPath(targetPath: string): boolean {
  const resolved = path.resolve(targetPath);
  return getProtectedRoots().some((rootPath) => isUnderPath(rootPath, resolved));
}

function detectFormatFromBytes(buffer: Buffer, targetPath: string): BinaryFormatInfo {
  const extension = path.extname(targetPath).toLowerCase();
  if (buffer.length >= 2 && buffer[0] === 0x4d && buffer[1] === 0x5a) {
    return { formatFamily: "pe", mime: "application/vnd.microsoft.portable-executable", artifactKind: "executable" };
  }
  if (buffer.length >= 4 && buffer[0] === 0x7f && buffer[1] === 0x45 && buffer[2] === 0x4c && buffer[3] === 0x46) {
    return { formatFamily: "elf", mime: "application/x-elf", artifactKind: "executable" };
  }
  const machOMagics = new Set(["feedface", "feedfacf", "cefaedfe", "cffaedfe", "cafebabe"]);
  if (buffer.length >= 4 && machOMagics.has(buffer.subarray(0, 4).toString("hex"))) {
    return { formatFamily: "mach-o", mime: "application/x-mach-binary", artifactKind: "executable" };
  }
  if (buffer.length >= 4 && buffer[0] === 0x50 && buffer[1] === 0x4b) {
    return { formatFamily: "zip", mime: "application/zip", artifactKind: "archive" };
  }
  if (buffer.length >= 4 && buffer[0] === 0x25 && buffer[1] === 0x50 && buffer[2] === 0x44 && buffer[3] === 0x46) {
    return { formatFamily: "pdf", mime: "application/pdf", artifactKind: "document" };
  }
  if (
    buffer.length >= 8 &&
    buffer[0] === 0x89 &&
    buffer[1] === 0x50 &&
    buffer[2] === 0x4e &&
    buffer[3] === 0x47
  ) {
    return { formatFamily: "png", mime: "image/png", artifactKind: "image" };
  }
  if (buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) {
    return { formatFamily: "jpeg", mime: "image/jpeg", artifactKind: "image" };
  }

  if (SHARED_LIBRARY_EXTENSIONS.has(extension)) {
    return { formatFamily: "shared_library", mime: "application/octet-stream", artifactKind: "shared_library" };
  }
  if (DISK_IMAGE_EXTENSIONS.has(extension)) {
    return { formatFamily: "disk_image", mime: "application/octet-stream", artifactKind: "disk_image" };
  }
  if (FIRMWARE_EXTENSIONS.has(extension)) {
    return { formatFamily: "firmware", mime: "application/octet-stream", artifactKind: "firmware" };
  }
  if (ARCHIVE_EXTENSIONS.has(extension)) {
    return { formatFamily: "archive", mime: "application/octet-stream", artifactKind: "archive" };
  }
  if (DOCUMENT_EXTENSIONS.has(extension)) {
    return { formatFamily: "document", mime: "application/octet-stream", artifactKind: "document" };
  }
  if (IMAGE_EXTENSIONS.has(extension)) {
    return { formatFamily: "image", mime: "application/octet-stream", artifactKind: "image" };
  }
  if (EXECUTABLE_EXTENSIONS.has(extension)) {
    return { formatFamily: "executable", mime: "application/octet-stream", artifactKind: "executable" };
  }
  if (SCRIPT_EXTENSIONS.has(extension)) {
    return { formatFamily: "script", mime: "text/plain", artifactKind: "regular_file" };
  }
  return {
    formatFamily: looksLikeBinaryPath(targetPath) ? "unknown" : "regular_file",
    mime: "application/octet-stream",
    artifactKind: looksLikeBinaryPath(targetPath) ? "unknown" : "regular_file",
  };
}

function previewHex(buffer: Buffer): string {
  return Array.from(buffer.subarray(0, MAX_BINARY_PREVIEW_BYTES))
    .map((value) => value.toString(16).padStart(2, "0"))
    .join(" ");
}

function previewAscii(buffer: Buffer): string {
  return Array.from(buffer.subarray(0, MAX_BINARY_PREVIEW_BYTES))
    .map((value) => (value >= 32 && value <= 126 ? String.fromCharCode(value) : "."))
    .join("");
}

function estimateEntropy(buffer: Buffer): number {
  if (!buffer.length) return 0;
  const counts = new Array<number>(256).fill(0);
  for (const value of buffer) counts[value] += 1;
  let entropy = 0;
  for (const count of counts) {
    if (!count) continue;
    const probability = count / buffer.length;
    entropy -= probability * Math.log2(probability);
  }
  return Math.round(entropy * 100) / 100;
}

function extractStrings(buffer: Buffer): string[] {
  const text = buffer
    .toString("latin1")
    .replace(/[^\x20-\x7e]+/g, "\n")
    .split("\n")
    .map((item) => item.trim())
    .filter((item) => item.length >= STRINGS_MIN_LENGTH);
  return Array.from(new Set(text)).slice(0, MAX_STRINGS_SAMPLE);
}

async function sha256ForBuffer(buffer: Buffer): Promise<string> {
  return createHash("sha256").update(buffer).digest("hex");
}

async function sha256ForFile(targetPath: string): Promise<string> {
  const handle = await fs.open(targetPath, "r");
  const hash = createHash("sha256");
  try {
    const buffer = Buffer.alloc(64 * 1024);
    while (true) {
      const { bytesRead } = await handle.read(buffer, 0, buffer.length, null);
      if (!bytesRead) break;
      hash.update(buffer.subarray(0, bytesRead));
    }
    return hash.digest("hex");
  } finally {
    await handle.close();
  }
}

async function readPrefix(targetPath: string, limit: number): Promise<Buffer> {
  const handle = await fs.open(targetPath, "r");
  try {
    const buffer = Buffer.alloc(Math.max(1, limit));
    const { bytesRead } = await handle.read(buffer, 0, buffer.length, 0);
    return buffer.subarray(0, bytesRead);
  } finally {
    await handle.close();
  }
}

function toBinaryMutationPolicy(
  descriptor: Pick<BinaryTargetDescriptor, "riskClass" | "artifactKind">,
  approved?: boolean
): BinaryMutationPolicy {
  if (descriptor.riskClass === "critical") {
    return {
      blocked: true,
      approvalRequired: true,
      message: "Critical binary targets require explicit approval and are blocked in autonomous mode.",
    };
  }
  if (descriptor.riskClass === "high" && approved !== true) {
    return {
      blocked: true,
      approvalRequired: true,
      message: "High-risk binary mutations require explicit approval and dry-run proof.",
    };
  }
  return {
    blocked: false,
    approvalRequired: descriptor.riskClass === "high",
  };
}

export function classifyBinaryRisk(targetPath: string, isExecutable: boolean, artifactKind: BinaryArtifactKind): BinaryRiskClass {
  if (isRawDevicePath(targetPath) || isProtectedSystemPath(targetPath)) return "critical";
  if (artifactKind === "disk_image" || artifactKind === "firmware" || artifactKind === "system_file") return "critical";
  if (isExecutable || artifactKind === "executable" || artifactKind === "shared_library") return "high";
  return "low";
}

export async function resolveBinaryTarget(
  workspaceRoot: string,
  inputPath: string
): Promise<ResolvedBinaryTarget | null> {
  const raw = String(inputPath || "").trim();
  if (!raw) return null;
  const absolutePath = path.isAbsolute(raw) ? path.resolve(raw) : path.resolve(workspaceRoot || process.cwd(), raw);
  const resolvedWorkspaceRoot = path.resolve(workspaceRoot || process.cwd());
  const scope: BinaryTargetScope = isUnderPath(resolvedWorkspaceRoot, absolutePath) ? "workspace" : "machine";
  const displayPath =
    scope === "workspace" ? normalizeDisplayPath(path.relative(resolvedWorkspaceRoot, absolutePath)) : absolutePath;
  return {
    inputPath: raw,
    absolutePath,
    displayPath: displayPath || path.basename(absolutePath),
    scope,
  };
}

async function detectExecutable(targetPath: string, stats: Awaited<ReturnType<typeof fs.stat>>): Promise<boolean> {
  const extension = path.extname(targetPath).toLowerCase();
  if (EXECUTABLE_EXTENSIONS.has(extension) || SHARED_LIBRARY_EXTENSIONS.has(extension) || SCRIPT_EXTENSIONS.has(extension)) {
    return true;
  }
  return process.platform !== "win32" && (Number(stats.mode) & 0o111) !== 0;
}

export async function describeBinaryTarget(workspaceRoot: string, inputPath: string): Promise<BinaryTargetDescriptor | null> {
  const resolved = await resolveBinaryTarget(workspaceRoot, inputPath);
  if (!resolved) return null;
  if (isRawDevicePath(resolved.absolutePath)) {
    return {
      path: resolved.displayPath,
      absolutePath: resolved.absolutePath,
      scope: resolved.scope,
      exists: true,
      isRegularFile: false,
      isExecutable: false,
      mime: "application/octet-stream",
      size: null,
      sha256: null,
      formatFamily: "raw_device",
      artifactKind: "raw_device",
      riskClass: "critical",
    };
  }

  try {
    const stats = await fs.stat(resolved.absolutePath);
    const isRegularFile = stats.isFile();
    const prefix = isRegularFile ? await readPrefix(resolved.absolutePath, Math.min(MAX_BINARY_ANALYZE_BYTES, stats.size)) : Buffer.alloc(0);
    const format = detectFormatFromBytes(prefix, resolved.absolutePath);
    const isExecutable = isRegularFile ? await detectExecutable(resolved.absolutePath, stats) : false;
    const artifactKind = isProtectedSystemPath(resolved.absolutePath) ? "system_file" : format.artifactKind;
    return {
      path: resolved.displayPath,
      absolutePath: resolved.absolutePath,
      scope: resolved.scope,
      exists: true,
      isRegularFile,
      isExecutable,
      mime: format.mime,
      size: isRegularFile ? stats.size : null,
      sha256: isRegularFile ? await sha256ForFile(resolved.absolutePath) : null,
      formatFamily: format.formatFamily,
      artifactKind,
      riskClass: classifyBinaryRisk(resolved.absolutePath, isExecutable, artifactKind),
    };
  } catch {
    const extension = path.extname(resolved.absolutePath).toLowerCase();
    const artifactKind = DISK_IMAGE_EXTENSIONS.has(extension)
      ? "disk_image"
      : FIRMWARE_EXTENSIONS.has(extension)
        ? "firmware"
        : looksLikeBinaryPath(resolved.absolutePath)
          ? "unknown"
          : "regular_file";
    const isExecutable = EXECUTABLE_EXTENSIONS.has(extension) || SHARED_LIBRARY_EXTENSIONS.has(extension) || SCRIPT_EXTENSIONS.has(extension);
    const riskClass =
      isProtectedSystemPath(resolved.absolutePath) || artifactKind === "disk_image" || artifactKind === "firmware"
        ? "critical"
        : isExecutable
          ? "high"
          : "low";
    return {
      path: resolved.displayPath,
      absolutePath: resolved.absolutePath,
      scope: resolved.scope,
      exists: false,
      isRegularFile: false,
      isExecutable,
      mime: "application/octet-stream",
      size: null,
      sha256: null,
      formatFamily: "unknown",
      artifactKind,
      riskClass,
    };
  }
}

export async function isLikelyBinaryFile(workspaceRoot: string, inputPath: string): Promise<boolean> {
  const descriptor = await describeBinaryTarget(workspaceRoot, inputPath);
  if (!descriptor || !descriptor.exists || !descriptor.isRegularFile) return looksLikeBinaryPath(inputPath);
  if (descriptor.artifactKind !== "regular_file" && descriptor.artifactKind !== "document") return true;
  const prefix = await readPrefix(descriptor.absolutePath, 2048).catch(() => Buffer.alloc(0));
  if (!prefix.length) return looksLikeBinaryPath(inputPath);
  let suspicious = 0;
  for (const value of prefix) {
    if (value === 0) return true;
    if (value < 9 || (value > 13 && value < 32)) suspicious += 1;
  }
  return suspicious / prefix.length > 0.2 || looksLikeBinaryPath(inputPath);
}

export function binaryTextToolFailure(pathValue: string): {
  blocked: true;
  summary: string;
  data: Record<string, unknown>;
} {
  return {
    blocked: true,
    summary: `Text tool refused binary target ${pathValue}. Use stat_binary, read_binary_chunk, analyze_binary, or hash_binary instead.`,
    data: {
      path: pathValue,
      recommendedTools: ["stat_binary", "read_binary_chunk", "analyze_binary", "hash_binary"],
      reason: "binary_file_detected",
    },
  };
}

export async function readBinaryChunk(
  workspaceRoot: string,
  inputPath: string,
  offsetInput: number,
  lengthInput: number
): Promise<BinaryChunkResult | null> {
  const descriptor = await describeBinaryTarget(workspaceRoot, inputPath);
  if (!descriptor || !descriptor.exists || !descriptor.isRegularFile || descriptor.size == null) return null;
  const offset = Math.max(0, Number.isFinite(offsetInput) ? Math.floor(offsetInput) : 0);
  const requestedLength = Math.max(1, Number.isFinite(lengthInput) ? Math.floor(lengthInput) : 4096);
  const length = Math.min(MAX_BINARY_READ_BYTES, requestedLength, Math.max(0, descriptor.size - offset));
  const handle = await fs.open(descriptor.absolutePath, "r");
  try {
    const buffer = Buffer.alloc(length);
    const { bytesRead } = await handle.read(buffer, 0, length, offset);
    const chunk = buffer.subarray(0, bytesRead);
    return {
      path: descriptor.path,
      absolutePath: descriptor.absolutePath,
      offset,
      length: bytesRead,
      bytesBase64: chunk.toString("base64"),
      hexPreview: previewHex(chunk),
      asciiPreview: previewAscii(chunk),
      truncated: offset + bytesRead < descriptor.size,
      sha256: await sha256ForBuffer(chunk),
      mime: descriptor.mime,
      isExecutable: descriptor.isExecutable,
      size: descriptor.size,
      riskClass: descriptor.riskClass,
      artifactKind: descriptor.artifactKind,
    };
  } finally {
    await handle.close();
  }
}

function parseSearchPattern(pattern: string, encodingInput?: unknown): SearchPatternResult {
  const raw = String(pattern || "");
  const encoding = String(encodingInput || "").trim().toLowerCase();
  if (encoding === "hex") {
    const normalized = raw.replace(/[^0-9a-f]/gi, "");
    return {
      bytes: Buffer.from(normalized, "hex"),
      encoding: "hex",
      normalizedPattern: normalized.toLowerCase(),
    };
  }
  if (encoding === "base64") {
    return {
      bytes: Buffer.from(raw, "base64"),
      encoding: "base64",
      normalizedPattern: raw,
    };
  }
  return {
    bytes: Buffer.from(raw, "utf8"),
    encoding: "utf8",
    normalizedPattern: raw,
  };
}

function findPatternOffsets(haystack: Buffer, needle: Buffer, limit: number): number[] {
  if (!needle.length) return [];
  const out: number[] = [];
  let offset = 0;
  while (offset <= haystack.length - needle.length && out.length < limit) {
    const nextOffset = haystack.indexOf(needle, offset);
    if (nextOffset < 0) break;
    out.push(nextOffset);
    offset = nextOffset + Math.max(1, needle.length);
  }
  return out;
}

export async function searchBinary(
  workspaceRoot: string,
  inputPath: string,
  pattern: string,
  options?: { encoding?: unknown; limit?: number }
): Promise<{
  descriptor: BinaryTargetDescriptor;
  matches: SearchBinaryMatch[];
  truncated: boolean;
  encoding: string;
  normalizedPattern: string;
} | null> {
  const descriptor = await describeBinaryTarget(workspaceRoot, inputPath);
  if (!descriptor || !descriptor.exists || !descriptor.isRegularFile || descriptor.size == null) return null;
  const limit = Math.max(1, Math.min(50, Number(options?.limit || 10)));
  const searchSpec = parseSearchPattern(pattern, options?.encoding);
  const handle = await fs.open(descriptor.absolutePath, "r");
  try {
    const readLength = Math.min(descriptor.size, MAX_BINARY_SEARCH_BYTES);
    const buffer = Buffer.alloc(readLength);
    const { bytesRead } = await handle.read(buffer, 0, readLength, 0);
    const haystack = buffer.subarray(0, bytesRead);
    const offsets = findPatternOffsets(haystack, searchSpec.bytes, limit);
    return {
      descriptor,
      matches: offsets.map((offset) => {
        const preview = haystack.subarray(offset, Math.min(haystack.length, offset + MAX_BINARY_PREVIEW_BYTES));
        return {
          offset,
          length: searchSpec.bytes.length,
          hexPreview: previewHex(preview),
          asciiPreview: previewAscii(preview),
        };
      }),
      truncated: descriptor.size > readLength,
      encoding: searchSpec.encoding,
      normalizedPattern: searchSpec.normalizedPattern,
    };
  } finally {
    await handle.close();
  }
}

export async function analyzeBinary(workspaceRoot: string, inputPath: string): Promise<BinaryAnalysisResult | null> {
  const descriptor = await describeBinaryTarget(workspaceRoot, inputPath);
  if (!descriptor || !descriptor.exists || !descriptor.isRegularFile) return null;
  const prefix = await readPrefix(descriptor.absolutePath, MAX_BINARY_ANALYZE_BYTES);
  return {
    path: descriptor.path,
    absolutePath: descriptor.absolutePath,
    formatFamily: descriptor.formatFamily,
    mime: descriptor.mime,
    magicBytes: prefix.subarray(0, 16).toString("hex"),
    entropy: estimateEntropy(prefix),
    stringsSample: extractStrings(prefix),
    signatureInfo: {
      status: "not_checked",
      reason: "Platform-specific signature verification is not implemented in this executor.",
    },
    riskClass: descriptor.riskClass,
    artifactKind: descriptor.artifactKind,
    size: descriptor.size,
    isExecutable: descriptor.isExecutable,
    sha256: descriptor.sha256,
  };
}

export async function hashBinary(workspaceRoot: string, inputPath: string): Promise<BinaryTargetDescriptor | null> {
  return await describeBinaryTarget(workspaceRoot, inputPath);
}

async function ensureBinarySnapshot(targetPath: string): Promise<string> {
  const directory = binarySnapshotsDir();
  await fs.mkdir(directory, { recursive: true });
  const snapshotPath = path.join(
    directory,
    `${new Date().toISOString().replace(/[:.]/g, "-")}-${randomUUID()}-${path.basename(targetPath)}`
  );
  await fs.copyFile(targetPath, snapshotPath);
  return snapshotPath;
}

function decodeBinaryPayload(args: {
  bytesBase64?: unknown;
  contentBase64?: unknown;
  dataBase64?: unknown;
  bytesHex?: unknown;
  contentHex?: unknown;
}): Buffer {
  const base64Value = [args.bytesBase64, args.contentBase64, args.dataBase64].find((value) => typeof value === "string" && value.trim());
  if (typeof base64Value === "string" && base64Value.trim()) {
    return Buffer.from(base64Value, "base64");
  }
  const hexValue = [args.bytesHex, args.contentHex].find((value) => typeof value === "string" && value.trim());
  if (typeof hexValue === "string" && hexValue.trim()) {
    return Buffer.from(hexValue.replace(/[^0-9a-f]/gi, ""), "hex");
  }
  throw new Error("Binary mutation requires bytesBase64/contentBase64 or bytesHex/contentHex.");
}

export async function writeBinaryFile(
  workspaceRoot: string,
  inputPath: string,
  args: {
    bytesBase64?: unknown;
    contentBase64?: unknown;
    dataBase64?: unknown;
    bytesHex?: unknown;
    contentHex?: unknown;
    overwrite?: unknown;
    approved?: unknown;
  }
): Promise<{
  descriptor: BinaryTargetDescriptor;
  receipt?: BinaryMutationReceipt;
  policy: BinaryMutationPolicy;
}> {
  const resolved = await resolveBinaryTarget(workspaceRoot, inputPath);
  if (!resolved) throw new Error("Invalid binary path.");
  if (isRawDevicePath(resolved.absolutePath)) {
    return {
      descriptor: {
        path: resolved.displayPath,
        absolutePath: resolved.absolutePath,
        scope: resolved.scope,
        exists: true,
        isRegularFile: false,
        isExecutable: false,
        mime: "application/octet-stream",
        size: null,
        sha256: null,
        formatFamily: "raw_device",
        artifactKind: "raw_device",
        riskClass: "critical",
      },
      policy: {
        blocked: true,
        approvalRequired: true,
        message: "Raw device writes are blocked in v1.",
      },
    };
  }

  const beforeDescriptor = await describeBinaryTarget(workspaceRoot, inputPath);
  if (!beforeDescriptor) throw new Error("Invalid binary path.");
  const extension = path.extname(resolved.absolutePath).toLowerCase();
  const isExecutable = beforeDescriptor.exists ? beforeDescriptor.isExecutable : EXECUTABLE_EXTENSIONS.has(extension) || SHARED_LIBRARY_EXTENSIONS.has(extension) || SCRIPT_EXTENSIONS.has(extension);
  const artifactKind = beforeDescriptor.exists
    ? beforeDescriptor.artifactKind
    : DISK_IMAGE_EXTENSIONS.has(extension)
      ? "disk_image"
      : FIRMWARE_EXTENSIONS.has(extension)
        ? "firmware"
        : isProtectedSystemPath(resolved.absolutePath)
          ? "system_file"
          : isExecutable
            ? SHARED_LIBRARY_EXTENSIONS.has(extension)
              ? "shared_library"
              : "executable"
            : "regular_file";
  const synthesizedDescriptor: BinaryTargetDescriptor = {
    ...beforeDescriptor,
    isExecutable,
    artifactKind,
    riskClass: classifyBinaryRisk(resolved.absolutePath, isExecutable, artifactKind),
  };
  const policy = toBinaryMutationPolicy(synthesizedDescriptor, args.approved === true);
  if (policy.blocked) return { descriptor: synthesizedDescriptor, policy };

  if (beforeDescriptor.exists && !beforeDescriptor.isRegularFile) {
    throw new Error("Binary mutation only supports regular files in v1.");
  }
  const overwrite = args.overwrite !== false;
  if (beforeDescriptor.exists && !overwrite) {
    throw new Error(`Refused to overwrite ${beforeDescriptor.path}.`);
  }

  const nextBytes = decodeBinaryPayload(args);
  const beforeHash = beforeDescriptor.exists && beforeDescriptor.sha256 ? beforeDescriptor.sha256 : null;
  const snapshotPath = beforeDescriptor.exists ? await ensureBinarySnapshot(resolved.absolutePath) : null;
  await fs.mkdir(path.dirname(resolved.absolutePath), { recursive: true });
  await fs.writeFile(resolved.absolutePath, nextBytes);
  const afterDescriptor = await describeBinaryTarget(workspaceRoot, inputPath);
  if (!afterDescriptor || !afterDescriptor.sha256) {
    throw new Error("Binary write completed but could not verify the result.");
  }
  return {
    descriptor: afterDescriptor,
    policy,
    receipt: {
      path: afterDescriptor.path,
      absolutePath: afterDescriptor.absolutePath,
      beforeSha256: beforeHash,
      afterSha256: afterDescriptor.sha256,
      snapshotPath,
      approved: args.approved === true,
      riskClass: afterDescriptor.riskClass,
      artifactKind: afterDescriptor.artifactKind,
      changedByteRanges: nextBytes.length ? [{ offset: 0, length: nextBytes.length }] : [],
    },
  };
}

type BinaryPatchOperationInput = {
  offset?: unknown;
  deleteLength?: unknown;
  bytesBase64?: unknown;
  bytesHex?: unknown;
  contentBase64?: unknown;
  contentHex?: unknown;
};

function normalizePatchOperation(raw: unknown): { offset: number; deleteLength: number; bytes: Buffer } {
  const operation = raw && typeof raw === "object" ? (raw as BinaryPatchOperationInput) : {};
  const offset = Number.isFinite(Number(operation.offset)) ? Math.max(0, Math.floor(Number(operation.offset))) : 0;
  const deleteLength = Number.isFinite(Number(operation.deleteLength))
    ? Math.max(0, Math.floor(Number(operation.deleteLength)))
    : 0;
  const bytes = decodeBinaryPayload({
    bytesBase64: operation.bytesBase64,
    contentBase64: operation.contentBase64,
    bytesHex: operation.bytesHex,
    contentHex: operation.contentHex,
  });
  return { offset, deleteLength, bytes };
}

function applyPatchOperations(before: Buffer, operations: Array<{ offset: number; deleteLength: number; bytes: Buffer }>): {
  next: Buffer;
  changedByteRanges: Array<{ offset: number; length: number }>;
} {
  const ordered = [...operations].sort((left, right) => left.offset - right.offset);
  const chunks: Buffer[] = [];
  const changedByteRanges: Array<{ offset: number; length: number }> = [];
  let cursor = 0;
  for (const operation of ordered) {
    if (operation.offset > before.length) {
      throw new Error(`Patch offset ${operation.offset} is outside the file.`);
    }
    if (operation.offset < cursor) {
      throw new Error("Overlapping binary patch operations are not supported.");
    }
    chunks.push(before.subarray(cursor, operation.offset));
    chunks.push(operation.bytes);
    changedByteRanges.push({
      offset: operation.offset,
      length: Math.max(operation.deleteLength, operation.bytes.length),
    });
    cursor = operation.offset + operation.deleteLength;
    if (cursor > before.length) {
      throw new Error(`Patch deleteLength extends beyond the end of the file at offset ${operation.offset}.`);
    }
  }
  chunks.push(before.subarray(cursor));
  return {
    next: Buffer.concat(chunks),
    changedByteRanges,
  };
}

export async function patchBinary(
  workspaceRoot: string,
  inputPath: string,
  args: {
    operations?: unknown;
    approved?: unknown;
    dryRun?: unknown;
  }
): Promise<{
  descriptor: BinaryTargetDescriptor;
  plan: BinaryPatchPlan;
  receipt?: BinaryMutationReceipt;
  policy: BinaryMutationPolicy;
}> {
  const descriptor = await describeBinaryTarget(workspaceRoot, inputPath);
  if (!descriptor || !descriptor.exists || !descriptor.isRegularFile || !descriptor.sha256) {
    throw new Error("patch_binary requires an existing regular file.");
  }
  const policy = toBinaryMutationPolicy(descriptor, args.approved === true);
  const rawOperations = Array.isArray(args.operations) ? args.operations : [];
  if (!rawOperations.length) {
    throw new Error("patch_binary requires at least one operation.");
  }
  const before = await fs.readFile(descriptor.absolutePath);
  const operations = rawOperations.map((operation) => normalizePatchOperation(operation));
  const applied = applyPatchOperations(before, operations);
  const predictedPostHash = await sha256ForBuffer(applied.next);
  const plan: BinaryPatchPlan = {
    path: descriptor.path,
    absolutePath: descriptor.absolutePath,
    operations: operations.map((operation) => ({
      offset: operation.offset,
      deleteLength: operation.deleteLength,
      insertLength: operation.bytes.length,
    })),
    expectedPreHash: descriptor.sha256,
    predictedPostHash,
    riskClass: descriptor.riskClass,
  };
  if (policy.blocked || args.dryRun === true) {
    return { descriptor, plan, policy };
  }
  const snapshotPath = await ensureBinarySnapshot(descriptor.absolutePath);
  await fs.writeFile(descriptor.absolutePath, applied.next);
  const afterDescriptor = await describeBinaryTarget(workspaceRoot, inputPath);
  if (!afterDescriptor || !afterDescriptor.sha256) {
    throw new Error("Binary patch completed but the result could not be verified.");
  }
  return {
    descriptor: afterDescriptor,
    plan,
    policy,
    receipt: {
      path: afterDescriptor.path,
      absolutePath: afterDescriptor.absolutePath,
      beforeSha256: descriptor.sha256,
      afterSha256: afterDescriptor.sha256,
      snapshotPath,
      approved: args.approved === true,
      riskClass: afterDescriptor.riskClass,
      artifactKind: afterDescriptor.artifactKind,
      changedByteRanges: applied.changedByteRanges,
    },
  };
}

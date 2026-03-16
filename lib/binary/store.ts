import * as fs from "node:fs/promises";
import * as path from "node:path";
import type { BinaryBuildRecord } from "@/lib/binary/contracts";

const ROOT_DIR = path.join(process.cwd(), "artifacts", "binary-builds");
const memory = new Map<string, BinaryBuildRecord>();

function buildDir(buildId: string): string {
  return path.join(ROOT_DIR, buildId);
}

function recordPath(buildId: string): string {
  return path.join(buildDir(buildId), "record.json");
}

export function getBinaryArtifactsRootDir(): string {
  return ROOT_DIR;
}

export function getBinaryBuildRootDir(buildId: string): string {
  return buildDir(buildId);
}

export function getBinaryBuildWorkspaceDir(buildId: string): string {
  return path.join(buildDir(buildId), "workspace");
}

export function getBinaryArtifactPath(buildId: string): string {
  return path.join(buildDir(buildId), `${buildId}.zip`);
}

async function ensureDirectory(dir: string): Promise<void> {
  await fs.mkdir(dir, { recursive: true });
}

export async function ensureBinaryArtifactStorageAccessible(): Promise<string> {
  await ensureDirectory(ROOT_DIR);
  await fs.access(ROOT_DIR);
  return ROOT_DIR;
}

async function saveRecord(record: BinaryBuildRecord): Promise<void> {
  const dir = buildDir(record.id);
  await ensureDirectory(dir);
  await fs.writeFile(recordPath(record.id), JSON.stringify(record, null, 2), "utf8");
  memory.set(record.id, record);
}

export async function createBinaryBuildRecord(record: BinaryBuildRecord): Promise<BinaryBuildRecord> {
  await saveRecord(record);
  return record;
}

export async function updateBinaryBuildRecord(
  buildId: string,
  patch: Partial<BinaryBuildRecord>
): Promise<BinaryBuildRecord | null> {
  const current = await getBinaryBuildRecord(buildId);
  if (!current) return null;
  const next: BinaryBuildRecord = {
    ...current,
    ...patch,
    updatedAt: new Date().toISOString(),
  };
  await saveRecord(next);
  return next;
}

export async function getBinaryBuildRecord(buildId: string): Promise<BinaryBuildRecord | null> {
  if (memory.has(buildId)) return memory.get(buildId) || null;
  try {
    const raw = await fs.readFile(recordPath(buildId), "utf8");
    const record = JSON.parse(raw) as BinaryBuildRecord;
    memory.set(buildId, record);
    return record;
  } catch {
    return null;
  }
}

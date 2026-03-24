import * as fs from "node:fs/promises";
import * as path from "node:path";
import type {
  BinaryAstState,
  BinaryArtifactState,
  BinaryBuildCheckpoint,
  BinaryBuildEvent,
  BinaryBuildPreview,
  BinaryBuildRecord,
  BinaryExecutionState,
  BinaryLiveReliabilityState,
  BinaryManifest,
  BinaryPlanPreview,
  BinaryRuntimePatch,
  BinaryRuntimeState,
  BinarySnapshotSummary,
  BinarySourceGraph,
  BinaryValidationReport,
} from "@/lib/binary/contracts";

const ROOT_DIR = path.join(process.cwd(), "artifacts", "binary-builds");
const memory = new Map<string, BinaryBuildRecord>();
const eventSubscribers = new Map<string, Set<(event: BinaryBuildEvent) => void | Promise<void>>>();

function buildDir(buildId: string): string {
  return path.join(ROOT_DIR, buildId);
}

function recordPath(buildId: string): string {
  return path.join(buildDir(buildId), "record.json");
}

function eventsPath(buildId: string): string {
  return path.join(buildDir(buildId), "events.ndjson");
}

function checkpointPath(buildId: string): string {
  return path.join(buildDir(buildId), "checkpoint.json");
}

function checkpointsLogPath(buildId: string): string {
  return path.join(buildDir(buildId), "checkpoints.ndjson");
}

function checkpointsDir(buildId: string): string {
  return path.join(buildDir(buildId), "checkpoints");
}

function checkpointSnapshotPath(buildId: string, checkpointId: string): string {
  return path.join(checkpointsDir(buildId), `${checkpointId}.snapshot.json`);
}

export type BinaryCheckpointSnapshot = {
  buildId: string;
  checkpointId: string;
  savedAt: string;
  draftFiles: Record<string, string>;
  plan: BinaryPlanPreview | null;
  preview: BinaryBuildPreview | null;
  manifest: BinaryManifest | null;
  reliability: BinaryValidationReport | null;
  liveReliability: BinaryLiveReliabilityState | null;
  artifactState: BinaryArtifactState | null;
  sourceGraph: BinarySourceGraph | null;
  astState: BinaryAstState | null;
  execution: BinaryExecutionState | null;
  runtimeState: BinaryRuntimeState | null;
  runtimePatches: BinaryRuntimePatch[];
  prompt: string | null;
  parentSnapshotId: string | null;
  snapshot: BinarySnapshotSummary | null;
};

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

export function getBinaryBuildEventsPath(buildId: string): string {
  return eventsPath(buildId);
}

export function getBinaryBuildCheckpointPath(buildId: string): string {
  return checkpointPath(buildId);
}

export function getBinaryBuildCheckpointsDir(buildId: string): string {
  return checkpointsDir(buildId);
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

export async function appendBinaryBuildEvent(event: BinaryBuildEvent): Promise<void> {
  const dir = buildDir(event.buildId);
  await ensureDirectory(dir);
  await fs.appendFile(eventsPath(event.buildId), `${JSON.stringify(event)}\n`, "utf8");
  const listeners = eventSubscribers.get(event.buildId);
  if (!listeners?.size) return;
  for (const listener of Array.from(listeners)) {
    void Promise.resolve(listener(event)).catch(() => null);
  }
}

export async function listBinaryBuildEvents(buildId: string, afterId?: string | null): Promise<BinaryBuildEvent[]> {
  try {
    const raw = await fs.readFile(eventsPath(buildId), "utf8");
    const events = raw
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean)
      .map((line) => JSON.parse(line) as BinaryBuildEvent);

    const cursor = String(afterId || "").trim();
    if (!cursor) return events;

    const index = events.findIndex((event) => event.id === cursor);
    return index >= 0 ? events.slice(index + 1) : events;
  } catch {
    return [];
  }
}

export function subscribeBinaryBuildEvents(
  buildId: string,
  listener: (event: BinaryBuildEvent) => void | Promise<void>
): () => void {
  const current = eventSubscribers.get(buildId) || new Set<(event: BinaryBuildEvent) => void | Promise<void>>();
  current.add(listener);
  eventSubscribers.set(buildId, current);
  return () => {
    const next = eventSubscribers.get(buildId);
    if (!next) return;
    next.delete(listener);
    if (next.size === 0) eventSubscribers.delete(buildId);
  };
}

export async function writeBinaryBuildCheckpoint(checkpoint: BinaryBuildCheckpoint): Promise<void> {
  const dir = buildDir(checkpoint.buildId);
  await ensureDirectory(dir);
  await fs.writeFile(checkpointPath(checkpoint.buildId), JSON.stringify(checkpoint, null, 2), "utf8");
  await fs.appendFile(checkpointsLogPath(checkpoint.buildId), `${JSON.stringify(checkpoint)}\n`, "utf8");
}

export async function getBinaryBuildCheckpoint(buildId: string): Promise<BinaryBuildCheckpoint | null> {
  try {
    const raw = await fs.readFile(checkpointPath(buildId), "utf8");
    return JSON.parse(raw) as BinaryBuildCheckpoint;
  } catch {
    return null;
  }
}

export async function listBinaryBuildCheckpoints(buildId: string): Promise<BinaryBuildCheckpoint[]> {
  try {
    const raw = await fs.readFile(checkpointsLogPath(buildId), "utf8");
    return raw
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean)
      .map((line) => JSON.parse(line) as BinaryBuildCheckpoint);
  } catch {
    return [];
  }
}

export async function writeBinaryCheckpointSnapshot(snapshot: BinaryCheckpointSnapshot): Promise<void> {
  await ensureDirectory(checkpointsDir(snapshot.buildId));
  await fs.writeFile(
    checkpointSnapshotPath(snapshot.buildId, snapshot.checkpointId),
    JSON.stringify(snapshot, null, 2),
    "utf8"
  );
}

export async function getBinaryCheckpointSnapshot(
  buildId: string,
  checkpointId: string
): Promise<BinaryCheckpointSnapshot | null> {
  try {
    const raw = await fs.readFile(checkpointSnapshotPath(buildId, checkpointId), "utf8");
    return JSON.parse(raw) as BinaryCheckpointSnapshot;
  } catch {
    return null;
  }
}

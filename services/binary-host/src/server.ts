import { promises as fs } from "node:fs";
import { createHash, randomUUID } from "node:crypto";
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import os from "node:os";
import path from "node:path";
import process from "node:process";

type AssistMode = "auto" | "plan" | "yolo" | "generate" | "debug";
type HostedAssistMode = "auto" | "plan" | "yolo";
type BinaryHostRunStatus =
  | "queued"
  | "running"
  | "paused"
  | "completed"
  | "failed"
  | "cancelled"
  | "takeover_required";
type BinaryHostWorkspaceTrustMode =
  | "untrusted"
  | "trusted_read_only"
  | "trusted_full_access"
  | "trusted_prompt_commands";
type BinaryHostRunControlAction =
  | "pause"
  | "resume"
  | "cancel"
  | "repair"
  | "takeover"
  | "retry_last_turn";

type ToolCall = {
  id: string;
  name: string;
  arguments: Record<string, unknown>;
  kind?: "observe" | "mutate" | "command";
  summary?: string;
};

type PendingToolCall = {
  step: number;
  adapter: string;
  requiresClientExecution: boolean;
  toolCall: ToolCall;
  availableTools?: string[];
  createdAt: string;
};

type ToolResult = {
  toolCallId: string;
  name: string;
  ok: boolean;
  blocked?: boolean;
  summary: string;
  data?: Record<string, unknown>;
  error?: string;
  createdAt?: string;
};

type AssistRunEnvelope = {
  sessionId?: string;
  traceId?: string;
  final?: string;
  completionStatus?: "complete" | "incomplete";
  runId?: string;
  adapter?: string;
  pendingToolCall?: PendingToolCall | null;
  receipt?: Record<string, unknown> | null;
  reviewState?: Record<string, unknown> | null;
  loopState?: {
    stepCount?: number;
    mutationCount?: number;
    maxSteps?: number;
    maxMutations?: number;
    repeatedCallCount?: number;
    repairCount?: number;
    status?: string;
  } | null;
  progressState?: {
    status?: string;
    stallReason?: string;
    nextDeterministicAction?: string;
  } | null;
  missingRequirements?: string[];
  [key: string]: unknown;
};

type BinaryHostTrustGrant = {
  path: string;
  mutate: boolean;
  commands: "allow" | "prompt";
  network: "allow" | "deny";
  elevated: "allow" | "deny";
  grantedAt: string;
};

type BinaryHostPreferences = {
  baseUrl: string;
  trustedWorkspaces: BinaryHostTrustGrant[];
  recentSessions: Array<{ sessionId: string; runId?: string; updatedAt: string; workspaceRoot?: string }>;
  artifactHistory: Array<{ id: string; label: string; url?: string; createdAt: string }>;
  preferredTransport: "host" | "direct";
};

type BinaryHostClientInfo = {
  surface: "desktop" | "cli" | "vsix" | "unknown";
  version?: string;
};

type AssistRequest = {
  task: string;
  mode: AssistMode;
  model: string;
  historySessionId?: string;
  workspaceRoot?: string;
  detach?: boolean;
  client?: BinaryHostClientInfo;
};

type BinaryHostBudgetState = {
  maxSteps?: number;
  usedSteps: number;
  remainingSteps?: number;
  maxMutations?: number;
  usedMutations: number;
  remainingMutations?: number;
  exhausted: boolean;
  reason?: string;
};

type BinaryHostCheckpointState = {
  count: number;
  lastCheckpointAt?: string;
  lastCheckpointSummary?: string;
};

type BinaryHostLeaseState = {
  leaseId: string;
  workerId: string;
  startedAt: string;
  heartbeatAt: string;
  lastToolAt?: string;
};

type StoredEvent = {
  seq: number;
  capturedAt: string;
  event: Record<string, unknown>;
};

type StoredHostRun = {
  id: string;
  status: BinaryHostRunStatus;
  createdAt: string;
  updatedAt: string;
  client: BinaryHostClientInfo;
  request: AssistRequest;
  workspaceRoot?: string;
  workspaceTrustMode: BinaryHostWorkspaceTrustMode;
  traceId: string;
  sessionId?: string;
  runId?: string;
  leaseId?: string;
  heartbeatAt?: string;
  lastToolAt?: string;
  resumeToken: string;
  budgetState?: BinaryHostBudgetState | null;
  checkpointState?: BinaryHostCheckpointState | null;
  leaseState?: BinaryHostLeaseState | null;
  lastPendingToolCallSignature?: string;
  repeatedPendingSignatureCount?: number;
  observationOnlyStreak?: number;
  takeoverReason?: string;
  controlHistory: Array<{ action: BinaryHostRunControlAction; note?: string | null; at: string }>;
  toolResults: ToolResult[];
  checkpoints: Array<{ capturedAt: string; summary: string; step?: number }>;
  events: StoredEvent[];
  finalEnvelope?: AssistRunEnvelope;
  error?: string;
};

type HostRunSummary = Omit<
  StoredHostRun,
  "events" | "toolResults" | "checkpoints" | "controlHistory" | "finalEnvelope"
> & {
  eventCount: number;
};

type RunControllerState = {
  pauseRequested: boolean;
  cancelRequested: boolean;
};

const HOST_VERSION = "0.2.0";
const HOST = process.env.BINARY_IDE_HOST_BIND || "127.0.0.1";
const PORT = Number(process.env.BINARY_IDE_HOST_PORT || "7777");
const CONFIG_DIR = path.join(os.homedir(), ".binary-ide");
const LEGACY_CONFIG_PATH = path.join(CONFIG_DIR, "config.json");
const HOST_DIR = path.join(CONFIG_DIR, "host");
const STATE_PATH = path.join(HOST_DIR, "state.json");
const SECRET_FALLBACK_PATH = path.join(HOST_DIR, "secrets.json");
const RUNS_DIR = path.join(HOST_DIR, "runs");
const JSON_LIMIT_BYTES = 1_500_000;
const MAX_EVENT_HISTORY = 4_000;
const MAX_TOOL_RESULT_HISTORY = 400;
const MAX_CHECKPOINT_HISTORY = 100;
const HEARTBEAT_INTERVAL_MS = 4_000;
const STALE_LEASE_MS = 20_000;
const MAX_OBSERVATION_ONLY_STREAK = 8;
const MAX_PENDING_SIGNATURE_REPEATS = 3;

const activeExecutions = new Map<string, Promise<void>>();
const runControllers = new Map<string, RunControllerState>();

function nowIso(): string {
  return new Date().toISOString();
}

function buildResumeToken(): string {
  return randomUUID().replace(/-/g, "");
}

function toHostedMode(mode: AssistMode): HostedAssistMode {
  if (mode === "generate" || mode === "debug") return "yolo";
  return mode;
}

function normalizeWorkspacePath(input: string): string {
  return path.resolve(input);
}

function deriveWorkspaceTrustMode(grant: BinaryHostTrustGrant | null | undefined): BinaryHostWorkspaceTrustMode {
  if (!grant) return "untrusted";
  if (!grant.mutate) return "trusted_read_only";
  if (grant.commands === "prompt") return "trusted_prompt_commands";
  return "trusted_full_access";
}

function isObserveTool(name: string): boolean {
  return !["edit", "write_file", "mkdir", "run_command", "create_checkpoint"].includes(name);
}

function buildPendingSignature(pendingToolCall: PendingToolCall | null | undefined): string {
  if (!pendingToolCall) return "";
  return JSON.stringify({
    name: pendingToolCall.toolCall.name,
    arguments: pendingToolCall.toolCall.arguments,
  });
}

function isTerminalStatus(status: BinaryHostRunStatus): boolean {
  return status === "completed" || status === "failed" || status === "cancelled";
}

function maskApiKey(value: string | null): string | null {
  if (!value || value.length < 10) return null;
  return `${value.slice(0, 6)}...${value.slice(-4)}`;
}

function withCors(res: ServerResponse): void {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization, X-API-Key");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, DELETE, OPTIONS");
}

function writeJson(res: ServerResponse, statusCode: number, body: unknown): void {
  const payload = Buffer.from(JSON.stringify(body));
  withCors(res);
  res.writeHead(statusCode, {
    "Content-Type": "application/json; charset=utf-8",
    "Content-Length": String(payload.byteLength),
    "Cache-Control": "no-store",
  });
  res.end(payload);
}

function writeSseHeaders(res: ServerResponse): void {
  withCors(res);
  res.writeHead(200, {
    "Content-Type": "text/event-stream; charset=utf-8",
    "Cache-Control": "no-store",
    Connection: "keep-alive",
  });
}

function sendSseEvent(res: ServerResponse, payload: unknown): void {
  res.write(`data: ${JSON.stringify(payload)}\n\n`);
}

async function ensureHostDirs(): Promise<void> {
  await fs.mkdir(HOST_DIR, { recursive: true });
  await fs.mkdir(RUNS_DIR, { recursive: true });
}

async function readJsonFile<T>(filePath: string): Promise<T | null> {
  try {
    const raw = await fs.readFile(filePath, "utf8");
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

async function writeJsonFile(filePath: string, value: unknown): Promise<void> {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, JSON.stringify(value, null, 2), "utf8");
}

function defaultPreferences(): BinaryHostPreferences {
  return {
    baseUrl: process.env.BINARY_IDE_BASE_URL || "http://localhost:3000",
    trustedWorkspaces: [],
    recentSessions: [],
    artifactHistory: [],
    preferredTransport: "host",
  };
}

async function loadPreferences(): Promise<BinaryHostPreferences> {
  const existing = await readJsonFile<Partial<BinaryHostPreferences>>(STATE_PATH);
  return {
    ...defaultPreferences(),
    ...(existing || {}),
    baseUrl: String(process.env.BINARY_IDE_BASE_URL || existing?.baseUrl || defaultPreferences().baseUrl).replace(/\/+$/, ""),
    trustedWorkspaces: Array.isArray(existing?.trustedWorkspaces) ? existing!.trustedWorkspaces : [],
    recentSessions: Array.isArray(existing?.recentSessions) ? existing!.recentSessions : [],
    artifactHistory: Array.isArray(existing?.artifactHistory) ? existing!.artifactHistory : [],
  };
}

async function savePreferences(value: BinaryHostPreferences): Promise<void> {
  await writeJsonFile(STATE_PATH, value);
}

async function readLegacyConfig(): Promise<Record<string, unknown>> {
  return (await readJsonFile<Record<string, unknown>>(LEGACY_CONFIG_PATH)) || {};
}

async function writeLegacyApiKey(apiKey?: string): Promise<void> {
  const current = await readLegacyConfig();
  const next = { ...current };
  if (apiKey) next.apiKey = apiKey;
  else delete next.apiKey;
  await writeJsonFile(LEGACY_CONFIG_PATH, next);
}

async function loadOptionalKeytar(): Promise<{
  getPassword: (service: string, account: string) => Promise<string | null>;
  setPassword: (service: string, account: string, password: string) => Promise<void>;
  deletePassword: (service: string, account: string) => Promise<boolean>;
} | null> {
  try {
    const dynamicImport = new Function("specifier", "return import(specifier);") as (
      specifier: string
    ) => Promise<unknown>;
    const imported = (await dynamicImport("keytar")) as {
      default?: {
        getPassword: (service: string, account: string) => Promise<string | null>;
        setPassword: (service: string, account: string, password: string) => Promise<void>;
        deletePassword: (service: string, account: string) => Promise<boolean>;
      };
      getPassword: (service: string, account: string) => Promise<string | null>;
      setPassword: (service: string, account: string, password: string) => Promise<void>;
      deletePassword: (service: string, account: string) => Promise<boolean>;
    };
    return imported.default || imported;
  } catch {
    return null;
  }
}

async function getStoredSecretFile(): Promise<Record<string, string>> {
  return (await readJsonFile<Record<string, string>>(SECRET_FALLBACK_PATH)) || {};
}

async function setStoredSecretFile(key: string, value?: string): Promise<void> {
  const current = await getStoredSecretFile();
  if (value) current[key] = value;
  else delete current[key];
  await writeJsonFile(SECRET_FALLBACK_PATH, current);
}

async function getApiKeyRecord(): Promise<{ apiKey: string | null; storageMode: "secure" | "file" | "none"; secureStorageAvailable: boolean }> {
  const keytar = await loadOptionalKeytar();
  if (keytar) {
    const apiKey = await keytar.getPassword("Binary IDE", "apiKey");
    if (apiKey) {
      return { apiKey, storageMode: "secure", secureStorageAvailable: true };
    }
  }
  const fallbackSecrets = await getStoredSecretFile();
  if (typeof fallbackSecrets.apiKey === "string" && fallbackSecrets.apiKey.trim()) {
    return { apiKey: fallbackSecrets.apiKey.trim(), storageMode: "file", secureStorageAvailable: Boolean(keytar) };
  }
  const legacyConfig = await readLegacyConfig();
  const legacyKey = typeof legacyConfig.apiKey === "string" ? legacyConfig.apiKey.trim() : "";
  if (legacyKey) {
    return { apiKey: legacyKey, storageMode: "file", secureStorageAvailable: Boolean(keytar) };
  }
  return { apiKey: null, storageMode: "none", secureStorageAvailable: Boolean(keytar) };
}

async function setApiKey(apiKey: string): Promise<{ storageMode: "secure" | "file"; secureStorageAvailable: boolean }> {
  const keytar = await loadOptionalKeytar();
  if (keytar) {
    await keytar.setPassword("Binary IDE", "apiKey", apiKey);
    await setStoredSecretFile("apiKey", apiKey);
    await writeLegacyApiKey(apiKey);
    return { storageMode: "secure", secureStorageAvailable: true };
  }
  await setStoredSecretFile("apiKey", apiKey);
  await writeLegacyApiKey(apiKey);
  return { storageMode: "file", secureStorageAvailable: false };
}

async function clearApiKey(): Promise<{ secureStorageAvailable: boolean }> {
  const keytar = await loadOptionalKeytar();
  if (keytar) {
    await keytar.deletePassword("Binary IDE", "apiKey");
  }
  await setStoredSecretFile("apiKey", undefined);
  await writeLegacyApiKey(undefined);
  return { secureStorageAvailable: Boolean(keytar) };
}

async function readJsonBody(req: IncomingMessage): Promise<Record<string, unknown>> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    let total = 0;
    req.on("data", (chunk: Buffer | string) => {
      const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
      total += buffer.byteLength;
      if (total > JSON_LIMIT_BYTES) {
        reject(new Error("Request body exceeded the 1.5MB limit."));
        req.destroy();
        return;
      }
      chunks.push(buffer);
    });
    req.on("end", () => {
      try {
        const raw = Buffer.concat(chunks).toString("utf8").trim();
        resolve(raw ? (JSON.parse(raw) as Record<string, unknown>) : {});
      } catch (error) {
        reject(error);
      }
    });
    req.on("error", reject);
  });
}

function buildHostedHeaders(apiKey: string): HeadersInit {
  return {
    "Content-Type": "application/json",
    "X-API-Key": apiKey,
    Authorization: `Bearer ${apiKey}`,
  };
}

async function parseHostedError(response: Response): Promise<{ message: string; details?: unknown }> {
  const text = await response.text().catch(() => "");
  if (!text) return { message: `Hosted request failed (${response.status})` };
  try {
    const parsed = JSON.parse(text) as { message?: string; error?: { code?: string; message?: string } | string };
    if (typeof parsed.message === "string" && parsed.message.trim()) {
      return { message: parsed.message, details: parsed };
    }
    if (typeof parsed.error === "string") {
      return { message: parsed.error, details: parsed };
    }
    if (parsed.error && typeof parsed.error === "object" && typeof parsed.error.message === "string") {
      return {
        message: `${parsed.error.code || "ERROR"}: ${parsed.error.message}`,
        details: parsed,
      };
    }
    return { message: text, details: parsed };
  } catch {
    return { message: text };
  }
}

async function streamHostedAssist(input: {
  baseUrl: string;
  apiKey: string;
  request: AssistRequest;
  onEvent: (event: Record<string, unknown>) => Promise<void> | void;
}): Promise<AssistRunEnvelope> {
  const response = await fetch(`${input.baseUrl}/api/v1/playground/assist`, {
    method: "POST",
    headers: buildHostedHeaders(input.apiKey),
    body: JSON.stringify({
      task: input.request.task,
      mode: toHostedMode(input.request.mode),
      model: input.request.model || "Binary IDE",
      stream: true,
      historySessionId: input.request.historySessionId,
      contextBudget: {
        strategy: "hybrid",
        maxTokens: 16384,
      },
    }),
  });

  if (!response.ok || !response.body) {
    const failure = await parseHostedError(response);
    throw new Error(failure.message);
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  const envelope: AssistRunEnvelope = {
    actions: [],
    missingRequirements: [],
  };
  let buffer = "";

  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    while (true) {
      const boundary = buffer.indexOf("\n\n");
      if (boundary < 0) break;
      const raw = buffer.slice(0, boundary).trim();
      buffer = buffer.slice(boundary + 2);
      if (!raw) continue;
      let payload = "";
      for (const line of raw.split(/\r?\n/)) {
        if (line.startsWith("data:")) payload += line.slice(5).trimStart();
      }
      if (!payload || payload === "[DONE]") continue;
      let parsed: Record<string, unknown>;
      try {
        parsed = JSON.parse(payload) as Record<string, unknown>;
      } catch {
        parsed = { event: "raw", data: payload };
      }
      if (typeof parsed.sessionId === "string") envelope.sessionId = parsed.sessionId;
      const eventName = typeof parsed.event === "string" ? parsed.event : "";
      if (eventName === "run") {
        const data = parsed.data && typeof parsed.data === "object" ? (parsed.data as Record<string, unknown>) : {};
        if (typeof data.runId === "string") envelope.runId = data.runId;
        if (typeof data.adapter === "string") envelope.adapter = data.adapter;
      }
      if (eventName === "tool_request" && parsed.data && typeof parsed.data === "object") {
        envelope.pendingToolCall = parsed.data as unknown as PendingToolCall;
      }
      if (eventName === "meta" && parsed.data && typeof parsed.data === "object") {
        Object.assign(envelope, parsed.data as Record<string, unknown>);
      }
      if (eventName === "final") {
        envelope.final = String(parsed.data ?? "");
      }
      await input.onEvent(parsed);
    }
  }

  return envelope;
}

async function continueHostedRun(input: {
  baseUrl: string;
  apiKey: string;
  runId: string;
  toolResult: ToolResult;
  sessionId?: string;
}): Promise<AssistRunEnvelope> {
  const response = await fetch(`${input.baseUrl}/api/v1/playground/runs/${encodeURIComponent(input.runId)}/continue`, {
    method: "POST",
    headers: buildHostedHeaders(input.apiKey),
    body: JSON.stringify(input.sessionId ? { toolResult: input.toolResult, sessionId: input.sessionId } : { toolResult: input.toolResult }),
  });
  if (!response.ok) {
    const failure = await parseHostedError(response);
    throw new Error(failure.message);
  }
  const parsed = (await response.json().catch(() => ({}))) as { data?: AssistRunEnvelope } | AssistRunEnvelope;
  const envelope = ("data" in parsed ? parsed.data : parsed) || {};
  return envelope as AssistRunEnvelope;
}

async function createHostToolExecutor(workspaceRoot: string): Promise<{
  execute: (pendingToolCall: PendingToolCall) => Promise<ToolResult>;
}> {
  const moduleRef = (await import("../../../sdk/playground-ai-cli/dist/tool-executor.js")) as {
    CliToolExecutor: new (workspaceRoot: string) => { execute: (pendingToolCall: PendingToolCall) => Promise<ToolResult> };
  };
  return new moduleRef.CliToolExecutor(workspaceRoot);
}

function hashWorkspaceRoot(input: string | undefined): string {
  return createHash("sha256").update(String(input || "")).digest("hex").slice(0, 12);
}

async function persistHostRun(run: StoredHostRun): Promise<void> {
  await writeJsonFile(path.join(RUNS_DIR, `${run.id}.json`), run);
}

function isWorkspaceTrusted(preferences: BinaryHostPreferences, workspaceRoot: string): BinaryHostTrustGrant | null {
  const resolved = normalizeWorkspacePath(workspaceRoot);
  return preferences.trustedWorkspaces.find((grant) => normalizeWorkspacePath(grant.path) === resolved) || null;
}

async function readAllRuns(): Promise<StoredHostRun[]> {
  const files = await fs.readdir(RUNS_DIR).catch(() => []);
  const runs: StoredHostRun[] = [];
  for (const file of files) {
    if (!file.endsWith(".json")) continue;
    const run = await readJsonFile<StoredHostRun>(path.join(RUNS_DIR, file));
    if (run) runs.push(run);
  }
  return runs;
}

async function loadRunRecord(id: string): Promise<StoredHostRun | null> {
  const direct = await readJsonFile<StoredHostRun>(path.join(RUNS_DIR, `${id}.json`));
  const run =
    direct ||
    (await readAllRuns()).find(
      (item) => item.id === id || item.runId === id || item.traceId === id || item.sessionId === id
    ) ||
    null;
  if (!run) return null;

  if (
    run.status === "running" &&
    !activeExecutions.has(run.id) &&
    run.heartbeatAt &&
    Date.now() - new Date(run.heartbeatAt).getTime() > STALE_LEASE_MS
  ) {
    run.status = "paused";
    run.takeoverReason = "Recovered a stale unattended run after a host restart or expired worker lease.";
    run.resumeToken = buildResumeToken();
    run.updatedAt = nowIso();
    await persistHostRun(run);
  }

  return run;
}

function buildBudgetState(envelope: AssistRunEnvelope | undefined): BinaryHostBudgetState | null {
  const loopState = envelope?.loopState;
  if (!loopState) return null;
  const maxSteps = typeof loopState.maxSteps === "number" ? loopState.maxSteps : undefined;
  const usedSteps = typeof loopState.stepCount === "number" ? loopState.stepCount : 0;
  const maxMutations = typeof loopState.maxMutations === "number" ? loopState.maxMutations : undefined;
  const usedMutations = typeof loopState.mutationCount === "number" ? loopState.mutationCount : 0;
  const missingRequirements = Array.isArray(envelope?.missingRequirements) ? envelope!.missingRequirements! : [];
  const exhaustedReason =
    missingRequirements.find((item) => /budget_exceeded/i.test(item)) ||
    (typeof envelope?.progressState?.stallReason === "string" ? envelope.progressState.stallReason : undefined);
  return {
    maxSteps,
    usedSteps,
    remainingSteps: typeof maxSteps === "number" ? Math.max(0, maxSteps - usedSteps) : undefined,
    maxMutations,
    usedMutations,
    remainingMutations:
      typeof maxMutations === "number" ? Math.max(0, maxMutations - usedMutations) : undefined,
    exhausted: Boolean(exhaustedReason),
    ...(exhaustedReason ? { reason: exhaustedReason } : {}),
  };
}

function buildCheckpointState(run: StoredHostRun): BinaryHostCheckpointState {
  const last = run.checkpoints[run.checkpoints.length - 1];
  return {
    count: run.checkpoints.length,
    ...(last?.capturedAt ? { lastCheckpointAt: last.capturedAt } : {}),
    ...(last?.summary ? { lastCheckpointSummary: last.summary } : {}),
  };
}

function buildRunSummary(run: StoredHostRun): HostRunSummary {
  return {
    ...run,
    eventCount: run.events.length,
  };
}

function attachHostMetadata(envelope: AssistRunEnvelope, run: StoredHostRun): AssistRunEnvelope {
  return {
    ...envelope,
    leaseId: run.leaseId,
    heartbeatAt: run.heartbeatAt,
    lastToolAt: run.lastToolAt,
    budgetState: run.budgetState ?? null,
    checkpointState: run.checkpointState ?? null,
    resumeToken: run.resumeToken,
    workspaceTrustMode: run.workspaceTrustMode,
  };
}

function applyEnvelopeToRun(run: StoredHostRun, envelope: AssistRunEnvelope): void {
  if (typeof envelope.traceId === "string") run.traceId = envelope.traceId;
  if (typeof envelope.sessionId === "string") run.sessionId = envelope.sessionId;
  if (typeof envelope.runId === "string") run.runId = envelope.runId;
  run.budgetState = buildBudgetState(envelope);
  run.checkpointState = buildCheckpointState(run);
  run.finalEnvelope = attachHostMetadata(envelope, run);
  if (typeof envelope.progressState?.stallReason === "string" && envelope.progressState.stallReason.trim()) {
    run.takeoverReason = envelope.progressState.stallReason;
  }
}

function nextEventSeq(run: StoredHostRun): number {
  return (run.events[run.events.length - 1]?.seq || 0) + 1;
}

async function appendRunEvent(
  run: StoredHostRun,
  event: Record<string, unknown>,
  attachedRes?: ServerResponse | null
): Promise<void> {
  const stored: StoredEvent = {
    seq: nextEventSeq(run),
    capturedAt: nowIso(),
    event,
  };
  run.events.push(stored);
  run.events = run.events.slice(-MAX_EVENT_HISTORY);
  run.updatedAt = stored.capturedAt;
  await persistHostRun(run);
  if (attachedRes && !attachedRes.destroyed) {
    sendSseEvent(attachedRes, event);
  }
}

function blockedToolResult(pendingToolCall: PendingToolCall, message: string): ToolResult {
  return {
    toolCallId: pendingToolCall.toolCall.id,
    name: pendingToolCall.toolCall.name,
    ok: false,
    blocked: true,
    summary: message,
    error: message,
    createdAt: nowIso(),
  };
}

function looksLikeDangerousGlobalCommand(command: string): boolean {
  const normalized = String(command || "").toLowerCase();
  return [
    /\brm\s+-rf\s+\/(?!\w)/,
    /\brmdir\s+\/s\s+\/q\s+[a-z]:\\?$/i,
    /\bdel\s+\/f\s+\/s\s+\/q\s+[a-z]:\\/i,
    /\bformat\b/i,
    /\bshutdown\b/i,
    /\breboot\b/i,
    /\bmkfs\b/i,
    /\bdiskpart\b/i,
    /\bsc\s+delete\b/i,
    /\bnet\s+user\b/i,
  ].some((pattern) => pattern.test(normalized));
}

async function enforceToolPolicy(
  run: StoredHostRun,
  preferences: BinaryHostPreferences,
  pendingToolCall: PendingToolCall
): Promise<ToolResult | null> {
  const grant = run.workspaceRoot ? isWorkspaceTrusted(preferences, run.workspaceRoot) : null;
  if (pendingToolCall.toolCall.name === "run_command") {
    if (!grant) {
      return blockedToolResult(
        pendingToolCall,
        "Binary Host refused to run a command because the workspace is not trusted."
      );
    }
    if (grant.commands === "prompt") {
      return blockedToolResult(
        pendingToolCall,
        "Binary Host blocked the command because this workspace requires command confirmation."
      );
    }
    const command = String(pendingToolCall.toolCall.arguments.command || "").trim();
    if (looksLikeDangerousGlobalCommand(command) && grant.elevated !== "allow") {
      return blockedToolResult(
        pendingToolCall,
        "Binary Host blocked a dangerous machine-level command outside the trusted workspace policy."
      );
    }
  }
  return null;
}

async function emitHostStatus(
  run: StoredHostRun,
  message: string,
  attachedRes?: ServerResponse | null,
  extra?: Record<string, unknown>
): Promise<void> {
  await appendRunEvent(
    run,
    {
      event: "host.status",
      data: {
        message,
        runId: run.id,
        workspaceRoot: run.workspaceRoot || null,
        workspaceHash: hashWorkspaceRoot(run.workspaceRoot),
        client: run.client,
        ...extra,
      },
    },
    attachedRes
  );
}

async function emitHostHeartbeat(run: StoredHostRun, attachedRes?: ServerResponse | null): Promise<void> {
  run.heartbeatAt = nowIso();
  if (run.leaseState) run.leaseState.heartbeatAt = run.heartbeatAt;
  await appendRunEvent(
    run,
    {
      event: "host.heartbeat",
      data: {
        runId: run.id,
        status: run.status,
        heartbeatAt: run.heartbeatAt,
        lastToolAt: run.lastToolAt || null,
      },
    },
    attachedRes
  );
}

async function emitHostBudget(run: StoredHostRun, attachedRes?: ServerResponse | null): Promise<void> {
  await appendRunEvent(
    run,
    {
      event: "host.budget",
      data: {
        runId: run.id,
        budgetState: run.budgetState ?? null,
      },
    },
    attachedRes
  );
}

async function emitHostCheckpoint(
  run: StoredHostRun,
  checkpoint: { capturedAt: string; summary: string; step?: number },
  attachedRes?: ServerResponse | null
): Promise<void> {
  await appendRunEvent(
    run,
    {
      event: "host.checkpoint",
      data: {
        runId: run.id,
        checkpoint,
        checkpointState: run.checkpointState,
      },
    },
    attachedRes
  );
}

async function emitHostStall(run: StoredHostRun, reason: string, attachedRes?: ServerResponse | null): Promise<void> {
  await appendRunEvent(
    run,
    {
      event: "host.stall",
      data: {
        runId: run.id,
        reason,
        lastPendingToolCallSignature: run.lastPendingToolCallSignature || null,
      },
    },
    attachedRes
  );
}

async function emitTakeoverRequired(
  run: StoredHostRun,
  reason: string,
  attachedRes?: ServerResponse | null
): Promise<void> {
  await appendRunEvent(
    run,
    {
      event: "host.takeover_required",
      data: {
        runId: run.id,
        reason,
        resumeToken: run.resumeToken,
      },
    },
    attachedRes
  );
}

function detectStall(run: StoredHostRun, envelope: AssistRunEnvelope): string | null {
  if ((run.repeatedPendingSignatureCount || 0) >= MAX_PENDING_SIGNATURE_REPEATS) {
    return "Binary Host detected repeated identical pending tool calls without new proof.";
  }
  if ((run.observationOnlyStreak || 0) >= MAX_OBSERVATION_ONLY_STREAK) {
    return "Binary Host detected too many observation-only turns without a mutation or terminal proof.";
  }
  if (run.budgetState?.exhausted) {
    return run.budgetState.reason || "The hosted run exhausted its budget.";
  }
  if (typeof envelope.progressState?.stallReason === "string" && envelope.progressState.stallReason.trim()) {
    return envelope.progressState.stallReason;
  }
  return null;
}

function summarizeReceipt(envelope: AssistRunEnvelope): { id: string; label: string; url?: string; createdAt: string } | null {
  const receipt = envelope.receipt && typeof envelope.receipt === "object" ? envelope.receipt : null;
  if (!receipt) return null;
  const id = typeof receipt.id === "string" ? receipt.id : null;
  const label = typeof receipt.title === "string" ? receipt.title : typeof receipt.status === "string" ? receipt.status : null;
  if (!id || !label) return null;
  return {
    id,
    label,
    url: typeof receipt.downloadUrl === "string" ? receipt.downloadUrl : undefined,
    createdAt: nowIso(),
  };
}

function updatePendingStats(run: StoredHostRun, envelope: AssistRunEnvelope): void {
  if (!envelope.pendingToolCall) {
    run.lastPendingToolCallSignature = undefined;
    run.repeatedPendingSignatureCount = 0;
    run.observationOnlyStreak = 0;
    return;
  }

  const signature = buildPendingSignature(envelope.pendingToolCall);
  run.repeatedPendingSignatureCount =
    signature && signature === run.lastPendingToolCallSignature
      ? (run.repeatedPendingSignatureCount || 0) + 1
      : 1;
  run.lastPendingToolCallSignature = signature || undefined;
  run.observationOnlyStreak = isObserveTool(envelope.pendingToolCall.toolCall.name)
    ? (run.observationOnlyStreak || 0) + 1
    : 0;
}

function recordToolCheckpoint(run: StoredHostRun, pendingToolCall: PendingToolCall, toolResult: ToolResult): {
  capturedAt: string;
  summary: string;
  step?: number;
} | null {
  if (!toolResult.ok) return null;
  if (pendingToolCall.toolCall.name !== "create_checkpoint" && isObserveTool(pendingToolCall.toolCall.name)) {
    return null;
  }
  return {
    capturedAt: toolResult.createdAt || nowIso(),
    summary: toolResult.summary,
    ...(typeof pendingToolCall.step === "number" ? { step: pendingToolCall.step } : {}),
  };
}

async function refreshRunPreferences(run: StoredHostRun): Promise<void> {
  const preferences = await loadPreferences();
  if (run.sessionId) {
    preferences.recentSessions = [
      {
        sessionId: run.sessionId,
        ...(run.runId ? { runId: run.runId } : {}),
        updatedAt: run.updatedAt,
        ...(run.workspaceRoot ? { workspaceRoot: run.workspaceRoot } : {}),
      },
      ...preferences.recentSessions.filter((item) => item.sessionId !== run.sessionId),
    ].slice(0, 30);
  }
  const artifact = run.finalEnvelope ? summarizeReceipt(run.finalEnvelope) : null;
  if (artifact) {
    preferences.artifactHistory = [
      artifact,
      ...preferences.artifactHistory.filter((item) => item.id !== artifact.id),
    ].slice(0, 30);
  }
  await savePreferences(preferences);
}

async function runWithTransportRetry<T>(
  run: StoredHostRun,
  attachedRes: ServerResponse | null | undefined,
  work: () => Promise<T>
): Promise<T> {
  try {
    return await work();
  } catch (error) {
    await emitHostStatus(run, "Binary Host retrying a transient hosted transport failure.", attachedRes, {
      error: error instanceof Error ? error.message : String(error),
    });
    return await work();
  }
}

async function finalizeRun(
  run: StoredHostRun,
  status: BinaryHostRunStatus,
  attachedRes?: ServerResponse | null,
  extra?: { message?: string; error?: string }
): Promise<void> {
  run.status = status;
  run.updatedAt = nowIso();
  if (extra?.error) run.error = extra.error;
  run.checkpointState = buildCheckpointState(run);
  await persistHostRun(run);
  if (extra?.message) {
    await emitHostStatus(run, extra.message, attachedRes);
  }
}

async function pauseRun(
  run: StoredHostRun,
  attachedRes?: ServerResponse | null,
  reason?: string
): Promise<void> {
  run.takeoverReason = reason || run.takeoverReason;
  await finalizeRun(run, "paused", attachedRes, {
    message: reason || "Binary Host paused the run.",
  });
}

async function cancelRun(
  run: StoredHostRun,
  attachedRes?: ServerResponse | null,
  reason?: string
): Promise<void> {
  await finalizeRun(run, "cancelled", attachedRes, {
    message: reason || "Binary Host cancelled the run.",
  });
}

async function startRunExecution(runId: string, attachedRes?: ServerResponse | null): Promise<void> {
  const existing = activeExecutions.get(runId);
  if (existing) {
    await existing;
    return;
  }

  const execution = executeHostRun(runId, attachedRes)
    .catch(async (error) => {
      const run = await loadRunRecord(runId);
      if (run) {
        run.error = error instanceof Error ? error.message : String(error);
        run.updatedAt = nowIso();
        await persistHostRun(run);
      }
    })
    .finally(() => {
      activeExecutions.delete(runId);
      runControllers.delete(runId);
    });

  activeExecutions.set(runId, execution);
  await execution;
}

async function executeHostRun(runId: string, attachedRes?: ServerResponse | null): Promise<void> {
  const run = await loadRunRecord(runId);
  if (!run) throw new Error(`Unknown Binary Host run ${runId}`);

  const preferences = await loadPreferences();
  const auth = await getApiKeyRecord();
  if (!auth.apiKey) {
    await finalizeRun(run, "failed", attachedRes, {
      error: "No Binary IDE API key is configured in the local host.",
      message: "Binary Host could not start because no API key is configured.",
    });
    return;
  }

  const grant = run.workspaceRoot ? isWorkspaceTrusted(preferences, run.workspaceRoot) : null;
  run.workspaceTrustMode = deriveWorkspaceTrustMode(grant);
  if (run.workspaceRoot && !grant) {
    await finalizeRun(run, "failed", attachedRes, {
      error: `Workspace ${run.workspaceRoot} is not trusted.`,
      message: "Binary Host blocked the run because the workspace is not trusted.",
    });
    return;
  }

  const controller: RunControllerState = {
    pauseRequested: false,
    cancelRequested: false,
  };
  runControllers.set(run.id, controller);

  run.status = "running";
  run.error = undefined;
  run.takeoverReason = undefined;
  run.leaseId = randomUUID();
  run.resumeToken = buildResumeToken();
  run.heartbeatAt = nowIso();
  run.leaseState = {
    leaseId: run.leaseId,
    workerId: `${os.hostname()}:${process.pid}`,
    startedAt: run.heartbeatAt,
    heartbeatAt: run.heartbeatAt,
    ...(run.lastToolAt ? { lastToolAt: run.lastToolAt } : {}),
  };
  run.updatedAt = nowIso();
  run.checkpointState = buildCheckpointState(run);
  await persistHostRun(run);
  await emitHostStatus(run, "Binary Host accepted the request.", attachedRes, {
    attached: Boolean(attachedRes),
  });
  await emitHostHeartbeat(run, attachedRes);

  let executor:
    | {
        execute: (pendingToolCall: PendingToolCall) => Promise<ToolResult>;
      }
    | null = null;
  if (run.workspaceRoot) {
    executor = await createHostToolExecutor(run.workspaceRoot);
  }

  try {
    let envelope = await runWithTransportRetry(run, attachedRes, () =>
      streamHostedAssist({
        baseUrl: preferences.baseUrl,
        apiKey: auth.apiKey as string,
        request: run.request,
        onEvent: async (event) => {
          await appendRunEvent(run, event, attachedRes);
          if (typeof event.sessionId === "string") run.sessionId = event.sessionId;
          const eventName = typeof event.event === "string" ? event.event : "";
          if (eventName === "meta" && event.data && typeof event.data === "object") {
            const data = event.data as Record<string, unknown>;
            if (typeof data.traceId === "string") run.traceId = data.traceId;
            if (typeof data.sessionId === "string") run.sessionId = data.sessionId;
            if (typeof data.runId === "string") run.runId = data.runId;
          }
        },
      })
    );

    applyEnvelopeToRun(run, envelope);
    updatePendingStats(run, envelope);
    await persistHostRun(run);
    await emitHostBudget(run, attachedRes);

    while (envelope.pendingToolCall && envelope.runId) {
      if (controller.cancelRequested) {
        await cancelRun(run, attachedRes, "Binary Host cancelled the run before the next tool execution.");
        return;
      }
      if (controller.pauseRequested) {
        await pauseRun(run, attachedRes, "Binary Host paused the run before the next tool execution.");
        return;
      }

      const pendingToolCall = envelope.pendingToolCall;
      const blocked = await enforceToolPolicy(run, preferences, pendingToolCall);
      const toolResult =
        blocked ||
        (executor
          ? await executor.execute(pendingToolCall)
          : blockedToolResult(pendingToolCall, "Binary Host has no local workspace executor for this run."));

      run.toolResults.push(toolResult);
      run.toolResults = run.toolResults.slice(-MAX_TOOL_RESULT_HISTORY);
      run.lastToolAt = toolResult.createdAt || nowIso();
      if (run.leaseState) run.leaseState.lastToolAt = run.lastToolAt;
      run.heartbeatAt = nowIso();
      if (run.leaseState) run.leaseState.heartbeatAt = run.heartbeatAt;
      if (!isObserveTool(pendingToolCall.toolCall.name)) {
        run.observationOnlyStreak = 0;
      }
      await appendRunEvent(
        run,
        {
          event: "tool_result",
          data: {
            name: toolResult.name,
            ok: toolResult.ok,
            summary: toolResult.summary,
            blocked: toolResult.blocked ?? false,
          },
        },
        attachedRes
      );

      const checkpoint = recordToolCheckpoint(run, pendingToolCall, toolResult);
      if (checkpoint) {
        run.checkpoints.push(checkpoint);
        run.checkpoints = run.checkpoints.slice(-MAX_CHECKPOINT_HISTORY);
        run.checkpointState = buildCheckpointState(run);
        await emitHostCheckpoint(run, checkpoint, attachedRes);
      }

      await emitHostHeartbeat(run, attachedRes);

      envelope = await runWithTransportRetry(run, attachedRes, () =>
        continueHostedRun({
          baseUrl: preferences.baseUrl,
          apiKey: auth.apiKey as string,
          runId: envelope.runId as string,
          toolResult,
          sessionId: envelope.sessionId,
        })
      );

      applyEnvelopeToRun(run, envelope);
      updatePendingStats(run, envelope);
      await appendRunEvent(
        run,
        {
          event: "meta",
          data: attachHostMetadata(envelope, run),
        },
        attachedRes
      );
      if (envelope.pendingToolCall) {
        await appendRunEvent(
          run,
          {
            event: "tool_request",
            data: envelope.pendingToolCall,
          },
          attachedRes
        );
      }
      if (envelope.final) {
        await appendRunEvent(
          run,
          {
            event: "final",
            data: envelope.final,
          },
          attachedRes
        );
      }

      await emitHostBudget(run, attachedRes);
      const stallReason = detectStall(run, envelope);
      if (stallReason) {
        run.status = "takeover_required";
        run.takeoverReason = stallReason;
        run.updatedAt = nowIso();
        await persistHostRun(run);
        await emitHostStall(run, stallReason, attachedRes);
        await emitTakeoverRequired(run, stallReason, attachedRes);
        await emitHostStatus(run, "Binary Host needs operator takeover to continue safely.", attachedRes, {
          reason: stallReason,
        });
        return;
      }
    }

    run.finalEnvelope = attachHostMetadata(envelope, run);
    run.updatedAt = nowIso();
    await refreshRunPreferences(run);

    if (
      envelope.completionStatus === "incomplete" ||
      (Array.isArray(envelope.missingRequirements) && envelope.missingRequirements.length > 0)
    ) {
      const reason =
        (Array.isArray(envelope.missingRequirements) && envelope.missingRequirements.join("; ")) ||
        "The hosted run stopped without proving completion.";
      run.takeoverReason = reason;
      await finalizeRun(run, "takeover_required", attachedRes, {
        message: "Binary Host paused for takeover because completion could not be proven.",
      });
      await emitTakeoverRequired(run, reason, attachedRes);
      return;
    }

    await finalizeRun(run, "completed", attachedRes, {
      message: "Binary Host completed the run.",
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    run.error = message;
    run.updatedAt = nowIso();
    if (run.runId || run.toolResults.length > 0) {
      run.status = "takeover_required";
      run.takeoverReason = message;
      await persistHostRun(run);
      await emitTakeoverRequired(run, message, attachedRes);
      await emitHostStatus(run, "Binary Host preserved the run for takeover after an execution failure.", attachedRes, {
        error: message,
      });
      return;
    }
    await finalizeRun(run, "failed", attachedRes, {
      error: message,
      message: "Binary Host failed before the hosted run could be recovered.",
    });
  } finally {
    if (attachedRes && !attachedRes.destroyed && !attachedRes.writableEnded) {
      attachedRes.write("data: [DONE]\n\n");
      attachedRes.end();
    }
  }
}

async function handleAssist(req: IncomingMessage, res: ServerResponse): Promise<void> {
  const body = (await readJsonBody(req)) as Partial<AssistRequest>;
  const task = String(body.task || "").trim();
  if (!task) {
    writeJson(res, 400, { error: "Invalid request", message: "task is required" });
    return;
  }

  const preferences = await loadPreferences();
  const request: AssistRequest = {
    task,
    mode: (body.mode as AssistMode) || "auto",
    model: String(body.model || "Binary IDE"),
    historySessionId: typeof body.historySessionId === "string" ? body.historySessionId : undefined,
    workspaceRoot:
      typeof body.workspaceRoot === "string" && body.workspaceRoot.trim()
        ? normalizeWorkspacePath(body.workspaceRoot)
        : undefined,
    detach: body.detach === true,
    client:
      body.client && typeof body.client === "object" ? (body.client as BinaryHostClientInfo) : { surface: "unknown" },
  };

  const trustGrant = request.workspaceRoot ? isWorkspaceTrusted(preferences, request.workspaceRoot) : null;
  if (request.workspaceRoot && !trustGrant) {
    writeJson(res, 403, {
      error: "Workspace not trusted",
      message: `Trust ${request.workspaceRoot} with POST /v1/workspaces/trust before running local tool execution through Binary Host.`,
    });
    return;
  }

  const createdAt = nowIso();
  const run: StoredHostRun = {
    id: randomUUID(),
    status: "queued",
    createdAt,
    updatedAt: createdAt,
    client: request.client || { surface: "unknown" },
    request,
    workspaceRoot: request.workspaceRoot,
    workspaceTrustMode: deriveWorkspaceTrustMode(trustGrant),
    traceId: randomUUID(),
    resumeToken: buildResumeToken(),
    controlHistory: [],
    toolResults: [],
    checkpoints: [],
    events: [],
  };
  run.checkpointState = buildCheckpointState(run);
  await persistHostRun(run);

  if (request.detach) {
    void startRunExecution(run.id);
    writeJson(res, 202, buildRunSummary(run));
    return;
  }

  writeSseHeaders(res);
  req.on("close", () => {
    if (!res.writableEnded) {
      res.end();
    }
  });
  await startRunExecution(run.id, res);
}

const server = createServer(async (req, res) => {
  const method = String(req.method || "GET").toUpperCase();
  const url = new URL(req.url || "/", `http://${req.headers.host || "localhost"}`);

  if (method === "OPTIONS") {
    withCors(res);
    res.writeHead(204);
    res.end();
    return;
  }

  try {
    await ensureHostDirs();

    if (method === "GET" && url.pathname === "/v1/healthz") {
      const auth = await getApiKeyRecord();
      writeJson(res, 200, {
        ok: true,
        service: "binary-host",
        version: HOST_VERSION,
        transport: "localhost-http",
        secureStorageAvailable: auth.secureStorageAvailable,
      });
      return;
    }

    if (method === "GET" && url.pathname === "/v1/auth/status") {
      const auth = await getApiKeyRecord();
      writeJson(res, 200, {
        hasApiKey: Boolean(auth.apiKey),
        maskedApiKey: maskApiKey(auth.apiKey),
        storageMode: auth.storageMode,
        configPath: LEGACY_CONFIG_PATH,
      });
      return;
    }

    if (method === "POST" && url.pathname === "/v1/auth/api-key") {
      const body = await readJsonBody(req);
      const apiKey = String(body.apiKey || "").trim();
      if (!apiKey) {
        writeJson(res, 400, { error: "Invalid request", message: "apiKey is required" });
        return;
      }
      const status = await setApiKey(apiKey);
      writeJson(res, 200, {
        hasApiKey: true,
        maskedApiKey: maskApiKey(apiKey),
        storageMode: status.storageMode,
        configPath: LEGACY_CONFIG_PATH,
      });
      return;
    }

    if (method === "DELETE" && url.pathname === "/v1/auth/api-key") {
      const status = await clearApiKey();
      writeJson(res, 200, {
        hasApiKey: false,
        maskedApiKey: null,
        storageMode: "none",
        configPath: LEGACY_CONFIG_PATH,
        secureStorageAvailable: status.secureStorageAvailable,
      });
      return;
    }

    if (method === "GET" && url.pathname === "/v1/preferences") {
      writeJson(res, 200, await loadPreferences());
      return;
    }

    if (method === "POST" && url.pathname === "/v1/preferences") {
      const body = await readJsonBody(req);
      const current = await loadPreferences();
      const next: BinaryHostPreferences = {
        ...current,
        ...(body as Partial<BinaryHostPreferences>),
        baseUrl: String(body.baseUrl || current.baseUrl).replace(/\/+$/, ""),
        trustedWorkspaces: Array.isArray(body.trustedWorkspaces) ? (body.trustedWorkspaces as BinaryHostTrustGrant[]) : current.trustedWorkspaces,
        recentSessions: Array.isArray(body.recentSessions) ? (body.recentSessions as BinaryHostPreferences["recentSessions"]) : current.recentSessions,
        artifactHistory: Array.isArray(body.artifactHistory) ? (body.artifactHistory as BinaryHostPreferences["artifactHistory"]) : current.artifactHistory,
      };
      await savePreferences(next);
      writeJson(res, 200, next);
      return;
    }

    if (method === "POST" && url.pathname === "/v1/workspaces/trust") {
      const body = await readJsonBody(req);
      const target = String(body.path || "").trim();
      if (!target) {
        writeJson(res, 400, { error: "Invalid request", message: "path is required" });
        return;
      }
      const current = await loadPreferences();
      const grant: BinaryHostTrustGrant = {
        path: normalizeWorkspacePath(target),
        mutate: typeof body.mutate === "boolean" ? body.mutate : true,
        commands: body.commands === "prompt" ? "prompt" : "allow",
        network: body.network === "allow" ? "allow" : "deny",
        elevated: body.elevated === "allow" ? "allow" : "deny",
        grantedAt: nowIso(),
      };
      current.trustedWorkspaces = [grant, ...current.trustedWorkspaces.filter((item) => normalizeWorkspacePath(item.path) !== grant.path)].slice(0, 60);
      await savePreferences(current);
      writeJson(res, 200, current.trustedWorkspaces);
      return;
    }

    if (method === "POST" && url.pathname === "/v1/runs/assist") {
      await handleAssist(req, res);
      return;
    }

    if (method === "GET" && url.pathname === "/v1/runs") {
      const limitRaw = url.searchParams.get("limit");
      const limit = limitRaw ? Number.parseInt(limitRaw, 10) : 20;
      const runs = await readAllRuns();
      writeJson(res, 200, {
        runs: runs
          .sort((a, b) => String(b.updatedAt).localeCompare(String(a.updatedAt)))
          .slice(0, Number.isFinite(limit) ? Math.max(1, limit) : 20)
          .map((run) => buildRunSummary(run)),
      });
      return;
    }

    const runMatch = url.pathname.match(/^\/v1\/runs\/([^/]+)$/);
    if (method === "GET" && runMatch) {
      const run = await loadRunRecord(decodeURIComponent(runMatch[1] || ""));
      if (!run) {
        writeJson(res, 404, { error: "Not found", message: "Unknown Binary Host run." });
        return;
      }
      writeJson(res, 200, run as unknown as Record<string, unknown>);
      return;
    }

    const eventsMatch = url.pathname.match(/^\/v1\/runs\/([^/]+)\/events$/);
    if (method === "GET" && eventsMatch) {
      const run = await loadRunRecord(decodeURIComponent(eventsMatch[1] || ""));
      if (!run) {
        writeJson(res, 404, { error: "Not found", message: "Unknown Binary Host run." });
        return;
      }
      const afterRaw = url.searchParams.get("after");
      const after = afterRaw ? Number.parseInt(afterRaw, 10) : 0;
      writeJson(res, 200, {
        run: buildRunSummary(run),
        events: run.events.filter((event) => event.seq > (Number.isFinite(after) ? after : 0)),
        done: isTerminalStatus(run.status) || run.status === "takeover_required",
      });
      return;
    }

    const controlMatch = url.pathname.match(/^\/v1\/runs\/([^/]+)\/control$/);
    if (method === "POST" && controlMatch) {
      const run = await loadRunRecord(decodeURIComponent(controlMatch[1] || ""));
      if (!run) {
        writeJson(res, 404, { error: "Not found", message: "Unknown Binary Host run." });
        return;
      }
      const body = await readJsonBody(req);
      const action = String(body.action || "").trim() as BinaryHostRunControlAction;
      if (!["pause", "resume", "cancel", "repair", "takeover", "retry_last_turn"].includes(action)) {
        writeJson(res, 400, { error: "Invalid request", message: "Unknown control action." });
        return;
      }
      const note = typeof body.note === "string" ? body.note.trim() : null;
      run.controlHistory.push({
        action,
        note,
        at: nowIso(),
      });
      const controller = runControllers.get(run.id) || {
        pauseRequested: false,
        cancelRequested: false,
      };
      runControllers.set(run.id, controller);

      if (action === "pause") {
        controller.pauseRequested = true;
        if (!activeExecutions.has(run.id) && !isTerminalStatus(run.status)) {
          run.status = "paused";
          run.takeoverReason = note || "Paused by operator.";
          run.updatedAt = nowIso();
          await persistHostRun(run);
        }
      } else if (action === "cancel") {
        controller.cancelRequested = true;
        if (!activeExecutions.has(run.id) && !isTerminalStatus(run.status)) {
          run.status = "cancelled";
          run.updatedAt = nowIso();
          await persistHostRun(run);
        }
      } else if (action === "takeover") {
        controller.pauseRequested = true;
        run.status = "takeover_required";
        run.takeoverReason = note || "Operator takeover requested.";
        run.updatedAt = nowIso();
        await persistHostRun(run);
      } else {
        controller.pauseRequested = false;
        controller.cancelRequested = false;
        if (!activeExecutions.has(run.id)) {
          run.status = "queued";
          run.takeoverReason = undefined;
          run.error = undefined;
          run.updatedAt = nowIso();
          await persistHostRun(run);
          void startRunExecution(run.id);
        }
      }

      writeJson(res, 200, buildRunSummary(await loadRunRecord(run.id) || run));
      return;
    }

    const exportMatch = url.pathname.match(/^\/v1\/runs\/([^/]+)\/export$/);
    if (method === "GET" && exportMatch) {
      const run = await loadRunRecord(decodeURIComponent(exportMatch[1] || ""));
      if (!run) {
        writeJson(res, 404, { error: "Not found", message: "Unknown Binary Host run." });
        return;
      }
      writeJson(res, 200, run as unknown as Record<string, unknown>);
      return;
    }

    if (method === "GET" && url.pathname === "/v1/debug/runs") {
      const files = await fs.readdir(RUNS_DIR).catch(() => []);
      writeJson(res, 200, {
        runs: files
          .filter((name) => name.endsWith(".json"))
          .sort((a, b) => b.localeCompare(a))
          .slice(0, 50),
      });
      return;
    }

    writeJson(res, 404, {
      error: "Not found",
      message: `Unknown route ${url.pathname}`,
    });
  } catch (error) {
    writeJson(res, 500, {
      error: "Internal error",
      message: error instanceof Error ? error.message : String(error),
    });
  }
});

server.listen(PORT, HOST, () => {
  process.stdout.write(`Binary Host listening on http://${HOST}:${PORT}\n`);
});

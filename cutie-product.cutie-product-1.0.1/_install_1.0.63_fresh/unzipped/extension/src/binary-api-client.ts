/**
 * Portable bundle REST + SSE client for `/api/v1/binary/builds/*`.
 * When the Streaming Binary IDE platform adds new real-time events, extend `BinaryBuildEvent` in
 * `binary-types.ts` (see `BINARY_STREAMING_PLAN_FUTURE_EVENTS`) and handle them in
 * `CutieBinaryBundleController.handleBinaryBuildEvent`.
 */
import { requestJson } from "@xpersona/vscode-core";
import { getBinaryApiBaseUrl } from "./config";
import { parseBinarySseEventDataJson } from "./binary-sse-parse";
import type {
  BinaryBuildEvent,
  BinaryBuildRecord,
  BinaryContextPayload,
  BinaryTargetEnvironment,
  RequestAuth,
  RetrievalHints,
} from "./binary-types";

type BinaryBuildCreateInput = {
  auth: RequestAuth;
  intent: string;
  workspaceFingerprint: string;
  historySessionId?: string | null;
  targetEnvironment: BinaryTargetEnvironment;
  context?: BinaryContextPayload;
  retrievalHints?: RetrievalHints;
};

type StreamBinaryBuildInput = BinaryBuildCreateInput & {
  signal?: AbortSignal;
  onEvent: (event: BinaryBuildEvent) => void | Promise<void>;
};

function buildAuthHeaders(auth: RequestAuth | null | undefined): Record<string, string> {
  const headers: Record<string, string> = {};
  if (auth?.bearer) headers.Authorization = `Bearer ${auth.bearer}`;
  else if (auth?.apiKey) headers["X-API-Key"] = auth.apiKey;
  return headers;
}

function buildCreatePayload(input: BinaryBuildCreateInput): Record<string, unknown> {
  return {
    intent: input.intent,
    workspaceFingerprint: input.workspaceFingerprint,
    ...(input.historySessionId ? { historySessionId: input.historySessionId } : {}),
    targetEnvironment: input.targetEnvironment,
    ...(input.context ? { context: input.context } : {}),
    ...(input.retrievalHints ? { retrievalHints: input.retrievalHints } : {}),
  };
}

export { parseBinarySseEventDataJson } from "./binary-sse-parse";

async function readBinarySse(input: {
  url: string;
  auth: RequestAuth;
  method: "GET" | "POST";
  body?: Record<string, unknown>;
  signal?: AbortSignal;
  onEvent: (event: BinaryBuildEvent) => void | Promise<void>;
}): Promise<void> {
  const response = await fetch(input.url, {
    method: input.method,
    headers: {
      ...buildAuthHeaders(input.auth),
      ...(input.body ? { "Content-Type": "application/json" } : {}),
      Accept: "text/event-stream",
      "Cache-Control": "no-cache",
    },
    body: input.body ? JSON.stringify(input.body) : undefined,
    signal: input.signal,
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`HTTP ${response.status}: ${text || response.statusText || "request failed"}`);
  }

  if (!response.body) {
    throw new Error("Binary stream ended before a response body was returned.");
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  const flushChunk = async (rawChunk: string) => {
    const json = parseBinarySseEventDataJson(rawChunk);
    if (!json) return;
    const parsed = JSON.parse(json) as BinaryBuildEvent;
    await input.onEvent(parsed);
  };

  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    let boundary = buffer.indexOf("\n\n");
    while (boundary >= 0) {
      const rawChunk = buffer.slice(0, boundary).trim();
      buffer = buffer.slice(boundary + 2);
      if (rawChunk) {
        await flushChunk(rawChunk);
      }
      boundary = buffer.indexOf("\n\n");
    }
  }

  if (buffer.trim()) {
    await flushChunk(buffer.trim());
  }
}

export async function createBinaryBuild(input: BinaryBuildCreateInput): Promise<BinaryBuildRecord> {
  const base = getBinaryApiBaseUrl();
  const response = await requestJson<{ data?: BinaryBuildRecord }>(
    "POST",
    `${base}/api/v1/binary/builds`,
    input.auth,
    buildCreatePayload(input)
  );
  return (response?.data || response) as BinaryBuildRecord;
}

export async function createBinaryBuildStream(input: StreamBinaryBuildInput): Promise<void> {
  const base = getBinaryApiBaseUrl();
  await readBinarySse({
    url: `${base}/api/v1/binary/builds/stream`,
    auth: input.auth,
    method: "POST",
    body: buildCreatePayload(input),
    signal: input.signal,
    onEvent: input.onEvent,
  });
}

export async function streamBinaryBuildEvents(input: {
  auth: RequestAuth;
  buildId: string;
  cursor?: string | null;
  signal?: AbortSignal;
  onEvent: (event: BinaryBuildEvent) => void | Promise<void>;
}): Promise<void> {
  const base = getBinaryApiBaseUrl();
  const url = new URL(`${base}/api/v1/binary/builds/${encodeURIComponent(input.buildId)}/events`);
  if (input.cursor) url.searchParams.set("cursor", input.cursor);
  await readBinarySse({
    url: url.toString(),
    auth: input.auth,
    method: "GET",
    signal: input.signal,
    onEvent: input.onEvent,
  });
}

export async function getBinaryBuild(auth: RequestAuth, buildId: string): Promise<BinaryBuildRecord> {
  const base = getBinaryApiBaseUrl();
  const response = await requestJson<{ data?: BinaryBuildRecord }>(
    "GET",
    `${base}/api/v1/binary/builds/${encodeURIComponent(buildId)}`,
    auth
  );
  return (response?.data || response) as BinaryBuildRecord;
}

export async function validateBinaryBuild(input: {
  auth: RequestAuth;
  buildId: string;
  targetEnvironment: BinaryTargetEnvironment;
}): Promise<BinaryBuildRecord> {
  const base = getBinaryApiBaseUrl();
  const response = await requestJson<{ data?: BinaryBuildRecord }>(
    "POST",
    `${base}/api/v1/binary/builds/${encodeURIComponent(input.buildId)}/validate`,
    input.auth,
    {
      targetEnvironment: input.targetEnvironment,
    }
  );
  return (response?.data || response) as BinaryBuildRecord;
}

export async function publishBinaryBuild(input: {
  auth: RequestAuth;
  buildId: string;
}): Promise<BinaryBuildRecord> {
  const base = getBinaryApiBaseUrl();
  const response = await requestJson<{ data?: BinaryBuildRecord }>(
    "POST",
    `${base}/api/v1/binary/builds/${encodeURIComponent(input.buildId)}/publish`,
    input.auth,
    {}
  );
  return (response?.data || response) as BinaryBuildRecord;
}

export async function cancelBinaryBuild(input: {
  auth: RequestAuth;
  buildId: string;
}): Promise<BinaryBuildRecord> {
  const base = getBinaryApiBaseUrl();
  const response = await requestJson<{ data?: BinaryBuildRecord }>(
    "POST",
    `${base}/api/v1/binary/builds/${encodeURIComponent(input.buildId)}/control`,
    input.auth,
    { action: "cancel" }
  );
  return (response?.data || response) as BinaryBuildRecord;
}

export async function refineBinaryBuild(input: {
  auth: RequestAuth;
  buildId: string;
  intent: string;
}): Promise<BinaryBuildRecord> {
  const base = getBinaryApiBaseUrl();
  const response = await requestJson<{ data?: BinaryBuildRecord }>(
    "POST",
    `${base}/api/v1/binary/builds/${encodeURIComponent(input.buildId)}/control`,
    input.auth,
    { action: "refine", intent: input.intent }
  );
  return (response?.data || response) as BinaryBuildRecord;
}

export async function branchBinaryBuild(input: {
  auth: RequestAuth;
  buildId: string;
  checkpointId?: string;
  intent?: string;
}): Promise<BinaryBuildRecord> {
  const base = getBinaryApiBaseUrl();
  const response = await requestJson<{ data?: BinaryBuildRecord }>(
    "POST",
    `${base}/api/v1/binary/builds/${encodeURIComponent(input.buildId)}/control`,
    input.auth,
    {
      action: "branch",
      ...(input.checkpointId ? { checkpointId: input.checkpointId } : {}),
      ...(input.intent ? { intent: input.intent } : {}),
    }
  );
  return (response?.data || response) as BinaryBuildRecord;
}

export async function rewindBinaryBuild(input: {
  auth: RequestAuth;
  buildId: string;
  checkpointId: string;
}): Promise<BinaryBuildRecord> {
  const base = getBinaryApiBaseUrl();
  const response = await requestJson<{ data?: BinaryBuildRecord }>(
    "POST",
    `${base}/api/v1/binary/builds/${encodeURIComponent(input.buildId)}/control`,
    input.auth,
    {
      action: "rewind",
      checkpointId: input.checkpointId,
    }
  );
  return (response?.data || response) as BinaryBuildRecord;
}

export async function executeBinaryBuild(input: {
  auth: RequestAuth;
  buildId: string;
  entryPoint: string;
  args?: unknown[];
}): Promise<BinaryBuildRecord> {
  const base = getBinaryApiBaseUrl();
  const response = await requestJson<{ data?: BinaryBuildRecord }>(
    "POST",
    `${base}/api/v1/binary/builds/${encodeURIComponent(input.buildId)}/execute`,
    input.auth,
    {
      entryPoint: input.entryPoint,
      ...(input.args?.length ? { args: input.args } : {}),
    }
  );
  return (response?.data || response) as BinaryBuildRecord;
}

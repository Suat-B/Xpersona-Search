/**
 * Portable bundle REST + SSE/WebSocket client for `/api/v1/binary/builds/*`.
 * When the Streaming Binary IDE platform adds new real-time events, extend `BinaryBuildEvent` in
 * `binary-types.ts` (see `BINARY_STREAMING_PLAN_FUTURE_EVENTS`) and handle them in
 * `CutieBinaryBundleController.handleBinaryBuildEvent`.
 */
import { requestJson } from "@xpersona/vscode-core";
import { getBinaryApiBaseUrl, getBinaryStreamGatewayUrl } from "./config";
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

type BinaryStreamTransport = "sse" | "websocket";

function buildAuthHeaders(auth: RequestAuth | null | undefined): Record<string, string> {
  const headers: Record<string, string> = {};
  if (auth?.bearer) headers.Authorization = `Bearer ${auth.bearer}`;
  else if (auth?.apiKey) headers["X-API-Key"] = auth.apiKey;
  return headers;
}

function normalizeHistorySessionId(historySessionId: string | null | undefined): string | null {
  const value = String(historySessionId || "").trim();
  if (!value) return null;
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value) ? value : null;
}

function buildCreatePayload(input: BinaryBuildCreateInput): Record<string, unknown> {
  const historySessionId = normalizeHistorySessionId(input.historySessionId);
  return {
    intent: input.intent,
    workspaceFingerprint: input.workspaceFingerprint,
    ...(historySessionId ? { historySessionId } : {}),
    targetEnvironment: input.targetEnvironment,
    ...(input.context ? { context: input.context } : {}),
    ...(input.retrievalHints ? { retrievalHints: input.retrievalHints } : {}),
  };
}

export { parseBinarySseEventDataJson } from "./binary-sse-parse";

export function resolveBinaryStreamTransport(stream?: BinaryBuildRecord["stream"] | null): BinaryStreamTransport {
  return stream?.transport === "websocket" ? "websocket" : "sse";
}

export function resolveBinaryStreamUrl(
  baseUrl: string,
  build: BinaryBuildRecord,
  cursor?: string | null,
  preferredTransport?: BinaryStreamTransport
): string | null {
  const stream = build.stream;
  if (!stream) return null;

  const buildCursor = cursor || stream.lastEventId || null;
  const wsCandidate = String(stream.wsPath || "").trim();
  const sessionId = String(stream.streamSessionId || "").trim();
  const gatewayUrl = getBinaryStreamGatewayUrl();
  const query = new URLSearchParams();
  if (buildCursor) query.set("cursor", buildCursor);
  if (stream.resumeToken) query.set("resumeToken", String(stream.resumeToken));
  if (sessionId) query.set("streamSessionId", sessionId);
  query.set("buildId", build.id);

  const transport = preferredTransport || resolveBinaryStreamTransport(stream);

  if (transport === "websocket") {
    let candidate = wsCandidate;
    if (!candidate && gatewayUrl && sessionId) {
      candidate = `${gatewayUrl.replace(/\/+$/, "")}/ws/${encodeURIComponent(sessionId)}`;
    }
    if (!candidate) {
      const fallback = String(stream.streamPath || "").trim();
      if (fallback) candidate = fallback;
    }
    if (!candidate) return null;
    const url = new URL(candidate, baseUrl);
    if (query.toString()) {
      for (const [key, value] of query.entries()) url.searchParams.set(key, value);
    }
    if (url.protocol === "http:") url.protocol = "ws:";
    if (url.protocol === "https:") url.protocol = "wss:";
    return url.toString();
  }

  const pathCandidate = String(stream.eventsPath || stream.streamPath || "").trim();
  if (!pathCandidate) return null;
  const url = new URL(pathCandidate, baseUrl);
  if (query.toString()) {
    for (const [key, value] of query.entries()) url.searchParams.set(key, value);
  }
  return url.toString();
}

function getRuntimeWebSocketCtor(): any | undefined {
  const ctor = (globalThis as { WebSocket?: any }).WebSocket;
  return typeof ctor === "function" ? ctor : undefined;
}

function normalizeBinaryStreamPayload(payload: unknown): string {
  if (typeof payload === "string") return payload;
  if (typeof ArrayBuffer !== "undefined" && payload instanceof ArrayBuffer) {
    return new TextDecoder().decode(payload);
  }
  if (typeof ArrayBuffer !== "undefined" && ArrayBuffer.isView(payload)) {
    const view = payload as ArrayBufferView;
    return new TextDecoder().decode(new Uint8Array(view.buffer, view.byteOffset, view.byteLength));
  }
  if (typeof Blob !== "undefined" && payload instanceof Blob) {
    throw new Error("Blob websocket payloads are not supported in this runtime.");
  }
  return String(payload || "");
}

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

async function readBinaryWebSocket(input: {
  url: string;
  signal?: AbortSignal;
  onEvent: (event: BinaryBuildEvent) => void | Promise<void>;
}): Promise<void> {
  const WebSocketCtor = getRuntimeWebSocketCtor();
  if (!WebSocketCtor) {
    throw new Error("WebSocket is unavailable in this runtime.");
  }

  if (input.signal?.aborted) {
    return Promise.resolve();
  }

  const socket = new WebSocketCtor(input.url);
  let chain = Promise.resolve();
  let settled = false;
  let resolvePromise: (() => void) | null = null;
  let rejectPromise: ((error: unknown) => void) | null = null;

  const settle = (fn: () => void) => {
    if (settled) return;
    settled = true;
    input.signal?.removeEventListener("abort", onAbort);
    fn();
  };

  const onAbort = () => {
    try {
      socket.close(1000, "aborted");
    } catch {
      /* ignore */
    }
    settle(() => resolvePromise?.());
  };

  if (input.signal) {
    input.signal.addEventListener("abort", onAbort, { once: true });
  }

  return new Promise<void>((resolve, reject) => {
    resolvePromise = resolve;
    rejectPromise = reject;

    const fail = (error: unknown) => {
      settle(() => rejectPromise?.(error instanceof Error ? error : new Error(String(error))));
    };

    socket.addEventListener("open", () => {
      /* no-op */
    });

    socket.addEventListener("message", (event: any) => {
      chain = chain
        .then(async () => {
          const text = normalizeBinaryStreamPayload(event.data);
          if (!text.trim()) return;
          const parsed = JSON.parse(text) as BinaryBuildEvent;
          await input.onEvent(parsed);
        })
        .catch((error) => {
          fail(error);
        });
    });

    socket.addEventListener("error", () => {
      fail(new Error("Binary websocket stream failed."));
    });

    socket.addEventListener("close", () => {
      chain
        .then(() => settle(() => resolvePromise?.()))
        .catch((error) => fail(error));
    });
  });
}

async function emitBinaryBuildCreated(
  build: BinaryBuildRecord,
  onEvent: (event: BinaryBuildEvent) => void | Promise<void>
): Promise<void> {
  await onEvent({
    id: `${build.id}:created`,
    buildId: build.id,
    timestamp: build.createdAt,
    type: "build.created",
    data: { build },
  });
}

async function followBinaryBuildRecord(input: {
  build: BinaryBuildRecord;
  auth: RequestAuth;
  cursor?: string | null;
  signal?: AbortSignal;
  onEvent: (event: BinaryBuildEvent) => void | Promise<void>;
  emitCreatedEvent?: boolean;
}): Promise<void> {
  const base = getBinaryApiBaseUrl();
  const streamUrl = resolveBinaryStreamUrl(base, input.build, input.cursor);
  if (input.emitCreatedEvent) {
    await emitBinaryBuildCreated(input.build, input.onEvent);
  }

  if (!input.build.stream) {
    return;
  }

  const transport = resolveBinaryStreamTransport(input.build.stream);
  const websocketAvailable = Boolean(getRuntimeWebSocketCtor());

  if (transport === "websocket" && streamUrl && websocketAvailable) {
    await readBinaryWebSocket({
      url: streamUrl,
      signal: input.signal,
      onEvent: input.onEvent,
    });
    return;
  }

  const fallbackUrl = resolveBinaryStreamUrl(base, input.build, input.cursor, "sse");
  if (!fallbackUrl) {
    return;
  }

  await readBinarySse({
    url: fallbackUrl,
    auth: input.auth,
    method: "GET",
    signal: input.signal,
    onEvent: input.onEvent,
  });
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
  const build = await createBinaryBuild(input);
  await followBinaryBuildRecord({
    build,
    auth: input.auth,
    signal: input.signal,
    cursor: build.stream?.lastEventId || null,
    onEvent: input.onEvent,
    emitCreatedEvent: true,
  });
}

export async function streamBinaryBuildEvents(input: {
  auth: RequestAuth;
  buildId: string;
  cursor?: string | null;
  signal?: AbortSignal;
  onEvent: (event: BinaryBuildEvent) => void | Promise<void>;
}): Promise<void> {
  const build = await getBinaryBuild(input.auth, input.buildId);
  await followBinaryBuildRecord({
    build,
    auth: input.auth,
    cursor: input.cursor || build.stream?.lastEventId || null,
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

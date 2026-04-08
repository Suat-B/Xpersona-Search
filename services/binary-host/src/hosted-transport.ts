type AssistMode = "auto" | "plan" | "yolo" | "generate" | "debug";
type HostedAssistMode = "auto" | "plan" | "yolo";

export type HostedAssistRequest = {
  task: string;
  mode: AssistMode;
  model: string;
  speedProfile?: "fast" | "balanced" | "thorough";
  startupPhase?: "fast_start" | "context_enrichment" | "full_run";
  routePolicy?: {
    turnBudgetMs?: number;
    maxIterations?: number;
    stallTimeoutMs?: number;
    missionFirstBrowser?: boolean;
  };
  chatModelSource?: "platform" | "user_connected";
  fallbackToPlatformModel?: boolean;
  historySessionId?: string;
  execution?: {
    lane?: "local_interactive" | "openhands_headless" | "openhands_remote";
    pluginPacks?: Array<{
      id: string;
      title?: string;
    }>;
    skillSources?: Array<{
      id: string;
      kind?: string;
      path?: string;
    }>;
    traceId?: string;
    traceSampled?: boolean;
  };
  tom?: {
    enabled?: boolean;
  };
  mcp?: {
    mcpServers: Record<string, Record<string, unknown>>;
  };
  context?: Record<string, unknown>;
  clientCapabilities?: {
    toolLoop?: boolean;
    supportedTools?: string[];
    autoExecute?: boolean;
    supportsNativeToolResults?: boolean;
  };
  userConnectedModels?: Array<{
    alias: string;
    provider: string;
    displayName: string;
    model: string;
    baseUrl: string;
    apiKey: string;
    authSource: "user_connected";
    candidateSource: "user_connected";
    preferred?: boolean;
    latencyTier?: "fast" | "balanced" | "thorough";
    reasoningDefault?: "low" | "medium" | "high";
    intendedUse?: "chat" | "action" | "repair";
  }>;
};

export type HostedToolCall = {
  id: string;
  name: string;
  arguments: Record<string, unknown>;
  kind?: "observe" | "mutate" | "command";
  summary?: string;
};

export type HostedPendingToolCall = {
  step: number;
  adapter: string;
  requiresClientExecution: boolean;
  toolCall: HostedToolCall;
  availableTools?: string[];
  createdAt: string;
};

export type HostedToolResult = {
  toolCallId: string;
  name: string;
  ok: boolean;
  blocked?: boolean;
  summary: string;
  data?: Record<string, unknown>;
  error?: string;
  createdAt?: string;
};

export type HostedAssistRunEnvelope = {
  sessionId?: string;
  traceId?: string;
  executionLane?: "local_interactive" | "openhands_headless" | "openhands_remote";
  pluginPacks?: unknown[];
  skillSources?: unknown[];
  conversationId?: string | null;
  persistenceDir?: string | null;
  jsonlPath?: string | null;
  final?: string;
  completionStatus?: "complete" | "incomplete";
  runId?: string;
  adapter?: string;
  pendingToolCall?: HostedPendingToolCall | null;
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

export type HostedAgentProbeRequest = {
  message: string;
  model?: string;
  gatewayRunId?: string;
  workspaceRoot?: string;
  context?: Record<string, unknown>;
  conversationHistory?: Array<{ role: "user" | "assistant"; content: string }>;
  tom?: {
    enabled?: boolean;
    userKey?: string;
    sessionId?: string;
    traceId?: string;
  };
};

export type HostedAgentProbeResponse = {
  runId: string;
  final: string;
  logs: string[];
  adapter?: string;
  toolCall?: HostedToolCall;
  version?: string | null;
  modelCandidate?: Record<string, unknown> | null;
  fallbackAttempt?: number;
  failureReason?: string | null;
  persistenceDir?: string | null;
  conversationId?: string | null;
  fallbackTrail?: Array<Record<string, unknown>>;
};

type FetchLike = typeof fetch;

const DEFAULT_FETCH_TIMEOUT_MS = 20_000;
const DEFAULT_CONTINUE_FETCH_TIMEOUT_MS = 60_000;
const DEFAULT_STREAM_IDLE_TIMEOUT_MS = 20_000;

function parseTimeoutMs(raw: string | undefined, fallback: number): number {
  const parsed = Number(raw);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function getHostedFetchTimeoutMs(): number {
  return parseTimeoutMs(process.env.BINARY_HOST_HOSTED_FETCH_TIMEOUT_MS, DEFAULT_FETCH_TIMEOUT_MS);
}

function getHostedContinueFetchTimeoutMs(): number {
  return parseTimeoutMs(
    process.env.BINARY_HOST_HOSTED_CONTINUE_FETCH_TIMEOUT_MS,
    DEFAULT_CONTINUE_FETCH_TIMEOUT_MS
  );
}

function getHostedStreamIdleTimeoutMs(): number {
  return parseTimeoutMs(process.env.BINARY_HOST_HOSTED_STREAM_IDLE_TIMEOUT_MS, DEFAULT_STREAM_IDLE_TIMEOUT_MS);
}

function toHostedMode(mode: AssistMode): HostedAssistMode {
  return mode === "plan" ? "plan" : mode === "yolo" ? "yolo" : "auto";
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

async function fetchWithTimeout(
  fetchImpl: FetchLike,
  url: string,
  init: RequestInit,
  timeoutMs: number,
  timeoutLabel: string
): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(new Error(timeoutLabel)), timeoutMs);
  try {
    return await fetchImpl(url, {
      ...init,
      signal: controller.signal,
    });
  } catch (error) {
    if (controller.signal.aborted) {
      throw new Error(timeoutLabel);
    }
    throw error;
  } finally {
    clearTimeout(timer);
  }
}

async function readStreamChunkWithTimeout<T>(
  reader: ReadableStreamDefaultReader<T>,
  timeoutMs: number,
  timeoutLabel: string
): Promise<ReadableStreamReadResult<T>> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  return await Promise.race([
    reader.read().finally(() => {
      if (timer) clearTimeout(timer);
    }),
    new Promise<never>((_, reject) => {
      timer = setTimeout(() => {
        reject(new Error(timeoutLabel));
      }, timeoutMs);
    }),
  ]);
}

export async function streamHostedAssist(
  input: {
    baseUrl: string;
    apiKey: string;
    request: HostedAssistRequest;
    onEvent: (event: Record<string, unknown>) => Promise<void> | void;
  },
  options: {
    fetchImpl?: FetchLike;
    fetchTimeoutMs?: number;
    streamIdleTimeoutMs?: number;
  } = {}
): Promise<HostedAssistRunEnvelope> {
  const fetchImpl = options.fetchImpl || fetch;
  const fetchTimeoutMs = options.fetchTimeoutMs ?? getHostedFetchTimeoutMs();
  const streamIdleTimeoutMs = options.streamIdleTimeoutMs ?? getHostedStreamIdleTimeoutMs();
  const response = await fetchWithTimeout(
    fetchImpl,
    `${input.baseUrl}/api/v1/playground/assist`,
    {
      method: "POST",
      headers: buildHostedHeaders(input.apiKey),
      body: JSON.stringify({
        task: input.request.task,
        mode: toHostedMode(input.request.mode),
        model: input.request.model || "Binary IDE",
        ...(input.request.chatModelSource ? { chatModelSource: input.request.chatModelSource } : {}),
        ...(input.request.fallbackToPlatformModel !== undefined
          ? { fallbackToPlatformModel: input.request.fallbackToPlatformModel }
          : {}),
        ...(input.request.execution ? { execution: input.request.execution } : {}),
        ...(input.request.routePolicy ? { routePolicy: input.request.routePolicy } : {}),
        stream: true,
        historySessionId: input.request.historySessionId,
        ...(input.request.tom ? { tom: input.request.tom } : {}),
        ...(input.request.mcp ? { mcp: input.request.mcp } : {}),
        ...(input.request.context ? { context: input.request.context } : {}),
        ...(input.request.clientCapabilities ? { clientCapabilities: input.request.clientCapabilities } : {}),
        ...(input.request.userConnectedModels ? { userConnectedModels: input.request.userConnectedModels } : {}),
        contextBudget: {
          strategy: "hybrid",
          maxTokens: 16384,
        },
      }),
    },
    fetchTimeoutMs,
    `Timed out waiting for hosted assist after ${fetchTimeoutMs}ms.`
  );

  if (!response.ok || !response.body) {
    const failure = await parseHostedError(response);
    throw new Error(failure.message);
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  const envelope: HostedAssistRunEnvelope = {
    actions: [],
    missingRequirements: [],
  };
  let buffer = "";

  while (true) {
    const { value, done } = await readStreamChunkWithTimeout(
      reader,
      streamIdleTimeoutMs,
      `Timed out waiting for hosted assist stream activity after ${streamIdleTimeoutMs}ms.`
    );
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
        envelope.pendingToolCall = parsed.data as unknown as HostedPendingToolCall;
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

export async function continueHostedRun(
  input: {
    baseUrl: string;
    apiKey: string;
    runId: string;
    toolResult: HostedToolResult;
    sessionId?: string;
  },
  options: {
    fetchImpl?: FetchLike;
    fetchTimeoutMs?: number;
  } = {}
): Promise<HostedAssistRunEnvelope> {
  const fetchImpl = options.fetchImpl || fetch;
  const fetchTimeoutMs = options.fetchTimeoutMs ?? getHostedContinueFetchTimeoutMs();
  const response = await fetchWithTimeout(
    fetchImpl,
    `${input.baseUrl}/api/v1/playground/runs/${encodeURIComponent(input.runId)}/continue`,
    {
      method: "POST",
      headers: buildHostedHeaders(input.apiKey),
      body: JSON.stringify(
        input.sessionId ? { toolResult: input.toolResult, sessionId: input.sessionId } : { toolResult: input.toolResult }
      ),
    },
    fetchTimeoutMs,
    `Timed out waiting for hosted continue after ${fetchTimeoutMs}ms.`
  );

  if (!response.ok) {
    const failure = await parseHostedError(response);
    throw new Error(failure.message);
  }
  const parsed = (await response.json().catch(() => ({}))) as { data?: HostedAssistRunEnvelope } | HostedAssistRunEnvelope;
  const envelope = ("data" in parsed ? parsed.data : parsed) || {};
  return envelope as HostedAssistRunEnvelope;
}

export async function runHostedAgentProbe(
  input: {
    baseUrl: string;
    apiKey: string;
    request: HostedAgentProbeRequest;
  },
  options: {
    fetchImpl?: FetchLike;
    fetchTimeoutMs?: number;
  } = {}
): Promise<HostedAgentProbeResponse> {
  const fetchImpl = options.fetchImpl || fetch;
  const fetchTimeoutMs = options.fetchTimeoutMs ?? getHostedContinueFetchTimeoutMs();
  const response = await fetchWithTimeout(
    fetchImpl,
    `${input.baseUrl}/api/v1/playground/debug/agent-probe`,
    {
      method: "POST",
      headers: buildHostedHeaders(input.apiKey),
      body: JSON.stringify(input.request),
    },
    fetchTimeoutMs,
    `Timed out waiting for hosted agent probe after ${fetchTimeoutMs}ms.`
  );

  if (!response.ok) {
    const failure = await parseHostedError(response);
    throw new Error(failure.message);
  }

  const parsed = (await response.json().catch(() => ({}))) as
    | { data?: HostedAgentProbeResponse }
    | HostedAgentProbeResponse;
  const payload = ("data" in parsed ? parsed.data : parsed) || {};
  return payload as HostedAgentProbeResponse;
}

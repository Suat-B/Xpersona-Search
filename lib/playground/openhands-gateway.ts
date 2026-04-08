import type {
  PlaygroundAdapter,
  PlaygroundToolName,
  ToolCallContract,
  ToolResultContract,
} from "@/lib/playground/contracts";
import { resolvePlaygroundModelSelection, resolvePlaygroundModelToken, type PlaygroundResolvedModelSelection } from "@/lib/playground/model-registry";
import type {
  AssistContextSelection,
  AssistConversationTurn,
  AssistPlan,
  AssistRuntimeInput,
  AssistTargetInference,
} from "@/lib/playground/orchestration";

type GatewayToolTraceEntry = {
  status: string;
  summary: string;
  toolCall?: { name?: string };
  toolResult?: ToolResultContract;
};

type OpenHandsGatewayRunRequest = {
  request: AssistRuntimeInput;
  tom?: {
    enabled: boolean;
    userKey?: string;
    sessionId?: string;
    traceId?: string;
  };
  mcp?: {
    mcpServers: Record<string, Record<string, unknown>>;
  };
  targetInference: AssistTargetInference;
  contextSelection: AssistContextSelection;
  fallbackPlan: AssistPlan;
  toolTrace: GatewayToolTraceEntry[];
  loopSummary: { stepCount: number; mutationCount: number; repairCount: number };
  availableTools: PlaygroundToolName[];
  latestToolResult?: ToolResultContract | null;
  repairDirective?: {
    stage:
      | "post_inspection_mutation_required"
      | "target_path_repair"
      | "patch_repair"
      | "single_file_rewrite"
      | "pine_specialization";
    reason: string;
  } | null;
  modelSelection: PlaygroundResolvedModelSelection;
  probe?: {
    enabled: boolean;
    sessionId?: string;
    workspaceRoot?: string;
  } | null;
};

export type OpenHandsGatewayTurn = {
  runId: string;
  adapter: PlaygroundAdapter;
  final: string;
  logs: string[];
  executionLane?: "local_interactive" | "openhands_headless" | "openhands_remote";
  pluginPacks?: Array<Record<string, unknown>>;
  skillSources?: Array<Record<string, unknown>>;
  traceId?: string | null;
  toolCall?: ToolCallContract;
  version?: string | null;
  modelCandidate?: {
    alias?: string;
    model?: string;
    provider?: string;
    baseUrl?: string;
  } | null;
  fallbackAttempt?: number;
  failureReason?: string | null;
  persistenceDir?: string | null;
  conversationId?: string | null;
  jsonlPath?: string | null;
  fallbackTrail?: Array<Record<string, unknown>>;
};

export type OpenHandsGatewayHealth =
  | {
      status: "healthy" | "degraded";
      message: string;
      gatewayUrl: string;
      runtimeKind?: "docker" | "local-python" | "remote" | "reduced-local" | "unknown";
      runtimeProfile?: "full" | "code-only" | "chat-only" | "unavailable";
      supportedTools?: string[];
      degradedReasons?: string[];
      availableActions?: string[];
      version?: string | null;
      packageFamily?: "openhands" | "openhands-sdk" | "unknown";
      packageVersion?: string | null;
      pythonVersion?: string | null;
      currentModelCandidate?: Record<string, unknown> | null;
      lastProviderFailureReason?: string | null;
      fallbackAvailable?: boolean;
      lastFallbackRecovered?: boolean;
      lastPersistenceDir?: string | null;
    }
  | {
      status: "missing_config" | "unauthorized" | "unreachable";
      message: string;
      gatewayUrl?: string;
      details?: string;
    };

export class OpenHandsGatewayError extends Error {
  constructor(
    message: string,
    readonly code:
      | "OPENHANDS_GATEWAY_MISSING_CONFIG"
      | "OPENHANDS_GATEWAY_UNAUTHORIZED"
      | "OPENHANDS_GATEWAY_UNREACHABLE"
      | "OPENHANDS_GATEWAY_INVALID_RESPONSE",
    readonly status: number,
    readonly details?: string
  ) {
    super(message);
    this.name = "OpenHandsGatewayError";
  }
}

export type OpenHandsGatewayEvent = Record<string, unknown>;

type OpenHandsGatewayRequestOptions = {
  onEvent?: (event: OpenHandsGatewayEvent) => Promise<void> | void;
};

/** Node/undici often throws `TypeError: fetch failed` with syscall detail on `cause`. */
function extractFetchFailureDetail(error: unknown): string {
  if (!(error instanceof Error)) return String(error);
  const parts: string[] = [];
  if (error.message) parts.push(error.message);
  const c = (error as Error & { cause?: unknown }).cause;
  if (c instanceof Error && c.message && !parts.includes(c.message)) {
    parts.push(c.message);
  }
  if (c && typeof c === "object" && c !== null && "code" in c) {
    const code = (c as { code?: string }).code;
    if (code) parts.push(`errno=${code}`);
  }
  return parts.length ? parts.join(" | ") : "unknown error";
}

function shortGatewayUrl(fullUrl: string): string {
  try {
    const u = new URL(fullUrl);
    return `${u.protocol}//${u.host}${u.pathname}`;
  } catch {
    return fullUrl.slice(0, 160);
  }
}

function describeGatewayFetchFailure(fullUrl: string, error: unknown): string {
  const detail = extractFetchFailureDetail(error);
  const target = shortGatewayUrl(fullUrl);
  return [
    `Could not connect to OpenHands gateway at ${target} (${detail}).`,
    "Set OPENHANDS_GATEWAY_URL to the gateway base URL (no trailing slash). Try http://127.0.0.1:8010 if localhost misbehaves.",
    "If the Next.js app runs inside Docker, use http://host.docker.internal:8010 (Windows/Mac) instead of localhost.",
    "From repo root: npm run openhands:gateway:docker — then curl http://127.0.0.1:8010/health on the same machine as Next.",
  ].join(" ");
}

function compactWhitespace(value: string): string {
  return String(value || "").replace(/\s+/g, " ").trim();
}

function sanitizeRelativePath(value: string | null | undefined): string | null {
  const normalized = String(value || "")
    .trim()
    .replace(/\\/g, "/")
    .replace(/^@+/, "")
    .replace(/^\.\/+/, "")
    .replace(/^\/+/, "");
  if (!normalized || normalized.includes("..") || /^[a-z]:\//i.test(normalized)) return null;
  return normalized;
}

function normalizeToolCall(value: unknown, availableTools: PlaygroundToolName[]): ToolCallContract | null {
  if (!value || typeof value !== "object") return null;
  const record = value as Record<string, unknown>;
  const name = String(record.name || "").trim() as PlaygroundToolName;
  if (!availableTools.includes(name)) return null;

  const args =
    record.arguments && typeof record.arguments === "object"
      ? ({ ...(record.arguments as Record<string, unknown>) } as Record<string, unknown>)
      : {};

  if (typeof args.path === "string") {
    const normalizedPath = sanitizeRelativePath(args.path);
    if (normalizedPath) {
      args.path = normalizedPath;
    } else if (name === "read_file" || name === "edit" || name === "write_file" || name === "mkdir") {
      return null;
    } else {
      delete args.path;
    }
  }

  if (name === "write_file" && typeof args.content === "string") {
    args.content = decodeLikelyEscapedMultilineText(args.content);
  }

  if (name === "edit" && typeof args.patch === "string") {
    args.patch = decodeLikelyEscapedMultilineText(args.patch);
  }

  const id = compactWhitespace(String(record.id || `openhands_${Date.now().toString(36)}`)).slice(0, 120);
  const kind =
    record.kind === "observe" || record.kind === "mutate" || record.kind === "command"
      ? record.kind
      : name === "edit" || name === "write_file" || name === "mkdir" || name === "create_checkpoint"
        ? "mutate"
        : name === "run_command"
          ? "command"
          : "observe";

  return {
    id,
    name,
    arguments: args,
    kind,
    summary: typeof record.summary === "string" ? record.summary.slice(0, 4_000) : undefined,
  };
}

function decodeLikelyEscapedMultilineText(value: string): string {
  const raw = String(value || "");
  if (!raw || /[\r\n]/.test(raw) || !/\\n|\\r|\\t|\\"/.test(raw)) return raw;
  const decoded = raw
    .replace(/\\r\\n/g, "\n")
    .replace(/\\n/g, "\n")
    .replace(/\\t/g, "\t")
    .replace(/\\"/g, "\"")
    .replace(/\\\\/g, "\\");
  return decoded.includes("\n") || decoded !== raw ? decoded : raw;
}

function extractBalancedJsonObject(text: string): string | null {
  const input = String(text || "");
  const start = input.indexOf("{");
  if (start < 0) return null;
  let depth = 0;
  let inString = false;
  let escaped = false;
  for (let i = start; i < input.length; i += 1) {
    const char = input[i];
    if (inString) {
      if (escaped) {
        escaped = false;
        continue;
      }
      if (char === "\\") {
        escaped = true;
        continue;
      }
      if (char === "\"") inString = false;
      continue;
    }
    if (char === "\"") {
      inString = true;
      continue;
    }
    if (char === "{") depth += 1;
    if (char === "}") {
      depth -= 1;
      if (depth === 0) return input.slice(start, i + 1);
    }
  }
  return null;
}

function parseJsonCandidate(text: string): Record<string, unknown> | null {
  const normalized = String(text || "").trim();
  const candidates = [
    normalized,
    /^```(?:json)?\s*([\s\S]*?)\s*```$/i.exec(normalized)?.[1] || "",
    extractBalancedJsonObject(normalized) || "",
  ].filter(Boolean);

  for (const candidate of candidates) {
    try {
      const parsed = JSON.parse(candidate);
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
        return parsed as Record<string, unknown>;
      }
    } catch {
      // Try the next candidate.
    }
  }
  return null;
}

function extractGatewayToolTurn(
  value: unknown,
  availableTools: PlaygroundToolName[],
  depth = 0
): { final: string; toolCall?: ToolCallContract } | null {
  if (depth > 3 || value == null) return null;

  if (typeof value === "string") {
    const parsed = parseJsonCandidate(value);
    if (!parsed) return null;
    return extractGatewayToolTurn(parsed, availableTools, depth + 1);
  }

  if (typeof value !== "object" || Array.isArray(value)) return null;
  const record = value as Record<string, unknown>;
  const toolCall = normalizeToolCall(record.toolCall, availableTools);
  if (toolCall) {
    const nested =
      typeof record.final === "string" ? extractGatewayToolTurn(record.final, availableTools, depth + 1) : null;
    return {
      final:
        typeof record.final === "string"
          ? record.final.trim()
          : nested?.final || "",
      toolCall: nested?.toolCall || toolCall,
    };
  }

  for (const candidate of [record.final, record.message, record.content, record.response]) {
    const nested = extractGatewayToolTurn(candidate, availableTools, depth + 1);
    if (nested?.toolCall) return nested;
  }

  if (typeof record.final === "string" && record.final.trim()) {
    return { final: record.final.trim() };
  }

  return null;
}

function getOpenHandsGatewayUrl(): string | null {
  const value = String(process.env.OPENHANDS_GATEWAY_URL || "").trim();
  return value ? value.replace(/\/+$/, "") : null;
}

function getOpenHandsGatewayApiKey(): string | null {
  const value = String(process.env.OPENHANDS_GATEWAY_API_KEY || "").trim();
  return value || null;
}

/** OpenHands runs LLM turns that can take minutes; avoid client-side fetch closing the socket early. */
function getOpenHandsGatewayFetchTimeoutMs(): number {
  const raw = String(process.env.OPENHANDS_GATEWAY_FETCH_TIMEOUT_MS || "").trim();
  const n = raw ? Number.parseInt(raw, 10) : Number.NaN;
  if (Number.isFinite(n) && n >= 10_000) return Math.min(n, 600_000);
  return 300_000;
}

function gatewayPostInit(): { signal: AbortSignal | undefined } {
  if (typeof AbortSignal !== "undefined" && typeof AbortSignal.timeout === "function") {
    return { signal: AbortSignal.timeout(getOpenHandsGatewayFetchTimeoutMs()) };
  }
  return { signal: undefined };
}

function buildGatewayPayload(input: OpenHandsGatewayRunRequest): Record<string, unknown> {
  const token = resolvePlaygroundModelToken(input.modelSelection.resolvedEntry);
  const routePolicy = input.request.routePolicy && typeof input.request.routePolicy === "object"
    ? input.request.routePolicy
    : undefined;
  return {
    protocol: "xpersona_openhands_gateway_v1",
    request: {
      mode: input.request.mode,
      task: input.request.task,
      speedProfile: input.request.speedProfile,
      startupPhase: input.request.startupPhase,
      ...(routePolicy ? { routePolicy } : {}),
      conversationHistory: (input.request.conversationHistory || []).map((turn: AssistConversationTurn) => ({
        role: turn.role,
        content: turn.content,
      })),
      retrievalHints: input.request.retrievalHints || null,
      context: input.request.context || null,
      clientTrace: input.request.clientTrace || null,
    },
    tom: input.tom
      ? {
          enabled: input.tom.enabled,
          userKey: input.tom.userKey || null,
          sessionId: input.tom.sessionId || null,
          traceId: input.tom.traceId || null,
        }
      : null,
    mcp: input.mcp || null,
    targetInference: input.targetInference,
    contextSelection: input.contextSelection,
    fallbackPlan: input.fallbackPlan,
    toolTrace: input.toolTrace,
    loopSummary: input.loopSummary,
    ...(routePolicy ? { routePolicy } : {}),
    availableTools: input.availableTools,
    latestToolResult: input.latestToolResult || null,
    repairDirective: input.repairDirective || null,
    model: {
      alias: input.modelSelection.resolvedAlias,
      requested: input.modelSelection.requested,
      model: input.modelSelection.resolvedEntry.model,
      openhandsModel:
        input.modelSelection.resolvedEntry.openhands.providerModel || input.modelSelection.resolvedEntry.model,
      openhandsCompatible: input.modelSelection.resolvedEntry.openhands.compatible,
      openhandsFallbackAliases: [...input.modelSelection.resolvedEntry.openhands.fallbackAliases],
      provider: input.modelSelection.resolvedEntry.provider,
      baseUrl: input.modelSelection.resolvedEntry.baseUrl,
      authSource: input.modelSelection.resolvedEntry.authSource,
      apiKey: token,
      ...(input.modelSelection.resolvedEntry.routeKind ? { routeKind: input.modelSelection.resolvedEntry.routeKind } : {}),
      ...(input.modelSelection.resolvedEntry.routeLabel ? { routeLabel: input.modelSelection.resolvedEntry.routeLabel } : {}),
      ...(input.modelSelection.resolvedEntry.routeReason ? { routeReason: input.modelSelection.resolvedEntry.routeReason } : {}),
      ...(Array.isArray(input.modelSelection.resolvedEntry.modelFamilies)
        ? { modelFamilies: input.modelSelection.resolvedEntry.modelFamilies }
        : {}),
      ...(input.modelSelection.resolvedEntry.extraHeaders
        ? { extraHeaders: input.modelSelection.resolvedEntry.extraHeaders }
        : {}),
      capabilities: input.modelSelection.resolvedEntry.capabilities,
      candidates: [input.modelSelection.resolvedEntry, ...input.modelSelection.fallbackChain].map((entry) => ({
        alias: entry.alias,
        requested: input.modelSelection.requested,
        model: entry.model,
        openhandsModel: entry.openhands.providerModel || entry.model,
        provider: entry.provider,
        baseUrl: entry.baseUrl,
        authSource: entry.authSource,
        apiKey: resolvePlaygroundModelToken(entry),
        ...(entry.routeKind ? { routeKind: entry.routeKind } : {}),
        ...(entry.routeLabel ? { routeLabel: entry.routeLabel } : {}),
        ...(entry.routeReason ? { routeReason: entry.routeReason } : {}),
        ...(Array.isArray(entry.modelFamilies) ? { modelFamilies: entry.modelFamilies } : {}),
        ...(entry.extraHeaders ? { extraHeaders: entry.extraHeaders } : {}),
        capabilities: entry.capabilities,
      })),
    },
    probe: input.probe || null,
  };
}

function isModelCompatibilityFailure(error: unknown): boolean {
  if (!(error instanceof OpenHandsGatewayError)) return false;
  const detail = `${error.message} ${error.details || ""}`.toLowerCase();
  return (
    detail.includes("model_provider_mismatch") ||
    detail.includes("provider not provided") ||
    detail.includes("does not exist") ||
    detail.includes("notfounderror") ||
    detail.includes("badrequesterror")
  );
}

async function parseGatewayErrorResponse(response: Response): Promise<never> {
  const raw = await response.text().catch(() => "");
  let detail = raw || response.statusText || "request failed";
  if (response.status === 401 || response.status === 403) {
    throw new OpenHandsGatewayError(
      "OpenHands is configured but rejected the gateway request. Check OPENHANDS_GATEWAY_API_KEY and gateway auth.",
      "OPENHANDS_GATEWAY_UNAUTHORIZED",
      response.status,
      detail
    );
  }
  if (response.status === 502) {
    try {
      const parsed = JSON.parse(raw) as { error?: string; details?: string };
      if (typeof parsed?.error === "string" && parsed.error.trim()) {
        detail = parsed.details?.trim() ? `${parsed.error.trim()}: ${parsed.details.trim()}` : parsed.error.trim();
      }
    } catch {
      /* keep raw */
    }
    throw new OpenHandsGatewayError(
      `OpenHands gateway reported a turn error: ${detail}`,
      "OPENHANDS_GATEWAY_INVALID_RESPONSE",
      502,
      raw
    );
  }
  throw new OpenHandsGatewayError(
    "OpenHands is unavailable right now. Verify the gateway URL and make sure the OpenHands service is running.",
    "OPENHANDS_GATEWAY_UNREACHABLE",
    503,
    detail
  );
}

function parseGatewayTurnPayload(parsed: Record<string, unknown>, availableTools: PlaygroundToolName[]): OpenHandsGatewayTurn {
  const runId = compactWhitespace(String(parsed.runId || parsed.id || ""));
  if (!runId) {
    throw new OpenHandsGatewayError(
      "OpenHands returned an invalid response without a run identifier.",
      "OPENHANDS_GATEWAY_INVALID_RESPONSE",
      502
    );
  }

  const adapter =
    parsed.adapter === "native_tools" || parsed.adapter === "text_actions" || parsed.adapter === "deterministic_batch"
      ? parsed.adapter
      : "text_actions";
  const recovered = extractGatewayToolTurn(parsed.final, availableTools);
  const normalizedToolCall = normalizeToolCall(parsed.toolCall, availableTools);
  const toolCall = normalizedToolCall || recovered?.toolCall || null;
  const final =
    typeof parsed.final === "string"
      ? toolCall && recovered?.toolCall
        ? recovered.final
        : parsed.final.trim()
      : recovered?.final || "";
  const logs = Array.isArray(parsed.logs)
    ? parsed.logs.filter((value): value is string => typeof value === "string")
    : [];
  if (!normalizedToolCall && recovered?.toolCall) {
    logs.push("repair=final_toolcall_recovered");
  }

  return {
    runId,
    adapter,
    final,
    toolCall: toolCall || undefined,
    logs,
    version: typeof parsed.version === "string" ? parsed.version.trim() : null,
    modelCandidate:
      parsed.modelCandidate && typeof parsed.modelCandidate === "object"
        ? (parsed.modelCandidate as OpenHandsGatewayTurn["modelCandidate"])
        : null,
    fallbackAttempt: typeof parsed.fallbackAttempt === "number" ? parsed.fallbackAttempt : 0,
    failureReason: typeof parsed.failureReason === "string" ? parsed.failureReason : null,
    persistenceDir: typeof parsed.persistenceDir === "string" ? parsed.persistenceDir : null,
    conversationId: typeof parsed.conversationId === "string" ? parsed.conversationId : null,
    fallbackTrail: Array.isArray(parsed.fallbackTrail)
      ? parsed.fallbackTrail.filter((item): item is Record<string, unknown> => Boolean(item && typeof item === "object"))
      : [],
  };
}

async function parseGatewaySseTurn(
  response: Response,
  availableTools: PlaygroundToolName[],
  options?: OpenHandsGatewayRequestOptions
): Promise<OpenHandsGatewayTurn> {
  if (!response.body) {
    throw new OpenHandsGatewayError(
      "OpenHands gateway streaming response had no body.",
      "OPENHANDS_GATEWAY_INVALID_RESPONSE",
      502
    );
  }
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let finalPayload: Record<string, unknown> | null = null;
  let gatewayError: Record<string, unknown> | null = null;
  let runEnvelope: Record<string, unknown> | null = null;

  const processFrame = async (rawFrame: string): Promise<void> => {
    const raw = rawFrame.trim();
    if (!raw) return;

    let payload = "";
    for (const line of raw.split(/\r?\n/)) {
      if (line.startsWith("data:")) payload += line.slice(5).trimStart();
    }
    if (!payload || payload === "[DONE]") return;

    let parsed: Record<string, unknown>;
    try {
      parsed = JSON.parse(payload) as Record<string, unknown>;
    } catch {
      parsed = { event: "raw", data: payload };
    }

    if (options?.onEvent) {
      try {
        await options.onEvent(parsed);
      } catch {
        // Observer callback failures should never break orchestration.
      }
    }

    const eventName = typeof parsed.event === "string" ? parsed.event : "";
    if (eventName === "run" && parsed.data && typeof parsed.data === "object") {
      runEnvelope = parsed.data as Record<string, unknown>;
    } else if (eventName === "gateway.result" && parsed.data && typeof parsed.data === "object") {
      finalPayload = parsed.data as Record<string, unknown>;
    } else if (eventName === "gateway.error" && parsed.data && typeof parsed.data === "object") {
      gatewayError = parsed.data as Record<string, unknown>;
    }
  };

  const consumeFramedEvents = async (): Promise<void> => {
    while (true) {
      const lfBoundary = buffer.indexOf("\n\n");
      const crlfBoundary = buffer.indexOf("\r\n\r\n");
      const useLf = lfBoundary >= 0 && (crlfBoundary < 0 || lfBoundary < crlfBoundary);
      const boundary = useLf ? lfBoundary : crlfBoundary;
      if (boundary < 0) break;

      const separatorLength = useLf ? 2 : 4;
      const raw = buffer.slice(0, boundary);
      buffer = buffer.slice(boundary + separatorLength);
      await processFrame(raw);
    }
  };

  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    await consumeFramedEvents();
  }
  buffer += decoder.decode();
  await consumeFramedEvents();
  if (buffer.trim()) {
    await processFrame(buffer);
    buffer = "";
  }

  const gatewayErrorRecord = gatewayError as Record<string, unknown> | null;
  if (gatewayErrorRecord) {
    const errorMessage =
      typeof gatewayErrorRecord.error === "string" && gatewayErrorRecord.error.trim()
        ? gatewayErrorRecord.error
        : "OpenHands gateway reported a streaming turn error.";
    const details =
      typeof gatewayErrorRecord.details === "string" && gatewayErrorRecord.details.trim()
        ? gatewayErrorRecord.details
        : undefined;
    throw new OpenHandsGatewayError(
      details ? `${errorMessage}: ${details}` : errorMessage,
      "OPENHANDS_GATEWAY_INVALID_RESPONSE",
      502,
      details
    );
  }

  const parsedFinalPayload = finalPayload as Record<string, unknown> | null;
  const parsedRunEnvelope = runEnvelope as Record<string, unknown> | null;
  if (!parsedFinalPayload) {
    throw new OpenHandsGatewayError(
      "OpenHands streaming response completed without a final gateway result payload.",
      "OPENHANDS_GATEWAY_INVALID_RESPONSE",
      502
    );
  }

  if (!parsedFinalPayload.runId && parsedRunEnvelope?.runId) {
    parsedFinalPayload.runId = parsedRunEnvelope.runId;
  }
  if (!parsedFinalPayload.adapter && parsedRunEnvelope?.adapter) {
    parsedFinalPayload.adapter = parsedRunEnvelope.adapter;
  }

  return parseGatewayTurnPayload(parsedFinalPayload, availableTools);
}

async function requestGatewayTurn(
  url: string,
  body: Record<string, unknown>,
  availableTools: PlaygroundToolName[],
  options?: OpenHandsGatewayRequestOptions
): Promise<OpenHandsGatewayTurn> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...(options?.onEvent ? { Accept: "text/event-stream" } : {}),
  };
  const apiKey = getOpenHandsGatewayApiKey();
  if (apiKey) {
    headers.Authorization = `Bearer ${apiKey}`;
  }

  const { signal } = gatewayPostInit();
  let response: Response;
  try {
    response = await fetch(url, {
      method: "POST",
      headers,
      body: JSON.stringify(body),
      ...(signal ? { signal } : {}),
    });
  } catch (error) {
    throw new OpenHandsGatewayError(
      describeGatewayFetchFailure(url, error),
      "OPENHANDS_GATEWAY_UNREACHABLE",
      503,
      extractFetchFailureDetail(error)
    );
  }

  if (!response.ok) {
    return await parseGatewayErrorResponse(response);
  }

  const contentType = String(response?.headers?.get("content-type") || "").toLowerCase();
  if (options?.onEvent && contentType.includes("text/event-stream")) {
    return await parseGatewaySseTurn(response, availableTools, options);
  }

  const parsed = (await response.json()) as Record<string, unknown>;
  return parseGatewayTurnPayload(parsed, availableTools);
}

export function isOpenHandsGatewayEnabled(): boolean {
  return Boolean(getOpenHandsGatewayUrl());
}

export async function startOpenHandsGatewayRun(
  input: OpenHandsGatewayRunRequest,
  options?: OpenHandsGatewayRequestOptions
): Promise<OpenHandsGatewayTurn> {
  const baseUrl = getOpenHandsGatewayUrl();
  if (!baseUrl) {
    throw new OpenHandsGatewayError(
      "OpenHands is not configured. Set OPENHANDS_GATEWAY_URL before using hosted coding orchestration.",
      "OPENHANDS_GATEWAY_MISSING_CONFIG",
      503
    );
  }
  return requestGatewayTurn(`${baseUrl}/v1/runs/start`, buildGatewayPayload(input), input.availableTools, options);
}

export async function continueOpenHandsGatewayRun(input: {
  runId: string;
  payload: OpenHandsGatewayRunRequest;
  onEvent?: (event: OpenHandsGatewayEvent) => Promise<void> | void;
}): Promise<OpenHandsGatewayTurn> {
  const baseUrl = getOpenHandsGatewayUrl();
  if (!baseUrl) {
    throw new OpenHandsGatewayError(
      "OpenHands is not configured. Set OPENHANDS_GATEWAY_URL before using hosted coding orchestration.",
      "OPENHANDS_GATEWAY_MISSING_CONFIG",
      503
    );
  }
  return requestGatewayTurn(
    `${baseUrl}/v1/runs/${encodeURIComponent(input.runId)}/continue`,
    buildGatewayPayload(input.payload),
    input.payload.availableTools,
    input.onEvent ? { onEvent: input.onEvent } : undefined
  );
}

export async function runOpenHandsGatewayProbeTurn(input: {
  message: string;
  requestedModel?: string;
  gatewayRunId?: string | null;
  conversationHistory?: AssistConversationTurn[];
  context?: Record<string, unknown> | null;
  workspaceRoot?: string;
  tom?: {
    enabled: boolean;
    userKey?: string;
    sessionId?: string;
    traceId?: string;
  };
}): Promise<OpenHandsGatewayTurn> {
  const selection = resolvePlaygroundModelSelection({ requested: input.requestedModel });
  const payload: OpenHandsGatewayRunRequest = {
    request: {
      mode: "auto",
      task: input.message,
      interactionKind: "repo_code",
      conversationHistory: input.conversationHistory || [],
      context: input.context || undefined,
      model: selection.requested,
    },
    tom: input.tom,
    mcp: undefined,
    targetInference: {
      confidence: 0,
      source: "unknown",
    },
    contextSelection: {
      files: [],
      snippets: 0,
      usedCloudIndex: false,
    },
    fallbackPlan: {
      objective: input.message,
      files: [],
      steps: [],
      acceptanceTests: [],
      risks: [],
    },
    toolTrace: [],
    loopSummary: {
      stepCount: 0,
      mutationCount: 0,
      repairCount: 0,
    },
    availableTools: [],
    latestToolResult: null,
    repairDirective: null,
    modelSelection: selection,
    probe: {
      enabled: true,
      workspaceRoot: input.workspaceRoot,
    },
  };
  if (input.gatewayRunId) {
    return continueOpenHandsGatewayRun({
      runId: input.gatewayRunId,
      payload,
    });
  }
  return startOpenHandsGatewayRun(payload);
}

export async function getOpenHandsGatewayHealth(): Promise<OpenHandsGatewayHealth> {
  const baseUrl = getOpenHandsGatewayUrl();
  if (!baseUrl) {
    return {
      status: "missing_config",
      message: "OpenHands is not configured. Set OPENHANDS_GATEWAY_URL.",
    };
  }

  const headers: Record<string, string> = {};
  const apiKey = getOpenHandsGatewayApiKey();
  if (apiKey) headers.Authorization = `Bearer ${apiKey}`;

  try {
    const response = await fetch(`${baseUrl}/health`, {
      method: "GET",
      headers,
    });
    const raw = await response.text().catch(() => "");
    let parsed: Record<string, unknown> = {};
    try {
      parsed = raw ? (JSON.parse(raw) as Record<string, unknown>) : {};
    } catch {
      parsed = {};
    }
    if (response.ok) {
      const doctor =
        parsed.doctor && typeof parsed.doctor === "object" ? (parsed.doctor as Record<string, unknown>) : {};
      return {
        status: parsed.status === "degraded" ? "degraded" : "healthy",
        message:
          typeof parsed.message === "string" && parsed.message.trim()
            ? parsed.message
            : parsed.status === "degraded"
              ? "OpenHands is connected with limited capabilities."
              : "OpenHands is connected.",
        gatewayUrl: baseUrl,
        runtimeKind:
          doctor.runtimeKind === "docker" ||
          doctor.runtimeKind === "local-python" ||
          doctor.runtimeKind === "remote" ||
          doctor.runtimeKind === "reduced-local" ||
          doctor.runtimeKind === "unknown"
            ? doctor.runtimeKind
            : undefined,
        runtimeProfile:
          doctor.runtimeProfile === "full" ||
          doctor.runtimeProfile === "code-only" ||
          doctor.runtimeProfile === "chat-only" ||
          doctor.runtimeProfile === "unavailable"
            ? doctor.runtimeProfile
            : undefined,
        supportedTools: Array.isArray(doctor.supportedTools)
          ? doctor.supportedTools.filter((item): item is string => typeof item === "string")
          : [],
        degradedReasons: Array.isArray(doctor.degradedReasons)
          ? doctor.degradedReasons.filter((item): item is string => typeof item === "string")
          : [],
        availableActions: Array.isArray(doctor.availableActions)
          ? doctor.availableActions.filter((item): item is string => typeof item === "string")
          : [],
        version: typeof parsed.version === "string" ? parsed.version : null,
        packageFamily:
          doctor.packageFamily === "openhands" || doctor.packageFamily === "openhands-sdk"
            ? doctor.packageFamily
            : "unknown",
        packageVersion: typeof doctor.packageVersion === "string" ? doctor.packageVersion : null,
        pythonVersion: typeof doctor.pythonVersion === "string" ? doctor.pythonVersion : null,
        currentModelCandidate:
          doctor.currentModelCandidate && typeof doctor.currentModelCandidate === "object"
            ? (doctor.currentModelCandidate as Record<string, unknown>)
            : null,
        lastProviderFailureReason:
          typeof doctor.lastProviderFailureReason === "string" ? doctor.lastProviderFailureReason : null,
        fallbackAvailable: doctor.fallbackAvailable === true,
        lastFallbackRecovered: doctor.lastFallbackRecovered === true,
        lastPersistenceDir: typeof doctor.lastPersistenceDir === "string" ? doctor.lastPersistenceDir : null,
      };
    }
    if (response.status === 401 || response.status === 403) {
      return {
        status: "unauthorized",
        message: "OpenHands rejected the health check. Check gateway auth.",
        gatewayUrl: baseUrl,
        details: raw || response.statusText,
      };
    }

    return {
      status: "unreachable",
      message: "OpenHands did not respond successfully.",
      gatewayUrl: baseUrl,
      details: raw || response.statusText,
    };
  } catch (error) {
    const healthUrl = `${baseUrl}/health`;
    return {
      status: "unreachable",
      message: describeGatewayFetchFailure(healthUrl, error),
      gatewayUrl: baseUrl,
      details: extractFetchFailureDetail(error),
    };
  }
}

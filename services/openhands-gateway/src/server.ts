import { randomUUID } from "node:crypto";
import { spawn } from "node:child_process";
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import path from "node:path";
import { config as loadEnv } from "dotenv";

loadEnv({ path: path.resolve(process.cwd(), ".env.local"), override: false, quiet: true });
loadEnv({ quiet: true });

type GatewayModelPayload = {
  alias?: string;
  requested?: string;
  model?: string;
  provider?: string;
  baseUrl?: string | null;
  authSource?: string | null;
  apiKey?: string | null;
  capabilities?: Record<string, unknown> | null;
};

type GatewayToolCall = {
  id: string;
  name: string;
  arguments: Record<string, unknown>;
  kind: "observe" | "mutate" | "command";
  summary?: string;
};

type GatewayPayload = {
  protocol: "xpersona_openhands_gateway_v1";
  request: {
    mode?: string;
    task?: string;
    conversationHistory?: Array<{ role?: string; content?: string }>;
    retrievalHints?: unknown;
    context?: unknown;
    clientTrace?: unknown;
  };
  tom?: {
    enabled?: boolean;
    userKey?: string | null;
    sessionId?: string | null;
    traceId?: string | null;
    turnPhase?: "start" | "continue" | null;
  } | null;
  targetInference?: { path?: string | null; [key: string]: unknown };
  contextSelection?: {
    files?: Array<{ path?: string; reason?: string }>;
    [key: string]: unknown;
  };
  fallbackPlan?: { objective?: string; [key: string]: unknown };
  toolTrace?: Array<{
    status?: string;
    summary?: string;
    toolCall?: { name?: string };
    toolResult?: { name?: string };
  }>;
  loopSummary?: {
    stepCount?: number;
    mutationCount?: number;
    repairCount?: number;
  };
  availableTools?: string[];
  latestToolResult?: {
    name?: string;
    ok?: boolean;
    blocked?: boolean;
    summary?: string;
    error?: string;
    data?: unknown;
  } | null;
  repairDirective?: {
    stage?:
      | "post_inspection_mutation_required"
      | "target_path_repair"
      | "patch_repair"
      | "single_file_rewrite"
      | "pine_specialization";
    reason?: string;
  } | null;
  model?: GatewayModelPayload;
};

type PythonTurnResult = {
  ok: boolean;
  final?: string;
  toolCall?: GatewayToolCall | null;
  logs?: string[];
  version?: string | null;
  error?: string;
  details?: string;
};

const PORT = Number(process.env.OPENHANDS_GATEWAY_PORT || 8010);
const HOST = String(process.env.OPENHANDS_GATEWAY_HOST || "127.0.0.1");
const PYTHON_BIN = String(process.env.OPENHANDS_GATEWAY_PYTHON || "python");
const RUNNER_PATH = path.resolve(process.cwd(), "services/openhands-gateway/agent_turn.py");
const GATEWAY_API_KEY = String(process.env.OPENHANDS_GATEWAY_API_KEY || "").trim();
const JSON_BODY_LIMIT_BYTES = 1_500_000;
const parsedRunTtlMs = Number(process.env.OPENHANDS_GATEWAY_RUN_TTL_MS);
const RUN_TTL_MS = Number.isFinite(parsedRunTtlMs) ? Math.max(60_000, parsedRunTtlMs) : 30 * 60 * 1000;

type GatewayRunState = {
  runId: string;
  createdAt: number;
  updatedAt: number;
  requestFingerprint: string;
  payload: GatewayPayload;
  turns: Array<{
    recordedAt: string;
    toolName?: string;
    finalPreview?: string;
  }>;
};

const runState = new Map<string, GatewayRunState>();

function writeJson(
  res: ServerResponse,
  statusCode: number,
  body: Record<string, unknown>
): void {
  const payload = Buffer.from(JSON.stringify(body));
  res.writeHead(statusCode, {
    "Content-Type": "application/json; charset=utf-8",
    "Content-Length": String(payload.byteLength),
    "Cache-Control": "no-store",
  });
  res.end(payload);
}

async function readJsonBody(req: IncomingMessage): Promise<Record<string, unknown>> {
  return await new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    let total = 0;

    req.on("data", (chunk: Buffer | string) => {
      const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
      total += buffer.byteLength;
      if (total > JSON_BODY_LIMIT_BYTES) {
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

function isAuthorized(req: IncomingMessage): boolean {
  if (!GATEWAY_API_KEY) return true;
  const header = String(req.headers.authorization || "");
  return header === `Bearer ${GATEWAY_API_KEY}`;
}

function parseRunId(pathname: string): string | null {
  const match = /^\/v1\/runs\/([^/]+)\/continue$/i.exec(pathname);
  return match ? decodeURIComponent(match[1]) : null;
}

function compactWhitespace(value: unknown): string {
  return String(value || "").replace(/\s+/g, " ").trim();
}

function clonePayload(payload: GatewayPayload): GatewayPayload {
  return JSON.parse(JSON.stringify(payload)) as GatewayPayload;
}

function withTomTurnPhase(payload: GatewayPayload, turnPhase: "start" | "continue"): GatewayPayload {
  return {
    ...payload,
    tom:
      payload.tom || turnPhase
        ? {
            ...(payload.tom || {}),
            turnPhase,
          }
        : null,
  };
}

function buildRequestFingerprint(payload: GatewayPayload): string {
  return JSON.stringify({
    task: payload.request?.task || "",
    session: payload.request?.conversationHistory?.slice(-4) || [],
    targetPath: payload.targetInference?.path || "",
    toolTraceSize: Array.isArray(payload.toolTrace) ? payload.toolTrace.length : 0,
  });
}

function pruneExpiredRuns(): void {
  const cutoff = Date.now() - RUN_TTL_MS;
  for (const [key, value] of runState.entries()) {
    if (value.updatedAt < cutoff) {
      runState.delete(key);
    }
  }
}

function getRunState(runId: string): GatewayRunState | null {
  pruneExpiredRuns();
  return runState.get(runId) || null;
}

function upsertRunState(input: {
  runId: string;
  payload: GatewayPayload;
  result?: PythonTurnResult;
  rehydrated?: boolean;
}): GatewayRunState {
  pruneExpiredRuns();
  const previous = runState.get(input.runId);
  const now = Date.now();
  const next: GatewayRunState = {
    runId: input.runId,
    createdAt: previous?.createdAt || now,
    updatedAt: now,
    requestFingerprint: buildRequestFingerprint(input.payload),
    payload: clonePayload(input.payload),
    turns: [
      ...(previous?.turns || []),
      ...(input.result
        ? [
            {
              recordedAt: new Date(now).toISOString(),
              toolName: input.result.toolCall?.name,
              finalPreview: compactWhitespace(String(input.result.final || "")).slice(0, 280),
            },
          ]
        : []),
    ].slice(-24),
  };
  if (input.rehydrated && !previous) {
    next.turns.unshift({
      recordedAt: new Date(now).toISOString(),
      finalPreview: "Gateway run state rehydrated from Xpersona request history.",
    });
  }
  runState.set(input.runId, next);
  return next;
}

function validateGatewayPayload(body: Record<string, unknown>): body is GatewayPayload {
  return (
    body.protocol === "xpersona_openhands_gateway_v1" &&
    Boolean(body.request && typeof body.request === "object") &&
    Boolean(body.model && typeof body.model === "object") &&
    Array.isArray(body.availableTools)
  );
}

async function invokePythonTurn(input: {
  payload?: GatewayPayload;
  doctor?: boolean;
}): Promise<PythonTurnResult> {
  return await new Promise((resolve, reject) => {
    const args = input.doctor ? [RUNNER_PATH, "--doctor"] : [RUNNER_PATH];
    const child = spawn(PYTHON_BIN, args, {
      cwd: process.cwd(),
      env: process.env,
      stdio: ["pipe", "pipe", "pipe"],
    });

    const stdout: Buffer[] = [];
    const stderr: Buffer[] = [];

    child.stdout.on("data", (chunk) => stdout.push(Buffer.from(chunk)));
    child.stderr.on("data", (chunk) => stderr.push(Buffer.from(chunk)));
    child.on("error", reject);
    child.on("close", (code) => {
      const rawOut = Buffer.concat(stdout).toString("utf8").trim();
      const rawErr = Buffer.concat(stderr).toString("utf8").trim();
      try {
        const parsed = rawOut ? (JSON.parse(rawOut) as PythonTurnResult) : null;
        if (parsed) {
          resolve(parsed);
          return;
        }
      } catch {
        // Fall through to structured error below.
      }

      reject(
        new Error(
          rawErr ||
            rawOut ||
            (code === 0
              ? "The OpenHands helper returned an empty response."
              : `The OpenHands helper exited with code ${code ?? "unknown"}.`)
        )
      );
    });

    if (input.doctor) {
      child.stdin.end();
      return;
    }

    child.stdin.write(JSON.stringify(input.payload || {}));
    child.stdin.end();
  });
}

const server = createServer(async (req, res) => {
  const method = String(req.method || "GET").toUpperCase();
  const pathname = new URL(req.url || "/", `http://${req.headers.host || "localhost"}`).pathname;

  if (method === "OPTIONS") {
    res.writeHead(204, {
      Allow: "GET, POST, OPTIONS",
    });
    res.end();
    return;
  }

  if (!isAuthorized(req)) {
    writeJson(res, 401, {
      error: "Unauthorized",
      details: "The OpenHands gateway API key did not match OPENHANDS_GATEWAY_API_KEY.",
    });
    return;
  }

  if (method === "GET" && pathname === "/health") {
    try {
      const result = await invokePythonTurn({ doctor: true });
      if (!result.ok) {
        writeJson(res, 503, {
          status: "unhealthy",
          title: "OpenHands Gateway",
          error: result.error || "OpenHands SDK setup is incomplete.",
          details: result.details || "Run `npm run openhands:gateway:setup` to install the Python SDK.",
        });
        return;
      }
      writeJson(res, 200, {
        status: "healthy",
        title: "OpenHands Gateway",
        version: result.version || "unknown",
        runtime: "openhands_sdk",
      });
      return;
    } catch (error) {
      writeJson(res, 503, {
        status: "unhealthy",
        title: "OpenHands Gateway",
        error: error instanceof Error ? error.message : String(error),
        details: "Run `npm run openhands:gateway:setup` and restart the gateway.",
      });
      return;
    }
  }

  if (method === "POST" && pathname === "/v1/runs/start") {
    try {
      const body = await readJsonBody(req);
      if (!validateGatewayPayload(body)) {
        writeJson(res, 400, {
          error: "Invalid gateway payload.",
          details: "Expected protocol=xpersona_openhands_gateway_v1 with request, model, and availableTools.",
        });
        return;
      }

      const payload = withTomTurnPhase(body, "start");
      const result = await invokePythonTurn({ payload });
      if (!result.ok) {
        writeJson(res, 502, {
          error: result.error || "OpenHands failed to produce the next tool turn.",
          details: result.details || "Check the OpenHands SDK installation and model credentials.",
        });
        return;
      }

      const runId = randomUUID();
      const state = upsertRunState({
        runId,
        payload,
        result,
      });
      writeJson(res, 200, {
        runId,
        adapter: "text_actions",
        final: String(result.final || ""),
        toolCall: result.toolCall || undefined,
        logs: [
          "engine=openhands_sdk",
          `gateway_run=persisted`,
          `gateway_turns=${state.turns.length}`,
          ...(result.logs || []),
        ],
        version: result.version || null,
      });
      return;
    } catch (error) {
      writeJson(res, 500, {
        error: "Failed to start OpenHands run.",
        details: error instanceof Error ? error.message : String(error),
      });
      return;
    }
  }

  const runId = method === "POST" ? parseRunId(pathname) : null;
  if (method === "POST" && runId) {
    try {
      const body = await readJsonBody(req);
      if (!validateGatewayPayload(body)) {
        writeJson(res, 400, {
          error: "Invalid gateway payload.",
          details: "Expected protocol=xpersona_openhands_gateway_v1 with request, model, and availableTools.",
        });
        return;
      }

      const existing = getRunState(runId);
      const payload = withTomTurnPhase(clonePayload(body), "continue");
      const effectiveState =
        existing ||
        upsertRunState({
          runId,
          payload,
          rehydrated: true,
        });

      const mergedPayload = clonePayload(payload);
      const existingHistory = Array.isArray(mergedPayload.request.conversationHistory)
        ? mergedPayload.request.conversationHistory
        : [];
      if (effectiveState.turns.length > 0) {
        mergedPayload.request.conversationHistory = [
          ...existingHistory,
          ...effectiveState.turns
            .filter((turn) => turn.toolName || turn.finalPreview)
            .map((turn) => ({
              role: "assistant",
              content: turn.toolName
                ? `Gateway turn used tool ${turn.toolName}.${turn.finalPreview ? ` ${turn.finalPreview}` : ""}`
                : String(turn.finalPreview || ""),
            })),
        ].slice(-12);
      }

      const result = await invokePythonTurn({ payload: mergedPayload });
      if (!result.ok) {
        writeJson(res, 502, {
          error: result.error || "OpenHands failed to continue the run.",
          details: result.details || "Check the OpenHands SDK installation and model credentials.",
        });
        return;
      }

      const state = upsertRunState({
        runId,
        payload,
        result,
      });
      writeJson(res, 200, {
        runId,
        adapter: "text_actions",
        final: String(result.final || ""),
        toolCall: result.toolCall || undefined,
        logs: [
          "engine=openhands_sdk",
          existing ? "gateway_run=resumed" : "gateway_run=rehydrated",
          `gateway_turns=${state.turns.length}`,
          ...(result.logs || []),
        ],
        version: result.version || null,
      });
      return;
    } catch (error) {
      writeJson(res, 500, {
        error: "Failed to continue OpenHands run.",
        details: error instanceof Error ? error.message : String(error),
      });
      return;
    }
  }

  writeJson(res, 404, {
    error: "Not found",
    details: "Use GET /health, POST /v1/runs/start, or POST /v1/runs/:runId/continue.",
  });
});

server.listen(PORT, HOST, () => {
  process.stdout.write(
    `OpenHands gateway listening on http://${HOST}:${PORT}\n`
  );
});

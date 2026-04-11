import { requestJson } from "./api-client";
import { getBaseApiUrl } from "./config";
import type { BinaryAgentJob, BinaryAgentJobEventBatch, BinaryAgentJobEventEnvelope, RequestAuth } from "./shared";

type CreateAgentJobInput = {
  task: string;
  mode?: "auto" | "plan" | "yolo";
  model?: string;
  historySessionId?: string;
  client?: Record<string, unknown>;
};

type StreamAgentJobEvent = {
  event: string;
  data: unknown;
  raw: BinaryAgentJobEventEnvelope;
  seq?: number;
};

function withAuthHeaders(auth?: RequestAuth | null): HeadersInit {
  const headers: Record<string, string> = {
    Accept: "text/event-stream",
    "Cache-Control": "no-cache",
  };
  if (auth?.bearer) headers.Authorization = `Bearer ${auth.bearer}`;
  else if (auth?.apiKey) headers["X-API-Key"] = auth.apiKey;
  return headers;
}

function endpointCandidates(pathSuffix: string): string[] {
  const base = getBaseApiUrl().replace(/\/+$/, "");
  return [`${base}/v1${pathSuffix}`, `${base}/api/v1${pathSuffix}`];
}

function parseEventEnvelope(payload: unknown): StreamAgentJobEvent | null {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) return null;
  const raw = payload as BinaryAgentJobEventEnvelope;
  const eventName = typeof raw.event === "string" && raw.event.trim() ? raw.event.trim() : "message";
  return {
    event: eventName,
    data: raw.data,
    raw,
    seq: typeof raw.seq === "number" ? raw.seq : undefined,
  };
}

async function tryJsonRequest<T>(
  method: "GET" | "POST",
  pathSuffix: string,
  auth?: RequestAuth | null,
  body?: unknown
): Promise<T> {
  let lastError: Error | null = null;
  for (const url of endpointCandidates(pathSuffix)) {
    try {
      return await requestJson<T>(method, url, auth, body);
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));
      if (!/\bHTTP 404\b/i.test(lastError.message)) {
        throw lastError;
      }
    }
  }
  throw lastError || new Error(`Unable to resolve agent jobs endpoint for ${pathSuffix}`);
}

export async function createAgentJob(
  auth: RequestAuth | null | undefined,
  input: CreateAgentJobInput
): Promise<BinaryAgentJob> {
  return await tryJsonRequest<BinaryAgentJob>("POST", "/agents/jobs", auth, input);
}

export async function getAgentJob(auth: RequestAuth | null | undefined, jobId: string): Promise<BinaryAgentJob> {
  return await tryJsonRequest<BinaryAgentJob>("GET", `/agents/jobs/${encodeURIComponent(jobId)}`, auth);
}

export async function getAgentJobEvents(
  auth: RequestAuth | null | undefined,
  jobId: string,
  after = 0
): Promise<BinaryAgentJobEventBatch> {
  return await tryJsonRequest<BinaryAgentJobEventBatch>(
    "GET",
    `/agents/jobs/${encodeURIComponent(jobId)}/events?after=${Math.max(0, after)}`,
    auth
  );
}

async function streamAgentJobEventsSse(input: {
  auth: RequestAuth | null | undefined;
  jobId: string;
  after?: number;
  signal?: AbortSignal;
  onEvent: (event: StreamAgentJobEvent) => void | Promise<void>;
}): Promise<void> {
  let lastError: Error | null = null;
  for (const baseUrl of endpointCandidates(`/agents/jobs/${encodeURIComponent(input.jobId)}/stream`)) {
    const url = new URL(baseUrl);
    if (Number.isFinite(input.after || 0) && (input.after || 0) > 0) {
      url.searchParams.set("after", String(Math.max(0, Math.floor(input.after || 0))));
    }

    try {
      const response = await fetch(url.toString(), {
        method: "GET",
        headers: withAuthHeaders(input.auth),
        signal: input.signal,
      });
      if (!response.ok) {
        const text = await response.text().catch(() => "");
        throw new Error(`HTTP ${response.status}: ${text || response.statusText || "stream failed"}`);
      }
      if (!response.body) {
        throw new Error("Job stream closed before body was returned.");
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      const flush = async (chunk: string) => {
        const lines = chunk
          .split(/\r?\n/)
          .filter((line) => line.startsWith("data:"))
          .map((line) => line.slice(5).trimStart());
        if (!lines.length) return;
        const payload = lines.join("\n").trim();
        if (!payload || payload === "[DONE]") return;
        let parsed: unknown = payload;
        try {
          parsed = JSON.parse(payload) as unknown;
        } catch {
          // Keep text payload as-is.
        }
        const event = parseEventEnvelope(parsed);
        if (event) {
          await input.onEvent(event);
        }
      };

      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        let boundary = buffer.indexOf("\n\n");
        while (boundary >= 0) {
          const raw = buffer.slice(0, boundary).trim();
          buffer = buffer.slice(boundary + 2);
          if (raw) await flush(raw);
          boundary = buffer.indexOf("\n\n");
        }
      }
      if (buffer.trim()) {
        await flush(buffer.trim());
      }
      return;
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));
      if (!/\bHTTP 404\b/i.test(lastError.message)) {
        throw lastError;
      }
    }
  }
  throw lastError || new Error("Unable to stream agent job events.");
}

export async function streamAgentJobEvents(input: {
  auth: RequestAuth | null | undefined;
  jobId: string;
  after?: number;
  signal?: AbortSignal;
  onEvent: (event: StreamAgentJobEvent) => void | Promise<void>;
}): Promise<void> {
  try {
    await streamAgentJobEventsSse(input);
    return;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (/aborted/i.test(message)) throw error;
  }

  // Polling fallback keeps compatibility with hosts that expose only /events.
  let after = Math.max(0, Math.floor(input.after || 0));
  while (!input.signal?.aborted) {
    const batch = await getAgentJobEvents(input.auth, input.jobId, after);
    for (const item of batch.events || []) {
      const parsed = parseEventEnvelope(item.event);
      if (parsed) {
        await input.onEvent({
          ...parsed,
          seq: item.seq,
        });
      }
      after = Math.max(after, Number(item.seq || after));
    }
    if (batch.done) break;
    await new Promise((resolve) => setTimeout(resolve, 700));
  }
}

import { ApiFailure } from "./types.js";

export class CliHttpError extends Error {
  readonly status: number;
  readonly details: unknown;

  constructor(message: string, status: number, details?: unknown) {
    super(message);
    this.name = "CliHttpError";
    this.status = status;
    this.details = details;
  }
}

function errorMessage(body: unknown, fallback: string): string {
  if (!body || typeof body !== "object") return fallback;
  const b = body as ApiFailure;

  if (typeof b.message === "string" && b.message.trim()) return b.message;
  if (typeof b.code === "string" && typeof b.message === "string") return `${b.code}: ${b.message}`;

  if (typeof b.error === "string") return b.error;
  if (b.error && typeof b.error === "object") {
    const code = typeof b.error.code === "string" ? b.error.code : "ERROR";
    const message = typeof b.error.message === "string" ? b.error.message : fallback;
    return `${code}: ${message}`;
  }
  return fallback;
}

export type AuthHeadersInput = {
  apiKey?: string;
  bearer?: string;
};

function authHeaders(auth: AuthHeadersInput): HeadersInit {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };
  if (auth.apiKey) {
    headers["X-API-Key"] = auth.apiKey;
    headers.Authorization = `Bearer ${auth.apiKey}`;
  } else if (auth.bearer) {
    headers.Authorization = `Bearer ${auth.bearer}`;
  }
  return headers;
}

export type JsonRequestInput = {
  baseUrl: string;
  auth: AuthHeadersInput;
  path: string;
  method?: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
  body?: unknown;
};

export async function requestJson<T>(input: JsonRequestInput): Promise<T> {
  const response = await fetch(`${input.baseUrl}${input.path}`, {
    method: input.method ?? "GET",
    headers: authHeaders(input.auth),
    body: input.body !== undefined ? JSON.stringify(input.body) : undefined,
  });

  const text = await response.text();
  const contentType = response.headers.get("content-type") || "";
  const parsed = contentType.includes("application/json")
    ? (text ? JSON.parse(text) : {})
    : { message: text || response.statusText };

  if (!response.ok) {
    throw new CliHttpError(
      errorMessage(parsed, `Request failed (${response.status})`),
      response.status,
      parsed
    );
  }

  return parsed as T;
}

export type SseEvent = {
  event?: string;
  data?: unknown;
  [key: string]: unknown;
};

export type StreamRequestInput = {
  baseUrl: string;
  auth: AuthHeadersInput;
  path: string;
  method?: "GET" | "POST";
  body?: unknown;
  onEvent: (event: SseEvent) => void | Promise<void>;
};

export async function requestSse(input: StreamRequestInput): Promise<void> {
  const response = await fetch(`${input.baseUrl}${input.path}`, {
    method: input.method ?? "POST",
    headers: authHeaders(input.auth),
    body: input.body !== undefined ? JSON.stringify(input.body) : undefined,
  });

  if (!response.ok) {
    const text = await response.text();
    let parsed: unknown = text;
    try {
      parsed = JSON.parse(text);
    } catch {
      // keep raw text fallback
    }
    throw new CliHttpError(
      errorMessage(parsed, `Streaming request failed (${response.status})`),
      response.status,
      parsed
    );
  }

  if (!response.body) {
    throw new CliHttpError("Stream ended before a body was returned", response.status);
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });

    while (true) {
      const idx = buffer.indexOf("\n\n");
      if (idx < 0) break;
      const raw = buffer.slice(0, idx).trim();
      buffer = buffer.slice(idx + 2);
      if (!raw) continue;

      const lines = raw.split(/\r?\n/);
      let payload = "";
      for (const line of lines) {
        if (line.startsWith("data:")) payload += line.slice(5).trim();
      }
      if (!payload) continue;
      if (payload === "[DONE]") return;

      try {
        await input.onEvent(JSON.parse(payload) as SseEvent);
      } catch {
        await input.onEvent({ event: "raw", data: payload });
      }
    }
  }
}

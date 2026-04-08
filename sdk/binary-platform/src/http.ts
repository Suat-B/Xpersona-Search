import { ApiFailure, AuthHeadersInput, SseEvent } from "./types.js";

export class BinaryPlatformHttpError extends Error {
  readonly status: number;
  readonly details: unknown;

  constructor(message: string, status: number, details?: unknown) {
    super(message);
    this.name = "BinaryPlatformHttpError";
    this.status = status;
    this.details = details;
  }
}

function errorMessage(body: unknown, fallback: string): string {
  if (!body || typeof body !== "object") return fallback;
  const typed = body as ApiFailure;
  if (typeof typed.message === "string" && typed.message.trim()) return typed.message;
  if (typeof typed.error === "string" && typed.error.trim()) return typed.error;
  if (typed.error && typeof typed.error === "object") {
    const code = typeof typed.error.code === "string" ? typed.error.code : "ERROR";
    const message = typeof typed.error.message === "string" ? typed.error.message : fallback;
    return `${code}: ${message}`;
  }
  return fallback;
}

function authHeaders(auth?: AuthHeadersInput): HeadersInit {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };
  if (auth?.apiKey) {
    headers["X-API-Key"] = auth.apiKey;
    headers.Authorization = `Bearer ${auth.apiKey}`;
  } else if (auth?.bearer) {
    headers.Authorization = `Bearer ${auth.bearer}`;
  }
  return headers;
}

export async function requestJson<T>(input: {
  url: string;
  auth?: AuthHeadersInput;
  method?: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
  body?: unknown;
}): Promise<T> {
  const response = await fetch(input.url, {
    method: input.method ?? "GET",
    headers: authHeaders(input.auth),
    body: input.body !== undefined ? JSON.stringify(input.body) : undefined,
  });

  const text = await response.text();
  const contentType = response.headers.get("content-type") || "";
  const parsed =
    contentType.includes("application/json") && text
      ? (JSON.parse(text) as unknown)
      : ({ message: text || response.statusText } as unknown);

  if (!response.ok) {
    throw new BinaryPlatformHttpError(
      errorMessage(parsed, `Request failed (${response.status})`),
      response.status,
      parsed
    );
  }
  return parsed as T;
}

export async function requestSse(input: {
  url: string;
  auth?: AuthHeadersInput;
  method?: "GET" | "POST";
  body?: unknown;
  onEvent: (event: SseEvent) => void | Promise<void>;
}): Promise<void> {
  const response = await fetch(input.url, {
    method: input.method ?? "GET",
    headers: authHeaders(input.auth),
    body: input.body !== undefined ? JSON.stringify(input.body) : undefined,
  });

  if (!response.ok) {
    const text = await response.text();
    let parsed: unknown = text;
    try {
      parsed = JSON.parse(text);
    } catch {
      // keep text fallback
    }
    throw new BinaryPlatformHttpError(
      errorMessage(parsed, `Streaming request failed (${response.status})`),
      response.status,
      parsed
    );
  }

  if (!response.body) {
    throw new BinaryPlatformHttpError("Streaming response returned no body.", response.status);
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
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
      try {
        await input.onEvent(JSON.parse(payload) as SseEvent);
      } catch {
        await input.onEvent({ event: "raw", data: payload });
      }
    }
  }
}

import * as http from "http";
import * as https from "https";
import { URL } from "url";
import type { RequestAuth } from "./types";

function buildHeaders(auth: RequestAuth | null | undefined, hasBody: boolean): Record<string, string> {
  const headers: Record<string, string> = {};
  if (hasBody) headers["Content-Type"] = "application/json";
  if (auth?.bearer) headers.Authorization = `Bearer ${auth.bearer}`;
  else if (auth?.apiKey) headers["X-API-Key"] = auth.apiKey;
  return headers;
}

function parseJsonOrText(raw: string): unknown {
  const trimmed = raw.trim();
  if (!trimmed) return {};
  try {
    return JSON.parse(trimmed) as unknown;
  } catch {
    return trimmed;
  }
}

export async function requestJson<T>(
  method: string,
  url: string,
  auth?: RequestAuth | null,
  body?: unknown,
  options?: { signal?: AbortSignal }
): Promise<T> {
  const target = new URL(url);
  const transport = target.protocol === "https:" ? https : http;
  const payload = body === undefined ? null : JSON.stringify(body);

  return new Promise<T>((resolve, reject) => {
    if (options?.signal?.aborted) {
      reject(new Error("Request aborted"));
      return;
    }
    const req = transport.request(
      target,
      {
        method,
        headers: buildHeaders(auth, payload !== null),
      },
      (res) => {
        const chunks: Buffer[] = [];
        res.on("data", (chunk) => chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)));
        res.on("end", () => {
          const raw = Buffer.concat(chunks).toString("utf8");
          if ((res.statusCode || 500) >= 400) {
            reject(new Error(`HTTP ${res.statusCode}: ${raw || res.statusMessage || "request failed"}`));
            return;
          }
          resolve(parseJsonOrText(raw) as T);
        });
      }
    );
    req.on("error", reject);
    if (options?.signal) {
      const onAbort = () => {
        req.destroy(new Error("Request aborted"));
      };
      options.signal.addEventListener("abort", onAbort, { once: true });
      req.on("close", () => options.signal?.removeEventListener("abort", onAbort));
    }
    if (payload !== null) req.write(payload);
    req.end();
  });
}

export async function streamJsonEvents(
  method: string,
  url: string,
  auth: RequestAuth | null | undefined,
  body: unknown,
  onEvent: (event: string, data: unknown) => void | Promise<void>,
  options?: { signal?: AbortSignal }
): Promise<void> {
  const target = new URL(url);
  const transport = target.protocol === "https:" ? https : http;
  const payload = JSON.stringify(body);

  return new Promise<void>((resolve, reject) => {
    if (options?.signal?.aborted) {
      reject(new Error("Request aborted"));
      return;
    }
    const req = transport.request(
      target,
      {
        method,
        headers: {
          ...buildHeaders(auth, true),
          Accept: "text/event-stream",
          "Cache-Control": "no-cache",
        },
      },
      (res) => {
        if ((res.statusCode || 500) >= 400) {
          const chunks: Buffer[] = [];
          res.on("data", (chunk) => chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)));
          res.on("end", () => {
            reject(new Error(`HTTP ${res.statusCode}: ${Buffer.concat(chunks).toString("utf8")}`));
          });
          return;
        }

        let buffer = "";

        const flushChunk = async (rawChunk: string) => {
          const lines = rawChunk
            .split(/\r?\n/)
            .filter((line) => line.startsWith("data:"))
            .map((line) => line.slice(5).trimStart());
          if (lines.length === 0) return;

          const rawData = lines.join("\n").trim();
          if (!rawData || rawData === "[DONE]") return;

          let parsed: unknown = rawData;
          try {
            parsed = JSON.parse(rawData) as unknown;
          } catch {
            parsed = rawData;
          }

          if (
            parsed &&
            typeof parsed === "object" &&
            !Array.isArray(parsed) &&
            typeof (parsed as { event?: unknown }).event === "string"
          ) {
            await onEvent(String((parsed as { event: string }).event), (parsed as { data?: unknown }).data);
            return;
          }

          await onEvent("message", parsed);
        };

        res.on("data", (chunk) => {
          buffer += Buffer.isBuffer(chunk) ? chunk.toString("utf8") : String(chunk);
          const process = async () => {
            let boundary = buffer.indexOf("\n\n");
            while (boundary >= 0) {
              const rawChunk = buffer.slice(0, boundary);
              buffer = buffer.slice(boundary + 2);
              await flushChunk(rawChunk);
              boundary = buffer.indexOf("\n\n");
            }
          };
          void process().catch(reject);
        });
        res.on("end", () => {
          const finalize = async () => {
            if (buffer.trim()) await flushChunk(buffer);
            resolve();
          };
          void finalize().catch(reject);
        });
      }
    );
    req.on("error", reject);
    if (options?.signal) {
      const onAbort = () => {
        req.destroy(new Error("Request aborted"));
      };
      options.signal.addEventListener("abort", onAbort, { once: true });
      req.on("close", () => options.signal?.removeEventListener("abort", onAbort));
    }
    req.write(payload);
    req.end();
  });
}

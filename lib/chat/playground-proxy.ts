import { NextRequest } from "next/server";

type ProxyMethod = "GET" | "POST";

type ProxyOptions = {
  request: NextRequest;
  method: ProxyMethod;
  path: string;
  bearer: string;
  body?: unknown;
  acceptSse?: boolean;
};

const HOP_BY_HOP_HEADERS = new Set([
  "connection",
  "keep-alive",
  "proxy-authenticate",
  "proxy-authorization",
  "te",
  "trailer",
  "transfer-encoding",
  "upgrade",
]);

function cloneSafeHeaders(input: Headers): Headers {
  const out = new Headers();
  input.forEach((value, key) => {
    if (HOP_BY_HOP_HEADERS.has(key.toLowerCase())) return;
    out.set(key, value);
  });
  return out;
}

export async function proxyPlaygroundRequest(options: ProxyOptions): Promise<Response> {
  const url = new URL(options.path, options.request.nextUrl.origin);
  const headers = new Headers({
    Authorization: `Bearer ${options.bearer}`,
  });
  if (options.acceptSse) {
    headers.set("Accept", "text/event-stream");
  } else {
    headers.set("Accept", "application/json");
  }
  let body: string | undefined;
  if (options.body !== undefined) {
    body = JSON.stringify(options.body);
    headers.set("Content-Type", "application/json");
  }

  const upstream = await fetch(url, {
    method: options.method,
    headers,
    ...(body !== undefined ? { body } : {}),
    cache: "no-store",
  });

  const contentType = upstream.headers.get("content-type")?.toLowerCase() ?? "";
  const safeHeaders = cloneSafeHeaders(upstream.headers);
  if (contentType.includes("text/event-stream") && upstream.body) {
    return new Response(upstream.body, {
      status: upstream.status,
      headers: safeHeaders,
    });
  }

  const raw = await upstream.arrayBuffer();
  return new Response(raw, {
    status: upstream.status,
    headers: safeHeaders,
  });
}

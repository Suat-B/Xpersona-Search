"use client";

import { useEffect, useMemo, useRef } from "react";
import {
  buildCustomPageCsp,
  isAllowedBridgeFetchUrl,
  withinBridgeStorageQuota,
} from "@/lib/agent-customization/bridge";

interface CustomPagePayload {
  html: string;
  css: string;
  js: string;
}

interface Props {
  agentSlug: string;
  code: CustomPagePayload;
  className?: string;
}

type BridgeRequest =
  | {
      type: "xp_bridge_fetch";
      requestId: string;
      url: string;
      method?: string;
      headers?: Record<string, string>;
      body?: string;
    }
  | {
      type: "xp_bridge_storage_get";
      requestId: string;
      key: string;
    }
  | {
      type: "xp_bridge_storage_set";
      requestId: string;
      key: string;
      value: string;
    }
  | {
      type: "xp_bridge_track";
      event: string;
      payload?: unknown;
    };

function safeInlineScript(code: string): string {
  return code.replace(/<\/script>/gi, "<\\/script>");
}

function buildSrcDoc(agentSlug: string, code: CustomPagePayload): string {
  const csp = buildCustomPageCsp();
  const bridgeScript = `
(() => {
  const pending = new Map();
  window.addEventListener("message", (event) => {
    const data = event.data;
    if (!data || typeof data !== "object") return;
    if (data.type !== "xp_bridge_response" || !data.requestId) return;
    const handler = pending.get(data.requestId);
    if (!handler) return;
    pending.delete(data.requestId);
    if (data.error) handler.reject(new Error(data.error));
    else handler.resolve(data.result);
  });

  function send(type, payload = {}) {
    const requestId = "req_" + Math.random().toString(36).slice(2);
    return new Promise((resolve, reject) => {
      pending.set(requestId, { resolve, reject });
      parent.postMessage({ type, requestId, ...payload }, "*");
      setTimeout(() => {
        if (pending.has(requestId)) {
          pending.delete(requestId);
          reject(new Error("Bridge request timed out"));
        }
      }, 12000);
    });
  }

  window.XpersonaBridge = {
    track(event, payload) {
      parent.postMessage({ type: "xp_bridge_track", event, payload }, "*");
    },
    fetch(url, init = {}) {
      return send("xp_bridge_fetch", {
        url,
        method: init.method || "GET",
        headers: init.headers || {},
        body: typeof init.body === "string" ? init.body : undefined,
      });
    },
    storage: {
      get(key) {
        return send("xp_bridge_storage_get", { key });
      },
      set(key, value) {
        return send("xp_bridge_storage_set", { key, value: String(value) });
      }
    },
    meta: {
      slug: ${JSON.stringify(agentSlug)},
      version: "1"
    }
  };
})();
  `;

  return `<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <meta http-equiv="Content-Security-Policy" content="${csp}" />
    <style>${code.css}</style>
  </head>
  <body>
    <div id="xpersona-root">${code.html}</div>
    <script>${safeInlineScript(bridgeScript)}</script>
    <script>${safeInlineScript(code.js)}</script>
  </body>
</html>`;
}

export function CustomAgentPage({ agentSlug, code, className }: Props) {
  const frameRef = useRef<HTMLIFrameElement>(null);
  const srcDoc = useMemo(
    () =>
      buildSrcDoc(agentSlug, {
        html: code.html ?? "",
        css: code.css ?? "",
        js: code.js ?? "",
      }),
    [agentSlug, code.css, code.html, code.js]
  );

  useEffect(() => {
    function sendResponse(
      target: Window,
      requestId: string,
      result?: unknown,
      error?: string
    ) {
      target.postMessage(
        {
          type: "xp_bridge_response",
          requestId,
          result,
          error,
        },
        "*"
      );
    }

    async function onMessage(event: MessageEvent) {
      const frame = frameRef.current;
      if (!frame?.contentWindow || event.source !== frame.contentWindow) {
        return;
      }

      const data = event.data as BridgeRequest;
      if (!data || typeof data !== "object" || !("type" in data)) {
        return;
      }

      if (data.type === "xp_bridge_track") {
        // Keep this lightweight by default. Hook analytics pipeline later if needed.
        return;
      }

      if (!("requestId" in data)) return;

      if (data.type === "xp_bridge_fetch") {
        if (!isAllowedBridgeFetchUrl(data.url)) {
          sendResponse(event.source as Window, data.requestId, undefined, "URL is not allowed");
          return;
        }
        try {
          const res = await fetch(data.url, {
            method: data.method ?? "GET",
            headers: data.headers ?? {},
            body: data.body,
          });
          const text = await res.text();
          sendResponse(event.source as Window, data.requestId, {
            status: res.status,
            ok: res.ok,
            body: text.slice(0, 200_000),
          });
        } catch (err) {
          sendResponse(
            event.source as Window,
            data.requestId,
            undefined,
            err instanceof Error ? err.message : "Bridge fetch failed"
          );
        }
        return;
      }

      if (data.type === "xp_bridge_storage_get") {
        const key = `xp_custom:${agentSlug}:${data.key}`;
        try {
          const value = localStorage.getItem(key);
          sendResponse(event.source as Window, data.requestId, value);
        } catch {
          sendResponse(event.source as Window, data.requestId, null);
        }
        return;
      }

      if (data.type === "xp_bridge_storage_set") {
        const key = `xp_custom:${agentSlug}:${data.key}`;
        try {
          const currentEntries = Object.keys(localStorage)
            .filter((k) => k.startsWith(`xp_custom:${agentSlug}:`))
            .map((k) => [k, localStorage.getItem(k) ?? ""]);
          const projected = JSON.stringify([
            ...currentEntries.filter(([k]) => k !== key),
            [key, data.value],
          ]);
          if (!withinBridgeStorageQuota(projected)) {
            sendResponse(event.source as Window, data.requestId, undefined, "Storage quota exceeded");
            return;
          }
          localStorage.setItem(key, data.value);
          sendResponse(event.source as Window, data.requestId, true);
        } catch (err) {
          sendResponse(
            event.source as Window,
            data.requestId,
            undefined,
            err instanceof Error ? err.message : "Storage write failed"
          );
        }
      }
    }

    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, [agentSlug]);

  return (
    <iframe
      ref={frameRef}
      sandbox="allow-scripts"
      srcDoc={srcDoc}
      title={`${agentSlug} custom page`}
      className={className ?? "w-full min-h-[70vh] rounded-xl border border-[var(--border)] bg-white"}
    />
  );
}

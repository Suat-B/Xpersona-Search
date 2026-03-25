"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.createBinaryBuild = createBinaryBuild;
exports.createBinaryBuildStream = createBinaryBuildStream;
exports.streamBinaryBuildEvents = streamBinaryBuildEvents;
exports.getBinaryBuild = getBinaryBuild;
exports.validateBinaryBuild = validateBinaryBuild;
exports.publishBinaryBuild = publishBinaryBuild;
exports.cancelBinaryBuild = cancelBinaryBuild;
exports.refineBinaryBuild = refineBinaryBuild;
exports.branchBinaryBuild = branchBinaryBuild;
exports.rewindBinaryBuild = rewindBinaryBuild;
exports.executeBinaryBuild = executeBinaryBuild;
const api_client_1 = require("./api-client");
const config_1 = require("./config");
function buildAuthHeaders(auth) {
    const headers = {};
    if (auth?.bearer)
        headers.Authorization = `Bearer ${auth.bearer}`;
    else if (auth?.apiKey)
        headers["X-API-Key"] = auth.apiKey;
    return headers;
}
function buildCreatePayload(input) {
    return {
        intent: input.intent,
        workspaceFingerprint: input.workspaceFingerprint,
        ...(input.historySessionId ? { historySessionId: input.historySessionId } : {}),
        targetEnvironment: input.targetEnvironment,
        ...(input.context ? { context: input.context } : {}),
        ...(input.retrievalHints ? { retrievalHints: input.retrievalHints } : {}),
    };
}
function getBinaryWebSocketConstructor() {
    const candidate = globalThis.WebSocket;
    return typeof candidate === "function" ? candidate : undefined;
}
function toWebSocketUrl(value, baseHttpUrl) {
    if (/^wss?:\/\//i.test(value))
        return value;
    if (/^https?:\/\//i.test(value)) {
        const url = new URL(value);
        url.protocol = url.protocol === "https:" ? "wss:" : "ws:";
        return url.toString();
    }
    const baseUrl = new URL(baseHttpUrl);
    const wsBase = `${baseUrl.protocol === "https:" ? "wss:" : "ws:"}//${baseUrl.host}`;
    return new URL(value.startsWith("/") ? value : `/${value}`, wsBase).toString();
}
function resolveBinaryStreamWebSocketUrl(stream, buildId, cursor) {
    const rawPath = String(stream?.wsPath || "").trim();
    const sessionId = String(stream?.streamSessionId || buildId || "").trim();
    const candidate = rawPath || (sessionId ? `/ws/${encodeURIComponent(sessionId)}` : "");
    if (!candidate)
        return null;
    const gatewayBase = (0, config_1.getBinaryStreamGatewayUrl)() || (0, config_1.getBaseApiUrl)();
    const url = new URL(toWebSocketUrl(candidate, gatewayBase));
    if (stream?.resumeToken) {
        url.searchParams.set("resumeToken", stream.resumeToken);
    }
    if (sessionId) {
        url.searchParams.set("streamSessionId", sessionId);
    }
    if (cursor) {
        url.searchParams.set("cursor", cursor);
    }
    if (buildId) {
        url.searchParams.set("buildId", buildId);
    }
    return url.toString();
}
async function readBinarySse(input) {
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
    const flushChunk = async (rawChunk) => {
        const lines = rawChunk.split(/\r?\n/);
        let payload = "";
        for (const line of lines) {
            if (line.startsWith("data:"))
                payload += line.slice(5).trimStart();
        }
        if (!payload || payload === "[DONE]")
            return;
        const parsed = JSON.parse(payload);
        await input.onEvent(parsed);
    };
    while (true) {
        const { value, done } = await reader.read();
        if (done)
            break;
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
async function readBinaryWebSocket(input) {
    const WebSocketCtor = getBinaryWebSocketConstructor();
    if (!WebSocketCtor) {
        throw new Error("WebSocket transport is not available in this extension host.");
    }
    const decoder = new TextDecoder();
    await new Promise((resolve, reject) => {
        const ws = new WebSocketCtor(input.url);
        let opened = false;
        let settled = false;
        let pending = Promise.resolve();
        const cleanup = () => {
            input.signal?.removeEventListener("abort", onAbort);
        };
        const finish = () => {
            if (settled)
                return;
            settled = true;
            cleanup();
            resolve();
        };
        const fail = (error) => {
            if (settled)
                return;
            settled = true;
            cleanup();
            try {
                ws.close();
            }
            catch {
                // Ignore close failures while we are already failing the stream.
            }
            reject(error instanceof Error ? error : new Error(String(error)));
        };
        const onAbort = () => {
            fail(new Error("Binary stream aborted."));
        };
        const onMessage = (event) => {
            const raw = event.data;
            let payload = "";
            if (typeof raw === "string") {
                payload = raw;
            }
            else if (raw instanceof ArrayBuffer) {
                payload = decoder.decode(new Uint8Array(raw));
            }
            else if (ArrayBuffer.isView(raw)) {
                payload = decoder.decode(new Uint8Array(raw.buffer, raw.byteOffset, raw.byteLength));
            }
            else if (typeof Buffer !== "undefined" && Buffer.isBuffer(raw)) {
                payload = raw.toString("utf8");
            }
            const text = payload.trim();
            if (!text)
                return;
            pending = pending.then(async () => {
                const parsed = JSON.parse(text);
                await input.onEvent(parsed);
            });
        };
        const onError = () => {
            fail(new Error(opened ? "Binary WebSocket stream failed." : "Binary WebSocket stream could not be established."));
        };
        const onClose = () => {
            pending.then(finish).catch(fail);
        };
        if (input.signal) {
            if (input.signal.aborted) {
                onAbort();
                return;
            }
            input.signal.addEventListener("abort", onAbort, { once: true });
        }
        if (typeof ws.addEventListener === "function") {
            ws.addEventListener("open", () => {
                opened = true;
            });
            ws.addEventListener("message", onMessage);
            ws.addEventListener("error", onError);
            ws.addEventListener("close", onClose);
        }
        else {
            ws.onopen = () => {
                opened = true;
            };
            ws.onmessage = onMessage;
            ws.onerror = onError;
            ws.onclose = onClose;
        }
    });
}
async function readBinaryBuildStream(input) {
    const stream = input.build.stream;
    const wsUrl = stream?.transport === "websocket" ? resolveBinaryStreamWebSocketUrl(stream, input.build.id, input.cursor) : null;
    if (wsUrl) {
        try {
            await readBinaryWebSocket({
                url: wsUrl,
                signal: input.signal,
                onEvent: input.onEvent,
            });
            return;
        }
        catch {
            // Fall back to the replay-capable SSE endpoint below.
        }
    }
    const url = new URL(`${(0, config_1.getBaseApiUrl)()}/api/v1/binary/builds/${encodeURIComponent(input.build.id)}/events`);
    if (input.cursor)
        url.searchParams.set("cursor", input.cursor);
    await readBinarySse({
        url: url.toString(),
        auth: input.auth,
        method: "GET",
        signal: input.signal,
        onEvent: input.onEvent,
    });
}
async function createBinaryBuild(input) {
    const response = await (0, api_client_1.requestJson)("POST", `${(0, config_1.getBaseApiUrl)()}/api/v1/binary/builds`, input.auth, buildCreatePayload(input));
    return (response?.data || response);
}
async function createBinaryBuildStream(input) {
    const build = await createBinaryBuild(input);
    await input.onEvent({
        id: `${build.id}:created`,
        buildId: build.id,
        timestamp: build.createdAt || new Date().toISOString(),
        type: "build.created",
        data: { build },
    });
    await readBinaryBuildStream({
        auth: input.auth,
        build,
        signal: input.signal,
        onEvent: input.onEvent,
    });
}
async function streamBinaryBuildEvents(input) {
    const build = await getBinaryBuild(input.auth, input.buildId);
    await readBinaryBuildStream({
        auth: input.auth,
        build,
        cursor: input.cursor,
        signal: input.signal,
        onEvent: input.onEvent,
    });
}
async function getBinaryBuild(auth, buildId) {
    const response = await (0, api_client_1.requestJson)("GET", `${(0, config_1.getBaseApiUrl)()}/api/v1/binary/builds/${encodeURIComponent(buildId)}`, auth);
    return (response?.data || response);
}
async function validateBinaryBuild(input) {
    const response = await (0, api_client_1.requestJson)("POST", `${(0, config_1.getBaseApiUrl)()}/api/v1/binary/builds/${encodeURIComponent(input.buildId)}/validate`, input.auth, {
        targetEnvironment: input.targetEnvironment,
    });
    return (response?.data || response);
}
async function publishBinaryBuild(input) {
    const response = await (0, api_client_1.requestJson)("POST", `${(0, config_1.getBaseApiUrl)()}/api/v1/binary/builds/${encodeURIComponent(input.buildId)}/publish`, input.auth, {});
    return (response?.data || response);
}
async function cancelBinaryBuild(input) {
    const response = await (0, api_client_1.requestJson)("POST", `${(0, config_1.getBaseApiUrl)()}/api/v1/binary/builds/${encodeURIComponent(input.buildId)}/control`, input.auth, { action: "cancel" });
    return (response?.data || response);
}
async function refineBinaryBuild(input) {
    const response = await (0, api_client_1.requestJson)("POST", `${(0, config_1.getBaseApiUrl)()}/api/v1/binary/builds/${encodeURIComponent(input.buildId)}/control`, input.auth, { action: "refine", intent: input.intent });
    return (response?.data || response);
}
async function branchBinaryBuild(input) {
    const response = await (0, api_client_1.requestJson)("POST", `${(0, config_1.getBaseApiUrl)()}/api/v1/binary/builds/${encodeURIComponent(input.buildId)}/control`, input.auth, {
        action: "branch",
        ...(input.checkpointId ? { checkpointId: input.checkpointId } : {}),
        ...(input.intent ? { intent: input.intent } : {}),
    });
    return (response?.data || response);
}
async function rewindBinaryBuild(input) {
    const response = await (0, api_client_1.requestJson)("POST", `${(0, config_1.getBaseApiUrl)()}/api/v1/binary/builds/${encodeURIComponent(input.buildId)}/control`, input.auth, {
        action: "rewind",
        checkpointId: input.checkpointId,
    });
    return (response?.data || response);
}
async function executeBinaryBuild(input) {
    const response = await (0, api_client_1.requestJson)("POST", `${(0, config_1.getBaseApiUrl)()}/api/v1/binary/builds/${encodeURIComponent(input.buildId)}/execute`, input.auth, {
        entryPoint: input.entryPoint,
        ...(input.args?.length ? { args: input.args } : {}),
    });
    return (response?.data || response);
}
//# sourceMappingURL=binary-client.js.map
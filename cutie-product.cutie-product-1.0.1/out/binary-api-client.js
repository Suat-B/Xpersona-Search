"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.parseBinarySseEventDataJson = void 0;
exports.resolveBinaryStreamTransport = resolveBinaryStreamTransport;
exports.resolveBinaryStreamUrl = resolveBinaryStreamUrl;
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
/**
 * Portable bundle REST + SSE/WebSocket client for `/api/v1/binary/builds/*`.
 * When the Streaming Binary IDE platform adds new real-time events, extend `BinaryBuildEvent` in
 * `binary-types.ts` (see `BINARY_STREAMING_PLAN_FUTURE_EVENTS`) and handle them in
 * `CutieBinaryBundleController.handleBinaryBuildEvent`.
 */
const vscode_core_1 = require("@xpersona/vscode-core");
const config_1 = require("./config");
const binary_sse_parse_1 = require("./binary-sse-parse");
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
var binary_sse_parse_2 = require("./binary-sse-parse");
Object.defineProperty(exports, "parseBinarySseEventDataJson", { enumerable: true, get: function () { return binary_sse_parse_2.parseBinarySseEventDataJson; } });
function resolveBinaryStreamTransport(stream) {
    return stream?.transport === "websocket" ? "websocket" : "sse";
}
function resolveBinaryStreamUrl(baseUrl, build, cursor, preferredTransport) {
    const stream = build.stream;
    if (!stream)
        return null;
    const buildCursor = cursor || stream.lastEventId || null;
    const wsCandidate = String(stream.wsPath || "").trim();
    const sessionId = String(stream.streamSessionId || "").trim();
    const gatewayUrl = (0, config_1.getBinaryStreamGatewayUrl)();
    const query = new URLSearchParams();
    if (buildCursor)
        query.set("cursor", buildCursor);
    if (stream.resumeToken)
        query.set("resumeToken", String(stream.resumeToken));
    if (sessionId)
        query.set("streamSessionId", sessionId);
    query.set("buildId", build.id);
    const transport = preferredTransport || resolveBinaryStreamTransport(stream);
    if (transport === "websocket") {
        let candidate = wsCandidate;
        if (!candidate && gatewayUrl && sessionId) {
            candidate = `${gatewayUrl.replace(/\/+$/, "")}/ws/${encodeURIComponent(sessionId)}`;
        }
        if (!candidate) {
            const fallback = String(stream.streamPath || "").trim();
            if (fallback)
                candidate = fallback;
        }
        if (!candidate)
            return null;
        const url = new URL(candidate, baseUrl);
        if (query.toString()) {
            for (const [key, value] of query.entries())
                url.searchParams.set(key, value);
        }
        if (url.protocol === "http:")
            url.protocol = "ws:";
        if (url.protocol === "https:")
            url.protocol = "wss:";
        return url.toString();
    }
    const pathCandidate = String(stream.eventsPath || stream.streamPath || "").trim();
    if (!pathCandidate)
        return null;
    const url = new URL(pathCandidate, baseUrl);
    if (query.toString()) {
        for (const [key, value] of query.entries())
            url.searchParams.set(key, value);
    }
    return url.toString();
}
function getRuntimeWebSocketCtor() {
    const ctor = globalThis.WebSocket;
    return typeof ctor === "function" ? ctor : undefined;
}
function normalizeBinaryStreamPayload(payload) {
    if (typeof payload === "string")
        return payload;
    if (typeof ArrayBuffer !== "undefined" && payload instanceof ArrayBuffer) {
        return new TextDecoder().decode(payload);
    }
    if (typeof ArrayBuffer !== "undefined" && ArrayBuffer.isView(payload)) {
        const view = payload;
        return new TextDecoder().decode(new Uint8Array(view.buffer, view.byteOffset, view.byteLength));
    }
    if (typeof Blob !== "undefined" && payload instanceof Blob) {
        throw new Error("Blob websocket payloads are not supported in this runtime.");
    }
    return String(payload || "");
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
        const json = (0, binary_sse_parse_1.parseBinarySseEventDataJson)(rawChunk);
        if (!json)
            return;
        const parsed = JSON.parse(json);
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
    const WebSocketCtor = getRuntimeWebSocketCtor();
    if (!WebSocketCtor) {
        throw new Error("WebSocket is unavailable in this runtime.");
    }
    if (input.signal?.aborted) {
        return Promise.resolve();
    }
    const socket = new WebSocketCtor(input.url);
    let chain = Promise.resolve();
    let settled = false;
    let resolvePromise = null;
    let rejectPromise = null;
    const settle = (fn) => {
        if (settled)
            return;
        settled = true;
        input.signal?.removeEventListener("abort", onAbort);
        fn();
    };
    const onAbort = () => {
        try {
            socket.close(1000, "aborted");
        }
        catch {
            /* ignore */
        }
        settle(() => resolvePromise?.());
    };
    if (input.signal) {
        input.signal.addEventListener("abort", onAbort, { once: true });
    }
    return new Promise((resolve, reject) => {
        resolvePromise = resolve;
        rejectPromise = reject;
        const fail = (error) => {
            settle(() => rejectPromise?.(error instanceof Error ? error : new Error(String(error))));
        };
        socket.addEventListener("open", () => {
            /* no-op */
        });
        socket.addEventListener("message", (event) => {
            chain = chain
                .then(async () => {
                const text = normalizeBinaryStreamPayload(event.data);
                if (!text.trim())
                    return;
                const parsed = JSON.parse(text);
                await input.onEvent(parsed);
            })
                .catch((error) => {
                fail(error);
            });
        });
        socket.addEventListener("error", () => {
            fail(new Error("Binary websocket stream failed."));
        });
        socket.addEventListener("close", () => {
            chain
                .then(() => settle(() => resolvePromise?.()))
                .catch((error) => fail(error));
        });
    });
}
async function emitBinaryBuildCreated(build, onEvent) {
    await onEvent({
        id: `${build.id}:created`,
        buildId: build.id,
        timestamp: build.createdAt,
        type: "build.created",
        data: { build },
    });
}
async function followBinaryBuildRecord(input) {
    const base = (0, config_1.getBinaryApiBaseUrl)();
    const streamUrl = resolveBinaryStreamUrl(base, input.build, input.cursor);
    if (input.emitCreatedEvent) {
        await emitBinaryBuildCreated(input.build, input.onEvent);
    }
    if (!input.build.stream) {
        return;
    }
    const transport = resolveBinaryStreamTransport(input.build.stream);
    const websocketAvailable = Boolean(getRuntimeWebSocketCtor());
    if (transport === "websocket" && streamUrl && websocketAvailable) {
        await readBinaryWebSocket({
            url: streamUrl,
            signal: input.signal,
            onEvent: input.onEvent,
        });
        return;
    }
    const fallbackUrl = resolveBinaryStreamUrl(base, input.build, input.cursor, "sse");
    if (!fallbackUrl) {
        return;
    }
    await readBinarySse({
        url: fallbackUrl,
        auth: input.auth,
        method: "GET",
        signal: input.signal,
        onEvent: input.onEvent,
    });
}
async function createBinaryBuild(input) {
    const base = (0, config_1.getBinaryApiBaseUrl)();
    const response = await (0, vscode_core_1.requestJson)("POST", `${base}/api/v1/binary/builds`, input.auth, buildCreatePayload(input));
    return (response?.data || response);
}
async function createBinaryBuildStream(input) {
    const build = await createBinaryBuild(input);
    await followBinaryBuildRecord({
        build,
        auth: input.auth,
        signal: input.signal,
        cursor: build.stream?.lastEventId || null,
        onEvent: input.onEvent,
        emitCreatedEvent: true,
    });
}
async function streamBinaryBuildEvents(input) {
    const build = await getBinaryBuild(input.auth, input.buildId);
    await followBinaryBuildRecord({
        build,
        auth: input.auth,
        cursor: input.cursor || build.stream?.lastEventId || null,
        signal: input.signal,
        onEvent: input.onEvent,
    });
}
async function getBinaryBuild(auth, buildId) {
    const base = (0, config_1.getBinaryApiBaseUrl)();
    const response = await (0, vscode_core_1.requestJson)("GET", `${base}/api/v1/binary/builds/${encodeURIComponent(buildId)}`, auth);
    return (response?.data || response);
}
async function validateBinaryBuild(input) {
    const base = (0, config_1.getBinaryApiBaseUrl)();
    const response = await (0, vscode_core_1.requestJson)("POST", `${base}/api/v1/binary/builds/${encodeURIComponent(input.buildId)}/validate`, input.auth, {
        targetEnvironment: input.targetEnvironment,
    });
    return (response?.data || response);
}
async function publishBinaryBuild(input) {
    const base = (0, config_1.getBinaryApiBaseUrl)();
    const response = await (0, vscode_core_1.requestJson)("POST", `${base}/api/v1/binary/builds/${encodeURIComponent(input.buildId)}/publish`, input.auth, {});
    return (response?.data || response);
}
async function cancelBinaryBuild(input) {
    const base = (0, config_1.getBinaryApiBaseUrl)();
    const response = await (0, vscode_core_1.requestJson)("POST", `${base}/api/v1/binary/builds/${encodeURIComponent(input.buildId)}/control`, input.auth, { action: "cancel" });
    return (response?.data || response);
}
async function refineBinaryBuild(input) {
    const base = (0, config_1.getBinaryApiBaseUrl)();
    const response = await (0, vscode_core_1.requestJson)("POST", `${base}/api/v1/binary/builds/${encodeURIComponent(input.buildId)}/control`, input.auth, { action: "refine", intent: input.intent });
    return (response?.data || response);
}
async function branchBinaryBuild(input) {
    const base = (0, config_1.getBinaryApiBaseUrl)();
    const response = await (0, vscode_core_1.requestJson)("POST", `${base}/api/v1/binary/builds/${encodeURIComponent(input.buildId)}/control`, input.auth, {
        action: "branch",
        ...(input.checkpointId ? { checkpointId: input.checkpointId } : {}),
        ...(input.intent ? { intent: input.intent } : {}),
    });
    return (response?.data || response);
}
async function rewindBinaryBuild(input) {
    const base = (0, config_1.getBinaryApiBaseUrl)();
    const response = await (0, vscode_core_1.requestJson)("POST", `${base}/api/v1/binary/builds/${encodeURIComponent(input.buildId)}/control`, input.auth, {
        action: "rewind",
        checkpointId: input.checkpointId,
    });
    return (response?.data || response);
}
async function executeBinaryBuild(input) {
    const base = (0, config_1.getBinaryApiBaseUrl)();
    const response = await (0, vscode_core_1.requestJson)("POST", `${base}/api/v1/binary/builds/${encodeURIComponent(input.buildId)}/execute`, input.auth, {
        entryPoint: input.entryPoint,
        ...(input.args?.length ? { args: input.args } : {}),
    });
    return (response?.data || response);
}
//# sourceMappingURL=binary-api-client.js.map
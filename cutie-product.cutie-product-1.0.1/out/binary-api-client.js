"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.parseBinarySseEventDataJson = void 0;
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
 * Portable bundle REST + SSE client for `/api/v1/binary/builds/*`.
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
async function createBinaryBuild(input) {
    const base = (0, config_1.getBinaryApiBaseUrl)();
    const response = await (0, vscode_core_1.requestJson)("POST", `${base}/api/v1/binary/builds`, input.auth, buildCreatePayload(input));
    return (response?.data || response);
}
async function createBinaryBuildStream(input) {
    const base = (0, config_1.getBinaryApiBaseUrl)();
    await readBinarySse({
        url: `${base}/api/v1/binary/builds/stream`,
        auth: input.auth,
        method: "POST",
        body: buildCreatePayload(input),
        signal: input.signal,
        onEvent: input.onEvent,
    });
}
async function streamBinaryBuildEvents(input) {
    const base = (0, config_1.getBinaryApiBaseUrl)();
    const url = new URL(`${base}/api/v1/binary/builds/${encodeURIComponent(input.buildId)}/events`);
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
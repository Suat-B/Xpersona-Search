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
async function createBinaryBuild(input) {
    const response = await (0, api_client_1.requestJson)("POST", `${(0, config_1.getBaseApiUrl)()}/api/v1/binary/builds`, input.auth, buildCreatePayload(input));
    return (response?.data || response);
}
async function createBinaryBuildStream(input) {
    await readBinarySse({
        url: `${(0, config_1.getBaseApiUrl)()}/api/v1/binary/builds/stream`,
        auth: input.auth,
        method: "POST",
        body: buildCreatePayload(input),
        signal: input.signal,
        onEvent: input.onEvent,
    });
}
async function streamBinaryBuildEvents(input) {
    const url = new URL(`${(0, config_1.getBaseApiUrl)()}/api/v1/binary/builds/${encodeURIComponent(input.buildId)}/events`);
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
"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.createAgentJob = createAgentJob;
exports.getAgentJob = getAgentJob;
exports.getAgentJobEvents = getAgentJobEvents;
exports.streamAgentJobEvents = streamAgentJobEvents;
const api_client_1 = require("./api-client");
const config_1 = require("./config");
function withAuthHeaders(auth) {
    const headers = {
        Accept: "text/event-stream",
        "Cache-Control": "no-cache",
    };
    if (auth?.bearer)
        headers.Authorization = `Bearer ${auth.bearer}`;
    else if (auth?.apiKey)
        headers["X-API-Key"] = auth.apiKey;
    return headers;
}
function endpointCandidates(pathSuffix) {
    const base = (0, config_1.getBaseApiUrl)().replace(/\/+$/, "");
    return [`${base}/v1${pathSuffix}`, `${base}/api/v1${pathSuffix}`];
}
function parseEventEnvelope(payload) {
    if (!payload || typeof payload !== "object" || Array.isArray(payload))
        return null;
    const raw = payload;
    const eventName = typeof raw.event === "string" && raw.event.trim() ? raw.event.trim() : "message";
    return {
        event: eventName,
        data: raw.data,
        raw,
        seq: typeof raw.seq === "number" ? raw.seq : undefined,
    };
}
async function tryJsonRequest(method, pathSuffix, auth, body) {
    let lastError = null;
    for (const url of endpointCandidates(pathSuffix)) {
        try {
            return await (0, api_client_1.requestJson)(method, url, auth, body);
        }
        catch (error) {
            lastError = error instanceof Error ? error : new Error(String(error));
            if (!/\bHTTP 404\b/i.test(lastError.message)) {
                throw lastError;
            }
        }
    }
    throw lastError || new Error(`Unable to resolve agent jobs endpoint for ${pathSuffix}`);
}
async function createAgentJob(auth, input) {
    return await tryJsonRequest("POST", "/agents/jobs", auth, input);
}
async function getAgentJob(auth, jobId) {
    return await tryJsonRequest("GET", `/agents/jobs/${encodeURIComponent(jobId)}`, auth);
}
async function getAgentJobEvents(auth, jobId, after = 0) {
    return await tryJsonRequest("GET", `/agents/jobs/${encodeURIComponent(jobId)}/events?after=${Math.max(0, after)}`, auth);
}
async function streamAgentJobEventsSse(input) {
    let lastError = null;
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
            const flush = async (chunk) => {
                const lines = chunk
                    .split(/\r?\n/)
                    .filter((line) => line.startsWith("data:"))
                    .map((line) => line.slice(5).trimStart());
                if (!lines.length)
                    return;
                const payload = lines.join("\n").trim();
                if (!payload || payload === "[DONE]")
                    return;
                let parsed = payload;
                try {
                    parsed = JSON.parse(payload);
                }
                catch {
                    // Keep text payload as-is.
                }
                const event = parseEventEnvelope(parsed);
                if (event) {
                    await input.onEvent(event);
                }
            };
            while (true) {
                const { value, done } = await reader.read();
                if (done)
                    break;
                buffer += decoder.decode(value, { stream: true });
                let boundary = buffer.indexOf("\n\n");
                while (boundary >= 0) {
                    const raw = buffer.slice(0, boundary).trim();
                    buffer = buffer.slice(boundary + 2);
                    if (raw)
                        await flush(raw);
                    boundary = buffer.indexOf("\n\n");
                }
            }
            if (buffer.trim()) {
                await flush(buffer.trim());
            }
            return;
        }
        catch (error) {
            lastError = error instanceof Error ? error : new Error(String(error));
            if (!/\bHTTP 404\b/i.test(lastError.message)) {
                throw lastError;
            }
        }
    }
    throw lastError || new Error("Unable to stream agent job events.");
}
async function streamAgentJobEvents(input) {
    try {
        await streamAgentJobEventsSse(input);
        return;
    }
    catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        if (/aborted/i.test(message))
            throw error;
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
        if (batch.done)
            break;
        await new Promise((resolve) => setTimeout(resolve, 700));
    }
}
//# sourceMappingURL=agent-jobs-client.js.map
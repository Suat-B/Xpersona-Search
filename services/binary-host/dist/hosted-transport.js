const DEFAULT_FETCH_TIMEOUT_MS = 20_000;
const DEFAULT_CONTINUE_FETCH_TIMEOUT_MS = 60_000;
const DEFAULT_STREAM_IDLE_TIMEOUT_MS = 20_000;
function parseTimeoutMs(raw, fallback) {
    const parsed = Number(raw);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}
function getHostedFetchTimeoutMs() {
    return parseTimeoutMs(process.env.BINARY_HOST_HOSTED_FETCH_TIMEOUT_MS, DEFAULT_FETCH_TIMEOUT_MS);
}
function getHostedContinueFetchTimeoutMs() {
    return parseTimeoutMs(process.env.BINARY_HOST_HOSTED_CONTINUE_FETCH_TIMEOUT_MS, DEFAULT_CONTINUE_FETCH_TIMEOUT_MS);
}
function getHostedStreamIdleTimeoutMs() {
    return parseTimeoutMs(process.env.BINARY_HOST_HOSTED_STREAM_IDLE_TIMEOUT_MS, DEFAULT_STREAM_IDLE_TIMEOUT_MS);
}
function toHostedMode(mode) {
    return mode === "plan" ? "plan" : mode === "yolo" ? "yolo" : "auto";
}
function buildHostedHeaders(apiKey) {
    return {
        "Content-Type": "application/json",
        "X-API-Key": apiKey,
        Authorization: `Bearer ${apiKey}`,
    };
}
async function parseHostedError(response) {
    const text = await response.text().catch(() => "");
    if (!text)
        return { message: `Hosted request failed (${response.status})` };
    try {
        const parsed = JSON.parse(text);
        if (typeof parsed.message === "string" && parsed.message.trim()) {
            return { message: parsed.message, details: parsed };
        }
        if (typeof parsed.error === "string") {
            return { message: parsed.error, details: parsed };
        }
        if (parsed.error && typeof parsed.error === "object" && typeof parsed.error.message === "string") {
            return {
                message: `${parsed.error.code || "ERROR"}: ${parsed.error.message}`,
                details: parsed,
            };
        }
        return { message: text, details: parsed };
    }
    catch {
        return { message: text };
    }
}
async function fetchWithTimeout(fetchImpl, url, init, timeoutMs, timeoutLabel) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(new Error(timeoutLabel)), timeoutMs);
    try {
        return await fetchImpl(url, {
            ...init,
            signal: controller.signal,
        });
    }
    catch (error) {
        if (controller.signal.aborted) {
            throw new Error(timeoutLabel);
        }
        throw error;
    }
    finally {
        clearTimeout(timer);
    }
}
async function readStreamChunkWithTimeout(reader, timeoutMs, timeoutLabel) {
    let timer;
    return await Promise.race([
        reader.read().finally(() => {
            if (timer)
                clearTimeout(timer);
        }),
        new Promise((_, reject) => {
            timer = setTimeout(() => {
                reject(new Error(timeoutLabel));
            }, timeoutMs);
        }),
    ]);
}
export async function streamHostedAssist(input, options = {}) {
    const fetchImpl = options.fetchImpl || fetch;
    const fetchTimeoutMs = options.fetchTimeoutMs ?? getHostedFetchTimeoutMs();
    const streamIdleTimeoutMs = options.streamIdleTimeoutMs ?? getHostedStreamIdleTimeoutMs();
    const response = await fetchWithTimeout(fetchImpl, `${input.baseUrl}/api/v1/playground/assist`, {
        method: "POST",
        headers: buildHostedHeaders(input.apiKey),
        body: JSON.stringify({
            task: input.request.task,
            mode: toHostedMode(input.request.mode),
            model: input.request.model || "Binary IDE",
            stream: true,
            historySessionId: input.request.historySessionId,
            ...(input.request.context ? { context: input.request.context } : {}),
            ...(input.request.clientCapabilities ? { clientCapabilities: input.request.clientCapabilities } : {}),
            contextBudget: {
                strategy: "hybrid",
                maxTokens: 16384,
            },
        }),
    }, fetchTimeoutMs, `Timed out waiting for hosted assist after ${fetchTimeoutMs}ms.`);
    if (!response.ok || !response.body) {
        const failure = await parseHostedError(response);
        throw new Error(failure.message);
    }
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    const envelope = {
        actions: [],
        missingRequirements: [],
    };
    let buffer = "";
    while (true) {
        const { value, done } = await readStreamChunkWithTimeout(reader, streamIdleTimeoutMs, `Timed out waiting for hosted assist stream activity after ${streamIdleTimeoutMs}ms.`);
        if (done)
            break;
        buffer += decoder.decode(value, { stream: true });
        while (true) {
            const boundary = buffer.indexOf("\n\n");
            if (boundary < 0)
                break;
            const raw = buffer.slice(0, boundary).trim();
            buffer = buffer.slice(boundary + 2);
            if (!raw)
                continue;
            let payload = "";
            for (const line of raw.split(/\r?\n/)) {
                if (line.startsWith("data:"))
                    payload += line.slice(5).trimStart();
            }
            if (!payload || payload === "[DONE]")
                continue;
            let parsed;
            try {
                parsed = JSON.parse(payload);
            }
            catch {
                parsed = { event: "raw", data: payload };
            }
            if (typeof parsed.sessionId === "string")
                envelope.sessionId = parsed.sessionId;
            const eventName = typeof parsed.event === "string" ? parsed.event : "";
            if (eventName === "run") {
                const data = parsed.data && typeof parsed.data === "object" ? parsed.data : {};
                if (typeof data.runId === "string")
                    envelope.runId = data.runId;
                if (typeof data.adapter === "string")
                    envelope.adapter = data.adapter;
            }
            if (eventName === "tool_request" && parsed.data && typeof parsed.data === "object") {
                envelope.pendingToolCall = parsed.data;
            }
            if (eventName === "meta" && parsed.data && typeof parsed.data === "object") {
                Object.assign(envelope, parsed.data);
            }
            if (eventName === "final") {
                envelope.final = String(parsed.data ?? "");
            }
            await input.onEvent(parsed);
        }
    }
    return envelope;
}
export async function continueHostedRun(input, options = {}) {
    const fetchImpl = options.fetchImpl || fetch;
    const fetchTimeoutMs = options.fetchTimeoutMs ?? getHostedContinueFetchTimeoutMs();
    const response = await fetchWithTimeout(fetchImpl, `${input.baseUrl}/api/v1/playground/runs/${encodeURIComponent(input.runId)}/continue`, {
        method: "POST",
        headers: buildHostedHeaders(input.apiKey),
        body: JSON.stringify(input.sessionId ? { toolResult: input.toolResult, sessionId: input.sessionId } : { toolResult: input.toolResult }),
    }, fetchTimeoutMs, `Timed out waiting for hosted continue after ${fetchTimeoutMs}ms.`);
    if (!response.ok) {
        const failure = await parseHostedError(response);
        throw new Error(failure.message);
    }
    const parsed = (await response.json().catch(() => ({})));
    const envelope = ("data" in parsed ? parsed.data : parsed) || {};
    return envelope;
}

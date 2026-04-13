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
function normalizeDelegationChildSummary(value) {
    if (!value || typeof value !== "object")
        return null;
    const record = value;
    const childId = typeof record.childId === "string" && record.childId.trim()
        ? record.childId.trim()
        : typeof record.id === "string" && record.id.trim()
            ? record.id.trim()
            : "";
    if (!childId)
        return null;
    return {
        childId,
        ...(typeof record.status === "string" && record.status.trim() ? { status: record.status.trim() } : {}),
        ...(typeof record.summary === "string" && record.summary.trim() ? { summary: record.summary.trim() } : {}),
        ...(typeof record.agentType === "string" && record.agentType.trim() ? { agentType: record.agentType.trim() } : {}),
        ...(typeof record.traceId === "string" && record.traceId.trim() ? { traceId: record.traceId.trim() } : {}),
        ...(typeof record.completedAt === "string" && record.completedAt.trim()
            ? { completedAt: record.completedAt.trim() }
            : {}),
    };
}
function normalizeDelegationChildSummaries(value) {
    if (!Array.isArray(value))
        return undefined;
    const childSummaries = value
        .map((item) => normalizeDelegationChildSummary(item))
        .filter((item) => Boolean(item));
    return childSummaries.length ? childSummaries : undefined;
}
function mergeDelegationChildSummaries(existing, incoming) {
    if (!incoming?.length)
        return existing;
    const merged = new Map();
    for (const item of existing || []) {
        merged.set(item.childId, item);
    }
    for (const item of incoming) {
        merged.set(item.childId, {
            ...(merged.get(item.childId) || {}),
            ...item,
        });
    }
    return [...merged.values()];
}
function countDelegationChildren(childSummaries, statuses) {
    if (!childSummaries?.length)
        return undefined;
    const wanted = new Set(statuses);
    return childSummaries.filter((item) => wanted.has(String(item.status || "").trim())).length;
}
function applyDelegationData(envelope, data, options = {}) {
    const hasExplicitChildCount = typeof data.childCount === "number" && Number.isFinite(data.childCount);
    const hasExplicitCompletedChildren = typeof data.completedChildren === "number" && Number.isFinite(data.completedChildren);
    const hasExplicitFailedChildren = typeof data.failedChildren === "number" && Number.isFinite(data.failedChildren);
    if (typeof data.delegationUsed === "boolean") {
        envelope.delegationUsed = data.delegationUsed;
    }
    else if (options.markDelegationUsed) {
        envelope.delegationUsed = true;
    }
    if (typeof data.delegationReason === "string" && data.delegationReason.trim()) {
        envelope.delegationReason = data.delegationReason.trim();
    }
    if (hasExplicitChildCount) {
        envelope.childCount = Math.max(0, Math.round(Number(data.childCount)));
    }
    if (hasExplicitCompletedChildren) {
        envelope.completedChildren = Math.max(0, Math.round(Number(data.completedChildren)));
    }
    if (hasExplicitFailedChildren) {
        envelope.failedChildren = Math.max(0, Math.round(Number(data.failedChildren)));
    }
    const directChildSummary = normalizeDelegationChildSummary(data.childSummary || data);
    const childSummaries = mergeDelegationChildSummaries(envelope.childSummaries, normalizeDelegationChildSummaries(data.childSummaries) ||
        normalizeDelegationChildSummaries(data.children) ||
        (directChildSummary ? [directChildSummary] : undefined));
    if (childSummaries?.length) {
        envelope.childSummaries = childSummaries;
        if (!hasExplicitChildCount)
            envelope.childCount = childSummaries.length;
        if (!hasExplicitCompletedChildren) {
            envelope.completedChildren = countDelegationChildren(childSummaries, ["completed"]);
        }
        if (!hasExplicitFailedChildren) {
            envelope.failedChildren = countDelegationChildren(childSummaries, ["failed", "cancelled"]);
        }
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
            ...(input.request.imageInputs ? { imageInputs: input.request.imageInputs } : {}),
            ...(input.request.chatModelSource ? { chatModelSource: input.request.chatModelSource } : {}),
            ...(input.request.fallbackToPlatformModel !== undefined
                ? { fallbackToPlatformModel: input.request.fallbackToPlatformModel }
                : {}),
            ...(input.request.execution ? { execution: input.request.execution } : {}),
            ...(input.request.routePolicy ? { routePolicy: input.request.routePolicy } : {}),
            stream: true,
            historySessionId: input.request.historySessionId,
            ...(input.request.tom ? { tom: input.request.tom } : {}),
            ...(input.request.mcp ? { mcp: input.request.mcp } : {}),
            ...(input.request.context ? { context: input.request.context } : {}),
            ...(input.request.clientCapabilities ? { clientCapabilities: input.request.clientCapabilities } : {}),
            ...(input.request.delegation ? { delegation: input.request.delegation } : {}),
            ...(input.request.userConnectedModels ? { userConnectedModels: input.request.userConnectedModels } : {}),
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
            if (eventName === "request_user_input" && parsed.data && typeof parsed.data === "object") {
                envelope.userInputRequest = parsed.data;
            }
            if (eventName === "meta" && parsed.data && typeof parsed.data === "object") {
                Object.assign(envelope, parsed.data);
            }
            if ((eventName === "delegation.started" ||
                eventName === "delegation.child_status" ||
                eventName === "delegation.completed") &&
                parsed.data &&
                typeof parsed.data === "object") {
                applyDelegationData(envelope, parsed.data, { markDelegationUsed: true });
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
export async function submitHostedUserInput(input, options = {}) {
    const fetchImpl = options.fetchImpl || fetch;
    const fetchTimeoutMs = options.fetchTimeoutMs ?? getHostedContinueFetchTimeoutMs();
    const response = await fetchWithTimeout(fetchImpl, `${input.baseUrl}/api/v1/playground/runs/${encodeURIComponent(input.runId)}/user-input`, {
        method: "POST",
        headers: buildHostedHeaders(input.apiKey),
        body: JSON.stringify({
            requestId: input.requestId,
            answers: input.answers,
            ...(input.sessionId ? { sessionId: input.sessionId } : {}),
        }),
    }, fetchTimeoutMs, `Timed out waiting for hosted user-input resume after ${fetchTimeoutMs}ms.`);
    if (!response.ok) {
        const failure = await parseHostedError(response);
        throw new Error(failure.message);
    }
    const parsed = (await response.json().catch(() => ({})));
    const envelope = ("data" in parsed ? parsed.data : parsed) || {};
    return envelope;
}
export async function runHostedAgentProbe(input, options = {}) {
    const fetchImpl = options.fetchImpl || fetch;
    const fetchTimeoutMs = options.fetchTimeoutMs ?? getHostedContinueFetchTimeoutMs();
    const response = await fetchWithTimeout(fetchImpl, `${input.baseUrl}/api/v1/playground/debug/agent-probe`, {
        method: "POST",
        headers: buildHostedHeaders(input.apiKey),
        body: JSON.stringify(input.request),
    }, fetchTimeoutMs, `Timed out waiting for hosted agent probe after ${fetchTimeoutMs}ms.`);
    if (!response.ok) {
        const failure = await parseHostedError(response);
        throw new Error(failure.message);
    }
    const parsed = (await response.json().catch(() => ({})));
    const payload = ("data" in parsed ? parsed.data : parsed) || {};
    return payload;
}

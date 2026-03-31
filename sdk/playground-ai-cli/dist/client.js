import { requestJson, requestSse } from "./http.js";
export function toHostedAssistMode(mode) {
    if (mode === "generate" || mode === "debug")
        return "yolo";
    return mode;
}
function truncateText(value, maxLength) {
    if (typeof value !== "string")
        return undefined;
    if (value.length <= maxLength)
        return value;
    return `${value.slice(0, Math.max(0, maxLength - 15))}\n...[truncated]`;
}
function sanitizeToolResultForContinue(toolResult) {
    const next = {
        ...toolResult,
        summary: truncateText(toolResult.summary, 20_000) || toolResult.summary,
        ...(typeof toolResult.error === "string" ? { error: truncateText(toolResult.error, 4_000) } : {}),
    };
    if (toolResult.data && typeof toolResult.data === "object") {
        const data = { ...toolResult.data };
        if (typeof data.stdout === "string")
            data.stdout = truncateText(data.stdout, 8_000) || "";
        if (typeof data.stderr === "string")
            data.stderr = truncateText(data.stderr, 8_000) || "";
        if (typeof data.content === "string")
            data.content = truncateText(data.content, 16_000) || "";
        next.data = data;
    }
    return next;
}
export class PlaygroundClient {
    baseUrl;
    auth;
    constructor(options) {
        this.baseUrl = options.baseUrl.replace(/\/+$/, "");
        this.auth = options.auth;
    }
    setAuth(auth) {
        this.auth = auth;
    }
    async createSession(title, mode) {
        const res = await requestJson({
            baseUrl: this.baseUrl,
            auth: this.auth,
            path: "/api/v1/playground/sessions",
            method: "POST",
            body: { title, mode: mode ? toHostedAssistMode(mode) : undefined },
        });
        return res.data?.id ?? null;
    }
    async assistStream(input, onEvent) {
        await requestSse({
            baseUrl: this.baseUrl,
            auth: this.auth,
            path: "/api/v1/playground/assist",
            body: {
                task: input.task,
                mode: toHostedAssistMode(input.mode),
                model: input.model || "Binary IDE",
                stream: input.stream ?? true,
                historySessionId: input.historySessionId,
                contextBudget: {
                    strategy: "hybrid",
                    maxTokens: 16384,
                },
            },
            onEvent,
        });
    }
    async assist(input) {
        return requestJson({
            baseUrl: this.baseUrl,
            auth: this.auth,
            path: "/api/v1/playground/assist",
            method: "POST",
            body: {
                task: input.task,
                mode: toHostedAssistMode(input.mode),
                model: input.model || "Binary IDE",
                stream: false,
                historySessionId: input.historySessionId,
            },
        });
    }
    async listSessions(limit = 20) {
        return requestJson({
            baseUrl: this.baseUrl,
            auth: this.auth,
            path: `/api/v1/playground/sessions?limit=${encodeURIComponent(String(limit))}`,
            method: "GET",
        });
    }
    async getSessionMessages(sessionId, includeAgentEvents = true) {
        return requestJson({
            baseUrl: this.baseUrl,
            auth: this.auth,
            path: `/api/v1/playground/sessions/${encodeURIComponent(sessionId)}/messages?includeAgentEvents=${includeAgentEvents ? "true" : "false"}`,
            method: "GET",
        });
    }
    async replay(sessionId, workspaceFingerprint, mode = "plan") {
        return requestJson({
            baseUrl: this.baseUrl,
            auth: this.auth,
            path: "/api/v1/playground/replay",
            method: "POST",
            body: {
                sessionId,
                workspaceFingerprint,
                mode: toHostedAssistMode(mode),
            },
        });
    }
    async continueRun(runId, toolResult, sessionId) {
        const sanitizedToolResult = sanitizeToolResultForContinue(toolResult);
        const response = await requestJson({
            baseUrl: this.baseUrl,
            auth: this.auth,
            path: `/api/v1/playground/runs/${encodeURIComponent(runId)}/continue`,
            method: "POST",
            body: sessionId ? { toolResult: sanitizedToolResult, sessionId } : { toolResult: sanitizedToolResult },
        });
        const record = response;
        return (record?.data || response);
    }
    async execute(sessionId, workspaceFingerprint, actions) {
        return requestJson({
            baseUrl: this.baseUrl,
            auth: this.auth,
            path: "/api/v1/playground/execute",
            method: "POST",
            body: {
                sessionId,
                workspaceFingerprint,
                actions,
            },
        });
    }
    async indexUpsert(projectKey, chunks) {
        return requestJson({
            baseUrl: this.baseUrl,
            auth: this.auth,
            path: "/api/v1/playground/index/upsert",
            method: "POST",
            body: {
                projectKey,
                chunks,
            },
        });
    }
    async indexQuery(projectKey, query, limit = 8) {
        return requestJson({
            baseUrl: this.baseUrl,
            auth: this.auth,
            path: "/api/v1/playground/index/query",
            method: "POST",
            body: {
                projectKey,
                query,
                limit,
            },
        });
    }
    async usage() {
        return requestJson({
            baseUrl: this.baseUrl,
            auth: this.auth,
            path: "/api/v1/hf/usage",
            method: "GET",
        });
    }
    async checkout(tier = "builder", billing = "monthly") {
        return requestJson({
            baseUrl: this.baseUrl,
            auth: this.auth,
            path: "/api/v1/playground/checkout-link",
            method: "POST",
            body: { tier, billing },
        });
    }
}

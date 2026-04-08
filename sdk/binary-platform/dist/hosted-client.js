import { requestJson, requestSse } from "./http.js";
export function toHostedAssistMode(mode) {
    if (mode === "generate" || mode === "debug")
        return "yolo";
    return mode;
}
export class BinaryHostedClient {
    baseUrl;
    auth;
    constructor(input) {
        this.baseUrl = input.baseUrl.replace(/\/+$/, "");
        this.auth = input.auth;
    }
    async createSession(title, mode) {
        const response = await requestJson({
            url: `${this.baseUrl}/api/v1/playground/sessions`,
            auth: this.auth,
            method: "POST",
            body: { title, mode: mode ? toHostedAssistMode(mode) : undefined },
        });
        return response.data?.id ?? null;
    }
    async assistStream(input, onEvent) {
        await requestSse({
            url: `${this.baseUrl}/api/v1/playground/assist`,
            auth: this.auth,
            method: "POST",
            body: {
                task: input.task,
                mode: toHostedAssistMode(input.mode),
                model: input.model || "Binary IDE",
                stream: true,
                historySessionId: input.historySessionId,
                contextBudget: {
                    strategy: "hybrid",
                    maxTokens: 16384,
                },
            },
            onEvent,
        });
    }
    async continueRun(runId, toolResult, sessionId) {
        const response = await requestJson({
            url: `${this.baseUrl}/api/v1/playground/runs/${encodeURIComponent(runId)}/continue`,
            auth: this.auth,
            method: "POST",
            body: sessionId ? { toolResult, sessionId } : { toolResult },
        });
        const record = response;
        return (record?.data || response);
    }
    async usage() {
        return requestJson({
            url: `${this.baseUrl}/api/v1/hf/usage`,
            auth: this.auth,
            method: "GET",
        });
    }
}

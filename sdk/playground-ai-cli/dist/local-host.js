import { CliHttpError, requestJson, requestSse } from "./http.js";
export class LocalHostClient {
    baseUrl;
    constructor(baseUrl) {
        this.baseUrl = baseUrl.replace(/\/+$/, "");
    }
    get url() {
        return this.baseUrl;
    }
    async health() {
        return requestJson({
            baseUrl: this.baseUrl,
            auth: {},
            path: "/v1/healthz",
            method: "GET",
        });
    }
    async checkHealth() {
        try {
            return await this.health();
        }
        catch (error) {
            if (error instanceof CliHttpError)
                return null;
            if (error instanceof Error)
                return null;
            return null;
        }
    }
    async authStatus() {
        return requestJson({
            baseUrl: this.baseUrl,
            auth: {},
            path: "/v1/auth/status",
            method: "GET",
        });
    }
    async setApiKey(apiKey) {
        return requestJson({
            baseUrl: this.baseUrl,
            auth: {},
            path: "/v1/auth/api-key",
            method: "POST",
            body: { apiKey },
        });
    }
    async clearApiKey() {
        return requestJson({
            baseUrl: this.baseUrl,
            auth: {},
            path: "/v1/auth/api-key",
            method: "DELETE",
        });
    }
    async preferences() {
        return requestJson({
            baseUrl: this.baseUrl,
            auth: {},
            path: "/v1/preferences",
            method: "GET",
        });
    }
    async updatePreferences(patch) {
        return requestJson({
            baseUrl: this.baseUrl,
            auth: {},
            path: "/v1/preferences",
            method: "POST",
            body: patch,
        });
    }
    async trustWorkspace(input) {
        return requestJson({
            baseUrl: this.baseUrl,
            auth: {},
            path: "/v1/workspaces/trust",
            method: "POST",
            body: input,
        });
    }
    async assistStream(input, onEvent) {
        await requestSse({
            baseUrl: this.baseUrl,
            auth: {},
            path: "/v1/runs/assist",
            body: input,
            onEvent,
        });
    }
    async startDetachedRun(input) {
        return requestJson({
            baseUrl: this.baseUrl,
            auth: {},
            path: "/v1/runs/assist",
            method: "POST",
            body: {
                ...input,
                detach: true,
            },
        });
    }
    async listRuns(limit = 20) {
        return requestJson({
            baseUrl: this.baseUrl,
            auth: {},
            path: `/v1/runs?limit=${encodeURIComponent(String(limit))}`,
            method: "GET",
        });
    }
    async getRun(runId) {
        return requestJson({
            baseUrl: this.baseUrl,
            auth: {},
            path: `/v1/runs/${encodeURIComponent(runId)}`,
            method: "GET",
        });
    }
    async getRunEvents(runId, after = 0) {
        return requestJson({
            baseUrl: this.baseUrl,
            auth: {},
            path: `/v1/runs/${encodeURIComponent(runId)}/events?after=${encodeURIComponent(String(after))}`,
            method: "GET",
        });
    }
    async controlRun(runId, action, note) {
        return requestJson({
            baseUrl: this.baseUrl,
            auth: {},
            path: `/v1/runs/${encodeURIComponent(runId)}/control`,
            method: "POST",
            body: note ? { action, note } : { action },
        });
    }
    async exportRun(runId) {
        return requestJson({
            baseUrl: this.baseUrl,
            auth: {},
            path: `/v1/runs/${encodeURIComponent(runId)}/export`,
            method: "GET",
        });
    }
}

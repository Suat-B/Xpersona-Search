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
    async listConnections() {
        return requestJson({
            baseUrl: this.baseUrl,
            auth: {},
            path: "/v1/connections",
            method: "GET",
        });
    }
    async saveConnection(input) {
        return requestJson({
            baseUrl: this.baseUrl,
            auth: {},
            path: "/v1/connections",
            method: "POST",
            body: input,
        });
    }
    async testConnection(id) {
        return requestJson({
            baseUrl: this.baseUrl,
            auth: {},
            path: `/v1/connections/${encodeURIComponent(id)}/test`,
            method: "POST",
        });
    }
    async enableConnection(id) {
        return requestJson({
            baseUrl: this.baseUrl,
            auth: {},
            path: `/v1/connections/${encodeURIComponent(id)}/enable`,
            method: "POST",
        });
    }
    async disableConnection(id) {
        return requestJson({
            baseUrl: this.baseUrl,
            auth: {},
            path: `/v1/connections/${encodeURIComponent(id)}/disable`,
            method: "POST",
        });
    }
    async removeConnection(id) {
        return requestJson({
            baseUrl: this.baseUrl,
            auth: {},
            path: `/v1/connections/${encodeURIComponent(id)}`,
            method: "DELETE",
        });
    }
    async importConnections(raw, importedFrom) {
        return requestJson({
            baseUrl: this.baseUrl,
            auth: {},
            path: "/v1/connections/import",
            method: "POST",
            body: importedFrom ? { raw, importedFrom } : { raw },
        });
    }
    async listProviderCatalog() {
        return requestJson({
            baseUrl: this.baseUrl,
            auth: {},
            path: "/v1/providers/catalog",
            method: "GET",
        });
    }
    async listProviders() {
        return requestJson({
            baseUrl: this.baseUrl,
            auth: {},
            path: "/v1/providers",
            method: "GET",
        });
    }
    async connectProviderApiKey(input) {
        return requestJson({
            baseUrl: this.baseUrl,
            auth: {},
            path: "/v1/providers/connect/api-key",
            method: "POST",
            body: input,
        });
    }
    async openProviderBrowser(providerId) {
        return requestJson({
            baseUrl: this.baseUrl,
            auth: {},
            path: "/v1/providers/connect/open-browser",
            method: "POST",
            body: { providerId },
        });
    }
    async importProviderLocalAuth(input) {
        return requestJson({
            baseUrl: this.baseUrl,
            auth: {},
            path: "/v1/providers/connect/import-local",
            method: "POST",
            body: input,
        });
    }
    async startProviderBrowserSession(input) {
        return requestJson({
            baseUrl: this.baseUrl,
            auth: {},
            path: "/v1/providers/connect/browser/start",
            method: "POST",
            body: input,
        });
    }
    async pollProviderBrowserSession(sessionId) {
        return requestJson({
            baseUrl: this.baseUrl,
            auth: {},
            path: "/v1/providers/connect/browser/poll",
            method: "POST",
            body: { sessionId },
        });
    }
    async startProviderOAuth(input) {
        return requestJson({
            baseUrl: this.baseUrl,
            auth: {},
            path: "/v1/providers/connect/oauth/start",
            method: "POST",
            body: input,
        });
    }
    async pollProviderOAuth(sessionId) {
        return requestJson({
            baseUrl: this.baseUrl,
            auth: {},
            path: "/v1/providers/connect/oauth/poll",
            method: "POST",
            body: { sessionId },
        });
    }
    async testProvider(providerId) {
        return requestJson({
            baseUrl: this.baseUrl,
            auth: {},
            path: `/v1/providers/${encodeURIComponent(providerId)}/test`,
            method: "POST",
        });
    }
    async refreshProvider(providerId) {
        return requestJson({
            baseUrl: this.baseUrl,
            auth: {},
            path: `/v1/providers/${encodeURIComponent(providerId)}/refresh`,
            method: "POST",
        });
    }
    async setDefaultProvider(providerId) {
        return requestJson({
            baseUrl: this.baseUrl,
            auth: {},
            path: `/v1/providers/${encodeURIComponent(providerId)}/default`,
            method: "POST",
        });
    }
    async disconnectProvider(providerId) {
        return requestJson({
            baseUrl: this.baseUrl,
            auth: {},
            path: `/v1/providers/${encodeURIComponent(providerId)}`,
            method: "DELETE",
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
    async streamRun(runId, onEvent, after = 0) {
        await requestSse({
            baseUrl: this.baseUrl,
            auth: {},
            path: `/v1/runs/${encodeURIComponent(runId)}/stream?after=${encodeURIComponent(String(after))}`,
            method: "GET",
            onEvent,
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
    async createAgentProbeSession(input) {
        return requestJson({
            baseUrl: this.baseUrl,
            auth: {},
            path: "/v1/debug/agent-sessions",
            method: "POST",
            body: input,
        });
    }
    async getAgentProbeSession(id) {
        return requestJson({
            baseUrl: this.baseUrl,
            auth: {},
            path: `/v1/debug/agent-sessions/${encodeURIComponent(id)}`,
            method: "GET",
        });
    }
    async submitAgentProbeMessage(id, input) {
        return requestJson({
            baseUrl: this.baseUrl,
            auth: {},
            path: `/v1/debug/agent-sessions/${encodeURIComponent(id)}/messages`,
            method: "POST",
            body: input,
        });
    }
    async getAgentProbeEvents(id, after = 0) {
        return requestJson({
            baseUrl: this.baseUrl,
            auth: {},
            path: `/v1/debug/agent-sessions/${encodeURIComponent(id)}/events?after=${encodeURIComponent(String(after))}`,
            method: "GET",
        });
    }
    async controlAgentProbeSession(id, action) {
        return requestJson({
            baseUrl: this.baseUrl,
            auth: {},
            path: `/v1/debug/agent-sessions/${encodeURIComponent(id)}/control`,
            method: "POST",
            body: { action },
        });
    }
    async createAgentJob(input) {
        return requestJson({
            baseUrl: this.baseUrl,
            auth: {},
            path: "/v1/agents/jobs",
            method: "POST",
            body: input,
        });
    }
    async listAgentJobs(limit = 20) {
        return requestJson({
            baseUrl: this.baseUrl,
            auth: {},
            path: `/v1/agents/jobs?limit=${encodeURIComponent(String(limit))}`,
            method: "GET",
        });
    }
    async getAgentJob(id) {
        return requestJson({
            baseUrl: this.baseUrl,
            auth: {},
            path: `/v1/agents/jobs/${encodeURIComponent(id)}`,
            method: "GET",
        });
    }
    async getAgentJobEvents(id, after = 0) {
        return requestJson({
            baseUrl: this.baseUrl,
            auth: {},
            path: `/v1/agents/jobs/${encodeURIComponent(id)}/events?after=${encodeURIComponent(String(after))}`,
            method: "GET",
        });
    }
    async streamAgentJob(id, onEvent, after = 0) {
        await requestSse({
            baseUrl: this.baseUrl,
            auth: {},
            path: `/v1/agents/jobs/${encodeURIComponent(id)}/stream?after=${encodeURIComponent(String(after))}`,
            method: "GET",
            onEvent,
        });
    }
    async controlAgentJob(id, action, note) {
        return requestJson({
            baseUrl: this.baseUrl,
            auth: {},
            path: `/v1/agents/jobs/${encodeURIComponent(id)}/control`,
            method: "POST",
            body: note ? { action, note } : { action },
        });
    }
    async getRemoteAgentHealth() {
        return requestJson({
            baseUrl: this.baseUrl,
            auth: {},
            path: "/v1/agents/remote/health",
            method: "GET",
        });
    }
    async listAutomations() {
        return requestJson({
            baseUrl: this.baseUrl,
            auth: {},
            path: "/v1/automations",
            method: "GET",
        });
    }
    async saveAutomation(input) {
        return requestJson({
            baseUrl: this.baseUrl,
            auth: {},
            path: "/v1/automations",
            method: "POST",
            body: input,
        });
    }
    async getAutomation(id) {
        return requestJson({
            baseUrl: this.baseUrl,
            auth: {},
            path: `/v1/automations/${encodeURIComponent(id)}`,
            method: "GET",
        });
    }
    async updateAutomation(id, patch) {
        return requestJson({
            baseUrl: this.baseUrl,
            auth: {},
            path: `/v1/automations/${encodeURIComponent(id)}`,
            method: "PATCH",
            body: patch,
        });
    }
    async controlAutomation(id, action) {
        return requestJson({
            baseUrl: this.baseUrl,
            auth: {},
            path: `/v1/automations/${encodeURIComponent(id)}/control`,
            method: "POST",
            body: { action },
        });
    }
    async runAutomation(id) {
        return requestJson({
            baseUrl: this.baseUrl,
            auth: {},
            path: `/v1/automations/${encodeURIComponent(id)}/run`,
            method: "POST",
            body: {},
        });
    }
    async getAutomationEvents(id, after = 0) {
        return requestJson({
            baseUrl: this.baseUrl,
            auth: {},
            path: `/v1/automations/${encodeURIComponent(id)}/events?after=${encodeURIComponent(String(after))}`,
            method: "GET",
        });
    }
    async streamAutomationEvents(id, onEvent, after = 0) {
        await requestSse({
            baseUrl: this.baseUrl,
            auth: {},
            path: `/v1/automations/${encodeURIComponent(id)}/stream?after=${encodeURIComponent(String(after))}`,
            method: "GET",
            onEvent,
        });
    }
    async listWebhookSubscriptions() {
        return requestJson({
            baseUrl: this.baseUrl,
            auth: {},
            path: "/v1/webhooks/subscriptions",
            method: "GET",
        });
    }
    async saveWebhookSubscription(input) {
        return requestJson({
            baseUrl: this.baseUrl,
            auth: {},
            path: "/v1/webhooks/subscriptions",
            method: "POST",
            body: input,
        });
    }
}

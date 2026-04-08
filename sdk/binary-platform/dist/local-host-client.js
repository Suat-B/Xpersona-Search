import { requestJson, requestSse } from "./http.js";
export class BinaryLocalHostClient {
    baseUrl;
    constructor(baseUrl = process.env.BINARY_IDE_LOCAL_HOST_URL || "http://127.0.0.1:7777") {
        this.baseUrl = baseUrl.replace(/\/+$/, "");
    }
    get url() {
        return this.baseUrl;
    }
    async health() {
        return requestJson({
            url: `${this.baseUrl}/v1/healthz`,
            method: "GET",
        });
    }
    async authStatus() {
        return requestJson({
            url: `${this.baseUrl}/v1/auth/status`,
            method: "GET",
        });
    }
    async setApiKey(apiKey) {
        return requestJson({
            url: `${this.baseUrl}/v1/auth/api-key`,
            method: "POST",
            body: { apiKey },
        });
    }
    async clearApiKey() {
        return requestJson({
            url: `${this.baseUrl}/v1/auth/api-key`,
            method: "DELETE",
        });
    }
    async preferences() {
        return requestJson({
            url: `${this.baseUrl}/v1/preferences`,
            method: "GET",
        });
    }
    async orchestrationPolicy() {
        return requestJson({
            url: `${this.baseUrl}/v1/orchestration/policy`,
            method: "GET",
        });
    }
    async updateOrchestrationPolicy(patch) {
        return requestJson({
            url: `${this.baseUrl}/v1/orchestration/policy`,
            method: "PATCH",
            body: patch,
        });
    }
    async updatePreferences(patch) {
        return requestJson({
            url: `${this.baseUrl}/v1/preferences`,
            method: "POST",
            body: patch,
        });
    }
    async trustWorkspace(input) {
        return requestJson({
            url: `${this.baseUrl}/v1/workspaces/trust`,
            method: "POST",
            body: input,
        });
    }
    async assistStream(input, onEvent) {
        await requestSse({
            url: `${this.baseUrl}/v1/runs/assist`,
            method: "POST",
            body: input,
            onEvent,
        });
    }
    async startDetachedRun(input) {
        return requestJson({
            url: `${this.baseUrl}/v1/runs/assist`,
            method: "POST",
            body: {
                ...input,
                detach: true,
            },
        });
    }
    async listRuns(limit = 20) {
        return requestJson({
            url: `${this.baseUrl}/v1/runs?limit=${encodeURIComponent(String(limit))}`,
            method: "GET",
        });
    }
    async getRun(runId) {
        return requestJson({
            url: `${this.baseUrl}/v1/runs/${encodeURIComponent(runId)}`,
            method: "GET",
        });
    }
    async getRunEvents(runId, after = 0) {
        return requestJson({
            url: `${this.baseUrl}/v1/runs/${encodeURIComponent(runId)}/events?after=${encodeURIComponent(String(after))}`,
            method: "GET",
        });
    }
    async streamRun(runId, onEvent, after = 0) {
        await requestSse({
            url: `${this.baseUrl}/v1/runs/${encodeURIComponent(runId)}/stream?after=${encodeURIComponent(String(after))}`,
            method: "GET",
            onEvent,
        });
    }
    async controlRun(runId, action, note) {
        return requestJson({
            url: `${this.baseUrl}/v1/runs/${encodeURIComponent(runId)}/control`,
            method: "POST",
            body: note ? { action, note } : { action },
        });
    }
    async exportRun(runId) {
        return requestJson({
            url: `${this.baseUrl}/v1/runs/${encodeURIComponent(runId)}/export`,
            method: "GET",
        });
    }
    async createAgentProbeSession(input) {
        return requestJson({
            url: `${this.baseUrl}/v1/debug/agent-sessions`,
            method: "POST",
            body: input,
        });
    }
    async getAgentProbeSession(sessionId) {
        return requestJson({
            url: `${this.baseUrl}/v1/debug/agent-sessions/${encodeURIComponent(sessionId)}`,
            method: "GET",
        });
    }
    async submitAgentProbeMessage(sessionId, input) {
        return requestJson({
            url: `${this.baseUrl}/v1/debug/agent-sessions/${encodeURIComponent(sessionId)}/messages`,
            method: "POST",
            body: input,
        });
    }
    async getAgentProbeEvents(sessionId, after = 0) {
        return requestJson({
            url: `${this.baseUrl}/v1/debug/agent-sessions/${encodeURIComponent(sessionId)}/events?after=${encodeURIComponent(String(after))}`,
            method: "GET",
        });
    }
    async controlAgentProbeSession(sessionId, action) {
        return requestJson({
            url: `${this.baseUrl}/v1/debug/agent-sessions/${encodeURIComponent(sessionId)}/control`,
            method: "POST",
            body: { action },
        });
    }
    async createAgentJob(input) {
        return requestJson({
            url: `${this.baseUrl}/v1/agents/jobs`,
            method: "POST",
            body: input,
        });
    }
    async listAgentJobs(limit = 20) {
        return requestJson({
            url: `${this.baseUrl}/v1/agents/jobs?limit=${encodeURIComponent(String(limit))}`,
            method: "GET",
        });
    }
    async getAgentJob(jobId) {
        return requestJson({
            url: `${this.baseUrl}/v1/agents/jobs/${encodeURIComponent(jobId)}`,
            method: "GET",
        });
    }
    async getAgentJobEvents(jobId, after = 0) {
        return requestJson({
            url: `${this.baseUrl}/v1/agents/jobs/${encodeURIComponent(jobId)}/events?after=${encodeURIComponent(String(after))}`,
            method: "GET",
        });
    }
    async controlAgentJob(jobId, action, note) {
        return requestJson({
            url: `${this.baseUrl}/v1/agents/jobs/${encodeURIComponent(jobId)}/control`,
            method: "POST",
            body: note ? { action, note } : { action },
        });
    }
    async remoteAgentHealth() {
        return requestJson({
            url: `${this.baseUrl}/v1/agents/remote/health`,
            method: "GET",
        });
    }
    async listAutomations() {
        return requestJson({
            url: `${this.baseUrl}/v1/automations`,
            method: "GET",
        });
    }
    async saveAutomation(input) {
        return requestJson({
            url: `${this.baseUrl}/v1/automations`,
            method: "POST",
            body: input,
        });
    }
    async getAutomation(automationId) {
        return requestJson({
            url: `${this.baseUrl}/v1/automations/${encodeURIComponent(automationId)}`,
            method: "GET",
        });
    }
    async updateAutomation(automationId, patch) {
        return requestJson({
            url: `${this.baseUrl}/v1/automations/${encodeURIComponent(automationId)}`,
            method: "PATCH",
            body: patch,
        });
    }
    async controlAutomation(automationId, action) {
        return requestJson({
            url: `${this.baseUrl}/v1/automations/${encodeURIComponent(automationId)}/control`,
            method: "POST",
            body: { action },
        });
    }
    async runAutomation(automationId) {
        return requestJson({
            url: `${this.baseUrl}/v1/automations/${encodeURIComponent(automationId)}/run`,
            method: "POST",
            body: {},
        });
    }
    async getAutomationEvents(automationId, after = 0) {
        return requestJson({
            url: `${this.baseUrl}/v1/automations/${encodeURIComponent(automationId)}/events?after=${encodeURIComponent(String(after))}`,
            method: "GET",
        });
    }
    async streamAutomationEvents(automationId, onEvent, after = 0) {
        await requestSse({
            url: `${this.baseUrl}/v1/automations/${encodeURIComponent(automationId)}/stream?after=${encodeURIComponent(String(after))}`,
            method: "GET",
            onEvent,
        });
    }
    async listWebhookSubscriptions() {
        return requestJson({
            url: `${this.baseUrl}/v1/webhooks/subscriptions`,
            method: "GET",
        });
    }
    async saveWebhookSubscription(input) {
        return requestJson({
            url: `${this.baseUrl}/v1/webhooks/subscriptions`,
            method: "POST",
            body: input,
        });
    }
}

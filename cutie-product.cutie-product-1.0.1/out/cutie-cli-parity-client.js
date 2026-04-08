"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.CutieCliParityClient = void 0;
const vscode_core_1 = require("@xpersona/vscode-core");
const config_1 = require("./config");
function hostBaseUrl() {
    return String(process.env.BINARY_IDE_LOCAL_HOST_URL || "http://127.0.0.1:7777").trim().replace(/\/+$/, "");
}
function apiBaseUrl() {
    return (0, config_1.getBaseApiUrl)().replace(/\/+$/, "");
}
async function requestHost(method, path, body) {
    return (0, vscode_core_1.requestJson)(method, `${hostBaseUrl()}${path}`, undefined, body);
}
async function requestHosted(method, path, auth, body) {
    return (0, vscode_core_1.requestJson)(method, `${apiBaseUrl()}${path}`, auth, body);
}
async function parseSseStream(response, onEvent) {
    if (!response.body)
        throw new Error("Binary Host returned no stream body.");
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    while (true) {
        const { value, done } = await reader.read();
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
            let eventName = "";
            const dataLines = [];
            for (const line of raw.split(/\r?\n/)) {
                if (line.startsWith("event:"))
                    eventName = line.slice(6).trim();
                if (line.startsWith("data:"))
                    dataLines.push(line.slice(5).trimStart());
            }
            const payload = dataLines.join("\n");
            if (!payload)
                continue;
            let parsed = {};
            try {
                parsed = JSON.parse(payload);
            }
            catch {
                parsed = { data: payload };
            }
            if (!parsed.event && eventName)
                parsed.event = eventName;
            await onEvent(parsed);
        }
    }
}
class CutieCliParityClient {
    async checkHostHealth() {
        try {
            return await requestHost("GET", "/v1/healthz");
        }
        catch {
            return null;
        }
    }
    async assistStream(input, onEvent, signal) {
        const response = await fetch(`${hostBaseUrl()}/v1/runs/assist`, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                Accept: "text/event-stream",
            },
            signal,
            body: JSON.stringify(input),
        });
        if (!response.ok) {
            const raw = await response.text().catch(() => "");
            throw new Error(raw || `Binary Host assist failed with HTTP ${response.status}.`);
        }
        await parseSseStream(response, onEvent);
    }
    async authStatus() {
        return requestHost("GET", "/v1/auth/status");
    }
    async preferences() {
        return requestHost("GET", "/v1/preferences");
    }
    async listConnections() {
        return requestHost("GET", "/v1/connections");
    }
    async saveConnection(input) {
        return requestHost("POST", "/v1/connections", input);
    }
    async importConnections(raw, importedFrom) {
        return requestHost("POST", "/v1/connections/import", importedFrom ? { raw, importedFrom } : { raw });
    }
    async testConnection(id) {
        return requestHost("POST", `/v1/connections/${encodeURIComponent(id)}/test`);
    }
    async enableConnection(id) {
        return requestHost("POST", `/v1/connections/${encodeURIComponent(id)}/enable`);
    }
    async disableConnection(id) {
        return requestHost("POST", `/v1/connections/${encodeURIComponent(id)}/disable`);
    }
    async removeConnection(id) {
        return requestHost("DELETE", `/v1/connections/${encodeURIComponent(id)}`);
    }
    async listProviderCatalog() {
        return requestHost("GET", "/v1/providers/catalog");
    }
    async listProviders() {
        return requestHost("GET", "/v1/providers");
    }
    async openProviderBrowser(providerId) {
        return requestHost("POST", "/v1/providers/connect/open-browser", { providerId });
    }
    async importProviderLocalAuth(input) {
        return requestHost("POST", "/v1/providers/connect/import-local", input);
    }
    async startProviderBrowserSession(input) {
        return requestHost("POST", "/v1/providers/connect/browser/start", input);
    }
    async pollProviderBrowserSession(sessionId) {
        return requestHost("POST", "/v1/providers/connect/browser/poll", { sessionId });
    }
    async startProviderOAuth(input) {
        return requestHost("POST", "/v1/providers/connect/oauth/start", input);
    }
    async pollProviderOAuth(sessionId) {
        return requestHost("POST", "/v1/providers/connect/oauth/poll", { sessionId });
    }
    async testProvider(providerId) {
        return requestHost("POST", `/v1/providers/${encodeURIComponent(providerId)}/test`);
    }
    async refreshProvider(providerId) {
        return requestHost("POST", `/v1/providers/${encodeURIComponent(providerId)}/refresh`);
    }
    async setDefaultProvider(providerId) {
        return requestHost("POST", `/v1/providers/${encodeURIComponent(providerId)}/default`);
    }
    async disconnectProvider(providerId) {
        return requestHost("DELETE", `/v1/providers/${encodeURIComponent(providerId)}`);
    }
    async listRuns(limit = 20) {
        return requestHost("GET", `/v1/runs?limit=${encodeURIComponent(String(limit))}`);
    }
    async getRun(id) {
        return requestHost("GET", `/v1/runs/${encodeURIComponent(id)}`);
    }
    async getRunEvents(id, after = 0) {
        return requestHost("GET", `/v1/runs/${encodeURIComponent(id)}/events?after=${encodeURIComponent(String(after))}`);
    }
    async controlRun(id, action) {
        return requestHost("POST", `/v1/runs/${encodeURIComponent(id)}/control`, { action });
    }
    async exportRun(id) {
        return requestHost("GET", `/v1/runs/${encodeURIComponent(id)}/export`);
    }
    async createAgentJob(input) {
        return requestHost("POST", "/v1/agents/jobs", input);
    }
    async listAgentJobs(limit = 20) {
        return requestHost("GET", `/v1/agents/jobs?limit=${encodeURIComponent(String(limit))}`);
    }
    async getAgentJob(id) {
        return requestHost("GET", `/v1/agents/jobs/${encodeURIComponent(id)}`);
    }
    async getAgentJobEvents(id, after = 0) {
        return requestHost("GET", `/v1/agents/jobs/${encodeURIComponent(id)}/events?after=${encodeURIComponent(String(after))}`);
    }
    async controlAgentJob(id, action) {
        return requestHost("POST", `/v1/agents/jobs/${encodeURIComponent(id)}/control`, { action });
    }
    async getRemoteAgentHealth() {
        return requestHost("GET", "/v1/agents/remote/health");
    }
    async listAutomations() {
        return requestHost("GET", "/v1/automations");
    }
    async saveAutomation(input) {
        return requestHost("POST", "/v1/automations", input);
    }
    async getAutomation(id) {
        return requestHost("GET", `/v1/automations/${encodeURIComponent(id)}`);
    }
    async controlAutomation(id, action) {
        return requestHost("POST", `/v1/automations/${encodeURIComponent(id)}/control`, { action });
    }
    async runAutomation(id) {
        return requestHost("POST", `/v1/automations/${encodeURIComponent(id)}/run`, {});
    }
    async getAutomationEvents(id, after = 0) {
        return requestHost("GET", `/v1/automations/${encodeURIComponent(id)}/events?after=${encodeURIComponent(String(after))}`);
    }
    async createAgentProbeSession(input) {
        return requestHost("POST", "/v1/debug/agent-sessions", input);
    }
    async getAgentProbeSession(id) {
        return requestHost("GET", `/v1/debug/agent-sessions/${encodeURIComponent(id)}`);
    }
    async submitAgentProbeMessage(id, message) {
        return requestHost("POST", `/v1/debug/agent-sessions/${encodeURIComponent(id)}/messages`, { message });
    }
    async getAgentProbeEvents(id, after = 0) {
        return requestHost("GET", `/v1/debug/agent-sessions/${encodeURIComponent(id)}/events?after=${encodeURIComponent(String(after))}`);
    }
    async listSessions(auth, limit = 20) {
        return requestHosted("GET", `/api/v1/playground/sessions?limit=${encodeURIComponent(String(limit))}`, auth);
    }
    async getSessionMessages(auth, sessionId, includeAgentEvents = true) {
        return requestHosted("GET", `/api/v1/playground/sessions/${encodeURIComponent(sessionId)}/messages?includeAgentEvents=${includeAgentEvents ? "true" : "false"}`, auth);
    }
    async usage(auth) {
        return requestHosted("GET", "/api/v1/me/playground-usage", auth);
    }
    async checkout(auth, tier, billing) {
        return requestHosted("POST", "/api/v1/playground/checkout-link", auth, { tier, billing });
    }
    async replay(auth, sessionId, workspaceFingerprint, mode) {
        return requestHosted("POST", "/api/v1/playground/replay", auth, {
            sessionId,
            workspaceFingerprint,
            mode,
        });
    }
    async execute(auth, sessionId, workspaceFingerprint, actions) {
        return requestHosted("POST", "/api/v1/playground/execute", auth, {
            sessionId,
            workspaceFingerprint,
            actions,
        });
    }
    async indexUpsert(auth, input) {
        return requestHosted("POST", "/api/v1/playground/index/upsert", auth, input);
    }
    async indexQuery(auth, input) {
        return requestHosted("POST", "/api/v1/playground/index/query", auth, input);
    }
}
exports.CutieCliParityClient = CutieCliParityClient;
//# sourceMappingURL=cutie-cli-parity-client.js.map
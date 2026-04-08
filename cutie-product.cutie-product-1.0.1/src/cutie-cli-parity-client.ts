import { requestJson, type RequestAuth } from "@xpersona/vscode-core";
import { getBaseApiUrl } from "./config";

type RequestMethod = "GET" | "POST" | "PATCH" | "DELETE";

type JsonMap = Record<string, unknown>;

type HostAssistSseEvent = {
  event?: string;
  data?: unknown;
  [key: string]: unknown;
};

function hostBaseUrl(): string {
  return String(process.env.BINARY_IDE_LOCAL_HOST_URL || "http://127.0.0.1:7777").trim().replace(/\/+$/, "");
}

function apiBaseUrl(): string {
  return getBaseApiUrl().replace(/\/+$/, "");
}

async function requestHost<T = unknown>(method: RequestMethod, path: string, body?: unknown): Promise<T> {
  return requestJson<T>(method, `${hostBaseUrl()}${path}`, undefined, body);
}

async function requestHosted<T = unknown>(method: RequestMethod, path: string, auth: RequestAuth, body?: unknown): Promise<T> {
  return requestJson<T>(method, `${apiBaseUrl()}${path}`, auth, body);
}

async function parseSseStream(
  response: Response,
  onEvent: (event: HostAssistSseEvent) => void | Promise<void>
): Promise<void> {
  if (!response.body) throw new Error("Binary Host returned no stream body.");
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    while (true) {
      const boundary = buffer.indexOf("\n\n");
      if (boundary < 0) break;
      const raw = buffer.slice(0, boundary).trim();
      buffer = buffer.slice(boundary + 2);
      if (!raw) continue;
      let eventName = "";
      const dataLines: string[] = [];
      for (const line of raw.split(/\r?\n/)) {
        if (line.startsWith("event:")) eventName = line.slice(6).trim();
        if (line.startsWith("data:")) dataLines.push(line.slice(5).trimStart());
      }
      const payload = dataLines.join("\n");
      if (!payload) continue;
      let parsed: HostAssistSseEvent = {};
      try {
        parsed = JSON.parse(payload) as HostAssistSseEvent;
      } catch {
        parsed = { data: payload };
      }
      if (!parsed.event && eventName) parsed.event = eventName;
      await onEvent(parsed);
    }
  }
}

export class CutieCliParityClient {
  async checkHostHealth(): Promise<unknown | null> {
    try {
      return await requestHost("GET", "/v1/healthz");
    } catch {
      return null;
    }
  }

  async assistStream(
    input: JsonMap,
    onEvent: (event: HostAssistSseEvent) => void | Promise<void>,
    signal?: AbortSignal
  ): Promise<void> {
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

  async authStatus(): Promise<unknown> {
    return requestHost("GET", "/v1/auth/status");
  }

  async preferences(): Promise<unknown> {
    return requestHost("GET", "/v1/preferences");
  }

  async listConnections(): Promise<unknown> {
    return requestHost("GET", "/v1/connections");
  }

  async saveConnection(input: JsonMap): Promise<unknown> {
    return requestHost("POST", "/v1/connections", input);
  }

  async importConnections(raw: string, importedFrom?: string): Promise<unknown> {
    return requestHost("POST", "/v1/connections/import", importedFrom ? { raw, importedFrom } : { raw });
  }

  async testConnection(id: string): Promise<unknown> {
    return requestHost("POST", `/v1/connections/${encodeURIComponent(id)}/test`);
  }

  async enableConnection(id: string): Promise<unknown> {
    return requestHost("POST", `/v1/connections/${encodeURIComponent(id)}/enable`);
  }

  async disableConnection(id: string): Promise<unknown> {
    return requestHost("POST", `/v1/connections/${encodeURIComponent(id)}/disable`);
  }

  async removeConnection(id: string): Promise<unknown> {
    return requestHost("DELETE", `/v1/connections/${encodeURIComponent(id)}`);
  }

  async listProviderCatalog(): Promise<unknown> {
    return requestHost("GET", "/v1/providers/catalog");
  }

  async listProviders(): Promise<unknown> {
    return requestHost("GET", "/v1/providers");
  }

  async openProviderBrowser(providerId: string): Promise<unknown> {
    return requestHost("POST", "/v1/providers/connect/open-browser", { providerId });
  }

  async importProviderLocalAuth(input: JsonMap): Promise<unknown> {
    return requestHost("POST", "/v1/providers/connect/import-local", input);
  }

  async startProviderBrowserSession(input: JsonMap): Promise<unknown> {
    return requestHost("POST", "/v1/providers/connect/browser/start", input);
  }

  async pollProviderBrowserSession(sessionId: string): Promise<unknown> {
    return requestHost("POST", "/v1/providers/connect/browser/poll", { sessionId });
  }

  async startProviderOAuth(input: JsonMap): Promise<unknown> {
    return requestHost("POST", "/v1/providers/connect/oauth/start", input);
  }

  async pollProviderOAuth(sessionId: string): Promise<unknown> {
    return requestHost("POST", "/v1/providers/connect/oauth/poll", { sessionId });
  }

  async testProvider(providerId: string): Promise<unknown> {
    return requestHost("POST", `/v1/providers/${encodeURIComponent(providerId)}/test`);
  }

  async refreshProvider(providerId: string): Promise<unknown> {
    return requestHost("POST", `/v1/providers/${encodeURIComponent(providerId)}/refresh`);
  }

  async setDefaultProvider(providerId: string): Promise<unknown> {
    return requestHost("POST", `/v1/providers/${encodeURIComponent(providerId)}/default`);
  }

  async disconnectProvider(providerId: string): Promise<unknown> {
    return requestHost("DELETE", `/v1/providers/${encodeURIComponent(providerId)}`);
  }

  async listRuns(limit = 20): Promise<unknown> {
    return requestHost("GET", `/v1/runs?limit=${encodeURIComponent(String(limit))}`);
  }

  async getRun(id: string): Promise<unknown> {
    return requestHost("GET", `/v1/runs/${encodeURIComponent(id)}`);
  }

  async getRunEvents(id: string, after = 0): Promise<unknown> {
    return requestHost("GET", `/v1/runs/${encodeURIComponent(id)}/events?after=${encodeURIComponent(String(after))}`);
  }

  async controlRun(id: string, action: string): Promise<unknown> {
    return requestHost("POST", `/v1/runs/${encodeURIComponent(id)}/control`, { action });
  }

  async exportRun(id: string): Promise<unknown> {
    return requestHost("GET", `/v1/runs/${encodeURIComponent(id)}/export`);
  }

  async createAgentJob(input: JsonMap): Promise<unknown> {
    return requestHost("POST", "/v1/agents/jobs", input);
  }

  async listAgentJobs(limit = 20): Promise<unknown> {
    return requestHost("GET", `/v1/agents/jobs?limit=${encodeURIComponent(String(limit))}`);
  }

  async getAgentJob(id: string): Promise<unknown> {
    return requestHost("GET", `/v1/agents/jobs/${encodeURIComponent(id)}`);
  }

  async getAgentJobEvents(id: string, after = 0): Promise<unknown> {
    return requestHost("GET", `/v1/agents/jobs/${encodeURIComponent(id)}/events?after=${encodeURIComponent(String(after))}`);
  }

  async controlAgentJob(id: string, action: string): Promise<unknown> {
    return requestHost("POST", `/v1/agents/jobs/${encodeURIComponent(id)}/control`, { action });
  }

  async getRemoteAgentHealth(): Promise<unknown> {
    return requestHost("GET", "/v1/agents/remote/health");
  }

  async listAutomations(): Promise<unknown> {
    return requestHost("GET", "/v1/automations");
  }

  async saveAutomation(input: JsonMap): Promise<unknown> {
    return requestHost("POST", "/v1/automations", input);
  }

  async getAutomation(id: string): Promise<unknown> {
    return requestHost("GET", `/v1/automations/${encodeURIComponent(id)}`);
  }

  async controlAutomation(id: string, action: string): Promise<unknown> {
    return requestHost("POST", `/v1/automations/${encodeURIComponent(id)}/control`, { action });
  }

  async runAutomation(id: string): Promise<unknown> {
    return requestHost("POST", `/v1/automations/${encodeURIComponent(id)}/run`, {});
  }

  async getAutomationEvents(id: string, after = 0): Promise<unknown> {
    return requestHost("GET", `/v1/automations/${encodeURIComponent(id)}/events?after=${encodeURIComponent(String(after))}`);
  }

  async createAgentProbeSession(input: JsonMap): Promise<unknown> {
    return requestHost("POST", "/v1/debug/agent-sessions", input);
  }

  async getAgentProbeSession(id: string): Promise<unknown> {
    return requestHost("GET", `/v1/debug/agent-sessions/${encodeURIComponent(id)}`);
  }

  async submitAgentProbeMessage(id: string, message: string): Promise<unknown> {
    return requestHost("POST", `/v1/debug/agent-sessions/${encodeURIComponent(id)}/messages`, { message });
  }

  async getAgentProbeEvents(id: string, after = 0): Promise<unknown> {
    return requestHost("GET", `/v1/debug/agent-sessions/${encodeURIComponent(id)}/events?after=${encodeURIComponent(String(after))}`);
  }

  async listSessions(auth: RequestAuth, limit = 20): Promise<unknown> {
    return requestHosted("GET", `/api/v1/playground/sessions?limit=${encodeURIComponent(String(limit))}`, auth);
  }

  async getSessionMessages(auth: RequestAuth, sessionId: string, includeAgentEvents = true): Promise<unknown> {
    return requestHosted(
      "GET",
      `/api/v1/playground/sessions/${encodeURIComponent(sessionId)}/messages?includeAgentEvents=${includeAgentEvents ? "true" : "false"}`,
      auth
    );
  }

  async usage(auth: RequestAuth): Promise<unknown> {
    return requestHosted("GET", "/api/v1/me/playground-usage", auth);
  }

  async checkout(auth: RequestAuth, tier: "starter" | "builder" | "studio", billing: "monthly" | "yearly"): Promise<unknown> {
    return requestHosted("POST", "/api/v1/playground/checkout-link", auth, { tier, billing });
  }

  async replay(auth: RequestAuth, sessionId: string, workspaceFingerprint: string, mode: string): Promise<unknown> {
    return requestHosted("POST", "/api/v1/playground/replay", auth, {
      sessionId,
      workspaceFingerprint,
      mode,
    });
  }

  async execute(auth: RequestAuth, sessionId: string, workspaceFingerprint: string, actions: unknown[]): Promise<unknown> {
    return requestHosted("POST", "/api/v1/playground/execute", auth, {
      sessionId,
      workspaceFingerprint,
      actions,
    });
  }

  async indexUpsert(auth: RequestAuth, input: JsonMap): Promise<unknown> {
    return requestHosted("POST", "/api/v1/playground/index/upsert", auth, input);
  }

  async indexQuery(auth: RequestAuth, input: JsonMap): Promise<unknown> {
    return requestHosted("POST", "/api/v1/playground/index/query", auth, input);
  }
}

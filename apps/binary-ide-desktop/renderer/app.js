const host = {
  baseUrl: "http://127.0.0.1:7777",
};

const state = {
  runtimeInfo: null,
  preferences: null,
  auth: null,
  autonomy: null,
  apps: [],
  agents: [],
};

const el = {
  hostStatus: document.getElementById("hostStatus"),
  autonomyStatus: document.getElementById("autonomyStatus"),
  workspaceInput: document.getElementById("workspaceInput"),
  apiKeyInput: document.getElementById("apiKeyInput"),
  runtimeMeta: document.getElementById("runtimeMeta"),
  modeSelect: document.getElementById("modeSelect"),
  modelInput: document.getElementById("modelInput"),
  taskInput: document.getElementById("taskInput"),
  streamLog: document.getElementById("streamLog"),
  recentSessions: document.getElementById("recentSessions"),
  artifactHistory: document.getElementById("artifactHistory"),
  appLibrary: document.getElementById("appLibrary"),
  agentList: document.getElementById("agentList"),
  agentNameInput: document.getElementById("agentNameInput"),
  agentPromptInput: document.getElementById("agentPromptInput"),
  agentTrigger: document.getElementById("agentTrigger"),
  chooseWorkspace: document.getElementById("chooseWorkspace"),
  trustWorkspace: document.getElementById("trustWorkspace"),
  saveApiKey: document.getElementById("saveApiKey"),
  clearApiKey: document.getElementById("clearApiKey"),
  enableAutonomy: document.getElementById("enableAutonomy"),
  refreshApps: document.getElementById("refreshApps"),
  saveAgent: document.getElementById("saveAgent"),
  runTask: document.getElementById("runTask"),
  refreshState: document.getElementById("refreshState"),
};

function appendLog(line) {
  const previous = el.streamLog.textContent === "No run started yet." ? "" : el.streamLog.textContent;
  el.streamLog.textContent = `${previous}${previous ? "\n" : ""}${line}`;
  el.streamLog.scrollTop = el.streamLog.scrollHeight;
}

function escapeHtml(value) {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function renderHostStatus(ok, message, extra = "") {
  el.hostStatus.innerHTML = `
    <strong>${ok ? "Connected" : "Unavailable"}</strong>
    <span>${message}</span>
    ${extra ? `<small>${extra}</small>` : ""}
  `;
  el.hostStatus.dataset.state = ok ? "ok" : "warn";
}

function renderAutonomyStatus() {
  const enabled = Boolean(state.autonomy?.enabled);
  const appCount = Number(state.autonomy?.appCount || 0);
  el.autonomyStatus.innerHTML = `
    <strong>${enabled ? "Autonomy enabled" : "Autonomy disabled"}</strong>
    <span>${enabled ? "OpenHands can inspect and act through local desktop tools on this machine." : "Enable autonomy to let the orchestrator inspect apps and execute machine actions locally."}</span>
    <small>${appCount} discovered apps on ${state.autonomy?.platform || "this device"}</small>
  `;
  el.autonomyStatus.dataset.state = enabled ? "ok" : "warn";
  el.enableAutonomy.textContent = enabled ? "Autonomy enabled" : "Enable autonomy";
  el.enableAutonomy.disabled = enabled;
}

function renderList(container, items, renderItem) {
  if (!items.length) {
    container.className = "list empty";
    container.textContent = "Nothing here yet.";
    return;
  }
  container.className = "list";
  container.innerHTML = items.map(renderItem).join("");
}

function renderAppLibrary() {
  renderList(
    el.appLibrary,
    state.apps || [],
    (item) => `
      <article>
        <strong>${escapeHtml(item.name)}</strong>
        <span>${escapeHtml(item.source)}${item.installLocation ? ` • ${escapeHtml(item.installLocation)}` : ""}</span>
        <div class="row">
          <button data-app-query="${escapeHtml(item.name)}">Launch</button>
        </div>
      </article>
    `
  );
}

function renderAgents() {
  renderList(
    el.agentList,
    state.agents || [],
    (agent) => `
      <article>
        <strong>${escapeHtml(agent.name)}</strong>
        <span>${escapeHtml(agent.trigger)} • ${escapeHtml(agent.status)}${agent.lastRunAt ? ` • last run ${escapeHtml(agent.lastRunAt)}` : ""}</span>
        <small>${escapeHtml(agent.prompt)}</small>
        <div class="row">
          <button data-agent-run="${escapeHtml(agent.id)}">Run now</button>
        </div>
      </article>
    `
  );
}

async function requestJson(path, options = {}) {
  const response = await fetch(`${host.baseUrl}${path}`, {
    method: options.method || "GET",
    headers: {
      "Content-Type": "application/json",
      ...(options.headers || {}),
    },
    body: options.body ? JSON.stringify(options.body) : undefined,
  });

  const text = await response.text();
  let data = {};
  if (text) {
    try {
      data = JSON.parse(text);
    } catch {
      data = { message: text };
    }
  }
  if (!response.ok) {
    throw new Error(data.message || data.error || `Request failed (${response.status})`);
  }
  return data;
}

function renderRunMeta() {
  const autonomyText = state.autonomy?.enabled ? "autonomy on" : "autonomy off";
  const agentCount = Array.isArray(state.agents) ? state.agents.length : 0;
  el.runtimeMeta.textContent = `${state.runtimeInfo?.appVersion || "0.1.0"} • ${host.baseUrl} • ${autonomyText} • ${agentCount} background agent${agentCount === 1 ? "" : "s"}`;
}

async function hydrate(options = {}) {
  const runtimeInfo = await window.binaryDesktop.runtimeInfo();
  state.runtimeInfo = runtimeInfo;
  host.baseUrl = runtimeInfo.hostUrl || host.baseUrl;

  try {
    const [health, auth, preferences, autonomy, appsResponse, agentsResponse] = await Promise.all([
      requestJson("/v1/healthz"),
      requestJson("/v1/auth/status"),
      requestJson("/v1/preferences"),
      requestJson("/v1/autonomy/status"),
      requestJson(`/v1/autonomy/apps${options.refreshApps ? "?refresh=1" : ""}`),
      requestJson("/v1/autonomy/agents"),
    ]);
    state.auth = auth;
    state.preferences = preferences;
    state.autonomy = autonomy;
    state.apps = Array.isArray(appsResponse.apps) ? appsResponse.apps.slice(0, 24) : [];
    state.agents = Array.isArray(agentsResponse.agents) ? agentsResponse.agents : [];

    renderRunMeta();
    renderHostStatus(true, `Binary Host ${health.version}`, auth.maskedApiKey ? `API key: ${auth.maskedApiKey}` : "No API key stored");
    renderAutonomyStatus();
    renderAppLibrary();
    renderAgents();
    el.workspaceInput.value = preferences.trustedWorkspaces?.[0]?.path || "";

    renderList(
      el.recentSessions,
      preferences.recentSessions || [],
      (item) => `<article><strong>${escapeHtml(item.sessionId)}</strong><span>${escapeHtml(item.workspaceRoot || "Machine run")} • ${escapeHtml(item.updatedAt)}</span></article>`
    );
    renderList(
      el.artifactHistory,
      preferences.artifactHistory || [],
      (item) => `<article><strong>${escapeHtml(item.label)}</strong><span>${escapeHtml(item.createdAt)}</span>${item.url ? `<button data-url="${escapeHtml(item.url)}" class="linkish">Open</button>` : ""}</article>`
    );
  } catch (error) {
    renderHostStatus(false, error instanceof Error ? error.message : String(error), "Build and start services/binary-host to activate the desktop shell.");
  }
}

async function trustWorkspace() {
  const workspace = el.workspaceInput.value.trim();
  if (!workspace) {
    appendLog("[host] Choose a workspace before trusting it.");
    return;
  }
  await requestJson("/v1/workspaces/trust", {
    method: "POST",
    body: {
      path: workspace,
      mutate: true,
      commands: "allow",
      network: "allow",
      elevated: "allow",
    },
  });
  appendLog(`[host] Trusted ${workspace}`);
  await hydrate();
}

async function saveApiKey() {
  const apiKey = el.apiKeyInput.value.trim();
  if (!apiKey) {
    appendLog("[auth] API key is empty.");
    return;
  }
  const status = await requestJson("/v1/auth/api-key", {
    method: "POST",
    body: { apiKey },
  });
  appendLog(`[auth] Saved key ${status.maskedApiKey || ""}`);
  el.apiKeyInput.value = "";
  await hydrate();
}

async function clearApiKey() {
  await requestJson("/v1/auth/api-key", { method: "DELETE" });
  appendLog("[auth] Cleared local host API key.");
  await hydrate();
}

async function enableAutonomy() {
  await requestJson("/v1/autonomy/configure", {
    method: "POST",
    body: {
      enabled: true,
      allowAppLaunch: true,
      allowWholeMachineAccess: true,
      allowDesktopObservation: true,
      allowEventAgents: true,
      allowElevation: true,
      allowUrlOpen: true,
    },
  });
  appendLog("[autonomy] OpenHands-driven machine autonomy enabled.");
  await hydrate({ refreshApps: true });
}

async function launchDiscoveredApp(query) {
  const launched = await requestJson("/v1/autonomy/apps/launch", {
    method: "POST",
    body: { query },
  });
  appendLog(`[desktop_open_app] ${launched.summary}`);
}

async function saveAgent() {
  const name = el.agentNameInput.value.trim();
  const prompt = el.agentPromptInput.value.trim();
  if (!name || !prompt) {
    appendLog("[agents] Add both a name and a prompt before saving a background agent.");
    return;
  }
  const workspaceRoot = el.workspaceInput.value.trim() || undefined;
  const agent = await requestJson("/v1/autonomy/agents", {
    method: "POST",
    body: {
      name,
      prompt,
      trigger: el.agentTrigger.value,
      status: "active",
      workspaceRoot,
      model: el.modelInput.value.trim() || undefined,
    },
  });
  appendLog(`[agents] Saved background agent ${agent.name}.`);
  el.agentNameInput.value = "";
  el.agentPromptInput.value = "";
  await hydrate();
}

async function runAgent(agentId) {
  const result = await requestJson(`/v1/autonomy/agents/${encodeURIComponent(agentId)}/run`, {
    method: "POST",
    body: {
      mode: el.modeSelect.value,
      model: el.modelInput.value.trim() || undefined,
    },
  });
  appendLog(`[agents] Enqueued ${result.agent?.name || "background agent"} as run ${result.run?.id || "unknown"}.`);
  await hydrate();
}

function formatEvent(event) {
  const eventName = event.event || "event";
  if (eventName === "token" || eventName === "partial") return `[assistant] ${event.data}`;
  if (eventName === "final") return `[final] ${event.data}`;
  if (eventName === "tool_request") {
    return `[tool/request] ${event.data?.toolCall?.name || "tool"} ${event.data?.toolCall?.summary || ""}`.trim();
  }
  if (eventName === "tool_result") {
    return `[tool/result] ${event.data?.name || "tool"} • ${event.data?.summary || "completed"}`;
  }
  if (eventName === "meta") {
    const modelAlias = event.data?.modelAlias ? `model=${event.data.modelAlias}` : "";
    const orchestrator = event.data?.orchestrator ? `orchestrator=${event.data.orchestrator}` : "";
    const status = event.data?.progressState?.status ? `progress=${event.data.progressState.status}` : "";
    const pending = event.data?.pendingToolCall?.toolCall?.name ? `pending=${event.data.pendingToolCall.toolCall.name}` : "";
    return `[meta] ${[modelAlias, orchestrator, status, pending].filter(Boolean).join(" • ") || "run metadata updated"}`;
  }
  if (eventName === "host.status") return `[host] ${event.data?.message || event.data}`;
  if (eventName === "host.heartbeat") return `[heartbeat] ${event.data?.runId || "run active"}`;
  if (eventName === "run") return `[run] ${event.data?.runId || "run"} • ${event.data?.adapter || "adapter"}`;
  if (eventName === "status" || eventName === "activity") return `[${eventName}] ${event.data}`;
  return `[${eventName}] ${typeof event.data === "string" ? event.data : JSON.stringify(event.data)}`;
}

async function runTask() {
  const task = el.taskInput.value.trim();
  if (!task) {
    appendLog("[run] Enter a task first.");
    return;
  }
  const workspaceRoot = el.workspaceInput.value.trim() || undefined;
  el.streamLog.textContent = "";
  appendLog(`[run] Starting ${workspaceRoot ? "workspace" : "machine"} run...`);

  const response = await fetch(`${host.baseUrl}/v1/runs/assist`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      task,
      mode: el.modeSelect.value,
      model: el.modelInput.value.trim() || "Binary IDE",
      workspaceRoot,
      client: {
        surface: "desktop",
        version: state.runtimeInfo?.appVersion || "0.1.0",
      },
    }),
  });

  if (!response.ok || !response.body) {
    const errorText = await response.text();
    appendLog(`[error] ${errorText || `Request failed (${response.status})`}`);
    return;
  }

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

      let payload = "";
      for (const line of raw.split(/\r?\n/)) {
        if (line.startsWith("data:")) payload += line.slice(5).trimStart();
      }
      if (!payload || payload === "[DONE]") continue;

      try {
        appendLog(formatEvent(JSON.parse(payload)));
      } catch {
        appendLog(`[raw] ${payload}`);
      }
    }
  }

  await hydrate();
}

el.chooseWorkspace.addEventListener("click", async () => {
  const value = await window.binaryDesktop.chooseWorkspace();
  if (value) el.workspaceInput.value = value;
});

el.trustWorkspace.addEventListener("click", () => {
  void trustWorkspace();
});

el.saveApiKey.addEventListener("click", () => {
  void saveApiKey();
});

el.clearApiKey.addEventListener("click", () => {
  void clearApiKey();
});

el.enableAutonomy.addEventListener("click", () => {
  void enableAutonomy();
});

el.refreshApps.addEventListener("click", () => {
  void hydrate({ refreshApps: true });
});

el.saveAgent.addEventListener("click", () => {
  void saveAgent();
});

el.runTask.addEventListener("click", () => {
  void runTask();
});

el.refreshState.addEventListener("click", () => {
  void hydrate();
});

el.artifactHistory.addEventListener("click", (event) => {
  if (!(event.target instanceof HTMLElement)) return;
  const button = event.target.closest("[data-url]");
  if (!button) return;
  void window.binaryDesktop.openExternal(button.dataset.url);
});

el.appLibrary.addEventListener("click", (event) => {
  if (!(event.target instanceof HTMLElement)) return;
  const button = event.target.closest("[data-app-query]");
  if (!button) return;
  void launchDiscoveredApp(button.dataset.appQuery);
});

el.agentList.addEventListener("click", (event) => {
  if (!(event.target instanceof HTMLElement)) return;
  const button = event.target.closest("[data-agent-run]");
  if (!button) return;
  void runAgent(button.dataset.agentRun);
});

await hydrate();

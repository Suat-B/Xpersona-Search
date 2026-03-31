const host = {
  baseUrl: "http://127.0.0.1:7777",
};

const state = {
  runtimeInfo: null,
  preferences: null,
  auth: null,
};

const el = {
  hostStatus: document.getElementById("hostStatus"),
  workspaceInput: document.getElementById("workspaceInput"),
  apiKeyInput: document.getElementById("apiKeyInput"),
  runtimeMeta: document.getElementById("runtimeMeta"),
  modeSelect: document.getElementById("modeSelect"),
  modelInput: document.getElementById("modelInput"),
  taskInput: document.getElementById("taskInput"),
  streamLog: document.getElementById("streamLog"),
  recentSessions: document.getElementById("recentSessions"),
  artifactHistory: document.getElementById("artifactHistory"),
  chooseWorkspace: document.getElementById("chooseWorkspace"),
  trustWorkspace: document.getElementById("trustWorkspace"),
  saveApiKey: document.getElementById("saveApiKey"),
  clearApiKey: document.getElementById("clearApiKey"),
  runTask: document.getElementById("runTask"),
  refreshState: document.getElementById("refreshState"),
};

function appendLog(line) {
  const previous = el.streamLog.textContent === "No run started yet." ? "" : el.streamLog.textContent;
  el.streamLog.textContent = `${previous}${previous ? "\n" : ""}${line}`;
  el.streamLog.scrollTop = el.streamLog.scrollHeight;
}

function renderHostStatus(ok, message, extra = "") {
  el.hostStatus.innerHTML = `
    <strong>${ok ? "Connected" : "Unavailable"}</strong>
    <span>${message}</span>
    ${extra ? `<small>${extra}</small>` : ""}
  `;
  el.hostStatus.dataset.state = ok ? "ok" : "warn";
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

async function hydrate() {
  const runtimeInfo = await window.binaryDesktop.runtimeInfo();
  state.runtimeInfo = runtimeInfo;
  host.baseUrl = runtimeInfo.hostUrl || host.baseUrl;
  el.runtimeMeta.textContent = `${runtimeInfo.appVersion} • ${host.baseUrl}`;

  try {
    const health = await requestJson("/v1/healthz");
    const auth = await requestJson("/v1/auth/status");
    const preferences = await requestJson("/v1/preferences");
    state.auth = auth;
    state.preferences = preferences;

    renderHostStatus(true, `Binary Host ${health.version}`, auth.maskedApiKey ? `API key: ${auth.maskedApiKey}` : "No API key stored");
    el.workspaceInput.value = preferences.trustedWorkspaces?.[0]?.path || "";
    renderList(
      el.recentSessions,
      preferences.recentSessions || [],
      (item) => `<article><strong>${item.sessionId}</strong><span>${item.workspaceRoot || "No workspace"} • ${item.updatedAt}</span></article>`
    );
    renderList(
      el.artifactHistory,
      preferences.artifactHistory || [],
      (item) => `<article><strong>${item.label}</strong><span>${item.createdAt}</span>${item.url ? `<button data-url="${item.url}" class="linkish">Open</button>` : ""}</article>`
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

async function runTask() {
  const task = el.taskInput.value.trim();
  if (!task) {
    appendLog("[run] Enter a task first.");
    return;
  }
  const workspaceRoot = el.workspaceInput.value.trim() || undefined;
  el.streamLog.textContent = "";
  appendLog(`[run] Starting task in ${workspaceRoot || "no workspace"}...`);

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
        const event = JSON.parse(payload);
        const eventName = event.event || "event";
        if (eventName === "token" || eventName === "partial") {
          appendLog(`[assistant] ${event.data}`);
          continue;
        }
        if (eventName === "final") {
          appendLog(`[final] ${event.data}`);
          continue;
        }
        if (eventName === "tool_result") {
          appendLog(`[tool] ${event.data?.summary || event.data?.name || "tool finished"}`);
          continue;
        }
        appendLog(`[${eventName}] ${typeof event.data === "string" ? event.data : JSON.stringify(event.data)}`);
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

await hydrate();

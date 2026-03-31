const host = {
  baseUrl: "http://127.0.0.1:7777",
};

const state = {
  runtimeInfo: null,
  auth: null,
  preferences: null,
  autonomy: null,
  worldModel: null,
  appearance: null,
  runs: [],
  currentRun: null,
  activeRunId: null,
  currentTaskDraft: "",
  activeStream: false,
  streamRunId: null,
  streamStatusText: "",
  assistantText: "",
  latestToolSummaries: [],
  takeoverState: null,
  currentExecution: null,
  recentSessions: [],
  artifactHistory: [],
  hostAvailable: false,
};

const terminalStatuses = new Set(["completed", "failed", "cancelled"]);

const el = {
  body: document.body,
  landingView: document.getElementById("landingView"),
  chatView: document.getElementById("chatView"),
  conversation: document.getElementById("conversation"),
  conversationScroller: document.getElementById("conversationScroller"),
  landingForm: document.getElementById("landingForm"),
  landingTaskInput: document.getElementById("landingTaskInput"),
  composerForm: document.getElementById("composerForm"),
  taskInput: document.getElementById("taskInput"),
  runTask: document.getElementById("runTask"),
  contextStatus: document.getElementById("contextStatus"),
  syncStatus: document.getElementById("syncStatus"),
  openSettingsButton: document.getElementById("openSettingsButton"),
  hostStatus: document.getElementById("hostStatus"),
  worldModelStatus: document.getElementById("worldModelStatus"),
  workspaceInput: document.getElementById("workspaceInput"),
  apiKeyInput: document.getElementById("apiKeyInput"),
  themeSelect: document.getElementById("themeSelect"),
  autonomyStatus: document.getElementById("autonomyStatus"),
  recentSessions: document.getElementById("recentSessions"),
  artifactHistory: document.getElementById("artifactHistory"),
  runList: document.getElementById("runList"),
  liveControlsCard: document.getElementById("liveControlsCard"),
  settingsSheet: document.getElementById("settingsSheet"),
  historySheet: document.getElementById("historySheet"),
  commandPalette: document.getElementById("commandPalette"),
  paletteSearch: document.getElementById("paletteSearch"),
  paletteActions: document.getElementById("paletteActions"),
  chooseWorkspace: document.getElementById("chooseWorkspace"),
  trustWorkspace: document.getElementById("trustWorkspace"),
  saveApiKey: document.getElementById("saveApiKey"),
  clearApiKey: document.getElementById("clearApiKey"),
  enableAutonomy: document.getElementById("enableAutonomy"),
  refreshState: document.getElementById("refreshState"),
  newChatButton: document.getElementById("newChatButton"),
  openWorkspaceSheet: document.getElementById("openWorkspaceSheet"),
  openHistorySheet: document.getElementById("openHistorySheet"),
  pauseRun: document.getElementById("pauseRun"),
  resumeRun: document.getElementById("resumeRun"),
  takeoverRun: document.getElementById("takeoverRun"),
  cancelRun: document.getElementById("cancelRun"),
};

const paletteActionDefinitions = [
  { id: "open-settings", label: "Open settings", description: "Workspace, host, auth, and autonomy controls." },
  { id: "open-history", label: "Open history", description: "Recent runs, sessions, and artifacts." },
  { id: "new-chat", label: "Start a new chat", description: "Return to the launch canvas." },
  { id: "pause-run", label: "Pause current run", description: "Pause Binary if a run is active." },
  { id: "resume-run", label: "Resume current run", description: "Resume or recover the current run." },
  { id: "takeover-run", label: "Take over current run", description: "Mark the active run for human takeover." },
  { id: "cancel-run", label: "Cancel current run", description: "Cancel the current active run." },
];

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function nowIso() {
  return new Date().toISOString();
}

function summarizeExecutionState(execution) {
  if (!execution || typeof execution !== "object") return "";
  const mode = String(execution.interactionMode || "").replace(/_/g, " ");
  const visibility = String(execution.executionVisibility || "").replace(/_/g, " ");
  const summary = String(execution.executionSummary || execution.visibleFallbackReason || "").trim();
  return [mode, visibility, summary].filter(Boolean).join(" • ");
}

function buildExecutionBadges(execution) {
  if (!execution || typeof execution !== "object") return "";
  const badges = [];
  const mode = String(execution.interactionMode || "").trim();
  const visibility = String(execution.executionVisibility || "").trim();
  if (mode) badges.push(`<span class="status-pill">${escapeHtml(mode.replace(/_/g, " "))}</span>`);
  if (visibility) {
    const kind = visibility === "visible_required" ? "warning" : visibility === "background" ? "safe" : "neutral";
    badges.push(`<span class="status-pill status-pill--${kind}">${escapeHtml(visibility.replace(/_/g, " "))}</span>`);
  }
  return badges.length ? `<div class="status-pill-row">${badges.join("")}</div>` : "";
}

async function sendFocusLease(source = "typing", leaseMs = 4000) {
  if (!state.hostAvailable) return;
  try {
    await requestJson("/v1/focus-lease", {
      method: "POST",
      body: {
        surface: "desktop",
        source,
        leaseMs,
        active: true,
      },
    });
  } catch {
    // Ignore focus lease ping failures.
  }
}

function bindFocusLeaseInput(input, source) {
  if (!input) return;
  for (const eventName of ["focus", "input", "keydown", "click"]) {
    input.addEventListener(eventName, () => {
      void sendFocusLease(source, 4500);
    });
  }
}

function applyTheme(theme) {
  document.documentElement.dataset.theme = theme === "dark" ? "dark" : "light";
}

function setView(view) {
  el.body.dataset.view = view;
}

function requestJson(path, options = {}) {
  return fetch(`${host.baseUrl}${path}`, {
    method: options.method || "GET",
    headers: {
      "Content-Type": "application/json",
      ...(options.headers || {}),
    },
    body: options.body ? JSON.stringify(options.body) : undefined,
  }).then(async (response) => {
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
  });
}

function isTerminalStatus(status) {
  return terminalStatuses.has(String(status || "").toLowerCase());
}

function closeAllSheets() {
  for (const sheet of [el.settingsSheet, el.historySheet, el.commandPalette]) {
    sheet.dataset.open = "false";
    sheet.setAttribute("aria-hidden", "true");
  }
}

function openSheet(target) {
  closeAllSheets();
  target.dataset.open = "true";
  target.setAttribute("aria-hidden", "false");
  if (target === el.commandPalette) {
    el.paletteSearch.value = "";
    renderPaletteActions("");
    queueMicrotask(() => el.paletteSearch.focus());
  }
}

function currentRunSummary() {
  if (state.currentRun) return state.currentRun;
  if (state.activeRunId) {
    return state.runs.find((item) => item.id === state.activeRunId) || null;
  }
  return state.runs.find((item) => !isTerminalStatus(item.status)) || state.runs[0] || null;
}

function pushToolSummary(name, summary) {
  const cleanName = String(name || "tool").replace(/_/g, " ");
  const label = `${cleanName} • ${summary || "completed"}`;
  state.latestToolSummaries = [label, ...state.latestToolSummaries.filter((item) => item !== label)].slice(0, 4);
}

function renderStatusMeta() {
  const workspace = el.workspaceInput.value.trim() || state.preferences?.trustedWorkspaces?.[0]?.path || "";
  el.contextStatus.textContent = workspace ? `Context: ${workspace}` : "Context: No workspace selected";
  el.syncStatus.textContent = state.hostAvailable ? "Synced" : "Offline";
}

function buildAssistantActions() {
  if (!state.takeoverState) return "";
  return `
    <div class="assistant-actions">
      <button class="assistant-action assistant-action--primary" data-run-action="resume" type="button">Resume</button>
      <button class="assistant-action" data-run-action="takeover" type="button">Take over</button>
      <button class="assistant-action assistant-action--danger" data-run-action="cancel" type="button">Cancel</button>
    </div>
  `;
}

function buildAssistantCopy() {
  if (state.assistantText) return state.assistantText;
  if (state.streamStatusText) return state.streamStatusText;
  if (state.takeoverState?.reason) return state.takeoverState.reason;
  return "Binary is thinking through the request and preparing the first safe move.";
}

function renderLandingState() {
  setView("landing");
  renderStatusMeta();
}

function renderConversation() {
  const run = currentRunSummary();
  const shouldShowChat = Boolean(
    state.currentTaskDraft ||
    state.assistantText ||
    state.activeStream ||
    state.takeoverState ||
    (run && !isTerminalStatus(run.status))
  );

  if (!shouldShowChat) {
    renderLandingState();
    return;
  }

  setView("chat");
  const prompt = state.currentTaskDraft || run?.request?.task || "Ask Binary anything.";
  const assistantCopy = buildAssistantCopy();
  const executionSummary = summarizeExecutionState(state.currentExecution);
  const subtleLines = [];
  if (executionSummary && state.activeStream) subtleLines.push(executionSummary);
  if (state.latestToolSummaries[0] && state.activeStream) subtleLines.push(state.latestToolSummaries[0]);
  const subtleStatus = subtleLines.length
    ? `<p class="assistant-subcopy">${escapeHtml(subtleLines.join(" • "))}</p>`
    : "";
  const executionBadges = state.activeStream ? buildExecutionBadges(state.currentExecution) : "";

  el.conversation.innerHTML = `
    <article class="message message--user">
      <div class="message__meta">User</div>
      <h1 class="message__title">${escapeHtml(prompt)}</h1>
    </article>
    <article class="message message--assistant">
      <div class="assistant-head">
        <span class="assistant-label">Binary AI</span>
        <span class="assistant-pulse" aria-hidden="true"></span>
      </div>
      <p class="assistant-copy">${escapeHtml(assistantCopy)}</p>
      ${executionBadges}
      ${subtleStatus}
      ${buildAssistantActions()}
    </article>
  `;

  renderStatusMeta();
  el.conversation.scrollTop = el.conversation.scrollHeight;
}

function renderHostStatus(ok, message, extra = "") {
  state.hostAvailable = ok;
  el.hostStatus.innerHTML = `
    <strong>${escapeHtml(ok ? "Connected" : "Unavailable")}</strong>
    <span>${escapeHtml(message)}</span>
    ${extra ? `<span>${escapeHtml(extra)}</span>` : ""}
  `;
  renderStatusMeta();
}

function renderWorldModelStatus() {
  const summary = state.worldModel;
  if (!summary || !el.worldModelStatus) {
    if (el.worldModelStatus) {
      el.worldModelStatus.innerHTML = `
        <strong>World model unavailable</strong>
        <span>Binary will summarize the machine graph, active context, and recent changes here.</span>
      `;
    }
    return;
  }

  const activeBits = [
    summary.activeContext?.activeWorkspace,
    summary.activeContext?.activeRepo,
    summary.activeContext?.activePage,
    summary.activeContext?.activeWindow,
  ].filter(Boolean);
  const recentChange =
    Array.isArray(summary.recentChanges) && summary.recentChanges.length
      ? summary.recentChanges[0]?.summary || ""
      : "";
  const affordances = Array.isArray(summary.affordanceSummary?.backgroundSafe)
    ? summary.affordanceSummary.backgroundSafe.slice(0, 3)
    : [];

  el.worldModelStatus.innerHTML = `
    <strong>Graph v${escapeHtml(summary.graphVersion || 0)}</strong>
    <span>${escapeHtml(`${summary.nodeCount || 0} nodes • ${summary.edgeCount || 0} edges • ${summary.routineCount || 0} routines`)}</span>
    ${activeBits.length ? `<span>${escapeHtml(activeBits.join(" • "))}</span>` : ""}
    ${affordances.length ? `<span>${escapeHtml(`Background-safe: ${affordances.join(", ")}`)}</span>` : ""}
    ${recentChange ? `<span>${escapeHtml(recentChange)}</span>` : ""}
  `;
}

function renderAutonomyStatus() {
  const enabled = Boolean(state.autonomy?.enabled);
  const appCount = Number(state.autonomy?.appCount || 0);
  el.autonomyStatus.innerHTML = `
    <strong>${enabled ? "Autonomy enabled" : "Autonomy disabled"}</strong>
    <span>${enabled ? "Binary can inspect the machine with focus-safe defaults, terminal-first planning, and browser-native tools through the local host." : "Enable autonomy to let Binary act locally on this machine."}</span>
    <span>${appCount} discovered apps on ${escapeHtml(state.autonomy?.platform || "this device")}</span>
  `;
  el.enableAutonomy.disabled = enabled;
  el.enableAutonomy.textContent = enabled ? "Autonomy enabled" : "Enable autonomy";
}

function renderLiveControls() {
  const run = currentRunSummary();
  if (!run) {
    el.liveControlsCard.innerHTML = `
      <strong>No active run</strong>
      <span>Run controls will appear here when Binary is working.</span>
    `;
    el.pauseRun.disabled = true;
    el.resumeRun.disabled = true;
    el.takeoverRun.disabled = true;
    el.cancelRun.disabled = true;
    return;
  }

  const summary = state.takeoverState?.reason || state.streamStatusText || run.status || "running";
  const execution = state.currentExecution || run.lastExecutionState || null;
  const proof = execution?.terminalState?.terminalProof || state.latestToolSummaries[0] || "";
  el.liveControlsCard.innerHTML = `
    <strong>${escapeHtml(run.request?.task || "Current run")}</strong>
    <span>${escapeHtml(summary)}</span>
    ${buildExecutionBadges(execution)}
    ${proof ? `<span>${escapeHtml(proof)}</span>` : ""}
  `;
  el.pauseRun.disabled = run.status !== "running";
  el.resumeRun.disabled = !(run.status === "paused" || run.status === "takeover_required" || run.status === "queued");
  el.takeoverRun.disabled = false;
  el.cancelRun.disabled = isTerminalStatus(run.status);
}

function renderHistoryList(container, items, emptyText, renderItem) {
  if (!items.length) {
    container.classList.add("empty");
    container.textContent = emptyText;
    return;
  }
  container.classList.remove("empty");
  container.innerHTML = items.map(renderItem).join("");
}

function renderRuns() {
  renderHistoryList(
    el.runList,
    state.runs,
    "No runs yet.",
    (run) => `
      <article>
        <strong>${escapeHtml(run.request?.task || run.id)}</strong>
        <span>${escapeHtml(run.status)} • ${escapeHtml(run.updatedAt || run.createdAt || "")}</span>
        <button class="history-item__button" data-run-id="${escapeHtml(run.id)}" type="button">Open</button>
      </article>
    `
  );
}

function renderRecentSessions() {
  renderHistoryList(
    el.recentSessions,
    state.recentSessions,
    "No sessions yet.",
    (item) => `
      <article>
        <strong>${escapeHtml(item.sessionId)}</strong>
        <span>${escapeHtml(item.workspaceRoot || "Machine run")} • ${escapeHtml(item.updatedAt)}</span>
      </article>
    `
  );
}

function renderArtifacts() {
  renderHistoryList(
    el.artifactHistory,
    state.artifactHistory,
    "No artifacts yet.",
    (item) => `
      <article>
        <strong>${escapeHtml(item.label)}</strong>
        <span>${escapeHtml(item.createdAt)}</span>
        ${item.url ? `<button class="history-item__button" data-url="${escapeHtml(item.url)}" type="button">Open</button>` : ""}
      </article>
    `
  );
}

function renderPaletteActions(filterText) {
  const run = currentRunSummary();
  const filtered = paletteActionDefinitions.filter((item) => {
    const haystack = `${item.label} ${item.description}`.toLowerCase();
    return haystack.includes(filterText.toLowerCase());
  });

  const actions = filtered.filter((item) => {
    if (item.id.endsWith("-run")) return Boolean(run);
    return true;
  });

  el.paletteActions.innerHTML = actions
    .map(
      (item) => `
        <button class="palette__action" data-palette-action="${escapeHtml(item.id)}" type="button">
          <strong>${escapeHtml(item.label)}</strong>
          <span>${escapeHtml(item.description)}</span>
        </button>
      `
    )
    .join("");
}

function applyEventToState(event) {
  const eventName = String(event?.event || "");
  const data = event?.data || {};
  const execution =
    data && typeof data === "object"
      ? {
          interactionMode: data.interactionMode,
          executionVisibility: data.executionVisibility,
          foregroundDisruptionRisk: data.foregroundDisruptionRisk,
          visibleFallbackReason: data.visibleFallbackReason,
          terminalState: data.terminalState,
          executionSummary:
            typeof data.visibleFallbackReason === "string" && data.visibleFallbackReason.trim()
              ? data.visibleFallbackReason
              : undefined,
        }
      : null;

  if (eventName === "host.status") {
    const message = String(data.message || "").trim();
    if (message) state.streamStatusText = message;
    if (typeof data.runId === "string" && !state.streamRunId) {
      state.streamRunId = data.runId;
      state.activeRunId = data.runId;
    }
  }

  if (eventName === "run" && typeof data?.runId === "string") {
    state.streamRunId = data.runId;
    state.activeRunId = data.runId;
  }

  if (eventName === "tool_request") {
    const toolName = String(data?.toolCall?.name || "tool");
    const summary = String(data?.toolCall?.summary || "").trim() || `Binary is using ${toolName.replace(/_/g, " ")}.`;
    state.streamStatusText = summary;
    pushToolSummary(toolName, "requested");
    if (execution?.interactionMode || execution?.executionVisibility) state.currentExecution = execution;
  }

  if (eventName === "tool_result") {
    const toolName = String(data?.name || "tool");
    const summary = String(data?.summary || "completed");
    pushToolSummary(toolName, summary);
    state.streamStatusText = summary;
    if (execution?.interactionMode || execution?.executionVisibility) {
      state.currentExecution = {
        ...execution,
        executionSummary: summary,
      };
    }
  }

  if (eventName === "final" && typeof data === "string") {
    state.assistantText = data;
    state.streamStatusText = "";
    state.takeoverState = null;
    state.currentExecution = null;
  }

  if (eventName === "partial" && typeof data === "string") {
    state.assistantText = data;
  }

  if (eventName === "token" && typeof data === "string") {
    state.assistantText = `${state.assistantText || ""}${data}`;
  }

  if (eventName === "host.takeover_required") {
    const reason = String(data?.reason || "Binary paused because the hosted run stopped without proving completion.");
    state.takeoverState = {
      reason,
      at: nowIso(),
    };
    state.streamStatusText = reason;
  }

  if (eventName === "meta" && data?.progressState?.status) {
    state.streamStatusText = String(data.progressState.status);
    if (data?.lastExecutionState && typeof data.lastExecutionState === "object") {
      state.currentExecution = data.lastExecutionState;
    }
  }
}

async function syncRunSummaryFromHost() {
  if (!state.activeRunId) return;
  try {
    const run = await requestJson(`/v1/runs/${encodeURIComponent(state.activeRunId)}`);
    state.currentRun = run;
    state.activeRunId = run.id;
    if (run.lastExecutionState && typeof run.lastExecutionState === "object") {
      state.currentExecution = run.lastExecutionState;
    }
    if (run.status === "takeover_required") {
      state.takeoverState = {
        reason: run.takeoverReason || "Binary requested human takeover.",
        at: run.updatedAt || nowIso(),
      };
    }
  } catch {
    // Keep local state if refresh fails.
  }
}

async function hydrate() {
  const runtimeInfo = await window.binaryDesktop.runtimeInfo();
  state.runtimeInfo = runtimeInfo;
  host.baseUrl = runtimeInfo.hostUrl || host.baseUrl;

  try {
    const [health, auth, preferences, autonomy, worldModel, runsResponse, appearance] = await Promise.all([
      requestJson("/v1/healthz"),
      requestJson("/v1/auth/status"),
      requestJson("/v1/preferences"),
      requestJson("/v1/autonomy/status"),
      requestJson("/v1/world-model/summary"),
      requestJson("/v1/runs?limit=12"),
      window.binaryDesktop.getAppearance(),
    ]);

    state.auth = auth;
    state.preferences = preferences;
    state.autonomy = autonomy;
    state.worldModel = worldModel;
    state.appearance = appearance;
    state.runs = Array.isArray(runsResponse.runs) ? runsResponse.runs : [];
    state.recentSessions = Array.isArray(preferences.recentSessions) ? preferences.recentSessions : [];
    state.artifactHistory = Array.isArray(preferences.artifactHistory) ? preferences.artifactHistory : [];
    el.workspaceInput.value = preferences.trustedWorkspaces?.[0]?.path || "";
    el.themeSelect.value = appearance?.theme === "dark" ? "dark" : "light";
    applyTheme(appearance?.theme);

    renderHostStatus(true, `Binary Host ${health.version || "connected"}`, auth.maskedApiKey ? `API key: ${auth.maskedApiKey}` : "No API key stored");
    renderWorldModelStatus();
    renderAutonomyStatus();
    renderRuns();
    renderRecentSessions();
    renderArtifacts();
    renderLiveControls();
    renderConversation();
    renderPaletteActions(el.paletteSearch.value || "");
  } catch (error) {
    renderHostStatus(false, error instanceof Error ? error.message : String(error), "Build and start services/binary-host to activate the desktop shell.");
    renderWorldModelStatus();
    renderConversation();
  }
}

async function trustWorkspace() {
  const workspace = el.workspaceInput.value.trim();
  if (!workspace) return;
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
  await hydrate();
}

async function saveApiKey() {
  const apiKey = el.apiKeyInput.value.trim();
  if (!apiKey) return;
  await requestJson("/v1/auth/api-key", {
    method: "POST",
    body: { apiKey },
  });
  el.apiKeyInput.value = "";
  await hydrate();
}

async function clearApiKey() {
  await requestJson("/v1/auth/api-key", { method: "DELETE" });
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
      allowBrowserNative: true,
      allowEventAgents: true,
      allowElevation: true,
      allowUrlOpen: true,
      focusPolicy: "never_steal",
      sessionPolicy: "attach_carefully",
      allowVisibleFallback: false,
      autonomyPosture: "near_total",
      suppressForegroundWhileTyping: true,
      focusLeaseTtlMs: 4000,
      preferTerminalForCoding: true,
      browserAttachMode: "existing_or_managed",
    },
  });
  await hydrate();
}

async function controlRun(action, note) {
  const run = currentRunSummary();
  if (!run?.id) return;
  await requestJson(`/v1/runs/${encodeURIComponent(run.id)}/control`, {
    method: "POST",
    body: { action, note },
  });
  if (action === "resume") {
    state.takeoverState = null;
  }
  await syncRunSummaryFromHost();
  await hydrate();
}

async function startRun(task) {
  state.currentTaskDraft = task;
  state.assistantText = "Binary is thinking through the request and preparing the first safe move.";
  state.streamStatusText = "Binary is starting the hosted run.";
  state.latestToolSummaries = [];
  state.takeoverState = null;
  state.currentExecution = null;
  state.currentRun = {
    status: "running",
    request: { task },
  };
  state.activeRunId = null;
  state.streamRunId = null;
  state.activeStream = true;
  renderConversation();
  renderLiveControls();
  closeAllSheets();
  void sendFocusLease("submit", 5000);

  const response = await fetch(`${host.baseUrl}/v1/runs/assist`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      task,
      mode: "auto",
      model: "Binary IDE",
      workspaceRoot: el.workspaceInput.value.trim() || undefined,
      client: {
        surface: "desktop",
        version: state.runtimeInfo?.appVersion || "0.1.0",
      },
    }),
  });

  if (!response.ok || !response.body) {
    const errorText = await response.text();
    state.activeStream = false;
    state.streamStatusText = errorText || `Request failed (${response.status})`;
    state.takeoverState = { reason: state.streamStatusText, at: nowIso() };
    renderConversation();
    renderLiveControls();
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
        applyEventToState(JSON.parse(payload));
      } catch {
        state.streamStatusText = payload;
      }
      renderConversation();
      renderLiveControls();
    }
  }

  state.activeStream = false;
  if (!state.assistantText && state.takeoverState) {
    state.assistantText = "Binary needs a human eye on this moment before it continues.";
  }
  await syncRunSummaryFromHost();
  await hydrate();
}

function resetChat() {
  state.currentTaskDraft = "";
  state.assistantText = "";
  state.streamStatusText = "";
  state.latestToolSummaries = [];
  state.takeoverState = null;
  state.currentExecution = null;
  state.currentRun = null;
  state.activeRunId = null;
  state.streamRunId = null;
  state.activeStream = false;
  el.taskInput.value = "";
  el.landingTaskInput.value = "";
  renderConversation();
  renderLiveControls();
}

function handlePaletteAction(actionId) {
  if (actionId === "open-settings") openSheet(el.settingsSheet);
  if (actionId === "open-history") openSheet(el.historySheet);
  if (actionId === "new-chat") resetChat();
  if (actionId === "pause-run") void controlRun("pause", "Paused from the command palette.");
  if (actionId === "resume-run") void controlRun("resume", "Resumed from the command palette.");
  if (actionId === "takeover-run") void controlRun("takeover", "Takeover requested from the command palette.");
  if (actionId === "cancel-run") void controlRun("cancel", "Cancelled from the command palette.");
  closeAllSheets();
}

el.landingForm.addEventListener("submit", (event) => {
  event.preventDefault();
  const task = el.landingTaskInput.value.trim();
  if (!task) return;
  el.landingTaskInput.value = "";
  void startRun(task);
});

el.composerForm.addEventListener("submit", (event) => {
  event.preventDefault();
  const task = el.taskInput.value.trim();
  if (!task) return;
  el.taskInput.value = "";
  el.taskInput.focus();
  void startRun(task);
});

el.openSettingsButton.addEventListener("click", () => {
  openSheet(el.settingsSheet);
});

el.chooseWorkspace.addEventListener("click", async () => {
  const selected = await window.binaryDesktop.chooseWorkspace();
  if (selected) {
    el.workspaceInput.value = selected;
    renderStatusMeta();
  }
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

el.themeSelect.addEventListener("change", async () => {
  state.appearance = await window.binaryDesktop.setAppearance({
    theme: el.themeSelect.value === "dark" ? "dark" : "light",
  });
  applyTheme(state.appearance?.theme);
});

el.enableAutonomy.addEventListener("click", () => {
  void enableAutonomy();
});

el.refreshState.addEventListener("click", () => {
  void hydrate();
});

el.newChatButton.addEventListener("click", () => {
  resetChat();
});

el.openWorkspaceSheet.addEventListener("click", () => {
  openSheet(el.settingsSheet);
});

el.openHistorySheet.addEventListener("click", () => {
  openSheet(el.historySheet);
});

el.pauseRun.addEventListener("click", () => {
  void controlRun("pause", "Paused from the settings sheet.");
});

el.resumeRun.addEventListener("click", () => {
  void controlRun("resume", "Resumed from the settings sheet.");
});

el.takeoverRun.addEventListener("click", () => {
  void controlRun("takeover", "Takeover requested from the settings sheet.");
});

el.cancelRun.addEventListener("click", () => {
  void controlRun("cancel", "Cancelled from the settings sheet.");
});

document.addEventListener("click", (event) => {
  const target = event.target;
  if (!(target instanceof HTMLElement)) return;

  const closeTarget = target.closest("[data-close-sheet]");
  if (closeTarget) {
    closeAllSheets();
    return;
  }

  const runButton = target.closest("[data-run-id]");
  if (runButton) {
    const runId = runButton.getAttribute("data-run-id");
    if (runId) {
      const run = state.runs.find((item) => item.id === runId);
      if (run) {
        state.currentRun = run;
        state.activeRunId = run.id;
        if (run.lastExecutionState && typeof run.lastExecutionState === "object") {
          state.currentExecution = run.lastExecutionState;
        }
        state.currentTaskDraft = run.request?.task || state.currentTaskDraft;
        state.assistantText = state.assistantText || "Binary restored a recent run context.";
        if (run.status === "takeover_required") {
          state.takeoverState = {
            reason: run.takeoverReason || "Binary requested takeover.",
            at: run.updatedAt || nowIso(),
          };
        }
        renderConversation();
        renderLiveControls();
        closeAllSheets();
      }
    }
    return;
  }

  const artifactButton = target.closest("[data-url]");
  if (artifactButton) {
    const url = artifactButton.getAttribute("data-url");
    if (url) void window.binaryDesktop.openExternal(url);
    return;
  }

  const actionButton = target.closest("[data-palette-action]");
  if (actionButton) {
    handlePaletteAction(actionButton.getAttribute("data-palette-action"));
    return;
  }

  const inlineAction = target.closest("[data-run-action]");
  if (inlineAction) {
    const action = inlineAction.getAttribute("data-run-action");
    if (action) void controlRun(action, "Run action triggered from the conversation surface.");
  }
});

el.paletteSearch.addEventListener("input", () => {
  renderPaletteActions(el.paletteSearch.value || "");
});

document.addEventListener("keydown", (event) => {
  if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
    event.preventDefault();
    openSheet(el.commandPalette);
    return;
  }
  if ((event.metaKey || event.ctrlKey) && event.key === ",") {
    event.preventDefault();
    openSheet(el.settingsSheet);
    return;
  }
  if (event.key === "Escape") {
    closeAllSheets();
  }
});

window.binaryDesktop.onAppearance((appearance) => {
  state.appearance = appearance;
  el.themeSelect.value = appearance?.theme === "dark" ? "dark" : "light";
  applyTheme(appearance?.theme);
});

window.binaryDesktop.onHotkeyAction((payload) => {
  if (payload.action === "focus_composer") {
    if (el.body.dataset.view === "chat") {
      el.taskInput.focus();
    } else {
      el.landingTaskInput.focus();
    }
  }
});

window.binaryDesktop.onFocusRun(async ({ runId }) => {
  if (!runId) return;
  try {
    const run = await requestJson(`/v1/runs/${encodeURIComponent(runId)}`);
    state.currentRun = run;
    state.activeRunId = run.id;
    if (run.lastExecutionState && typeof run.lastExecutionState === "object") {
      state.currentExecution = run.lastExecutionState;
    }
    state.currentTaskDraft = run.request?.task || state.currentTaskDraft;
    state.assistantText = state.assistantText || "Binary restored a recent run context.";
    if (run.status === "takeover_required") {
      state.takeoverState = {
        reason: run.takeoverReason || "Binary requested takeover.",
        at: run.updatedAt || nowIso(),
      };
    }
    renderConversation();
    renderLiveControls();
  } catch {
    // Ignore restore errors.
  }
});

bindFocusLeaseInput(el.taskInput, "chat-composer");
bindFocusLeaseInput(el.landingTaskInput, "launch-composer");
renderConversation();
renderStatusMeta();
await hydrate();

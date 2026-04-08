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
  transcript: [],
  activeAssistantTurnId: null,
  currentTaskDraft: "",
  activeStream: false,
  streamRunId: null,
  streamStatusText: "",
  assistantText: "",
  assistantNarration: [],
  latestToolSummaries: [],
  takeoverState: null,
  closureState: null,
  currentExecution: null,
  recentSessions: [],
  artifactHistory: [],
  providerCatalog: [],
  providers: [],
  connections: [],
  automations: [],
  webhookSubscriptions: [],
  activeAutomationId: null,
  activeAutomationEvents: [],
  automationEditorId: null,
  connectionEditorId: null,
  hostAvailable: false,
  assistMode: "auto",
  autoScrollConversation: true,
  binaryInspector: {
    path: "",
    offset: 0,
    length: 256,
    descriptor: null,
    analysis: null,
    chunk: null,
    error: "",
  },
};

const terminalStatuses = new Set(["completed", "failed", "cancelled"]);
let activeAutomationTimelineAbortController = null;

const STARTER_USER_PROMPT = "New thread";
const STARTER_ASSISTANT_COPY = "Hi there! How can Binary help you today?";
/** Shown only when there is no streamed model text and no live status line yet. */
const ASSISTANT_IDLE_COPY = STARTER_ASSISTANT_COPY;
const ASSISTANT_WAITING_COPY = "Thinking";
const FOCUS_LEASE_DEBOUNCE_MS = 350;
const PLAN_MODE_COMMAND = "/plan";

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
  branchStatus: document.getElementById("branchStatus"),
  openSettingsButton: document.getElementById("openSettingsButton"),
  sidebarSettingsButton: document.getElementById("sidebarSettingsButton"),
  hostStatus: document.getElementById("hostStatus"),
  worldModelStatus: document.getElementById("worldModelStatus"),
  machineRootInput: document.getElementById("machineRootInput"),
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
  chooseMachineHome: document.getElementById("chooseMachineHome"),
  chooseWorkspace: document.getElementById("chooseWorkspace"),
  trustWorkspace: document.getElementById("trustWorkspace"),
  saveApiKey: document.getElementById("saveApiKey"),
  clearApiKey: document.getElementById("clearApiKey"),
  providerSelect: document.getElementById("providerSelect"),
  providerModelInput: document.getElementById("providerModelInput"),
  providerAuthStatus: document.getElementById("providerAuthStatus"),
  providerBaseUrlInput: document.getElementById("providerBaseUrlInput"),
  openProviderPage: document.getElementById("openProviderPage"),
  saveProvider: document.getElementById("saveProvider"),
  importProvider: document.getElementById("importProvider"),
  testProvider: document.getElementById("testProvider"),
  refreshProvider: document.getElementById("refreshProvider"),
  setDefaultProvider: document.getElementById("setDefaultProvider"),
  disconnectProvider: document.getElementById("disconnectProvider"),
  providerList: document.getElementById("providerList"),
  addWebConnection: document.getElementById("addWebConnection"),
  clearConnectionEditor: document.getElementById("clearConnectionEditor"),
  connectionNameInput: document.getElementById("connectionNameInput"),
  connectionTransportSelect: document.getElementById("connectionTransportSelect"),
  connectionAuthSelect: document.getElementById("connectionAuthSelect"),
  connectionUrlInput: document.getElementById("connectionUrlInput"),
  connectionSecretInput: document.getElementById("connectionSecretInput"),
  connectionHeaderNameInput: document.getElementById("connectionHeaderNameInput"),
  connectionImportPathInput: document.getElementById("connectionImportPathInput"),
  saveConnection: document.getElementById("saveConnection"),
  testConnection: document.getElementById("testConnection"),
  importConnectionConfig: document.getElementById("importConnectionConfig"),
  connectionList: document.getElementById("connectionList"),
  enableAutonomy: document.getElementById("enableAutonomy"),
  refreshState: document.getElementById("refreshState"),
  binaryPathInput: document.getElementById("binaryPathInput"),
  binaryOffsetInput: document.getElementById("binaryOffsetInput"),
  binaryLengthInput: document.getElementById("binaryLengthInput"),
  chooseBinaryFile: document.getElementById("chooseBinaryFile"),
  inspectBinary: document.getElementById("inspectBinary"),
  hashBinary: document.getElementById("hashBinary"),
  binaryPrevChunk: document.getElementById("binaryPrevChunk"),
  binaryNextChunk: document.getElementById("binaryNextChunk"),
  binaryInspectorCard: document.getElementById("binaryInspectorCard"),
  binaryPreview: document.getElementById("binaryPreview"),
  newChatButton: document.getElementById("newChatButton"),
  openWorkspaceSheet: document.getElementById("openWorkspaceSheet"),
  openHistorySheet: document.getElementById("openHistorySheet"),
  menuButtons: Array.from(document.querySelectorAll(".app-menu-button")),
  menuDropdown: document.getElementById("menuDropdown"),
  landingWorkspaceButton: document.getElementById("landingWorkspaceButton"),
  sidebarWorkspaceName: document.getElementById("sidebarWorkspaceName"),
  workspaceTitle: document.getElementById("workspaceTitle"),
  workspaceMeta: document.getElementById("workspaceMeta"),
  threadList: document.getElementById("threadList"),
  pauseRun: document.getElementById("pauseRun"),
  resumeRun: document.getElementById("resumeRun"),
  takeoverRun: document.getElementById("takeoverRun"),
  cancelRun: document.getElementById("cancelRun"),
  automationNameInput: document.getElementById("automationNameInput"),
  automationPromptInput: document.getElementById("automationPromptInput"),
  automationTriggerSelect: document.getElementById("automationTriggerSelect"),
  automationPolicySelect: document.getElementById("automationPolicySelect"),
  automationWorkspaceInput: document.getElementById("automationWorkspaceInput"),
  automationDetailInput: document.getElementById("automationDetailInput"),
  saveAutomation: document.getElementById("saveAutomation"),
  clearAutomationEditor: document.getElementById("clearAutomationEditor"),
  automationList: document.getElementById("automationList"),
  webhookUrlInput: document.getElementById("webhookUrlInput"),
  webhookEventsInput: document.getElementById("webhookEventsInput"),
  saveWebhook: document.getElementById("saveWebhook"),
  webhookList: document.getElementById("webhookList"),
  automationTimeline: document.getElementById("automationTimeline"),
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

const appMenuDefinitions = {
  file: {
    label: "File",
    items: [
      { id: "new-chat", label: "New Chat" },
      { id: "open-settings", label: "Workspace and Runtime" },
      { id: "open-history", label: "Run History" },
    ],
  },
  edit: {
    label: "Edit",
    items: [
      { id: "focus-composer", label: "Focus Composer" },
      { id: "focus-launch", label: "Focus Launch Input" },
    ],
  },
  view: {
    label: "View",
    items: [
      { id: "open-history", label: "Run History" },
      { id: "open-palette", label: "Command Palette" },
      { id: "refresh-state", label: "Refresh State" },
    ],
  },
  window: {
    label: "Window",
    items: [
      { id: "focus-composer", label: "Focus Composer" },
      { id: "open-settings", label: "Workspace and Runtime" },
    ],
  },
  help: {
    label: "Help",
    items: [
      { id: "open-palette", label: "Command Palette" },
      { id: "open-settings", label: "Runtime Info" },
    ],
  },
};

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

function createTranscriptTurn(role, text = "") {
  return {
    id: `turn_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    role,
    text,
  };
}

function appendTranscriptTurn(role, text = "") {
  const turn = createTranscriptTurn(role, text);
  state.transcript.push(turn);
  return turn;
}

function getTranscriptTurnById(turnId) {
  if (!turnId) return null;
  return state.transcript.find((turn) => turn.id === turnId) || null;
}

function getLastAssistantTurn() {
  for (let index = state.transcript.length - 1; index >= 0; index -= 1) {
    if (state.transcript[index].role === "assistant") return state.transcript[index];
  }
  return null;
}

function ensureActiveAssistantTurn() {
  const existing = getTranscriptTurnById(state.activeAssistantTurnId);
  if (existing && existing.role === "assistant") return existing;
  const turn = appendTranscriptTurn("assistant", "");
  state.activeAssistantTurnId = turn.id;
  return turn;
}

function updateActiveAssistantTurn(text) {
  const turn = ensureActiveAssistantTurn();
  turn.text = text;
  return turn;
}

function syncAssistantResponseIntoTranscript(text) {
  const normalized = String(text || "").trim();
  if (!normalized) return null;
  const activeTurn = getTranscriptTurnById(state.activeAssistantTurnId);
  if (activeTurn && activeTurn.role === "assistant") {
    activeTurn.text = normalized;
    return activeTurn;
  }
  const lastAssistantTurn = getLastAssistantTurn();
  if (lastAssistantTurn) {
    lastAssistantTurn.text = normalized;
    return lastAssistantTurn;
  }
  return appendTranscriptTurn("assistant", normalized);
}

function isConversationNearBottom() {
  if (!el.conversation) return true;
  const threshold = 96;
  const remaining = el.conversation.scrollHeight - el.conversation.scrollTop - el.conversation.clientHeight;
  return remaining <= threshold;
}

function autoScrollConversation(force = false) {
  if (!el.conversation) return;
  if (!force && !state.autoScrollConversation && !state.activeStream) return;
  requestAnimationFrame(() => {
    if (!el.conversation) return;
    el.conversation.scrollTop = el.conversation.scrollHeight;
  });
}

function seedTranscriptFromRun(run, fallbackAssistantText = "") {
  const task = String(run?.request?.task || "").trim();
  const safeFallbackAssistantText = isInfrastructureStatusMessage(fallbackAssistantText) ? "" : fallbackAssistantText;
  const assistant = String(extractAssistantResponse(run) || extractRunFailureMessage(run) || safeFallbackAssistantText || "").trim();
  if (!task && !assistant) return;
  state.transcript = [];
  if (task) appendTranscriptTurn("user", task);
  const seededAssistantCopy =
    assistant || (run && !isTerminalStatus(run.status) ? ASSISTANT_WAITING_COPY : ASSISTANT_IDLE_COPY);
  appendTranscriptTurn("assistant", seededAssistantCopy);
  state.activeAssistantTurnId = null;
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
  const speedProfile = String(execution.selectedSpeedProfile || execution.speedProfile || "").trim();
  const latencyTier = String(execution.selectedLatencyTier || execution.latencyTier || "").trim();
  const startupPhase = String(execution.startupPhase || "").trim();
  const escalationStage = String(execution.escalationStage || "").trim();
  if (mode) badges.push(`<span class="status-pill">${escapeHtml(mode.replace(/_/g, " "))}</span>`);
  if (visibility) {
    const kind = visibility === "visible_required" ? "warning" : visibility === "background" ? "safe" : "neutral";
    badges.push(`<span class="status-pill status-pill--${kind}">${escapeHtml(visibility.replace(/_/g, " "))}</span>`);
  }
  const route = String(execution.chosenRoute || "").trim();
  if (route) badges.push(`<span class="status-pill">${escapeHtml(route.replace(/_/g, " "))}</span>`);
  if (speedProfile) badges.push(`<span class="status-pill">${escapeHtml(`${speedProfile} route`)}</span>`);
  if (latencyTier) badges.push(`<span class="status-pill">${escapeHtml(`${latencyTier} model`)}</span>`);
  if (startupPhase && startupPhase !== "full_run") {
    badges.push(`<span class="status-pill status-pill--subtle">${escapeHtml(startupPhase.replace(/_/g, " "))}</span>`);
  }
  const verification = String(execution.verificationStatus || "").trim();
  if (verification) {
    const kind = verification === "passed" ? "safe" : verification === "failed" ? "warning" : "neutral";
    badges.push(`<span class="status-pill status-pill--${kind}">${escapeHtml(verification.replace(/_/g, " "))}</span>`);
  }
  if (escalationStage) {
    badges.push(
      `<span class="status-pill status-pill--warning">${escapeHtml(`Escalated: ${escalationStage.replace(/_/g, " ")}`)}</span>`
    );
  }
  return badges.length ? `<div class="status-pill-row">${badges.join("")}</div>` : "";
}

function buildOperatorDetails(execution) {
  if (!execution || typeof execution !== "object") return "";
  const receipts = Array.isArray(execution.verificationReceipts) ? execution.verificationReceipts : [];
  const latencyLine = [
    typeof execution.plannerLatencyMs === "number" ? `planner ${Math.max(0, Math.round(execution.plannerLatencyMs))}ms` : "",
    typeof execution.providerLatencyMs === "number" ? `provider ${Math.max(0, Math.round(execution.providerLatencyMs))}ms` : "",
    typeof execution.actionLatencyMs === "number" ? `action ${Math.max(0, Math.round(execution.actionLatencyMs))}ms` : "",
  ]
    .filter(Boolean)
    .join(" • ");
  const lines = [
    execution.routeReason ? `Route: ${execution.routeReason}` : "",
    execution.escalationReason ? `Escalation: ${execution.escalationReason}` : "",
    latencyLine ? `Latency: ${latencyLine}` : "",
    receipts[0] ? `Verification: ${receipts[0]}` : "",
  ]
    .filter(Boolean)
    .map((line) => `<p class="assistant-subcopy">${escapeHtml(line)}</p>`)
    .join("");
  return lines ? `<div class="closure-card">${lines}</div>` : "";
}

function deriveExecutionState(source, fallback = null) {
  const execution = source?.lastExecutionState && typeof source.lastExecutionState === "object" ? source.lastExecutionState : {};
  const progress = source?.progressState && typeof source.progressState === "object" ? source.progressState : {};
  const objective = source?.objectiveState && typeof source.objectiveState === "object" ? source.objectiveState : {};
  const merged = {
    ...(fallback && typeof fallback === "object" ? fallback : {}),
    ...execution,
    ...(objective.chosenRoute ? { chosenRoute: objective.chosenRoute } : {}),
    ...(objective.routeReason ? { routeReason: objective.routeReason } : {}),
    ...(objective.verificationStatus ? { verificationStatus: objective.verificationStatus } : {}),
    ...(Array.isArray(objective.verificationReceipts) ? { verificationReceipts: objective.verificationReceipts } : {}),
    ...(objective.escalationStage ? { escalationStage: objective.escalationStage } : {}),
    ...(objective.escalationReason ? { escalationReason: objective.escalationReason } : {}),
    ...(progress.chosenRoute ? { chosenRoute: progress.chosenRoute } : {}),
    ...(progress.routeReason ? { routeReason: progress.routeReason } : {}),
    ...(progress.verificationStatus ? { verificationStatus: progress.verificationStatus } : {}),
    ...(Array.isArray(progress.verificationReceipts) ? { verificationReceipts: progress.verificationReceipts } : {}),
    ...(progress.escalationStage ? { escalationStage: progress.escalationStage } : {}),
    ...(progress.escalationReason ? { escalationReason: progress.escalationReason } : {}),
    ...(progress.startupPhase ? { startupPhase: progress.startupPhase } : {}),
    ...(progress.selectedSpeedProfile ? { selectedSpeedProfile: progress.selectedSpeedProfile } : {}),
    ...(progress.selectedLatencyTier ? { selectedLatencyTier: progress.selectedLatencyTier } : {}),
    ...(progress.taskSpeedClass ? { taskSpeedClass: progress.taskSpeedClass } : {}),
  };
  return Object.keys(merged).length ? merged : null;
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
  let debounceTimer = null;
  const debouncedLease = () => {
    if (debounceTimer) clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => {
      debounceTimer = null;
      void sendFocusLease(source, 4500);
    }, FOCUS_LEASE_DEBOUNCE_MS);
  };
  input.addEventListener("focus", () => {
    void sendFocusLease(source, 4500);
  });
  input.addEventListener("click", () => {
    void sendFocusLease(source, 4500);
  });
  input.addEventListener("input", debouncedLease);
  input.addEventListener("keydown", debouncedLease);
}

function applyTheme(theme) {
  document.documentElement.dataset.theme = theme === "dark" ? "dark" : "light";
}

function setView(view) {
  el.body.dataset.view = view;
}

function updateComposerSubmitState() {
  const hasText = Boolean(el.taskInput?.value.trim());
  if (!el.runTask) return;
  el.runTask.disabled = !hasText;
  el.runTask.classList.toggle("composer-submit--active", hasText);
}

function parseComposerCommand(input) {
  const normalized = String(input || "").trim();
  if (normalized === PLAN_MODE_COMMAND) return "toggle_plan_mode";
  return null;
}

function toggleAssistMode() {
  state.assistMode = state.assistMode === "plan" ? "auto" : "plan";
  renderStatusMeta();
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

function closeAppMenu() {
  if (el.menuDropdown) {
    el.menuDropdown.dataset.open = "false";
    el.menuDropdown.setAttribute("aria-hidden", "true");
    el.menuDropdown.innerHTML = "";
    el.menuDropdown.style.left = "0px";
  }
  for (const button of el.menuButtons) {
    button.dataset.open = "false";
  }
}

function focusCurrentComposer() {
  if (el.body.dataset.view === "landing") {
    el.landingTaskInput.focus();
  } else {
    el.taskInput.focus();
  }
}

function runAppMenuAction(actionId) {
  if (actionId === "new-chat") {
    resetChat();
    closeAllSheets();
    return;
  }
  if (actionId === "open-settings") {
    openSheet(el.settingsSheet);
    return;
  }
  if (actionId === "open-history") {
    openSheet(el.historySheet);
    return;
  }
  if (actionId === "open-palette") {
    openSheet(el.commandPalette);
    return;
  }
  if (actionId === "focus-composer") {
    closeAllSheets();
    focusCurrentComposer();
    return;
  }
  if (actionId === "focus-launch") {
    setView("landing");
    closeAllSheets();
    queueMicrotask(() => el.landingTaskInput.focus());
    return;
  }
  if (actionId === "refresh-state") {
    void hydrate();
  }
}

function openAppMenu(menuKey, button) {
  const definition = appMenuDefinitions[menuKey];
  if (!definition || !el.menuDropdown) return;
  const isOpen = button.dataset.open === "true";
  closeAppMenu();
  if (isOpen) return;

  button.dataset.open = "true";
  el.menuDropdown.innerHTML = `
    <div class="app-menu-dropdown__label">${escapeHtml(definition.label)}</div>
    ${definition.items
      .map(
        (item) => `
          <button class="app-menu-dropdown__item" data-menu-item="${escapeHtml(item.id)}" type="button">
            <span>${escapeHtml(item.label)}</span>
            ${item.hint ? `<span class="app-menu-dropdown__hint">${escapeHtml(item.hint)}</span>` : ""}
          </button>
        `
      )
      .join("")}
  `;
  el.menuDropdown.dataset.open = "true";
  el.menuDropdown.setAttribute("aria-hidden", "false");

  const buttonRect = button.getBoundingClientRect();
  const shellRect = document.querySelector(".app-shell")?.getBoundingClientRect();
  const left = shellRect ? buttonRect.left - shellRect.left : buttonRect.left;
  el.menuDropdown.style.left = `${Math.max(18, left)}px`;
}

function openSheet(target) {
  closeAppMenu();
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

function buildAssistantNarrationText() {
  return state.assistantNarration
    .map((item) => String(item || "").trim())
    .filter(Boolean)
    .join("\n\n")
    .trim();
}

function refreshActiveAssistantNarration() {
  if (state.assistantText && !isInfrastructureStatusMessage(state.assistantText)) return;
  const narration = buildAssistantNarrationText();
  if (narration) updateActiveAssistantTurn(narration);
}

function appendAssistantNarration(line) {
  const normalized = String(line || "").trim();
  if (!normalized) return;
  if (isInfrastructureStatusMessage(normalized)) return;
  const existing = state.assistantNarration.filter((item) => String(item || "").trim() !== normalized);
  state.assistantNarration = [...existing, normalized].slice(-8);
  refreshActiveAssistantNarration();
}

function toNaturalToolLabel(name) {
  const raw = String(name || "tool").trim();
  const overrides = {
    terminal_start_session: "an interactive terminal session",
    terminal_send_input: "the interactive terminal",
    terminal_read_output: "the interactive terminal output",
    terminal_list_sessions: "active terminal sessions",
    terminal_terminate_session: "the interactive terminal session",
    run_command: "a shell command",
    browser_search_and_open_best_result: "the browser",
    desktop_open_app: "an app",
    desktop_query_controls: "the app interface",
  };
  if (Object.prototype.hasOwnProperty.call(overrides, raw)) return overrides[raw];
  return raw.replace(/_/g, " ");
}

function buildToolNarration(kind, name, summary) {
  const cleanSummary = String(summary || "").trim();
  const label = toNaturalToolLabel(name);
  if (kind === "request") {
    return cleanSummary ? `I’m working on ${label}. ${cleanSummary}` : `I’m working on ${label}.`;
  }
  return cleanSummary ? `I finished ${label}. ${cleanSummary}` : `I finished ${label}.`;
}

function getMachineHomeRoot() {
  const value = el.machineRootInput?.value.trim();
  return value || state.preferences?.machineRootPath || undefined;
}

function getSelectedWorkspaceRoot() {
  const value = el.workspaceInput.value.trim();
  return value || undefined;
}

function deriveMachineHomeLabel() {
  const candidate = getMachineHomeRoot() || "Machine Home";
  const normalized = String(candidate || "").replace(/[\\/]+$/, "");
  const parts = normalized.split(/[\\/]/).filter(Boolean);
  return parts[parts.length - 1] || "Machine Home";
}

function deriveFocusRootLabel() {
  const focusRoot = getSelectedWorkspaceRoot() || state.preferences?.focusWorkspaceRoot || "";
  if (!focusRoot) return "Machine Home";
  const normalized = String(focusRoot || "").replace(/[\\/]+$/, "");
  const parts = normalized.split(/[\\/]/).filter(Boolean);
  return parts[parts.length - 1] || focusRoot;
}

function deriveWorkspaceTitle() {
  const run = currentRunSummary();
  if (state.currentTaskDraft) return state.currentTaskDraft;
  if (run?.request?.task) return run.request.task;
  return STARTER_USER_PROMPT;
}

function renderStatusMeta() {
  const machineHome = getMachineHomeRoot();
  const focusRoot = getSelectedWorkspaceRoot() || state.preferences?.focusWorkspaceRoot || "";
  const machineHomeLabel = deriveMachineHomeLabel();
  const focusRootLabel = deriveFocusRootLabel();
  const activeConnections = state.connections.filter((connection) => connection.enabled).length;
  const activeProviders = state.providers.filter((provider) => provider.connected).length;
  const activePage = String(state.worldModel?.activeContext?.activePage || "").trim();
  const focusedRepo = String(state.worldModel?.activeContext?.focusedRepo || "").trim();
  if (focusedRepo) {
    el.contextStatus.textContent = `Machine home active • Focused repo: ${focusedRepo}`;
  } else if (focusRoot) {
    el.contextStatus.textContent = `Machine home active • Focused folder: ${focusRoot}`;
  } else if (activePage) {
    el.contextStatus.textContent = `Machine home active • Active page: ${activePage}`;
  } else if (machineHome) {
    el.contextStatus.textContent = `Machine home active • ${machineHome}`;
  } else {
    el.contextStatus.textContent = "Machine home active";
  }
  const syncBase = state.hostAvailable
    ? activeProviders
      ? `Model source: ${activeProviders} connected provider${activeProviders === 1 ? "" : "s"}`
      : activeConnections
        ? `Using ${activeConnections} connection${activeConnections === 1 ? "" : "s"}`
        : "Synced"
    : "Offline";
  el.syncStatus.textContent = state.assistMode === "plan" ? `${syncBase} - Plan mode` : syncBase;
  if (el.sidebarWorkspaceName) el.sidebarWorkspaceName.textContent = machineHomeLabel;
  if (el.landingWorkspaceButton) el.landingWorkspaceButton.textContent = focusRoot ? focusRootLabel : machineHomeLabel;
  if (el.workspaceTitle) el.workspaceTitle.textContent = deriveWorkspaceTitle();
  if (el.workspaceMeta) el.workspaceMeta.textContent = focusRoot ? focusRootLabel : machineHomeLabel;
  if (el.branchStatus) {
    const branch =
      String(state.currentExecution?.branch || "") ||
      String(currentRunSummary()?.lastExecutionState?.branch || "") ||
      "main";
    el.branchStatus.textContent = branch;
  }
  return;
  if (workspace) {
    el.contextStatus.textContent = `Context: ${workspace}`;
  } else if (trustedWorkspace) {
    el.contextStatus.textContent = `Context: No workspace attached • trusted root available`;
  } else {
    el.contextStatus.textContent = "Context: No workspace selected";
  }
  el.syncStatus.textContent = state.hostAvailable
    ? activeProviders
      ? `Model source: ${activeProviders} connected provider${activeProviders === 1 ? "" : "s"}`
      : activeConnections
        ? `Using ${activeConnections} connection${activeConnections === 1 ? "" : "s"}`
        : "Synced"
    : "Offline";
  if (el.sidebarWorkspaceName) el.sidebarWorkspaceName.textContent = workspaceLabel;
  if (el.landingWorkspaceButton) el.landingWorkspaceButton.textContent = workspaceLabel;
  if (el.workspaceTitle) el.workspaceTitle.textContent = deriveWorkspaceTitle();
  if (el.branchStatus) {
    const branch =
      String(state.currentExecution?.branch || "") ||
      String(currentRunSummary()?.lastExecutionState?.branch || "") ||
      "main";
    el.branchStatus.textContent = branch;
  }
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

function extractClosureState(data) {
  if (!data || typeof data !== "object") return null;
  const loopState = data.loopState && typeof data.loopState === "object" ? data.loopState : {};
  const progressState = data.progressState && typeof data.progressState === "object" ? data.progressState : {};
  const unfinishedChecklistItems = Array.isArray(data.unfinishedChecklistItems)
    ? data.unfinishedChecklistItems.filter((item) => typeof item === "string")
    : [];
  const closurePhase = String(loopState.closurePhase || "").trim();
  if (!closurePhase && !unfinishedChecklistItems.length && !progressState.nextDeterministicAction) return null;
  return {
    closurePhase,
    unfinishedChecklistItems,
    nextDeterministicAction: String(progressState.nextDeterministicAction || data.nextDeterministicAction || "").trim(),
    lastMeaningfulProof: String(data.lastMeaningfulProof || "").trim(),
    closureSummary: String(data.closureSummary || "").trim(),
  };
}

function extractAssistantResponse(run) {
  if (!run || typeof run !== "object") return "";
  const candidates = [
    run.finalEnvelope?.final,
    run.finalEnvelope?.lastMeaningfulProof,
    run.final,
    run.response?.final,
    run.response?.text,
    run.output?.final,
    run.output?.text,
    run.lastMeaningfulProof,
  ];
  for (const candidate of candidates) {
    const text = String(candidate || "").trim();
    if (text) return text;
  }
  return "";
}

function extractRunFailureMessage(run) {
  if (!run || typeof run !== "object") return "";
  const direct = String(run.error || run.takeoverReason || "").trim();
  if (direct) return direct;
  const events = Array.isArray(run.events) ? run.events : [];
  for (let index = events.length - 1; index >= 0; index -= 1) {
    const event = events[index]?.event || {};
    const message = String(event?.data?.message || event?.ui?.summary || "").trim();
    if (message) return message;
  }
  return "";
}

function isInfrastructureStatusMessage(message) {
  const normalized = String(message || "").trim().toLowerCase();
  if (!normalized) return false;
  return [
    "binary host accepted the request.",
    "binary host is contacting the hosted assist transport.",
    "binary host retrying a transient hosted transport failure.",
    "binary host is falling back to the local openhands gateway because the hosted assist transport is temporarily unavailable.",
    "binary host received the initial assist response.",
    "binary host completed the run.",
    "binary answered directly on the fast chat route.",
  ].includes(normalized);
}

async function dumpUiDebugSnapshot(reason, extra = {}) {
  if (!window.binaryDesktop?.dumpUiDebug) return;
  try {
    await window.binaryDesktop.dumpUiDebug({
      reason,
      activeRunId: state.activeRunId,
      activeAssistantTurnId: state.activeAssistantTurnId,
      assistantText: state.assistantText,
      streamStatusText: state.streamStatusText,
      activeStream: state.activeStream,
      currentTaskDraft: state.currentTaskDraft,
      currentRunStatus: state.currentRun?.status || null,
      currentRunFinal: state.currentRun?.finalEnvelope?.final || state.currentRun?.final || null,
      currentRunClosureSummary:
        state.currentRun?.finalEnvelope?.closureSummary ||
        state.currentRun?.closureSummary ||
        state.closureState?.closureSummary ||
        null,
      transcript: state.transcript,
      extra,
    });
  } catch {}
}

function buildClosureBadges() {
  if (!state.closureState?.closurePhase) return "";
  const phase = state.closureState.closurePhase;
  const label = phase.replace(/_/g, " ");
  const kind =
    phase === "blocked"
      ? "warning"
      : phase === "complete"
        ? "safe"
        : phase === "verification" || phase === "closeout" || phase === "final_summary"
          ? "neutral"
          : "subtle";
  return `<div class="status-pill-row"><span class="status-pill status-pill--${kind}">${escapeHtml(label)}</span></div>`;
}

function buildClosureDetails() {
  const closure = state.closureState;
  if (!closure) return "";
  const items = closure.unfinishedChecklistItems || [];
  const checklist = items.length
    ? `<ul class="closure-list">${items
        .slice(0, 6)
        .map((item) => `<li>${escapeHtml(item)}</li>`)
        .join("")}</ul>`
    : "";
  const notes = [
    closure.lastMeaningfulProof ? `Last proof: ${closure.lastMeaningfulProof}` : "",
    closure.nextDeterministicAction ? `Next: ${closure.nextDeterministicAction}` : "",
  ]
    .filter(Boolean)
    .map((line) => `<p class="assistant-subcopy">${escapeHtml(line)}</p>`)
    .join("");
  if (!checklist && !notes) return "";
  return `<div class="closure-card">${checklist}${notes}</div>`;
}

function buildVisibilityWarning(execution) {
  if (!execution || execution.executionVisibility !== "visible_required") return "";
  const reason =
    String(execution.visibleFallbackReason || "").trim() ||
    "Binary needs a visible foreground step because no background-safe route can finish this move.";
  return `
    <div class="closure-card">
      <p class="assistant-subcopy">Visible interaction required</p>
      <p class="assistant-subcopy">${escapeHtml(reason)}</p>
    </div>
  `;
}

function buildCompletionReceipt() {
  const run = state.currentRun || currentRunSummary();
  const closurePhase = String(state.closureState?.closurePhase || "").trim();
  if (!run || run.status !== "completed" || closurePhase !== "complete") return "";
  const checklist = Array.isArray(run.finalEnvelope?.objectiveState?.completionChecklist)
    ? run.finalEnvelope.objectiveState.completionChecklist
    : [];
  const completed = checklist
    .filter((item) => item?.status === "completed")
    .slice(0, 5)
    .map((item) => String(item?.label || item?.id || "Completed item"));
  const proofHighlights = Array.from(
    new Set(
      checklist
        .filter((item) => item?.status === "completed")
        .flatMap((item) => (Array.isArray(item?.observedProof) ? item.observedProof : []))
        .map((item) => String(item || "").trim())
        .filter(Boolean)
    )
  ).slice(0, 4);
  const lines = [
    state.closureState?.closureSummary ? String(state.closureState.closureSummary) : "",
    proofHighlights.length ? `Proof: ${proofHighlights.join(" • ")}` : "",
    run.lastExecutionState?.executionVisibility === "visible_required" ? "Visible interaction was used intentionally." : "",
  ].filter(Boolean);
  if (!completed.length && !lines.length) return "";
  return `
    <div class="closure-card">
      <p class="assistant-subcopy">Completion receipt</p>
      ${completed.length ? `<ul class="closure-list">${completed.map((item) => `<li>${escapeHtml(item)}</li>`).join("")}</ul>` : ""}
      ${lines.map((line) => `<p class="assistant-subcopy">${escapeHtml(line)}</p>`).join("")}
    </div>
  `;
}

function buildAssistantCopy() {
  const run = state.currentRun || currentRunSummary();
  const runAssistantResponse = extractAssistantResponse(run);
  if (runAssistantResponse) return runAssistantResponse;
  if (state.assistantText && !isInfrastructureStatusMessage(state.assistantText)) return state.assistantText;
  const narration = buildAssistantNarrationText();
  if (narration) return narration;
  if (run?.status === "failed") {
    const failedMessage = extractRunFailureMessage(run);
    if (failedMessage) return failedMessage;
  }
  if (state.activeStream) return ASSISTANT_WAITING_COPY;
  if (isInfrastructureStatusMessage(state.streamStatusText)) return ASSISTANT_WAITING_COPY;
  if (state.streamStatusText) return state.streamStatusText;
  if (state.takeoverState?.reason) return state.takeoverState.reason;
  if (run?.status && !isTerminalStatus(run.status) && state.closureState?.closureSummary) return state.closureState.closureSummary;
  return ASSISTANT_IDLE_COPY;
}

function buildAssistantQuickActions() {
  return `
    <div class="assistant-quick-actions" aria-label="Assistant actions">
      <button class="assistant-quick-action" type="button" aria-label="Copy response">
        <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 9h9v9H9zM6 15H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v1" /></svg>
      </button>
    </div>
  `;
}

function buildAssistantMessage(copy, extras = "") {
  return `
    <article class="message message--assistant">
      <div class="assistant-shell">
        <div class="assistant-avatar" aria-hidden="true">
          <span class="assistant-avatar__eye"></span>
          <span class="assistant-avatar__eye"></span>
        </div>
        <div class="assistant-body assistant-body--plain">
          <p class="assistant-copy assistant-copy--plain">${escapeHtml(copy)}</p>
          ${extras}
        </div>
      </div>
    </article>
  `;
}

function renderLandingState() {
  setView("landing");
  el.conversation.innerHTML = "";
  renderStatusMeta();
}

function renderConversation() {
  const run = currentRunSummary();
  const shouldShowChat = Boolean(
    state.transcript.length ||
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
  const assistantCopy = buildAssistantCopy();
  const shouldStickToBottom = isConversationNearBottom() || state.activeStream || state.autoScrollConversation;
  const executionSummary = summarizeExecutionState(state.currentExecution);
  const subtleLines = [];
  if (executionSummary && state.activeStream) subtleLines.push(executionSummary);
  if (state.latestToolSummaries[0] && state.activeStream) subtleLines.push(state.latestToolSummaries[0]);
  if (state.connections.filter((connection) => connection.enabled).length) {
    subtleLines.push(
      `Using ${state.connections.filter((connection) => connection.enabled).length} connection${
        state.connections.filter((connection) => connection.enabled).length === 1 ? "" : "s"
      }`
    );
  }
  const subtleStatus = subtleLines.length
    ? `<p class="assistant-subcopy">${escapeHtml(subtleLines.join(" - "))}</p>`
    : "";
  const executionBadges = state.activeStream ? buildExecutionBadges(state.currentExecution) : "";
  const closureBadges = buildClosureBadges();
  const visibilityWarning = buildVisibilityWarning(state.currentExecution);
  const completionReceipt = buildCompletionReceipt();
  const latestAssistantTurn = getLastAssistantTurn();
  const latestAssistantTurnId = latestAssistantTurn?.id || null;
  const renderedTranscript = state.transcript.filter((turn) => {
    if (turn.role !== "assistant") return true;
    if (turn.text && String(turn.text).trim()) return true;
    if (turn.id === state.activeAssistantTurnId) return true;
    if (turn.id === latestAssistantTurnId && run && !isTerminalStatus(run.status)) return true;
    return false;
  });

  el.conversation.innerHTML = renderedTranscript
    .map((turn) => {
      if (turn.role === "user") {
        return `
          <article class="message message--user">
            <h1 class="message__title">${escapeHtml(turn.text)}</h1>
          </article>
        `;
      }

      const visibleAssistantCopy = turn.text
        ? turn.text
        : turn.id === state.activeAssistantTurnId
          ? assistantCopy
          : run && !isTerminalStatus(run.status)
            ? ASSISTANT_WAITING_COPY
            : "";

      if (!visibleAssistantCopy) return "";

      return buildAssistantMessage(visibleAssistantCopy, "");
    })
    .join("");

  renderStatusMeta();
  autoScrollConversation(shouldStickToBottom);
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

function summarizeWorldValue(value) {
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  if (value == null) return "unknown";
  if (Array.isArray(value)) {
    return value
      .slice(0, 3)
      .map((item) => summarizeWorldValue(item))
      .filter(Boolean)
      .join(", ");
  }
  if (typeof value === "object") {
    return Object.entries(value)
      .slice(0, 2)
      .map(([key, item]) => `${key}: ${summarizeWorldValue(item)}`)
      .join(", ");
  }
  return String(value);
}

function toFriendlyLabel(value) {
  const raw = String(value || "").trim();
  if (!raw) return "";
  const overrides = {
    active_task: "Current task",
    active_workspace: "Open folder",
    active_repo: "Project folder",
    active_page: "Open page",
    active_window: "Open app",
    active_terminal_session: "Terminal",
    focus_state: "Attention mode",
    browser_native: "Web",
    visible_desktop: "Desktop",
    terminal: "Terminal",
    repo_context: "Project files",
    browser_workflow: "Web activity",
    repo_validation: "Project check",
    repo_analysis: "Project review",
    binary_inspection: "File check",
    desktop_workflow: "Desktop activity",
    tool_flow: "Tool activity",
    open: "In progress",
    in_progress: "In progress",
    blocked: "Needs help",
    completed: "Done",
    contradicted: "Needs re-checking",
    stale: "May be out of date",
    expired: "Out of date",
  };
  if (Object.prototype.hasOwnProperty.call(overrides, raw)) {
    return overrides[raw];
  }
  return raw.replace(/_/g, " ").replace(/\b\w/g, (char) => char.toUpperCase());
}

function summarizeWorldBelief(belief) {
  const kind = toFriendlyLabel(belief?.kind || "belief");
  const value = summarizeWorldValue(belief?.value);
  const status = String(belief?.status || "").trim();
  return [kind, value, status && status !== "active" ? toFriendlyLabel(status) : ""].filter(Boolean).join(" • ");
}

function summarizeWorldGoal(goal) {
  const title = String(goal?.title || "Goal").trim();
  const status = toFriendlyLabel(goal?.status || "open");
  const progress = Number.isFinite(Number(goal?.progress))
    ? Number(goal.progress) >= 0.95
      ? "Almost done"
      : Number(goal.progress) >= 0.5
        ? "Making progress"
        : "Just getting started"
    : "";
  const blockedReason = String(goal?.blockedReason || "").trim();
  return [title, status, progress, blockedReason].filter(Boolean).join(" • ");
}

function summarizeWorldEpisode(episode) {
  const label = String(episode?.label || episode?.kind || "Episode").trim();
  const kind = toFriendlyLabel(episode?.kind || "");
  const status = toFriendlyLabel(episode?.status || "");
  return [label, kind, status].filter(Boolean).join(" • ");
}

function summarizeWorldAttention(item) {
  return String(item?.summary || toFriendlyLabel(item?.kind || "Attention item")).trim();
}

function renderWorldModelSection(title, items, formatter) {
  if (!Array.isArray(items) || !items.length) return "";
  return `
    <div class="world-model-section">
      <div class="world-model-section__title">${escapeHtml(title)}</div>
      <div class="world-model-list">
        ${items
          .slice(0, 4)
          .map((item) => `<span>${escapeHtml(formatter(item))}</span>`)
          .join("")}
      </div>
    </div>
  `;
}

function renderWorldModelStatus() {
  const summary = state.worldModel;
  if (!summary || !el.worldModelStatus) {
    if (el.worldModelStatus) {
      el.worldModelStatus.innerHTML = `
        <strong>Status unavailable</strong>
        <span>Binary will show what it notices, what it plans next, and anything that may need your attention here.</span>
      `;
    }
    return;
  }

  const activeBits = [
    summary.activeContext?.machineRoot,
    summary.activeContext?.focusedWorkspace,
    summary.activeContext?.focusedRepo,
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
  const topRoute = Array.isArray(summary.routeRecommendations) ? summary.routeRecommendations[0] : null;
  const goals = Array.isArray(summary.activeGoals) ? summary.activeGoals : [];
  const beliefs = Array.isArray(summary.distilledBeliefs) ? summary.distilledBeliefs : [];
  const episodes = Array.isArray(summary.recentEpisodes) ? summary.recentEpisodes : [];
  const attention = Array.isArray(summary.attentionQueue) ? summary.attentionQueue : [];
  const routePills = Array.isArray(summary.routeRecommendations)
    ? summary.routeRecommendations
        .slice(0, 3)
        .map((route, index) => {
          const tone =
            route?.preferred || index === 0
              ? "safe"
              : Array.isArray(route?.riskFactors) && route.riskFactors.length
              ? "warning"
                : "subtle";
          const label =
            index === 0
              ? `Best next step: ${toFriendlyLabel(route?.kind || route?.candidateId || "route")}`
              : `Also possible: ${toFriendlyLabel(route?.kind || route?.candidateId || "route")}`;
          return `<span class="status-pill status-pill--${tone}">${escapeHtml(label)}</span>`;
        })
        .join("")
    : "";

  el.worldModelStatus.innerHTML = `
    <strong>What Binary understands right now</strong>
    <span>${escapeHtml(`${summary.routineCount || 0} helpful patterns learned • ${summary.goalCount || 0} active goals tracked`)}</span>
    ${activeBits.length ? `<span>${escapeHtml(`Currently looking at: ${activeBits.join(" • ")}`)}</span>` : ""}
    ${affordances.length ? `<span>${escapeHtml(`Safe to do in the background: ${affordances.map((item) => toFriendlyLabel(item)).join(", ")}`)}</span>` : ""}
    ${routePills ? `<div class="status-pill-row">${routePills}</div>` : ""}
    ${
      topRoute?.kind
        ? `<span>${escapeHtml(`Binary plans to use: ${toFriendlyLabel(topRoute.kind)}`)}</span>`
        : ""
    }
    ${topRoute?.reason ? `<span>${escapeHtml(topRoute.reason)}</span>` : ""}
    ${recentChange ? `<span>${escapeHtml(`Latest update: ${recentChange}`)}</span>` : ""}
    <div class="world-model-grid">
      ${renderWorldModelSection("What Binary is working on", goals, summarizeWorldGoal)}
      ${renderWorldModelSection("What Binary notices", beliefs, summarizeWorldBelief)}
      ${renderWorldModelSection("Recent activity", episodes, summarizeWorldEpisode)}
      ${renderWorldModelSection("May need your attention", attention, summarizeWorldAttention)}
    </div>
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

function clampBinaryLength(value) {
  const parsed = Number.parseInt(String(value || "256"), 10);
  if (!Number.isFinite(parsed)) return 256;
  return Math.max(1, Math.min(65536, parsed));
}

function renderBinaryInspector() {
  if (!el.binaryInspectorCard || !el.binaryPreview) return;
  const inspector = state.binaryInspector || {};
  const descriptor = inspector.descriptor;
  const analysis = inspector.analysis;
  const chunk = inspector.chunk;
  if (!inspector.path) {
    el.binaryInspectorCard.innerHTML = `
      <strong>No binary target selected</strong>
      <span>Choose a file or enter an absolute path to inspect byte ranges safely.</span>
    `;
    el.binaryPreview.textContent = "Hex and ASCII previews will appear here.";
    return;
  }
  const riskClass = descriptor?.riskClass || analysis?.riskClass || "unknown";
  const hashValue = descriptor?.sha256 || analysis?.sha256 || "Unavailable";
  const summaryBits = [
    descriptor?.exists === false ? "Missing target" : "",
    descriptor?.isRegularFile === false && descriptor?.exists ? "Not a regular file" : "",
    descriptor?.formatFamily ? `Format: ${descriptor.formatFamily}` : "",
    descriptor?.artifactKind ? `Kind: ${descriptor.artifactKind.replace(/_/g, " ")}` : "",
    descriptor?.size != null ? `Size: ${descriptor.size} bytes` : "",
    riskClass ? `Risk: ${riskClass}` : "",
  ].filter(Boolean);
  const approvalCopy =
    riskClass === "critical"
      ? "Critical binary targets stay blocked from autonomous mutation in v1."
      : riskClass === "high"
        ? "High-risk binary writes require explicit approval and dry-run proof."
        : "";
  const stringsSample = Array.isArray(analysis?.stringsSample) && analysis.stringsSample.length
    ? analysis.stringsSample.slice(0, 4).join(" | ")
    : "";
  el.binaryInspectorCard.innerHTML = `
    <strong>${escapeHtml(inspector.path)}</strong>
    <span>${escapeHtml(summaryBits.join(" • ") || "Binary metadata ready.")}</span>
    <span>${escapeHtml(`SHA-256: ${hashValue}`)}</span>
    ${stringsSample ? `<span>${escapeHtml(`Strings: ${stringsSample}`)}</span>` : ""}
    ${approvalCopy ? `<span>${escapeHtml(approvalCopy)}</span>` : ""}
    ${inspector.error ? `<span>${escapeHtml(inspector.error)}</span>` : ""}
  `;
  el.binaryPreview.textContent = chunk
    ? [
        `Offset: ${chunk.offset}  Length: ${chunk.length}  Truncated: ${chunk.truncated ? "yes" : "no"}`,
        "",
        "HEX",
        chunk.hexPreview || "(empty)",
        "",
        "ASCII",
        chunk.asciiPreview || "(empty)",
      ].join("\n")
    : "No binary chunk loaded yet.";
  el.binaryPrevChunk.disabled = !chunk || chunk.offset <= 0;
  el.binaryNextChunk.disabled = !chunk || !chunk.truncated;
}

async function refreshBinaryInspector(options = {}) {
  const targetPath = el.binaryPathInput?.value.trim() || "";
  const resetOffset = options.resetOffset !== false;
  const offset = resetOffset
    ? 0
    : Math.max(0, Number.parseInt(el.binaryOffsetInput?.value || "0", 10) || 0);
  const length = clampBinaryLength(el.binaryLengthInput?.value || "256");
  state.binaryInspector = {
    ...state.binaryInspector,
    path: targetPath,
    offset,
    length,
    error: "",
  };
  if (el.binaryOffsetInput) el.binaryOffsetInput.value = String(offset);
  if (el.binaryLengthInput) el.binaryLengthInput.value = String(length);
  if (!targetPath) {
    state.binaryInspector = {
      ...state.binaryInspector,
      descriptor: null,
      analysis: null,
      chunk: null,
      error: "",
    };
    renderBinaryInspector();
    return;
  }
  try {
    const [descriptorResult, analysisResult, chunkResult] = await Promise.all([
      requestJson("/v1/binary/stat", { method: "POST", body: { path: targetPath } }),
      requestJson("/v1/binary/analyze", { method: "POST", body: { path: targetPath } }).catch(() => null),
      requestJson("/v1/binary/read-chunk", {
        method: "POST",
        body: { path: targetPath, offset, length },
      }).catch(() => null),
    ]);
    state.binaryInspector = {
      ...state.binaryInspector,
      descriptor: descriptorResult?.data || null,
      analysis: analysisResult?.data || null,
      chunk: chunkResult?.data || null,
      error: "",
    };
  } catch (error) {
    state.binaryInspector = {
      ...state.binaryInspector,
      descriptor: null,
      analysis: null,
      chunk: null,
      error: error instanceof Error ? error.message : String(error),
    };
  }
  renderBinaryInspector();
}

async function hashSelectedBinary() {
  const targetPath = el.binaryPathInput?.value.trim() || "";
  if (!targetPath) return;
  try {
    const response = await requestJson("/v1/binary/hash", {
      method: "POST",
      body: { path: targetPath },
    });
    state.binaryInspector = {
      ...state.binaryInspector,
      path: targetPath,
      descriptor: response?.data || null,
      error: "",
    };
  } catch (error) {
    state.binaryInspector = {
      ...state.binaryInspector,
      error: error instanceof Error ? error.message : String(error),
    };
  }
  renderBinaryInspector();
}

async function shiftBinaryChunk(direction) {
  const chunk = state.binaryInspector?.chunk;
  if (!chunk) return;
  const nextOffset = direction < 0
    ? Math.max(0, chunk.offset - state.binaryInspector.length)
    : Math.max(0, chunk.offset + chunk.length);
  if (el.binaryOffsetInput) el.binaryOffsetInput.value = String(nextOffset);
  await refreshBinaryInspector({ resetOffset: false });
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

  if (!el.threadList) return;
  if (!state.runs.length) {
    el.threadList.classList.add("empty");
    el.threadList.textContent = "No threads yet.";
    return;
  }
  const activeId = currentRunSummary()?.id || state.activeRunId || "";
  el.threadList.classList.remove("empty");
  el.threadList.innerHTML = state.runs
    .slice(0, 12)
    .map((run) => {
      const task = String(run.request?.task || run.id || "Untitled thread");
      const tone =
        run.status === "completed"
          ? "thread-item__status--safe"
          : run.status === "failed" || run.status === "cancelled"
            ? "thread-item__status--danger"
            : "thread-item__status--neutral";
      return `
        <button class="thread-item${run.id === activeId ? " thread-item--active" : ""}" data-run-id="${escapeHtml(run.id)}" type="button">
          <span class="thread-item__title">${escapeHtml(task)}</span>
          <span class="thread-item__meta">
            <span class="thread-item__status ${tone}">${escapeHtml(run.status || "queued")}</span>
            <span class="thread-item__time">${escapeHtml(run.updatedAt || run.createdAt || "")}</span>
          </span>
        </button>
      `;
    })
    .join("");
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

function describeAutomationTrigger(trigger) {
  if (!trigger || typeof trigger !== "object") return "Manual";
  if (trigger.kind === "schedule_nl") return `Schedule - ${trigger.scheduleText || "every hour"}`;
  if (trigger.kind === "file_event") return `File event - ${trigger.workspaceRoot || "workspace"}`;
  if (trigger.kind === "process_event") return `Process event - ${trigger.query || "query"}`;
  if (trigger.kind === "notification") return `Notification - ${trigger.topic || trigger.query || "any"}`;
  return "Manual";
}

function fillAutomationEditor(automation = null) {
  state.automationEditorId = automation?.id || null;
  el.automationNameInput.value = automation?.name || "";
  el.automationPromptInput.value = automation?.prompt || "";
  el.automationTriggerSelect.value = automation?.trigger?.kind || "manual";
  el.automationPolicySelect.value = automation?.policy || "autonomous";
  el.automationWorkspaceInput.value = automation?.workspaceRoot || automation?.trigger?.workspaceRoot || "";
  if (automation?.trigger?.kind === "schedule_nl") {
    el.automationDetailInput.value = automation.trigger.scheduleText || "";
  } else if (automation?.trigger?.kind === "process_event") {
    el.automationDetailInput.value = automation.trigger.query || "";
  } else if (automation?.trigger?.kind === "notification") {
    el.automationDetailInput.value = automation.trigger.topic || automation.trigger.query || "";
  } else {
    el.automationDetailInput.value = "";
  }
  el.saveAutomation.textContent = automation ? "Update automation" : "Save automation";
}

function renderAutomations() {
  renderHistoryList(
    el.automationList,
    state.automations,
    "No automations yet.",
    (automation) => `
      <article>
        <strong>${escapeHtml(automation.name)}</strong>
        <span>${escapeHtml(describeAutomationTrigger(automation.trigger))}</span>
        <span>${escapeHtml(`${automation.status} - ${automation.deliveryHealth || "idle"}${automation.nextRunAt ? ` - next ${automation.nextRunAt}` : ""}`)}</span>
        ${automation.lastTriggerSummary ? `<span>${escapeHtml(automation.lastTriggerSummary)}</span>` : ""}
        <div class="button-row">
          <button data-automation-action="run" data-automation-id="${escapeHtml(automation.id)}" type="button">Run</button>
          <button data-automation-action="${automation.status === "paused" ? "resume" : "pause"}" data-automation-id="${escapeHtml(automation.id)}" class="button-secondary" type="button">${automation.status === "paused" ? "Resume" : "Pause"}</button>
          <button data-automation-action="edit" data-automation-id="${escapeHtml(automation.id)}" class="button-secondary" type="button">Edit</button>
          <button data-automation-action="timeline" data-automation-id="${escapeHtml(automation.id)}" class="button-secondary" type="button">Timeline</button>
        </div>
      </article>
    `
  );
}

function renderWebhookSubscriptions() {
  renderHistoryList(
    el.webhookList,
    state.webhookSubscriptions,
    "No webhook subscriptions yet.",
    (subscription) => `
      <article>
        <strong>${escapeHtml(subscription.url)}</strong>
        <span>${escapeHtml(`${subscription.status} - failures ${subscription.failureCount || 0}`)}</span>
        ${subscription.events?.length ? `<span>${escapeHtml(subscription.events.join(", "))}</span>` : ""}
      </article>
    `
  );
}

function fillConnectionEditor(connection = null) {
  state.connectionEditorId = connection?.id || null;
  el.connectionNameInput.value = connection?.name || "";
  el.connectionTransportSelect.value = connection?.transport || "http";
  el.connectionAuthSelect.value = connection?.authMode || "none";
  el.connectionUrlInput.value = connection?.url || "";
  el.connectionSecretInput.value = "";
  el.connectionHeaderNameInput.value = connection?.headerName || "X-API-Key";
  if (!connection) {
    el.connectionImportPathInput.value = "";
  }
  el.saveConnection.textContent = connection ? "Update connection" : "Connect service";
}

function currentProviderCatalogEntry() {
  const selectedId = String(el.providerSelect.value || "").trim();
  return state.providerCatalog.find((item) => item.id === selectedId) || null;
}

function currentProviderProfile() {
  const selectedId = String(el.providerSelect.value || "").trim();
  return state.providers.find((item) => item.id === selectedId) || null;
}

function syncProviderEditorFromSelection() {
  const catalog = currentProviderCatalogEntry();
  const profile = currentProviderProfile();
  if (!catalog) return;
  el.providerModelInput.placeholder = catalog.defaultModel || "gpt-5.4";
  el.providerBaseUrlInput.placeholder = catalog.defaultBaseUrl || "https://api.openai.com/v1";
  if (profile) {
    el.providerModelInput.value = profile.configuredModel || profile.defaultModel || catalog.defaultModel || "";
    el.providerBaseUrlInput.value = profile.configuredBaseUrl || profile.defaultBaseUrl || catalog.defaultBaseUrl || "";
  } else {
    el.providerModelInput.value = catalog.defaultModel || "";
    el.providerBaseUrlInput.value = catalog.defaultBaseUrl || "";
  }
  const browserAuthSupported =
    catalog.connectionMode === "direct_oauth_pkce" ||
    catalog.connectionMode === "direct_oauth_device" ||
    catalog.connectionMode === "hub_oauth" ||
    catalog.connectionMode === "portal_session" ||
    catalog.connectionMode === "local_credential_adapter";
  const browserSessionSupported =
    catalog.connectionMode === "portal_session" || catalog.connectionMode === "local_credential_adapter";
  if (profile?.linkedAccountLabel) {
    el.providerAuthStatus.innerHTML = `<strong>${escapeHtml(profile.linkedAccountLabel)}</strong><span>${escapeHtml(profile.runtimeReady === false ? (profile.runtimeReadinessReason || profile.routeLabel || "Binary linked this browser account locally.") : (profile.routeLabel || "Binary can use this linked account immediately."))}</span>`;
  } else if (browserAuthSupported) {
    el.providerAuthStatus.innerHTML = `<strong>Browser auth supported</strong><span>${escapeHtml(
      profile?.lastError ||
        catalog.availabilityReason ||
        (browserSessionSupported
          ? "Binary will open the provider sign-in page and import local credentials once the provider writes them on this machine."
          : "Binary will open the provider sign-in flow in your browser and keep the linked account local.")
    )}</span>`;
  } else {
    el.providerAuthStatus.innerHTML = `<strong>Browser auth unavailable</strong><span>${escapeHtml(
      catalog.availabilityReason || "This provider still requires API keys outside the true browser-auth surface."
    )}</span>`;
  }
  el.saveProvider.textContent = browserAuthSupported ? "Connect account" : "Unsupported";
  el.saveProvider.disabled = !browserAuthSupported;
  el.importProvider.disabled = !catalog.supportsLocalImport;
  el.refreshProvider.disabled = !browserAuthSupported;
}

function renderProviderSelect() {
  const current = String(el.providerSelect.value || "").trim();
  const catalog = Array.isArray(state.providerCatalog) ? state.providerCatalog : [];
  el.providerSelect.innerHTML = catalog
    .map(
      (provider) =>
        `<option value="${escapeHtml(provider.id)}">${escapeHtml(provider.displayName)}${provider.beta ? " (Beta)" : ""}</option>`
    )
    .join("");
  if (current && catalog.some((item) => item.id === current)) {
    el.providerSelect.value = current;
  } else if (catalog.length) {
    const preferred =
      state.providers.find((item) => item.isDefault)?.id ||
      state.providers.find((item) => item.connected)?.id ||
      catalog[0].id;
    el.providerSelect.value = preferred;
  }
  syncProviderEditorFromSelection();
}

function renderProviders() {
  renderProviderSelect();
  renderHistoryList(
    el.providerList,
    state.providers,
    "No model providers connected yet.",
    (provider) => `
      <article>
        <strong>${escapeHtml(provider.displayName)}</strong>
        <span>${escapeHtml(`${provider.status.replace(/_/g, " ")} • ${provider.connectionMode.replace(/_/g, " ")}`)}</span>
        <span>${escapeHtml(`Model: ${provider.configuredModel || provider.defaultModel}`)}</span>
        <span>${escapeHtml(`Base URL: ${provider.configuredBaseUrl || provider.defaultBaseUrl}`)}</span>
        ${provider.linkedAccountLabel ? `<span>${escapeHtml(`Linked account: ${provider.linkedAccountLabel}`)}</span>` : ""}
        ${provider.routeLabel ? `<span>${escapeHtml(`Route: ${provider.routeLabel}`)}</span>` : ""}
        <div class="status-pill-row">
          ${provider.isDefault ? '<span class="status-pill status-pill--safe">default</span>' : ""}
          ${provider.connected ? '<span class="status-pill status-pill--safe">connected</span>' : '<span class="status-pill status-pill--subtle">needs auth</span>'}
          ${provider.supportsBrowserAuth ? '<span class="status-pill status-pill--safe">browser auth</span>' : '<span class="status-pill status-pill--subtle">api-key only</span>'}
          ${provider.supportsLocalImport ? '<span class="status-pill">import</span>' : ""}
          ${provider.runtimeReady === false ? '<span class="status-pill status-pill--warning">link only</span>' : ""}
        </div>
        ${provider.runtimeReady === false && provider.runtimeReadinessReason
          ? `<span>${escapeHtml(provider.runtimeReadinessReason)}</span>`
          : provider.lastError
            ? `<span>${escapeHtml(provider.lastError)}</span>`
            : provider.availabilityReason
              ? `<span>${escapeHtml(provider.availabilityReason)}</span>`
              : ""}
        <div class="button-row">
          <button data-provider-action="select" data-provider-id="${escapeHtml(provider.id)}" type="button">Edit</button>
          <button data-provider-action="open" data-provider-id="${escapeHtml(provider.id)}" class="button-secondary" type="button">${provider.supportsBrowserAuth ? "Open docs" : "Open docs"}</button>
          ${provider.supportsBrowserAuth ? `<button data-provider-action="login" data-provider-id="${escapeHtml(provider.id)}" type="button">Connect account</button>` : ""}
          ${provider.supportsLocalImport ? `<button data-provider-action="import" data-provider-id="${escapeHtml(provider.id)}" class="button-secondary" type="button">Import login</button>` : ""}
          <button data-provider-action="test" data-provider-id="${escapeHtml(provider.id)}" class="button-secondary" type="button">Test</button>
          ${provider.supportsBrowserAuth ? `<button data-provider-action="refresh" data-provider-id="${escapeHtml(provider.id)}" class="button-secondary" type="button">Refresh auth</button>` : ""}
          <button data-provider-action="default" data-provider-id="${escapeHtml(provider.id)}" class="button-secondary" type="button">Set default</button>
          <button data-provider-action="disconnect" data-provider-id="${escapeHtml(provider.id)}" class="button-danger" type="button">Disconnect</button>
        </div>
      </article>
    `
  );
}

function renderConnections() {
  renderHistoryList(
    el.connectionList,
    state.connections,
    "No connections yet.",
    (connection) => `
      <article>
        <strong>${escapeHtml(connection.name)}</strong>
        <span>${escapeHtml(`${connection.status.replace(/_/g, " ")} • ${connection.transport.toUpperCase()} • ${connection.authMode}`)}</span>
        <span>${escapeHtml(connection.url)}</span>
        ${connection.lastValidationError ? `<span>${escapeHtml(connection.lastValidationError)}</span>` : ""}
        <div class="button-row">
          <button data-connection-action="edit" data-connection-id="${escapeHtml(connection.id)}" type="button">Edit</button>
          <button data-connection-action="test" data-connection-id="${escapeHtml(connection.id)}" class="button-secondary" type="button">Test</button>
          <button data-connection-action="${connection.enabled ? "disable" : "enable"}" data-connection-id="${escapeHtml(connection.id)}" class="button-secondary" type="button">${connection.enabled ? "Disable" : "Enable"}</button>
          <button data-connection-action="remove" data-connection-id="${escapeHtml(connection.id)}" class="button-danger" type="button">Remove</button>
        </div>
      </article>
    `
  );
}

function renderAutomationTimeline() {
  const automation = state.automations.find((item) => item.id === state.activeAutomationId);
  if (!automation) {
    el.automationTimeline.classList.add("empty");
    el.automationTimeline.textContent = "Select an automation to inspect its event timeline.";
    return;
  }
  if (!state.activeAutomationEvents.length) {
    el.automationTimeline.classList.add("empty");
    el.automationTimeline.textContent = "No automation events yet.";
    return;
  }
  el.automationTimeline.classList.remove("empty");
  el.automationTimeline.innerHTML = state.activeAutomationEvents
    .slice()
    .reverse()
    .map((entry) => {
      const payload = entry.event || {};
      const summary = typeof payload.data?.summary === "string" ? payload.data.summary : "";
      const runId = typeof payload.data?.runId === "string" ? payload.data.runId : "";
      return `
        <article>
          <strong>${escapeHtml(payload.event || "automation.event")}</strong>
          <span>${escapeHtml(entry.capturedAt || "")}</span>
          ${summary ? `<span>${escapeHtml(summary)}</span>` : ""}
          ${runId ? `<span>${escapeHtml(`run ${runId}`)}</span>` : ""}
        </article>
      `;
    })
    .join("");
}

function stopAutomationTimelineStream() {
  if (activeAutomationTimelineAbortController) {
    activeAutomationTimelineAbortController.abort();
    activeAutomationTimelineAbortController = null;
  }
}

async function startAutomationTimelineStream(automationId) {
  stopAutomationTimelineStream();
  if (!automationId) return;

  const controller = new AbortController();
  activeAutomationTimelineAbortController = controller;
  const lastSeq = state.activeAutomationEvents.reduce((max, item) => Math.max(max, Number(item.seq || 0)), 0);

  try {
    const response = await fetch(
      `${host.baseUrl}/v1/automations/${encodeURIComponent(automationId)}/stream?after=${encodeURIComponent(String(lastSeq))}`,
      {
        method: "GET",
        signal: controller.signal,
      }
    );
    if (!response.ok || !response.body) return;

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";

    while (true) {
      const { value, done } = await reader.read();
      if (done || controller.signal.aborted) break;
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

        const parsed = JSON.parse(payload);
        const seq = Number(parsed.seq || 0);
        if (!seq || state.activeAutomationId !== automationId) continue;
        const alreadySeen = state.activeAutomationEvents.some((item) => Number(item.seq || 0) === seq);
        if (alreadySeen) continue;
        state.activeAutomationEvents = [...state.activeAutomationEvents, { seq, capturedAt: parsed.capturedAt, event: parsed }];
        renderAutomationTimeline();
      }
    }
  } catch (error) {
    if (controller.signal.aborted) return;
    console.warn("Automation timeline stream ended", error);
  } finally {
    if (activeAutomationTimelineAbortController === controller) {
      activeAutomationTimelineAbortController = null;
    }
  }
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
    if (message && !isInfrastructureStatusMessage(message)) {
      state.streamStatusText = message;
      appendAssistantNarration(`Update: ${message}`);
    }
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
    appendAssistantNarration(buildToolNarration("request", toolName, summary));
    if (execution?.interactionMode || execution?.executionVisibility) state.currentExecution = execution;
  }

  if (eventName === "tool_result") {
    const toolName = String(data?.name || "tool");
    const summary = String(data?.summary || "completed");
    pushToolSummary(toolName, summary);
    state.streamStatusText = summary;
    appendAssistantNarration(buildToolNarration("result", toolName, summary));
    if (execution?.interactionMode || execution?.executionVisibility) {
      state.currentExecution = {
        ...execution,
        executionSummary: summary,
      };
    }
  }

  if (eventName === "final" && typeof data === "string") {
    state.assistantText = data;
    updateActiveAssistantTurn(data);
    state.streamStatusText = "";
    state.assistantNarration = [];
    state.takeoverState = null;
    state.currentExecution = null;
  }

  if (eventName === "partial" && typeof data === "string") {
    state.streamStatusText = "";
    state.assistantText = data;
    updateActiveAssistantTurn(data);
  }

  if (eventName === "token" && typeof data === "string") {
    state.streamStatusText = "";
    state.assistantText = `${state.assistantText || ""}${data}`;
    updateActiveAssistantTurn(state.assistantText);
  }

  if (eventName === "host.takeover_required") {
    const reason = String(data?.reason || "Binary paused because the hosted run stopped without proving completion.");
    state.takeoverState = {
      reason,
      at: nowIso(),
      unfinishedChecklistItems: Array.isArray(data?.unfinishedChecklistItems) ? data.unfinishedChecklistItems : [],
      nextDeterministicAction: String(data?.nextDeterministicAction || "").trim(),
      lastMeaningfulProof: String(data?.lastMeaningfulProof || "").trim(),
    };
    state.streamStatusText = reason;
    appendAssistantNarration(`I need your help to continue safely. ${reason}`);
    state.closureState = extractClosureState({
      loopState: { closurePhase: data?.closurePhase || "blocked" },
      unfinishedChecklistItems: data?.unfinishedChecklistItems,
      nextDeterministicAction: data?.nextDeterministicAction,
      lastMeaningfulProof: data?.lastMeaningfulProof,
      closureSummary: data?.closureSummary || reason,
    });
  }

  if (eventName === "meta" && data?.progressState?.status) {
    state.streamStatusText = String(data.progressState.status);
    if (typeof data?.progressState?.nextDeterministicAction === "string" && data.progressState.nextDeterministicAction.trim()) {
      appendAssistantNarration(`Next I’ll ${String(data.progressState.nextDeterministicAction).trim().replace(/\.$/, "")}.`);
    }
    state.currentExecution = deriveExecutionState(data, state.currentExecution) || state.currentExecution;
    state.closureState = extractClosureState(data) || state.closureState;
  }
}

async function syncRunSummaryFromHost() {
  if (!state.activeRunId) return;
  try {
    const run = await requestJson(`/v1/runs/${encodeURIComponent(state.activeRunId)}`);
    state.currentRun = run;
    state.activeRunId = run.id;
    state.currentExecution = deriveExecutionState(run.finalEnvelope || run, run.lastExecutionState || state.currentExecution) || state.currentExecution;
    state.closureState = extractClosureState(run.finalEnvelope || run) || state.closureState;
    const assistantResponse = extractAssistantResponse(run) || (run.status === "failed" ? extractRunFailureMessage(run) : "");
    if (assistantResponse) {
      state.assistantText = assistantResponse;
      if (state.activeAssistantTurnId || state.transcript.length) {
        syncAssistantResponseIntoTranscript(assistantResponse);
      } else if (!state.transcript.length) {
        seedTranscriptFromRun(run, assistantResponse);
      }
      state.streamStatusText = "";
      const displayedAssistantCopy = buildAssistantCopy();
      if (displayedAssistantCopy !== assistantResponse) {
        void dumpUiDebugSnapshot("assistant-response-mismatch", {
          expectedAssistantResponse: assistantResponse,
          displayedAssistantCopy,
          runId: run.id,
        });
      }
    }
    if (run.status === "takeover_required") {
      state.takeoverState = {
        reason: run.takeoverReason || "Binary requested human takeover.",
        at: run.updatedAt || nowIso(),
      };
    }
    if (run.status === "failed" && assistantResponse) {
      state.takeoverState = {
        reason: assistantResponse,
        at: run.updatedAt || nowIso(),
      };
    }
    if (isTerminalStatus(run.status)) {
      void dumpUiDebugSnapshot("terminal-run-sync", {
        runId: run.id,
        status: run.status,
        assistantResponse,
      });
    }
  } catch {
    // Keep local state if refresh fails.
  }
}

async function hydrate() {
  const runtimeInfo = await window.binaryDesktop.runtimeInfo();
  state.runtimeInfo = runtimeInfo;
  host.baseUrl = runtimeInfo.hostUrl || host.baseUrl;
  const preservedMachineHome = el.machineRootInput?.value.trim() || "";
  const preservedWorkspace = el.workspaceInput.value.trim();

  try {
    const [health, auth, preferences, providerCatalogResponse, providersResponse, connectionsResponse, autonomy, worldModel, runsResponse, automationsResponse, webhooksResponse, appearance] = await Promise.all([
      requestJson("/v1/healthz"),
      requestJson("/v1/auth/status"),
      requestJson("/v1/preferences"),
      requestJson("/v1/providers/catalog"),
      requestJson("/v1/providers"),
      requestJson("/v1/connections"),
      requestJson("/v1/autonomy/status"),
      requestJson("/v1/world-model/summary"),
      requestJson("/v1/runs?limit=12"),
      requestJson("/v1/automations"),
      requestJson("/v1/webhooks/subscriptions"),
      window.binaryDesktop.getAppearance(),
    ]);

    state.auth = auth;
    state.preferences = preferences;
    state.providerCatalog = Array.isArray(providerCatalogResponse.providers) ? providerCatalogResponse.providers : [];
    state.providers = Array.isArray(providersResponse.providers) ? providersResponse.providers : [];
    state.connections = Array.isArray(connectionsResponse.connections) ? connectionsResponse.connections : [];
    state.autonomy = autonomy;
    state.worldModel = worldModel;
    state.appearance = appearance;
    state.runs = Array.isArray(runsResponse.runs) ? runsResponse.runs : [];
    state.automations = Array.isArray(automationsResponse.automations) ? automationsResponse.automations : [];
    state.webhookSubscriptions = Array.isArray(webhooksResponse.subscriptions) ? webhooksResponse.subscriptions : [];
    state.recentSessions = Array.isArray(preferences.recentSessions) ? preferences.recentSessions : [];
    state.artifactHistory = Array.isArray(preferences.artifactHistory) ? preferences.artifactHistory : [];
    if (el.machineRootInput) {
      el.machineRootInput.value = preservedMachineHome || preferences.machineRootPath || "";
      el.machineRootInput.placeholder = preferences.machineRootPath || "Machine home root";
    }
    el.workspaceInput.value = preservedWorkspace || preferences.focusWorkspaceRoot || "";
    el.workspaceInput.placeholder =
      preferences.focusWorkspaceRoot ? `Focused folder: ${preferences.focusWorkspaceRoot}` : "Choose a focused folder or repo";
    if (!el.automationWorkspaceInput.value.trim()) {
      el.automationWorkspaceInput.value = preferences.focusWorkspaceRoot || "";
    }
    el.themeSelect.value = appearance?.theme === "dark" ? "dark" : "light";
    applyTheme(appearance?.theme);

    const runtimeDetail = health.openhandsRuntime
      ? `${health.openhandsRuntime.message}${Array.isArray(health.openhandsRuntime.availableActions) && health.openhandsRuntime.availableActions.length ? ` Recovery: ${health.openhandsRuntime.availableActions.join(", ")}.` : ""}`
      : auth.maskedApiKey
        ? `API key: ${auth.maskedApiKey}`
        : "No API key stored";
    renderHostStatus(true, `Binary Host ${health.version || "connected"}`, runtimeDetail);
    renderWorldModelStatus();
    renderAutonomyStatus();
    renderBinaryInspector();
    renderRuns();
    renderRecentSessions();
    renderArtifacts();
    renderProviders();
    renderConnections();
    renderAutomations();
    renderWebhookSubscriptions();
    if (state.activeAutomationId) {
      const activeResponse = await requestJson(`/v1/automations/${encodeURIComponent(state.activeAutomationId)}/events`).catch(() => null);
      state.activeAutomationEvents = Array.isArray(activeResponse?.events) ? activeResponse.events : [];
      void startAutomationTimelineStream(state.activeAutomationId);
    } else {
      stopAutomationTimelineStream();
    }
    renderAutomationTimeline();
    renderLiveControls();
    renderConversation();
    renderPaletteActions(el.paletteSearch.value || "");
  } catch (error) {
    renderHostStatus(false, error instanceof Error ? error.message : String(error), "Build and start services/binary-host to activate the desktop shell.");
    renderWorldModelStatus();
    renderBinaryInspector();
    renderConversation();
  }
}

async function trustWorkspace() {
  const machineRootPath = getMachineHomeRoot();
  const workspace = el.workspaceInput.value.trim() || undefined;
  await requestJson("/v1/preferences", {
    method: "POST",
    body: {
      ...(machineRootPath ? { machineRootPath } : {}),
      machineRootMode: "hybrid_root",
      machineTrustMode: "full_machine_mutate",
      systemPathScope: "included",
      focusWorkspaceRoot: workspace,
      focusRepoRoot: workspace,
    },
  });
  if (workspace) {
    await requestJson("/v1/workspaces/trust", {
      method: "POST",
      body: {
        path: workspace,
        mutate: true,
        commands: "prompt",
        network: "deny",
        elevated: "deny",
      },
    }).catch(() => null);
  }
  await hydrate();
}

async function saveConnectionDefinition() {
  const name = el.connectionNameInput.value.trim();
  const url = el.connectionUrlInput.value.trim();
  if (!name || !url) return;
  const authMode = el.connectionAuthSelect.value || "none";
  const secret = el.connectionSecretInput.value.trim();
  const payload = {
    ...(state.connectionEditorId ? { id: state.connectionEditorId } : {}),
    name,
    url,
    transport: el.connectionTransportSelect.value || "http",
    authMode,
    enabled: true,
    source: state.connectionEditorId ? "guided" : "guided",
    ...(authMode === "api-key" && el.connectionHeaderNameInput.value.trim()
      ? { headerName: el.connectionHeaderNameInput.value.trim() }
      : {}),
    ...(authMode === "bearer" && secret ? { bearerToken: secret } : {}),
    ...(authMode === "api-key" && secret ? { apiKey: secret } : {}),
    ...(authMode === "oauth" ? { oauthSupported: true } : {}),
  };
  await requestJson("/v1/connections", {
    method: "POST",
    body: payload,
  });
  fillConnectionEditor();
  await hydrate();
}

async function openSelectedProviderPage(providerId = el.providerSelect.value) {
  const selected = String(providerId || "").trim();
  if (!selected) return;
  await requestJson("/v1/providers/connect/open-browser", {
    method: "POST",
    body: {
      providerId: selected,
    },
  });
}

async function waitForProviderOAuth(sessionId) {
  const startedAt = Date.now();
  while (Date.now() - startedAt < 180000) {
    await new Promise((resolve) => setTimeout(resolve, 1500));
    const response = await requestJson("/v1/providers/connect/oauth/poll", {
      method: "POST",
      body: { sessionId },
    });
    if (response?.session?.status === "connected") {
      await hydrate();
      return;
    }
    if (response?.session?.status === "failed" || response?.session?.status === "cancelled") {
      throw new Error(response?.session?.error || "Binary could not finish provider auth.");
    }
  }
  await hydrate();
}

async function waitForProviderBrowserSession(sessionId) {
  const startedAt = Date.now();
  while (Date.now() - startedAt < 180000) {
    await new Promise((resolve) => setTimeout(resolve, 1500));
    const response = await requestJson("/v1/providers/connect/browser/poll", {
      method: "POST",
      body: { sessionId },
    });
    if (response?.session?.status === "connected") {
      await hydrate();
      return;
    }
    if (response?.session?.status === "failed" || response?.session?.status === "cancelled") {
      throw new Error(response?.session?.error || "Binary could not finish browser account linking.");
    }
  }
  await hydrate();
}

async function saveProviderDefinition() {
  const providerId = String(el.providerSelect.value || "").trim();
  const catalog = currentProviderCatalogEntry();
  if (!providerId || !catalog) return;
  if (!(catalog.connectionMode === "direct_oauth_pkce" || catalog.connectionMode === "direct_oauth_device" || catalog.connectionMode === "hub_oauth" || catalog.connectionMode === "portal_session" || catalog.connectionMode === "local_credential_adapter")) {
    throw new Error(catalog.availabilityReason || "This provider does not support true browser auth in Binary.");
  }
  if (catalog.connectionMode === "portal_session" || catalog.connectionMode === "local_credential_adapter") {
    const response = await requestJson("/v1/providers/connect/browser/start", {
      method: "POST",
      body: {
        providerId,
        baseUrl: el.providerBaseUrlInput.value.trim(),
        defaultModel: el.providerModelInput.value.trim(),
        setDefault: false,
      },
    });
    await waitForProviderBrowserSession(response.session.sessionId);
    return;
  }
  const response = await requestJson("/v1/providers/connect/oauth/start", {
    method: "POST",
    body: {
      providerId,
      baseUrl: el.providerBaseUrlInput.value.trim(),
      defaultModel: el.providerModelInput.value.trim(),
      setDefault: false,
    },
  });
  await waitForProviderOAuth(response.sessionId);
}

async function importSelectedProvider(providerId = el.providerSelect.value) {
  const selected = String(providerId || "").trim();
  if (!selected) return;
  await requestJson("/v1/providers/connect/import-local", {
    method: "POST",
    body: {
      providerId: selected,
      baseUrl: el.providerBaseUrlInput.value.trim(),
      defaultModel: el.providerModelInput.value.trim(),
      setDefault: false,
    },
  });
  await hydrate();
}

async function testSelectedProvider(providerId = el.providerSelect.value) {
  const selected = String(providerId || "").trim();
  if (!selected) return;
  await requestJson(`/v1/providers/${encodeURIComponent(selected)}/test`, {
    method: "POST",
  });
  await hydrate();
}

async function refreshSelectedProvider(providerId = el.providerSelect.value) {
  const selected = String(providerId || "").trim();
  if (!selected) return;
  await requestJson(`/v1/providers/${encodeURIComponent(selected)}/refresh`, {
    method: "POST",
  });
  await hydrate();
}

async function setSelectedProviderDefault(providerId = el.providerSelect.value) {
  const selected = String(providerId || "").trim();
  if (!selected) return;
  await requestJson(`/v1/providers/${encodeURIComponent(selected)}/default`, {
    method: "POST",
  });
  await hydrate();
}

async function disconnectSelectedProvider(providerId = el.providerSelect.value) {
  const selected = String(providerId || "").trim();
  if (!selected) return;
  await requestJson(`/v1/providers/${encodeURIComponent(selected)}`, {
    method: "DELETE",
  });
  await hydrate();
}

async function addWebStarterConnection() {
  await requestJson("/v1/connections", {
    method: "POST",
    body: {
      name: "Browse websites",
      url: "http://127.0.0.1:8081/sse",
      transport: "sse",
      authMode: "none",
      enabled: true,
      source: "starter",
    },
  });
  await hydrate();
}

async function testSelectedConnection() {
  if (!state.connectionEditorId) return;
  await requestJson(`/v1/connections/${encodeURIComponent(state.connectionEditorId)}/test`, {
    method: "POST",
  });
  await hydrate();
}

async function importConnectionConfig() {
  const targetPath = el.connectionImportPathInput.value.trim();
  if (!targetPath) return;
  const raw = await window.binaryDesktop.readTextFile(targetPath);
  await requestJson("/v1/connections/import", {
    method: "POST",
    body: {
      raw,
      importedFrom: targetPath,
    },
  });
  fillConnectionEditor();
  await hydrate();
}

async function controlConnection(action, connectionId) {
  if (!connectionId) return;
  if (action === "remove") {
    await requestJson(`/v1/connections/${encodeURIComponent(connectionId)}`, {
      method: "DELETE",
    });
  } else if (action === "test") {
    await requestJson(`/v1/connections/${encodeURIComponent(connectionId)}/test`, {
      method: "POST",
    });
  } else if (action === "enable" || action === "disable") {
    await requestJson(`/v1/connections/${encodeURIComponent(connectionId)}/${action}`, {
      method: "POST",
    });
  }
  if (state.connectionEditorId === connectionId && action === "remove") {
    fillConnectionEditor();
  }
  await hydrate();
}

function buildAutomationTrigger() {
  const kind = el.automationTriggerSelect.value;
  const workspaceRoot = el.automationWorkspaceInput.value.trim() || el.workspaceInput.value.trim() || undefined;
  const detail = el.automationDetailInput.value.trim();
  if (kind === "schedule_nl") {
    return {
      kind,
      scheduleText: detail || "every hour",
      ...(workspaceRoot ? { workspaceRoot } : {}),
    };
  }
  if (kind === "file_event") {
    return {
      kind,
      workspaceRoot: workspaceRoot || el.workspaceInput.value.trim(),
    };
  }
  if (kind === "process_event") {
    return {
      kind,
      query: detail || "chrome",
      ...(workspaceRoot ? { workspaceRoot } : {}),
    };
  }
  if (kind === "notification") {
    return {
      kind,
      ...(workspaceRoot ? { workspaceRoot } : {}),
      ...(detail ? { topic: detail } : {}),
    };
  }
  return {
    kind: "manual",
    ...(workspaceRoot ? { workspaceRoot } : {}),
  };
}

async function saveAutomationDefinition() {
  const name = el.automationNameInput.value.trim();
  const prompt = el.automationPromptInput.value.trim();
  if (!name || !prompt) return;
  const payload = {
    name,
    prompt,
    trigger: buildAutomationTrigger(),
    policy: el.automationPolicySelect.value,
    status: "active",
    workspaceRoot: el.automationWorkspaceInput.value.trim() || el.workspaceInput.value.trim() || undefined,
  };
  if (state.automationEditorId) {
    await requestJson(`/v1/automations/${encodeURIComponent(state.automationEditorId)}`, {
      method: "PATCH",
      body: payload,
    });
  } else {
    await requestJson("/v1/automations", {
      method: "POST",
      body: payload,
    });
  }
  fillAutomationEditor();
  await hydrate();
}

async function saveWebhookSubscription() {
  const url = el.webhookUrlInput.value.trim();
  if (!url) return;
  const events = el.webhookEventsInput.value
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
  await requestJson("/v1/webhooks/subscriptions", {
    method: "POST",
    body: {
      url,
      events,
    },
  });
  el.webhookUrlInput.value = "";
  el.webhookEventsInput.value = "";
  await hydrate();
}

async function loadAutomationTimeline(automationId) {
  if (!automationId) return;
  const response = await requestJson(`/v1/automations/${encodeURIComponent(automationId)}/events`);
  state.activeAutomationId = automationId;
  state.activeAutomationEvents = Array.isArray(response.events) ? response.events : [];
  renderAutomationTimeline();
  void startAutomationTimelineStream(automationId);
  openSheet(el.historySheet);
}

async function controlAutomation(action, automationId) {
  if (!automationId) return;
  if (action === "run") {
    const run = await requestJson(`/v1/automations/${encodeURIComponent(automationId)}/run`, {
      method: "POST",
      body: {},
    });
    state.activeRunId = run.id || state.activeRunId;
  } else {
    await requestJson(`/v1/automations/${encodeURIComponent(automationId)}/control`, {
      method: "POST",
      body: {
        action: action === "resume" ? "resume" : "pause",
      },
    });
  }
  await hydrate();
  if (state.activeAutomationId === automationId) {
    await loadAutomationTimeline(automationId);
  }
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
      allowWholeMachineAccess: false,
      allowDesktopObservation: true,
      allowBrowserNative: true,
      allowEventAgents: true,
      allowElevation: false,
      allowUrlOpen: true,
      focusPolicy: "never_steal",
      sessionPolicy: "attach_carefully",
      allowVisibleFallback: false,
      autonomyPosture: "guarded",
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
  appendTranscriptTurn("user", task);
  const assistantTurn = appendTranscriptTurn("assistant", "");
  state.activeAssistantTurnId = assistantTurn.id;
  state.autoScrollConversation = true;
  state.currentTaskDraft = task;
  state.assistantText = "";
  state.assistantNarration = [];
  state.streamStatusText = ASSISTANT_WAITING_COPY;
  state.latestToolSummaries = [];
  state.takeoverState = null;
  state.currentExecution = null;
  state.currentRun = {
    status: "running",
    request: { task, mode: state.assistMode },
  };
  state.activeRunId = null;
  state.streamRunId = null;
  state.activeStream = true;
  renderConversation();
  renderLiveControls();
  closeAllSheets();
  void sendFocusLease("submit", 5000);
  const machineRootPath = getMachineHomeRoot();
  const focusWorkspaceRoot = getSelectedWorkspaceRoot();

  const response = await fetch(`${host.baseUrl}/v1/runs/assist`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      task,
      mode: state.assistMode,
      model: "Binary IDE",
      speedProfile: "fast",
      ...(machineRootPath ? { machineRootPath } : {}),
      ...(focusWorkspaceRoot ? { workspaceRoot: focusWorkspaceRoot, focusWorkspaceRoot, focusRepoRoot: focusWorkspaceRoot } : {}),
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
    updateActiveAssistantTurn(state.assistantText);
  }
  state.activeAssistantTurnId = null;
  await syncRunSummaryFromHost();
  await hydrate();
}

function resetChat() {
  state.transcript = [];
  state.activeAssistantTurnId = null;
  state.currentTaskDraft = "";
  state.assistantText = "";
  state.assistantNarration = [];
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
  const input = el.landingTaskInput.value;
  const command = parseComposerCommand(input);
  if (command === "toggle_plan_mode") {
    el.landingTaskInput.value = "";
    toggleAssistMode();
    el.landingTaskInput.focus();
    return;
  }
  const task = input.trim();
  if (!task) return;
  el.landingTaskInput.value = "";
  void startRun(task);
});

el.composerForm.addEventListener("submit", (event) => {
  event.preventDefault();
  const input = el.taskInput.value;
  const command = parseComposerCommand(input);
  if (command === "toggle_plan_mode") {
    el.taskInput.value = "";
    updateComposerSubmitState();
    toggleAssistMode();
    el.taskInput.focus();
    return;
  }
  const task = input.trim();
  if (!task) return;
  el.taskInput.value = "";
  updateComposerSubmitState();
  el.taskInput.focus();
  void startRun(task);
});

el.taskInput.addEventListener("input", () => {
  updateComposerSubmitState();
});

el.conversation.addEventListener("scroll", () => {
  state.autoScrollConversation = isConversationNearBottom();
});

el.openSettingsButton.addEventListener("click", () => {
  openSheet(el.settingsSheet);
});

if (el.sidebarSettingsButton) {
  el.sidebarSettingsButton.addEventListener("click", () => {
    openSheet(el.settingsSheet);
  });
}

if (el.chooseMachineHome) {
  el.chooseMachineHome.addEventListener("click", async () => {
    const selected = await window.binaryDesktop.chooseWorkspace();
    if (selected && el.machineRootInput) {
      el.machineRootInput.value = selected;
      renderStatusMeta();
    }
  });
}

el.chooseWorkspace.addEventListener("click", async () => {
  const selected = await window.binaryDesktop.chooseWorkspace();
  if (selected) {
    el.workspaceInput.value = selected;
    renderStatusMeta();
  }
});

if (el.machineRootInput) {
  el.machineRootInput.addEventListener("input", () => {
    renderStatusMeta();
  });
}

el.workspaceInput.addEventListener("input", () => {
  renderStatusMeta();
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

el.providerSelect.addEventListener("change", () => {
  syncProviderEditorFromSelection();
});

el.openProviderPage.addEventListener("click", () => {
  void openSelectedProviderPage();
});

el.saveProvider.addEventListener("click", () => {
  void saveProviderDefinition();
});

el.importProvider.addEventListener("click", () => {
  void importSelectedProvider();
});

el.testProvider.addEventListener("click", () => {
  void testSelectedProvider();
});

el.refreshProvider.addEventListener("click", () => {
  void refreshSelectedProvider();
});

el.setDefaultProvider.addEventListener("click", () => {
  void setSelectedProviderDefault();
});

el.disconnectProvider.addEventListener("click", () => {
  void disconnectSelectedProvider();
});

el.addWebConnection.addEventListener("click", () => {
  void addWebStarterConnection();
});

el.clearConnectionEditor.addEventListener("click", () => {
  fillConnectionEditor();
});

el.saveConnection.addEventListener("click", () => {
  void saveConnectionDefinition();
});

el.testConnection.addEventListener("click", () => {
  void testSelectedConnection();
});

el.importConnectionConfig.addEventListener("click", () => {
  void importConnectionConfig();
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

if (el.chooseBinaryFile) {
  el.chooseBinaryFile.addEventListener("click", async () => {
    const selected = await window.binaryDesktop.chooseBinaryFile();
    if (!selected) return;
    el.binaryPathInput.value = selected;
    el.binaryOffsetInput.value = "0";
    void refreshBinaryInspector({ resetOffset: true });
  });
}

if (el.inspectBinary) {
  el.inspectBinary.addEventListener("click", () => {
    void refreshBinaryInspector({ resetOffset: false });
  });
}

if (el.hashBinary) {
  el.hashBinary.addEventListener("click", () => {
    void hashSelectedBinary();
  });
}

if (el.binaryPrevChunk) {
  el.binaryPrevChunk.addEventListener("click", () => {
    const currentOffset = Math.max(0, Number.parseInt(el.binaryOffsetInput.value || "0", 10) || 0);
    const length = clampBinaryLength(el.binaryLengthInput.value || "256");
    el.binaryOffsetInput.value = String(Math.max(0, currentOffset - length));
    void refreshBinaryInspector({ resetOffset: false });
  });
}

if (el.binaryNextChunk) {
  el.binaryNextChunk.addEventListener("click", () => {
    const currentOffset = Math.max(0, Number.parseInt(el.binaryOffsetInput.value || "0", 10) || 0);
    const length = clampBinaryLength(el.binaryLengthInput.value || "256");
    el.binaryOffsetInput.value = String(currentOffset + length);
    void refreshBinaryInspector({ resetOffset: false });
  });
}

if (el.binaryPathInput) {
  el.binaryPathInput.addEventListener("input", () => {
    state.binaryInspector = {
      ...state.binaryInspector,
      path: el.binaryPathInput.value.trim(),
    };
    renderBinaryInspector();
  });
}

el.newChatButton.addEventListener("click", () => {
  resetChat();
});

el.openWorkspaceSheet.addEventListener("click", () => {
  openSheet(el.settingsSheet);
});

if (el.landingWorkspaceButton) {
  el.landingWorkspaceButton.addEventListener("click", () => {
    openSheet(el.settingsSheet);
  });
}

el.openHistorySheet.addEventListener("click", () => {
  openSheet(el.historySheet);
});

for (const button of el.menuButtons) {
  button.addEventListener("click", () => {
    const action = button.dataset.menuAction || "";
    openAppMenu(action, button);
  });
}

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

el.saveAutomation.addEventListener("click", () => {
  void saveAutomationDefinition();
});

el.clearAutomationEditor.addEventListener("click", () => {
  fillAutomationEditor();
});

el.saveWebhook.addEventListener("click", () => {
  void saveWebhookSubscription();
});

document.addEventListener("click", (event) => {
  const target = event.target;
  if (!(target instanceof HTMLElement)) return;

  if (target.closest(".app-menu-button")) {
    return;
  }

  const menuItem = target.closest("[data-menu-item]");
  if (menuItem) {
    const action = menuItem.getAttribute("data-menu-item");
    closeAppMenu();
    if (action) runAppMenuAction(action);
    return;
  }

  if (target.closest(".app-menu-dropdown")) {
    return;
  }

  closeAppMenu();

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
          state.currentExecution = deriveExecutionState(run.finalEnvelope || run, run.lastExecutionState || state.currentExecution) || state.currentExecution;
          state.currentTaskDraft = run.request?.task || state.currentTaskDraft;
          state.assistantText = extractAssistantResponse(run) || state.assistantText || "";
          seedTranscriptFromRun(run, state.assistantText);
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
    return;
  }

  const automationAction = target.closest("[data-automation-action]");
  if (automationAction) {
    const action = automationAction.getAttribute("data-automation-action");
    const automationId = automationAction.getAttribute("data-automation-id");
    if (action === "edit" && automationId) {
      const automation = state.automations.find((item) => item.id === automationId);
      if (automation) {
        fillAutomationEditor(automation);
        openSheet(el.settingsSheet);
      }
      return;
    }
    if (action === "timeline" && automationId) {
      void loadAutomationTimeline(automationId);
      return;
    }
    if (action && automationId) {
      void controlAutomation(action, automationId);
    }
    return;
  }

  const connectionAction = target.closest("[data-connection-action]");
  if (connectionAction) {
    const action = connectionAction.getAttribute("data-connection-action");
    const connectionId = connectionAction.getAttribute("data-connection-id");
    if (action === "edit" && connectionId) {
      const connection = state.connections.find((item) => item.id === connectionId);
      if (connection) {
        fillConnectionEditor(connection);
        openSheet(el.settingsSheet);
      }
      return;
    }
    if (action && connectionId) {
      void controlConnection(action, connectionId);
    }
    return;
  }

  const providerAction = target.closest("[data-provider-action]");
  if (providerAction) {
    const action = providerAction.getAttribute("data-provider-action");
    const providerId = providerAction.getAttribute("data-provider-id");
    if (!providerId) return;
    el.providerSelect.value = providerId;
    syncProviderEditorFromSelection();
    if (action === "select") {
      openSheet(el.settingsSheet);
      return;
    }
    if (action === "open") {
      void openSelectedProviderPage(providerId);
      return;
    }
    if (action === "login") {
      void saveProviderDefinition();
      return;
    }
    if (action === "import") {
      void importSelectedProvider(providerId);
      return;
    }
    if (action === "test") {
      void testSelectedProvider(providerId);
      return;
    }
    if (action === "refresh") {
      void refreshSelectedProvider(providerId);
      return;
    }
    if (action === "default") {
      void setSelectedProviderDefault(providerId);
      return;
    }
    if (action === "disconnect") {
      void disconnectSelectedProvider(providerId);
    }
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
    closeAppMenu();
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
    state.currentExecution = deriveExecutionState(run.finalEnvelope || run, run.lastExecutionState || state.currentExecution) || state.currentExecution;
    state.currentTaskDraft = run.request?.task || state.currentTaskDraft;
    state.assistantText = extractAssistantResponse(run) || state.assistantText || "";
    seedTranscriptFromRun(run, state.assistantText);
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
updateComposerSubmitState();
fillConnectionEditor();
fillAutomationEditor();
renderConversation();
renderStatusMeta();
await hydrate();

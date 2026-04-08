const host = {
  baseUrl: "http://127.0.0.1:7777",
};

const state = {
  runtimeInfo: null,
  appearance: null,
  overlay: null,
  run: null,
  activeStream: false,
};

let completionTimer = null;

const el = {
  bar: document.getElementById("ambientBar"),
  composer: document.getElementById("ambientComposer"),
  input: document.getElementById("ambientInput"),
  openMain: document.getElementById("ambientOpenMain"),
  send: document.getElementById("ambientSend"),
  stateChip: document.getElementById("ambientStateChip"),
  task: document.getElementById("ambientTask"),
  step: document.getElementById("ambientStep"),
  proof: document.getElementById("ambientProof"),
  pause: document.getElementById("ambientPause"),
  resume: document.getElementById("ambientResume"),
  cancel: document.getElementById("ambientCancel"),
};

function applyTheme(theme) {
  document.documentElement.dataset.theme = theme === "dark" ? "dark" : "light";
}

function escapeHtml(value) {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
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

function nowIso() {
  return new Date().toISOString();
}

function currentStateName() {
  const run = state.run || {};
  const status = String(run.runStatus || "").toLowerCase();
  const intervention = run.intervention && typeof run.intervention === "object"
    ? run.intervention
    : null;
  if (status === "takeover_required" || status === "failed" || intervention?.visible) return "blocked";
  if (status === "completed") return "complete";
  if (String(run.confidence || "").toLowerCase() === "verifying") return "verifying";
  if (run.activeRunId || state.activeStream) return "working";
  return "ready";
}

function normalizeRunPatch(patch = {}) {
  const confidence = patch.confidence || currentStateName();
  return {
    ...state.run,
    ...patch,
    confidence,
    updatedAt: nowIso(),
  };
}

async function pushRunPatch(patch = {}) {
  state.run = normalizeRunPatch(patch);
  render();
  await window.binaryDesktop.updateRunSurfaceState(state.run);
}

function clearCompletionTimer() {
  if (completionTimer) {
    clearTimeout(completionTimer);
    completionTimer = null;
  }
}

function scheduleIdleReset() {
  clearCompletionTimer();
  completionTimer = setTimeout(() => {
    state.run = {
      activeRunId: null,
      runStatus: null,
      taskTitle: "",
      stepTitle: "Binary is ready for the next task.",
      confidence: "ready",
      proofCard: null,
      intervention: { visible: false },
      updatedAt: nowIso(),
    };
    void window.binaryDesktop.updateRunSurfaceState(state.run);
    render();
  }, 4200);
}

function render() {
  const run = state.run || {};
  const stateName = currentStateName();
  const taskTitle = run.taskTitle || "Standing by";
  const stepTitle = run.stepTitle || "Binary is ready for the next task.";
  const proofSummary = run.proofCard?.summary || run.pageTitle || run.pageDomain || "No proof yet";

  el.bar.dataset.state = stateName;
  el.stateChip.textContent = stateName === "ready" ? "Ready" : stateName === "working" ? "Working" : stateName === "verifying" ? "Verifying" : stateName === "blocked" ? "Blocked" : "Complete";
  el.task.textContent = taskTitle;
  el.step.textContent = stepTitle;
  el.proof.textContent = proofSummary;

  el.pause.disabled = !(run.activeRunId && run.runStatus === "running");
  el.resume.disabled = !(run.activeRunId && (run.runStatus === "paused" || run.runStatus === "takeover_required" || run.runStatus === "queued"));
  el.cancel.disabled = !run.activeRunId;

  el.proof.dataset.empty = proofSummary === "No proof yet" ? "true" : "false";
}

function applyEventToRun(event) {
  const eventName = String(event?.event || "");
  const data = event?.data || {};

  if (eventName === "host.status") {
    const message = String(data.message || "").trim();
    const patch = {
      activeRunId: typeof data.runId === "string" ? data.runId : state.run?.activeRunId || null,
      runStatus: "running",
      stepTitle: message || "Binary is starting the hosted run.",
      confidence: "working",
      intervention: { visible: false },
    };
    void pushRunPatch(patch);
    return;
  }

  if (eventName === "run" && typeof data?.runId === "string") {
    void pushRunPatch({
      activeRunId: data.runId,
      runStatus: "running",
      confidence: "working",
    });
    return;
  }

  if (eventName === "tool_request") {
    const toolName = String(data?.toolCall?.name || "tool").replace(/_/g, " ");
    const summary = String(data?.toolCall?.summary || "").trim() || `Using ${toolName}.`;
    void pushRunPatch({
      stepTitle: summary,
      proofCard: {
        title: "Latest action",
        summary,
      },
      confidence: summary.toLowerCase().includes("verif") ? "verifying" : "working",
    });
    return;
  }

  if (eventName === "tool_result") {
    const summary = String(data?.summary || "Completed the latest step.");
    void pushRunPatch({
      stepTitle: summary,
      proofCard: {
        title: "Proof",
        summary,
      },
      confidence: summary.toLowerCase().includes("verif") ? "verifying" : "working",
    });
    return;
  }

  if (eventName === "host.takeover_required") {
    const reason = String(data?.reason || "Binary needs your confirmation.");
    void pushRunPatch({
      runStatus: "takeover_required",
      stepTitle: reason,
      confidence: "blocked",
      intervention: {
        visible: true,
        reason,
      },
    });
    return;
  }

  if (eventName === "meta" && data?.progressState?.status) {
    const summary = String(data.progressState.status);
    void pushRunPatch({
      stepTitle: summary,
      confidence: summary.toLowerCase().includes("verif") ? "verifying" : "working",
    });
    return;
  }

  if (eventName === "final" && typeof data === "string") {
    clearCompletionTimer();
    void pushRunPatch({
      runStatus: "completed",
      stepTitle: "Finished the latest run.",
      confidence: "complete",
      proofCard: {
        title: "Result",
        summary: data.length > 140 ? `${data.slice(0, 137)}...` : data,
      },
      intervention: { visible: false },
    }).then(() => {
      scheduleIdleReset();
    });
  }
}

async function control(action, note) {
  if (!state.run?.activeRunId || !state.runtimeInfo?.hostUrl) return;
  await fetch(`${state.runtimeInfo.hostUrl}/v1/runs/${encodeURIComponent(state.run.activeRunId)}/control`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action, note }),
  });
}

async function getDefaultWorkspaceRoot() {
  try {
    const preferences = await requestJson("/v1/preferences");
    return preferences?.trustedWorkspaces?.[0]?.path || undefined;
  } catch {
    return undefined;
  }
}

async function syncRunFromHost() {
  if (!state.run?.activeRunId) return;
  try {
    const run = await requestJson(`/v1/runs/${encodeURIComponent(state.run.activeRunId)}`);
    await pushRunPatch({
      activeRunId: run.id,
      runStatus: run.status,
      taskTitle: run.request?.task || state.run?.taskTitle || "",
      stepTitle: run.takeoverReason || (run.status === "completed" ? "Finished the latest run." : state.run?.stepTitle || "Working..."),
      confidence: run.status === "completed" ? "complete" : run.status === "takeover_required" ? "blocked" : currentStateName(),
      intervention: run.status === "takeover_required"
        ? {
            visible: true,
            reason: run.takeoverReason || "Binary requested takeover.",
          }
        : { visible: false },
    });
  } catch {
    // Keep local surface state if the host record is unavailable.
  }
}

async function startRun(task) {
  clearCompletionTimer();
  state.activeStream = true;
  await pushRunPatch({
    activeRunId: null,
    runStatus: "running",
    taskTitle: task,
    stepTitle: "Binary is starting the hosted run.",
    confidence: "working",
    proofCard: null,
    intervention: { visible: false },
  });

  const workspaceRoot = await getDefaultWorkspaceRoot();
  const response = await fetch(`${host.baseUrl}/v1/runs/assist`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      task,
      mode: "auto",
      model: "Binary IDE",
      workspaceRoot,
      client: {
        surface: "ambient_overlay",
        version: state.runtimeInfo?.appVersion || "0.1.0",
      },
    }),
  });

  if (!response.ok || !response.body) {
    const errorText = await response.text();
    state.activeStream = false;
    await pushRunPatch({
      runStatus: "takeover_required",
      stepTitle: errorText || `Request failed (${response.status})`,
      confidence: "blocked",
      intervention: {
        visible: true,
        reason: errorText || `Request failed (${response.status})`,
      },
    });
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
        applyEventToRun(JSON.parse(payload));
      } catch {
        void pushRunPatch({
          stepTitle: payload,
          confidence: "working",
        });
      }
    }
  }

  state.activeStream = false;
  await syncRunFromHost();
}

el.composer.addEventListener("submit", (event) => {
  event.preventDefault();
  const task = el.input.value.trim();
  if (!task) return;
  el.input.value = "";
  el.input.focus();
  void startRun(task);
});

el.openMain.addEventListener("click", () => {
  void window.binaryDesktop.focusRun(state.run?.activeRunId);
});

el.pause.addEventListener("click", () => {
  void control("pause", "Paused from the ambient composer.");
});

el.resume.addEventListener("click", () => {
  void control("resume", "Resumed from the ambient composer.");
});

el.cancel.addEventListener("click", () => {
  void control("cancel", "Stopped from the ambient composer.");
});

el.input.addEventListener("focus", () => {
  void window.binaryDesktop.overlaySetState({ focusedInput: true, interactive: true, visible: true });
});

el.input.addEventListener("blur", () => {
  void window.binaryDesktop.overlaySetState({ focusedInput: false });
});

state.runtimeInfo = await window.binaryDesktop.runtimeInfo();
state.appearance = await window.binaryDesktop.getAppearance();
state.overlay = await window.binaryDesktop.overlayGetState();
state.run = await window.binaryDesktop.getRunSurfaceState();
host.baseUrl = state.runtimeInfo?.hostUrl || host.baseUrl;
applyTheme(state.appearance?.theme);

window.binaryDesktop.onAppearance((appearance) => {
  state.appearance = appearance;
  applyTheme(appearance?.theme);
});

window.binaryDesktop.onOverlayState((overlay) => {
  state.overlay = overlay;
  if (overlay?.focusedInput) {
    setTimeout(() => {
      el.input.focus();
      el.input.select();
    }, 24);
  }
  render();
});

window.binaryDesktop.onRunSurfaceState((run) => {
  clearCompletionTimer();
  state.run = run;
  if (run?.runStatus === "completed") {
    scheduleIdleReset();
  }
  render();
});

window.binaryDesktop.onHotkeyAction((payload) => {
  if (payload.action === "focus_composer") {
    setTimeout(() => {
      el.input.focus();
      el.input.select();
    }, 24);
  }
  if (payload.action === "pause_resume") {
    const action = state.run?.runStatus === "running" ? "pause" : "resume";
    void control(action, "Triggered from the ambient composer hotkey.");
  }
  if (payload.action === "open_main") {
    void window.binaryDesktop.focusRun(state.run?.activeRunId);
  }
});

render();

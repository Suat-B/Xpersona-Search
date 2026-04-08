const state = {
  runtimeInfo: null,
  overlay: null,
  run: null,
};

const el = {
  title: document.getElementById("interventionTitle"),
  summary: document.getElementById("interventionSummary"),
  status: document.getElementById("interventionStatus"),
  reason: document.getElementById("interventionReason"),
  proof: document.getElementById("interventionProof"),
  pause: document.getElementById("interventionPause"),
  resume: document.getElementById("interventionResume"),
  takeover: document.getElementById("interventionTakeover"),
  repair: document.getElementById("interventionRepair"),
  retry: document.getElementById("interventionRetry"),
  cancel: document.getElementById("interventionCancel"),
  openMain: document.getElementById("interventionOpenMain"),
};

function escapeHtml(value) {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function renderProof(target, proof, emptyTitle, emptySummary) {
  if (!proof || typeof proof !== "object") {
    target.className = "proof-card empty";
    target.innerHTML = `<strong>${escapeHtml(emptyTitle)}</strong><span>${escapeHtml(emptySummary)}</span>`;
    return;
  }
  target.className = "proof-card";
  target.innerHTML = `
    <strong>${escapeHtml(proof.title || proof.url || "Proof attached")}</strong>
    <span>${escapeHtml(proof.summary || proof.workflowCheckpoint || proof.url || emptySummary)}</span>
  `;
}

function render() {
  const run = state.run || {};
  const intervention = run.intervention || {};
  const visible = Boolean(intervention.visible);
  el.title.textContent = visible ? "Binary wants a human eye on this moment" : "Binary is running smoothly";
  el.summary.textContent = visible
    ? "Binary surfaced the exact reason it paused or got blocked, plus the proof it collected right before asking for help."
    : "When Binary hits a blocked or high-friction moment, this sheet will surface the exact reason and let you step in without losing context.";
  el.status.textContent = run.runStatus || "standby";
  el.status.className = `confidence-pill ${visible ? "blocked" : "confident"}`;
  renderProof(
    el.reason,
    intervention.reason ? { title: "Reason", summary: intervention.reason } : null,
    "No intervention is currently required.",
    "No intervention is currently required."
  );
  renderProof(
    el.proof,
    intervention.latestProof || run.proofCard,
    "Binary has not attached a proof card yet.",
    "Binary will attach a proof card here before it requests help."
  );
}

async function control(action, note) {
  if (!state.run?.activeRunId || !state.runtimeInfo?.hostUrl) return;
  await fetch(`${state.runtimeInfo.hostUrl}/v1/runs/${encodeURIComponent(state.run.activeRunId)}/control`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action, note }),
  });
}

el.pause.addEventListener("click", () => {
  void control("pause", "Paused from the intervention sheet.");
});
el.resume.addEventListener("click", () => {
  void control("resume", "Resumed from the intervention sheet.");
});
el.takeover.addEventListener("click", async () => {
  await window.binaryDesktop.overlaySetState({ interactive: true, clickThrough: false, visible: true });
  await control("takeover", "Operator takeover requested from the intervention sheet.");
  await window.binaryDesktop.focusRun(state.run?.activeRunId);
});
el.repair.addEventListener("click", () => {
  void control("repair", "Repair and resume requested from the intervention sheet.");
});
el.retry.addEventListener("click", () => {
  void control("retry_last_turn", "Retry the last turn from the intervention sheet.");
});
el.cancel.addEventListener("click", () => {
  void control("cancel", "Cancelled from the intervention sheet.");
});
el.openMain.addEventListener("click", () => {
  void window.binaryDesktop.focusRun(state.run?.activeRunId);
});

state.runtimeInfo = await window.binaryDesktop.runtimeInfo();
state.overlay = await window.binaryDesktop.overlayGetState();
state.run = await window.binaryDesktop.getRunSurfaceState();

window.binaryDesktop.onRunSurfaceState((run) => {
  state.run = run;
  render();
});

render();

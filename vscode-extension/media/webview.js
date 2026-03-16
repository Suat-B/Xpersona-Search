(function () {
  const vscode = acquireVsCodeApi();

  const state = {
    mode: "auto",
    runtime: "qwenCode",
    auth: { kind: "none", label: "Not signed in" },
    history: [],
    messages: [],
    busy: false,
    canUndo: false,
    activity: [],
    selectedSessionId: null,
    contextSummary: {
      likelyTargets: [],
      candidateTargets: [],
      attachedFiles: [],
      memoryTargets: [],
    },
    contextConfidence: "low",
    intent: "ask",
    runtimePhase: "idle",
    followUpActions: [],
    draftText: "",
    historyDrawerOpen: false,
    binaryDetailsOpen: false,
    binaryPanelOpen: false,
    binary: {
      targetEnvironment: {
        runtime: "node18",
        platform: "portable",
        packageManager: "npm",
      },
      activeBuild: null,
      busy: false,
      lastAction: null,
    },
  };

  const elements = {
    workspaceShell: document.getElementById("workspaceShell"),
    historyToggle: document.getElementById("historyToggle"),
    historyDrawer: document.getElementById("historyDrawer"),
    historyScrim: document.getElementById("historyScrim"),
    history: document.getElementById("history"),
    historyCount: document.getElementById("historyCount"),
    historyFooter: document.getElementById("historyFooter"),
    historyFooterButton: document.getElementById("historyFooterButton"),
    messages: document.getElementById("messages"),
    composer: document.getElementById("composer"),
    send: document.getElementById("send"),
    mentions: document.getElementById("mentions"),
    timelineWrap: document.getElementById("timelineWrap"),
    activity: document.getElementById("activity"),
    jumpToLatest: document.getElementById("jumpToLatest"),
    busyLabel: document.getElementById("busyLabel"),
    statusLabel: document.getElementById("statusLabel"),
    runtimeChip: document.getElementById("runtimeChip"),
    modeChip: document.getElementById("modeChip"),
    authChip: document.getElementById("authChip"),
    signIn: document.getElementById("signIn"),
    signOut: document.getElementById("signOut"),
    undoChanges: document.getElementById("undoChanges"),
    contextNote: document.getElementById("contextNote"),
    contextRoot: document.getElementById("contextRoot"),
    contextTargets: document.getElementById("contextTargets"),
    contextConfidenceChip: document.getElementById("contextConfidenceChip"),
    intentBadge: document.getElementById("intentBadge"),
    intentChip: document.getElementById("intentChip"),
    clearAttachedContext: document.getElementById("clearAttachedContext"),
    binaryStatusBadge: document.getElementById("binaryStatusBadge"),
    binaryPanelToggle: document.getElementById("binaryPanelToggle"),
    binaryPanelBody: document.getElementById("binaryPanelBody"),
    binaryPanelSummary: document.getElementById("binaryPanelSummary"),
    binaryPanelMeta: document.getElementById("binaryPanelMeta"),
    binaryPanelChevron: document.getElementById("binaryPanelChevron"),
    binaryTargetRuntime: document.getElementById("binaryTargetRuntime"),
    binaryReliabilityScore: document.getElementById("binaryReliabilityScore"),
    binaryArtifactLabel: document.getElementById("binaryArtifactLabel"),
    binaryPublishLabel: document.getElementById("binaryPublishLabel"),
    binaryBuildVisual: document.getElementById("binaryBuildVisual"),
    binaryBuildTitle: document.getElementById("binaryBuildTitle"),
    binaryBuildCaption: document.getElementById("binaryBuildCaption"),
    binaryManifestPreview: document.getElementById("binaryManifestPreview"),
    binaryWarnings: document.getElementById("binaryWarnings"),
    generateBinaryButton: document.getElementById("generateBinaryButton"),
    validateBinaryButton: document.getElementById("validateBinaryButton"),
    deployBinaryButton: document.getElementById("deployBinaryButton"),
    binaryDownloadLink: document.getElementById("binaryDownloadLink"),
    binaryDetailsButton: document.getElementById("binaryDetailsButton"),
    binaryDetailsPanel: document.getElementById("binaryDetailsPanel"),
  };

  let mentionRequestId = 0;
  let activeMentionRange = null;
  let mentionItems = [];
  let selectedMentionIndex = 0;
  let hasAutoFocused = false;
  let shouldStickToBottom = true;
  let previewTimer = 0;
  let lastPreviewText = null;
  let lastDraftKey = "";
  let lastDraftText = "";

  function shouldSubmitEnter(event) {
    if (!event) return false;
    const key = String(event.key || "");
    const code = String(event.code || "");
    const isEnter = key === "Enter" || code === "Enter" || code === "NumpadEnter";
    return (
      isEnter &&
      !event.shiftKey &&
      !event.altKey &&
      !event.ctrlKey &&
      !event.metaKey &&
      !event.isComposing
    );
  }

  function draftKeyFor(nextState) {
    const runtime = nextState && typeof nextState.runtime === "string" ? nextState.runtime : state.runtime;
    const sessionId =
      nextState && typeof nextState.selectedSessionId === "string"
        ? nextState.selectedSessionId
        : nextState && nextState.selectedSessionId === null
          ? null
          : state.selectedSessionId;
    return `${runtime}:${sessionId || "__new__"}`;
  }

  function escapeHtml(value) {
    return String(value || "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function formatInline(value) {
    return escapeHtml(String(value || "")).replace(/`([^`]+)`/g, "<code>$1</code>");
  }

  function formatRelativeTime(value) {
    const timestamp = Date.parse(String(value || ""));
    if (!Number.isFinite(timestamp)) return "";
    const diffMs = Date.now() - timestamp;
    const diffMinutes = Math.max(0, Math.round(diffMs / 60000));
    if (diffMinutes < 1) return "now";
    if (diffMinutes < 60) return `${diffMinutes}m`;
    const diffHours = Math.round(diffMinutes / 60);
    if (diffHours < 24) return `${diffHours}h`;
    const diffDays = Math.round(diffHours / 24);
    if (diffDays < 7) return `${diffDays}d`;
    return new Date(timestamp).toLocaleDateString(undefined, { month: "short", day: "numeric" });
  }

  function roleLabel(role) {
    if (role === "user") return "You";
    if (role === "system") return "System";
    return "Binary IDE";
  }

  function intentLabel(intent) {
    if (intent === "change") return "Change";
    if (intent === "find") return "Find";
    if (intent === "explain") return "Explain";
    return "Ask";
  }

  function confidenceLabel(confidence) {
    if (confidence === "high") return "High confidence";
    if (confidence === "medium") return "Medium confidence";
    return "Low confidence";
  }

  function phaseLabel(phase) {
    switch (phase) {
      case "radar":
        return "Draft ready";
      case "collecting_context":
        return "Collecting context";
      case "waiting_for_qwen":
        return "Waiting for Qwen";
      case "awaiting_approval":
        return "Awaiting tool approval";
      case "applying_result":
        return "Applying result";
      case "saving_session":
        return "Saving session";
      case "clarify":
        return "Needs clarification";
      case "done":
        return "Done";
      case "failed":
        return "Failed";
      default:
        return "Ready";
    }
  }

  function phaseChipLabel(phase) {
    switch (phase) {
      case "radar":
        return "Draft";
      case "collecting_context":
        return "Collect";
      case "waiting_for_qwen":
        return "Waiting";
      case "awaiting_approval":
        return "Approve";
      case "applying_result":
        return "Applying";
      case "saving_session":
        return "Saving";
      case "clarify":
        return "Clarify";
      case "done":
        return "Done";
      case "failed":
        return "Failed";
      default:
        return "Ready";
    }
  }

  function runtimeName() {
    return state.runtime === "qwenCode" ? "Qwen Code" : "Binary IDE API";
  }

  function runtimeChipLabel() {
    return state.runtime === "qwenCode" ? "Qwen" : "Cloud";
  }

  function modeName() {
    return state.mode === "plan" ? "Plan mode" : "Auto mode";
  }

  function modeChipLabel() {
    return state.mode === "plan" ? "Plan" : "Auto";
  }

  function authButtonLabel() {
    if (state.runtime === "qwenCode") {
      return state.auth && state.auth.kind !== "none" ? "API key ready" : "Set API key";
    }
    return state.auth && state.auth.kind !== "none" ? "Auth ready" : "Set API key";
  }

  function authButtonShortLabel() {
    if (state.runtime === "qwenCode") {
      return state.auth && state.auth.kind !== "none" ? "Ready" : "Key";
    }
    return state.auth && state.auth.kind !== "none" ? "Auth" : "Key";
  }

  function statusSummary() {
    if (state.runtime === "qwenCode") {
      return state.auth && state.auth.kind !== "none"
        ? "Local runtime connected"
        : "Add a Binary IDE API key";
    }
    return state.auth && state.auth.kind !== "none"
      ? state.auth.label || "Signed in"
      : "Browser sign in or API key required";
  }

  function statusChipLabel() {
    if (state.runtime === "qwenCode") {
      return state.auth && state.auth.kind !== "none" ? "Local" : "Needs key";
    }
    return state.auth && state.auth.kind !== "none" ? "Signed in" : "Needs auth";
  }

  function shortPath(value) {
    const normalized = String(value || "").replace(/\\/g, "/");
    if (!normalized) return "";
    const parts = normalized.split("/").filter(Boolean);
    if (parts.length <= 2) return normalized;
    return `${parts[parts.length - 2]}/${parts[parts.length - 1]}`;
  }

  function mentionLabel(value) {
    const normalized = String(value || "").replace(/\\/g, "/");
    if (!normalized) return "";
    const parts = normalized.split("/").filter(Boolean);
    return parts[parts.length - 1] || normalized;
  }

  function setHidden(element, hidden) {
    if (!element) return;
    element.classList.toggle("is-hidden", Boolean(hidden));
  }

  function setHistoryDrawerOpen(open) {
    state.historyDrawerOpen = Boolean(open);
    syncShellState();
    persistDraft();
  }

  function setBinaryDetailsOpen(open) {
    state.binaryDetailsOpen = Boolean(open);
    syncShellState();
    persistDraft();
  }

  function setBinaryPanelOpen(open) {
    state.binaryPanelOpen = Boolean(open);
    syncShellState();
    persistDraft();
  }

  function syncShellState() {
    const historyOpen = Boolean(state.historyDrawerOpen);
    const detailsOpen = Boolean(state.binaryDetailsOpen);
    const panelOpen = Boolean(state.binaryPanelOpen);

    if (elements.workspaceShell) {
      elements.workspaceShell.setAttribute("data-history-open", String(historyOpen));
      elements.workspaceShell.setAttribute("data-binary-details", String(detailsOpen));
    }
    if (elements.historyToggle) {
      elements.historyToggle.classList.toggle("active", historyOpen);
      elements.historyToggle.setAttribute("aria-expanded", String(historyOpen));
    }
    if (elements.historyDrawer) {
      elements.historyDrawer.setAttribute("aria-hidden", String(!historyOpen));
    }
    setHidden(elements.historyScrim, !historyOpen);
    if (elements.binaryDetailsButton) {
      elements.binaryDetailsButton.textContent = detailsOpen ? "Hide details" : "Details";
      elements.binaryDetailsButton.setAttribute("aria-expanded", String(detailsOpen));
    }
    setHidden(elements.binaryDetailsPanel, !detailsOpen);
    if (elements.binaryPanelToggle) {
      elements.binaryPanelToggle.setAttribute("aria-expanded", String(panelOpen));
    }
    if (elements.binaryPanelChevron) {
      elements.binaryPanelChevron.textContent = panelOpen ? "−" : "+";
    }
    setHidden(elements.binaryPanelBody, !panelOpen);
  }

  function persistDraft() {
    vscode.setState({
      draft: elements.composer ? elements.composer.value : "",
      historyDrawerOpen: state.historyDrawerOpen,
      binaryDetailsOpen: state.binaryDetailsOpen,
      binaryPanelOpen: state.binaryPanelOpen,
    });
  }

  function restoreDraft() {
    const saved = vscode.getState();
    if (saved && typeof saved === "object") {
      state.historyDrawerOpen = Boolean(saved.historyDrawerOpen);
      state.binaryDetailsOpen = Boolean(saved.binaryDetailsOpen);
      state.binaryPanelOpen = Boolean(saved.binaryPanelOpen);
    }
    if (saved && typeof saved === "object" && typeof saved.draft === "string" && elements.composer) {
      elements.composer.value = saved.draft;
    }
  }

  function currentDraftKey() {
    return draftKeyFor(state);
  }

  function shouldSyncComposerValue(nextDraftKey, nextDraftText) {
    if (!elements.composer) return false;
    const localValue = elements.composer.value || "";
    const isFocused = document.activeElement === elements.composer;

    if (nextDraftKey !== currentDraftKey()) return true;
    if (!isFocused) return true;

    // While the composer is focused, treat the local textarea value as the
    // source of truth so delayed preview/state echoes cannot delete characters.
    return localValue === nextDraftText;
  }

  function syncComposerFromState(nextState) {
    if (!elements.composer) return;
    const source = nextState || state;
    const nextDraftKey = draftKeyFor(source);
    const nextDraftText = typeof source.draftText === "string" ? source.draftText : "";
    const shouldSync = nextDraftKey !== lastDraftKey || nextDraftText !== lastDraftText;

    if (shouldSync && elements.composer.value !== nextDraftText && shouldSyncComposerValue(nextDraftKey, nextDraftText)) {
      elements.composer.value = nextDraftText;
      syncComposerHeight();
      persistDraft();
    }

    lastDraftKey = nextDraftKey;
    lastDraftText = nextDraftText;
  }

  function focusComposer(force) {
    if (!elements.composer) return;
    if (!force && document.activeElement === elements.composer) return;
    window.requestAnimationFrame(() => {
      if (!elements.composer) return;
      elements.composer.focus();
      const cursor = elements.composer.value.length;
      elements.composer.setSelectionRange(cursor, cursor);
      hasAutoFocused = true;
    });
  }

  function syncComposerHeight() {
    if (!elements.composer) return;
    const computed = window.getComputedStyle(elements.composer);
    const minHeight = Number.parseFloat(computed.minHeight) || 96;
    const maxHeight = Number.parseFloat(computed.maxHeight) || 236;
    elements.composer.style.height = "0px";
    const nextHeight = Math.min(Math.max(elements.composer.scrollHeight, minHeight), maxHeight);
    elements.composer.style.height = `${nextHeight}px`;
  }

  function isNearBottom() {
    if (!elements.messages) return true;
    const remaining =
      elements.messages.scrollHeight - elements.messages.scrollTop - elements.messages.clientHeight;
    return remaining < 48;
  }

  function scrollToLatest(behavior) {
    if (!elements.messages) return;
    elements.messages.scrollTo({ top: elements.messages.scrollHeight, behavior: behavior || "auto" });
    shouldStickToBottom = true;
    updateJumpButton();
  }

  function updateJumpButton() {
    if (!elements.jumpToLatest) return;
    const hidden = shouldStickToBottom || !Array.isArray(state.messages) || !state.messages.length;
    elements.jumpToLatest.classList.toggle("is-hidden", hidden);
  }

  function splitSegments(value) {
    const text = String(value || "").replace(/\r\n/g, "\n");
    const segments = [];
    const fencePattern = /```([^\n`]*)\n([\s\S]*?)```/g;
    let lastIndex = 0;
    let match = fencePattern.exec(text);

    while (match) {
      if (match.index > lastIndex) {
        segments.push({ type: "text", value: text.slice(lastIndex, match.index) });
      }
      segments.push({
        type: "code",
        language: String(match[1] || "").trim(),
        value: String(match[2] || "").replace(/\n$/, ""),
      });
      lastIndex = match.index + match[0].length;
      match = fencePattern.exec(text);
    }

    if (lastIndex < text.length) {
      segments.push({ type: "text", value: text.slice(lastIndex) });
    }

    return segments.length ? segments : [{ type: "text", value: text }];
  }

  function renderTextSegment(value) {
    const lines = String(value || "").split("\n");
    const html = [];
    const paragraph = [];
    let listType = null;

    function flushParagraph() {
      if (!paragraph.length) return;
      html.push(`<p>${paragraph.map((line) => formatInline(line)).join("<br>")}</p>`);
      paragraph.length = 0;
    }

    function closeList() {
      if (!listType) return;
      html.push(`</${listType}>`);
      listType = null;
    }

    lines.forEach((line) => {
      const trimmed = line.trim();
      const bulletMatch = /^[-*]\s+(.+)$/.exec(trimmed);
      const orderedMatch = /^\d+\.\s+(.+)$/.exec(trimmed);

      if (!trimmed) {
        flushParagraph();
        closeList();
        return;
      }
      if (bulletMatch) {
        flushParagraph();
        if (listType !== "ul") {
          closeList();
          html.push("<ul>");
          listType = "ul";
        }
        html.push(`<li>${formatInline(bulletMatch[1])}</li>`);
        return;
      }
      if (orderedMatch) {
        flushParagraph();
        if (listType !== "ol") {
          closeList();
          html.push("<ol>");
          listType = "ol";
        }
        html.push(`<li>${formatInline(orderedMatch[1])}</li>`);
        return;
      }
      closeList();
      paragraph.push(line);
    });

    flushParagraph();
    closeList();
    return html.join("");
  }

  function renderCodeSegment(segment) {
    const language = segment.language ? escapeHtml(segment.language) : "code";
    return `<pre><div class="code-header"><span>${language}</span><span>workspace</span></div><code class="code-block">${escapeHtml(segment.value)}</code></pre>`;
  }

  function formatMessageBody(value) {
    return splitSegments(value)
      .map((segment) => (segment.type === "code" ? renderCodeSegment(segment) : renderTextSegment(segment.value)))
      .join("");
  }

  function buildTargetChip(kind, label, value) {
    return `<span class="context-target" data-kind="${escapeHtml(kind)}" title="${escapeHtml(value)}"><strong>${escapeHtml(label)}</strong> ${escapeHtml(shortPath(value) || value)}</span>`;
  }

  function renderContextTargetList() {
    const summary = state.contextSummary || {};
    const chips = [];

    (summary.likelyTargets || []).slice(0, 3).forEach((value) => {
      chips.push(buildTargetChip("likely", "Using", value));
    });
    (summary.candidateTargets || []).slice(0, 2).forEach((value) => {
      chips.push(buildTargetChip("candidate", "Maybe", value));
    });
    (summary.attachedFiles || []).slice(0, 2).forEach((value) => {
      chips.push(buildTargetChip("attached", "Attached", value));
    });
    if (summary.attachedSelection && summary.attachedSelection.path) {
      chips.push(buildTargetChip("selection", "Selection", summary.attachedSelection.path));
    }
    (summary.memoryTargets || []).slice(0, 2).forEach((value) => {
      chips.push(buildTargetChip("memory", "Recent", value));
    });

    if (!chips.length) {
      chips.push('<span class="context-target" data-kind="idle"><strong>Radar</strong> type a file name or symbol</span>');
    }

    return chips.join("");
  }

  function renderHistory() {
    if (!elements.history) return;
    const items = Array.isArray(state.history) ? state.history : [];
    if (elements.historyCount) {
      elements.historyCount.textContent = String(items.length);
    }
    if (elements.historyFooter && elements.historyFooterButton) {
      elements.historyFooter.classList.add("is-hidden");
      elements.historyFooterButton.textContent = `View all (${items.length})`;
    }
    if (!items.length) {
      elements.history.innerHTML =
        '<div class="task-empty">No saved chats yet. Your first message becomes the first task.</div>';
      return;
    }

    elements.history.innerHTML = items
      .map((item) => {
        const active = item.id === state.selectedSessionId ? " active" : "";
        const updated = formatRelativeTime(item.updatedAt || item.updated_at);
        const mode = item.mode === "plan" ? "Plan" : "Chat";
        return [
          `<div class="task-item${active}">`,
          `<button type="button" data-history-id="${escapeHtml(item.id)}">`,
          '<div class="task-line">',
          '<div class="task-copy">',
          `<span class="task-name">${escapeHtml(item.title || "Untitled chat")}</span>`,
          `<div class="task-meta">${escapeHtml(mode)} task</div>`,
          "</div>",
          '<div class="task-aside">',
          `<span class="task-mode">${escapeHtml(mode)}</span>`,
          updated ? `<span class="task-time">${escapeHtml(updated)}</span>` : "",
          '<span class="task-dot" aria-hidden="true"></span>',
          "</div>",
          "</div>",
          "</button>",
          "</div>",
        ].join("");
      })
      .join("");
  }

  function renderFollowUpActions() {
    const actions = Array.isArray(state.followUpActions) ? state.followUpActions : [];
    if (!actions.length) return "";
    return [
      '<div class="message-followups" id="followUpActions">',
      actions
        .map((action) => {
          const emphasized = action.emphasized ? " emphasized" : "";
          const disabled = action.disabled ? " disabled" : "";
          const detail = action.detail
            ? `<span class="followup-detail">${escapeHtml(action.detail)}</span>`
            : "";
          return `<button type="button" class="followup-button${emphasized}" data-followup-id="${escapeHtml(
            action.id
          )}"${disabled}><span>${escapeHtml(action.label)}</span>${detail}</button>`;
        })
        .join(""),
      "</div>",
    ].join("");
  }

  function renderEmptyStage() {
    const logoUri = document.body.getAttribute("data-logo-uri") || "";
    const workspaceName = document.body.getAttribute("data-workspace-name") || "Workspace";
    return [
      '<div class="message-stack">',
      '<div class="empty-stage"><div class="empty-stage-inner">',
      '<div class="empty-stage-logo">',
      logoUri ? `<img src="${escapeHtml(logoUri)}" alt="Binary IDE" />` : "",
      "</div>",
      `<span>Compose for ${escapeHtml(workspaceName)}. Chat stays primary, and bundle actions stay docked below.</span>`,
      "</div></div>",
      "</div>",
    ].join("");
  }

  function renderMessages() {
    if (!elements.messages) return;
    const messages = Array.isArray(state.messages) ? state.messages : [];
    if (!messages.length) {
      elements.messages.innerHTML = renderEmptyStage();
      window.requestAnimationFrame(updateJumpButton);
      return;
    }

    let followUpIndex = -1;
    if (Array.isArray(state.followUpActions) && state.followUpActions.length) {
      for (let index = messages.length - 1; index >= 0; index -= 1) {
        if (messages[index].role !== "user") {
          followUpIndex = index;
          break;
        }
      }
    }

    elements.messages.innerHTML = [
      '<div class="message-stack">',
      messages
        .map((item, index) => {
          const role = item.role || "assistant";
          return [
            `<article class="message ${escapeHtml(role)}">`,
            `<div class="message-meta">${escapeHtml(roleLabel(role))}</div>`,
            `<div class="message-body">${formatMessageBody(item.content)}</div>`,
            index === followUpIndex ? renderFollowUpActions() : "",
            "</article>",
          ].join("");
        })
        .join(""),
      "</div>",
    ].join("");

    window.requestAnimationFrame(() => {
      if (shouldStickToBottom) {
        scrollToLatest("auto");
      } else {
        updateJumpButton();
      }
    });
  }

  function renderActivity() {
    if (!elements.timelineWrap || !elements.activity) return;
    const phase = state.runtimePhase || "idle";
    const show =
      !mentionItems.length &&
      (phase !== "idle" && phase !== "radar" || (Array.isArray(state.activity) && state.activity.length));
    if (!show) {
      elements.timelineWrap.classList.remove("show");
      elements.activity.innerHTML = "";
      return;
    }
    const chips = [`<span class="timeline-chip phase">${escapeHtml(phaseLabel(phase))}</span>`];
    (Array.isArray(state.activity) ? state.activity : [])
      .slice(-4)
      .forEach((item) => chips.push(`<span class="timeline-chip">${escapeHtml(item)}</span>`));
    elements.timelineWrap.classList.add("show");
    elements.activity.innerHTML = chips.join("");
  }

  function formatBytes(value) {
    const size = Number(value || 0);
    if (!Number.isFinite(size) || size <= 0) return "0 B";
    if (size < 1024) return `${size} B`;
    if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`;
    return `${(size / (1024 * 1024)).toFixed(1)} MB`;
  }

  function renderBinaryPanel() {
    const binary = state.binary || {};
    const build = binary.activeBuild || null;
    const reliability = build && build.reliability ? build.reliability : null;
    const manifest = build && build.manifest ? build.manifest : null;
    const isBuilding = Boolean(binary.busy || (build && (build.status === "queued" || build.status === "running")));
    const warnings = [];
    const runtimeLabel =
      binary.targetEnvironment && binary.targetEnvironment.runtime === "node20" ? "Node 20" : "Node 18";
    const summaryStatus = build
      ? build.status === "completed"
        ? "Bundle ready"
        : build.status === "failed"
          ? "Build failed"
          : build.status === "running"
            ? "Building"
            : "Queued"
      : "No bundle yet";

    if (reliability && Array.isArray(reliability.warnings)) {
      warnings.push(...reliability.warnings);
    }
    if (manifest && Array.isArray(manifest.warnings)) {
      warnings.push(...manifest.warnings);
    }

    if (elements.binaryStatusBadge) {
      const status = build ? build.status : "idle";
      const label =
        status === "completed"
          ? "Bundle ready"
          : status === "failed"
            ? "Build failed"
            : status === "running"
              ? "Building"
              : status === "queued"
                ? "Queued"
                : binary.busy
                  ? "Working"
                  : "No bundle yet";
      elements.binaryStatusBadge.textContent = label;
      elements.binaryStatusBadge.className = `binary-status ${
        reliability ? reliability.status : status === "failed" ? "fail" : ""
      }`.trim();
    }

    if (elements.binaryTargetRuntime) {
      elements.binaryTargetRuntime.value =
        binary.targetEnvironment && binary.targetEnvironment.runtime === "node20" ? "node20" : "node18";
      elements.binaryTargetRuntime.disabled = Boolean(binary.busy);
    }

    if (elements.binaryReliabilityScore) {
      elements.binaryReliabilityScore.textContent = reliability ? `${reliability.score}/100` : "--";
    }

    if (elements.binaryArtifactLabel) {
      elements.binaryArtifactLabel.textContent = build && build.artifact
        ? `${build.artifact.fileName} (${formatBytes(build.artifact.sizeBytes)})`
        : "No bundle yet";
    }

    if (elements.binaryPublishLabel) {
      elements.binaryPublishLabel.textContent = build && build.publish ? "Published" : "Private";
    }
    if (elements.binaryPanelSummary) {
      elements.binaryPanelSummary.textContent = `${runtimeLabel} • ${summaryStatus}`;
    }
    if (elements.binaryPanelMeta) {
      elements.binaryPanelMeta.textContent = build && build.publish
        ? "Published bundle controls and manifest details."
        : "Runtime, reliability, publish, and download controls.";
    }

    if (elements.binaryBuildVisual) {
      elements.binaryBuildVisual.classList.toggle("show", isBuilding);
    }
    if (elements.binaryBuildTitle) {
      elements.binaryBuildTitle.textContent =
        build && build.status === "running"
          ? "Assembling Binary package bundle"
          : "Encoding Binary starter bundle";
    }
    if (elements.binaryBuildCaption) {
      elements.binaryBuildCaption.textContent =
        build && build.status === "running"
          ? "101010 in motion. Resolving files, compiling output, and sealing the bundle."
          : "Queue locked. Preparing a portable package bundle from your current intent.";
    }

    if (elements.binaryManifestPreview) {
      elements.binaryManifestPreview.textContent = manifest
        ? [
            `Name: ${manifest.displayName}`,
            `Runtime: ${manifest.runtime}`,
            `Entrypoint: ${manifest.entrypoint}`,
            `Build: ${manifest.buildCommand}`,
            `Start: ${manifest.startCommand}`,
          ].join("\n")
        : "Generate a portable starter bundle to inspect its manifest.";
    }

    if (elements.binaryWarnings) {
      if (!warnings.length) {
        elements.binaryWarnings.textContent = build && build.errorMessage
          ? build.errorMessage
          : "No Binary IDE warnings yet.";
      } else {
        elements.binaryWarnings.textContent = warnings.join("\n");
      }
    }

    if (elements.generateBinaryButton) {
      elements.generateBinaryButton.disabled = Boolean(binary.busy);
    }
    if (elements.validateBinaryButton) {
      elements.validateBinaryButton.disabled = Boolean(binary.busy || !build || build.status !== "completed");
    }
    if (elements.deployBinaryButton) {
      elements.deployBinaryButton.disabled = Boolean(binary.busy || !build || build.status !== "completed");
    }

    if (elements.binaryDetailsButton) {
      elements.binaryDetailsButton.disabled = Boolean(binary.busy && !build);
    }

    if (elements.binaryDownloadLink) {
      const href = build && build.publish && build.publish.downloadUrl ? build.publish.downloadUrl : "";
      elements.binaryDownloadLink.href = href || "#";
      elements.binaryDownloadLink.classList.toggle("is-hidden", !href);
    }

    syncShellState();
  }

  function renderContextStrip() {
    const summary = state.contextSummary || {};
    if (elements.intentBadge) {
      elements.intentBadge.textContent = intentLabel(state.intent);
    }
    if (elements.intentChip) {
      elements.intentChip.textContent = intentLabel(state.intent);
      elements.intentChip.title = `Intent: ${intentLabel(state.intent)}`;
    }
    if (elements.contextConfidenceChip) {
      elements.contextConfidenceChip.textContent = confidenceLabel(state.contextConfidence);
      elements.contextConfidenceChip.className = `context-chip confidence-${state.contextConfidence}`;
      elements.contextConfidenceChip.title = `Context confidence: ${confidenceLabel(state.contextConfidence)}`;
    }
    if (elements.contextNote) {
      elements.contextNote.textContent =
        summary.note ||
        "Type a file name or symbol and Binary IDE will resolve likely targets before you send.";
    }
    if (elements.contextRoot) {
      elements.contextRoot.textContent = summary.workspaceRoot
        ? `Workspace: ${summary.workspaceRoot}`
        : "Workspace context will appear here.";
      elements.contextRoot.title = summary.workspaceRoot || "";
    }
    if (elements.contextTargets) {
      elements.contextTargets.innerHTML = renderContextTargetList();
    }
    if (elements.clearAttachedContext) {
      const hasManualContext = Boolean(
        (summary.attachedFiles && summary.attachedFiles.length) || summary.attachedSelection
      );
      elements.clearAttachedContext.disabled = !hasManualContext;
    }
  }

  function renderMentions() {
    if (!elements.mentions) return;
    if (!mentionItems.length) {
      elements.mentions.classList.remove("show");
      elements.mentions.innerHTML = "";
      return;
    }
    elements.mentions.classList.add("show");
    elements.mentions.innerHTML = mentionItems
      .map((item, index) => {
        const active = index === selectedMentionIndex ? " active" : "";
        const label = mentionLabel(item);
        return `<div class="mention-item"><button type="button" class="${active.trim()}" data-mention-index="${index}" data-mention-value="${escapeHtml(item)}" title="${escapeHtml(item)}">${escapeHtml(label)}</button></div>`;
      })
      .join("");
  }

  function render() {
    syncShellState();
    syncComposerFromState(state);
    if (elements.runtimeChip) {
      elements.runtimeChip.textContent = runtimeChipLabel();
      elements.runtimeChip.title = runtimeName();
    }
    if (elements.modeChip) {
      elements.modeChip.textContent = modeChipLabel();
      elements.modeChip.title = modeName();
    }
    if (elements.statusLabel) {
      elements.statusLabel.textContent = statusChipLabel();
      elements.statusLabel.title = statusSummary();
    }
    if (elements.busyLabel) {
      elements.busyLabel.textContent = phaseChipLabel(state.runtimePhase || "idle");
      elements.busyLabel.title = phaseLabel(state.runtimePhase || "idle");
    }
    if (elements.authChip) {
      elements.authChip.textContent = authButtonShortLabel();
      if (elements.authChip.parentElement) {
        elements.authChip.parentElement.title = authButtonLabel();
      }
    }
    if (elements.send) {
      elements.send.disabled = Boolean(state.busy);
    }
    if (elements.undoChanges) {
      elements.undoChanges.disabled = !state.canUndo || state.runtime === "qwenCode";
    }
    setHidden(elements.signIn, state.runtime === "qwenCode");
    setHidden(elements.signOut, state.auth && state.auth.kind === "none");
    if (elements.composer) {
      elements.composer.placeholder =
        state.runtime === "qwenCode"
          ? "Draft the portable starter bundle you want. @ to add files, / for commands"
          : "Ask Binary IDE to inspect code, patch files, or prepare a portable starter bundle";
    }
    renderHistory();
    renderActivity();
    renderBinaryPanel();
    renderMessages();
    renderMentions();
    syncComposerHeight();
    if (!hasAutoFocused && !state.busy) {
      focusComposer(true);
    }
  }

  function hideMentions() {
    activeMentionRange = null;
    mentionItems = [];
    selectedMentionIndex = 0;
    renderMentions();
  }

  function sendPreviewContextNow(force) {
    if (!elements.composer) return;
    const text = elements.composer.value || "";
    if (!force && text === lastPreviewText) return;
    lastPreviewText = text;
    vscode.postMessage({ type: "previewContext", text });
  }

  function schedulePreviewContext(delay) {
    window.clearTimeout(previewTimer);
    previewTimer = window.setTimeout(() => {
      sendPreviewContextNow(false);
    }, delay || 120);
  }

  function sendPrompt() {
    const value = String(elements.composer ? elements.composer.value : "").trim();
    if (!value || state.busy) return;
    shouldStickToBottom = true;
    setHistoryDrawerOpen(false);
    window.clearTimeout(previewTimer);
    vscode.postMessage({ type: "sendPrompt", text: value });
    if (elements.composer) {
      elements.composer.value = "";
      syncComposerHeight();
      persistDraft();
      lastPreviewText = "";
    }
    hideMentions();
  }

  function dispatchAction(action) {
    if (!action) return;
    switch (action) {
      case "showChat":
        setHistoryDrawerOpen(false);
        focusComposer(true);
        return;
      case "showTasks": {
        const nextHistoryOpen = !state.historyDrawerOpen;
        setHistoryDrawerOpen(nextHistoryOpen);
        if (nextHistoryOpen) {
          vscode.postMessage({ type: "loadHistory" });
        }
        return;
      }
      case "closeHistory":
        setHistoryDrawerOpen(false);
        focusComposer(false);
        return;
      case "newChat":
        shouldStickToBottom = true;
        setHistoryDrawerOpen(false);
        hideMentions();
        if (elements.composer) {
          elements.composer.value = "";
          syncComposerHeight();
          persistDraft();
        }
        state.selectedSessionId = null;
        state.draftText = "";
        lastDraftKey = `${state.runtime}:__new__`;
        lastDraftText = "";
        lastPreviewText = "";
        vscode.postMessage({ type: "newChat" });
        window.setTimeout(() => {
          focusComposer(true);
        }, 0);
        return;
      case "toggleBinaryDetails":
        setBinaryDetailsOpen(!state.binaryDetailsOpen);
        return;
      case "toggleBinaryPanel":
        setBinaryPanelOpen(!state.binaryPanelOpen);
        return;
      case "configureBinary":
      case "setApiKey":
      case "signIn":
      case "signOut":
      case "loadHistory":
      case "undoLastChanges":
      case "attachActiveFile":
      case "attachSelection":
      case "clearAttachedContext":
        vscode.postMessage({ type: action });
        return;
      case "generateBinary":
        setHistoryDrawerOpen(false);
        vscode.postMessage({
          type: "generateBinary",
          text: elements.composer ? elements.composer.value : "",
        });
        return;
      case "validateBinary":
      case "deployBinary":
        setHistoryDrawerOpen(false);
        vscode.postMessage({ type: action });
        return;
      default:
        return;
    }
  }

  function updateMentionQuery() {
    if (!elements.composer) return;
    const value = elements.composer.value || "";
    const cursor = elements.composer.selectionStart || 0;
    const prefix = value.slice(0, cursor);
    const match = /(^|\s)@([A-Za-z0-9_./-]*)$/.exec(prefix);
    if (!match) {
      hideMentions();
      return;
    }
    activeMentionRange = { start: cursor - match[2].length - 1, end: cursor };
    mentionRequestId += 1;
    vscode.postMessage({ type: "mentionsQuery", query: match[2] || "", requestId: mentionRequestId });
  }

  function applyMention(pathValue) {
    if (!elements.composer || !activeMentionRange) return;
    const value = elements.composer.value || "";
    const label = mentionLabel(pathValue);
    elements.composer.value =
      value.slice(0, activeMentionRange.start) + "@" + label + " " + value.slice(activeMentionRange.end);
    const nextCursor = activeMentionRange.start + label.length + 2;
    elements.composer.setSelectionRange(nextCursor, nextCursor);
    syncComposerHeight();
    persistDraft();
    focusComposer(true);
    hideMentions();
    schedulePreviewContext(0);
  }

  function moveMentionSelection(delta) {
    if (!mentionItems.length) return false;
    selectedMentionIndex = (selectedMentionIndex + delta + mentionItems.length) % mentionItems.length;
    renderMentions();
    const activeItem = elements.mentions && elements.mentions.querySelector(".active");
    if (activeItem && typeof activeItem.scrollIntoView === "function") {
      activeItem.scrollIntoView({ block: "nearest" });
    }
    return true;
  }

  document.addEventListener("click", (event) => {
    const target = event.target;
    if (!(target instanceof Element)) return;

    const followUpButton = target.closest("[data-followup-id]");
    if (followUpButton) {
      const id = followUpButton.getAttribute("data-followup-id") || "";
      if (id) {
        vscode.postMessage({ type: "followUpAction", id });
      }
      return;
    }

    const mentionButton = target.closest("[data-mention-value]");
    if (mentionButton) {
      applyMention(mentionButton.getAttribute("data-mention-value") || "");
      return;
    }

    const historyButton = target.closest("[data-history-id]");
    if (historyButton) {
      shouldStickToBottom = true;
      setHistoryDrawerOpen(false);
      vscode.postMessage({ type: "openSession", id: historyButton.getAttribute("data-history-id") || "" });
      return;
    }

    const actionButton = target.closest("[data-action]");
    if (actionButton) {
      dispatchAction(actionButton.getAttribute("data-action") || "");
    }
  });

  if (elements.send) {
    elements.send.addEventListener("click", sendPrompt);
  }

  if (elements.jumpToLatest) {
    elements.jumpToLatest.addEventListener("click", () => scrollToLatest("smooth"));
  }

  if (elements.binaryTargetRuntime) {
    elements.binaryTargetRuntime.addEventListener("change", () => {
      vscode.postMessage({
        type: "setBinaryTarget",
        runtime: elements.binaryTargetRuntime ? elements.binaryTargetRuntime.value : "node18",
      });
    });
  }

  if (elements.messages) {
    elements.messages.addEventListener("scroll", () => {
      shouldStickToBottom = isNearBottom();
      updateJumpButton();
    });
  }

  if (elements.composer) {
    elements.composer.addEventListener("keydown", (event) => {
      if (mentionItems.length && event.key === "ArrowDown") {
        event.preventDefault();
        moveMentionSelection(1);
        return;
      }
      if (mentionItems.length && event.key === "ArrowUp") {
        event.preventDefault();
        moveMentionSelection(-1);
        return;
      }
      if (mentionItems.length && event.key === "Enter" && !event.shiftKey) {
        event.preventDefault();
        applyMention(mentionItems[selectedMentionIndex] || "");
        return;
      }
      if (event.key === "Escape") {
        hideMentions();
        return;
      }
      if (shouldSubmitEnter(event)) {
        event.preventDefault();
        event.stopPropagation();
        sendPrompt();
      }
    }, true);

    elements.composer.addEventListener("beforeinput", (event) => {
      if (event.inputType !== "insertLineBreak" || mentionItems.length) return;
      if (!elements.composer || document.activeElement !== elements.composer) return;
      if (state.busy) {
        event.preventDefault();
        return;
      }
      if ((elements.composer.value || "").trim()) {
        event.preventDefault();
        window.setTimeout(() => {
          if (!state.busy) {
            sendPrompt();
          }
        }, 0);
      }
    });

    elements.composer.addEventListener("input", () => {
      syncComposerHeight();
      persistDraft();
      updateMentionQuery();
      schedulePreviewContext(120);
    });

    elements.composer.addEventListener("blur", () => {
      window.setTimeout(() => {
        if (document.activeElement !== elements.composer) {
          hideMentions();
        }
      }, 120);
    });
  }

  window.addEventListener("message", (event) => {
    const message = event.data || {};
    if (message.type === "state") {
      const nextState = message.state || {};
      Object.assign(state, nextState);
      render();
      return;
    }
    if (message.type === "prefill" && elements.composer) {
      setHistoryDrawerOpen(false);
      elements.composer.value = message.text || "";
      state.draftText = message.text || "";
      lastDraftText = state.draftText;
      lastPreviewText = state.draftText;
      syncComposerHeight();
      persistDraft();
      focusComposer(true);
      updateMentionQuery();
      schedulePreviewContext(0);
      return;
    }
    if (message.type === "mentions") {
      if (Number(message.requestId || 0) !== mentionRequestId) return;
      mentionItems = Array.isArray(message.items) ? message.items : [];
      selectedMentionIndex = 0;
      renderMentions();
    }
  });

  restoreDraft();
  syncComposerHeight();
  render();
  window.setTimeout(() => {
    focusComposer(true);
  }, 30);
  vscode.postMessage({ type: "ready" });
})();

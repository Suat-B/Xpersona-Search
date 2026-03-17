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
    liveChat: null,
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
      phase: "queued",
      progress: 0,
      streamConnected: false,
      lastEventId: null,
      previewFiles: [],
      recentLogs: [],
      reliability: null,
      artifactState: null,
      canCancel: false,
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
    messageList: document.getElementById("messageList"),
    chatBinarySpotlight: document.getElementById("chatBinarySpotlight"),
    composer: document.getElementById("composer"),
    send: document.getElementById("send"),
    mentions: document.getElementById("mentions"),
    composerConfirm: document.getElementById("composerConfirm"),
    composerConfirmButton: document.getElementById("composerConfirmButton"),
    timelineWrap: document.getElementById("timelineWrap"),
    activity: document.getElementById("activity"),
    jumpToLatest: document.getElementById("jumpToLatest"),
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
    binaryPhaseLabel: document.getElementById("binaryPhaseLabel"),
    binaryBuildVisual: document.getElementById("binaryBuildVisual"),
    binaryBuildTitle: document.getElementById("binaryBuildTitle"),
    binaryBuildCaption: document.getElementById("binaryBuildCaption"),
    binaryProgressLabel: document.getElementById("binaryProgressLabel"),
    binaryProgressValue: document.getElementById("binaryProgressValue"),
    binaryProgressFill: document.getElementById("binaryProgressFill"),
    binaryManifestPreview: document.getElementById("binaryManifestPreview"),
    binaryWarnings: document.getElementById("binaryWarnings"),
    binaryPreviewFiles: document.getElementById("binaryPreviewFiles"),
    binaryLogPreview: document.getElementById("binaryLogPreview"),
    generateBinaryButton: document.getElementById("generateBinaryButton"),
    cancelBinaryButton: document.getElementById("cancelBinaryButton"),
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
  let mentionKeyboardActive = false;
  let planConfirmVisible = false;
  let planConfirmDismissed = false;
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
    return "Streaming Binary IDE";
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

  function isPlanShortcutValue(value) {
    return String(value || "").trim().toLowerCase() === "/plan";
  }

  function hidePlanConfirm(options) {
    planConfirmVisible = false;
    if (options && options.dismissed) {
      planConfirmDismissed = true;
    }
    if (elements.composerConfirm) {
      elements.composerConfirm.classList.remove("show");
    }
  }

  function renderPlanConfirm() {
    if (!elements.composerConfirm) return;
    const shouldShow =
      planConfirmVisible &&
      !mentionItems.length &&
      !state.busy &&
      isPlanShortcutValue(elements.composer ? elements.composer.value : "");
    elements.composerConfirm.classList.toggle("show", shouldShow);
  }

  function updatePlanConfirm() {
    const composerValue = elements.composer ? elements.composer.value : "";
    if (!isPlanShortcutValue(composerValue)) {
      planConfirmDismissed = false;
      hidePlanConfirm();
      return;
    }
    if (planConfirmDismissed) {
      hidePlanConfirm();
      return;
    }
    planConfirmVisible = true;
    renderPlanConfirm();
  }

  function confirmPlanMode() {
    if (!elements.composer || state.busy) return;
    shouldStickToBottom = true;
    setHistoryDrawerOpen(false);
    window.clearTimeout(previewTimer);
    vscode.postMessage({ type: "confirmPlanMode" });
    elements.composer.value = "";
    syncComposerHeight();
    persistDraft();
    lastPreviewText = "";
    planConfirmDismissed = false;
    hidePlanConfirm();
    hideMentions();
  }

  function truncateText(value, maxLength) {
    const text = String(value || "").replace(/\s+/g, " ").trim();
    if (!text) return "";
    if (!Number.isFinite(maxLength) || maxLength <= 0 || text.length <= maxLength) {
      return text;
    }
    return `${text.slice(0, Math.max(1, maxLength - 1)).trimEnd()}…`;
  }

  function isFocusInsideMentions() {
    return Boolean(elements.mentions && document.activeElement && elements.mentions.contains(document.activeElement));
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
      logoUri ? `<img src="${escapeHtml(logoUri)}" alt="Streaming Binary IDE" />` : "",
      "</div>",
      `<span>Compose for ${escapeHtml(workspaceName)}. Chat stays primary, and bundle actions stay docked below.</span>`,
      "</div></div>",
      "</div>",
    ].join("");
  }

  function renderMessages() {
    if (!elements.messageList) return;
    const messages = Array.isArray(state.messages) ? state.messages : [];
    if (!messages.length) {
      elements.messageList.innerHTML = renderEmptyStage();
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

    elements.messageList.innerHTML = [
      '<div class="message-stack">',
      messages
        .map((item, index) => {
          const role = item.role || "assistant";
          if (item && item.presentation === "live_binary") {
            return renderLiveBinaryMessage(item, index === followUpIndex);
          }
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

  function clampProgress(value) {
    const progress = Number(value);
    if (!Number.isFinite(progress)) return 0;
    return Math.max(0, Math.min(100, Math.round(progress)));
  }

  function binaryPhaseLabel(phase) {
    switch (phase) {
      case "planning":
        return "Planning";
      case "materializing":
        return "Materializing";
      case "installing":
        return "Installing";
      case "compiling":
        return "Compiling";
      case "validating":
        return "Validating";
      case "packaging":
        return "Packaging";
      case "completed":
        return "Completed";
      case "failed":
        return "Failed";
      case "canceled":
        return "Canceled";
      default:
        return "Queued";
    }
  }

  function binaryPhaseCaption(phase) {
    switch (phase) {
      case "planning":
        return "Designing the portable bundle plan and manifest.";
      case "materializing":
        return "Writing scaffolded source files into the workspace bundle.";
      case "installing":
        return "Streaming dependency installation output from npm.";
      case "compiling":
        return "Running the generated build command and collecting logs.";
      case "validating":
        return "Scoring the bundle for runtime reliability and warnings.";
      case "packaging":
        return "Sealing the final portable package bundle.";
      case "completed":
        return "Portable starter bundle is ready for validation, publish, and download.";
      case "failed":
        return "The live build stopped before the portable bundle was completed.";
      case "canceled":
        return "The live build was canceled before completion.";
      default:
        return "Waiting for the next portable bundle build to start.";
    }
  }

  function livePhaseLabel(phase) {
    switch (String(phase || "")) {
      case "accepted":
        return "Accepted";
      case "collecting_context":
        return "Collecting context";
      case "connecting_runtime":
        return "Connecting runtime";
      case "awaiting_tool_approval":
        return "Awaiting tool";
      case "streaming_answer":
        return "Streaming answer";
      case "saving_session":
        return "Saving session";
      case "completed":
        return "Completed";
      case "failed":
        return "Failed";
      case "canceled":
        return "Canceled";
      default:
        return "Streaming";
    }
  }

  function livePhaseCopy(live) {
    const phase = String((live && live.phase) || "");
    switch (phase) {
      case "accepted":
        return "Prompt received. Spinning up the live Binary IDE shell.";
      case "collecting_context":
        return "Gathering workspace context before the real answer lands.";
      case "connecting_runtime":
        return "Connecting to the runtime and waiting for the first streamed answer.";
      case "awaiting_tool_approval":
        return "A tool decision is blocking the next step.";
      case "streaming_answer":
        return "Answer text is now arriving through the live assistant stream.";
      case "saving_session":
        return "Wrapping up the session and locking in the final response.";
      case "completed":
        return "Live response finished.";
      case "failed":
        return "The live response failed before completion.";
      case "canceled":
        return "The live response was canceled.";
      default:
        return "Streaming Binary IDE is warming up this reply.";
    }
  }

  function liveTransportLabel(live) {
    const transport = String((live && live.transport) || "");
    switch (transport) {
      case "qwen":
        return "Qwen stream";
      case "playground":
        return "Hosted stream";
      case "binary":
        return "Bundle stream";
      default:
        return "Live shell";
    }
  }

  function renderLiveBinaryMessage(item, includeFollowups) {
    const live = item && item.live ? item.live : {};
    const status = String(live.status || "pending");
    const liveMode = String(live.mode || "shell");
    const progress = clampProgress(live.progress != null ? live.progress : 0);
    const latestActivity = truncateText(live.latestActivity || "", 88) || "Streaming Binary IDE is preparing your response.";
    const latestLog = truncateText(live.latestLog || "", 96) || "No live logs yet.";
    const latestFile = truncateText(live.latestFile || "", 72) || "No file attached yet.";
    const hasBody = Boolean(String(item.content || "").trim());
    const settled = status === "done" || status === "failed" || status === "canceled";
    const liveClass = settled ? " settled" : status === "streaming" ? " active" : "";
    const bodyClass = hasBody ? "" : " is-hidden";

    if (settled) {
      return [
        `<article class="message assistant live-binary${liveClass}">`,
        '<div class="message-meta">Streaming Binary IDE</div>',
        '<div class="live-message-shell compact">',
        '<div class="live-message-head compact">',
        '<div class="live-message-kicker"><span class="live-message-dot" aria-hidden="true"></span><span>Streaming Binary IDE</span></div>',
        '<div class="live-message-settled-meta">',
        `<span class="live-message-pill">${escapeHtml(liveTransportLabel(live))}</span>`,
        `<span class="live-message-pill status-${escapeHtml(status)}">${escapeHtml(livePhaseLabel(live.phase))}</span>`,
        "</div>",
        "</div>",
        '<div class="live-message-summary">',
        `<span class="live-message-summary-text">${escapeHtml(
          liveMode === "build"
            ? latestFile !== "No file attached yet."
              ? `Last file: ${latestFile}`
              : latestActivity
            : latestActivity
        )}</span>`,
        "</div>",
        "</div>",
        `<div class="message-body${bodyClass}">${hasBody ? formatMessageBody(item.content) : ""}</div>`,
        includeFollowups ? renderFollowUpActions() : "",
        "</article>",
      ].join("");
    }

    return [
      `<article class="message assistant live-binary${liveClass}">`,
      '<div class="message-meta">Streaming Binary IDE</div>',
      '<div class="live-message-shell">',
      '<div class="live-message-head">',
      '<div class="live-message-kicker"><span class="live-message-dot" aria-hidden="true"></span><span>Streaming Binary IDE</span></div>',
      `<span class="live-message-pill">${escapeHtml(liveTransportLabel(live))}</span>`,
      "</div>",
      '<div class="live-message-main">',
      '<div class="live-message-copy">',
      `<h3 class="live-message-title">${escapeHtml(
        liveMode === "build" ? "Portable bundle assembly" : hasBody ? "Live assistant response" : "Live assistant warmup"
      )}</h3>`,
      `<p class="live-message-caption">${escapeHtml(livePhaseCopy(live))}</p>`,
      '<div class="live-message-metrics">',
      `<span class="live-message-metric"><strong>${escapeHtml(livePhaseLabel(live.phase))}</strong> phase</span>`,
      `<span class="live-message-metric"><strong>${escapeHtml(String(progress))}%</strong> progress</span>`,
      `<span class="live-message-metric"><strong>${escapeHtml(status)}</strong> status</span>`,
      "</div>",
      '<div class="live-message-notes">',
      `<div class="live-message-note"><span class="live-message-note-label">Activity</span><span class="live-message-note-value">${escapeHtml(latestActivity)}</span></div>`,
      `<div class="live-message-note"><span class="live-message-note-label">${escapeHtml(
        liveMode === "build" ? "Live file" : "Live detail"
      )}</span><span class="live-message-note-value">${escapeHtml(liveMode === "build" ? latestFile : latestLog)}</span></div>`,
      "</div>",
      "</div>",
      '<div class="live-message-stream" aria-hidden="true">',
      '<span class="binary-build-stream-label">Live Stream</span>',
      '<span class="binary-build-line">101010 001101 101010 110010 010101</span>',
      '<span class="binary-build-line">010101 110010 001101 101010 011001</span>',
      '<span class="binary-build-line">111000 101010 010101 001111 101000</span>',
      '<span class="binary-build-line">001101 010101 111000 101010 010011</span>',
      "</div>",
      "</div>",
      `<div class="message-body${bodyClass}">${hasBody ? formatMessageBody(item.content) : ""}</div>`,
      includeFollowups ? renderFollowUpActions() : "",
      "</article>",
    ].join("");
  }

  function getBinaryViewModel() {
    const binary = state.binary || {};
    const build = binary.activeBuild || null;
    const reliability = binary.reliability || (build && build.reliability) || null;
    const artifactState = binary.artifactState || (build && build.artifactState) || null;
    const manifest = build && build.manifest ? build.manifest : null;
    const plan = build && build.preview && build.preview.plan ? build.preview.plan : null;
    const previewFiles = Array.isArray(binary.previewFiles) ? binary.previewFiles : [];
    const recentLogs = Array.isArray(binary.recentLogs) ? binary.recentLogs : [];
    const phase =
      binary.phase ||
      (build && build.phase) ||
      (build && build.status === "completed"
        ? "completed"
        : build && build.status === "failed"
          ? "failed"
          : build && build.status === "canceled"
            ? "canceled"
            : build && build.status === "running"
              ? "planning"
              : "queued");
    const progress = clampProgress(
      binary.progress != null
        ? binary.progress
        : build && build.progress != null
          ? build.progress
          : build && build.status === "completed"
            ? 100
            : 0
    );
    const isPending = Boolean(build && (build.status === "queued" || build.status === "running"));
    const showVisual = Boolean(binary.busy || binary.streamConnected || build);
    const runtimeLabel =
      binary.targetEnvironment && binary.targetEnvironment.runtime === "node20" ? "Node 20" : "Node 18";
    const summaryStatus = build
      ? build.status === "completed"
        ? "Bundle ready"
        : build.status === "canceled"
          ? "Build canceled"
          : build.status === "failed"
            ? "Build failed"
            : build.status === "running"
              ? "Building"
              : "Queued"
      : "No bundle yet";

    return {
      binary,
      build,
      reliability,
      artifactState,
      manifest,
      plan,
      previewFiles,
      recentLogs,
      phase,
      progress,
      isPending,
      showVisual,
      runtimeLabel,
      summaryStatus,
    };
  }

  function renderChatBinarySpotlight() {
    if (!elements.chatBinarySpotlight) return;
    if (state.liveChat && state.liveChat.messageId) {
      const live = state.liveChat;
      const show = live.status !== "done" && live.status !== "failed" && live.status !== "canceled";
      if (!show) {
        elements.chatBinarySpotlight.innerHTML = "";
        elements.chatBinarySpotlight.classList.add("is-hidden");
        return;
      }
      elements.chatBinarySpotlight.innerHTML = [
        '<div class="chat-binary-spotlight-shell">',
        '<section class="chat-binary-spotlight live" aria-label="Streaming binary chat">',
        '<div class="chat-binary-copy">',
        '<div class="chat-binary-head">',
        '<div class="chat-binary-kicker"><span class="chat-binary-kicker-dot" aria-hidden="true"></span><span>Streaming Binary IDE</span></div>',
        `<span class="chat-binary-pill live">${escapeHtml(liveTransportLabel(live))}</span>`,
        "</div>",
        `<h2 class="chat-binary-title">${escapeHtml(
          live.mode === "build" ? "Portable bundle assembly" : "Live assistant response"
        )}</h2>`,
        `<p class="chat-binary-caption">${escapeHtml(livePhaseCopy(live))}</p>`,
        '<div class="chat-binary-metrics">',
        `<div class="chat-binary-metric"><span>Phase</span><strong>${escapeHtml(livePhaseLabel(live.phase))}</strong></div>`,
        `<div class="chat-binary-metric"><span>Progress</span><strong>${escapeHtml(String(clampProgress(live.progress || 0)))}%</strong></div>`,
        `<div class="chat-binary-metric"><span>Transport</span><strong>${escapeHtml(liveTransportLabel(live))}</strong></div>`,
        `<div class="chat-binary-metric"><span>Status</span><strong>${escapeHtml(String(live.status || "pending"))}</strong></div>`,
        "</div>",
        '<div class="chat-binary-notes">',
        '<div class="chat-binary-note">',
        '<span class="chat-binary-note-label">Live activity</span>',
        `<span class="chat-binary-note-value">${escapeHtml(truncateText(live.latestActivity || "Waiting for runtime activity.", 120))}</span>`,
        `<span class="chat-binary-note-copy">${escapeHtml(truncateText(live.latestLog || live.latestFile || "Binary pulse stays active until the answer fully lands.", 160))}</span>`,
        "</div>",
        '<div class="chat-binary-note">',
        '<span class="chat-binary-note-label">Transcript handoff</span>',
        `<span class="chat-binary-note-value">${escapeHtml(
          live.mode === "answer" ? "Same assistant bubble, now streaming text." : "Same assistant bubble, warming up."
        )}</span>`,
        '<span class="chat-binary-note-copy">This live shell collapses into the final answer instead of adding another row.</span>',
        "</div>",
        "</div>",
        "</div>",
        '<div class="binary-build-stream" aria-hidden="true">',
        '<span class="binary-build-stream-label">Live Stream</span>',
        '<span class="binary-build-line">101010 001101 101010 110010 010101</span>',
        '<span class="binary-build-line">010101 110010 001101 101010 011001</span>',
        '<span class="binary-build-line">111000 101010 010101 001111 101000</span>',
        '<span class="binary-build-line">001101 010101 111000 101010 010011</span>',
        '<span class="binary-build-line">110010 001101 010101 111000 101101</span>',
        "</div>",
        "</section>",
        "</div>",
      ].join("");
      elements.chatBinarySpotlight.classList.remove("is-hidden");
      return;
    }
    const view = getBinaryViewModel();
    const { binary, build, reliability, artifactState, previewFiles, recentLogs, phase, progress, runtimeLabel } = view;
    const show = Boolean(binary.busy || binary.streamConnected || build);

    if (!show) {
      elements.chatBinarySpotlight.innerHTML = "";
      elements.chatBinarySpotlight.classList.add("is-hidden");
      return;
    }

    const latestFile = previewFiles.length ? previewFiles[previewFiles.length - 1] : null;
    const latestLog = recentLogs.length ? recentLogs[recentLogs.length - 1] : "";
    const streamLabel = binary.streamConnected ? "Live stream attached" : build ? "Saved build snapshot" : "Idle";
    const pillClass = binary.streamConnected ? "live" : build ? "saved" : "";
    const buildTitle = build
      ? `${binaryPhaseLabel(phase)} portable starter bundle`
      : "Streaming binary assembly";
    const fileValue = artifactState && artifactState.latestFile
      ? artifactState.latestFile
      : latestFile
        ? `${latestFile.path}${latestFile.completed ? " [done]" : " [writing]"}`
        : "Waiting for generated files";
    const fileCopy = artifactState
      ? `${artifactState.sourceFilesReady}/${artifactState.sourceFilesTotal} source files formed. ${artifactState.outputFilesReady} compiled outputs detected. ${artifactState.runnable ? "Runtime is callable." : "Runtime is not callable yet."}`
      : latestFile
        ? truncateText(latestFile.preview || "(empty preview)", 160)
        : "New source previews will appear here as soon as the live build materializes them.";
    const logValue = latestLog ? truncateText(latestLog, 84) : "Waiting for streaming logs";
    const logCopy = latestLog
      ? "Latest build output from the live binary stream."
      : "npm install, build, and validation output will stream here while you chat.";
    const formationLabel = artifactState ? `${artifactState.coverage}% formed` : "--";
    const runnableLabel = artifactState ? (artifactState.runnable ? "Runnable" : "Not runnable yet") : "--";
    const outputLabel = artifactState ? String(artifactState.outputFilesReady) : "--";

    elements.chatBinarySpotlight.innerHTML = [
      '<div class="chat-binary-spotlight-shell">',
      `<section class="chat-binary-spotlight${binary.streamConnected ? " live" : ""}" aria-label="Streaming binary build">`,
      '<div class="chat-binary-copy">',
      '<div class="chat-binary-head">',
      '<div class="chat-binary-kicker"><span class="chat-binary-kicker-dot" aria-hidden="true"></span><span>Streaming Binary IDE</span></div>',
      `<span class="chat-binary-pill${pillClass ? ` ${pillClass}` : ""}">${escapeHtml(streamLabel)}</span>`,
      "</div>",
      `<h2 class="chat-binary-title">${escapeHtml(buildTitle)}</h2>`,
      `<p class="chat-binary-caption">${escapeHtml(binaryPhaseCaption(phase))}</p>`,
      '<div class="chat-binary-metrics">',
      `<div class="chat-binary-metric"><span>Phase</span><strong>${escapeHtml(binaryPhaseLabel(phase))}</strong></div>`,
      `<div class="chat-binary-metric"><span>Progress</span><strong>${escapeHtml(String(progress))}%</strong></div>`,
      `<div class="chat-binary-metric"><span>Runtime</span><strong>${escapeHtml(runtimeLabel)}</strong></div>`,
      `<div class="chat-binary-metric"><span>Reliability</span><strong>${escapeHtml(
        reliability ? `${reliability.score}/100` : "--"
      )}</strong></div>`,
      `<div class="chat-binary-metric"><span>Formation</span><strong>${escapeHtml(formationLabel)}</strong></div>`,
      `<div class="chat-binary-metric"><span>State</span><strong>${escapeHtml(runnableLabel)}</strong></div>`,
      `<div class="chat-binary-metric"><span>Outputs</span><strong>${escapeHtml(outputLabel)}</strong></div>`,
      "</div>",
      '<div class="chat-binary-notes">',
      '<div class="chat-binary-note">',
      '<span class="chat-binary-note-label">Live artifact</span>',
      `<span class="chat-binary-note-value">${escapeHtml(fileValue)}</span>`,
      `<span class="chat-binary-note-copy">${escapeHtml(fileCopy)}</span>`,
      "</div>",
      '<div class="chat-binary-note">',
      '<span class="chat-binary-note-label">Live log</span>',
      `<span class="chat-binary-note-value">${escapeHtml(logValue)}</span>`,
      `<span class="chat-binary-note-copy">${escapeHtml(logCopy)}</span>`,
      "</div>",
      "</div>",
      "</div>",
      '<div class="binary-build-stream" aria-hidden="true">',
      '<span class="binary-build-stream-label">Live Stream</span>',
      '<span class="binary-build-line">101010 001101 101010 110010 010101</span>',
      '<span class="binary-build-line">010101 110010 001101 101010 011001</span>',
      '<span class="binary-build-line">111000 101010 010101 001111 101000</span>',
      '<span class="binary-build-line">001101 010101 111000 101010 010011</span>',
      '<span class="binary-build-line">110010 001101 010101 111000 101101</span>',
      "</div>",
      "</section>",
      "</div>",
    ].join("");

    elements.chatBinarySpotlight.classList.remove("is-hidden");
  }

  function renderBinaryPanel() {
    const { binary, build, reliability, artifactState, manifest, plan, previewFiles, recentLogs, phase, progress, isPending, showVisual, runtimeLabel, summaryStatus } =
      getBinaryViewModel();
    const shouldAutoOpenPanel = !state.binaryPanelOpen && Boolean(binary.busy || binary.streamConnected || isPending);
    const shouldAutoOpenDetails =
      !state.binaryDetailsOpen &&
      Boolean(binary.busy || binary.streamConnected || isPending) &&
      Boolean(previewFiles.length || recentLogs.length || plan || manifest);
    const warnings = [];

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
          : status === "canceled"
            ? "Build canceled"
            : status === "failed"
              ? "Build failed"
              : status === "running"
                ? "Building"
                : status === "queued"
                  ? "Queued"
                  : binary.busy
                    ? "Working"
                    : "No bundle yet";
      const statusClass =
        reliability?.status || status === "failed" || status === "canceled"
          ? reliability?.status || "fail"
          : "";
      elements.binaryStatusBadge.textContent = label;
      elements.binaryStatusBadge.className = `binary-status ${statusClass}`.trim();
    }

    if (elements.binaryTargetRuntime) {
      elements.binaryTargetRuntime.value =
        binary.targetEnvironment && binary.targetEnvironment.runtime === "node20" ? "node20" : "node18";
      elements.binaryTargetRuntime.disabled = Boolean(binary.busy || isPending);
    }

    if (elements.binaryReliabilityScore) {
      elements.binaryReliabilityScore.textContent = reliability ? `${reliability.score}/100` : "--";
    }

    if (elements.binaryArtifactLabel) {
      elements.binaryArtifactLabel.textContent = build && build.artifact
        ? `${build.artifact.fileName} (${formatBytes(build.artifact.sizeBytes)})`
        : artifactState
          ? artifactState.runnable
            ? `Runnable preview (${artifactState.outputFilesReady} outputs)`
            : `${artifactState.coverage}% formed`
          : "No bundle yet";
    }

    if (elements.binaryPublishLabel) {
      elements.binaryPublishLabel.textContent = build && build.publish ? "Published" : "Private";
    }
    if (elements.binaryPhaseLabel) {
      elements.binaryPhaseLabel.textContent = binaryPhaseLabel(phase);
    }
    if (elements.binaryPanelSummary) {
      const streamState = binary.streamConnected ? "Live stream" : build ? "Saved build" : "Idle";
      const formationLabel = artifactState ? `${artifactState.coverage}% formed` : summaryStatus;
      elements.binaryPanelSummary.textContent = `${runtimeLabel} - ${formationLabel} - ${streamState}`;
    }
    if (elements.binaryPanelMeta) {
      elements.binaryPanelMeta.textContent = build
        ? artifactState
          ? `${artifactState.runnable ? "Runnable" : "Not runnable"} - ${artifactState.outputFilesReady} outputs ready`
          : `Build ${build.id.slice(0, 8)} - ${binaryPhaseLabel(phase)}`
        : "Runtime, reliability, publish, and download controls.";
    }

    if (elements.binaryBuildVisual) {
      elements.binaryBuildVisual.classList.toggle("show", showVisual);
    }
    if (elements.binaryBuildTitle) {
      elements.binaryBuildTitle.textContent = build
        ? `${binaryPhaseLabel(phase)} portable starter bundle`
        : "Encoding Binary starter bundle";
    }
    if (elements.binaryBuildCaption) {
      elements.binaryBuildCaption.textContent = artifactState
        ? `${binaryPhaseCaption(phase)} ${artifactState.sourceFilesReady}/${artifactState.sourceFilesTotal} source files formed, ${artifactState.outputFilesReady} compiled outputs, ${artifactState.runnable ? "runtime is callable" : "runtime not callable yet"}.`
        : binaryPhaseCaption(phase);
    }
    if (elements.binaryProgressLabel) {
      elements.binaryProgressLabel.textContent = binaryPhaseLabel(phase);
    }
    if (elements.binaryProgressValue) {
      elements.binaryProgressValue.textContent = `${progress}%`;
    }
    if (elements.binaryProgressFill) {
      elements.binaryProgressFill.style.width = `${progress}%`;
    }

    if (elements.binaryManifestPreview) {
      elements.binaryManifestPreview.textContent = manifest
        ? [
            `Name: ${manifest.displayName}`,
            `Runtime: ${manifest.runtime}`,
            `Entrypoint: ${manifest.entrypoint}`,
            `Build: ${manifest.buildCommand}`,
            `Start: ${manifest.startCommand}`,
            ...(artifactState
              ? [
                  `Formation: ${artifactState.coverage}%`,
                  `Runnable: ${artifactState.runnable ? "yes" : "no"}`,
                  `Outputs ready: ${artifactState.outputFilesReady}`,
                ]
              : []),
          ].join("\n")
        : plan
          ? [
              `Name: ${plan.displayName}`,
              `Entrypoint: ${plan.entrypoint}`,
              `Build: ${plan.buildCommand}`,
              `Start: ${plan.startCommand}`,
              ...(artifactState
                ? [
                    `Formation: ${artifactState.coverage}%`,
                    `Runnable: ${artifactState.runnable ? "yes" : "no"}`,
                    `Outputs ready: ${artifactState.outputFilesReady}`,
                  ]
                : []),
              "",
              "Planned source files:",
              ...(Array.isArray(plan.sourceFiles) && plan.sourceFiles.length ? plan.sourceFiles : ["(none yet)"]),
            ].join("\n")
          : "Generate a portable starter bundle to inspect its manifest.";
    }

    if (elements.binaryWarnings) {
      if (!warnings.length) {
        elements.binaryWarnings.textContent = build && build.errorMessage
          ? build.errorMessage
          : "No Streaming Binary IDE warnings yet.";
      } else {
        elements.binaryWarnings.textContent = warnings.join("\n");
      }
    }

    if (elements.binaryPreviewFiles) {
      elements.binaryPreviewFiles.textContent = previewFiles.length
        ? previewFiles
            .slice(0, 6)
            .map((file) =>
              [
                `${file.path}${file.completed ? " [done]" : " [writing]"}`,
                file.preview || "(empty preview)",
              ].join("\n")
            )
            .join("\n\n")
        : artifactState
          ? "Source and compiled file previews will appear here as the artifact forms."
          : "Generated file previews will appear here as the build progresses.";
    }

    if (elements.binaryLogPreview) {
      elements.binaryLogPreview.textContent = recentLogs.length
        ? recentLogs.slice(-18).join("\n")
        : "Streaming build logs will appear here.";
    }

    if (elements.generateBinaryButton) {
      elements.generateBinaryButton.disabled = Boolean(binary.busy || isPending);
    }
    if (elements.cancelBinaryButton) {
      elements.cancelBinaryButton.disabled = !binary.canCancel;
      elements.cancelBinaryButton.textContent = build && build.status === "canceled" ? "Canceled" : "Cancel";
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

    if (shouldAutoOpenPanel) {
      setBinaryPanelOpen(true);
    }
    if (shouldAutoOpenDetails) {
      setBinaryDetailsOpen(true);
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
        "Type a file name or symbol and Streaming Binary IDE will resolve likely targets before you send.";
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
        const tabIndex = index === selectedMentionIndex ? "0" : "-1";
        const selected = index === selectedMentionIndex ? "true" : "false";
        return `<div class="mention-item"><button type="button" class="${active.trim()}" data-mention-index="${index}" data-mention-value="${escapeHtml(item)}" title="${escapeHtml(item)}" tabindex="${tabIndex}" aria-selected="${selected}">${escapeHtml(label)}</button></div>`;
      })
      .join("");
  }

  function render() {
    syncShellState();
    syncComposerFromState(state);
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
          : "Ask Streaming Binary IDE to inspect code, patch files, or prepare a portable starter bundle";
    }
    renderHistory();
    renderActivity();
    renderBinaryPanel();
    renderChatBinarySpotlight();
    renderMessages();
    renderMentions();
    renderPlanConfirm();
    syncComposerHeight();
    if (!hasAutoFocused && !state.busy) {
      focusComposer(true);
    }
  }

  function hideMentions() {
    activeMentionRange = null;
    mentionItems = [];
    selectedMentionIndex = 0;
    mentionKeyboardActive = false;
    renderMentions();
    renderPlanConfirm();
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
    if (isPlanShortcutValue(value)) {
      if (planConfirmVisible) {
        confirmPlanMode();
      } else {
        planConfirmDismissed = false;
        planConfirmVisible = true;
        renderPlanConfirm();
      }
      return;
    }
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
    hidePlanConfirm();
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
      case "cancelBinary":
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

  function focusActiveMentionButton() {
    if (!elements.mentions || !mentionItems.length) return;
    const activeButton = elements.mentions.querySelector(`[data-mention-index="${selectedMentionIndex}"]`);
    if (activeButton && typeof activeButton.focus === "function") {
      activeButton.focus();
    }
  }

  function moveMentionSelection(delta, options) {
    if (!mentionItems.length) return false;
    selectedMentionIndex = (selectedMentionIndex + delta + mentionItems.length) % mentionItems.length;
    renderMentions();
    const activeItem = elements.mentions && elements.mentions.querySelector(`[data-mention-index="${selectedMentionIndex}"]`);
    if (activeItem && typeof activeItem.scrollIntoView === "function") {
      activeItem.scrollIntoView({ block: "nearest" });
    }
    if (options && options.focus) {
      focusActiveMentionButton();
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

    const planConfirmButton = target.closest("#composerConfirmButton");
    if (planConfirmButton) {
      confirmPlanMode();
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
        mentionKeyboardActive = true;
        if (document.activeElement === elements.composer) {
          if (!moveMentionSelection(1, { focus: true })) {
            focusActiveMentionButton();
          }
        } else {
          moveMentionSelection(1, { focus: true });
        }
        return;
      }
      if (mentionItems.length && event.key === "ArrowUp") {
        event.preventDefault();
        mentionKeyboardActive = true;
        if (document.activeElement === elements.composer) {
          if (!moveMentionSelection(-1, { focus: true })) {
            selectedMentionIndex = mentionItems.length - 1;
            renderMentions();
            focusActiveMentionButton();
          }
        } else {
          moveMentionSelection(-1, { focus: true });
        }
        return;
      }
      if (mentionItems.length && event.key === "Enter" && !event.shiftKey) {
        event.preventDefault();
        applyMention(mentionItems[selectedMentionIndex] || "");
        return;
      }
      if (!mentionItems.length && event.key === "Tab" && event.shiftKey) {
        event.preventDefault();
        event.stopPropagation();
        hidePlanConfirm();
        vscode.postMessage({ type: "togglePlanMode" });
        return;
      }
      if (planConfirmVisible && event.key === "Enter" && !event.shiftKey) {
        event.preventDefault();
        event.stopPropagation();
        confirmPlanMode();
        return;
      }
      if (event.key === "Escape") {
        if (planConfirmVisible) {
          hidePlanConfirm({ dismissed: true });
        }
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
      updatePlanConfirm();
      schedulePreviewContext(120);
    });

    elements.composer.addEventListener("blur", () => {
      window.setTimeout(() => {
        if (document.activeElement !== elements.composer && !isFocusInsideMentions()) {
          hideMentions();
        }
      }, 120);
    });
  }

  if (elements.mentions) {
    elements.mentions.addEventListener("keydown", (event) => {
      if (!mentionItems.length) return;
      if (event.key === "ArrowDown") {
        event.preventDefault();
        mentionKeyboardActive = true;
        moveMentionSelection(1, { focus: true });
        return;
      }
      if (event.key === "ArrowUp") {
        event.preventDefault();
        mentionKeyboardActive = true;
        moveMentionSelection(-1, { focus: true });
        return;
      }
      if (event.key === "Enter") {
        event.preventDefault();
        applyMention(mentionItems[selectedMentionIndex] || "");
        return;
      }
      if (event.key === "Escape") {
        event.preventDefault();
        hideMentions();
        focusComposer(true);
      }
    });

    elements.mentions.addEventListener("focusin", (event) => {
      const target = event.target;
      if (!(target instanceof Element)) return;
      const index = Number(target.getAttribute("data-mention-index"));
      if (!Number.isFinite(index) || index < 0) return;
      selectedMentionIndex = index;
      mentionKeyboardActive = true;
      renderMentions();
    });

    elements.mentions.addEventListener("mousemove", (event) => {
      const target = event.target;
      if (!(target instanceof Element)) return;
      const button = target.closest("[data-mention-index]");
      if (!button) return;
      const index = Number(button.getAttribute("data-mention-index"));
      if (!Number.isFinite(index) || index === selectedMentionIndex) return;
      selectedMentionIndex = index;
      mentionKeyboardActive = true;
      renderMentions();
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
      updatePlanConfirm();
      schedulePreviewContext(0);
      return;
    }
    if (message.type === "mentions") {
      if (Number(message.requestId || 0) !== mentionRequestId) return;
      mentionItems = Array.isArray(message.items) ? message.items : [];
      selectedMentionIndex = 0;
      mentionKeyboardActive = false;
      renderMentions();
      renderPlanConfirm();
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

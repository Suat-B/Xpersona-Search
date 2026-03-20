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
    artifactsDrawerOpen: false,
    binaryDetailsOpen: false,
    binaryPanelOpen: false,
    settingsMenuOpen: false,
    localArtifacts: [],
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
      sourceGraph: null,
      execution: null,
      checkpoints: [],
      pendingRefinement: null,
      canCancel: false,
      lastAction: null,
    },
    binaryHero: {
      active: false,
      sourceId: null,
      sourceKind: null,
      transport: "",
      title: "",
      phase: "",
      progress: 0,
      status: "pending",
      activity: "",
      lines: [],
      lastContentLength: 0,
      lastLogCursor: 0,
      lastFileCursor: 0,
      lastActivityValue: "",
      lastLogValue: "",
      lastFileValue: "",
      lastHeartbeatAt: 0,
      lastFrameAt: 0,
    },
  };

  const elements = {
    workspaceShell: document.getElementById("workspaceShell"),
    currentChatTitle: document.getElementById("currentChatTitle"),
    historyToggle: document.getElementById("historyToggle"),
    artifactsToggle: document.getElementById("artifactsToggle"),
    settingsToggle: document.getElementById("settingsToggle"),
    settingsMenu: document.getElementById("settingsMenu"),
    settingsSignIn: document.getElementById("settingsSignIn"),
    settingsSignOut: document.getElementById("settingsSignOut"),
    settingsRuntimeQwen: document.getElementById("settingsRuntimeQwen"),
    settingsRuntimeHosted: document.getElementById("settingsRuntimeHosted"),
    settingsUndo: document.getElementById("settingsUndo"),
    historyDrawer: document.getElementById("historyDrawer"),
    historyScrim: document.getElementById("historyScrim"),
    artifactsDrawer: document.getElementById("artifactsDrawer"),
    artifactsScrim: document.getElementById("artifactsScrim"),
    artifactsList: document.getElementById("artifactsList"),
    artifactsCount: document.getElementById("artifactsCount"),
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
    authStatusButton: document.getElementById("authStatusButton"),
    authStatusDot: document.getElementById("authStatusDot"),
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
    binaryManifestCard: document.getElementById("binaryManifestCard"),
    binaryWarnings: document.getElementById("binaryWarnings"),
    binaryWarningsCard: document.getElementById("binaryWarningsCard"),
    binaryGraphSummary: document.getElementById("binaryGraphSummary"),
    binaryGraphCard: document.getElementById("binaryGraphCard"),
    binaryExecutionSummary: document.getElementById("binaryExecutionSummary"),
    binaryExecutionCard: document.getElementById("binaryExecutionCard"),
    binaryCheckpointSelect: document.getElementById("binaryCheckpointSelect"),
    binaryCheckpointSummary: document.getElementById("binaryCheckpointSummary"),
    binaryCheckpointCard: document.getElementById("binaryCheckpointCard"),
    binaryEntryPointSelect: document.getElementById("binaryEntryPointSelect"),
    binaryEntryPointSummary: document.getElementById("binaryEntryPointSummary"),
    binaryEntryPointCard: document.getElementById("binaryEntryPointCard"),
    binaryPreviewFiles: document.getElementById("binaryPreviewFiles"),
    binaryPreviewFilesCard: document.getElementById("binaryPreviewFilesCard"),
    binaryLogPreview: document.getElementById("binaryLogPreview"),
    binaryLogPreviewCard: document.getElementById("binaryLogPreviewCard"),
    generateBinaryButton: document.getElementById("generateBinaryButton"),
    cancelBinaryButton: document.getElementById("cancelBinaryButton"),
    refineBinaryButton: document.getElementById("refineBinaryButton"),
    branchBinaryButton: document.getElementById("branchBinaryButton"),
    rewindBinaryButton: document.getElementById("rewindBinaryButton"),
    executeBinaryButton: document.getElementById("executeBinaryButton"),
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
  let preservedChatScrollTop = null;
  let preserveChatScrollFrames = 0;
  let suppressScrollSignalUntil = 0;
  let previewTimer = 0;
  let lastPreviewText = null;
  let lastDraftKey = "";
  let lastDraftText = "";
  let binaryHeroTimer = 0;
  let pendingOutgoingMessage = null;
  let pendingThinkingCue = null;
  const THINKING_CUE_MIN_MS = 700;
  const settledLiveMessageIds = new Set();
  const binaryEncoder = typeof TextEncoder !== "undefined" ? new TextEncoder() : null;
  const BINARY_HERO_MAX_LINES = 72;
  const BINARY_HERO_LINE_BYTES = 5;
  const BINARY_HERO_HEARTBEAT_MS = 900;
  const SEND_ICON = '<svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12h12 M13 6l6 6-6 6"></path></svg>';
  const CANCEL_ICON = '<svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="M6 6h12v12H6z"></path></svg>';

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

  function createClientMessageId() {
    if (typeof crypto !== "undefined" && crypto && typeof crypto.randomUUID === "function") {
      return crypto.randomUUID();
    }
    return `msg_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
  }

  function setPendingOutgoingMessage(id, content) {
    const nextId = String(id || "").trim();
    const nextContent = String(content || "").trim();
    if (!nextId || !nextContent) return;
    pendingOutgoingMessage = {
      id: nextId,
      content: nextContent,
    };
  }

  function setPendingThinkingCue(id, baselineCount) {
    const nextId = String(id || "").trim();
    const nextBaseline = Number(baselineCount);
    if (!nextId || !Number.isFinite(nextBaseline) || nextBaseline < 0) {
      pendingThinkingCue = null;
      return;
    }
    const startedAt = Date.now();
    pendingThinkingCue = {
      id: nextId,
      baselineCount: Math.floor(nextBaseline),
      startedAt,
      visibleUntil: startedAt + THINKING_CUE_MIN_MS,
    };
  }

  function clearPendingOutgoingMessage(id) {
    if (!pendingOutgoingMessage) return;
    if (!id || pendingOutgoingMessage.id === id) {
      pendingOutgoingMessage = null;
    }
  }

  function clearPendingThinkingCue(id) {
    if (!pendingThinkingCue) return;
    if (!id || pendingThinkingCue.id === id) {
      pendingThinkingCue = null;
    }
  }

  function hasFreshAssistantResponse(messages) {
    if (!pendingThinkingCue) return false;
    const list = Array.isArray(messages) ? messages : [];
    const baseline = Math.max(0, Number(pendingThinkingCue.baselineCount) || 0);
    return list.slice(baseline).some((message) => {
      if (!message) return false;
      const role = String(message.role || "assistant");
      if (role === "user") return false;
      const hasVisibleContent = Boolean(String(message.content || "").trim());
      if (message.presentation === "live_binary") {
        return hasVisibleContent;
      }
      return hasVisibleContent;
    });
  }

  function getRenderableMessages() {
    const messages = Array.isArray(state.messages) ? state.messages : [];
    const showThinkingCue = Boolean(pendingThinkingCue) && !hasFreshAssistantResponse(messages);
    const nextMessages = [
      ...messages,
    ];
    if (showThinkingCue) {
      nextMessages.push({
        id: `${pendingOutgoingMessage.id}_thinking`,
        role: "assistant",
        content: "Thinking",
        presentation: "thinking",
      });
    }
    return nextMessages;
  }

  function isArrowDownKey(event) {
    if (!event) return false;
    const key = String(event.key || "");
    const code = String(event.code || "");
    return key === "ArrowDown" || key === "Down" || code === "ArrowDown" || event.keyCode === 40;
  }

  function isArrowUpKey(event) {
    if (!event) return false;
    const key = String(event.key || "");
    const code = String(event.code || "");
    return key === "ArrowUp" || key === "Up" || code === "ArrowUp" || event.keyCode === 38;
  }

  function canCancelLivePrompt() {
    const live = state.liveChat;
    return Boolean(
      state.busy &&
      live &&
      live.mode !== "build" &&
      live.status !== "done" &&
      live.status !== "failed" &&
      live.status !== "canceled"
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

  function authButtonLabel() {
    if (state.runtime === "qwenCode") {
      return state.auth && state.auth.kind !== "none" ? "Xpersona API key ready" : "Set Xpersona API key";
    }
    return state.auth && state.auth.kind !== "none" ? "Auth ready" : "Set Xpersona API key";
  }

  function authButtonShortLabel() {
    if (state.runtime === "qwenCode") {
      return state.auth && state.auth.kind !== "none" ? "Ready" : "Key";
    }
    return state.auth && state.auth.kind !== "none" ? "Auth" : "Key";
  }

  function shortTitle(value, maxLength) {
    const text = String(value || "").replace(/\s+/g, " ").trim();
    if (!text) return "";
    if (!Number.isFinite(maxLength) || maxLength <= 0 || text.length <= maxLength) {
      return text;
    }
    return `${text.slice(0, Math.max(1, maxLength - 1)).trimEnd()}…`;
  }

  function deriveCurrentChatTitle() {
    const historyItems = Array.isArray(state.history) ? state.history : [];
    if (state.selectedSessionId) {
      const selected = historyItems.find((item) => item && item.id === state.selectedSessionId);
      if (selected && selected.title) return shortTitle(selected.title, 64);
    }

    const messages = Array.isArray(state.messages) ? state.messages : [];
    for (let index = messages.length - 1; index >= 0; index -= 1) {
      const message = messages[index];
      if (!message || message.role !== "user") continue;
      const title = shortTitle(message.content, 64);
      if (title) return title;
    }
    return "New chat";
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

  function createBinaryHeroState() {
    return {
      active: false,
      sourceId: null,
      sourceKind: null,
      transport: "",
      title: "",
      phase: "",
      progress: 0,
      status: "pending",
      activity: "",
      lines: [],
      lastContentLength: 0,
      lastLogCursor: 0,
      lastFileCursor: 0,
      lastActivityValue: "",
      lastLogValue: "",
      lastFileValue: "",
      lastHeartbeatAt: 0,
      lastFrameAt: 0,
    };
  }

  function currentLiveMessage() {
    const liveChat = state.liveChat;
    if (!liveChat || !liveChat.messageId) return null;
    const messages = Array.isArray(state.messages) ? state.messages : [];
    return messages.find((message) => message && message.id === liveChat.messageId) || null;
  }

  function getActiveBinaryHeroSource() {
    const liveChat = state.liveChat;
    if (
      liveChat &&
      liveChat.messageId &&
      liveChat.status !== "done" &&
      liveChat.status !== "failed" &&
      liveChat.status !== "canceled"
    ) {
      const liveMessage = currentLiveMessage();
      return {
        kind: "live",
        id: `live:${liveChat.messageId}`,
        transport: liveTransportLabel(liveChat),
        title: liveChat.mode === "build" ? "Portable bundle assembly" : "Live assistant response",
        phase: livePhaseLabel(liveChat.phase),
        progress: clampProgress(liveChat.progress || 0),
        status: String(liveChat.status || "pending"),
        activity: truncateText(liveChat.latestActivity || "Waiting for runtime activity.", 160),
        content: liveMessage ? String(liveMessage.content || "") : "",
        latestLog: String(liveChat.latestLog || ""),
        latestFile: String(liveChat.latestFile || ""),
        logs: [],
        files: [],
      };
    }

    const binary = state.binary || {};
    const build = binary.activeBuild || null;
    const isBuildActive = Boolean(
      binary.busy ||
        binary.streamConnected ||
        (build && (build.status === "queued" || build.status === "running"))
    );
    if (!isBuildActive) return null;

    const previewFiles = Array.isArray(binary.previewFiles) ? binary.previewFiles : [];
    const recentLogs = Array.isArray(binary.recentLogs) ? binary.recentLogs : [];
    const buildPhase =
      binary.phase ||
      (build && build.phase) ||
      (build && build.status === "running" ? "planning" : "queued");

    return {
      kind: "build",
      id: `build:${build && build.id ? build.id : "active"}`,
      transport: "Bundle stream",
      title: build ? `${binaryPhaseLabel(buildPhase)} portable starter bundle` : "Streaming binary assembly",
      phase: binaryPhaseLabel(buildPhase),
      progress: clampProgress(
        binary.progress != null
          ? binary.progress
          : build && build.progress != null
            ? build.progress
            : 0
      ),
      status: build ? String(build.status || "running") : "running",
      activity: truncateText(
        recentLogs.length
          ? recentLogs[recentLogs.length - 1]
          : build
            ? binaryPhaseCaption(buildPhase)
            : "Preparing portable starter bundle.",
        160
      ),
      content: "",
      latestLog: recentLogs.length ? String(recentLogs[recentLogs.length - 1] || "") : "",
      latestFile:
        previewFiles.length && previewFiles[previewFiles.length - 1]
          ? String(previewFiles[previewFiles.length - 1].path || "")
          : "",
      logs: recentLogs,
      files: previewFiles,
    };
  }

  function textToBinaryChunks(text) {
    if (!binaryEncoder) return [];
    const value = String(text || "");
    if (!value) return [];
    const bytes = Array.from(binaryEncoder.encode(value));
    return bytes.map((byte) => byte.toString(2).padStart(8, "0"));
  }

  function appendBinaryHeroText(text, tone) {
    const chunks = textToBinaryChunks(text);
    if (!chunks.length) return false;

    for (let index = 0; index < chunks.length; index += BINARY_HERO_LINE_BYTES) {
      const slice = chunks.slice(index, index + BINARY_HERO_LINE_BYTES);
      state.binaryHero.lines.push({
        id: `${Date.now()}_${index}_${Math.random().toString(16).slice(2, 8)}`,
        bits: slice.join(" "),
        tone: tone || "content",
      });
    }

    if (state.binaryHero.lines.length > BINARY_HERO_MAX_LINES) {
      state.binaryHero.lines = state.binaryHero.lines.slice(-BINARY_HERO_MAX_LINES);
    }

    state.binaryHero.lastFrameAt = Date.now();
    return true;
  }

  function updateBinaryHeroState(options) {
    const source = getActiveBinaryHeroSource();
    if (!source) {
      state.binaryHero.active = false;
      return;
    }

    if (state.binaryHero.sourceId !== source.id) {
      state.binaryHero = {
        ...createBinaryHeroState(),
        active: true,
        sourceId: source.id,
        sourceKind: source.kind,
      };
    }

    state.binaryHero.active = true;
    state.binaryHero.transport = source.transport;
    state.binaryHero.title = source.title;
    state.binaryHero.phase = source.phase;
    state.binaryHero.progress = source.progress;
    state.binaryHero.status = source.status;
    state.binaryHero.activity = source.activity;

    let appended = false;
    const nextContent = String(source.content || "");
    if (nextContent.length > state.binaryHero.lastContentLength) {
      appended =
        appendBinaryHeroText(nextContent.slice(state.binaryHero.lastContentLength), "content") || appended;
      state.binaryHero.lastContentLength = nextContent.length;
    } else if (nextContent.length < state.binaryHero.lastContentLength) {
      state.binaryHero.lastContentLength = nextContent.length;
    }

    const logs = Array.isArray(source.logs) ? source.logs : [];
    if (logs.length > state.binaryHero.lastLogCursor) {
      logs.slice(state.binaryHero.lastLogCursor).forEach((value) => {
        appended = appendBinaryHeroText(String(value || ""), "log") || appended;
      });
      state.binaryHero.lastLogCursor = logs.length;
      state.binaryHero.lastLogValue = logs.length ? String(logs[logs.length - 1] || "") : state.binaryHero.lastLogValue;
    } else if (source.latestLog && source.latestLog !== state.binaryHero.lastLogValue) {
      appended = appendBinaryHeroText(source.latestLog, "log") || appended;
      state.binaryHero.lastLogValue = source.latestLog;
    }

    if (source.activity && source.activity !== state.binaryHero.lastActivityValue) {
      appended = appendBinaryHeroText(source.activity, "activity") || appended;
      state.binaryHero.lastActivityValue = source.activity;
    }

    const files = Array.isArray(source.files) ? source.files : [];
    if (files.length > state.binaryHero.lastFileCursor) {
      files.slice(state.binaryHero.lastFileCursor).forEach((file) => {
        const fileText = [
          String(file && file.path ? file.path : ""),
          String(file && file.preview ? file.preview : ""),
        ]
          .filter(Boolean)
          .join("\n");
        appended = appendBinaryHeroText(fileText, "file") || appended;
      });
      state.binaryHero.lastFileCursor = files.length;
      state.binaryHero.lastFileValue =
        files.length && files[files.length - 1] ? String(files[files.length - 1].path || "") : state.binaryHero.lastFileValue;
    } else if (source.latestFile && source.latestFile !== state.binaryHero.lastFileValue) {
      appended = appendBinaryHeroText(source.latestFile, "file") || appended;
      state.binaryHero.lastFileValue = source.latestFile;
    }

    if (!appended && options && options.allowHeartbeat) {
      const now = Date.now();
      if (now - state.binaryHero.lastHeartbeatAt >= BINARY_HERO_HEARTBEAT_MS) {
        appendBinaryHeroText(
          `${source.phase} ${source.progress}% ${source.transport} ${source.activity || source.title}`,
          "heartbeat"
        );
        state.binaryHero.lastHeartbeatAt = now;
      }
    }
  }

  function isBinaryHeroActive() {
    // Hero spotlight mode is disabled; keep standard chat layout active.
    return false;
  }

  function isPlanShortcutValue(value) {
    return /^\/plan(?:\s|$)/i.test(String(value || "").trim());
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
    const composerValue = String(elements.composer.value || "").trim();
    shouldStickToBottom = true;
    setHistoryDrawerOpen(false);
    setArtifactsDrawerOpen(false);
    window.clearTimeout(previewTimer);
    const clientMessageId = createClientMessageId();
    setPendingOutgoingMessage(clientMessageId, composerValue);
    renderMessages();
    vscode.postMessage({ type: "confirmPlanMode", text: composerValue, clientMessageId });
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
    if (state.historyDrawerOpen) {
      state.artifactsDrawerOpen = false;
    }
    state.settingsMenuOpen = false;
    syncShellState();
    persistDraft();
  }

  function setArtifactsDrawerOpen(open) {
    state.artifactsDrawerOpen = Boolean(open);
    if (state.artifactsDrawerOpen) {
      state.historyDrawerOpen = false;
    }
    state.settingsMenuOpen = false;
    syncShellState();
    persistDraft();
  }

  function setSettingsMenuOpen(open) {
    state.settingsMenuOpen = Boolean(open);
    if (state.settingsMenuOpen) {
      state.historyDrawerOpen = false;
      state.artifactsDrawerOpen = false;
    }
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
    const artifactsOpen = Boolean(state.artifactsDrawerOpen);
    const detailsOpen = Boolean(state.binaryDetailsOpen);
    const panelOpen = Boolean(state.binaryPanelOpen);
    const settingsOpen = Boolean(state.settingsMenuOpen);
    const binaryHeroOpen = isBinaryHeroActive();

    if (elements.workspaceShell) {
      elements.workspaceShell.setAttribute("data-history-open", String(historyOpen));
      elements.workspaceShell.setAttribute("data-artifacts-open", String(artifactsOpen));
      elements.workspaceShell.setAttribute("data-binary-details", String(detailsOpen));
      elements.workspaceShell.setAttribute("data-binary-hero", String(binaryHeroOpen));
    }
    if (elements.historyToggle) {
      elements.historyToggle.classList.toggle("active", historyOpen);
      elements.historyToggle.setAttribute("aria-expanded", String(historyOpen));
    }
    if (elements.artifactsToggle) {
      elements.artifactsToggle.classList.toggle("active", artifactsOpen);
      elements.artifactsToggle.setAttribute("aria-expanded", String(artifactsOpen));
    }
    if (elements.settingsToggle) {
      elements.settingsToggle.classList.toggle("active", settingsOpen);
      elements.settingsToggle.setAttribute("aria-expanded", String(settingsOpen));
    }
    if (elements.historyDrawer) {
      elements.historyDrawer.setAttribute("aria-hidden", String(!historyOpen));
    }
    if (elements.artifactsDrawer) {
      elements.artifactsDrawer.setAttribute("aria-hidden", String(!artifactsOpen));
    }
    setHidden(elements.historyScrim, !historyOpen);
    setHidden(elements.artifactsScrim, !artifactsOpen);
    setHidden(elements.settingsMenu, !settingsOpen);
    if (elements.binaryDetailsButton) {
      elements.binaryDetailsButton.textContent = detailsOpen ? "Less" : "More";
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
      artifactsDrawerOpen: state.artifactsDrawerOpen,
      binaryDetailsOpen: state.binaryDetailsOpen,
      binaryPanelOpen: state.binaryPanelOpen,
      settingsMenuOpen: state.settingsMenuOpen,
      localArtifacts: state.localArtifacts,
    });
  }

  function restoreDraft() {
    const saved = vscode.getState();
    if (saved && typeof saved === "object") {
      state.historyDrawerOpen = Boolean(saved.historyDrawerOpen);
      state.artifactsDrawerOpen = Boolean(saved.artifactsDrawerOpen);
      state.binaryDetailsOpen = Boolean(saved.binaryDetailsOpen);
      state.binaryPanelOpen = Boolean(saved.binaryPanelOpen);
      state.settingsMenuOpen = Boolean(saved.settingsMenuOpen);
      state.localArtifacts = Array.isArray(saved.localArtifacts) ? saved.localArtifacts : [];
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
    const dynamicThreshold = Math.max(96, Math.round((elements.messages.clientHeight || 0) * 0.18));
    return remaining < dynamicThreshold;
  }

  function scrollToLatest(behavior) {
    if (!elements.messages) return;
    preservedChatScrollTop = null;
    preserveChatScrollFrames = 0;
    suppressScrollSignalUntil = performance.now() + 180;
    elements.messages.scrollTo({ top: elements.messages.scrollHeight, behavior: behavior || "auto" });
    shouldStickToBottom = true;
    updateJumpButton();
  }

  function preserveChatScrollPosition(frames) {
    if (!elements.messages) return;
    preservedChatScrollTop = elements.messages.scrollTop;
    preserveChatScrollFrames = Math.max(preserveChatScrollFrames, Number.isFinite(frames) ? frames : 1);
    shouldStickToBottom = false;
    updateJumpButton();
  }

  function restorePreservedChatScrollPosition() {
    if (!elements.messages || !Number.isFinite(preservedChatScrollTop) || preserveChatScrollFrames <= 0) {
      preservedChatScrollTop = null;
      preserveChatScrollFrames = 0;
      return false;
    }
    const maxScrollTop = Math.max(0, elements.messages.scrollHeight - elements.messages.clientHeight);
    elements.messages.scrollTop = Math.min(preservedChatScrollTop, maxScrollTop);
    preserveChatScrollFrames -= 1;
    if (preserveChatScrollFrames <= 0) {
      preservedChatScrollTop = null;
      preserveChatScrollFrames = 0;
    }
    return true;
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
    const language = String(segment.language || "").trim();
    const shellLike = /^(bash|sh|zsh|fish|powershell|pwsh|cmd|terminal|shell)$/i.test(language) || looksLikeTerminalCommand(segment.value);
    if (shellLike) {
      return `<pre class="terminal-command"><code class="code-block">${escapeHtml(segment.value)}</code></pre>`;
    }
    const label = language ? escapeHtml(language) : "code";
    return `<pre><div class="code-header"><span>${label}</span><span>workspace</span></div><code class="code-block">${escapeHtml(segment.value)}</code></pre>`;
  }

  function looksLikeTerminalCommand(value) {
    const text = String(value || "").trim();
    if (!text) return false;
    return /^(\$|>\s)?(?:npm|pnpm|yarn|npx|git|cd|dir|ls|python|python3|node|bun|deno|pip|pip3|docker|make|cargo|go|pytest|uv|composer)\b/i.test(text);
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

  function renderBinaryStreamMarkup() {
    return [
      '<span class="binary-build-stream-label">Live Stream</span>',
      '<div class="binary-build-stream-viewport">',
      '<div class="binary-build-stream-track">',
      '<span class="binary-build-line hot">101010 001101 101010 110010 010101</span>',
      '<span class="binary-build-line">010101 110010 001101 101010 011001</span>',
      '<span class="binary-build-line">111000 101010 010101 001111 101000</span>',
      '<span class="binary-build-line accent">001101 010101 111000 101010 010011</span>',
      '<span class="binary-build-line">110010 001101 010101 111000 101101</span>',
      '<span class="binary-build-line">011001 101010 110010 001101 010101</span>',
      '<span class="binary-build-line hot">101101 011010 001111 101010 110001</span>',
      '<span class="binary-build-line">010011 111000 010101 110010 001101</span>',
      '<span class="binary-build-line hot">101010 001101 101010 110010 010101</span>',
      '<span class="binary-build-line">010101 110010 001101 101010 011001</span>',
      '<span class="binary-build-line">111000 101010 010101 001111 101000</span>',
      '<span class="binary-build-line accent">001101 010101 111000 101010 010011</span>',
      '<span class="binary-build-line">110010 001101 010101 111000 101101</span>',
      '<span class="binary-build-line">011001 101010 110010 001101 010101</span>',
      '<span class="binary-build-line hot">101101 011010 001111 101010 110001</span>',
      '<span class="binary-build-line">010011 111000 010101 110010 001101</span>',
      "</div>",
      "</div>",
    ].join("");
  }

  function renderBinaryHeroMarkup() {
    const hero = state.binaryHero || createBinaryHeroState();
    const lines = Array.isArray(hero.lines) ? hero.lines.slice(-BINARY_HERO_MAX_LINES) : [];
    const renderedLines = lines.length
      ? lines
          .map((line, index) => {
            const tone = String((line && line.tone) || "content");
            const age = lines.length - index - 1;
            const prismClass = index % 7 === 0 ? " prism" : "";
            return `<span class="binary-hero-line tone-${escapeHtml(tone)}${prismClass}" style="--hero-age:${Math.min(age, 18)}">${escapeHtml(
              String((line && line.bits) || "")
            )}</span>`;
          })
          .join("")
      : '<span class="binary-hero-line tone-heartbeat">01010011 01110100 01110010 01100101 01100001</span>';

    return [
      '<section class="chat-binary-hero" aria-label="Realtime binary hero stream">',
      '<div class="chat-binary-hero-overlay">',
      '<div class="chat-binary-hero-kicker"><span class="chat-binary-kicker-dot" aria-hidden="true"></span><span>Realtime Binary</span></div>',
      '<div class="chat-binary-hero-pills">',
      `<span class="chat-binary-pill live">${escapeHtml(hero.transport || "Live shell")}</span>`,
      `<span class="chat-binary-pill">${escapeHtml(hero.phase || "Streaming")}</span>`,
      `<span class="chat-binary-pill">${escapeHtml(String(clampProgress(hero.progress || 0)))}%</span>`,
      "</div>",
      `<h2 class="chat-binary-hero-title">${escapeHtml(hero.title || "Live assistant response")}</h2>`,
      `<p class="chat-binary-hero-activity">${escapeHtml(
        truncateText(hero.activity || "Waiting for the next live frame.", 160)
      )}</p>`,
      "</div>",
      '<div class="chat-binary-hero-stream" aria-hidden="true">',
      '<div class="chat-binary-hero-grid">',
      renderedLines,
      "</div>",
      "</div>",
      "</section>",
    ].join("");
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

  function toLocalArtifact(build) {
    if (!build || !build.id) return null;
    const artifact = build.artifact || null;
    const publish = build.publish || null;
    const reliability = build.reliability || null;
    const target = build.targetEnvironment || {};
    return {
      id: String(build.id),
      title: artifact && artifact.fileName ? artifact.fileName : `Bundle ${String(build.id)}`,
      displayName: "",
      status: String(build.status || "queued"),
      runtime: String(target.runtime || "node18"),
      platform: String(target.platform || "portable"),
      updatedAt: String(build.updatedAt || new Date().toISOString()),
      reliabilityScore: reliability && Number.isFinite(reliability.score) ? reliability.score : null,
      downloadUrl: publish && publish.downloadUrl ? String(publish.downloadUrl) : "",
      artifactSize: artifact && Number.isFinite(artifact.sizeBytes) ? artifact.sizeBytes : null,
    };
  }

  function upsertLocalArtifact(item) {
    if (!item || !item.id) return;
    const existing = Array.isArray(state.localArtifacts) ? state.localArtifacts : [];
    const current = existing.find((entry) => entry && entry.id === item.id) || null;
    const nextItem = {
      ...(current || {}),
      ...item,
      displayName:
        String(item.displayName || "").trim() ||
        String(current && current.displayName ? current.displayName : "").trim() ||
        String(current && current.title ? current.title : "").trim() ||
        String(item.title || "").trim(),
    };
    const next = [nextItem, ...existing.filter((entry) => entry && entry.id !== item.id)].slice(0, 24);
    state.localArtifacts = next;
  }

  function renameLocalArtifact(id) {
    const artifactId = String(id || "").trim();
    if (!artifactId) return;
    const items = Array.isArray(state.localArtifacts) ? state.localArtifacts : [];
    const current = items.find((entry) => entry && entry.id === artifactId);
    if (!current) return;
    const currentLabel = String(current.displayName || current.title || "").trim();
    const nextName = window.prompt("Rename artifact", currentLabel);
    if (nextName === null) return;
    const normalized = String(nextName || "").trim();
    if (!normalized) return;
    upsertLocalArtifact({
      ...current,
      displayName: normalized,
      updatedAt: new Date().toISOString(),
    });
    renderArtifacts();
    persistDraft();
  }

  function syncLocalArtifactsFromBuild() {
    const build = state.binary && state.binary.activeBuild ? state.binary.activeBuild : null;
    const local = toLocalArtifact(build);
    if (!local) return;
    upsertLocalArtifact(local);
  }

  function artifactStatusLabel(status) {
    if (status === "completed") return "Completed";
    if (status === "failed") return "Failed";
    if (status === "canceled") return "Canceled";
    if (status === "running") return "Running";
    return "Queued";
  }

  function renderArtifacts() {
    if (!elements.artifactsList) return;
    const items = Array.isArray(state.localArtifacts) ? state.localArtifacts : [];
    if (elements.artifactsCount) {
      elements.artifactsCount.textContent = String(items.length);
    }
    if (!items.length) {
      elements.artifactsList.innerHTML =
        '<div class="task-empty">No local artifacts yet. Generate a bundle and it will appear here.</div>';
      return;
    }

    elements.artifactsList.innerHTML = items
      .map((item) => {
        const status = artifactStatusLabel(String(item.status || ""));
        const updated = formatRelativeTime(item.updatedAt || "");
        const reliability = Number.isFinite(item.reliabilityScore)
          ? `${item.reliabilityScore}/100`
          : "--";
        const download = item.downloadUrl
          ? `<a class="binary-link" href="${escapeHtml(item.downloadUrl)}" target="_blank" rel="noreferrer">Download</a>`
          : "";
        return [
          '<div class="task-item">',
          '<div class="task-line">',
          '<div class="task-copy">',
          `<span class="task-name">${escapeHtml(String(item.displayName || item.title || "Portable bundle"))}</span>`,
          `<div class="task-meta">${escapeHtml(item.runtime || "node18")} · ${escapeHtml(item.platform || "portable")} · Reliability ${escapeHtml(reliability)}</div>`,
          "</div>",
          '<div class="task-aside">',
          `<span class="task-mode">${escapeHtml(status)}</span>`,
          updated ? `<span class="task-time">${escapeHtml(updated)}</span>` : "",
          "</div>",
          "</div>",
          '<div class="task-actions">',
          `<button type="button" class="binary-button artifact-rename-button" data-artifact-rename="${escapeHtml(
            item.id
          )}">Rename</button>`,
          download ? download : "",
          "</div>",
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
    const workspaceName = document.body.getAttribute("data-workspace-name") || "Workspace";
    return [
      '<div class="message-stack">',
      '<div class="empty-stage"><div class="empty-stage-inner">',
      `<span>Compose for ${escapeHtml(workspaceName)}. Chat stays primary, and bundle actions stay docked below.</span>`,
      "</div></div>",
      "</div>",
    ].join("");
  }

  function renderMessages() {
    if (!elements.messageList) return;
    const messages = getRenderableMessages();
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
          if (item && item.presentation === "thinking") {
            return '<article class="message assistant thinking" aria-live="polite"><div class="message-body">Thinking</div></article>';
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
      if (restorePreservedChatScrollPosition()) {
        updateJumpButton();
      } else if (shouldStickToBottom) {
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
        return "Binary IDE is warming up this reply.";
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
    const hasBody = Boolean(String(item.content || "").trim());
    if (!hasBody) return "";
    const live = item.live || {};
    const alertIconUri = document.body.getAttribute("data-logo-uri") || "";
    const isBuildMode = String(live.mode || "") === "build";
    const status = String(live.status || "");
    const isTerminal = ["done", "failed", "canceled"].includes(status);
    const settledAnimationClass = isTerminal && !settledLiveMessageIds.has(String(item.id || ""));
    const statusLabel =
      status === "done" ? "Finalized" : status === "failed" ? "Failed" : status === "canceled" ? "Canceled" : "Streaming";
    const statusClass =
      status === "done" ? "status-done" : status === "failed" ? "status-failed" : status === "canceled" ? "status-canceled" : "";
    const statusCopy =
      status === "done"
        ? "Stream settled and saved into the chat."
        : status === "failed"
          ? "Stream stopped before completion."
          : status === "canceled"
            ? "Stream was canceled."
            : "Stream is still live.";
    const alertTitle =
      status === "done"
        ? "Artifact created successfully"
        : status === "failed"
          ? "Artifact creation failed"
          : status === "canceled"
            ? "Artifact creation canceled"
            : "Artifact live";
    const html = [
      `<article class="message assistant live-binary${isTerminal ? " settled" : ""}${settledAnimationClass ? " settle-animate" : ""}">`,
      '<div class="message-meta">Binary IDE</div>',
      `<div class="message-body">${formatMessageBody(item.content)}</div>`,
      isBuildMode && isTerminal
        ? `<div class="live-message-alert status-${escapeHtml(status)}">${
            alertIconUri
              ? `<span class="live-message-alert-icon" aria-hidden="true"><img src="${escapeHtml(alertIconUri)}" alt="" /></span>`
              : ""
          }<span class="live-message-alert-label">${escapeHtml(alertTitle)}</span><span class="live-message-alert-copy">${escapeHtml(statusCopy)}</span></div>`
        : "",
      isTerminal
        ? `<div class="live-message-settled-meta"><span class="live-message-pill ${statusClass}">${escapeHtml(
            statusLabel
          )}</span><span class="live-message-summary-text">${escapeHtml(statusCopy)}</span></div>`
        : "",
      includeFollowups ? renderFollowUpActions() : "",
      "</article>",
    ].join("");
    if (settledAnimationClass) {
      settledLiveMessageIds.add(String(item.id || ""));
    }
    return html;
  }

  function getBinaryViewModel() {
    const binary = state.binary || {};
    const build = binary.activeBuild || null;
    const reliability = binary.reliability || (build && build.reliability) || null;
    const artifactState = binary.artifactState || (build && build.artifactState) || null;
    const sourceGraph = binary.sourceGraph || (build && build.sourceGraph) || null;
    const execution = binary.execution || (build && build.execution) || null;
    const checkpoints = Array.isArray(binary.checkpoints) && binary.checkpoints.length
      ? binary.checkpoints
      : build && Array.isArray(build.checkpoints)
        ? build.checkpoints
        : [];
    const pendingRefinement = binary.pendingRefinement || (build && build.pendingRefinement) || null;
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
      sourceGraph,
      execution,
      checkpoints,
      pendingRefinement,
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
    elements.chatBinarySpotlight.innerHTML = "";
    elements.chatBinarySpotlight.classList.add("is-hidden");
  }

  function setSelectOptions(select, options, preferredValue, emptyLabel) {
    if (!select) return "";
    const normalizedOptions = Array.isArray(options) ? options.filter(Boolean) : [];
    if (!normalizedOptions.length) {
      select.innerHTML = `<option value="">${escapeHtml(emptyLabel || "None available")}</option>`;
      select.value = "";
      select.disabled = true;
      return "";
    }

    const selectedValue = normalizedOptions.some((option) => option.value === preferredValue)
      ? preferredValue
      : normalizedOptions[0].value;
    select.innerHTML = normalizedOptions
      .map((option) => `<option value="${escapeHtml(option.value)}">${escapeHtml(option.label)}</option>`)
      .join("");
    select.disabled = false;
    select.value = selectedValue;
    return selectedValue;
  }

  function renderBinaryPanel() {
    const { binary, build, reliability, artifactState, sourceGraph, execution, checkpoints, pendingRefinement, manifest, plan, previewFiles, recentLogs, phase, progress, isPending, showVisual, runtimeLabel, summaryStatus } =
      getBinaryViewModel();
    const shouldAutoOpenPanel = !state.binaryPanelOpen && Boolean(binary.busy || binary.streamConnected || isPending);
    const hasWarnings = Boolean((reliability && Array.isArray(reliability.warnings) && reliability.warnings.length) || (manifest && Array.isArray(manifest.warnings) && manifest.warnings.length) || (build && build.errorMessage));
    const hasPreviewFiles = previewFiles.length > 0;
    const hasRecentLogs = recentLogs.length > 0;
    const hasManifest = Boolean(manifest || plan);
    const hasSourceGraph = Boolean(sourceGraph);
    const hasExecution = Boolean(execution);
    const hasCheckpoints = Array.isArray(checkpoints) && checkpoints.length > 0;
    const hasEntryPoints = Boolean(execution && Array.isArray(execution.availableFunctions) && execution.availableFunctions.length);
    const hasExtraDetails = hasWarnings || hasPreviewFiles || hasRecentLogs || hasSourceGraph || hasExecution || hasCheckpoints || hasEntryPoints;
    const canShowCompletedActions = Boolean(build && build.status === "completed");
    const warnings = [];
    const unresolvedDependencies = sourceGraph && Array.isArray(sourceGraph.dependencies)
      ? sourceGraph.dependencies.filter((dependency) => !dependency.resolved)
      : [];
    const graphDiagnostics = sourceGraph && Array.isArray(sourceGraph.diagnostics) ? sourceGraph.diagnostics : [];
    const executionFunctions = execution && Array.isArray(execution.availableFunctions) ? execution.availableFunctions : [];

    if (reliability && Array.isArray(reliability.warnings)) {
      warnings.push(...reliability.warnings);
    }
    if (manifest && Array.isArray(manifest.warnings)) {
      warnings.push(...manifest.warnings);
    }
    if (pendingRefinement && pendingRefinement.intent) {
      warnings.push(`Pending refinement: ${pendingRefinement.intent}`);
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
      const formationLabel = artifactState ? `${artifactState.coverage}% formed` : summaryStatus;
      elements.binaryPanelSummary.textContent = `${runtimeLabel} · ${formationLabel}`;
    }
    if (elements.binaryPanelMeta) {
      elements.binaryPanelMeta.textContent = build
        ? artifactState
          ? `${artifactState.runnable ? "Runnable" : "Not runnable"} · ${artifactState.outputFilesReady} outputs ready`
          : `Build ${build.id.slice(0, 8)} · ${binaryPhaseLabel(phase)}`
        : "Runtime, reliability, publish, and download controls.";
    }

    if (elements.binaryPanelSummary && sourceGraph && !artifactState) {
      elements.binaryPanelSummary.textContent = `${runtimeLabel} · ${sourceGraph.coverage}% graph coverage`;
    }
    if (elements.binaryPanelMeta && build && execution) {
      elements.binaryPanelMeta.textContent = `${execution.mode === "native" ? "Runnable" : execution.mode === "stub" ? "Stub runtime" : "Not runnable"} · ${executionFunctions.length} callable functions`;
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
    if (elements.binaryBuildTitle) {
      elements.binaryBuildTitle.textContent = build
        ? `${binaryPhaseLabel(phase)} Binary IDE workspace`
        : "Encoding Binary IDE workspace";
    }
    if (elements.binaryBuildCaption && execution) {
      elements.binaryBuildCaption.textContent = `${binaryPhaseCaption(phase)} ${executionFunctions.length} callable functions exposed, runtime mode is ${execution.mode}, and ${pendingRefinement ? "a refinement is queued." : "no refinement is queued."}`;
    } else if (elements.binaryBuildCaption && sourceGraph && !artifactState) {
      elements.binaryBuildCaption.textContent = `${binaryPhaseCaption(phase)} ${sourceGraph.readyModules}/${sourceGraph.totalModules} modules parsed with ${graphDiagnostics.length} diagnostics.`;
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
          : "No Binary IDE warnings yet.";
      } else {
        elements.binaryWarnings.textContent = warnings.join("\n");
      }
    }
    if (elements.binaryGraphSummary) {
      elements.binaryGraphSummary.textContent = sourceGraph
        ? [
            `Coverage: ${sourceGraph.coverage}%`,
            `Modules: ${sourceGraph.readyModules}/${sourceGraph.totalModules}`,
            `Diagnostics: ${graphDiagnostics.length}`,
            `Unresolved dependencies: ${unresolvedDependencies.length}`,
            "",
            ...(sourceGraph.modules || []).slice(0, 8).map((module) => {
              const exported = Array.isArray(module.exports) && module.exports.length ? module.exports.join(", ") : "(none)";
              return `${module.path}${module.diagnosticCount ? ` [${module.diagnosticCount} issues]` : ""}\nexports: ${exported}`;
            }),
          ].join("\n")
        : "The live source graph will appear here.";
    }
    if (elements.binaryExecutionSummary) {
      elements.binaryExecutionSummary.textContent = execution
        ? [
            `Mode: ${execution.mode}`,
            `Runnable: ${execution.runnable ? "yes" : "no"}`,
            `Callable functions: ${executionFunctions.length}`,
            pendingRefinement ? `Pending refinement: ${pendingRefinement.intent}` : null,
            execution.lastRun
              ? `Last run: ${execution.lastRun.entryPoint} -> ${execution.lastRun.status.toUpperCase()}`
              : "Last run: none yet",
            "",
            ...(executionFunctions || []).slice(0, 10).map((fn) => `${fn.name} (${fn.mode})${fn.signature ? ` ${fn.signature}` : ""}`),
            execution.lastRun?.logs?.length ? "" : null,
            ...(execution.lastRun?.logs || []).slice(-8),
          ].filter(Boolean).join("\n")
        : "Callable exports and partial execution results will appear here.";
    }

    const selectedCheckpointId = setSelectOptions(
      elements.binaryCheckpointSelect,
      checkpoints.map((checkpoint) => ({
        value: checkpoint.id,
        label: checkpoint.label
          ? `${checkpoint.label} (${checkpoint.phase})`
          : `${checkpoint.id.slice(0, 8)} · ${checkpoint.phase}`,
      })),
      build && build.checkpointId ? build.checkpointId : "",
      "No checkpoints yet"
    );
    if (elements.binaryCheckpointSummary) {
      const activeCheckpoint = checkpoints.find((checkpoint) => checkpoint.id === selectedCheckpointId) || checkpoints[0];
      elements.binaryCheckpointSummary.textContent = activeCheckpoint
        ? [
            `Current checkpoint: ${activeCheckpoint.id}`,
            `Phase: ${activeCheckpoint.phase}`,
            activeCheckpoint.label ? `Label: ${activeCheckpoint.label}` : null,
            `Saved at: ${activeCheckpoint.savedAt}`,
            build && build.parentBuildId ? `Parent build: ${build.parentBuildId}` : null,
          ].filter(Boolean).join("\n")
        : "Checkpoints will appear here as the build evolves.";
    }

    const selectedEntryPoint = setSelectOptions(
      elements.binaryEntryPointSelect,
      executionFunctions
        .filter((fn) => fn.callable)
        .map((fn) => ({
          value: fn.name,
          label: `${fn.name} (${fn.mode})`,
        })),
      execution && execution.lastRun ? execution.lastRun.entryPoint : "",
      "No callable exports"
    );
    if (elements.binaryEntryPointSummary) {
      const activeFunction = executionFunctions.find((fn) => fn.name === selectedEntryPoint) || executionFunctions[0];
      elements.binaryEntryPointSummary.textContent = activeFunction
        ? [
            `Entrypoint: ${activeFunction.name}`,
            `Source: ${activeFunction.sourcePath}`,
            `Mode: ${activeFunction.mode}`,
            activeFunction.signature ? `Signature: ${activeFunction.signature}` : null,
            execution && execution.lastRun && execution.lastRun.entryPoint === activeFunction.name
              ? `Last run status: ${execution.lastRun.status.toUpperCase()}`
              : null,
          ].filter(Boolean).join("\n")
        : "Available entry points will appear here once the partial runtime is ready.";
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
      setHidden(elements.cancelBinaryButton, !binary.canCancel && !(build && build.status === "canceled"));
    }
    if (elements.refineBinaryButton) {
      elements.refineBinaryButton.disabled = !Boolean(build && isPending);
      elements.refineBinaryButton.textContent = pendingRefinement ? "Refining" : "Refine";
      setHidden(elements.refineBinaryButton, !(build && isPending));
    }
    if (elements.branchBinaryButton) {
      elements.branchBinaryButton.disabled = !Boolean(build && hasCheckpoints);
      setHidden(elements.branchBinaryButton, !build);
    }
    if (elements.rewindBinaryButton) {
      elements.rewindBinaryButton.disabled = !Boolean(build && hasCheckpoints && !isPending);
      setHidden(elements.rewindBinaryButton, !Boolean(build && hasCheckpoints));
    }
    if (elements.executeBinaryButton) {
      elements.executeBinaryButton.disabled = !Boolean(build && selectedEntryPoint);
      setHidden(elements.executeBinaryButton, !Boolean(build && hasEntryPoints));
    }
    if (elements.validateBinaryButton) {
      elements.validateBinaryButton.disabled = Boolean(binary.busy || !build || build.status !== "completed");
      setHidden(elements.validateBinaryButton, !canShowCompletedActions);
    }
    if (elements.deployBinaryButton) {
      elements.deployBinaryButton.disabled = Boolean(binary.busy || !build || build.status !== "completed");
      setHidden(elements.deployBinaryButton, !canShowCompletedActions);
    }

    if (elements.binaryDetailsButton) {
      elements.binaryDetailsButton.disabled = Boolean(binary.busy && !build);
      setHidden(elements.binaryDetailsButton, !hasManifest && !hasExtraDetails);
    }

    if (elements.binaryDownloadLink) {
      const href = build && build.publish && build.publish.downloadUrl ? build.publish.downloadUrl : "";
      elements.binaryDownloadLink.href = href || "#";
      elements.binaryDownloadLink.classList.toggle("is-hidden", !href);
    }

    setHidden(elements.binaryManifestCard, !hasManifest);
    setHidden(elements.binaryGraphCard, !hasSourceGraph);
    setHidden(elements.binaryExecutionCard, !hasExecution);
    setHidden(elements.binaryCheckpointCard, !hasCheckpoints);
    setHidden(elements.binaryEntryPointCard, !hasEntryPoints);
    setHidden(elements.binaryWarningsCard, !hasWarnings);
    setHidden(elements.binaryPreviewFilesCard, !hasPreviewFiles);
    setHidden(elements.binaryLogPreviewCard, !hasRecentLogs);

    if (shouldAutoOpenPanel) {
      setBinaryPanelOpen(true);
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
        const tabIndex = index === selectedMentionIndex ? "0" : "-1";
        const selected = index === selectedMentionIndex ? "true" : "false";
        return `<div class="mention-item"><button type="button" class="${active.trim()}" data-mention-index="${index}" data-mention-value="${escapeHtml(item)}" title="${escapeHtml(item)}" tabindex="${tabIndex}" aria-selected="${selected}">${escapeHtml(label)}</button></div>`;
      })
      .join("");
  }

  function render() {
    updateBinaryHeroState();
    syncLocalArtifactsFromBuild();
    syncShellState();
    syncComposerFromState(state);
    if (elements.authChip) {
      elements.authChip.textContent = authButtonShortLabel();
      if (elements.authStatusButton) {
        elements.authStatusButton.title = authButtonLabel();
      }
    }
    if (elements.authStatusButton) {
      const ready = Boolean(state.auth && state.auth.kind !== "none");
      elements.authStatusButton.classList.toggle("is-ready", ready);
    }
    if (elements.authStatusDot) {
      elements.authStatusDot.title = state.auth && state.auth.kind !== "none" ? "Xpersona API key ready" : "Xpersona API key not set";
    }
    if (elements.currentChatTitle) {
      const currentTitle = deriveCurrentChatTitle();
      elements.currentChatTitle.textContent = currentTitle;
      elements.currentChatTitle.title = currentTitle;
    }
    if (elements.send) {
      const cancelable = canCancelLivePrompt();
      const lockedBusy = Boolean(state.busy && !cancelable);
      elements.send.disabled = lockedBusy;
      elements.send.innerHTML = cancelable ? CANCEL_ICON : SEND_ICON;
      elements.send.setAttribute("aria-label", cancelable ? "Cancel response" : "Send");
      elements.send.title = cancelable ? "Cancel response" : "Send";
    }
    const undoDisabled = !state.canUndo || state.runtime === "qwenCode";
    if (elements.undoChanges) {
      elements.undoChanges.disabled = undoDisabled;
    }
    if (elements.settingsUndo) {
      elements.settingsUndo.disabled = undoDisabled;
    }
    setHidden(elements.settingsSignIn, state.runtime === "qwenCode");
    setHidden(elements.settingsSignOut, state.auth && state.auth.kind === "none");
    if (elements.settingsRuntimeQwen) {
      const isQwen = state.runtime === "qwenCode";
      elements.settingsRuntimeQwen.classList.toggle("active", isQwen);
      elements.settingsRuntimeQwen.disabled = isQwen;
    }
    if (elements.settingsRuntimeHosted) {
      const isHosted = state.runtime === "playgroundApi";
      elements.settingsRuntimeHosted.classList.toggle("active", isHosted);
      elements.settingsRuntimeHosted.disabled = isHosted;
    }
    if (elements.composer) {
      elements.composer.placeholder = "Ask Binary IDE anything.. @ for files, / for commands.";
    }
    renderHistory();
    renderArtifacts();
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
    if (canCancelLivePrompt()) {
      vscode.postMessage({ type: "cancelPrompt" });
      return;
    }
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
    const clientMessageId = createClientMessageId();
    setPendingThinkingCue(clientMessageId, Array.isArray(state.messages) ? state.messages.length : 0);
    setPendingOutgoingMessage(clientMessageId, value);
    renderMessages();
    vscode.postMessage({ type: "sendPrompt", text: value, clientMessageId });
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
      case "openArtifacts":
        setArtifactsDrawerOpen(!state.artifactsDrawerOpen);
        return;
      case "toggleSettings":
        setSettingsMenuOpen(!state.settingsMenuOpen);
        return;
      case "closeHistory":
        setHistoryDrawerOpen(false);
        focusComposer(false);
        return;
      case "closeArtifacts":
        setArtifactsDrawerOpen(false);
        focusComposer(false);
        return;
      case "newChat":
        shouldStickToBottom = true;
        clearPendingOutgoingMessage();
        clearPendingThinkingCue();
        setHistoryDrawerOpen(false);
        setArtifactsDrawerOpen(false);
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
      case "runtimeQwen":
        setSettingsMenuOpen(false);
        vscode.postMessage({ type: "setRuntimeBackend", runtime: "qwenCode" });
        return;
      case "runtimeHosted":
        setSettingsMenuOpen(false);
        vscode.postMessage({ type: "setRuntimeBackend", runtime: "playgroundApi" });
        return;
      case "configureBinary":
      case "copyDebugReport":
      case "setApiKey":
      case "signIn":
      case "signOut":
      case "loadHistory":
      case "undoLastChanges":
      case "attachActiveFile":
      case "attachSelection":
      case "clearAttachedContext":
        setSettingsMenuOpen(false);
        vscode.postMessage({ type: action });
        return;
      case "generateBinary":
        setHistoryDrawerOpen(false);
        setArtifactsDrawerOpen(false);
        setSettingsMenuOpen(false);
        vscode.postMessage({
          type: "generateBinary",
          text: elements.composer ? elements.composer.value : "",
        });
        return;
      case "refineBinary":
        setHistoryDrawerOpen(false);
        setArtifactsDrawerOpen(false);
        setSettingsMenuOpen(false);
        vscode.postMessage({
          type: "refineBinary",
          text: elements.composer ? elements.composer.value : "",
        });
        return;
      case "branchBinary":
        setHistoryDrawerOpen(false);
        setArtifactsDrawerOpen(false);
        setSettingsMenuOpen(false);
        vscode.postMessage({
          type: "branchBinary",
          text: elements.composer ? elements.composer.value : "",
          checkpointId: elements.binaryCheckpointSelect ? elements.binaryCheckpointSelect.value : "",
        });
        return;
      case "rewindBinary":
        setHistoryDrawerOpen(false);
        setArtifactsDrawerOpen(false);
        setSettingsMenuOpen(false);
        vscode.postMessage({
          type: "rewindBinary",
          checkpointId: elements.binaryCheckpointSelect ? elements.binaryCheckpointSelect.value : "",
        });
        return;
      case "executeBinary":
        setHistoryDrawerOpen(false);
        setArtifactsDrawerOpen(false);
        setSettingsMenuOpen(false);
        vscode.postMessage({
          type: "executeBinary",
          entryPoint: elements.binaryEntryPointSelect ? elements.binaryEntryPointSelect.value : "",
        });
        return;
      case "validateBinary":
      case "deployBinary":
      case "cancelBinary":
        setHistoryDrawerOpen(false);
        setArtifactsDrawerOpen(false);
        setSettingsMenuOpen(false);
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

  function resolveActiveMentionRange() {
    if (!elements.composer) return null;
    if (
      activeMentionRange &&
      Number.isFinite(activeMentionRange.start) &&
      Number.isFinite(activeMentionRange.end) &&
      activeMentionRange.start >= 0 &&
      activeMentionRange.end >= activeMentionRange.start
    ) {
      return activeMentionRange;
    }
    const value = elements.composer.value || "";
    const fallbackCursor =
      typeof elements.composer.selectionStart === "number" ? elements.composer.selectionStart : value.length;
    const cursor = Math.max(0, Math.min(fallbackCursor, value.length));
    const prefix = value.slice(0, cursor);
    const match = /(^|\s)@([A-Za-z0-9_./-]*)$/.exec(prefix);
    if (!match) return null;
    const nextRange = { start: cursor - match[2].length - 1, end: cursor };
    activeMentionRange = nextRange;
    return nextRange;
  }

  function applyMention(pathValue) {
    const mentionRange = resolveActiveMentionRange();
    if (!elements.composer || !mentionRange) return;
    const value = elements.composer.value || "";
    const label = mentionLabel(pathValue);
    elements.composer.value =
      value.slice(0, mentionRange.start) + "@" + label + " " + value.slice(mentionRange.end);
    const nextCursor = mentionRange.start + label.length + 2;
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

    const artifactRenameButton = target.closest("[data-artifact-rename]");
    if (artifactRenameButton) {
      renameLocalArtifact(artifactRenameButton.getAttribute("data-artifact-rename") || "");
      return;
    }

    const actionButton = target.closest("[data-action]");
    if (actionButton) {
      dispatchAction(actionButton.getAttribute("data-action") || "");
      return;
    }

    if (
      state.settingsMenuOpen &&
      !target.closest("#settingsMenu") &&
      !target.closest("#settingsToggle")
    ) {
      setSettingsMenuOpen(false);
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
      if (performance.now() < suppressScrollSignalUntil) {
        shouldStickToBottom = true;
        updateJumpButton();
        return;
      }
      shouldStickToBottom = isNearBottom();
      updateJumpButton();
    });
  }

  if (elements.composer) {
    elements.composer.addEventListener("keydown", (event) => {
      if (mentionItems.length && isArrowDownKey(event)) {
        event.preventDefault();
        mentionKeyboardActive = true;
        moveMentionSelection(1, { focus: false });
        return;
      }
      if (mentionItems.length && isArrowUpKey(event)) {
        event.preventDefault();
        mentionKeyboardActive = true;
        moveMentionSelection(-1, { focus: false });
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
    elements.mentions.addEventListener("mousedown", (event) => {
      const target = event.target;
      if (!(target instanceof Element)) return;
      if (!target.closest("[data-mention-value]")) return;
      // Keep focus on the textarea so mention range/cursor are preserved for click-to-insert.
      event.preventDefault();
    });

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
      const messages = Array.isArray(state.messages) ? state.messages : [];
      if (pendingOutgoingMessage && messages.some((messageItem) => messageItem && messageItem.id === pendingOutgoingMessage.id)) {
        clearPendingOutgoingMessage(pendingOutgoingMessage.id);
      } else if (pendingOutgoingMessage && !state.busy && !messages.some((messageItem) => messageItem && messageItem.role === "user")) {
        clearPendingOutgoingMessage();
      }
      // Defensive: ensure busy is cleared when chat has ended or failed
      const live = state.liveChat;
      const terminal =
        (live && ["failed", "canceled", "done"].includes(String(live.status || ""))) ||
        state.runtimePhase === "failed" ||
        state.runtimePhase === "done" ||
        state.runtimePhase === "canceled";
      if (pendingThinkingCue && (hasFreshAssistantResponse(messages) || terminal)) {
        clearPendingThinkingCue();
      }
      if (terminal) {
        state.busy = false;
      }
      render();
      return;
    }
    if (message.type === "prefill" && elements.composer) {
      clearPendingOutgoingMessage();
      clearPendingThinkingCue();
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
  binaryHeroTimer = window.setInterval(() => {
    if (!isBinaryHeroActive()) return;
    updateBinaryHeroState({ allowHeartbeat: true });
    syncShellState();
    renderChatBinarySpotlight();
  }, 360);
  window.setTimeout(() => {
    focusComposer(true);
  }, 30);
  vscode.postMessage({ type: "ready" });
})();

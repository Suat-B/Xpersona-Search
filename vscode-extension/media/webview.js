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
    activePanel: "chat",
  };

  const elements = {
    workspaceShell: document.getElementById("workspaceShell"),
    taskPanel: document.getElementById("taskPanel"),
    chatStage: document.getElementById("chatStage"),
    history: document.getElementById("history"),
    historyCount: document.getElementById("historyCount"),
    historyFooter: document.getElementById("historyFooter"),
    historyFooterButton: document.getElementById("historyFooterButton"),
    messages: document.getElementById("messages"),
    composer: document.getElementById("composer"),
    send: document.getElementById("send"),
    mentions: document.getElementById("mentions"),
    activityWrap: document.getElementById("activityWrap"),
    activity: document.getElementById("activity"),
    jumpToLatest: document.getElementById("jumpToLatest"),
    busyLabel: document.getElementById("busyLabel"),
    runtimeLabel: document.getElementById("runtimeLabel"),
    statusLabel: document.getElementById("statusLabel"),
    runtimeChip: document.getElementById("runtimeChip"),
    modeChip: document.getElementById("modeChip"),
    authChip: document.getElementById("authChip"),
    signIn: document.getElementById("signIn"),
    signOut: document.getElementById("signOut"),
    signOutButtons: Array.from(document.querySelectorAll('[data-action="signOut"]')),
    undoChanges: document.getElementById("undoChanges"),
    modeButtons: Array.from(document.querySelectorAll("[data-mode]")),
    actionButtons: Array.from(document.querySelectorAll("[data-action]")),
    viewButtons: Array.from(document.querySelectorAll("[data-view-target]")),
  };

  let mentionRequestId = 0;
  let activeMentionRange = null;
  let mentionItems = [];
  let selectedMentionIndex = 0;
  let hasAutoFocused = false;
  let shouldStickToBottom = true;

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

    const date = new Date(timestamp);
    return date.toLocaleDateString(undefined, {
      month: "short",
      day: "numeric",
    });
  }

  function roleLabel(role) {
    if (role === "user") return "You";
    if (role === "system") return "System";
    return "Playground";
  }

  function runtimeName() {
    return state.runtime === "qwenCode" ? "Qwen Code" : "Playground API";
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
        : "Add a Playground API key";
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

  function setHidden(element, hidden) {
    if (!element) return;
    element.classList.toggle("is-hidden", hidden);
  }

  function normalizePanel(value) {
    return value === "tasks" ? "tasks" : "chat";
  }

  function setActivePanel(panel) {
    state.activePanel = normalizePanel(panel);
    syncActivePanel();
  }

  function syncActivePanel() {
    const panel = normalizePanel(state.activePanel);
    if (elements.workspaceShell) {
      elements.workspaceShell.setAttribute("data-compact-view", panel);
    }

    elements.viewButtons.forEach((button) => {
      const target = normalizePanel(button.getAttribute("data-view-target") || "");
      const active = target === panel;
      button.classList.toggle("active", active);
      button.setAttribute("aria-pressed", String(active));
    });
  }

  function persistDraft() {
    vscode.setState({
      draft: elements.composer ? elements.composer.value : "",
    });
  }

  function restoreDraft() {
    const saved = vscode.getState();
    if (!saved || typeof saved !== "object" || !elements.composer) return;
    if (typeof saved.draft === "string") {
      elements.composer.value = saved.draft;
    }
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
    const minHeight = Number.parseFloat(computed.minHeight) || 116;
    const maxHeight = Number.parseFloat(computed.maxHeight) || 280;
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
    elements.messages.scrollTo({
      top: elements.messages.scrollHeight,
      behavior: behavior || "auto",
    });
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
        segments.push({
          type: "text",
          value: text.slice(lastIndex, match.index),
        });
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
      segments.push({
        type: "text",
        value: text.slice(lastIndex),
      });
    }

    return segments.length
      ? segments
      : [
          {
            type: "text",
            value: text,
          },
        ];
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
    return [
      "<pre>",
      `<div class="code-header"><span>${language}</span><span>workspace</span></div>`,
      `<code class="code-block">${escapeHtml(segment.value)}</code>`,
      "</pre>",
    ].join("");
  }

  function formatMessageBody(value) {
    return splitSegments(value)
      .map((segment) => {
        if (segment.type === "code") {
          return renderCodeSegment(segment);
        }
        return renderTextSegment(segment.value);
      })
      .join("");
  }

  function renderHistory() {
    if (!elements.history) return;

    const items = Array.isArray(state.history) ? state.history : [];
    const visibleItems = items;

    if (elements.historyCount) {
      elements.historyCount.textContent = String(items.length);
    }

    if (elements.historyFooter && elements.historyFooterButton) {
      elements.historyFooter.classList.add("is-hidden");
      elements.historyFooterButton.textContent = `View all (${items.length})`;
    }

    if (!visibleItems.length) {
      elements.history.innerHTML =
        '<div class="task-empty">No saved chats yet. The panel now opens directly into chat, so your first message becomes the first task.</div>';
      return;
    }

    elements.history.innerHTML = visibleItems
      .map((item) => {
        const isActive = item.id === state.selectedSessionId ? " active" : "";
        const updated = formatRelativeTime(item.updatedAt || item.updated_at);
        const mode = item.mode === "plan" ? "Plan" : "Chat";

        return [
          `<div class="task-item${isActive}">`,
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

    elements.history.querySelectorAll("[data-history-id]").forEach((button) => {
      button.addEventListener("click", () => {
        shouldStickToBottom = true;
        setActivePanel("chat");
        vscode.postMessage({
          type: "openSession",
          id: button.getAttribute("data-history-id") || "",
        });
      });
    });
  }

  function renderEmptyStage() {
    const logoUri = document.body.getAttribute("data-logo-uri") || "";
    const workspaceName = document.body.getAttribute("data-workspace-name") || "Workspace";

    return [
      '<div class="message-stack">',
      '<div class="empty-stage">',
      '<div class="empty-stage-inner">',
      '<div class="empty-stage-logo">',
      logoUri ? `<img src="${escapeHtml(logoUri)}" alt="Playground" />` : "",
      "</div>",
      '<h2 class="empty-stage-title">Chat is ready.</h2>',
      `<p class="empty-stage-copy">Start typing below and Playground opens straight into the conversation for ${escapeHtml(workspaceName)}. Use <code>@</code> to pull files in without leaving the composer.</p>`,
      "</div>",
      "</div>",
      "</div>",
    ].join("");
  }

  function renderMessages() {
    if (!elements.messages) return;

    if (!Array.isArray(state.messages) || !state.messages.length) {
      elements.messages.innerHTML = renderEmptyStage();
      window.requestAnimationFrame(updateJumpButton);
      return;
    }

    elements.messages.innerHTML = [
      '<div class="message-stack">',
      state.messages
        .map((item) => {
          const role = item.role || "assistant";
          return [
            `<article class="message ${escapeHtml(role)}">`,
            `<div class="message-meta">${escapeHtml(roleLabel(role))}</div>`,
            `<div class="message-body">${formatMessageBody(item.content)}</div>`,
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
    if (!elements.activityWrap || !elements.activity) return;

    if (!Array.isArray(state.activity) || !state.activity.length) {
      elements.activityWrap.classList.remove("show");
      elements.activity.innerHTML = "";
      return;
    }

    elements.activityWrap.classList.add("show");
    elements.activity.innerHTML = state.activity
      .slice(-6)
      .map((item) => `<span class="activity-chip">${escapeHtml(item)}</span>`)
      .join("");
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
        return [
          '<div class="mention-item">',
          `<button type="button" class="${active.trim()}" data-mention-index="${index}" data-mention-value="${escapeHtml(item)}">`,
          escapeHtml(item),
          "</button>",
          "</div>",
        ].join("");
      })
      .join("");

    elements.mentions.querySelectorAll("[data-mention-index]").forEach((button) => {
      button.addEventListener("mouseenter", () => {
        selectedMentionIndex = Number(button.getAttribute("data-mention-index") || 0);
        renderMentions();
      });
      button.addEventListener("click", () => {
        applyMention(button.getAttribute("data-mention-value") || "");
      });
    });

    const activeItem = elements.mentions.querySelector(".active");
    if (activeItem && typeof activeItem.scrollIntoView === "function") {
      activeItem.scrollIntoView({ block: "nearest" });
    }
  }

  function render() {
    syncActivePanel();

    if (elements.busyLabel) {
      elements.busyLabel.textContent = state.busy ? "Busy" : "Ready";
    }
    if (elements.runtimeLabel) {
      elements.runtimeLabel.textContent = runtimeName();
    }
    if (elements.statusLabel) {
      elements.statusLabel.textContent = statusChipLabel();
      elements.statusLabel.title = statusSummary();
    }
    if (elements.runtimeChip) {
      elements.runtimeChip.textContent = runtimeChipLabel();
      elements.runtimeChip.title = runtimeName();
    }
    if (elements.modeChip) {
      elements.modeChip.textContent = modeChipLabel();
      elements.modeChip.title = modeName();
    }
    if (elements.authChip) {
      elements.authChip.textContent = authButtonShortLabel();
      elements.authChip.title = authButtonLabel();
    }
    if (elements.busyLabel) {
      elements.busyLabel.title = state.busy ? "Working..." : "Ready";
    }
    if (elements.send) {
      elements.send.disabled = state.busy;
    }
    if (elements.undoChanges) {
      elements.undoChanges.disabled = !state.canUndo || state.runtime === "qwenCode";
    }

    setHidden(elements.signIn, state.runtime === "qwenCode");
    setHidden(elements.signOut, state.auth && state.auth.kind === "none");
    elements.signOutButtons.forEach((button) => {
      setHidden(button, state.auth && state.auth.kind === "none");
    });

    if (elements.composer) {
      elements.composer.placeholder =
        state.runtime === "qwenCode"
          ? "Ask Playground anything. @ to add files, / for commands"
          : "Ask Playground to inspect code, patch files, or explain a bug";
      elements.composer.title = "Chat composer";
    }

    elements.modeButtons.forEach((button) => {
      const mode = button.getAttribute("data-mode");
      button.classList.toggle("active", mode === state.mode);
      button.disabled = state.busy;
    });

    renderHistory();
    renderActivity();
    renderMessages();
    renderMentions();
    syncComposerHeight();

    if (!hasAutoFocused && !state.busy) {
      focusComposer(true);
    }
  }

  function sendPrompt() {
    const value = String(elements.composer ? elements.composer.value : "").trim();
    if (!value || state.busy) return;

    shouldStickToBottom = true;
    setActivePanel("chat");
    vscode.postMessage({ type: "sendPrompt", text: value });

    if (elements.composer) {
      elements.composer.value = "";
      syncComposerHeight();
      persistDraft();
    }

    hideMentions();
  }

  function dispatchAction(action) {
    if (!action) return;

    switch (action) {
      case "showChat":
        setActivePanel("chat");
        focusComposer(true);
        return;
      case "showTasks":
        setActivePanel("tasks");
        if (elements.history) {
          elements.history.scrollTo({ top: 0, behavior: "smooth" });
        }
        vscode.postMessage({ type: "loadHistory" });
        return;
      case "newChat":
        shouldStickToBottom = true;
        setActivePanel("chat");
        vscode.postMessage({ type: "newChat" });
        window.setTimeout(() => focusComposer(true), 0);
        return;
      case "setApiKey":
        vscode.postMessage({ type: "setApiKey" });
        return;
      case "signIn":
        vscode.postMessage({ type: "signIn" });
        return;
      case "signOut":
        vscode.postMessage({ type: "signOut" });
        return;
      case "loadHistory":
        vscode.postMessage({ type: "loadHistory" });
        return;
      case "undoLastChanges":
        vscode.postMessage({ type: "undoLastChanges" });
        return;
      case "focusComposer":
        setActivePanel("chat");
        focusComposer(true);
        return;
      default:
        return;
    }
  }

  function hideMentions() {
    activeMentionRange = null;
    mentionItems = [];
    selectedMentionIndex = 0;
    renderMentions();
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

    activeMentionRange = {
      start: cursor - match[2].length - 1,
      end: cursor,
    };
    mentionRequestId += 1;
    vscode.postMessage({
      type: "mentionsQuery",
      query: match[2] || "",
      requestId: mentionRequestId,
    });
  }

  function applyMention(pathValue) {
    if (!elements.composer || !activeMentionRange) return;

    const value = elements.composer.value || "";
    elements.composer.value =
      value.slice(0, activeMentionRange.start) +
      "@" +
      pathValue +
      " " +
      value.slice(activeMentionRange.end);

    const nextCursor = activeMentionRange.start + pathValue.length + 2;
    elements.composer.setSelectionRange(nextCursor, nextCursor);
    syncComposerHeight();
    persistDraft();
    focusComposer(true);
    hideMentions();
  }

  function moveMentionSelection(delta) {
    if (!mentionItems.length) return false;

    selectedMentionIndex =
      (selectedMentionIndex + delta + mentionItems.length) % mentionItems.length;
    renderMentions();
    return true;
  }

  elements.actionButtons.forEach((button) => {
    button.addEventListener("click", () => {
      dispatchAction(button.getAttribute("data-action") || "");
    });
  });

  elements.send.addEventListener("click", sendPrompt);

  if (elements.jumpToLatest) {
    elements.jumpToLatest.addEventListener("click", () => {
      scrollToLatest("smooth");
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
      if (event.key === "Enter" && !event.shiftKey) {
        event.preventDefault();
        sendPrompt();
      }
    });

    elements.composer.addEventListener("input", () => {
      syncComposerHeight();
      persistDraft();
      updateMentionQuery();
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
      Object.assign(state, message.state || {});
      render();
      return;
    }

    if (message.type === "prefill" && elements.composer) {
      setActivePanel("chat");
      elements.composer.value = message.text || "";
      syncComposerHeight();
      persistDraft();
      focusComposer(true);
      updateMentionQuery();
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
  window.setTimeout(() => focusComposer(true), 30);
  vscode.postMessage({ type: "ready" });
})();

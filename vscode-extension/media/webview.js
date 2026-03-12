// Acquire the VS Code webview API safely. If this throws (rare, but possible during webview init),
      // we still bind Enter/click handlers so the composer does not "silently" degrade into a plain textarea.
      let v;
      try {
        v = acquireVsCodeApi();
      } catch {
        v = { postMessage: () => {} };
      }

      // If the script is executing, hide the JS gate immediately and mark boot in the footer.
      try {
        const gate = document.getElementById("jsGate");
        if (gate) gate.style.display = "none";
        const boot = document.getElementById("runState");
        if (boot) boot.textContent = "UI ready";
      } catch {
        // ignore
      }

      // Emergency send binding that runs before any other init. If later code throws, sending still works.
      // Once the full composer is ready, it disables itself to avoid double-sends.
      if (!window.__playgroundEarlySendBound) {
        window.__playgroundEarlySendBound = true;
        window.__playgroundComposerReady = false;

        const earlyPostSend = () => {
          if (window.__playgroundComposerReady) return;
          const t = document.getElementById("t");
          if (!t) return;
          const parsed = parseSlashModeCommand(t.value || "");
          if (parsed.preventSend) {
            t.value = "";
            if (SHOW_SYSTEM_ACTIVITY) addMessage("Plan mode enabled. Add your request after /plan.", "cmd");
            return;
          }
          const text = parsed.text;
          if (!text) return;
          t.value = "";
          const earlyCtxToggle = document.getElementById("ctxToggle");
          const includeIdeContext = true;
          try {
            v.postMessage({
              type: "send",
              text,
              parallel: false,
              model: DEFAULT_MODEL,
              reasoning: "medium",
              includeIdeContext,
              workspaceContextLevel: "max",
              attachments: [],
              threadId: currentThreadId,
            });
          } catch {
            // no-op
          }
        };

        document.addEventListener(
          "keydown",
          (e) => {
            if (window.__playgroundComposerReady) return;
            const target = e.target;
            if (!target || target.id !== "t") return;
            const isEnter =
              e.key === "Enter" ||
              e.code === "Enter" ||
              e.code === "NumpadEnter" ||
              e.keyCode === 13 ||
              e.which === 13;
            if (!isEnter) return;
            if (e.shiftKey || e.altKey || e.ctrlKey || e.metaKey) return;
            e.preventDefault();
            e.stopPropagation();
            if (typeof e.stopImmediatePropagation === "function") e.stopImmediatePropagation();
            earlyPostSend();
          },
          true
        );

        document.addEventListener(
          "click",
          (e) => {
            if (window.__playgroundComposerReady) return;
            const rawTarget = e.target;
            const el = rawTarget && rawTarget.nodeType === 1 ? rawTarget : rawTarget?.parentElement;
            if (!el || !el.closest || !el.closest("#s")) return;
            e.preventDefault();
            e.stopPropagation();
            if (typeof e.stopImmediatePropagation === "function") e.stopImmediatePropagation();
            earlyPostSend();
          },
          true
        );
      }
      const setup = document.getElementById("setup");
      const app = document.getElementById("app");
      const msgs = document.getElementById("msgs");
      const chatPanel = document.getElementById("chat");
      const stageBlank = document.getElementById("stageBlank");
      const chatDock = document.getElementById("chatDock");
      const chips = document.getElementById("chips");
      const timeline = document.getElementById("timeline");
      const history = document.getElementById("history");
      const index = document.getElementById("index");
      const agents = document.getElementById("agents");
      const exec = document.getElementById("exec");
      const taskList = document.getElementById("taskList");
      const chatEmptyHistoryList = document.getElementById("chatEmptyHistoryList");
      const viewAllTasks = document.getElementById("viewAllTasks");
      const threadList = document.getElementById("threadList");
      const modeQuick = document.getElementById("modeQuick");
      const safetyQuick = document.getElementById("safetyQuick");
      const parallelQuick = document.getElementById("parallelQuick");
      const uploadBtn = document.getElementById("uploadBtn");
      const uploadInput = document.getElementById("uploadInput");
      const uploadCount = document.getElementById("uploadCount");
      const attachHint = document.getElementById("attachHint");
      const ctxToggle = document.getElementById("ctxToggle");
      const input = document.getElementById("t");
      const mentionMenu = document.getElementById("mentionMenu");
      const sendBtn = document.getElementById("s");
      const modelSel = document.getElementById("modelSel");
      const reasonSel = document.getElementById("reasonSel");
      const contextPill = document.getElementById("contextPill");
      const contextTelemetry = document.getElementById("contextTelemetry");
      const contextAutoBadge = document.getElementById("contextAutoBadge");
      const contextTelemetryText = document.getElementById("contextTelemetryText");
      const contextTelemetryMeta = document.getElementById("contextTelemetryMeta");
      const composerShell = document.querySelector(".composer-shell");
      const composerState = document.getElementById("composerState");
      const chatContextMeter = document.getElementById("chatContextMeter");
      const chatContextMeterValue = document.getElementById("chatContextMeterValue");
      const queuePill = document.getElementById("queuePill");
      const queuePanel = document.getElementById("queuePanel");
      const queueSummary = document.getElementById("queueSummary");
      const queueList = document.getElementById("queueList");
      const jumpLatestBtn = document.getElementById("jumpLatest");
      const chatEmpty = document.getElementById("chatEmpty");
      const chatEmptyHistory = document.getElementById("chatEmptyHistory");
      const chatEmptySettings = document.getElementById("chatEmptySettings");
      const runState = document.getElementById("runState");
      const modeBanner = document.getElementById("modeBanner");
      const planModeChip = document.getElementById("planModeChip");
      const actionMenuBtn = document.getElementById("actionMenuBtn");
      const actionMenu = document.getElementById("actionMenu");
      const actionMenuSheet = actionMenu ? actionMenu.querySelector(".action-menu-sheet") : null;
      const actionMenuClose = document.getElementById("actionMenuClose");
      const actionMenuHomeParent = actionMenu ? actionMenu.parentElement : null;
      const actionMenuHomeNextSibling = actionMenu ? actionMenu.nextSibling : null;
      const threadsOverlayBackdrop = document.getElementById("threadsOverlayBackdrop");
      const newThreadQuick = document.getElementById("newThreadQuick");
      const historyQuick = document.getElementById("historyQuick");
      const historyHeader = document.getElementById("historyHeader");
      const undoHeader = document.getElementById("undoHeader");
      const backToChatQuick = document.getElementById("backToChatQuick");
      const closeThreadsPopupBtn = document.getElementById("closeThreadsPopup");
      const apiKeyInline = document.getElementById("apiKeyInline");
      const apiKeyInlineSave = document.getElementById("apiKeyInlineSave");
      const apiKeyHint = document.getElementById("apiKeyHint");
      const signInSetup = document.getElementById("signInSetup");
      const authLabel = document.getElementById("authLabel");
      const authSignIn = document.getElementById("authSignIn");
      const authSignOut = document.getElementById("authSignOut");
      const authSignOutQuick = document.getElementById("authSignOutQuick");
      const newThreadBtn = document.getElementById("newThreadBtn");
      const undoLastBtn = document.getElementById("undoLastBtn");

      let streamBubble = null;
      let reasoningBubble = null;
      let streaming = false;
      let streamEndPending = false;
      let followLatest = true;
      let autoScrollLockUntil = 0;
      let scrollToLatestRaf = 0;
      let scrollToLatestForcePending = false;
      let terminalBubble = null;
      let streamBuffer = "";
      let streamTimer = null;
      let latestReasonCodes = [];
      let latestRunMeta = null;
      let liveReasoningText = "";
      let threadsOverlayOpen = false;
      let responseStartedAtMs = 0;
      let lastAssistantBubble = null;
      let latestActionOutcome = null;
      let availableModels = [];
      const DEFAULT_MODEL = "playground-default";
      const PUBLIC_MODEL_LABEL = "Playground";
      const CHAT_CONTEXT_TOKEN_BUDGET = 65536;
      const MAX_DIFF_ROWS = 400;
      const MAX_REASONING_CHARS = 24000;
      const seenEditPreviewKeys = new Set();
      let chatContextMeterRaf = 0;
      let chatMutationObserver = null;

      function estimateTokenCount(text) {
        const normalized = String(text || "").replace(/\s+/g, " ").trim();
        if (!normalized) return 0;
        return Math.max(1, Math.ceil(normalized.length / 4));
      }

      function formatCompactCount(value) {
        const rounded = Math.max(0, Math.round(Number(value) || 0));
        if (rounded < 1000) return String(rounded);
        if (rounded < 10000) return (rounded / 1000).toFixed(1).replace(/\.0$/, "") + "k";
        return Math.round(rounded / 1000) + "k";
      }

      function formatCount(value) {
        return Math.max(0, Math.round(Number(value) || 0)).toLocaleString();
      }

      function getCurrentChatContextMetrics() {
        const bodies = msgs ? Array.from(msgs.querySelectorAll(".m .m-body")) : [];
        let messages = 0;
        let approxTokens = 0;
        for (const body of bodies) {
          const text = String(body && body.textContent ? body.textContent : "").trim();
          if (!text) continue;
          messages += 1;
          approxTokens += estimateTokenCount(text) + 6;
        }
        const draftText = input ? String(input.value || "").trim() : "";
        const hasDraft = draftText.length > 0;
        if (hasDraft) approxTokens += estimateTokenCount(draftText) + 4;
        return {
          messages,
          approxTokens,
          hasDraft,
        };
      }

      function updateChatContextMeterNow() {
        if (!chatContextMeter || !chatContextMeterValue) return;
        const metrics = getCurrentChatContextMetrics();
        const ratio = CHAT_CONTEXT_TOKEN_BUDGET > 0
          ? Math.min(metrics.approxTokens / CHAT_CONTEXT_TOKEN_BUDGET, 1)
          : 0;
        chatContextMeter.style.setProperty("--context-progress", String(ratio));
        chatContextMeter.classList.remove("warn", "danger");
        if (ratio >= 0.85) chatContextMeter.classList.add("danger");
        else if (ratio >= 0.6) chatContextMeter.classList.add("warn");
        chatContextMeterValue.textContent = formatCompactCount(metrics.approxTokens);
        const draftLabel = metrics.hasDraft ? " Includes current draft." : "";
        const title =
          "Approx. current chat context: " +
          formatCount(metrics.approxTokens) +
          " tokens across " +
          formatCount(metrics.messages) +
          " visible messages." +
          draftLabel +
          " Budget target: " +
          formatCount(CHAT_CONTEXT_TOKEN_BUDGET) +
          " tokens.";
        chatContextMeter.title = title;
        chatContextMeter.setAttribute("aria-label", title);
      }

      function requestChatContextMeterUpdate() {
        if (!chatContextMeter || !chatContextMeterValue) return;
        if (chatContextMeterRaf) return;
        chatContextMeterRaf = requestAnimationFrame(() => {
          chatContextMeterRaf = 0;
          updateChatContextMeterNow();
        });
      }

      function applyIdeContextVisualState(enabled) {
        if (composerShell) composerShell.classList.toggle("ide-context-on", enabled);
        if (contextPill) contextPill.textContent = enabled ? "IDE Context: LIVE" : "IDE Context: OFF";
      }
      function setContextTelemetryState(inputState) {
        if (!contextTelemetry) return;
        const state = inputState && typeof inputState === "object" ? inputState : {};
        const enabled = state.enabled !== false;
        const phaseRaw = String(state.phase || "idle").toLowerCase();
        const phase = phaseRaw === "collecting" || phaseRaw === "ready" ? phaseRaw : "idle";
        const sourceRaw = String(state.source || "preview").toLowerCase();
        const source = sourceRaw === "send" ? "send" : "preview";
        const snippets = Number(state.snippets || 0);
        const matches = Number(state.workspaceMatches || 0);
        const fresh = String(state.indexFreshness || "cold");
        const preflightMs = Number(state.preflightMs || 0);
        const notes = Array.isArray(state.notes) ? state.notes.map((x) => String(x || "").trim()).filter(Boolean) : [];
        const phaseLabel = phase === "collecting" ? "syncing" : phase === "ready" ? "ready" : "idle";
        const sourceLabel = source === "send" ? "send" : "typing";

        if (contextAutoBadge) {
          contextAutoBadge.classList.remove("idle", "collecting", "ready");
          contextAutoBadge.classList.add(enabled ? phase : "idle");
          contextAutoBadge.textContent = enabled ? "IDE Context" : "Context Off";
        }
        if (contextPill) {
          contextPill.textContent = enabled
            ? (phase === "collecting" ? "IDE Context: Syncing" : "IDE Context: LIVE")
            : "IDE Context: OFF";
        }
        if (contextTelemetryText) {
          if (!enabled) {
            contextTelemetryText.textContent = "IDE context is disabled.";
          } else if (phase === "collecting") {
            contextTelemetryText.textContent = source === "send"
              ? "Syncing workspace context for this request..."
              : "Scanning workspace context in the background...";
          } else if (phase === "ready") {
            contextTelemetryText.textContent = notes[0] || "Context is ready.";
          } else {
            contextTelemetryText.textContent = "Background sync standing by.";
          }
        }
        if (contextTelemetryMeta) {
          if (!enabled) {
            contextTelemetryMeta.textContent = "off";
          } else {
            const ms = preflightMs > 0 ? preflightMs + "ms" : "--";
            contextTelemetryMeta.textContent =
              sourceLabel + " | " + phaseLabel + " | files " + matches + " | snippets " + snippets + " | " + fresh + " | " + ms;
          }
        }
        contextSummary = enabled
          ? ("Context: " + phaseLabel + " | files " + matches + " | snippets " + snippets + " | " + fresh)
          : "";
      }

      function scheduleContextPreviewDispatch(force = false) {
        if (!input) return;
        const text = String(input.value || "").trim();
        if (contextPreviewTimer) {
          clearTimeout(contextPreviewTimer);
          contextPreviewTimer = null;
        }

        if (!text) {
          if (lastContextPreviewText) {
            lastContextPreviewText = "";
            v.postMessage({ type: "contextPreview", text: "", threadId: currentThreadId });
          }
          setContextTelemetryState({
            enabled: true,
            phase: "idle",
            source: "preview",
            snippets: 0,
            workspaceMatches: 0,
            indexFreshness: "cold",
            preflightMs: 0,
            notes: ["Auto context idle."],
          });
          updateComposerState();
          return;
        }

        if (!force && text === lastContextPreviewText) return;

        contextPreviewTimer = setTimeout(() => {
          if (!input) return;
          const latest = String(input.value || "").trim();
          if (!latest) return;
          if (!force && latest === lastContextPreviewText) return;
          lastContextPreviewText = latest;
          setContextTelemetryState({
            enabled: true,
            phase: "collecting",
            source: "preview",
            snippets: 0,
            workspaceMatches: 0,
            indexFreshness: "cold",
            preflightMs: 0,
            notes: ["Auto context scanning workspace..."],
          });
          updateComposerState();
          v.postMessage({ type: "contextPreview", text: latest, threadId: currentThreadId });
        }, 480);
      }
      const MAX_ATTACHMENTS = 3;
      const MAX_ATTACHMENT_BYTES = 4 * 1024 * 1024;
      const ALLOWED_ATTACHMENT_TYPES = new Set(["image/png", "image/jpeg", "image/webp"]);
      let currentMode = "auto";
      let lastSendAt = 0;
      let attachedFiles = [];
      let allowNextLineBreak = false;
      let currentThreadId = null;
      let openChats = [];
      let recentHistory = [];
      let pinnedIds = [];
      let historySearchQuery = "";
      const threadDrafts = {};
      let planDecisionBubble = null;
      let lastStatusText = "";
      let lastStatusAt = 0;
      let activeProgressState = "";
      let hostHandshakeReceived = false;
      let mentionsEnabled = true;
      let mentionItems = [];
      let mentionActiveIndex = 0;
      let mentionSearchToken = null;
      let mentionDebounceTimer = null;
      let mentionPending = false;
      let mentionLastQuery = "";
      let apiKeySavePending = false;
      let creatingThread = false;
      let pendingPromptAfterThread = null;
      let activeRunThreadId = null;
      let lastDiagnosticsFingerprint = "";
      let contextSummary = "";
      let contextPreviewTimer = null;
      let lastContextPreviewText = "";
      let undoAvailable = false;
      let undoCount = 0;
      const TASK_PREVIEW_COUNT = 3;
      const HOME_RECENT_COUNT = 8;
      const SHOW_SYSTEM_ACTIVITY = false;
      const queuedMessages = [];
      let runProgressBubble = null;
      const runStepState = {
        plan: "pending",
        actions: "pending",
        execution: "pending",
        outcome: "pending",
        notes: [],
      };
      let runtimeStrip = null;
      const runtimeState = {
        objective: "",
        cycle: 0,
        maxCycles: 0,
        phase: "idle",
        completionStatus: "incomplete",
        completionScore: 0,
        missingRequirements: [],
        blocker: "",
        appliedFiles: [],
        filesChanged: 0,
        checksRun: 0,
        commandPass: 0,
        commandFail: 0,
        lastCommandBlocker: "",
        toolStrategy: "",
        toolRoute: "",
        toolAdapter: "",
        toolActionSource: "",
        toolRecoveryStage: "",
        commandPolicy: "",
        toolFailureCategory: "",
      };
      const seenRunCommands = new Set();
      const seenRunStatuses = new Set();
      const RUN_SCOPED_MESSAGE_TYPES = new Set([
        "start",
        "token",
        "reasoningToken",
        "status",
        "end",
        "assistant",
        "reasonCodes",
        "editPreview",
        "terminalCommand",
        "fileAction",
        "meta",
        "actionOutcome",
        "autonomyRuntime",
        "execLogs",
        "err",
        "diagnosticsBundle",
      ]);

      function resetRunProgress() {
        runStepState.plan = "pending";
        runStepState.actions = "pending";
        runStepState.execution = "pending";
        runStepState.outcome = "pending";
        runStepState.notes = [];
        seenRunCommands.clear();
        seenRunStatuses.clear();
      }

      function summarizeToolStateForUi(toolState) {
        const state = toolState && typeof toolState === "object" ? toolState : {};
        const bits = [];
        if (state.strategy) bits.push("strategy=" + String(state.strategy));
        if (state.route) bits.push("route=" + String(state.route));
        if (state.adapter) bits.push("adapter=" + String(state.adapter));
        if (state.actionSource) bits.push("source=" + String(state.actionSource));
        if (state.recoveryStage) bits.push("recovery=" + String(state.recoveryStage));
        if (state.commandPolicyResolved) bits.push("policy=" + String(state.commandPolicyResolved));
        if (state.lastFailureCategory) bits.push("failure=" + String(state.lastFailureCategory));
        return bits.join(" | ");
      }

      function toolFailureScopeForUi(category) {
        const value = String(category || "").trim().toLowerCase();
        if (!value) return "";
        if (value === "validation_failed") return "validation";
        if (value === "no_content_delta" || value === "local_apply_failed") return "local apply";
        return "backend generation";
      }

      function planAwareStateLabel(baseLabel) {
        const label = String(baseLabel || "Local");
        return currentMode === "plan" ? "Plan mode | " + label : label;
      }

      function setRunState(baseLabel) {
        if (!runState) return;
        runState.textContent = planAwareStateLabel(baseLabel);
      }

      function injectRuntimeStripStyles() {
        if (document.getElementById("runtimeStripStyles")) return;
        const style = document.createElement("style");
        style.id = "runtimeStripStyles";
        style.textContent = [
          ".runtime-strip{position:sticky;top:0;z-index:6;margin:0 0 10px;border:0;border-radius:0;background:transparent;padding:0;display:grid;gap:4px}",
          ".runtime-strip.hidden{display:none}",
          ".runtime-strip .rt-head,.runtime-strip .rt-mid{display:none!important}",
          ".rt-head{display:flex;gap:6px;align-items:center;flex-wrap:wrap}",
          ".rt-pill{font-size:11px;border:1px solid #2b2b2b;border-radius:999px;padding:2px 8px;color:#d7d7d7;background:#0d0d0d}",
          ".rt-phase{font-weight:700;text-transform:uppercase;letter-spacing:.04em}",
          ".rt-phase.done{color:#8ee58e;border-color:#2d6636}",
          ".rt-phase.reprompt{color:#ffd48a;border-color:#6f4f1e}",
          ".rt-phase.apply{color:#a7d1ff;border-color:#244b72}",
          ".rt-objective{font-size:12px;color:#efefef;max-width:100%;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}",
          ".rt-mid{display:flex;gap:8px;align-items:flex-start;justify-content:space-between;flex-wrap:wrap}",
          ".rt-files,.rt-commands{display:flex;gap:6px;flex-wrap:wrap;align-items:center}",
          ".rt-tools{display:flex;gap:6px;flex-wrap:wrap;align-items:center}",
          ".rt-chip{font-size:11px;border:1px solid #2a2a2a;border-radius:999px;padding:2px 8px;background:#0f0f0f;color:#d6d6d6;max-width:240px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}",
          ".rt-chip.file{border-color:#2f4f73;background:#0d141d}",
          ".rt-chip.tool{border-color:#36527b;background:#101826;color:#cddcff}",
          ".rt-chip.pass{border-color:#2d6636;background:#0f1a12;color:#a5e7ae}",
          ".rt-chip.fail{border-color:#7a3131;background:#1b0f0f;color:#ffb4b4}",
          ".rt-why{font-size:11px;color:#ffbf82;background:#1a1209;border:1px solid #5b3a12;border-radius:8px;padding:5px 7px}",
          ".rt-why.done{display:none}",
        ].join("");
        document.head.appendChild(style);
      }

      function ensureRuntimeStrip() {
        if (runtimeStrip && runtimeStrip.isConnected) return runtimeStrip;
        injectRuntimeStripStyles();
        if (!chatPanel) return null;
        runtimeStrip = document.createElement("div");
        runtimeStrip.className = "runtime-strip hidden";
        runtimeStrip.innerHTML =
          '<div class="rt-head">' +
            '<span id="rtObjective" class="rt-objective"></span>' +
            '<span id="rtCycle" class="rt-pill"></span>' +
            '<span id="rtPhase" class="rt-pill rt-phase"></span>' +
            '<span id="rtScore" class="rt-pill"></span>' +
          "</div>" +
          '<div class="rt-mid">' +
            '<div id="rtFiles" class="rt-files"></div>' +
            '<div id="rtCommands" class="rt-commands"></div>' +
          "</div>" +
          '<div id="rtTools" class="rt-tools"></div>' +
          '<div id="rtWhy" class="rt-why"></div>';
        if (chips && chips.parentElement === chatPanel) {
          chatPanel.insertBefore(runtimeStrip, chips.nextSibling);
        } else if (msgs && msgs.parentElement === chatPanel) {
          chatPanel.insertBefore(runtimeStrip, msgs);
        } else {
          chatPanel.appendChild(runtimeStrip);
        }
        return runtimeStrip;
      }

      function resetRuntimeState() {
        runtimeState.objective = "";
        runtimeState.cycle = 0;
        runtimeState.maxCycles = 0;
        runtimeState.phase = "idle";
        runtimeState.completionStatus = "incomplete";
        runtimeState.completionScore = 0;
        runtimeState.missingRequirements = [];
        runtimeState.blocker = "";
        runtimeState.appliedFiles = [];
        runtimeState.filesChanged = 0;
        runtimeState.checksRun = 0;
        runtimeState.commandPass = 0;
        runtimeState.commandFail = 0;
        runtimeState.lastCommandBlocker = "";
        runtimeState.toolStrategy = "";
        runtimeState.toolRoute = "";
        runtimeState.toolAdapter = "";
        runtimeState.toolActionSource = "";
        runtimeState.toolRecoveryStage = "";
        runtimeState.commandPolicy = "";
        runtimeState.toolFailureCategory = "";
        renderRuntimeStrip();
      }

      function renderRuntimeStrip() {
        const strip = ensureRuntimeStrip();
        if (!strip) return;
        const hasRuntime = Boolean(runtimeState.objective && runtimeState.objective.trim());
        strip.classList.toggle("hidden", !hasRuntime);
        if (!hasRuntime) return;
        const objectiveEl = strip.querySelector("#rtObjective");
        const cycleEl = strip.querySelector("#rtCycle");
        const phaseEl = strip.querySelector("#rtPhase");
        const scoreEl = strip.querySelector("#rtScore");
        const filesEl = strip.querySelector("#rtFiles");
        const commandsEl = strip.querySelector("#rtCommands");
        const toolsEl = strip.querySelector("#rtTools");
        const whyEl = strip.querySelector("#rtWhy");
        if (objectiveEl) objectiveEl.textContent = "Objective: " + String(runtimeState.objective || "").replace(/\s+/g, " ").trim();
        const cycleLabel = runtimeState.maxCycles > 0
          ? ("Cycle " + runtimeState.cycle + "/" + runtimeState.maxCycles)
          : ("Cycle " + runtimeState.cycle + "/unbounded");
        if (cycleEl) cycleEl.textContent = cycleLabel;
        if (phaseEl) {
          const phase = String(runtimeState.phase || "idle").toLowerCase();
          phaseEl.className = "rt-pill rt-phase " + phase;
          phaseEl.textContent = "Phase: " + phase;
        }
        if (scoreEl) scoreEl.textContent = "Completion: " + Math.max(0, Math.min(100, Number(runtimeState.completionScore || 0))) + "%";
        if (filesEl) {
          const files = Array.isArray(runtimeState.appliedFiles) ? runtimeState.appliedFiles : [];
          if (!files.length) {
            filesEl.innerHTML = '<span class="rt-chip">Applied files: none</span>';
          } else {
            filesEl.innerHTML = files
              .slice(0, 8)
              .map((path) => '<span class="rt-chip file" title="' + esc(path) + '">' + esc(path) + "</span>")
              .join("");
          }
        }
        if (commandsEl) {
          const pass = Number(runtimeState.commandPass || 0);
          const fail = Number(runtimeState.commandFail || 0);
          const cmdBits = [];
          cmdBits.push('<span class="rt-chip pass">Cmd pass: ' + pass + "</span>");
          cmdBits.push('<span class="rt-chip ' + (fail > 0 ? "fail" : "") + '">Cmd fail: ' + fail + "</span>");
          cmdBits.push('<span class="rt-chip">files=' + Number(runtimeState.filesChanged || 0) + ", checks=" + Number(runtimeState.checksRun || 0) + "</span>");
          commandsEl.innerHTML = cmdBits.join("");
        }
        if (toolsEl) {
          const toolBits = [];
          if (runtimeState.toolRoute) toolBits.push('<span class="rt-chip tool">route=' + esc(runtimeState.toolRoute) + "</span>");
          if (runtimeState.toolAdapter) toolBits.push('<span class="rt-chip tool">adapter=' + esc(runtimeState.toolAdapter) + "</span>");
          if (runtimeState.toolActionSource) toolBits.push('<span class="rt-chip tool">source=' + esc(runtimeState.toolActionSource) + "</span>");
          if (runtimeState.toolRecoveryStage) toolBits.push('<span class="rt-chip tool">recovery=' + esc(runtimeState.toolRecoveryStage) + "</span>");
          if (runtimeState.commandPolicy) toolBits.push('<span class="rt-chip tool">policy=' + esc(runtimeState.commandPolicy) + "</span>");
          if (runtimeState.toolFailureCategory) {
            toolBits.push('<span class="rt-chip fail">failure=' + esc(runtimeState.toolFailureCategory) + "</span>");
          }
          toolsEl.innerHTML = toolBits.join("");
        }
        if (whyEl) {
          const incomplete = runtimeState.completionStatus === "incomplete" || String(runtimeState.phase) === "reprompt";
          const missing = Array.isArray(runtimeState.missingRequirements) && runtimeState.missingRequirements.length
            ? runtimeState.missingRequirements.join(", ")
            : "";
          const blocker = runtimeState.lastCommandBlocker || runtimeState.blocker || "";
          const toolScope = toolFailureScopeForUi(runtimeState.toolFailureCategory);
          const toolHint = runtimeState.toolFailureCategory
            ? ((toolScope ? "scope=" + toolScope + " | " : "") + "failure=" + runtimeState.toolFailureCategory)
            : "";
          const hint = [toolHint, missing, blocker].filter(Boolean).join(" | ");
          whyEl.classList.toggle("done", !incomplete);
          whyEl.textContent = incomplete
            ? "Why not done yet: " + (hint || "working on completion requirements")
            : "";
        }
      }

      function applyPlanVisualState(modeValue) {
        const planActive = modeValue === "plan";
        if (modeBanner) modeBanner.classList.toggle("hidden", !planActive);
        if (planModeChip) planModeChip.classList.toggle("hidden", !planActive);
      }

      function labelForMode(value) {
        const v = String(value || "").toLowerCase();
        if (v === "plan") return "Plan";
        if (v === "yolo") return "Full access";
        return "Auto";
      }

      function labelForReasoning(value) {
        const v = String(value || "").toLowerCase();
        if (v === "low") return "Low";
        if (v === "high") return "High";
        if (v === "max") return "Extra High";
        return "Medium";
      }

      function modelLabelForUi(value) {
        const selected = String(value || "").trim().toLowerCase();
        const match = availableModels.find((entry) => String(entry.alias || "").trim().toLowerCase() === selected);
        if (match && match.displayName) return String(match.displayName);
        if (selected === "playground-default") return PUBLIC_MODEL_LABEL;
        if (selected === "playground-backup") return "Playground Backup";
        if (value) return String(value);
        return PUBLIC_MODEL_LABEL;
      }

      function modelMetaLabel(value) {
        const selected = String(value || "").trim().toLowerCase();
        const match = availableModels.find((entry) => String(entry.alias || "").trim().toLowerCase() === selected);
        if (!match) return "";
        const provider = String(match.provider || "").toUpperCase();
        const cert = String(match.certification || "");
        const suffix = cert ? " | " + cert.replace(/_/g, " ") : "";
        return provider ? provider + suffix : suffix.replace(/^\s+\|\s+/, "");
      }

      function renderModelOptions(payload) {
        if (!modelSel) return;
        const models = payload && Array.isArray(payload.models) ? payload.models : [];
        const defaultModel = payload && payload.defaultModel ? String(payload.defaultModel) : DEFAULT_MODEL;
        const selectedModel = defaultModel;
        availableModels = models
          .map((item) => ({
            alias: String(item && item.alias || ""),
            displayName: String(item && item.displayName || ""),
            provider: String(item && item.provider || ""),
            certification: String(item && item.certification || ""),
          }))
          .filter((item) => item.alias && item.displayName);
        modelSel.innerHTML = "";
        const visibleModel = availableModels.find((entry) => entry.alias === defaultModel)
          || availableModels[0]
          || { alias: defaultModel || DEFAULT_MODEL, displayName: PUBLIC_MODEL_LABEL, provider: "", certification: "" };
        [visibleModel].forEach((entry) => {
          const option = document.createElement("option");
          option.value = entry.alias;
          const meta = modelMetaLabel(entry.alias);
          option.textContent = meta ? modelLabelForUi(entry.alias) + " (" + meta + ")" : modelLabelForUi(entry.alias);
          modelSel.appendChild(option);
        });
        modelSel.value = visibleModel.alias || selectedModel || DEFAULT_MODEL;
      }

      function updateComposerState() {
        if (!composerState) return;
        const modeLabel = labelForMode(modeQuick ? modeQuick.value : currentMode);
        const reasoningLabel = labelForReasoning(reasonSel ? reasonSel.value : "medium");
        const modelLabel = modelLabelForUi(modelSel ? modelSel.value : DEFAULT_MODEL);
        const modelMeta = modelMetaLabel(modelSel ? modelSel.value : DEFAULT_MODEL);
        const modelSuffix = modelMeta ? " - Model: " + modelLabel + " [" + modelMeta + "]" : " - Model: " + modelLabel;
        const resolvedModel =
          latestRunMeta && typeof latestRunMeta === "object" && latestRunMeta.modelResolvedAlias
            ? " - Resolved: " + String(latestRunMeta.modelResolvedAlias)
            : "";
        const tail = contextSummary ? " - " + contextSummary : "";
        composerState.textContent = "Mode: " + modeLabel + " - Reasoning: " + reasoningLabel + modelSuffix + resolvedModel + tail;
      }

      function updateUndoButtonState() {
        const label = undoAvailable
          ? ("Undo Last Changes" + (undoCount > 1 ? " (" + undoCount + ")" : ""))
          : "Undo Last Changes";
        const title = undoAvailable ? "Revert the latest Playground-applied file changes." : "No Playground changes available to undo.";
        if (undoLastBtn) {
          undoLastBtn.disabled = !undoAvailable;
          undoLastBtn.textContent = label;
          undoLastBtn.title = title;
        }
        if (undoHeader) {
          undoHeader.disabled = !undoAvailable;
          undoHeader.textContent = undoAvailable ? "Undo" + (undoCount > 1 ? " (" + undoCount + ")" : "") : "Undo";
          undoHeader.title = title;
        }
      }

      function requestUndo(sourceLabel, closeMenu) {
        if (!undoAvailable) return;
        const confirmText = "Undo last Playground-applied changes? This will revert the most recent batch.";
        if (!window.confirm(confirmText)) return;
        const suffix = sourceLabel ? " (" + sourceLabel + ")" : "";
        if (SHOW_SYSTEM_ACTIVITY) addMessage("Undoing last changes" + suffix + "...", "cmd");
        v.postMessage({ type: "undoLastChanges" });
        if (closeMenu) setActionMenuOpen(false);
      }

      function resolveSlashModeTarget(rawText, options) {
        const raw = String(rawText || "");
        const requireSeparator = !options || options.requireSeparator !== false;
        const match = raw.match(/^\s*\/(plan|auto|yolo|full)(\s+|$)/i);
        if (!match) return null;
        if (requireSeparator && !/\s/.test(String(match[2] || ""))) return null;
        const command = String(match[1] || "").toLowerCase();
        const mode = command === "plan" ? "plan" : command === "auto" ? "auto" : "yolo";
        return {
          mode,
          matchedText: match[0],
          remainingText: raw.slice(match[0].length),
        };
      }

      function applySlashMode(modeValue) {
        const normalized = modeValue === "plan" || modeValue === "yolo" ? modeValue : "auto";
        const changed = currentMode !== normalized;
        if (changed) {
          applyModeUI(normalized);
          v.postMessage({ type: "setMode", value: normalized });
        }
        return changed;
      }

      function parseSlashModeCommand(rawText) {
        const trimmed = String(rawText || "").replace(/\r?\n+$/g, "").trim();
        if (!trimmed) {
          return { text: "", modeChanged: false, matchedMode: null, preventSend: true };
        }

        let text = trimmed;
        let modeChanged = false;
        let matchedMode = null;
        const slashMode = resolveSlashModeTarget(text, { requireSeparator: false });

        if (slashMode) {
          matchedMode = slashMode.mode;
          modeChanged = applySlashMode(slashMode.mode);
          text = String(slashMode.remainingText || "").trim();
        }

        return {
          text,
          modeChanged,
          matchedMode,
          preventSend: Boolean(matchedMode) && !text,
        };
      }

      function applyInlineSlashModeCommand() {
        if (!input) return false;
        const slashMode = resolveSlashModeTarget(input.value || "", { requireSeparator: true });
        if (!slashMode) return false;

        applySlashMode(slashMode.mode);
        input.value = String(slashMode.remainingText || "").replace(/^\s+/, "");
        if (currentThreadId) {
          threadDrafts[currentThreadId] = input.value || "";
        }
        syncComposerHeight();
        scheduleMentionSearch();
        scheduleContextPreviewDispatch();
        return true;
      }

      function eventTargetElement(target) {
        if (!target) return null;
        if (target.nodeType === 1) return target;
        return target.parentElement || null;
      }

      function isDropdownTarget(target) {
        const el = eventTargetElement(target);
        if (!el || !el.closest) return false;
        return Boolean(
          el.closest("select") ||
          el.closest("option") ||
          el.closest(".composer-select")
        );
      }

      function isInteractiveTarget(target) {
        const el = eventTargetElement(target);
        if (!el || !el.closest) return false;
        return Boolean(
          el.closest("button") ||
          el.closest("input") ||
          el.closest("textarea") ||
          el.closest("select") ||
          el.closest("a") ||
          el.closest("summary") ||
          el.closest("details") ||
          el.closest("label") ||
          el.closest('[role="button"]') ||
          el.closest('[contenteditable="true"]')
        );
      }

      function bindChatDockClickToFocus() {
        if (!chatDock || !input) return;
        if (chatDock.dataset.focusBound === "1") return;
        chatDock.dataset.focusBound = "1";
        chatDock.addEventListener("click", (e) => {
          if (!input) return;
          if (!e || e.defaultPrevented) return;
          if (isInteractiveTarget(e.target)) return;
          try {
            const sel = window.getSelection ? window.getSelection() : null;
            const selected = sel ? String(sel.toString() || "").trim() : "";
            if (selected) return;
          } catch {
            // ignore selection errors
          }
          input.focus();
        });
      }

      function postSendFallback(rawText) {
        const parsed = parseSlashModeCommand(rawText);
        if (parsed.preventSend) {
          if (SHOW_SYSTEM_ACTIVITY) addMessage("Mode updated. Add your request after the slash command.", "cmd");
          return;
        }
        const text = parsed.text;
        if (!text) return;
        const parallelEnabled = Boolean(parallelQuick && parallelQuick.checked);
        const includeIdeContext = true;
        v.postMessage({
          type: "send",
          text,
          parallel: parallelEnabled,
          model: modelSel ? modelSel.value : DEFAULT_MODEL,
          reasoning: reasonSel ? reasonSel.value : "medium",
          includeIdeContext,
          workspaceContextLevel: "max",
          attachments: attachedFiles.map((f) => ({ mimeType: f.mimeType, name: f.name, dataUrl: f.dataUrl })),
          threadId: currentThreadId,
        });
      }

      function triggerSendSafe(e) {
        if (e) {
          e.preventDefault();
          e.stopPropagation();
        }
        try {
          sendCurrent();
        } catch {
          if (input) {
            const fallbackText = input.value;
            input.value = "";
            postSendFallback(fallbackText);
            attachedFiles = [];
            if (uploadInput) uploadInput.value = "";
            updateAttachmentUI();
          }
        }
      }

      // Earliest possible fallback wiring: keep Enter/click send alive even if later init fails.
      const emergencyComposerKeydown = (e) => {
        const target = e.target;
        if (!target || target.id !== "t") return;
        const isEnter =
          e.key === "Enter" ||
          e.code === "Enter" ||
          e.code === "NumpadEnter" ||
          e.keyCode === 13 ||
          e.which === 13;
        if (!isEnter) return;
        if (e.shiftKey || e.altKey || e.ctrlKey || e.metaKey) {
          allowNextLineBreak = true;
          return;
        }
        allowNextLineBreak = false;
        triggerSendSafe(e);
      };
      const emergencyComposerBeforeInput = (e) => {
        if (window.__playgroundComposerReady) return;
        const target = e.target;
        if (!target || target.id !== "t") return;
        if (e.inputType === "insertLineBreak" || e.inputType === "insertParagraph") {
          if (allowNextLineBreak) {
            allowNextLineBreak = false;
            return;
          }
          triggerSendSafe(e);
        }
      };
      document.addEventListener("keydown", (e) => {
        if (window.__playgroundComposerReady) return;
        const active = document.activeElement;
        if (!active || active.id !== "t") return;
        const isEnter =
          e.key === "Enter" ||
          e.code === "Enter" ||
          e.code === "NumpadEnter" ||
          e.keyCode === 13 ||
          e.which === 13;
        if (!isEnter) return;
        if (e.shiftKey || e.altKey || e.ctrlKey || e.metaKey) {
          allowNextLineBreak = true;
          return;
        }
        allowNextLineBreak = false;
        triggerSendSafe(e);
      }, true);
      document.addEventListener("click", (e) => {
        if (window.__playgroundComposerReady) return;
        if (isDropdownTarget(e.target)) return;
        const target = eventTargetElement(e.target);
        if (!target || !target.closest("#s")) return;
        triggerSendSafe(e);
      }, true);
      const emergencySendButtonClick = (e) => {
        if (window.__playgroundComposerReady) return;
        triggerSendSafe(e);
      };
      function bindEmergencyComposer() {
        const t = document.getElementById("t");
        const s = document.getElementById("s");
        if (t && t.dataset.sendBound !== "1") {
          t.addEventListener("keydown", emergencyComposerKeydown, true);
          t.addEventListener("beforeinput", emergencyComposerBeforeInput, true);
          t.dataset.sendBound = "1";
        }
        if (s && s.dataset.sendBound !== "1") {
          s.addEventListener("click", emergencySendButtonClick, true);
          s.dataset.sendBound = "1";
        }
      }
      bindEmergencyComposer();
      setInterval(bindEmergencyComposer, 1200);

      // Fail-safe: avoid an all-hidden screen while waiting for extension handshake messages.
      if (app) app.style.display = "flex";
      if (setup) setup.style.display = "none";

      function timeLabel() {
        return new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
      }

      function formatElapsed(ms) {
        const safeMs = Number(ms);
        if (!Number.isFinite(safeMs) || safeMs < 0) return "0.0s";
        if (safeMs < 60_000) return (safeMs / 1000).toFixed(1) + "s";
        const totalSeconds = Math.round(safeMs / 1000);
        const mins = Math.floor(totalSeconds / 60);
        const secs = totalSeconds % 60;
        return mins + "m " + secs + "s";
      }

      function stampResponseDuration(targetBubble, errored = false) {
        if (!responseStartedAtMs) return;
        const elapsedLabel = formatElapsed(Date.now() - responseStartedAtMs);
        responseStartedAtMs = 0;
        const suffix = (errored ? "stopped after " : "worked for ") + elapsedLabel;
        const bubble = targetBubble && targetBubble.isConnected ? targetBubble : null;
        if (bubble) {
          const meta = bubble.querySelector(".m-time");
          if (meta) {
            const base = String(meta.textContent || "").split(" · ")[0] || timeLabel();
            meta.textContent = base + " · " + suffix;
            return;
          }
        }
        if (SHOW_SYSTEM_ACTIVITY) addMessage((errored ? "Stopped after " : "Worked for ") + elapsedLabel + ".", "cmd");
      }

      function shortAgeLabel(isoValue) {
        if (!isoValue) return "";
        const ms = new Date(isoValue).getTime();
        if (!Number.isFinite(ms)) return "";
        const diffMin = Math.max(1, Math.floor((Date.now() - ms) / 60000));
        if (diffMin < 60) return diffMin + "m";
        const diffHours = Math.floor(diffMin / 60);
        if (diffHours < 24) return diffHours + "h";
        const diffDays = Math.floor(diffHours / 24);
        return diffDays + "d";
      }

      function syncComposerHeight() {
        if (!input) return;
        input.style.height = "auto";
        const next = Math.max(64, Math.min(220, input.scrollHeight || 64));
        input.style.height = next + "px";
        requestChatContextMeterUpdate();
      }

      function saveCurrentDraft() {
        if (!input || !currentThreadId) return;
        threadDrafts[currentThreadId] = input.value || "";
      }

      function restoreDraftForThread(id) {
        if (!input) return;
        input.value = (id && threadDrafts[id]) ? threadDrafts[id] : "";
        syncComposerHeight();
        scheduleContextPreviewDispatch(true);
      }

      function isPinnedThread(id) {
        return pinnedIds.includes(String(id || ""));
      }

      function closeMentionMenu() {
        mentionItems = [];
        mentionActiveIndex = 0;
        mentionSearchToken = null;
        mentionPending = false;
        mentionLastQuery = "";
        if (mentionMenu) {
          mentionMenu.classList.add("hidden");
          mentionMenu.innerHTML = "";
        }
      }

      function renderMentionMenu() {
        if (!mentionMenu) return;
        const activeCtx = mentionContextFromInput() || mentionSearchToken;
        if (!activeCtx) {
          mentionMenu.classList.add("hidden");
          mentionMenu.innerHTML = "";
          return;
        }
        if (!mentionItems.length && !mentionPending) {
          mentionMenu.classList.remove("hidden");
          mentionMenu.innerHTML =
            '<div class="mention-status mention-empty" role="status" aria-live="polite">No matching files or folders.</div>';
          return;
        }
        mentionMenu.classList.remove("hidden");
        if (mentionPending && !mentionItems.length) {
          mentionMenu.innerHTML =
            '<div class="mention-status" role="status" aria-live="polite">Searching workspace...</div>';
          return;
        }
        mentionMenu.innerHTML = mentionItems.map((item, index) => (
          '<button class="mention-item' + (index === mentionActiveIndex ? " active" : "") + '" type="button" data-mention-index="' + index + '">' +
            '<span class="mention-path">' + esc(item.path || "") + '</span>' +
            '<span class="mention-kind">' + esc(item.kind || "file") + '</span>' +
          '</button>'
        )).join("");
        mentionMenu.querySelectorAll("[data-mention-index]").forEach((el) => {
          el.addEventListener("mousedown", (e) => e.preventDefault());
          el.addEventListener("click", (e) => {
            e.preventDefault();
            const idx = Number(el.getAttribute("data-mention-index"));
            const item = mentionItems[idx];
            if (!item) return;
            applyMentionSelection(item.path);
          });
        });
      }

      function mentionContextFromInput() {
        if (!input || !mentionsEnabled) return null;
        const text = String(input.value || "");
        const caret = Number(input.selectionStart || 0);
        const before = text.slice(0, caret);
        const match = before.match(/(^|[\s([{])@([^\s@]*)$/);
        if (match) {
          const query = String(match[2] || "");
          const atIndex = caret - query.length - 1;
          if (atIndex < 0) return null;
          return { mode: "mention", query, tokenIndex: atIndex, caret };
        }
        return null;
      }

      function handleMentionKeydown(e) {
        if (!mentionsEnabled) return false;
        if (!mentionMenu || mentionMenu.classList.contains("hidden")) return false;
        if (!mentionItems.length) return false;

        const key = String(e.key || "");
        const code = String(e.code || "");
        const keyCode = Number(e.keyCode || e.which || 0);

        const isDown = key === "ArrowDown" || code === "ArrowDown" || keyCode === 40;
        const isUp = key === "ArrowUp" || code === "ArrowUp" || keyCode === 38;
        const isEnter = key === "Enter" || code === "Enter" || code === "NumpadEnter" || keyCode === 13;
        const isTab = key === "Tab" || code === "Tab" || keyCode === 9;
        const isEsc = key === "Escape" || code === "Escape" || keyCode === 27;

        if (isDown) {
          e.preventDefault();
          e.stopPropagation();
          if (e.stopImmediatePropagation) e.stopImmediatePropagation();
          mentionActiveIndex = (mentionActiveIndex + 1) % mentionItems.length;
          renderMentionMenu();
          return true;
        }

        if (isUp) {
          e.preventDefault();
          e.stopPropagation();
          if (e.stopImmediatePropagation) e.stopImmediatePropagation();
          mentionActiveIndex = (mentionActiveIndex - 1 + mentionItems.length) % mentionItems.length;
          renderMentionMenu();
          return true;
        }

        if ((isEnter || isTab) && !e.shiftKey && !e.altKey && !e.ctrlKey && !e.metaKey) {
          e.preventDefault();
          e.stopPropagation();
          if (e.stopImmediatePropagation) e.stopImmediatePropagation();
          const active = mentionItems[mentionActiveIndex] || mentionItems[0];
          if (active) applyMentionSelection(active.path);
          return true;
        }

        if (isEsc) {
          e.preventDefault();
          e.stopPropagation();
          if (e.stopImmediatePropagation) e.stopImmediatePropagation();
          closeMentionMenu();
          return true;
        }

        return false;
      }

      function scheduleMentionSearch() {
        const ctx = mentionContextFromInput();
        if (!ctx) {
          closeMentionMenu();
          return;
        }
        mentionSearchToken = ctx;
        mentionPending = true;
        mentionLastQuery = ctx.query;
        renderMentionMenu();
        if (mentionDebounceTimer) clearTimeout(mentionDebounceTimer);
        mentionDebounceTimer = setTimeout(() => {
          if (!mentionSearchToken) return;
          v.postMessage({ type: "mentionSearch", query: mentionSearchToken.query, limit: 12 });
        }, 120);
      }

      function applyMentionSelection(pathValue) {
        const ctx = mentionContextFromInput() || mentionSearchToken;
        if (!ctx || !input) return;
        const pathText = String(pathValue || "").trim().replace(/^@+/, "");
        if (!pathText) return;
        const text = String(input.value || "");
        const head = text.slice(0, ctx.tokenIndex);
        const tail = text.slice(ctx.caret);
        const mentionText = ctx.mode === "mention" ? ("@" + pathText) : pathText;
        const needsSpace = tail.length === 0 || !/^[\s.,;:!?)]/.test(tail);
        input.value = head + mentionText + (needsSpace ? " " : "") + tail;
        const nextCaret = (head + mentionText + (needsSpace ? " " : "")).length;
        input.selectionStart = nextCaret;
        input.selectionEnd = nextCaret;
        input.focus();
        if (currentThreadId) threadDrafts[currentThreadId] = input.value || "";
        scheduleContextPreviewDispatch();
        closeMentionMenu();
      }

      function renderThreadRows(rows, kind) {
        if (!rows.length) {
          return '<div class="thread-meta">No ' + (kind === "open" ? "open chats" : "recent history") + ".</div>";
        }
        return rows.map((x) => (
          '<div class="thread-row' + (String(x.id) === String(currentThreadId || "") ? " active" : "") + '" data-thread-id="' + esc(x.id) + '" data-kind="' + esc(kind) + '">' +
            '<div class="thread-main">' +
              '<div class="thread-title">' + esc(x.title || "Untitled") + '</div>' +
              '<div class="thread-meta">' + esc(String(x.mode || "auto")) + ' | ' + esc(shortAgeLabel(x.updatedAt) || "now") + '</div>' +
            '</div>' +
            (kind === "open"
              ? (
                '<div class="thread-actions">' +
                  '<button class="thread-pin' + (isPinnedThread(x.id) ? ' is-pinned' : '') + '" type="button" data-pin-thread="' + esc(x.id) + '" aria-label="' + (isPinnedThread(x.id) ? 'Unpin chat' : 'Pin chat') + '">' + (isPinnedThread(x.id) ? '&#9733;' : '&#9734;') + '</button>' +
                  '<button class="thread-close" type="button" data-close-thread="' + esc(x.id) + '" aria-label="Close chat">x</button>' +
                '</div>'
              )
              : "") +
          '</div>'
        )).join('');
      }

      function renderThreadList() {
        if (!threadList) return;
        threadList.innerHTML =
          '<div>' +
            '<div class="thread-section-title">Open Chats</div>' +
            renderThreadRows(openChats, "open") +
          '</div>' +
          '<div>' +
            '<div class="thread-section-title">Recent History</div>' +
            renderThreadRows(recentHistory, "history") +
          '</div>';

        threadList.querySelectorAll('[data-thread-id]').forEach((el) => {
          el.addEventListener('click', (e) => {
            const target = eventTargetElement(e.target);
            if (target && (target.closest('[data-close-thread]') || target.closest('[data-pin-thread]'))) return;
            const id = el.getAttribute('data-thread-id');
            const kind = el.getAttribute('data-kind');
            if (!id) return;
            saveCurrentDraft();
            creatingThread = false;
            currentThreadId = id;
            renderThreadList();
            setRunState("Switching chat...");
            if (kind === 'open') v.postMessage({ type: 'switchThread', id });
            else v.postMessage({ type: 'openSession', id });
            if (threadsOverlayOpen) setThreadsOverlayOpen(false);
          });
        });

        threadList.querySelectorAll('[data-close-thread]').forEach((el) => {
          el.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            const id = el.getAttribute('data-close-thread');
            if (!id) return;
            if (id === currentThreadId) saveCurrentDraft();
            v.postMessage({ type: 'closeThread', id });
          });
        });

        threadList.querySelectorAll('[data-pin-thread]').forEach((el) => {
          el.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            const id = el.getAttribute('data-pin-thread');
            if (!id) return;
            v.postMessage({ type: 'pinThread', id, pinned: !isPinnedThread(id) });
          });
        });
      }

      function openSessionFromUi(id) {
        const normalizedId = String(id || "").trim();
        if (!normalizedId) return;
        saveCurrentDraft();
        creatingThread = false;
        currentThreadId = normalizedId;
        renderThreadList();
        setRunState("Switching chat...");
        v.postMessage({ type: "openSession", id: normalizedId });
        if (threadsOverlayOpen) setThreadsOverlayOpen(false);
      }

      function renderTaskPreview(rows) {
        if (!taskList) return;
        const list = Array.isArray(rows) ? rows : [];
        const previewRows = list.slice(0, TASK_PREVIEW_COUNT);
        const homeRows = list.slice(0, HOME_RECENT_COUNT);
        taskList.innerHTML = previewRows.map((x) => (
          '<button class="task-entry" data-id="' + esc(x.id) + '" type="button">' +
            '<div class="task-main">' +
              '<div class="task-title">' + esc(x.title || "Untitled task") + '</div>' +
            '</div>' +
            '<div class="task-right">' +
              '<span class="task-age">' + esc(shortAgeLabel(x.updatedAt)) + '</span>' +
              '<span class="task-dot" aria-hidden="true"></span>' +
            '</div>' +
          '</button>'
        )).join("") || '<div class="task-meta">No task history yet.</div>';
        taskList.querySelectorAll(".task-entry").forEach((el) => {
          el.onclick = () => openSessionFromUi(el.getAttribute("data-id"));
        });
        if (viewAllTasks) viewAllTasks.textContent = "View all (" + list.length + ")";

        if (chatEmptyHistoryList) {
          chatEmptyHistoryList.innerHTML = homeRows.map((x) => (
            '<button class="chat-empty-history-row" data-id="' + esc(x.id) + '" type="button">' +
              '<span class="chat-empty-history-row-title">' + esc(x.title || "Untitled task") + '</span>' +
              '<span class="chat-empty-history-row-age">' + esc(shortAgeLabel(x.updatedAt)) + '</span>' +
            '</button>'
          )).join("") || '<div class="chat-empty-history-empty">No conversations yet.</div>';
          if (!chatEmptyHistoryList.dataset.historyClickBound) {
            chatEmptyHistoryList.addEventListener("click", (event) => {
              const target = event.target;
              if (!(target instanceof HTMLElement)) return;
              const row = target.closest(".chat-empty-history-row");
              if (!row) return;
              const id = String(row.getAttribute("data-id") || "").trim();
              if (!id) return;
              openSessionFromUi(id);
            });
            chatEmptyHistoryList.dataset.historyClickBound = "1";
          }
        }
      }

      function filteredHistoryRows(rows, query) {
        const list = Array.isArray(rows) ? rows : [];
        const normalizedQuery = String(query || "").trim().toLowerCase();
        if (!normalizedQuery) return list;
        return list.filter((row) => {
          const title = String(row?.title || "").toLowerCase();
          const mode = String(row?.mode || "").toLowerCase();
          const age = String(shortAgeLabel(row?.updatedAt) || "").toLowerCase();
          return title.includes(normalizedQuery) || mode.includes(normalizedQuery) || age.includes(normalizedQuery);
        });
      }

      function renderHistoryPanel(rows, options = {}) {
        if (!history) return;
        const list = Array.isArray(rows) ? rows : [];
        const queryFromOptions = options && Object.prototype.hasOwnProperty.call(options, "query")
          ? String(options.query || "")
          : historySearchQuery;
        historySearchQuery = queryFromOptions;
        const query = String(historySearchQuery || "").trim();
        const filtered = filteredHistoryRows(list, query);
        const status = String((options && options.status) || "").trim();
        history.innerHTML =
          '<div class="history-shell">' +
            '<div class="history-toolbar">' +
              '<input id="historySearchInput" class="history-search" type="search" placeholder="Search recent tasks" value="' + esc(query) + '" />' +
              '<div class="history-filters">' +
                '<span class="history-filter">All tasks</span>' +
                '<span class="history-count">' + esc(String(filtered.length)) + " / " + esc(String(list.length)) + '</span>' +
              "</div>" +
            "</div>" +
            (status ? ('<div class="history-status">' + esc(status) + "</div>") : "") +
            '<div id="historyRows" class="history-list">' +
              (filtered.length
                ? filtered.map((x) => (
                    '<button class="history-row' + (String(x.id) === String(currentThreadId || "") ? " active" : "") + '" data-id="' + esc(x.id) + '" type="button">' +
                      '<span class="history-row-main">' +
                        '<span class="history-row-title">' + esc(x.title || "Untitled task") + '</span>' +
                      "</span>" +
                      '<span class="history-row-right">' +
                        '<span class="history-row-mode">' + esc(String(x.mode || "auto")) + '</span>' +
                        '<span class="history-row-age">' + esc(shortAgeLabel(x.updatedAt)) + "</span>" +
                      "</span>" +
                    "</button>"
                  )).join("")
                : '<div class="history-empty">No conversation history found.</div>') +
            "</div>" +
          "</div>";

        const searchInput = document.getElementById("historySearchInput");
        if (searchInput) {
          searchInput.addEventListener("input", (event) => {
            const target = eventTargetElement(event.target);
            historySearchQuery = String(target?.value || "");
            renderHistoryPanel(list, { query: historySearchQuery });
          });
          if (options && options.focusSearch) {
            setTimeout(() => {
              searchInput.focus();
              searchInput.select();
            }, 0);
          }
        }
        history.querySelectorAll(".history-row").forEach((el) => {
          el.onclick = () => {
            const id = el.getAttribute("data-id");
            if (!id) return;
            openSessionFromUi(id);
          };
        });
      }

      function esc(s) {
        return String(s ?? "")
          .replaceAll("&", "&amp;")
          .replaceAll("<", "&lt;")
          .replaceAll(">", "&gt;")
          .replaceAll('"', "&quot;");
      }

      async function copyTextToClipboard(text) {
        const value = String(text || "");
        if (!value) return false;
        try {
          if (navigator.clipboard && typeof navigator.clipboard.writeText === "function") {
            await navigator.clipboard.writeText(value);
            return true;
          }
        } catch {
          // fall through to legacy copy method
        }
        try {
          const ta = document.createElement("textarea");
          ta.value = value;
          ta.setAttribute("readonly", "readonly");
          ta.style.position = "fixed";
          ta.style.top = "-9999px";
          ta.style.left = "-9999px";
          document.body.appendChild(ta);
          ta.focus();
          ta.select();
          ta.setSelectionRange(0, ta.value.length);
          const ok = typeof document.execCommand === "function" ? document.execCommand("copy") : false;
          ta.remove();
          return Boolean(ok);
        } catch {
          return false;
        }
      }

      function hashPatch(text) {
        // FNV-1a 32-bit; good enough for UI dedupe.
        let h = 2166136261;
        const s = String(text || "");
        for (let i = 0; i < s.length; i += 1) {
          h ^= s.charCodeAt(i);
          h = Math.imul(h, 16777619);
        }
        return (h >>> 0).toString(16);
      }

      let activePanelId = "chat";

      function updateBackButtonVisibility() {
        if (!backToChatQuick || !msgs) return;
        const hasMessages = msgs.children.length > 0;
        const show = Boolean(threadsOverlayOpen) || hasMessages || streaming;
        backToChatQuick.classList.toggle("hidden", !show);
      }

      function updateStartupVisibility() {
        if (!chatEmpty || !msgs) return;
        const hasMessages = msgs.children.length > 0;
        const shouldHide =
          hasMessages ||
          streaming ||
          creatingThread ||
          Boolean(pendingPromptAfterThread) ||
          Boolean(currentThreadId) ||
          Boolean(activeRunThreadId);
        chatEmpty.classList.toggle("hidden", shouldHide);
        updateBackButtonVisibility();
      }

      function applyModeUI(modeValue) {
        const normalized = modeValue === "plan" || modeValue === "yolo" ? modeValue : "auto";
        currentMode = normalized;

        if (modeQuick) modeQuick.value = normalized;
        applyPlanVisualState(normalized);
        const stateLabel = activeProgressState || (streaming ? "Working..." : "Local");
        setRunState(stateLabel);
        if (sendBtn && !streaming) {
          const sendLabel = normalized === "plan" ? "Send planning request" : "Send";
          sendBtn.setAttribute("aria-label", sendLabel);
          sendBtn.title = sendLabel;
        }
        updateComposerState();
      }

      function setAttachHint(text, isError = false) {
        if (!attachHint) return;
        attachHint.textContent = text || "";
        attachHint.classList.toggle("error", Boolean(isError));
      }

      function updateAttachmentUI(statusText, isError = false) {
        const count = attachedFiles.length;
        if (uploadBtn) {
          uploadBtn.dataset.count = count > 0 ? String(count) : "";
          const label = count > 0 ? "Attach image (" + count + " selected)" : "Attach image";
          uploadBtn.setAttribute("aria-label", label);
          uploadBtn.title = count > 0 ? "Attach (" + count + ")" : "Attach";
        }
        if (uploadCount) {
          uploadCount.textContent = count === 0
            ? "No images selected."
            : (count === 1 ? "1 image selected." : count + " images selected.");
        }
        if (statusText) {
          setAttachHint(statusText, isError);
        } else if (count > 0) {
          setAttachHint(count + " image(s) ready.");
        } else {
          setAttachHint("No images attached.");
        }
      }

      function fileToDataUrl(file) {
        return new Promise((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () => resolve(String(reader.result || ""));
          reader.onerror = () => reject(new Error("Failed to read file."));
          reader.readAsDataURL(file);
        });
      }

      async function appendAttachments(files) {
        const queue = Array.from(files || []);
        if (!queue.length) return;

        const next = attachedFiles.slice();
        const errors = [];

        for (const file of queue) {
          if (!file) continue;
          if (next.length >= MAX_ATTACHMENTS) {
            errors.push("Only " + MAX_ATTACHMENTS + " images are allowed.");
            break;
          }
          if (!ALLOWED_ATTACHMENT_TYPES.has(String(file.type || "").toLowerCase())) {
            errors.push(file.name + ": only PNG/JPEG/WEBP images are supported.");
            continue;
          }
          if (Number(file.size || 0) > MAX_ATTACHMENT_BYTES) {
            errors.push(file.name + ": exceeds 4MB limit.");
            continue;
          }
          const duplicate = next.some((x) =>
            x.name === file.name &&
            x.size === file.size &&
            x.lastModified === file.lastModified
          );
          if (duplicate) continue;
          try {
            const dataUrl = await fileToDataUrl(file);
            if (!dataUrl || dataUrl.length > 8_000_000) {
              errors.push(file.name + ": could not be attached (file too large after encoding).");
              continue;
            }
            next.push({
              name: file.name,
              mimeType: String(file.type || "").toLowerCase(),
              dataUrl,
              size: Number(file.size || 0),
              lastModified: Number(file.lastModified || 0),
            });
          } catch {
            errors.push(file.name + ": failed to read.");
          }
        }

        attachedFiles = next;
        if (errors.length) {
          updateAttachmentUI(errors[0], true);
          return;
        }
        updateAttachmentUI();
      }

      function clipboardImageFiles(event) {
        const clipboard = event && event.clipboardData;
        if (!clipboard || !clipboard.items || !clipboard.items.length) return [];
        const files = [];
        const now = Date.now();
        for (let i = 0; i < clipboard.items.length; i += 1) {
          const item = clipboard.items[i];
          if (!item || item.kind !== "file") continue;
          const type = String(item.type || "").toLowerCase();
          if (!ALLOWED_ATTACHMENT_TYPES.has(type)) continue;
          const file = item.getAsFile ? item.getAsFile() : null;
          if (!file) continue;
          const ext = type === "image/png" ? "png" : type === "image/webp" ? "webp" : "jpg";
          const safeName = file.name && file.name.trim()
            ? file.name.trim()
            : ("clipboard-image-" + (now + i) + "." + ext);
          files.push(
            new File([file], safeName, {
              type,
              lastModified: Number(file.lastModified || (now + i)),
            })
          );
        }
        return files;
      }

      function createBubble(cls) {
        const d = document.createElement("div");
        d.className = "m " + cls;

        const body = document.createElement("div");
        body.className = "m-body";
        d.appendChild(body);

        const meta = document.createElement("div");
        meta.className = "m-time";
        meta.textContent = timeLabel();
        d.appendChild(meta);

        msgs.appendChild(d);
        updateStartupVisibility();
        requestChatContextMeterUpdate();
        followLatest = true;
        scrollToLatest(true);
        return d;
      }

      function canScrollElement(el) {
        if (!el || typeof window.getComputedStyle !== "function") return false;
        const style = window.getComputedStyle(el);
        const overflowY = String(style && style.overflowY ? style.overflowY : style && style.overflow ? style.overflow : "");
        return /(auto|scroll|overlay)/i.test(overflowY);
      }

      function getChatScrollContainer() {
        const seen = new Set();
        const candidates = [msgs, chatPanel];
        let parent = msgs ? msgs.parentElement : null;
        while (parent) {
          candidates.push(parent);
          if (parent === chatPanel) break;
          parent = parent.parentElement;
        }
        for (const candidate of candidates) {
          if (!candidate || seen.has(candidate)) continue;
          seen.add(candidate);
          if (canScrollElement(candidate)) return candidate;
        }
        return chatPanel || msgs || null;
      }

      function getLatestScrollAnchor() {
        if (streamBubble && streamBubble.isConnected) return streamBubble;
        if (msgs && msgs.lastElementChild) return msgs.lastElementChild;
        if (runtimeStrip && runtimeStrip.isConnected && !runtimeStrip.classList.contains("hidden")) return runtimeStrip;
        return null;
      }

      function isNearBottom(el, threshold = 80) {
        if (!el) return true;
        return el.scrollHeight - (el.scrollTop + el.clientHeight) <= threshold;
      }

      function scrollToLatest(force = false) {
        const scrollContainer = getChatScrollContainer();
        if (!scrollContainer) return;
        if (force) followLatest = true;
        const shouldFollow = force || followLatest;
        if (!shouldFollow) {
          updateJump();
          return;
        }

        scrollToLatestForcePending = scrollToLatestForcePending || force;
        if (scrollToLatestRaf) return;

        scrollToLatestRaf = requestAnimationFrame(() => {
          scrollToLatestRaf = 0;
          const liveScrollContainer = getChatScrollContainer();
          if (!liveScrollContainer) return;

          const keepFollowing = scrollToLatestForcePending || followLatest;
          scrollToLatestForcePending = false;
          if (!keepFollowing) {
            updateJump();
            return;
          }

          autoScrollLockUntil = Date.now() + 120;
          const anchor = getLatestScrollAnchor();
          if (anchor && anchor !== liveScrollContainer && typeof anchor.scrollIntoView === "function") {
            anchor.scrollIntoView({ block: "end", inline: "nearest" });
          }
          const nextTop = Math.max(0, liveScrollContainer.scrollHeight - liveScrollContainer.clientHeight);
          liveScrollContainer.scrollTop = nextTop;
          updateJump();
        });
      }

      function updateJump() {
        if (!jumpLatestBtn) return;
        const scrollContainer = getChatScrollContainer();
        const shouldShow = !isNearBottom(scrollContainer);
        jumpLatestBtn.classList.toggle("show", shouldShow);
      }

      function bindChatMutationObserver() {
        if (!chatPanel || chatMutationObserver || typeof MutationObserver !== "function") return;
        // Re-anchor after any chat DOM/text growth so streamed tokens stay in view.
        chatMutationObserver = new MutationObserver(() => {
          if (streaming || followLatest) {
            scrollToLatest(streaming);
            return;
          }
          updateJump();
        });
        chatMutationObserver.observe(chatPanel, {
          childList: true,
          subtree: true,
          characterData: true,
        });
      }

      function flushStreamBuffer(force = false) {
        if (!streamBubble) return;
        const body = streamBubble.querySelector(".m-body");
        if (streamBubble.classList.contains("typing") || streamBubble.classList.contains("stream-pending")) {
          streamBubble.classList.remove("typing");
          streamBubble.classList.remove("stream-pending");
          if (body) body.textContent = "";
        }
        if (!body) return;
        if (!streamBuffer) {
          if (streamTimer) {
            clearInterval(streamTimer);
            streamTimer = null;
          }
          if (streamEndPending) {
            finalizeStreamMessage();
          }
          return;
        }
        const chunkSize = force ? streamBuffer.length : Math.max(1, Math.min(18, Math.ceil(streamBuffer.length / 12)));
        const chunk = streamBuffer.slice(0, chunkSize);
        streamBuffer = streamBuffer.slice(chunkSize);
        body.textContent += chunk;
        requestChatContextMeterUpdate();
        if (streaming || followLatest) scrollToLatest(streaming);
        if (!streamBuffer && streamTimer) {
          clearInterval(streamTimer);
          streamTimer = null;
        }
        if (!streamBuffer && streamEndPending) {
          finalizeStreamMessage();
        }
      }

      function finalizeStreamMessage() {
        const completedBubble = streamBubble && streamBubble.isConnected ? streamBubble : null;
        if (streamBubble) {
          const body = streamBubble.querySelector(".m-body");
          if (body) body.textContent = normalizeAssistantText(body.textContent || "");
        }
        if (completedBubble) lastAssistantBubble = completedBubble;
        streamEndPending = false;
        setStreaming(false);
        streamBubble = null;
        activeRunThreadId = null;
        activeProgressState = "";
        setRunState("Local");
        requestChatContextMeterUpdate();
        pinAssistantResponseToBottom();
        stampResponseDuration(completedBubble, false);
        scrollToLatest(true);
      }

      function queueStreamText(text) {
        if (!text) return;
        streamBuffer += text;
        if (!streamBubble) {
          streamBubble = addMessage("", "a assistant-response");
        }
        if (!streamTimer) {
          streamTimer = setInterval(() => flushStreamBuffer(false), 18);
        }
        flushStreamBuffer(false);
      }

      function updatePendingStreamBubble(statusText) {
        if (!streamBubble || !streamBubble.isConnected) return;
        if (!streamBubble.classList.contains("stream-pending")) return;
        const body = streamBubble.querySelector(".m-body");
        if (!body) return;
        const next = String(statusText || "").trim();
        if (!next) return;
        body.textContent = next;
      }

      function addMessage(text, cls) {
        const d = createBubble(cls);
        const body = d.querySelector(".m-body");
        if (body) body.textContent = text;
        return d;
      }

      function pinAssistantResponseToBottom() {
        if (!msgs) return;
        const anchor =
          (streamBubble && streamBubble.isConnected)
            ? streamBubble
            : (lastAssistantBubble && lastAssistantBubble.isConnected ? lastAssistantBubble : null);
        if (!anchor || anchor.parentElement !== msgs) return;
        if (msgs.lastElementChild !== anchor) msgs.appendChild(anchor);
      }

      function ensureRunProgressBubble() {
        if (!SHOW_SYSTEM_ACTIVITY) return null;
        if (runProgressBubble && runProgressBubble.isConnected) return runProgressBubble;
        runProgressBubble = createBubble("cmd run-progress");
        return runProgressBubble;
      }

      function renderRunProgress() {
        if (!SHOW_SYSTEM_ACTIVITY) {
          if (runProgressBubble && runProgressBubble.isConnected) runProgressBubble.remove();
          runProgressBubble = null;
          return;
        }
        const bubble = ensureRunProgressBubble();
        const body = bubble.querySelector(".m-body");
        if (!body) return;
        const statusIcon = (state) =>
          state === "done" ? "[x]" : state === "running" ? "[~]" : state === "warn" ? "[!]" : "[ ]";
        const lines = [
          "Execution run",
          statusIcon(runStepState.plan) + " Plan prepared",
          statusIcon(runStepState.actions) + " Actions extracted",
          statusIcon(runStepState.execution) + " Execution running",
          statusIcon(runStepState.outcome) + " Outcome",
        ];
        if (Array.isArray(runStepState.notes) && runStepState.notes.length > 0) {
          runStepState.notes.forEach((noteLine) => {
            lines.push("Note: " + noteLine);
          });
        }
        body.textContent = lines.join("\n");
        pinAssistantResponseToBottom();
        if (streaming || followLatest) scrollToLatest(streaming);
      }

      function appendRunNotes(note) {
        const lines = String(note || "")
          .split(/\r?\n/g)
          .map((x) => x.trim())
          .filter(Boolean);
        if (lines.length === 0) return;
        const existing = new Set(runStepState.notes || []);
        for (const line of lines) {
          if (existing.has(line)) continue;
          runStepState.notes.push(line);
          existing.add(line);
        }
        if (runStepState.notes.length > 60) {
          runStepState.notes = runStepState.notes.slice(-60);
        }
      }

      function updateRunStep(step, nextState, note) {
        if (step && runStepState[step] !== undefined) runStepState[step] = nextState;
        if (typeof note === "string" && note.trim()) appendRunNotes(note);
        if (!SHOW_SYSTEM_ACTIVITY) return;
        renderRunProgress();
      }

      function appendUserAttachmentPreview(bubble, attachments) {
        if (!bubble || !Array.isArray(attachments) || attachments.length === 0) return;
        const body = bubble.querySelector(".m-body");
        if (!body) return;

        const valid = attachments
          .filter((a) => a && typeof a.dataUrl === "string" && a.dataUrl.startsWith("data:image/"))
          .slice(0, MAX_ATTACHMENTS);
        if (!valid.length) return;

        const grid = document.createElement("div");
        grid.className = "m-media-grid";
        for (const item of valid) {
          const card = document.createElement("div");
          card.className = "m-media-card";

          const img = document.createElement("img");
          img.src = item.dataUrl;
          img.alt = item.name ? "Attached image: " + item.name : "Attached image";
          img.loading = "lazy";
          card.appendChild(img);

          const name = document.createElement("span");
          name.className = "m-media-name";
          name.textContent = item.name || "image";
          card.appendChild(name);

          grid.appendChild(card);
        }
        body.appendChild(grid);
      }

      function clearPlanDecisionCard() {
        if (planDecisionBubble && planDecisionBubble.isConnected) {
          planDecisionBubble.remove();
        }
        planDecisionBubble = null;
      }

      function showPlanDecisionCard() {
        if (currentMode !== "plan" || streaming) return;
        clearPlanDecisionCard();
        const d = createBubble("a plan-decision");
        const body = d.querySelector(".m-body");
        if (!body) return;
        body.innerHTML =
          '<div class="plan-card">' +
            '<div class="plan-card-title">IMPLEMENT THIS PLAN?</div>' +
            '<button class="plan-choice" type="button" data-plan-choice="yes">YES, PLEASE IMPLEMENT</button>' +
            '<button class="plan-choice" type="button" data-plan-choice="no">NO, I NEED MAKE SOME CHANGES</button>' +
          "</div>";

        const yesBtn = body.querySelector('[data-plan-choice="yes"]');
        const noBtn = body.querySelector('[data-plan-choice="no"]');
        if (yesBtn) {
          yesBtn.addEventListener("click", () => {
            if (streaming) return;
            clearPlanDecisionCard();
            if (input) input.value = "Please implement the plan you just provided exactly, end-to-end.";
            v.postMessage({ type: "planDecision", decision: "yes", source: "postPlanCard" });
            sendCurrent();
          });
        }
        if (noBtn) {
          noBtn.addEventListener("click", () => {
            clearPlanDecisionCard();
            if (input) {
              input.value = "I need changes to this plan. Here are the updates I want:";
              input.focus();
              const len = input.value.length;
              input.setSelectionRange(len, len);
            }
            v.postMessage({ type: "planDecision", decision: "no", source: "postPlanCard" });
          });
        }
        planDecisionBubble = d;
        pinAssistantResponseToBottom();
      }

      function extractGuardrailIssues(debug, summaryText) {
        const issues = [];
        const seen = new Set();
        const addIssue = (value) => {
          const text = String(value || "").trim();
          if (!text) return;
          if (seen.has(text)) return;
          seen.add(text);
          issues.push(text);
        };
        const normalizeGuardrailText = (line) => String(line || "").replace(/^guardrail\s*/i, "").trim();
        const guardrailPattern =
          /(wrapped tool payload|leaked diff\/apply_patch|missing\/invalid target path|missing patch\/diff|unsupported action type|blocked (edit|write_file|mkdir|command) action|guardrail)/i;

        if (debug && typeof debug === "object") {
          const rejectedSamples = Array.isArray(debug.rejectedSamples) ? debug.rejectedSamples : [];
          const localRejectedSamples = Array.isArray(debug.localRejectedSamples) ? debug.localRejectedSamples : [];
          const applyErrors = Array.isArray(debug.applyErrors) ? debug.applyErrors : [];
          rejectedSamples.forEach((line) => {
            const raw = String(line || "").trim();
            if (!raw) return;
            if (/^guardrail\b/i.test(raw) || guardrailPattern.test(raw)) {
              addIssue(normalizeGuardrailText(raw));
            }
          });
          localRejectedSamples.forEach((line) => {
            const raw = String(line || "").trim();
            if (!raw || !guardrailPattern.test(raw)) return;
            addIssue(normalizeGuardrailText(raw));
          });
          applyErrors.forEach((line) => {
            const raw = String(line || "").trim();
            if (!raw || !guardrailPattern.test(raw)) return;
            addIssue(normalizeGuardrailText(raw));
          });
        }

        if (issues.length === 0 && /guardrails?\s+blocked/i.test(String(summaryText || ""))) {
          addIssue(String(summaryText || "").trim());
        }
        return issues;
      }

      function showGuardrailCard(issues, summaryText, debug) {
        const list = Array.isArray(issues) ? issues.filter(Boolean) : [];
        if (!list.length) return;
        const d = createBubble("a guardrail");
        const body = d.querySelector(".m-body");
        if (!body) return;
        const requested = Number(debug && debug.requestedActions ? debug.requestedActions : 0);
        const rejected = Number(debug && debug.rejectedActions ? debug.rejectedActions : list.length);
        const normalizedRejected = Math.max(rejected, list.length);
        const heading = "Guardrail report";
        const subtitle = /guardrails?\s+blocked/i.test(String(summaryText || ""))
          ? String(summaryText || "")
          : "Blocked malformed AI actions before applying file changes.";
        const rows = list.slice(0, 8).map((line) => "<li>" + esc(line) + "</li>").join("");
        const overflow = list.length > 8
          ? '<li class="guardrail-more">+' + esc(String(list.length - 8)) + " more blocked item(s)</li>"
          : "";
        body.innerHTML =
          '<div class="guardrail-card">' +
            '<div class="guardrail-title">' + esc(heading) + "</div>" +
            '<div class="guardrail-sub">' + esc(subtitle) + "</div>" +
            '<ul class="guardrail-list">' + rows + overflow + "</ul>" +
            '<div class="guardrail-actions">' +
              '<div class="guardrail-meta">requested=' + esc(String(requested)) + " | rejected=" + esc(String(normalizedRejected)) + "</div>" +
              '<button class="guardrail-copy" type="button" data-guardrail-copy="1">Copy debug</button>' +
            "</div>" +
          "</div>";
        const copyBtn = body.querySelector('[data-guardrail-copy="1"]');
        if (copyBtn) {
          copyBtn.addEventListener("click", async () => {
            const originalLabel = copyBtn.textContent || "Copy debug";
            const text = [
              heading,
              subtitle,
              "requested=" + requested + " | rejected=" + normalizedRejected,
              "",
              ...list.map((line, idx) => (idx + 1) + ". " + line),
            ].join("\n");
            const ok = await copyTextToClipboard(text);
            copyBtn.textContent = ok ? "Copied" : "Copy failed";
            setTimeout(() => {
              if (copyBtn && copyBtn.isConnected) copyBtn.textContent = originalLabel;
            }, 1400);
          });
        }
        pinAssistantResponseToBottom();
      }

      function diagnosticsFingerprint(data) {
        const payload = data && typeof data === "object" ? data : {};
        const traceId = String(payload.traceId || "");
        const stage = String(payload.stage || "");
        const summary = String(payload.summary || "");
        const toolSummary = summarizeToolStateForUi(payload.toolState || {});
        const events = Array.isArray(payload.events) ? payload.events : [];
        const tail = events.length ? String(events[events.length - 1]?.message || "") : "";
        return [traceId, stage, summary, toolSummary, String(events.length), tail].join("|");
      }

      function showDiagnosticsBundleCard(data) {
        const payload = data && typeof data === "object" ? data : {};
        const events = Array.isArray(payload.events) ? payload.events : [];
        const summary = String(payload.summary || "Run diagnostics");
        const traceId = String(payload.traceId || "n/a");
        const stage = String(payload.stage || "final");
        const toolSummary = summarizeToolStateForUi(payload.toolState || {});
        const startedAt = Number(payload.startedAt || 0);
        const endedAt = Number(payload.endedAt || 0);
        const fingerprint = diagnosticsFingerprint(payload);
        if (fingerprint && fingerprint === lastDiagnosticsFingerprint) return;
        lastDiagnosticsFingerprint = fingerprint;

        const d = createBubble("a diagnostics");
        const body = d.querySelector(".m-body");
        if (!body) return;
        const eventRows = events.slice(-12).map((entry) => {
          const severity = String(entry && entry.severity ? entry.severity : "warn").toLowerCase();
          const sevClass = severity === "error" ? "error" : severity === "info" ? "info" : "warn";
          const code = String(entry && entry.code ? entry.code : "issue");
          const message = String(entry && entry.message ? entry.message : "");
          const ts = Number(entry && entry.ts ? entry.ts : 0);
          const timeLabel = ts > 0 ? new Date(ts).toLocaleTimeString() : "";
          return (
            '<li class="diag-item ' + sevClass + '">' +
              '<span class="diag-code">' + esc(code) + "</span>" +
              '<span class="diag-msg">' + esc(message) + "</span>" +
              '<span class="diag-ts">' + esc(timeLabel) + "</span>" +
            "</li>"
          );
        }).join("");
        const startedLabel = startedAt > 0 ? new Date(startedAt).toLocaleTimeString() : "n/a";
        const endedLabel = endedAt > 0 ? new Date(endedAt).toLocaleTimeString() : "n/a";
        body.innerHTML =
          '<div class="diag-card">' +
            '<div class="diag-title">Diagnostics bundle</div>' +
            '<div class="diag-sub">' + esc(summary) + "</div>" +
            '<div class="diag-trace">trace: ' + esc(traceId) + " | stage: " + esc(stage) + "</div>" +
            (toolSummary ? '<div class="diag-meta">tool: ' + esc(toolSummary) + "</div>" : "") +
            '<ul class="diag-list">' + (eventRows || '<li class="diag-item info"><span class="diag-msg">No event details provided.</span></li>') + "</ul>" +
            '<div class="diag-actions">' +
              '<div class="diag-meta">start=' + esc(startedLabel) + " | end=" + esc(endedLabel) + " | events=" + esc(String(events.length)) + "</div>" +
              '<button class="guardrail-copy" type="button" data-diag-copy="1">Copy debug</button>' +
            "</div>" +
          "</div>";
        const copyBtn = body.querySelector('[data-diag-copy="1"]');
        if (copyBtn) {
          copyBtn.addEventListener("click", async () => {
            const originalLabel = copyBtn.textContent || "Copy debug";
            const text = [
              "Diagnostics bundle",
              summary,
              "trace=" + traceId,
              "stage=" + stage,
              toolSummary ? "tool=" + toolSummary : "",
              "start=" + startedLabel,
              "end=" + endedLabel,
              "",
              ...events.map((entry, idx) => {
                const severity = String(entry && entry.severity ? entry.severity : "warn").toUpperCase();
                const code = String(entry && entry.code ? entry.code : "issue");
                const message = String(entry && entry.message ? entry.message : "");
                return (idx + 1) + ". [" + severity + "] " + code + " - " + message;
              }),
            ].join("\n");
            const ok = await copyTextToClipboard(text);
            copyBtn.textContent = ok ? "Copied" : "Copy failed";
            setTimeout(() => {
              if (copyBtn && copyBtn.isConnected) copyBtn.textContent = originalLabel;
            }, 1400);
          });
        }
        pinAssistantResponseToBottom();
      }

      function addTypingBubble() {
        const d = createBubble("a typing");
        const body = d.querySelector(".m-body");
        if (body) body.innerHTML = '<span class="typing-dots"><i></i><i></i><i></i></span>';
        return d;
      }

      function updateReasoningCard() {
        // Reasoning UI disabled.
        if (reasoningBubble && reasoningBubble.isConnected) reasoningBubble.remove();
        reasoningBubble = null;
        return;
        const reasoningText = String(liveReasoningText || "").trim();
        const allowMetaSignals = SHOW_SYSTEM_ACTIVITY;
        if (!allowMetaSignals && !reasoningText) {
          if (reasoningBubble && reasoningBubble.isConnected) reasoningBubble.remove();
          reasoningBubble = null;
          return;
        }
        const meta = latestRunMeta && typeof latestRunMeta === "object" ? latestRunMeta : {};
        const reasonCodes = Array.isArray(latestReasonCodes)
          ? latestReasonCodes.filter((x) => typeof x === "string" && x.trim())
          : [];
        const lines = [];

        if (allowMetaSignals && reasonCodes.length) lines.push("Signals: " + reasonCodes.join(", "));

        if (allowMetaSignals && meta.decision) {
          lines.push("Decision mode: " + String(meta.decision));
        } else if (allowMetaSignals && meta.autonomyDecision?.mode) {
          lines.push("Decision mode: " + String(meta.autonomyDecision.mode));
        }

        if (allowMetaSignals && typeof meta.confidence === "number" && Number.isFinite(meta.confidence)) {
          lines.push("Confidence: " + Math.round(meta.confidence * 100) + "%");
        }

        if (allowMetaSignals && meta.autonomyDecision?.rationale) {
          lines.push("Rationale: " + String(meta.autonomyDecision.rationale));
        }

        if (allowMetaSignals && meta.validationPlan?.reason) {
          lines.push("Validation: " + String(meta.validationPlan.reason));
        }

        if (allowMetaSignals && meta.actionability?.reason) {
          lines.push("Actionability: " + String(meta.actionability.reason));
        }

        const checks = allowMetaSignals && Array.isArray(meta.validationPlan?.checks)
          ? meta.validationPlan.checks.filter((x) => typeof x === "string" && x.trim())
          : [];
        if (checks.length) lines.push("Checks: " + checks.slice(0, 5).join(", "));

        if (!reasoningText && !lines.length) {
          if (reasoningBubble && reasoningBubble.isConnected) reasoningBubble.remove();
          reasoningBubble = null;
          return;
        }

        if (!reasoningBubble || !reasoningBubble.isConnected) {
          reasoningBubble = createBubble("a reasoning");
        }
        const body = reasoningBubble.querySelector(".m-body");
        if (!body) return;
        const hadDetails = Boolean(body.querySelector("details"));
        const open = body.querySelector("details")?.open ?? false;
        body.innerHTML = "";
        const details = document.createElement("details");
        details.className = "reasoning-disclosure";
        details.open = hadDetails ? open : true;

        const summary = document.createElement("summary");
        summary.innerHTML =
          '<span class="reasoning-summary-title">Reasoning (if provided)</span>' +
          (streaming ? '<span class="reasoning-live"><i></i>Live</span>' : "");
        details.appendChild(summary);

        if (reasoningText) {
          const pre = document.createElement("pre");
          pre.textContent = reasoningText;
          pre.style.margin = "10px 0 0";
          pre.style.padding = "10px";
          pre.style.whiteSpace = "pre-wrap";
          pre.style.overflowWrap = "anywhere";
          pre.style.borderRadius = "10px";
          pre.style.border = "1px solid rgba(120,120,120,0.2)";
          pre.style.background = "rgba(120,120,120,0.08)";
          details.appendChild(pre);
        }

        if (lines.length) {
          const list = document.createElement("ul");
          list.className = "reasoning-list";
          lines.forEach((line) => {
            const li = document.createElement("li");
            li.textContent = line;
            list.appendChild(li);
          });
          details.appendChild(list);
        }
        body.appendChild(details);
        pinAssistantResponseToBottom();
        scrollToLatest(true);
      }

      function ensureTerminalBubble() {
        if (!SHOW_SYSTEM_ACTIVITY) return null;
        if (terminalBubble && terminalBubble.isConnected) return terminalBubble;
        terminalBubble = createBubble("cmd terminal-live");
        const body = terminalBubble.querySelector(".m-body");
        if (body) {
          body.innerHTML =
            '<details class="term-disclosure">' +
              '<summary class="term-head">' +
                '<span class="term-title">Terminal</span>' +
                '<span class="term-state" data-term-state>Idle</span>' +
              "</summary>" +
              '<div class="term-body" data-term-body></div>' +
            "</details>";
        }
        return terminalBubble;
      }

      function setTerminalState(label) {
        if (!SHOW_SYSTEM_ACTIVITY) return;
        const b = ensureTerminalBubble();
        const state = b.querySelector("[data-term-state]");
        if (state) state.textContent = label;
        if (label === "Running") {
          const disclosure = b.querySelector(".term-disclosure");
          if (disclosure) disclosure.open = true;
        }
      }

      function addTerminalLine(text, kind = "info") {
        if (!SHOW_SYSTEM_ACTIVITY) return;
        const b = ensureTerminalBubble();
        const body = b.querySelector("[data-term-body]");
        if (!body) return;
        const row = document.createElement("div");
        row.className = "term-line " + kind;
        const rawText = String(text || "");

        if (kind === "cmdline") {
          row.classList.add("card");
          const card = document.createElement("div");
          card.className = "term-cmd-card";

          const badge = document.createElement("span");
          badge.className = "term-badge cmd";
          badge.textContent = "CMD";
          card.appendChild(badge);

          const code = document.createElement("code");
          code.className = "term-cmd-text";
          code.textContent = rawText.replace(/^\$\s*/, "");
          card.appendChild(code);

          row.appendChild(card);
        } else if (kind === "ok" || kind === "err") {
          const m = /^(OK|ERR)\s+(.+?)\s+\(exit\s+(-?\d+|\?)\)$/i.exec(rawText.trim());
          row.classList.add("card");
          const card = document.createElement("div");
          card.className = "term-result-card " + (kind === "ok" ? "ok" : "err");

          const badge = document.createElement("span");
          badge.className = "term-badge " + (kind === "ok" ? "ok" : "err");
          badge.textContent = kind === "ok" ? "PASS" : "FAIL";
          card.appendChild(badge);

          const cmd = document.createElement("code");
          cmd.className = "term-result-text";
          cmd.textContent = m ? m[2] : rawText;
          card.appendChild(cmd);

          if (m) {
            const exit = document.createElement("span");
            exit.className = "term-exit-pill";
            exit.textContent = "exit " + m[3];
            card.appendChild(exit);
          }
          row.appendChild(card);
        } else if (kind === "summary") {
          const summary = document.createElement("div");
          summary.className = "term-summary";
          summary.textContent = rawText;
          row.appendChild(summary);
        } else {
          row.textContent = rawText;
        }
        body.appendChild(row);
        pinAssistantResponseToBottom();
        if (streaming || followLatest) scrollToLatest(streaming);
      }

      function parseExecCommandResult(message) {
        const m = /^([A-Z]+)\s+command\s+(.+?)\s+\[exit\s+(-?\d+|\?)\](?:\s+\((.+)\))?$/i.exec(String(message || "").trim());
        if (!m) return null;
        return { status: String(m[1] || "").toUpperCase(), command: m[2] || "", exit: m[3] || "?", reason: m[4] || "" };
      }

      function extractJsonCandidate(text) {
        const trimmed = String(text || "").trim();
        if (!trimmed) return null;
        if (trimmed.startsWith("{") && trimmed.endsWith("}")) return trimmed;
        const fenced = trimmed.match(/```json\s*([\s\S]*?)```/i) || trimmed.match(/```\s*([\s\S]*?)```/i);
        if (fenced && fenced[1]) {
          const block = String(fenced[1]).trim();
          if (block.startsWith("{") && block.endsWith("}")) return block;
        }
        const start = trimmed.indexOf("{");
        const end = trimmed.lastIndexOf("}");
        if (start >= 0 && end > start) return trimmed.slice(start, end + 1);
        return null;
      }

      function parseFinalFromJson(candidate) {
        try {
          const parsed = JSON.parse(candidate);
          if (parsed && typeof parsed.final === "string" && parsed.final.trim()) return parsed.final.trim();
        } catch {
          // ignore
        }
        return null;
      }

      function rewriteLegacyAutoApplyText(input, outcome) {
        let text = String(input ?? "");
        if (!text) return "";
        const neutral =
          "Next action: auto-apply was requested. Confirm what was actually applied in the Execution panel.";
        const noEdits =
          "Next action: no file edits were applied automatically. Open the Execution panel for exact reject reasons.";
        text = text.replace(
          /Next action:\s*changes were auto-applied\.?\s*Review execution details in the Execution panel\.?/gi,
          neutral
        );
        text = text.replace(
          /changes were auto-applied\.?\s*Review execution details in the Execution panel\.?/gi,
          neutral
        );
        const filesChanged = Number(outcome && typeof outcome === "object" ? outcome.filesChanged : NaN);
        if (!Number.isNaN(filesChanged) && filesChanged === 0) {
          text = text.replace(
            /I prepared the requested update in ([^\n.]+)\.?/gi,
            "I drafted a proposed update for $1, but no file edits were applied."
          );
          text = text.replace(
            /I drafted a proposed update for ([^\n.]+)\.?/gi,
            "I drafted a proposed update for $1, but no file edits were applied."
          );
          text = text.replace(
            /Next action:\s*auto-apply was requested\.?\s*Confirm what was actually applied in the Execution panel\.?/gi,
            noEdits
          );
        }
        return text;
      }

      function recheckAssistantTextForOutcome(outcome) {
        if (!msgs || !outcome || typeof outcome !== "object") return;
        const bodies = msgs.querySelectorAll(".m.assistant-response .m-body");
        if (!bodies || !bodies.length) return;
        bodies.forEach((node) => {
          if (!node) return;
          const text = String(node.textContent || "");
          if (!text) return;
          const normalized = normalizeAssistantText(text, outcome);
          if (normalized && normalized !== text) node.textContent = normalized;
        });
      }

      function normalizeAssistantText(raw, outcomeOverride) {
        const text = String(raw ?? "").trim();
        if (!text) return "";
        const outcome = outcomeOverride && typeof outcomeOverride === "object" ? outcomeOverride : latestActionOutcome;

        const candidate = extractJsonCandidate(text);
        if (candidate) {
          const parsed = parseFinalFromJson(candidate);
          if (parsed) return rewriteLegacyAutoApplyText(parsed, outcome).trim();
          if (candidate.includes('\\"')) {
            const deEscaped = candidate.replace(/\\"/g, '"');
            const reparsed = parseFinalFromJson(deEscaped);
            if (reparsed) return rewriteLegacyAutoApplyText(reparsed, outcome).trim();
          }
        }

        const normalized = text.includes('\\"final\\"') ? text.replace(/\\"/g, '"') : text;
        const m = normalized.match(/"final"\s*:\s*"([\s\S]*?)"/i);
        if (m && m[1]) {
          return rewriteLegacyAutoApplyText(
            m[1]
            .replace(/\\n/g, "\n")
            .replace(/\\"/g, '"')
            .replace(/\\\\/g, "\\")
            .trim(),
            outcome
          ).trim();
        }
        return rewriteLegacyAutoApplyText(text, outcome).trim();
      }

      function isOmittedPlaceholder(line) {
        const trimmed = String(line || "").trim();
        if (!trimmed) return false;
        if (/omitted\s+for\s+brevity/i.test(trimmed)) return true;
        return /^(\/*|#|;)?\s*\.\.\.\s*\[?omitted\s+for\s+brevity\]?\s*\.\.\.\s*$/i.test(trimmed);
      }

      function parseDiffStats(patchText) {
        const lines = String(patchText || "").replace(/\r\n/g, "\n").split("\n");
        let adds = 0;
        let dels = 0;
        for (const line of lines) {
          if (line.startsWith("+++ ") || line.startsWith("--- ")) continue;
          if (line.startsWith("+")) adds += 1;
          else if (line.startsWith("-")) dels += 1;
        }
        return { adds, dels };
      }

      function detectDiffLanguage(path) {
        const raw = String(path || "").toLowerCase();
        const normalized = raw.replaceAll("\\", "/");
        const file = normalized.split("/").pop() || normalized;
        if (file === "dockerfile") return "docker";
        if (file.endsWith(".d.ts")) return "ts";
        const ext = file.includes(".") ? file.split(".").pop() || "" : "";
        if (["ts", "tsx"].includes(ext)) return "ts";
        if (["js", "jsx", "mjs", "cjs"].includes(ext)) return "js";
        if (["json", "jsonc"].includes(ext)) return "json";
        if (["yml", "yaml"].includes(ext)) return "yaml";
        if (["md", "mdx"].includes(ext)) return "md";
        if (["py"].includes(ext)) return "py";
        if (["go"].includes(ext)) return "go";
        if (["rs"].includes(ext)) return "rust";
        if (["java"].includes(ext)) return "java";
        if (["cs"].includes(ext)) return "cs";
        if (["cpp", "cc", "cxx", "c", "h", "hpp"].includes(ext)) return "cpp";
        if (["html", "htm", "xml"].includes(ext)) return "html";
        if (["css", "scss", "sass"].includes(ext)) return "css";
        if (["sh", "bash", "zsh"].includes(ext)) return "shell";
        if (["sql"].includes(ext)) return "sql";
        if (["toml"].includes(ext)) return "toml";
        return "plain";
      }

      function buildKeywordRegex(words) {
        if (!words || words.length === 0) return null;
        return new RegExp("\\b(" + words.join("|") + ")\\b", "g");
      }

      function collectRanges(ranges, regex, type, text) {
        if (!regex) return;
        regex.lastIndex = 0;
        let m;
        while ((m = regex.exec(text)) !== null) {
          const start = m.index;
          const end = start + m[0].length;
          let overlaps = false;
          for (const r of ranges) {
            if (start < r.end && end > r.start) {
              overlaps = true;
              break;
            }
          }
          if (!overlaps) ranges.push({ start, end, type });
        }
      }

      function highlightDiffLine(raw, lang) {
        const text = String(raw || "");
        if (!text) return "";
        const ranges = [];
        const langId = String(lang || "plain");
        const jsKeywords = [
          "const","let","var","function","return","if","else","for","while","switch","case","break","continue","class","extends","new","try","catch","finally","throw","import","export","from","async","await","type","interface","enum","public","private","protected","readonly","static","get","set","yield","of","in","as","implements","namespace","declare","abstract","override","default"
        ];
        const pyKeywords = [
          "def","return","if","elif","else","for","while","try","except","finally","raise","class","import","from","as","with","pass","break","continue","lambda","yield","global","nonlocal","assert","True","False","None","async","await"
        ];
        const goKeywords = [
          "func","return","if","else","for","switch","case","break","continue","type","struct","interface","map","chan","go","defer","range","package","import","var","const","select","default"
        ];
        const rustKeywords = [
          "fn","let","mut","if","else","match","impl","trait","pub","use","mod","struct","enum","return","async","await","loop","while","for","in","where","crate","super","self","Self","move"
        ];
        const commonKeywords = [
          "true","false","null","undefined"
        ];

        const isJs = langId === "js" || langId === "ts";
        const isPy = langId === "py";
        const isGo = langId === "go";
        const isRust = langId === "rust";
        const isCpp = langId === "cpp" || langId === "java" || langId === "cs";
        const isJson = langId === "json";
        const isYaml = langId === "yaml";
        const isHtml = langId === "html";
        const isCss = langId === "css";
        const isShell = langId === "shell";
        const isSql = langId === "sql";

        if (isJson) {
          collectRanges(ranges, /"(?:[^"\\]|\\.)*"\s*(?=:)/g, "key", text);
        }
        if (isYaml) {
          collectRanges(ranges, /^\s*[^:#]+(?=\s*:)/g, "key", text);
        }
        if (isCss) {
          collectRanges(ranges, /[a-z-]+(?=\s*:)/gi, "prop", text);
        }

        const stringRegex = /`([^`\\]|\\.)*`|"([^"\\]|\\.)*"|'([^'\\]|\\.)*'/g;
        collectRanges(ranges, stringRegex, "string", text);

        if (isJs || isCpp || isGo || isRust || isSql) {
          collectRanges(ranges, /\/\/.*$/g, "comment", text);
          collectRanges(ranges, /\/\*.*\*\//g, "comment", text);
        }
        if (isPy || isYaml || isShell) {
          collectRanges(ranges, /#.*$/g, "comment", text);
        }
        if (isSql) {
          collectRanges(ranges, /--.*$/g, "comment", text);
        }

        collectRanges(ranges, /\b0x[a-fA-F0-9]+\b|\b\d+(\.\d+)?\b/g, "number", text);

        if (isJson) {
          collectRanges(ranges, /\b(true|false|null)\b/g, "boolean", text);
        } else if (isPy) {
          collectRanges(ranges, /\b(True|False|None)\b/g, "boolean", text);
        } else {
          collectRanges(ranges, buildKeywordRegex(commonKeywords), "boolean", text);
        }

        if (isJs) collectRanges(ranges, buildKeywordRegex(jsKeywords), "keyword", text);
        if (isPy) collectRanges(ranges, buildKeywordRegex(pyKeywords), "keyword", text);
        if (isGo) collectRanges(ranges, buildKeywordRegex(goKeywords), "keyword", text);
        if (isRust) collectRanges(ranges, buildKeywordRegex(rustKeywords), "keyword", text);
        if (isCpp) collectRanges(ranges, buildKeywordRegex(["class","struct","enum","return","if","else","for","while","switch","case","break","continue","try","catch","throw","public","private","protected","static","const","void","int","float","double","bool","namespace","using","new","delete","this","override","virtual","template","typename"]), "keyword", text);
        if (isSql) collectRanges(ranges, buildKeywordRegex(["select","from","where","join","left","right","inner","outer","on","and","or","insert","into","values","update","set","delete","create","table","alter","drop","group","by","order","limit","offset"]), "keyword", text);

        if (isJs || isGo || isRust || isCpp || isPy) {
          collectRanges(ranges, /\b[A-Z][A-Za-z0-9_]*\b/g, "type", text);
          collectRanges(ranges, /\b[A-Za-z_][A-Za-z0-9_]*\b(?=\s*\()/g, "func", text);
        }
        if (isHtml) {
          collectRanges(ranges, /<\/?[a-zA-Z][\w:-]*/g, "tag", text);
          collectRanges(ranges, /\b[a-zA-Z-:]+(?==)/g, "attr", text);
        }

        ranges.sort((a, b) => a.start - b.start);
        let out = "";
        let idx = 0;
        for (const r of ranges) {
          if (r.start < idx) continue;
          out += esc(text.slice(idx, r.start));
          out += '<span class="tok-' + r.type + '">' + esc(text.slice(r.start, r.end)) + "</span>";
          idx = r.end;
        }
        out += esc(text.slice(idx));
        return out;
      }

      function renderUnifiedDiffRows(patchText, opts) {
        const options = opts || {};
        const maxRows = Number.isFinite(options.maxRows) ? Math.max(10, options.maxRows) : MAX_DIFF_ROWS;
        const lang = options.lang || "plain";
        const lines = String(patchText || "").replace(/\r\n/g, "\n").split("\n");

        let i = 0;
        while (i < lines.length && !String(lines[i] || "").startsWith("@@")) i += 1;
        if (i >= lines.length) i = 0;

        let oldLine = 0;
        let newLine = 0;
        let rendered = 0;
        let truncated = false;
        const out = [];

        const row = (kind, oldNo, newNo, sig, text, langId) => (
          '<div class="diff-row ' + kind + '">' +
            '<div class="ln old">' + esc(oldNo ? String(oldNo) : "") + "</div>" +
            '<div class="ln new">' + esc(newNo ? String(newNo) : "") + "</div>" +
            '<div class="sig">' + esc(sig || "") + "</div>" +
            '<div class="txt">' + (langId ? highlightDiffLine(text, langId) : esc(text || "")) + "</div>" +
          "</div>"
        );

        for (; i < lines.length; i += 1) {
          if (rendered >= maxRows) {
            truncated = true;
            break;
          }

          const raw = String(lines[i] || "");
          if (!raw || isOmittedPlaceholder(raw)) continue;

          if (raw.startsWith("@@")) {
            const m = /^@@\s+-([0-9]+)(?:,([0-9]+))?\s+\+([0-9]+)(?:,([0-9]+))?\s+@@/.exec(raw);
            if (m) {
              oldLine = Number(m[1] || "0");
              newLine = Number(m[3] || "0");
            }
            out.push(row("meta", "", "", "", raw));
            rendered += 1;
            continue;
          }

          if (raw.startsWith("+") && !raw.startsWith("+++")) {
            out.push(row("add", "", newLine, "+", raw.slice(1), lang));
            newLine += 1;
            rendered += 1;
            continue;
          }

          if (raw.startsWith("-") && !raw.startsWith("---")) {
            out.push(row("del", oldLine, "", "-", raw.slice(1), lang));
            oldLine += 1;
            rendered += 1;
            continue;
          }

          if (raw.startsWith(" ")) {
            out.push(row("ctx", oldLine, newLine, " ", raw.slice(1), lang));
            oldLine += 1;
            newLine += 1;
            rendered += 1;
            continue;
          }

          if (raw.startsWith("\\ No newline at end of file")) {
            out.push(row("meta", "", "", "", raw));
            rendered += 1;
            continue;
          }
        }

        if (out.length === 0) {
          const fallback = lines
            .filter((x) => String(x || "").length > 0 && !isOmittedPlaceholder(x))
            .slice(0, maxRows);
          for (const line of fallback) {
            out.push(row("meta", "", "", "", String(line || "")));
          }
          truncated = lines.length > fallback.length;
        }

        return { html: out.join(""), truncated, maxRows };
      }

      function addEditPreview(path, patch) {
        const key = String(path || "unknown") + ":" + hashPatch(patch || "");
        if (seenEditPreviewKeys.has(key)) return null;
        seenEditPreviewKeys.add(key);

        const d = createBubble("a change");
        const body = d.querySelector(".m-body");
        if (!body) return d;

        const parsed = parseDiffStats(patch);
        const lang = detectDiffLanguage(path);
        const rendered = renderUnifiedDiffRows(patch || "", { maxRows: MAX_DIFF_ROWS, lang });
        const hasRenderableChanges = parsed.adds > 0 || parsed.dels > 0;
        body.innerHTML =
          '<details class="diff-disclosure" open>' +
            '<summary class="diff-summary">' +
              '<span class="diff-summary-title">Edited file</span>' +
              '<span class="diff-stats"><span class="add">+' + esc(parsed.adds) + '</span> <span class="del">-' + esc(parsed.dels) + "</span></span>" +
            "</summary>" +
            '<div class="diff-card" data-lang="' + esc(lang) + '">' +
              '<div class="diff-head">' +
                '<div class="diff-title"><span class="diff-path">' + esc(path || "unknown") + "</span></div>" +
                '<div class="diff-stats"><span class="add">+' + esc(parsed.adds) + '</span> <span class="del">-' + esc(parsed.dels) + "</span></div>" +
              "</div>" +
              (
                hasRenderableChanges
                  ? '<div class="diff-body">' + rendered.html + "</div>"
                  : '<div class="diff-trunc">No line-level diff content was available for this preview.</div>'
              ) +
              (rendered.truncated ? '<div class="diff-trunc">Truncated (showing first ' + esc(rendered.maxRows) + " lines)</div>" : "") +
            "</div>" +
          "</details>";
        pinAssistantResponseToBottom();
        return d;
      }

      const STAGE_PANEL_IDS = new Set([
        "chat",
        "stageBlank",
        "stageThreads",
        "timeline",
        "history",
        "index",
        "agents",
        "exec",
      ]);

      function showTab(p) {
        const raw = String(p || "");
        const id = raw;
        if (!STAGE_PANEL_IDS.has(id)) return;
        if (id !== "stageBlank" && actionMenu && actionMenu.classList.contains("page-mode")) {
          closeSettingsPage(false);
        }
        document.querySelectorAll(".stage-shell .panel").forEach((t) => t.classList.remove("active"));
        const panel = document.getElementById(id);
        if (panel) panel.classList.add("active");
        document.querySelectorAll(".tabs .tab").forEach((tabBtn) => {
          const tabTarget = String(tabBtn.dataset.p || "");
          tabBtn.classList.toggle("active", tabTarget === id);
        });
        activePanelId = id;
        if (threadsOverlayOpen) {
          setThreadsOverlayOpen(false);
        }
        updateBackButtonVisibility();
      }

      function setThreadsOverlayOpen(open) {
        threadsOverlayOpen = open;
        if (app) app.classList.toggle("threads-overlay-open", open);
        if (threadsOverlayBackdrop) threadsOverlayBackdrop.classList.toggle("show", open);
        if (threadsOverlayBackdrop) threadsOverlayBackdrop.setAttribute("aria-hidden", open ? "false" : "true");
        if (closeThreadsPopupBtn) closeThreadsPopupBtn.classList.toggle("hidden", !open);
        updateBackButtonVisibility();
      }

      function openChatsPopup(sourceLabel) {
        if (threadsOverlayOpen) setThreadsOverlayOpen(false);
        showTab("stageThreads");
        setRunState(sourceLabel || "Loading tasks...");
        v.postMessage({ type: "history" });
      }

      function showHistoryPanel(loadingText) {
        showTab("history");
        renderHistoryPanel(recentHistory, { status: loadingText || "" });
      }

      function openHistoryPanel(sourceLabel) {
        showHistoryPanel("Loading chat history...");
        setRunState(sourceLabel || "Loading history...");
        v.postMessage({ type: "history" });
      }

      function showIndexPanel(loadingText) {
        showTab("index");
        if (index && loadingText) {
          index.innerHTML =
            '<div class="item"><div class="item-title">Index Status</div><div class="item-sub">' + esc(loadingText) + '</div></div>' +
            '<div class="item"><div class="item-title">Chunks</div><div class="item-sub">Scanning workspace files...</div></div>' +
            '<div class="item"><div class="item-title">Freshness</div><div class="item-sub">Rebuilding now</div></div>' +
            '<div class="item"><div class="item-title">Search Utility</div><div class="item-sub">Use this to improve context retrieval for later prompts.</div></div>';
        }
      }

      function triggerReplayFromUI(sourceLabel) {
        if (SHOW_SYSTEM_ACTIVITY) addMessage("Replaying latest session from " + sourceLabel + "...", "cmd");
        v.postMessage({ type: "replay" });
      }

      function setActionMenuOpen(open) {
        if (!actionMenu) return;
        if (!open && actionMenu.classList.contains("page-mode")) {
          closeSettingsPage(false);
          return;
        }
        actionMenu.classList.toggle("hidden", !open);
        actionMenu.setAttribute("aria-hidden", open ? "false" : "true");
        if (actionMenuBtn) actionMenuBtn.setAttribute("aria-expanded", open ? "true" : "false");
        if (open) {
          if (actionMenuSheet) actionMenuSheet.scrollTop = 0;
          if (apiKeyInline) setTimeout(() => apiKeyInline.focus(), 0);
        }
      }

      function restoreActionMenuHome() {
        if (!actionMenu || !actionMenuHomeParent) return;
        if (actionMenu.parentElement === actionMenuHomeParent) return;
        if (actionMenuHomeNextSibling && actionMenuHomeNextSibling.parentNode === actionMenuHomeParent) {
          actionMenuHomeParent.insertBefore(actionMenu, actionMenuHomeNextSibling);
          return;
        }
        actionMenuHomeParent.appendChild(actionMenu);
      }

      function closeSettingsPage(returnToChat) {
        if (!actionMenu) return;
        actionMenu.classList.remove("page-mode");
        actionMenu.classList.add("hidden");
        actionMenu.setAttribute("aria-hidden", "true");
        if (actionMenuBtn) actionMenuBtn.setAttribute("aria-expanded", "false");
        restoreActionMenuHome();
        if (returnToChat) showTab("chat");
      }

      function openSettingsPage(sourceLabel) {
        if (!actionMenu || !stageBlank) return;
        if (threadsOverlayOpen) setThreadsOverlayOpen(false);
        if (actionMenu.parentElement !== stageBlank) stageBlank.replaceChildren(actionMenu);
        actionMenu.classList.remove("hidden");
        actionMenu.classList.add("page-mode");
        actionMenu.setAttribute("aria-hidden", "false");
        if (actionMenuBtn) actionMenuBtn.setAttribute("aria-expanded", "true");
        if (actionMenuSheet) actionMenuSheet.scrollTop = 0;
        showTab("stageBlank");
        setRunState(sourceLabel || "Settings");
        if (apiKeyInline) setTimeout(() => apiKeyInline.focus(), 0);
      }

      function startNewChat() {
        if (creatingThread) return;
        if (threadsOverlayOpen) setThreadsOverlayOpen(false);
        responseStartedAtMs = 0;
        lastAssistantBubble = null;
        removePendingPromptBubble();
        saveCurrentDraft();
        creatingThread = true;
        currentThreadId = null;
        showTab("chat");
        clearPlanDecisionCard();
        closeMentionMenu();
        setStreaming(false);
        streamBubble = null;
        terminalBubble = null;
        clearQueuedMessages();
        activeProgressState = "";
        lastStatusText = "";
        lastStatusAt = 0;
        liveReasoningText = "";
        latestReasonCodes = [];
        latestRunMeta = null;
        if (reasoningBubble && reasoningBubble.isConnected) reasoningBubble.remove();
        reasoningBubble = null;
        if (msgs) {
          while (msgs.firstChild) msgs.removeChild(msgs.firstChild);
        }
        renderThreadList();
        restoreDraftForThread(currentThreadId);
        setRunState("Creating new chat...");
        updateStartupVisibility();
        v.postMessage({ type: "newThread" });
        setActionMenuOpen(false);
      }

      function returnToChatHomeLocal() {
        responseStartedAtMs = 0;
        lastAssistantBubble = null;
        latestActionOutcome = null;
        creatingThread = false;
        removePendingPromptBubble();
        clearPlanDecisionCard();
        closeMentionMenu();
        setStreaming(false);
        streamBubble = null;
        activeRunThreadId = null;
        terminalBubble = null;
        runProgressBubble = null;
        resetRunProgress();
        clearQueuedMessages();
        activeProgressState = "";
        lastStatusText = "";
        lastStatusAt = 0;
        liveReasoningText = "";
        latestReasonCodes = [];
        latestRunMeta = null;
        if (reasoningBubble && reasoningBubble.isConnected) reasoningBubble.remove();
        reasoningBubble = null;
        setRunState("Local");
        if (msgs) {
          while (msgs.firstChild) msgs.removeChild(msgs.firstChild);
        }
        updateStartupVisibility();
        showTab("chat");
        followLatest = true;
        scrollToLatest(true);
      }

      function onMenuAction(action) {
        if (!action) return;
        if (action.startsWith("show:")) {
          const panel = action.split(":")[1];
          if (panel) showTab(panel);
          return;
        }
        if (action === "execute") {
          showTab("exec");
          if (SHOW_SYSTEM_ACTIVITY) addMessage("Executing pending actions...", "cmd");
          v.postMessage({ type: "execute" });
          return;
        }
        if (action === "history") {
          showHistoryPanel("Refreshing history...");
          v.postMessage({ type: "history" });
          return;
        }
        if (action === "replay") {
          triggerReplayFromUI("actions");
          return;
        }
        if (action === "indexRebuild") {
          showIndexPanel("Rebuilding semantic index...");
          v.postMessage({ type: "indexRebuild" });
          return;
        }
      }

      function setProgressState(label) {
        activeProgressState = String(label || "").trim();
        if (!runState) return;
        setRunState(activeProgressState || (streaming ? "Working..." : "Local"));
      }

      function isProgressOnlyStatus(statusText) {
        const s = String(statusText || "").trim();
        if (!s) return false;
        return (
          /^Model:/i.test(s) ||
          /^Decision:/i.test(s) ||
          /^Queued behind/i.test(s) ||
          /^Working on your request/i.test(s) ||
          /^Understanding request/i.test(s) ||
          /^Planning approach/i.test(s) ||
          /^Preparing actions/i.test(s) ||
          /^Validating output/i.test(s) ||
          /^Working:/i.test(s) ||
          /^Thinking/i.test(s) ||
          /^Repairing tool output/i.test(s) ||
          /^Enforcing actionable tool output/i.test(s) ||
          /^Prepared .+Auto-executing now\./i.test(s) ||
          /^Prepared .+not executed\./i.test(s) ||
          /^Prepared .+Execution policy prevented auto-run\./i.test(s) ||
          /^No runnable commands extracted; kept in preview\./i.test(s)
        );
      }

      function setStreaming(isBusy) {
        streaming = isBusy;
        if (isBusy) {
          followLatest = true;
        }
        const activeSendBtn = sendBtn || document.getElementById("s");
        if (activeSendBtn) activeSendBtn.disabled = false;
        if (modelSel) modelSel.disabled = isBusy;
        if (reasonSel) reasonSel.disabled = isBusy;
        if (uploadBtn) uploadBtn.disabled = isBusy;
        if (activeSendBtn) {
          const sendLabel = currentMode === "plan" ? "Send planning request" : "Send";
          activeSendBtn.textContent = isBusy ? "\u23f9" : "\u2191";
          activeSendBtn.setAttribute("aria-label", isBusy ? "Stop response" : sendLabel);
          activeSendBtn.title = isBusy ? "Stop response" : sendLabel;
          activeSendBtn.classList.toggle("is-streaming", isBusy);
        }
        if (isBusy) {
          setProgressState("Working...");
        } else {
          activeProgressState = "";
          setRunState("Local");
        }
        if (!isBusy) updateJump();
        updateStartupVisibility();
        if (!isBusy) updateComposerState();
        updateReasoningCard();
      }

      function requestCancel() {
        if (!streaming) return;
        v.postMessage({ type: "cancel" });
        setRunState("Stopping...");
      }

      function queuePreviewText(text) {
        const raw = String(text || "").replace(/\s+/g, " ").trim();
        if (!raw) return "(empty)";
        return raw.length > 120 ? raw.slice(0, 117) + "..." : raw;
      }

      function queuedMetaLabel(item, idx) {
        const position = Number(idx) + 1;
        const queuedAt = String(item && item.queuedAt ? item.queuedAt : timeLabel());
        return "Queued #" + position + " | " + queuedAt;
      }

      function removeQueuedBubble(item) {
        if (!item || !item.queuedBubble) return;
        if (item.queuedBubble.isConnected) item.queuedBubble.remove();
        item.queuedBubble = null;
        updateStartupVisibility();
      }

      function syncQueuedBubbles() {
        queuedMessages.forEach((item, idx) => {
          if (!item || !item.queuedBubble || !item.queuedBubble.isConnected) return;
          const meta = item.queuedBubble.querySelector(".m-time");
          if (meta) meta.textContent = queuedMetaLabel(item, idx);
        });
      }

      function clearQueuedMessages() {
        queuedMessages.forEach((item) => removeQueuedBubble(item));
        queuedMessages.length = 0;
        renderQueuedMessagesUI();
      }

      function renderQueuedMessagesUI() {
        const count = queuedMessages.length;
        if (queuePill) {
          queuePill.textContent = "Queued: " + count;
          queuePill.classList.toggle("show", count > 0);
        }
        if (queueSummary) queueSummary.textContent = "Queued messages (" + count + ")";
        if (queuePanel) {
          queuePanel.classList.toggle("hidden", count === 0);
          queuePanel.open = count > 0;
        }
        if (composerShell) composerShell.classList.toggle("has-queue", count > 0);
        if (!queueList) return;
        if (count === 0) {
          queueList.innerHTML = "";
          return;
        }
        queueList.innerHTML = queuedMessages.map((item, idx) => (
          '<div class="queue-item" data-queue-idx="' + idx + '">' +
            '<div class="queue-text" title="' + esc(String(item.text || "")) + '">' + esc(queuePreviewText(item.text || "")) + '</div>' +
            '<div class="queue-actions">' +
              '<button class="queue-btn" type="button" data-queue-act="up" data-queue-idx="' + idx + '"' + (idx === 0 ? " disabled" : "") + '>Up</button>' +
              '<button class="queue-btn" type="button" data-queue-act="down" data-queue-idx="' + idx + '"' + (idx === count - 1 ? " disabled" : "") + '>Down</button>' +
              '<button class="queue-btn" type="button" data-queue-act="remove" data-queue-idx="' + idx + '">Remove</button>' +
            "</div>" +
          "</div>"
        )).join("");
      }

      function queueMessageDuringStream(text, previewAttachments) {
        const payload = {
          text,
          attachments: Array.isArray(previewAttachments) ? previewAttachments : [],
          parallel: Boolean(parallelQuick && parallelQuick.checked),
          model: modelSel ? modelSel.value : DEFAULT_MODEL,
          reasoning: reasonSel ? reasonSel.value : "medium",
          includeIdeContext: true,
          workspaceContextLevel: "max",
          threadId: currentThreadId,
          queuedAt: timeLabel(),
          queuedBubble: null,
        };
        const queuedBubble = addMessage(payload.text, "u queued");
        appendUserAttachmentPreview(queuedBubble, payload.attachments || []);
        const queuedMeta = queuedBubble.querySelector(".m-time");
        if (queuedMeta) queuedMeta.textContent = queuedMetaLabel(payload, queuedMessages.length);
        payload.queuedBubble = queuedBubble;
        queuedMessages.push(payload);
        renderQueuedMessagesUI();
        syncQueuedBubbles();
        if (SHOW_SYSTEM_ACTIVITY) addMessage("Queued message (" + queuedMessages.length + "): " + queuePreviewText(text), "cmd");
      }

      function removePendingPromptBubble() {
        if (!pendingPromptAfterThread) return;
        const bubble = pendingPromptAfterThread.queuedBubble;
        if (bubble && bubble.isConnected) bubble.remove();
        pendingPromptAfterThread = null;
        requestChatContextMeterUpdate();
        updateStartupVisibility();
      }

      function queuePromptUntilThreadReady(payload) {
        if (!payload || !payload.text) return;
        removePendingPromptBubble();
        const queuedBubble = addMessage(payload.text, "u queued");
        appendUserAttachmentPreview(queuedBubble, payload.attachments || []);
        const meta = queuedBubble.querySelector(".m-time");
        if (meta) meta.textContent = "Preparing chat...";
        pendingPromptAfterThread = {
          ...payload,
          queuedBubble,
        };
        setRunState("Creating new chat...");
        followLatest = true;
        scrollToLatest(true);
      }

      function flushPendingPromptAfterThread() {
        if (!pendingPromptAfterThread) return;
        if (creatingThread || streaming) return;
        if (!currentThreadId) return;
        const payload = pendingPromptAfterThread;
        pendingPromptAfterThread = null;
        dispatchPromptPayload({
          ...payload,
          threadId: currentThreadId,
          queuedBubble:
            payload.queuedBubble && payload.queuedBubble.isConnected
              ? payload.queuedBubble
              : null,
        });
      }

      function dispatchPromptPayload(payload) {
        if (!payload || !payload.text) return;
        showTab("chat");
        followLatest = true;
        clearPlanDecisionCard();
        activeRunThreadId = payload.threadId ? String(payload.threadId) : (currentThreadId ? String(currentThreadId) : null);
        responseStartedAtMs = Date.now();
        lastAssistantBubble = null;
        let userBubble = payload.queuedBubble && payload.queuedBubble.isConnected ? payload.queuedBubble : null;
        if (userBubble) {
          userBubble.classList.remove("queued");
          const meta = userBubble.querySelector(".m-time");
          if (meta) meta.textContent = timeLabel();
          payload.queuedBubble = null;
          if (msgs && userBubble.parentElement === msgs && msgs.lastElementChild !== userBubble) msgs.appendChild(userBubble);
        } else {
          userBubble = addMessage(payload.text, "u");
          appendUserAttachmentPreview(userBubble, payload.attachments || []);
        }
        if (input) {
          input.value = "";
          syncComposerHeight();
        }
        if (currentThreadId) threadDrafts[currentThreadId] = "";
        runtimeState.objective = String(payload.text || "").trim();
        runtimeState.cycle = 1;
        runtimeState.maxCycles = runtimeState.maxCycles || 0;
        runtimeState.phase = "plan";
        runtimeState.completionStatus = "incomplete";
        runtimeState.completionScore = 0;
        runtimeState.missingRequirements = [];
        runtimeState.blocker = "Queued for execution.";
        runtimeState.appliedFiles = [];
        runtimeState.filesChanged = 0;
        runtimeState.checksRun = 0;
        runtimeState.commandPass = 0;
        runtimeState.commandFail = 0;
        runtimeState.lastCommandBlocker = "";
        renderRuntimeStrip();
        scheduleContextPreviewDispatch(true);
        setStreaming(true);
        streamBubble = null;
        pinAssistantResponseToBottom();
        reasoningBubble = null;
        liveReasoningText = "";
        latestReasonCodes = [];
        latestRunMeta = null;
        v.postMessage({
          type: "send",
          text: payload.text,
          parallel: Boolean(payload.parallel),
          model: payload.model || DEFAULT_MODEL,
          reasoning: payload.reasoning || "medium",
          includeIdeContext: payload.includeIdeContext !== false,
          workspaceContextLevel: payload.workspaceContextLevel === "max" ? "max" : "max",
          attachments: Array.isArray(payload.attachments) ? payload.attachments : [],
          threadId: payload.threadId || currentThreadId,
        });
        setRunState("Sent");
        scrollToLatest(true);
      }

      function flushQueuedMessages() {
        if (streaming) return;
        if (creatingThread) return;
        const next = queuedMessages.shift();
        if (!next) return;
        renderQueuedMessagesUI();
        syncQueuedBubbles();
        dispatchPromptPayload(next);
      }

      function sendCurrent() {
        try {
          closeMentionMenu();
          const composerInput = input || document.getElementById("t");
          if (!composerInput) return;
          const parsed = parseSlashModeCommand(composerInput.value || "");
          if (parsed.preventSend) {
            if (SHOW_SYSTEM_ACTIVITY) addMessage("Plan mode enabled. Add your request after /plan.", "cmd");
            return;
          }
          const text = parsed.text;
          if (!text) return;
          const previewAttachments = attachedFiles.map((f) => ({
            name: f.name,
            mimeType: f.mimeType,
            dataUrl: f.dataUrl,
          }));
          if (streaming) {
            queueMessageDuringStream(text, previewAttachments);
            composerInput.value = "";
            syncComposerHeight();
            if (currentThreadId) threadDrafts[currentThreadId] = "";
            attachedFiles = [];
            if (uploadInput) uploadInput.value = "";
            updateAttachmentUI();
            return;
          }

          const now = Date.now();
          if (now - lastSendAt < 120) return;
          lastSendAt = now;

          const payload = {
            text,
            attachments: previewAttachments,
            parallel: Boolean(parallelQuick && parallelQuick.checked),
            model: modelSel ? modelSel.value : DEFAULT_MODEL,
            reasoning: reasonSel ? reasonSel.value : "medium",
            includeIdeContext: true,
            workspaceContextLevel: "max",
            threadId: currentThreadId,
          };

          if (creatingThread) {
            queuePromptUntilThreadReady(payload);
            composerInput.value = "";
            syncComposerHeight();
            attachedFiles = [];
            if (uploadInput) uploadInput.value = "";
            updateAttachmentUI();
            return;
          }

          if (!currentThreadId) {
            creatingThread = true;
            queuePromptUntilThreadReady(payload);
            composerInput.value = "";
            syncComposerHeight();
            attachedFiles = [];
            if (uploadInput) uploadInput.value = "";
            updateAttachmentUI();
            v.postMessage({ type: "newThread" });
            return;
          }

          dispatchPromptPayload(payload);
          attachedFiles = [];
          if (uploadInput) uploadInput.value = "";
          updateAttachmentUI();
        } catch (e) {
          setStreaming(false);
          streamBubble = null;
          if (SHOW_SYSTEM_ACTIVITY) addMessage("Error: " + (e && e.message ? e.message : String(e)), "e");
        }
      }

      document.querySelectorAll(".tab").forEach((b) => (b.onclick = () => showTab(b.dataset.p)));
      if (newThreadBtn) {
        newThreadBtn.onclick = startNewChat;
      }
      if (chatEmptyHistory) {
        chatEmptyHistory.onclick = () => {
          openHistoryPanel("Loading history...");
          renderHistoryPanel(recentHistory, { status: "Loading all sessions...", focusSearch: true });
        };
      }
      if (chatEmptySettings) {
        chatEmptySettings.onclick = () => {
          openSettingsPage("Settings");
        };
      }
      if (newThreadQuick) {
        newThreadQuick.onclick = startNewChat;
      }
      if (historyQuick) {
        historyQuick.onclick = () => {
          openChatsPopup("Loading tasks...");
        };
      }
      if (historyHeader) {
        historyHeader.onclick = () => {
          openChatsPopup("Loading tasks...");
        };
      }
      if (closeThreadsPopupBtn) {
        closeThreadsPopupBtn.onclick = () => {
          setThreadsOverlayOpen(false);
        };
      }
      if (undoHeader) {
        undoHeader.onclick = () => {
          requestUndo("header");
        };
      }
      if (backToChatQuick) {
        backToChatQuick.onclick = () => {
          if (threadsOverlayOpen) {
            setThreadsOverlayOpen(false);
            showTab("chat");
            return;
          }

          const hasMessages = msgs ? msgs.children.length > 0 : false;
          if (activePanelId === "chat" && (hasMessages || streaming)) {
            // Toggle to home without cancelling active runs; keep chat alive in background.
            showTab("stageBlank");
            updateBackButtonVisibility();
            return;
          }

          // From any other panel, jump back to the live chat thread.
          showTab("chat");
          if (input) setTimeout(() => input.focus(), 0);
          updateBackButtonVisibility();
        };
      }
      if (threadsOverlayBackdrop) {
        threadsOverlayBackdrop.onclick = () => {
          if (threadsOverlayOpen) setThreadsOverlayOpen(false);
        };
      }
      const saveKeyBtn = document.getElementById("ks");
      if (saveKeyBtn) {
        saveKeyBtn.onclick = () => {
          const keyInput = document.getElementById("k");
          const key = keyInput ? keyInput.value.trim() : "";
          if (key) v.postMessage({ type: "saveKey", key });
        };
      }
      if (signInSetup) {
        signInSetup.onclick = () => {
          if (SHOW_SYSTEM_ACTIVITY) addMessage("Opening browser sign-in…", "cmd");
          v.postMessage({ type: "signIn" });
        };
      }
      if (authSignIn) {
        authSignIn.onclick = () => {
          if (SHOW_SYSTEM_ACTIVITY) addMessage("Opening browser sign-in…", "cmd");
          v.postMessage({ type: "signIn" });
          setActionMenuOpen(false);
        };
      }
      const handleSignOut = () => {
        if (SHOW_SYSTEM_ACTIVITY) addMessage("Signing out…", "cmd");
        v.postMessage({ type: "signOut" });
        setActionMenuOpen(false);
      };
      if (authSignOut) {
        authSignOut.onclick = handleSignOut;
      }
      if (authSignOutQuick) {
        authSignOutQuick.onclick = (e) => {
          e.preventDefault();
          e.stopPropagation();
          handleSignOut();
        };
      }
      if (apiKeyInlineSave) {
        apiKeyInlineSave.onclick = () => {
          const key = apiKeyInline ? apiKeyInline.value.trim() : "";
          if (!key) return;
          apiKeySavePending = true;
          apiKeyInlineSave.disabled = true;
          v.postMessage({ type: "saveKey", key });
        };
      }
      if (apiKeyInline) {
        apiKeyInline.addEventListener("keydown", (e) => {
          const isEnter = e.key === "Enter" || e.code === "Enter" || e.code === "NumpadEnter";
          if (!isEnter) return;
          e.preventDefault();
          if (apiKeyInlineSave) apiKeyInlineSave.click();
        });
      }
      if (uploadBtn && uploadInput) {
        uploadBtn.onclick = (e) => {
          e.preventDefault();
          uploadInput.click();
        };
        uploadInput.onchange = async () => {
          await appendAttachments(uploadInput.files || []);
          uploadInput.value = "";
        };
      }
      if (ctxToggle) {
        ctxToggle.checked = true;
        ctxToggle.disabled = true;
        ctxToggle.onchange = () => {
          ctxToggle.checked = true;
          applyIdeContextVisualState(true);
          setContextTelemetryState({
            enabled: true,
            phase: "idle",
            source: "preview",
            snippets: 0,
            workspaceMatches: 0,
            indexFreshness: "cold",
            preflightMs: 0,
            notes: ["Auto context standing by."],
          });
          updateComposerState();
        };
        applyIdeContextVisualState(true);
      }
      updateAttachmentUI();
      renderModelOptions({ defaultModel: DEFAULT_MODEL, selectedModel: DEFAULT_MODEL, models: [] });
      setContextTelemetryState({
        enabled: true,
        phase: "idle",
        source: "preview",
        snippets: 0,
        workspaceMatches: 0,
        indexFreshness: "cold",
        preflightMs: 0,
        notes: ["Auto context standing by."],
      });
      updateComposerState();
      if (planModeChip) {
        planModeChip.onclick = (e) => {
          e.preventDefault();
          e.stopPropagation();
          if (streaming) return;
          if (currentMode !== "plan") return;
          applyModeUI("auto");
          v.postMessage({ type: "setMode", value: "auto" });
          setRunState("Local");
        };
      }
      if (actionMenuBtn && actionMenu) {
        actionMenuBtn.onclick = (e) => {
          e.preventDefault();
          e.stopPropagation();
          openSettingsPage("Settings");
        };
        if (actionMenuClose) {
          actionMenuClose.onclick = (e) => {
            e.preventDefault();
            e.stopPropagation();
            if (actionMenu.classList.contains("page-mode")) {
              closeSettingsPage(true);
              return;
            }
            setActionMenuOpen(false);
          };
        }
        actionMenu.querySelectorAll("[data-menu-action]").forEach((btn) => {
          btn.addEventListener("click", (e) => {
            e.preventDefault();
            e.stopPropagation();
            onMenuAction(btn.getAttribute("data-menu-action"));
            if (actionMenu.classList.contains("page-mode")) {
              closeSettingsPage(false);
              return;
            }
            setActionMenuOpen(false);
          });
        });
        actionMenu.addEventListener("click", (e) => {
          const target = eventTargetElement(e.target);
          if (!target) return;
          if (actionMenu.classList.contains("page-mode")) return;
          if (target.classList.contains("action-menu-backdrop")) {
            e.preventDefault();
            e.stopPropagation();
            setActionMenuOpen(false);
          }
        });
      }

      const composerFormEl = document.getElementById("composerForm");
      const sendBtnEl = document.getElementById("s");
      if (composerFormEl) composerFormEl.addEventListener("submit", triggerSendSafe, true);
      if (sendBtnEl) {
        sendBtnEl.addEventListener("click", (e) => {
          if (streaming) {
            e.preventDefault();
            e.stopPropagation();
            requestCancel();
            return;
          }
          triggerSendSafe(e);
        }, true);
      }
      // Hard fallback: capture send clicks globally in case local handlers are bypassed.
      document.addEventListener("click", (e) => {
        if (isDropdownTarget(e.target)) return;
        const target = eventTargetElement(e.target);
        if (!target) return;
        if (mentionMenu && input) {
          const insideMention = target.closest("#mentionMenu");
          const insideInput = target === input || target.closest("#t");
          if (!insideMention && !insideInput) closeMentionMenu();
        }
        const sendTarget = target.closest("#s");
        if (!sendTarget) return;
        // Once full composer wiring is ready, let the dedicated send button handler own send/stop.
        if (window.__playgroundComposerReady) return;
        if (streaming) {
          requestCancel();
          return;
        }
        triggerSendSafe(e);
      }, true);
      document.addEventListener("keydown", (e) => {
        const isEsc =
          e.key === "Escape" ||
          e.code === "Escape" ||
          e.key === "Esc" ||
          e.code === "Esc" ||
          e.keyCode === 27 ||
          e.which === 27;
        if (streaming && isEsc && !e.repeat) {
          e.preventDefault();
          e.stopPropagation();
          if (e.stopImmediatePropagation) e.stopImmediatePropagation();
          requestCancel();
        }
        if (handleMentionKeydown(e)) return;
        if (isEsc) setActionMenuOpen(false);
        if (isEsc && actionMenu && actionMenu.classList.contains("page-mode")) closeSettingsPage(false);
        if (isEsc && threadsOverlayOpen) setThreadsOverlayOpen(false);
      }, true);
      document.addEventListener("keyup", (e) => {
        if (e.key === "Enter" || e.code === "Enter" || e.code === "NumpadEnter") {
          allowNextLineBreak = false;
        }
      }, true);
      const onComposerKeydown = (e) => {
        if (handleMentionKeydown(e)) return;
        const isShiftTab = (e.key === "Tab" || e.code === "Tab") && e.shiftKey && !e.altKey && !e.ctrlKey && !e.metaKey;
        if (isShiftTab) {
          e.preventDefault();
          e.stopPropagation();
          if (currentMode !== "plan") {
            applyModeUI("plan");
            v.postMessage({ type: "setMode", value: "plan" });
          }
          return;
        }
        const plainEnter =
          e.key === "Enter" ||
          e.code === "Enter" ||
          e.code === "NumpadEnter" ||
          e.keyCode === 13 ||
          e.which === 13;
        if (!plainEnter) return;
        if (e.shiftKey || e.altKey || e.ctrlKey || e.metaKey) {
          allowNextLineBreak = true;
          return;
        }
        allowNextLineBreak = false;
        triggerSendSafe(e);
      };
      const suppressLineBreak = (e) => {
        const enterPressed =
          e.key === "Enter" ||
          e.code === "Enter" ||
          e.code === "NumpadEnter" ||
          e.keyCode === 13 ||
          e.which === 13;
        if (!enterPressed) return;
        if (e.shiftKey || e.altKey || e.ctrlKey || e.metaKey) return;
        e.preventDefault();
        e.stopPropagation();
      };
      if (input) {
        input.addEventListener("keydown", onComposerKeydown, true);
        input.addEventListener("keypress", suppressLineBreak, true);
        input.addEventListener("paste", async (e) => {
          const files = clipboardImageFiles(e);
          if (!files.length) return;
          await appendAttachments(files);
        });
        input.addEventListener("click", () => {
          scheduleMentionSearch();
        });
        input.addEventListener("keyup", (e) => {
          if (e.key === "ArrowLeft" || e.key === "ArrowRight" || e.key === "Home" || e.key === "End") {
            scheduleMentionSearch();
          }
        });
        input.addEventListener("input", () => {
          applyInlineSlashModeCommand();
          if (currentThreadId) {
            threadDrafts[currentThreadId] = input.value || "";
          }
          syncComposerHeight();
          scheduleMentionSearch();
          scheduleContextPreviewDispatch();
        });
        input.addEventListener("beforeinput", (e) => {
          if (e.inputType === "insertLineBreak" || e.inputType === "insertParagraph") {
            if (allowNextLineBreak) {
              allowNextLineBreak = false;
              return;
            }
            triggerSendSafe(e);
          }
        }, true);
        input.addEventListener("blur", () => {
          allowNextLineBreak = false;
          setTimeout(() => closeMentionMenu(), 90);
        });
        input.onkeydown = onComposerKeydown;
        syncComposerHeight();
      }
      if (queueList) {
        queueList.addEventListener("click", (e) => {
          const target = eventTargetElement(e.target);
          if (!target) return;
          const actEl = target.closest("[data-queue-act]");
          if (!actEl) return;
          const act = String(actEl.getAttribute("data-queue-act") || "");
          const idx = Number(actEl.getAttribute("data-queue-idx"));
          if (!Number.isFinite(idx) || idx < 0 || idx >= queuedMessages.length) return;
          if (act === "remove") {
            const removed = queuedMessages.splice(idx, 1)[0];
            removeQueuedBubble(removed);
          } else if (act === "up" && idx > 0) {
            const tmp = queuedMessages[idx - 1];
            queuedMessages[idx - 1] = queuedMessages[idx];
            queuedMessages[idx] = tmp;
          } else if (act === "down" && idx < queuedMessages.length - 1) {
            const tmp = queuedMessages[idx + 1];
            queuedMessages[idx + 1] = queuedMessages[idx];
            queuedMessages[idx] = tmp;
          }
          renderQueuedMessagesUI();
          syncQueuedBubbles();
        });
      }
      // Full composer wiring is complete; the early fallback sender can stand down.
      window.__playgroundComposerReady = true;
      // Global fallback in case the textarea handler is bypassed by editor/webview quirks.
      document.addEventListener("keydown", (e) => {
        const active = document.activeElement;
        if (input && active === input) {
          onComposerKeydown(e);
          return;
        }
        // Extra fallback if input reference is stale.
        if (
          active &&
          active.id === "t" &&
          (e.key === "Enter" || e.code === "Enter" || e.code === "NumpadEnter" || e.keyCode === 13 || e.which === 13) &&
          !e.shiftKey &&
          !e.altKey &&
          !e.ctrlKey &&
          !e.metaKey
        ) {
          triggerSendSafe(e);
        }
      }, true);
      const clearBtn = document.getElementById("c");
      const histQuick = document.getElementById("histQuick");
      const repQuick = document.getElementById("repQuick");
      const idxQuick = document.getElementById("idxQuick");

      if (clearBtn) {
        clearBtn.onclick = () => {
          responseStartedAtMs = 0;
          lastAssistantBubble = null;
          clearPlanDecisionCard();
          while (msgs.firstChild) msgs.removeChild(msgs.firstChild);
          chips.innerHTML = "";
          clearQueuedMessages();
          resetRuntimeState();
          requestChatContextMeterUpdate();
          updateStartupVisibility();
          setStreaming(false);
          v.postMessage({ type: "clear" });
          setActionMenuOpen(false);
        };
      }
      if (modeQuick) {
        modeQuick.addEventListener("change", (e) => {
          applyModeUI(e.target.value);
          v.postMessage({ type: "setMode", value: e.target.value });
        });
      }
      if (modelSel) {
        modelSel.addEventListener("change", () => {
          updateComposerState();
        });
      }
      if (reasonSel) {
        reasonSel.addEventListener("change", () => {
          updateComposerState();
        });
      }
      if (safetyQuick) {
        safetyQuick.addEventListener("change", (e) => {
          v.postMessage({ type: "setSafety", value: e.target.value });
        });
      }
      if (viewAllTasks) {
        viewAllTasks.onclick = () => {
          openHistoryPanel("Loading all conversation history...");
          renderHistoryPanel(recentHistory, { status: "Loading all sessions...", focusSearch: true });
        };
      }
      if (histQuick) {
        histQuick.onclick = () => {
          showTab("stageThreads");
          setRunState("Loading threads...");
          v.postMessage({ type: "history" });
        };
      }
      if (repQuick) {
        repQuick.onclick = () => {
          triggerReplayFromUI("quick actions");
        };
      }
      if (idxQuick) {
        idxQuick.onclick = () => {
          showIndexPanel("Index refresh started...");
          v.postMessage({ type: "indexRebuild" });
        };
      }
      if (jumpLatestBtn) {
        jumpLatestBtn.onclick = () => {
          followLatest = true;
          scrollToLatest(true);
        };
      }
      if (chatPanel) {
        chatPanel.addEventListener("scroll", () => {
          // Always keep followLatest on; ignore manual scroll position.
          followLatest = true;
          updateJump();
        });
      }
      if (msgs) {
        msgs.addEventListener("scroll", () => {
          followLatest = true;
          updateJump();
        });
      }
      bindChatMutationObserver();
      bindChatDockClickToFocus();
      if (undoLastBtn) {
        undoLastBtn.onclick = () => {
          requestUndo("actions", true);
        };
      }
      updateUndoButtonState();
      renderQueuedMessagesUI();

      window.addEventListener("message", (ev) => {
        const m = ev.data;
        if (
          m &&
          RUN_SCOPED_MESSAGE_TYPES.has(String(m.type || "")) &&
          m.threadId &&
          ((activeRunThreadId && String(m.threadId) !== String(activeRunThreadId)) || (!activeRunThreadId && currentThreadId && String(m.threadId) !== String(currentThreadId)))
        ) {
          return;
        }
        if (m.type === "sendAck") {
          setRunState("Working...");
          setContextTelemetryState({
            enabled: true,
            phase: "collecting",
            source: "send",
            snippets: 0,
            workspaceMatches: 0,
            indexFreshness: "cold",
            preflightMs: 0,
            notes: ["Syncing context for this request..."],
          });
          updateComposerState();
        } else if (m.type === "api") {
          hostHandshakeReceived = true;
          if (m.ok) {
            if (setup) setup.style.display = "none";
            if (app) app.style.display = "flex";
            v.postMessage({ type: "history" });
          } else {
            if (setup) setup.style.display = "flex";
            if (app) app.style.display = "none";
          }
        } else if (m.type === "modelsCatalog") {
          renderModelOptions({
            defaultModel: m.defaultModel || DEFAULT_MODEL,
            selectedModel: m.selectedModel || (modelSel ? modelSel.value : DEFAULT_MODEL),
            models: Array.isArray(m.models) ? m.models : [],
          });
          updateComposerState();
        } else if (m.type === "authState") {
          const signedIn = m.signedIn === true;
          const browserSignedIn = m.browserSignedIn === true;
          const apiKeySaved = m.apiKeySaved === true;
          const apiKeyMasked = typeof m.apiKeyMasked === "string" ? String(m.apiKeyMasked).trim() : "";
          const email = typeof m.email === "string" ? m.email : "";
          if (authLabel) {
            if (browserSignedIn) {
              authLabel.textContent = "Signed in" + (email ? (" as " + email) : "");
            } else if (apiKeySaved) {
              authLabel.textContent = "Authenticated with saved API key.";
            } else if (signedIn) {
              authLabel.textContent = "Authenticated.";
            } else {
              authLabel.textContent = "Not signed in.";
            }
          }
          if (authSignIn) authSignIn.style.display = browserSignedIn ? "none" : "";
          if (authSignOut) authSignOut.style.display = browserSignedIn ? "" : "none";
          if (authSignOutQuick) authSignOutQuick.style.display = browserSignedIn ? "" : "none";
          if (apiKeyInline) {
            apiKeyInline.placeholder = apiKeySaved
              ? (apiKeyMasked ? ("Saved: " + apiKeyMasked) : "API key saved")
              : "xp_...";
          }
          if (apiKeyHint) {
            if (apiKeySaved) {
              apiKeyHint.textContent = apiKeyMasked
                ? ("API key saved as " + apiKeyMasked + ". Stored securely in VS Code secrets.")
                : "API key saved. Stored securely in VS Code secrets.";
            } else if (browserSignedIn) {
              apiKeyHint.textContent = "Signed in with browser. API key is optional.";
            } else {
              apiKeyHint.textContent = "Stored securely in VS Code secrets.";
            }
          }
        } else if (m.type === "apiKeySaved") {
          const ok = m.ok !== false;
          const reason = String(m.reason || "").trim();
          apiKeySavePending = false;
          if (apiKeyInlineSave) apiKeyInlineSave.disabled = false;
          if (!ok) {
            addMessage("Failed to save API key" + (reason ? ": " + reason : "."), "e");
            if (apiKeyInline) setTimeout(() => apiKeyInline.focus(), 0);
            return;
          }
          if (apiKeyInline) apiKeyInline.value = "";
          if (SHOW_SYSTEM_ACTIVITY) addMessage("API key updated.", "cmd");
          setActionMenuOpen(false);
        } else if (m.type === "openUploadPicker") {
          if (uploadInput) uploadInput.click();
        } else if (m.type === "mode") {
          applyModeUI(m.value);
        } else if (m.type === "safety") {
          if (safetyQuick) safetyQuick.value = m.value;
        } else if (m.type === "mentionsConfig") {
          mentionsEnabled = m.enabled !== false;
          if (!mentionsEnabled) closeMentionMenu();
        } else if (m.type === "mentionResults") {
          if (!mentionsEnabled) {
            closeMentionMenu();
            return;
          }
          const active = mentionContextFromInput();
          const incomingQuery = String(m.query || "");
          if (!active || active.query !== incomingQuery) return;
          mentionItems = Array.isArray(m.items)
            ? m.items
                .map((item) => ({
                  path: String(item?.path || ""),
                  kind: String(item?.kind || "file") === "folder" ? "folder" : "file",
                }))
                .filter((item) => item.path)
            : [];
          mentionActiveIndex = 0;
          mentionPending = false;
          mentionLastQuery = incomingQuery;
          renderMentionMenu();
        } else if (m.type === "att") {
          const count = Number(m.count || 0);
          if (uploadCount && attachedFiles.length === 0) {
            uploadCount.textContent = count === 0
              ? "No images selected."
              : (count === 1 ? "1 image selected." : count + " images selected.");
          }
        } else if (m.type === "start") {
          lastDiagnosticsFingerprint = "";
          liveReasoningText = "";
          latestReasonCodes = [];
          latestRunMeta = null;
          if (reasoningBubble && reasoningBubble.isConnected) reasoningBubble.remove();
          reasoningBubble = null;
          if (m.threadId) {
            activeRunThreadId = String(m.threadId);
            if (!currentThreadId || creatingThread) {
              currentThreadId = activeRunThreadId;
              creatingThread = false;
              renderThreadList();
            }
          }
          latestActionOutcome = null;
          if (!responseStartedAtMs) responseStartedAtMs = Date.now();
          runProgressBubble = null;
          resetRunProgress();
          renderRunProgress();
          runtimeState.phase = "act";
          runtimeState.completionStatus = "incomplete";
          runtimeState.blocker = "Collecting context and preparing actions.";
          if (runtimeState.cycle <= 0) runtimeState.cycle = 1;
          renderRuntimeStrip();
          streamEndPending = false;
          setStreaming(true);
          setContextTelemetryState({
            enabled: true,
            phase: "collecting",
            source: "send",
            snippets: 0,
            workspaceMatches: 0,
            indexFreshness: "cold",
            preflightMs: 0,
            notes: ["Syncing context for this request..."],
          });
          updateComposerState();
        } else if (m.type === "token") {
          if (!streaming) setStreaming(true);
          queueStreamText(String(m.text || ""));
          followLatest = true;
          scrollToLatest(true);
        } else if (m.type === "reasoningToken") {
          const chunk = String(m.text || "");
          if (chunk) {
            liveReasoningText = (liveReasoningText + chunk).slice(-MAX_REASONING_CHARS);
            updateReasoningCard();
            followLatest = true;
            scrollToLatest(true);
          }
        } else if (m.type === "reasonCodes") {
          latestReasonCodes = Array.isArray(m.codes) ? m.codes : [];
          updateReasoningCard();
        } else if (m.type === "end") {
          const shouldShowPlanDecision = Boolean(streamBubble) && currentMode === "plan";
          if (streamBubble) {
            streamEndPending = true;
            flushStreamBuffer(false);
          } else {
            finalizeStreamMessage();
          }
          runtimeState.phase = "verify";
          renderRuntimeStrip();
          if (shouldShowPlanDecision) showPlanDecisionCard();
          if (queuedMessages.length > 0) {
            setTimeout(() => flushQueuedMessages(), 0);
          }
        } else if (m.type === "status") {
          const statusText = String(m.text || "");
          const now = Date.now();
          if (statusText && statusText === lastStatusText && now - lastStatusAt < 2500) {
            return;
          }
          if (statusText && seenRunStatuses.has(statusText)) {
            return;
          }
          if (statusText) seenRunStatuses.add(statusText);
          lastStatusText = statusText;
          lastStatusAt = now;
          updatePendingStreamBubble(statusText);

          if (!SHOW_SYSTEM_ACTIVITY) {
            if (isProgressOnlyStatus(statusText)) {
              if (statusText === activeProgressState) return;
              setProgressState(statusText);
            } else if (/^Execute finished:/i.test(statusText)) {
              activeProgressState = "";
              setRunState(streaming ? "Working..." : "Local");
            }
            return;
          }

          if (/^Executing\s+\d+\s+action\(s\)\.\.\./i.test(statusText)) {
            terminalBubble = null;
            setTerminalState("Running");
            addTerminalLine("Starting execution...", "info");
            updateRunStep("execution", "running");
            setProgressState("Executing");
          } else if (/^Execute finished:/i.test(statusText)) {
            setTerminalState("Done");
            addTerminalLine(statusText, "summary");
            updateRunStep("execution", "done");
            activeProgressState = "";
            setRunState(streaming ? "Working..." : "Local");
          } else if (isProgressOnlyStatus(statusText)) {
            if (/^Understanding request|^Planning approach|^Repairing tool output|^Enforcing actionable tool output|^Working on your request/i.test(statusText)) {
              updateRunStep("plan", "running", statusText);
            } else if (/^Preparing actions|^Prepared /i.test(statusText)) {
              updateRunStep("actions", "running", statusText);
            } else if (/^No runnable commands extracted; kept in preview\./i.test(statusText)) {
              updateRunStep("actions", "warn", statusText);
              updateRunStep("outcome", "warn");
            } else {
              updateRunStep("", "", statusText);
            }
            if (statusText === activeProgressState) return;
            setProgressState(statusText);
          } else if (/^Ran\s+/i.test(statusText)) {
            // Suppress duplicate "Ran ..." chat noise; terminal stream already shows command activity.
            return;
          } else {
            addMessage(statusText, "a assistant-response");
          }
        } else if (m.type === "assistant") {
          setStreaming(true);
          queueStreamText(String(m.text || ""));
          if (currentMode === "plan") showPlanDecisionCard();
        } else if (m.type === "editPreview") {
          addEditPreview(m.path || "unknown", m.patch || "");
        } else if (m.type === "terminalCommand") {
          if (!SHOW_SYSTEM_ACTIVITY) return;
          setTerminalState("Running");
          const commandText = String(m.command || "").trim();
          if (!seenRunCommands.has(commandText)) {
            addTerminalLine("$ " + commandText, "cmdline");
            seenRunCommands.add(commandText);
          }
          updateRunStep("execution", "running");
          setProgressState("Executing");
        } else if (m.type === "fileAction") {
          if (!SHOW_SYSTEM_ACTIVITY) return;
          const status = String(m.status || "applied");
          const reason = m.reason ? " (" + String(m.reason) + ")" : "";
          addMessage("[file] " + status + " " + (m.path || "unknown") + reason, "cmd");
          updateRunStep("actions", "done");
        } else if (m.type === "meta") {
          latestRunMeta = m.data || null;
          if (m.data && typeof m.data === "object") {
            if (typeof m.data.completionStatus === "string") {
              runtimeState.completionStatus = m.data.completionStatus === "complete" ? "complete" : "incomplete";
            }
            if (Array.isArray(m.data.missingRequirements)) {
              runtimeState.missingRequirements = m.data.missingRequirements
                .filter((x) => typeof x === "string" && x.trim())
                .map((x) => String(x).trim());
            }
            if (m.data.actionability && typeof m.data.actionability.reason === "string") {
              runtimeState.blocker = String(m.data.actionability.reason || "");
            }
            if (m.data.toolState && typeof m.data.toolState === "object") {
              runtimeState.toolStrategy = String(m.data.toolState.strategy || runtimeState.toolStrategy || "");
              runtimeState.toolRoute = String(m.data.toolState.route || runtimeState.toolRoute || "");
              runtimeState.toolAdapter = String(m.data.toolState.adapter || runtimeState.toolAdapter || "");
              runtimeState.toolActionSource = String(m.data.toolState.actionSource || runtimeState.toolActionSource || "");
              runtimeState.toolRecoveryStage = String(m.data.toolState.recoveryStage || runtimeState.toolRecoveryStage || "");
              runtimeState.commandPolicy = String(m.data.toolState.commandPolicyResolved || runtimeState.commandPolicy || "");
              runtimeState.toolFailureCategory = String(m.data.toolState.lastFailureCategory || runtimeState.toolFailureCategory || "");
            }
            renderRuntimeStrip();
          }
          chips.innerHTML = "";
          if (m.data?.modelResolvedAlias || modelSel?.value) {
            const mm = document.createElement("span");
            mm.className = "chip";
            const selectedLabel = modelLabelForUi(m.data?.modelResolvedAlias || modelSel.value);
            const selectedProvider = m.data?.providerResolved ? " (" + String(m.data.providerResolved).toUpperCase() + ")" : "";
            mm.textContent = "Model " + selectedLabel + selectedProvider;
            chips.appendChild(mm);
          }
          if (m.data?.contractVersion) {
            const cv = document.createElement("span");
            cv.className = "chip";
            cv.textContent = "Contract " + String(m.data.contractVersion);
            chips.appendChild(cv);
          }
          if (reasonSel?.value) {
            const rr = document.createElement("span");
            rr.className = "chip";
            rr.textContent = "Reasoning " + reasonSel.value;
            chips.appendChild(rr);
          }
          if (m.data?.decision) {
            const d = document.createElement("span");
            d.className = "chip";
            d.textContent = "Mode " + m.data.decision;
            chips.appendChild(d);
          }
          if (m.data?.toolState?.route) {
            const route = document.createElement("span");
            route.className = "chip";
            route.textContent = "Route " + String(m.data.toolState.route).replace(/_/g, " ");
            chips.appendChild(route);
          }
          if (m.data?.toolState?.commandPolicyResolved) {
            const policy = document.createElement("span");
            policy.className = "chip";
            policy.textContent = "Policy " + String(m.data.toolState.commandPolicyResolved);
            chips.appendChild(policy);
          }
          if (m.data?.toolState?.recoveryStage && m.data.toolState.recoveryStage !== "none") {
            const recovery = document.createElement("span");
            recovery.className = "chip";
            recovery.textContent = "Recovery " + String(m.data.toolState.recoveryStage).replace(/_/g, " ");
            chips.appendChild(recovery);
          }
          if (m.data?.localApplyFailure?.retryStage && m.data.localApplyFailure.retryStage !== "final_failure") {
            const localRecovery = document.createElement("span");
            localRecovery.className = "chip";
            localRecovery.textContent = "Local recovery " + String(m.data.localApplyFailure.retryStage).replace(/_/g, " ");
            chips.appendChild(localRecovery);
          }
          if (m.data?.confidence !== undefined) {
            const c = document.createElement("span");
            c.className = "chip";
            c.textContent = "Confidence " + Math.round(m.data.confidence * 100) + "%";
            chips.appendChild(c);
          }
          updateComposerState();
          if (m.data?.risk) {
            const r = document.createElement("span");
            r.className = "chip";
            r.textContent = "Risk " + m.data.risk.blastRadius + " / rollback " + m.data.risk.rollbackComplexity;
            chips.appendChild(r);
          }
          updateReasoningCard();
        } else if (m.type === "autonomyRuntime") {
          const data = m.data && typeof m.data === "object" ? m.data : {};
          runtimeState.objective = String(data.objective || runtimeState.objective || "").trim();
          runtimeState.cycle = Math.max(0, Number(data.cycle || runtimeState.cycle || 0));
          runtimeState.maxCycles = Math.max(0, Number(data.maxCycles || runtimeState.maxCycles || 0));
          runtimeState.phase = String(data.phase || runtimeState.phase || "idle").toLowerCase();
          runtimeState.completionStatus = String(data.completionStatus || runtimeState.completionStatus) === "complete" ? "complete" : "incomplete";
          runtimeState.completionScore = Math.max(0, Math.min(100, Number(data.completionScore || runtimeState.completionScore || 0)));
          runtimeState.missingRequirements = Array.isArray(data.missingRequirements)
            ? data.missingRequirements.filter((x) => typeof x === "string" && x.trim()).map((x) => String(x).trim())
            : runtimeState.missingRequirements;
          runtimeState.blocker = String(data.blocker || runtimeState.blocker || "");
          runtimeState.appliedFiles = Array.isArray(data.appliedFiles)
            ? data.appliedFiles.filter((x) => typeof x === "string" && x.trim()).map((x) => String(x).trim())
            : runtimeState.appliedFiles;
          runtimeState.filesChanged = Math.max(0, Number(data.filesChanged || runtimeState.filesChanged || 0));
          runtimeState.checksRun = Math.max(0, Number(data.checksRun || runtimeState.checksRun || 0));
          if (data.toolState && typeof data.toolState === "object") {
            runtimeState.toolStrategy = String(data.toolState.strategy || runtimeState.toolStrategy || "");
            runtimeState.toolRoute = String(data.toolState.route || runtimeState.toolRoute || "");
            runtimeState.toolAdapter = String(data.toolState.adapter || runtimeState.toolAdapter || "");
            runtimeState.toolActionSource = String(data.toolState.actionSource || runtimeState.toolActionSource || "");
            runtimeState.toolRecoveryStage = String(data.toolState.recoveryStage || runtimeState.toolRecoveryStage || "");
            runtimeState.commandPolicy = String(data.toolState.commandPolicyResolved || runtimeState.commandPolicy || "");
            runtimeState.toolFailureCategory = String(data.toolState.lastFailureCategory || runtimeState.toolFailureCategory || "");
          }
          renderRuntimeStrip();
        } else if (m.type === "actionOutcome") {
          const data = m.data || {};
          const filesChanged = Number(data.filesChanged || 0);
          const checksRun = Number(data.checksRun || 0);
          const quality = String(data.quality || "unknown");
          const summary = String(data.summary || "");
          latestActionOutcome = { filesChanged, checksRun, quality, summary };
          runtimeState.filesChanged = Math.max(0, filesChanged);
          runtimeState.checksRun = Math.max(0, checksRun);
          if (Array.isArray(data.appliedFiles)) {
            runtimeState.appliedFiles = data.appliedFiles
              .filter((x) => typeof x === "string" && x.trim())
              .map((x) => String(x).trim());
          } else if (Array.isArray(data.perFile)) {
            runtimeState.appliedFiles = data.perFile
              .filter((row) => row && (String(row.status || "").toLowerCase() === "applied" || String(row.status || "").toLowerCase() === "partial"))
              .map((row) => String(row.path || "").trim())
              .filter(Boolean);
          }
          if (filesChanged === 0) {
            runtimeState.completionStatus = "incomplete";
            runtimeState.blocker = summary || runtimeState.blocker || "No local file mutation detected.";
          } else if (quality === "good") {
            runtimeState.completionScore = Math.max(runtimeState.completionScore, 80);
          }
          renderRuntimeStrip();
          recheckAssistantTextForOutcome(latestActionOutcome);
          const perFile = Array.isArray(data.perFile) ? data.perFile : [];
          const debug = data.debug && typeof data.debug === "object" ? data.debug : null;
          const guardrailIssues = extractGuardrailIssues(debug, summary);
          const outcomeNote = "files=" + filesChanged + ", checks=" + checksRun + ", quality=" + quality + (summary ? " - " + summary : "");
          updateRunStep("plan", runStepState.plan === "pending" ? "done" : runStepState.plan);
          updateRunStep("actions", runStepState.actions === "pending" ? "done" : runStepState.actions);
          updateRunStep("execution", runStepState.execution === "pending" ? "done" : runStepState.execution);
          updateRunStep("outcome", quality === "good" ? "done" : "warn", outcomeNote);
          followLatest = true;
          scrollToLatest(true);

          const outcomeRows = [
            {
              title: "OUTCOME",
              body: "files=" + filesChanged + ", checks=" + checksRun + ", quality=" + quality + (summary ? " | " + summary : ""),
            },
          ];
          if (perFile.length) {
            perFile.slice(0, 20).forEach((row) => {
              const status = String((row && row.status) || "unknown");
              const path = String((row && row.path) || "unknown");
              const reason = row && row.reason ? " | " + String(row.reason) : "";
              outcomeRows.push({
                title: "FILE " + status.toUpperCase(),
                body: path + reason,
              });
            });
          }
          if (debug) {
            const requested = Number(debug.requestedActions || 0);
            const approved = Number(debug.approvedActions || 0);
            const rejected = Number(debug.rejectedActions || 0);
            const localRejected = Number(debug.localRejectedEdits || 0);
            outcomeRows.push({
              title: "DEBUG SUMMARY",
              body:
                "requested=" + requested +
                ", approved=" + approved +
                ", rejected=" + rejected +
                ", localRejected=" + localRejected,
            });
            const rejectedSamples = Array.isArray(debug.rejectedSamples) ? debug.rejectedSamples : [];
            const localRejectedSamples = Array.isArray(debug.localRejectedSamples) ? debug.localRejectedSamples : [];
            const applyErrors = Array.isArray(debug.applyErrors) ? debug.applyErrors : [];
            rejectedSamples.slice(0, 8).forEach((line) => {
              outcomeRows.push({ title: "SERVER REJECTED", body: String(line || "") });
            });
            localRejectedSamples.slice(0, 8).forEach((line) => {
              outcomeRows.push({ title: "LOCAL REJECTED", body: String(line || "") });
            });
            applyErrors.slice(0, 8).forEach((line) => {
              outcomeRows.push({ title: "APPLY ERROR", body: String(line || "") });
            });
          }
          if (guardrailIssues.length > 0) {
            showGuardrailCard(guardrailIssues, summary, debug);
          }
          if (exec) {
            const appended = outcomeRows
              .map((row) => (
                '<div class="item">' +
                  '<div class="item-title">' + esc(row.title) + " - " + esc(new Date().toLocaleTimeString()) + "</div>" +
                  '<div class="item-sub">' + esc(row.body) + "</div>" +
                "</div>"
              ))
              .join("");
            const currentExec = typeof exec.innerHTML === "string" ? exec.innerHTML.trim() : "";
            exec.innerHTML = (currentExec && currentExec !== "No execution logs" ? currentExec : "") + appended;
          }
          if (SHOW_SYSTEM_ACTIVITY) {
            const outcome = [
              "Action outcome",
              "Files changed: " + filesChanged,
              "Checks run: " + checksRun,
              "Result quality: " + quality,
              summary ? summary : "",
            ].filter(Boolean).join("\n");
            addMessage(outcome, quality === "good" ? "cmd" : "a assistant-response");
            if (filesChanged === 0 && quality !== "good") {
              addMessage("Warning: No edits were applied.", "a assistant-response");
            }
          }
          if (filesChanged === 0) {
            const detailHint =
              quality === "good"
                ? "Open Execution to confirm whether this run was command-only."
                : "Open Execution for exact reject reasons.";
            const outcomeReason = String((latestActionOutcome?.summary || runtimeState.blocker) || "").trim();
            const reasonHint = outcomeReason ? "Reason: " + outcomeReason + ". " : "";
            addMessage("Execution debug: no file edits were applied. " + reasonHint + detailHint, "a assistant-response");
          }
        } else if (m.type === "diagnosticsBundle") {
          showDiagnosticsBundleCard(m.data || {});
        } else if (m.type === "timeline") {
          const rows = m.data || [];
          timeline.innerHTML = rows.map((x) => (
            '<div class="item">' +
              '<div class="item-title">' + esc(new Date(x.ts).toLocaleTimeString()) + ' - ' + esc(x.phase) + '</div>' +
              '<div class="item-sub">' + esc(x.detail) + '</div>' +
            '</div>'
          )).join("") || "No timeline";
        } else if (m.type === "threadState") {
          const data = m.data || {};
          const incomingActiveThreadId = data.activeThreadId || null;
          const shouldPreservePendingThread =
            creatingThread &&
            Boolean(pendingPromptAfterThread) &&
            !incomingActiveThreadId;
          if (!shouldPreservePendingThread) {
            currentThreadId = incomingActiveThreadId;
          }
          openChats = Array.isArray(data.openChats) ? data.openChats : [];
          recentHistory = Array.isArray(data.recentHistory) ? data.recentHistory : [];
          pinnedIds = Array.isArray(data.pinnedIds) ? data.pinnedIds.map((id) => String(id || "")) : [];
          if (incomingActiveThreadId) creatingThread = false;
          renderThreadList();
          renderTaskPreview(recentHistory);
          if (history && history.classList.contains("active")) renderHistoryPanel(recentHistory, { query: historySearchQuery });
          restoreDraftForThread(currentThreadId);
          updateStartupVisibility();
          flushPendingPromptAfterThread();
        } else if (m.type === "historyItems") {
          const rows = Array.isArray(m.data) ? m.data : [];
          recentHistory = rows;
          renderThreadList();
          renderTaskPreview(rows);
          renderHistoryPanel(rows, { query: historySearchQuery });
        } else if (m.type === "indexState") {
          index.innerHTML =
            '<div class="item"><div class="item-title">Chunks</div><div class="item-sub">' + esc(m.data?.chunks || 0) + '</div></div>' +
            '<div class="item"><div class="item-title">Freshness</div><div class="item-sub">' + esc(m.data?.freshness || "stale") + '</div></div>' +
            '<div class="item"><div class="item-title">Last matches</div><div class="item-sub">' + esc(m.data?.lastQueryMatches || 0) + '</div></div>' +
            '<div class="item"><div class="item-title">Last rebuild</div><div class="item-sub">' + esc(m.data?.lastRebuildAt || "n/a") + '</div></div>';
        } else if (m.type === "contextStatus") {
          const payload = m.data && typeof m.data === "object" ? m.data : {};
          setContextTelemetryState({
            enabled: payload.enabled !== false,
            phase: payload.phase || "ready",
            source: payload.source || "preview",
            snippets: Number(payload.snippets || 0),
            workspaceMatches: Number(payload.workspaceMatches || 0),
            indexFreshness: String(payload.indexFreshness || "cold"),
            preflightMs: Number(payload.preflightMs || 0),
            notes: Array.isArray(payload.notes) ? payload.notes : [],
          });
          updateComposerState();
        } else if (m.type === "roundtable") {
          agents.textContent = JSON.stringify(m.data || {}, null, 2);
        } else if (m.type === "execLogs") {
          const rows = m.data || [];
          let passCount = 0;
          let failCount = 0;
          let lastFailure = "";
          if (SHOW_SYSTEM_ACTIVITY) {
            rows.forEach((x) => {
              const parsed = parseExecCommandResult(x.message || "");
              if (parsed) {
                const ok = parsed.status === "APPROVED";
                const marker = ok ? "OK" : "ERR";
                addTerminalLine(marker + " " + parsed.command + " (exit " + parsed.exit + ")", ok ? "ok" : "err");
                if (parsed.reason) addTerminalLine("reason: " + parsed.reason, "info");
                return;
              }
              const level = String(x.level || "").toLowerCase();
              addTerminalLine(String(x.message || ""), level === "error" ? "err" : "info");
            });
          }
          rows.forEach((x) => {
            const parsed = parseExecCommandResult(x.message || "");
            if (!parsed) return;
            if (parsed.status === "APPROVED") {
              passCount += 1;
              return;
            }
            failCount += 1;
            lastFailure = parsed.reason || parsed.command || lastFailure;
          });
          runtimeState.commandPass += passCount;
          runtimeState.commandFail += failCount;
          if (lastFailure) runtimeState.lastCommandBlocker = String(lastFailure);
          renderRuntimeStrip();
          exec.innerHTML = rows.map((x) => (
            '<div class="item">' +
              '<div class="item-title">' + esc(String(x.level || "").toUpperCase()) + ' - ' + esc(new Date(x.ts).toLocaleTimeString()) + '</div>' +
              '<div class="item-sub">' + esc(x.message) + '</div>' +
            '</div>'
          )).join("") || "No execution logs";
        } else if (m.type === "pendingActions") {
          // Auto execution mode; pending count is reflected via status messages.
        } else if (m.type === "undoState") {
          undoAvailable = m.available === true;
          undoCount = Number(m.count || 0);
          updateUndoButtonState();
        } else if (m.type === "err") {
          const failedPendingPrompt = creatingThread && pendingPromptAfterThread
            ? pendingPromptAfterThread
            : null;
          if (creatingThread) removePendingPromptBubble();
          const failedBubble = streamBubble && streamBubble.isConnected ? streamBubble : null;
          creatingThread = false;
          if (failedPendingPrompt && input && !String(input.value || "").trim()) {
            input.value = String(failedPendingPrompt.text || "");
            syncComposerHeight();
          }
          if (
            failedPendingPrompt &&
            Array.isArray(failedPendingPrompt.attachments) &&
            failedPendingPrompt.attachments.length > 0
          ) {
            attachedFiles = failedPendingPrompt.attachments
              .filter((item) => item && typeof item.dataUrl === "string" && item.dataUrl.startsWith("data:image/"))
              .slice(0, MAX_ATTACHMENTS);
            if (uploadInput) uploadInput.value = "";
            updateAttachmentUI();
          }
          clearPlanDecisionCard();
          if (failedBubble) {
            failedBubble.classList.remove("typing");
            failedBubble.classList.remove("stream-pending");
            const body = failedBubble.querySelector(".m-body");
            if (body) {
              const existing = String(body.textContent || "").trim();
              const detail = String(m.text || "Request failed.").trim();
              const summary = detail.length > 280 ? detail.slice(0, 277) + "..." : detail;
              if (!existing || /^streaming response\.{0,3}$/i.test(existing)) {
                body.textContent = "I hit an issue while generating a response. " + summary;
              }
            }
          }
          setStreaming(false);
          streamBubble = null;
          activeRunThreadId = null;
          if (failedBubble) lastAssistantBubble = failedBubble;
          updateRunStep("outcome", "warn", String(m.text || "Error"));
          runtimeState.phase = "done";
          runtimeState.completionStatus = "incomplete";
          runtimeState.blocker = String(m.text || "Error");
          renderRuntimeStrip();
          if (SHOW_SYSTEM_ACTIVITY || !failedBubble) addMessage("Error: " + m.text, "e");
          setRunState("Error");
          pinAssistantResponseToBottom();
          stampResponseDuration(failedBubble, true);
        } else if (m.type === "prefill") {
          input.value = m.text || "";
          syncComposerHeight();
          scheduleContextPreviewDispatch(true);
        } else if (m.type === "load") {
          const incomingThreadId =
            m.threadId === undefined
              ? undefined
              : m.threadId === null
                ? null
                : String(m.threadId);
          const loadedMessages = Array.isArray(m.data) ? m.data : [];
          const isStaleEmptyHomeLoad =
            creatingThread &&
            Boolean(pendingPromptAfterThread) &&
            incomingThreadId === null &&
            loadedMessages.length === 0;
          if (isStaleEmptyHomeLoad) {
            return;
          }
          lastDiagnosticsFingerprint = "";
          responseStartedAtMs = 0;
          lastAssistantBubble = null;
          latestActionOutcome = null;
          creatingThread = false;
          clearPlanDecisionCard();
          closeMentionMenu();
          setStreaming(false);
          streamBubble = null;
          activeRunThreadId = null;
          terminalBubble = null;
          runProgressBubble = null;
          resetRunProgress();
          clearQueuedMessages();
          activeProgressState = "";
          lastStatusText = "";
          lastStatusAt = 0;
          resetRuntimeState();
          setRunState("Local");
          if (incomingThreadId !== undefined) currentThreadId = incomingThreadId;
          while (msgs.firstChild) msgs.removeChild(msgs.firstChild);
          loadedMessages.forEach((x) => {
            const body = x.role === "assistant" ? normalizeAssistantText(x.content) : x.content;
            addMessage(body, x.role === "user" ? "u" : "a assistant-response");
          });
          updateStartupVisibility();
          renderThreadList();
          renderTaskPreview(recentHistory);
          restoreDraftForThread(currentThreadId);
          syncComposerHeight();
          requestChatContextMeterUpdate();
          flushPendingPromptAfterThread();
          showTab("chat");
          followLatest = true;
          scrollToLatest(true);
        }
      });

      updateStartupVisibility();
      renderThreadList();
      renderTaskPreview(recentHistory);
      renderHistoryPanel(recentHistory);
      resetRuntimeState();
      applyModeUI("auto");
      requestChatContextMeterUpdate();
      v.postMessage({ type: "check" });

      // If host handshake is delayed/blocked, fail open to setup so the panel never appears blank.
      setTimeout(() => {
        if (hostHandshakeReceived) return;
        if (setup) setup.style.display = "flex";
        if (app) app.style.display = "none";
        setRunState("Waiting for host");
        try {
          v.postMessage({ type: "check" });
        } catch {
          // no-op
        }
      }, 1800);

      window.addEventListener("error", () => {
        if (setup) setup.style.display = "flex";
        if (app) app.style.display = "none";
        setRunState("UI error");
      });

      window.addEventListener("unhandledrejection", () => {
        if (setup) setup.style.display = "flex";
        if (app) app.style.display = "none";
        setRunState("UI error");
      });

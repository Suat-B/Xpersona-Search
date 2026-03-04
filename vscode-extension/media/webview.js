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
          const text = String(t.value || "").replace(/\r?\n+$/g, "").trim();
          if (!text) return;
          t.value = "";
          try {
            v.postMessage({
              type: "send",
              text,
              parallel: false,
              model: "Playground AI",
              reasoning: "medium",
              attachments: [],
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
      const chips = document.getElementById("chips");
      const timeline = document.getElementById("timeline");
      const history = document.getElementById("history");
      const index = document.getElementById("index");
      const agents = document.getElementById("agents");
      const exec = document.getElementById("exec");
      const taskList = document.getElementById("taskList");
      const viewAllTasks = document.getElementById("viewAllTasks");
      const settingsToggle = document.getElementById("settingsToggle");
      const settingsGroup = document.getElementById("settingsGroup");
      const modeQuick = document.getElementById("modeQuick");
      const safetyQuick = document.getElementById("safetyQuick");
      const parallelQuick = document.getElementById("parallelQuick");
      const uploadBtn = document.getElementById("uploadBtn");
      const uploadInput = document.getElementById("uploadInput");
      const uploadCount = document.getElementById("uploadCount");
      const planToggle = document.getElementById("planToggle");
      const ctxToggle = document.getElementById("ctxToggle");
      const input = document.getElementById("t");
      const sendBtn = document.getElementById("s");
      const modelSel = document.getElementById("modelSel");
      const reasonSel = document.getElementById("reasonSel");
      const contextPill = document.getElementById("contextPill");
      const jumpLatestBtn = document.getElementById("jumpLatest");
      const idleMark = document.getElementById("idleMark");
      const startup = document.querySelector(".startup");
      const runState = document.getElementById("runState");
      const modeBanner = document.getElementById("modeBanner");
      const modeHint = document.getElementById("modeHint");
      const actionMenuBtn = document.getElementById("actionMenuBtn");
      const actionMenu = document.getElementById("actionMenu");
      const actionMenuClose = document.getElementById("actionMenuClose");

      let streamBubble = null;
      let streaming = false;
      let followLatest = true;
      let terminalBubble = null;
      let currentMode = "auto";
      let lastSendAt = 0;
      let attachedFiles = [];
      let allowNextLineBreak = false;

      function eventTargetElement(target) {
        if (!target) return null;
        if (target.nodeType === 1) return target;
        return target.parentElement || null;
      }

      function postSendFallback(rawText) {
        const text = String(rawText || "").replace(/\r?\n+$/g, "").trim();
        if (!text) return;
        const parallelToggle = document.getElementById("parallel");
        const parallelEnabled = Boolean(
          (parallelQuick && parallelQuick.checked) || (parallelToggle && parallelToggle.checked)
        );
        v.postMessage({
          type: "send",
          text,
          parallel: parallelEnabled,
          model: modelSel ? modelSel.value : "Playground AI",
          reasoning: reasonSel ? reasonSel.value : "medium",
          attachments: attachedFiles.map((f) => ({ name: f.name, size: f.size, type: f.type })),
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
        const target = eventTargetElement(e.target);
        if (!target || !target.closest("#s")) return;
        triggerSendSafe(e);
      }, true);
      function bindEmergencyComposer() {
        const t = document.getElementById("t");
        const s = document.getElementById("s");
        if (t && t.dataset.sendBound !== "1") {
          t.addEventListener("keydown", emergencyComposerKeydown, true);
          t.addEventListener("beforeinput", emergencyComposerBeforeInput, true);
          t.dataset.sendBound = "1";
        }
        if (s && s.dataset.sendBound !== "1") {
          s.addEventListener("click", triggerSendSafe, true);
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

      function esc(s) {
        return String(s ?? "")
          .replaceAll("&", "&amp;")
          .replaceAll("<", "&lt;")
          .replaceAll(">", "&gt;")
          .replaceAll('"', "&quot;");
      }

      function updateStartupVisibility() {
        if (startup) startup.classList.remove("hidden");
        if (idleMark) {
          const hasMessages = Boolean(msgs && msgs.childElementCount > 0);
          idleMark.classList.toggle("hidden", hasMessages || streaming);
        }
      }

      function applyModeUI(modeValue) {
        const normalized = modeValue === "plan" || modeValue === "yolo" ? modeValue : "auto";
        currentMode = normalized;

        const modeSel = document.getElementById("mode");
        if (modeSel) modeSel.value = normalized;
        if (modeQuick) modeQuick.value = normalized;

        const planActive = normalized === "plan";
        if (planToggle) planToggle.checked = planActive;
        if (modeBanner) modeBanner.classList.toggle("hidden", !planActive);
        if (modeHint) modeHint.textContent = planActive ? "Plan mode enabled" : "Auto execution enabled";
      }

      function updateAttachmentUI() {
        const count = attachedFiles.length;
        if (uploadCount) {
          uploadCount.textContent = count === 0
            ? "No files selected"
            : (count === 1 ? "1 file selected" : count + " files selected");
        }
        const imagesPill = document.getElementById("ac");
        if (imagesPill) imagesPill.textContent = "images:" + count;
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
        if (followLatest) scrollToLatest();
        return d;
      }

      function isNearBottom(el, threshold = 80) {
        return el.scrollHeight - (el.scrollTop + el.clientHeight) <= threshold;
      }

      function scrollToLatest(force = false) {
        if (!chatPanel) return;
        if (force || followLatest) {
          chatPanel.scrollTop = chatPanel.scrollHeight;
        }
        updateJump();
      }

      function updateJump() {
        if (!chatPanel || !jumpLatestBtn) return;
        const shouldShow = !isNearBottom(chatPanel);
        jumpLatestBtn.classList.toggle("show", shouldShow);
      }

      function addMessage(text, cls) {
        const d = createBubble(cls);
        const body = d.querySelector(".m-body");
        if (body) body.textContent = text;
        return d;
      }

      function addTypingBubble() {
        const d = createBubble("a typing");
        const body = d.querySelector(".m-body");
        if (body) body.innerHTML = '<span class="typing-dots"><i></i><i></i><i></i></span>';
        return d;
      }

      function ensureTerminalBubble() {
        if (terminalBubble && terminalBubble.isConnected) return terminalBubble;
        terminalBubble = createBubble("cmd terminal-live");
        const body = terminalBubble.querySelector(".m-body");
        if (body) {
          body.innerHTML =
            '<div class="term-head">' +
              '<span class="term-title">Terminal</span>' +
              '<span class="term-state" data-term-state>Idle</span>' +
            "</div>" +
            '<div class="term-body" data-term-body></div>';
        }
        return terminalBubble;
      }

      function setTerminalState(label) {
        const b = ensureTerminalBubble();
        const state = b.querySelector("[data-term-state]");
        if (state) state.textContent = label;
      }

      function addTerminalLine(text, kind = "info") {
        const b = ensureTerminalBubble();
        const body = b.querySelector("[data-term-body]");
        if (!body) return;
        const row = document.createElement("div");
        row.className = "term-line " + kind;
        row.textContent = text;
        body.appendChild(row);
        if (followLatest) scrollToLatest();
      }

      function parseExecCommandResult(message) {
        const m = /^([A-Z]+)\s+command\s+(.+?)\s+\[exit\s+(-?\d+|\?)\](?:\s+\((.+)\))?$/i.exec(String(message || "").trim());
        if (!m) return null;
        return { status: String(m[1] || "").toUpperCase(), command: m[2] || "", exit: m[3] || "?", reason: m[4] || "" };
      }

      function normalizeAssistantText(raw) {
        const text = String(raw ?? "").trim();
        if (!text.startsWith("{") || !text.includes('"final"')) return text;
        const m = /"final"\\s*:\\s*"([\\s\\S]*?)"/i.exec(text);
        if (!m || !m[1]) return text;
        try {
          return JSON.parse('"' + m[1].replace(/\\\\/g, "\\\\\\\\").replace(/"/g, '\\"') + '"');
        } catch {
          return m[1].replace(/\\\\n/g, "\\n").replace(/\\\\\"/g, '"');
        }
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

      function addEditPreview(path, patch) {
        const d = createBubble("a change");
        const body = d.querySelector(".m-body");
        if (!body) return d;

        const parsed = parseDiffStats(patch);
        body.innerHTML =
          '<div class="change-head">' +
            '<span class="change-count">1 file changed</span>' +
          '</div>' +
          '<div class="change-file">' +
            '<span class="change-path">' + esc(path || "unknown") + '</span>' +
            '<span class="change-stats"><span class="add">+' + esc(parsed.adds) + '</span> <span class="del">-' + esc(parsed.dels) + '</span></span>' +
          '</div>';
        return d;
      }

      function showTab(p) {
        document.querySelectorAll(".tab").forEach((t) => t.classList.remove("active"));
        document.querySelectorAll(".panel").forEach((t) => t.classList.remove("active"));
        const tab = document.querySelector('.tab[data-p="' + p + '"]');
        const panel = document.getElementById(p);
        if (tab) tab.classList.add("active");
        if (panel) panel.classList.add("active");
      }

      function showHistoryPanel(loadingText) {
        showTab("history");
        if (history && loadingText) {
          history.innerHTML =
            '<div class="item">' +
              '<div class="item-title">Session History</div>' +
              '<div class="item-sub">' + esc(loadingText) + '</div>' +
            '</div>' +
            '<div class="item">' +
              '<div class="item-title">Tip</div>' +
              '<div class="item-sub">Select any row to load that conversation into chat.</div>' +
            '</div>';
        }
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
        showTab("chat");
        addMessage("Replaying latest session from " + sourceLabel + "...", "cmd");
        v.postMessage({ type: "replay" });
      }

      function setActionMenuOpen(open) {
        if (!actionMenu) return;
        actionMenu.classList.toggle("hidden", !open);
        actionMenu.setAttribute("aria-hidden", open ? "false" : "true");
        if (actionMenuBtn) actionMenuBtn.setAttribute("aria-expanded", open ? "true" : "false");
      }

      function onMenuAction(action) {
        if (!action) return;
        if (action.startsWith("show:")) {
          const panel = action.split(":")[1];
          if (panel) showTab(panel);
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

      function setStreaming(isBusy) {
        streaming = isBusy;
        const activeSendBtn = sendBtn || document.getElementById("s");
        if (activeSendBtn) activeSendBtn.disabled = isBusy;
        if (modelSel) modelSel.disabled = isBusy;
        if (reasonSel) reasonSel.disabled = isBusy;
        if (uploadBtn) uploadBtn.disabled = isBusy;
        if (activeSendBtn) activeSendBtn.textContent = isBusy ? "..." : "â†‘";
        if (runState) runState.textContent = isBusy ? "Working..." : "Local";
        if (!isBusy) updateJump();
        updateStartupVisibility();
      }

      function sendCurrent() {
        try {
          const composerInput = input || document.getElementById("t");
          if (!composerInput) return;
          const text = String(composerInput.value || "").replace(/\r?\n+$/g, "").trim();
          if (!text || streaming) return;

          const now = Date.now();
          if (now - lastSendAt < 120) return;
          lastSendAt = now;

          addMessage(text, "u");
          composerInput.value = "";
          setStreaming(true);
          streamBubble = addTypingBubble();

          const parallelToggle = document.getElementById("parallel");
          const parallelEnabled = Boolean(
            (parallelQuick && parallelQuick.checked) || (parallelToggle && parallelToggle.checked)
          );
          const attachmentMeta = attachedFiles.map((f) => ({ name: f.name, size: f.size, type: f.type }));

          v.postMessage({
            type: "send",
            text,
            parallel: parallelEnabled,
            model: modelSel ? modelSel.value : "Playground AI",
            reasoning: reasonSel ? reasonSel.value : "medium",
            attachments: attachmentMeta,
          });
          if (runState) runState.textContent = "Sent";
          attachedFiles = [];
          if (uploadInput) uploadInput.value = "";
          updateAttachmentUI();
          scrollToLatest(true);
        } catch (e) {
          setStreaming(false);
          streamBubble = null;
          addMessage("Error: " + (e && e.message ? e.message : String(e)), "e");
        }
      }

      document.querySelectorAll(".tab").forEach((b) => (b.onclick = () => showTab(b.dataset.p)));
      const saveKeyBtn = document.getElementById("ks");
      if (saveKeyBtn) {
        saveKeyBtn.onclick = () => {
          const keyInput = document.getElementById("k");
          const key = keyInput ? keyInput.value.trim() : "";
          if (key) v.postMessage({ type: "saveKey", key });
        };
      }
      if (uploadBtn && uploadInput) {
        uploadBtn.onclick = (e) => {
          e.preventDefault();
          uploadInput.click();
        };
        uploadInput.onchange = () => {
          attachedFiles = Array.from(uploadInput.files || []);
          updateAttachmentUI();
        };
      }
      if (ctxToggle && contextPill) {
        const applyContextPill = () => {
          contextPill.classList.toggle("hidden", !ctxToggle.checked);
        };
        ctxToggle.onchange = applyContextPill;
        applyContextPill();
      }
      if (planToggle) {
        planToggle.onchange = () => {
          const nextMode = planToggle.checked ? "plan" : "auto";
          applyModeUI(nextMode);
          v.postMessage({ type: "setMode", value: nextMode });
        };
      }
      updateAttachmentUI();
      if (actionMenuBtn && actionMenu) {
        actionMenuBtn.onclick = (e) => {
          e.preventDefault();
          e.stopPropagation();
          const willOpen = actionMenu.classList.contains("hidden");
          setActionMenuOpen(willOpen);
        };
        if (actionMenuClose) {
          actionMenuClose.onclick = (e) => {
            e.preventDefault();
            e.stopPropagation();
            setActionMenuOpen(false);
          };
        }
        actionMenu.addEventListener("click", (e) => {
          if (e.target === actionMenu) setActionMenuOpen(false);
        });
        actionMenu.querySelectorAll("[data-menu-action]").forEach((btn) => {
          btn.addEventListener("click", (e) => {
            e.preventDefault();
            e.stopPropagation();
            onMenuAction(btn.getAttribute("data-menu-action"));
            setActionMenuOpen(false);
          });
        });
      }

      const composerFormEl = document.getElementById("composerForm");
      const sendBtnEl = document.getElementById("s");
      if (composerFormEl) composerFormEl.addEventListener("submit", triggerSendSafe, true);
      if (sendBtnEl) {
        sendBtnEl.onclick = triggerSendSafe;
        sendBtnEl.addEventListener("click", triggerSendSafe, true);
        sendBtnEl.addEventListener("pointerup", triggerSendSafe, true);
      }
      // Hard fallback: capture send clicks globally in case local handlers are bypassed.
      document.addEventListener("click", (e) => {
        const target = eventTargetElement(e.target);
        if (!target) return;
        if (actionMenu && actionMenuBtn) {
          const insideMenuSheet = target.closest(".action-menu-sheet");
          const menuBtn = target.closest("#actionMenuBtn");
          if (!insideMenuSheet && !menuBtn) setActionMenuOpen(false);
        }
        const sendTarget = target.closest("#s");
        if (!sendTarget) return;
        triggerSendSafe(e);
      }, true);
      document.addEventListener("keydown", (e) => {
        if (e.key === "Escape") setActionMenuOpen(false);
      }, true);
      document.addEventListener("keyup", (e) => {
        if (e.key === "Enter" || e.code === "Enter" || e.code === "NumpadEnter") {
          allowNextLineBreak = false;
        }
      }, true);
      const onComposerKeydown = (e) => {
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
        });
        input.onkeydown = onComposerKeydown;
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
      const modeSelect = document.getElementById("mode");
      const safetySelect = document.getElementById("safety");
      const parallelSelect = document.getElementById("parallel");
      const historyBtn = document.getElementById("hist");
      const replayBtn = document.getElementById("rep");
      const rebuildBtn = document.getElementById("idx");
      const histQuick = document.getElementById("histQuick");
      const repQuick = document.getElementById("repQuick");
      const idxQuick = document.getElementById("idxQuick");

      if (clearBtn) {
        clearBtn.onclick = () => {
          while (msgs.firstChild) msgs.removeChild(msgs.firstChild);
          chips.innerHTML = "";
          updateStartupVisibility();
          setStreaming(false);
          v.postMessage({ type: "clear" });
        };
      }
      if (modeSelect) {
        modeSelect.onchange = (e) => {
          applyModeUI(e.target.value);
          v.postMessage({ type: "setMode", value: e.target.value });
        };
      }
      if (safetySelect) {
        safetySelect.onchange = (e) => {
          if (safetyQuick) safetyQuick.value = e.target.value;
          v.postMessage({ type: "setSafety", value: e.target.value });
        };
      }
      if (modeQuick) modeQuick.onchange = (e) => {
        applyModeUI(e.target.value);
        v.postMessage({ type: "setMode", value: e.target.value });
      };
      if (safetyQuick) safetyQuick.onchange = (e) => {
        if (safetySelect) safetySelect.value = e.target.value;
        v.postMessage({ type: "setSafety", value: e.target.value });
      };
      if (parallelQuick) {
        parallelQuick.onchange = () => {
          if (parallelSelect) parallelSelect.checked = parallelQuick.checked;
        };
      }
      if (settingsToggle && settingsGroup) {
        settingsToggle.onclick = () => {
          settingsGroup.classList.toggle("show");
        };
      }
      if (historyBtn) {
        historyBtn.onclick = () => {
          showHistoryPanel("Refreshing history...");
          v.postMessage({ type: "history" });
        };
      }
      if (replayBtn) {
        replayBtn.onclick = () => {
          triggerReplayFromUI("toolbar");
        };
      }
      if (rebuildBtn) {
        rebuildBtn.onclick = () => {
          showIndexPanel("Rebuilding semantic index...");
          v.postMessage({ type: "indexRebuild" });
        };
      }
      if (viewAllTasks) {
        viewAllTasks.onclick = () => {
          showHistoryPanel("Loading all sessions...");
          v.postMessage({ type: "history" });
        };
      }
      if (histQuick) {
        histQuick.onclick = () => {
          showHistoryPanel("Loading latest sessions...");
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
          followLatest = isNearBottom(chatPanel);
          updateJump();
        });
      }

      window.addEventListener("message", (ev) => {
        const m = ev.data;
        if (m.type === "sendAck") {
          if (runState) runState.textContent = "Working...";
        } else if (m.type === "api") {
          if (m.ok) {
            if (setup) setup.style.display = "none";
            if (app) app.style.display = "flex";
            v.postMessage({ type: "history" });
          } else {
            if (setup) setup.style.display = "flex";
            if (app) app.style.display = "none";
          }
        } else if (m.type === "mode") {
          applyModeUI(m.value);
        } else if (m.type === "safety") {
          if (safetySelect) safetySelect.value = m.value;
          if (safetyQuick) safetyQuick.value = m.value;
        } else if (m.type === "att") {
          const count = Number(m.count || 0);
          const imagesPill = document.getElementById("ac");
          if (imagesPill) imagesPill.textContent = "images:" + count;
          if (uploadCount && attachedFiles.length === 0) {
            uploadCount.textContent = count === 0
              ? "No files selected"
              : (count === 1 ? "1 file selected" : count + " files selected");
          }
        } else if (m.type === "start") {
          setStreaming(true);
        } else if (m.type === "token") {
          if (streamBubble) {
            const body = streamBubble.querySelector(".m-body");
            if (streamBubble.classList.contains("typing")) {
              streamBubble.classList.remove("typing");
              if (body) body.textContent = "";
            }
            if (body) body.textContent += (m.text || "");
            if (followLatest) scrollToLatest();
          } else {
            streamBubble = addMessage(normalizeAssistantText(m.text || ""), "a");
          }
        } else if (m.type === "end") {
          if (streamBubble) {
            const body = streamBubble.querySelector(".m-body");
            if (body) body.textContent = normalizeAssistantText(body.textContent || "");
          }
          setStreaming(false);
          streamBubble = null;
          if (followLatest) scrollToLatest();
        } else if (m.type === "status") {
          const statusText = String(m.text || "");
          if (/^Executing\s+\d+\s+action\(s\)\.\.\./i.test(statusText)) {
            terminalBubble = null;
            setTerminalState("Running");
            addTerminalLine("Starting execution...", "info");
            if (runState) runState.textContent = "Executing";
          } else if (/^Execute finished:/i.test(statusText)) {
            setTerminalState("Done");
            addTerminalLine(statusText, "summary");
            if (runState) runState.textContent = "Local";
          } else if (/^Thinking/i.test(statusText) || /^Ran\s+/i.test(statusText)) {
            addMessage(statusText, "cmd");
          } else {
            addMessage(statusText, "a");
          }
        } else if (m.type === "assistant") {
          addMessage(m.text || "", "a");
        } else if (m.type === "editPreview") {
          addEditPreview(m.path || "unknown", m.patch || "");
        } else if (m.type === "terminalCommand") {
          setTerminalState("Running");
          addTerminalLine("$ " + (m.command || ""), "cmdline");
          addMessage("Ran " + (m.command || "command"), "cmd");
          if (runState) runState.textContent = "Executing";
        } else if (m.type === "fileAction") {
          addMessage("[file] wrote " + (m.path || "unknown"), "cmd");
        } else if (m.type === "meta") {
          chips.innerHTML = "";
          if (modelSel?.value) {
            const mm = document.createElement("span");
            mm.className = "chip";
            mm.textContent = "Model " + modelSel.value;
            chips.appendChild(mm);
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
          if (m.data?.confidence !== undefined) {
            const c = document.createElement("span");
            c.className = "chip";
            c.textContent = "Confidence " + Math.round(m.data.confidence * 100) + "%";
            chips.appendChild(c);
          }
          if (m.data?.risk) {
            const r = document.createElement("span");
            r.className = "chip";
            r.textContent = "Risk " + m.data.risk.blastRadius + " / rollback " + m.data.risk.rollbackComplexity;
            chips.appendChild(r);
          }
        } else if (m.type === "timeline") {
          const rows = m.data || [];
          timeline.innerHTML = rows.map((x) => (
            '<div class="item">' +
              '<div class="item-title">' + esc(new Date(x.ts).toLocaleTimeString()) + ' - ' + esc(x.phase) + '</div>' +
              '<div class="item-sub">' + esc(x.detail) + '</div>' +
            '</div>'
          )).join("") || "No timeline";
        } else if (m.type === "historyItems") {
          const rows = m.data || [];
          history.innerHTML = rows.map((x) => (
            '<div class="item" data-id="' + esc(x.id) + '">' +
              '<div class="item-title">' + esc(x.title) + '</div>' +
              '<div class="item-sub">' + esc(x.mode) + ' - ' + esc(String(x.id).slice(0, 8)) + '</div>' +
            '</div>'
          )).join("") || "No history";
          history.querySelectorAll(".item").forEach((el) => {
            el.onclick = () => v.postMessage({ type: "openSession", id: el.getAttribute("data-id") });
          });
          if (taskList) {
            taskList.innerHTML = rows.slice(0, 8).map((x) => (
              '<div class="task-entry" data-id="' + esc(x.id) + '">' +
                '<div class="task-main">' +
                  '<div class="task-title">' + esc(x.title || "Untitled task") + '</div>' +
                '</div>' +
                '<div class="task-right">' +
                  '<span class="task-mode">' + esc(String(x.mode || "auto")) + '</span>' +
                  '<span class="task-age">' + esc(shortAgeLabel(x.updatedAt)) + '</span>' +
                '</div>' +
              '</div>'
            )).join("") || '<div class="task-meta">No task history yet.</div>';
            taskList.querySelectorAll(".task-entry").forEach((el) => {
              el.onclick = () => v.postMessage({ type: "openSession", id: el.getAttribute("data-id") });
            });
          }
          if (viewAllTasks) viewAllTasks.textContent = "View all (" + rows.length + ")";
        } else if (m.type === "indexState") {
          index.innerHTML =
            '<div class="item"><div class="item-title">Chunks</div><div class="item-sub">' + esc(m.data?.chunks || 0) + '</div></div>' +
            '<div class="item"><div class="item-title">Freshness</div><div class="item-sub">' + esc(m.data?.freshness || "stale") + '</div></div>' +
            '<div class="item"><div class="item-title">Last matches</div><div class="item-sub">' + esc(m.data?.lastQueryMatches || 0) + '</div></div>' +
            '<div class="item"><div class="item-title">Last rebuild</div><div class="item-sub">' + esc(m.data?.lastRebuildAt || "n/a") + '</div></div>';
        } else if (m.type === "roundtable") {
          agents.textContent = JSON.stringify(m.data || {}, null, 2);
        } else if (m.type === "execLogs") {
          const rows = m.data || [];
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
          exec.innerHTML = rows.map((x) => (
            '<div class="item">' +
              '<div class="item-title">' + esc(String(x.level || "").toUpperCase()) + ' - ' + esc(new Date(x.ts).toLocaleTimeString()) + '</div>' +
              '<div class="item-sub">' + esc(x.message) + '</div>' +
            '</div>'
          )).join("") || "No execution logs";
        } else if (m.type === "pendingActions") {
          // Auto execution mode; pending count is reflected via status messages.
        } else if (m.type === "err") {
          setStreaming(false);
          streamBubble = null;
          addMessage("Error: " + m.text, "e");
          if (runState) runState.textContent = "Error";
        } else if (m.type === "prefill") {
          input.value = m.text || "";
        } else if (m.type === "load") {
          while (msgs.firstChild) msgs.removeChild(msgs.firstChild);
          (m.data || []).forEach((x) => addMessage(x.content, x.role === "user" ? "u" : "a"));
          updateStartupVisibility();
          showTab("chat");
          followLatest = true;
          scrollToLatest(true);
        }
      });

      updateStartupVisibility();
      applyModeUI("auto");
      v.postMessage({ type: "check" });

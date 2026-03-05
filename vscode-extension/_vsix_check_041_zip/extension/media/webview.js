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
            addMessage("Plan mode enabled. Add your request after /plan.", "cmd");
            return;
          }
          const text = parsed.text;
          if (!text) return;
          t.value = "";
          const earlyCtxToggle = document.getElementById("ctxToggle");
          const includeIdeContext = earlyCtxToggle ? Boolean(earlyCtxToggle.checked) : true;
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
      const jumpLatestBtn = document.getElementById("jumpLatest");
      const startup = document.querySelector(".startup");
      const runState = document.getElementById("runState");
      const modeBanner = document.getElementById("modeBanner");
      const planModeChip = document.getElementById("planModeChip");
      const actionMenuBtn = document.getElementById("actionMenuBtn");
      const actionMenu = document.getElementById("actionMenu");
      const actionMenuClose = document.getElementById("actionMenuClose");
      const newThreadQuick = document.getElementById("newThreadQuick");
      const historyQuick = document.getElementById("historyQuick");
      const backToChatQuick = document.getElementById("backToChatQuick");
      const apiKeyInline = document.getElementById("apiKeyInline");
      const apiKeyInlineSave = document.getElementById("apiKeyInlineSave");
      const newThreadBtn = document.getElementById("newThreadBtn");

      let streamBubble = null;
      let streaming = false;
      let followLatest = true;
      let terminalBubble = null;
      const DEFAULT_MODEL = "Playground 1";
      const MAX_DIFF_ROWS = 400;
      const seenEditPreviewKeys = new Set();
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

      function planAwareStateLabel(baseLabel) {
        const label = String(baseLabel || "Local");
        return currentMode === "plan" ? "Plan mode | " + label : label;
      }

      function setRunState(baseLabel) {
        if (!runState) return;
        runState.textContent = planAwareStateLabel(baseLabel);
      }

      function applyPlanVisualState(modeValue) {
        const planActive = modeValue === "plan";
        if (modeBanner) modeBanner.classList.toggle("hidden", !planActive);
        if (planModeChip) planModeChip.classList.toggle("hidden", !planActive);
      }

      function parseSlashModeCommand(rawText) {
        const trimmed = String(rawText || "").replace(/\r?\n+$/g, "").trim();
        if (!trimmed) {
          return { text: "", modeChanged: false, matchedPlan: false, preventSend: true };
        }

        let text = trimmed;
        let modeChanged = false;
        let matchedPlan = false;

        if (/^\/plan(?:\s+|$)/i.test(text)) {
          matchedPlan = true;
          if (currentMode !== "plan") {
            modeChanged = true;
            applyModeUI("plan");
            v.postMessage({ type: "setMode", value: "plan" });
          }
          text = text.replace(/^\/plan(?:\s+|$)/i, "").trim();
        }

        return {
          text,
          modeChanged,
          matchedPlan,
          preventSend: matchedPlan && !text,
        };
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

      function postSendFallback(rawText) {
        const parsed = parseSlashModeCommand(rawText);
        if (parsed.preventSend) {
          addMessage("Plan mode enabled. Add your request after /plan.", "cmd");
          return;
        }
        const text = parsed.text;
        if (!text) return;
        const parallelEnabled = Boolean(parallelQuick && parallelQuick.checked);
        const includeIdeContext = ctxToggle ? Boolean(ctxToggle.checked) : true;
        v.postMessage({
          type: "send",
          text,
          parallel: parallelEnabled,
          model: modelSel ? modelSel.value : DEFAULT_MODEL,
          reasoning: reasonSel ? reasonSel.value : "medium",
          includeIdeContext,
          workspaceContextLevel: "max",
          attachments: attachedFiles.map((f) => ({ mimeType: f.mimeType, name: f.name, dataUrl: f.dataUrl })),
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

      function saveCurrentDraft() {
        if (!input || !currentThreadId) return;
        threadDrafts[currentThreadId] = input.value || "";
      }

      function restoreDraftForThread(id) {
        if (!input) return;
        input.value = (id && threadDrafts[id]) ? threadDrafts[id] : "";
      }

      function isPinnedThread(id) {
        return pinnedIds.includes(String(id || ""));
      }

      function closeMentionMenu() {
        mentionItems = [];
        mentionActiveIndex = 0;
        mentionSearchToken = null;
        if (mentionMenu) {
          mentionMenu.classList.add("hidden");
          mentionMenu.innerHTML = "";
        }
      }

      function renderMentionMenu() {
        if (!mentionMenu) return;
        if (!mentionItems.length) {
          mentionMenu.classList.add("hidden");
          mentionMenu.innerHTML = "";
          return;
        }
        mentionMenu.classList.remove("hidden");
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
        const match = before.match(/(^|\s)@([^\s@]*)$/);
        if (match) {
          const query = String(match[2] || "");
          const atIndex = caret - query.length - 1;
          if (atIndex < 0) return null;
          return { mode: "mention", query, tokenIndex: atIndex, caret };
        }
        return null;
      }

      function scheduleMentionSearch() {
        const ctx = mentionContextFromInput();
        if (!ctx) {
          closeMentionMenu();
          return;
        }
        mentionSearchToken = ctx;
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
            if (kind === 'open') v.postMessage({ type: 'switchThread', id });
            else v.postMessage({ type: 'openSession', id });
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

      function esc(s) {
        return String(s ?? "")
          .replaceAll("&", "&amp;")
          .replaceAll("<", "&lt;")
          .replaceAll(">", "&gt;")
          .replaceAll('"', "&quot;");
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

      function updateStartupVisibility() {
        if (startup) startup.classList.remove("hidden");
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
      }

      function setAttachHint(text, isError = false) {
        if (!attachHint) return;
        attachHint.textContent = text || "";
        attachHint.classList.toggle("error", Boolean(isError));
      }

      function updateAttachmentUI(statusText, isError = false) {
        const count = attachedFiles.length;
        if (uploadBtn) uploadBtn.textContent = count > 0 ? "Attach (" + count + ")" : "Attach";
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
            '<details class="term-disclosure" open>' +
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
        const b = ensureTerminalBubble();
        const state = b.querySelector("[data-term-state]");
        if (state) state.textContent = label;
        if (label === "Running") {
          const disclosure = b.querySelector(".term-disclosure");
          if (disclosure) disclosure.open = true;
        }
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

      function normalizeAssistantText(raw) {
        const text = String(raw ?? "").trim();
        if (!text) return "";

        const candidate = extractJsonCandidate(text);
        if (candidate) {
          const parsed = parseFinalFromJson(candidate);
          if (parsed) return parsed;
          if (candidate.includes('\\"')) {
            const deEscaped = candidate.replace(/\\"/g, '"');
            const reparsed = parseFinalFromJson(deEscaped);
            if (reparsed) return reparsed;
          }
        }

        const normalized = text.includes('\\"final\\"') ? text.replace(/\\"/g, '"') : text;
        const m = normalized.match(/"final"\s*:\s*"([\s\S]*?)"/i);
        if (m && m[1]) {
          return m[1]
            .replace(/\\n/g, "\n")
            .replace(/\\"/g, '"')
            .replace(/\\\\/g, "\\")
            .trim();
        }
        return text;
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

      function renderUnifiedDiffRows(patchText, opts) {
        const options = opts || {};
        const maxRows = Number.isFinite(options.maxRows) ? Math.max(10, options.maxRows) : MAX_DIFF_ROWS;
        const lines = String(patchText || "").replace(/\r\n/g, "\n").split("\n");

        let i = 0;
        while (i < lines.length && !String(lines[i] || "").startsWith("@@")) i += 1;
        if (i >= lines.length) i = 0;

        let oldLine = 0;
        let newLine = 0;
        let rendered = 0;
        let truncated = false;
        const out = [];

        const row = (kind, oldNo, newNo, sig, text) => (
          '<div class="diff-row ' + kind + '">' +
            '<div class="ln old">' + esc(oldNo ? String(oldNo) : "") + "</div>" +
            '<div class="ln new">' + esc(newNo ? String(newNo) : "") + "</div>" +
            '<div class="sig">' + esc(sig || "") + "</div>" +
            '<div class="txt">' + esc(text || "") + "</div>" +
          "</div>"
        );

        for (; i < lines.length; i += 1) {
          if (rendered >= maxRows) {
            truncated = true;
            break;
          }

          const raw = String(lines[i] || "");
          if (!raw) continue;

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
            out.push(row("add", "", newLine, "+", raw.slice(1)));
            newLine += 1;
            rendered += 1;
            continue;
          }

          if (raw.startsWith("-") && !raw.startsWith("---")) {
            out.push(row("del", oldLine, "", "-", raw.slice(1)));
            oldLine += 1;
            rendered += 1;
            continue;
          }

          if (raw.startsWith(" ")) {
            out.push(row("ctx", oldLine, newLine, " ", raw.slice(1)));
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
          const fallback = lines.filter((x) => String(x || "").length > 0).slice(0, maxRows);
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
        const rendered = renderUnifiedDiffRows(patch || "", { maxRows: MAX_DIFF_ROWS });
        body.innerHTML =
          '<details class="diff-disclosure" open>' +
            '<summary class="diff-summary">' +
              '<span class="diff-summary-title">Edited file</span>' +
              '<span class="diff-stats"><span class="add">+' + esc(parsed.adds) + '</span> <span class="del">-' + esc(parsed.dels) + "</span></span>" +
            "</summary>" +
            '<div class="diff-card">' +
              '<div class="diff-head">' +
                '<div class="diff-title"><span class="diff-path">' + esc(path || "unknown") + "</span></div>" +
                '<div class="diff-stats"><span class="add">+' + esc(parsed.adds) + '</span> <span class="del">-' + esc(parsed.dels) + "</span></div>" +
              "</div>" +
              '<div class="diff-body">' + rendered.html + "</div>" +
              (rendered.truncated ? '<div class="diff-trunc">Truncated (showing first ' + esc(rendered.maxRows) + " lines)</div>" : "") +
            "</div>" +
          "</details>";
        return d;
      }

      function showTab(p) {
        document.querySelectorAll(".tab").forEach((t) => t.classList.remove("active"));
        document.querySelectorAll(".panel").forEach((t) => t.classList.remove("active"));
        const tab = document.querySelector('.tab[data-p="' + p + '"]');
        const panel = document.getElementById(p);
        if (tab) tab.classList.add("active");
        if (panel) panel.classList.add("active");
        if (historyQuick) historyQuick.classList.toggle("hidden", p !== "chat");
        if (backToChatQuick) backToChatQuick.classList.toggle("hidden", p === "chat");
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
        if (open && apiKeyInline) {
          setTimeout(() => apiKeyInline.focus(), 0);
        }
      }

      function startNewChat() {
        saveCurrentDraft();
        showTab("chat");
        v.postMessage({ type: "newThread" });
        setActionMenuOpen(false);
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
          /^Thinking/i.test(s)
        );
      }

      function setStreaming(isBusy) {
        streaming = isBusy;
        const activeSendBtn = sendBtn || document.getElementById("s");
        if (activeSendBtn) activeSendBtn.disabled = false;
        if (modelSel) modelSel.disabled = isBusy;
        if (reasonSel) reasonSel.disabled = isBusy;
        if (uploadBtn) uploadBtn.disabled = isBusy;
        if (activeSendBtn) {
          const sendLabel = currentMode === "plan" ? "Send planning request" : "Send";
          activeSendBtn.textContent = isBusy ? "Stop" : "Send";
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
      }

      function requestCancel() {
        if (!streaming) return;
        v.postMessage({ type: "cancel" });
        setRunState("Stopping...");
      }

      function sendCurrent() {
        try {
          closeMentionMenu();
          const composerInput = input || document.getElementById("t");
          if (!composerInput) return;
          const parsed = parseSlashModeCommand(composerInput.value || "");
          if (streaming) return;
          if (parsed.preventSend) {
            addMessage("Plan mode enabled. Add your request after /plan.", "cmd");
            return;
          }
          const text = parsed.text;
          if (!text) return;

          const now = Date.now();
          if (now - lastSendAt < 120) return;
          lastSendAt = now;

          clearPlanDecisionCard();
          const previewAttachments = attachedFiles.map((f) => ({
            name: f.name,
            mimeType: f.mimeType,
            dataUrl: f.dataUrl,
          }));
          const userBubble = addMessage(text, "u");
          appendUserAttachmentPreview(userBubble, previewAttachments);
          composerInput.value = "";
          if (currentThreadId) threadDrafts[currentThreadId] = "";
          setStreaming(true);
          streamBubble = addTypingBubble();

          const parallelEnabled = Boolean(parallelQuick && parallelQuick.checked);
          const attachmentPayload = previewAttachments;
          const includeIdeContext = ctxToggle ? Boolean(ctxToggle.checked) : true;

          v.postMessage({
            type: "send",
            text,
            parallel: parallelEnabled,
            model: modelSel ? modelSel.value : DEFAULT_MODEL,
            reasoning: reasonSel ? reasonSel.value : "medium",
            includeIdeContext,
            workspaceContextLevel: "max",
            attachments: attachmentPayload,
          });
          setRunState("Sent");
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
      if (newThreadBtn) {
        newThreadBtn.onclick = startNewChat;
      }
      if (newThreadQuick) {
        newThreadQuick.onclick = startNewChat;
      }
      if (historyQuick) {
        historyQuick.onclick = () => {
          showHistoryPanel("Loading chat history...");
          v.postMessage({ type: "history" });
        };
      }
      if (backToChatQuick) {
        backToChatQuick.onclick = () => {
          showTab("chat");
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
      if (apiKeyInlineSave) {
        apiKeyInlineSave.onclick = () => {
          const key = apiKeyInline ? apiKeyInline.value.trim() : "";
          if (!key) return;
          v.postMessage({ type: "saveKey", key });
          if (apiKeyInline) apiKeyInline.value = "";
          addMessage("API key updated.", "cmd");
          setActionMenuOpen(false);
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
        ctxToggle.onchange = () => {
          if (contextPill) contextPill.textContent = ctxToggle.checked ? "IDE: on" : "IDE: off";
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
        if (e.key === "Escape") setActionMenuOpen(false);
      }, true);
      document.addEventListener("keyup", (e) => {
        if (e.key === "Enter" || e.code === "Enter" || e.code === "NumpadEnter") {
          allowNextLineBreak = false;
        }
      }, true);
      const onComposerKeydown = (e) => {
        if (mentionsEnabled && mentionItems.length) {
          if (e.key === "ArrowDown") {
            e.preventDefault();
            mentionActiveIndex = (mentionActiveIndex + 1) % mentionItems.length;
            renderMentionMenu();
            return;
          }
          if (e.key === "ArrowUp") {
            e.preventDefault();
            mentionActiveIndex = (mentionActiveIndex - 1 + mentionItems.length) % mentionItems.length;
            renderMentionMenu();
            return;
          }
          if (e.key === "Enter" || e.key === "Tab") {
            if (!e.shiftKey && !e.altKey && !e.ctrlKey && !e.metaKey) {
              e.preventDefault();
              e.stopPropagation();
              const active = mentionItems[mentionActiveIndex] || mentionItems[0];
              if (active) applyMentionSelection(active.path);
              return;
            }
          }
          if (e.key === "Escape") {
            e.preventDefault();
            closeMentionMenu();
            return;
          }
        }
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
        if (streaming) {
          requestCancel();
          return;
        }
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
          if (currentThreadId) {
            threadDrafts[currentThreadId] = input.value || "";
          }
          scheduleMentionSearch();
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
          clearPlanDecisionCard();
          while (msgs.firstChild) msgs.removeChild(msgs.firstChild);
          chips.innerHTML = "";
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
      if (safetyQuick) {
        safetyQuick.addEventListener("change", (e) => {
          v.postMessage({ type: "setSafety", value: e.target.value });
        });
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
          setRunState("Working...");
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
          renderMentionMenu();
        } else if (m.type === "att") {
          const count = Number(m.count || 0);
          if (uploadCount && attachedFiles.length === 0) {
            uploadCount.textContent = count === 0
              ? "No images selected."
              : (count === 1 ? "1 image selected." : count + " images selected.");
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
          const shouldShowPlanDecision = Boolean(streamBubble) && currentMode === "plan";
          if (streamBubble) {
            const body = streamBubble.querySelector(".m-body");
            if (body) body.textContent = normalizeAssistantText(body.textContent || "");
          }
          setStreaming(false);
          streamBubble = null;
          activeProgressState = "";
          setRunState("Local");
          if (shouldShowPlanDecision) showPlanDecisionCard();
          if (followLatest) scrollToLatest();
        } else if (m.type === "status") {
          const statusText = String(m.text || "");
          const now = Date.now();
          if (statusText && statusText === lastStatusText && now - lastStatusAt < 2500) {
            return;
          }
          lastStatusText = statusText;
          lastStatusAt = now;

          if (/^Executing\s+\d+\s+action\(s\)\.\.\./i.test(statusText)) {
            terminalBubble = null;
            setTerminalState("Running");
            addTerminalLine("Starting execution...", "info");
            setProgressState("Executing");
          } else if (/^Execute finished:/i.test(statusText)) {
            setTerminalState("Done");
            addTerminalLine(statusText, "summary");
            activeProgressState = "";
            setRunState(streaming ? "Working..." : "Local");
          } else if (isProgressOnlyStatus(statusText)) {
            if (statusText === activeProgressState) return;
            setProgressState(statusText);
          } else if (/^Ran\s+/i.test(statusText)) {
            addMessage(statusText, "cmd");
          } else {
            addMessage(statusText, "a");
          }
        } else if (m.type === "assistant") {
          addMessage(m.text || "", "a");
          if (currentMode === "plan") showPlanDecisionCard();
        } else if (m.type === "editPreview") {
          addEditPreview(m.path || "unknown", m.patch || "");
        } else if (m.type === "terminalCommand") {
          setTerminalState("Running");
          addTerminalLine("$ " + (m.command || ""), "cmdline");
          addMessage("Ran " + (m.command || "command"), "cmd");
          setProgressState("Executing");
        } else if (m.type === "fileAction") {
          const status = String(m.status || "applied");
          const reason = m.reason ? " (" + String(m.reason) + ")" : "";
          addMessage("[file] " + status + " " + (m.path || "unknown") + reason, "cmd");
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
        } else if (m.type === "actionOutcome") {
          const data = m.data || {};
          const filesChanged = Number(data.filesChanged || 0);
          const checksRun = Number(data.checksRun || 0);
          const quality = String(data.quality || "unknown");
          const summary = String(data.summary || "");
          const outcome = [
            "Action outcome",
            "Files changed: " + filesChanged,
            "Checks run: " + checksRun,
            "Result quality: " + quality,
            summary ? summary : "",
          ].filter(Boolean).join("\n");
          addMessage(outcome, quality === "good" ? "cmd" : "a");
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
          currentThreadId = data.activeThreadId || null;
          openChats = Array.isArray(data.openChats) ? data.openChats : [];
          recentHistory = Array.isArray(data.recentHistory) ? data.recentHistory : [];
          pinnedIds = Array.isArray(data.pinnedIds) ? data.pinnedIds.map((id) => String(id || "")) : [];
          renderThreadList();
          restoreDraftForThread(currentThreadId);
        } else if (m.type === "historyItems") {
          const rows = m.data || [];
          recentHistory = rows;
          renderThreadList();
          history.innerHTML = rows.map((x) => (
            '<div class="item" data-id="' + esc(x.id) + '">' +
              '<div class="item-title">' + esc(x.title) + '</div>' +
              '<div class="item-sub">' + esc(x.mode) + ' - ' + esc(String(x.id).slice(0, 8)) + '</div>' +
            '</div>'
          )).join("") || "No history";
          history.querySelectorAll(".item").forEach((el) => {
            el.onclick = () => {
              saveCurrentDraft();
              v.postMessage({ type: "openSession", id: el.getAttribute("data-id") });
            };
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
              el.onclick = () => {
                saveCurrentDraft();
                v.postMessage({ type: "openSession", id: el.getAttribute("data-id") });
              };
            });
          }
          if (viewAllTasks) viewAllTasks.textContent = "View all (" + rows.length + ")";
        } else if (m.type === "indexState") {
          index.innerHTML =
            '<div class="item"><div class="item-title">Chunks</div><div class="item-sub">' + esc(m.data?.chunks || 0) + '</div></div>' +
            '<div class="item"><div class="item-title">Freshness</div><div class="item-sub">' + esc(m.data?.freshness || "stale") + '</div></div>' +
            '<div class="item"><div class="item-title">Last matches</div><div class="item-sub">' + esc(m.data?.lastQueryMatches || 0) + '</div></div>' +
            '<div class="item"><div class="item-title">Last rebuild</div><div class="item-sub">' + esc(m.data?.lastRebuildAt || "n/a") + '</div></div>';
        } else if (m.type === "contextStatus") {
          if (contextPill) {
            const enabled = m.data?.enabled !== false;
            const fresh = String(m.data?.indexFreshness || "cold");
            const snippets = Number(m.data?.snippets || 0);
            contextPill.textContent = enabled
              ? "IDE: on Ã‚Â· Index: " + fresh + " Ã‚Â· Snippets: " + snippets
              : "IDE: off";
          }
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
          clearPlanDecisionCard();
          setStreaming(false);
          streamBubble = null;
          addMessage("Error: " + m.text, "e");
          setRunState("Error");
        } else if (m.type === "prefill") {
          input.value = m.text || "";
        } else if (m.type === "load") {
          clearPlanDecisionCard();
          if (m.threadId !== undefined) currentThreadId = m.threadId;
          while (msgs.firstChild) msgs.removeChild(msgs.firstChild);
          (m.data || []).forEach((x) => {
            const body = x.role === "assistant" ? normalizeAssistantText(x.content) : x.content;
            addMessage(body, x.role === "user" ? "u" : "a");
          });
          updateStartupVisibility();
          renderThreadList();
          restoreDraftForThread(currentThreadId);
          showTab("chat");
          followLatest = true;
          scrollToLatest(true);
        }
      });

      updateStartupVisibility();
      renderThreadList();
      applyModeUI("auto");
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

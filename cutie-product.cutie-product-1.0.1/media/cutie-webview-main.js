const vscode = window.__cutieVscodeApi;
const ICON_SUBMIT = window.__cutieComposerIcons.submit;
const ICON_STOP = window.__cutieComposerIcons.stop;
    const workspaceShell = document.getElementById('workspaceShell');
    const currentChatTitle = document.getElementById('currentChatTitle');
    const backgroundStatusPill = document.getElementById('backgroundStatusPill');
    const historyToggle = document.getElementById('historyToggle');
    const artifactsToggle = document.getElementById('artifactsToggle');
    const historyDrawer = document.getElementById('historyDrawer');
    const artifactsDrawer = document.getElementById('artifactsDrawer');
    const drawerScrim = document.getElementById('drawerScrim');
    const historyCount = document.getElementById('historyCount');
    const artifactsCount = document.getElementById('artifactsCount');
    const historyRefreshBtn = document.getElementById('historyRefreshBtn');
    const historyCloseBtn = document.getElementById('historyCloseBtn');
    const artifactsCloseBtn = document.getElementById('artifactsCloseBtn');
    const artifactsList = document.getElementById('artifactsList');
    const composerForm = document.getElementById('composerForm');
    const input = document.getElementById('input');
    const chat = document.getElementById('chat');
    const sessions = document.getElementById('sessionList');
    const mentions = document.getElementById('mentions');
    const authLabel = document.getElementById('authLabel');
    const authChip = document.getElementById('authChip');
    const authStatusButton = document.getElementById('authStatusButton');
    const desktopSummaryPanel = document.getElementById('desktopSummaryPanel');
    const runtimeLine = document.getElementById('runtimeLine');
    const promptQueueWrap = document.getElementById('promptQueueWrap');
    const promptQueueList = document.getElementById('promptQueueList');
    const promptQueueCount = document.getElementById('promptQueueCount');
    const settingsToggle = document.getElementById('settingsToggle');
    const settingsMenu = document.getElementById('settingsMenu');
    const sendBtn = document.getElementById('sendBtn');
    const objectivesPanel = document.getElementById('objectivesPanel');
    const binaryPanel = document.getElementById('binaryPanel');
    const binaryPanelToggle = document.getElementById('binaryPanelToggle');
    const binaryPanelBody = document.getElementById('binaryPanelBody');
    const binaryStatusChip = document.getElementById('binaryStatusChip');
    const binaryProgressFill = document.getElementById('binaryProgressFill');
    const binaryGuideCopy = document.getElementById('binaryGuideCopy');
    const binaryPromptInput = document.getElementById('binaryPromptInput');
    const binaryMeta = document.getElementById('binaryMeta');
    const binaryActivityLog = document.getElementById('binaryActivityLog');
    const binaryGenerateBtn = document.getElementById('binaryGenerateBtn');
    const binaryRefineBtn = document.getElementById('binaryRefineBtn');
    const binaryBranchBtn = document.getElementById('binaryBranchBtn');
    const binaryRewindBtn = document.getElementById('binaryRewindBtn');
    const binaryValidateBtn = document.getElementById('binaryValidateBtn');
    const binaryPublishBtn = document.getElementById('binaryPublishBtn');
    const binaryCancelBtn = document.getElementById('binaryCancelBtn');
    const binaryConfigureBtn = document.getElementById('binaryConfigureBtn');
    const binaryExecuteBtn = document.getElementById('binaryExecuteBtn');
    const binaryEntryInput = document.getElementById('binaryEntryInput');
    const binaryAdvancedControls = document.getElementById('binaryAdvancedControls');
    const binaryRuntimeRow = document.getElementById('binaryRuntimeRow');
    const binaryExecuteRow = document.getElementById('binaryExecuteRow');
    const binaryRuntimeSelect = document.getElementById('binaryRuntimeSelect');
    const binaryStarterButtons = Array.from(document.querySelectorAll('[data-binary-prompt]'));
    const settingsBinaryConfigure = document.getElementById('settingsBinaryConfigure');
    const drafts = new Map();
    const draftMentions = new Map();
    let state = {
      sessions: [],
      messages: [],
      chatDiffs: [],
      liveActionLog: [],
      liveTranscript: [],
      activeSessionId: null,
      submitState: 'idle',
      running: false,
      status: 'Ready',
      activeRun: null,
      visibleSessionRun: null,
      activeRunSessionId: null,
      viewingActiveRun: false,
      backgroundActivity: null,
      progress: null,
      binary: null,
      binaryActivity: [],
      binaryLiveBubble: null,
      composerPrefs: { selectedModel: '', modelOptions: [], reasoningLevel: 'Medium' },
      warmStartState: null,
      promptState: null,
      authState: { kind: 'none', label: 'Not signed in' },
    };
    let pendingSubmission = null;
    let isSubmitting = false;
    let selectedArtifactsRunId = '';
    let queuedPrompts = [];
    let recentSubmissionGuard = {
      prompt: '',
      until: 0,
    };
    let mentionState = {
      requestId: 0,
      items: [],
      activeIndex: 0,
      range: null,
      loading: false,
    };
    let mentionDebounceTimer = null;
    let mentionQueryRaf = 0;
    let cachedEmptyMentionItems = [];
    let allowNextLineBreak = false;
    let lastInputValue = input ? String(input.value || '') : '';
    let composerWatchTimer = null;
    let lastBareEnterIntentAt = 0;

    if (input) {
      input.addEventListener('keydown', onComposerKeydown, true);
      input.addEventListener('keypress', composerKeypressFallback, true);
      input.addEventListener('beforeinput', composerBeforeInput, true);
      input.addEventListener('input', composerInputFallback, true);
    }

    function isHistoryOpen() {
      return workspaceShell.dataset.historyOpen === 'true';
    }

    function setHistoryOpen(open) {
      workspaceShell.dataset.historyOpen = open ? 'true' : 'false';
      historyToggle.setAttribute('aria-expanded', open ? 'true' : 'false');
      historyToggle.classList.toggle('active', open);
      historyDrawer.setAttribute('aria-hidden', open ? 'false' : 'true');
      if (open) {
        workspaceShell.dataset.artifactsOpen = 'false';
        artifactsToggle.classList.remove('active');
        artifactsToggle.setAttribute('aria-expanded', 'false');
        artifactsDrawer.setAttribute('aria-hidden', 'true');
      }
    }

    function setArtifactsOpen(open) {
      workspaceShell.dataset.artifactsOpen = open ? 'true' : 'false';
      artifactsToggle.setAttribute('aria-expanded', open ? 'true' : 'false');
      artifactsToggle.classList.toggle('active', open);
      artifactsDrawer.setAttribute('aria-hidden', open ? 'false' : 'true');
      if (open) {
        workspaceShell.dataset.historyOpen = 'false';
        historyToggle.classList.remove('active');
        historyToggle.setAttribute('aria-expanded', 'false');
        historyDrawer.setAttribute('aria-hidden', 'true');
      }
    }

    function closeAllDrawers() {
      setHistoryOpen(false);
      setArtifactsOpen(false);
    }

    function currentDraftKey() {
      return state.activeSessionId || '__new__';
    }

    function syncLastInputValue() {
      lastInputValue = input ? String(input.value || '') : '';
    }

    function noteBareEnterIntent(event) {
      if (!event) return;
      if (event.shiftKey || event.altKey || event.ctrlKey || event.metaKey) return;
      lastBareEnterIntentAt = Date.now();
    }

    function startComposerWatch() {
      if (composerWatchTimer || !input) return;
      composerWatchTimer = setInterval(() => {
        if (document.activeElement !== input) return;
        maybeSendFromImplicitTrailingLineBreak();
      }, 50);
    }

    function stopComposerWatch() {
      if (!composerWatchTimer) return;
      clearInterval(composerWatchTimer);
      composerWatchTimer = null;
    }

    function getDraftMentions() {
      return draftMentions.get(currentDraftKey()) || [];
    }

    function setDraftMentions(items) {
      draftMentions.set(currentDraftKey(), items);
    }

    function collectCurrentMentions(text) {
      return getDraftMentions().filter((item) => String(text || '').includes(item.insertText));
    }

    function reconcileDraftMentions() {
      setDraftMentions(collectCurrentMentions(input.value));
    }

    function saveDraft() {
      reconcileDraftMentions();
      drafts.set(currentDraftKey(), input.value);
    }

    function restoreDraft() {
      input.value = drafts.get(currentDraftKey()) || '';
      reconcileDraftMentions();
      closeMentions();
      autoSize();
      syncLastInputValue();
    }

    function autoSize() {
      input.style.height = 'auto';
      input.style.height = Math.min(Math.max(input.scrollHeight, 40), 88) + 'px';
    }

    function submitStateValue() {
      return String(state.submitState || (state.running ? 'running' : 'idle'));
    }

    function isBusySubmitState() {
      const value = submitStateValue();
      return value === 'submitting' || value === 'starting' || value === 'running' || value === 'stopping';
    }

    function updateComposerPrimaryButton() {
      if (isBusySubmitState()) {
        sendBtn.innerHTML = ICON_STOP;
        sendBtn.classList.add('is-stop');
        sendBtn.classList.toggle('is-busy', submitStateValue() === 'stopping');
        sendBtn.disabled = submitStateValue() === 'stopping';
        sendBtn.setAttribute('aria-label', 'Stop run');
        return;
      }
      sendBtn.classList.remove('is-stop');
      sendBtn.innerHTML = ICON_SUBMIT;
      sendBtn.disabled = isSubmitting;
      sendBtn.classList.toggle('is-busy', isSubmitting);
      sendBtn.setAttribute('aria-label', 'Submit');
    }

    function setComposerSubmitting(nextSubmitting) {
      isSubmitting = Boolean(nextSubmitting);
      updateComposerPrimaryButton();
    }

    function normalizePromptText(text) {
      return String(text || '').trim();
    }

    function friendlyBinaryPhaseLabel(phase) {
      const normalized = String(phase || '').trim();
      switch (normalized) {
        case 'queued':
          return 'waiting to start';
        case 'planning':
          return 'planning your app';
        case 'materializing':
          return 'writing the app';
        case 'installing':
          return 'setting things up';
        case 'compiling':
          return 'getting it ready';
        case 'validating':
          return 'checking quality';
        case 'packaging':
          return 'preparing a shareable build';
        case 'completed':
          return 'ready to use';
        case 'failed':
          return 'needs attention';
        case 'canceled':
          return 'stopped';
        default:
          return normalized ? normalized.replace(/_/g, ' ') : 'ready to start';
      }
    }

    function friendlyBinaryStatusChip(build, phase, streamTransport, connected) {
      if (!build) return 'Ready';
      if (build.status === 'failed') return 'Needs attention';
      if (build.status === 'canceled') return 'Stopped';
      if (build.status === 'completed') return 'Ready to use';
      const parts = [friendlyBinaryPhaseLabel(phase)];
      if (connected && streamTransport) parts.push(streamTransport);
      return parts.join(' · ');
    }

    function armRecentSubmissionGuard(prompt) {
      recentSubmissionGuard = {
        prompt: normalizePromptText(prompt),
        until: Date.now() + 700,
      };
    }

    function matchesRecentSubmissionGuard(prompt) {
      return (
        recentSubmissionGuard.until > Date.now() &&
        recentSubmissionGuard.prompt !== '' &&
        recentSubmissionGuard.prompt === normalizePromptText(prompt)
      );
    }

    function escapeHtmlText(value) {
      return String(value || '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
    }

    function getMentionRange() {
      const start = input.selectionStart || 0;
      const end = input.selectionEnd || 0;
      if (start !== end) return null;
      const before = input.value.slice(0, start);
      const match = /(^|[\\s(])@([A-Za-z0-9_./:-]*)$/.exec(before);
      if (!match) return null;
      const query = match[2] || '';
      return {
        start: start - query.length - 1,
        end: start,
        query,
      };
    }

    function closeMentions() {
      if (mentionDebounceTimer) {
        clearTimeout(mentionDebounceTimer);
        mentionDebounceTimer = null;
      }
      if (mentionQueryRaf) {
        cancelAnimationFrame(mentionQueryRaf);
        mentionQueryRaf = 0;
      }
      mentionState.range = null;
      mentionState.items = [];
      mentionState.activeIndex = 0;
      mentionState.loading = false;
      mentions.classList.remove('show');
      mentions.innerHTML = '';
    }

    function renderMentions() {
      mentions.innerHTML = '';
      if (!mentionState.range || (!mentionState.items.length && !mentionState.loading)) {
        mentions.classList.remove('show');
        return;
      }

      if (mentionState.loading && !mentionState.items.length) {
        const row = document.createElement('div');
        row.className = 'mention-item placeholder';
        const button = document.createElement('button');
        button.type = 'button';
        button.disabled = true;

        const kind = document.createElement('span');
        kind.className = 'mention-kind';
        kind.textContent = 'Loading';
        button.appendChild(kind);

        const copy = document.createElement('span');
        copy.className = 'mention-copy';

        const label = document.createElement('span');
        label.className = 'mention-label';
        label.textContent = 'Looking up suggestions...';
        copy.appendChild(label);

        button.appendChild(copy);
        row.appendChild(button);
        mentions.appendChild(row);
        mentions.classList.add('show');
        return;
      }

      mentionState.activeIndex = Math.max(0, Math.min(mentionState.activeIndex, mentionState.items.length - 1));
      for (let index = 0; index < mentionState.items.length; index += 1) {
        const item = mentionState.items[index];
        const row = document.createElement('div');
        row.className = 'mention-item';

        const button = document.createElement('button');
        button.type = 'button';
        if (index === mentionState.activeIndex) button.classList.add('active');
        button.addEventListener('mousedown', (event) => {
          event.preventDefault();
        });
        button.addEventListener('click', () => acceptMention(index));

        const kind = document.createElement('span');
        kind.className = 'mention-kind';
        kind.textContent = item.kind === 'window' ? 'Window' : 'File';
        button.appendChild(kind);

        const copy = document.createElement('span');
        copy.className = 'mention-copy';

        const label = document.createElement('span');
        label.className = 'mention-label';
        label.textContent = item.label;
        copy.appendChild(label);

        if (item.detail) {
          const detail = document.createElement('span');
          detail.className = 'mention-detail';
          detail.textContent = item.detail;
          copy.appendChild(detail);
        }

        button.appendChild(copy);
        row.appendChild(button);
        mentions.appendChild(row);
      }

      mentions.classList.add('show');
    }

    function requestMentions() {
      const range = getMentionRange();
      if (!range) {
        closeMentions();
        return;
      }
      mentionState.range = range;
      if (mentionDebounceTimer) {
        clearTimeout(mentionDebounceTimer);
        mentionDebounceTimer = null;
      }
      if (mentionQueryRaf) {
        cancelAnimationFrame(mentionQueryRaf);
        mentionQueryRaf = 0;
      }
      const delay = range.query.length === 0 ? 0 : 24;
      const canReuseEmptySuggestions = range.query.length === 0 && cachedEmptyMentionItems.length > 0;
      const sendQuery = () => {
        mentionDebounceTimer = null;
        mentionQueryRaf = 0;
        const live = getMentionRange();
        if (!live || !mentionState.range) return;
        if (live.start !== mentionState.range.start || live.query !== mentionState.range.query) return;
        mentionState.loading = true;
        if (!(live.query.length === 0 && mentionState.items.length)) {
          mentionState.items = [];
          mentionState.activeIndex = 0;
        }
        renderMentions();
        const requestId = mentionState.requestId + 1;
        mentionState.requestId = requestId;
        vscode.postMessage({ type: 'mentionsQuery', query: live.query, requestId });
      };
      if (delay === 0) {
        if (canReuseEmptySuggestions) {
          mentionState.loading = true;
          mentionState.items = cachedEmptyMentionItems.slice();
          mentionState.activeIndex = 0;
          renderMentions();
        }
        sendQuery();
      } else {
        mentionState.loading = true;
        mentionState.items = [];
        mentionState.activeIndex = 0;
        renderMentions();
        mentionDebounceTimer = setTimeout(sendQuery, delay);
      }
    }

    function scheduleMentionRequestSoon() {
      if (mentionQueryRaf) cancelAnimationFrame(mentionQueryRaf);
      mentionQueryRaf = requestAnimationFrame(() => {
        mentionQueryRaf = 0;
        requestMentions();
      });
    }

    function applyMentionsResponse(requestId, items) {
      if (requestId !== mentionState.requestId || !mentionState.range) return;
      mentionState.loading = false;
      mentionState.items = Array.isArray(items) ? items : [];
      if (mentionState.range.query === '') {
        cachedEmptyMentionItems = mentionState.items.slice();
      }
      mentionState.activeIndex = 0;
      renderMentions();
    }

    function acceptMention(index) {
      if (!mentionState.range || !mentionState.items.length) return false;
      const item = mentionState.items[index];
      if (!item) return false;

      const range = mentionState.range;
      const value = input.value;
      const before = value.slice(0, range.start);
      const after = value.slice(range.end);
      const needsSpace = after && !/^\\s/.test(after) ? ' ' : '';
      const nextValue = before + item.insertText + needsSpace + after;
      const caret = (before + item.insertText + needsSpace).length;

      input.value = nextValue;
      input.focus();
      input.setSelectionRange(caret, caret);
      setDraftMentions(
        [...getDraftMentions().filter((existing) => existing.insertText !== item.insertText), item].filter((existing) =>
          nextValue.includes(existing.insertText)
        )
      );
      closeMentions();
      autoSize();
      saveDraft();
      return true;
    }

    function renderSessions() {
      sessions.innerHTML = '';
      const list = Array.isArray(state.sessions) ? state.sessions : [];
      historyCount.textContent = String(list.length);
      for (const session of list) {
        const wrap = document.createElement('div');
        wrap.className = 'task-item';
        const button = document.createElement('button');
        button.type = 'button';
        button.className = 'session' + (session.id === state.activeSessionId ? ' active' : '');
        button.innerHTML =
          '<span class="session-title">' + escapeHtmlText(session.title || 'Untitled chat') + '</span>' +
          '<small>' + escapeHtmlText((session.lastStatus || 'idle') + ' - ' + (session.updatedAt || '')) + '</small>';
        button.addEventListener('click', () => {
          saveDraft();
          clearEphemeralConversationState();
          closeSettingsMenu();
          closeAllDrawers();
          vscode.postMessage({ type: 'selectSession', sessionId: session.id });
        });
        wrap.appendChild(button);
        sessions.appendChild(wrap);
      }
    }

    function latestRunIdWithDiffs(chatDiffs) {
      const list = Array.isArray(chatDiffs) ? chatDiffs : [];
      for (let i = list.length - 1; i >= 0; i -= 1) {
        const diff = list[i];
        const runId = String(diff && diff.runId ? diff.runId : '').trim();
        if (runId) return runId;
      }
      return '';
    }

    function resolveArtifactsRunId(chatDiffs) {
      const preferred = String(selectedArtifactsRunId || '').trim();
      if (preferred && aggregateFileStatsForRun(preferred, chatDiffs).length) {
        return preferred;
      }
      const activeRunId = String(state.activeRun && state.activeRun.id ? state.activeRun.id : '').trim();
      if (activeRunId && aggregateFileStatsForRun(activeRunId, chatDiffs).length) {
        return activeRunId;
      }
      return latestRunIdWithDiffs(chatDiffs);
    }

    function openArtifactsForRun(runId) {
      const resolved = String(runId || '').trim() || latestRunIdWithDiffs(state.chatDiffs);
      if (resolved) {
        selectedArtifactsRunId = resolved;
      }
      closeSettingsMenu();
      setHistoryOpen(false);
      setArtifactsOpen(true);
      renderArtifactsList();
    }

    function buildRunFilesSummaryCard(runId, chatDiffs, options) {
      const rows = aggregateFileStatsForRun(runId, chatDiffs);
      if (!rows.length) return null;

      const opts = options || {};
      let totalAdd = 0;
      let totalDel = 0;
      for (let r = 0; r < rows.length; r += 1) {
        totalAdd += rows[r].added;
        totalDel += rows[r].removed;
      }

      const wrap = document.createElement('div');
      wrap.className = 'cutie-files-summary' + (opts.inDrawer ? ' in-drawer' : '');
      wrap.setAttribute('role', 'region');
      wrap.setAttribute('aria-label', 'Files changed this run');

      const head = document.createElement('div');
      head.className = 'cutie-files-summary-head';

      const title = document.createElement('div');
      title.className = 'cutie-files-summary-title';
      const n = rows.length;
      title.textContent =
        n +
        ' file' +
        (n === 1 ? '' : 's') +
        ' changed +' +
        totalAdd +
        ' -' +
        totalDel;

      const actions = document.createElement('div');
      actions.className = 'cutie-files-summary-actions';

      const undoBtn = document.createElement('button');
      undoBtn.type = 'button';
      undoBtn.className = 'cutie-files-summary-btn';
      undoBtn.textContent = 'Undo';
      undoBtn.title = 'Open Source Control to review or revert changes';
      undoBtn.addEventListener('click', function (e) {
        e.stopPropagation();
        vscode.postMessage({ type: 'openScm' });
      });

      const reviewBtn = document.createElement('button');
      reviewBtn.type = 'button';
      reviewBtn.className = 'cutie-files-summary-btn cutie-files-summary-btn-primary';
      reviewBtn.textContent = 'Review';
      reviewBtn.title = opts.inDrawer ? 'Open Source Control review' : 'Open file changes panel';
      reviewBtn.addEventListener('click', function (e) {
        e.stopPropagation();
        if (opts.inDrawer) {
          vscode.postMessage({ type: 'openScm' });
          return;
        }
        openArtifactsForRun(runId);
      });

      actions.appendChild(undoBtn);
      actions.appendChild(reviewBtn);
      head.appendChild(title);
      head.appendChild(actions);

      const list = document.createElement('div');
      list.className = 'cutie-files-summary-list';

      for (let i = 0; i < rows.length; i += 1) {
        const row = rows[i];
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'cutie-files-summary-row';
        const pathEl = document.createElement('span');
        pathEl.className = 'cutie-files-summary-path';
        pathEl.textContent = row.path;
        const stats = document.createElement('span');
        stats.className = 'cutie-files-summary-stats';
        const addPill = document.createElement('span');
        addPill.className = 'cutie-files-stat add';
        addPill.textContent = '+' + row.added;
        const delPill = document.createElement('span');
        delPill.className = 'cutie-files-stat del';
        delPill.textContent = '-' + row.removed;
        stats.appendChild(addPill);
        stats.appendChild(delPill);
        btn.appendChild(pathEl);
        btn.appendChild(stats);
        btn.addEventListener('click', function () {
          closeSettingsMenu();
          closeAllDrawers();
          vscode.postMessage({ type: 'diffWorkspaceFile', path: row.path });
        });
        list.appendChild(btn);
      }

      wrap.appendChild(head);
      wrap.appendChild(list);
      return wrap;
    }

    function renderArtifactsList() {
      artifactsList.innerHTML = '';
      const diffs = Array.isArray(state.chatDiffs) ? state.chatDiffs : [];
      const focusedRunId = resolveArtifactsRunId(diffs);
      const focusedRows = focusedRunId ? aggregateFileStatsForRun(focusedRunId, diffs) : [];
      artifactsCount.textContent = String(focusedRows.length || diffs.length);
      if (focusedRows.length) {
        const summary = buildRunFilesSummaryCard(focusedRunId, diffs, { inDrawer: true });
        if (summary) {
          artifactsList.appendChild(summary);
        }
        return;
      }
      if (!diffs.length) {
        const empty = document.createElement('div');
        empty.className = 'task-empty';
        empty.textContent = 'No file changes recorded for this chat yet.';
        artifactsList.appendChild(empty);
        return;
      }
      for (let i = diffs.length - 1; i >= 0; i -= 1) {
        const diff = diffs[i];
        const wrap = document.createElement('div');
        wrap.className = 'task-item';
        const button = document.createElement('button');
        button.type = 'button';
        button.className = 'session';
        const path = diff.relativePath || 'File';
        const tool = diff.toolName === 'write_file' ? 'write' : diff.toolName === 'patch_file' ? 'patch' : 'edit';
        button.innerHTML =
          '<span class="session-title">' + escapeHtmlText(path) + '</span>' +
          '<small>' + escapeHtmlText(tool) + '</small>';
        button.addEventListener('click', () => {
          closeSettingsMenu();
          closeAllDrawers();
          vscode.postMessage({ type: 'diffWorkspaceFile', path: diff.relativePath });
        });
        wrap.appendChild(button);
        artifactsList.appendChild(wrap);
      }
    }

    function countPatchLineStats(patch) {
      let added = 0;
      let removed = 0;
      const lines = String(patch || '').split(/\\r\\n|\\n|\\r/);
      for (let i = 0; i < lines.length; i += 1) {
        const line = lines[i];
        if (!line) continue;
        if (line.indexOf('+++ ') === 0 || line.indexOf('--- ') === 0) continue;
        if (line.indexOf('@@') === 0) continue;
        if (line.indexOf('\\\\') === 0) continue;
        if (line.indexOf('diff --git ') === 0) continue;
        if (line.indexOf('+') === 0) added += 1;
        else if (line.indexOf('-') === 0) removed += 1;
      }
      return { added, removed };
    }

    function aggregateFileStatsForRun(runId, chatDiffs) {
      if (!runId) return [];
      const byPath = new Map();
      const list = Array.isArray(chatDiffs) ? chatDiffs : [];
      for (let i = 0; i < list.length; i += 1) {
        const d = list[i];
        if (!d || d.runId !== runId) continue;
        const p = String(d.relativePath || '').trim();
        if (!p) continue;
        const { added, removed } = countPatchLineStats(d.patch);
        const prev = byPath.get(p) || { added: 0, removed: 0 };
        byPath.set(p, { added: prev.added + added, removed: prev.removed + removed });
      }
      return Array.from(byPath.entries())
        .map(function (entry) {
          return { path: entry[0], added: entry[1].added, removed: entry[1].removed };
        })
        .sort(function (a, b) {
          return a.path.localeCompare(b.path);
        });
    }

    function chatDiffsForRun(runId, chatDiffs) {
      if (!runId) return [];
      const list = Array.isArray(chatDiffs) ? chatDiffs : [];
      return list
        .filter(function (diff) {
          return diff && diff.runId === runId;
        })
        .sort(function (a, b) {
          const aSort = a && a.createdAt ? a.createdAt : '';
          const bSort = b && b.createdAt ? b.createdAt : '';
          if (aSort < bSort) return -1;
          if (aSort > bSort) return 1;
          return String(a && a.id ? a.id : '').localeCompare(String(b && b.id ? b.id : ''));
        });
    }

    function isTerminalAssistantForRun(message, timelineMessages) {
      const runId = message && message.runId;
      if (!runId || message.role !== 'assistant') return false;
      let lastIdx = -1;
      for (let i = 0; i < timelineMessages.length; i += 1) {
        const m = timelineMessages[i];
        if (m.role === 'assistant' && m.runId === runId) lastIdx = i;
      }
      if (lastIdx < 0) return false;
      return timelineMessages[lastIdx] === message;
    }

    function appendRunFilesSummaryCard(runId, chatDiffs) {
      const wrap = buildRunFilesSummaryCard(runId, chatDiffs, { inDrawer: false });
      if (!wrap) return;
      chat.appendChild(wrap);
    }

    function appendNoFilesChangedCard(summaryText) {
      const wrap = document.createElement('div');
      wrap.className = 'cutie-files-summary';
      wrap.setAttribute('role', 'region');
      wrap.setAttribute('aria-label', 'No files changed');

      const head = document.createElement('div');
      head.className = 'cutie-files-summary-head';
      const title = document.createElement('div');
      title.className = 'cutie-files-summary-title';
      title.textContent = 'No files changed';
      head.appendChild(title);

      const note = document.createElement('div');
      note.className = 'cutie-files-summary-empty-note';
      note.textContent = String(summaryText || '').trim() || 'Cutie finished this run without editing files.';

      wrap.appendChild(head);
      wrap.appendChild(note);
      chat.appendChild(wrap);
    }

    function appendCutieDiffBubble(diff) {
      const wrap = document.createElement('div');
      wrap.className = 'bubble cutie-diff';
      wrap.setAttribute('role', 'region');
      wrap.setAttribute('aria-label', 'Cutie code change');
      const pathHint = String(diff.relativePath || '').trim();
      if (pathHint) {
        wrap.title = pathHint;
      }

      const head = document.createElement('div');
      head.className = 'cutie-diff-head';

      const titleWrap = document.createElement('div');
      titleWrap.className = 'cutie-diff-title-wrap';

      const kicker = document.createElement('div');
      kicker.className = 'cutie-diff-kicker';
      kicker.textContent = 'Edited file';

      const title = document.createElement('div');
      title.className = 'cutie-diff-title';
      title.textContent = diff.relativePath || 'File';

      titleWrap.appendChild(kicker);
      titleWrap.appendChild(title);

      const meta = document.createElement('div');
      meta.className = 'cutie-diff-meta';

      const badge = document.createElement('span');
      badge.className = 'cutie-diff-badge';
      badge.textContent = diff.toolName === 'write_file' ? 'write' : diff.toolName === 'patch_file' ? 'patch' : 'edit';

      const stats = countPatchLineStats(diff.patch);
      if (stats.added || stats.removed) {
        const statWrap = document.createElement('div');
        statWrap.className = 'cutie-diff-stats';
        if (stats.added) {
          const addPill = document.createElement('span');
          addPill.className = 'cutie-diff-stat add';
          addPill.textContent = '+' + stats.added;
          statWrap.appendChild(addPill);
        }
        if (stats.removed) {
          const delPill = document.createElement('span');
          delPill.className = 'cutie-diff-stat del';
          delPill.textContent = '-' + stats.removed;
          statWrap.appendChild(delPill);
        }
        meta.appendChild(statWrap);
      }

      meta.appendChild(badge);

      const openBtn = document.createElement('button');
      openBtn.type = 'button';
      openBtn.className = 'cutie-diff-open';
      openBtn.textContent = 'Review diff';
      openBtn.addEventListener('click', function () {
        vscode.postMessage({ type: 'diffWorkspaceFile', path: diff.relativePath });
      });

      meta.appendChild(openBtn);

      head.appendChild(titleWrap);
      head.appendChild(meta);

      const body = document.createElement('div');
      body.className = 'cutie-diff-body';
      const patchEl = document.createElement('div');
      patchEl.className = 'cutie-diff-patch';
      const raw = String(diff.patch || '');
      const lines = raw.split(/\\r\\n|\\n|\\r/);
      for (let i = 0; i < lines.length; i += 1) {
        const line = lines[i];
        if (line.indexOf('diff --git ') === 0) continue;
        if (line.indexOf('--- ') === 0) continue;
        if (line.indexOf('+++ ') === 0) continue;
        const row = document.createElement('div');
        if (line.indexOf('+') === 0 && line.indexOf('+++') !== 0) {
          row.className = 'diff-line add';
        } else if (line.indexOf('-') === 0 && line.indexOf('---') !== 0) {
          row.className = 'diff-line del';
        } else if (line.indexOf('@@') === 0) {
          row.className = 'diff-line hunk';
        } else {
          row.className = 'diff-line ctx';
        }
        row.textContent = line;
        patchEl.appendChild(row);
      }
      if (!patchEl.childElementCount) {
        const row = document.createElement('div');
        row.className = 'diff-line ctx';
        row.textContent = 'Change recorded — open in editor for the full side-by-side diff.';
        patchEl.appendChild(row);
      }
      body.appendChild(patchEl);
      wrap.appendChild(head);
      wrap.appendChild(body);
      const approxLines = lines.length;
      const bigPatch = approxLines > 16 || raw.length > 1400;
      if (bigPatch) {
        const foot = document.createElement('div');
        foot.className = 'cutie-diff-foot';
        const expandBtn = document.createElement('button');
        expandBtn.type = 'button';
        expandBtn.className = 'cutie-diff-expand';
        expandBtn.textContent = 'Larger preview';
        expandBtn.setAttribute('aria-expanded', 'false');
        expandBtn.addEventListener('click', function () {
          const expanded = body.classList.toggle('cutie-diff-body--expanded');
          expandBtn.textContent = expanded ? 'Smaller preview' : 'Larger preview';
          expandBtn.setAttribute('aria-expanded', expanded ? 'true' : 'false');
        });
        foot.appendChild(expandBtn);
        wrap.appendChild(foot);
      }
      chat.appendChild(wrap);
    }

    function truncateRanText(text, maxLen) {
      const s = String(text || '')
        .replace(/[\\r\\n]+/g, ' ')
        .replace(/\\s+/g, ' ')
        .trim();
      if (s.length <= maxLen) return s;
      return s.slice(0, Math.max(0, maxLen - 1)) + '…';
    }

    function truncateReceiptDetailBlock(text, maxLen) {
      const value = String(text || '').trim();
      if (!value) return '';
      if (value.length <= maxLen) return value;
      return value.slice(0, Math.max(0, maxLen - 1)) + '…';
    }

    function buildReceiptDetailText(receipt) {
      if (!receipt) return '';
      const d = receipt.data && typeof receipt.data === 'object' ? receipt.data : {};
      const parts = [];
      const name = String(receipt.toolName || 'tool');

      if (typeof receipt.step === 'number' && receipt.step > 0) {
        parts.push('step: ' + receipt.step);
      }
      parts.push('tool: ' + name);
      if (receipt.domain) parts.push('domain: ' + String(receipt.domain));
      if (receipt.kind) parts.push('kind: ' + String(receipt.kind));
      if (receipt.status) parts.push('status: ' + String(receipt.status));
      if (typeof d.command === 'string' && d.command.trim()) {
        parts.push('');
        parts.push('$ ' + d.command.trim());
      }
      if (typeof d.path === 'string' && d.path.trim()) {
        parts.push(parts.length ? '' : '');
        parts.push('path: ' + d.path.trim());
      }
      if (typeof d.range === 'string' && d.range.trim()) {
        parts.push('range: ' + d.range.trim());
      }
      if (typeof d.exitCode === 'number') {
        parts.push('exit code: ' + d.exitCode);
      }
      if (typeof receipt.summary === 'string' && receipt.summary.trim()) {
        parts.push('');
        parts.push('summary: ' + truncateReceiptDetailBlock(receipt.summary, 1000));
      }
      if (typeof d.stdout === 'string' && d.stdout.trim()) {
        parts.push('');
        parts.push('stdout:');
        parts.push(truncateReceiptDetailBlock(d.stdout, 4000));
      }
      if (typeof d.stderr === 'string' && d.stderr.trim()) {
        parts.push('');
        parts.push('stderr:');
        parts.push(truncateReceiptDetailBlock(d.stderr, 3000));
      }
      if (receipt.status !== 'completed' && receipt.error) {
        parts.push('');
        parts.push('error:');
        parts.push(truncateReceiptDetailBlock(String(receipt.error || ''), 1500));
      }

      if (name === 'read_file' && typeof d.content === 'string' && d.content.trim()) {
        parts.push('');
        parts.push('preview:');
        parts.push(truncateReceiptDetailBlock(d.content, 2500));
      }

      if (!parts.filter(Boolean).length) {
        return 'No additional details recorded for this action.';
      }
      return parts.join('\\n').replace(/\\n{3,}/g, '\\n\\n').trim();
    }

    function formatRanLineFromReceipt(receipt) {
      if (!receipt) return 'Ran (unknown step)';
      const d = receipt.data && typeof receipt.data === 'object' ? receipt.data : {};
      const statusNote =
        receipt.status === 'failed' ? ' — failed' : receipt.status === 'blocked' ? ' — blocked' : '';
      const name = receipt.toolName || 'tool';

      if (name === 'run_command' && typeof d.command === 'string' && d.command.trim()) {
        return 'Ran ' + truncateRanText(d.command, 220) + statusNote;
      }
      if (name === 'search_workspace') {
        const q = typeof d.query === 'string' ? d.query : '';
        return (
          'Ran rg (workspace)' +
          (q ? ' ' + truncateRanText(q, 160) : '') +
          statusNote
        );
      }
      if (name === 'read_file' && typeof d.path === 'string') {
        const range = typeof d.range === 'string' && d.range ? ' ' + d.range : '';
        return 'Ran read_file ' + truncateRanText(d.path + range, 200) + statusNote;
      }
      if (name === 'list_files') {
        const n = Array.isArray(d.files) ? d.files.length : 0;
        return 'Ran list_files' + (n ? ' (' + n + ' paths)' : '') + statusNote;
      }
      if (name === 'get_diagnostics') {
        const p = typeof d.path === 'string' ? d.path : '';
        return 'Ran get_diagnostics' + (p ? ' ' + truncateRanText(p, 160) : '') + statusNote;
      }
      if (name === 'git_status') {
        return 'Ran git status' + statusNote;
      }
      if (name === 'git_diff') {
        const p = typeof d.path === 'string' ? d.path : '';
        return 'Ran git diff' + (p ? ' ' + truncateRanText(p, 180) : '') + statusNote;
      }
      if (name === 'write_file' && typeof d.path === 'string') {
        return 'Ran write_file ' + truncateRanText(d.path, 200) + statusNote;
      }
      if (name === 'patch_file' && typeof d.path === 'string') {
        return 'Ran patch_file ' + truncateRanText(d.path, 200) + statusNote;
      }
      if (name === 'edit_file' && typeof d.path === 'string') {
        return 'Ran edit_file ' + truncateRanText(d.path, 200) + statusNote;
      }
      if (name === 'mkdir' && typeof d.path === 'string') {
        return 'Ran mkdir ' + truncateRanText(d.path, 200) + statusNote;
      }
      if (name === 'create_checkpoint') {
        return 'Ran create_checkpoint' + statusNote;
      }
      if (name === 'desktop_capture_screen') {
        return 'Ran desktop_capture_screen' + statusNote;
      }
      if (name === 'desktop_get_active_window') {
        return 'Ran desktop_get_active_window' + statusNote;
      }
      if (name === 'desktop_list_windows') {
        return 'Ran desktop_list_windows' + statusNote;
      }
      if (name === 'desktop_open_app' && typeof d.app === 'string') {
        return 'Ran open_app ' + truncateRanText(d.app, 120) + statusNote;
      }
      if (name === 'desktop_open_url' && typeof d.url === 'string') {
        return 'Ran open_url ' + truncateRanText(d.url, 200) + statusNote;
      }
      if (name === 'desktop_focus_window') {
        return 'Ran desktop_focus_window' + statusNote;
      }
      if (name === 'desktop_click' || name === 'desktop_type' || name === 'desktop_keypress' || name === 'desktop_scroll') {
        return 'Ran ' + name + statusNote;
      }
      if (name === 'desktop_wait') {
        return 'Ran desktop_wait' + statusNote;
      }

      const sum = typeof receipt.summary === 'string' ? receipt.summary.trim() : '';
      return (
        'Ran ' +
        name +
        (sum ? ' — ' + truncateRanText(sum, 140) : '') +
        statusNote
      );
    }

    function receiptsForActiveRunTimeline() {
      const run = state.viewingActiveRun ? state.activeRun : state.visibleSessionRun;
      if (!run || !Array.isArray(run.receipts) || !run.receipts.length) return [];
      if (state.activeSessionId && run.sessionId && run.sessionId !== state.activeSessionId) return [];
      return run.receipts;
    }

    function displayedRunForState(viewState) {
      if (viewState && viewState.viewingActiveRun) {
        return viewState.activeRun || null;
      }
      return (viewState && viewState.visibleSessionRun) || null;
    }

    function receiptStatusLabel(status) {
      if (status === 'blocked') return 'Blocked';
      if (status === 'failed') return 'Failed';
      return 'Ran';
    }

    function appendReceiptActivityRow(container, receipt, options) {
      if (!container || !receipt) return;
      const row = document.createElement('div');
      row.className = 'activity-row' + (options && options.prominent ? ' is-prominent' : '');
      const badge = document.createElement('div');
      const status = String(receipt.status || 'completed');
      badge.className = 'activity-badge status-' + status;
      badge.textContent = receiptStatusLabel(status);
      const body = document.createElement('div');
      body.className = 'activity-body';
      const title = document.createElement('div');
      title.className = 'activity-title';
      const ranLine = formatRanLineFromReceipt(receipt);
      title.textContent = ranLine;
      title.title = ranLine;
      const meta = document.createElement('div');
      meta.className = 'activity-meta';
      const metaParts = [];
      if (typeof receipt.step === 'number' && receipt.step > 0) metaParts.push('Step ' + receipt.step);
      if (receipt.domain) metaParts.push(String(receipt.domain));
      if (receipt.kind) metaParts.push(String(receipt.kind));
      if (status !== 'completed' && receipt.error) metaParts.push(truncateRanText(String(receipt.error || ''), 160));
      meta.textContent = metaParts.join(' - ');
      body.appendChild(title);
      if (meta.textContent) body.appendChild(meta);
      if (!options || !options.prominent) {
        const detailText = buildReceiptDetailText(receipt);
        if (detailText) {
          const detail = document.createElement('div');
          detail.className = 'ran-inline-details';
          detail.textContent = detailText;
          body.appendChild(detail);
          row.setAttribute('role', 'button');
          row.setAttribute('tabindex', '0');
          row.setAttribute('aria-expanded', 'false');
          const toggleExpanded = function () {
            const expanded = row.classList.toggle('is-expanded');
            row.setAttribute('aria-expanded', expanded ? 'true' : 'false');
          };
          row.addEventListener('click', toggleExpanded);
          row.addEventListener('keydown', function (event) {
            if (event.key === 'Enter' || event.key === ' ') {
              event.preventDefault();
              toggleExpanded();
            }
          });
        }
      }
      row.appendChild(badge);
      row.appendChild(body);
      container.appendChild(row);
    }

    function appendLiveRunActivityCard(run, progress, receipts) {
      if (!run) return;
      const card = document.createElement('div');
      card.className = 'run-activity-card';
      const head = document.createElement('div');
      head.className = 'run-activity-head';
      const titleWrap = document.createElement('div');
      titleWrap.className = 'run-activity-title-wrap';
      const pulse = document.createElement('span');
      pulse.className = 'run-activity-pulse';
      pulse.setAttribute('aria-hidden', 'true');
      const title = document.createElement('div');
      title.className = 'run-activity-title';
      title.textContent = 'Cutie is working';
      titleWrap.appendChild(pulse);
      titleWrap.appendChild(title);
      const chips = document.createElement('div');
      chips.className = 'run-activity-chips';

      function appendChip(text) {
        if (!text) return;
        const chip = document.createElement('span');
        chip.className = 'run-activity-chip';
        chip.textContent = text;
        chips.appendChild(chip);
      }

      appendChip(progress && progress.phaseLabel ? progress.phaseLabel : 'Working');
      if (typeof run.stepCount === 'number' && typeof run.maxSteps === 'number' && run.maxSteps > 0) {
        appendChip('Step ' + run.stepCount + '/' + run.maxSteps);
      }
      if (progress && progress.repairLabel) appendChip(progress.repairLabel);
      if (run.lastToolName) appendChip(run.lastToolName);

      head.appendChild(titleWrap);
      head.appendChild(chips);

      const body = document.createElement('div');
      body.className = 'run-activity-body';
      const status = document.createElement('div');
      status.className = 'run-activity-status';
      status.textContent = String(state.status || '').trim() || 'Cutie is working through the next step...';
      body.appendChild(status);

      const summaryText =
        (progress && progress.stallReason) ||
        (progress && progress.lastActionSummary) ||
        (progress && progress.lastMeaningfulProgressSummary) ||
        (progress && progress.pursuingLabel) ||
        (progress && progress.suggestedNextAction) ||
        '';
      if (summaryText) {
        const summary = document.createElement('div');
        summary.className = 'run-activity-summary';
        summary.textContent = summaryText;
        body.appendChild(summary);
      }

      const list = document.createElement('div');
      list.className = 'run-activity-list';
      const visibleReceipts = Array.isArray(receipts) ? receipts : [];
      if (visibleReceipts.length) {
        for (let index = 0; index < visibleReceipts.length; index += 1) {
          appendReceiptActivityRow(list, visibleReceipts[index], { prominent: true });
        }
      } else {
        const empty = document.createElement('div');
        empty.className = 'run-activity-empty';
        empty.textContent =
          (progress && progress.phaseLabel ? progress.phaseLabel + '...' : '') ||
          'Thinking through the next useful action...';
        list.appendChild(empty);
      }
      body.appendChild(list);

      if (progress && progress.escalationMessage) {
        const note = document.createElement('div');
        note.className = 'run-activity-summary';
        note.textContent = progress.escalationMessage;
        body.appendChild(note);
      }

      card.appendChild(head);
      card.appendChild(body);
      chat.appendChild(card);
    }

    const MAX_COMPACT_ACTION_ROWS = 18;

    function compactActionLogRows(lines, maxRows) {
      const source = Array.isArray(lines) ? lines : [];
      const deduped = [];
      for (let index = 0; index < source.length; index += 1) {
        const line = String(source[index] || '').trim();
        if (!line) continue;
        if (deduped.length && deduped[deduped.length - 1] === line) continue;
        deduped.push(line);
      }
      const safeLimit = Number.isFinite(maxRows) && maxRows > 0 ? Math.floor(maxRows) : deduped.length;
      if (deduped.length <= safeLimit) return deduped;
      const hiddenCount = deduped.length - safeLimit;
      return ['... ' + hiddenCount + ' earlier updates hidden'].concat(deduped.slice(-safeLimit));
    }

    function formatLiveActionLogText(lines) {
      const rows = Array.isArray(lines) ? lines.slice(-160) : [];
      const compactRows = compactActionLogRows(rows, MAX_COMPACT_ACTION_ROWS);
      if (!compactRows.length) return '';
      return compactRows.join('\\n');
    }

    function isLowSignalConversationStatus(text) {
      return /^(Cutie is replying|Cutie is finishing the response|Cutie completed the run)\.?$/i.test(
        String(text || '').trim()
      );
    }

    function isTranscriptEventVisible(event, goal) {
      if (!event || typeof event !== 'object') return false;
      const text = String(event.text || '').trim();
      if (!text) return false;
      if (goal === 'conversation' && event.kind === 'status' && isLowSignalConversationStatus(text)) return false;
      return true;
    }

    function buildTranscriptSections(events, goal) {
      const rows = Array.isArray(events) ? events.slice(-96) : [];
      const operational = [];
      const assistant = [];
      for (let index = 0; index < rows.length; index += 1) {
        const event = rows[index];
        if (!isTranscriptEventVisible(event, goal)) continue;
        const text = String(event.text || '').trim();
        if (!text) continue;
        if (event.kind === 'assistant_text' || event.kind === 'final') {
          assistant.push(text);
        } else {
          operational.push(text);
        }
      }
      return {
        operational: operational,
        assistant: assistant.length ? String(assistant[assistant.length - 1] || '').trim() : '',
      };
    }

    function formatLiveTranscriptText(events, goal) {
      const sections = buildTranscriptSections(events, goal);
      if (!sections.operational.length && !sections.assistant) return '';
      const parts = [];
      const compactOperational = compactActionLogRows(sections.operational, MAX_COMPACT_ACTION_ROWS);
      if (sections.operational.length) {
        parts.push('Cutie action log:');
        parts.push(compactOperational.join('\\n'));
      }
      if (sections.assistant) {
        parts.push('Cutie response:');
        parts.push(sections.assistant);
      }
      return parts.join('\\n\\n');
    }

    function classifyTranscriptLine(text) {
      const trimmed = String(text || '').trim();
      if (!trimmed) return 'gap';
      if (/^Cutie action log:$/i.test(trimmed) || /^Cutie response:$/i.test(trimmed)) return 'section';
      if (/^\\.\\.\\.\\s+\\d+\\s+earlier updates hidden$/i.test(trimmed)) return 'section';
      if (/^(Cutie\\b|Step\\s+\\d+:|Recovered\\s+\`|Created checkpoint\\b)/i.test(trimmed)) return 'ops';
      return 'chat';
    }

    function appendTranscriptBubble(container, text) {
      const wrap = document.createElement('div');
      wrap.className = 'bubble assistant transcript-message';
      const lines = String(text || '').split('\\n');
      for (let index = 0; index < lines.length; index += 1) {
        const line = String(lines[index] || '');
        const trimmed = line.trim();
        if (!trimmed) {
          const gap = document.createElement('div');
          gap.className = 'transcript-gap';
          wrap.appendChild(gap);
          continue;
        }
        const row = document.createElement('div');
        const kind = classifyTranscriptLine(trimmed);
        row.className =
          'transcript-line ' +
          (kind === 'ops' ? 'is-ops' : kind === 'section' ? 'is-section' : 'is-chat');
        if (/^(Step\\s+\\d+:|Recovered\\s+\`)/i.test(trimmed) || kind === 'section') {
          row.className += ' is-strong';
        }
        row.textContent = trimmed;
        wrap.appendChild(row);
      }
      container.appendChild(wrap);
    }

    function renderBinaryPanel() {
      if (!binaryPanel || !binaryStatusChip || !binaryProgressFill || !binaryMeta || !binaryActivityLog) return;
      const b = state.binary;
      if (!b) {
        binaryStatusChip.textContent = 'Ready';
        binaryProgressFill.style.width = '0%';
        if (binaryGuideCopy) {
          binaryGuideCopy.textContent =
            'Cutie can turn a simple description into a live app build. No special commands or coding words needed.';
        }
        binaryMeta.textContent = 'Describe what you want above, then click Create app.';
        binaryActivityLog.textContent = 'Live build updates will appear here.';
        return;
      }
      const ab = b.activeBuild;
      const phase = b.phase || (ab && ab.phase) || 'idle';
      const streamTransport = ab && ab.stream ? (ab.stream.transport === 'websocket' ? 'WS' : 'SSE') : '';
      binaryStatusChip.textContent = friendlyBinaryStatusChip(ab, phase, streamTransport, b.streamConnected);
      const p = typeof b.progress === 'number' ? Math.max(0, Math.min(100, b.progress)) : 0;
      binaryProgressFill.style.width = p + '%';
      const lines = [];
      const hasBuild = !!ab;
      const hasCheckpoint =
        Boolean(ab && ab.checkpointId) ||
        (Array.isArray(b.checkpoints) && b.checkpoints.length > 0) ||
        (Array.isArray(b.snapshots) && b.snapshots.length > 0);
      if (!hasBuild) {
        lines.push('Start by describing the app, tool, or workflow you want.');
        lines.push('Cutie will build the first version, then you can improve it with simple buttons.');
      } else if (ab) {
        if (ab.intent) lines.push('Building: ' + String(ab.intent).slice(0, 220));
        lines.push('Current step: ' + friendlyBinaryPhaseLabel(phase));
        if (b.liveReliability && typeof b.liveReliability.score === 'number') {
          lines.push('Confidence: ' + Math.max(0, Math.min(100, b.liveReliability.score)) + '%');
        }
        if (b.astState) {
          lines.push(
            'Live structure: ' +
              b.astState.moduleCount +
              ' modules mapped (' +
              Math.max(0, Math.min(100, b.astState.coverage)) +
              '%)'
          );
        }
        if (b.runtimeState && Array.isArray(b.runtimeState.availableFunctions) && b.runtimeState.availableFunctions.length) {
          lines.push(
            'Try now: ' +
              b.runtimeState.availableFunctions
                .slice(0, 3)
                .map((item) => item.name)
                .join(', ')
          );
        }
        if (hasCheckpoint) {
          lines.push('Save points: ' + Math.max(b.checkpoints.length, b.snapshots.length, ab.checkpointId ? 1 : 0));
        }
      }
      if (b.pendingRefinement && b.pendingRefinement.intent) {
        lines.push('Next improvement: ' + String(b.pendingRefinement.intent).slice(0, 160));
      }
      binaryMeta.textContent = lines.join('\\n');
      const act = Array.isArray(state.binaryActivity) ? state.binaryActivity : [];
      binaryActivityLog.textContent = act.length ? act.slice(-14).join('\\n') : 'Live build updates will appear here.';
      const busy = !!b.busy;
      const canRefine = !!ab && ab.status === 'running' && !busy;
      const canBranch = !!ab && !busy && hasCheckpoint;
      const canRewind = !!ab && ab.status !== 'running' && !busy && hasCheckpoint;
      const canValidate = !!ab && ab.status === 'completed' && !busy;
      const canPublish = !!ab && ab.status === 'completed' && !busy;
      const canExecute = !!ab && !busy;
      if (binaryGuideCopy) {
        if (!ab) {
          binaryGuideCopy.textContent =
            'Cutie can turn a simple description into a live app build. No special commands or coding words needed.';
        } else if (ab.status === 'running') {
          binaryGuideCopy.textContent =
            'Your app is being built live. You can watch progress here or write a simple improvement request below.';
        } else {
          binaryGuideCopy.textContent =
            'Your latest build is ready. Improve it, go back to a save point, or share it when it feels right.';
        }
      }
      if (binaryAdvancedControls) binaryAdvancedControls.hidden = !hasBuild;
      if (binaryRuntimeRow) binaryRuntimeRow.hidden = !hasBuild;
      if (binaryExecuteRow) binaryExecuteRow.hidden = !hasBuild;
      if (binaryCancelBtn) binaryCancelBtn.disabled = !b.canCancel;
      if (binaryGenerateBtn) {
        binaryGenerateBtn.disabled = busy;
        binaryGenerateBtn.textContent = busy ? 'Creating app...' : hasBuild ? 'Create another app' : 'Create app';
      }
      if (binaryRefineBtn) binaryRefineBtn.disabled = !canRefine;
      if (binaryBranchBtn) binaryBranchBtn.disabled = !canBranch;
      if (binaryRewindBtn) binaryRewindBtn.disabled = !canRewind;
      if (binaryValidateBtn) binaryValidateBtn.disabled = !canValidate;
      if (binaryPublishBtn) binaryPublishBtn.disabled = !canPublish;
      if (binaryExecuteBtn) binaryExecuteBtn.disabled = !canExecute;
      if (binaryRuntimeSelect) {
        binaryRuntimeSelect.value = b.targetEnvironment && b.targetEnvironment.runtime === 'node20' ? 'node20' : 'node18';
      }
      if (binaryEntryInput) {
        if (b.runtimeState && Array.isArray(b.runtimeState.availableFunctions) && b.runtimeState.availableFunctions.length) {
          binaryEntryInput.placeholder = 'Try "' + b.runtimeState.availableFunctions[0].name + '"';
        } else {
          binaryEntryInput.placeholder = 'Try a function name like main or handler';
        }
      }
      for (let index = 0; index < binaryStarterButtons.length; index += 1) {
        binaryStarterButtons[index].disabled = busy;
      }
    }

    function parseIsoTimestamp(value) {
      const parsed = Date.parse(String(value || ''));
      return Number.isFinite(parsed) ? parsed : null;
    }

    function matchesPendingSubmissionEcho(message, pending) {
      if (!pending || !message || message.role !== 'user') return false;
      if (String(message.content || '') !== String(pending.content || '')) return false;
      const pendingAt = parseIsoTimestamp(pending.createdAt);
      const messageAt = parseIsoTimestamp(message.createdAt);
      if (pendingAt === null || messageAt === null) return false;
      return messageAt >= pendingAt;
    }

    function renderMessages() {
      chat.innerHTML = '';
      const visibleMessages = [...(Array.isArray(state.messages) ? state.messages : [])];
      if (
        pendingSubmission &&
        !visibleMessages.some((message) => matchesPendingSubmissionEcho(message, pendingSubmission))
      ) {
        visibleMessages.push(pendingSubmission);
      }

      const chatDiffs = Array.isArray(state.chatDiffs) ? state.chatDiffs : [];
      const liveActionLog = Array.isArray(state.liveActionLog) ? state.liveActionLog : [];
      const liveTranscript = Array.isArray(state.liveTranscript) ? state.liveTranscript : [];
      const displayRun = displayedRunForState(state);
      const showLiveSession = Boolean(state.viewingActiveRun && state.running && state.activeRun);
      const liveActionText = showLiveSession ? formatLiveActionLogText(liveActionLog) : '';
      const liveTranscriptText = showLiveSession
        ? formatLiveTranscriptText(liveTranscript, state.activeRun ? state.activeRun.goal : '')
        : '';
      const transcriptRunIds = new Set();
      for (let mi = 0; mi < visibleMessages.length; mi += 1) {
        const message = visibleMessages[mi];
        if (message && message.presentation === 'run_transcript' && message.runId) {
          transcriptRunIds.add(String(message.runId));
        }
      }
      const activeTranscriptRunId =
        showLiveSession && state.activeRun && liveTranscriptText ? String(state.activeRun.id || '') : '';
      if (activeTranscriptRunId) transcriptRunIds.add(activeTranscriptRunId);
      const timelineMessages = visibleMessages.filter(function (message) {
        const runId = String(message && message.runId ? message.runId : '');
        if (activeTranscriptRunId && runId === activeTranscriptRunId && message.role === 'assistant') {
          return false;
        }
        if (runId && transcriptRunIds.has(runId) && message.role === 'system') {
          return false;
        }
        return true;
      });
      const runRecapRunIds = new Set();
      for (let tm = 0; tm < timelineMessages.length; tm += 1) {
        const msg = timelineMessages[tm];
        if (msg && msg.presentation === 'run_change_recap' && msg.runId) {
          runRecapRunIds.add(String(msg.runId));
        }
      }
      const displayedDiffIds = new Set();
      const merged = [];
      let mergeSeq = 0;
      for (let i = 0; i < timelineMessages.length; i += 1) {
        const message = timelineMessages[i];
        merged.push({ kind: 'msg', sort: message.createdAt || '', seq: mergeSeq++, message: message });
      }
      const runReceipts = receiptsForActiveRunTimeline();
      if (!showLiveSession && displayRun && !transcriptRunIds.has(String(displayRun.id || ''))) {
        for (let r = 0; r < runReceipts.length; r += 1) {
          const receipt = runReceipts[r];
          merged.push({
            kind: 'ran',
            sort: receipt.finishedAt || receipt.startedAt || '',
            seq: mergeSeq++,
            receipt: receipt,
            ranKey: receipt.id || 'r' + r,
          });
        }
      }
      merged.sort(function (a, b) {
        if (a.sort < b.sort) return -1;
        if (a.sort > b.sort) return 1;
        if (a.kind !== b.kind) {
          if (a.kind === 'msg') return -1;
          if (b.kind === 'msg') return 1;
          if (a.kind === 'ran') return -1;
          if (b.kind === 'ran') return 1;
        }
        return a.seq - b.seq;
      });

      if (!merged.length && !liveTranscriptText) {
        const empty = document.createElement('div');
        empty.className = 'empty empty-minimal';
        empty.textContent = 'Cutie is ready. Ask in this workspace or use @ for files and windows.';
        chat.appendChild(empty);
        return;
      }

      for (let k = 0; k < merged.length; k += 1) {
        const entry = merged[k];
        if (entry.kind === 'msg') {
          if (entry.message.presentation === 'live_binary' && entry.message.live) {
            const wrap = document.createElement('div');
            wrap.className = 'bubble assistant live-binary';
            const meta = document.createElement('div');
            meta.className = 'live-binary-meta';
            const lv = entry.message.live;
            const parts = [];
            if (lv.phase) parts.push(lv.phase);
            if (typeof lv.progress === 'number') parts.push(Math.round(lv.progress) + '%');
            meta.textContent = parts.join(' · ');
            const body = document.createElement('div');
            body.className = 'live-binary-body';
            body.textContent = entry.message.content || '';
            wrap.appendChild(meta);
            wrap.appendChild(body);
            chat.appendChild(wrap);
          } else if (entry.message.presentation === 'run_change_recap') {
            const recapRunId = String(entry.message.runId || '').trim();
            const runDiffs = recapRunId ? chatDiffsForRun(recapRunId, chatDiffs) : [];
            if (runDiffs.length) {
              appendRunFilesSummaryCard(recapRunId, chatDiffs);
              for (let d = 0; d < runDiffs.length; d += 1) {
                const diff = runDiffs[d];
                appendCutieDiffBubble(diff);
                if (diff && diff.id) displayedDiffIds.add(diff.id);
              }
            } else {
              appendNoFilesChangedCard(entry.message.content || 'No files changed.');
            }
          } else if (entry.message.presentation === 'run_transcript') {
            appendTranscriptBubble(chat, entry.message.content || '');
          } else {
            const div = document.createElement('div');
            div.className = 'bubble ' + entry.message.role;
            div.textContent = entry.message.content;
            chat.appendChild(div);
          }
          if (
            entry.message.role === 'assistant' &&
            !runRecapRunIds.has(String(entry.message.runId || '')) &&
            isTerminalAssistantForRun(entry.message, timelineMessages)
          ) {
            appendRunFilesSummaryCard(entry.message.runId, chatDiffs);
            const runDiffs = chatDiffsForRun(entry.message.runId, chatDiffs);
            for (let d = 0; d < runDiffs.length; d += 1) {
              const diff = runDiffs[d];
              appendCutieDiffBubble(diff);
              if (diff && diff.id) displayedDiffIds.add(diff.id);
            }
          }
        } else if (entry.kind === 'ran') {
          const wrap = document.createElement('div');
          wrap.className = 'bubble assistant ran-line';
          appendReceiptActivityRow(wrap, entry.receipt, { prominent: false });
          chat.appendChild(wrap);
        }
      }

      if (liveTranscriptText) {
        appendTranscriptBubble(chat, liveTranscriptText);
      } else if (liveActionText) {
        appendTranscriptBubble(chat, liveActionText);
      } else {
        const progressText = buildLiveAssistantNarrationText(
          displayRun || null,
          showLiveSession ? state.progress || null : null,
          runReceipts
        );
        if (progressText) {
          const div = document.createElement('div');
          div.className = 'bubble assistant';
          div.textContent = progressText;
          chat.appendChild(div);
        }
      }

      if (showLiveSession && state.activeRun) {
        const activeRunDiffs = chatDiffsForRun(state.activeRun.id, chatDiffs);
        if (activeRunDiffs.length) {
          appendRunFilesSummaryCard(state.activeRun.id, chatDiffs);
        }
        for (let d = 0; d < activeRunDiffs.length; d += 1) {
          const diff = activeRunDiffs[d];
          if (diff && diff.id && displayedDiffIds.has(diff.id)) continue;
          appendCutieDiffBubble(diff);
          if (diff && diff.id) displayedDiffIds.add(diff.id);
        }
      }

      for (let d = 0; d < chatDiffs.length; d += 1) {
        const diff = chatDiffs[d];
        if (diff && diff.id && displayedDiffIds.has(diff.id)) continue;
        appendCutieDiffBubble(diff);
        if (diff && diff.id) displayedDiffIds.add(diff.id);
      }

      chat.scrollTop = chat.scrollHeight;
    }

    function renderDesktop(desktop) {
      const parts = [];
      if (desktop.platform) parts.push(desktop.platform);
      if (desktop.activeWindow && (desktop.activeWindow.app || desktop.activeWindow.title)) {
        parts.push((desktop.activeWindow.app || 'window') + ': ' + (desktop.activeWindow.title || ''));
      }
      if (desktop.displays && desktop.displays.length) {
        parts.push(desktop.displays.length + ' display' + (desktop.displays.length === 1 ? '' : 's'));
      }
      if (desktop.recentSnapshots && desktop.recentSnapshots.length) {
        parts.push(desktop.recentSnapshots.length + ' snapshot' + (desktop.recentSnapshots.length === 1 ? '' : 's'));
      }
      const summary = parts.join(' - ') || 'Desktop unavailable.';
      desktopSummaryPanel.textContent = summary;
    }

    function formatStatusPillBase(status) {
      return String(status || 'Ready').trim() || 'Ready';
    }

    function liveStatusBubbleText() {
      if (!state.running) return '';
      const base = formatStatusPillBase(state.status);
      if (!base || /^ready$/i.test(base)) return '';
      return queuedPrompts.length ? base + ' · ' + queuedPrompts.length + ' queued next' : base;
    }

    function ensureSentence(text) {
      const trimmed = String(text || '').trim();
      if (!trimmed) return '';
      return /[.!?]$/.test(trimmed) ? trimmed : trimmed + '.';
    }

    function formatObjectiveSummaryText(run) {
      const objectives = run && Array.isArray(run.objectives) ? run.objectives : [];
      if (!objectives.length) return '';
      const pending = objectives.filter(function (objective) {
        return String(objective && objective.status ? objective.status : 'pending') !== 'done';
      });
      const relevant = (pending.length ? pending : objectives).slice(0, 4);
      if (!relevant.length) return '';
      const lines = ['I’m working through this now.'];
      if (relevant[0]) {
        lines.push('');
        lines.push('Right now: ' + (String(relevant[0].text || '').trim() || 'Continue the task.'));
      }
      if (relevant.length > 1) {
        lines.push('');
        lines.push('Next:');
        for (let index = 1; index < relevant.length; index += 1) {
          const text = String(relevant[index].text || '').trim();
          if (text) lines.push('• ' + text);
        }
      }
      if (pending.length > relevant.length) {
        lines.push('');
        lines.push('After that I’ll keep going through the remaining steps.');
      }
      return lines.join('\\n');
    }

    function buildLiveAssistantNarrationText(run, progress, receipts) {
      if (!state.running) return '';
      const lines = [];
      const objectiveText = formatObjectiveSummaryText(run);
      const statusText = liveStatusBubbleText();

      if (objectiveText) {
        lines.push(objectiveText);
      } else if (statusText) {
        lines.push(ensureSentence(statusText));
      } else {
        lines.push('I’m working through this now.');
      }

      if (!objectiveText && progress && progress.pursuingLabel) {
        lines.push('');
        lines.push(ensureSentence(progress.pursuingLabel));
      }

      if (progress && progress.phaseLabel) {
        lines.push('');
        lines.push('Current phase: ' + ensureSentence(progress.phaseLabel));
      }

      if (progress && progress.taskFrameSummary) {
        lines.push('Task frame: ' + ensureSentence(progress.taskFrameSummary));
      }

      if (progress && progress.targetSummary) {
        lines.push('Targeting: ' + ensureSentence(progress.targetSummary));
      }

      if (progress && progress.repairLabel) {
        lines.push('Repair status: ' + ensureSentence(progress.repairLabel));
      }

      if (progress && progress.objectiveRepairLabel) {
        lines.push('Objective repair: ' + ensureSentence(progress.objectiveRepairLabel));
      }

      if (progress && progress.repairTacticLabel) {
        lines.push('Repair tactic: ' + ensureSentence(progress.repairTacticLabel));
      }

      if (progress && progress.currentStrategyLabel) {
        lines.push('');
        lines.push('Current strategy: ' + ensureSentence(progress.currentStrategyLabel));
      }

      if (progress && progress.modelStrategySummary) {
        lines.push('Model path: ' + ensureSentence(progress.modelStrategySummary));
      }

      if (progress && progress.stallLabel) {
        lines.push('');
        lines.push(ensureSentence(progress.stallLabel));
      }

      const latestReceipt = Array.isArray(receipts) && receipts.length ? receipts[receipts.length - 1] : null;
      if (latestReceipt) {
        lines.push('');
        lines.push('Latest action: ' + formatRanLineFromReceipt(latestReceipt));
      } else if (progress && progress.lastActionSummary) {
        lines.push('');
        lines.push('Latest action: ' + ensureSentence(progress.lastActionSummary));
      }

      if (progress && progress.lastMeaningfulProgressSummary) {
        lines.push('');
        lines.push('Last real progress: ' + ensureSentence(progress.lastMeaningfulProgressSummary));
      }

      if (progress && progress.lastNewEvidence) {
        lines.push('');
        lines.push('Latest evidence: ' + ensureSentence(progress.lastNewEvidence));
      }

      if (progress && progress.stallReason) {
        lines.push('');
        lines.push(ensureSentence(progress.stallReason));
      }

      if (progress && progress.stallNextAction) {
        lines.push('');
        lines.push('Next tactic: ' + ensureSentence(progress.stallNextAction));
      } else if (!objectiveText && progress && progress.suggestedNextAction) {
        lines.push('');
        lines.push('Next up: ' + ensureSentence(progress.suggestedNextAction));
      }

      if (progress && progress.escalationMessage) {
        lines.push('');
        lines.push(ensureSentence(progress.escalationMessage));
      }

      if (progress && progress.noOpConclusion) {
        lines.push('');
        lines.push(ensureSentence(progress.noOpConclusion));
      }

      return lines.join('\\n').trim();
    }

    function buildPendingAssistantStartupText() {
      if (!isSubmitting || state.running) return '';
      const status = String(state.status || '').trim();
      if (status && !/^ready\\b/i.test(status)) {
        return ensureSentence(status);
      }
      return '';
    }

    function refreshComposerStatusLine() {
      if (!runtimeLine) return;
      if (state.running || isSubmitting) {
        runtimeLine.textContent = '';
        return;
      }
      const warm = state.warmStartState || null;
      const promptState = state.promptState || null;
      if (!warm) {
        runtimeLine.textContent = 'OpenHands orchestration is active.';
        return;
      }
      if (warm.warming && !warm.localReady) {
        runtimeLine.textContent = 'OpenHands orchestration is active. Warming supporting services.';
        return;
      }
      if (promptState && promptState.promptSource === 'external_fallback' && promptState.promptLoadError) {
        runtimeLine.textContent = 'OpenHands orchestration is active. Using the built-in prompt.';
        return;
      }
      if (warm.localReady && warm.hostReady === false) {
        runtimeLine.textContent = 'OpenHands orchestration is active, but the host is still unavailable.';
        return;
      }
      if (warm.localReady) {
        runtimeLine.textContent = 'OpenHands orchestration is active.';
        return;
      }
      if (warm.warmFailureSummary) {
        runtimeLine.textContent = 'OpenHands orchestration is active. Warmup is still in progress.';
        return;
      }
      runtimeLine.textContent = 'OpenHands orchestration is active.';
    }

    function renderPromptQueue() {
      const n = queuedPrompts.length;
      if (!promptQueueWrap || !promptQueueList || !promptQueueCount) return;
      if (!n) {
        promptQueueWrap.classList.add('is-hidden');
        promptQueueList.innerHTML = '';
        promptQueueCount.textContent = '0';
        return;
      }
      promptQueueWrap.classList.remove('is-hidden');
      promptQueueCount.textContent = String(n);
      promptQueueList.innerHTML = '';
      for (let index = 0; index < queuedPrompts.length; index += 1) {
        const item = queuedPrompts[index];
        const row = document.createElement('div');
        row.className = 'prompt-queue-item';
        const num = document.createElement('span');
        num.className = 'prompt-queue-num';
        num.textContent = (index + 1) + '.';
        const text = document.createElement('div');
        text.className = 'prompt-queue-text';
        const normalized = String(item.prompt || '').replace(/\\s+/g, ' ').trim();
        const full = normalized || '(empty)';
        text.textContent = full;
        if (full.length > 280) {
          text.textContent = full.slice(0, 277) + '…';
        }
        text.title = normalized || '(empty)';
        row.appendChild(num);
        row.appendChild(text);
        promptQueueList.appendChild(row);
      }
    }

    function renderRuntime(run) {
      if (objectivesPanel) {
        objectivesPanel.classList.add('is-hidden');
        objectivesPanel.innerHTML = '';
      }
      void run;
      refreshComposerStatusLine();
    }

    function drainQueuedPrompts() {
      if (state.running || isSubmitting || !queuedPrompts.length) return;
      const next = queuedPrompts.shift();
      if (!next) return;
      renderPromptQueue();
      refreshComposerStatusLine();
      sendPrompt(next.prompt, { mentions: next.mentions || [] });
    }

    function queuePrompt(prompt, mentions) {
      queuedPrompts.push({
        prompt,
        mentions: Array.isArray(mentions) ? mentions : [],
      });
      refreshComposerStatusLine();
      renderPromptQueue();
      renderMessages();
      renderRuntime(displayedRunForState(state));
    }

    function clearEphemeralConversationState() {
      pendingSubmission = null;
      queuedPrompts = [];
      recentSubmissionGuard = { prompt: '', until: 0 };
      setComposerSubmitting(false);
      syncLastInputValue();
      renderPromptQueue();
      refreshComposerStatusLine();
      renderMessages();
      renderRuntime(displayedRunForState(state));
    }

    /** Empty composer and the synthetic new-chat draft so “New chat” is a blank slate. */
    function resetComposerForBlankNewChat() {
      drafts.set('__new__', '');
      draftMentions.set('__new__', []);
      if (input) {
        input.value = '';
        syncLastInputValue();
        autoSize();
      }
    }

    function closeSettingsMenu() {
      settingsMenu.classList.add('is-hidden');
      settingsToggle.setAttribute('aria-expanded', 'false');
    }

    function toggleSettingsMenu(force) {
      const shouldOpen = typeof force === 'boolean' ? force : settingsMenu.classList.contains('is-hidden');
      settingsMenu.classList.toggle('is-hidden', !shouldOpen);
      settingsToggle.setAttribute('aria-expanded', shouldOpen ? 'true' : 'false');
    }

    function applyState(next) {
      try {
        applyStateInner(next);
      } catch (err) {
        console.error('Cutie webview applyState failed', err);
        const chatEl = document.getElementById('chat');
        if (chatEl) {
          chatEl.innerHTML =
            '<div class="empty" style="color:var(--vscode-errorForeground,#f88);max-width:100%">' +
            'Cutie hit a UI error while updating the chat. Try Developer: Reload Window, or check the webview console (Help → Toggle Developer Tools).' +
            '</div>';
        }
      }
    }

    function applyStateInner(next) {
      const previousSessionId = state.activeSessionId;
      const switchedConversation = previousSessionId !== next.activeSessionId;
      const hasPendingEcho =
        pendingSubmission &&
        Array.isArray(next.messages) &&
        next.messages.some((message) => matchesPendingSubmissionEcho(message, pendingSubmission));
      const shouldClearPendingWithoutEcho =
        pendingSubmission &&
        !next.running &&
        typeof next.status === 'string' &&
        /sign in|failed|stopped|cancelled|canceled|guidance/i.test(next.status);
      if (hasPendingEcho || shouldClearPendingWithoutEcho) {
        pendingSubmission = null;
      }
      if (switchedConversation) {
        clearEphemeralConversationState();
        selectedArtifactsRunId = '';
        if (!next.activeSessionId) {
          resetComposerForBlankNewChat();
        }
      }

      state = next;
      isSubmitting = false;
      updateComposerPrimaryButton();

      const authState = next.authState || { kind: 'none', label: 'Not signed in' };
      authLabel.textContent = authState.label || 'Not signed in';
      authChip.textContent = authState.kind === 'browser' ? 'Browser' : 'Key';
      authStatusButton.classList.toggle('is-ready', authState.kind !== 'none');
      authStatusButton.title = 'Set Xpersona API key';

      let chatTitle = 'New chat';
      const sessionList = Array.isArray(next.sessions) ? next.sessions : [];
      if (next.activeSessionId) {
        const active = sessionList.find((s) => s.id === next.activeSessionId);
        if (active && active.title) {
          chatTitle = active.title;
        }
      }
      currentChatTitle.textContent = chatTitle;
      if (backgroundStatusPill) {
        const backgroundActivity = next.backgroundActivity || null;
        backgroundStatusPill.classList.toggle('is-hidden', !backgroundActivity);
        backgroundStatusPill.textContent = backgroundActivity ? backgroundActivity.label || 'Working in background' : '';
        backgroundStatusPill.title = backgroundActivity
          ? [backgroundActivity.label || 'Working in background', backgroundActivity.sessionTitle || '', backgroundActivity.detail || '']
              .filter(Boolean)
              .join(' - ')
          : '';
      }

      renderDesktop(next.desktop || { platform: '', displays: [], recentSnapshots: [] });
      renderRuntime(displayedRunForState(next));
      renderBinaryPanel();
      refreshComposerStatusLine();
      renderPromptQueue();
      renderSessions();
      renderArtifactsList();
      renderMessages();

      const settingsSignOutEl = document.getElementById('settingsSignOut');
      if (settingsSignOutEl) settingsSignOutEl.disabled = authState.kind === 'none';

      if (previousSessionId !== next.activeSessionId) {
        restoreDraft();
      }

      if (!next.running) {
        drainQueuedPrompts();
      }
    }

    function sendPrompt(text, options) {
      const prompt = normalizePromptText(text || input.value || '');
      if (!prompt) return;
      const mentionItems = options && Array.isArray(options.mentions)
        ? options.mentions
        : text
          ? []
          : collectCurrentMentions(prompt);
      pendingSubmission = {
        id: '__pending_user__',
        role: 'user',
        content: prompt,
        createdAt: new Date().toISOString(),
      };
      armRecentSubmissionGuard(prompt);
      setComposerSubmitting(true);
      if (runtimeLine) runtimeLine.textContent = '';
      saveDraft();
      drafts.set(currentDraftKey(), '');
      draftMentions.set(currentDraftKey(), []);
      input.value = '';
      closeMentions();
      closeSettingsMenu();
      autoSize();
      syncLastInputValue();
      renderMessages();
      vscode.postMessage({ type: 'submitPrompt', prompt, mentions: mentionItems });
    }

    function handleComposerSendError(error) {
      console.error('Cutie composer send failed', error);
      if (runtimeLine) {
        runtimeLine.textContent = 'Cutie hit a send UI error. Reload the panel if this keeps happening.';
      }
      syncLastInputValue();
    }

    function safelyQueueOrSendPrompt() {
      try {
        queueOrSendPrompt();
      } catch (error) {
        handleComposerSendError(error);
      }
    }

    function queueOrSendPrompt() {
      const prompt = normalizePromptText(input.value || '');
      if (!prompt) return;
      const mentionItems = collectCurrentMentions(prompt);
      if (isSubmitting || matchesRecentSubmissionGuard(prompt)) {
        return;
      }
      if (state.running) {
        queuePrompt(prompt, mentionItems);
        saveDraft();
        drafts.set(currentDraftKey(), '');
        draftMentions.set(currentDraftKey(), []);
        input.value = '';
        closeMentions();
        closeSettingsMenu();
        autoSize();
        syncLastInputValue();
        return;
      }
      sendPrompt(prompt, { mentions: mentionItems });
    }

    try {
      document.getElementById('newChatBtn').addEventListener('click', () => {
        saveDraft();
        resetComposerForBlankNewChat();
        clearEphemeralConversationState();
        closeSettingsMenu();
        closeAllDrawers();
        vscode.postMessage({ type: 'newChat' });
      });
      historyToggle.addEventListener('click', () => {
        closeSettingsMenu();
        setHistoryOpen(!isHistoryOpen());
      });
      artifactsToggle.addEventListener('click', () => {
        closeSettingsMenu();
        setArtifactsOpen(workspaceShell.dataset.artifactsOpen !== 'true');
      });
      drawerScrim.addEventListener('click', () => {
        closeAllDrawers();
        closeSettingsMenu();
      });
      historyCloseBtn.addEventListener('click', () => setHistoryOpen(false));
      artifactsCloseBtn.addEventListener('click', () => setArtifactsOpen(false));
      historyRefreshBtn.addEventListener('click', () => {
        vscode.postMessage({ type: 'refreshView' });
      });
      document.getElementById('settingsSetKey').addEventListener('click', () => {
        closeSettingsMenu();
        vscode.postMessage({ type: 'setApiKey' });
      });
      document.getElementById('settingsSignIn').addEventListener('click', () => {
        closeSettingsMenu();
        vscode.postMessage({ type: 'signIn' });
      });
      document.getElementById('settingsSignOut').addEventListener('click', () => {
        closeSettingsMenu();
        vscode.postMessage({ type: 'signOut' });
      });
      document.getElementById('settingsCopyDebug').addEventListener('click', () => {
        closeSettingsMenu();
        vscode.postMessage({ type: 'copyDebug' });
      });
      document.getElementById('settingsCapture').addEventListener('click', () => {
        closeSettingsMenu();
        vscode.postMessage({ type: 'captureScreen' });
      });
      if (settingsBinaryConfigure) {
        settingsBinaryConfigure.addEventListener('click', () => {
          closeSettingsMenu();
          vscode.postMessage({ type: 'binaryConfigure' });
        });
      }
    function postSendOrStop(event) {
      try {
        if (event) {
          event.preventDefault();
          event.stopPropagation();
          if (typeof event.stopImmediatePropagation === 'function') {
            event.stopImmediatePropagation();
          }
        }
        if (isBusySubmitState()) {
          closeSettingsMenu();
          vscode.postMessage({ type: 'stopAutomation' });
          return;
        }
        if (sendBtn.disabled) return;
        safelyQueueOrSendPrompt();
      } catch (error) {
        handleComposerSendError(error);
      }
    }
    if (composerForm) {
      composerForm.addEventListener('submit', postSendOrStop, true);
    }
    if (sendBtn) {
      sendBtn.addEventListener('click', postSendOrStop, true);
      sendBtn.addEventListener('pointerup', postSendOrStop, true);
      sendBtn.addEventListener('mouseup', postSendOrStop, true);
      sendBtn.onclick = postSendOrStop;
      sendBtn.onpointerup = postSendOrStop;
      sendBtn.onmouseup = postSendOrStop;
    }
    function queueOrAcceptMention() {
      if (mentions.classList.contains('show') && mentionState.items.length) {
        if (acceptMention(mentionState.activeIndex)) {
          return;
        }
        closeMentions();
      }
      safelyQueueOrSendPrompt();
    }

      authStatusButton.addEventListener('click', () => {
        closeSettingsMenu();
        vscode.postMessage({ type: 'setApiKey' });
      });
      settingsToggle.addEventListener('click', () => toggleSettingsMenu());
      document.addEventListener('mousedown', (event) => {
        const t = event.target;
        if (!t || !(t instanceof Node)) return;
        if (t instanceof Element && t.closest('.utility-rail')) return;
        if (
          settingsMenu.contains(t) ||
          settingsToggle.contains(t) ||
          historyDrawer.contains(t) ||
          artifactsDrawer.contains(t) ||
          historyToggle.contains(t) ||
          artifactsToggle.contains(t)
        ) {
          return;
        }
        closeSettingsMenu();
      });

    function isEnterKey(event) {
      if (!event) return false;
      return (
        event.key === 'Enter' ||
        event.key === 'NumpadEnter' ||
        event.code === 'Enter' ||
        event.code === 'NumpadEnter' ||
        event.keyCode === 13 ||
        event.which === 13
      );
    }

    function isMainEnterNoShift(event) {
      if (!event) return false;
      if (event.shiftKey || event.altKey || event.ctrlKey || event.metaKey || event.isComposing) return false;
      return isEnterKey(event);
    }

    function isComposerEvent(event) {
      if (!input || !event) return false;
      if (event.target === input) return true;
      if (document.activeElement === input) return true;
      if (typeof event.composedPath === 'function') {
        const path = event.composedPath();
        if (Array.isArray(path) && path.indexOf(input) !== -1) return true;
      }
      return false;
    }

    function shouldTreatTrailingNewlineAsSend(previousValue, currentValue) {
      const current = String(currentValue || '');
      const previous = String(previousValue || '');
      const normalizedCurrent = current.replace(/\\r\\n/g, '\\n');
      const normalizedPrevious = previous.replace(/\\r\\n/g, '\\n');
      if (!normalizedCurrent.endsWith('\\n')) return false;
      if (!normalizePromptText(normalizedCurrent)) return false;
      if (normalizedCurrent === normalizedPrevious + '\\n') return true;
      if (Date.now() - lastBareEnterIntentAt <= 300) return true;
      const currentWithoutTrailing = normalizedCurrent.replace(/\\n$/, '');
      if (
        currentWithoutTrailing === normalizePromptText(currentWithoutTrailing) &&
        normalizedCurrent.split('\\n').length <= 2
      ) {
        return true;
      }
      return false;
    }

    function onComposerKeydown(event) {
      if (!isComposerEvent(event)) return;

      if (mentions.classList.contains('show') && mentionState.items.length) {
        const down = event.key === 'ArrowDown' || event.code === 'ArrowDown';
        const up = event.key === 'ArrowUp' || event.code === 'ArrowUp';
        if (down) {
          event.preventDefault();
          event.stopPropagation();
          if (typeof event.stopImmediatePropagation === 'function') {
            event.stopImmediatePropagation();
          }
          mentionState.activeIndex = (mentionState.activeIndex + 1) % mentionState.items.length;
          renderMentions();
          return;
        }
        if (up) {
          event.preventDefault();
          event.stopPropagation();
          if (typeof event.stopImmediatePropagation === 'function') {
            event.stopImmediatePropagation();
          }
          mentionState.activeIndex = (mentionState.activeIndex - 1 + mentionState.items.length) % mentionState.items.length;
          renderMentions();
          return;
        }
        if (event.key === 'Tab') {
          event.preventDefault();
          event.stopPropagation();
          acceptMention(mentionState.activeIndex);
          return;
        }
        if (isMainEnterNoShift(event)) {
          event.preventDefault();
          event.stopPropagation();
          if (acceptMention(mentionState.activeIndex)) {
            return;
          }
          closeMentions();
          queueOrAcceptMention();
          return;
        }
        if (event.key === 'Escape') {
          event.preventDefault();
          event.stopPropagation();
          closeMentions();
          closeSettingsMenu();
          closeAllDrawers();
          return;
        }
      }

      if (event.key === 'Escape') {
        event.preventDefault();
        event.stopPropagation();
        closeMentions();
        closeSettingsMenu();
        closeAllDrawers();
        return;
      }

      if (event.key === '@' && !event.ctrlKey && !event.metaKey) {
        scheduleMentionRequestSoon();
      }

      if (!isEnterKey(event)) return;
      if (event.shiftKey || event.altKey || event.ctrlKey || event.metaKey) {
        allowNextLineBreak = true;
        return;
      }
      if (event.isComposing) return;
      noteBareEnterIntent(event);
      allowNextLineBreak = false;
      event.preventDefault();
      event.stopPropagation();
      if (typeof event.stopImmediatePropagation === 'function') {
        event.stopImmediatePropagation();
      }
      queueOrAcceptMention();
    }

    function composerBeforeInput(event) {
      if (!isComposerEvent(event)) return;
      const isLineBreak =
        event.inputType === 'insertLineBreak' ||
        event.inputType === 'insertParagraph' ||
        (event.inputType === 'insertText' && event.data === '\\n');
      if (!isLineBreak) return;
      if (typeof event.isComposing === 'boolean' && event.isComposing) return;
      if (event.shiftKey || event.altKey || event.ctrlKey || event.metaKey) {
        allowNextLineBreak = true;
        return;
      }
      noteBareEnterIntent(event);
      if (allowNextLineBreak) {
        allowNextLineBreak = false;
        return;
      }
      event.preventDefault();
      event.stopPropagation();
      if (typeof event.stopImmediatePropagation === 'function') {
        event.stopImmediatePropagation();
      }
      queueOrAcceptMention();
    }

    function composerKeypressFallback(event) {
      if (!isComposerEvent(event)) return;
      if (!isMainEnterNoShift(event)) return;
      noteBareEnterIntent(event);
      event.preventDefault();
      event.stopPropagation();
      if (typeof event.stopImmediatePropagation === 'function') {
        event.stopImmediatePropagation();
      }
      queueOrAcceptMention();
    }

    function composerInputFallback(event) {
      if (!isComposerEvent(event)) return;
      const inputType = String(event && event.inputType ? event.inputType : '');
      const isPlainLineBreak =
        inputType === 'insertLineBreak' ||
        inputType === 'insertParagraph' ||
        (inputType === 'insertText' && event.data === '\\n');
      const currentValue = String(input.value || '');
      const previousValue = String(lastInputValue || '');
      if (!isPlainLineBreak && !shouldTreatTrailingNewlineAsSend(previousValue, currentValue)) return;
      if (allowNextLineBreak) {
        allowNextLineBreak = false;
        return;
      }
      if (!currentValue.endsWith('\\n')) return;
      input.value = currentValue.replace(/\\r?\\n$/, '');
      autoSize();
      syncLastInputValue();
      queueOrAcceptMention();
    }

    function maybeSendFromImplicitTrailingLineBreak() {
      if (!input) return false;
      if (allowNextLineBreak) {
        syncLastInputValue();
        return false;
      }
      const currentValue = String(input.value || '');
      const previousValue = String(lastInputValue || '');
      if (!previousValue) {
        syncLastInputValue();
        return false;
      }
      const caretAtEnd =
        (input.selectionStart || 0) === currentValue.length && (input.selectionEnd || 0) === currentValue.length;
      const appendedBareEnter = shouldTreatTrailingNewlineAsSend(previousValue, currentValue);
      if (!caretAtEnd || !appendedBareEnter) {
        syncLastInputValue();
        return false;
      }
      input.value = previousValue;
      autoSize();
      syncLastInputValue();
      queueOrAcceptMention();
      return true;
    }

    function composerKeyupFallback(event) {
      if (!isComposerEvent(event)) return;
      if (isMainEnterNoShift(event)) {
        noteBareEnterIntent(event);
      }
      if (isMainEnterNoShift(event) && maybeSendFromImplicitTrailingLineBreak()) {
        return;
      }
      if (event.key === 'Enter' || event.code === 'Enter' || event.code === 'NumpadEnter') {
        allowNextLineBreak = false;
      }
      if (
        event.key === 'ArrowLeft' ||
        event.key === 'ArrowRight' ||
        event.key === 'ArrowUp' ||
        event.key === 'ArrowDown' ||
        event.code === 'ArrowLeft' ||
        event.code === 'ArrowRight' ||
        event.code === 'ArrowUp' ||
        event.code === 'ArrowDown'
      ) {
        requestMentions();
      }
    }

      input.addEventListener('input', () => {
        if (maybeSendFromImplicitTrailingLineBreak()) {
          return;
        }
        saveDraft();
        autoSize();
        requestMentions();
        syncLastInputValue();
      }, true);
      input.addEventListener('click', () => requestMentions());
      input.addEventListener('keyup', composerKeyupFallback, true);
      input.addEventListener('focus', startComposerWatch, true);
      input.addEventListener('blur', () => {
        allowNextLineBreak = false;
        stopComposerWatch();
      });

      window.addEventListener('message', (event) => {
        const message = event.data;
        if (!message) return;
        if (message.type === 'state') {
          applyState(message.state);
          return;
        }
        if (message.type === 'mentions') {
          applyMentionsResponse(Number(message.requestId || 0), message.items || []);
        }
      });

      autoSize();
      closeSettingsMenu();
    } catch (error) {
      window.__cutieReportFatalError(error);
    }

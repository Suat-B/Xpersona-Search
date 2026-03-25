"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.activate = activate;
exports.deactivate = deactivate;
const vscode = __importStar(require("vscode"));
const path = __importStar(require("path"));
const auth_1 = require("./auth");
const cutie_binary_controller_1 = require("./cutie-binary-controller");
const cutie_autonomy_controller_1 = require("./cutie-autonomy-controller");
const cutie_code_intelligence_1 = require("./cutie-code-intelligence");
const cutie_model_adapter_1 = require("./cutie-model-adapter");
const config_1 = require("./config");
const cutie_desktop_adapter_1 = require("./cutie-desktop-adapter");
const cutie_model_client_1 = require("./cutie-model-client");
const cutie_operating_prompt_1 = require("./cutie-operating-prompt");
const cutie_native_autonomy_1 = require("./cutie-native-autonomy");
const cutie_runtime_1 = require("./cutie-runtime");
const cutie_session_store_1 = require("./cutie-session-store");
const cutie_transcript_1 = require("./cutie-transcript");
const cutie_tool_registry_1 = require("./cutie-tool-registry");
const cutie_workspace_adapter_1 = require("./cutie-workspace-adapter");
const diff_1 = require("diff");
const cutie_diff_1 = require("./cutie-diff");
const webview_html_1 = require("./webview-html");
const cutie_policy_1 = require("./cutie-policy");
const binary_portable_context_1 = require("./binary-portable-context");
const selection_prefill_1 = require("./selection-prefill");
const cutie_playground_chat_bridge_1 = require("./cutie-playground-chat-bridge");
function goalLabel(goal) {
    switch (goal) {
        case "code_change":
            return "Editing file";
        case "workspace_investigation":
            return "Inspecting workspace";
        case "desktop_action":
            return "Desktop action";
        case "conversation":
        default:
            return "Conversation";
    }
}
function phaseLabel(run) {
    if (run.objectivesPhase === "decomposing")
        return "Planning task objectives";
    if (run.phase === "needs_guidance")
        return "Need guidance";
    if (run.phase === "repairing")
        return "Repairing action plan";
    if (run.phase === "collecting_context")
        return "Inspecting target context";
    if (run.phase === "planning") {
        if (run.goal === "code_change" && run.stepCount > 0)
            return "Preparing concrete edit";
        return "Planning next step";
    }
    if (run.phase === "executing_tool")
        return "Executing tool";
    if (run.phase === "completed")
        return "Completed";
    if (run.phase === "failed")
        return "Failed";
    if (run.phase === "canceled")
        return "Canceled";
    return "Idle";
}
function pursuitLabel(run) {
    if (run.goal === "code_change") {
        return run.goalSatisfied ? "Real file change achieved" : "Still working toward a file change";
    }
    if (run.goal === "desktop_action") {
        return run.goalSatisfied ? "Desktop action completed" : "Still working toward a desktop action";
    }
    if (run.goal === "workspace_investigation") {
        return run.goalSatisfied ? "Investigation progressed" : "Still gathering the answer";
    }
    return "Handling the conversation";
}
function buildProgressViewModel(run) {
    if (!run)
        return null;
    const taskFrameSummary = (0, cutie_code_intelligence_1.summarizeTaskFrame)(run.taskFrame);
    const targetSummary = (0, cutie_code_intelligence_1.summarizeTargetCandidates)(run.targetCandidates, run.preferredTargetPath);
    return {
        goal: run.goal,
        goalLabel: goalLabel(run.goal),
        phaseLabel: phaseLabel(run),
        pursuingLabel: pursuitLabel(run),
        ...(run.lastMeaningfulProgressSummary ? { lastMeaningfulProgressSummary: run.lastMeaningfulProgressSummary } : {}),
        ...(run.lastActionSummary ? { lastActionSummary: run.lastActionSummary } : {}),
        ...(taskFrameSummary ? { taskFrameSummary } : {}),
        ...(targetSummary ? { targetSummary } : {}),
        ...(run.repairAttemptCount > 0 ? { repairLabel: `Repair stage ${run.repairAttemptCount}` } : {}),
        ...(run.objectiveRepairCount && run.objectiveRepairCount > 0
            ? { objectiveRepairLabel: `Objective repair ${run.objectiveRepairCount}` }
            : {}),
        ...(run.currentRepairTactic ? { repairTacticLabel: run.currentRepairTactic.replace(/_/g, " ") } : {}),
        ...(run.stallLevel && run.stallLevel !== "none" ? { stallLabel: (0, cutie_autonomy_controller_1.getStallLabel)(run) } : {}),
        ...(run.stallReason ? { stallReason: run.stallReason } : {}),
        ...(run.stallNextAction ? { stallNextAction: run.stallNextAction } : {}),
        ...(run.lastNewEvidence ? { lastNewEvidence: run.lastNewEvidence } : {}),
        ...(run.noOpConclusion ? { noOpConclusion: run.noOpConclusion } : {}),
        ...(run.modelAdapter ||
            run.protocolMode ||
            run.normalizationSource ||
            run.artifactExtractionShape ||
            run.fallbackModeUsed ||
            run.simpleTaskFastPath ||
            run.objectiveSuspendedForDirectRecovery ||
            run.promptSource
            ? {
                modelStrategySummary: [
                    run.modelAdapter ? `adapter ${run.modelAdapter}` : "",
                    run.protocolMode ? `mode ${run.protocolMode}` : "",
                    run.normalizationSource ? `source ${run.normalizationSource}` : "",
                    run.artifactExtractionShape ? `artifact ${run.artifactExtractionShape}` : "",
                    run.fallbackModeUsed && run.fallbackModeUsed !== "none" ? `fallback ${run.fallbackModeUsed}` : "",
                    run.simpleTaskFastPath ? "fast-path" : "",
                    run.objectiveSuspendedForDirectRecovery ? "objectives suspended" : "",
                    run.suppressedToolRescued ? `rescued ${run.suppressedToolName || "artifact"}` : "",
                    run.patchDisabledForRun ? "patch disabled" : "",
                    run.mutationCoercionMode ? `coercion ${run.mutationCoercionMode}` : "",
                    run.promptSource ? `prompt ${run.promptSource}` : "",
                    run.promptSource === "external_fallback" && run.promptLoadError ? "prompt fallback" : "",
                ]
                    .filter(Boolean)
                    .join(" • "),
            }
            : {}),
        ...((0, cutie_autonomy_controller_1.getCurrentStrategyLabel)(run) ? { currentStrategyLabel: (0, cutie_autonomy_controller_1.getCurrentStrategyLabel)(run) } : {}),
        ...(run.stuckReason ? { escalationMessage: run.stuckReason } : {}),
        ...(run.suggestedNextAction || run.nextDeterministicAction
            ? { suggestedNextAction: run.suggestedNextAction || run.nextDeterministicAction }
            : {}),
        goalSatisfied: run.goalSatisfied,
        escalationState: run.escalationState,
        ...(run.objectives?.length ? { objectives: run.objectives } : {}),
        ...(run.objectivesPhase ? { objectivesPhase: run.objectivesPhase } : {}),
    };
}
function isBusySubmitState(submitState) {
    return submitState === "submitting" || submitState === "starting" || submitState === "running" || submitState === "stopping";
}
function settledStatusForRun(run) {
    if (!run)
        return "Ready for your next message.";
    if (run.status === "completed")
        return "Cutie completed the run.";
    if (run.status === "needs_guidance")
        return "Cutie needs guidance to keep making real progress.";
    if (run.status === "canceled")
        return "Cutie run cancelled.";
    if (run.error)
        return `Cutie stopped: ${run.error}`;
    return "Cutie stopped early.";
}
function isTerminalRunStatus(status) {
    return status === "completed" || status === "failed" || status === "canceled";
}
function buildDefaultDesktopState() {
    return {
        platform: process.platform,
        displays: [],
        activeWindow: null,
        recentSnapshots: [],
        capabilities: {
            windowsSupported: process.platform === "win32",
            experimentalAdaptersEnabled: false,
        },
    };
}
function escapeWebviewFailureHtml(value) {
    return String(value || "")
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;");
}
function buildWebviewFailureHtml(message) {
    const safeMessage = escapeWebviewFailureHtml(message || "Unknown Cutie webview error.");
    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Cutie</title>
  <style>
    :root {
      color-scheme: var(--vscode-color-scheme, dark);
    }
    html, body {
      margin: 0;
      min-height: 100%;
      background: var(--vscode-editor-background, #111418);
      color: var(--vscode-foreground, #f5f7fb);
      font-family: var(--vscode-font-family, "Segoe UI", sans-serif);
    }
    body {
      padding: 20px;
    }
    .card {
      max-width: 720px;
      padding: 16px;
      border: 1px solid var(--vscode-panel-border, #2d3440);
      border-radius: 12px;
      background: var(--vscode-sideBar-background, #171b22);
      box-shadow: 0 14px 32px rgba(0, 0, 0, 0.28);
    }
    h1 {
      margin: 0 0 10px;
      font-size: 16px;
    }
    p {
      margin: 0 0 12px;
      color: var(--vscode-descriptionForeground, #a4acb9);
      line-height: 1.5;
    }
    pre {
      margin: 0;
      padding: 12px;
      overflow: auto;
      border-radius: 10px;
      background: var(--vscode-input-background, #11161d);
      white-space: pre-wrap;
      word-break: break-word;
    }
  </style>
</head>
<body>
  <div class="card">
    <h1>Cutie could not load the chat UI</h1>
    <p>Reload the window after installing the latest Cutie build. If this keeps happening, the error below is the part we need.</p>
    <pre>${safeMessage}</pre>
  </div>
</body>
</html>`;
}
function asMentionArray(value) {
    if (!Array.isArray(value))
        return [];
    return value
        .map((item) => {
        if (!item || typeof item !== "object")
            return null;
        const row = item;
        const kind = row.kind === "window" ? "window" : row.kind === "file" ? "file" : null;
        const label = String(row.label || "").trim();
        const insertText = String(row.insertText || "").trim();
        const detail = String(row.detail || "").trim();
        if (!kind || !label || !insertText)
            return null;
        return {
            kind,
            label,
            insertText,
            ...(detail ? { detail } : {}),
        };
    })
        .filter((item) => Boolean(item));
}
function normalizeMentionQuery(value) {
    return String(value || "")
        .trim()
        .replace(/^@+/, "")
        .toLowerCase();
}
function isIgnoredWorkspacePath(relativePath) {
    const normalized = relativePath.replace(/\\/g, "/").toLowerCase();
    return (normalized.startsWith(".git/") ||
        normalized.includes("/.git/") ||
        normalized.startsWith("node_modules/") ||
        normalized.includes("/node_modules/") ||
        normalized.startsWith(".next/") ||
        normalized.includes("/.next/"));
}
function scoreFilePath(relativePath, query, options) {
    const normalizedPath = relativePath.toLowerCase();
    const baseName = path.basename(relativePath).toLowerCase();
    let score = 0;
    if (options?.activePath && options.activePath.toLowerCase() === normalizedPath)
        score += 200;
    if (options?.openPaths?.has(normalizedPath))
        score += 120;
    if (!query) {
        score += 10;
    }
    else {
        if (baseName === query)
            score += 140;
        else if (baseName.startsWith(query))
            score += 100;
        else if (baseName.includes(query))
            score += 72;
        if (normalizedPath.startsWith(query))
            score += 56;
        else if (normalizedPath.includes(query))
            score += 32;
    }
    score -= Math.min(relativePath.length, 120) / 200;
    return score;
}
/** Primary line = basename only; secondary line = badge (e.g. Active file) + parent folder path. */
function mentionDisplayForWorkspaceFile(relativePath, badge) {
    const norm = relativePath.replace(/\\/g, "/").trim();
    const base = path.posix.basename(norm) || norm;
    const dirRaw = path.posix.dirname(norm);
    const folder = dirRaw && dirRaw !== "." && dirRaw !== "/" ? dirRaw.replace(/\/+$/, "") : "";
    const parts = [badge, folder].map((s) => String(s || "").trim()).filter(Boolean);
    const detail = parts.length ? parts.join(" · ") : undefined;
    return { label: base, ...(detail ? { detail } : {}) };
}
function scoreWindow(windowValue, query, isActive) {
    const title = String(windowValue.title || "").toLowerCase();
    const app = String(windowValue.app || "").toLowerCase();
    let score = isActive ? 80 : 0;
    if (!query)
        return score + (title ? 24 : 0) + (app ? 12 : 0);
    if (title === query || app === query)
        score += 110;
    if (title.startsWith(query) || app.startsWith(query))
        score += 80;
    if (title.includes(query) || app.includes(query))
        score += 48;
    return score;
}
class CutieSidebarProvider {
    constructor(context, auth) {
        this.context = context;
        this.auth = auth;
        this.activeSessionId = null;
        this.activeSession = null;
        this.status = "Ready for a local Cutie run.";
        this.submitState = "idle";
        this.webviewReady = false;
        this.webviewReadyTimeout = null;
        this.webviewBootNonce = 0;
        this.activeRun = null;
        this.currentAbortController = null;
        /** Monotonic guard so callbacks from an older aborted run cannot overwrite a newer conversation state. */
        this.runRequestVersion = 0;
        this.streamingAssistantText = "";
        this.suppressedAssistantArtifactText = "";
        this.liveActionLog = [];
        this.liveActionLogRunId = null;
        this.liveTranscript = [];
        this.liveTranscriptRunId = null;
        this.liveActionSeenReceiptIds = new Set();
        this.liveActionLastStatus = "";
        this.liveActionLogByRunId = new Map();
        this.liveTranscriptByRunId = new Map();
        this.liveActionSeenReceiptIdsByRunId = new Map();
        this.liveActionLastStatusByRunId = new Map();
        this.liveActionTranscriptPersistedRunIds = new Set();
        this.desktopState = buildDefaultDesktopState();
        this.desktopStateFetchedAt = 0;
        this.gitStatusFetchedAt = 0;
        this.gitStatusPromise = null;
        this.fastStartWarmupPromise = null;
        this.warmStartSnapshot = null;
        this.warmStartWarming = false;
        this.hostProbePromise = null;
        this.hostReady = null;
        this.hostReadyCheckedAt = 0;
        this.cachedRequestAuth = null;
        this.operatingPromptLoadPromise = null;
        this.operatingPromptState = {
            promptSource: "builtin_only",
            promptMarkdownPath: (0, config_1.getPromptMarkdownPath)(),
            promptLoaded: false,
        };
        this.operatingPromptWatcher = null;
        this.warmRefreshDebounce = null;
        this.authState = {
            kind: "none",
            label: "Not signed in",
        };
        /** Cached workspace paths for @ file lookup (avoid findFiles on every keystroke). */
        this.workspaceMentionPaths = null;
        this.workspaceMentionPathsFetchedAt = 0;
        this.workspaceMentionIndexPromise = null;
        /** Inline chat diff cards keyed by session id (rehydrated from persisted run receipts on load). */
        this.chatDiffsBySessionId = new Map();
        /** Recent workspace paths mutated by Cutie (portable bundle retrievalHints). */
        this.recentPortableBundleTouchedPaths = [];
        this.desktop = new cutie_desktop_adapter_1.CutieDesktopAdapter();
        this.workspaceAdapter = new cutie_workspace_adapter_1.CutieWorkspaceAdapter();
        this.modelClient = new cutie_model_client_1.CutieModelClient();
        this.modelAdapter = new cutie_model_adapter_1.CutieModelAdapter(this.modelClient);
        this.ideRuntimeValues = new Set(["cutie", "playgroundApi", "qwenCode"]);
        this.sessionStore = new cutie_session_store_1.CutieSessionStore(context);
        this.playgroundChatBridge = new cutie_playground_chat_bridge_1.CutiePlaygroundChatBridge(context, auth);
        this.toolRegistry = new cutie_tool_registry_1.CutieToolRegistry(new cutie_workspace_adapter_1.CutieWorkspaceAdapter(), this.desktop);
        this.runtime = new cutie_runtime_1.CutieRuntime(this.sessionStore, this.modelAdapter, this.toolRegistry, async () => this.gatherContext());
        this.binaryController = new cutie_binary_controller_1.CutieBinaryBundleController(this.context, this.auth, this.sessionStore, {
            getWorkspaceHash: () => (0, config_1.getWorkspaceHash)(),
            getActiveSession: () => this.activeSession,
            setActiveSession: (session) => {
                this.activeSession = session;
                this.activeSessionId = session?.id ?? null;
            },
            emitState: () => this.emitState(),
            gatherBinaryContext: (intent) => this.gatherBinaryContextForPortableBundle(intent),
            showView: () => this.show(),
        });
        this.auth.onDidChange(() => {
            this.invalidateRequestAuthCache();
            this.hostReady = null;
            this.hostReadyCheckedAt = 0;
            this.hostFailureSummary = undefined;
            void this.refreshAuthState().finally(() => {
                void this.prewarmFastStartState();
                void this.emitState();
            });
        });
        this.context.subscriptions.push(vscode.workspace.onDidChangeWorkspaceFolders(() => {
            this.invalidateWorkspaceMentionIndex();
            this.scheduleWarmStartRefresh(true);
        }), vscode.window.onDidChangeActiveTextEditor(() => {
            this.scheduleWarmStartRefresh();
        }), vscode.window.onDidChangeVisibleTextEditors(() => {
            this.scheduleWarmStartRefresh();
        }), vscode.languages.onDidChangeDiagnostics(() => {
            this.scheduleWarmStartRefresh();
        }), vscode.workspace.onDidChangeConfiguration((event) => {
            if (event.affectsConfiguration("cutie-product.baseApiUrl") ||
                event.affectsConfiguration("cutie-product.binary") ||
                event.affectsConfiguration("cutie-product.model") ||
                event.affectsConfiguration("cutie-product.reasoningLevel") ||
                event.affectsConfiguration("cutie-product.contextPreviewChars") ||
                event.affectsConfiguration("cutie-product.openFilePreviewLines") ||
                event.affectsConfiguration("cutie-product.maxOpenFilesInContext") ||
                event.affectsConfiguration("cutie-product.maxToolsPerBatch") ||
                event.affectsConfiguration("cutie-product.contextReceiptWindow") ||
                event.affectsConfiguration("cutie-product.investigationPreflight") ||
                event.affectsConfiguration("cutie-product.objectiveBasedRuns") ||
                event.affectsConfiguration("cutie-product.objectiveBasedInvestigation") ||
                event.affectsConfiguration("cutie-product.maxToolSteps") ||
                event.affectsConfiguration("cutie-product.maxWorkspaceMutations") ||
                event.affectsConfiguration("cutie-product.unlimitedAutonomy")) {
                if (event.affectsConfiguration("cutie-product.baseApiUrl")) {
                    this.hostReady = null;
                    this.hostReadyCheckedAt = 0;
                    this.hostFailureSummary = undefined;
                    this.invalidateRequestAuthCache();
                }
                this.scheduleWarmStartRefresh(event.affectsConfiguration("cutie-product.baseApiUrl"));
                void this.emitState();
            }
        }));
        this.context.subscriptions.push({
            dispose: () => {
                this.clearWebviewReadyTimeout();
                if (this.warmRefreshDebounce) {
                    clearTimeout(this.warmRefreshDebounce);
                    this.warmRefreshDebounce = null;
                }
            },
        });
    }
    resetLiveActionLog(runId = null) {
        this.liveActionLog = [];
        this.liveActionLogRunId = runId;
        this.liveTranscript = [];
        this.liveTranscriptRunId = runId;
        this.liveActionSeenReceiptIds = new Set();
        this.liveActionLastStatus = "";
        if (runId) {
            this.liveActionLogByRunId.set(runId, []);
            this.liveTranscriptByRunId.set(runId, []);
            this.liveActionSeenReceiptIdsByRunId.set(runId, []);
            this.liveActionLastStatusByRunId.set(runId, "");
        }
    }
    ensureLiveActionLogForRun(run) {
        const runId = run?.id || null;
        if (runId !== this.liveActionLogRunId) {
            const carryOverTranscript = !this.liveTranscriptRunId && this.liveTranscript.length ? [...this.liveTranscript] : [];
            this.liveActionLogRunId = runId;
            this.liveActionLog = runId ? [...(this.liveActionLogByRunId.get(runId) || [])] : [];
            this.liveTranscriptRunId = runId;
            this.liveTranscript = runId ? [...(this.liveTranscriptByRunId.get(runId) || []), ...carryOverTranscript] : carryOverTranscript;
            this.liveActionSeenReceiptIds = new Set(runId ? this.liveActionSeenReceiptIdsByRunId.get(runId) || [] : []);
            this.liveActionLastStatus = runId ? this.liveActionLastStatusByRunId.get(runId) || "" : "";
            this.persistLiveActionStateForCurrentRun();
        }
    }
    persistLiveActionStateForCurrentRun() {
        const runId = this.liveActionLogRunId;
        if (!runId)
            return;
        this.liveActionLogByRunId.set(runId, [...this.liveActionLog]);
        this.liveTranscriptByRunId.set(runId, this.liveTranscript.map((event) => ({ ...event })));
        this.liveActionSeenReceiptIdsByRunId.set(runId, Array.from(this.liveActionSeenReceiptIds));
        this.liveActionLastStatusByRunId.set(runId, this.liveActionLastStatus);
    }
    getLiveActionLogForRun(run) {
        const runId = run?.id || null;
        if (!runId)
            return [];
        if (runId === this.liveActionLogRunId)
            return [...this.liveActionLog];
        return [...(this.liveActionLogByRunId.get(runId) || [])];
    }
    getLiveTranscriptForRun(run) {
        const runId = run?.id || null;
        if (!runId)
            return this.liveTranscript.map((event) => ({ ...event }));
        if (runId === this.liveTranscriptRunId)
            return this.liveTranscript.map((event) => ({ ...event }));
        return (this.liveTranscriptByRunId.get(runId) || []).map((event) => ({ ...event }));
    }
    upsertLiveTranscriptEvent(input) {
        const text = String(input.text || "").trim();
        if (!text)
            return;
        if (input.run) {
            this.ensureLiveActionLogForRun(input.run);
        }
        const slot = String(input.slot || "").trim();
        const dedupeKey = String(input.dedupeKey || "").trim();
        if (slot) {
            const existingIndex = this.liveTranscript.findIndex((event) => event.slot === slot);
            if (existingIndex >= 0) {
                this.liveTranscript[existingIndex] = {
                    ...this.liveTranscript[existingIndex],
                    kind: input.kind,
                    text,
                    ...(input.run?.id ? { runId: input.run.id } : {}),
                    ...(dedupeKey ? { dedupeKey } : {}),
                };
                this.persistLiveActionStateForCurrentRun();
                return;
            }
        }
        const last = this.liveTranscript[this.liveTranscript.length - 1];
        if (last &&
            last.kind === input.kind &&
            last.text === text &&
            ((!dedupeKey && !last.dedupeKey) || (dedupeKey && last.dedupeKey === dedupeKey))) {
            return;
        }
        this.liveTranscript.push({
            id: (0, cutie_policy_1.randomId)("cutie_tx"),
            kind: input.kind,
            text,
            createdAt: input.createdAt || new Date().toISOString(),
            ...(input.run?.id ? { runId: input.run.id } : {}),
            ...(slot ? { slot } : {}),
            ...(dedupeKey ? { dedupeKey } : {}),
        });
        this.persistLiveActionStateForCurrentRun();
    }
    async persistUnifiedRunTranscript(run) {
        if (!run)
            return;
        const runId = String(run.id || "").trim();
        if (!runId || this.liveActionTranscriptPersistedRunIds.has(runId))
            return;
        const events = this.getLiveTranscriptForRun(run);
        const transcriptText = (0, cutie_transcript_1.buildOperationalTranscriptText)(events, run.goal);
        if (!transcriptText || !(0, cutie_transcript_1.hasVisibleOperationalTranscript)(events, run.goal))
            return;
        const sourceSession = this.activeSession;
        if (!sourceSession)
            return;
        const messages = [...sourceSession.messages];
        let updated = false;
        for (let index = messages.length - 1; index >= 0; index -= 1) {
            const message = messages[index];
            if (message.role !== "assistant" || message.runId !== runId)
                continue;
            messages[index] = {
                ...message,
                content: (0, cutie_transcript_1.mergeTranscriptIntoAssistantContent)({
                    events,
                    assistantContent: message.content,
                    goal: run.goal,
                }),
                presentation: "run_transcript",
            };
            updated = true;
            break;
        }
        const nextSession = updated
            ? await this.sessionStore.replaceMessages(sourceSession, messages)
            : await this.sessionStore.appendMessage(sourceSession, {
                role: "assistant",
                content: transcriptText,
                runId,
                presentation: "run_transcript",
            });
        this.liveActionTranscriptPersistedRunIds.add(runId);
        this.activeSession = nextSession;
        this.activeSessionId = nextSession.id;
    }
    appendLiveActionLine(rawLine) {
        const line = String(rawLine || "").trim();
        if (!line)
            return;
        if (this.liveActionLog.length && this.liveActionLog[this.liveActionLog.length - 1] === line)
            return;
        this.liveActionLog.push(line);
        if (this.liveActionLog.length > CutieSidebarProvider.MAX_LIVE_ACTION_LINES) {
            this.liveActionLog = this.liveActionLog.slice(-CutieSidebarProvider.MAX_LIVE_ACTION_LINES);
        }
        this.persistLiveActionStateForCurrentRun();
    }
    formatLiveActionReceiptLine(receipt) {
        const step = typeof receipt.step === "number" && receipt.step > 0 ? `Step ${receipt.step}: ` : "";
        const summary = String(receipt.summary || "").trim();
        if (receipt.status === "failed") {
            const err = String(receipt.error || "").trim();
            return `${step}${summary || `${receipt.toolName} failed.`}${err ? ` ${err}` : ""}`.trim();
        }
        if (receipt.status === "blocked") {
            const err = String(receipt.error || "").trim();
            return `${step}${summary || `${receipt.toolName} was blocked.`}${err ? ` ${err}` : ""}`.trim();
        }
        return `${step}${summary || `Ran ${receipt.toolName}.`}`.trim();
    }
    syncLiveActionReceipts(run) {
        if (!run)
            return;
        this.ensureLiveActionLogForRun(run);
        for (const receipt of run.receipts || []) {
            const receiptId = String(receipt.id || "").trim();
            const seenKey = receiptId || `${run.id}:${receipt.step}:${receipt.toolName}:${receipt.status}`;
            if (this.liveActionSeenReceiptIds.has(seenKey))
                continue;
            this.liveActionSeenReceiptIds.add(seenKey);
            const line = this.formatLiveActionReceiptLine(receipt);
            this.appendLiveActionLine(line);
            this.upsertLiveTranscriptEvent({
                kind: "tool_result",
                text: line,
                run,
                createdAt: receipt.finishedAt || receipt.startedAt,
                slot: receiptId ? `receipt:${receiptId}` : undefined,
                dedupeKey: seenKey,
            });
        }
    }
    noteLiveActionStatus(status, run) {
        if (!run)
            return;
        this.ensureLiveActionLogForRun(run);
        const line = String(status || "").trim();
        if (!line || line === this.liveActionLastStatus)
            return;
        this.liveActionLastStatus = line;
        this.appendLiveActionLine(line);
        this.upsertLiveTranscriptEvent({
            kind: "status",
            text: line,
            run,
            dedupeKey: `status:${line}`,
        });
        this.persistLiveActionStateForCurrentRun();
    }
    async gatherBinaryContextForPortableBundle(intent) {
        return (0, binary_portable_context_1.gatherPortableBundleContext)({
            intentText: intent,
            recentTouchedPaths: [...this.recentPortableBundleTouchedPaths],
        });
    }
    invalidateWorkspaceMentionIndex() {
        this.workspaceMentionPaths = null;
        this.workspaceMentionPathsFetchedAt = 0;
        this.workspaceMentionIndexPromise = null;
    }
    async ensureWorkspaceMentionIndex() {
        const now = Date.now();
        if (this.workspaceMentionPaths &&
            now - this.workspaceMentionPathsFetchedAt < CutieSidebarProvider.WORKSPACE_MENTION_INDEX_TTL_MS) {
            return this.workspaceMentionPaths;
        }
        if (this.workspaceMentionIndexPromise) {
            return this.workspaceMentionIndexPromise;
        }
        this.workspaceMentionIndexPromise = (async () => {
            if (!(0, config_1.getWorkspaceRootPath)()) {
                this.workspaceMentionPaths = [];
                this.workspaceMentionPathsFetchedAt = Date.now();
                return [];
            }
            const exclude = "**/{node_modules,.git,.svn,.hg,dist,build,out,.next,.turbo,target}/**";
            let uris = [];
            try {
                uris = await vscode.workspace.findFiles("**/*", exclude, 2500);
            }
            catch {
                uris = [];
            }
            const paths = uris
                .map((uri) => (0, config_1.toWorkspaceRelativePath)(uri))
                .filter((p) => typeof p === "string" && p.length > 0 && !isIgnoredWorkspacePath(p));
            this.workspaceMentionPaths = paths;
            this.workspaceMentionPathsFetchedAt = Date.now();
            return paths;
        })();
        try {
            return await this.workspaceMentionIndexPromise;
        }
        finally {
            this.workspaceMentionIndexPromise = null;
        }
    }
    /**
     * Keep @ suggestions snappy:
     * - Return fresh cache immediately.
     * - If cache is stale, return stale results while refreshing in background.
     * - If no cache exists yet, wait briefly for the first index build, then fall back.
     */
    async getWorkspaceMentionPathsForQuery() {
        const cached = this.workspaceMentionPaths;
        const cacheIsFresh = Boolean(cached &&
            Date.now() - this.workspaceMentionPathsFetchedAt < CutieSidebarProvider.WORKSPACE_MENTION_INDEX_TTL_MS);
        if (cacheIsFresh && cached) {
            return cached;
        }
        const refreshPromise = this.ensureWorkspaceMentionIndex().catch(() => this.workspaceMentionPaths || []);
        if (cached && cached.length > 0) {
            void refreshPromise;
            return cached;
        }
        let timeoutHandle = null;
        const timeoutPromise = new Promise((resolve) => {
            timeoutHandle = setTimeout(() => resolve(null), CutieSidebarProvider.MENTION_QUERY_INDEX_WAIT_MS);
        });
        try {
            const result = await Promise.race([refreshPromise, timeoutPromise]);
            return Array.isArray(result) ? result : this.workspaceMentionPaths || [];
        }
        finally {
            if (timeoutHandle)
                clearTimeout(timeoutHandle);
        }
    }
    resolveWebviewView(webviewView) {
        this.view = webviewView;
        this.webviewReady = false;
        webviewView.webview.options = { enableScripts: true };
        try {
            webviewView.webview.html = (0, webview_html_1.buildWebviewHtml)(webviewView.webview);
            webviewView.webview.onDidReceiveMessage((message) => {
                void this.handleMessage(message);
            });
            this.armWebviewReadyTimeout(webviewView);
            void this.initializeView();
        }
        catch (error) {
            this.clearWebviewReadyTimeout();
            const message = error instanceof Error ? error.stack || error.message : String(error);
            webviewView.webview.html = buildWebviewFailureHtml(message);
            this.status = `Cutie UI failed to load: ${error instanceof Error ? error.message : String(error)}`;
            console.error("cutie-product resolveWebviewView failed", error);
            void vscode.window.showErrorMessage(this.status);
        }
    }
    async show() {
        await vscode.commands.executeCommand(`${config_1.VIEW_ID}.focus`);
    }
    async runBinaryGenerateFromEditor(prefill) {
        await this.binaryController.runBinaryGenerate(prefill);
    }
    async runBinaryValidateCommand() {
        await this.binaryController.runBinaryValidate();
    }
    async runBinaryDeployCommand() {
        await this.binaryController.runBinaryDeploy();
    }
    async openBinaryConfigureCommand() {
        await this.binaryController.openBinaryConfigure();
    }
    stopBinaryStreamsForSignOut() {
        this.binaryController.stopStreamsAndLiveBubble();
    }
    async newChat() {
        this.runRequestVersion += 1;
        this.currentAbortController?.abort();
        this.currentAbortController = null;
        this.binaryController.stopStreamsAndLiveBubble();
        this.binaryController.binaryActivity = [];
        this.activeSessionId = null;
        this.activeSession = null;
        this.activeRun = null;
        this.submitState = "idle";
        this.streamingAssistantText = "";
        this.suppressedAssistantArtifactText = "";
        this.resetLiveActionLog();
        this.status = "Ready for a new Cutie run.";
        await this.emitState();
        void this.prewarmFastStartState();
        await this.refreshDesktopState();
        await this.emitState();
    }
    startBackgroundWarmup() {
        void this.prewarmFastStartState();
    }
    invalidateRequestAuthCache() {
        this.cachedRequestAuth = null;
    }
    isWarmSnapshotFresh(snapshot = this.warmStartSnapshot) {
        if (!snapshot)
            return false;
        if (snapshot.workspaceHash !== (0, config_1.getWorkspaceHash)())
            return false;
        const capturedAt = Date.parse(snapshot.capturedAt);
        if (!Number.isFinite(capturedAt))
            return false;
        return Date.now() - capturedAt < CutieSidebarProvider.WARM_START_TTL_MS;
    }
    scheduleWarmStartRefresh(force = false) {
        if (this.warmRefreshDebounce) {
            clearTimeout(this.warmRefreshDebounce);
            this.warmRefreshDebounce = null;
        }
        this.warmRefreshDebounce = setTimeout(() => {
            this.warmRefreshDebounce = null;
            void this.refreshWarmStartSnapshot(force);
        }, CutieSidebarProvider.WARM_REFRESH_DEBOUNCE_MS);
    }
    async getCachedRequestAuth(force = false) {
        const now = Date.now();
        if (!force &&
            this.cachedRequestAuth &&
            now - this.cachedRequestAuth.fetchedAt < CutieSidebarProvider.REQUEST_AUTH_CACHE_TTL_MS) {
            return this.cachedRequestAuth.auth;
        }
        const auth = await this.auth.getRequestAuth().catch(() => null);
        if (!auth) {
            this.cachedRequestAuth = null;
            return null;
        }
        this.cachedRequestAuth = {
            auth,
            fetchedAt: now,
        };
        return auth;
    }
    getPromptStateForView() {
        return {
            promptSource: this.operatingPromptState.promptSource,
            ...(this.operatingPromptState.promptMarkdownPath
                ? { promptMarkdownPath: this.operatingPromptState.promptMarkdownPath }
                : {}),
            promptLoaded: this.operatingPromptState.promptLoaded,
            ...(this.operatingPromptState.promptLoadError
                ? { promptLoadError: this.operatingPromptState.promptLoadError }
                : {}),
            ...(this.operatingPromptState.promptLastLoadedAt
                ? { promptLastLoadedAt: this.operatingPromptState.promptLastLoadedAt }
                : {}),
        };
    }
    disposeOperatingPromptWatcher() {
        this.operatingPromptWatcher?.dispose();
        this.operatingPromptWatcher = null;
    }
    refreshOperatingPromptWatcher(resolvedPath) {
        const nextPath = String(resolvedPath || "").trim();
        const currentPath = String(this.operatingPromptState.promptResolvedPath || "").trim();
        if (nextPath === currentPath && this.operatingPromptWatcher)
            return;
        this.disposeOperatingPromptWatcher();
        if (!nextPath) {
            delete this.operatingPromptState.promptResolvedPath;
            return;
        }
        this.operatingPromptState = {
            ...this.operatingPromptState,
            promptResolvedPath: nextPath,
        };
        const watcher = vscode.workspace.createFileSystemWatcher(new vscode.RelativePattern(path.dirname(nextPath), path.basename(nextPath)));
        const refresh = () => {
            void this.refreshOperatingPromptState(true).then(() => this.emitState());
        };
        watcher.onDidChange(refresh);
        watcher.onDidCreate(refresh);
        watcher.onDidDelete(refresh);
        this.context.subscriptions.push(watcher);
        this.operatingPromptWatcher = watcher;
    }
    async refreshOperatingPromptState(force = false) {
        if (!force && this.operatingPromptLoadPromise) {
            await this.operatingPromptLoadPromise;
            return;
        }
        const configuredPath = (0, config_1.getPromptMarkdownPath)();
        const resolved = (0, cutie_operating_prompt_1.resolveOperatingPromptMarkdownPath)(configuredPath, (0, config_1.getWorkspaceRootPath)());
        if (!force &&
            String(this.operatingPromptState.promptMarkdownPath || "") === configuredPath &&
            String(this.operatingPromptState.promptResolvedPath || "") === String(resolved.resolvedPath || "") &&
            (this.operatingPromptState.promptSource === "builtin_only" ||
                this.operatingPromptState.promptSource === "external_markdown" ||
                this.operatingPromptState.promptSource === "bundled_markdown" ||
                this.operatingPromptState.promptSource === "external_fallback")) {
            return;
        }
        this.operatingPromptLoadPromise = (async () => {
            const bundledResolvedPath = (0, cutie_operating_prompt_1.resolveBundledOperatingPromptMarkdownPath)();
            this.refreshOperatingPromptWatcher(resolved.resolvedPath || undefined);
            if (!configuredPath) {
                this.operatingPromptState = {
                    promptSource: "builtin_only",
                    promptLoaded: false,
                };
                return;
            }
            if (!resolved.resolvedPath) {
                if (bundledResolvedPath) {
                    const bundledRaw = await vscode.workspace.fs.readFile(vscode.Uri.file(bundledResolvedPath));
                    const bundledMarkdown = (0, cutie_operating_prompt_1.normalizeOperatingPromptMarkdown)(Buffer.from(bundledRaw).toString("utf8"));
                    if (bundledMarkdown) {
                        this.operatingPromptState = {
                            promptSource: "bundled_markdown",
                            promptMarkdownPath: configuredPath,
                            promptResolvedPath: bundledResolvedPath,
                            promptLoaded: true,
                            promptLastLoadedAt: new Date().toISOString(),
                            promptContent: bundledMarkdown,
                        };
                        return;
                    }
                }
                this.operatingPromptState = {
                    promptSource: "external_fallback",
                    promptMarkdownPath: configuredPath,
                    promptLoaded: false,
                    ...(resolved.error ? { promptLoadError: resolved.error } : {}),
                };
                return;
            }
            try {
                const raw = await vscode.workspace.fs.readFile(vscode.Uri.file(resolved.resolvedPath));
                const markdown = (0, cutie_operating_prompt_1.normalizeOperatingPromptMarkdown)(Buffer.from(raw).toString("utf8"));
                if (!markdown) {
                    throw new Error("Prompt markdown file is empty.");
                }
                this.operatingPromptState = {
                    promptSource: "external_markdown",
                    promptMarkdownPath: configuredPath,
                    promptResolvedPath: resolved.resolvedPath,
                    promptLoaded: true,
                    promptLastLoadedAt: new Date().toISOString(),
                    promptContent: markdown,
                };
            }
            catch (error) {
                if (bundledResolvedPath && bundledResolvedPath !== resolved.resolvedPath) {
                    try {
                        const bundledRaw = await vscode.workspace.fs.readFile(vscode.Uri.file(bundledResolvedPath));
                        const bundledMarkdown = (0, cutie_operating_prompt_1.normalizeOperatingPromptMarkdown)(Buffer.from(bundledRaw).toString("utf8"));
                        if (bundledMarkdown) {
                            this.operatingPromptState = {
                                promptSource: "bundled_markdown",
                                promptMarkdownPath: configuredPath,
                                promptResolvedPath: bundledResolvedPath,
                                promptLoaded: true,
                                promptLastLoadedAt: new Date().toISOString(),
                                promptContent: bundledMarkdown,
                            };
                            return;
                        }
                    }
                    catch {
                        // Fall through to the normal external fallback state below.
                    }
                }
                this.operatingPromptState = {
                    promptSource: "external_fallback",
                    promptMarkdownPath: configuredPath,
                    promptResolvedPath: resolved.resolvedPath,
                    promptLoaded: false,
                    promptLoadError: error instanceof Error ? error.message : String(error),
                };
            }
        })().finally(() => {
            this.operatingPromptLoadPromise = null;
        });
        await this.operatingPromptLoadPromise;
    }
    buildDynamicSettings() {
        const cfg = vscode.workspace.getConfiguration("cutie-product");
        return {
            contextPreviewChars: Math.max(1024, Math.min(24000, cfg.get("contextPreviewChars", 6000))),
            openFilePreviewLines: Math.max(0, Math.min(120, cfg.get("openFilePreviewLines", 25))),
            maxOpenFilesInContext: Math.max(4, Math.min(24, cfg.get("maxOpenFilesInContext", 12))),
            maxToolsPerBatch: Math.max(1, Math.min(8, cfg.get("maxToolsPerBatch", 4))),
            contextReceiptWindow: Math.max(4, Math.min(32, cfg.get("contextReceiptWindow", 14))),
            investigationPreflight: cfg.get("investigationPreflight", false),
            objectiveBasedRuns: cfg.get("objectiveBasedRuns", true),
            objectiveBasedInvestigation: cfg.get("objectiveBasedInvestigation", false),
            maxToolSteps: Math.max(8, Math.min(128, cfg.get("maxToolSteps", 48))),
            maxWorkspaceMutations: Math.max(2, Math.min(64, cfg.get("maxWorkspaceMutations", 24))),
            unlimitedAutonomy: cfg.get("unlimitedAutonomy", false),
        };
    }
    captureEditorContextSnapshot(settings) {
        const activeEditor = vscode.window.activeTextEditor;
        const activeFile = activeEditor
            ? {
                path: (0, config_1.toWorkspaceRelativePath)(activeEditor.document.uri) || undefined,
                language: activeEditor.document.languageId,
                lineCount: activeEditor.document.lineCount,
                ...(activeEditor.selection.isEmpty
                    ? { preview: activeEditor.document.getText().slice(0, settings.contextPreviewChars) }
                    : {
                        selection: activeEditor.document.getText(activeEditor.selection).slice(0, settings.contextPreviewChars),
                        selectionRange: {
                            startLine: activeEditor.selection.start.line + 1,
                            endLine: activeEditor.selection.end.line + 1,
                        },
                    }),
            }
            : undefined;
        const openFiles = vscode.window.visibleTextEditors
            .map((editor) => {
            const relativePath = (0, config_1.toWorkspaceRelativePath)(editor.document.uri);
            if (!relativePath)
                return null;
            const row = {
                path: relativePath,
                language: editor.document.languageId,
                lineCount: editor.document.lineCount,
            };
            if (settings.openFilePreviewLines > 0) {
                const lines = editor.document.getText().split(/\r?\n/);
                const joined = lines.slice(0, settings.openFilePreviewLines).join("\n");
                row.preview =
                    joined.length > settings.contextPreviewChars
                        ? `${joined.slice(0, settings.contextPreviewChars)}\n...[truncated]`
                        : joined;
            }
            return row;
        })
            .filter((value) => Boolean(value))
            .slice(0, settings.maxOpenFilesInContext);
        const diagnostics = vscode.languages
            .getDiagnostics()
            .flatMap(([uri, entries]) => entries.map((entry) => ({
            file: (0, config_1.toWorkspaceRelativePath)(uri) || undefined,
            severity: entry.severity,
            message: entry.message,
            line: entry.range.start.line + 1,
        })))
            .slice(0, 80);
        return {
            ...(activeFile ? { activeFile } : {}),
            openFiles,
            diagnostics,
        };
    }
    async refreshHostReadiness(force = false) {
        const now = Date.now();
        if (!force &&
            this.hostProbePromise) {
            return this.hostProbePromise;
        }
        if (!force &&
            this.hostReadyCheckedAt &&
            now - this.hostReadyCheckedAt < CutieSidebarProvider.HOST_PROBE_TTL_MS) {
            return;
        }
        this.hostProbePromise = (async () => {
            const controller = new AbortController();
            const timer = setTimeout(() => controller.abort(), CutieSidebarProvider.HOST_PROBE_TIMEOUT_MS);
            try {
                const response = await fetch(`${(0, config_1.getBaseApiUrl)()}/api/health`, {
                    method: "GET",
                    signal: controller.signal,
                });
                this.hostReady = response.ok;
                this.hostFailureSummary = response.ok ? undefined : `Host probe returned HTTP ${response.status}.`;
            }
            catch (error) {
                this.hostReady = false;
                this.hostFailureSummary = error instanceof Error ? error.message : String(error);
            }
            finally {
                clearTimeout(timer);
                this.hostReadyCheckedAt = Date.now();
                if (this.warmStartSnapshot) {
                    this.warmStartSnapshot = {
                        ...this.warmStartSnapshot,
                        hostReady: this.hostReady,
                        ...(this.hostFailureSummary ? { warmFailureSummary: this.hostFailureSummary } : {}),
                        subsystemReady: {
                            ...(this.warmStartSnapshot.subsystemReady || {
                                authState: false,
                                requestAuth: false,
                                desktop: false,
                                gitStatus: false,
                                mentionIndex: false,
                                editorContext: false,
                                diagnostics: false,
                                settings: false,
                                hostProbe: false,
                            }),
                            hostProbe: this.hostReady === true,
                        },
                    };
                }
                this.hostProbePromise = null;
                if (this.view && this.webviewReady) {
                    await this.emitState();
                }
            }
        })();
        return this.hostProbePromise;
    }
    getWarmStartStateForView() {
        const snapshot = this.warmStartSnapshot;
        if (!snapshot) {
            return {
                localReady: false,
                hostReady: this.hostReady,
                warming: this.warmStartWarming,
                ...(this.hostFailureSummary ? { warmFailureSummary: this.hostFailureSummary } : {}),
            };
        }
        return {
            localReady: snapshot.localReady,
            hostReady: snapshot.hostReady,
            warming: this.warmStartWarming,
            lastWarmAt: snapshot.capturedAt,
            requestAuthReady: snapshot.requestAuthReady,
            ...(snapshot.warmFailureSummary ? { warmFailureSummary: snapshot.warmFailureSummary } : {}),
            ...(snapshot.subsystemReady ? { subsystemReady: snapshot.subsystemReady } : {}),
        };
    }
    async refreshWarmStartSnapshot(force = false) {
        if (!force && this.fastStartWarmupPromise) {
            await this.fastStartWarmupPromise;
            return;
        }
        if (!force && this.isWarmSnapshotFresh()) {
            void this.refreshHostReadiness(false);
            return;
        }
        this.warmStartWarming = true;
        this.fastStartWarmupPromise = (async () => {
            await this.refreshOperatingPromptState(force).catch(() => undefined);
            const settings = this.buildDynamicSettings();
            const subsystemReady = {
                authState: false,
                requestAuth: false,
                desktop: false,
                gitStatus: false,
                mentionIndex: false,
                editorContext: false,
                diagnostics: false,
                settings: true,
                hostProbe: this.hostReady === true,
            };
            let warmFailureSummary;
            const authStateResult = await this.refreshAuthState()
                .then(() => {
                subsystemReady.authState = true;
                return this.authState;
            })
                .catch((error) => {
                warmFailureSummary = warmFailureSummary || (error instanceof Error ? error.message : String(error));
                return this.authState;
            });
            const requestAuthResult = await this.getCachedRequestAuth(force)
                .then((value) => {
                subsystemReady.requestAuth = Boolean(value);
                return value;
            })
                .catch((error) => {
                warmFailureSummary = warmFailureSummary || (error instanceof Error ? error.message : String(error));
                return null;
            });
            const desktopResult = await this.getDesktopContextForPrompt()
                .then((value) => {
                subsystemReady.desktop = true;
                return value;
            })
                .catch((error) => {
                warmFailureSummary = warmFailureSummary || (error instanceof Error ? error.message : String(error));
                return this.desktopState;
            });
            const gitStatusResult = await this.getGitStatusSummary(force)
                .then((value) => {
                subsystemReady.gitStatus = true;
                return value;
            })
                .catch((error) => {
                warmFailureSummary = warmFailureSummary || (error instanceof Error ? error.message : String(error));
                return this.gitStatusSummary;
            });
            const mentionPathsResult = await this.ensureWorkspaceMentionIndex()
                .then((value) => {
                subsystemReady.mentionIndex = true;
                return value;
            })
                .catch((error) => {
                warmFailureSummary = warmFailureSummary || (error instanceof Error ? error.message : String(error));
                return this.workspaceMentionPaths || [];
            });
            const editorSnapshot = (() => {
                try {
                    const snapshot = this.captureEditorContextSnapshot(settings);
                    subsystemReady.editorContext = true;
                    subsystemReady.diagnostics = true;
                    return snapshot;
                }
                catch (error) {
                    warmFailureSummary = warmFailureSummary || (error instanceof Error ? error.message : String(error));
                    return { openFiles: [], diagnostics: [] };
                }
            })();
            this.warmStartSnapshot = {
                capturedAt: new Date().toISOString(),
                workspaceHash: (0, config_1.getWorkspaceHash)(),
                workspaceRootPath: (0, config_1.getWorkspaceRootPath)(),
                extensionVersion: (0, config_1.getExtensionVersion)(this.context),
                authState: authStateResult,
                requestAuthReady: Boolean(requestAuthResult),
                desktopState: desktopResult,
                ...(gitStatusResult ? { gitStatusSummary: gitStatusResult } : {}),
                workspaceMentionPaths: mentionPathsResult,
                ...(editorSnapshot.activeFile ? { activeFile: editorSnapshot.activeFile } : {}),
                openFiles: editorSnapshot.openFiles,
                diagnostics: editorSnapshot.diagnostics,
                cutieDynamicSettings: settings,
                localReady: subsystemReady.authState && subsystemReady.desktop && subsystemReady.settings,
                hostReady: this.hostReady,
                ...(warmFailureSummary || this.hostFailureSummary
                    ? { warmFailureSummary: warmFailureSummary || this.hostFailureSummary }
                    : {}),
                subsystemReady,
            };
            void this.refreshHostReadiness(force);
        })().finally(() => {
            this.warmStartWarming = false;
            this.fastStartWarmupPromise = null;
            if (this.view && this.webviewReady) {
                void this.emitState();
            }
        });
        await this.fastStartWarmupPromise;
    }
    prewarmFastStartState() {
        void this.refreshWarmStartSnapshot(false);
    }
    async captureScreen() {
        const session = await this.ensureSession("Desktop snapshot");
        const snapshot = await this.desktop.captureScreen();
        let nextSession = await this.sessionStore.attachSnapshot(session, snapshot);
        nextSession = await this.sessionStore.appendMessage(nextSession, {
            role: "system",
            content: `Captured snapshot ${snapshot.snapshotId}${snapshot.displayId ? ` on ${snapshot.displayId}` : ""}.`,
        });
        this.activeSession = nextSession;
        this.activeSessionId = nextSession.id;
        this.status = `Snapshot ${snapshot.snapshotId} captured locally.`;
        await this.refreshDesktopState();
        await this.emitState();
    }
    async stopAutomation() {
        if (!this.currentAbortController) {
            this.status = "No Cutie run is active.";
            this.submitState = "settled";
            await this.emitState();
            return;
        }
        this.status = "Stopping the active Cutie run...";
        this.submitState = "stopping";
        this.streamingAssistantText = "";
        this.suppressedAssistantArtifactText = "";
        this.currentAbortController.abort();
        await this.emitState();
    }
    getChatDiffsForActiveSession() {
        if (!this.activeSessionId)
            return [];
        return this.chatDiffsBySessionId.get(this.activeSessionId) ?? [];
    }
    getChatDiffsForRun(runId, sessionId = this.activeSessionId) {
        const trimmedRunId = String(runId || "").trim();
        const trimmedSessionId = String(sessionId || "").trim();
        if (!trimmedRunId || !trimmedSessionId)
            return [];
        const list = this.chatDiffsBySessionId.get(trimmedSessionId) ?? [];
        return list.filter((item) => String(item.runId || "").trim() === trimmedRunId);
    }
    normalizeChatDiffPath(relativePath) {
        return String(relativePath || "")
            .trim()
            .replace(/\\/g, "/");
    }
    touchRecentPortableBundlePath(relativePath) {
        const trimmed = this.normalizeChatDiffPath(relativePath);
        if (!trimmed)
            return;
        const touchList = this.recentPortableBundleTouchedPaths;
        const idx = touchList.indexOf(trimmed);
        if (idx >= 0)
            touchList.splice(idx, 1);
        touchList.unshift(trimmed);
        while (touchList.length > 32)
            touchList.pop();
    }
    truncateDiffSnapshot(content, label) {
        if (content.length <= CutieSidebarProvider.MAX_FILE_CHARS_FOR_PATCH)
            return content;
        return `${content.slice(0, CutieSidebarProvider.MAX_FILE_CHARS_FOR_PATCH)}\n\n/* ... truncated ${label} snapshot ... */\n`;
    }
    truncateChatPatch(patch) {
        if (patch.length <= CutieSidebarProvider.MAX_PATCH_CHARS)
            return patch;
        return `${patch.slice(0, CutieSidebarProvider.MAX_PATCH_CHARS)}\n\n... patch truncated for chat preview ...\n`;
    }
    upsertChatDiffItem(sessionId, item) {
        const list = [...(this.chatDiffsBySessionId.get(sessionId) ?? [])];
        const runId = String(item.runId || "").trim();
        const existingIndex = list.findIndex((candidate) => {
            const candidateRunId = String(candidate.runId || "").trim();
            if (candidateRunId !== runId)
                return false;
            if (item.receiptId && candidate.receiptId) {
                return candidate.receiptId === item.receiptId;
            }
            if (typeof item.step === "number" &&
                typeof candidate.step === "number" &&
                item.step === candidate.step &&
                item.relativePath === candidate.relativePath) {
                return item.patch === candidate.patch;
            }
            return item.relativePath === candidate.relativePath && item.patch === candidate.patch;
        });
        if (existingIndex >= 0) {
            const previous = list[existingIndex];
            list[existingIndex] = {
                ...previous,
                ...item,
                id: previous.id || item.id,
                createdAt: String(previous.createdAt || "") <= String(item.createdAt || "") ? previous.createdAt : item.createdAt,
                source: previous.source === "live_callback" ? "live_callback" : item.source || previous.source,
            };
        }
        else {
            list.push(item);
        }
        list.sort((a, b) => {
            const aTime = String(a.createdAt || "");
            const bTime = String(b.createdAt || "");
            if (aTime < bTime)
                return -1;
            if (aTime > bTime)
                return 1;
            return String(a.id || "").localeCompare(String(b.id || ""));
        });
        while (list.length > CutieSidebarProvider.MAX_CHAT_DIFFS_PER_SESSION) {
            list.shift();
        }
        this.chatDiffsBySessionId.set(sessionId, list);
    }
    hydrateChatDiffsFromRunReceipts(session) {
        const sessionId = String(session.id || "").trim();
        if (!sessionId)
            return;
        for (const run of session.runs || []) {
            const runId = String(run.id || "").trim();
            if (!runId)
                continue;
            for (const receipt of run.receipts || []) {
                if (receipt.status !== "completed")
                    continue;
                if (receipt.toolName !== "write_file" && receipt.toolName !== "patch_file" && receipt.toolName !== "edit_file") {
                    continue;
                }
                const data = receipt.data && typeof receipt.data === "object" ? receipt.data : null;
                if (!data)
                    continue;
                const relativePath = this.normalizeChatDiffPath(typeof data.path === "string" ? String(data.path) : "");
                if (!relativePath)
                    continue;
                let patch = typeof data.patch === "string" ? String(data.patch) : "";
                if (!patch && typeof data.previousContent === "string" && typeof data.nextContent === "string") {
                    patch = (0, diff_1.createTwoFilesPatch)(relativePath, relativePath, String(data.previousContent), String(data.nextContent), "", "", {
                        context: 3,
                    });
                }
                if (!patch)
                    continue;
                const receiptId = String(receipt.id || "").trim();
                const item = {
                    id: `cutie_chat_diff_receipt_${runId}_${receiptId || String(receipt.step || "0")}`,
                    createdAt: receipt.finishedAt || receipt.startedAt || run.endedAt || run.startedAt || new Date().toISOString(),
                    runId,
                    relativePath,
                    toolName: receipt.toolName,
                    patch: this.truncateChatPatch(patch),
                    ...(receiptId ? { receiptId } : {}),
                    ...(typeof receipt.step === "number" ? { step: receipt.step } : {}),
                    source: "receipt_backfill",
                };
                this.upsertChatDiffItem(sessionId, item);
            }
        }
    }
    async ensureRunChangeRecap(run, sourceSession = this.activeSession) {
        if (!run || !isTerminalRunStatus(run.status) || !sourceSession)
            return sourceSession;
        const runId = String(run.id || "").trim();
        if (!runId)
            return sourceSession;
        this.hydrateChatDiffsFromRunReceipts(sourceSession);
        const runDiffs = this.getChatDiffsForRun(runId, sourceSession.id);
        const changedPaths = new Set(runDiffs.map((item) => item.relativePath));
        const recapContent = changedPaths.size
            ? `${changedPaths.size} file${changedPaths.size === 1 ? "" : "s"} changed this run.`
            : "No files changed.";
        const isRecapForRun = (message) => message.role === "assistant" && message.presentation === "run_change_recap" && message.runId === runId;
        const recaps = sourceSession.messages.filter(isRecapForRun);
        if (recaps.length === 1 && String(recaps[0].content || "").trim() === recapContent) {
            return sourceSession;
        }
        let nextSession = sourceSession;
        if (recaps.length) {
            const withoutRecaps = sourceSession.messages.filter((message) => !isRecapForRun(message));
            nextSession = await this.sessionStore.replaceMessages(sourceSession, withoutRecaps);
        }
        nextSession = await this.sessionStore.appendMessage(nextSession, {
            role: "assistant",
            content: recapContent,
            runId,
            presentation: "run_change_recap",
        });
        return nextSession;
    }
    async recordChatWorkspaceDiff(info) {
        const sessionId = String(info.sessionId || "").trim() || this.activeSessionId;
        if (!sessionId)
            return;
        const trimmed = this.normalizeChatDiffPath(info.relativePath);
        if (!trimmed)
            return;
        this.touchRecentPortableBundlePath(trimmed);
        const root = (0, config_1.getWorkspaceRootPath)();
        const hasNextContent = typeof info.nextContent === "string";
        let hasAfterContent = hasNextContent;
        let after = hasNextContent ? info.nextContent || "" : "";
        if (!hasNextContent && root) {
            const uri = vscode.Uri.file(path.join(root, ...trimmed.split("/").filter(Boolean)));
            try {
                const raw = await vscode.workspace.fs.readFile(uri);
                after = Buffer.from(raw).toString("utf8");
                hasAfterContent = true;
            }
            catch {
                after = "";
            }
        }
        let before = this.truncateDiffSnapshot(typeof info.previousContent === "string" ? info.previousContent : "", "before");
        if (before.length > CutieSidebarProvider.MAX_FILE_CHARS_FOR_PATCH) {
            before = `${before.slice(0, CutieSidebarProvider.MAX_FILE_CHARS_FOR_PATCH)}\n\n/* … truncated before snapshot … */\n`;
        }
        if (after.length > CutieSidebarProvider.MAX_FILE_CHARS_FOR_PATCH) {
            after = `${after.slice(0, CutieSidebarProvider.MAX_FILE_CHARS_FOR_PATCH)}\n\n/* … truncated after snapshot … */\n`;
        }
        after = this.truncateDiffSnapshot(after, "after");
        let patch = hasAfterContent
            ? (0, diff_1.createTwoFilesPatch)(trimmed, trimmed, before, after, "", "", { context: 3 })
            : `Inline diff preview unavailable for ${trimmed}.\n\nCutie changed the file, but the updated file contents could not be reconstructed for the chat card.`;
        if (patch.length > CutieSidebarProvider.MAX_PATCH_CHARS) {
            patch = `${patch.slice(0, CutieSidebarProvider.MAX_PATCH_CHARS)}\n\n… patch truncated for chat preview …\n`;
        }
        patch = this.truncateChatPatch(patch);
        const item = {
            id: `cutie_chat_diff_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`,
            createdAt: new Date().toISOString(),
            runId: String(info.runId || "").trim() || this.activeRun?.id || null,
            relativePath: trimmed,
            toolName: info.toolName,
            patch,
            ...(String(info.receiptId || "").trim() ? { receiptId: String(info.receiptId || "").trim() } : {}),
            ...(typeof info.step === "number" ? { step: info.step } : {}),
            source: "live_callback",
        };
        this.upsertChatDiffItem(sessionId, item);
    }
    async initializeView() {
        await this.emitState();
        void this.prewarmFastStartState();
        void this.refreshViewState();
        void this.binaryController.resumeBinaryBuildIfNeeded();
    }
    clearWebviewReadyTimeout() {
        if (this.webviewReadyTimeout) {
            clearTimeout(this.webviewReadyTimeout);
            this.webviewReadyTimeout = null;
        }
    }
    armWebviewReadyTimeout(webviewView) {
        this.clearWebviewReadyTimeout();
        const bootNonce = ++this.webviewBootNonce;
        this.webviewReadyTimeout = setTimeout(() => {
            if (this.webviewBootNonce !== bootNonce || this.webviewReady || this.view !== webviewView)
                return;
            const message = "Cutie UI did not finish loading within 10 seconds. If you just updated the extension, fully restart Trae and open Cutie again.";
            this.status = `Cutie UI failed to load: ${message}`;
            webviewView.webview.html = buildWebviewFailureHtml(message);
            console.error("Cutie webview ready timeout", {
                version: (0, config_1.getExtensionVersion)(this.context),
                workspaceHash: (0, config_1.getWorkspaceHash)(),
            });
            void vscode.window.showErrorMessage(this.status);
        }, CutieSidebarProvider.WEBVIEW_READY_TIMEOUT_MS);
    }
    async handleMessage(message) {
        if (message.type === "ready") {
            this.webviewReady = true;
            this.clearWebviewReadyTimeout();
            await this.emitState();
            void this.prewarmFastStartState();
            void this.refreshViewState();
            return;
        }
        if (message.type === "webviewError") {
            this.clearWebviewReadyTimeout();
            const raw = String(message.message || "Unknown Cutie webview error.");
            const summary = raw.split(/\r?\n/)[0].slice(0, 240);
            this.status = `Cutie UI failed to load: ${summary}`;
            console.error("Cutie webview reported a fatal error", raw);
            void vscode.window.showErrorMessage(this.status);
            await this.emitState();
            return;
        }
        if (message.type === "refreshView") {
            void this.refreshViewState();
            return;
        }
        if (message.type === "newChat")
            return this.newChat();
        if (message.type === "selectSession")
            return this.loadSession(message.sessionId);
        if (message.type === "copyDebug")
            return this.copyDebugReport();
        if (message.type === "captureScreen")
            return this.captureScreen();
        if (message.type === "stopAutomation")
            return this.stopAutomation();
        if (message.type === "signIn")
            return this.auth.signInWithBrowser();
        if (message.type === "signOut") {
            await this.auth.signOut();
            return this.emitState();
        }
        if (message.type === "setApiKey")
            return this.auth.setApiKeyInteractive();
        if (message.type === "mentionsQuery")
            return this.respondToMentionsQuery(message.query, message.requestId);
        if (message.type === "submitPrompt")
            return this.runPrompt(message.prompt, asMentionArray(message.mentions));
        if (message.type === "openWorkspaceFile")
            return this.openWorkspaceRelativePath(message.path, { mode: "editor" });
        if (message.type === "revealWorkspaceFile")
            return this.openWorkspaceRelativePath(message.path, { mode: "reveal" });
        if (message.type === "diffWorkspaceFile")
            return this.openCutieDiffForPath(message.path);
        if (message.type === "openScm") {
            void vscode.commands.executeCommand("workbench.view.scm");
            return;
        }
        if (message.type === "binaryGenerate") {
            return this.binaryController.generateBinaryBuild(String(message.intent || "").trim());
        }
        if (message.type === "binaryRefine") {
            return this.binaryController.refineBinaryBuild(String(message.intent || ""));
        }
        if (message.type === "binaryBranch") {
            return this.binaryController.branchBinaryBuild(String(message.intent || ""), String(message.checkpointId || ""));
        }
        if (message.type === "binaryRewind") {
            return this.binaryController.rewindBinaryBuild(String(message.checkpointId || ""));
        }
        if (message.type === "binaryExecute") {
            return this.binaryController.executeBinaryBuild(String(message.entryPoint || ""));
        }
        if (message.type === "binaryValidate") {
            return this.binaryController.validateBinaryBuild();
        }
        if (message.type === "binaryPublish") {
            return this.binaryController.publishBinaryBuild();
        }
        if (message.type === "binaryCancel") {
            return this.binaryController.cancelBinaryBuild();
        }
        if (message.type === "binaryConfigure") {
            return this.binaryController.openBinaryConfigure();
        }
        if (message.type === "binarySetTarget") {
            return this.binaryController.setBinaryTargetRuntime(String(message.runtime || "node18"));
        }
        if (message.type === "setComposerModel") {
            return this.setComposerModelFromWebview(String(message.model || "").trim());
        }
        if (message.type === "setComposerReasoningLevel") {
            return this.setComposerReasoningLevelFromWebview(String(message.level || "").trim());
        }
        if (message.type === "setIdeRuntime") {
            return this.setIdeRuntimeFromWebview(String(message.runtime || "").trim());
        }
        if (message.type === "undoPlaygroundBatch") {
            return this.undoLastPlaygroundBatchCommand();
        }
    }
    composerConfigurationTarget() {
        return vscode.workspace.workspaceFolders?.length
            ? vscode.ConfigurationTarget.Workspace
            : vscode.ConfigurationTarget.Global;
    }
    async setComposerModelFromWebview(model) {
        if (!model)
            return;
        await vscode.workspace
            .getConfiguration(config_1.EXTENSION_NAMESPACE)
            .update("model", model, this.composerConfigurationTarget());
        await this.emitState();
    }
    async setComposerReasoningLevelFromWebview(level) {
        if (!config_1.CUTIE_REASONING_LEVELS.includes(level))
            return;
        await vscode.workspace
            .getConfiguration(config_1.EXTENSION_NAMESPACE)
            .update("reasoningLevel", level, this.composerConfigurationTarget());
        await this.emitState();
    }
    async setIdeRuntimeFromWebview(runtime) {
        if (!this.ideRuntimeValues.has(runtime))
            return;
        await vscode.workspace
            .getConfiguration(config_1.EXTENSION_NAMESPACE)
            .update("binary.runtime", runtime, this.composerConfigurationTarget());
        await this.emitState();
    }
    async undoLastPlaygroundBatchCommand() {
        if ((0, config_1.getBinaryIdeChatRuntime)() !== "playgroundApi")
            return;
        try {
            const msg = await this.playgroundChatBridge.undoLastPlaygroundBatch();
            this.status = msg;
            void vscode.window.showInformationMessage(msg);
        }
        catch (e) {
            const message = e instanceof Error ? e.message : String(e);
            this.status = `Undo failed: ${message}`;
            void vscode.window.showErrorMessage(this.status);
        }
        await this.emitState();
    }
    appendMentionsToPrompt(base, mentions) {
        if (!mentions.length)
            return base;
        const prefix = mentions
            .map((m) => String(m.insertText || m.label || "").trim())
            .filter(Boolean)
            .join("\n");
        return prefix ? `${prefix}\n\n${base}` : base;
    }
    sessionMessagesToIdeHistory(messages) {
        return messages
            .filter((m) => m.role === "user" || m.role === "assistant" || m.role === "system")
            .map((m) => ({ role: m.role, content: m.content }));
    }
    async runIdeRuntimePrompt(trimmedPrompt, mentions) {
        const runtime = (0, config_1.getBinaryIdeChatRuntime)();
        const task = this.appendMentionsToPrompt(trimmedPrompt, mentions);
        if (!this.isWarmSnapshotFresh()) {
            void this.prewarmFastStartState();
        }
        this.status =
            runtime === "qwenCode"
                ? "Running Qwen Code…"
                : runtime === "playgroundApi"
                    ? "Running hosted playground assist…"
                    : "Running…";
        this.submitState = "submitting";
        await this.emitState();
        try {
            if (runtime === "qwenCode") {
                const auth = await this.getCachedRequestAuth();
                if (!auth?.apiKey) {
                    this.submitState = "idle";
                    this.status = "Qwen Code needs an Xpersona API key. Use “Set Xpersona API key” in Cutie settings.";
                    void vscode.window.showWarningMessage(this.status);
                    await this.emitState();
                    return;
                }
            }
            else if (runtime === "playgroundApi") {
                const auth = await this.requireAuth();
                if (!auth) {
                    this.submitState = "idle";
                    await this.emitState();
                    return;
                }
            }
            let session = await this.ensureSession(trimmedPrompt);
            session = await this.sessionStore.appendMessage(session, { role: "user", content: task });
            this.activeSession = session;
            this.activeSessionId = session.id;
            this.activeRun = null;
            const runRequestVersion = ++this.runRequestVersion;
            this.currentAbortController?.abort();
            const abortController = new AbortController();
            this.currentAbortController = abortController;
            this.streamingAssistantText = "";
            this.suppressedAssistantArtifactText = "";
            this.resetLiveActionLog();
            this.submitState = "running";
            await this.emitState();
            const history = this.sessionMessagesToIdeHistory(session.messages.slice(0, -1));
            try {
                let assistantText;
                if (runtime === "qwenCode") {
                    assistantText = await this.playgroundChatBridge.runQwenTurn({
                        task,
                        history,
                        signal: abortController.signal,
                        onPartial: (text) => {
                            if (runRequestVersion !== this.runRequestVersion)
                                return;
                            if (abortController.signal.aborted)
                                return;
                            this.streamingAssistantText = text;
                            void this.emitState();
                        },
                    });
                }
                else {
                    assistantText = await this.playgroundChatBridge.runPlaygroundApiTurn({
                        task,
                        mode: "auto",
                        historySessionId: session.id,
                        history,
                        signal: abortController.signal,
                    });
                }
                if (runRequestVersion !== this.runRequestVersion)
                    return;
                session = await this.sessionStore.appendMessage(session, { role: "assistant", content: assistantText });
                this.activeSession = session;
                this.activeSessionId = session.id;
                this.streamingAssistantText = "";
                this.submitState = "settled";
                this.status = "Done.";
            }
            catch (error) {
                if (runRequestVersion !== this.runRequestVersion)
                    return;
                const message = error instanceof Error ? error.message : String(error);
                const isCancel = /aborted|abort|cancelled|canceled/i.test(message);
                this.streamingAssistantText = "";
                this.status = isCancel ? "Run cancelled." : `Failed: ${message}`;
                this.submitState = "settled";
                if (!isCancel)
                    void vscode.window.showErrorMessage(this.status);
            }
            finally {
                if (this.currentAbortController === abortController) {
                    this.currentAbortController = null;
                }
                if (runRequestVersion === this.runRequestVersion) {
                    this.streamingAssistantText = "";
                    this.submitState = "settled";
                }
                await this.refreshDesktopState();
                void this.prewarmFastStartState();
                await this.emitState();
            }
        }
        catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            this.status = `Failed: ${message}`;
            this.submitState = "settled";
            void vscode.window.showErrorMessage(this.status);
            await this.refreshDesktopState();
            void this.prewarmFastStartState();
            await this.emitState();
        }
    }
    async openWorkspaceRelativePath(relativePath, options) {
        const trimmed = String(relativePath || "").trim().replace(/\\/g, "/");
        if (!trimmed)
            return;
        const root = (0, config_1.getWorkspaceRootPath)();
        if (!root) {
            void vscode.window.showWarningMessage("Open a workspace folder before opening files from Cutie.");
            return;
        }
        const absolutePath = path.join(root, ...trimmed.split("/").filter(Boolean));
        const uri = vscode.Uri.file(absolutePath);
        try {
            const stat = await vscode.workspace.fs.stat(uri);
            if (stat.type === vscode.FileType.Directory) {
                await vscode.commands.executeCommand("revealInExplorer", uri);
                return;
            }
            if (options.mode === "reveal") {
                await vscode.commands.executeCommand("revealInExplorer", uri);
                return;
            }
            const doc = await vscode.workspace.openTextDocument(uri);
            await vscode.window.showTextDocument(doc, {
                preview: false,
                preserveFocus: options.preserveFocus ?? false,
            });
        }
        catch {
            void vscode.window.showErrorMessage(`Cutie could not open “${trimmed}”. Check that the path exists in this workspace.`);
        }
    }
    async showCutieDiffEditor(info, showOptions) {
        const trimmed = String(info.relativePath || "").trim().replace(/\\/g, "/");
        if (!trimmed)
            return;
        const root = (0, config_1.getWorkspaceRootPath)();
        if (!root) {
            void vscode.window.showWarningMessage("Open a workspace folder before viewing a Cutie diff.");
            return;
        }
        const absolutePath = path.join(root, ...trimmed.split("/").filter(Boolean));
        const rightUri = vscode.Uri.file(absolutePath);
        try {
            await vscode.workspace.fs.stat(rightUri);
        }
        catch {
            void vscode.window.showErrorMessage(`Cutie could not diff “${trimmed}” — the file is not on disk.`);
            return;
        }
        (0, cutie_diff_1.rememberMutationBefore)(trimmed, info.previousContent);
        const leftUri = (0, cutie_diff_1.createCutieBeforeUri)(info.previousContent);
        const baseName = path.basename(trimmed);
        const title = info.toolName === "write_file"
            ? `Cutie · ${baseName} (before ⟡ after)`
            : `Cutie · ${baseName} (before ⟡ after · edit)`;
        await vscode.commands.executeCommand("vscode.diff", leftUri, rightUri, title, {
            preview: showOptions?.preview ?? false,
            preserveFocus: showOptions?.preserveFocus ?? false,
        });
    }
    /** Reopen diff from the chat card using the last remembered “before” buffer for this path. */
    async openCutieDiffForPath(relativePath) {
        const trimmed = String(relativePath || "").trim().replace(/\\/g, "/");
        const previous = (0, cutie_diff_1.takeLastMutationBefore)(trimmed);
        if (previous === undefined) {
            void vscode.window.showWarningMessage("No Cutie “before” snapshot is cached for that file anymore. Run Cutie again on this file, or use Source Control.");
            return;
        }
        await this.showCutieDiffEditor({
            sessionId: this.activeSessionId || "",
            runId: this.activeRun?.id || "",
            relativePath: trimmed,
            toolName: "write_file",
            previousContent: previous,
        }, { preserveFocus: false, preview: true });
    }
    async requireAuth() {
        const auth = await this.getCachedRequestAuth();
        if (!auth) {
            this.status = "Sign in to Xpersona or set an API key before running Cutie.";
            await this.emitState();
            void vscode.window.showWarningMessage("Sign in to Xpersona or set an API key before running Cutie.");
            return null;
        }
        return auth;
    }
    async loadSession(sessionId) {
        this.runRequestVersion += 1;
        this.currentAbortController?.abort();
        this.currentAbortController = null;
        const session = this.sessionStore.getSession((0, config_1.getWorkspaceHash)(), sessionId);
        if (!session) {
            this.status = "That local Cutie session is no longer available.";
            this.activeSession = null;
            this.activeSessionId = null;
            await this.emitState();
            return;
        }
        this.binaryController.stopStreamsAndLiveBubble();
        this.binaryController.binaryActivity = [];
        this.hydrateChatDiffsFromRunReceipts(session);
        this.activeSession = session;
        this.activeSessionId = session.id;
        this.activeRun = this.sessionStore.getLatestRun(session);
        this.submitState = "idle";
        this.streamingAssistantText = "";
        this.suppressedAssistantArtifactText = "";
        this.resetLiveActionLog();
        this.status = "Loaded local Cutie session.";
        await this.emitState();
        await this.refreshDesktopState();
        await this.emitState();
    }
    async ensureSession(initialPrompt) {
        const workspaceHash = (0, config_1.getWorkspaceHash)();
        if (this.activeSession && this.activeSession.workspaceHash === workspaceHash) {
            return this.activeSession;
        }
        const session = await this.sessionStore.createSession(workspaceHash, initialPrompt);
        this.activeSession = session;
        this.activeSessionId = session.id;
        return session;
    }
    async gatherContext() {
        await this.refreshOperatingPromptState(false);
        const settings = this.buildDynamicSettings();
        const snapshot = this.isWarmSnapshotFresh() ? this.warmStartSnapshot : null;
        const editorSnapshot = snapshot
            ? {
                ...(snapshot.activeFile ? { activeFile: snapshot.activeFile } : {}),
                openFiles: snapshot.openFiles,
                diagnostics: snapshot.diagnostics,
            }
            : this.captureEditorContextSnapshot(settings);
        const desktop = snapshot?.desktopState || (await this.getDesktopContextForPrompt().catch(() => this.desktopState));
        const gitStatusSummary = snapshot?.gitStatusSummary || (await this.getGitStatusSummary().catch(() => this.gitStatusSummary));
        return {
            workspaceHash: (0, config_1.getWorkspaceHash)(),
            workspaceRootPath: (0, config_1.getWorkspaceRootPath)(),
            extensionVersion: (0, config_1.getExtensionVersion)(this.context),
            ...(editorSnapshot.activeFile ? { activeFile: editorSnapshot.activeFile } : {}),
            ...(editorSnapshot.openFiles.length ? { openFiles: editorSnapshot.openFiles } : {}),
            ...(editorSnapshot.diagnostics.length ? { diagnostics: editorSnapshot.diagnostics } : {}),
            desktop,
            latestSnapshot: this.activeSession?.snapshots?.[0] || null,
            cutieDynamicSettings: {
                maxToolsPerBatch: settings.maxToolsPerBatch,
                contextReceiptWindow: settings.contextReceiptWindow,
                investigationPreflight: settings.investigationPreflight,
                objectiveBasedRuns: settings.objectiveBasedRuns,
                objectiveBasedInvestigation: settings.objectiveBasedInvestigation,
                maxToolSteps: settings.maxToolSteps,
                maxWorkspaceMutations: settings.maxWorkspaceMutations,
                unlimitedAutonomy: settings.unlimitedAutonomy,
            },
            promptSource: this.operatingPromptState.promptSource,
            promptMarkdownPath: this.operatingPromptState.promptMarkdownPath,
            promptLoaded: this.operatingPromptState.promptLoaded,
            ...(this.operatingPromptState.promptLoadError
                ? { promptLoadError: this.operatingPromptState.promptLoadError }
                : {}),
            ...(this.operatingPromptState.promptLastLoadedAt
                ? { promptLastLoadedAt: this.operatingPromptState.promptLastLoadedAt }
                : {}),
            ...(this.operatingPromptState.promptContent
                ? { externalOperatingPrompt: this.operatingPromptState.promptContent }
                : {}),
            ...(gitStatusSummary ? { gitStatusSummary } : {}),
        };
    }
    async respondToMentionsQuery(query, requestId) {
        if (!this.view)
            return;
        const items = await this.getMentionSuggestions(query).catch(() => []);
        this.view.webview.postMessage({
            type: "mentions",
            requestId,
            items,
        });
    }
    async getMentionSuggestions(rawQuery) {
        const normalizedQuery = normalizeMentionQuery(rawQuery);
        const wantsWindowsOnly = normalizedQuery.startsWith("window:");
        const fileQuery = wantsWindowsOnly ? "" : normalizedQuery;
        const windowQuery = wantsWindowsOnly ? normalizedQuery.slice("window:".length).trim() : normalizedQuery;
        const activePath = vscode.window.activeTextEditor
            ? (0, config_1.toWorkspaceRelativePath)(vscode.window.activeTextEditor.document.uri)
            : null;
        const openPaths = new Set(vscode.window.visibleTextEditors
            .map((editor) => (0, config_1.toWorkspaceRelativePath)(editor.document.uri))
            .filter((item) => Boolean(item))
            .map((item) => item.toLowerCase()));
        const rankedFiles = new Map();
        const pushFile = (relativePath, detail) => {
            if (!relativePath || isIgnoredWorkspacePath(relativePath))
                return;
            const score = scoreFilePath(relativePath, fileQuery, { activePath, openPaths });
            if (fileQuery && score < 32)
                return;
            const key = relativePath.toLowerCase();
            const existing = rankedFiles.get(key);
            if (!existing || score > existing.score) {
                rankedFiles.set(key, { path: relativePath, score, ...(detail ? { detail } : {}) });
            }
        };
        if (!wantsWindowsOnly) {
            if (activePath)
                pushFile(activePath, "Active file");
            for (const editor of vscode.window.visibleTextEditors) {
                const relativePath = (0, config_1.toWorkspaceRelativePath)(editor.document.uri);
                if (!relativePath || relativePath === activePath)
                    continue;
                pushFile(relativePath, "Open file");
            }
            if (fileQuery) {
                const indexedPaths = await this.getWorkspaceMentionPathsForQuery();
                for (const relativePath of indexedPaths) {
                    pushFile(relativePath);
                }
            }
        }
        const fileItems = Array.from(rankedFiles.values())
            .sort((a, b) => b.score - a.score || a.path.localeCompare(b.path))
            .slice(0, 6)
            .map((item) => {
            const { label, detail } = mentionDisplayForWorkspaceFile(item.path, item.detail);
            return {
                kind: "file",
                label,
                insertText: `@"${item.path}"`,
                ...(detail ? { detail } : {}),
            };
        });
        const shouldLookupWindows = wantsWindowsOnly;
        const activeWindow = shouldLookupWindows
            ? await this.desktop.getActiveWindow().catch(() => this.desktopState.activeWindow || null)
            : this.desktopState.activeWindow || null;
        const windows = shouldLookupWindows
            ? await this.desktop.listWindows().catch(() => (activeWindow ? [activeWindow] : []))
            : activeWindow
                ? [activeWindow]
                : [];
        const windowItems = windows
            .filter((windowValue) => String(windowValue.title || windowValue.app || "").trim())
            .map((windowValue) => {
            const label = String(windowValue.title || windowValue.app || "").trim();
            const detail = String(windowValue.app || "").trim();
            const isActive = Boolean(Boolean(activeWindow) &&
                ((activeWindow?.id && windowValue.id && activeWindow.id === windowValue.id) ||
                    (activeWindow?.title && windowValue.title && activeWindow.title === windowValue.title)));
            return {
                label,
                detail: detail && detail !== label ? detail : isActive ? "Active window" : "",
                score: scoreWindow(windowValue, windowQuery, isActive),
            };
        })
            .filter((item) => (!windowQuery ? true : item.score >= 48))
            .sort((a, b) => b.score - a.score || a.label.localeCompare(b.label))
            .filter((item, index, array) => array.findIndex((row) => row.label === item.label) === index)
            .slice(0, shouldLookupWindows ? 3 : 1)
            .map((item) => ({
            kind: "window",
            label: item.label,
            insertText: `@window:"${item.label}"`,
            ...(item.detail ? { detail: item.detail } : {}),
        }));
        return [...fileItems, ...windowItems];
    }
    async runPrompt(prompt, mentions = []) {
        const trimmedPrompt = String(prompt || "").trim();
        if (!trimmedPrompt) {
            await this.emitState();
            return;
        }
        if ((0, config_1.getBinaryIdeChatRuntime)() !== "cutie") {
            return this.runIdeRuntimePrompt(trimmedPrompt, mentions);
        }
        if (!this.isWarmSnapshotFresh()) {
            void this.prewarmFastStartState();
        }
        this.status = this.warmStartSnapshot?.localReady
            ? this.warmStartSnapshot.hostReady === false
                ? "Starting your Cutie run from warm local context..."
                : "Starting your Cutie run from warm context..."
            : "Preparing your Cutie run...";
        this.submitState = "submitting";
        await this.emitState();
        try {
            const auth = await this.requireAuth();
            if (!auth) {
                this.submitState = "idle";
                this.status = "Sign in or set an API key to start Cutie.";
                await this.emitState();
                return;
            }
            const session = await this.ensureSession(trimmedPrompt);
            const runRequestVersion = ++this.runRequestVersion;
            this.currentAbortController?.abort();
            const abortController = new AbortController();
            this.currentAbortController = abortController;
            this.activeRun = null;
            this.streamingAssistantText = "";
            this.suppressedAssistantArtifactText = "";
            this.resetLiveActionLog();
            this.status = this.warmStartSnapshot?.localReady
                ? "Starting local Cutie runtime from warm context..."
                : "Starting local Cutie runtime...";
            this.submitState = "starting";
            await this.emitState();
            try {
                const result = await this.runtime.runPrompt({
                    auth,
                    session,
                    prompt: trimmedPrompt,
                    mentions,
                    signal: abortController.signal,
                    callbacks: {
                        onSessionChanged: async (nextSession, maybeRun) => {
                            if (runRequestVersion !== this.runRequestVersion)
                                return;
                            this.activeSession = nextSession;
                            this.activeSessionId = nextSession.id;
                            this.activeRun =
                                maybeRun === undefined ? this.sessionStore.getLatestRun(nextSession) : maybeRun;
                            this.syncLiveActionReceipts(this.activeRun);
                            await this.emitState();
                            void this.refreshDesktopState().then(() => this.emitState());
                        },
                        onStatusChanged: async (status, run) => {
                            if (runRequestVersion !== this.runRequestVersion)
                                return;
                            this.status = status;
                            this.activeRun = run;
                            if (this.submitState !== "stopping") {
                                this.submitState =
                                    run?.status === "running"
                                        ? "running"
                                        : this.currentAbortController
                                            ? "starting"
                                            : "settled";
                            }
                            this.noteLiveActionStatus(status, run);
                            this.syncLiveActionReceipts(run);
                            if (abortController.signal.aborted || !run || run.status !== "running") {
                                this.streamingAssistantText = "";
                            }
                            await this.emitState();
                            void this.refreshDesktopState().then(() => this.emitState());
                        },
                        onAssistantDelta: async (_delta, accumulated) => {
                            if (runRequestVersion !== this.runRequestVersion)
                                return;
                            if (abortController.signal.aborted)
                                return;
                            if (this.submitState === "stopping")
                                return;
                            if ((0, cutie_native_autonomy_1.looksLikeCutieToolArtifactText)(accumulated)) {
                                this.suppressedAssistantArtifactText = accumulated;
                                this.streamingAssistantText = "";
                                this.upsertLiveTranscriptEvent({
                                    kind: "artifact_rescue",
                                    text: (0, cutie_transcript_1.humanizeSuppressedAssistantArtifact)(accumulated),
                                    run: this.activeRun,
                                    slot: "suppressed_artifact",
                                });
                                this.submitState = "running";
                                await this.emitState();
                                if (abortController.signal.aborted)
                                    return;
                                return;
                            }
                            this.submitState = "running";
                            this.streamingAssistantText = accumulated;
                            this.upsertLiveTranscriptEvent({
                                kind: "assistant_text",
                                text: accumulated,
                                run: this.activeRun,
                                slot: "assistant_stream",
                            });
                            await this.emitState();
                            if (abortController.signal.aborted) {
                                this.streamingAssistantText = "";
                            }
                        },
                        onSuppressedAssistantArtifact: async (artifact) => {
                            if (runRequestVersion !== this.runRequestVersion)
                                return;
                            if (abortController.signal.aborted)
                                return;
                            if (this.submitState === "stopping")
                                return;
                            this.suppressedAssistantArtifactText = artifact;
                            this.upsertLiveTranscriptEvent({
                                kind: "artifact_rescue",
                                text: (0, cutie_transcript_1.humanizeSuppressedAssistantArtifact)(artifact),
                                run: this.activeRun,
                                slot: "suppressed_artifact",
                            });
                            this.submitState = "running";
                            await this.emitState();
                            if (abortController.signal.aborted) {
                                this.suppressedAssistantArtifactText = "";
                            }
                        },
                        onWorkspaceFileMutated: async (info) => {
                            if (runRequestVersion !== this.runRequestVersion)
                                return;
                            await this.recordChatWorkspaceDiff(info);
                            await this.emitState();
                            const cfg = vscode.workspace.getConfiguration("cutie-product");
                            const autoOpenDiff = cfg.get("autoOpenDiff", false) !== false;
                            if (autoOpenDiff) {
                                await this.showCutieDiffEditor(info, { preserveFocus: true, preview: true });
                            }
                            else {
                                (0, cutie_diff_1.rememberMutationBefore)(info.relativePath, info.previousContent);
                            }
                            if (cfg.get("showDiffToast", false)) {
                                void vscode.window.showInformationMessage(`Cutie updated ${info.relativePath} — compare before and after in the diff editor.`);
                            }
                        },
                    },
                });
                if (runRequestVersion !== this.runRequestVersion)
                    return;
                this.activeSession = result.session;
                this.activeSessionId = result.session.id;
                this.hydrateChatDiffsFromRunReceipts(result.session);
                this.activeRun = result.run;
                this.syncLiveActionReceipts(result.run);
                await this.persistUnifiedRunTranscript(result.run);
                if (runRequestVersion !== this.runRequestVersion)
                    return;
                const recapSession = await this.ensureRunChangeRecap(result.run, this.activeSession);
                if (runRequestVersion !== this.runRequestVersion)
                    return;
                if (recapSession) {
                    this.activeSession = recapSession;
                    this.activeSessionId = recapSession.id;
                }
                this.streamingAssistantText = "";
                this.submitState = "settled";
                this.status = settledStatusForRun(result.run);
            }
            catch (error) {
                if (runRequestVersion !== this.runRequestVersion)
                    return;
                const message = error instanceof Error ? error.message : String(error);
                const isCancel = /aborted|abort|cancelled|canceled/i.test(message);
                this.streamingAssistantText = "";
                this.suppressedAssistantArtifactText = "";
                this.status = isCancel ? "Cutie run cancelled." : `Cutie failed: ${message}`;
                this.submitState = "settled";
                if (this.activeSession && this.activeRun && isTerminalRunStatus(this.activeRun.status)) {
                    const recapSession = await this.ensureRunChangeRecap(this.activeRun, this.activeSession);
                    if (runRequestVersion !== this.runRequestVersion)
                        return;
                    if (recapSession) {
                        this.activeSession = recapSession;
                        this.activeSessionId = recapSession.id;
                    }
                }
                if (!isCancel)
                    void vscode.window.showErrorMessage(this.status);
            }
            finally {
                if (this.currentAbortController === abortController) {
                    this.currentAbortController = null;
                }
                if (runRequestVersion !== this.runRequestVersion)
                    return;
                this.submitState = "settled";
                await this.refreshDesktopState();
                void this.prewarmFastStartState();
                await this.emitState();
            }
        }
        catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            this.status = `Cutie failed: ${message}`;
            this.submitState = "settled";
            void vscode.window.showErrorMessage(this.status);
            await this.refreshDesktopState();
            void this.prewarmFastStartState();
            await this.emitState();
        }
    }
    async copyDebugReport() {
        const session = this.activeSession;
        const run = this.activeRun;
        const messages = this.getVisibleMessages();
        const debugPayload = {
            exportedAt: new Date().toISOString(),
            extensionVersion: (0, config_1.getExtensionVersion)(this.context),
            workspaceHash: (0, config_1.getWorkspaceHash)(),
            submitState: this.submitState,
            status: this.status,
            liveActionLogPreview: this.getLiveActionLogForRun(run).slice(-40),
            liveTranscriptPreview: this.getLiveTranscriptForRun(run).slice(-40),
            suppressedAssistantArtifactPreview: this.suppressedAssistantArtifactText
                ? this.suppressedAssistantArtifactText.slice(0, 4000)
                : null,
            auth: {
                kind: this.authState.kind,
                label: this.authState.label,
            },
            warmStartState: this.getWarmStartStateForView(),
            promptState: this.getPromptStateForView(),
            session: session
                ? {
                    id: session.id,
                    title: session.title,
                    updatedAt: session.updatedAt,
                    snapshotCount: session.snapshots.length,
                }
                : null,
            activeRun: run
                ? {
                    id: run.id,
                    status: run.status,
                    phase: run.phase,
                    stepCount: run.stepCount,
                    maxSteps: run.maxSteps,
                    workspaceMutationCount: run.workspaceMutationCount,
                    maxWorkspaceMutations: run.maxWorkspaceMutations,
                    desktopMutationCount: run.desktopMutationCount,
                    maxDesktopMutations: run.maxDesktopMutations,
                    repeatedCallCount: run.repeatedCallCount,
                    goal: run.goal,
                    autonomyMode: run.autonomyMode || null,
                    preferredTargetPath: run.preferredTargetPath || null,
                    targetConfidence: run.targetConfidence || null,
                    targetSource: run.targetSource || null,
                    taskFrame: run.taskFrame || null,
                    targetCandidates: run.targetCandidates || [],
                    targetAcquisitionPhase: run.targetAcquisitionPhase || null,
                    currentRepairTactic: run.currentRepairTactic || null,
                    lastNewEvidence: run.lastNewEvidence || null,
                    noOpConclusion: run.noOpConclusion || null,
                    modelAdapter: run.modelAdapter || null,
                    modelCapabilities: run.modelCapabilities || null,
                    protocolMode: run.protocolMode || null,
                    normalizationSource: run.normalizationSource || null,
                    artifactExtractionShape: run.artifactExtractionShape || null,
                    fallbackModeUsed: run.fallbackModeUsed || null,
                    simpleTaskFastPath: Boolean(run.simpleTaskFastPath),
                    objectiveSuspendedForDirectRecovery: Boolean(run.objectiveSuspendedForDirectRecovery),
                    nextDeterministicAction: run.nextDeterministicAction || null,
                    suppressedToolRescued: Boolean(run.suppressedToolRescued),
                    suppressedToolName: run.suppressedToolName || null,
                    suppressedToolRejectedReason: run.suppressedToolRejectedReason || null,
                    lastMutationValidationError: run.lastMutationValidationError || null,
                    patchDisabledForRun: Boolean(run.patchDisabledForRun),
                    mutationCoercionMode: run.mutationCoercionMode || null,
                    executedRecoveredArtifact: Boolean(run.executedRecoveredArtifact),
                    promptSource: run.promptSource || null,
                    promptMarkdownPath: run.promptMarkdownPath || null,
                    promptLoaded: Boolean(run.promptLoaded),
                    promptLoadError: run.promptLoadError || null,
                    promptLastLoadedAt: run.promptLastLoadedAt || null,
                    goalSatisfied: run.goalSatisfied,
                    lastMeaningfulProgressAtStep: run.lastMeaningfulProgressAtStep ?? null,
                    lastMeaningfulProgressSummary: run.lastMeaningfulProgressSummary || null,
                    lastActionAtStep: run.lastActionAtStep ?? null,
                    lastActionSummary: run.lastActionSummary || null,
                    lastStrategyShiftAtStep: run.lastStrategyShiftAtStep ?? null,
                    noProgressTurns: run.noProgressTurns ?? 0,
                    stallSinceStep: run.stallSinceStep ?? null,
                    stallSinceSummary: run.stallSinceSummary || null,
                    stallLevel: run.stallLevel || null,
                    stallReason: run.stallReason || null,
                    stallNextAction: run.stallNextAction || null,
                    repairAttemptCount: run.repairAttemptCount,
                    objectiveRepairCount: run.objectiveRepairCount ?? 0,
                    escalationState: run.escalationState,
                    stuckReason: run.stuckReason || null,
                    suggestedNextAction: run.suggestedNextAction || null,
                    currentStrategyLabel: (0, cutie_autonomy_controller_1.getCurrentStrategyLabel)(run),
                    lastToolName: run.lastToolName || null,
                    error: run.error || null,
                    startedAt: run.startedAt,
                    endedAt: run.endedAt || null,
                    receipts: run.receipts,
                }
                : null,
            desktop: {
                platform: this.desktopState.platform,
                activeWindow: this.desktopState.activeWindow || null,
                displays: this.desktopState.displays,
                recentSnapshots: this.desktopState.recentSnapshots,
            },
            recentMessages: messages.slice(-12).map((message) => ({
                role: message.role,
                content: message.content,
                createdAt: message.createdAt,
                runId: message.runId || null,
            })),
        };
        const payloadText = JSON.stringify(debugPayload, null, 2);
        await vscode.env.clipboard.writeText(payloadText);
        this.status = "Cutie debug report copied to clipboard.";
        await this.emitState();
        void vscode.window.showInformationMessage("Cutie debug report copied to your clipboard.");
    }
    getVisibleMessages() {
        const activeRunId = String(this.activeRun?.id || "").trim();
        const messages = (this.activeSession?.messages || []).filter((message) => {
            if (!activeRunId || !isBusySubmitState(this.submitState))
                return true;
            return !(message.role === "assistant" && message.runId === activeRunId);
        });
        const bubble = this.binaryController.getLiveBubble();
        if (!bubble)
            return messages;
        return [
            ...messages,
            {
                id: bubble.messageId,
                role: "assistant",
                content: bubble.content,
                createdAt: bubble.createdAt,
                presentation: "live_binary",
                live: bubble.live,
            },
        ];
    }
    async refreshDesktopState() {
        this.desktopState = await this.desktop.getDesktopContext().catch(() => this.desktopState || buildDefaultDesktopState());
        this.desktopStateFetchedAt = Date.now();
    }
    async getDesktopContextForPrompt() {
        const now = Date.now();
        if (this.desktopStateFetchedAt &&
            now - this.desktopStateFetchedAt < CutieSidebarProvider.DESKTOP_CONTEXT_CACHE_TTL_MS) {
            return this.desktopState;
        }
        await this.refreshDesktopState();
        return this.desktopState;
    }
    async getGitStatusSummary(force = false) {
        const now = Date.now();
        if (!force &&
            this.gitStatusFetchedAt &&
            now - this.gitStatusFetchedAt < CutieSidebarProvider.GIT_STATUS_CACHE_TTL_MS) {
            return this.gitStatusSummary;
        }
        if (this.gitStatusPromise) {
            return this.gitStatusPromise;
        }
        this.gitStatusPromise = (async () => {
            let summary;
            try {
                const gs = await this.workspaceAdapter.gitStatus();
                const out = (gs.stdout || "").trim();
                if (out) {
                    summary = out.length > 6000 ? `${out.slice(0, 6000)}\n...[truncated]` : out;
                }
            }
            catch {
                summary = undefined;
            }
            this.gitStatusSummary = summary;
            this.gitStatusFetchedAt = Date.now();
            return summary;
        })();
        try {
            return await this.gitStatusPromise;
        }
        finally {
            this.gitStatusPromise = null;
        }
    }
    async refreshAuthState() {
        this.authState = await this.auth.getAuthState().catch(() => ({
            kind: "none",
            label: "Not signed in",
        }));
    }
    async refreshViewState() {
        await Promise.allSettled([
            this.refreshAuthState(),
            this.refreshDesktopState(),
            this.refreshOperatingPromptState(false),
            this.refreshWarmStartSnapshot(false),
        ]);
        await this.emitState();
    }
    async emitState() {
        if (!this.view)
            return;
        const workspaceHash = (0, config_1.getWorkspaceHash)();
        const state = {
            authState: this.authState,
            sessions: this.sessionStore.listSessions(workspaceHash),
            activeSessionId: this.activeSessionId,
            messages: this.getVisibleMessages(),
            chatDiffs: this.getChatDiffsForActiveSession(),
            liveActionLog: this.getLiveActionLogForRun(this.activeRun),
            liveTranscript: this.getLiveTranscriptForRun(this.activeRun),
            status: this.status,
            submitState: this.submitState,
            running: isBusySubmitState(this.submitState),
            activeRun: this.activeRun,
            desktop: this.desktopState,
            progress: buildProgressViewModel(this.activeRun),
            binary: this.binaryController.binary,
            binaryActivity: this.binaryController.binaryActivity,
            binaryLiveBubble: this.binaryController.getLiveBubble(),
            composerPrefs: {
                selectedModel: (0, config_1.getModelHint)(),
                modelOptions: (0, config_1.getModelPickerOptions)(),
                reasoningLevel: (0, config_1.getReasoningLevel)(),
            },
            warmStartState: this.getWarmStartStateForView(),
            promptState: this.getPromptStateForView(),
            canUndoPlayground: this.playgroundChatBridge.canUndoPlaygroundBatch(),
            ideRuntime: (0, config_1.getBinaryIdeChatRuntime)(),
        };
        this.view.webview.postMessage({ type: "state", state });
    }
}
CutieSidebarProvider.WORKSPACE_MENTION_INDEX_TTL_MS = 90000;
CutieSidebarProvider.MENTION_QUERY_INDEX_WAIT_MS = 60;
CutieSidebarProvider.MAX_CHAT_DIFFS_PER_SESSION = 120;
CutieSidebarProvider.MAX_PATCH_CHARS = 52000;
CutieSidebarProvider.MAX_FILE_CHARS_FOR_PATCH = 500000;
CutieSidebarProvider.WEBVIEW_READY_TIMEOUT_MS = 10000;
CutieSidebarProvider.MAX_LIVE_ACTION_LINES = 120;
CutieSidebarProvider.DESKTOP_CONTEXT_CACHE_TTL_MS = 8000;
CutieSidebarProvider.GIT_STATUS_CACHE_TTL_MS = 15000;
CutieSidebarProvider.WARM_START_TTL_MS = 15000;
CutieSidebarProvider.WARM_REFRESH_DEBOUNCE_MS = 220;
CutieSidebarProvider.REQUEST_AUTH_CACHE_TTL_MS = 60000;
CutieSidebarProvider.HOST_PROBE_TTL_MS = 30000;
CutieSidebarProvider.HOST_PROBE_TIMEOUT_MS = 1500;
function activate(context) {
    try {
        (0, cutie_diff_1.registerCutieDiffBeforeProvider)(context);
        const auth = new auth_1.CutieAuthManager(context);
        const provider = new CutieSidebarProvider(context, auth);
        provider.startBackgroundWarmup();
        context.subscriptions.push(vscode.window.registerWebviewViewProvider(config_1.VIEW_ID, provider), vscode.window.registerUriHandler(auth), vscode.commands.registerCommand("cutie-product.startChat", async () => provider.show()), vscode.commands.registerCommand("cutie-product.captureScreen", async () => provider.captureScreen()), vscode.commands.registerCommand("cutie-product.setApiKey", async () => auth.setApiKeyInteractive()), vscode.commands.registerCommand("cutie-product.signIn", async () => auth.signInWithBrowser()), vscode.commands.registerCommand("cutie-product.signOut", async () => {
            await auth.signOut();
            provider.stopBinaryStreamsForSignOut();
            await provider.newChat();
        }), vscode.commands.registerCommand("cutie-product.stopAutomation", async () => provider.stopAutomation()), vscode.commands.registerCommand("cutie-product.binary.generate", async () => {
            const editor = vscode.window.activeTextEditor;
            let prefill;
            if (editor) {
                const rel = (0, config_1.toWorkspaceRelativePath)(editor.document.uri);
                const line = editor.selection.active.line + 1;
                const selectedText = editor.selection.isEmpty
                    ? editor.document.lineAt(editor.selection.active.line).text
                    : editor.document.getText(editor.selection);
                const fromSelection = (0, selection_prefill_1.buildSelectionPrefill)({
                    path: rel || undefined,
                    line,
                    selectedText,
                });
                prefill = fromSelection.trim() || selectedText.trim() || undefined;
            }
            await provider.runBinaryGenerateFromEditor(prefill);
        }), vscode.commands.registerCommand("cutie-product.undoLastPlaygroundChanges", async () => {
            await provider.undoLastPlaygroundBatchCommand();
        }), vscode.commands.registerCommand("cutie-product.binary.validate", async () => provider.runBinaryValidateCommand()), vscode.commands.registerCommand("cutie-product.binary.deploy", async () => provider.runBinaryDeployCommand()), vscode.commands.registerCommand("cutie-product.binary.configure", async () => provider.openBinaryConfigureCommand()));
    }
    catch (error) {
        const msg = error instanceof Error ? error.message : String(error);
        const detail = error instanceof Error && error.stack ? error.stack.split("\n").slice(0, 4).join("\n") : "";
        void vscode.window.showErrorMessage(`CUTIE PRODUCT failed to activate: ${msg}`);
        console.error("cutie-product activate failed", error);
        if (detail) {
            console.error(detail);
        }
    }
}
function deactivate() { }
//# sourceMappingURL=extension.js.map
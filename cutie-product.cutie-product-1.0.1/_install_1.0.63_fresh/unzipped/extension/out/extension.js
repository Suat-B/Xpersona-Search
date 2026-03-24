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
const cutie_native_autonomy_1 = require("./cutie-native-autonomy");
const cutie_runtime_1 = require("./cutie-runtime");
const cutie_session_store_1 = require("./cutie-session-store");
const cutie_tool_registry_1 = require("./cutie-tool-registry");
const cutie_workspace_adapter_1 = require("./cutie-workspace-adapter");
const diff_1 = require("diff");
const cutie_diff_1 = require("./cutie-diff");
const webview_html_1 = require("./webview-html");
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
        ...(run.modelAdapter || run.protocolMode || run.normalizationSource || run.fallbackModeUsed
            ? {
                modelStrategySummary: [
                    run.modelAdapter ? `adapter ${run.modelAdapter}` : "",
                    run.protocolMode ? `mode ${run.protocolMode}` : "",
                    run.normalizationSource ? `source ${run.normalizationSource}` : "",
                    run.fallbackModeUsed && run.fallbackModeUsed !== "none" ? `fallback ${run.fallbackModeUsed}` : "",
                ]
                    .filter(Boolean)
                    .join(" • "),
            }
            : {}),
        ...((0, cutie_autonomy_controller_1.getCurrentStrategyLabel)(run) ? { currentStrategyLabel: (0, cutie_autonomy_controller_1.getCurrentStrategyLabel)(run) } : {}),
        ...(run.stuckReason ? { escalationMessage: run.stuckReason } : {}),
        ...(run.suggestedNextAction ? { suggestedNextAction: run.suggestedNextAction } : {}),
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
        this.liveActionSeenReceiptIds = new Set();
        this.liveActionLastStatus = "";
        this.liveActionLogByRunId = new Map();
        this.liveActionSeenReceiptIdsByRunId = new Map();
        this.liveActionLastStatusByRunId = new Map();
        this.liveActionTranscriptPersistedRunIds = new Set();
        this.desktopState = buildDefaultDesktopState();
        this.desktopStateFetchedAt = 0;
        this.gitStatusFetchedAt = 0;
        this.gitStatusPromise = null;
        this.fastStartWarmupPromise = null;
        this.authState = {
            kind: "none",
            label: "Not signed in",
        };
        /** Cached workspace paths for @ file lookup (avoid findFiles on every keystroke). */
        this.workspaceMentionPaths = null;
        this.workspaceMentionPathsFetchedAt = 0;
        this.workspaceMentionIndexPromise = null;
        /** Inline chat diff cards keyed by session id (not persisted to disk). */
        this.chatDiffsBySessionId = new Map();
        this.desktop = new cutie_desktop_adapter_1.CutieDesktopAdapter();
        this.workspaceAdapter = new cutie_workspace_adapter_1.CutieWorkspaceAdapter();
        this.modelClient = new cutie_model_client_1.CutieModelClient();
        this.modelAdapter = new cutie_model_adapter_1.CutieModelAdapter(this.modelClient);
        this.sessionStore = new cutie_session_store_1.CutieSessionStore(context);
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
            gatherBinaryContext: () => this.gatherBinaryContextForApi(),
            showView: () => this.show(),
        });
        this.auth.onDidChange(() => {
            void this.refreshAuthState().finally(() => {
                void this.emitState();
            });
        });
        this.context.subscriptions.push(vscode.workspace.onDidChangeWorkspaceFolders(() => {
            this.invalidateWorkspaceMentionIndex();
        }), vscode.workspace.onDidChangeConfiguration((event) => {
            if (event.affectsConfiguration("cutie-product.baseApiUrl") || event.affectsConfiguration("cutie-product.binary")) {
                void this.emitState();
            }
        }));
        this.context.subscriptions.push({ dispose: () => this.clearWebviewReadyTimeout() });
    }
    resetLiveActionLog(runId = null) {
        this.liveActionLog = [];
        this.liveActionLogRunId = runId;
        this.liveActionSeenReceiptIds = new Set();
        this.liveActionLastStatus = "";
        if (runId) {
            this.liveActionLogByRunId.set(runId, []);
            this.liveActionSeenReceiptIdsByRunId.set(runId, []);
            this.liveActionLastStatusByRunId.set(runId, "");
        }
    }
    ensureLiveActionLogForRun(run) {
        const runId = run?.id || null;
        if (runId !== this.liveActionLogRunId) {
            this.liveActionLogRunId = runId;
            this.liveActionLog = runId ? [...(this.liveActionLogByRunId.get(runId) || [])] : [];
            this.liveActionSeenReceiptIds = new Set(runId ? this.liveActionSeenReceiptIdsByRunId.get(runId) || [] : []);
            this.liveActionLastStatus = runId ? this.liveActionLastStatusByRunId.get(runId) || "" : "";
        }
    }
    persistLiveActionStateForCurrentRun() {
        const runId = this.liveActionLogRunId;
        if (!runId)
            return;
        this.liveActionLogByRunId.set(runId, [...this.liveActionLog]);
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
    async persistLiveActionTranscript(run) {
        if (!run)
            return;
        const runId = String(run.id || "").trim();
        if (!runId || this.liveActionTranscriptPersistedRunIds.has(runId))
            return;
        const lines = this.getLiveActionLogForRun(run);
        if (!lines.length)
            return;
        this.liveActionTranscriptPersistedRunIds.add(runId);
        const content = [
            "Cutie action log:",
            ...lines.map((line) => String(line || "").trim()).filter(Boolean),
        ].join("\n");
        const sourceSession = this.activeSession;
        if (!sourceSession)
            return;
        const nextSession = await this.sessionStore.appendMessage(sourceSession, {
            role: "assistant",
            content,
            runId,
        });
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
            this.appendLiveActionLine(this.formatLiveActionReceiptLine(receipt));
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
        this.persistLiveActionStateForCurrentRun();
    }
    async gatherBinaryContextForApi() {
        const excerptMax = 8000;
        const openExcerptMax = 2000;
        const activeEditor = vscode.window.activeTextEditor;
        const activeFile = activeEditor
            ? {
                path: (0, config_1.toWorkspaceRelativePath)(activeEditor.document.uri) || undefined,
                language: activeEditor.document.languageId,
                ...(activeEditor.selection.isEmpty
                    ? { content: activeEditor.document.getText().slice(0, excerptMax) }
                    : {
                        selection: activeEditor.document.getText(activeEditor.selection).slice(0, excerptMax),
                    }),
            }
            : undefined;
        const openFiles = vscode.window.visibleTextEditors
            .map((editor) => {
            const relativePath = (0, config_1.toWorkspaceRelativePath)(editor.document.uri);
            if (!relativePath)
                return null;
            return {
                path: relativePath,
                language: editor.document.languageId,
                excerpt: editor.document.getText().slice(0, openExcerptMax),
            };
        })
            .filter((row) => Boolean(row));
        const candidateErrors = [];
        for (const [uri, diags] of vscode.languages.getDiagnostics()) {
            const rel = (0, config_1.toWorkspaceRelativePath)(uri);
            for (const d of diags.slice(0, 2)) {
                candidateErrors.push(`${rel || "?"}: ${d.message}`);
                if (candidateErrors.length >= 24)
                    break;
            }
            if (candidateErrors.length >= 24)
                break;
        }
        const context = {};
        if (activeFile?.path) {
            context.activeFile = activeFile;
        }
        if (openFiles.length) {
            context.openFiles = openFiles;
        }
        return {
            context,
            retrievalHints: {
                mentionedPaths: [],
                candidateSymbols: [],
                candidateErrors,
            },
        };
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
    prewarmFastStartState() {
        if (this.fastStartWarmupPromise)
            return;
        this.fastStartWarmupPromise = (async () => {
            await Promise.allSettled([this.refreshAuthState(), this.refreshDesktopState(), this.getGitStatusSummary()]);
        })().finally(() => {
            this.fastStartWarmupPromise = null;
            if (this.view && this.webviewReady) {
                void this.emitState();
            }
        });
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
        this.currentAbortController.abort();
        await this.emitState();
    }
    getChatDiffsForActiveSession() {
        if (!this.activeSessionId)
            return [];
        return this.chatDiffsBySessionId.get(this.activeSessionId) ?? [];
    }
    async recordChatWorkspaceDiff(info) {
        const sessionId = String(info.sessionId || "").trim() || this.activeSessionId;
        if (!sessionId)
            return;
        const trimmed = String(info.relativePath || "")
            .trim()
            .replace(/\\/g, "/");
        if (!trimmed)
            return;
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
        let before = typeof info.previousContent === "string" ? info.previousContent : "";
        if (before.length > CutieSidebarProvider.MAX_FILE_CHARS_FOR_PATCH) {
            before = `${before.slice(0, CutieSidebarProvider.MAX_FILE_CHARS_FOR_PATCH)}\n\n/* … truncated before snapshot … */\n`;
        }
        if (after.length > CutieSidebarProvider.MAX_FILE_CHARS_FOR_PATCH) {
            after = `${after.slice(0, CutieSidebarProvider.MAX_FILE_CHARS_FOR_PATCH)}\n\n/* … truncated after snapshot … */\n`;
        }
        let patch = hasAfterContent
            ? (0, diff_1.createTwoFilesPatch)(trimmed, trimmed, before, after, "", "", { context: 3 })
            : `Inline diff preview unavailable for ${trimmed}.\n\nCutie changed the file, but the updated file contents could not be reconstructed for the chat card.`;
        if (patch.length > CutieSidebarProvider.MAX_PATCH_CHARS) {
            patch = `${patch.slice(0, CutieSidebarProvider.MAX_PATCH_CHARS)}\n\n… patch truncated for chat preview …\n`;
        }
        const item = {
            id: `cutie_chat_diff_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`,
            createdAt: new Date().toISOString(),
            runId: String(info.runId || "").trim() || this.activeRun?.id || null,
            relativePath: trimmed,
            toolName: info.toolName,
            patch,
        };
        const list = [...(this.chatDiffsBySessionId.get(sessionId) ?? [])];
        const previous = list[list.length - 1];
        if (previous &&
            previous.runId === item.runId &&
            previous.relativePath === item.relativePath &&
            previous.toolName === item.toolName &&
            previous.patch === item.patch) {
            return;
        }
        list.push(item);
        while (list.length > CutieSidebarProvider.MAX_CHAT_DIFFS_PER_SESSION) {
            list.shift();
        }
        this.chatDiffsBySessionId.set(sessionId, list);
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
        const auth = await this.auth.getRequestAuth();
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
        const cfg = vscode.workspace.getConfiguration("cutie-product");
        const contextPreviewChars = Math.max(1024, Math.min(24000, cfg.get("contextPreviewChars", 6000)));
        const openFilePreviewLines = Math.max(0, Math.min(120, cfg.get("openFilePreviewLines", 25)));
        const maxOpenFilesInContext = Math.max(4, Math.min(24, cfg.get("maxOpenFilesInContext", 12)));
        const maxToolsPerBatch = Math.max(1, Math.min(8, cfg.get("maxToolsPerBatch", 4)));
        const contextReceiptWindow = Math.max(4, Math.min(32, cfg.get("contextReceiptWindow", 14)));
        const investigationPreflight = cfg.get("investigationPreflight", false);
        const objectiveBasedRuns = cfg.get("objectiveBasedRuns", true);
        const objectiveBasedInvestigation = cfg.get("objectiveBasedInvestigation", false);
        const maxToolSteps = Math.max(8, Math.min(128, cfg.get("maxToolSteps", 48)));
        const maxWorkspaceMutations = Math.max(2, Math.min(64, cfg.get("maxWorkspaceMutations", 24)));
        const unlimitedAutonomy = cfg.get("unlimitedAutonomy", false);
        const activeEditor = vscode.window.activeTextEditor;
        const activeFile = activeEditor
            ? {
                path: (0, config_1.toWorkspaceRelativePath)(activeEditor.document.uri) || undefined,
                language: activeEditor.document.languageId,
                lineCount: activeEditor.document.lineCount,
                ...(activeEditor.selection.isEmpty
                    ? { preview: activeEditor.document.getText().slice(0, contextPreviewChars) }
                    : {
                        selection: activeEditor.document.getText(activeEditor.selection).slice(0, contextPreviewChars),
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
            if (openFilePreviewLines > 0) {
                const lines = editor.document.getText().split(/\r?\n/);
                const joined = lines.slice(0, openFilePreviewLines).join("\n");
                row.preview =
                    joined.length > contextPreviewChars ? `${joined.slice(0, contextPreviewChars)}\n...[truncated]` : joined;
            }
            return row;
        })
            .filter((value) => Boolean(value))
            .slice(0, maxOpenFilesInContext);
        const diagnostics = vscode.languages
            .getDiagnostics()
            .flatMap(([uri, entries]) => entries.map((entry) => ({
            file: (0, config_1.toWorkspaceRelativePath)(uri) || undefined,
            severity: entry.severity,
            message: entry.message,
            line: entry.range.start.line + 1,
        })))
            .slice(0, 80);
        const desktop = await this.getDesktopContextForPrompt().catch(() => this.desktopState);
        const gitStatusSummary = await this.getGitStatusSummary().catch(() => this.gitStatusSummary);
        return {
            workspaceHash: (0, config_1.getWorkspaceHash)(),
            workspaceRootPath: (0, config_1.getWorkspaceRootPath)(),
            extensionVersion: (0, config_1.getExtensionVersion)(this.context),
            ...(activeFile ? { activeFile } : {}),
            ...(openFiles.length ? { openFiles } : {}),
            ...(diagnostics.length ? { diagnostics } : {}),
            desktop,
            latestSnapshot: this.activeSession?.snapshots?.[0] || null,
            cutieDynamicSettings: {
                maxToolsPerBatch,
                contextReceiptWindow,
                investigationPreflight,
                objectiveBasedRuns,
                objectiveBasedInvestigation,
                maxToolSteps,
                maxWorkspaceMutations,
                unlimitedAutonomy,
            },
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
                const indexedPaths = await this.ensureWorkspaceMentionIndex();
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
        const shouldLookupWindows = wantsWindowsOnly || windowQuery.length > 0;
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
        this.status = "Preparing your Cutie run...";
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
            this.status = "Starting local Cutie runtime...";
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
                            this.submitState =
                                run?.status === "running"
                                    ? "running"
                                    : this.currentAbortController
                                        ? this.submitState === "stopping"
                                            ? "stopping"
                                            : "starting"
                                        : "settled";
                            this.noteLiveActionStatus(status, run);
                            this.syncLiveActionReceipts(run);
                            if (!run || run.status !== "running") {
                                this.streamingAssistantText = "";
                            }
                            await this.emitState();
                            void this.refreshDesktopState().then(() => this.emitState());
                        },
                        onAssistantDelta: async (_delta, accumulated) => {
                            if (runRequestVersion !== this.runRequestVersion)
                                return;
                            if ((0, cutie_native_autonomy_1.looksLikeCutieToolArtifactText)(accumulated)) {
                                this.suppressedAssistantArtifactText = accumulated;
                                this.streamingAssistantText = "";
                                if (this.submitState !== "stopping")
                                    this.submitState = "running";
                                await this.emitState();
                                return;
                            }
                            if (this.submitState !== "stopping")
                                this.submitState = "running";
                            this.streamingAssistantText = accumulated;
                            await this.emitState();
                        },
                        onSuppressedAssistantArtifact: async (artifact) => {
                            if (runRequestVersion !== this.runRequestVersion)
                                return;
                            this.suppressedAssistantArtifactText = artifact;
                            if (this.submitState !== "stopping")
                                this.submitState = "running";
                            await this.emitState();
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
                this.activeRun = result.run;
                this.syncLiveActionReceipts(result.run);
                await this.persistLiveActionTranscript(result.run);
                this.streamingAssistantText = "";
                this.submitState = "settled";
                this.status = settledStatusForRun(result.run);
            }
            catch (error) {
                if (runRequestVersion !== this.runRequestVersion)
                    return;
                const message = error instanceof Error ? error.message : String(error);
                this.status = `Cutie failed: ${message}`;
                this.submitState = "settled";
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
                await this.emitState();
            }
        }
        catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            this.status = `Cutie failed: ${message}`;
            this.submitState = "settled";
            void vscode.window.showErrorMessage(this.status);
            await this.refreshDesktopState();
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
            suppressedAssistantArtifactPreview: this.suppressedAssistantArtifactText
                ? this.suppressedAssistantArtifactText.slice(0, 4000)
                : null,
            auth: {
                kind: this.authState.kind,
                label: this.authState.label,
            },
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
                    fallbackModeUsed: run.fallbackModeUsed || null,
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
        const messages = this.activeSession?.messages || [];
        const withStream = this.streamingAssistantText.trim() === ""
            ? messages
            : [
                ...messages,
                {
                    id: "__streaming__",
                    role: "assistant",
                    content: this.streamingAssistantText,
                    createdAt: new Date().toISOString(),
                    ...(this.activeRun ? { runId: this.activeRun.id } : {}),
                },
            ];
        const bubble = this.binaryController.getLiveBubble();
        if (!bubble)
            return withStream;
        return [
            ...withStream,
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
        await Promise.allSettled([this.refreshAuthState(), this.refreshDesktopState()]);
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
            status: this.status,
            submitState: this.submitState,
            running: isBusySubmitState(this.submitState),
            activeRun: this.activeRun,
            desktop: this.desktopState,
            progress: buildProgressViewModel(this.activeRun),
            binary: this.binaryController.binary,
            binaryActivity: this.binaryController.binaryActivity,
            binaryLiveBubble: this.binaryController.getLiveBubble(),
        };
        this.view.webview.postMessage({ type: "state", state });
    }
}
CutieSidebarProvider.WORKSPACE_MENTION_INDEX_TTL_MS = 90000;
CutieSidebarProvider.MAX_CHAT_DIFFS_PER_SESSION = 120;
CutieSidebarProvider.MAX_PATCH_CHARS = 52000;
CutieSidebarProvider.MAX_FILE_CHARS_FOR_PATCH = 500000;
CutieSidebarProvider.WEBVIEW_READY_TIMEOUT_MS = 10000;
CutieSidebarProvider.MAX_LIVE_ACTION_LINES = 120;
CutieSidebarProvider.DESKTOP_CONTEXT_CACHE_TTL_MS = 8000;
CutieSidebarProvider.GIT_STATUS_CACHE_TTL_MS = 15000;
function activate(context) {
    try {
        (0, cutie_diff_1.registerCutieDiffBeforeProvider)(context);
        const auth = new auth_1.CutieAuthManager(context);
        const provider = new CutieSidebarProvider(context, auth);
        context.subscriptions.push(vscode.window.registerWebviewViewProvider(config_1.VIEW_ID, provider), vscode.window.registerUriHandler(auth), vscode.commands.registerCommand("cutie-product.startChat", async () => provider.show()), vscode.commands.registerCommand("cutie-product.captureScreen", async () => provider.captureScreen()), vscode.commands.registerCommand("cutie-product.setApiKey", async () => auth.setApiKeyInteractive()), vscode.commands.registerCommand("cutie-product.signIn", async () => auth.signInWithBrowser()), vscode.commands.registerCommand("cutie-product.signOut", async () => {
            await auth.signOut();
            provider.stopBinaryStreamsForSignOut();
            await provider.newChat();
        }), vscode.commands.registerCommand("cutie-product.stopAutomation", async () => provider.stopAutomation()), vscode.commands.registerCommand("cutie-product.binary.generate", async () => {
            const editor = vscode.window.activeTextEditor;
            let prefill;
            if (editor) {
                const selected = editor.selection.isEmpty
                    ? editor.document.lineAt(editor.selection.active.line).text
                    : editor.document.getText(editor.selection);
                prefill = selected.trim() || undefined;
            }
            await provider.runBinaryGenerateFromEditor(prefill);
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
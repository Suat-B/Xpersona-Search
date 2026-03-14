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
exports.PlaygroundViewProvider = void 0;
const vscode = __importStar(require("vscode"));
const crypto_1 = require("crypto");
const assistant_ux_1 = require("./assistant-ux");
const api_client_1 = require("./api-client");
const config_1 = require("./config");
const draft_store_1 = require("./draft-store");
const qwen_ux_1 = require("./qwen-ux");
const qwen_history_1 = require("./qwen-history");
const webview_html_1 = require("./webview-html");
const qwen_prompt_1 = require("./qwen-prompt");
const slash_commands_1 = require("./slash-commands");
function normalizeMode(value) {
    if (value === "plan")
        return "plan";
    return "auto";
}
function formatPlan(plan) {
    const lines = [
        `Objective: ${plan.objective}`,
        plan.files.length ? `Files: ${plan.files.join(", ")}` : "",
        plan.steps.length ? `Steps:\n${plan.steps.map((step, index) => `${index + 1}. ${step}`).join("\n")}` : "",
        plan.acceptanceTests.length
            ? `Checks:\n${plan.acceptanceTests.map((check) => `- ${check}`).join("\n")}`
            : "",
        plan.risks.length ? `Risks:\n${plan.risks.map((risk) => `- ${risk}`).join("\n")}` : "",
    ].filter(Boolean);
    return lines.join("\n\n");
}
function createNonce() {
    return (0, crypto_1.randomUUID)().replace(/-/g, "");
}
function createEmptyContextSummary() {
    return {
        likelyTargets: [],
        candidateTargets: [],
        attachedFiles: [],
        memoryTargets: [],
    };
}
class PlaygroundViewProvider {
    constructor(context, auth, historyService, qwenHistoryService, qwenCodeRuntime, contextCollector, actionRunner, toolExecutor, indexManager) {
        this.context = context;
        this.auth = auth;
        this.historyService = historyService;
        this.qwenHistoryService = qwenHistoryService;
        this.qwenCodeRuntime = qwenCodeRuntime;
        this.contextCollector = contextCollector;
        this.actionRunner = actionRunner;
        this.toolExecutor = toolExecutor;
        this.indexManager = indexManager;
        this.sessionId = null;
        this.didPrimeFreshChat = false;
        this.draftText = "";
        this.manualContext = {
            attachedFiles: [],
            attachedSelection: null,
        };
        this.lastPrompt = null;
        this.pendingClarification = null;
        this.draftStore = new draft_store_1.DraftStore(this.context.workspaceState);
        this.state = {
            mode: normalizeMode(this.context.workspaceState.get(config_1.MODE_KEY)),
            runtime: (0, config_1.getRuntimeBackend)(),
            auth: { kind: "none", label: "Not signed in" },
            history: [],
            messages: [],
            busy: false,
            canUndo: (0, config_1.getRuntimeBackend)() === "playgroundApi" && this.actionRunner.canUndo(),
            activity: [],
            selectedSessionId: null,
            contextSummary: createEmptyContextSummary(),
            contextConfidence: "low",
            intent: "ask",
            runtimePhase: "idle",
            followUpActions: [],
            draftText: "",
        };
        this.auth.onDidChange(() => void this.handleAuthChange());
        this.actionRunner.onDidChangeUndo((canUndo) => {
            this.state.canUndo = this.state.runtime === "playgroundApi" && canUndo;
            this.postState();
        });
    }
    resolveWebviewView(view) {
        this.view = view;
        view.webview.options = {
            enableScripts: true,
            localResourceRoots: [vscode.Uri.joinPath(this.context.extensionUri, "media")],
        };
        view.webview.html = this.renderHtml(view.webview);
        view.webview.onDidReceiveMessage((message) => {
            void this.handleMessage(message);
        });
        void this.bootstrap();
    }
    async show(prefill) {
        await vscode.commands.executeCommand("workbench.view.extension.xpersona").then(undefined, () => undefined);
        await vscode.commands.executeCommand(`${config_1.WEBVIEW_VIEW_ID}.focus`).then(undefined, () => undefined);
        if (prefill && this.view) {
            this.view.webview.postMessage({ type: "prefill", text: prefill });
        }
    }
    getDraftSessionId() {
        return this.state.selectedSessionId || this.sessionId || null;
    }
    async loadDraftText() {
        this.draftText = await this.draftStore.get(this.state.runtime, this.getDraftSessionId());
        this.state.draftText = this.draftText;
    }
    async setDraftText(text) {
        this.draftText = String(text || "");
        this.state.draftText = this.draftText;
        await this.draftStore.set(this.state.runtime, this.getDraftSessionId(), this.draftText);
    }
    async clearCurrentDraft() {
        await this.setDraftText("");
    }
    async setRuntime(runtime) {
        if (runtime === this.state.runtime)
            return;
        const target = vscode.workspace.workspaceFolders?.length
            ? vscode.ConfigurationTarget.Workspace
            : vscode.ConfigurationTarget.Global;
        await vscode.workspace
            .getConfiguration(config_1.EXTENSION_NAMESPACE)
            .update("runtime", runtime, target);
        await this.refreshConfiguration();
    }
    getRuntimePhaseForDraft() {
        return this.draftText.trim() ? "radar" : "idle";
    }
    shouldPreserveTerminalPhase() {
        return this.state.runtimePhase === "done" || this.state.runtimePhase === "failed";
    }
    async performSetApiKey() {
        await this.auth.setApiKeyInteractive();
        await this.refreshAuth();
        await this.refreshHistory();
        return this.state.auth.kind === "none"
            ? "Playground API key cleared."
            : "Playground API key updated.";
    }
    async performSignIn() {
        if (this.state.runtime === "qwenCode") {
            return "Qwen Code uses your Playground API key. Use /key or the Key button instead of browser sign-in.";
        }
        await this.auth.signInWithBrowser();
        return "Browser sign-in opened.";
    }
    async performSignOut() {
        await this.auth.signOut();
        await this.newChat();
        await this.refreshAuth();
        await this.refreshHistory();
        return "Playground auth cleared.";
    }
    async performUndo() {
        if (this.state.runtime === "qwenCode") {
            return "Undo is only available for Playground API runs. For Qwen Code sessions, use source control or Qwen checkpoints.";
        }
        return this.actionRunner.undoLastBatch();
    }
    async handleSlashCommand(text) {
        const command = (0, slash_commands_1.parseSlashCommand)(text);
        if (!command)
            return false;
        await this.clearCurrentDraft();
        switch (command.kind) {
            case "help":
                this.appendMessage("system", (0, slash_commands_1.buildSlashCommandHelpMessage)());
                this.state.runtimePhase = this.getRuntimePhaseForDraft();
                this.postState();
                return true;
            case "new":
                await this.newChat();
                this.appendMessage("system", "Started a new chat.");
                this.postState();
                return true;
            case "plan":
                await this.setMode("plan");
                this.appendMessage("system", "Mode set to Plan.");
                this.state.runtimePhase = this.getRuntimePhaseForDraft();
                this.postState();
                return true;
            case "auto":
                await this.setMode("auto");
                this.appendMessage("system", "Mode set to Auto.");
                this.state.runtimePhase = this.getRuntimePhaseForDraft();
                this.postState();
                return true;
            case "runtime":
                await this.setRuntime(command.runtime);
                this.appendMessage("system", `Runtime set to ${command.runtime === "qwenCode" ? "Qwen Code" : "Playground API"}.`);
                this.state.runtimePhase = this.getRuntimePhaseForDraft();
                this.postState();
                return true;
            case "key":
                this.appendMessage("system", await this.performSetApiKey());
                this.state.runtimePhase = this.getRuntimePhaseForDraft();
                this.postState();
                return true;
            case "signin":
                this.appendMessage("system", await this.performSignIn());
                this.state.runtimePhase = this.getRuntimePhaseForDraft();
                this.postState();
                return true;
            case "signout":
                this.appendMessage("system", await this.performSignOut());
                this.state.runtimePhase = this.getRuntimePhaseForDraft();
                this.postState();
                return true;
            case "undo":
                this.appendMessage("system", await this.performUndo());
                this.state.runtimePhase = this.getRuntimePhaseForDraft();
                this.postState();
                return true;
            case "status":
                this.appendMessage("system", (0, slash_commands_1.buildSlashStatusMessage)({
                    runtime: this.state.runtime,
                    mode: this.state.mode,
                    authLabel: this.state.auth.label,
                    runtimePhase: this.state.runtimePhase,
                    sessionId: this.getDraftSessionId(),
                    attachedFiles: this.manualContext.attachedFiles,
                    attachedSelectionPath: this.manualContext.attachedSelection?.path || null,
                }));
                this.state.runtimePhase = this.getRuntimePhaseForDraft();
                this.postState();
                return true;
            case "unknown":
                this.appendMessage("system", (0, slash_commands_1.buildSlashCommandHelpMessage)(`Unknown slash command: ${command.raw}`));
                this.state.runtimePhase = this.getRuntimePhaseForDraft();
                this.postState();
                return true;
        }
    }
    async refreshConfiguration() {
        const runtime = (0, config_1.getRuntimeBackend)();
        const runtimeChanged = runtime !== this.state.runtime;
        this.state.runtime = runtime;
        this.state.canUndo = runtime === "playgroundApi" && this.actionRunner.canUndo();
        if (runtimeChanged) {
            this.sessionId = null;
            this.state.selectedSessionId = null;
            this.state.messages = [];
            this.state.activity = [];
            this.state.followUpActions = [];
            this.state.runtimePhase = "idle";
            this.lastPrompt = null;
            this.pendingClarification = null;
        }
        await this.loadDraftText();
        await this.refreshAuth();
        await this.refreshHistory();
        await this.refreshDraftContext(this.draftText);
        this.postState();
    }
    async setMode(mode) {
        const nextMode = normalizeMode(mode);
        this.state.mode = nextMode;
        await this.context.workspaceState.update(config_1.MODE_KEY, nextMode);
        this.postState();
    }
    async refreshHistory() {
        if (this.state.runtime === "qwenCode") {
            this.state.history = await this.qwenHistoryService.list().catch(() => []);
            this.postState();
            return;
        }
        const auth = await this.auth.getRequestAuth();
        if (!auth) {
            this.state.history = [];
            this.postState();
            return;
        }
        this.state.history = await this.historyService.list(auth).catch(() => []);
        this.postState();
    }
    async newChat() {
        this.sessionId = null;
        this.state.messages = [];
        this.state.activity = [];
        this.state.selectedSessionId = null;
        this.state.canUndo = this.state.runtime === "playgroundApi" && this.actionRunner.canUndo();
        this.state.followUpActions = [];
        this.lastPrompt = null;
        this.pendingClarification = null;
        await this.loadDraftText();
        this.state.runtimePhase = this.getRuntimePhaseForDraft();
        await this.refreshDraftContext(this.draftText);
        this.postState();
    }
    async bootstrap() {
        if (!this.didPrimeFreshChat) {
            this.didPrimeFreshChat = true;
            this.sessionId = null;
            this.state.messages = [];
            this.state.activity = [];
            this.state.selectedSessionId = null;
            this.state.busy = false;
            this.state.canUndo = this.state.runtime === "playgroundApi" && this.actionRunner.canUndo();
            this.state.followUpActions = [];
            this.state.runtimePhase = "idle";
            this.lastPrompt = null;
            this.pendingClarification = null;
        }
        await this.loadDraftText();
        await this.refreshConfiguration();
    }
    async handleAuthChange() {
        await this.refreshAuth();
        await this.refreshHistory();
        this.postState();
    }
    async refreshAuth() {
        if (this.state.runtime === "qwenCode") {
            const apiKey = await this.auth.getApiKey().catch(() => null);
            this.state.auth = apiKey
                ? { kind: "apiKey", label: "Qwen Code via Playground API key" }
                : { kind: "none", label: "Qwen Code needs a Playground API key" };
            this.postState();
            return;
        }
        this.state.auth = await this.auth.getAuthState().catch(() => ({
            kind: "none",
            label: "Not signed in",
        }));
        this.postState();
    }
    async openSession(sessionId) {
        if (!sessionId)
            return;
        if (this.state.runtime === "qwenCode") {
            this.sessionId = sessionId;
            this.state.selectedSessionId = sessionId;
            this.state.messages = await this.qwenHistoryService.loadMessages(sessionId).catch(() => []);
            this.state.activity = [];
            this.state.followUpActions = [];
            const historyItem = this.state.history.find((item) => item.id === sessionId);
            if (historyItem)
                this.state.mode = normalizeMode(historyItem.mode);
            await this.loadDraftText();
            this.state.runtimePhase = this.getRuntimePhaseForDraft();
            await this.refreshDraftContext(this.draftText);
            this.postState();
            return;
        }
        const auth = await this.auth.getRequestAuth();
        if (!auth)
            return;
        this.sessionId = sessionId;
        this.state.selectedSessionId = sessionId;
        this.state.messages = await this.historyService.loadMessages(auth, sessionId).catch(() => []);
        this.state.activity = [];
        await this.loadDraftText();
        this.postState();
    }
    async handleMessage(message) {
        if (!message || typeof message !== "object")
            return;
        switch (message.type) {
            case "ready":
                await this.bootstrap();
                return;
            case "sendPrompt":
                await this.sendPrompt(String(message.text || ""));
                return;
            case "newChat":
                await this.newChat();
                return;
            case "previewContext":
                await this.setDraftText(String(message.text || ""));
                await this.refreshDraftContext(this.draftText);
                return;
            case "setMode":
                await this.setMode(String(message.value || "auto"));
                return;
            case "setApiKey":
                await this.performSetApiKey();
                return;
            case "signIn":
                vscode.window.showInformationMessage(await this.performSignIn());
                return;
            case "signOut":
                vscode.window.showInformationMessage(await this.performSignOut());
                return;
            case "loadHistory":
                await this.refreshHistory();
                return;
            case "openSession":
                await this.openSession(String(message.id || ""));
                return;
            case "attachActiveFile":
                await this.attachActiveFile();
                return;
            case "attachSelection":
                await this.attachSelection();
                return;
            case "clearAttachedContext":
                await this.clearAttachedContext();
                return;
            case "followUpAction":
                await this.handleFollowUpAction(String(message.id || ""));
                return;
            case "undoLastChanges": {
                this.appendMessage("system", await this.performUndo());
                this.postState();
                return;
            }
            case "mentionsQuery": {
                const requestId = Number(message.requestId || 0);
                const items = await this.contextCollector.getMentionSuggestions(String(message.query || ""));
                this.view?.webview.postMessage({ type: "mentions", requestId, items });
                return;
            }
            default:
                return;
        }
    }
    async getQwenContextOptions(input) {
        const hints = await this.qwenHistoryService.getWorkspaceHints().catch(() => ({
            recentTargets: [],
            recentIntents: [],
        }));
        return {
            recentTouchedPaths: this.actionRunner.getRecentTouchedPaths(),
            attachedFiles: this.manualContext.attachedFiles,
            attachedSelection: this.manualContext.attachedSelection,
            memoryTargets: hints.recentTargets,
            searchDepth: input?.searchDepth || "fast",
            ...(input?.intent ? { intent: input.intent } : {}),
        };
    }
    applyPreviewState(preview) {
        this.state.intent = preview.intent;
        this.state.contextConfidence = preview.confidence;
        this.state.contextSummary = (0, assistant_ux_1.buildContextSummary)(preview);
    }
    resetQwenInteractionState() {
        this.state.followUpActions = [];
        this.state.activity = [];
        this.state.runtimePhase = this.getRuntimePhaseForDraft();
        this.pendingClarification = null;
    }
    async refreshDraftContext(text) {
        if (this.state.runtime !== "qwenCode")
            return;
        const draft = String(text || "");
        const preview = await this.contextCollector.preview(draft, await this.getQwenContextOptions({
            searchDepth: "fast",
            intent: draft.trim() ? (0, assistant_ux_1.classifyIntent)(draft) : undefined,
        }));
        this.applyPreviewState(preview);
        if (!this.state.busy && (!this.shouldPreserveTerminalPhase() || draft.trim())) {
            this.state.runtimePhase = draft.trim() ? "radar" : "idle";
        }
        this.postState();
    }
    getActiveEditorPath() {
        const editor = vscode.window.activeTextEditor;
        if (!editor)
            return null;
        return (0, config_1.toWorkspaceRelativePath)(editor.document.uri);
    }
    async attachActiveFile() {
        const activePath = this.getActiveEditorPath();
        if (!activePath) {
            vscode.window.showInformationMessage("Open a workspace file before attaching context.");
            return;
        }
        this.manualContext.attachedFiles = Array.from(new Set([activePath, ...this.manualContext.attachedFiles].map((value) => String(value || "").trim()))).slice(0, 4);
        await this.refreshDraftContext(this.draftText);
    }
    async attachSelection() {
        const editor = vscode.window.activeTextEditor;
        const activePath = this.getActiveEditorPath();
        if (!editor || !activePath) {
            vscode.window.showInformationMessage("Open a workspace file before attaching a selection.");
            return;
        }
        const rawSelection = editor.selection.isEmpty
            ? editor.document.lineAt(editor.selection.active.line).text
            : editor.document.getText(editor.selection);
        const trimmed = rawSelection.trim();
        if (!trimmed) {
            vscode.window.showInformationMessage("Select code or place the cursor on a useful line first.");
            return;
        }
        this.manualContext.attachedSelection = {
            path: activePath,
            content: trimmed,
            summary: trimmed.replace(/\s+/g, " ").slice(0, 90),
        };
        this.manualContext.attachedFiles = Array.from(new Set([activePath, ...this.manualContext.attachedFiles].map((value) => String(value || "").trim()))).slice(0, 4);
        await this.refreshDraftContext(this.draftText);
    }
    async clearAttachedContext() {
        this.manualContext = {
            attachedFiles: [],
            attachedSelection: null,
        };
        await this.refreshDraftContext(this.draftText);
    }
    async handleFollowUpAction(id) {
        const action = this.state.followUpActions.find((item) => item.id === id);
        if (!action || action.disabled)
            return;
        if (action.kind === "info")
            return;
        if (action.kind === "prompt" && action.prompt) {
            await this.sendPrompt(action.prompt);
            return;
        }
        if (action.kind === "target" && action.targetPath && this.pendingClarification) {
            this.manualContext.attachedFiles = Array.from(new Set([action.targetPath, ...this.manualContext.attachedFiles].map((value) => String(value || "").trim()))).slice(0, 4);
            await this.runQwenPrompt({
                text: this.pendingClarification.text,
                appendUser: false,
                searchDepth: this.pendingClarification.searchDepth,
            });
            return;
        }
        if (action.kind === "rerun") {
            const base = this.pendingClarification || this.lastPrompt;
            if (!base)
                return;
            if (id === "retry-more-context") {
                if (!this.manualContext.attachedFiles.length) {
                    const activePath = this.getActiveEditorPath();
                    if (activePath) {
                        this.manualContext.attachedFiles = [activePath];
                    }
                }
                if (!this.manualContext.attachedSelection) {
                    const editor = vscode.window.activeTextEditor;
                    const activePath = this.getActiveEditorPath();
                    if (editor && activePath) {
                        const rawSelection = editor.selection.isEmpty
                            ? editor.document.lineAt(editor.selection.active.line).text
                            : editor.document.getText(editor.selection);
                        const trimmed = rawSelection.trim();
                        if (trimmed) {
                            this.manualContext.attachedSelection = {
                                path: activePath,
                                content: trimmed,
                                summary: trimmed.replace(/\s+/g, " ").slice(0, 90),
                            };
                        }
                    }
                }
            }
            await this.runQwenPrompt({
                text: base.text,
                appendUser: false,
                searchDepth: id === "search-deeper" ? "deep" : "fast",
            });
        }
    }
    async sendPrompt(rawText) {
        const text = rawText.trim();
        if (!text || this.state.busy)
            return;
        if (await this.handleSlashCommand(text)) {
            return;
        }
        await this.clearCurrentDraft();
        if (this.state.runtime === "qwenCode") {
            await this.runQwenPrompt({
                text,
                appendUser: true,
                searchDepth: "fast",
            });
            return;
        }
        await this.sendPromptWithPlaygroundApi(text);
    }
    buildClarificationMessage(preview) {
        if (preview.candidateFiles.length) {
            return [
                `Context preview: ${preview.intent.toUpperCase()} | LOW confidence`,
                "I found a few possible target files and I do not want to guess before editing.",
                `Pick one of these files: ${preview.candidateFiles.slice(0, 4).join(", ")}`,
            ].join("\n");
        }
        return [
            `Context preview: ${preview.intent.toUpperCase()} | LOW confidence`,
            "I need a clearer target before editing.",
            "Attach the active file, attach a selection, or ask me to search deeper.",
        ].join("\n");
    }
    shouldShowContextPreview(preview) {
        return Boolean(preview.resolvedFiles.length ||
            preview.attachedFiles.length ||
            preview.attachedSelection ||
            preview.intent === "change" ||
            preview.intent === "find" ||
            preview.intent === "explain");
    }
    async runQwenPrompt(input) {
        const text = input.text.trim();
        const apiKey = await this.auth.getApiKey();
        const workspaceRoot = (0, config_1.getWorkspaceRootPath)();
        const preflightMessage = await (0, qwen_ux_1.validateQwenPreflight)({
            workspaceRoot,
            apiKey,
            qwenBaseUrl: (0, config_1.getQwenOpenAiBaseUrl)(),
            playgroundBaseUrl: (0, config_1.getBaseApiUrl)(),
            executablePath: (0, config_1.getQwenExecutablePath)(),
        });
        if (this.sessionId &&
            !(0, qwen_history_1.isPendingQwenSessionId)(this.sessionId) &&
            !(await this.qwenHistoryService.hasSession(this.sessionId))) {
            this.sessionId = null;
            this.state.selectedSessionId = null;
            this.state.activity = [];
        }
        const localSessionId = this.sessionId || (0, qwen_history_1.createPendingQwenSessionId)();
        this.sessionId = localSessionId;
        this.state.selectedSessionId = localSessionId;
        const intent = (0, assistant_ux_1.classifyIntent)(text);
        const preview = await this.contextCollector.preview(text, await this.getQwenContextOptions({
            searchDepth: input.searchDepth,
            intent,
        }));
        this.applyPreviewState(preview);
        this.lastPrompt = {
            text,
            intent: preview.intent,
            searchDepth: input.searchDepth,
        };
        if (input.appendUser) {
            this.appendMessage("user", text);
        }
        this.state.followUpActions = [];
        this.state.activity = [];
        this.pushActivity("Collecting context");
        this.state.runtimePhase = "collecting_context";
        this.state.busy = true;
        this.postState();
        if (preflightMessage) {
            this.appendMessage("system", preflightMessage);
            this.pushActivity("Failed");
            this.state.runtimePhase = "failed";
            this.state.busy = false;
            await this.qwenHistoryService.saveConversation({
                sessionId: localSessionId,
                mode: this.state.mode,
                title: text,
                messages: this.state.messages,
                targets: preview.resolvedFiles,
                intent: preview.intent,
            });
            await this.refreshHistory();
            this.postState();
            return;
        }
        if ((0, assistant_ux_1.isEditLikeIntent)(preview.intent) && preview.confidence === "low") {
            this.pendingClarification = {
                text,
                intent: preview.intent,
                searchDepth: input.searchDepth,
            };
            this.appendMessage("system", this.buildClarificationMessage(preview));
            this.state.followUpActions = (0, assistant_ux_1.buildClarificationActions)({
                candidateFiles: preview.candidateFiles,
            });
            this.state.runtimePhase = "clarify";
            this.state.busy = false;
            await this.qwenHistoryService.saveConversation({
                sessionId: localSessionId,
                mode: this.state.mode,
                title: text,
                messages: this.state.messages,
                targets: preview.resolvedFiles.length ? preview.resolvedFiles : preview.candidateFiles,
                intent: preview.intent,
            });
            await this.refreshHistory();
            this.postState();
            return;
        }
        this.pendingClarification = null;
        const assistantMessageId = (0, crypto_1.randomUUID)();
        try {
            const { context, preview: fullPreview } = await this.contextCollector.collect(text, await this.getQwenContextOptions({
                searchDepth: input.searchDepth,
                intent: preview.intent,
            }));
            this.applyPreviewState(fullPreview);
            if (this.shouldShowContextPreview(fullPreview)) {
                this.appendMessage("system", (0, assistant_ux_1.buildContextPreviewMessage)(fullPreview));
            }
            const attachedTargets = (fullPreview.selectedFiles.length ? fullPreview.selectedFiles : fullPreview.resolvedFiles).slice(0, 3);
            if (attachedTargets.length) {
                this.pushActivity(`Context attached: ${attachedTargets.join(", ")}`);
            }
            this.pushActivity("Waiting for Qwen");
            this.state.runtimePhase = "waiting_for_qwen";
            this.postState();
            const result = await this.qwenCodeRuntime.runPrompt({
                apiKey: String(apiKey || ""),
                mode: this.state.mode,
                prompt: (0, qwen_prompt_1.buildQwenPrompt)({
                    task: text,
                    mode: this.state.mode,
                    preview: fullPreview,
                    context,
                    workspaceRoot,
                    searchDepth: input.searchDepth,
                    history: this.state.messages,
                    qwenExecutablePath: (0, config_1.getQwenExecutablePath)() || null,
                }),
                onPartial: (partial) => {
                    const next = (0, qwen_ux_1.sanitizeQwenAssistantOutput)({
                        text: partial,
                        task: text,
                        workspaceRoot,
                        executablePath: (0, config_1.getQwenExecutablePath)() || null,
                        workspaceTargets: [
                            fullPreview.activeFile || "",
                            ...fullPreview.resolvedFiles,
                            ...fullPreview.selectedFiles,
                        ],
                    }).trim();
                    if (!next)
                        return;
                    this.upsertMessage(assistantMessageId, "assistant", next);
                    this.postState();
                },
                onActivity: (activity) => {
                    this.pushActivity(activity);
                    if (/awaiting tool approval/i.test(activity)) {
                        this.state.runtimePhase = "awaiting_approval";
                    }
                    else if (/applying result/i.test(activity)) {
                        this.state.runtimePhase = "applying_result";
                    }
                    this.postState();
                },
            });
            const resolvedSessionId = localSessionId;
            this.sessionId = resolvedSessionId;
            this.state.selectedSessionId = resolvedSessionId;
            this.upsertMessage(assistantMessageId, "assistant", (0, qwen_ux_1.sanitizeQwenAssistantOutput)({
                text: result.assistantText || "Qwen Code finished without a final message.",
                task: text,
                workspaceRoot,
                executablePath: (0, config_1.getQwenExecutablePath)() || null,
                workspaceTargets: [
                    fullPreview.activeFile || "",
                    ...fullPreview.resolvedFiles,
                    ...fullPreview.selectedFiles,
                ],
            }));
            this.state.followUpActions = (0, assistant_ux_1.buildFollowUpActions)({
                intent: fullPreview.intent,
                lastTask: text,
                preview: fullPreview,
                patchConfidence: (0, assistant_ux_1.buildPatchConfidence)({
                    intent: fullPreview.intent,
                    preview: fullPreview,
                    didMutate: result.didMutate,
                }),
            });
            for (const denial of result.permissionDenials) {
                this.pushActivity(denial);
            }
            this.pushActivity("Saving session");
            this.state.runtimePhase = "saving_session";
            this.postState();
            await this.qwenHistoryService.saveConversation({
                sessionId: resolvedSessionId,
                mode: this.state.mode,
                title: text,
                messages: this.state.messages,
                targets: fullPreview.resolvedFiles,
                intent: fullPreview.intent,
            });
            await this.refreshHistory();
            this.pushActivity("Done");
            this.state.runtimePhase = "done";
        }
        catch (error) {
            this.appendMessage("system", (0, qwen_ux_1.explainQwenFailure)(error, {
                qwenBaseUrl: (0, config_1.getQwenOpenAiBaseUrl)(),
                executablePath: (0, config_1.getQwenExecutablePath)(),
            }));
            this.pushActivity("Failed");
            this.state.runtimePhase = "failed";
            await this.qwenHistoryService.saveConversation({
                sessionId: localSessionId,
                mode: this.state.mode,
                title: text,
                messages: this.state.messages,
                targets: preview.resolvedFiles,
                intent: preview.intent,
            });
            await this.refreshHistory();
        }
        finally {
            this.state.busy = false;
            this.state.canUndo = false;
            this.postState();
        }
    }
    async sendPromptWithPlaygroundApi(text) {
        const auth = await this.auth.getRequestAuth();
        if (!auth) {
            this.appendMessage("system", "Authenticate with browser sign-in or an API key before sending prompts.");
            this.postState();
            return;
        }
        this.state.busy = true;
        this.appendMessage("user", text);
        this.postState();
        try {
            const { context, retrievalHints, preview } = await this.contextCollector.collect(text, {
                recentTouchedPaths: this.actionRunner.getRecentTouchedPaths(),
                attachedFiles: this.manualContext.attachedFiles,
                attachedSelection: this.manualContext.attachedSelection,
                searchDepth: "fast",
                intent: (0, assistant_ux_1.classifyIntent)(text),
            });
            const workspaceHash = (0, config_1.getWorkspaceHash)();
            const initial = await this.requestAssist(auth, {
                mode: this.state.mode,
                task: text,
                stream: false,
                orchestrationProtocol: this.state.mode === "plan" ? "batch_v1" : "tool_loop_v1",
                clientCapabilities: this.state.mode === "plan"
                    ? undefined
                    : {
                        toolLoop: true,
                        supportedTools: this.toolExecutor.getSupportedTools(),
                        autoExecute: true,
                        supportsNativeToolResults: false,
                    },
                ...(this.sessionId ? { historySessionId: this.sessionId } : {}),
                context,
                retrievalHints,
                clientTrace: {
                    extensionVersion: String(vscode.extensions.getExtension("playgroundai.xpersona-playground")?.packageJSON?.version || "0.0.0"),
                    workspaceHash,
                },
            });
            if (initial.sessionId) {
                this.sessionId = initial.sessionId;
                this.state.selectedSessionId = initial.sessionId;
            }
            this.pushActivity(initial.orchestrationProtocol === "tool_loop_v1"
                ? `Started run ${initial.runId || "pending"} via ${initial.adapter || "tool loop"}.`
                : "Prepared a batch response.");
            let envelope = initial;
            if (envelope.pendingToolCall && envelope.runId) {
                envelope = await this.executeToolLoop({
                    auth,
                    initialEnvelope: envelope,
                    workspaceFingerprint: workspaceHash,
                });
            }
            const assistantBody = this.state.mode === "plan" && envelope.plan
                ? [envelope.final || "Plan ready.", "", formatPlan(envelope.plan)].filter(Boolean).join("\n")
                : envelope.final || "No final response text was returned.";
            this.appendMessage("assistant", (0, qwen_ux_1.sanitizeQwenAssistantOutput)({
                text: assistantBody,
                task: text,
                workspaceRoot: (0, config_1.getWorkspaceRootPath)(),
                executablePath: (0, config_1.getQwenExecutablePath)() || null,
                workspaceTargets: [
                    preview.activeFile || "",
                    ...preview.resolvedFiles,
                    ...preview.selectedFiles,
                ],
            }));
            if (envelope.completionStatus === "incomplete" && envelope.missingRequirements?.length) {
                this.appendMessage("system", `Missing: ${envelope.missingRequirements.join(", ")}`);
            }
            if (this.state.mode !== "plan" &&
                envelope.actions?.length &&
                envelope.adapter === "deterministic_batch") {
                this.appendMessage("system", "Applying deterministic batch changes locally...");
                this.postState();
                const applyReport = await this.actionRunner.apply({
                    mode: this.state.mode,
                    actions: envelope.actions,
                    auth,
                    sessionId: this.sessionId || undefined,
                    workspaceFingerprint: workspaceHash,
                });
                this.state.canUndo = applyReport.canUndo;
                this.appendMessage("system", applyReport.summary);
            }
            if (envelope.receipt && typeof envelope.receipt === "object") {
                const receipt = envelope.receipt;
                const label = String(receipt.status || "ready");
                this.pushActivity(`Receipt: ${label}.`);
            }
            await this.refreshHistory();
        }
        catch (error) {
            this.appendMessage("system", `Request failed: ${error instanceof Error ? error.message : String(error)}`);
        }
        finally {
            this.state.busy = false;
            this.postState();
        }
    }
    async requestAssist(auth, body) {
        const response = await (0, api_client_1.requestJson)("POST", `${(0, config_1.getBaseApiUrl)()}/api/v1/playground/assist`, auth, body);
        return (response?.data || response);
    }
    async continueRun(auth, runId, toolResult) {
        const response = await (0, api_client_1.requestJson)("POST", `${(0, config_1.getBaseApiUrl)()}/api/v1/playground/runs/${encodeURIComponent(runId)}/continue`, auth, {
            toolResult,
        });
        return (response?.data || response);
    }
    async executeToolLoop(input) {
        let envelope = input.initialEnvelope;
        while (envelope.pendingToolCall && envelope.runId) {
            const pendingToolCall = envelope.pendingToolCall;
            this.pushActivity(`Step ${pendingToolCall.step}: ${pendingToolCall.toolCall.name}`);
            this.postState();
            const toolResult = await this.toolExecutor.executeToolCall({
                pendingToolCall,
                auth: input.auth,
                sessionId: this.sessionId || undefined,
                workspaceFingerprint: input.workspaceFingerprint,
            });
            this.pushActivity(toolResult.summary);
            this.postState();
            envelope = await this.continueRun(input.auth, envelope.runId, toolResult);
            if (envelope.sessionId) {
                this.sessionId = envelope.sessionId;
                this.state.selectedSessionId = envelope.sessionId;
            }
            if (envelope.pendingToolCall) {
                this.pushActivity(`Queued next tool: ${envelope.pendingToolCall.toolCall.name}`);
            }
            this.postState();
        }
        return envelope;
    }
    appendMessage(role, content) {
        this.state.messages = [...this.state.messages, { id: (0, crypto_1.randomUUID)(), role, content }];
    }
    upsertMessage(id, role, content) {
        const nextContent = content.trim();
        const index = this.state.messages.findIndex((message) => message.id === id);
        if (index >= 0) {
            const nextMessages = [...this.state.messages];
            nextMessages[index] = { ...nextMessages[index], role, content: nextContent };
            this.state.messages = nextMessages;
            return;
        }
        this.state.messages = [...this.state.messages, { id, role, content: nextContent }];
    }
    pushActivity(text) {
        const next = text.trim();
        if (!next)
            return;
        this.state.activity = [...this.state.activity, next].slice(-24);
    }
    postState() {
        this.view?.webview.postMessage({
            type: "state",
            state: this.state,
        });
    }
    renderHtml(webview) {
        const nonce = createNonce();
        const scriptUri = webview.asWebviewUri(vscode.Uri.joinPath(this.context.extensionUri, "media", "webview.js"));
        const logoUri = webview.asWebviewUri(vscode.Uri.joinPath(this.context.extensionUri, "media", "xpersona.svg"));
        const workspaceName = vscode.workspace.workspaceFolders?.[0]?.name || "Workspace";
        return (0, webview_html_1.buildPlaygroundWebviewHtml)({
            nonce,
            cspSource: webview.cspSource,
            scriptUri: String(scriptUri),
            logoUri: String(logoUri),
            workspaceName,
        });
    }
}
exports.PlaygroundViewProvider = PlaygroundViewProvider;
//# sourceMappingURL=webview-provider.js.map
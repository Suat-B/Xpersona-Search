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
const api_client_1 = require("./api-client");
const config_1 = require("./config");
const webview_html_1 = require("./webview-html");
const qwen_prompt_1 = require("./qwen-prompt");
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
        }
        await this.refreshAuth();
        await this.refreshHistory();
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
        }
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
            const historyItem = this.state.history.find((item) => item.id === sessionId);
            if (historyItem)
                this.state.mode = normalizeMode(historyItem.mode);
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
            case "setMode":
                await this.setMode(String(message.value || "auto"));
                return;
            case "setApiKey":
                await this.auth.setApiKeyInteractive();
                await this.refreshAuth();
                await this.refreshHistory();
                return;
            case "signIn":
                if (this.state.runtime === "qwenCode") {
                    vscode.window.showInformationMessage("Qwen Code uses your Playground API key. Use the API Key button instead of browser sign-in.");
                    return;
                }
                await this.auth.signInWithBrowser();
                return;
            case "signOut":
                await this.auth.signOut();
                await this.newChat();
                await this.refreshAuth();
                await this.refreshHistory();
                return;
            case "loadHistory":
                await this.refreshHistory();
                return;
            case "openSession":
                await this.openSession(String(message.id || ""));
                return;
            case "undoLastChanges": {
                if (this.state.runtime === "qwenCode") {
                    this.appendMessage("system", "Undo is only available for Playground API runs. For Qwen Code sessions, use source control or Qwen checkpoints.");
                    this.postState();
                    return;
                }
                const summary = await this.actionRunner.undoLastBatch();
                this.appendMessage("system", summary);
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
    async sendPrompt(rawText) {
        const text = rawText.trim();
        if (!text || this.state.busy)
            return;
        if (this.state.runtime === "qwenCode") {
            await this.sendPromptWithQwen(text);
            return;
        }
        await this.sendPromptWithPlaygroundApi(text);
    }
    async sendPromptWithQwen(text) {
        const apiKey = await this.auth.getApiKey();
        if (!apiKey) {
            this.appendMessage("system", "Set a Playground API key before using the Qwen Code runtime.");
            this.postState();
            return;
        }
        if (this.sessionId && !(await this.qwenHistoryService.hasSession(this.sessionId))) {
            this.sessionId = null;
            this.state.selectedSessionId = null;
            this.state.activity = [];
        }
        this.state.busy = true;
        this.appendMessage("user", text);
        this.postState();
        const assistantMessageId = (0, crypto_1.randomUUID)();
        try {
            const { context, preview } = await this.contextCollector.collect(text, this.actionRunner.getRecentTouchedPaths());
            const result = await this.qwenCodeRuntime.runPrompt({
                apiKey,
                mode: this.state.mode,
                prompt: (0, qwen_prompt_1.buildQwenPrompt)({
                    task: text,
                    mode: this.state.mode,
                    preview,
                    context,
                    workspaceRoot: (0, config_1.getWorkspaceRootPath)(),
                }),
                sessionId: this.sessionId,
                onPartial: (partial) => {
                    const next = partial.trim();
                    if (!next)
                        return;
                    this.upsertMessage(assistantMessageId, "assistant", next);
                    this.postState();
                },
                onActivity: (activity) => {
                    this.pushActivity(activity);
                    this.postState();
                },
            });
            this.sessionId = result.sessionId;
            this.state.selectedSessionId = result.sessionId;
            this.upsertMessage(assistantMessageId, "assistant", result.assistantText || "Qwen Code finished without a final message.");
            for (const denial of result.permissionDenials) {
                this.pushActivity(denial);
            }
            await this.qwenHistoryService.saveConversation({
                sessionId: result.sessionId,
                mode: this.state.mode,
                title: text,
                messages: this.state.messages,
            });
            await this.refreshHistory();
        }
        catch (error) {
            this.appendMessage("system", `Qwen Code request failed: ${error instanceof Error ? error.message : String(error)}`);
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
            const { context, retrievalHints } = await this.contextCollector.collect(text, this.actionRunner.getRecentTouchedPaths());
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
            this.appendMessage("assistant", assistantBody);
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
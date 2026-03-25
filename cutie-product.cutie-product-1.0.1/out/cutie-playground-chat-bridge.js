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
exports.CutiePlaygroundChatBridge = void 0;
const vscode = __importStar(require("vscode"));
const vscode_core_1 = require("@xpersona/vscode-core");
const assistant_ux_1 = require("./playground-ide/assistant-ux");
const actions_1 = require("./playground-ide/actions");
const context_1 = require("./playground-ide/context");
const indexer_1 = require("./playground-ide/indexer");
const playground_assist_runner_1 = require("./playground-ide/playground-assist-runner");
const qwen_prompt_1 = require("./playground-ide/qwen-prompt");
const qwen_code_runtime_1 = require("./playground-ide/qwen-code-runtime");
const tool_executor_1 = require("./playground-ide/tool-executor");
const config_1 = require("./config");
/** Playground API validates historySessionId as UUID; Cutie local session ids are not UUIDs. */
function isPlaygroundHistorySessionUuid(value) {
    const v = String(value || "").trim();
    return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(v);
}
function cutieMessagesToPlaygroundChat(messages) {
    return messages
        .filter((m) => m.role === "user" || m.role === "assistant" || m.role === "system")
        .map((m) => ({
        id: `m_${Math.random().toString(36).slice(2, 12)}`,
        role: m.role,
        content: String(m.content || ""),
    }));
}
class CutiePlaygroundChatBridge {
    constructor(context, auth) {
        this.context = context;
        this.auth = auth;
        this.indexManager = null;
        this.actionRunner = null;
        this.toolExecutor = null;
        this.contextCollector = null;
        this.qwenRuntime = new qwen_code_runtime_1.QwenCodeRuntime();
    }
    ensureServices() {
        if (this.indexManager)
            return;
        this.indexManager = new indexer_1.CloudIndexManager(this.context, () => this.auth.getRequestAuth());
        this.actionRunner = new actions_1.ActionRunner();
        this.toolExecutor = new tool_executor_1.ToolExecutor(this.actionRunner, this.indexManager);
        this.contextCollector = new context_1.ContextCollector(this.indexManager);
        this.indexManager.start();
        this.context.subscriptions.push(vscode.workspace.onDidSaveTextDocument((document) => {
            if (!this.indexManager?.shouldTrackUri(document.uri))
                return;
            this.indexManager.scheduleRebuild();
        }), vscode.workspace.onDidCreateFiles((event) => {
            if (!event.files.some((uri) => this.indexManager?.shouldTrackUri(uri)))
                return;
            this.indexManager?.scheduleRebuild();
        }), vscode.workspace.onDidDeleteFiles((event) => {
            if (!event.files.some((uri) => this.indexManager?.shouldTrackUri(uri)))
                return;
            this.indexManager?.scheduleRebuild();
        }), vscode.workspace.onDidRenameFiles((event) => {
            const im = this.indexManager;
            if (!im)
                return;
            const touched = event.files.some((entry) => im.shouldTrackUri(entry.oldUri) || im.shouldTrackUri(entry.newUri));
            if (!touched)
                return;
            im.scheduleRebuild();
        }));
    }
    canUndoPlaygroundBatch() {
        return (0, config_1.getBinaryIdeChatRuntime)() === "playgroundApi" && Boolean(this.actionRunner?.canUndo());
    }
    async undoLastPlaygroundBatch() {
        this.ensureServices();
        if (!this.actionRunner)
            return "Nothing to undo.";
        return this.actionRunner.undoLastBatch();
    }
    async getOpenHandsStatus() {
        const auth = await this.auth.getRequestAuth();
        if (!auth) {
            return {
                status: "unreachable",
                message: "Sign in to verify OpenHands.",
            };
        }
        const response = await (0, vscode_core_1.requestJson)("GET", `${(0, config_1.getBaseApiUrl)()}/api/v1/playground/openhands/health`, auth);
        const health = (response &&
            typeof response === "object" &&
            "data" in response &&
            response.data &&
            typeof response.data === "object"
            ? response.data
            : response);
        return {
            status: health?.status === "healthy" ? "healthy" : health?.status === "missing_config" ? "missing_config" : health?.status === "unauthorized" ? "unauthorized" : "unreachable",
            message: String(health?.message || "OpenHands unavailable"),
            ...(typeof health?.details === "string" && health.details.trim() ? { details: health.details } : {}),
        };
    }
    async runQwenTurn(input) {
        this.ensureServices();
        if (!this.contextCollector || !this.actionRunner)
            throw new Error("Playground services not ready.");
        const auth = await this.auth.getRequestAuth();
        if (!auth?.apiKey && !auth?.bearer) {
            throw new Error("Set an Xpersona API key or sign in before using Qwen Code.");
        }
        const apiKey = auth.apiKey || "";
        if (!apiKey) {
            throw new Error("Qwen Code requires an API key (Bearer-only auth is not supported for the local CLI).");
        }
        const taskText = String(input.task || "").trim();
        const { context, preview } = await this.contextCollector.collect(taskText, {
            recentTouchedPaths: this.actionRunner.getRecentTouchedPaths(),
            attachedFiles: [],
            attachedSelection: null,
            searchDepth: "fast",
            intent: (0, assistant_ux_1.classifyIntent)(taskText),
        });
        const history = cutieMessagesToPlaygroundChat(input.history);
        const prompt = (0, qwen_prompt_1.buildQwenPrompt)({
            task: taskText,
            mode: "auto",
            preview,
            context,
            workspaceRoot: vscode.workspace.workspaceFolders?.[0]?.uri.fsPath ?? null,
            searchDepth: "fast",
            history,
            qwenExecutablePath: (0, config_1.getQwenExecutablePath)() || null,
        });
        const ac = new AbortController();
        const onAbort = () => ac.abort();
        if (input.signal.aborted)
            ac.abort();
        else
            input.signal.addEventListener("abort", onAbort, { once: true });
        try {
            const result = await this.qwenRuntime.runPrompt({
                apiKey,
                prompt,
                mode: "auto",
                abortController: ac,
                onPartial: input.onPartial,
            });
            return result.assistantText;
        }
        finally {
            input.signal.removeEventListener("abort", onAbort);
        }
    }
    async runPlaygroundApiTurn(input) {
        this.ensureServices();
        if (!this.contextCollector || !this.toolExecutor || !this.actionRunner) {
            throw new Error("Playground services not ready.");
        }
        const auth = await this.auth.getRequestAuth();
        if (!auth) {
            throw new Error("Authenticate before using hosted playground assist.");
        }
        const taskText = String(input.task || "").trim();
        const { context, retrievalHints, preview } = await this.contextCollector.collect(taskText, {
            recentTouchedPaths: this.actionRunner.getRecentTouchedPaths(),
            attachedFiles: [],
            attachedSelection: null,
            searchDepth: "fast",
            intent: (0, assistant_ux_1.classifyIntent)(taskText),
        });
        const workspaceHash = (0, config_1.getWorkspaceHash)();
        const extensionVersion = (0, config_1.getExtensionVersion)(this.context);
        const serverHistoryId = input.historySessionId && isPlaygroundHistorySessionUuid(input.historySessionId)
            ? input.historySessionId.trim()
            : undefined;
        const requestBody = {
            mode: input.mode,
            task: taskText,
            stream: false,
            orchestrationProtocol: input.mode === "plan" ? "batch_v1" : "tool_loop_v1",
            clientCapabilities: input.mode === "plan"
                ? undefined
                : {
                    toolLoop: true,
                    supportedTools: this.toolExecutor.getSupportedTools(),
                    autoExecute: true,
                    supportsNativeToolResults: false,
                },
            ...(serverHistoryId ? { historySessionId: serverHistoryId } : {}),
            context,
            retrievalHints,
            clientTrace: {
                extensionVersion,
                workspaceHash,
            },
        };
        let initial = await (0, playground_assist_runner_1.playgroundRequestAssist)(auth, requestBody, input.signal);
        if (initial.pendingToolCall && initial.runId && input.mode !== "plan") {
            initial = await (0, playground_assist_runner_1.runPlaygroundToolLoop)({
                auth,
                initial,
                toolExecutor: this.toolExecutor,
                workspaceFingerprint: workspaceHash,
                sessionId: serverHistoryId || initial.sessionId,
                signal: input.signal,
            });
        }
        const playgroundSessionId = typeof initial.sessionId === "string" && initial.sessionId.trim() ? initial.sessionId.trim() : undefined;
        if (input.mode === "plan" && initial.plan) {
            return {
                assistantText: [initial.final || "Plan ready.", "", JSON.stringify(initial.plan, null, 2)]
                    .filter(Boolean)
                    .join("\n"),
                ...(playgroundSessionId ? { playgroundSessionId } : {}),
            };
        }
        return {
            assistantText: String(initial.final || "No response from playground assist."),
            ...(playgroundSessionId ? { playgroundSessionId } : {}),
        };
    }
}
exports.CutiePlaygroundChatBridge = CutiePlaygroundChatBridge;
//# sourceMappingURL=cutie-playground-chat-bridge.js.map
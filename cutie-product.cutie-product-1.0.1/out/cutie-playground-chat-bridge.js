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
const cutie_opencode_client_1 = require("./cutie-opencode-client");
const config_1 = require("./config");
/** Playground API validates historySessionId as UUID; Cutie local session ids are not UUIDs. */
function isPlaygroundHistorySessionUuid(value) {
    const v = String(value || "").trim();
    return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(v);
}
/** Strip OpenHands internal stall protocol lines from user-visible chat. */
function stripPlaygroundStallProtocol(text) {
    let s = String(text || "");
    const cutAt = (marker) => {
        const m = marker.exec(s);
        if (m && m.index !== undefined) {
            s = s.slice(0, m.index).trimEnd();
        }
    };
    cutAt(/\n\nStall reason:/i);
    cutAt(/\nStall reason:/i);
    cutAt(/\n\nNext deterministic action:/i);
    cutAt(/\nNext deterministic action:/i);
    return s;
}
function unescapeJsonStringFragment(value) {
    return value.replace(/\\"/g, '"').replace(/\\\\/g, "\\");
}
/**
 * When the model emits `{"toolCall":...}` as assistant text, the `patch` argument often breaks
 * strict JSON (unescaped quotes/newlines). Extract tool name + path from the opening keys only.
 */
function looseExtractToolCallSummaryForChat(raw) {
    const trimmed = String(raw || "").replace(/^\uFEFF/, "").trimStart();
    if (!trimmed.startsWith("{") || !/"toolCall"/.test(trimmed))
        return null;
    const i = trimmed.indexOf('"toolCall"');
    const head = (i >= 0 ? trimmed.slice(i, i + 6000) : trimmed.slice(0, 6000));
    const nameM = head.match(/"name"\s*:\s*"((?:[^"\\]|\\.)*)"/);
    const pathM = head.match(/"path"\s*:\s*"((?:[^"\\]|\\.)*)"/);
    const name = nameM?.[1] ? unescapeJsonStringFragment(nameM[1]).trim() : "";
    const pathArg = pathM?.[1] ? unescapeJsonStringFragment(pathM[1]).trim() : "";
    if (!name && !pathArg)
        return null;
    return { name: name || "tool", path: pathArg };
}
function formatToolCallSummaryMessage(name, pathArg) {
    return stripPlaygroundStallProtocol([
        `Applied **${name}** locally${pathArg ? ` on \`${pathArg}\`` : ""}.`,
        "",
        "Say what you want adjusted next, or open the file to review.",
    ].join("\n"));
}
/**
 * OpenHands sometimes leaves `final` as raw `{"toolCall":...}`; never paste that into the chat bubble.
 */
function sanitizePlaygroundAssistantChatText(text) {
    const raw = String(text || "").replace(/^\uFEFF/, "").trimStart();
    if (!raw.startsWith("{") || !raw.includes('"toolCall"')) {
        return stripPlaygroundStallProtocol(String(text || ""));
    }
    try {
        const parsed = JSON.parse(raw);
        const tc = parsed?.toolCall;
        if (!tc || typeof tc !== "object") {
            const loose = looseExtractToolCallSummaryForChat(raw);
            return loose ? formatToolCallSummaryMessage(loose.name, loose.path) : stripPlaygroundStallProtocol(String(text || ""));
        }
        const name = typeof tc.name === "string" ? tc.name : "tool";
        const args = tc.arguments && typeof tc.arguments === "object" ? tc.arguments : {};
        const pathArg = typeof args.path === "string" ? args.path : "";
        return formatToolCallSummaryMessage(name, pathArg);
    }
    catch {
        const loose = looseExtractToolCallSummaryForChat(raw);
        if (loose)
            return formatToolCallSummaryMessage(loose.name, loose.path);
        return stripPlaygroundStallProtocol([
            "Cutie received a tool call that could not be parsed for display.",
            "If edits did not apply, try the request again or simplify the change.",
        ].join("\n"));
    }
}
function settlePlaygroundRunIdForChatDiffs(envelopeRunId, mutationCount) {
    if (mutationCount === 0)
        return undefined;
    const trimmed = String(envelopeRunId || "").trim();
    return trimmed || `cutie_pg_${Date.now()}_${Math.random().toString(36).slice(2, 11)}`;
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
        this.openCodeClient = new cutie_opencode_client_1.CutieOpenCodeClient(context);
        this.context.subscriptions.push(this.openCodeClient);
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
    async getOpenHandsStatus(signal) {
        const auth = await this.auth.getRequestAuth();
        if (!auth) {
            return {
                status: "unreachable",
                message: "Sign in to verify OpenHands.",
            };
        }
        const response = await (0, vscode_core_1.requestJson)("GET", `${(0, config_1.getBaseApiUrl)()}/api/v1/playground/openhands/health`, auth, undefined, { signal });
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
    async getOpenCodeStatus(signal) {
        const auth = await this.auth.getRequestAuth().catch(() => null);
        return this.openCodeClient.getStatus({
            signal,
            apiKey: auth?.apiKey || null,
        });
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
        if (input.signal?.aborted) {
            throw new Error("Prompt aborted");
        }
        const auth = await this.auth.getRequestAuth();
        if (!auth) {
            throw new Error("Authenticate before using hosted playground assist.");
        }
        const taskText = String(input.task || "").trim();
        const narrationLines = [];
        const pushNarrationLine = (line) => {
            const t = String(line || "").trim();
            if (!t)
                return;
            narrationLines.push(t);
            input.onPlaygroundProgress?.(narrationLines.join("\n\n"));
        };
        pushNarrationLine("Collecting workspace context for the hosted assistant.");
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
        const modelHint = String((0, config_1.getModelHint)() || "").trim();
        const requestBody = {
            mode: input.mode,
            task: taskText,
            stream: false,
            ...(modelHint ? { model: modelHint } : {}),
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
                maxToolSteps: (0, config_1.getMaxToolStepsForPlayground)(),
                maxWorkspaceMutations: (0, config_1.getMaxWorkspaceMutationsForPlayground)(),
            },
        };
        const fileMutations = [];
        let initial = await (0, playground_assist_runner_1.playgroundRequestAssist)(auth, requestBody, input.signal);
        const playgroundUuidForContinue = serverHistoryId ||
            (typeof initial.sessionId === "string" && initial.sessionId.trim() ? initial.sessionId.trim() : "");
        if (initial.pendingToolCall && initial.runId && input.mode !== "plan") {
            if (!playgroundUuidForContinue) {
                void vscode.window.showWarningMessage("CUTIE: Playground assist returned no session id; OpenHands tool steps may fail. Check API/response or update the extension.");
            }
            pushNarrationLine("The model requested workspace tools; I'll run each step here and report what happened.");
            initial = await (0, playground_assist_runner_1.runPlaygroundToolLoop)({
                auth,
                initial,
                toolExecutor: this.toolExecutor,
                workspaceFingerprint: workspaceHash,
                sessionId: playgroundUuidForContinue || undefined,
                signal: input.signal,
                onDidMutateFile: (payload) => {
                    fileMutations.push({
                        relativePath: payload.relativePath,
                        previousContent: payload.previousContent,
                        nextContent: payload.nextContent,
                        toolName: payload.toolName,
                    });
                },
                onProgressLine: pushNarrationLine,
            });
        }
        else if (input.mode !== "plan") {
            pushNarrationLine("The model answered without asking for more workspace tools.");
        }
        const playgroundSessionId = typeof initial.sessionId === "string" && initial.sessionId.trim() ? initial.sessionId.trim() : undefined;
        const playgroundRunId = settlePlaygroundRunIdForChatDiffs(initial.runId, fileMutations.length);
        if (input.mode === "plan" && initial.plan) {
            return {
                assistantText: [
                    sanitizePlaygroundAssistantChatText(String(initial.final || "Plan ready.")),
                    "",
                    JSON.stringify(initial.plan, null, 2),
                ]
                    .filter(Boolean)
                    .join("\n"),
                ...(playgroundSessionId ? { playgroundSessionId } : {}),
                fileMutations: [],
            };
        }
        return {
            assistantText: sanitizePlaygroundAssistantChatText(String(initial.final || "No response from playground assist.")),
            ...(playgroundSessionId ? { playgroundSessionId } : {}),
            ...(playgroundRunId ? { playgroundRunId } : {}),
            fileMutations,
        };
    }
    async runOpenCodeTurn(input) {
        const auth = await this.auth.getRequestAuth().catch(() => null);
        const result = await this.openCodeClient.runTurn({
            task: input.task,
            history: input.history,
            sessionId: input.sessionId,
            apiKey: auth?.apiKey || null,
            signal: input.signal,
            onProgress: input.onOpenCodeProgress,
        });
        return {
            assistantText: result.assistantText,
            openCodeSessionId: result.sessionId,
        };
    }
}
exports.CutiePlaygroundChatBridge = CutiePlaygroundChatBridge;
//# sourceMappingURL=cutie-playground-chat-bridge.js.map
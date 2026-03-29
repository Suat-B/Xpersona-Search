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
exports.CutieOpenCodeClient = void 0;
const vscode = __importStar(require("vscode"));
const path = __importStar(require("path"));
const child_process_1 = require("child_process");
const config_1 = require("./config");
const cutie_opencode_utils_1 = require("./cutie-opencode-utils");
const SERVER_BOOT_TIMEOUT_MS = 20000;
const SESSION_IDLE_TIMEOUT_MS = 15 * 60 * 1000;
const MAX_ACTIVITY_LINES = 16;
const MAX_LOG_LINES = 80;
function nowMs() {
    return Date.now();
}
function compactWhitespace(value) {
    return String(value || "").replace(/\s+/g, " ").trim();
}
function toJsonBody(value) {
    return JSON.stringify(value);
}
function stripCredentials(serverUrl) {
    try {
        const url = new URL(serverUrl);
        url.username = "";
        url.password = "";
        return url.toString().replace(/\/+$/, "");
    }
    catch {
        return serverUrl;
    }
}
function basicAuthHeader(serverUrl) {
    try {
        const url = new URL(serverUrl);
        if (!url.username && !url.password)
            return {};
        const token = Buffer.from(`${decodeURIComponent(url.username)}:${decodeURIComponent(url.password)}`, "utf8").toString("base64");
        return {
            Authorization: `Basic ${token}`,
        };
    }
    catch {
        return {};
    }
}
function buildPromptWithEditorContext(input) {
    const task = String(input.task || "").trim();
    const activeEditor = vscode.window.activeTextEditor;
    const openEditors = vscode.window.visibleTextEditors.slice(0, 6);
    const diagnostics = vscode.languages.getDiagnostics().slice(0, 24);
    const historyLines = input.history
        .slice(-6)
        .map((entry) => `${String(entry.role || "user").toUpperCase()}: ${String(entry.content || "").slice(0, 1200)}`)
        .join("\n");
    const activeFileSection = (() => {
        if (!activeEditor)
            return "Active editor: none.";
        const fileName = vscode.workspace.asRelativePath(activeEditor.document.uri, false);
        const selection = activeEditor.selection.isEmpty
            ? ""
            : activeEditor.document.getText(activeEditor.selection).slice(0, 2500);
        const excerpt = selection || activeEditor.document.getText().slice(0, 2500);
        return [
            `Active editor: ${fileName}`,
            excerpt ? `Active excerpt:\n${excerpt}` : "",
        ]
            .filter(Boolean)
            .join("\n");
    })();
    const openFilesSection = openEditors.length
        ? [
            "Visible tabs:",
            ...openEditors.map((editor) => `- ${vscode.workspace.asRelativePath(editor.document.uri, false)}`),
        ].join("\n")
        : "Visible tabs: none.";
    const diagnosticsSection = diagnostics.length
        ? [
            "Diagnostics:",
            ...diagnostics.map(([uri, items]) => {
                const first = items[0];
                if (!first)
                    return `- ${vscode.workspace.asRelativePath(uri, false)}`;
                return `- ${vscode.workspace.asRelativePath(uri, false)}:${first.range.start.line + 1} ${compactWhitespace(first.message)}`;
            }),
        ].join("\n")
        : "Diagnostics: none.";
    const historySection = historyLines ? `Recent Cutie chat history:\n${historyLines}` : "Recent Cutie chat history: none.";
    return [
        "You are replying inside the Cutie VS Code extension.",
        "Use the current editor context as a starting point, but inspect the repository yourself before making code changes.",
        activeFileSection,
        openFilesSection,
        diagnosticsSection,
        historySection,
        "User request:",
        task,
    ].join("\n\n");
}
function summarizeToolEvent(part) {
    const tool = compactWhitespace(part.tool);
    const state = part.state && typeof part.state === "object" ? part.state : null;
    const status = compactWhitespace(state?.status);
    const title = compactWhitespace(state?.title || tool);
    if (!tool || !status)
        return null;
    if (status === "running") {
        return `OpenCode is running ${title}.`;
    }
    if (status === "completed") {
        return `OpenCode finished ${title}.`;
    }
    if (status === "error") {
        return `OpenCode hit an error in ${title}: ${(0, cutie_opencode_utils_1.truncateOpenCodeNarration)(String(state?.error || "unknown error"), 160)}.`;
    }
    return `OpenCode prepared ${tool}.`;
}
function renderNarration(state) {
    const lines = state.activityLines.slice(-MAX_ACTIVITY_LINES);
    const assistantText = [...state.assistantParts.values()].join("").trim();
    return [...lines, assistantText].filter(Boolean).join("\n\n").trim();
}
async function readJsonResponse(response) {
    return (await response.json());
}
class CutieOpenCodeClient {
    constructor(context) {
        this.context = context;
        this.sidecar = null;
        this.sidecarStarting = null;
        this.recentLogs = [];
    }
    dispose() {
        if (this.sidecar && !this.sidecar.killed) {
            this.sidecar.kill();
        }
        this.sidecar = null;
    }
    async getStatus(input) {
        const serverUrl = (0, cutie_opencode_utils_1.normalizeOpenCodeServerUrl)((0, config_1.getOpenCodeServerUrl)());
        const signal = input?.signal;
        if (await this.isHealthy(serverUrl, signal)) {
            if (input?.apiKey) {
                await this.syncProviderAuth(serverUrl, input.apiKey, signal).catch(() => undefined);
            }
            return {
                status: "healthy",
                message: "OpenCode connected. Cutie is ready.",
            };
        }
        const workspaceRoot = (0, config_1.getWorkspaceRootPath)();
        if (!workspaceRoot) {
            return {
                status: "missing_config",
                message: "OpenCode needs an open workspace folder.",
            };
        }
        if ((input?.autoStart ?? (0, config_1.getOpenCodeAutoStart)()) && (0, cutie_opencode_utils_1.isLocalOpenCodeServerUrl)(serverUrl)) {
            try {
                await this.ensureServerReady({ serverUrl, apiKey: input?.apiKey || null, signal });
                return {
                    status: "healthy",
                    message: "OpenCode sidecar started successfully.",
                };
            }
            catch (error) {
                return {
                    status: "unreachable",
                    message: error instanceof Error ? error.message : String(error),
                    details: this.recentLogs.slice(-12).join("\n"),
                };
            }
        }
        return {
            status: "unreachable",
            message: `OpenCode is unavailable at ${stripCredentials(serverUrl)}.`,
            details: "Install OpenCode and run `opencode serve`, or enable cutie-product.opencode.autoStart for local sidecar startup.",
        };
    }
    async runTurn(input) {
        const serverUrl = (0, cutie_opencode_utils_1.normalizeOpenCodeServerUrl)((0, config_1.getOpenCodeServerUrl)());
        await this.ensureServerReady({
            serverUrl,
            apiKey: input.apiKey || null,
            signal: input.signal,
        });
        const sessionId = String(input.sessionId || "").trim() || (await this.createSession(serverUrl, input.signal));
        const prompt = buildPromptWithEditorContext({
            task: input.task,
            history: input.history,
        });
        const eventState = await this.streamSessionUntilIdle({
            serverUrl,
            sessionId,
            signal: input.signal,
            onProgress: input.onProgress,
            sendPrompt: async () => {
                await this.postNoContent(`${serverUrl}/session/${encodeURIComponent(sessionId)}/prompt_async`, {
                    parts: [{ type: "text", text: prompt }],
                    model: (0, cutie_opencode_utils_1.buildOpenCodeModelRef)((0, config_1.getOpenCodeModel)()),
                }, input.signal);
            },
        });
        const assistantText = (await this.fetchLatestAssistantText(serverUrl, sessionId, input.signal)) ||
            [...eventState.assistantParts.values()].join("").trim() ||
            "OpenCode completed the run without a visible assistant reply.";
        return {
            assistantText,
            sessionId,
        };
    }
    async ensureServerReady(input) {
        if (await this.isHealthy(input.serverUrl, input.signal)) {
            if (input.apiKey) {
                await this.syncProviderAuth(input.serverUrl, input.apiKey, input.signal).catch(() => undefined);
            }
            return;
        }
        if (!(0, config_1.getOpenCodeAutoStart)()) {
            throw new Error(`OpenCode is unavailable at ${stripCredentials(input.serverUrl)}. Enable cutie-product.opencode.autoStart or start \`opencode serve\` manually.`);
        }
        if (!(0, cutie_opencode_utils_1.isLocalOpenCodeServerUrl)(input.serverUrl)) {
            throw new Error(`OpenCode auto-start only supports local URLs. Current server is ${stripCredentials(input.serverUrl)}.`);
        }
        if (!this.sidecarStarting) {
            this.sidecarStarting = this.startSidecar(input.serverUrl, input.apiKey || null, input.signal).finally(() => {
                this.sidecarStarting = null;
            });
        }
        await this.sidecarStarting;
        if (!(await this.isHealthy(input.serverUrl, input.signal))) {
            throw new Error(`OpenCode sidecar did not become healthy at ${stripCredentials(input.serverUrl)}. ${this.recentLogs.slice(-8).join(" ")}`);
        }
        if (input.apiKey) {
            await this.syncProviderAuth(input.serverUrl, input.apiKey, input.signal).catch(() => undefined);
        }
    }
    async startSidecar(serverUrl, apiKey, signal) {
        const workspaceRoot = (0, config_1.getWorkspaceRootPath)();
        if (!workspaceRoot) {
            throw new Error("OpenCode needs an open workspace root before Cutie can launch the sidecar.");
        }
        const configPath = await this.ensureProjectConfig();
        const { hostname, port } = (0, cutie_opencode_utils_1.parseOpenCodeServerAddress)(serverUrl);
        const env = {
            ...process.env,
            OPENCODE_CONFIG: configPath,
            CUTIE_OPENCODE_API_KEY: apiKey || process.env.CUTIE_OPENCODE_API_KEY || "",
            OPENAI_API_KEY: process.env.OPENAI_API_KEY || apiKey || "",
        };
        const child = (0, child_process_1.spawn)("opencode", ["serve", "--hostname", hostname, "--port", String(port)], {
            cwd: workspaceRoot,
            env,
            shell: process.platform === "win32",
            stdio: ["ignore", "pipe", "pipe"],
        });
        this.sidecar = child;
        this.recentLogs = [];
        const appendLog = (chunk) => {
            const text = Buffer.isBuffer(chunk) ? chunk.toString("utf8") : String(chunk || "");
            for (const line of text.split(/\r?\n/)) {
                const trimmed = line.trim();
                if (!trimmed)
                    continue;
                this.recentLogs.push(trimmed);
            }
            if (this.recentLogs.length > MAX_LOG_LINES) {
                this.recentLogs = this.recentLogs.slice(-MAX_LOG_LINES);
            }
        };
        child.stdout?.on("data", appendLog);
        child.stderr?.on("data", appendLog);
        const childError = new Promise((_, reject) => {
            child.once("error", (error) => reject(error));
            child.once("exit", (code) => {
                if (code === 0) {
                    reject(new Error("OpenCode exited before the server became ready."));
                    return;
                }
                reject(new Error(`OpenCode exited with code ${String(code)} before the server became ready.`));
            });
        });
        const bootReady = (async () => {
            const startedAt = nowMs();
            while (nowMs() - startedAt < SERVER_BOOT_TIMEOUT_MS) {
                if (signal?.aborted) {
                    throw new Error("OpenCode startup aborted.");
                }
                if (await this.isHealthy(serverUrl, signal)) {
                    return;
                }
                await new Promise((resolve) => setTimeout(resolve, 500));
            }
            throw new Error(`Timed out waiting for OpenCode at ${stripCredentials(serverUrl)}. ${this.recentLogs.slice(-6).join(" ")} Switch cutie-product.binary.runtime to cutie or playgroundApi if you want the hosted OpenHands path instead of a local OpenCode sidecar.`);
        })();
        await Promise.race([bootReady, childError]);
    }
    async ensureProjectConfig() {
        const workspaceRoot = (0, config_1.getWorkspaceRootPath)();
        if (!workspaceRoot) {
            throw new Error("OpenCode config generation requires an open workspace.");
        }
        const configured = (0, config_1.getOpenCodeConfigPath)();
        const absolutePath = path.isAbsolute(configured) ? configured : path.join(workspaceRoot, configured);
        const dir = path.dirname(absolutePath);
        await vscode.workspace.fs.createDirectory(vscode.Uri.file(dir));
        try {
            await vscode.workspace.fs.stat(vscode.Uri.file(absolutePath));
            return absolutePath;
        }
        catch {
            const config = (0, cutie_opencode_utils_1.buildOpenCodeConfigTemplate)({
                serverUrl: (0, config_1.getOpenCodeServerUrl)(),
                model: (0, config_1.getOpenCodeModel)(),
                openAiBaseUrl: (0, config_1.getQwenOpenAiBaseUrl)(),
            });
            const payload = Buffer.from(`${JSON.stringify(config, null, 2)}\n`, "utf8");
            await vscode.workspace.fs.writeFile(vscode.Uri.file(absolutePath), payload);
            return absolutePath;
        }
    }
    async createSession(serverUrl, signal) {
        const response = await this.postJson(`${serverUrl}/session`, {
            title: `Cutie ${new Date().toISOString()}`,
        }, signal);
        const id = String(response?.id || "").trim();
        if (!id) {
            throw new Error("OpenCode created a session without returning an id.");
        }
        return id;
    }
    async fetchLatestAssistantText(serverUrl, sessionId, signal) {
        const response = await this.getJson(`${serverUrl}/session/${encodeURIComponent(sessionId)}/message?limit=20`, signal);
        const rows = Array.isArray(response) ? response : [];
        for (let index = rows.length - 1; index >= 0; index -= 1) {
            const row = rows[index];
            const info = row?.info && typeof row.info === "object" ? row.info : {};
            if (info.role !== "assistant")
                continue;
            const text = (0, cutie_opencode_utils_1.extractAssistantTextFromOpenCodeParts)(row.parts);
            if (text)
                return text;
        }
        return "";
    }
    async streamSessionUntilIdle(input) {
        const controller = new AbortController();
        const abort = () => controller.abort();
        input.signal.addEventListener("abort", abort, { once: true });
        const state = {
            idle: false,
            assistantMessageId: null,
            assistantParts: new Map(),
            activityLines: ["Connecting to the OpenCode sidecar."],
            lastError: null,
        };
        const publish = () => {
            input.onProgress?.(renderNarration(state));
        };
        const addActivity = (line) => {
            const trimmed = compactWhitespace(line);
            if (!trimmed)
                return;
            if (state.activityLines[state.activityLines.length - 1] === trimmed)
                return;
            state.activityLines.push(trimmed);
            if (state.activityLines.length > MAX_ACTIVITY_LINES) {
                state.activityLines = state.activityLines.slice(-MAX_ACTIVITY_LINES);
            }
            publish();
        };
        publish();
        try {
            const response = await this.rawFetch(`${input.serverUrl}/event`, {
                method: "GET",
                signal: controller.signal,
            });
            if (!response.ok || !response.body) {
                throw new Error(`OpenCode event stream failed: HTTP ${response.status}`);
            }
            const reader = response.body.getReader();
            const decoder = new TextDecoder();
            let buffer = "";
            let promptSent = false;
            const deadline = nowMs() + SESSION_IDLE_TIMEOUT_MS;
            while (true) {
                if (!promptSent) {
                    await input.sendPrompt();
                    promptSent = true;
                    addActivity("OpenCode accepted the coding task.");
                }
                if (nowMs() > deadline) {
                    throw new Error("OpenCode took too long to finish the session.");
                }
                const { done, value } = await reader.read();
                if (done)
                    break;
                buffer += decoder.decode(value, { stream: true });
                const frames = buffer.split(/\r?\n\r?\n/);
                buffer = frames.pop() || "";
                for (const frame of frames) {
                    const dataLines = frame
                        .split(/\r?\n/)
                        .filter((line) => line.startsWith("data:"))
                        .map((line) => line.slice(5).trim());
                    if (!dataLines.length)
                        continue;
                    const joined = dataLines.join("\n");
                    let parsed = null;
                    try {
                        parsed = JSON.parse(joined);
                    }
                    catch {
                        continue;
                    }
                    const payload = parsed?.payload;
                    const type = String(payload?.type || "").trim();
                    const properties = payload?.properties && typeof payload.properties === "object" ? payload.properties : {};
                    if (type === "session.idle" && properties.sessionID === input.sessionId) {
                        state.idle = true;
                        addActivity("OpenCode finished the session.");
                        controller.abort();
                        break;
                    }
                    if (type === "session.error" && (!properties.sessionID || properties.sessionID === input.sessionId)) {
                        const errorBlob = properties.error && typeof properties.error === "object"
                            ? properties.error
                            : {};
                        state.lastError = compactWhitespace(errorBlob.data && typeof errorBlob.data === "object"
                            ? errorBlob.data.message
                            : errorBlob.message || "OpenCode reported a session error.");
                        controller.abort();
                        break;
                    }
                    if (type === "session.status" && properties.sessionID === input.sessionId) {
                        const status = properties.status && typeof properties.status === "object"
                            ? properties.status.type
                            : null;
                        if (status === "busy")
                            addActivity("OpenCode is inspecting the repo and planning the next step.");
                        continue;
                    }
                    if (type === "file.edited") {
                        const file = compactWhitespace(properties.file);
                        if (file)
                            addActivity(`OpenCode edited ${file}.`);
                        continue;
                    }
                    if (type === "message.updated") {
                        const info = properties.info && typeof properties.info === "object" ? properties.info : {};
                        if (info.sessionID === input.sessionId && info.role === "assistant") {
                            state.assistantMessageId = String(info.id || "").trim() || state.assistantMessageId;
                        }
                        continue;
                    }
                    if (type === "message.part.updated") {
                        const part = properties.part && typeof properties.part === "object" ? properties.part : {};
                        if (part.sessionID !== input.sessionId)
                            continue;
                        if (state.assistantMessageId && part.messageID !== state.assistantMessageId)
                            continue;
                        const partType = String(part.type || "").trim();
                        if (partType === "text") {
                            state.assistantMessageId = String(part.messageID || "").trim() || state.assistantMessageId;
                            state.assistantParts.set(String(part.id || `part_${state.assistantParts.size}`), String(part.text || ""));
                            publish();
                            continue;
                        }
                        if (partType === "tool") {
                            const summary = summarizeToolEvent(part);
                            if (summary)
                                addActivity(summary);
                            continue;
                        }
                        if (partType === "patch") {
                            const files = Array.isArray(part.files) ? part.files.map((item) => String(item || "").trim()).filter(Boolean) : [];
                            if (files.length)
                                addActivity(`OpenCode prepared patches for ${files.slice(0, 3).join(", ")}.`);
                            continue;
                        }
                    }
                }
            }
            if (state.lastError) {
                throw new Error(state.lastError);
            }
            return state;
        }
        catch (error) {
            if (state.idle)
                return state;
            if (state.lastError)
                throw new Error(state.lastError);
            if (input.signal.aborted)
                throw new Error("Prompt aborted");
            throw error instanceof Error ? error : new Error(String(error));
        }
        finally {
            input.signal.removeEventListener("abort", abort);
        }
    }
    async syncProviderAuth(serverUrl, apiKey, signal) {
        const trimmed = String(apiKey || "").trim();
        if (!trimmed)
            return;
        await this.rawFetch(`${serverUrl}/auth/${encodeURIComponent(cutie_opencode_utils_1.CUTIE_OPENCODE_PROVIDER_ID)}`, {
            method: "PUT",
            headers: {
                "Content-Type": "application/json",
            },
            body: toJsonBody({ apiKey: trimmed }),
            signal,
        }).catch(() => undefined);
    }
    async isHealthy(serverUrl, signal) {
        try {
            const response = await this.rawFetch(`${serverUrl}/global/health`, {
                method: "GET",
                signal,
            });
            if (!response.ok)
                return false;
            const json = await readJsonResponse(response);
            return json?.healthy === true;
        }
        catch {
            return false;
        }
    }
    async getJson(url, signal) {
        const response = await this.rawFetch(url, {
            method: "GET",
            signal,
        });
        if (!response.ok) {
            throw new Error(`OpenCode request failed: HTTP ${response.status}`);
        }
        return readJsonResponse(response);
    }
    async postJson(url, body, signal) {
        const response = await this.rawFetch(url, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
            },
            body: toJsonBody(body),
            signal,
        });
        if (!response.ok) {
            const text = await response.text().catch(() => "");
            throw new Error(`OpenCode request failed: HTTP ${response.status} ${(0, cutie_opencode_utils_1.truncateOpenCodeNarration)(text, 180)}`);
        }
        return readJsonResponse(response);
    }
    async postNoContent(url, body, signal) {
        const response = await this.rawFetch(url, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
            },
            body: toJsonBody(body),
            signal,
        });
        if (!response.ok) {
            const text = await response.text().catch(() => "");
            throw new Error(`OpenCode request failed: HTTP ${response.status} ${(0, cutie_opencode_utils_1.truncateOpenCodeNarration)(text, 180)}`);
        }
    }
    async rawFetch(url, init) {
        const fetchFn = globalThis.fetch;
        if (!fetchFn) {
            throw new Error("Fetch is not available in this VS Code host.");
        }
        const headers = {
            ...basicAuthHeader(url),
            ...(init.headers || {}),
        };
        return fetchFn(url, {
            ...init,
            headers,
        });
    }
}
exports.CutieOpenCodeClient = CutieOpenCodeClient;
//# sourceMappingURL=cutie-opencode-client.js.map
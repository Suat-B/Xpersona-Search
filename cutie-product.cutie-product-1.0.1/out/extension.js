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
const config_1 = require("./config");
const cutie_desktop_adapter_1 = require("./cutie-desktop-adapter");
const cutie_model_client_1 = require("./cutie-model-client");
const cutie_runtime_1 = require("./cutie-runtime");
const cutie_session_store_1 = require("./cutie-session-store");
const cutie_tool_registry_1 = require("./cutie-tool-registry");
const cutie_workspace_adapter_1 = require("./cutie-workspace-adapter");
const webview_html_1 = require("./webview-html");
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
        this.activeRun = null;
        this.currentAbortController = null;
        this.streamingAssistantText = "";
        this.desktopState = buildDefaultDesktopState();
        this.authState = {
            kind: "none",
            label: "Not signed in",
        };
        this.desktop = new cutie_desktop_adapter_1.CutieDesktopAdapter();
        this.modelClient = new cutie_model_client_1.CutieModelClient();
        this.sessionStore = new cutie_session_store_1.CutieSessionStore(context);
        this.toolRegistry = new cutie_tool_registry_1.CutieToolRegistry(new cutie_workspace_adapter_1.CutieWorkspaceAdapter(), this.desktop);
        this.runtime = new cutie_runtime_1.CutieRuntime(this.sessionStore, this.modelClient, this.toolRegistry, async () => this.gatherContext());
        this.auth.onDidChange(() => {
            void this.refreshAuthState().finally(() => {
                void this.emitState();
            });
        });
    }
    resolveWebviewView(webviewView) {
        this.view = webviewView;
        webviewView.webview.options = { enableScripts: true };
        webviewView.webview.html = (0, webview_html_1.buildWebviewHtml)(webviewView.webview);
        webviewView.webview.onDidReceiveMessage((message) => {
            void this.handleMessage(message);
        });
        void this.initializeView();
    }
    async show() {
        await vscode.commands.executeCommand(`${config_1.VIEW_ID}.focus`);
    }
    async newChat() {
        this.currentAbortController?.abort();
        this.currentAbortController = null;
        this.activeSessionId = null;
        this.activeSession = null;
        this.activeRun = null;
        this.streamingAssistantText = "";
        this.status = "Ready for a new Cutie run.";
        await this.emitState();
        await this.refreshDesktopState();
        await this.emitState();
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
            await this.emitState();
            return;
        }
        this.status = "Stopping the active Cutie run...";
        this.currentAbortController.abort();
        await this.emitState();
    }
    async initializeView() {
        await this.emitState();
        void this.refreshViewState();
    }
    async handleMessage(message) {
        if (message.type === "ready") {
            await this.emitState();
            void this.refreshViewState();
            return;
        }
        if (message.type === "newChat")
            return this.newChat();
        if (message.type === "selectSession")
            return this.loadSession(message.sessionId);
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
    }
    async requireAuth() {
        const auth = await this.auth.getRequestAuth();
        if (!auth) {
            void vscode.window.showWarningMessage("Sign in to Xpersona or set an API key before running Cutie.");
            return null;
        }
        return auth;
    }
    async loadSession(sessionId) {
        const session = this.sessionStore.getSession((0, config_1.getWorkspaceHash)(), sessionId);
        if (!session) {
            this.status = "That local Cutie session is no longer available.";
            this.activeSession = null;
            this.activeSessionId = null;
            await this.emitState();
            return;
        }
        this.activeSession = session;
        this.activeSessionId = session.id;
        this.activeRun = this.sessionStore.getLatestRun(session);
        this.streamingAssistantText = "";
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
        const activeEditor = vscode.window.activeTextEditor;
        const activeFile = activeEditor
            ? {
                path: (0, config_1.toWorkspaceRelativePath)(activeEditor.document.uri) || undefined,
                language: activeEditor.document.languageId,
                ...(activeEditor.selection.isEmpty
                    ? { content: activeEditor.document.getText().slice(0, 16000) }
                    : { selection: activeEditor.document.getText(activeEditor.selection).slice(0, 12000) }),
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
                excerpt: editor.document.getText().slice(0, 4000),
            };
        })
            .filter((value) => Boolean(value))
            .slice(0, 6);
        const diagnostics = vscode.languages
            .getDiagnostics()
            .flatMap(([uri, entries]) => entries.map((entry) => ({
            file: (0, config_1.toWorkspaceRelativePath)(uri) || undefined,
            severity: entry.severity,
            message: entry.message,
            line: entry.range.start.line + 1,
        })))
            .slice(0, 80);
        const desktop = await this.desktop.getDesktopContext().catch(() => this.desktopState);
        this.desktopState = desktop;
        return {
            workspaceHash: (0, config_1.getWorkspaceHash)(),
            workspaceRootPath: (0, config_1.getWorkspaceRootPath)(),
            extensionVersion: (0, config_1.getExtensionVersion)(this.context),
            ...(activeFile ? { activeFile } : {}),
            ...(openFiles.length ? { openFiles } : {}),
            ...(diagnostics.length ? { diagnostics } : {}),
            desktop,
            latestSnapshot: this.activeSession?.snapshots?.[0] || null,
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
                let workspaceFiles = [];
                try {
                    workspaceFiles = await vscode.workspace.findFiles("**/*", undefined, 700);
                }
                catch {
                    workspaceFiles = [];
                }
                for (const uri of workspaceFiles) {
                    const relativePath = (0, config_1.toWorkspaceRelativePath)(uri);
                    if (!relativePath)
                        continue;
                    pushFile(relativePath);
                }
            }
        }
        const fileItems = Array.from(rankedFiles.values())
            .sort((a, b) => b.score - a.score || a.path.localeCompare(b.path))
            .slice(0, 6)
            .map((item) => ({
            kind: "file",
            label: item.path,
            insertText: `@${item.path}`,
            ...(item.detail ? { detail: item.detail } : {}),
        }));
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
            insertText: `@window:${item.label}`,
            ...(item.detail ? { detail: item.detail } : {}),
        }));
        return [...fileItems, ...windowItems];
    }
    async runPrompt(prompt, mentions = []) {
        const auth = await this.requireAuth();
        if (!auth)
            return;
        const trimmedPrompt = String(prompt || "").trim();
        if (!trimmedPrompt)
            return;
        const session = await this.ensureSession(trimmedPrompt);
        this.currentAbortController?.abort();
        this.currentAbortController = new AbortController();
        this.streamingAssistantText = "";
        this.status = "Starting local Cutie runtime...";
        await this.emitState();
        try {
            const result = await this.runtime.runPrompt({
                auth,
                session,
                prompt: trimmedPrompt,
                mentions,
                signal: this.currentAbortController.signal,
                callbacks: {
                    onSessionChanged: async (nextSession) => {
                        this.activeSession = nextSession;
                        this.activeSessionId = nextSession.id;
                        this.activeRun = this.sessionStore.getLatestRun(nextSession);
                        await this.refreshDesktopState();
                        await this.emitState();
                    },
                    onStatusChanged: async (status, run) => {
                        this.status = status;
                        this.activeRun = run;
                        if (!run || run.status !== "running") {
                            this.streamingAssistantText = "";
                        }
                        await this.refreshDesktopState();
                        await this.emitState();
                    },
                    onAssistantDelta: async (_delta, accumulated) => {
                        this.streamingAssistantText = accumulated;
                        await this.emitState();
                    },
                },
            });
            this.activeSession = result.session;
            this.activeSessionId = result.session.id;
            this.activeRun = result.run;
            this.streamingAssistantText = "";
            this.status =
                result.run.status === "completed"
                    ? "Cutie completed the run."
                    : result.run.status === "canceled"
                        ? "Cutie run cancelled."
                        : result.run.error
                            ? `Cutie stopped: ${result.run.error}`
                            : "Cutie stopped early.";
        }
        catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            this.status = `Cutie failed: ${message}`;
            void vscode.window.showErrorMessage(this.status);
        }
        finally {
            this.currentAbortController = null;
            await this.refreshDesktopState();
            await this.emitState();
        }
    }
    getVisibleMessages() {
        const messages = this.activeSession?.messages || [];
        if (!this.streamingAssistantText.trim())
            return messages;
        return [
            ...messages,
            {
                id: "__streaming__",
                role: "assistant",
                content: this.streamingAssistantText,
                createdAt: new Date().toISOString(),
                ...(this.activeRun ? { runId: this.activeRun.id } : {}),
            },
        ];
    }
    async refreshDesktopState() {
        this.desktopState = await this.desktop.getDesktopContext().catch(() => this.desktopState || buildDefaultDesktopState());
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
            status: this.status,
            running: this.activeRun?.status === "running",
            activeRun: this.activeRun,
            desktop: this.desktopState,
        };
        this.view.webview.postMessage({ type: "state", state });
    }
}
function activate(context) {
    const auth = new auth_1.CutieAuthManager(context);
    const provider = new CutieSidebarProvider(context, auth);
    context.subscriptions.push(vscode.window.registerWebviewViewProvider(config_1.VIEW_ID, provider), vscode.window.registerUriHandler(auth), vscode.commands.registerCommand("cutie-product.startChat", async () => provider.show()), vscode.commands.registerCommand("cutie-product.captureScreen", async () => provider.captureScreen()), vscode.commands.registerCommand("cutie-product.setApiKey", async () => auth.setApiKeyInteractive()), vscode.commands.registerCommand("cutie-product.signIn", async () => auth.signInWithBrowser()), vscode.commands.registerCommand("cutie-product.signOut", async () => {
        await auth.signOut();
        await provider.newChat();
    }), vscode.commands.registerCommand("cutie-product.stopAutomation", async () => provider.stopAutomation()));
}
function deactivate() { }
//# sourceMappingURL=extension.js.map
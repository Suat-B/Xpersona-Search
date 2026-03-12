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
const config_1 = require("./config");
const api_client_1 = require("./api-client");
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
    constructor(context, auth, historyService, contextCollector, actionRunner, indexManager) {
        this.context = context;
        this.auth = auth;
        this.historyService = historyService;
        this.contextCollector = contextCollector;
        this.actionRunner = actionRunner;
        this.indexManager = indexManager;
        this.sessionId = null;
        this.state = {
            mode: (this.context.workspaceState.get(config_1.MODE_KEY) || "auto"),
            auth: { kind: "none", label: "Not signed in" },
            history: [],
            messages: [],
            contextPreview: {
                openFiles: [],
                selectedFiles: [],
                diagnostics: [],
                snippets: [],
            },
            index: this.indexManager.getState(),
            activity: [],
            busy: false,
            canUndo: this.actionRunner.canUndo(),
        };
        this.auth.onDidChange(() => void this.refreshAuth());
        this.indexManager.onDidChangeState((index) => {
            this.state.index = index;
            this.postState();
        });
        this.actionRunner.onDidChangeUndo((canUndo) => {
            this.state.canUndo = canUndo;
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
    async setMode(mode) {
        this.state.mode = mode;
        await this.context.workspaceState.update(config_1.MODE_KEY, mode);
        this.postState();
    }
    async refreshHistory() {
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
        this.state.contextPreview = {
            openFiles: [],
            selectedFiles: [],
            diagnostics: [],
            snippets: [],
        };
        this.state.activity = [];
        this.postState();
    }
    async bootstrap() {
        await this.refreshAuth();
        await this.refreshHistory();
        this.postState();
    }
    async refreshAuth() {
        this.state.auth = await this.auth.getAuthState().catch(() => ({
            kind: "none",
            label: "Not signed in",
        }));
        this.postState();
    }
    async openSession(sessionId) {
        const auth = await this.auth.getRequestAuth();
        if (!auth || !sessionId)
            return;
        this.sessionId = sessionId;
        this.state.messages = await this.historyService.loadMessages(auth, sessionId).catch(() => []);
        this.pushActivity(`Opened session ${sessionId.slice(0, 8)}.`);
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
                await this.refreshHistory();
                return;
            case "signIn":
                await this.auth.signInWithBrowser();
                return;
            case "signOut":
                await this.auth.signOut();
                await this.newChat();
                return;
            case "loadHistory":
                await this.refreshHistory();
                return;
            case "openSession":
                await this.openSession(String(message.id || ""));
                return;
            case "rebuildIndex":
                this.pushActivity("Rebuilding workspace index...");
                this.postState();
                await this.indexManager.rebuild("manual");
                return;
            case "undoLastChanges": {
                const summary = await this.actionRunner.undoLastBatch();
                this.pushActivity(summary);
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
        const auth = await this.auth.getRequestAuth();
        if (!auth) {
            this.pushActivity("Authenticate with browser sign-in or an API key before sending prompts.");
            this.postState();
            return;
        }
        this.state.busy = true;
        this.appendMessage("user", text);
        this.pushActivity("Collecting IDE context...");
        this.postState();
        try {
            const { context, retrievalHints, preview } = await this.contextCollector.collect(text, this.actionRunner.getRecentTouchedPaths());
            this.state.contextPreview = preview;
            this.pushActivity("Sending assist request...");
            this.postState();
            let streamedPlan = null;
            let streamedActions = [];
            let finalText = "";
            await (0, api_client_1.streamJsonEvents)("POST", `${(0, config_1.getBaseApiUrl)()}/api/v1/playground/assist`, auth, {
                mode: this.state.mode,
                task: text,
                stream: true,
                ...(this.sessionId ? { historySessionId: this.sessionId } : {}),
                context,
                retrievalHints,
                clientTrace: {
                    extensionVersion: String(vscode.extensions.getExtension("playgroundai.xpersona-playground")?.packageJSON?.version || "0.0.0"),
                    workspaceHash: (0, config_1.getWorkspaceHash)(),
                },
            }, async (event, data) => {
                if (event === "status") {
                    this.pushActivity(String(data || ""));
                    this.postState();
                    return;
                }
                if (event === "plan") {
                    streamedPlan = data;
                    this.pushActivity("Plan received.");
                    this.postState();
                    return;
                }
                if (event === "actions") {
                    streamedActions = Array.isArray(data) ? data : [];
                    if (streamedActions.length) {
                        this.pushActivity(`Prepared ${streamedActions.length} action${streamedActions.length === 1 ? "" : "s"}.`);
                        this.postState();
                    }
                    return;
                }
                if (event === "meta" && data && typeof data === "object") {
                    const meta = data;
                    if (meta.sessionId)
                        this.sessionId = meta.sessionId;
                    if (meta.contextSelection?.files?.length) {
                        this.state.contextPreview.selectedFiles = meta.contextSelection.files.map((item) => `${item.path} (${item.reason})`);
                    }
                    if (meta.completionStatus === "incomplete" && meta.missingRequirements?.length) {
                        this.pushActivity(`Missing: ${meta.missingRequirements.join(", ")}`);
                    }
                    this.postState();
                    return;
                }
                if (event === "final") {
                    finalText = String(data || "").trim();
                }
            });
            const assistantBody = this.state.mode === "plan" && streamedPlan
                ? [finalText || "Plan ready.", "", formatPlan(streamedPlan)].filter(Boolean).join("\n")
                : finalText || "No final response text was returned.";
            this.appendMessage("assistant", assistantBody);
            if (this.state.mode !== "plan" && streamedActions.length > 0) {
                this.pushActivity("Applying local changes...");
                this.postState();
                const applyReport = await this.actionRunner.apply({
                    mode: this.state.mode,
                    actions: streamedActions,
                    auth,
                    sessionId: this.sessionId || undefined,
                    workspaceFingerprint: (0, config_1.getWorkspaceHash)(),
                });
                this.state.canUndo = applyReport.canUndo;
                this.pushActivity(applyReport.summary);
                for (const detail of applyReport.details.slice(-12)) {
                    this.pushActivity(detail);
                }
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
    appendMessage(role, content) {
        this.state.messages = [...this.state.messages, { id: (0, crypto_1.randomUUID)(), role, content }];
    }
    pushActivity(text) {
        const next = String(text || "").trim();
        if (!next)
            return;
        this.state.activity = [...this.state.activity, next].slice(-30);
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
        return `<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta
      http-equiv="Content-Security-Policy"
      content="default-src 'none'; img-src ${webview.cspSource} data:; style-src 'unsafe-inline' ${webview.cspSource}; script-src 'nonce-${nonce}' ${webview.cspSource};"
    />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Playground</title>
    <style>
      :root {
        color-scheme: light dark;
        --bg: linear-gradient(180deg, rgba(93, 140, 255, 0.1), rgba(255, 170, 111, 0.06));
        --panel: color-mix(in srgb, var(--vscode-editor-background) 92%, #20304d 8%);
        --panel-strong: color-mix(in srgb, var(--vscode-sideBar-background) 88%, #1a2435 12%);
        --border: color-mix(in srgb, var(--vscode-editor-foreground) 18%, transparent);
        --accent: #f58b54;
        --accent-soft: rgba(245, 139, 84, 0.15);
        --muted: var(--vscode-descriptionForeground);
        --text: var(--vscode-editor-foreground);
      }
      * { box-sizing: border-box; }
      body {
        margin: 0;
        font-family: Georgia, "Segoe UI", serif;
        color: var(--text);
        background: var(--bg), var(--vscode-editor-background);
      }
      button, textarea { font: inherit; }
      .shell { display: grid; grid-template-columns: 280px minmax(0, 1fr); height: 100vh; }
      .sidebar, .main { min-height: 0; }
      .sidebar {
        display: flex;
        flex-direction: column;
        gap: 12px;
        padding: 14px;
        border-right: 1px solid var(--border);
        background: var(--panel-strong);
      }
      .main { display: grid; grid-template-rows: auto minmax(0, 1fr) auto; min-width: 0; }
      .topbar {
        display: flex;
        flex-wrap: wrap;
        align-items: center;
        gap: 8px;
        padding: 14px;
        border-bottom: 1px solid var(--border);
        background: color-mix(in srgb, var(--panel) 92%, transparent);
      }
      .brand {
        font-size: 15px;
        letter-spacing: 0.08em;
        text-transform: uppercase;
        margin-right: auto;
      }
      .panel {
        border: 1px solid var(--border);
        border-radius: 16px;
        background: var(--panel);
        padding: 12px;
        min-height: 0;
      }
      .panel h2 {
        font-size: 11px;
        letter-spacing: 0.14em;
        text-transform: uppercase;
        margin: 0 0 10px;
        color: var(--muted);
      }
      .messages {
        overflow: auto;
        padding: 16px;
        display: flex;
        flex-direction: column;
        gap: 12px;
      }
      .message {
        border: 1px solid var(--border);
        border-radius: 18px;
        padding: 12px 14px;
        white-space: pre-wrap;
        line-height: 1.45;
        background: var(--panel);
      }
      .message.user { align-self: flex-end; background: var(--accent-soft); }
      .message.system { border-style: dashed; color: var(--muted); }
      .composer {
        position: relative;
        border-top: 1px solid var(--border);
        padding: 14px;
        background: color-mix(in srgb, var(--panel) 94%, transparent);
      }
      textarea {
        width: 100%;
        min-height: 110px;
        resize: vertical;
        border-radius: 16px;
        border: 1px solid var(--border);
        background: color-mix(in srgb, var(--vscode-input-background) 92%, transparent);
        color: var(--text);
        padding: 12px 14px;
      }
      .composer-row { display: flex; align-items: center; gap: 8px; margin-top: 10px; }
      .mode-group { display: inline-flex; border: 1px solid var(--border); border-radius: 999px; overflow: hidden; }
      .mode-group button, .ghost, .primary {
        border: 0;
        border-radius: 999px;
        padding: 8px 12px;
        cursor: pointer;
        background: transparent;
        color: var(--text);
      }
      .mode-group button.active, .primary { background: var(--accent); color: #1b110d; }
      .ghost { border: 1px solid var(--border); }
      .history-item, .activity-item, .meta-item, .mention-item {
        padding: 8px 0;
        border-top: 1px solid color-mix(in srgb, var(--border) 70%, transparent);
      }
      .history-item:first-child, .activity-item:first-child, .meta-item:first-child, .mention-item:first-child {
        border-top: 0;
        padding-top: 0;
      }
      .history-item button, .mention-item button {
        width: 100%;
        text-align: left;
        border: 0;
        background: transparent;
        color: var(--text);
        cursor: pointer;
        padding: 0;
      }
      .muted { color: var(--muted); font-size: 12px; }
      .pill {
        display: inline-flex;
        align-items: center;
        padding: 6px 10px;
        border-radius: 999px;
        border: 1px solid var(--border);
        background: var(--panel);
        font-size: 12px;
      }
      .mentions {
        position: absolute;
        left: 14px;
        right: 14px;
        bottom: 78px;
        border: 1px solid var(--border);
        border-radius: 16px;
        background: var(--panel-strong);
        padding: 10px 12px;
        display: none;
        max-height: 220px;
        overflow: auto;
      }
      .mentions.show { display: block; }
      .empty { color: var(--muted); font-size: 12px; }
      @media (max-width: 900px) {
        .shell { grid-template-columns: 1fr; grid-template-rows: auto minmax(180px, 28vh) minmax(0, 1fr); }
        .sidebar {
          border-right: 0;
          border-bottom: 1px solid var(--border);
          overflow: auto;
        }
      }
    </style>
  </head>
  <body>
    <div class="shell">
      <aside class="sidebar">
        <section class="panel"><h2>History</h2><div id="history"></div></section>
        <section class="panel"><h2>Index</h2><div id="index"></div></section>
        <section class="panel"><h2>Context</h2><div id="context"></div></section>
        <section class="panel"><h2>Activity</h2><div id="activity"></div></section>
      </aside>
      <main class="main">
        <header class="topbar">
          <div class="brand">Playground</div>
          <span class="pill" id="authLabel">Not signed in</span>
          <button class="ghost" id="setApiKey">API Key</button>
          <button class="ghost" id="signIn">Browser Sign-In</button>
          <button class="ghost" id="signOut">Sign Out</button>
          <button class="ghost" id="newChat">New Chat</button>
          <button class="ghost" id="refreshHistory">History</button>
          <button class="ghost" id="rebuildIndex">Rebuild Index</button>
          <button class="ghost" id="undoChanges">Undo</button>
        </header>
        <section class="messages" id="messages"></section>
        <section class="composer">
          <div class="mentions" id="mentions"></div>
          <textarea id="composer" placeholder="Ask Playground to inspect code, patch files, or explain a bug. Use @ to mention a file."></textarea>
          <div class="composer-row">
            <div class="mode-group">
              <button data-mode="auto">Auto</button>
              <button data-mode="plan">Plan</button>
              <button data-mode="yolo">Yolo</button>
            </div>
            <span class="muted" id="busyLabel">Ready</span>
            <button class="primary" id="send">Send</button>
          </div>
        </section>
      </main>
    </div>
    <script nonce="${nonce}" src="${scriptUri}"></script>
  </body>
</html>`;
    }
}
exports.PlaygroundViewProvider = PlaygroundViewProvider;
//# sourceMappingURL=webview-provider.js.map
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
const https = __importStar(require("https"));
const http = __importStar(require("http"));
const url_1 = require("url");
const API_KEY_SECRET = "xpersona.apiKey";
// â”€â”€â”€ Activation â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
function activate(context) {
    // Sidebar view
    const viewProvider = new PlaygroundViewProvider(context);
    const viewRegistration = vscode.window.registerWebviewViewProvider("xpersona.playgroundView", viewProvider);
    // Command: Start Chat
    const newPrompt = vscode.commands.registerCommand("xpersona.playground.prompt", async () => {
        await viewProvider.showChat();
    });
    // Command: Chat with Selection
    const openWithSelection = vscode.commands.registerCommand("xpersona.playground.openWithSelection", async () => {
        const selectedText = getSelectionOrLine();
        await viewProvider.showChat(selectedText);
    });
    // Command: Set API Key
    const setApiKey = vscode.commands.registerCommand("xpersona.playground.setApiKey", async () => {
        const key = await vscode.window.showInputBox({
            title: "Xpersona API Key",
            prompt: "Enter your Xpersona API key (from your dashboard -> Settings -> API Key)",
            password: true,
            placeHolder: "xp_...",
            ignoreFocusOut: true,
        });
        if (key && key.trim().length > 0) {
            await context.secrets.store(API_KEY_SECRET, key.trim());
            viewProvider.notifyApiKeySaved();
            vscode.window.showInformationMessage("Xpersona API key saved securely.");
        }
    });
    context.subscriptions.push(newPrompt, openWithSelection, setApiKey, viewRegistration);
}
function deactivate() {
    return;
}
function openChatPanel(context, initialHistory) {
    const panel = vscode.window.createWebviewPanel("xpersonaChat", "Playground AI Chat", vscode.ViewColumn.One, {
        enableScripts: true,
        retainContextWhenHidden: true,
    });
    const nonce = getNonce();
    const conversationHistory = [...initialHistory];
    panel.webview.html = getChatInterfaceHtml(nonce);
    panel.webview.onDidReceiveMessage(async (message) => {
        switch (message.type) {
            case "sendMessage":
                await handleChatMessage(context, panel.webview, message.content, conversationHistory);
                break;
            case "saveApiKey":
                if (message.key && message.key.trim().length > 0) {
                    await context.secrets.store(API_KEY_SECRET, message.key.trim());
                    panel.webview.postMessage({ type: "apiKeySaved" });
                    vscode.window.showInformationMessage("âœ… Xpersona API key saved securely.");
                }
                break;
            case "clearHistory":
                conversationHistory.length = 0;
                break;
            case "checkApiKey": {
                const key = await context.secrets.get(API_KEY_SECRET);
                panel.webview.postMessage({ type: "apiKeyStatus", hasKey: !!key });
                break;
            }
        }
    }, undefined, context.subscriptions);
    // Send initial API key status
    context.secrets.get(API_KEY_SECRET).then((key) => {
        panel.webview.postMessage({ type: "apiKeyStatus", hasKey: !!key });
    });
    return panel;
}
// â”€â”€â”€ Sidebar View â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
class PlaygroundViewProvider {
    constructor(context) {
        this.context = context;
        this.conversationHistory = [];
    }
    resolveWebviewView(webviewView) {
        this.webviewView = webviewView;
        webviewView.webview.options = {
            enableScripts: true,
            enableCommandUris: true,
        };
        webviewView.webview.html = getChatInterfaceHtml(getNonce());
        webviewView.webview.onDidReceiveMessage(async (message) => {
            switch (message.type) {
                case "sendMessage":
                    await handleChatMessage(this.context, webviewView.webview, message.content, this.conversationHistory);
                    break;
                case "saveApiKey":
                    if (message.key && message.key.trim().length > 0) {
                        await this.context.secrets.store(API_KEY_SECRET, message.key.trim());
                        webviewView.webview.postMessage({ type: "apiKeySaved" });
                        vscode.window.showInformationMessage("Xpersona API key saved securely.");
                    }
                    break;
                case "clearHistory":
                    this.conversationHistory.length = 0;
                    break;
                case "checkApiKey": {
                    const key = await this.context.secrets.get(API_KEY_SECRET);
                    webviewView.webview.postMessage({ type: "apiKeyStatus", hasKey: !!key });
                    break;
                }
            }
        }, undefined, this.context.subscriptions);
        this.context.secrets.get(API_KEY_SECRET).then((key) => {
            webviewView.webview.postMessage({ type: "apiKeyStatus", hasKey: !!key });
            if (this.pendingPrefill) {
                webviewView.webview.postMessage({ type: "prefill", content: this.pendingPrefill });
                this.pendingPrefill = undefined;
            }
        });
        webviewView.onDidDispose(() => {
            this.webviewView = undefined;
        });
    }
    async showChat(prefill) {
        if (prefill) {
            this.pendingPrefill = prefill;
        }
        try {
            await vscode.commands.executeCommand("workbench.view.extension.xpersona");
            await vscode.commands.executeCommand("xpersona.playgroundView.focus");
        }
        catch {
            // Best-effort focus.
        }
        if (this.webviewView) {
            this.webviewView.show(true);
            if (this.pendingPrefill) {
                this.webviewView.webview.postMessage({ type: "prefill", content: this.pendingPrefill });
                this.pendingPrefill = undefined;
            }
        }
    }
    notifyApiKeySaved() {
        if (this.webviewView) {
            this.webviewView.webview.postMessage({ type: "apiKeySaved" });
            this.webviewView.webview.postMessage({ type: "apiKeyStatus", hasKey: true });
        }
    }
}
// â”€â”€â”€ Core: Handle Chat Message with Streaming â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
async function handleChatMessage(context, webview, userContent, history) {
    // Get API key
    const apiKey = await context.secrets.get(API_KEY_SECRET);
    if (!apiKey) {
        webview.postMessage({ type: "noApiKey" });
        return;
    }
    // Get config
    const config = vscode.workspace.getConfiguration("xpersona.playground");
    const baseApiUrl = (config.get("baseApiUrl") || "http://localhost:3000").replace(/\/$/, "");
    const model = config.get("model") || "Qwen/Qwen3-4B-Instruct-2507:nscale";
    const systemPrompt = config.get("systemPrompt") ||
        "You are an expert software engineer and coding assistant. Help the user with their code, answer questions clearly, and provide working examples.";
    // Build messages array
    const messages = [
        { role: "system", content: systemPrompt },
        ...history,
        { role: "user", content: userContent },
    ];
    // Add user message to history
    history.push({ role: "user", content: userContent });
    // Signal streaming start
    webview.postMessage({ type: "streamStart" });
    try {
        const fullResponse = await streamChatCompletion({
            baseApiUrl,
            apiKey,
            model,
            messages,
            onToken: (token) => {
                webview.postMessage({ type: "token", content: token });
            },
        });
        // Add assistant response to history
        history.push({ role: "assistant", content: fullResponse });
        // Signal stream end
        webview.postMessage({ type: "streamEnd" });
    }
    catch (err) {
        let errorMsg;
        if (err instanceof Error) {
            errorMsg = err.message;
        }
        else if (typeof err === "object" && err !== null) {
            errorMsg = JSON.stringify(err);
        }
        else {
            errorMsg = String(err);
        }
        webview.postMessage({ type: "error", content: errorMsg });
        // Remove the user message we added since the request failed
        history.pop();
    }
}
function extractErrorMessage(value) {
    if (!value)
        return undefined;
    if (typeof value === "string") {
        const trimmed = value.trim();
        return trimmed.length > 0 ? trimmed : undefined;
    }
    if (typeof value === "number" || typeof value === "boolean") {
        return String(value);
    }
    if (Array.isArray(value)) {
        const parts = value
            .map((item) => extractErrorMessage(item))
            .filter((item) => Boolean(item));
        return parts.length > 0 ? parts.join(" | ") : undefined;
    }
    if (typeof value === "object") {
        const obj = value;
        const nestedMessage = extractErrorMessage(obj.message) ??
            extractErrorMessage(obj.error) ??
            extractErrorMessage(obj.detail) ??
            extractErrorMessage(obj.reason);
        if (nestedMessage)
            return nestedMessage;
        try {
            return JSON.stringify(obj);
        }
        catch {
            return "Unknown error";
        }
    }
    return undefined;
}
function parseErrorFromResponseBody(errBody, statusCode) {
    const fallback = `HTTP ${statusCode ?? "error"}`;
    const trimmed = errBody.trim();
    if (!trimmed)
        return fallback;
    try {
        const parsed = JSON.parse(trimmed);
        const message = extractErrorMessage(parsed);
        if (message) {
            return statusCode ? `HTTP ${statusCode}: ${message}` : message;
        }
    }
    catch {
        // Non-JSON body, handled below.
    }
    const snippet = trimmed.slice(0, 300);
    return statusCode ? `HTTP ${statusCode}: ${snippet}` : snippet;
}
function streamChatCompletion(opts) {
    return new Promise((resolve, reject) => {
        const { baseApiUrl, apiKey, model, messages, onToken } = opts;
        const body = JSON.stringify({
            model,
            messages,
            stream: true,
            max_tokens: 512,
            temperature: 0.7,
        });
        let parsedUrl;
        try {
            parsedUrl = new url_1.URL(`${baseApiUrl}/api/v1/hf/chat/completions`);
        }
        catch {
            reject(new Error(`Invalid API URL: ${baseApiUrl}`));
            return;
        }
        const isHttps = parsedUrl.protocol === "https:";
        const transport = isHttps ? https : http;
        const options = {
            hostname: parsedUrl.hostname,
            port: parsedUrl.port || (isHttps ? 443 : 80),
            path: parsedUrl.pathname + parsedUrl.search,
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "Content-Length": Buffer.byteLength(body),
                "X-API-Key": apiKey,
                Accept: "text/event-stream",
            },
        };
        let fullText = "";
        let buffer = "";
        const req = transport.request(options, (res) => {
            if (res.statusCode && res.statusCode >= 400) {
                let errBody = "";
                res.on("data", (chunk) => {
                    errBody += chunk.toString();
                });
                res.on("end", () => {
                    const errorMessage = parseErrorFromResponseBody(errBody, res.statusCode);
                    reject(new Error(errorMessage));
                });
                return;
            }
            res.on("data", (chunk) => {
                buffer += chunk.toString();
                const lines = buffer.split("\n");
                buffer = lines.pop() || "";
                for (const line of lines) {
                    const trimmed = line.trim();
                    if (!trimmed || trimmed === "data: [DONE]")
                        continue;
                    if (!trimmed.startsWith("data: "))
                        continue;
                    const jsonStr = trimmed.slice(6);
                    try {
                        const parsed = JSON.parse(jsonStr);
                        const delta = parsed?.choices?.[0]?.delta?.content;
                        if (delta) {
                            fullText += delta;
                            onToken(delta);
                        }
                    }
                    catch {
                        // Skip malformed SSE lines
                    }
                }
            });
            res.on("end", () => {
                // Process any remaining buffer
                if (buffer.trim() && buffer.trim() !== "data: [DONE]") {
                    const trimmed = buffer.trim();
                    if (trimmed.startsWith("data: ")) {
                        try {
                            const parsed = JSON.parse(trimmed.slice(6));
                            const delta = parsed?.choices?.[0]?.delta?.content;
                            if (delta) {
                                fullText += delta;
                                onToken(delta);
                            }
                        }
                        catch {
                            // ignore
                        }
                    }
                }
                resolve(fullText);
            });
            res.on("error", reject);
        });
        req.on("error", reject);
        req.setTimeout(60000, () => {
            req.destroy();
            reject(new Error("Request timed out after 60 seconds"));
        });
        req.write(body);
        req.end();
    });
}
// â”€â”€â”€ HTML: Sidebar â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
function getSidebarHtml() {
    return `<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <style>
      body {
        font-family: var(--vscode-font-family);
        color: var(--vscode-foreground);
        padding: 12px;
        margin: 0;
      }
      .card {
        border: 1px solid var(--vscode-panel-border);
        border-radius: 8px;
        padding: 12px;
        background: var(--vscode-sideBar-background);
      }
      .title { font-weight: 600; margin-bottom: 4px; font-size: 14px; }
      .subtitle { opacity: 0.7; margin-bottom: 12px; font-size: 12px; }
      .actions { display: grid; gap: 8px; }
      a.button {
        display: inline-block;
        text-decoration: none;
        color: var(--vscode-button-foreground);
        background: var(--vscode-button-background);
        padding: 8px 10px;
        border-radius: 6px;
        text-align: center;
        font-size: 13px;
      }
      a.button.secondary {
        background: var(--vscode-button-secondaryBackground);
        color: var(--vscode-button-secondaryForeground);
      }
    </style>
  </head>
  <body>
    <div class="card">
      <div class="title">Playground AI Chat</div>
      <div class="subtitle">Your AI coding assistant</div>
      <div class="actions">
        <a class="button" href="command:xpersona.playground.prompt">Start Chat</a>
        <a class="button secondary" href="command:xpersona.playground.openWithSelection">Chat with Selection</a>
        <a class="button secondary" href="command:xpersona.playground.setApiKey">Set API Key</a>
      </div>
    </div>
  </body>
</html>`;
}
// â”€â”€â”€ HTML: Chat Panel â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
function getChatInterfaceHtml(nonce) {
    return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; script-src 'nonce-${nonce}';">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Playground AI Chat</title>
    <style>
        * { box-sizing: border-box; margin: 0; padding: 0; }
        body {
            font-family: var(--vscode-font-family);
            height: 100vh;
            display: flex;
            flex-direction: column;
            background: var(--vscode-editor-background);
            color: var(--vscode-editor-foreground);
            font-size: 13px;
        }

        /* â”€â”€ Setup Screen â”€â”€ */
        #setupScreen {
            display: none;
            flex-direction: column;
            align-items: center;
            justify-content: center;
            flex: 1;
            padding: 32px;
            gap: 16px;
            text-align: center;
        }
        #setupScreen.visible { display: flex; }
        #setupScreen h2 { font-size: 16px; font-weight: 600; }
        #setupScreen p { opacity: 0.7; font-size: 12px; line-height: 1.6; }
        #apiKeyInput {
            width: 100%;
            max-width: 360px;
            padding: 8px 12px;
            border: 1px solid var(--vscode-input-border);
            border-radius: 6px;
            background: var(--vscode-input-background);
            color: var(--vscode-input-foreground);
            font-family: monospace;
            font-size: 13px;
            outline: none;
        }
        #apiKeyInput:focus { border-color: var(--vscode-focusBorder); }
        #saveKeyBtn {
            padding: 8px 20px;
            background: var(--vscode-button-background);
            color: var(--vscode-button-foreground);
            border: none;
            border-radius: 6px;
            cursor: pointer;
            font-size: 13px;
        }
        #saveKeyBtn:hover { background: var(--vscode-button-hoverBackground); }

        /* â”€â”€ Chat Screen â”€â”€ */
        #chatScreen {
            display: none;
            flex-direction: column;
            flex: 1;
            overflow: hidden;
        }
        #chatScreen.visible { display: flex; }

        .chat-header {
            padding: 10px 16px;
            border-bottom: 1px solid var(--vscode-panel-border);
            display: flex;
            align-items: center;
            justify-content: space-between;
            font-weight: 600;
            font-size: 13px;
        }
        .header-actions { display: flex; gap: 8px; }
        .icon-btn {
            background: none;
            border: none;
            cursor: pointer;
            color: var(--vscode-foreground);
            opacity: 0.6;
            font-size: 12px;
            padding: 2px 6px;
            border-radius: 4px;
        }
        .icon-btn:hover { opacity: 1; background: var(--vscode-toolbar-hoverBackground); }

        .messages {
            flex: 1;
            overflow-y: auto;
            padding: 16px;
            display: flex;
            flex-direction: column;
            gap: 12px;
        }
        .message {
            padding: 10px 14px;
            border-radius: 8px;
            max-width: 88%;
            word-wrap: break-word;
            line-height: 1.55;
            white-space: pre-wrap;
            font-size: 13px;
        }
        .message.user {
            background: var(--vscode-button-background);
            color: var(--vscode-button-foreground);
            align-self: flex-end;
            border-bottom-right-radius: 2px;
        }
        .message.assistant {
            background: var(--vscode-input-background);
            border: 1px solid var(--vscode-input-border);
            align-self: flex-start;
            border-bottom-left-radius: 2px;
        }
        .message.assistant.streaming::after {
            content: 'â–‹';
            animation: blink 0.8s step-end infinite;
            margin-left: 1px;
        }
        @keyframes blink { 50% { opacity: 0; } }
        .message.error {
            background: var(--vscode-inputValidation-errorBackground);
            border: 1px solid var(--vscode-inputValidation-errorBorder);
            color: var(--vscode-inputValidation-errorForeground);
            align-self: flex-start;
            font-size: 12px;
        }

        .input-container {
            padding: 12px 16px;
            border-top: 1px solid var(--vscode-panel-border);
        }
        .input-row { display: flex; gap: 8px; align-items: flex-end; }
        #messageInput {
            flex: 1;
            padding: 8px 12px;
            border: 1px solid var(--vscode-input-border);
            border-radius: 6px;
            background: var(--vscode-input-background);
            color: var(--vscode-input-foreground);
            font-family: inherit;
            font-size: 13px;
            resize: none;
            min-height: 132px;
            max-height: 280px;
            outline: none;
            line-height: 1.4;
        }
        #messageInput:focus { border-color: var(--vscode-focusBorder); }
        #sendButton {
            padding: 8px 14px;
            background: var(--vscode-button-background);
            color: var(--vscode-button-foreground);
            border: none;
            border-radius: 6px;
            cursor: pointer;
            font-size: 13px;
            white-space: nowrap;
            min-width: 56px;
        }
        #sendButton:hover { background: var(--vscode-button-hoverBackground); }
        #sendButton:disabled { opacity: 0.45; cursor: not-allowed; }
        .hint { font-size: 11px; opacity: 0.45; margin-top: 5px; }

        /* â”€â”€ No-key banner inside chat â”€â”€ */
        .no-key-banner {
            display: none;
            padding: 10px 14px;
            background: var(--vscode-inputValidation-warningBackground);
            border: 1px solid var(--vscode-inputValidation-warningBorder);
            border-radius: 6px;
            font-size: 12px;
            margin-bottom: 8px;
            cursor: pointer;
        }
        .no-key-banner.visible { display: block; }
    </style>
</head>
<body>

    <!-- Setup Screen (shown when no API key) -->
    <div id="setupScreen">
        <h2>Enter your Playground API Key</h2>
        <p>Get your API key from your Xpersona dashboard<br>under <strong>Settings â†’ API Key</strong>.</p>
        <input id="apiKeyInput" type="password" placeholder="xp_..." autocomplete="off" spellcheck="false" />
        <button id="saveKeyBtn">Save & Start Chatting</button>
    </div>

    <!-- Chat Screen -->
    <div id="chatScreen">
        <div class="chat-header">
            <span>Playground AI Chat</span>
            <div class="header-actions">
                <button class="icon-btn" id="clearBtn" title="Clear conversation">Clear</button>
                <button class="icon-btn" id="keyBtn" title="Change API key">API Key</button>
            </div>
        </div>
        <div class="messages" id="messages">
            <div class="message assistant">
                Hello! I'm your Playground AI coding assistant. Ask me anything about your code!
            </div>
        </div>
        <div class="input-container">
            <div class="no-key-banner" id="noKeyBanner">
                âš ï¸ No API key set. <u>Click here to set your API key.</u>
            </div>
            <div class="input-row">
                <textarea id="messageInput" placeholder="Type a message..." rows="4"></textarea>
                <button id="sendButton" disabled>Send</button>
            </div>
            <div class="hint">Enter to send &bull; Shift+Enter for new line</div>
        </div>
    </div>

    <script nonce="${nonce}">
        const vscode = acquireVsCodeApi();
        const setupScreen = document.getElementById('setupScreen');
        const chatScreen = document.getElementById('chatScreen');
        const messagesEl = document.getElementById('messages');
        const messageInput = document.getElementById('messageInput');
        const sendButton = document.getElementById('sendButton');
        const noKeyBanner = document.getElementById('noKeyBanner');
        const apiKeyInput = document.getElementById('apiKeyInput');
        const saveKeyBtn = document.getElementById('saveKeyBtn');
        const clearBtn = document.getElementById('clearBtn');
        const keyBtn = document.getElementById('keyBtn');

        let isStreaming = false;
        let currentStreamEl = null;

        // â”€â”€ Show/hide screens â”€â”€
        function showChat() {
            setupScreen.classList.remove('visible');
            chatScreen.classList.add('visible');
            noKeyBanner.classList.remove('visible');
            messageInput.focus();
        }
        function showSetup() {
            chatScreen.classList.remove('visible');
            setupScreen.classList.add('visible');
            apiKeyInput.focus();
        }

        // â”€â”€ Messages â”€â”€
        function scrollToBottom() {
            messagesEl.scrollTop = messagesEl.scrollHeight;
        }
        function addMessage(content, role) {
            const el = document.createElement('div');
            el.className = 'message ' + role;
            el.textContent = content;
            messagesEl.appendChild(el);
            scrollToBottom();
            return el;
        }

        // â”€â”€ Send â”€â”€
        function sendMessage() {
            const content = messageInput.value.trim();
            if (!content || isStreaming) return;

            addMessage(content, 'user');
            messageInput.value = '';
            messageInput.style.height = 'auto';
            sendButton.disabled = true;
            isStreaming = true;

            // Create empty assistant bubble for streaming
            currentStreamEl = document.createElement('div');
            currentStreamEl.className = 'message assistant streaming';
            currentStreamEl.textContent = '';
            messagesEl.appendChild(currentStreamEl);
            scrollToBottom();

            vscode.postMessage({ type: 'sendMessage', content });
        }

        sendButton.addEventListener('click', sendMessage);
        messageInput.addEventListener('keydown', function(e) {
            if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                if (!sendButton.disabled) sendMessage();
            }
        });
        messageInput.addEventListener('input', function() {
            sendButton.disabled = !this.value.trim() || isStreaming;
            this.style.height = 'auto';
            this.style.height = Math.min(this.scrollHeight, 280) + 'px';
        });

        // â”€â”€ Clear â”€â”€
        clearBtn.addEventListener('click', function() {
            while (messagesEl.children.length > 1) {
                messagesEl.removeChild(messagesEl.lastChild);
            }
            vscode.postMessage({ type: 'clearHistory' });
        });

        // â”€â”€ API Key â”€â”€
        keyBtn.addEventListener('click', showSetup);
        noKeyBanner.addEventListener('click', showSetup);
        saveKeyBtn.addEventListener('click', function() {
            const key = apiKeyInput.value.trim();
            if (key) {
                vscode.postMessage({ type: 'saveApiKey', key });
            }
        });
        apiKeyInput.addEventListener('keydown', function(e) {
            if (e.key === 'Enter') saveKeyBtn.click();
        });

        // â”€â”€ Messages from extension â”€â”€
        window.addEventListener('message', function(event) {
            const msg = event.data;
            switch (msg.type) {
                case 'apiKeyStatus':
                    if (msg.hasKey) {
                        showChat();
                    } else {
                        showSetup();
                    }
                    break;

                case 'apiKeySaved':
                    showChat();
                    break;

                case 'streamStart':
                    // bubble already created in sendMessage
                    break;

                case 'token':
                    if (currentStreamEl) {
                        currentStreamEl.textContent += msg.content;
                        scrollToBottom();
                    }
                    break;

                case 'streamEnd':
                    if (currentStreamEl) {
                        currentStreamEl.classList.remove('streaming');
                        currentStreamEl = null;
                    }
                    isStreaming = false;
                    sendButton.disabled = !messageInput.value.trim();
                    messageInput.focus();
                    break;

                case 'noApiKey':
                    if (currentStreamEl) {
                        currentStreamEl.remove();
                        currentStreamEl = null;
                    }
                    isStreaming = false;
                    sendButton.disabled = !messageInput.value.trim();
                    noKeyBanner.classList.add('visible');
                    break;

                case 'error':
                    if (currentStreamEl) {
                        currentStreamEl.remove();
                        currentStreamEl = null;
                    }
                    isStreaming = false;
                    sendButton.disabled = !messageInput.value.trim();
                    addMessage('Error: ' + msg.content, 'error');
                    break;

                case 'prefill':
                    messageInput.value = msg.content;
                    sendButton.disabled = false;
                    messageInput.focus();
                    messageInput.style.height = 'auto';
                    messageInput.style.height = Math.min(messageInput.scrollHeight, 280) + 'px';
                    break;
            }
        });

        // â”€â”€ Init: check API key â”€â”€
        vscode.postMessage({ type: 'checkApiKey' });
    </script>
</body>
</html>`;
}
// â”€â”€â”€ Helpers â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
function getSelectionOrLine() {
    const editor = vscode.window.activeTextEditor;
    if (!editor)
        return undefined;
    const selection = editor.selection;
    const selected = selection.isEmpty ? "" : editor.document.getText(selection).trim();
    if (selected)
        return selected;
    const lineText = editor.document.lineAt(selection.active.line).text.trim();
    return lineText.length > 0 ? lineText : undefined;
}
function getNonce() {
    let text = "";
    const possible = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
    for (let i = 0; i < 32; i++) {
        text += possible.charAt(Math.floor(Math.random() * possible.length));
    }
    return text;
}
//# sourceMappingURL=extension.js.map
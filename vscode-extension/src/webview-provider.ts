import * as vscode from "vscode";
import { randomUUID } from "crypto";
import { AuthManager } from "./auth";
import { ActionRunner } from "./actions";
import { ContextCollector } from "./context";
import { getBaseApiUrl, getWorkspaceHash, MODE_KEY, WEBVIEW_VIEW_ID } from "./config";
import { SessionHistoryService } from "./history";
import { CloudIndexManager } from "./indexer";
import { streamJsonEvents } from "./api-client";
import type {
  AssistAction,
  AssistContextSelection,
  AssistPlan,
  AuthState,
  ChatMessage,
  ContextPreview,
  HistoryItem,
  IndexState,
  Mode,
} from "./shared";

type WebviewState = {
  mode: Mode;
  auth: AuthState;
  history: HistoryItem[];
  messages: ChatMessage[];
  busy: boolean;
  canUndo: boolean;
};

function normalizeMode(value?: Mode): Mode {
  if (value === "plan") return "plan";
  return "auto";
}

function formatPlan(plan: AssistPlan): string {
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

function createNonce(): string {
  return randomUUID().replace(/-/g, "");
}

export class PlaygroundViewProvider implements vscode.WebviewViewProvider {
  private view: vscode.WebviewView | undefined;
  private sessionId: string | null = null;
  private state: WebviewState;

  constructor(
    private readonly context: vscode.ExtensionContext,
    private readonly auth: AuthManager,
    private readonly historyService: SessionHistoryService,
    private readonly contextCollector: ContextCollector,
    private readonly actionRunner: ActionRunner,
    private readonly indexManager: CloudIndexManager
  ) {
    this.state = {
      mode: normalizeMode(this.context.workspaceState.get<Mode>(MODE_KEY)),
      auth: { kind: "none", label: "Not signed in" },
      history: [],
      messages: [],
      busy: false,
      canUndo: this.actionRunner.canUndo(),
    };

    this.auth.onDidChange(() => void this.refreshAuth());
    this.actionRunner.onDidChangeUndo((canUndo) => {
      this.state.canUndo = canUndo;
      this.postState();
    });
  }

  resolveWebviewView(view: vscode.WebviewView): void {
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

  async show(prefill?: string): Promise<void> {
    await vscode.commands.executeCommand("workbench.view.extension.xpersona").then(undefined, () => undefined);
    await vscode.commands.executeCommand(`${WEBVIEW_VIEW_ID}.focus`).then(undefined, () => undefined);
    if (prefill && this.view) {
      this.view.webview.postMessage({ type: "prefill", text: prefill });
    }
  }

  async setMode(mode: Mode): Promise<void> {
    const nextMode = normalizeMode(mode);
    this.state.mode = nextMode;
    await this.context.workspaceState.update(MODE_KEY, nextMode);
    this.postState();
  }

  async refreshHistory(): Promise<void> {
    const auth = await this.auth.getRequestAuth();
    if (!auth) {
      this.state.history = [];
      this.postState();
      return;
    }
    this.state.history = await this.historyService.list(auth).catch(() => []);
    this.postState();
  }

  async newChat(): Promise<void> {
    this.sessionId = null;
    this.state.messages = [];
    this.postState();
  }

  private async bootstrap(): Promise<void> {
    await this.refreshAuth();
    await this.refreshHistory();
    this.postState();
  }

  private async refreshAuth(): Promise<void> {
    this.state.auth = await this.auth.getAuthState().catch(() => ({
      kind: "none",
      label: "Not signed in",
    }));
    this.postState();
  }

  private async openSession(sessionId: string): Promise<void> {
    const auth = await this.auth.getRequestAuth();
    if (!auth || !sessionId) return;
    this.sessionId = sessionId;
    this.state.messages = await this.historyService.loadMessages(auth, sessionId).catch(() => []);
    this.postState();
  }

  private async handleMessage(message: any): Promise<void> {
    if (!message || typeof message !== "object") return;

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
        await this.setMode(String(message.value || "auto") as Mode);
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
      case "undoLastChanges": {
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

  private async sendPrompt(rawText: string): Promise<void> {
    const text = rawText.trim();
    if (!text || this.state.busy) return;

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
      const { context, retrievalHints } = await this.contextCollector.collect(
        text,
        this.actionRunner.getRecentTouchedPaths()
      );

      let streamedPlan: AssistPlan | null = null;
      let streamedActions: AssistAction[] = [];
      let finalText = "";

      await streamJsonEvents(
        "POST",
        `${getBaseApiUrl()}/api/v1/playground/assist`,
        auth,
        {
          mode: this.state.mode,
          task: text,
          stream: true,
          ...(this.sessionId ? { historySessionId: this.sessionId } : {}),
          context,
          retrievalHints,
          clientTrace: {
            extensionVersion: String(
              vscode.extensions.getExtension("playgroundai.xpersona-playground")?.packageJSON?.version || "0.0.0"
            ),
            workspaceHash: getWorkspaceHash(),
          },
        },
        async (event, data) => {
          if (event === "status") {
            this.appendMessage("system", String(data || ""));
            this.postState();
            return;
          }
          if (event === "plan") {
            streamedPlan = data as AssistPlan;
            this.appendMessage("system", "Plan received.");
            this.postState();
            return;
          }
          if (event === "actions") {
            streamedActions = Array.isArray(data) ? (data as AssistAction[]) : [];
            if (streamedActions.length) {
              this.appendMessage(
                "system",
                `Prepared ${streamedActions.length} action${streamedActions.length === 1 ? "" : "s"}.`
              );
              this.postState();
            }
            return;
          }
          if (event === "meta" && data && typeof data === "object") {
            const meta = data as {
              sessionId?: string;
              completionStatus?: "complete" | "incomplete";
              missingRequirements?: string[];
            };
            if (meta.sessionId) this.sessionId = meta.sessionId;
            if (meta.completionStatus === "incomplete" && meta.missingRequirements?.length) {
              this.appendMessage("system", `Missing: ${meta.missingRequirements.join(", ")}`);
            }
            this.postState();
            return;
          }
          if (event === "final") {
            finalText = String(data || "").trim();
          }
        }
      );

      const assistantBody =
        this.state.mode === "plan" && streamedPlan
          ? [finalText || "Plan ready.", "", formatPlan(streamedPlan)].filter(Boolean).join("\n")
          : finalText || "No final response text was returned.";
      this.appendMessage("assistant", assistantBody);

      if (this.state.mode !== "plan" && streamedActions.length > 0) {
        this.appendMessage("system", "Applying local changes...");
        this.postState();
        const applyReport = await this.actionRunner.apply({
          mode: this.state.mode,
          actions: streamedActions,
          auth,
          sessionId: this.sessionId || undefined,
          workspaceFingerprint: getWorkspaceHash(),
        });
        this.state.canUndo = applyReport.canUndo;
        this.appendMessage("system", applyReport.summary);
        this.postState();
      }

      await this.refreshHistory();
    } catch (error) {
      this.appendMessage(
        "system",
        `Request failed: ${error instanceof Error ? error.message : String(error)}`
      );
    } finally {
      this.state.busy = false;
      this.postState();
    }
  }

  private appendMessage(role: ChatMessage["role"], content: string): void {
    this.state.messages = [...this.state.messages, { id: randomUUID(), role, content }];
  }

  private postState(): void {
    this.view?.webview.postMessage({
      type: "state",
      state: this.state,
    });
  }

  private renderHtml(webview: vscode.Webview): string {
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
        --panel: color-mix(in srgb, var(--vscode-editor-background) 96%, #202a38 4%);
        --panel-strong: color-mix(in srgb, var(--vscode-sideBar-background) 88%, #1a2435 12%);
        --border: color-mix(in srgb, var(--vscode-editor-foreground) 18%, transparent);
        --text: var(--vscode-editor-foreground);
        --muted: var(--vscode-descriptionForeground);
        --accent: #f58b54;
      }
      * { box-sizing: border-box; }
      body {
        margin: 0;
        font-family: Georgia, "Segoe UI", serif;
        background: var(--bg), var(--vscode-editor-background);
        color: var(--text);
      }
      button, textarea { font: inherit; }
      .shell {
        display: grid;
        grid-template-columns: 280px minmax(0, 1fr);
        height: 100vh;
      }
      .history-panel {
        border-right: 1px solid var(--border);
        background: var(--panel-strong);
        padding: 14px;
        display: flex;
        flex-direction: column;
      }
      .history-head {
        display: flex;
        align-items: center;
        justify-content: space-between;
        margin-bottom: 12px;
        font-size: 12px;
        text-transform: uppercase;
        letter-spacing: 0.15em;
      }
      .history-list {
        flex: 1;
        overflow: auto;
        display: flex;
        flex-direction: column;
        gap: 6px;
      }
      .history-item {
        font-size: 14px;
      }
      .history-item button {
        width: 100%;
        border: 0;
        background: transparent;
        color: var(--text);
        text-align: left;
        padding: 6px;
        border-radius: 8px;
      }
      .history-item button:hover {
        background: color-mix(in srgb, var(--vscode-focusBorder) 40%, transparent);
      }
      .chat-panel {
        display: flex;
        flex-direction: column;
        background: var(--panel);
      }
      .chat-header {
        display: flex;
        align-items: center;
        justify-content: space-between;
        padding: 12px 16px;
        border-bottom: 1px solid var(--border);
      }
      .header-actions {
        display: flex;
        align-items: center;
        gap: 6px;
        flex-wrap: wrap;
      }
      .chat-header .brand {
        font-size: 16px;
        letter-spacing: 0.2em;
        text-transform: uppercase;
      }
      .ghost {
        border: 1px solid var(--border);
        background: transparent;
        color: var(--text);
        border-radius: 8px;
        padding: 6px 10px;
        cursor: pointer;
      }
      .primary {
        border: 0;
        border-radius: 8px;
        padding: 8px 14px;
        background: var(--accent);
        color: #1b110d;
        cursor: pointer;
      }
      .mode-switch {
        display: inline-flex;
        border: 1px solid var(--border);
        border-radius: 999px;
        overflow: hidden;
      }
      .mode-switch button {
        border: 0;
        background: transparent;
        color: var(--text);
        padding: 4px 12px;
        cursor: pointer;
      }
      .mode-switch button.active {
        background: var(--accent);
        color: #1b110d;
      }
      .busy-label {
        font-size: 12px;
        color: var(--muted);
      }
      .messages {
        flex: 1;
        overflow: auto;
        padding: 16px;
        display: flex;
        flex-direction: column;
        gap: 12px;
      }
      .message {
        border: 1px solid var(--border);
        border-radius: 14px;
        padding: 12px 14px;
        background: var(--panel-strong);
        white-space: pre-wrap;
        line-height: 1.5;
      }
      .message.user {
        align-self: flex-end;
        background: color-mix(in srgb, var(--panel) 80%, var(--accent) 20%);
      }
      .message.system {
        border-style: dashed;
        color: var(--muted);
      }
      .composer {
        border-top: 1px solid var(--border);
        padding: 12px 16px;
        background: color-mix(in srgb, var(--panel) 95%, transparent);
      }
      textarea {
        width: 100%;
        min-height: 120px;
        border-radius: 12px;
        border: 1px solid var(--border);
        background: color-mix(in srgb, var(--vscode-input-background) 92%, transparent);
        color: var(--text);
        padding: 12px;
        resize: vertical;
      }
      .composer-row {
        display: flex;
        align-items: center;
        gap: 8px;
        margin-top: 10px;
      }
      .mentions {
        position: absolute;
        left: 16px;
        right: 16px;
        bottom: 110px;
        border: 1px solid var(--border);
        border-radius: 12px;
        background: var(--panel-strong);
        padding: 8px 10px;
        display: none;
        max-height: 220px;
        overflow: auto;
        z-index: 10;
      }
      .mentions.show {
        display: block;
      }
      .mention-item button {
        width: 100%;
        border: 0;
        background: transparent;
        text-align: left;
        padding: 6px 0;
        color: var(--text);
      }
      .empty {
        color: var(--muted);
        font-size: 12px;
      }
      @media (max-width: 900px) {
        .shell {
          grid-template-columns: 1fr;
          grid-template-rows: 200px minmax(0, 1fr);
        }
        .history-panel {
          border-right: 0;
          border-bottom: 1px solid var(--border);
        }
      }
    </style>
  </head>
  <body>
    <div class="shell">
      <aside class="history-panel">
        <div class="history-head">
          <span>History</span>
          <button class="ghost" id="refreshHistory">Refresh</button>
        </div>
        <div id="history" class="history-list"></div>
      </aside>
      <section class="chat-panel">
        <header class="chat-header">
          <div class="brand">Playground</div>
          <div class="header-actions">
            <button class="ghost" id="setApiKey">API Key</button>
            <button class="ghost" id="signIn">Sign In</button>
            <button class="ghost" id="signOut">Sign Out</button>
            <div class="mode-switch">
              <button data-mode="auto">Auto</button>
              <button data-mode="plan">Plan</button>
            </div>
            <span id="busyLabel" class="busy-label">Ready</span>
          </div>
        </header>
        <section class="messages" id="messages"></section>
        <section class="composer">
          <div class="mentions" id="mentions"></div>
          <textarea id="composer" placeholder="Ask Playground to inspect code, patch files, or explain a bug. Use @ to mention a file."></textarea>
          <div class="composer-row">
            <button class="primary" id="send">Send</button>
            <button class="ghost" id="newChat">New Chat</button>
            <button class="ghost" id="undoChanges">Undo</button>
          </div>
        </section>
      </section>
    </div>
    <script nonce="${nonce}" src="${scriptUri}"></script>
  </body>
</html>`;
  }
}

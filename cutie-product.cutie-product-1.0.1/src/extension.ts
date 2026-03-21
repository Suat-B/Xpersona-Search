import * as vscode from "vscode";
import * as path from "path";
import type { RequestAuth } from "@xpersona/vscode-core";
import { CutieAuthManager } from "./auth";
import { getExtensionVersion, getWorkspaceHash, getWorkspaceRootPath, toWorkspaceRelativePath, VIEW_ID } from "./config";
import { CutieDesktopAdapter } from "./cutie-desktop-adapter";
import { CutieModelClient } from "./cutie-model-client";
import { CutieRuntime } from "./cutie-runtime";
import { CutieSessionStore } from "./cutie-session-store";
import { CutieToolRegistry } from "./cutie-tool-registry";
import { CutieWorkspaceAdapter } from "./cutie-workspace-adapter";
import type { CutieChatMessage, CutieMentionSuggestion, CutieRunState, CutieSessionRecord, CutieViewState } from "./types";
import { buildWebviewHtml } from "./webview-html";

type WebviewMessage =
  | { type: "ready" }
  | { type: "submitPrompt"; prompt: string; mentions?: CutieMentionSuggestion[] }
  | { type: "newChat" }
  | { type: "selectSession"; sessionId: string }
  | { type: "copyDebug" }
  | { type: "captureScreen" }
  | { type: "stopAutomation" }
  | { type: "signIn" }
  | { type: "signOut" }
  | { type: "setApiKey" }
  | { type: "mentionsQuery"; query: string; requestId: number };

type DesktopContextForView = CutieViewState["desktop"];

function buildDefaultDesktopState(): DesktopContextForView {
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

function asMentionArray(value: unknown): CutieMentionSuggestion[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => {
      if (!item || typeof item !== "object") return null;
      const row = item as Record<string, unknown>;
      const kind = row.kind === "window" ? "window" : row.kind === "file" ? "file" : null;
      const label = String(row.label || "").trim();
      const insertText = String(row.insertText || "").trim();
      const detail = String(row.detail || "").trim();
      if (!kind || !label || !insertText) return null;
      return {
        kind,
        label,
        insertText,
        ...(detail ? { detail } : {}),
      } satisfies CutieMentionSuggestion;
    })
    .filter((item): item is CutieMentionSuggestion => Boolean(item));
}

function normalizeMentionQuery(value: string): string {
  return String(value || "")
    .trim()
    .replace(/^@+/, "")
    .toLowerCase();
}

function isIgnoredWorkspacePath(relativePath: string): boolean {
  const normalized = relativePath.replace(/\\/g, "/").toLowerCase();
  return (
    normalized.startsWith(".git/") ||
    normalized.includes("/.git/") ||
    normalized.startsWith("node_modules/") ||
    normalized.includes("/node_modules/") ||
    normalized.startsWith(".next/") ||
    normalized.includes("/.next/")
  );
}

function scoreFilePath(relativePath: string, query: string, options?: { activePath?: string | null; openPaths?: Set<string> }): number {
  const normalizedPath = relativePath.toLowerCase();
  const baseName = path.basename(relativePath).toLowerCase();
  let score = 0;

  if (options?.activePath && options.activePath.toLowerCase() === normalizedPath) score += 200;
  if (options?.openPaths?.has(normalizedPath)) score += 120;

  if (!query) {
    score += 10;
  } else {
    if (baseName === query) score += 140;
    else if (baseName.startsWith(query)) score += 100;
    else if (baseName.includes(query)) score += 72;
    if (normalizedPath.startsWith(query)) score += 56;
    else if (normalizedPath.includes(query)) score += 32;
  }

  score -= Math.min(relativePath.length, 120) / 200;
  return score;
}

function scoreWindow(windowValue: { title?: string; app?: string }, query: string, isActive: boolean): number {
  const title = String(windowValue.title || "").toLowerCase();
  const app = String(windowValue.app || "").toLowerCase();
  let score = isActive ? 80 : 0;

  if (!query) return score + (title ? 24 : 0) + (app ? 12 : 0);
  if (title === query || app === query) score += 110;
  if (title.startsWith(query) || app.startsWith(query)) score += 80;
  if (title.includes(query) || app.includes(query)) score += 48;
  return score;
}

class CutieSidebarProvider implements vscode.WebviewViewProvider {
  private view?: vscode.WebviewView;
  private activeSessionId: string | null = null;
  private activeSession: CutieSessionRecord | null = null;
  private status = "Ready for a local Cutie run.";
  private activeRun: CutieRunState | null = null;
  private currentAbortController: AbortController | null = null;
  private streamingAssistantText = "";
  private desktopState: DesktopContextForView = buildDefaultDesktopState();
  private authState: CutieViewState["authState"] = {
    kind: "none",
    label: "Not signed in",
  };

  private readonly desktop = new CutieDesktopAdapter();
  private readonly sessionStore: CutieSessionStore;
  private readonly modelClient = new CutieModelClient();
  private readonly toolRegistry: CutieToolRegistry;
  private readonly runtime: CutieRuntime;

  constructor(
    private readonly context: vscode.ExtensionContext,
    private readonly auth: CutieAuthManager
  ) {
    this.sessionStore = new CutieSessionStore(context);
    this.toolRegistry = new CutieToolRegistry(new CutieWorkspaceAdapter(), this.desktop);
    this.runtime = new CutieRuntime(this.sessionStore, this.modelClient, this.toolRegistry, async () => this.gatherContext());

    this.auth.onDidChange(() => {
      void this.refreshAuthState().finally(() => {
        void this.emitState();
      });
    });
  }

  resolveWebviewView(webviewView: vscode.WebviewView): void {
    this.view = webviewView;
    webviewView.webview.options = { enableScripts: true };
    webviewView.webview.html = buildWebviewHtml(webviewView.webview);
    webviewView.webview.onDidReceiveMessage((message: WebviewMessage) => {
      void this.handleMessage(message);
    });
    void this.initializeView();
  }

  async show(): Promise<void> {
    await vscode.commands.executeCommand(`${VIEW_ID}.focus`);
  }

  async newChat(): Promise<void> {
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

  async captureScreen(): Promise<void> {
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

  async stopAutomation(): Promise<void> {
    if (!this.currentAbortController) {
      this.status = "No Cutie run is active.";
      await this.emitState();
      return;
    }
    this.status = "Stopping the active Cutie run...";
    this.currentAbortController.abort();
    await this.emitState();
  }

  private async initializeView(): Promise<void> {
    await this.emitState();
    void this.refreshViewState();
  }

  private async handleMessage(message: WebviewMessage): Promise<void> {
    if (message.type === "ready") {
      await this.emitState();
      void this.refreshViewState();
      return;
    }
    if (message.type === "newChat") return this.newChat();
    if (message.type === "selectSession") return this.loadSession(message.sessionId);
    if (message.type === "copyDebug") return this.copyDebugReport();
    if (message.type === "captureScreen") return this.captureScreen();
    if (message.type === "stopAutomation") return this.stopAutomation();
    if (message.type === "signIn") return this.auth.signInWithBrowser();
    if (message.type === "signOut") {
      await this.auth.signOut();
      return this.emitState();
    }
    if (message.type === "setApiKey") return this.auth.setApiKeyInteractive();
    if (message.type === "mentionsQuery") return this.respondToMentionsQuery(message.query, message.requestId);
    if (message.type === "submitPrompt") return this.runPrompt(message.prompt, asMentionArray(message.mentions));
  }

  private async requireAuth(): Promise<RequestAuth | null> {
    const auth = await this.auth.getRequestAuth();
    if (!auth) {
      this.status = "Sign in to Xpersona or set an API key before running Cutie.";
      await this.emitState();
      void vscode.window.showWarningMessage("Sign in to Xpersona or set an API key before running Cutie.");
      return null;
    }
    return auth;
  }

  private async loadSession(sessionId: string): Promise<void> {
    const session = this.sessionStore.getSession(getWorkspaceHash(), sessionId);
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

  private async ensureSession(initialPrompt?: string): Promise<CutieSessionRecord> {
    const workspaceHash = getWorkspaceHash();
    if (this.activeSession && this.activeSession.workspaceHash === workspaceHash) {
      return this.activeSession;
    }
    const session = await this.sessionStore.createSession(workspaceHash, initialPrompt);
    this.activeSession = session;
    this.activeSessionId = session.id;
    return session;
  }

  private async gatherContext() {
    const activeEditor = vscode.window.activeTextEditor;
    const activeFile = activeEditor
      ? {
          path: toWorkspaceRelativePath(activeEditor.document.uri) || undefined,
          language: activeEditor.document.languageId,
          lineCount: activeEditor.document.lineCount,
          ...(activeEditor.selection.isEmpty
            ? { preview: activeEditor.document.getText().slice(0, 2_000) }
            : {
                selection: activeEditor.document.getText(activeEditor.selection).slice(0, 2_000),
                selectionRange: {
                  startLine: activeEditor.selection.start.line + 1,
                  endLine: activeEditor.selection.end.line + 1,
                },
              }),
        }
      : undefined;

    const openFiles = vscode.window.visibleTextEditors
      .map((editor) => {
        const relativePath = toWorkspaceRelativePath(editor.document.uri);
        if (!relativePath) return null;
        return {
          path: relativePath,
          language: editor.document.languageId,
          lineCount: editor.document.lineCount,
        };
      })
      .filter((value): value is NonNullable<typeof value> => Boolean(value))
      .slice(0, 6);

    const diagnostics = vscode.languages
      .getDiagnostics()
      .flatMap(([uri, entries]) =>
        entries.map((entry) => ({
          file: toWorkspaceRelativePath(uri) || undefined,
          severity: entry.severity,
          message: entry.message,
          line: entry.range.start.line + 1,
        }))
      )
      .slice(0, 80);

    const desktop = await this.desktop.getDesktopContext().catch(() => this.desktopState);
    this.desktopState = desktop;

    return {
      workspaceHash: getWorkspaceHash(),
      workspaceRootPath: getWorkspaceRootPath(),
      extensionVersion: getExtensionVersion(this.context),
      ...(activeFile ? { activeFile } : {}),
      ...(openFiles.length ? { openFiles } : {}),
      ...(diagnostics.length ? { diagnostics } : {}),
      desktop,
      latestSnapshot: this.activeSession?.snapshots?.[0] || null,
    };
  }

  private async respondToMentionsQuery(query: string, requestId: number): Promise<void> {
    if (!this.view) return;
    const items = await this.getMentionSuggestions(query).catch(() => []);
    this.view.webview.postMessage({
      type: "mentions",
      requestId,
      items,
    });
  }

  private async getMentionSuggestions(rawQuery: string): Promise<CutieMentionSuggestion[]> {
    const normalizedQuery = normalizeMentionQuery(rawQuery);
    const wantsWindowsOnly = normalizedQuery.startsWith("window:");
    const fileQuery = wantsWindowsOnly ? "" : normalizedQuery;
    const windowQuery = wantsWindowsOnly ? normalizedQuery.slice("window:".length).trim() : normalizedQuery;

    const activePath = vscode.window.activeTextEditor
      ? toWorkspaceRelativePath(vscode.window.activeTextEditor.document.uri)
      : null;
    const openPaths = new Set(
      vscode.window.visibleTextEditors
        .map((editor) => toWorkspaceRelativePath(editor.document.uri))
        .filter((item): item is string => Boolean(item))
        .map((item) => item.toLowerCase())
    );

    const rankedFiles = new Map<string, { path: string; score: number; detail?: string }>();
    const pushFile = (relativePath: string, detail?: string) => {
      if (!relativePath || isIgnoredWorkspacePath(relativePath)) return;
      const score = scoreFilePath(relativePath, fileQuery, { activePath, openPaths });
      if (fileQuery && score < 32) return;
      const key = relativePath.toLowerCase();
      const existing = rankedFiles.get(key);
      if (!existing || score > existing.score) {
        rankedFiles.set(key, { path: relativePath, score, ...(detail ? { detail } : {}) });
      }
    };

    if (!wantsWindowsOnly) {
      if (activePath) pushFile(activePath, "Active file");
      for (const editor of vscode.window.visibleTextEditors) {
        const relativePath = toWorkspaceRelativePath(editor.document.uri);
        if (!relativePath || relativePath === activePath) continue;
        pushFile(relativePath, "Open file");
      }

      if (fileQuery) {
        let workspaceFiles: vscode.Uri[] = [];
        try {
          workspaceFiles = await vscode.workspace.findFiles("**/*", undefined, 700);
        } catch {
          workspaceFiles = [];
        }
        for (const uri of workspaceFiles) {
          const relativePath = toWorkspaceRelativePath(uri);
          if (!relativePath) continue;
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
        insertText: `@"${item.path}"`,
        ...(item.detail ? { detail: item.detail } : {}),
      } satisfies CutieMentionSuggestion));

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
        const isActive = Boolean(
          Boolean(activeWindow) &&
          ((activeWindow?.id && windowValue.id && activeWindow.id === windowValue.id) ||
            (activeWindow?.title && windowValue.title && activeWindow.title === windowValue.title))
        );
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
      } satisfies CutieMentionSuggestion));

    return [...fileItems, ...windowItems];
  }

  private async runPrompt(prompt: string, mentions: CutieMentionSuggestion[] = []): Promise<void> {
    const trimmedPrompt = String(prompt || "").trim();
    if (!trimmedPrompt) return;

    this.status = "Preparing your Cutie run...";
    await this.emitState();

    const auth = await this.requireAuth();
    if (!auth) return;

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
            await this.emitState();
            void this.refreshDesktopState().then(() => this.emitState());
          },
          onStatusChanged: async (status, run) => {
            this.status = status;
            this.activeRun = run;
            if (!run || run.status !== "running") {
              this.streamingAssistantText = "";
            }
            await this.emitState();
            void this.refreshDesktopState().then(() => this.emitState());
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
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.status = `Cutie failed: ${message}`;
      void vscode.window.showErrorMessage(this.status);
    } finally {
      this.currentAbortController = null;
      await this.refreshDesktopState();
      await this.emitState();
    }
  }

  private async copyDebugReport(): Promise<void> {
    const session = this.activeSession;
    const run = this.activeRun;
    const messages = this.getVisibleMessages();
    const debugPayload = {
      exportedAt: new Date().toISOString(),
      extensionVersion: getExtensionVersion(this.context),
      workspaceHash: getWorkspaceHash(),
      status: this.status,
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

  private getVisibleMessages(): CutieChatMessage[] {
    const messages = this.activeSession?.messages || [];
    if (!this.streamingAssistantText.trim()) return messages;
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

  private async refreshDesktopState(): Promise<void> {
    this.desktopState = await this.desktop.getDesktopContext().catch(() => this.desktopState || buildDefaultDesktopState());
  }

  private async refreshAuthState(): Promise<void> {
    this.authState = await this.auth.getAuthState().catch(
      () =>
        ({
          kind: "none",
          label: "Not signed in",
        }) as CutieViewState["authState"]
    );
  }

  private async refreshViewState(): Promise<void> {
    await Promise.allSettled([this.refreshAuthState(), this.refreshDesktopState()]);
    await this.emitState();
  }

  private async emitState(): Promise<void> {
    if (!this.view) return;

    const workspaceHash = getWorkspaceHash();
    const state: CutieViewState = {
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

export function activate(context: vscode.ExtensionContext) {
  const auth = new CutieAuthManager(context);
  const provider = new CutieSidebarProvider(context, auth);

  context.subscriptions.push(
    vscode.window.registerWebviewViewProvider(VIEW_ID, provider),
    vscode.window.registerUriHandler(auth),
    vscode.commands.registerCommand("cutie-product.startChat", async () => provider.show()),
    vscode.commands.registerCommand("cutie-product.captureScreen", async () => provider.captureScreen()),
    vscode.commands.registerCommand("cutie-product.setApiKey", async () => auth.setApiKeyInteractive()),
    vscode.commands.registerCommand("cutie-product.signIn", async () => auth.signInWithBrowser()),
    vscode.commands.registerCommand("cutie-product.signOut", async () => {
      await auth.signOut();
      await provider.newChat();
    }),
    vscode.commands.registerCommand("cutie-product.stopAutomation", async () => provider.stopAutomation())
  );
}

export function deactivate() {}

import * as vscode from "vscode";
import * as path from "path";
import type { RequestAuth } from "@xpersona/vscode-core";
import { CutieAuthManager } from "./auth";
import type { BinaryContextPayload, RetrievalHints } from "./binary-types";
import { CutieBinaryBundleController } from "./cutie-binary-controller";
import { getExtensionVersion, getWorkspaceHash, getWorkspaceRootPath, toWorkspaceRelativePath, VIEW_ID } from "./config";
import { CutieDesktopAdapter } from "./cutie-desktop-adapter";
import { CutieModelClient } from "./cutie-model-client";
import { CutieRuntime } from "./cutie-runtime";
import { CutieSessionStore } from "./cutie-session-store";
import { CutieToolRegistry } from "./cutie-tool-registry";
import { CutieWorkspaceAdapter } from "./cutie-workspace-adapter";
import { createTwoFilesPatch } from "diff";
import type {
  CutieChatDiffItem,
  CutieChatMessage,
  CutieMentionSuggestion,
  CutieProgressViewModel,
  CutieRunState,
  CutieSessionRecord,
  CutieViewState,
  CutieWorkspaceMutationInfo,
} from "./types";
import { createCutieBeforeUri, rememberMutationBefore, registerCutieDiffBeforeProvider, takeLastMutationBefore } from "./cutie-diff";
import { buildWebviewHtml } from "./webview-html";

type WebviewMessage =
  | { type: "ready" }
  | { type: "webviewError"; message?: string }
  | { type: "refreshView" }
  | { type: "submitPrompt"; prompt: string; mentions?: CutieMentionSuggestion[] }
  | { type: "newChat" }
  | { type: "selectSession"; sessionId: string }
  | { type: "copyDebug" }
  | { type: "captureScreen" }
  | { type: "stopAutomation" }
  | { type: "signIn" }
  | { type: "signOut" }
  | { type: "setApiKey" }
  | { type: "mentionsQuery"; query: string; requestId: number }
  | { type: "openWorkspaceFile"; path: string }
  | { type: "revealWorkspaceFile"; path: string }
  | { type: "diffWorkspaceFile"; path: string }
  | { type: "openScm" }
  | { type: "binaryGenerate"; intent?: string }
  | { type: "binaryRefine"; intent: string }
  | { type: "binaryBranch"; intent?: string; checkpointId?: string }
  | { type: "binaryRewind"; checkpointId?: string }
  | { type: "binaryExecute"; entryPoint: string }
  | { type: "binaryValidate" }
  | { type: "binaryPublish" }
  | { type: "binaryCancel" }
  | { type: "binaryConfigure" }
  | { type: "binarySetTarget"; runtime: string };

type DesktopContextForView = CutieViewState["desktop"];

function goalLabel(goal: CutieRunState["goal"]): string {
  switch (goal) {
    case "code_change":
      return "Editing file";
    case "workspace_investigation":
      return "Inspecting workspace";
    case "desktop_action":
      return "Desktop action";
    case "conversation":
    default:
      return "Conversation";
  }
}

function phaseLabel(run: CutieRunState): string {
  if (run.objectivesPhase === "decomposing") return "Planning task objectives";
  if (run.phase === "needs_guidance") return "Need guidance";
  if (run.phase === "repairing") return "Repairing action plan";
  if (run.phase === "collecting_context") return "Inspecting target context";
  if (run.phase === "planning") {
    if (run.goal === "code_change" && run.stepCount > 0) return "Preparing concrete edit";
    return "Planning next step";
  }
  if (run.phase === "executing_tool") return "Executing tool";
  if (run.phase === "completed") return "Completed";
  if (run.phase === "failed") return "Failed";
  if (run.phase === "canceled") return "Canceled";
  return "Idle";
}

function pursuitLabel(run: CutieRunState): string {
  if (run.goal === "code_change") {
    return run.goalSatisfied ? "Real file change achieved" : "Still working toward a file change";
  }
  if (run.goal === "desktop_action") {
    return run.goalSatisfied ? "Desktop action completed" : "Still working toward a desktop action";
  }
  if (run.goal === "workspace_investigation") {
    return run.goalSatisfied ? "Investigation progressed" : "Still gathering the answer";
  }
  return "Handling the conversation";
}

function buildProgressViewModel(run: CutieRunState | null): CutieProgressViewModel | null {
  if (!run) return null;
  return {
    goal: run.goal,
    goalLabel: goalLabel(run.goal),
    phaseLabel: phaseLabel(run),
    pursuingLabel: pursuitLabel(run),
    ...(run.lastMeaningfulProgressSummary ? { lastMeaningfulProgressSummary: run.lastMeaningfulProgressSummary } : {}),
    ...(run.repairAttemptCount > 0 ? { repairLabel: `Repair stage ${run.repairAttemptCount}` } : {}),
    ...(run.stuckReason ? { escalationMessage: run.stuckReason } : {}),
    ...(run.suggestedNextAction ? { suggestedNextAction: run.suggestedNextAction } : {}),
    goalSatisfied: run.goalSatisfied,
    escalationState: run.escalationState,
    ...(run.objectives?.length ? { objectives: run.objectives } : {}),
    ...(run.objectivesPhase ? { objectivesPhase: run.objectivesPhase } : {}),
  };
}

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

function escapeWebviewFailureHtml(value: string): string {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function buildWebviewFailureHtml(message: string): string {
  const safeMessage = escapeWebviewFailureHtml(message || "Unknown Cutie webview error.");
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Cutie</title>
  <style>
    :root {
      color-scheme: var(--vscode-color-scheme, dark);
    }
    html, body {
      margin: 0;
      min-height: 100%;
      background: var(--vscode-editor-background, #111418);
      color: var(--vscode-foreground, #f5f7fb);
      font-family: var(--vscode-font-family, "Segoe UI", sans-serif);
    }
    body {
      padding: 20px;
    }
    .card {
      max-width: 720px;
      padding: 16px;
      border: 1px solid var(--vscode-panel-border, #2d3440);
      border-radius: 12px;
      background: var(--vscode-sideBar-background, #171b22);
      box-shadow: 0 14px 32px rgba(0, 0, 0, 0.28);
    }
    h1 {
      margin: 0 0 10px;
      font-size: 16px;
    }
    p {
      margin: 0 0 12px;
      color: var(--vscode-descriptionForeground, #a4acb9);
      line-height: 1.5;
    }
    pre {
      margin: 0;
      padding: 12px;
      overflow: auto;
      border-radius: 10px;
      background: var(--vscode-input-background, #11161d);
      white-space: pre-wrap;
      word-break: break-word;
    }
  </style>
</head>
<body>
  <div class="card">
    <h1>Cutie could not load the chat UI</h1>
    <p>Reload the window after installing the latest Cutie build. If this keeps happening, the error below is the part we need.</p>
    <pre>${safeMessage}</pre>
  </div>
</body>
</html>`;
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

/** Primary line = basename only; secondary line = badge (e.g. Active file) + parent folder path. */
function mentionDisplayForWorkspaceFile(relativePath: string, badge?: string): { label: string; detail?: string } {
  const norm = relativePath.replace(/\\/g, "/").trim();
  const base = path.posix.basename(norm) || norm;
  const dirRaw = path.posix.dirname(norm);
  const folder =
    dirRaw && dirRaw !== "." && dirRaw !== "/" ? dirRaw.replace(/\/+$/, "") : "";
  const parts = [badge, folder].map((s) => String(s || "").trim()).filter(Boolean);
  const detail = parts.length ? parts.join(" · ") : undefined;
  return { label: base, ...(detail ? { detail } : {}) };
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
  private webviewReady = false;
  private webviewReadyTimeout: NodeJS.Timeout | null = null;
  private webviewBootNonce = 0;
  private activeRun: CutieRunState | null = null;
  private currentAbortController: AbortController | null = null;
  /** Monotonic guard so callbacks from an older aborted run cannot overwrite a newer conversation state. */
  private runRequestVersion = 0;
  private streamingAssistantText = "";
  private desktopState: DesktopContextForView = buildDefaultDesktopState();
  private authState: CutieViewState["authState"] = {
    kind: "none",
    label: "Not signed in",
  };

  /** Cached workspace paths for @ file lookup (avoid findFiles on every keystroke). */
  private workspaceMentionPaths: string[] | null = null;
  private workspaceMentionPathsFetchedAt = 0;
  private workspaceMentionIndexPromise: Promise<string[]> | null = null;
  private static readonly WORKSPACE_MENTION_INDEX_TTL_MS = 90_000;
  private static readonly MAX_CHAT_DIFFS_PER_SESSION = 120;
  private static readonly MAX_PATCH_CHARS = 52_000;
  private static readonly MAX_FILE_CHARS_FOR_PATCH = 500_000;
  private static readonly WEBVIEW_READY_TIMEOUT_MS = 10_000;

  /** Inline chat diff cards keyed by session id (not persisted to disk). */
  private readonly chatDiffsBySessionId = new Map<string, CutieChatDiffItem[]>();

  private readonly desktop = new CutieDesktopAdapter();
  private readonly workspaceAdapter = new CutieWorkspaceAdapter();
  private readonly sessionStore: CutieSessionStore;
  private readonly modelClient = new CutieModelClient();
  private readonly toolRegistry: CutieToolRegistry;
  private readonly runtime: CutieRuntime;
  private readonly binaryController: CutieBinaryBundleController;

  constructor(
    private readonly context: vscode.ExtensionContext,
    private readonly auth: CutieAuthManager
  ) {
    this.sessionStore = new CutieSessionStore(context);
    this.toolRegistry = new CutieToolRegistry(new CutieWorkspaceAdapter(), this.desktop);
    this.runtime = new CutieRuntime(this.sessionStore, this.modelClient, this.toolRegistry, async () => this.gatherContext());

    this.binaryController = new CutieBinaryBundleController(this.context, this.auth, this.sessionStore, {
      getWorkspaceHash: () => getWorkspaceHash(),
      getActiveSession: () => this.activeSession,
      setActiveSession: (session) => {
        this.activeSession = session;
        this.activeSessionId = session?.id ?? null;
      },
      emitState: () => this.emitState(),
      gatherBinaryContext: () => this.gatherBinaryContextForApi(),
      showView: () => this.show(),
    });

    this.auth.onDidChange(() => {
      void this.refreshAuthState().finally(() => {
        void this.emitState();
      });
    });

    this.context.subscriptions.push(
      vscode.workspace.onDidChangeWorkspaceFolders(() => {
        this.invalidateWorkspaceMentionIndex();
      }),
      vscode.workspace.onDidChangeConfiguration((event) => {
        if (event.affectsConfiguration("cutie-product.baseApiUrl") || event.affectsConfiguration("cutie-product.binary")) {
          void this.emitState();
        }
      })
    );
    this.context.subscriptions.push({ dispose: () => this.clearWebviewReadyTimeout() });
  }

  private async gatherBinaryContextForApi(): Promise<{ context: BinaryContextPayload; retrievalHints: RetrievalHints }> {
    const excerptMax = 8000;
    const openExcerptMax = 2000;
    const activeEditor = vscode.window.activeTextEditor;
    const activeFile = activeEditor
      ? {
          path: toWorkspaceRelativePath(activeEditor.document.uri) || undefined,
          language: activeEditor.document.languageId,
          ...(activeEditor.selection.isEmpty
            ? { content: activeEditor.document.getText().slice(0, excerptMax) }
            : {
                selection: activeEditor.document.getText(activeEditor.selection).slice(0, excerptMax),
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
          excerpt: editor.document.getText().slice(0, openExcerptMax),
        };
      })
      .filter((row): row is NonNullable<typeof row> => Boolean(row));

    const candidateErrors: string[] = [];
    for (const [uri, diags] of vscode.languages.getDiagnostics()) {
      const rel = toWorkspaceRelativePath(uri);
      for (const d of diags.slice(0, 2)) {
        candidateErrors.push(`${rel || "?"}: ${d.message}`);
        if (candidateErrors.length >= 24) break;
      }
      if (candidateErrors.length >= 24) break;
    }

    const context: BinaryContextPayload = {};
    if (activeFile?.path) {
      context.activeFile = activeFile;
    }
    if (openFiles.length) {
      context.openFiles = openFiles;
    }

    return {
      context,
      retrievalHints: {
        mentionedPaths: [],
        candidateSymbols: [],
        candidateErrors,
      },
    };
  }

  private invalidateWorkspaceMentionIndex(): void {
    this.workspaceMentionPaths = null;
    this.workspaceMentionPathsFetchedAt = 0;
    this.workspaceMentionIndexPromise = null;
  }

  private async ensureWorkspaceMentionIndex(): Promise<string[]> {
    const now = Date.now();
    if (
      this.workspaceMentionPaths &&
      now - this.workspaceMentionPathsFetchedAt < CutieSidebarProvider.WORKSPACE_MENTION_INDEX_TTL_MS
    ) {
      return this.workspaceMentionPaths;
    }
    if (this.workspaceMentionIndexPromise) {
      return this.workspaceMentionIndexPromise;
    }
    this.workspaceMentionIndexPromise = (async (): Promise<string[]> => {
      if (!getWorkspaceRootPath()) {
        this.workspaceMentionPaths = [];
        this.workspaceMentionPathsFetchedAt = Date.now();
        return [];
      }
      const exclude = "**/{node_modules,.git,.svn,.hg,dist,build,out,.next,.turbo,target}/**";
      let uris: vscode.Uri[] = [];
      try {
        uris = await vscode.workspace.findFiles("**/*", exclude, 2500);
      } catch {
        uris = [];
      }
      const paths = uris
        .map((uri) => toWorkspaceRelativePath(uri))
        .filter((p): p is string => typeof p === "string" && p.length > 0 && !isIgnoredWorkspacePath(p));
      this.workspaceMentionPaths = paths;
      this.workspaceMentionPathsFetchedAt = Date.now();
      return paths;
    })();
    try {
      return await this.workspaceMentionIndexPromise;
    } finally {
      this.workspaceMentionIndexPromise = null;
    }
  }

  resolveWebviewView(webviewView: vscode.WebviewView): void {
    this.view = webviewView;
    this.webviewReady = false;
    webviewView.webview.options = { enableScripts: true };
    try {
      webviewView.webview.html = buildWebviewHtml(webviewView.webview);
      webviewView.webview.onDidReceiveMessage((message: WebviewMessage) => {
        void this.handleMessage(message);
      });
      this.armWebviewReadyTimeout(webviewView);
      void this.initializeView();
    } catch (error) {
      this.clearWebviewReadyTimeout();
      const message = error instanceof Error ? error.stack || error.message : String(error);
      webviewView.webview.html = buildWebviewFailureHtml(message);
      this.status = `Cutie UI failed to load: ${error instanceof Error ? error.message : String(error)}`;
      console.error("cutie-product resolveWebviewView failed", error);
      void vscode.window.showErrorMessage(this.status);
    }
  }

  async show(): Promise<void> {
    await vscode.commands.executeCommand(`${VIEW_ID}.focus`);
  }

  async runBinaryGenerateFromEditor(prefill?: string): Promise<void> {
    await this.binaryController.runBinaryGenerate(prefill);
  }

  async runBinaryValidateCommand(): Promise<void> {
    await this.binaryController.runBinaryValidate();
  }

  async runBinaryDeployCommand(): Promise<void> {
    await this.binaryController.runBinaryDeploy();
  }

  async openBinaryConfigureCommand(): Promise<void> {
    await this.binaryController.openBinaryConfigure();
  }

  stopBinaryStreamsForSignOut(): void {
    this.binaryController.stopStreamsAndLiveBubble();
  }

  async newChat(): Promise<void> {
    this.runRequestVersion += 1;
    this.currentAbortController?.abort();
    this.currentAbortController = null;
    this.binaryController.stopStreamsAndLiveBubble();
    this.binaryController.binaryActivity = [];
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

  private getChatDiffsForActiveSession(): CutieChatDiffItem[] {
    if (!this.activeSessionId) return [];
    return this.chatDiffsBySessionId.get(this.activeSessionId) ?? [];
  }

  private async recordChatWorkspaceDiff(info: CutieWorkspaceMutationInfo): Promise<void> {
    const sessionId = String(info.sessionId || "").trim() || this.activeSessionId;
    if (!sessionId) return;
    const trimmed = String(info.relativePath || "")
      .trim()
      .replace(/\\/g, "/");
    if (!trimmed) return;
    const root = getWorkspaceRootPath();
    const hasNextContent = typeof info.nextContent === "string";
    let hasAfterContent = hasNextContent;
    let after = hasNextContent ? info.nextContent || "" : "";
    if (!hasNextContent && root) {
      const uri = vscode.Uri.file(path.join(root, ...trimmed.split("/").filter(Boolean)));
      try {
        const raw = await vscode.workspace.fs.readFile(uri);
        after = Buffer.from(raw).toString("utf8");
        hasAfterContent = true;
      } catch {
        after = "";
      }
    }
    let before = typeof info.previousContent === "string" ? info.previousContent : "";
    if (before.length > CutieSidebarProvider.MAX_FILE_CHARS_FOR_PATCH) {
      before = `${before.slice(0, CutieSidebarProvider.MAX_FILE_CHARS_FOR_PATCH)}\n\n/* … truncated before snapshot … */\n`;
    }
    if (after.length > CutieSidebarProvider.MAX_FILE_CHARS_FOR_PATCH) {
      after = `${after.slice(0, CutieSidebarProvider.MAX_FILE_CHARS_FOR_PATCH)}\n\n/* … truncated after snapshot … */\n`;
    }
    let patch =
      hasAfterContent
        ? createTwoFilesPatch(trimmed, trimmed, before, after, "", "", { context: 3 })
        : `Inline diff preview unavailable for ${trimmed}.\n\nCutie changed the file, but the updated file contents could not be reconstructed for the chat card.`;
    if (patch.length > CutieSidebarProvider.MAX_PATCH_CHARS) {
      patch = `${patch.slice(0, CutieSidebarProvider.MAX_PATCH_CHARS)}\n\n… patch truncated for chat preview …\n`;
    }
    const item: CutieChatDiffItem = {
      id: `cutie_chat_diff_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`,
      createdAt: new Date().toISOString(),
      runId: String(info.runId || "").trim() || this.activeRun?.id || null,
      relativePath: trimmed,
      toolName: info.toolName,
      patch,
    };
    const list = [...(this.chatDiffsBySessionId.get(sessionId) ?? [])];
    const previous = list[list.length - 1];
    if (
      previous &&
      previous.runId === item.runId &&
      previous.relativePath === item.relativePath &&
      previous.toolName === item.toolName &&
      previous.patch === item.patch
    ) {
      return;
    }
    list.push(item);
    while (list.length > CutieSidebarProvider.MAX_CHAT_DIFFS_PER_SESSION) {
      list.shift();
    }
    this.chatDiffsBySessionId.set(sessionId, list);
  }

  private async initializeView(): Promise<void> {
    await this.emitState();
    void this.refreshViewState();
    void this.binaryController.resumeBinaryBuildIfNeeded();
  }

  private clearWebviewReadyTimeout(): void {
    if (this.webviewReadyTimeout) {
      clearTimeout(this.webviewReadyTimeout);
      this.webviewReadyTimeout = null;
    }
  }

  private armWebviewReadyTimeout(webviewView: vscode.WebviewView): void {
    this.clearWebviewReadyTimeout();
    const bootNonce = ++this.webviewBootNonce;
    this.webviewReadyTimeout = setTimeout(() => {
      if (this.webviewBootNonce !== bootNonce || this.webviewReady || this.view !== webviewView) return;
      const message =
        "Cutie UI did not finish loading within 10 seconds. If you just updated the extension, fully restart Trae and open Cutie again.";
      this.status = `Cutie UI failed to load: ${message}`;
      webviewView.webview.html = buildWebviewFailureHtml(message);
      console.error("Cutie webview ready timeout", {
        version: getExtensionVersion(this.context),
        workspaceHash: getWorkspaceHash(),
      });
      void vscode.window.showErrorMessage(this.status);
    }, CutieSidebarProvider.WEBVIEW_READY_TIMEOUT_MS);
  }

  private async handleMessage(message: WebviewMessage): Promise<void> {
    if (message.type === "ready") {
      this.webviewReady = true;
      this.clearWebviewReadyTimeout();
      await this.emitState();
      void this.refreshViewState();
      return;
    }
    if (message.type === "webviewError") {
      this.clearWebviewReadyTimeout();
      const raw = String(message.message || "Unknown Cutie webview error.");
      const summary = raw.split(/\r?\n/)[0].slice(0, 240);
      this.status = `Cutie UI failed to load: ${summary}`;
      console.error("Cutie webview reported a fatal error", raw);
      void vscode.window.showErrorMessage(this.status);
      await this.emitState();
      return;
    }
    if (message.type === "refreshView") {
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
    if (message.type === "openWorkspaceFile") return this.openWorkspaceRelativePath(message.path, { mode: "editor" });
    if (message.type === "revealWorkspaceFile") return this.openWorkspaceRelativePath(message.path, { mode: "reveal" });
    if (message.type === "diffWorkspaceFile") return this.openCutieDiffForPath(message.path);
    if (message.type === "openScm") {
      void vscode.commands.executeCommand("workbench.view.scm");
      return;
    }
    if (message.type === "binaryGenerate") {
      return this.binaryController.generateBinaryBuild(String(message.intent || "").trim());
    }
    if (message.type === "binaryRefine") {
      return this.binaryController.refineBinaryBuild(String(message.intent || ""));
    }
    if (message.type === "binaryBranch") {
      return this.binaryController.branchBinaryBuild(
        String(message.intent || ""),
        String(message.checkpointId || "")
      );
    }
    if (message.type === "binaryRewind") {
      return this.binaryController.rewindBinaryBuild(String(message.checkpointId || ""));
    }
    if (message.type === "binaryExecute") {
      return this.binaryController.executeBinaryBuild(String(message.entryPoint || ""));
    }
    if (message.type === "binaryValidate") {
      return this.binaryController.validateBinaryBuild();
    }
    if (message.type === "binaryPublish") {
      return this.binaryController.publishBinaryBuild();
    }
    if (message.type === "binaryCancel") {
      return this.binaryController.cancelBinaryBuild();
    }
    if (message.type === "binaryConfigure") {
      return this.binaryController.openBinaryConfigure();
    }
    if (message.type === "binarySetTarget") {
      return this.binaryController.setBinaryTargetRuntime(String(message.runtime || "node18"));
    }
  }

  private async openWorkspaceRelativePath(
    relativePath: string,
    options: { mode: "editor" | "reveal"; preserveFocus?: boolean }
  ): Promise<void> {
    const trimmed = String(relativePath || "").trim().replace(/\\/g, "/");
    if (!trimmed) return;
    const root = getWorkspaceRootPath();
    if (!root) {
      void vscode.window.showWarningMessage("Open a workspace folder before opening files from Cutie.");
      return;
    }
    const absolutePath = path.join(root, ...trimmed.split("/").filter(Boolean));
    const uri = vscode.Uri.file(absolutePath);
    try {
      const stat = await vscode.workspace.fs.stat(uri);
      if (stat.type === vscode.FileType.Directory) {
        await vscode.commands.executeCommand("revealInExplorer", uri);
        return;
      }
      if (options.mode === "reveal") {
        await vscode.commands.executeCommand("revealInExplorer", uri);
        return;
      }
      const doc = await vscode.workspace.openTextDocument(uri);
      await vscode.window.showTextDocument(doc, {
        preview: false,
        preserveFocus: options.preserveFocus ?? false,
      });
    } catch {
      void vscode.window.showErrorMessage(`Cutie could not open “${trimmed}”. Check that the path exists in this workspace.`);
    }
  }

  private async showCutieDiffEditor(
    info: CutieWorkspaceMutationInfo,
    showOptions?: { preserveFocus?: boolean; preview?: boolean }
  ): Promise<void> {
    const trimmed = String(info.relativePath || "").trim().replace(/\\/g, "/");
    if (!trimmed) return;
    const root = getWorkspaceRootPath();
    if (!root) {
      void vscode.window.showWarningMessage("Open a workspace folder before viewing a Cutie diff.");
      return;
    }
    const absolutePath = path.join(root, ...trimmed.split("/").filter(Boolean));
    const rightUri = vscode.Uri.file(absolutePath);
    try {
      await vscode.workspace.fs.stat(rightUri);
    } catch {
      void vscode.window.showErrorMessage(`Cutie could not diff “${trimmed}” — the file is not on disk.`);
      return;
    }

    rememberMutationBefore(trimmed, info.previousContent);
    const leftUri = createCutieBeforeUri(info.previousContent);
    const baseName = path.basename(trimmed);
    const title =
      info.toolName === "write_file"
        ? `Cutie · ${baseName} (before ⟡ after)`
        : `Cutie · ${baseName} (before ⟡ after · edit)`;
    await vscode.commands.executeCommand("vscode.diff", leftUri, rightUri, title, {
      preview: showOptions?.preview ?? false,
      preserveFocus: showOptions?.preserveFocus ?? false,
    });
  }

  /** Reopen diff from the chat card using the last remembered “before” buffer for this path. */
  private async openCutieDiffForPath(relativePath: string): Promise<void> {
    const trimmed = String(relativePath || "").trim().replace(/\\/g, "/");
    const previous = takeLastMutationBefore(trimmed);
    if (previous === undefined) {
      void vscode.window.showWarningMessage(
        "No Cutie “before” snapshot is cached for that file anymore. Run Cutie again on this file, or use Source Control."
      );
      return;
    }
    await this.showCutieDiffEditor(
      {
        sessionId: this.activeSessionId || "",
        runId: this.activeRun?.id || "",
        relativePath: trimmed,
        toolName: "write_file",
        previousContent: previous,
      },
      { preserveFocus: false, preview: true }
    );
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
    this.runRequestVersion += 1;
    this.currentAbortController?.abort();
    this.currentAbortController = null;
    const session = this.sessionStore.getSession(getWorkspaceHash(), sessionId);
    if (!session) {
      this.status = "That local Cutie session is no longer available.";
      this.activeSession = null;
      this.activeSessionId = null;
      await this.emitState();
      return;
    }
    this.binaryController.stopStreamsAndLiveBubble();
    this.binaryController.binaryActivity = [];
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
    const cfg = vscode.workspace.getConfiguration("cutie-product");
    const contextPreviewChars = Math.max(1024, Math.min(24_000, cfg.get<number>("contextPreviewChars", 6000)));
    const openFilePreviewLines = Math.max(0, Math.min(120, cfg.get<number>("openFilePreviewLines", 25)));
    const maxOpenFilesInContext = Math.max(4, Math.min(24, cfg.get<number>("maxOpenFilesInContext", 12)));
    const maxToolsPerBatch = Math.max(1, Math.min(8, cfg.get<number>("maxToolsPerBatch", 4)));
    const contextReceiptWindow = Math.max(4, Math.min(32, cfg.get<number>("contextReceiptWindow", 14)));
    const investigationPreflight = cfg.get<boolean>("investigationPreflight", false);
    const objectiveBasedRuns = cfg.get<boolean>("objectiveBasedRuns", true);
    const objectiveBasedInvestigation = cfg.get<boolean>("objectiveBasedInvestigation", false);
    const maxToolSteps = Math.max(8, Math.min(128, cfg.get<number>("maxToolSteps", 48)));
    const maxWorkspaceMutations = Math.max(2, Math.min(64, cfg.get<number>("maxWorkspaceMutations", 24)));
    const unlimitedAutonomy = cfg.get<boolean>("unlimitedAutonomy", false);

    const activeEditor = vscode.window.activeTextEditor;
    const activeFile = activeEditor
      ? {
          path: toWorkspaceRelativePath(activeEditor.document.uri) || undefined,
          language: activeEditor.document.languageId,
          lineCount: activeEditor.document.lineCount,
          ...(activeEditor.selection.isEmpty
            ? { preview: activeEditor.document.getText().slice(0, contextPreviewChars) }
            : {
                selection: activeEditor.document.getText(activeEditor.selection).slice(0, contextPreviewChars),
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
        const row: Record<string, unknown> = {
          path: relativePath,
          language: editor.document.languageId,
          lineCount: editor.document.lineCount,
        };
        if (openFilePreviewLines > 0) {
          const lines = editor.document.getText().split(/\r?\n/);
          const joined = lines.slice(0, openFilePreviewLines).join("\n");
          row.preview =
            joined.length > contextPreviewChars ? `${joined.slice(0, contextPreviewChars)}\n...[truncated]` : joined;
        }
        return row;
      })
      .filter((value): value is NonNullable<typeof value> => Boolean(value))
      .slice(0, maxOpenFilesInContext);

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

    let gitStatusSummary: string | undefined;
    try {
      const gs = await this.workspaceAdapter.gitStatus();
      const out = (gs.stdout || "").trim();
      if (out) {
        gitStatusSummary = out.length > 6000 ? `${out.slice(0, 6000)}\n...[truncated]` : out;
      }
    } catch {
      /* git optional */
    }

    return {
      workspaceHash: getWorkspaceHash(),
      workspaceRootPath: getWorkspaceRootPath(),
      extensionVersion: getExtensionVersion(this.context),
      ...(activeFile ? { activeFile } : {}),
      ...(openFiles.length ? { openFiles } : {}),
      ...(diagnostics.length ? { diagnostics } : {}),
      desktop,
      latestSnapshot: this.activeSession?.snapshots?.[0] || null,
      cutieDynamicSettings: {
        maxToolsPerBatch,
        contextReceiptWindow,
        investigationPreflight,
        objectiveBasedRuns,
        objectiveBasedInvestigation,
        maxToolSteps,
        maxWorkspaceMutations,
        unlimitedAutonomy,
      },
      ...(gitStatusSummary ? { gitStatusSummary } : {}),
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
        const indexedPaths = await this.ensureWorkspaceMentionIndex();
        for (const relativePath of indexedPaths) {
          pushFile(relativePath);
        }
      }
    }

    const fileItems = Array.from(rankedFiles.values())
      .sort((a, b) => b.score - a.score || a.path.localeCompare(b.path))
      .slice(0, 6)
      .map((item) => {
        const { label, detail } = mentionDisplayForWorkspaceFile(item.path, item.detail);
        return {
          kind: "file",
          label,
          insertText: `@"${item.path}"`,
          ...(detail ? { detail } : {}),
        } satisfies CutieMentionSuggestion;
      });

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
    if (!trimmedPrompt) {
      await this.emitState();
      return;
    }

    this.status = "Preparing your Cutie run...";
    await this.emitState();

    try {
      const auth = await this.requireAuth();
      if (!auth) return;

      const session = await this.ensureSession(trimmedPrompt);
      const runRequestVersion = ++this.runRequestVersion;
      this.currentAbortController?.abort();
      const abortController = new AbortController();
      this.currentAbortController = abortController;
      this.streamingAssistantText = "";
      this.status = "Starting local Cutie runtime...";
      await this.emitState();

      try {
        const result = await this.runtime.runPrompt({
          auth,
          session,
          prompt: trimmedPrompt,
          mentions,
          signal: abortController.signal,
          callbacks: {
            onSessionChanged: async (nextSession) => {
              if (runRequestVersion !== this.runRequestVersion) return;
              this.activeSession = nextSession;
              this.activeSessionId = nextSession.id;
              this.activeRun = this.sessionStore.getLatestRun(nextSession);
              await this.emitState();
              void this.refreshDesktopState().then(() => this.emitState());
            },
            onStatusChanged: async (status, run) => {
              if (runRequestVersion !== this.runRequestVersion) return;
              this.status = status;
              this.activeRun = run;
              if (!run || run.status !== "running") {
                this.streamingAssistantText = "";
              }
              await this.emitState();
              void this.refreshDesktopState().then(() => this.emitState());
            },
            onAssistantDelta: async (_delta, accumulated) => {
              if (runRequestVersion !== this.runRequestVersion) return;
              this.streamingAssistantText = accumulated;
              await this.emitState();
            },
            onWorkspaceFileMutated: async (info) => {
              if (runRequestVersion !== this.runRequestVersion) return;
              await this.recordChatWorkspaceDiff(info);
              await this.emitState();
              const cfg = vscode.workspace.getConfiguration("cutie-product");
              const autoOpenDiff = cfg.get<boolean>("autoOpenDiff", false) !== false;
              if (autoOpenDiff) {
                await this.showCutieDiffEditor(info, { preserveFocus: true, preview: true });
              } else {
                rememberMutationBefore(info.relativePath, info.previousContent);
              }
              if (cfg.get<boolean>("showDiffToast", false)) {
                void vscode.window.showInformationMessage(
                  `Cutie updated ${info.relativePath} — compare before and after in the diff editor.`
                );
              }
            },
          },
        });

        if (runRequestVersion !== this.runRequestVersion) return;
        this.activeSession = result.session;
        this.activeSessionId = result.session.id;
        this.activeRun = result.run;
        this.streamingAssistantText = "";
        this.status =
          result.run.status === "completed"
            ? "Cutie completed the run."
            : result.run.status === "needs_guidance"
              ? "Cutie needs guidance to keep making real progress."
            : result.run.status === "canceled"
              ? "Cutie run cancelled."
              : result.run.error
                ? `Cutie stopped: ${result.run.error}`
                : "Cutie stopped early.";
      } catch (error) {
        if (runRequestVersion !== this.runRequestVersion) return;
        const message = error instanceof Error ? error.message : String(error);
        this.status = `Cutie failed: ${message}`;
        void vscode.window.showErrorMessage(this.status);
      } finally {
        if (this.currentAbortController === abortController) {
          this.currentAbortController = null;
        }
        if (runRequestVersion !== this.runRequestVersion) return;
        await this.refreshDesktopState();
        await this.emitState();
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.status = `Cutie failed: ${message}`;
      void vscode.window.showErrorMessage(this.status);
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
            goal: run.goal,
            goalSatisfied: run.goalSatisfied,
            lastMeaningfulProgressAtStep: run.lastMeaningfulProgressAtStep ?? null,
            lastMeaningfulProgressSummary: run.lastMeaningfulProgressSummary || null,
            repairAttemptCount: run.repairAttemptCount,
            escalationState: run.escalationState,
            stuckReason: run.stuckReason || null,
            suggestedNextAction: run.suggestedNextAction || null,
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
    const withStream =
      this.streamingAssistantText.trim() === ""
        ? messages
        : [
            ...messages,
            {
              id: "__streaming__",
              role: "assistant" as const,
              content: this.streamingAssistantText,
              createdAt: new Date().toISOString(),
              ...(this.activeRun ? { runId: this.activeRun.id } : {}),
            },
          ];
    const bubble = this.binaryController.getLiveBubble();
    if (!bubble) return withStream;
    return [
      ...withStream,
      {
        id: bubble.messageId,
        role: "assistant" as const,
        content: bubble.content,
        createdAt: bubble.createdAt,
        presentation: "live_binary" as const,
        live: bubble.live,
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
      chatDiffs: this.getChatDiffsForActiveSession(),
      status: this.status,
      running: this.activeRun?.status === "running",
      activeRun: this.activeRun,
      desktop: this.desktopState,
      progress: buildProgressViewModel(this.activeRun),
      binary: this.binaryController.binary,
      binaryActivity: this.binaryController.binaryActivity,
      binaryLiveBubble: this.binaryController.getLiveBubble(),
    };
    this.view.webview.postMessage({ type: "state", state });
  }
}

export function activate(context: vscode.ExtensionContext) {
  try {
    registerCutieDiffBeforeProvider(context);
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
        provider.stopBinaryStreamsForSignOut();
        await provider.newChat();
      }),
      vscode.commands.registerCommand("cutie-product.stopAutomation", async () => provider.stopAutomation()),
      vscode.commands.registerCommand("cutie-product.binary.generate", async () => {
        const editor = vscode.window.activeTextEditor;
        let prefill: string | undefined;
        if (editor) {
          const selected = editor.selection.isEmpty
            ? editor.document.lineAt(editor.selection.active.line).text
            : editor.document.getText(editor.selection);
          prefill = selected.trim() || undefined;
        }
        await provider.runBinaryGenerateFromEditor(prefill);
      }),
      vscode.commands.registerCommand("cutie-product.binary.validate", async () => provider.runBinaryValidateCommand()),
      vscode.commands.registerCommand("cutie-product.binary.deploy", async () => provider.runBinaryDeployCommand()),
      vscode.commands.registerCommand("cutie-product.binary.configure", async () => provider.openBinaryConfigureCommand())
    );
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    const detail = error instanceof Error && error.stack ? error.stack.split("\n").slice(0, 4).join("\n") : "";
    void vscode.window.showErrorMessage(`CUTIE PRODUCT failed to activate: ${msg}`);
    console.error("cutie-product activate failed", error);
    if (detail) {
      console.error(detail);
    }
  }
}

export function deactivate() {}

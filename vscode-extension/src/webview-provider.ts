import * as vscode from "vscode";
import { randomUUID } from "crypto";
import {
  buildClarificationActions,
  buildContextSummary,
  buildFollowUpActions,
  buildPatchConfidence,
  classifyIntent,
  isEditLikeIntent,
} from "./assistant-ux";
import { AuthManager } from "./auth";
import { ActionRunner } from "./actions";
import { requestJson, streamJsonEvents } from "./api-client";
import {
  cancelBinaryBuild as requestBinaryCancel,
  createBinaryBuild as requestBinaryBuild,
  createBinaryBuildStream as requestBinaryBuildStream,
  getBinaryBuild as requestBinaryStatus,
  publishBinaryBuild as requestBinaryPublish,
  streamBinaryBuildEvents as requestBinaryStreamEvents,
  validateBinaryBuild as requestBinaryValidate,
} from "./binary-client";
import { ContextAttachmentSelection, ContextCollector } from "./context";
import {
  EXTENSION_NAMESPACE,
  getBaseApiUrl,
  getQwenExecutablePath,
  getQwenModel,
  getQwenOpenAiBaseUrl,
  getRuntimeBackend,
  getWorkspaceHash,
  getWorkspaceRootPath,
  MODE_KEY,
  toWorkspaceRelativePath,
  WEBVIEW_VIEW_ID,
} from "./config";
import { SessionHistoryService } from "./history";
import { CloudIndexManager } from "./indexer";
import { DraftStore } from "./draft-store";
import {
  explainQwenFailure,
  sanitizeQwenAssistantOutput,
  shouldSuppressQwenPartialOutput,
  validateQwenPreflight,
} from "./qwen-ux";
import { createPendingQwenSessionId, isPendingQwenSessionId, QwenHistoryService } from "./qwen-history";
import { QwenCodeRuntime, type QwenPromptResult, type QwenToolEvent } from "./qwen-code-runtime";
import { ToolExecutor } from "./tool-executor";
import { buildPlaygroundWebviewHtml } from "./webview-html";
import { buildQwenPrompt } from "./qwen-prompt";
import { augmentContextFromPseudoMarkup } from "./pseudo-markup-utils";
import { buildProjectLoopRecoveryMessage, containsGenericProjectClarification } from "./qwen-loop-guard";
import { containsRuntimeNoiseForContext } from "./qwen-runtime-noise";
import {
  buildSlashCommandHelpMessage,
  buildSlashStatusMessage,
  parseSlashCommand,
} from "./slash-commands";
import type {
  AssistAction,
  AssistPlan,
  AssistRunEnvelope,
  AuthState,
  BinaryBuildEvent,
  BinaryBuildPhase,
  BinaryBuildRecord,
  BinaryPanelState,
  ChatLiveEvent,
  ChatMessage,
  ChatLiveState,
  ContextConfidence,
  ContextSummary,
  FollowUpAction,
  HistoryItem,
  IntentKind,
  LiveChatState,
  Mode,
  PendingToolCall,
  RequestAuth,
  RuntimeBackend,
  RuntimePhase,
  ToolResult,
} from "./shared";

type WebviewState = {
  mode: Mode;
  runtime: RuntimeBackend;
  auth: AuthState;
  history: HistoryItem[];
  messages: ChatMessage[];
  busy: boolean;
  canUndo: boolean;
  activity: string[];
  selectedSessionId: string | null;
  contextSummary: ContextSummary;
  contextConfidence: ContextConfidence;
  intent: IntentKind;
  runtimePhase: RuntimePhase;
  followUpActions: FollowUpAction[];
  draftText: string;
  liveChat: LiveChatState | null;
  binary: BinaryPanelState;
};

type ManualContextState = {
  attachedFiles: string[];
  attachedSelection: ContextAttachmentSelection | null;
};

type LastPromptState = {
  text: string;
  intent: IntentKind;
  searchDepth: "fast" | "deep";
};

type QwenDebugAttempt = {
  requireToolUse: boolean;
  usedTools: string[];
  didMutate: boolean;
  permissionDenials: string[];
  assistantTextPreview: string;
  toolEvents: QwenToolEvent[];
};

type QwenDebugSnapshot = {
  timestamp: string;
  task: string;
  mode: Mode;
  intent: IntentKind;
  confidence: ContextConfidence;
  workspaceRoot: string | null;
  activeFile: string;
  resolvedFiles: string[];
  selectedFiles: string[];
  retriedWithToolDirective: boolean;
  attempts: QwenDebugAttempt[];
  runtimePhase: RuntimePhase;
  recentActivity: string[];
  model?: string;
  error?: string;
};

type HostedDebugSnapshot = {
  timestamp: string;
  task: string;
  mode: Mode;
  intent: IntentKind;
  confidence: ContextConfidence;
  workspaceRoot: string | null;
  activeFile: string;
  resolvedFiles: string[];
  selectedFiles: string[];
  runtimePhase: RuntimePhase;
  recentActivity: string[];
  runId?: string;
  adapter?: string;
  completionStatus?: string;
  toolCallsUsed: string[];
  assistantPreview?: string;
  error?: string;
};

const BINARY_ACTIVE_BUILD_KEY = "xpersona.binary.activeBuildId";
const BINARY_STREAM_CURSOR_KEY = "xpersona.binary.streamCursorByBuild";
const LIVE_CHAT_HEARTBEAT_MS = 900;

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

function createEmptyContextSummary(): ContextSummary {
  return {
    likelyTargets: [],
    candidateTargets: [],
    attachedFiles: [],
    memoryTargets: [],
  };
}

function createDefaultBinaryPanelState(): BinaryPanelState {
  return {
    targetEnvironment: {
      runtime: "node18",
      platform: "portable",
      packageManager: "npm",
    },
    activeBuild: null,
    busy: false,
    phase: "queued",
    progress: 0,
    streamConnected: false,
    lastEventId: null,
    previewFiles: [],
    recentLogs: [],
    reliability: null,
    artifactState: null,
    canCancel: false,
    lastAction: null,
  };
}

function formatBytes(value: number): string {
  if (!Number.isFinite(value) || value <= 0) return "0 B";
  if (value < 1024) return `${value} B`;
  if (value < 1024 * 1024) return `${(value / 1024).toFixed(1)} KB`;
  return `${(value / (1024 * 1024)).toFixed(1)} MB`;
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isTransientBinaryPollError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error || "");
  return /\bHTTP 5\d\d\b/i.test(message) || /\bECONNRESET\b|\bECONNREFUSED\b|\bETIMEDOUT\b/i.test(message);
}

function isBinaryBuildPending(build: BinaryBuildRecord | null | undefined): boolean {
  return Boolean(build && (build.status === "queued" || build.status === "running"));
}

function formatBinaryBuildMessage(build: BinaryBuildRecord): string {
  const lines = [
    build.status === "completed"
      ? "Portable starter bundle ready."
      : build.status === "canceled"
        ? "Portable starter bundle canceled."
      : build.status === "failed"
        ? "Portable starter bundle failed."
        : build.status === "running"
          ? "Portable starter bundle is still building."
          : "Portable starter bundle is queued on the Binary IDE server.",
    `Build: ${build.id}`,
    `Intent: ${build.intent}`,
    `Target runtime: ${build.targetEnvironment.runtime}`,
  ];

  if (build.reliability) {
    lines.push(`Reliability: ${build.reliability.status.toUpperCase()} (${build.reliability.score}/100)`);
    lines.push(build.reliability.summary);
  }
  if (build.artifactState) {
    lines.push(
      `Formation: ${build.artifactState.coverage}% formed, ${build.artifactState.runnable ? "runnable" : "not runnable yet"}`
    );
    lines.push(
      `Files: ${build.artifactState.sourceFilesReady}/${build.artifactState.sourceFilesTotal} source, ${build.artifactState.outputFilesReady} output`
    );
    if (build.artifactState.entryPoints.length) {
      lines.push(`Entry points: ${build.artifactState.entryPoints.join(", ")}`);
    }
  }
  if (build.artifact) {
    lines.push(`Artifact: ${build.artifact.fileName} (${formatBytes(build.artifact.sizeBytes)})`);
  }
  if (build.manifest) {
    lines.push(`Entrypoint: ${build.manifest.entrypoint}`);
    lines.push(`Start: ${build.manifest.startCommand}`);
  }
  if (build.publish?.downloadUrl) {
    lines.push(`Download: ${build.publish.downloadUrl}`);
  }
  if (build.errorMessage) {
    lines.push(`Error: ${build.errorMessage}`);
  }
  return lines.join("\n");
}

function isBinaryTerminalStatus(status: BinaryBuildRecord["status"] | undefined): boolean {
  return status === "completed" || status === "failed" || status === "canceled";
}

function nowIso(): string {
  return new Date().toISOString();
}

function formatToolEventLine(event: QwenToolEvent): string {
  const timestamp = String(event.timestamp || "").trim() || nowIso();
  const summary = String(event.summary || event.toolName || "(unknown tool)").trim();
  const detail = String(event.detail || "").trim();
  return `${timestamp} | ${event.phase} | ${summary}${detail ? ` | ${detail}` : ""}`;
}

function containsPseudoToolMarkupText(value: string): boolean {
  const text = String(value || "");
  if (!text) return false;
  return (
    /<tool_call>[\s\S]*?<\/tool_call>/i.test(text) ||
    /<function=[^>]+>/i.test(text) ||
    /<parameter=[^>]+>/i.test(text)
  );
}

function liveProgressForPhase(phase: string): number {
  switch (phase) {
    case "accepted":
      return 4;
    case "collecting_context":
      return 14;
    case "connecting_runtime":
      return 24;
    case "awaiting_tool_approval":
      return 32;
    case "streaming_answer":
      return 58;
    case "saving_session":
      return 88;
    case "completed":
    case "failed":
    case "canceled":
      return 100;
    default:
      return 8;
  }
}

function livePhaseFromRuntimePhase(phase: RuntimePhase): string {
  switch (phase) {
    case "collecting_context":
      return "collecting_context";
    case "waiting_for_qwen":
      return "connecting_runtime";
    case "awaiting_approval":
      return "awaiting_tool_approval";
    case "applying_result":
      return "streaming_answer";
    case "saving_session":
      return "saving_session";
    case "done":
      return "completed";
    case "failed":
      return "failed";
    case "clarify":
      return "awaiting_tool_approval";
    default:
      return "accepted";
  }
}

export class PlaygroundViewProvider implements vscode.WebviewViewProvider {
  private view: vscode.WebviewView | undefined;
  private sessionId: string | null = null;
  private didPrimeFreshChat = false;
  private bootstrapPromise: Promise<void> | null = null;
  private didBootstrap = false;
  private draftText = "";
  private draftPreviewTimer: ReturnType<typeof setTimeout> | null = null;
  private draftPreviewSequence = 0;
  private manualContext: ManualContextState = {
    attachedFiles: [],
    attachedSelection: null,
  };
  private lastPrompt: LastPromptState | null = null;
  private pendingClarification: LastPromptState | null = null;
  private readonly draftStore: DraftStore;
  private state: WebviewState;
  private binaryStreamAbort: AbortController | null = null;
  private promptAbort: AbortController | null = null;
  private binaryStreamBuildId: string | null = null;
  private liveHeartbeatTimer: ReturnType<typeof setInterval> | null = null;
  private readonly binarySeenEventIds = new Map<string, Set<string>>();
  private lastQwenDebugSnapshot: QwenDebugSnapshot | null = null;
  private lastHostedDebugSnapshot: HostedDebugSnapshot | null = null;

  constructor(
    private readonly context: vscode.ExtensionContext,
    private readonly auth: AuthManager,
    private readonly historyService: SessionHistoryService,
    private readonly qwenHistoryService: QwenHistoryService,
    private readonly qwenCodeRuntime: QwenCodeRuntime,
    private readonly contextCollector: ContextCollector,
    private readonly actionRunner: ActionRunner,
    private readonly toolExecutor: ToolExecutor,
    private readonly indexManager: CloudIndexManager
  ) {
    this.draftStore = new DraftStore(this.context.workspaceState);
    this.state = {
      // Always boot in autonomous chat mode. Plan mode is opt-in per session.
      mode: "auto",
      runtime: getRuntimeBackend(),
      auth: { kind: "none", label: "Not signed in" },
      history: [],
      messages: [],
      busy: false,
      canUndo: getRuntimeBackend() === "playgroundApi" && this.actionRunner.canUndo(),
      activity: [],
      selectedSessionId: null,
      contextSummary: createEmptyContextSummary(),
      contextConfidence: "low",
      intent: "ask",
      runtimePhase: "idle",
      followUpActions: [],
      draftText: "",
      liveChat: null,
      binary: createDefaultBinaryPanelState(),
    };

    this.auth.onDidChange(() => void this.handleAuthChange());
    this.actionRunner.onDidChangeUndo((canUndo) => {
      this.state.canUndo = this.state.runtime === "playgroundApi" && canUndo;
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
  }

  async show(prefill?: string): Promise<void> {
    await vscode.commands.executeCommand("workbench.view.extension.xpersona").then(undefined, () => undefined);
    await vscode.commands.executeCommand(`${WEBVIEW_VIEW_ID}.focus`).then(undefined, () => undefined);
    if (prefill && this.view) {
      this.view.webview.postMessage({ type: "prefill", text: prefill });
    }
  }

  async runBinaryGenerate(intent?: string): Promise<void> {
    await this.show(intent);
    const nextIntent =
      String(intent || "").trim() ||
      (await vscode.window.showInputBox({
        title: "Generate Binary IDE Portable Starter Bundle",
        prompt: "Describe the portable package bundle you want to generate.",
        ignoreFocusOut: true,
      })) ||
      "";
    if (!nextIntent.trim()) return;
    await this.generateBinaryBuild(nextIntent);
  }

  async runBinaryValidate(): Promise<void> {
    await this.show();
    await this.validateBinaryBuild();
  }

  async runBinaryDeploy(): Promise<void> {
    await this.show();
    await this.publishBinaryBuild();
  }

  async openBinaryConfiguration(): Promise<void> {
    await this.show();
    const runtimeLabel = this.state.runtime === "qwenCode" ? "Qwen Code" : "Binary IDE API";
    const nextRuntime = this.state.runtime === "qwenCode" ? "Binary IDE API" : "Qwen Code";
    const selection = await vscode.window.showQuickPick(
      [
        { label: "Set Xpersona API key", detail: "Save or clear your Xpersona Binary IDE API key.", action: "apiKey" },
        {
          label: `Switch runtime to ${nextRuntime}`,
          detail: `Current runtime: ${runtimeLabel}.`,
          action: "runtime",
        },
        {
          label: "Open Binary IDE settings",
          detail: "Open the VS Code settings UI filtered to xpersona.binary.",
          action: "settings",
        },
        ...(this.state.runtime === "playgroundApi"
          ? [{ label: "Browser sign in", detail: "Authenticate the hosted Binary IDE API in the browser.", action: "signIn" }]
          : []),
      ],
      {
        title: "Configure Binary IDE",
        ignoreFocusOut: true,
      }
    );
    if (!selection) return;

    let message = "";
    switch (selection.action) {
      case "apiKey":
        message = await this.performSetApiKey();
        break;
      case "runtime": {
        const pickedRuntime = await vscode.window.showQuickPick(
          [
            { label: "Qwen Code", runtime: "qwenCode" as const },
            { label: "Binary IDE API", runtime: "playgroundApi" as const },
          ],
          {
            title: "Choose Binary IDE Runtime",
            ignoreFocusOut: true,
          }
        );
        if (!pickedRuntime) return;
        await this.setRuntime(pickedRuntime.runtime);
        message = `Binary IDE runtime switched to ${pickedRuntime.label}.`;
        break;
      }
      case "settings":
        await vscode.commands.executeCommand("workbench.action.openSettings", "xpersona.binary");
        message = "Opened Binary IDE settings.";
        break;
      case "signIn":
        message = await this.performSignIn();
        break;
      default:
        return;
    }

    if (!message) return;
    this.appendMessage("system", message);
    this.postState();
  }

  private getDraftSessionId(): string | null {
    return this.state.selectedSessionId || this.sessionId || null;
  }

  private async loadDraftText(): Promise<void> {
    this.draftText = await this.draftStore.get(this.state.runtime, this.getDraftSessionId());
    this.state.draftText = this.draftText;
  }

  private async setDraftText(text: string): Promise<void> {
    this.draftText = String(text || "");
    this.state.draftText = this.draftText;
    await this.draftStore.set(this.state.runtime, this.getDraftSessionId(), this.draftText);
  }

  private async clearCurrentDraft(): Promise<void> {
    await this.setDraftText("");
  }

  private async setRuntime(runtime: RuntimeBackend): Promise<void> {
    if (runtime === this.state.runtime) return;
    const target = vscode.workspace.workspaceFolders?.length
      ? vscode.ConfigurationTarget.Workspace
      : vscode.ConfigurationTarget.Global;
    await vscode.workspace
      .getConfiguration(EXTENSION_NAMESPACE)
      .update("runtime", runtime, target);
    await this.refreshConfiguration();
  }

  private getRuntimePhaseForDraft(): RuntimePhase {
    return this.draftText.trim() ? "radar" : "idle";
  }

  private shouldPreserveTerminalPhase(): boolean {
    return this.state.runtimePhase === "done" || this.state.runtimePhase === "failed";
  }

  private async performSetApiKey(): Promise<string> {
    await this.auth.setApiKeyInteractive();
    await this.refreshAuth();
    await this.refreshHistory();
    return this.state.auth.kind === "none"
      ? "Xpersona Binary IDE API key cleared."
      : "Xpersona Binary IDE API key updated.";
  }

  private async performSignIn(): Promise<string> {
    if (this.state.runtime === "qwenCode") {
      return "Qwen Code uses your Xpersona Binary IDE API key. Use /key or the Key button instead of browser sign-in.";
    }
    await this.auth.signInWithBrowser();
    return "Browser sign-in opened.";
  }

  private async performSignOut(): Promise<string> {
    await this.auth.signOut();
    await this.newChat();
    await this.refreshAuth();
    await this.refreshHistory();
    return "Binary IDE auth cleared.";
  }

  private async performUndo(): Promise<string> {
    if (this.state.runtime === "qwenCode") {
      return "Undo is only available for hosted Binary IDE runs. For Qwen Code sessions, use source control or Qwen checkpoints.";
    }
    return this.actionRunner.undoLastBatch();
  }

  private async waitForBinaryBuildCompletion(
    auth: RequestAuth,
    initialBuild: BinaryBuildRecord
  ): Promise<BinaryBuildRecord> {
    let current = initialBuild;
    let lastActivity = "";
    let attempt = 0;
    let transientFailures = 0;

    while (isBinaryBuildPending(current)) {
      const nextActivity =
        current.status === "queued"
          ? "Portable starter bundle queued"
          : "Building portable starter bundle";
      if (nextActivity !== lastActivity) {
        this.pushActivity(nextActivity);
        lastActivity = nextActivity;
      }

      this.setActiveBinaryBuild(current);
      this.postState();
      await delay(Math.min(1_000 + attempt * 250, 2_500));
      try {
        current = await requestBinaryStatus(auth, current.id);
        transientFailures = 0;
      } catch (error) {
        if (!isTransientBinaryPollError(error) || transientFailures >= 4) {
          throw error;
        }

        transientFailures += 1;
        this.pushActivity(`Retrying bundle status (${transientFailures}/4)`);
        await delay(400 * transientFailures);
        continue;
      }
      attempt += 1;
    }

    return current;
  }

  private async handleSlashCommand(text: string): Promise<boolean> {
    const command = parseSlashCommand(text);
    if (!command) return false;

    await this.clearCurrentDraft();

    switch (command.kind) {
      case "help":
        this.appendMessage("system", buildSlashCommandHelpMessage());
        this.state.runtimePhase = this.getRuntimePhaseForDraft();
        this.postState();
        return true;
      case "new":
        await this.newChat();
        this.appendMessage("system", "Started a new chat.");
        this.postState();
        return true;
      case "plan":
        await this.activatePlanMode();
        return true;
      case "auto":
        await this.setMode("auto");
        this.appendMessage("system", "Mode set to Auto.");
        this.state.runtimePhase = this.getRuntimePhaseForDraft();
        this.postState();
        return true;
      case "runtime":
        await this.setRuntime(command.runtime);
        this.appendMessage(
          "system",
          `Runtime set to ${command.runtime === "qwenCode" ? "Qwen Code" : "Binary IDE API"}.`
        );
        this.state.runtimePhase = this.getRuntimePhaseForDraft();
        this.postState();
        return true;
      case "key":
        this.appendMessage("system", await this.performSetApiKey());
        this.state.runtimePhase = this.getRuntimePhaseForDraft();
        this.postState();
        return true;
      case "signin":
        this.appendMessage("system", await this.performSignIn());
        this.state.runtimePhase = this.getRuntimePhaseForDraft();
        this.postState();
        return true;
      case "signout":
        this.appendMessage("system", await this.performSignOut());
        this.state.runtimePhase = this.getRuntimePhaseForDraft();
        this.postState();
        return true;
      case "undo":
        this.appendMessage("system", await this.performUndo());
        this.state.runtimePhase = this.getRuntimePhaseForDraft();
        this.postState();
        return true;
      case "status":
        this.appendMessage(
          "system",
          buildSlashStatusMessage({
            runtime: this.state.runtime,
            mode: this.state.mode,
            authLabel: this.state.auth.label,
            runtimePhase: this.state.runtimePhase,
            sessionId: this.getDraftSessionId(),
            attachedFiles: this.manualContext.attachedFiles,
            attachedSelectionPath: this.manualContext.attachedSelection?.path || null,
          })
        );
        this.state.runtimePhase = this.getRuntimePhaseForDraft();
        this.postState();
        return true;
      case "unknown":
        this.appendMessage(
          "system",
          buildSlashCommandHelpMessage(`Unknown slash command: ${command.raw}`)
        );
        this.state.runtimePhase = this.getRuntimePhaseForDraft();
        this.postState();
        return true;
    }
  }

  async refreshConfiguration(): Promise<void> {
    const runtime = getRuntimeBackend();
    const runtimeChanged = runtime !== this.state.runtime;
    this.state.runtime = runtime;
    this.state.canUndo = runtime === "playgroundApi" && this.actionRunner.canUndo();
    if (runtimeChanged) {
      this.stopBinaryStream();
      this.stopLiveHeartbeat();
      this.sessionId = null;
      this.state.selectedSessionId = null;
      this.state.messages = [];
      this.state.liveChat = null;
      this.state.activity = [];
      this.state.followUpActions = [];
      this.setActiveBinaryBuild(null);
      this.state.runtimePhase = "idle";
      this.lastPrompt = null;
      this.pendingClarification = null;
    }
    await this.loadDraftText();
    await this.refreshAuth();
    await this.refreshHistory();
    await this.refreshDraftContext(this.draftText);
    await this.resumeBinaryBuildIfNeeded();
    this.postState();
  }

  async setMode(mode: Mode): Promise<void> {
    const nextMode = normalizeMode(mode);
    this.state.mode = nextMode;
    await this.context.workspaceState.update(MODE_KEY, nextMode);
    this.postState();
  }

  private async activatePlanMode(): Promise<void> {
    await this.setDraftText("");
    await this.setMode("plan");
    this.appendMessage("system", "Mode set to Plan.");
    this.state.runtimePhase = this.getRuntimePhaseForDraft();
    this.postState();
  }

  private async togglePlanMode(): Promise<void> {
    const nextMode: Mode = this.state.mode === "plan" ? "auto" : "plan";
    await this.setMode(nextMode);
    this.appendMessage("system", nextMode === "plan" ? "Mode set to Plan." : "Mode set to Auto.");
    this.state.runtimePhase = this.getRuntimePhaseForDraft();
    this.postState();
  }

  async refreshHistory(): Promise<void> {
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

  async newChat(): Promise<void> {
    this.clearDraftPreviewTimer();
    this.stopBinaryStream();
    this.stopLiveHeartbeat();
    this.clearBinaryEventTracking();
    this.sessionId = null;
    this.state.messages = [];
    this.state.liveChat = null;
    this.state.activity = [];
    this.state.selectedSessionId = null;
    this.state.busy = false;
    this.state.canUndo = this.state.runtime === "playgroundApi" && this.actionRunner.canUndo();
    this.state.followUpActions = [];
    this.state.binary = {
      ...createDefaultBinaryPanelState(),
      targetEnvironment: this.state.binary.targetEnvironment,
    };
    this.lastPrompt = null;
    this.pendingClarification = null;
    await this.persistActiveBinaryBuildId(null);
    await this.loadDraftText();
    this.state.runtimePhase = this.getRuntimePhaseForDraft();
    await this.refreshDraftContext(this.draftText);
    this.postState();
  }

  private async bootstrap(): Promise<void> {
    if (this.didBootstrap) return;
    if (this.bootstrapPromise) {
      await this.bootstrapPromise;
      return;
    }

    this.bootstrapPromise = (async () => {
      if (!this.didPrimeFreshChat) {
        this.didPrimeFreshChat = true;
        this.sessionId = null;
        this.state.messages = [];
        this.state.liveChat = null;
        this.state.activity = [];
        this.state.selectedSessionId = null;
        this.state.busy = false;
        this.state.canUndo = this.state.runtime === "playgroundApi" && this.actionRunner.canUndo();
        this.state.followUpActions = [];
        this.state.runtimePhase = "idle";
        this.lastPrompt = null;
        this.pendingClarification = null;
      }
      await this.loadDraftText();
      await this.refreshConfiguration();
      this.didBootstrap = true;
    })();

    try {
      await this.bootstrapPromise;
    } finally {
      this.bootstrapPromise = null;
    }
  }

  private async handleAuthChange(): Promise<void> {
    await this.refreshAuth();
    await this.refreshHistory();
    this.postState();
  }

  private async refreshAuth(): Promise<void> {
    if (this.state.runtime === "qwenCode") {
      const apiKey = await this.auth.getApiKey().catch(() => null);
      this.state.auth = apiKey
        ? { kind: "apiKey", label: "Qwen Code via Xpersona Binary IDE API key" }
        : { kind: "none", label: "Qwen Code needs an Xpersona Binary IDE API key" };
      this.postState();
      return;
    }

    this.state.auth = await this.auth.getAuthState().catch(() => ({
      kind: "none",
      label: "Not signed in",
    }));
    this.postState();
  }

  private async openSession(sessionId: string): Promise<void> {
    if (!sessionId) return;
    this.stopBinaryStream();
    this.stopLiveHeartbeat();
    this.clearBinaryEventTracking();
    this.setActiveBinaryBuild(null);
    this.state.liveChat = null;

    if (this.state.runtime === "qwenCode") {
      this.sessionId = sessionId;
      this.state.selectedSessionId = sessionId;
      this.state.messages = await this.qwenHistoryService.loadMessages(sessionId).catch(() => []);
      this.state.activity = [];
      this.state.followUpActions = [];
      const historyItem = this.state.history.find((item) => item.id === sessionId);
      if (historyItem) this.state.mode = normalizeMode(historyItem.mode);
      await this.loadDraftText();
      this.state.runtimePhase = this.getRuntimePhaseForDraft();
      await this.refreshDraftContext(this.draftText);
      this.postState();
      return;
    }

    const auth = await this.auth.getRequestAuth();
    if (!auth) return;
    this.sessionId = sessionId;
    this.state.selectedSessionId = sessionId;
    this.state.messages = await this.historyService.loadMessages(auth, sessionId).catch(() => []);
    this.state.activity = [];
    await this.loadDraftText();
    this.postState();
  }

  private async handleMessage(message: any): Promise<void> {
    if (!message || typeof message !== "object") return;

    if (message.type !== "ready") {
      await this.bootstrap();
    }

    switch (message.type) {
      case "ready":
        await this.bootstrap();
        return;
      case "sendPrompt":
        await this.sendPrompt(String(message.text || ""));
        return;
      case "confirmPlanMode":
        if (String(message.text || "").trim()) {
          await this.sendPrompt(String(message.text || ""));
        } else {
          await this.activatePlanMode();
        }
        return;
      case "togglePlanMode":
        await this.togglePlanMode();
        return;
      case "generateBinary":
        await this.generateBinaryBuild(String(message.text || this.draftText || ""));
        return;
      case "validateBinary":
        await this.validateBinaryBuild();
        return;
      case "deployBinary":
        await this.publishBinaryBuild();
        return;
      case "cancelBinary":
        await this.cancelBinaryBuild();
        return;
      case "cancelPrompt":
        this.cancelActivePrompt();
        return;
      case "configureBinary":
        await this.openBinaryConfiguration();
        return;
      case "setBinaryTarget":
        await this.setBinaryTargetRuntime(String(message.runtime || "node18"));
        return;
      case "newChat":
        await this.newChat();
        return;
      case "previewContext":
        await this.setDraftText(String(message.text || ""));
        this.queueDraftContextRefresh(this.draftText);
        return;
      case "setMode":
        await this.setMode(String(message.value || "auto") as Mode);
        return;
      case "setApiKey":
        await this.performSetApiKey();
        return;
      case "setRuntimeBackend": {
        const runtime = String(message.runtime || "");
        if (runtime === "qwenCode" || runtime === "playgroundApi") {
          await this.setRuntime(runtime);
          this.appendMessage(
            "system",
            `Binary IDE runtime switched to ${runtime === "qwenCode" ? "Qwen Code" : "Binary IDE API"}.`
          );
          this.postState();
        }
        return;
      }
      case "signIn":
        vscode.window.showInformationMessage(await this.performSignIn());
        return;
      case "signOut":
        vscode.window.showInformationMessage(await this.performSignOut());
        return;
      case "loadHistory":
        await this.refreshHistory();
        return;
      case "openSession":
        await this.openSession(String(message.id || ""));
        return;
      case "attachActiveFile":
        await this.attachActiveFile();
        return;
      case "attachSelection":
        await this.attachSelection();
        return;
      case "clearAttachedContext":
        await this.clearAttachedContext();
        return;
      case "followUpAction":
        await this.handleFollowUpAction(String(message.id || ""));
        return;
      case "undoLastChanges": {
        this.appendMessage("system", await this.performUndo());
        this.postState();
        return;
      }
      case "mentionsQuery": {
        const requestId = Number(message.requestId || 0);
        const items = await this.contextCollector.getMentionSuggestions(String(message.query || ""));
        this.view?.webview.postMessage({ type: "mentions", requestId, items });
        return;
      }
      case "copyDebugReport":
        await this.copyDebugReport();
        return;
      default:
        return;
    }
  }

  private async getQwenContextOptions(input?: {
    searchDepth?: "fast" | "deep";
    intent?: IntentKind;
    includeWorkspaceHints?: boolean;
  }) {
    const includeWorkspaceHints = input?.includeWorkspaceHints !== false;
    const hints = includeWorkspaceHints
      ? await this.qwenHistoryService.getWorkspaceHints().catch(() => ({
          recentTargets: [] as string[],
          recentIntents: [] as IntentKind[],
        }))
      : {
          recentTargets: [] as string[],
          recentIntents: [] as IntentKind[],
        };

    return {
      recentTouchedPaths: this.actionRunner.getRecentTouchedPaths(),
      attachedFiles: this.manualContext.attachedFiles,
      attachedSelection: this.manualContext.attachedSelection,
      memoryTargets: hints.recentTargets,
      searchDepth: input?.searchDepth || "fast",
      ...(input?.intent ? { intent: input.intent } : {}),
    };
  }

  private applyPreviewState(preview: Awaited<ReturnType<ContextCollector["preview"]>>): void {
    this.state.intent = preview.intent;
    this.state.contextConfidence = preview.confidence;
    this.state.contextSummary = buildContextSummary(preview);
  }

  private resetQwenInteractionState(): void {
    this.state.followUpActions = [];
    this.state.activity = [];
    this.state.runtimePhase = this.getRuntimePhaseForDraft();
    this.pendingClarification = null;
  }

  private hasManualDraftContext(): boolean {
    return Boolean(this.manualContext.attachedFiles.length || this.manualContext.attachedSelection);
  }

  private clearDraftPreviewTimer(): void {
    if (!this.draftPreviewTimer) return;
    clearTimeout(this.draftPreviewTimer);
    this.draftPreviewTimer = null;
  }

  private queueDraftContextRefresh(text: string): void {
    this.clearDraftPreviewTimer();
    if (this.state.runtime !== "qwenCode") return;

    const draft = String(text || "");
    this.draftPreviewTimer = setTimeout(() => {
      void this.refreshDraftContext(draft);
    }, draft.trim() ? 90 : 0);
  }

  private async refreshDraftContext(text: string): Promise<void> {
    if (this.state.runtime !== "qwenCode") return;

    const draft = String(text || "");
    if (!draft.trim() && !this.hasManualDraftContext()) {
      this.state.intent = "ask";
      this.state.contextConfidence = "low";
      this.state.contextSummary = createEmptyContextSummary();
      if (!this.state.busy && !this.shouldPreserveTerminalPhase()) {
        this.state.runtimePhase = "idle";
      }
      this.postState();
      return;
    }

    const sequence = ++this.draftPreviewSequence;
    const includeWorkspaceHints = Boolean(this.sessionId || this.state.selectedSessionId);
    const preview = await this.contextCollector.preview(
      draft,
      await this.getQwenContextOptions({
        searchDepth: "fast",
        intent: draft.trim() ? classifyIntent(draft) : undefined,
        includeWorkspaceHints,
      })
    );
    if (sequence !== this.draftPreviewSequence) return;
    this.applyPreviewState(preview);
    if (!this.state.busy && (!this.shouldPreserveTerminalPhase() || draft.trim())) {
      this.state.runtimePhase = draft.trim() ? "radar" : "idle";
    }
    this.postState();
  }

  private stopLiveHeartbeat(): void {
    if (!this.liveHeartbeatTimer) return;
    clearInterval(this.liveHeartbeatTimer);
    this.liveHeartbeatTimer = null;
  }

  private startLiveHeartbeat(): void {
    this.stopLiveHeartbeat();
    this.liveHeartbeatTimer = setInterval(() => {
      const liveChat = this.state.liveChat;
      if (!liveChat) {
        this.stopLiveHeartbeat();
        return;
      }
      if (liveChat.status === "done" || liveChat.status === "failed" || liveChat.status === "canceled") {
        this.stopLiveHeartbeat();
        return;
      }
      const nextProgress = Math.min(
        liveChat.mode === "answer" ? 82 : 46,
        Math.max(
          typeof liveChat.progress === "number" ? liveChat.progress : liveProgressForPhase(liveChat.phase),
          liveProgressForPhase(liveChat.phase)
        ) + 2
      );
      this.upsertMessage(liveChat.messageId, "assistant", this.getMessageById(liveChat.messageId)?.content || "", {
        presentation: "live_binary",
        live: {
          ...liveChat,
          progress: nextProgress,
          updatedAt: nowIso(),
        },
      });
      this.state.liveChat = {
        ...liveChat,
        progress: nextProgress,
        updatedAt: nowIso(),
      };
      this.postState();
    }, LIVE_CHAT_HEARTBEAT_MS);
  }

  private isPromptAbortError(error: unknown): boolean {
    if (!error) return false;
    if (error instanceof Error) {
      if (error.name === "AbortError") return true;
      return /\babort(?:ed|ing)?\b/i.test(error.message || "");
    }
    return /\babort(?:ed|ing)?\b/i.test(String(error));
  }

  private clearPromptAbort(controller?: AbortController | null): void {
    if (!this.promptAbort) return;
    if (!controller || this.promptAbort === controller) {
      this.promptAbort = null;
    }
  }

  private cancelActivePrompt(): void {
    const live = this.state.liveChat;
    if (!live || live.mode === "build" || !this.state.busy) {
      this.appendMessage("system", "There is no active response stream to cancel.");
      this.postState();
      return;
    }
    this.promptAbort?.abort();
    this.promptAbort = null;
    this.pushActivity("Canceled current response");
    this.state.runtimePhase = "canceled";
    this.applyChatLiveEvent({
      type: "canceled",
      text: "Canceled current response.",
      phase: "canceled",
    });
    this.state.busy = false;
    this.postState();
  }

  private getMessageById(id: string): ChatMessage | null {
    return this.state.messages.find((message) => message.id === id) || null;
  }

  private createLiveAssistantMessage(input: {
    transport: ChatLiveState["transport"];
    mode?: ChatLiveState["mode"];
    phase?: string;
    latestActivity?: string;
    content?: string;
  }): string {
    const messageId = randomUUID();
    const live: LiveChatState = {
      messageId,
      mode: input.mode || "shell",
      status: "pending",
      phase: input.phase || "accepted",
      transport: input.transport,
      progress: liveProgressForPhase(input.phase || "accepted"),
      latestActivity: input.latestActivity,
      startedAt: nowIso(),
      updatedAt: nowIso(),
    };
    this.state.liveChat = live;
    this.upsertMessage(messageId, "assistant", input.content || "", {
      presentation: "live_binary",
      live,
    });
    this.startLiveHeartbeat();
    return messageId;
  }

  private updateLiveAssistant(input: Partial<LiveChatState> & { content?: string; role?: ChatMessage["role"] }): void {
    const current = this.state.liveChat;
    if (!current) return;
    const message = this.getMessageById(current.messageId);
    const nextLive: LiveChatState = {
      ...current,
      ...input,
      messageId: current.messageId,
      updatedAt: nowIso(),
      progress:
        typeof input.progress === "number"
          ? input.progress
          : typeof current.progress === "number"
            ? current.progress
            : liveProgressForPhase(input.phase || current.phase),
    };
    if (nextLive.mode === "answer" && nextLive.status === "pending") {
      nextLive.status = "streaming";
    }
    this.state.liveChat = nextLive;
    this.upsertMessage(current.messageId, input.role || "assistant", input.content ?? message?.content ?? "", {
      presentation: "live_binary",
      live: nextLive,
    });
  }

  private resolveLiveAssistant(input: {
    content: string;
    status?: "done" | "failed" | "canceled";
    mode?: ChatLiveState["mode"];
    phase?: string;
    latestActivity?: string;
    latestLog?: string;
    latestFile?: string;
    role?: ChatMessage["role"];
  }): void {
    const current = this.state.liveChat;
    if (!current) return;
    const nextLive: ChatLiveState = {
      ...current,
      mode: input.mode || current.mode,
      status: input.status || "done",
      phase: input.phase || (input.status === "failed" ? "failed" : input.status === "canceled" ? "canceled" : "completed"),
      progress: 100,
      latestActivity: input.latestActivity || current.latestActivity,
      latestLog: input.latestLog || current.latestLog,
      latestFile: input.latestFile || current.latestFile,
      updatedAt: nowIso(),
    };
    this.upsertMessage(current.messageId, input.role || "assistant", input.content, {
      presentation: "live_binary",
      live: nextLive,
    });
    this.state.liveChat = null;
    this.stopLiveHeartbeat();
  }

  private applyChatLiveEvent(event: ChatLiveEvent): void {
    if (event.type === "accepted") {
      this.createLiveAssistantMessage({
        transport: event.transport,
        mode: event.mode || "shell",
        phase: event.phase || "accepted",
      });
      return;
    }

    if (!this.state.liveChat) return;

    switch (event.type) {
      case "phase":
        this.updateLiveAssistant({
          phase: event.phase,
          status: event.status || this.state.liveChat.status,
          progress:
            typeof event.progress === "number" ? event.progress : liveProgressForPhase(event.phase),
          latestActivity: event.latestActivity || this.state.liveChat.latestActivity,
        });
        return;
      case "activity":
        this.updateLiveAssistant({
          latestActivity: event.activity,
          phase: event.phase || this.state.liveChat.phase,
          progress: liveProgressForPhase(event.phase || this.state.liveChat.phase),
        });
        return;
      case "partial_text":
        this.updateLiveAssistant({
          mode: "answer",
          status: "streaming",
          phase: event.phase || "streaming_answer",
          progress: Math.max(this.state.liveChat.progress || 0, liveProgressForPhase("streaming_answer")),
          content: event.text,
        });
        return;
      case "build_attached":
        this.updateLiveAssistant({
          mode: "build",
          transport: "binary",
          buildId: event.buildId,
          phase: event.phase || "planning",
          progress: typeof event.progress === "number" ? event.progress : liveProgressForPhase(event.phase || "planning"),
        });
        return;
      case "build_event":
        this.updateLiveAssistant({
          mode: "build",
          transport: "binary",
          phase: event.phase || this.state.liveChat.phase,
          progress:
            typeof event.progress === "number"
              ? event.progress
              : this.state.liveChat.progress,
          latestLog: event.latestLog || this.state.liveChat.latestLog,
          latestFile: event.latestFile || this.state.liveChat.latestFile,
        });
        return;
      case "tool_approval":
        this.updateLiveAssistant({
          phase: "awaiting_tool_approval",
          latestActivity: event.activity,
          progress: liveProgressForPhase("awaiting_tool_approval"),
        });
        return;
      case "final":
        this.resolveLiveAssistant({
          content: event.text,
          status: "done",
          mode: this.state.liveChat.mode === "build" ? "build" : "answer",
          phase: "completed",
        });
        return;
      case "failed":
        this.resolveLiveAssistant({
          content: event.text,
          status: "failed",
          mode: this.state.liveChat.mode,
          phase: event.phase || "failed",
          role: "assistant",
        });
        return;
      case "canceled":
        this.resolveLiveAssistant({
          content: event.text || "Binary IDE canceled the active run.",
          status: "canceled",
          mode: this.state.liveChat.mode,
          phase: event.phase || "canceled",
        });
        return;
      default:
        return;
    }
  }

  private getActiveEditorPath(): string | null {
    const editor = vscode.window.activeTextEditor;
    if (!editor) return null;
    return toWorkspaceRelativePath(editor.document.uri);
  }

  private stopBinaryStream(): void {
    this.binaryStreamAbort?.abort();
    this.binaryStreamAbort = null;
    this.binaryStreamBuildId = null;
    this.state.binary.streamConnected = false;
  }

  private clearBinaryEventTracking(buildId?: string | null): void {
    if (buildId) {
      this.binarySeenEventIds.delete(buildId);
      return;
    }
    this.binarySeenEventIds.clear();
  }

  private rememberBinaryEvent(buildId: string, eventId: string): boolean {
    const next = this.binarySeenEventIds.get(buildId) || new Set<string>();
    if (next.has(eventId)) return false;
    next.add(eventId);
    if (next.size > 256) {
      const oldest = next.values().next().value;
      if (oldest) next.delete(oldest);
    }
    this.binarySeenEventIds.set(buildId, next);
    return true;
  }

  private async persistActiveBinaryBuildId(buildId: string | null): Promise<void> {
    await this.context.workspaceState.update(BINARY_ACTIVE_BUILD_KEY, buildId);
  }

  private getPersistedBinaryCursor(buildId: string): string | null {
    const raw = this.context.workspaceState.get<Record<string, string | null>>(BINARY_STREAM_CURSOR_KEY) || {};
    const value = raw[buildId];
    return typeof value === "string" && value.trim() ? value.trim() : null;
  }

  private async persistBinaryCursor(buildId: string, eventId: string | null): Promise<void> {
    const raw = this.context.workspaceState.get<Record<string, string | null>>(BINARY_STREAM_CURSOR_KEY) || {};
    const next = { ...raw };
    if (eventId) next[buildId] = eventId;
    else delete next[buildId];
    await this.context.workspaceState.update(BINARY_STREAM_CURSOR_KEY, next);
  }

  private deriveBinaryPhase(build: BinaryBuildRecord | null): BinaryBuildPhase | undefined {
    if (!build) return undefined;
    if (build.phase) return build.phase;
    if (build.status === "completed") return "completed";
    if (build.status === "failed") return "failed";
    if (build.status === "canceled") return "canceled";
    return build.status === "running" ? "planning" : "queued";
  }

  private phaseProgressLabel(phase: BinaryBuildPhase | undefined): string {
    switch (phase) {
      case "planning":
        return "Designing bundle plan";
      case "materializing":
        return "Writing source files";
      case "installing":
        return "Installing dependencies";
      case "compiling":
        return "Compiling generated source";
      case "validating":
        return "Scoring reliability";
      case "packaging":
        return "Sealing portable bundle";
      case "completed":
        return "Portable starter bundle ready";
      case "failed":
        return "Portable starter bundle failed";
      case "canceled":
        return "Portable starter bundle canceled";
      default:
        return "Queued for build";
    }
  }

  private syncBinaryPanelFromBuild(build: BinaryBuildRecord | null): void {
    this.state.binary.activeBuild = build;
    this.state.binary.phase = this.deriveBinaryPhase(build);
    this.state.binary.progress = build?.progress ?? (build?.status === "completed" ? 100 : 0);
    this.state.binary.previewFiles = build?.preview?.files || [];
    this.state.binary.recentLogs = build?.preview?.recentLogs || [];
    this.state.binary.reliability = build?.reliability || null;
    this.state.binary.artifactState = build?.artifactState || null;
    this.state.binary.canCancel = Boolean(build?.cancelable && isBinaryBuildPending(build));
    if (build?.targetEnvironment) {
      this.state.binary.targetEnvironment = build.targetEnvironment;
    }
  }

  private setActiveBinaryBuild(build: BinaryBuildRecord | null): void {
    this.syncBinaryPanelFromBuild(build);
    if (build && this.state.liveChat && (this.state.liveChat.mode === "build" || this.state.liveChat.buildId === build.id)) {
      const latestFile = build.artifactState?.latestFile || build.preview?.files?.[0]?.path;
      const latestLog = build.preview?.recentLogs?.slice(-1)[0];
      if (isBinaryTerminalStatus(build.status)) {
        this.resolveLiveAssistant({
          content: formatBinaryBuildMessage(build),
          status: build.status === "canceled" ? "canceled" : build.status === "failed" ? "failed" : "done",
          mode: "build",
          phase: build.phase || (build.status === "completed" ? "completed" : build.status),
          latestActivity: this.phaseProgressLabel(build.phase),
          latestLog,
          latestFile,
          role: build.status === "completed" ? "assistant" : "assistant",
        });
      } else {
        this.updateLiveAssistant({
          mode: "build",
          transport: "binary",
          buildId: build.id,
          phase: build.phase || "planning",
          status: "streaming",
          progress: build.progress ?? liveProgressForPhase(build.phase || "planning"),
          latestActivity: this.phaseProgressLabel(build.phase),
          latestLog,
          latestFile,
        });
      }
    }
    void this.persistActiveBinaryBuildId(build?.id || null);
  }

  private async handleBinaryBuildEvent(event: BinaryBuildEvent): Promise<void> {
    if (!this.rememberBinaryEvent(event.buildId, event.id)) {
      return;
    }
    this.state.binary.streamConnected = true;
    this.state.binary.lastEventId = event.id;
    this.binaryStreamBuildId = event.buildId;
    await this.persistBinaryCursor(event.buildId, event.id);

    const current = this.state.binary.activeBuild?.id === event.buildId ? this.state.binary.activeBuild : null;
    switch (event.type) {
      case "build.created":
        this.applyChatLiveEvent({
          type: "build_attached",
          buildId: event.data.build.id,
          phase: event.data.build.phase || "planning",
          progress: event.data.build.progress,
        });
        this.setActiveBinaryBuild(event.data.build);
        break;
      case "phase.changed": {
        const nextBuild = current
          ? {
              ...current,
              status: event.data.status,
              phase: event.data.phase,
              progress: event.data.progress,
              logs: event.data.message ? [...current.logs, event.data.message].slice(-500) : current.logs,
            }
          : null;
        if (nextBuild) this.setActiveBinaryBuild(nextBuild);
        if (event.data.message) this.pushActivity(event.data.message);
        else this.pushActivity(this.phaseProgressLabel(event.data.phase));
        this.applyChatLiveEvent({
          type: "build_event",
          eventType: event.type,
          phase: event.data.phase,
          progress: event.data.progress,
          latestLog: event.data.message,
        });
        break;
      }
      case "plan.updated":
        if (current) {
          this.setActiveBinaryBuild({
            ...current,
            preview: {
              ...(current.preview || { files: [], recentLogs: [] }),
              plan: event.data.plan,
            },
          });
        }
        break;
      case "file.updated":
        this.applyChatLiveEvent({
          type: "build_event",
          eventType: event.type,
          phase: current?.phase || "materializing",
          progress: current?.progress,
          latestFile: event.data.path,
        });
        if (current) {
          const files = [event.data, ...(current.preview?.files || []).filter((item) => item.path !== event.data.path)].slice(0, 24);
          this.setActiveBinaryBuild({
            ...current,
            preview: {
              plan: current.preview?.plan || null,
              files,
              recentLogs: current.preview?.recentLogs || [],
            },
          });
        }
        break;
      case "log.chunk":
        this.applyChatLiveEvent({
          type: "build_event",
          eventType: event.type,
          phase: current?.phase || "installing",
          progress: current?.progress,
          latestLog: String(event.data.chunk || "").trim(),
        });
        if (current) {
          const chunk = String(event.data.chunk || "").trim();
          this.setActiveBinaryBuild({
            ...current,
            logs: [...current.logs, chunk].slice(-500),
            preview: {
              plan: current.preview?.plan || null,
              files: current.preview?.files || [],
              recentLogs: [...(current.preview?.recentLogs || []), chunk].slice(-80),
            },
          });
        }
        break;
      case "reliability.delta":
        this.applyChatLiveEvent({
          type: "build_event",
          eventType: event.type,
          phase: current?.phase || "validating",
          progress: current?.progress,
        });
        if (current) {
          this.setActiveBinaryBuild({
            ...current,
            reliability: event.data.report,
          });
        }
        break;
      case "artifact.delta":
        this.applyChatLiveEvent({
          type: "build_event",
          eventType: event.type,
          phase: current?.phase || "materializing",
          progress: current?.progress,
          latestFile: event.data.artifactState.latestFile,
        });
        if (current) {
          this.setActiveBinaryBuild({
            ...current,
            artifactState: event.data.artifactState,
          });
        }
        break;
      case "checkpoint.saved":
        this.applyChatLiveEvent({
          type: "build_event",
          eventType: event.type,
          phase: event.data.checkpoint.phase,
          progress: current?.progress,
          latestFile: event.data.checkpoint.preview?.files?.[0]?.path,
          latestLog: event.data.checkpoint.preview?.recentLogs?.slice(-1)[0],
        });
        if (current) {
          this.setActiveBinaryBuild({
            ...current,
            preview: event.data.checkpoint.preview || current.preview || null,
            manifest: event.data.checkpoint.manifest || current.manifest || null,
            reliability: event.data.checkpoint.reliability || current.reliability || null,
            artifactState: event.data.checkpoint.artifactState || current.artifactState || null,
            artifact: event.data.checkpoint.artifact || current.artifact || null,
          });
        }
        break;
      case "artifact.ready":
        this.applyChatLiveEvent({
          type: "build_event",
          eventType: event.type,
          phase: "packaging",
          progress: 96,
        });
        if (current) {
          this.setActiveBinaryBuild({
            ...current,
            artifact: event.data.artifact,
            manifest: event.data.manifest,
          });
        }
        break;
      case "build.completed":
      case "build.failed":
      case "build.canceled":
        this.setActiveBinaryBuild(event.data.build);
        break;
      case "heartbeat":
        this.applyChatLiveEvent({
          type: "build_event",
          eventType: event.type,
          phase: event.data.phase || current?.phase || "planning",
          progress: event.data.progress ?? current?.progress,
        });
        if (current) {
          this.setActiveBinaryBuild({
            ...current,
            phase: event.data.phase || current.phase,
            progress: event.data.progress ?? current.progress,
          });
        }
        break;
      default:
        break;
    }

    this.postState();
  }

  private async followBinaryBuildStream(input: {
    auth: RequestAuth;
    buildId?: string;
    create?: Omit<Parameters<typeof requestBinaryBuildStream>[0], "signal" | "onEvent">;
  }): Promise<BinaryBuildRecord | null> {
    this.stopBinaryStream();
    const abort = new AbortController();
    this.binaryStreamAbort = abort;
    this.state.binary.streamConnected = false;
    this.postState();

    try {
      if (input.create) {
        await requestBinaryBuildStream({
          ...input.create,
          signal: abort.signal,
          onEvent: (event) => this.handleBinaryBuildEvent(event),
        });
      } else if (input.buildId) {
        await requestBinaryStreamEvents({
          auth: input.auth,
          buildId: input.buildId,
          cursor: this.getPersistedBinaryCursor(input.buildId),
          signal: abort.signal,
          onEvent: (event) => this.handleBinaryBuildEvent(event),
        });
      }
      return this.state.binary.activeBuild;
    } finally {
      if (this.binaryStreamAbort === abort) {
        this.binaryStreamAbort = null;
        this.binaryStreamBuildId = null;
        this.state.binary.streamConnected = false;
        this.postState();
      }
    }
  }

  private async resumeBinaryBuildIfNeeded(): Promise<void> {
    if (this.state.runtime !== "playgroundApi") return;
    const buildId = this.context.workspaceState.get<string>(BINARY_ACTIVE_BUILD_KEY);
    if (!buildId) return;
    if (this.binaryStreamBuildId === buildId && this.binaryStreamAbort) return;

    const auth = await this.auth.getRequestAuth();
    if (!auth) return;

    try {
      const build = await requestBinaryStatus(auth, buildId);
      this.setActiveBinaryBuild(build);
      if (isBinaryBuildPending(build)) {
        void this.followBinaryBuildStream({
          auth,
          buildId,
        }).catch(() => undefined);
      }
    } catch {
      // Ignore stale persisted build ids.
    }
  }

  private async setBinaryTargetRuntime(runtime: string): Promise<void> {
    const nextRuntime = runtime === "node20" ? "node20" : "node18";
    this.state.binary.targetEnvironment = {
      ...this.state.binary.targetEnvironment,
      runtime: nextRuntime,
    };
    this.postState();
  }

  private async attachActiveFile(): Promise<void> {
    const activePath = this.getActiveEditorPath();
    if (!activePath) {
      vscode.window.showInformationMessage("Open a workspace file before attaching context.");
      return;
    }

    this.manualContext.attachedFiles = Array.from(
      new Set([activePath, ...this.manualContext.attachedFiles].map((value) => String(value || "").trim()))
    ).slice(0, 4);
    await this.refreshDraftContext(this.draftText);
  }

  private async attachSelection(): Promise<void> {
    const editor = vscode.window.activeTextEditor;
    const activePath = this.getActiveEditorPath();
    if (!editor || !activePath) {
      vscode.window.showInformationMessage("Open a workspace file before attaching a selection.");
      return;
    }

    const rawSelection = editor.selection.isEmpty
      ? editor.document.lineAt(editor.selection.active.line).text
      : editor.document.getText(editor.selection);
    const trimmed = rawSelection.trim();
    if (!trimmed) {
      vscode.window.showInformationMessage("Select code or place the cursor on a useful line first.");
      return;
    }

    this.manualContext.attachedSelection = {
      path: activePath,
      content: trimmed,
      summary: trimmed.replace(/\s+/g, " ").slice(0, 90),
    };
    this.manualContext.attachedFiles = Array.from(
      new Set([activePath, ...this.manualContext.attachedFiles].map((value) => String(value || "").trim()))
    ).slice(0, 4);
    await this.refreshDraftContext(this.draftText);
  }

  private async clearAttachedContext(): Promise<void> {
    this.manualContext = {
      attachedFiles: [],
      attachedSelection: null,
    };
    await this.refreshDraftContext(this.draftText);
  }

  private async generateBinaryBuild(rawIntent: string): Promise<void> {
    const intent = rawIntent.trim();
    if (!intent) {
      this.appendMessage("system", "Add an intent in the composer before generating a portable starter bundle.");
      this.postState();
      return;
    }
    if (this.state.binary.busy || isBinaryBuildPending(this.state.binary.activeBuild)) {
      this.appendMessage(
        "system",
        "Wait for the current portable starter bundle build to finish before starting another one."
      );
      this.postState();
      return;
    }

    const auth = await this.auth.getRequestAuth();
    if (!auth) {
      this.appendMessage("system", "Authenticate with an Xpersona API key or browser sign-in before generating a portable starter bundle.");
      this.postState();
      return;
    }

    this.state.binary.busy = true;
    this.state.binary.lastAction = "generate";
    this.pushActivity("Creating portable starter bundle");
    this.applyChatLiveEvent({
      type: "accepted",
      transport: "binary",
      mode: "build",
      phase: "accepted",
    });
    this.applyChatLiveEvent({
      type: "activity",
      activity: "Creating portable starter bundle",
      phase: "planning",
    });
    this.postState();

    try {
      const { context, retrievalHints } = await this.contextCollector.collect(intent, {
        recentTouchedPaths: this.actionRunner.getRecentTouchedPaths(),
        attachedFiles: this.manualContext.attachedFiles,
        attachedSelection: this.manualContext.attachedSelection,
        searchDepth: "fast",
        intent: classifyIntent(intent),
      });

      const createInput = {
        auth,
        intent,
        workspaceFingerprint: getWorkspaceHash(),
        historySessionId:
          this.sessionId && !isPendingQwenSessionId(this.sessionId) ? this.sessionId : undefined,
        targetEnvironment: this.state.binary.targetEnvironment,
        context: {
          activeFile: context.activeFile,
          openFiles: context.openFiles,
        },
        retrievalHints,
      };

      this.stopBinaryStream();
      this.clearBinaryEventTracking();
      this.setActiveBinaryBuild(null);
      this.state.binary.phase = "queued";
      this.state.binary.progress = 0;
      this.state.binary.streamConnected = false;
      this.state.binary.lastEventId = null;
      this.state.binary.previewFiles = [];
      this.state.binary.recentLogs = [];
      this.state.binary.reliability = null;
      this.state.binary.artifactState = null;
      this.state.binary.canCancel = false;
      this.postState();

      let finalBuild: BinaryBuildRecord | null = null;
      try {
        finalBuild = await this.followBinaryBuildStream({
          auth,
          create: createInput,
        });
      } catch (error) {
        this.pushActivity("Streaming unavailable, falling back to polling.");
        this.applyChatLiveEvent({
          type: "activity",
          activity: "Streaming unavailable, falling back to polling.",
          phase: "planning",
        });
        const streamedBuild = this.state.binary.activeBuild;
        if (streamedBuild?.id) {
          finalBuild = isBinaryBuildPending(streamedBuild)
            ? await this.waitForBinaryBuildCompletion(auth, streamedBuild)
            : streamedBuild;
        } else {
          const build = await requestBinaryBuild(createInput);
          this.setActiveBinaryBuild(build);
          finalBuild = isBinaryBuildPending(build)
            ? await this.waitForBinaryBuildCompletion(auth, build)
            : build;
        }
        if (!finalBuild) throw error;
      }

      if (finalBuild) {
        this.setActiveBinaryBuild(finalBuild);
      }
      const resolvedBuild = finalBuild || this.state.binary.activeBuild;
      if (!resolvedBuild) {
        throw new Error("Binary build finished without a build record.");
      }
      await this.persistBinaryCursor(resolvedBuild.id, this.state.binary.lastEventId || null);
      this.setActiveBinaryBuild(resolvedBuild);
      await this.refreshHistory();
    } catch (error) {
      this.applyChatLiveEvent({
        type: "failed",
        text: `Binary generation failed: ${error instanceof Error ? error.message : String(error)}`,
        phase: "failed",
      });
    } finally {
      this.state.binary.busy = false;
      this.postState();
    }
  }

  private async cancelBinaryBuild(): Promise<void> {
    const build = this.state.binary.activeBuild;
    if (!build || !isBinaryBuildPending(build)) {
      this.appendMessage("system", "There is no active portable starter bundle build to cancel.");
      this.postState();
      return;
    }

    const auth = await this.auth.getRequestAuth();
    if (!auth) {
      this.appendMessage("system", "Authenticate before canceling the current portable starter bundle.");
      this.postState();
      return;
    }

    const previousCanCancel = this.state.binary.canCancel;
    this.state.binary.canCancel = false;
    this.postState();

    try {
      const updated = await requestBinaryCancel({
        auth,
        buildId: build.id,
      });
      this.setActiveBinaryBuild(updated);
      this.pushActivity("Cancellation requested");
      this.applyChatLiveEvent({
        type: "activity",
        activity: "Cancellation requested",
        phase: "canceled",
      });
    } catch (error) {
      this.state.binary.canCancel = previousCanCancel;
      this.appendMessage(
        "system",
        `Binary cancel failed: ${error instanceof Error ? error.message : String(error)}`
      );
    } finally {
      this.postState();
    }
  }

  private async validateBinaryBuild(): Promise<void> {
    const build = this.state.binary.activeBuild;
    if (!build) {
      this.appendMessage("system", "Generate a portable starter bundle before running Binary IDE validation.");
      this.postState();
      return;
    }
    if (isBinaryBuildPending(build)) {
      this.appendMessage("system", "Wait for the current portable starter bundle build to finish before validating it.");
      this.postState();
      return;
    }
    if (build.status !== "completed") {
      this.appendMessage("system", "Only completed portable starter bundles can be validated.");
      this.postState();
      return;
    }

    const auth = await this.auth.getRequestAuth();
    if (!auth) {
      this.appendMessage("system", "Authenticate before validating the current portable starter bundle.");
      this.postState();
      return;
    }

    this.state.binary.busy = true;
    this.state.binary.lastAction = "validate";
    this.pushActivity("Validating portable starter bundle");
    this.postState();

    try {
      const updated = await requestBinaryValidate({
        auth,
        buildId: build.id,
        targetEnvironment: this.state.binary.targetEnvironment,
      });
      this.setActiveBinaryBuild(updated);
      this.appendMessage("system", formatBinaryBuildMessage(updated));
      await this.refreshHistory();
    } catch (error) {
      this.appendMessage(
        "system",
        `Binary validation failed: ${error instanceof Error ? error.message : String(error)}`
      );
    } finally {
      this.state.binary.busy = false;
      this.postState();
    }
  }

  private async publishBinaryBuild(): Promise<void> {
    const build = this.state.binary.activeBuild;
    if (!build) {
      this.appendMessage("system", "Generate a portable starter bundle before publishing it.");
      this.postState();
      return;
    }
    if (isBinaryBuildPending(build)) {
      this.appendMessage("system", "Wait for the current portable starter bundle build to finish before publishing it.");
      this.postState();
      return;
    }
    if (build.status !== "completed") {
      this.appendMessage("system", "Only completed portable starter bundles can be published.");
      this.postState();
      return;
    }

    const auth = await this.auth.getRequestAuth();
    if (!auth) {
      this.appendMessage("system", "Authenticate before publishing the current portable starter bundle.");
      this.postState();
      return;
    }

    this.state.binary.busy = true;
    this.state.binary.lastAction = "deploy";
    this.pushActivity("Publishing portable starter bundle");
    this.postState();

    try {
      const updated = await requestBinaryPublish({
        auth,
        buildId: build.id,
      });
      this.setActiveBinaryBuild(updated);
      this.appendMessage("assistant", formatBinaryBuildMessage(updated));
      await this.refreshHistory();
    } catch (error) {
      this.appendMessage(
        "system",
        `Binary publish failed: ${error instanceof Error ? error.message : String(error)}`
      );
    } finally {
      this.state.binary.busy = false;
      this.postState();
    }
  }

  private async handleFollowUpAction(id: string): Promise<void> {
    const action = this.state.followUpActions.find((item) => item.id === id);
    if (!action || action.disabled) return;

    if (action.kind === "info") return;

    if (action.kind === "prompt" && action.prompt) {
      await this.sendPrompt(action.prompt);
      return;
    }

    if (action.kind === "target" && action.targetPath && this.pendingClarification) {
      this.manualContext.attachedFiles = Array.from(
        new Set([action.targetPath, ...this.manualContext.attachedFiles].map((value) => String(value || "").trim()))
      ).slice(0, 4);
      await this.runQwenPrompt({
        text: this.pendingClarification.text,
        appendUser: false,
        searchDepth: this.pendingClarification.searchDepth,
      });
      return;
    }

    if (action.kind === "rerun") {
      const base = this.pendingClarification || this.lastPrompt;
      if (!base) return;

      if (id === "retry-more-context") {
        if (!this.manualContext.attachedFiles.length) {
          const activePath = this.getActiveEditorPath();
          if (activePath) {
            this.manualContext.attachedFiles = [activePath];
          }
        }
        if (!this.manualContext.attachedSelection) {
          const editor = vscode.window.activeTextEditor;
          const activePath = this.getActiveEditorPath();
          if (editor && activePath) {
            const rawSelection = editor.selection.isEmpty
              ? editor.document.lineAt(editor.selection.active.line).text
              : editor.document.getText(editor.selection);
            const trimmed = rawSelection.trim();
            if (trimmed) {
              this.manualContext.attachedSelection = {
                path: activePath,
                content: trimmed,
                summary: trimmed.replace(/\s+/g, " ").slice(0, 90),
              };
            }
          }
        }
      }

      await this.runQwenPrompt({
        text: base.text,
        appendUser: false,
        searchDepth: id === "search-deeper" ? "deep" : "fast",
      });
    }
  }

  private async sendPrompt(rawText: string): Promise<void> {
    const text = rawText.trim();
    if (!text || this.state.busy) return;
    this.clearDraftPreviewTimer();

    const inlinePlanMatch = /^\/plan(?:\s+([\s\S]+))?$/i.exec(text);
    if (inlinePlanMatch) {
      const planTask = String(inlinePlanMatch[1] || "").trim();
      if (planTask) {
        await this.setMode("plan");
        await this.clearCurrentDraft();
        if (this.state.runtime === "qwenCode") {
          await this.runQwenPrompt({
            text: planTask,
            appendUser: true,
            searchDepth: "fast",
          });
          return;
        }
        await this.sendPromptWithPlaygroundApi(planTask);
        return;
      }
    }

  if (await this.handleSlashCommand(text)) {
    await this.clearCurrentDraft();
    return;
  }

    await this.clearCurrentDraft();

    if (this.state.runtime === "qwenCode") {
      await this.runQwenPrompt({
        text,
        appendUser: true,
        searchDepth: "fast",
      });
      return;
    }
    await this.sendPromptWithPlaygroundApi(text);
  }

  private buildClarificationMessage(preview: Awaited<ReturnType<ContextCollector["preview"]>>): string {
    if (preview.candidateFiles.length) {
      return [
        `Context preview: ${preview.intent.toUpperCase()} | LOW confidence`,
        "I found a few possible target files and I do not want to guess before editing.",
        `Pick one of these files: ${preview.candidateFiles.slice(0, 4).join(", ")}`,
      ].join("\n");
    }

    return [
      `Context preview: ${preview.intent.toUpperCase()} | LOW confidence`,
      "I need a clearer target before editing.",
      "Attach the active file, attach a selection, or ask me to search deeper.",
    ].join("\n");
  }

  private shouldShowContextPreview(preview: Awaited<ReturnType<ContextCollector["preview"]>>): boolean {
    return Boolean(
      preview.resolvedFiles.length ||
        preview.attachedFiles.length ||
        preview.attachedSelection ||
        preview.intent === "change" ||
        preview.intent === "find" ||
        preview.intent === "explain"
    );
  }

  private shouldRequireEditClarification(
    preview: Awaited<ReturnType<ContextCollector["preview"]>>
  ): boolean {
    if (!isEditLikeIntent(preview.intent) || preview.confidence !== "low") {
      return false;
    }

    return !preview.resolvedFiles.length && !preview.attachedFiles.length && !preview.attachedSelection;
  }

  private shouldRetryQwenWithToolDirective(
    result: QwenPromptResult,
    preview: Awaited<ReturnType<ContextCollector["preview"]>>,
    input: {
      task: string;
      workspaceRoot?: string | null;
      executablePath?: string | null;
      workspaceTargets?: string[];
    }
  ): boolean {
    const isLoopLikeClarification = containsGenericProjectClarification(result.assistantText || "");
    const editOrDiscoveryIntent =
      preview.intent === "change" || preview.intent === "find" || preview.intent === "explain";
    const hasRuntimeNoise =
      !result.didMutate &&
      containsRuntimeNoiseForContext({
        text: result.assistantText || "",
        task: input.task,
        workspaceRoot: input.workspaceRoot,
        executablePath: input.executablePath,
        workspaceTargets: input.workspaceTargets,
      });
    const hasPseudoToolMarkup = containsPseudoToolMarkupText(result.assistantText || "");
    if (hasPseudoToolMarkup && editOrDiscoveryIntent && !result.didMutate) {
      return true;
    }
    if (hasRuntimeNoise && editOrDiscoveryIntent) {
      return true;
    }
    if (isLoopLikeClarification && editOrDiscoveryIntent && !result.didMutate) {
      return true;
    }
    if (result.usedTools.length > 0 || result.didMutate) return false;
    if (preview.intent !== "change" && preview.intent !== "find") return false;
    if (
      preview.confidence === "low" &&
      !preview.resolvedFiles.length &&
      !preview.selectedFiles.length &&
      !preview.activeFile
    ) {
      return false;
    }
    return true;
  }

  private async runQwenPrompt(input: {
    text: string;
    appendUser: boolean;
    searchDepth: "fast" | "deep";
  }): Promise<void> {
    const text = input.text.trim();
    if (input.appendUser) {
      this.appendMessage("user", text);
    }

    const assistantMessageId = this.createLiveAssistantMessage({
      transport: "qwen",
      mode: "shell",
      phase: "accepted",
      latestActivity: "Prompt received",
    });

    this.state.followUpActions = [];
    this.state.activity = [];
    this.pushActivity("Collecting context");
    this.state.runtimePhase = "collecting_context";
    this.state.busy = true;
    this.applyChatLiveEvent({
      type: "phase",
      phase: "collecting_context",
      status: "pending",
      progress: liveProgressForPhase("collecting_context"),
      latestActivity: "Collecting context",
    });
    this.postState();

    const workspaceRoot = getWorkspaceRootPath();
    const promptAbort = new AbortController();
    this.promptAbort = promptAbort;
    let apiKey = "";
    let preflightMessage: string | null = null;
    const hadExistingSession = Boolean(this.sessionId);
    let localSessionId = this.sessionId || createPendingQwenSessionId();
    let preview: Awaited<ReturnType<ContextCollector["preview"]>>;
    const qwenDebugAttempts: QwenDebugAttempt[] = [];
    let retriedWithToolDirective = false;

    try {
      apiKey = String((await this.auth.getApiKey()) || "");
      preflightMessage = await validateQwenPreflight({
        workspaceRoot,
        apiKey,
        qwenBaseUrl: getQwenOpenAiBaseUrl(),
        playgroundBaseUrl: getBaseApiUrl(),
        executablePath: getQwenExecutablePath(),
      });

      if (
        this.sessionId &&
        !isPendingQwenSessionId(this.sessionId) &&
        !(await this.qwenHistoryService.hasSession(this.sessionId))
      ) {
        this.sessionId = null;
        this.state.selectedSessionId = null;
        this.state.activity = [];
      }

      localSessionId = this.sessionId || createPendingQwenSessionId();
      this.sessionId = localSessionId;
      this.state.selectedSessionId = localSessionId;

      const intent = classifyIntent(text);
      preview = await this.contextCollector.preview(
        text,
        await this.getQwenContextOptions({
          searchDepth: input.searchDepth,
          intent,
          includeWorkspaceHints: hadExistingSession,
        })
      );
      if (promptAbort.signal.aborted) {
        throw new Error("Prompt aborted");
      }
      this.applyPreviewState(preview);
      this.lastPrompt = {
        text,
        intent: preview.intent,
        searchDepth: input.searchDepth,
      };
    } catch (error) {
      this.applyChatLiveEvent({
        type: "failed",
        text: `Unable to prepare Qwen Code: ${error instanceof Error ? error.message : String(error)}`,
        phase: "failed",
      });
      this.pushActivity("Failed");
      this.state.runtimePhase = "failed";
      this.state.busy = false;
      this.postState();
      return;
    }

    if (preflightMessage) {
      this.applyChatLiveEvent({
        type: "failed",
        text: preflightMessage,
        phase: "failed",
      });
      this.pushActivity("Failed");
      this.state.runtimePhase = "failed";
      this.state.busy = false;
      await this.qwenHistoryService.saveConversation({
        sessionId: localSessionId,
        mode: this.state.mode,
        title: text,
        messages: this.state.messages,
        targets: preview.resolvedFiles,
        intent: preview.intent,
      });
      await this.refreshHistory();
      this.postState();
      return;
    }

    if (this.shouldRequireEditClarification(preview)) {
      this.pendingClarification = {
        text,
        intent: preview.intent,
        searchDepth: input.searchDepth,
      };
      this.resolveLiveAssistant({
        content: this.buildClarificationMessage(preview),
        status: "done",
        mode: "answer",
        phase: "completed",
      });
      this.state.followUpActions = buildClarificationActions({
        candidateFiles: preview.candidateFiles,
      });
      this.state.runtimePhase = "clarify";
      this.state.busy = false;
      await this.qwenHistoryService.saveConversation({
        sessionId: localSessionId,
        mode: this.state.mode,
        title: text,
        messages: this.state.messages,
        targets: preview.resolvedFiles.length ? preview.resolvedFiles : preview.candidateFiles,
        intent: preview.intent,
      });
      await this.refreshHistory();
      this.postState();
      return;
    }

    this.pendingClarification = null;

    try {
      const { context, preview: fullPreview } = await this.contextCollector.collect(
        text,
        await this.getQwenContextOptions({
          searchDepth: input.searchDepth,
          intent: preview.intent,
          includeWorkspaceHints: hadExistingSession,
        })
      );
      if (promptAbort.signal.aborted) {
        throw new Error("Prompt aborted");
      }
      this.applyPreviewState(fullPreview);
      const attachedTargets = (
        fullPreview.selectedFiles.length ? fullPreview.selectedFiles : fullPreview.resolvedFiles
      ).slice(0, 3);
      if (attachedTargets.length) {
        this.pushActivity(`Context attached: ${attachedTargets.join(", ")}`);
        this.applyChatLiveEvent({
          type: "activity",
          activity: `Context attached: ${attachedTargets.join(", ")}`,
          phase: "collecting_context",
        });
      }
      this.pushActivity("Waiting for Qwen");
      this.state.runtimePhase = "waiting_for_qwen";
      this.applyChatLiveEvent({
        type: "phase",
        phase: "connecting_runtime",
        status: "pending",
        progress: liveProgressForPhase("connecting_runtime"),
        latestActivity: "Waiting for Qwen",
      });
      this.postState();
      const workspaceTargets = [
        fullPreview.activeFile || "",
        ...fullPreview.resolvedFiles,
        ...fullPreview.selectedFiles,
      ];
      const executablePath = getQwenExecutablePath() || null;
      const runPromptAttempt = async (
        requireToolUse: boolean,
        historyMessages: ChatMessage[],
        forceActionable: boolean,
        injectedSnippets?: Array<{ path: string; content: string; reason: string }>
      ): Promise<QwenPromptResult> =>
        this.qwenCodeRuntime.runPrompt({
          apiKey: String(apiKey || ""),
          mode: this.state.mode,
          abortController: promptAbort,
          prompt: buildQwenPrompt({
            task: text,
            mode: this.state.mode,
            preview: fullPreview,
            context,
            workspaceRoot,
            searchDepth: input.searchDepth,
            history: historyMessages,
            qwenExecutablePath: executablePath,
            requireToolUse,
            forceActionable,
            injectedSnippets,
          }),
          onPartial: (partial) => {
            if (
              shouldSuppressQwenPartialOutput({
                text: partial,
                task: text,
                workspaceRoot,
                executablePath,
                workspaceTargets,
              })
            ) {
              return;
            }
            const next = sanitizeQwenAssistantOutput({
              text: partial,
              task: text,
              workspaceRoot,
              executablePath,
              workspaceTargets,
            }).trim();
            if (!next) return;
            this.applyChatLiveEvent({
              type: "partial_text",
              text: next,
              phase: "streaming_answer",
            });
            this.postState();
          },
          onActivity: (activity) => {
            this.pushActivity(activity);
            if (/awaiting tool approval/i.test(activity)) {
              this.state.runtimePhase = "awaiting_approval";
              this.applyChatLiveEvent({
                type: "tool_approval",
                activity,
              });
            } else if (/applying result/i.test(activity)) {
              this.state.runtimePhase = "applying_result";
              this.applyChatLiveEvent({
                type: "activity",
                activity,
                phase: "streaming_answer",
              });
            } else {
              this.applyChatLiveEvent({
                type: "activity",
                activity,
                phase: livePhaseFromRuntimePhase(this.state.runtimePhase),
              });
            }
            this.postState();
          },
        });

      let result = await runPromptAttempt(false, this.state.messages, false);
      if (promptAbort.signal.aborted) {
        throw new Error("Prompt aborted");
      }
      qwenDebugAttempts.push({
        requireToolUse: false,
        usedTools: [...result.usedTools],
        didMutate: result.didMutate,
        permissionDenials: [...result.permissionDenials],
        assistantTextPreview: String(result.assistantText || "").slice(0, 240),
        toolEvents: [...(result.toolEvents || [])],
      });
      if (
        this.shouldRetryQwenWithToolDirective(result, fullPreview, {
          task: text,
          workspaceRoot,
          executablePath,
          workspaceTargets,
        })
      ) {
        this.pushActivity(
          this.state.mode === "plan"
            ? "Retrying with actionable plan instructions"
            : "Retrying with tool-first instructions"
        );
        this.state.runtimePhase = "waiting_for_qwen";
        retriedWithToolDirective = true;
        this.applyChatLiveEvent({
          type: "activity",
          activity:
            this.state.mode === "plan"
              ? "Retrying with actionable plan instructions"
              : "Retrying with tool-first instructions",
          phase: "connecting_runtime",
        });
        this.postState();
        const historyWithoutCurrentAssistant = this.state.messages.filter((message) => message.id !== assistantMessageId);
        const hasPseudoMarkup = /<tool_call>[\s\S]*?<\/tool_call>/i.test(result.assistantText || "");
        let injectedSnippets: Array<{ path: string; content: string; reason: string }> | undefined;
        if (hasPseudoMarkup && workspaceRoot) {
          const fallbackPaths = [
            fullPreview.activeFile || "",
            ...fullPreview.resolvedFiles,
            ...fullPreview.selectedFiles,
          ].filter(Boolean);
          injectedSnippets = await augmentContextFromPseudoMarkup(
            result.assistantText || "",
            workspaceRoot,
            fallbackPaths
          );
          if (injectedSnippets.length) {
            this.pushActivity(`Injected ${injectedSnippets.length} file(s) from workspace into retry`);
          }
        }
        result = await runPromptAttempt(
          this.state.mode === "plan" ? false : true,
          historyWithoutCurrentAssistant,
          false,
          injectedSnippets
        );
        if (promptAbort.signal.aborted) {
          throw new Error("Prompt aborted");
        }
        qwenDebugAttempts.push({
          requireToolUse: true,
          usedTools: [...result.usedTools],
          didMutate: result.didMutate,
          permissionDenials: [...result.permissionDenials],
          assistantTextPreview: String(result.assistantText || "").slice(0, 240),
          toolEvents: [...(result.toolEvents || [])],
        });

        if (
          this.shouldRetryQwenWithToolDirective(result, fullPreview, {
            task: text,
            workspaceRoot,
            executablePath,
            workspaceTargets,
          })
        ) {
          this.pushActivity("Retrying with strict actionable instructions");
          this.state.runtimePhase = "waiting_for_qwen";
          this.applyChatLiveEvent({
            type: "activity",
            activity: "Retrying with strict actionable instructions",
            phase: "connecting_runtime",
          });
          this.postState();
          result = await runPromptAttempt(
            this.state.mode === "plan" ? false : true,
            historyWithoutCurrentAssistant,
            true
          );
          if (promptAbort.signal.aborted) {
            throw new Error("Prompt aborted");
          }
          qwenDebugAttempts.push({
            requireToolUse: true,
            usedTools: [...result.usedTools],
            didMutate: result.didMutate,
            permissionDenials: [...result.permissionDenials],
            assistantTextPreview: String(result.assistantText || "").slice(0, 240),
            toolEvents: [...(result.toolEvents || [])],
          });
        }
      }

      const resolvedSessionId = localSessionId;
      this.sessionId = resolvedSessionId;
      this.state.selectedSessionId = resolvedSessionId;
      const exhaustedToolExecution =
        !result.didMutate &&
        result.usedTools.length === 0 &&
        (fullPreview.intent === "change" || fullPreview.intent === "find") &&
        this.shouldRetryQwenWithToolDirective(result, fullPreview, {
          task: text,
          workspaceRoot,
          executablePath,
          workspaceTargets,
        });
      if (exhaustedToolExecution) {
        this.pushActivity("Model returned without real tool execution");
      }
      const finalAssistantText = exhaustedToolExecution
        ? [
            buildProjectLoopRecoveryMessage({
              task: text,
              workspaceTargets,
              workspaceRoot,
            }),
            "The current model run did not execute workspace tools. Try again, or switch to Hosted runtime for stronger tool-call reliability.",
          ].join("\n\n")
        : sanitizeQwenAssistantOutput({
            text: result.assistantText || "Qwen Code finished without a final message.",
            task: text,
            workspaceRoot,
            executablePath,
            workspaceTargets,
          });
      this.applyChatLiveEvent({
        type: "final",
        text: finalAssistantText,
      });
      this.state.followUpActions = buildFollowUpActions({
        intent: fullPreview.intent,
        lastTask: text,
        preview: fullPreview,
        patchConfidence: buildPatchConfidence({
          intent: fullPreview.intent,
          preview: fullPreview,
          didMutate: result.didMutate,
        }),
      });

      for (const denial of result.permissionDenials) {
        this.pushActivity(denial);
      }

      this.pushActivity("Saving session");
      this.state.runtimePhase = "saving_session";
      this.applyChatLiveEvent({
        type: "phase",
        phase: "saving_session",
        status: "streaming",
        progress: liveProgressForPhase("saving_session"),
        latestActivity: "Saving session",
      });
      this.postState();
      await this.qwenHistoryService.saveConversation({
        sessionId: resolvedSessionId,
        mode: this.state.mode,
        title: text,
        messages: this.state.messages,
        targets: fullPreview.resolvedFiles,
        intent: fullPreview.intent,
      });
      if (promptAbort.signal.aborted) {
        throw new Error("Prompt aborted");
      }
      await this.refreshHistory();
      this.pushActivity("Done");
      this.state.runtimePhase = "done";
      this.lastQwenDebugSnapshot = {
        timestamp: nowIso(),
        task: text,
        mode: this.state.mode,
        intent: fullPreview.intent,
        confidence: fullPreview.confidence,
        workspaceRoot: workspaceRoot || null,
        activeFile: String(fullPreview.activeFile || ""),
        resolvedFiles: [...fullPreview.resolvedFiles],
        selectedFiles: [...fullPreview.selectedFiles],
        retriedWithToolDirective,
        attempts: qwenDebugAttempts,
        runtimePhase: this.state.runtimePhase,
        recentActivity: [...this.state.activity].slice(-12),
        model: getQwenModel(),
      };
    } catch (error) {
      if (this.isPromptAbortError(error)) {
        this.pushActivity("Canceled");
        this.state.runtimePhase = "canceled";
        this.applyChatLiveEvent({
          type: "canceled",
          text: "Canceled current response.",
          phase: "canceled",
        });
        return;
      }
      this.applyChatLiveEvent({
        type: "failed",
        text: explainQwenFailure(error, {
          qwenBaseUrl: getQwenOpenAiBaseUrl(),
          executablePath: getQwenExecutablePath(),
        }),
        phase: "failed",
      });
      this.pushActivity("Failed");
      this.state.runtimePhase = "failed";
      await this.qwenHistoryService.saveConversation({
        sessionId: localSessionId,
        mode: this.state.mode,
        title: text,
        messages: this.state.messages,
        targets: preview.resolvedFiles,
        intent: preview.intent,
      });
      await this.refreshHistory();
      this.lastQwenDebugSnapshot = {
        timestamp: nowIso(),
        task: text,
        mode: this.state.mode,
        intent: preview.intent,
        confidence: preview.confidence,
        workspaceRoot: workspaceRoot || null,
        activeFile: String(preview.activeFile || ""),
        resolvedFiles: [...preview.resolvedFiles],
        selectedFiles: [...preview.selectedFiles],
        retriedWithToolDirective,
        attempts: qwenDebugAttempts,
        runtimePhase: this.state.runtimePhase,
        recentActivity: [...this.state.activity].slice(-12),
        model: getQwenModel(),
        error: error instanceof Error ? error.message : String(error || "Unknown error"),
      };
    } finally {
      this.clearPromptAbort(promptAbort);
      this.state.busy = false;
      this.state.canUndo = false;
      this.postState();
    }
  }

  private buildDebugReport(): string {
    const lines = [
      "Binary IDE Debug Report",
      `Generated: ${nowIso()}`,
      `Current runtime: ${this.state.runtime}`,
      "",
    ];

    const qwen = this.lastQwenDebugSnapshot;
    if (qwen) {
      lines.push("=== Qwen Code (last run) ===");
      lines.push(`Captured: ${qwen.timestamp}`);
      lines.push(`Task: ${qwen.task}`);
      lines.push(`Mode: ${qwen.mode}`);
      lines.push(`Model: ${qwen.model || "(not captured)"}`);
      lines.push(`Intent: ${qwen.intent}`);
      lines.push(`Context confidence: ${qwen.confidence}`);
      lines.push(`Workspace root: ${qwen.workspaceRoot || "(none)"}`);
      lines.push(`Active file: ${qwen.activeFile || "(none)"}`);
      lines.push(`Resolved files: ${qwen.resolvedFiles.join(", ") || "(none)"}`);
      lines.push(`Selected files: ${qwen.selectedFiles.join(", ") || "(none)"}`);
      lines.push(`Retried tool-first: ${qwen.retriedWithToolDirective ? "yes" : "no"}`);
      lines.push(`Runtime phase: ${qwen.runtimePhase}`);
      lines.push(`Attempts: ${qwen.attempts.length}`);
      qwen.attempts.forEach((attempt, index) => {
        lines.push(
          `Attempt ${index + 1}: requireToolUse=${attempt.requireToolUse ? "yes" : "no"} | usedTools=${attempt.usedTools.join(", ") || "(none)"} | didMutate=${attempt.didMutate ? "yes" : "no"}`
        );
        if (attempt.permissionDenials.length) {
          lines.push(`Attempt ${index + 1} denials: ${attempt.permissionDenials.join(" | ")}`);
        }
        if (attempt.toolEvents.length) {
          lines.push(`Attempt ${index + 1} tool timeline:`);
          for (const event of attempt.toolEvents) {
            lines.push(`  - ${formatToolEventLine(event)}`);
          }
        } else {
          lines.push(`Attempt ${index + 1} tool timeline: (none)`);
        }
        if (attempt.assistantTextPreview) {
          lines.push(`Attempt ${index + 1} assistant preview: ${attempt.assistantTextPreview}`);
        }
      });
      if (qwen.error) lines.push(`Error: ${qwen.error}`);
      if (qwen.recentActivity.length) lines.push(`Recent activity: ${qwen.recentActivity.join(" -> ")}`);
      lines.push("");
    }

    const hosted = this.lastHostedDebugSnapshot;
    if (hosted) {
      lines.push("=== Hosted API (last run) ===");
      lines.push(`Captured: ${hosted.timestamp}`);
      lines.push(`Task: ${hosted.task}`);
      lines.push(`Mode: ${hosted.mode}`);
      lines.push(`Intent: ${hosted.intent}`);
      lines.push(`Context confidence: ${hosted.confidence}`);
      lines.push(`Workspace root: ${hosted.workspaceRoot || "(none)"}`);
      lines.push(`Active file: ${hosted.activeFile || "(none)"}`);
      lines.push(`Resolved files: ${hosted.resolvedFiles.join(", ") || "(none)"}`);
      lines.push(`Selected files: ${hosted.selectedFiles.join(", ") || "(none)"}`);
      lines.push(`Runtime phase: ${hosted.runtimePhase}`);
      lines.push(`Run ID: ${hosted.runId || "(none)"}`);
      lines.push(`Adapter: ${hosted.adapter || "(none)"}`);
      lines.push(`Completion status: ${hosted.completionStatus || "(none)"}`);
      lines.push(`Tools used: ${hosted.toolCallsUsed.join(", ") || "(none)"}`);
      if (hosted.assistantPreview) lines.push(`Assistant preview: ${hosted.assistantPreview}`);
      if (hosted.error) lines.push(`Error: ${hosted.error}`);
      if (hosted.recentActivity.length) lines.push(`Recent activity: ${hosted.recentActivity.join(" -> ")}`);
      lines.push("");
    }

    if (!qwen && !hosted) {
      lines.push("No debug snapshots captured yet. Send a prompt with Qwen Code or Hosted runtime to populate.");
    }

    return lines.join("\n").replace(/\n{3,}/g, "\n\n").trim();
  }

  private async copyDebugReport(): Promise<void> {
    const report = this.buildDebugReport();
    await vscode.env.clipboard.writeText(report);
    vscode.window.showInformationMessage("Copied Binary IDE debug report to clipboard.");
  }

  private async sendPromptWithPlaygroundApi(text: string): Promise<void> {
    this.state.busy = true;
    const promptAbort = new AbortController();
    this.promptAbort = promptAbort;
    this.appendMessage("user", text);
    this.applyChatLiveEvent({
      type: "accepted",
      transport: "playground",
      mode: "shell",
      phase: "accepted",
    });
    this.applyChatLiveEvent({
      type: "activity",
      activity: "Prompt received",
      phase: "accepted",
    });
    this.postState();

    const auth = await this.auth.getRequestAuth();
    if (!auth) {
      this.applyChatLiveEvent({
        type: "failed",
        text: "Authenticate with browser sign-in or an Xpersona API key before sending prompts.",
        phase: "failed",
      });
      this.state.busy = false;
      this.postState();
      return;
    }

    const hostedToolCallsUsed: string[] = [];
    const hostedDebugRef = { runId: undefined as string | undefined, adapter: undefined as string | undefined };
    let hostedPreview: Awaited<ReturnType<ContextCollector["collect"]>>["preview"] | null = null;
    try {
      const { context, retrievalHints, preview } = await this.contextCollector.collect(
        text,
        {
          recentTouchedPaths: this.actionRunner.getRecentTouchedPaths(),
          attachedFiles: this.manualContext.attachedFiles,
          attachedSelection: this.manualContext.attachedSelection,
          searchDepth: "fast",
          intent: classifyIntent(text),
        }
      );
      hostedPreview = preview;
      if (promptAbort.signal.aborted) {
        throw new Error("Prompt aborted");
      }

      const workspaceHash = getWorkspaceHash();
      const requestBody = {
        mode: this.state.mode,
        task: text,
        stream: true,
        orchestrationProtocol: this.state.mode === "plan" ? "batch_v1" : "tool_loop_v1",
        clientCapabilities:
          this.state.mode === "plan"
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
          extensionVersion: String(
            vscode.extensions.getExtension("playgroundai.xpersona-playground")?.packageJSON?.version || "0.0.0"
          ),
          workspaceHash,
        },
      };

      let initial: AssistRunEnvelope;
      try {
        initial = await this.requestAssistStream(auth, requestBody, promptAbort.signal);
      } catch (error) {
        if (this.isPromptAbortError(error)) {
          throw error;
        }
        this.pushActivity("Assist stream unavailable, falling back to standard response.");
        this.applyChatLiveEvent({
          type: "activity",
          activity: "Assist stream unavailable, falling back to standard response.",
          phase: "connecting_runtime",
        });
        initial = await this.requestAssist(auth, {
          ...requestBody,
          stream: false,
        }, promptAbort.signal);
      }
      if (promptAbort.signal.aborted) {
        throw new Error("Prompt aborted");
      }

      if (initial.sessionId) {
        this.sessionId = initial.sessionId;
        this.state.selectedSessionId = initial.sessionId;
      }
      this.pushActivity(
        initial.orchestrationProtocol === "tool_loop_v1"
          ? `Started run ${initial.runId || "pending"} via ${initial.adapter || "tool loop"}.`
          : "Prepared a batch response."
      );

      hostedDebugRef.runId = initial.runId;
      hostedDebugRef.adapter = initial.adapter;
      let envelope = initial;
      if (envelope.pendingToolCall && envelope.runId) {
        this.applyChatLiveEvent({
          type: "activity",
          activity: `Waiting for ${envelope.pendingToolCall.toolCall.name}`,
          phase: "awaiting_tool_approval",
        });
        envelope = await this.executeToolLoop({
          auth,
          initialEnvelope: envelope,
          workspaceFingerprint: workspaceHash,
          signal: promptAbort.signal,
          toolCallsUsed: hostedToolCallsUsed,
          debugRef: hostedDebugRef,
        });
      }
      if (promptAbort.signal.aborted) {
        throw new Error("Prompt aborted");
      }

      const assistantBody =
        this.state.mode === "plan" && envelope.plan
          ? [envelope.final || "Plan ready.", "", formatPlan(envelope.plan)].filter(Boolean).join("\n")
          : envelope.final || "No final response text was returned.";
      this.applyChatLiveEvent({
        type: "final",
        text: sanitizeQwenAssistantOutput({
          text: assistantBody,
          task: text,
          workspaceRoot: getWorkspaceRootPath(),
          executablePath: getQwenExecutablePath() || null,
          workspaceTargets: [
            preview.activeFile || "",
            ...preview.resolvedFiles,
            ...preview.selectedFiles,
          ],
        }),
      });

      if (envelope.completionStatus === "incomplete" && envelope.missingRequirements?.length) {
        this.appendMessage("system", `Missing: ${envelope.missingRequirements.join(", ")}`);
      }

      if (
        this.state.mode !== "plan" &&
        envelope.actions?.length &&
        envelope.adapter === "deterministic_batch"
      ) {
        this.appendMessage("system", "Applying deterministic batch changes locally...");
        this.postState();
        const applyReport = await this.actionRunner.apply({
          mode: this.state.mode,
          actions: envelope.actions as AssistAction[],
          auth,
          sessionId: this.sessionId || undefined,
          workspaceFingerprint: workspaceHash,
        });
        this.state.canUndo = applyReport.canUndo;
        this.appendMessage("system", applyReport.summary);
      }

      if (envelope.receipt && typeof envelope.receipt === "object") {
        const receipt = envelope.receipt as Record<string, unknown>;
        const label = String(receipt.status || "ready");
        this.pushActivity(`Receipt: ${label}.`);
      }

      this.state.runtimePhase = "done";
      this.lastHostedDebugSnapshot = {
        timestamp: nowIso(),
        task: text,
        mode: this.state.mode,
        intent: preview.intent,
        confidence: preview.confidence,
        workspaceRoot: getWorkspaceRootPath() || null,
        activeFile: String(preview.activeFile || ""),
        resolvedFiles: [...preview.resolvedFiles],
        selectedFiles: [...preview.selectedFiles],
        runtimePhase: this.state.runtimePhase,
        recentActivity: [...this.state.activity].slice(-12),
        runId: envelope.runId,
        adapter: envelope.adapter,
        completionStatus: envelope.completionStatus,
        toolCallsUsed: [...hostedToolCallsUsed],
        assistantPreview: assistantBody ? String(assistantBody).slice(0, 300) : undefined,
      };

      await this.refreshHistory();
    } catch (error) {
      if (this.isPromptAbortError(error)) {
        this.pushActivity("Canceled");
        this.state.runtimePhase = "canceled";
        this.applyChatLiveEvent({
          type: "canceled",
          text: "Canceled current response.",
          phase: "canceled",
        });
        return;
      }
      this.applyChatLiveEvent({
        type: "failed",
        text: `Request failed: ${error instanceof Error ? error.message : String(error)}`,
        phase: "failed",
      });
      this.state.runtimePhase = "failed";
      this.lastHostedDebugSnapshot = {
        timestamp: nowIso(),
        task: text,
        mode: this.state.mode,
        intent: hostedPreview?.intent ?? "ask",
        confidence: hostedPreview?.confidence ?? "low",
        workspaceRoot: getWorkspaceRootPath() || null,
        activeFile: String(hostedPreview?.activeFile ?? ""),
        resolvedFiles: hostedPreview ? [...hostedPreview.resolvedFiles] : [],
        selectedFiles: hostedPreview ? [...hostedPreview.selectedFiles] : [],
        runtimePhase: "failed",
        recentActivity: [...this.state.activity].slice(-12),
        runId: hostedDebugRef.runId,
        adapter: hostedDebugRef.adapter,
        toolCallsUsed: [...hostedToolCallsUsed],
        error: error instanceof Error ? error.message : String(error),
      };
    } finally {
      this.clearPromptAbort(promptAbort);
      this.state.busy = false;
      this.postState();
    }
  }

  private async requestAssist(
    auth: RequestAuth,
    body: Record<string, unknown>,
    signal?: AbortSignal
  ): Promise<AssistRunEnvelope> {
    const response = await requestJson<{ data?: AssistRunEnvelope }>(
      "POST",
      `${getBaseApiUrl()}/api/v1/playground/assist`,
      auth,
      body,
      { signal }
    );
    return (response?.data || response) as AssistRunEnvelope;
  }

  private async requestAssistStream(
    auth: RequestAuth,
    body: Record<string, unknown>,
    signal?: AbortSignal
  ): Promise<AssistRunEnvelope> {
    const envelope: Partial<AssistRunEnvelope> = {
      actions: [],
      final: "",
      missingRequirements: [],
    };

    await streamJsonEvents(
      "POST",
      `${getBaseApiUrl()}/api/v1/playground/assist`,
      auth,
      body,
      async (event, data) => {
        switch (event) {
          case "ack":
          case "status": {
            const message = typeof data === "string" ? data.trim() : "";
            if (!message) return;
            this.pushActivity(message);
            this.applyChatLiveEvent({
              type: "activity",
              activity: message,
              phase: event === "ack" ? "accepted" : "connecting_runtime",
            });
            this.postState();
            return;
          }
          case "activity": {
            const activity = typeof data === "string" ? data.trim() : "";
            if (!activity) return;
            this.pushActivity(activity);
            this.applyChatLiveEvent({
              type: /tool/i.test(activity)
                ? "tool_approval"
                : "activity",
              ...( /tool/i.test(activity)
                ? { activity }
                : { activity, phase: "connecting_runtime" }),
            } as ChatLiveEvent);
            this.postState();
            return;
          }
          case "plan":
            envelope.plan = data as AssistRunEnvelope["plan"];
            return;
          case "actions":
            envelope.actions = Array.isArray(data) ? (data as AssistRunEnvelope["actions"]) : [];
            return;
          case "run":
            if (data && typeof data === "object") {
              const record = data as Record<string, unknown>;
              envelope.runId = typeof record.runId === "string" ? record.runId : envelope.runId;
              envelope.adapter = record.adapter as AssistRunEnvelope["adapter"];
              envelope.loopState = (record.loopState as AssistRunEnvelope["loopState"]) || envelope.loopState;
            }
            return;
          case "tool_request":
            envelope.pendingToolCall = data as PendingToolCall;
            this.pushActivity(`Awaiting ${envelope.pendingToolCall.toolCall.name}`);
            this.applyChatLiveEvent({
              type: "tool_approval",
              activity: `Awaiting ${envelope.pendingToolCall.toolCall.name}`,
            });
            this.postState();
            return;
          case "meta":
            if (data && typeof data === "object") {
              const record = data as Partial<AssistRunEnvelope>;
              Object.assign(envelope, record);
              if (record.sessionId) {
                this.sessionId = record.sessionId;
                this.state.selectedSessionId = record.sessionId;
              }
            }
            return;
          case "partial": {
            const text = typeof data === "string" ? data : "";
            if (!text.trim()) return;
            this.applyChatLiveEvent({
              type: "partial_text",
              text,
              phase: "streaming_answer",
            });
            this.postState();
            return;
          }
          case "final":
            envelope.final = typeof data === "string" ? data : "";
            return;
          case "error": {
            const message = typeof data === "string" ? data : "Assist stream failed.";
            throw new Error(message);
          }
          default:
            return;
        }
      },
      { signal }
    );

    if (!envelope.sessionId || !envelope.decision || !envelope.validationPlan || !envelope.targetInference || !envelope.contextSelection || !envelope.completionStatus) {
      throw new Error("Assist stream completed without a usable response envelope.");
    }

    return envelope as AssistRunEnvelope;
  }

  private async continueRun(
    auth: RequestAuth,
    runId: string,
    toolResult: ToolResult,
    signal?: AbortSignal
  ): Promise<AssistRunEnvelope> {
    const response = await requestJson<{ data?: AssistRunEnvelope }>(
      "POST",
      `${getBaseApiUrl()}/api/v1/playground/runs/${encodeURIComponent(runId)}/continue`,
      auth,
      {
        toolResult,
      },
      { signal }
    );
    return (response?.data || response) as AssistRunEnvelope;
  }

  private async executeToolLoop(input: {
    auth: RequestAuth;
    initialEnvelope: AssistRunEnvelope;
    workspaceFingerprint: string;
    signal?: AbortSignal;
    toolCallsUsed?: string[];
    debugRef?: { runId?: string; adapter?: string };
  }): Promise<AssistRunEnvelope> {
    let envelope = input.initialEnvelope;
    while (envelope.pendingToolCall && envelope.runId) {
      if (input.signal?.aborted) {
        throw new Error("Prompt aborted");
      }
      const pendingToolCall: PendingToolCall = envelope.pendingToolCall;
      input.toolCallsUsed?.push(pendingToolCall.toolCall.name);
      this.pushActivity(`Step ${pendingToolCall.step}: ${pendingToolCall.toolCall.name}`);
      this.applyChatLiveEvent({
        type: "tool_approval",
        activity: `Step ${pendingToolCall.step}: ${pendingToolCall.toolCall.name}`,
      });
      this.postState();

      const toolResult = await this.toolExecutor.executeToolCall({
        pendingToolCall,
        auth: input.auth,
        sessionId: this.sessionId || undefined,
        workspaceFingerprint: input.workspaceFingerprint,
      });
      if (input.signal?.aborted) {
        throw new Error("Prompt aborted");
      }
      this.pushActivity(toolResult.summary);
      this.applyChatLiveEvent({
        type: "activity",
        activity: toolResult.summary,
        phase: "streaming_answer",
      });
      this.postState();

      if (input.debugRef) {
        input.debugRef.runId = envelope.runId;
        input.debugRef.adapter = envelope.adapter;
      }
      envelope = await this.continueRun(input.auth, envelope.runId, toolResult, input.signal);
      if (envelope.sessionId) {
        this.sessionId = envelope.sessionId;
        this.state.selectedSessionId = envelope.sessionId;
      }
      if (envelope.pendingToolCall) {
        this.pushActivity(`Queued next tool: ${envelope.pendingToolCall.toolCall.name}`);
        this.applyChatLiveEvent({
          type: "tool_approval",
          activity: `Queued next tool: ${envelope.pendingToolCall.toolCall.name}`,
        });
      }
      this.postState();
    }
    return envelope;
  }

  private appendMessage(
    role: ChatMessage["role"],
    content: string,
    extras?: Partial<Pick<ChatMessage, "presentation" | "live">>
  ): void {
    this.state.messages = [...this.state.messages, { id: randomUUID(), role, content, ...extras }];
  }

  private upsertMessage(
    id: string,
    role: ChatMessage["role"],
    content: string,
    extras?: Partial<Pick<ChatMessage, "presentation" | "live">>
  ): void {
    const nextContent = content.trim();
    const index = this.state.messages.findIndex((message) => message.id === id);
    if (index >= 0) {
      const nextMessages = [...this.state.messages];
      nextMessages[index] = { ...nextMessages[index], role, content: nextContent, ...extras };
      this.state.messages = nextMessages;
      return;
    }
    this.state.messages = [...this.state.messages, { id, role, content: nextContent, ...extras }];
  }

  private pushActivity(text: string): void {
    const next = text.trim();
    if (!next) return;
    this.state.activity = [...this.state.activity, next].slice(-24);
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
    const logoUri = webview.asWebviewUri(vscode.Uri.joinPath(this.context.extensionUri, "media", "xpersona.svg"));
    const workspaceName = vscode.workspace.workspaceFolders?.[0]?.name || "Workspace";

    return buildPlaygroundWebviewHtml({
      nonce,
      cspSource: webview.cspSource,
      scriptUri: String(scriptUri),
      logoUri: String(logoUri),
      workspaceName,
    });
  }
}

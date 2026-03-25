import * as vscode from "vscode";
import { requestJson, type RequestAuth } from "@xpersona/vscode-core";
import { classifyIntent } from "./playground-ide/assistant-ux";
import { ActionRunner } from "./playground-ide/actions";
import { ContextCollector } from "./playground-ide/context";
import { CloudIndexManager } from "./playground-ide/indexer";
import { playgroundRequestAssist, runPlaygroundToolLoop } from "./playground-ide/playground-assist-runner";
import { buildQwenPrompt } from "./playground-ide/qwen-prompt";
import { QwenCodeRuntime } from "./playground-ide/qwen-code-runtime";
import type { AssistRunEnvelope, ChatMessage, Mode } from "./playground-ide/shared";
import { ToolExecutor } from "./playground-ide/tool-executor";
import type { CutieAuthManager } from "./auth";
import { getBaseApiUrl, getBinaryIdeChatRuntime, getExtensionVersion, getQwenExecutablePath, getWorkspaceHash } from "./config";

/** Playground API validates historySessionId as UUID; Cutie local session ids are not UUIDs. */
function isPlaygroundHistorySessionUuid(value: string | null | undefined): boolean {
  const v = String(value || "").trim();
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(v);
}

function cutieMessagesToPlaygroundChat(messages: Array<{ role: string; content: string }>): ChatMessage[] {
  return messages
    .filter((m) => m.role === "user" || m.role === "assistant" || m.role === "system")
    .map((m) => ({
      id: `m_${Math.random().toString(36).slice(2, 12)}`,
      role: m.role as ChatMessage["role"],
      content: String(m.content || ""),
    }));
}

export class CutiePlaygroundChatBridge {
  private indexManager: CloudIndexManager | null = null;
  private actionRunner: ActionRunner | null = null;
  private toolExecutor: ToolExecutor | null = null;
  private contextCollector: ContextCollector | null = null;
  private readonly qwenRuntime = new QwenCodeRuntime();

  constructor(
    private readonly context: vscode.ExtensionContext,
    private readonly auth: CutieAuthManager
  ) {}

  private ensureServices(): void {
    if (this.indexManager) return;
    this.indexManager = new CloudIndexManager(this.context, () => this.auth.getRequestAuth());
    this.actionRunner = new ActionRunner();
    this.toolExecutor = new ToolExecutor(this.actionRunner, this.indexManager);
    this.contextCollector = new ContextCollector(this.indexManager);
    this.indexManager.start();
    this.context.subscriptions.push(
      vscode.workspace.onDidSaveTextDocument((document) => {
        if (!this.indexManager?.shouldTrackUri(document.uri)) return;
        this.indexManager.scheduleRebuild();
      }),
      vscode.workspace.onDidCreateFiles((event) => {
        if (!event.files.some((uri) => this.indexManager?.shouldTrackUri(uri))) return;
        this.indexManager?.scheduleRebuild();
      }),
      vscode.workspace.onDidDeleteFiles((event) => {
        if (!event.files.some((uri) => this.indexManager?.shouldTrackUri(uri))) return;
        this.indexManager?.scheduleRebuild();
      }),
      vscode.workspace.onDidRenameFiles((event) => {
        const im = this.indexManager;
        if (!im) return;
        const touched = event.files.some(
          (entry) => im.shouldTrackUri(entry.oldUri) || im.shouldTrackUri(entry.newUri)
        );
        if (!touched) return;
        im.scheduleRebuild();
      })
    );
  }

  canUndoPlaygroundBatch(): boolean {
    return getBinaryIdeChatRuntime() === "playgroundApi" && Boolean(this.actionRunner?.canUndo());
  }

  async undoLastPlaygroundBatch(): Promise<string> {
    this.ensureServices();
    if (!this.actionRunner) return "Nothing to undo.";
    return this.actionRunner.undoLastBatch();
  }

  async getOpenHandsStatus(): Promise<{
    status: "healthy" | "missing_config" | "unauthorized" | "unreachable";
    message: string;
    details?: string;
  }> {
    const auth: RequestAuth | null = await this.auth.getRequestAuth();
    if (!auth) {
      return {
        status: "unreachable",
        message: "Sign in to verify OpenHands.",
      };
    }
    const response = await requestJson<{
      data?: {
        status?: "healthy" | "missing_config" | "unauthorized" | "unreachable";
        message?: string;
        details?: string;
      };
    }>("GET", `${getBaseApiUrl()}/api/v1/playground/openhands/health`, auth);
    const health = (
      response &&
      typeof response === "object" &&
      "data" in response &&
      response.data &&
      typeof response.data === "object"
        ? response.data
        : response
    ) as
      | {
          status?: "healthy" | "missing_config" | "unauthorized" | "unreachable";
          message?: string;
          details?: string;
        }
      | undefined;
    return {
      status: health?.status === "healthy" ? "healthy" : health?.status === "missing_config" ? "missing_config" : health?.status === "unauthorized" ? "unauthorized" : "unreachable",
      message: String(health?.message || "OpenHands unavailable"),
      ...(typeof health?.details === "string" && health.details.trim() ? { details: health.details } : {}),
    };
  }

  async runQwenTurn(input: {
    task: string;
    history: Array<{ role: string; content: string }>;
    signal: AbortSignal;
    onPartial?: (text: string) => void;
  }): Promise<string> {
    this.ensureServices();
    if (!this.contextCollector || !this.actionRunner) throw new Error("Playground services not ready.");
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
      intent: classifyIntent(taskText),
    });
    const history = cutieMessagesToPlaygroundChat(input.history);
    const prompt = buildQwenPrompt({
      task: taskText,
      mode: "auto",
      preview,
      context,
      workspaceRoot: vscode.workspace.workspaceFolders?.[0]?.uri.fsPath ?? null,
      searchDepth: "fast",
      history,
      qwenExecutablePath: getQwenExecutablePath() || null,
    });
    const ac = new AbortController();
    const onAbort = () => ac.abort();
    if (input.signal.aborted) ac.abort();
    else input.signal.addEventListener("abort", onAbort, { once: true });
    try {
      const result = await this.qwenRuntime.runPrompt({
        apiKey,
        prompt,
        mode: "auto",
        abortController: ac,
        onPartial: input.onPartial,
      });
      return result.assistantText;
    } finally {
      input.signal.removeEventListener("abort", onAbort);
    }
  }

  async runPlaygroundApiTurn(input: {
    task: string;
    mode: Mode;
    /** Server playground session UUID from a prior assist response; omit for first turn in a Cutie session. */
    historySessionId?: string | null;
    history: Array<{ role: string; content: string }>;
    signal: AbortSignal;
  }): Promise<{ assistantText: string; playgroundSessionId?: string }> {
    this.ensureServices();
    if (!this.contextCollector || !this.toolExecutor || !this.actionRunner) {
      throw new Error("Playground services not ready.");
    }
    const auth: RequestAuth | null = await this.auth.getRequestAuth();
    if (!auth) {
      throw new Error("Authenticate before using hosted playground assist.");
    }
    const taskText = String(input.task || "").trim();
    const { context, retrievalHints, preview } = await this.contextCollector.collect(taskText, {
      recentTouchedPaths: this.actionRunner.getRecentTouchedPaths(),
      attachedFiles: [],
      attachedSelection: null,
      searchDepth: "fast",
      intent: classifyIntent(taskText),
    });
    const workspaceHash = getWorkspaceHash();
    const extensionVersion = getExtensionVersion(this.context);
    const serverHistoryId =
      input.historySessionId && isPlaygroundHistorySessionUuid(input.historySessionId)
        ? input.historySessionId.trim()
        : undefined;
    const requestBody: Record<string, unknown> = {
      mode: input.mode,
      task: taskText,
      stream: false,
      orchestrationProtocol: input.mode === "plan" ? "batch_v1" : "tool_loop_v1",
      clientCapabilities:
        input.mode === "plan"
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
    let initial: AssistRunEnvelope = await playgroundRequestAssist(auth, requestBody, input.signal);
    if (initial.pendingToolCall && initial.runId && input.mode !== "plan") {
      initial = await runPlaygroundToolLoop({
        auth,
        initial,
        toolExecutor: this.toolExecutor,
        workspaceFingerprint: workspaceHash,
        sessionId: serverHistoryId || initial.sessionId,
        signal: input.signal,
      });
    }
    const playgroundSessionId =
      typeof initial.sessionId === "string" && initial.sessionId.trim() ? initial.sessionId.trim() : undefined;
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

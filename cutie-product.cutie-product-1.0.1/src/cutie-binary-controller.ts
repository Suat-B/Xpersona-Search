import * as vscode from "vscode";
import type { RequestAuth } from "@xpersona/vscode-core";
import {
  branchBinaryBuild as requestBinaryBranch,
  cancelBinaryBuild as requestBinaryCancel,
  createBinaryBuild as requestBinaryBuild,
  createBinaryBuildStream as requestBinaryBuildStream,
  executeBinaryBuild as requestBinaryExecute,
  getBinaryBuild as requestBinaryStatus,
  publishBinaryBuild as requestBinaryPublish,
  refineBinaryBuild as requestBinaryRefine,
  rewindBinaryBuild as requestBinaryRewind,
  streamBinaryBuildEvents as requestBinaryStreamEvents,
  validateBinaryBuild as requestBinaryValidate,
} from "./binary-api-client";
import type {
  BinaryBuildEvent,
  BinaryBuildRecord,
  BinarySnapshotSummary,
} from "./binary-types";
import { CutieAuthManager } from "./auth";
import { CutieBinaryDebugTracker } from "./cutie-binary-debug";
import type { CutieBinaryDebugSnapshot } from "./cutie-debug-report";
import { nowIso, randomId } from "./cutie-policy";
import { CutieSessionStore } from "./cutie-session-store";
import {
  createDefaultBinaryPanelState,
  delay,
  deriveBinaryPhase,
  formatBinaryBuildMessage,
  isBinaryBuildPending,
  isBinaryTerminalStatus,
  isTransientBinaryPollError,
  liveProgressForPhase,
  phaseProgressLabel,
} from "./cutie-binary-helpers";
import {
  resolveBinaryNaturalLanguageAction,
} from "./cutie-binary-nl-router";
import type {
  CutieBinaryLiveBubbleState,
  CutieBinaryLiveBubbleView,
  CutieChatMessage,
  CutieSessionRecord,
} from "./types";

const BINARY_ACTIVE_BUILD_KEY = "cutie-product.binary.activeBuildId";
const BINARY_STREAM_CURSOR_KEY = "cutie-product.binary.streamCursorByBuild";

type GatheredBinaryContext = {
  context: import("./binary-types").BinaryContextPayload;
  retrievalHints: import("./binary-types").RetrievalHints;
};

type BinaryLiveEvent =
  | { type: "accepted"; transport: CutieBinaryLiveBubbleState["transport"]; mode?: CutieBinaryLiveBubbleState["mode"]; phase?: string }
  | { type: "phase"; phase: string; status?: CutieBinaryLiveBubbleState["status"]; progress?: number; latestActivity?: string }
  | { type: "activity"; activity: string; phase?: string }
  | { type: "partial_text"; text: string; phase?: string }
  | { type: "build_attached"; buildId: string; phase?: string; progress?: number }
  | {
      type: "build_event";
      eventType: BinaryBuildEvent["type"];
      phase?: string;
      progress?: number;
      latestLog?: string;
      latestFile?: string;
    }
  | { type: "final"; text: string }
  | { type: "failed"; text: string; phase?: string }
  | { type: "canceled"; text?: string; phase?: string };

export class CutieBinaryBundleController {
  binary = createDefaultBinaryPanelState();
  binaryActivity: string[] = [];
  private binaryStreamAbort: AbortController | null = null;
  private binaryStreamBuildId: string | null = null;
  private binarySeenEventIds = new Map<string, Set<string>>();
  private liveBubble: CutieBinaryLiveBubbleView | null = null;
  private readonly debugTracker = new CutieBinaryDebugTracker();

  constructor(
    private readonly context: vscode.ExtensionContext,
    private readonly auth: CutieAuthManager,
    private readonly sessionStore: CutieSessionStore,
    private readonly deps: {
      getWorkspaceHash: () => string;
      getActiveSession: () => CutieSessionRecord | null;
      getSessionById: (sessionId: string) => CutieSessionRecord | null;
      setActiveSession: (session: CutieSessionRecord | null) => void;
      emitState: () => void | Promise<void>;
      gatherBinaryContext: (intent: string) => Promise<GatheredBinaryContext>;
      showView: () => Promise<void>;
    }
  ) {}

  getLiveBubble(): CutieBinaryLiveBubbleView | null {
    return this.liveBubble;
  }

  getLiveSessionId(): string | null {
    return this.liveBubble?.sessionId || null;
  }

  hasOngoingWork(): boolean {
    return Boolean(
      this.binaryStreamAbort ||
      this.binary.streamConnected ||
      this.binary.busy ||
      this.liveBubble ||
      (this.binary.activeBuild && isBinaryBuildPending(this.binary.activeBuild))
    );
  }

  getDebugSnapshot(): CutieBinaryDebugSnapshot {
    return this.debugTracker.getSnapshot();
  }

  /** Stop the active stream and clear the ephemeral live row; call when switching sessions or new chat. */
  stopStreamsAndLiveBubble(): void {
    this.stopBinaryStream();
    this.liveBubble = null;
  }

  async resumeBinaryBuildIfNeeded(): Promise<void> {
    const buildId = this.context.workspaceState.get<string>(BINARY_ACTIVE_BUILD_KEY);
    if (!buildId) return;
    if (this.binaryStreamBuildId === buildId && this.binaryStreamAbort) return;

    const auth = await this.auth.getRequestAuth();
    if (!auth) return;

    try {
      const build = await requestBinaryStatus(auth, buildId);
      this.setActiveBinaryBuild(build);
      if (isBinaryBuildPending(build)) {
        void this.followBinaryBuildStream({ auth, buildId }).catch(() => undefined);
      }
    } catch {
      /* stale id */
    }
    await this.deps.emitState();
  }

  async openBinaryConfigure(): Promise<void> {
    await this.deps.showView();
    const selection = await vscode.window.showQuickPick(
      [
        { label: "Set Xpersona API key", detail: "Save or clear your API key (shared with Cutie).", action: "apiKey" as const },
        {
          label: "Open binary builder settings",
          detail: "VS Code settings filtered to cutie-product.binary.",
          action: "settings" as const,
        },
        { label: "Browser sign in", detail: "Authenticate in the browser.", action: "signIn" as const },
      ],
      { title: "Configure binary builder", ignoreFocusOut: true }
    );
    if (!selection) return;

    let message = "";
    switch (selection.action) {
      case "apiKey":
        await this.auth.setApiKeyInteractive();
        message = "API key updated.";
        break;
      case "settings":
        await vscode.commands.executeCommand("workbench.action.openSettings", "cutie-product.binary");
        message = "Opened binary builder settings.";
        break;
      case "signIn":
        await this.auth.signInWithBrowser();
        message = "Browser sign-in opened.";
        break;
      default:
        return;
    }
    await this.appendSessionMessage("system", message);
    await this.deps.emitState();
  }

  async runBinaryGenerate(intent?: string): Promise<void> {
    await this.deps.showView();
    const nextIntent =
      String(intent || "").trim() ||
      (await vscode.window.showInputBox({
        title: "Generate app from prompt",
        prompt: "Describe the app, workflow, or tool you want Cutie to spin up.",
        ignoreFocusOut: true,
      })) ||
      "";
    if (!nextIntent.trim()) return;
    await this.generateBinaryBuild(nextIntent);
  }

  async runBinaryValidate(): Promise<void> {
    await this.deps.showView();
    await this.validateBinaryBuild();
  }

  async runBinaryDeploy(): Promise<void> {
    await this.deps.showView();
    await this.publishBinaryBuild();
  }

  async setBinaryTargetRuntime(runtime: string): Promise<void> {
    const nextRuntime = runtime === "node20" ? "node20" : "node18";
    this.binary.targetEnvironment = {
      ...this.binary.targetEnvironment,
      runtime: nextRuntime,
    };
    await this.deps.emitState();
  }

  async runNaturalLanguagePrompt(rawPrompt: string): Promise<void> {
    const prompt = String(rawPrompt || "").trim();
    if (!prompt) return;

    const action = resolveBinaryNaturalLanguageAction(prompt, {
      hasActiveBuild: Boolean(this.binary.activeBuild),
    });

    switch (action.type) {
      case "cancel":
        await this.cancelBinaryBuild();
        return;
      case "validate":
        await this.validateBinaryBuild();
        return;
      case "publish":
        await this.publishBinaryBuild();
        return;
      case "rewind":
        await this.rewindBinaryBuild(action.checkpointId || "");
        return;
      case "branch":
        await this.branchBinaryBuild(action.intent || prompt, action.checkpointId || "");
        return;
      case "execute":
        await this.executeBinaryBuild(action.entryPoint || "");
        return;
      case "generate":
        await this.generateBinaryBuild(action.intent);
        return;
      case "refine":
        await this.refineBinaryBuild(action.intent);
        return;
      default:
        await this.generateBinaryBuild(prompt);
        return;
    }
  }

  // ——— webview actions ———

  async generateBinaryBuild(rawIntent: string): Promise<void> {
    const intent = rawIntent.trim();
    if (!intent) {
      this.noteControlAction("generate", "blocked", { message: "Missing build intent." });
      await this.appendSessionMessage(
        "system",
        "Add what you want to build in the chat composer before creating an app."
      );
      await this.deps.emitState();
      return;
    }
    if (this.binary.busy || isBinaryBuildPending(this.binary.activeBuild)) {
      this.noteControlAction("generate", "blocked", { message: "Another build is already active." });
      await this.appendSessionMessage(
        "system",
        "Wait for the current app build to finish before starting another one."
      );
      await this.deps.emitState();
      return;
    }

    const auth = await this.auth.getRequestAuth();
    if (!auth) {
      this.noteControlAction("generate", "blocked", { message: "Missing auth for build generation." });
      await this.appendSessionMessage(
        "system",
        "Authenticate with an Xpersona API key or browser sign-in before spinning up an app build."
      );
      await this.deps.emitState();
      return;
    }

    this.binary.busy = true;
    this.binary.lastAction = "generate";
    this.noteControlAction("generate", "requested", { message: intent });
    this.pushActivity("Spinning up app build");
    this.applyBinaryLiveEvent({
      type: "accepted",
      transport: "binary",
      mode: "build",
      phase: "accepted",
    });
    this.applyBinaryLiveEvent({
      type: "activity",
      activity: "Spinning up app build",
      phase: "planning",
    });
    await this.deps.emitState();

    try {
      const { context, retrievalHints } = await this.deps.gatherBinaryContext(intent);
      const session = this.deps.getActiveSession();

      const createInput = {
        auth,
        intent,
        workspaceFingerprint: this.deps.getWorkspaceHash(),
        historySessionId: session?.playgroundHistorySessionId ?? undefined,
        targetEnvironment: this.binary.targetEnvironment,
        context: {
          activeFile: context.activeFile,
          openFiles: context.openFiles,
        },
        retrievalHints,
      };

      this.stopBinaryStream();
      this.clearBinaryEventTracking();
      this.setActiveBinaryBuild(null);
      this.binary.phase = "queued";
      this.binary.progress = 0;
      this.binary.streamConnected = false;
      this.binary.lastEventId = null;
      this.binary.previewFiles = [];
      this.binary.recentLogs = [];
      this.binary.reliability = null;
      this.binary.liveReliability = null;
      this.binary.artifactState = null;
      this.binary.sourceGraph = null;
      this.binary.astState = null;
      this.binary.execution = null;
      this.binary.runtimeState = null;
      this.binary.checkpoints = [];
      this.binary.snapshots = [];
      this.binary.pendingRefinement = null;
      this.binary.canCancel = false;
      await this.deps.emitState();

      let finalBuild: BinaryBuildRecord | null = null;
      try {
        finalBuild = await this.followBinaryBuildStream({
          auth,
          create: createInput,
        });
      } catch (error) {
        this.pushActivity("Streaming unavailable, falling back to polling.");
        this.debugTracker.noteFallbackToPolling(error instanceof Error ? error.message : String(error));
        this.applyBinaryLiveEvent({
          type: "activity",
          activity: "Streaming unavailable, falling back to polling.",
          phase: "planning",
        });
        const streamedBuild = this.binary.activeBuild;
        if (streamedBuild?.id) {
          finalBuild = isBinaryBuildPending(streamedBuild)
            ? await this.waitForBinaryBuildCompletion(auth, streamedBuild)
            : streamedBuild;
        } else {
          const build = await requestBinaryBuild(createInput);
          this.setActiveBinaryBuild(build);
          finalBuild = isBinaryBuildPending(build) ? await this.waitForBinaryBuildCompletion(auth, build) : build;
        }
        if (!finalBuild) throw error;
      }

      if (finalBuild) {
        this.setActiveBinaryBuild(finalBuild);
      }
      const resolvedBuild = finalBuild || this.binary.activeBuild;
      if (!resolvedBuild) {
        throw new Error("Binary build finished without a build record.");
      }
      await this.persistBinaryCursor(resolvedBuild.id, this.binary.lastEventId || null);
      this.setActiveBinaryBuild(resolvedBuild);
      this.noteControlAction("generate", "succeeded", {
        buildId: resolvedBuild.id,
        message: `Build ${resolvedBuild.status}${resolvedBuild.phase ? ` (${resolvedBuild.phase})` : ""}.`,
      });
    } catch (error) {
      this.noteControlAction("generate", "failed", {
        buildId: this.binary.activeBuild?.id || null,
        message: error instanceof Error ? error.message : String(error),
      });
      this.applyBinaryLiveEvent({
        type: "failed",
        text: `Binary generation failed: ${error instanceof Error ? error.message : String(error)}`,
        phase: "failed",
      });
    } finally {
      this.binary.busy = false;
      await this.deps.emitState();
    }
  }

  async cancelBinaryBuild(): Promise<void> {
    const build = this.binary.activeBuild;
    if (!build || !isBinaryBuildPending(build)) {
      this.noteControlAction("cancel", "blocked", { buildId: build?.id || null, message: "No active build to cancel." });
      await this.appendSessionMessage("system", "There is no active app build to cancel.");
      await this.deps.emitState();
      return;
    }

    const auth = await this.auth.getRequestAuth();
    if (!auth) {
      this.noteControlAction("cancel", "blocked", { buildId: build.id, message: "Missing auth for cancellation." });
      await this.appendSessionMessage("system", "Authenticate before canceling the current app build.");
      await this.deps.emitState();
      return;
    }

    const previousCanCancel = this.binary.canCancel;
    this.binary.canCancel = false;
    this.noteControlAction("cancel", "requested", { buildId: build.id });
    await this.deps.emitState();

    try {
      const updated = await requestBinaryCancel({ auth, buildId: build.id });
      this.setActiveBinaryBuild(updated);
      this.pushActivity("Cancellation requested");
      this.applyBinaryLiveEvent({
        type: "activity",
        activity: "Cancellation requested",
        phase: "canceled",
      });
      this.noteControlAction("cancel", "succeeded", { buildId: updated.id, message: "Cancellation requested." });
    } catch (error) {
      this.binary.canCancel = previousCanCancel;
      this.noteControlAction("cancel", "failed", {
        buildId: build.id,
        message: error instanceof Error ? error.message : String(error),
      });
      await this.appendSessionMessage(
        "system",
        `Binary cancel failed: ${error instanceof Error ? error.message : String(error)}`
      );
    } finally {
      await this.deps.emitState();
    }
  }

  async refineBinaryBuild(rawIntent: string): Promise<void> {
    const build = this.binary.activeBuild;
    if (!build || !isBinaryBuildPending(build)) {
      this.noteControlAction("refine", "blocked", { buildId: build?.id || null, message: "No live build to refine." });
      await this.appendSessionMessage("system", "Start a live build before queuing a refinement.");
      await this.deps.emitState();
      return;
    }

    const intent = rawIntent.trim();
    if (!intent) {
      this.noteControlAction("refine", "blocked", { buildId: build.id, message: "Missing refinement intent." });
      await this.appendSessionMessage(
        "system",
        "Add a plain-English improvement request in the chat composer before improving this build."
      );
      await this.deps.emitState();
      return;
    }

    const auth = await this.auth.getRequestAuth();
    if (!auth) {
      this.noteControlAction("refine", "blocked", { buildId: build.id, message: "Missing auth for refinement." });
      await this.appendSessionMessage("system", "Authenticate before refining the active build.");
      await this.deps.emitState();
      return;
    }

    this.binary.lastAction = "refine";
    this.noteControlAction("refine", "requested", { buildId: build.id, message: intent });
    this.pushActivity("Queueing refinement for the live app build");
    await this.deps.emitState();

    try {
      const updated = await requestBinaryRefine({ auth, buildId: build.id, intent });
      this.setActiveBinaryBuild(updated);
      this.noteControlAction("refine", "succeeded", { buildId: updated.id, message: intent });
      await this.appendSessionMessage("system", `Queued refinement for app build ${updated.id}.`);
      if (!this.binaryStreamAbort && isBinaryBuildPending(updated)) {
        void this.followBinaryBuildStream({ auth, buildId: updated.id }).catch(() => undefined);
      }
    } catch (error) {
      this.noteControlAction("refine", "failed", {
        buildId: build.id,
        message: error instanceof Error ? error.message : String(error),
      });
      await this.appendSessionMessage(
        "system",
        `Binary refine failed: ${error instanceof Error ? error.message : String(error)}`
      );
    } finally {
      await this.deps.emitState();
    }
  }

  async branchBinaryBuild(rawIntent: string, rawCheckpointId = ""): Promise<void> {
    const build = this.binary.activeBuild;
    if (!build) {
      this.noteControlAction("branch", "blocked", { message: "No build available to branch." });
      await this.appendSessionMessage("system", "Generate an app build before creating a branch.");
      await this.deps.emitState();
      return;
    }

    const checkpointId =
      String(rawCheckpointId || "").trim() ||
      String(build.checkpointId || "").trim() ||
      String(build.checkpoints?.[0]?.id || "").trim();
    if (!checkpointId) {
      this.noteControlAction("branch", "blocked", { buildId: build.id, message: "Missing checkpoint for branch." });
      await this.appendSessionMessage("system", "Create at least one save point before branching this build.");
      await this.deps.emitState();
      return;
    }

    const auth = await this.auth.getRequestAuth();
    if (!auth) {
      this.noteControlAction("branch", "blocked", { buildId: build.id, message: "Missing auth for branch." });
      await this.appendSessionMessage("system", "Authenticate before branching the current app build.");
      await this.deps.emitState();
      return;
    }

    this.binary.busy = true;
    this.binary.lastAction = "branch";
    this.noteControlAction("branch", "requested", { buildId: build.id, message: checkpointId });
    this.pushActivity("Forking from the current save point");
    await this.deps.emitState();

    try {
      const updated = await requestBinaryBranch({
        auth,
        buildId: build.id,
        checkpointId,
        intent: String(rawIntent || "").trim() || undefined,
      });
      this.stopBinaryStream();
      this.clearBinaryEventTracking();
      this.setActiveBinaryBuild(updated);
      this.noteControlAction("branch", "succeeded", { buildId: updated.id, message: checkpointId });
      await this.appendSessionMessage("assistant", `Created forked build ${updated.id} from save point ${checkpointId}.`);
      if (isBinaryBuildPending(updated)) {
        void this.followBinaryBuildStream({ auth, buildId: updated.id }).catch(() => undefined);
      }
    } catch (error) {
      this.noteControlAction("branch", "failed", {
        buildId: build.id,
        message: error instanceof Error ? error.message : String(error),
      });
      await this.appendSessionMessage(
        "system",
        `Binary branch failed: ${error instanceof Error ? error.message : String(error)}`
      );
    } finally {
      this.binary.busy = false;
      await this.deps.emitState();
    }
  }

  async rewindBinaryBuild(rawCheckpointId = ""): Promise<void> {
    const build = this.binary.activeBuild;
    if (!build) {
      this.noteControlAction("rewind", "blocked", { message: "No build available to rewind." });
      await this.appendSessionMessage("system", "Generate an app build before rewinding it.");
      await this.deps.emitState();
      return;
    }
    if (isBinaryBuildPending(build)) {
      this.noteControlAction("rewind", "blocked", { buildId: build.id, message: "Build is still pending." });
      await this.appendSessionMessage("system", "Wait for the current app build to stop streaming before rewinding it.");
      await this.deps.emitState();
      return;
    }

    const checkpointId =
      String(rawCheckpointId || "").trim() ||
      String(build.checkpointId || "").trim() ||
      String(build.checkpoints?.[0]?.id || "").trim();
    if (!checkpointId) {
      this.noteControlAction("rewind", "blocked", { buildId: build.id, message: "Missing checkpoint for rewind." });
      await this.appendSessionMessage("system", "No save point is available to rewind this build.");
      await this.deps.emitState();
      return;
    }

    const auth = await this.auth.getRequestAuth();
    if (!auth) {
      this.noteControlAction("rewind", "blocked", { buildId: build.id, message: "Missing auth for rewind." });
      await this.appendSessionMessage("system", "Authenticate before rewinding the current app build.");
      await this.deps.emitState();
      return;
    }

    this.binary.busy = true;
    this.binary.lastAction = "rewind";
    this.noteControlAction("rewind", "requested", { buildId: build.id, message: checkpointId });
    this.pushActivity("Rewinding app build");
    await this.deps.emitState();

    try {
      const updated = await requestBinaryRewind({ auth, buildId: build.id, checkpointId });
      this.setActiveBinaryBuild(updated);
      this.noteControlAction("rewind", "succeeded", { buildId: updated.id, message: checkpointId });
      await this.appendSessionMessage("system", `Rewound build ${updated.id} to save point ${checkpointId}.`);
    } catch (error) {
      this.noteControlAction("rewind", "failed", {
        buildId: build.id,
        message: error instanceof Error ? error.message : String(error),
      });
      await this.appendSessionMessage(
        "system",
        `Binary rewind failed: ${error instanceof Error ? error.message : String(error)}`
      );
    } finally {
      this.binary.busy = false;
      await this.deps.emitState();
    }
  }

  async executeBinaryBuild(entryPoint: string): Promise<void> {
    const build = this.binary.activeBuild;
    if (!build) {
      this.noteControlAction("execute", "blocked", { message: "No build available to execute." });
      await this.appendSessionMessage("system", "Generate an app build before running live execution.");
      await this.deps.emitState();
      return;
    }

    const normalizedEntryPoint = entryPoint.trim();
    if (!normalizedEntryPoint) {
      this.noteControlAction("execute", "blocked", { buildId: build.id, message: "Missing entry point." });
      await this.appendSessionMessage("system", "Choose a callable entry point before running the live preview runtime.");
      await this.deps.emitState();
      return;
    }

    const auth = await this.auth.getRequestAuth();
    if (!auth) {
      this.noteControlAction("execute", "blocked", { buildId: build.id, message: "Missing auth for execute." });
      await this.appendSessionMessage("system", "Authenticate before running the live preview runtime.");
      await this.deps.emitState();
      return;
    }

    this.binary.busy = true;
    this.binary.lastAction = "execute";
    this.noteControlAction("execute", "requested", { buildId: build.id, message: normalizedEntryPoint });
    this.pushActivity(`Running ${normalizedEntryPoint} in the live preview runtime`);
    await this.deps.emitState();

    try {
      const updated = await requestBinaryExecute({
        auth,
        buildId: build.id,
        entryPoint: normalizedEntryPoint,
      });
      this.setActiveBinaryBuild(updated);
      this.noteControlAction("execute", "succeeded", { buildId: updated.id, message: normalizedEntryPoint });
      const lastRun = updated.execution?.lastRun;
      await this.appendSessionMessage(
        lastRun?.status === "failed" ? "system" : "assistant",
        lastRun
          ? `Executed ${lastRun.entryPoint} -> ${lastRun.status.toUpperCase()}${lastRun.errorMessage ? `\n${lastRun.errorMessage}` : ""}`
          : `Executed ${normalizedEntryPoint}.`
      );
    } catch (error) {
      this.noteControlAction("execute", "failed", {
        buildId: build.id,
        message: error instanceof Error ? error.message : String(error),
      });
      await this.appendSessionMessage(
        "system",
        `Binary execute failed: ${error instanceof Error ? error.message : String(error)}`
      );
    } finally {
      this.binary.busy = false;
      await this.deps.emitState();
    }
  }

  async validateBinaryBuild(): Promise<void> {
    const build = this.binary.activeBuild;
    if (!build) {
      this.noteControlAction("validate", "blocked", { message: "No build available to validate." });
      await this.appendSessionMessage("system", "Generate an app build before running validation.");
      await this.deps.emitState();
      return;
    }
    if (isBinaryBuildPending(build)) {
      this.noteControlAction("validate", "blocked", { buildId: build.id, message: "Build is still pending." });
      await this.appendSessionMessage("system", "Wait for the current build to finish before validating it.");
      await this.deps.emitState();
      return;
    }
    if (build.status !== "completed") {
      this.noteControlAction("validate", "blocked", { buildId: build.id, message: `Build status is ${build.status}.` });
      await this.appendSessionMessage("system", "Only completed app builds can be validated.");
      await this.deps.emitState();
      return;
    }

    const auth = await this.auth.getRequestAuth();
    if (!auth) {
      this.noteControlAction("validate", "blocked", { buildId: build.id, message: "Missing auth for validate." });
      await this.appendSessionMessage("system", "Authenticate before validating the current app build.");
      await this.deps.emitState();
      return;
    }

    this.binary.busy = true;
    this.binary.lastAction = "validate";
    this.noteControlAction("validate", "requested", { buildId: build.id });
    this.pushActivity("Confidence-checking app build");
    await this.deps.emitState();

    try {
      const updated = await requestBinaryValidate({
        auth,
        buildId: build.id,
        targetEnvironment: this.binary.targetEnvironment,
      });
      this.setActiveBinaryBuild(updated);
      this.noteControlAction("validate", "succeeded", { buildId: updated.id, message: updated.reliability?.status || null });
      await this.appendSessionMessage("system", formatBinaryBuildMessage(updated));
    } catch (error) {
      this.noteControlAction("validate", "failed", {
        buildId: build.id,
        message: error instanceof Error ? error.message : String(error),
      });
      await this.appendSessionMessage(
        "system",
        `Binary validation failed: ${error instanceof Error ? error.message : String(error)}`
      );
    } finally {
      this.binary.busy = false;
      await this.deps.emitState();
    }
  }

  async publishBinaryBuild(): Promise<void> {
    const build = this.binary.activeBuild;
    if (!build) {
      this.noteControlAction("deploy", "blocked", { message: "No build available to publish." });
      await this.appendSessionMessage("system", "Generate an app build before publishing it.");
      await this.deps.emitState();
      return;
    }
    if (isBinaryBuildPending(build)) {
      this.noteControlAction("deploy", "blocked", { buildId: build.id, message: "Build is still pending." });
      await this.appendSessionMessage("system", "Wait for the current build to finish before publishing it.");
      await this.deps.emitState();
      return;
    }
    if (build.status !== "completed") {
      this.noteControlAction("deploy", "blocked", { buildId: build.id, message: `Build status is ${build.status}.` });
      await this.appendSessionMessage("system", "Only completed app builds can be published.");
      await this.deps.emitState();
      return;
    }

    const auth = await this.auth.getRequestAuth();
    if (!auth) {
      this.noteControlAction("deploy", "blocked", { buildId: build.id, message: "Missing auth for publish." });
      await this.appendSessionMessage("system", "Authenticate before publishing the current app build.");
      await this.deps.emitState();
      return;
    }

    this.binary.busy = true;
    this.binary.lastAction = "deploy";
    this.noteControlAction("deploy", "requested", { buildId: build.id });
    this.pushActivity("Publishing app build");
    await this.deps.emitState();

    try {
      const updated = await requestBinaryPublish({ auth, buildId: build.id });
      this.setActiveBinaryBuild(updated);
      this.noteControlAction("deploy", "succeeded", { buildId: updated.id, message: updated.publish?.downloadUrl || null });
      await this.appendSessionMessage("assistant", formatBinaryBuildMessage(updated), {
        presentation: "live_binary",
      });
    } catch (error) {
      this.noteControlAction("deploy", "failed", {
        buildId: build.id,
        message: error instanceof Error ? error.message : String(error),
      });
      await this.appendSessionMessage(
        "system",
        `Binary publish failed: ${error instanceof Error ? error.message : String(error)}`
      );
    } finally {
      this.binary.busy = false;
      await this.deps.emitState();
    }
  }

  // ——— internals ———

  private noteControlAction(
    action: "generate" | "refine" | "branch" | "rewind" | "execute" | "validate" | "deploy" | "cancel",
    result: "requested" | "succeeded" | "failed" | "blocked",
    input?: { buildId?: string | null; message?: string | null }
  ): void {
    this.debugTracker.noteControlAction(action, result, input);
  }

  private pushActivity(line: string): void {
    this.binaryActivity = [...this.binaryActivity, line].slice(-80);
  }

  private async appendSessionMessage(
    role: CutieChatMessage["role"],
    content: string,
    extra?: Partial<Pick<CutieChatMessage, "presentation" | "live">>
  ): Promise<void> {
    const targetSessionId = String(this.liveBubble?.sessionId || this.deps.getActiveSession()?.id || "").trim();
    let session = targetSessionId ? this.deps.getSessionById(targetSessionId) : this.deps.getActiveSession();
    if (!session) {
      session = await this.sessionStore.createSession(this.deps.getWorkspaceHash(), "App build");
      this.deps.setActiveSession(session);
    }
    const next = await this.sessionStore.appendMessage(session, { role, content, ...extra });
    if (this.liveBubble) {
      this.liveBubble = {
        ...this.liveBubble,
        sessionId: next.id,
      };
    }
    this.deps.setActiveSession(next);
  }

  private stopBinaryStream(): void {
    this.binaryStreamAbort?.abort();
    this.binaryStreamAbort = null;
    this.binaryStreamBuildId = null;
    this.binary.streamConnected = false;
    this.debugTracker.noteStreamDisconnected();
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
    if (next.has(eventId)) {
      this.debugTracker.noteDuplicateEvent();
      return false;
    }
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
    this.debugTracker.noteCursorPersisted(eventId);
    await this.context.workspaceState.update(BINARY_STREAM_CURSOR_KEY, next);
  }

  private appendBinaryCheckpointSnapshot(snapshot: BinarySnapshotSummary): void {
    const build = this.binary.activeBuild;
    if (!build) return;
    const snapshots = [snapshot, ...(build.snapshots || []).filter((item) => item.id !== snapshot.id)].slice(0, 80);
    this.setActiveBinaryBuild({
      ...build,
      snapshots,
    });
  }

  private syncBinaryPanelFromBuild(build: BinaryBuildRecord | null): void {
    this.binary.activeBuild = build;
    this.binary.phase = deriveBinaryPhase(build);
    this.binary.progress = build?.progress ?? (build?.status === "completed" ? 100 : 0);
    this.binary.previewFiles = build?.preview?.files || [];
    this.binary.recentLogs = build?.preview?.recentLogs || [];
    this.binary.reliability = build?.reliability || null;
    this.binary.liveReliability = build?.liveReliability || null;
    this.binary.artifactState = build?.artifactState || null;
    this.binary.sourceGraph = build?.sourceGraph || null;
    this.binary.astState = build?.astState || null;
    this.binary.execution = build?.execution || null;
    this.binary.runtimeState = build?.runtimeState || null;
    this.binary.checkpoints = build?.checkpoints || [];
    this.binary.snapshots = build?.snapshots || [];
    this.binary.pendingRefinement = build?.pendingRefinement || null;
    this.binary.canCancel = Boolean(build?.cancelable && isBinaryBuildPending(build));
    if (build?.targetEnvironment) {
      this.binary.targetEnvironment = build.targetEnvironment;
    }
  }

  private setActiveBinaryBuild(build: BinaryBuildRecord | null): void {
    this.syncBinaryPanelFromBuild(build);
    this.debugTracker.noteBuildRecord(build);
    if (build && this.liveBubble && (this.liveBubble.live.mode === "build" || this.liveBubble.live.buildId === build.id)) {
      const latestFile = build.artifactState?.latestFile || build.preview?.files?.[0]?.path;
      const latestLog = build.preview?.recentLogs?.slice(-1)[0];
      if (isBinaryTerminalStatus(build.status)) {
        this.resolveLiveAssistant({
          content: formatBinaryBuildMessage(build),
          status: build.status === "canceled" ? "canceled" : build.status === "failed" ? "failed" : "done",
          mode: "build",
          phase: build.phase || (build.status === "completed" ? "completed" : build.status),
          latestActivity: phaseProgressLabel(build.phase),
          latestLog,
          latestFile,
        });
      } else {
        this.updateLiveAssistant({
          mode: "build",
          transport: "binary",
          buildId: build.id,
          phase: build.phase || "planning",
          status: "streaming",
          progress: build.progress ?? liveProgressForPhase(build.phase || "planning"),
          latestActivity: phaseProgressLabel(build.phase),
          latestLog,
          latestFile,
        });
      }
    }
    void this.persistActiveBinaryBuildId(build?.id || null);
  }

  private createLiveAssistantMessage(input: {
    transport: CutieBinaryLiveBubbleState["transport"];
    mode?: CutieBinaryLiveBubbleState["mode"];
    phase?: string;
    latestActivity?: string;
    content?: string;
  }): void {
    const messageId = randomId("cutie_binary_live");
    const ts = nowIso();
    const live: CutieBinaryLiveBubbleState = {
      mode: input.mode || "shell",
      status: "pending",
      phase: input.phase || "accepted",
      transport: input.transport,
      progress: liveProgressForPhase(input.phase || "accepted"),
      latestActivity: input.latestActivity,
      startedAt: ts,
      updatedAt: ts,
    };
    this.liveBubble = {
      messageId,
      sessionId: this.deps.getActiveSession()?.id ?? null,
      content: input.content || "",
      createdAt: ts,
      live,
    };
  }

  private updateLiveAssistant(input: Partial<CutieBinaryLiveBubbleState> & { content?: string }): void {
    const current = this.liveBubble;
    if (!current) return;
    const nextLive: CutieBinaryLiveBubbleState = {
      ...current.live,
      ...input,
      updatedAt: nowIso(),
      progress:
        typeof input.progress === "number"
          ? input.progress
          : typeof current.live.progress === "number"
            ? current.live.progress
            : liveProgressForPhase(input.phase || current.live.phase),
    };
    if (nextLive.mode === "answer" && nextLive.status === "pending") {
      nextLive.status = "streaming";
    }
    this.liveBubble = {
      ...current,
      content: input.content ?? current.content,
      live: nextLive,
    };
  }

  private resolveLiveAssistant(input: {
    content: string;
    status?: "done" | "failed" | "canceled";
    mode?: CutieBinaryLiveBubbleState["mode"];
    phase?: string;
    latestActivity?: string;
    latestLog?: string;
    latestFile?: string;
  }): void {
    const current = this.liveBubble;
    if (!current) return;
    const contentToUse = String(input.content || "").trim() || current.content;
    const nextLive: CutieBinaryLiveBubbleState = {
      ...current.live,
      mode: input.mode || current.live.mode,
      status: input.status || "done",
      phase: input.phase || (input.status === "failed" ? "failed" : input.status === "canceled" ? "canceled" : "completed"),
      progress: 100,
      latestActivity: input.latestActivity || current.live.latestActivity,
      latestLog: input.latestLog || current.live.latestLog,
      latestFile: input.latestFile || current.live.latestFile,
      updatedAt: nowIso(),
    };
    void this.appendSessionMessage("assistant", contentToUse, {
      presentation: "live_binary",
      live: nextLive,
    });
    this.liveBubble = null;
  }

  private applyBinaryLiveEvent(event: BinaryLiveEvent): void {
    if (event.type === "accepted") {
      this.createLiveAssistantMessage({
        transport: event.transport,
        mode: event.mode || "shell",
        phase: event.phase || "accepted",
      });
      return;
    }

    if (!this.liveBubble) return;

    switch (event.type) {
      case "phase":
        this.updateLiveAssistant({
          phase: event.phase,
          status: event.status || this.liveBubble.live.status,
          progress:
            typeof event.progress === "number" ? event.progress : liveProgressForPhase(event.phase),
          latestActivity: event.latestActivity || this.liveBubble.live.latestActivity,
        });
        return;
      case "activity":
        this.updateLiveAssistant({
          latestActivity: event.activity,
          phase: event.phase || this.liveBubble.live.phase,
          progress: liveProgressForPhase(event.phase || this.liveBubble.live.phase),
        });
        return;
      case "partial_text":
        this.updateLiveAssistant({
          mode: "answer",
          status: "streaming",
          phase: event.phase || "streaming_answer",
          progress: Math.max(this.liveBubble.live.progress || 0, liveProgressForPhase("streaming_answer")),
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
          phase: event.phase || this.liveBubble.live.phase,
          progress:
            typeof event.progress === "number" ? event.progress : this.liveBubble.live.progress,
          latestLog: event.latestLog || this.liveBubble.live.latestLog,
          latestFile: event.latestFile || this.liveBubble.live.latestFile,
        });
        return;
      case "final":
        this.resolveLiveAssistant({
          content: event.text,
          status: "done",
          mode: this.liveBubble.live.mode === "build" ? "build" : "answer",
          phase: "completed",
        });
        return;
      case "failed":
        this.resolveLiveAssistant({
          content: event.text,
          status: "failed",
          mode: this.liveBubble.live.mode,
          phase: event.phase || "failed",
        });
        return;
      case "canceled":
        this.resolveLiveAssistant({
          content: event.text || "App build was canceled.",
          status: "canceled",
          mode: this.liveBubble.live.mode,
          phase: event.phase || "canceled",
        });
        return;
      default:
        return;
    }
  }

  async handleBinaryBuildEvent(event: BinaryBuildEvent): Promise<void> {
    if (!this.rememberBinaryEvent(event.buildId, event.id)) {
      return;
    }
    this.binary.streamConnected = true;
    this.debugTracker.noteStreamConnected();
    this.debugTracker.noteEvent(event);
    this.binary.lastEventId = event.id;
    this.binaryStreamBuildId = event.buildId;
    await this.persistBinaryCursor(event.buildId, event.id);

    const current = this.binary.activeBuild?.id === event.buildId ? this.binary.activeBuild : null;
    switch (event.type) {
      case "build.created":
        this.applyBinaryLiveEvent({
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
        else this.pushActivity(phaseProgressLabel(event.data.phase));
        this.applyBinaryLiveEvent({
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
      case "generation.delta":
        this.applyBinaryLiveEvent({
          type: "build_event",
          eventType: event.type,
          phase: current?.phase || "materializing",
          progress: current?.progress,
          latestFile: event.data.delta.path,
        });
        if (current) {
          const previewFile = {
            path: event.data.delta.path,
            language: event.data.delta.language,
            preview: String(event.data.delta.content || "").slice(-1_200),
            hash: `delta_${event.data.delta.order}`,
            completed: event.data.delta.completed,
            updatedAt: event.timestamp,
          };
          const files = [previewFile, ...(current.preview?.files || []).filter((item) => item.path !== previewFile.path)].slice(0, 24);
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
      case "token.delta":
        this.applyBinaryLiveEvent({
          type: "build_event",
          eventType: event.type,
          phase: current?.phase || "planning",
          progress: current?.progress,
          latestLog: event.data.text,
        });
        break;
      case "file.updated":
        this.applyBinaryLiveEvent({
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
        this.applyBinaryLiveEvent({
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
        this.applyBinaryLiveEvent({
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
      case "reliability.stream":
        this.applyBinaryLiveEvent({
          type: "build_event",
          eventType: event.type,
          phase: current?.phase || "validating",
          progress: current?.progress,
        });
        if (current) {
          this.setActiveBinaryBuild({
            ...current,
            liveReliability: event.data.reliability,
          });
        }
        break;
      case "graph.updated":
        this.applyBinaryLiveEvent({
          type: "build_event",
          eventType: event.type,
          phase: current?.phase || "materializing",
          progress: current?.progress,
          latestFile: event.data.sourceGraph.modules[0]?.path,
        });
        if (current) {
          this.setActiveBinaryBuild({
            ...current,
            sourceGraph: event.data.sourceGraph,
          });
        }
        break;
      case "ast.delta":
        this.applyBinaryLiveEvent({
          type: "build_event",
          eventType: event.type,
          phase: current?.phase || "materializing",
          progress: current?.progress,
          latestFile: event.data.delta.modulesTouched[0],
        });
        if (current) {
          this.setActiveBinaryBuild({
            ...current,
            astState: {
              ...(current.astState || {
                coverage: event.data.delta.coverage,
                moduleCount: 0,
                modules: [],
                nodes: [],
                updatedAt: event.timestamp,
                source: event.data.delta.source,
              }),
              coverage: event.data.delta.coverage,
              updatedAt: event.data.delta.updatedAt,
              source: event.data.delta.source,
              nodes: event.data.delta.nodes,
              modules: current.astState?.modules || [],
            },
          });
        }
        break;
      case "ast.state":
        this.applyBinaryLiveEvent({
          type: "build_event",
          eventType: event.type,
          phase: current?.phase || "materializing",
          progress: current?.progress,
          latestFile: event.data.astState.modules[0]?.path,
        });
        if (current) {
          this.setActiveBinaryBuild({
            ...current,
            astState: event.data.astState,
          });
        }
        break;
      case "execution.updated":
        this.applyBinaryLiveEvent({
          type: "build_event",
          eventType: event.type,
          phase: current?.phase || "validating",
          progress: current?.progress,
          latestLog: event.data.execution.lastRun?.logs?.slice(-1)[0],
        });
        if (current) {
          const recentLogs = event.data.execution.lastRun?.logs?.length
            ? [...(current.preview?.recentLogs || []), ...event.data.execution.lastRun.logs].slice(-80)
            : current.preview?.recentLogs || [];
          this.setActiveBinaryBuild({
            ...current,
            execution: event.data.execution,
            preview: {
              plan: current.preview?.plan || null,
              files: current.preview?.files || [],
              recentLogs,
            },
          });
        }
        break;
      case "runtime.state":
        this.applyBinaryLiveEvent({
          type: "build_event",
          eventType: event.type,
          phase: current?.phase || "validating",
          progress: current?.progress,
          latestLog: event.data.runtime.availableFunctions.slice(-1)[0]?.name,
        });
        if (current) {
          this.setActiveBinaryBuild({
            ...current,
            runtimeState: event.data.runtime,
          });
        }
        break;
      case "patch.applied":
        this.applyBinaryLiveEvent({
          type: "build_event",
          eventType: event.type,
          phase: current?.phase || "validating",
          progress: current?.progress,
          latestLog: event.data.patch.description,
        });
        if (current) {
          this.setActiveBinaryBuild({
            ...current,
            runtimeState: event.data.runtime,
          });
        }
        break;
      case "artifact.delta":
        this.applyBinaryLiveEvent({
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
        this.applyBinaryLiveEvent({
          type: "build_event",
          eventType: event.type,
          phase: event.data.checkpoint.phase,
          progress: current?.progress,
          latestFile: event.data.checkpoint.preview?.files?.[0]?.path,
          latestLog: event.data.checkpoint.preview?.recentLogs?.slice(-1)[0],
        });
        if (current) {
          const summary = {
            id: event.data.checkpoint.id,
            phase: event.data.checkpoint.phase,
            savedAt: event.data.checkpoint.savedAt,
            ...(event.data.checkpoint.label ? { label: event.data.checkpoint.label } : {}),
          };
          const checkpoints = [summary, ...(current.checkpoints || []).filter((item) => item.id !== summary.id)].slice(0, 40);
          this.setActiveBinaryBuild({
            ...current,
            preview: event.data.checkpoint.preview || current.preview || null,
            manifest: event.data.checkpoint.manifest || current.manifest || null,
            reliability: event.data.checkpoint.reliability || current.reliability || null,
            liveReliability: event.data.checkpoint.liveReliability || current.liveReliability || null,
            artifactState: event.data.checkpoint.artifactState || current.artifactState || null,
            sourceGraph: event.data.checkpoint.sourceGraph || current.sourceGraph || null,
            execution: event.data.checkpoint.execution || current.execution || null,
            astState: event.data.checkpoint.astState || current.astState || null,
            runtimeState: event.data.checkpoint.runtimeState || current.runtimeState || null,
            checkpointId: event.data.checkpoint.id,
            checkpoints,
            snapshots: event.data.checkpoint.snapshot
              ? [event.data.checkpoint.snapshot, ...(current.snapshots || []).filter((item) => item.id !== event.data.checkpoint.snapshot?.id)].slice(0, 80)
              : current.snapshots || [],
            artifact: event.data.checkpoint.artifact || current.artifact || null,
          });
        }
        break;
      case "snapshot.saved":
        this.applyBinaryLiveEvent({
          type: "build_event",
          eventType: event.type,
          phase: event.data.snapshot.phase,
          progress: current?.progress,
          latestFile: event.data.snapshot.checkpointId,
        });
        this.appendBinaryCheckpointSnapshot(event.data.snapshot);
        break;
      case "interrupt.accepted":
        this.applyBinaryLiveEvent({
          type: "build_event",
          eventType: event.type,
          phase: current?.phase || "planning",
          progress: current?.progress,
          latestLog: event.data.message,
        });
        if (event.data.message) this.pushActivity(event.data.message);
        if (current) {
          this.setActiveBinaryBuild({
            ...current,
            pendingRefinement: event.data.pendingRefinement || null,
            cancelable: event.data.action === "cancel" ? false : current.cancelable,
          });
        }
        break;
      case "artifact.ready":
        this.applyBinaryLiveEvent({
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
      case "branch.created":
        this.pushActivity(`Created branch build ${event.data.build.id}.`);
        this.setActiveBinaryBuild(event.data.build);
        break;
      case "build.completed":
      case "build.failed":
      case "build.canceled":
        this.setActiveBinaryBuild(event.data.build);
        break;
      case "rewind.completed":
        this.pushActivity(`Rewound build to checkpoint ${event.data.checkpointId}.`);
        this.setActiveBinaryBuild(event.data.build);
        break;
      case "heartbeat":
        this.applyBinaryLiveEvent({
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
    await this.deps.emitState();
  }

  private async followBinaryBuildStream(input: {
    auth: RequestAuth;
    buildId?: string;
    create?: Omit<Parameters<typeof requestBinaryBuildStream>[0], "signal" | "onEvent">;
  }): Promise<BinaryBuildRecord | null> {
    this.stopBinaryStream();
    const abort = new AbortController();
    this.binaryStreamAbort = abort;
    this.binary.streamConnected = false;
    const cursorUsed = input.buildId ? this.getPersistedBinaryCursor(input.buildId) : null;
    this.debugTracker.noteStreamAttempt({
      kind: input.create ? "create" : "resume",
      buildId: input.buildId || null,
      cursorUsed,
    });
    await this.deps.emitState();

    try {
      if (input.create) {
        await requestBinaryBuildStream({
          ...input.create,
          signal: abort.signal,
          onEvent: async (event) => {
            await this.handleBinaryBuildEvent(event);
          },
        });
      } else if (input.buildId) {
        await requestBinaryStreamEvents({
          auth: input.auth,
          buildId: input.buildId,
          cursor: cursorUsed,
          signal: abort.signal,
          onEvent: async (event) => {
            await this.handleBinaryBuildEvent(event);
          },
        });
      }
      return this.binary.activeBuild;
    } catch (error) {
      this.debugTracker.noteStreamError(error instanceof Error ? error.message : String(error));
      throw error;
    } finally {
      if (this.binaryStreamAbort === abort) {
        this.binaryStreamAbort = null;
        this.binaryStreamBuildId = null;
        this.binary.streamConnected = false;
        this.debugTracker.noteStreamDisconnected();
        await this.deps.emitState();
      }
    }
  }

  private async waitForBinaryBuildCompletion(auth: RequestAuth, initialBuild: BinaryBuildRecord): Promise<BinaryBuildRecord> {
    let current = initialBuild;
    let lastActivity = "";
    let attempt = 0;
    let transientFailures = 0;

    while (isBinaryBuildPending(current)) {
      const nextActivity = current.status === "queued" ? "App build queued" : "Building app";
      if (nextActivity !== lastActivity) {
        this.pushActivity(nextActivity);
        lastActivity = nextActivity;
      }

      this.setActiveBinaryBuild(current);
      await this.deps.emitState();
      await delay(Math.min(1_000 + attempt * 250, 2_500));
      try {
        current = await requestBinaryStatus(auth, current.id);
        transientFailures = 0;
      } catch (error) {
        if (!isTransientBinaryPollError(error) || transientFailures >= 4) {
          throw error;
        }

        transientFailures += 1;
        this.pushActivity(`Retrying app build status (${transientFailures}/4)`);
        await delay(400 * transientFailures);
        continue;
      }
      attempt += 1;
    }

    return current;
  }
}

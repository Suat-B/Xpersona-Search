import * as vscode from "vscode";
import * as path from "path";
import { promises as fs } from "fs";
import { createHash } from "crypto";
import type { RequestAuth } from "@xpersona/vscode-core";
import { CutieAuthManager } from "./auth";
import type { BinaryContextPayload, RetrievalHints } from "./binary-types";
import { CutieBinaryBundleController } from "./cutie-binary-controller";
import { getCurrentStrategyLabel, getStallLabel } from "./cutie-autonomy-controller";
import { summarizeTargetCandidates, summarizeTaskFrame } from "./cutie-code-intelligence";
import { CutieModelAdapter } from "./cutie-model-adapter";
import {
  CUTIE_REASONING_LEVELS,
  EXTENSION_NAMESPACE,
  getBaseApiUrl,
  getBinaryIdeChatRuntime,
  getExtensionVersion,
  getModelHint,
  getModelPickerOptions,
  getOpenCodeAutoStart,
  getPromptMarkdownPath,
  getReasoningLevel,
  getWorkspaceHash,
  getWorkspaceRootPath,
  toWorkspaceRelativePath,
  VIEW_ID,
} from "./config";
import { CutieDesktopAdapter } from "./cutie-desktop-adapter";
import { CutieModelClient } from "./cutie-model-client";
import {
  normalizeOperatingPromptMarkdown,
  resolveBundledOperatingPromptMarkdownPath,
  resolveOperatingPromptMarkdownPath,
} from "./cutie-operating-prompt";
import { looksLikeCutieToolArtifactText } from "./cutie-native-autonomy";
import { CutieRuntime } from "./cutie-runtime";
import { CutieSessionStore } from "./cutie-session-store";
import {
  buildOperationalTranscriptText,
  hasVisibleOperationalTranscript,
  humanizeSuppressedAssistantArtifact,
  mergeTranscriptIntoAssistantContent,
} from "./cutie-transcript";
import { CutieToolRegistry } from "./cutie-tool-registry";
import { CutieWorkspaceAdapter } from "./cutie-workspace-adapter";
import { createTwoFilesPatch } from "diff";
import type {
  CutieBackgroundActivityView,
  CutieChatDiffItem,
  CutieChatMessage,
  CutieMentionSuggestion,
  CutiePromptViewState,
  CutieProgressViewModel,
  CutieRunState,
  CutieSessionRecord,
  CutieSubmitState,
  CutieTranscriptEvent,
  CutieViewState,
  CutieWorkspaceMutationInfo,
} from "./types";
import { createCutieBeforeUri, rememberMutationBefore, registerCutieDiffBeforeProvider, takeLastMutationBefore } from "./cutie-diff";
import { buildCutieDebugReportV2Text } from "./cutie-debug-report";
import { buildWebviewHtml } from "./webview-html";
import { randomId } from "./cutie-policy";
import { gatherPortableBundleContext } from "./binary-portable-context";
import { buildSelectionPrefill } from "./selection-prefill";
import { CutiePlaygroundChatBridge } from "./cutie-playground-chat-bridge";
import { CutieCliParityClient } from "./cutie-cli-parity-client";
import { resolveCutieParityCommand, type CutieParityCommand } from "./cutie-cli-parity";

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
  | { type: "binarySetTarget"; runtime: string }
  | { type: "setComposerModel"; model: string }
  | { type: "setComposerReasoningLevel"; level: string };

type DesktopContextForView = CutieViewState["desktop"];

type CutieDynamicSettingsSnapshot = {
  maxToolsPerBatch: number;
  contextReceiptWindow: number;
  investigationPreflight: boolean;
  objectiveBasedRuns: boolean;
  objectiveBasedInvestigation: boolean;
  maxToolSteps: number;
  maxWorkspaceMutations: number;
  unlimitedAutonomy: boolean;
  contextPreviewChars: number;
  openFilePreviewLines: number;
  maxOpenFilesInContext: number;
};

type CutieActiveFileSnapshot = {
  path?: string;
  language: string;
  lineCount: number;
  preview?: string;
  selection?: string;
  selectionRange?: {
    startLine: number;
    endLine: number;
  };
};

type CutieOpenFileSnapshot = {
  path: string;
  language: string;
  lineCount: number;
  preview?: string;
};

type CutieDiagnosticSnapshot = {
  file?: string;
  severity: number;
  message: string;
  line: number;
};

type CutieEditorContextSnapshot = {
  activeFile?: CutieActiveFileSnapshot;
  openFiles: CutieOpenFileSnapshot[];
  diagnostics: CutieDiagnosticSnapshot[];
};

type CutieWarmSubsystemReady = NonNullable<CutieViewState["warmStartState"]>["subsystemReady"];

type CutieWarmStartSnapshot = {
  capturedAt: string;
  workspaceHash: string;
  workspaceRootPath?: string | null;
  extensionVersion: string;
  authState: CutieViewState["authState"];
  requestAuthReady: boolean;
  desktopState: DesktopContextForView;
  gitStatusSummary?: string;
  workspaceMentionPaths: string[];
  activeFile?: CutieActiveFileSnapshot;
  openFiles: CutieOpenFileSnapshot[];
  diagnostics: CutieDiagnosticSnapshot[];
  cutieDynamicSettings: CutieDynamicSettingsSnapshot;
  localReady: boolean;
  hostReady: boolean | null;
  warmFailureSummary?: string;
  subsystemReady: CutieWarmSubsystemReady;
};

type CachedRequestAuth = {
  auth: RequestAuth;
  fetchedAt: number;
};

type CutieLoadedOperatingPromptState = CutiePromptViewState & {
  promptResolvedPath?: string;
  promptContent?: string;
};

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
  const taskFrameSummary = summarizeTaskFrame(run.taskFrame);
  const targetSummary = summarizeTargetCandidates(run.targetCandidates, run.preferredTargetPath);
  return {
    goal: run.goal,
    goalLabel: goalLabel(run.goal),
    phaseLabel: phaseLabel(run),
    pursuingLabel: pursuitLabel(run),
    ...(run.lastMeaningfulProgressSummary ? { lastMeaningfulProgressSummary: run.lastMeaningfulProgressSummary } : {}),
    ...(run.lastActionSummary ? { lastActionSummary: run.lastActionSummary } : {}),
    ...(taskFrameSummary ? { taskFrameSummary } : {}),
    ...(targetSummary ? { targetSummary } : {}),
    ...(run.repairAttemptCount > 0 ? { repairLabel: `Repair stage ${run.repairAttemptCount}` } : {}),
    ...(run.objectiveRepairCount && run.objectiveRepairCount > 0
      ? { objectiveRepairLabel: `Objective repair ${run.objectiveRepairCount}` }
      : {}),
    ...(run.currentRepairTactic ? { repairTacticLabel: run.currentRepairTactic.replace(/_/g, " ") } : {}),
    ...(run.stallLevel && run.stallLevel !== "none" ? { stallLabel: getStallLabel(run) } : {}),
    ...(run.stallReason ? { stallReason: run.stallReason } : {}),
    ...(run.stallNextAction ? { stallNextAction: run.stallNextAction } : {}),
    ...(run.lastNewEvidence ? { lastNewEvidence: run.lastNewEvidence } : {}),
    ...(run.noOpConclusion ? { noOpConclusion: run.noOpConclusion } : {}),
    ...(run.modelAdapter ||
    run.protocolMode ||
    run.normalizationSource ||
    run.artifactExtractionShape ||
    run.fallbackModeUsed ||
    run.simpleTaskFastPath ||
    run.objectiveSuspendedForDirectRecovery ||
    run.promptSource
      ? {
          modelStrategySummary: [
            run.modelAdapter ? `adapter ${run.modelAdapter}` : "",
            run.protocolMode ? `mode ${run.protocolMode}` : "",
            run.normalizationSource ? `source ${run.normalizationSource}` : "",
            run.artifactExtractionShape ? `artifact ${run.artifactExtractionShape}` : "",
            run.fallbackModeUsed && run.fallbackModeUsed !== "none" ? `fallback ${run.fallbackModeUsed}` : "",
            run.simpleTaskFastPath ? "fast-path" : "",
            run.objectiveSuspendedForDirectRecovery ? "objectives suspended" : "",
            run.suppressedToolRescued ? `rescued ${run.suppressedToolName || "artifact"}` : "",
            run.patchDisabledForRun ? "patch disabled" : "",
            run.mutationCoercionMode ? `coercion ${run.mutationCoercionMode}` : "",
            run.promptSource ? `prompt ${run.promptSource}` : "",
            run.promptSource === "external_fallback" && run.promptLoadError ? "prompt fallback" : "",
          ]
            .filter(Boolean)
            .join(" • "),
        }
      : {}),
    ...(getCurrentStrategyLabel(run) ? { currentStrategyLabel: getCurrentStrategyLabel(run) } : {}),
    ...(run.stuckReason ? { escalationMessage: run.stuckReason } : {}),
    ...(run.suggestedNextAction || run.nextDeterministicAction
      ? { suggestedNextAction: run.suggestedNextAction || run.nextDeterministicAction }
      : {}),
    goalSatisfied: run.goalSatisfied,
    escalationState: run.escalationState,
    ...(run.objectives?.length ? { objectives: run.objectives } : {}),
    ...(run.objectivesPhase ? { objectivesPhase: run.objectivesPhase } : {}),
  };
}

function isBusySubmitState(submitState: CutieSubmitState): boolean {
  return submitState === "submitting" || submitState === "starting" || submitState === "running" || submitState === "stopping";
}

function settledStatusForRun(run: CutieRunState | null): string {
  if (!run) return "Ready for your next message.";
  if (run.status === "completed") return "Cutie completed the run.";
  if (run.status === "needs_guidance") return "Cutie needs guidance to keep making real progress.";
  if (run.status === "canceled") return "Cutie run cancelled.";
  if (run.error) return `Cutie stopped: ${run.error}`;
  return "Cutie stopped early.";
}

function isTerminalRunStatus(status: CutieRunState["status"]): boolean {
  return status === "completed" || status === "failed" || status === "canceled";
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

function asObjectRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

function asUnknownArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function unwrapData<T = unknown>(value: unknown): T {
  const root = asObjectRecord(value);
  return ("data" in root ? root.data : value) as T;
}

function readString(value: unknown, fallback = ""): string {
  return typeof value === "string" ? value : fallback;
}

function readNumber(value: unknown, fallback = 0): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function prettyJson(value: unknown): string {
  return JSON.stringify(value, null, 2);
}

function formatMaybeList(label: string, values: unknown, fallback = "none"): string {
  const items = asUnknownArray(values)
    .map((item) => readString(item).trim())
    .filter(Boolean);
  return `${label}: ${items.length ? items.join(", ") : fallback}`;
}

function detectBinaryKind(buffer: Buffer): string {
  if (buffer.length >= 2 && buffer[0] === 0x4d && buffer[1] === 0x5a) return "PE / Windows executable";
  if (buffer.length >= 4 && buffer[0] === 0x7f && buffer[1] === 0x45 && buffer[2] === 0x4c && buffer[3] === 0x46) return "ELF";
  if (buffer.length >= 4 && buffer[0] === 0xcf && buffer[1] === 0xfa && buffer[2] === 0xed && buffer[3] === 0xfe) return "Mach-O 64-bit";
  if (buffer.length >= 4 && buffer[0] === 0x50 && buffer[1] === 0x4b && buffer[2] === 0x03 && buffer[3] === 0x04) return "ZIP archive";
  if (buffer.length >= 8 && buffer.slice(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return "PNG image";
  return "Unknown binary";
}

function formatHexdump(bytes: Buffer, offset = 0): string {
  const lines: string[] = [];
  for (let lineOffset = 0; lineOffset < bytes.length; lineOffset += 16) {
    const slice = bytes.slice(lineOffset, lineOffset + 16);
    const hex = Array.from(slice.values())
      .map((value) => value.toString(16).padStart(2, "0"))
      .join(" ")
      .padEnd(16 * 3 - 1, " ");
    const ascii = Array.from(slice.values())
      .map((value) => (value >= 32 && value <= 126 ? String.fromCharCode(value) : "."))
      .join("");
    lines.push(`${(offset + lineOffset).toString(16).padStart(8, "0")}  ${hex}  ${ascii}`);
  }
  return lines.join("\n");
}

async function collectIndexableFiles(rootPath: string, limit = 120): Promise<string[]> {
  const out: string[] = [];
  const ignored = new Set([".git", "node_modules", ".next", "dist", "out", "coverage", "build"]);

  async function walk(currentPath: string): Promise<void> {
    if (out.length >= limit) return;
    const entries = await fs.readdir(currentPath, { withFileTypes: true });
    for (const entry of entries) {
      if (out.length >= limit) return;
      if (ignored.has(entry.name)) continue;
      const fullPath = path.join(currentPath, entry.name);
      if (entry.isDirectory()) {
        await walk(fullPath);
        continue;
      }
      out.push(fullPath);
    }
  }

  await walk(rootPath);
  return out;
}

function chunkTextForIndex(relativePath: string, content: string, chunkSize = 3000): Array<Record<string, unknown>> {
  const chunks: Array<Record<string, unknown>> = [];
  for (let index = 0; index < content.length; index += chunkSize) {
    const chunk = content.slice(index, index + chunkSize);
    const pathHash = createHash("sha256").update(relativePath).digest("hex");
    const chunkHash = createHash("sha256").update(`${relativePath}:${index}:${chunk}`).digest("hex");
    chunks.push({
      pathHash,
      chunkHash,
      pathDisplay: relativePath,
      content: chunk,
      metadata: {
        relativePath,
        startOffset: index,
      },
    });
  }
  return chunks;
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
  private status = "Cutie is ready.";
  private submitState: CutieSubmitState = "idle";
  private webviewReady = false;
  private webviewReadyTimeout: NodeJS.Timeout | null = null;
  private webviewBootNonce = 0;
  private activeRun: CutieRunState | null = null;
  private activeRunSessionId: string | null = null;
  private currentAbortController: AbortController | null = null;
  /** Monotonic guard so callbacks from an older aborted run cannot overwrite a newer conversation state. */
  private runRequestVersion = 0;
  private streamingAssistantText = "";
  /** Ephemeral IDE-runtime progress paragraphs (plain text), shown as an assistant bubble while the runtime is busy. */
  private playgroundLiveNarration = "";
  private suppressedAssistantArtifactText = "";
  private liveActionLog: string[] = [];
  private liveActionLogRunId: string | null = null;
  private liveTranscript: CutieTranscriptEvent[] = [];
  private liveTranscriptRunId: string | null = null;
  private liveActionSeenReceiptIds = new Set<string>();
  private liveActionLastStatus = "";
  private readonly liveActionLogByRunId = new Map<string, string[]>();
  private readonly liveTranscriptByRunId = new Map<string, CutieTranscriptEvent[]>();
  private readonly liveActionSeenReceiptIdsByRunId = new Map<string, string[]>();
  private readonly liveActionLastStatusByRunId = new Map<string, string>();
  private readonly liveActionTranscriptPersistedRunIds = new Set<string>();
  private desktopState: DesktopContextForView = buildDefaultDesktopState();
  private desktopStateFetchedAt = 0;
  private gitStatusSummary: string | undefined;
  private gitStatusFetchedAt = 0;
  private gitStatusPromise: Promise<string | undefined> | null = null;
  private fastStartWarmupPromise: Promise<void> | null = null;
  private warmStartSnapshot: CutieWarmStartSnapshot | null = null;
  private warmStartWarming = false;
  private hostProbePromise: Promise<void> | null = null;
  private hostReady: boolean | null = null;
  private hostReadyCheckedAt = 0;
  private hostFailureSummary: string | undefined;
  private cachedRequestAuth: CachedRequestAuth | null = null;
  private operatingPromptLoadPromise: Promise<void> | null = null;
  private operatingPromptState: CutieLoadedOperatingPromptState = {
    promptSource: "builtin_only",
    promptMarkdownPath: getPromptMarkdownPath(),
    promptLoaded: false,
  };
  private operatingPromptWatcher: vscode.FileSystemWatcher | null = null;
  private warmRefreshDebounce: NodeJS.Timeout | null = null;
  private authState: CutieViewState["authState"] = {
    kind: "none",
    label: "Not signed in",
  };

  /** Cached workspace paths for @ file lookup (avoid findFiles on every keystroke). */
  private workspaceMentionPaths: string[] | null = null;
  private workspaceMentionPathsFetchedAt = 0;
  private workspaceMentionIndexPromise: Promise<string[]> | null = null;
  private static readonly WORKSPACE_MENTION_INDEX_TTL_MS = 90_000;
  private static readonly MENTION_QUERY_INDEX_WAIT_MS = 60;
  private static readonly MAX_CHAT_DIFFS_PER_SESSION = 120;
  private static readonly MAX_PATCH_CHARS = 52_000;
  private static readonly MAX_FILE_CHARS_FOR_PATCH = 500_000;
  /**
   * Default when setting `cutie-product.webviewReadyTimeoutMs` is unset.
   * Large chat webview (external script); Cursor and other hosts may need extra time before `ready`.
   */
  private static readonly WEBVIEW_READY_TIMEOUT_DEFAULT_MS = 60_000;
  private static readonly WEBVIEW_READY_TIMEOUT_MIN_MS = 5_000;
  private static readonly WEBVIEW_READY_TIMEOUT_MAX_MS = 300_000;
  private static readonly MAX_LIVE_ACTION_LINES = 120;
  private static readonly DESKTOP_CONTEXT_CACHE_TTL_MS = 8_000;
  private static readonly GIT_STATUS_CACHE_TTL_MS = 15_000;
  private static readonly WARM_START_TTL_MS = 15_000;
  private static readonly WARM_REFRESH_DEBOUNCE_MS = 220;
  private static readonly REQUEST_AUTH_CACHE_TTL_MS = 60_000;
  private static readonly HOST_PROBE_TTL_MS = 30_000;
  private static readonly HOST_PROBE_TIMEOUT_MS = 1_500;

  /** Inline chat diff cards keyed by session id (rehydrated from persisted run receipts on load). */
  private readonly chatDiffsBySessionId = new Map<string, CutieChatDiffItem[]>();

  /** Recent workspace paths mutated by Cutie (portable bundle retrievalHints). */
  private recentPortableBundleTouchedPaths: string[] = [];

  private readonly playgroundChatBridge: CutiePlaygroundChatBridge;

  private readonly desktop = new CutieDesktopAdapter();
  private readonly workspaceAdapter = new CutieWorkspaceAdapter();
  private readonly sessionStore: CutieSessionStore;
  private readonly modelClient = new CutieModelClient();
  private readonly modelAdapter = new CutieModelAdapter(this.modelClient);
  private readonly parityClient = new CutieCliParityClient();
  private readonly toolRegistry: CutieToolRegistry;
  private readonly runtime: CutieRuntime;
  private readonly binaryController: CutieBinaryBundleController;

  constructor(
    private readonly context: vscode.ExtensionContext,
    private readonly auth: CutieAuthManager
  ) {
    this.sessionStore = new CutieSessionStore(context);
    this.playgroundChatBridge = new CutiePlaygroundChatBridge(context, auth);
    this.toolRegistry = new CutieToolRegistry(new CutieWorkspaceAdapter(), this.desktop);
    this.runtime = new CutieRuntime(this.sessionStore, this.modelAdapter, this.toolRegistry, async () => this.gatherContext());

    this.binaryController = new CutieBinaryBundleController(this.context, this.auth, this.sessionStore, {
      getWorkspaceHash: () => getWorkspaceHash(),
      getActiveSession: () => this.activeSession,
      getSessionById: (sessionId) => this.sessionStore.getSession(getWorkspaceHash(), sessionId),
      setActiveSession: (session) => {
        if (!session) {
          if (!this.activeSessionId) this.activeSession = null;
          return;
        }
        if (this.activeSessionId === session.id) {
          this.activeSession = session;
        }
      },
      emitState: () => this.emitState(),
      gatherBinaryContext: (intent) => this.gatherBinaryContextForPortableBundle(intent),
      showView: () => this.show(),
    });

    this.auth.onDidChange(() => {
      this.invalidateRequestAuthCache();
      this.hostReady = null;
      this.hostReadyCheckedAt = 0;
      this.hostFailureSummary = undefined;
      void this.refreshAuthState().finally(() => {
        void this.prewarmFastStartState();
        void this.emitState();
      });
    });

    this.context.subscriptions.push(
      vscode.workspace.onDidChangeWorkspaceFolders(() => {
        this.invalidateWorkspaceMentionIndex();
        this.scheduleWarmStartRefresh(true);
      }),
      vscode.window.onDidChangeActiveTextEditor(() => {
        this.scheduleWarmStartRefresh();
      }),
      vscode.window.onDidChangeVisibleTextEditors(() => {
        this.scheduleWarmStartRefresh();
      }),
      vscode.languages.onDidChangeDiagnostics(() => {
        this.scheduleWarmStartRefresh();
      }),
      vscode.workspace.onDidChangeConfiguration((event) => {
        if (
          event.affectsConfiguration("cutie-product.baseApiUrl") ||
          event.affectsConfiguration("cutie-product.binary") ||
          event.affectsConfiguration("cutie-product.model") ||
          event.affectsConfiguration("cutie-product.reasoningLevel") ||
          event.affectsConfiguration("cutie-product.contextPreviewChars") ||
          event.affectsConfiguration("cutie-product.openFilePreviewLines") ||
          event.affectsConfiguration("cutie-product.maxOpenFilesInContext") ||
          event.affectsConfiguration("cutie-product.maxToolsPerBatch") ||
          event.affectsConfiguration("cutie-product.contextReceiptWindow") ||
          event.affectsConfiguration("cutie-product.investigationPreflight") ||
          event.affectsConfiguration("cutie-product.objectiveBasedRuns") ||
          event.affectsConfiguration("cutie-product.objectiveBasedInvestigation") ||
          event.affectsConfiguration("cutie-product.maxToolSteps") ||
          event.affectsConfiguration("cutie-product.maxWorkspaceMutations") ||
          event.affectsConfiguration("cutie-product.unlimitedAutonomy")
        ) {
          if (event.affectsConfiguration("cutie-product.baseApiUrl")) {
            this.hostReady = null;
            this.hostReadyCheckedAt = 0;
            this.hostFailureSummary = undefined;
            this.invalidateRequestAuthCache();
          }
          this.scheduleWarmStartRefresh(event.affectsConfiguration("cutie-product.baseApiUrl"));
          void this.emitState();
        }
      })
    );
    this.context.subscriptions.push({
      dispose: () => {
        this.clearWebviewReadyTimeout();
        if (this.warmRefreshDebounce) {
          clearTimeout(this.warmRefreshDebounce);
          this.warmRefreshDebounce = null;
        }
      },
    });
  }

  private resetLiveActionLog(runId: string | null = null): void {
    this.liveActionLog = [];
    this.liveActionLogRunId = runId;
    this.liveTranscript = [];
    this.liveTranscriptRunId = runId;
    this.liveActionSeenReceiptIds = new Set<string>();
    this.liveActionLastStatus = "";
    if (runId) {
      this.liveActionLogByRunId.set(runId, []);
      this.liveTranscriptByRunId.set(runId, []);
      this.liveActionSeenReceiptIdsByRunId.set(runId, []);
      this.liveActionLastStatusByRunId.set(runId, "");
    }
  }

  private ensureLiveActionLogForRun(run: CutieRunState | null): void {
    const runId = run?.id || null;
    if (runId !== this.liveActionLogRunId) {
      const carryOverTranscript =
        !this.liveTranscriptRunId && this.liveTranscript.length ? [...this.liveTranscript] : [];
      this.liveActionLogRunId = runId;
      this.liveActionLog = runId ? [...(this.liveActionLogByRunId.get(runId) || [])] : [];
      this.liveTranscriptRunId = runId;
      this.liveTranscript = runId ? [...(this.liveTranscriptByRunId.get(runId) || []), ...carryOverTranscript] : carryOverTranscript;
      this.liveActionSeenReceiptIds = new Set(runId ? this.liveActionSeenReceiptIdsByRunId.get(runId) || [] : []);
      this.liveActionLastStatus = runId ? this.liveActionLastStatusByRunId.get(runId) || "" : "";
      this.persistLiveActionStateForCurrentRun();
    }
  }

  private persistLiveActionStateForCurrentRun(): void {
    const runId = this.liveActionLogRunId;
    if (!runId) return;
    this.liveActionLogByRunId.set(runId, [...this.liveActionLog]);
    this.liveTranscriptByRunId.set(runId, this.liveTranscript.map((event) => ({ ...event })));
    this.liveActionSeenReceiptIdsByRunId.set(runId, Array.from(this.liveActionSeenReceiptIds));
    this.liveActionLastStatusByRunId.set(runId, this.liveActionLastStatus);
  }

  private getLiveActionLogForRun(run: CutieRunState | null): string[] {
    const runId = run?.id || null;
    if (!runId) return [];
    if (runId === this.liveActionLogRunId) return [...this.liveActionLog];
    return [...(this.liveActionLogByRunId.get(runId) || [])];
  }

  private getLiveTranscriptForRun(run: CutieRunState | null): CutieTranscriptEvent[] {
    const runId = run?.id || null;
    if (!runId) return this.liveTranscript.map((event) => ({ ...event }));
    if (runId === this.liveTranscriptRunId) return this.liveTranscript.map((event) => ({ ...event }));
    return (this.liveTranscriptByRunId.get(runId) || []).map((event) => ({ ...event }));
  }

  private upsertLiveTranscriptEvent(input: {
    kind: CutieTranscriptEvent["kind"];
    text: string;
    run?: CutieRunState | null;
    createdAt?: string;
    slot?: string;
    dedupeKey?: string;
  }): void {
    const text = String(input.text || "").trim();
    if (!text) return;
    if (input.run) {
      this.ensureLiveActionLogForRun(input.run);
    }
    const slot = String(input.slot || "").trim();
    const dedupeKey = String(input.dedupeKey || "").trim();
    if (slot) {
      const existingIndex = this.liveTranscript.findIndex((event) => event.slot === slot);
      if (existingIndex >= 0) {
        this.liveTranscript[existingIndex] = {
          ...this.liveTranscript[existingIndex],
          kind: input.kind,
          text,
          ...(input.run?.id ? { runId: input.run.id } : {}),
          ...(dedupeKey ? { dedupeKey } : {}),
        };
        this.persistLiveActionStateForCurrentRun();
        return;
      }
    }
    const last = this.liveTranscript[this.liveTranscript.length - 1];
    if (
      last &&
      last.kind === input.kind &&
      last.text === text &&
      ((!dedupeKey && !last.dedupeKey) || (dedupeKey && last.dedupeKey === dedupeKey))
    ) {
      return;
    }
    this.liveTranscript.push({
      id: randomId("cutie_tx"),
      kind: input.kind,
      text,
      createdAt: input.createdAt || new Date().toISOString(),
      ...(input.run?.id ? { runId: input.run.id } : {}),
      ...(slot ? { slot } : {}),
      ...(dedupeKey ? { dedupeKey } : {}),
    });
    this.persistLiveActionStateForCurrentRun();
  }

  private async persistUnifiedRunTranscript(run: CutieRunState | null): Promise<void> {
    if (!run) return;
    const runId = String(run.id || "").trim();
    if (!runId || this.liveActionTranscriptPersistedRunIds.has(runId)) return;
    const events = this.getLiveTranscriptForRun(run);
    const transcriptText = buildOperationalTranscriptText(events, run.goal);
    if (!transcriptText || !hasVisibleOperationalTranscript(events, run.goal)) return;
    const sourceSession = this.activeSession;
    if (!sourceSession) return;
    const messages = [...sourceSession.messages];
    let updated = false;
    for (let index = messages.length - 1; index >= 0; index -= 1) {
      const message = messages[index];
      if (message.role !== "assistant" || message.runId !== runId) continue;
      messages[index] = {
        ...message,
        content: mergeTranscriptIntoAssistantContent({
          events,
          assistantContent: message.content,
          goal: run.goal,
        }),
        presentation: "run_transcript",
      };
      updated = true;
      break;
    }
    const nextSession = updated
      ? await this.sessionStore.replaceMessages(sourceSession, messages)
      : await this.sessionStore.appendMessage(sourceSession, {
          role: "assistant",
          content: transcriptText,
          runId,
          presentation: "run_transcript",
        });
    this.liveActionTranscriptPersistedRunIds.add(runId);
    this.activeSession = nextSession;
    this.activeSessionId = nextSession.id;
  }

  private appendLiveActionLine(rawLine: string): void {
    const line = String(rawLine || "").trim();
    if (!line) return;
    if (this.liveActionLog.length && this.liveActionLog[this.liveActionLog.length - 1] === line) return;
    this.liveActionLog.push(line);
    if (this.liveActionLog.length > CutieSidebarProvider.MAX_LIVE_ACTION_LINES) {
      this.liveActionLog = this.liveActionLog.slice(-CutieSidebarProvider.MAX_LIVE_ACTION_LINES);
    }
    this.persistLiveActionStateForCurrentRun();
  }

  private formatLiveActionReceiptLine(receipt: CutieRunState["receipts"][number]): string {
    const step =
      typeof receipt.step === "number" && receipt.step > 0 ? `Step ${receipt.step}: ` : "";
    const summary = String(receipt.summary || "").trim();
    if (receipt.status === "failed") {
      const err = String(receipt.error || "").trim();
      return `${step}${summary || `${receipt.toolName} failed.`}${err ? ` ${err}` : ""}`.trim();
    }
    if (receipt.status === "blocked") {
      const err = String(receipt.error || "").trim();
      return `${step}${summary || `${receipt.toolName} was blocked.`}${err ? ` ${err}` : ""}`.trim();
    }
    return `${step}${summary || `Ran ${receipt.toolName}.`}`.trim();
  }

  private syncLiveActionReceipts(run: CutieRunState | null): void {
    if (!run) return;
    this.ensureLiveActionLogForRun(run);
    for (const receipt of run.receipts || []) {
      const receiptId = String(receipt.id || "").trim();
      const seenKey = receiptId || `${run.id}:${receipt.step}:${receipt.toolName}:${receipt.status}`;
      if (this.liveActionSeenReceiptIds.has(seenKey)) continue;
      this.liveActionSeenReceiptIds.add(seenKey);
      const line = this.formatLiveActionReceiptLine(receipt);
      this.appendLiveActionLine(line);
      this.upsertLiveTranscriptEvent({
        kind: "tool_result",
        text: line,
        run,
        createdAt: receipt.finishedAt || receipt.startedAt,
        slot: receiptId ? `receipt:${receiptId}` : undefined,
        dedupeKey: seenKey,
      });
    }
  }

  private noteLiveActionStatus(status: string, run: CutieRunState | null): void {
    if (!run) return;
    this.ensureLiveActionLogForRun(run);
    const line = String(status || "").trim();
    if (!line || line === this.liveActionLastStatus) return;
    this.liveActionLastStatus = line;
    this.appendLiveActionLine(line);
    this.upsertLiveTranscriptEvent({
      kind: "status",
      text: line,
      run,
      dedupeKey: `status:${line}`,
    });
    this.persistLiveActionStateForCurrentRun();
  }

  private async gatherBinaryContextForPortableBundle(
    intent: string
  ): Promise<{ context: BinaryContextPayload; retrievalHints: RetrievalHints }> {
    return gatherPortableBundleContext({
      intentText: intent,
      recentTouchedPaths: [...this.recentPortableBundleTouchedPaths],
    });
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

  /**
   * Keep @ suggestions snappy:
   * - Return fresh cache immediately.
   * - If cache is stale, return stale results while refreshing in background.
   * - If no cache exists yet, wait briefly for the first index build, then fall back.
   */
  private async getWorkspaceMentionPathsForQuery(): Promise<string[]> {
    const cached = this.workspaceMentionPaths;
    const cacheIsFresh = Boolean(
      cached &&
      Date.now() - this.workspaceMentionPathsFetchedAt < CutieSidebarProvider.WORKSPACE_MENTION_INDEX_TTL_MS
    );
    if (cacheIsFresh && cached) {
      return cached;
    }

    const refreshPromise = this.ensureWorkspaceMentionIndex().catch(() => this.workspaceMentionPaths || []);

    if (cached && cached.length > 0) {
      void refreshPromise;
      return cached;
    }

    let timeoutHandle: NodeJS.Timeout | null = null;
    const timeoutPromise = new Promise<null>((resolve) => {
      timeoutHandle = setTimeout(() => resolve(null), CutieSidebarProvider.MENTION_QUERY_INDEX_WAIT_MS);
    });
    try {
      const result = await Promise.race([refreshPromise, timeoutPromise]);
      return Array.isArray(result) ? result : this.workspaceMentionPaths || [];
    } finally {
      if (timeoutHandle) clearTimeout(timeoutHandle);
    }
  }

  resolveWebviewView(webviewView: vscode.WebviewView): void {
    this.view = webviewView;
    this.webviewReady = false;
    webviewView.webview.options = { enableScripts: true };
    try {
      webviewView.webview.onDidReceiveMessage((message: WebviewMessage) => {
        void this.handleMessage(message);
      });
      webviewView.webview.html = buildWebviewHtml(webviewView.webview, this.context.extensionUri);
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
    this.activeSessionId = null;
    this.activeSession = null;
    if (!this.currentAbortController && !this.binaryController.hasOngoingWork()) {
      this.activeRun = null;
      this.activeRunSessionId = null;
      this.submitState = "idle";
      this.streamingAssistantText = "";
      this.playgroundLiveNarration = "";
      this.suppressedAssistantArtifactText = "";
      this.resetLiveActionLog();
      this.status = "OpenHands connected. Cutie is ready.";
    }
    await this.emitState();
    void this.prewarmFastStartState();
    await this.refreshDesktopState();
    await this.emitState();
  }

  startBackgroundWarmup(): void {
    void this.prewarmFastStartState();
  }

  private invalidateRequestAuthCache(): void {
    this.cachedRequestAuth = null;
  }

  private isWarmSnapshotFresh(snapshot: CutieWarmStartSnapshot | null = this.warmStartSnapshot): boolean {
    if (!snapshot) return false;
    if (snapshot.workspaceHash !== getWorkspaceHash()) return false;
    const capturedAt = Date.parse(snapshot.capturedAt);
    if (!Number.isFinite(capturedAt)) return false;
    return Date.now() - capturedAt < CutieSidebarProvider.WARM_START_TTL_MS;
  }

  private scheduleWarmStartRefresh(force = false): void {
    if (this.warmRefreshDebounce) {
      clearTimeout(this.warmRefreshDebounce);
      this.warmRefreshDebounce = null;
    }
    this.warmRefreshDebounce = setTimeout(() => {
      this.warmRefreshDebounce = null;
      void this.refreshWarmStartSnapshot(force);
    }, CutieSidebarProvider.WARM_REFRESH_DEBOUNCE_MS);
  }

  private async getCachedRequestAuth(force = false): Promise<RequestAuth | null> {
    const now = Date.now();
    if (
      !force &&
      this.cachedRequestAuth &&
      now - this.cachedRequestAuth.fetchedAt < CutieSidebarProvider.REQUEST_AUTH_CACHE_TTL_MS
    ) {
      return this.cachedRequestAuth.auth;
    }
    const auth = await this.auth.getRequestAuth().catch(() => null);
    if (!auth) {
      this.cachedRequestAuth = null;
      return null;
    }
    this.cachedRequestAuth = {
      auth,
      fetchedAt: now,
    };
    return auth;
  }

  private getPromptStateForView(): CutiePromptViewState {
    return {
      promptSource: this.operatingPromptState.promptSource,
      ...(this.operatingPromptState.promptMarkdownPath
        ? { promptMarkdownPath: this.operatingPromptState.promptMarkdownPath }
        : {}),
      promptLoaded: this.operatingPromptState.promptLoaded,
      ...(this.operatingPromptState.promptLoadError
        ? { promptLoadError: this.operatingPromptState.promptLoadError }
        : {}),
      ...(this.operatingPromptState.promptLastLoadedAt
        ? { promptLastLoadedAt: this.operatingPromptState.promptLastLoadedAt }
        : {}),
    };
  }

  private disposeOperatingPromptWatcher(): void {
    this.operatingPromptWatcher?.dispose();
    this.operatingPromptWatcher = null;
  }

  private refreshOperatingPromptWatcher(resolvedPath?: string): void {
    const nextPath = String(resolvedPath || "").trim();
    const currentPath = String(this.operatingPromptState.promptResolvedPath || "").trim();
    if (nextPath === currentPath && this.operatingPromptWatcher) return;
    this.disposeOperatingPromptWatcher();
    if (!nextPath) {
      delete this.operatingPromptState.promptResolvedPath;
      return;
    }
    this.operatingPromptState = {
      ...this.operatingPromptState,
      promptResolvedPath: nextPath,
    };
    const watcher = vscode.workspace.createFileSystemWatcher(
      new vscode.RelativePattern(path.dirname(nextPath), path.basename(nextPath))
    );
    const refresh = () => {
      void this.refreshOperatingPromptState(true).then(() => this.emitState());
    };
    watcher.onDidChange(refresh);
    watcher.onDidCreate(refresh);
    watcher.onDidDelete(refresh);
    this.context.subscriptions.push(watcher);
    this.operatingPromptWatcher = watcher;
  }

  private async refreshOperatingPromptState(force = false): Promise<void> {
    if (!force && this.operatingPromptLoadPromise) {
      await this.operatingPromptLoadPromise;
      return;
    }
    const configuredPath = getPromptMarkdownPath();
    const resolved = resolveOperatingPromptMarkdownPath(configuredPath, getWorkspaceRootPath());
    if (
      !force &&
      String(this.operatingPromptState.promptMarkdownPath || "") === configuredPath &&
      String(this.operatingPromptState.promptResolvedPath || "") === String(resolved.resolvedPath || "") &&
      (this.operatingPromptState.promptSource === "builtin_only" ||
        this.operatingPromptState.promptSource === "external_markdown" ||
        this.operatingPromptState.promptSource === "bundled_markdown" ||
        this.operatingPromptState.promptSource === "external_fallback")
    ) {
      return;
    }
    this.operatingPromptLoadPromise = (async () => {
      const bundledResolvedPath = resolveBundledOperatingPromptMarkdownPath();
      this.refreshOperatingPromptWatcher(resolved.resolvedPath || undefined);
      if (!configuredPath) {
        this.operatingPromptState = {
          promptSource: "builtin_only",
          promptLoaded: false,
        };
        return;
      }
      if (!resolved.resolvedPath) {
        if (bundledResolvedPath) {
          const bundledRaw = await vscode.workspace.fs.readFile(vscode.Uri.file(bundledResolvedPath));
          const bundledMarkdown = normalizeOperatingPromptMarkdown(Buffer.from(bundledRaw).toString("utf8"));
          if (bundledMarkdown) {
            this.operatingPromptState = {
              promptSource: "bundled_markdown",
              promptMarkdownPath: configuredPath,
              promptResolvedPath: bundledResolvedPath,
              promptLoaded: true,
              promptLastLoadedAt: new Date().toISOString(),
              promptContent: bundledMarkdown,
            };
            return;
          }
        }
        this.operatingPromptState = {
          promptSource: "external_fallback",
          promptMarkdownPath: configuredPath,
          promptLoaded: false,
          ...(resolved.error ? { promptLoadError: resolved.error } : {}),
        };
        return;
      }
      try {
        const raw = await vscode.workspace.fs.readFile(vscode.Uri.file(resolved.resolvedPath));
        const markdown = normalizeOperatingPromptMarkdown(Buffer.from(raw).toString("utf8"));
        if (!markdown) {
          throw new Error("Prompt markdown file is empty.");
        }
        this.operatingPromptState = {
          promptSource: "external_markdown",
          promptMarkdownPath: configuredPath,
          promptResolvedPath: resolved.resolvedPath,
          promptLoaded: true,
          promptLastLoadedAt: new Date().toISOString(),
          promptContent: markdown,
        };
      } catch (error) {
        if (bundledResolvedPath && bundledResolvedPath !== resolved.resolvedPath) {
          try {
            const bundledRaw = await vscode.workspace.fs.readFile(vscode.Uri.file(bundledResolvedPath));
            const bundledMarkdown = normalizeOperatingPromptMarkdown(Buffer.from(bundledRaw).toString("utf8"));
            if (bundledMarkdown) {
              this.operatingPromptState = {
                promptSource: "bundled_markdown",
                promptMarkdownPath: configuredPath,
                promptResolvedPath: bundledResolvedPath,
                promptLoaded: true,
                promptLastLoadedAt: new Date().toISOString(),
                promptContent: bundledMarkdown,
              };
              return;
            }
          } catch {
            // Fall through to the normal external fallback state below.
          }
        }
        this.operatingPromptState = {
          promptSource: "external_fallback",
          promptMarkdownPath: configuredPath,
          promptResolvedPath: resolved.resolvedPath,
          promptLoaded: false,
          promptLoadError: error instanceof Error ? error.message : String(error),
        };
      }
    })().finally(() => {
      this.operatingPromptLoadPromise = null;
    });
    await this.operatingPromptLoadPromise;
  }

  private buildDynamicSettings(): CutieDynamicSettingsSnapshot {
    const cfg = vscode.workspace.getConfiguration("cutie-product");
    return {
      contextPreviewChars: Math.max(1024, Math.min(24_000, cfg.get<number>("contextPreviewChars", 2500))),
      openFilePreviewLines: Math.max(0, Math.min(120, cfg.get<number>("openFilePreviewLines", 8))),
      maxOpenFilesInContext: Math.max(4, Math.min(24, cfg.get<number>("maxOpenFilesInContext", 6))),
      maxToolsPerBatch: Math.max(1, Math.min(8, cfg.get<number>("maxToolsPerBatch", 1))),
      contextReceiptWindow: Math.max(4, Math.min(32, cfg.get<number>("contextReceiptWindow", 6))),
      investigationPreflight: cfg.get<boolean>("investigationPreflight", false),
      objectiveBasedRuns: cfg.get<boolean>("objectiveBasedRuns", false),
      objectiveBasedInvestigation: cfg.get<boolean>("objectiveBasedInvestigation", false),
      maxToolSteps: Math.max(8, Math.min(128, cfg.get<number>("maxToolSteps", 18))),
      maxWorkspaceMutations: Math.max(2, Math.min(64, cfg.get<number>("maxWorkspaceMutations", 8))),
      unlimitedAutonomy: cfg.get<boolean>("unlimitedAutonomy", false),
    };
  }

  private captureEditorContextSnapshot(
    settings: Pick<CutieDynamicSettingsSnapshot, "contextPreviewChars" | "openFilePreviewLines" | "maxOpenFilesInContext">
  ): CutieEditorContextSnapshot {
    const activeEditor = vscode.window.activeTextEditor;
    const activeFile = activeEditor
      ? {
          path: toWorkspaceRelativePath(activeEditor.document.uri) || undefined,
          language: activeEditor.document.languageId,
          lineCount: activeEditor.document.lineCount,
          ...(activeEditor.selection.isEmpty
            ? { preview: activeEditor.document.getText().slice(0, settings.contextPreviewChars) }
            : {
                selection: activeEditor.document.getText(activeEditor.selection).slice(0, settings.contextPreviewChars),
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
        const row: CutieOpenFileSnapshot = {
          path: relativePath,
          language: editor.document.languageId,
          lineCount: editor.document.lineCount,
        };
        if (settings.openFilePreviewLines > 0) {
          const lines = editor.document.getText().split(/\r?\n/);
          const joined = lines.slice(0, settings.openFilePreviewLines).join("\n");
          row.preview =
            joined.length > settings.contextPreviewChars
              ? `${joined.slice(0, settings.contextPreviewChars)}\n...[truncated]`
              : joined;
        }
        return row;
      })
      .filter((value): value is CutieOpenFileSnapshot => Boolean(value))
      .slice(0, settings.maxOpenFilesInContext);

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

    return {
      ...(activeFile ? { activeFile } : {}),
      openFiles,
      diagnostics,
    };
  }

  private async refreshHostReadiness(force = false): Promise<void> {
    const now = Date.now();
    if (
      !force &&
      this.hostProbePromise
    ) {
      return this.hostProbePromise;
    }
    if (
      !force &&
      this.hostReadyCheckedAt &&
      now - this.hostReadyCheckedAt < CutieSidebarProvider.HOST_PROBE_TTL_MS
    ) {
      return;
    }
    this.hostProbePromise = (async () => {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), CutieSidebarProvider.HOST_PROBE_TIMEOUT_MS);
      try {
        const response = await fetch(`${getBaseApiUrl()}/api/v1/health`, {
          method: "GET",
          signal: controller.signal,
        });
        this.hostReady = response.ok;
        this.hostFailureSummary = response.ok ? undefined : `Host probe returned HTTP ${response.status}.`;
      } catch (error) {
        this.hostReady = false;
        this.hostFailureSummary = error instanceof Error ? error.message : String(error);
      } finally {
        clearTimeout(timer);
        this.hostReadyCheckedAt = Date.now();
        if (this.warmStartSnapshot) {
          this.warmStartSnapshot = {
            ...this.warmStartSnapshot,
            hostReady: this.hostReady,
            ...(this.hostFailureSummary ? { warmFailureSummary: this.hostFailureSummary } : {}),
            subsystemReady: {
              ...(this.warmStartSnapshot.subsystemReady || {
                authState: false,
                requestAuth: false,
                desktop: false,
                gitStatus: false,
                mentionIndex: false,
                editorContext: false,
                diagnostics: false,
                settings: false,
                hostProbe: false,
              }),
              hostProbe: this.hostReady === true,
            },
          };
        }
        this.hostProbePromise = null;
        if (this.view && this.webviewReady) {
          await this.emitState();
        }
      }
    })();
    return this.hostProbePromise;
  }

  private getWarmStartStateForView(): CutieViewState["warmStartState"] {
    const snapshot = this.warmStartSnapshot;
    if (!snapshot) {
      return {
        localReady: false,
        hostReady: this.hostReady,
        warming: this.warmStartWarming,
        ...(this.hostFailureSummary ? { warmFailureSummary: this.hostFailureSummary } : {}),
      };
    }
    return {
      localReady: snapshot.localReady,
      hostReady: snapshot.hostReady,
      warming: this.warmStartWarming,
      lastWarmAt: snapshot.capturedAt,
      requestAuthReady: snapshot.requestAuthReady,
      ...(snapshot.warmFailureSummary ? { warmFailureSummary: snapshot.warmFailureSummary } : {}),
      ...(snapshot.subsystemReady ? { subsystemReady: snapshot.subsystemReady } : {}),
    };
  }

  private async refreshWarmStartSnapshot(force = false): Promise<void> {
    if (!force && this.fastStartWarmupPromise) {
      await this.fastStartWarmupPromise;
      return;
    }
    if (!force && this.isWarmSnapshotFresh()) {
      void this.refreshHostReadiness(false);
      return;
    }
    this.warmStartWarming = true;
    this.fastStartWarmupPromise = (async () => {
      await this.refreshOperatingPromptState(force).catch(() => undefined);
      const settings = this.buildDynamicSettings();
      const subsystemReady: NonNullable<CutieWarmSubsystemReady> = {
        authState: false,
        requestAuth: false,
        desktop: false,
        gitStatus: false,
        mentionIndex: false,
        editorContext: false,
        diagnostics: false,
        settings: true,
        hostProbe: this.hostReady === true,
      };
      let warmFailureSummary: string | undefined;

      const authStateResult = await this.refreshAuthState()
        .then(() => {
          subsystemReady.authState = true;
          return this.authState;
        })
        .catch((error) => {
          warmFailureSummary = warmFailureSummary || (error instanceof Error ? error.message : String(error));
          return this.authState;
        });
      const requestAuthResult = await this.getCachedRequestAuth(force)
        .then((value) => {
          subsystemReady.requestAuth = Boolean(value);
          return value;
        })
        .catch((error) => {
          warmFailureSummary = warmFailureSummary || (error instanceof Error ? error.message : String(error));
          return null;
        });
      const desktopResult = await this.getDesktopContextForPrompt()
        .then((value) => {
          subsystemReady.desktop = true;
          return value;
        })
        .catch((error) => {
          warmFailureSummary = warmFailureSummary || (error instanceof Error ? error.message : String(error));
          return this.desktopState;
        });
      const gitStatusResult = await this.getGitStatusSummary(force)
        .then((value) => {
          subsystemReady.gitStatus = true;
          return value;
        })
        .catch((error) => {
          warmFailureSummary = warmFailureSummary || (error instanceof Error ? error.message : String(error));
          return this.gitStatusSummary;
        });
      const mentionPathsResult = await this.ensureWorkspaceMentionIndex()
        .then((value) => {
          subsystemReady.mentionIndex = true;
          return value;
        })
        .catch((error) => {
          warmFailureSummary = warmFailureSummary || (error instanceof Error ? error.message : String(error));
          return this.workspaceMentionPaths || [];
        });
      const editorSnapshot = (() => {
        try {
          const snapshot = this.captureEditorContextSnapshot(settings);
          subsystemReady.editorContext = true;
          subsystemReady.diagnostics = true;
          return snapshot;
        } catch (error) {
          warmFailureSummary = warmFailureSummary || (error instanceof Error ? error.message : String(error));
          return { openFiles: [], diagnostics: [] } satisfies CutieEditorContextSnapshot;
        }
      })();

      this.warmStartSnapshot = {
        capturedAt: new Date().toISOString(),
        workspaceHash: getWorkspaceHash(),
        workspaceRootPath: getWorkspaceRootPath(),
        extensionVersion: getExtensionVersion(this.context),
        authState: authStateResult,
        requestAuthReady: Boolean(requestAuthResult),
        desktopState: desktopResult,
        ...(gitStatusResult ? { gitStatusSummary: gitStatusResult } : {}),
        workspaceMentionPaths: mentionPathsResult,
        ...(editorSnapshot.activeFile ? { activeFile: editorSnapshot.activeFile } : {}),
        openFiles: editorSnapshot.openFiles,
        diagnostics: editorSnapshot.diagnostics,
        cutieDynamicSettings: settings,
        localReady: subsystemReady.authState && subsystemReady.desktop && subsystemReady.settings,
        hostReady: this.hostReady,
        ...(warmFailureSummary || this.hostFailureSummary
          ? { warmFailureSummary: warmFailureSummary || this.hostFailureSummary }
          : {}),
        subsystemReady,
      };

      void this.refreshHostReadiness(force);
    })().finally(() => {
      this.warmStartWarming = false;
      this.fastStartWarmupPromise = null;
      if (this.view && this.webviewReady) {
        void this.emitState();
      }
    });
    await this.fastStartWarmupPromise;
  }

  private prewarmFastStartState(): void {
    void this.refreshWarmStartSnapshot(false);
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
    if (this.submitState === "stopping") {
      return;
    }
    if (this.currentAbortController) {
      this.status = "Stopping the active Cutie run...";
      this.submitState = "stopping";
      this.streamingAssistantText = "";
      this.playgroundLiveNarration = "";
      this.suppressedAssistantArtifactText = "";
      this.currentAbortController.abort();
      await this.emitState();
      return;
    }

    const canCancelBinary = Boolean(
      this.binaryController.binary.canCancel ||
      (this.binaryController.binary.activeBuild && this.binaryController.binary.busy)
    );
    if (!canCancelBinary) {
      this.status = "No active automation run to stop.";
      this.submitState = "settled";
      await this.emitState();
      return;
    }

    this.status = "Stopping the active binary build...";
    this.submitState = "stopping";
    this.streamingAssistantText = "";
    this.playgroundLiveNarration = "";
    this.suppressedAssistantArtifactText = "";
    await this.emitState();

    try {
      await this.binaryController.cancelBinaryBuild();
      this.status = "Binary cancellation requested.";
    } catch (error) {
      this.status = `Binary cancel failed: ${error instanceof Error ? error.message : String(error)}`;
    } finally {
      this.submitState = "settled";
      await this.emitState();
    }
  }

  private isViewingActiveRunSession(): boolean {
    return Boolean(this.activeSessionId && this.activeRunSessionId && this.activeSessionId === this.activeRunSessionId);
  }

  private getVisibleSessionRun(): CutieRunState | null {
    if (!this.activeSession) return null;
    return this.sessionStore.getLatestRun(this.activeSession);
  }

  private getSessionTitleById(sessionId: string | null | undefined): string {
    const trimmed = String(sessionId || "").trim();
    if (!trimmed) return "another chat";
    if (this.activeSession && this.activeSession.id === trimmed) {
      return this.activeSession.title || "another chat";
    }
    const session = this.sessionStore.getSession(getWorkspaceHash(), trimmed);
    return session?.title || "another chat";
  }

  private getBackgroundActivity(): CutieBackgroundActivityView | null {
    if (this.currentAbortController && this.activeRunSessionId && this.activeRunSessionId !== this.activeSessionId) {
      return {
        kind: "cutie",
        sessionId: this.activeRunSessionId,
        sessionTitle: this.getSessionTitleById(this.activeRunSessionId),
        label: "Working in background",
        detail: this.status || "Cutie is still responding.",
      };
    }

    const binarySessionId = this.binaryController.getLiveSessionId();
    if (this.binaryController.hasOngoingWork() && binarySessionId && binarySessionId !== this.activeSessionId) {
      return {
        kind: "binary",
        sessionId: binarySessionId,
        sessionTitle: this.getSessionTitleById(binarySessionId),
        label: "Binary running in background",
        detail: this.binaryController.binary.streamConnected
          ? "The build is still streaming."
          : "The build is still working.",
      };
    }

    return null;
  }

  private getChatDiffsForActiveSession(): CutieChatDiffItem[] {
    if (!this.activeSessionId) return [];
    return this.chatDiffsBySessionId.get(this.activeSessionId) ?? [];
  }

  private getChatDiffsForRun(runId: string, sessionId: string | null = this.activeSessionId): CutieChatDiffItem[] {
    const trimmedRunId = String(runId || "").trim();
    const trimmedSessionId = String(sessionId || "").trim();
    if (!trimmedRunId || !trimmedSessionId) return [];
    const list = this.chatDiffsBySessionId.get(trimmedSessionId) ?? [];
    return list.filter((item) => String(item.runId || "").trim() === trimmedRunId);
  }

  private normalizeChatDiffPath(relativePath: string): string {
    return String(relativePath || "")
      .trim()
      .replace(/\\/g, "/");
  }

  private touchRecentPortableBundlePath(relativePath: string): void {
    const trimmed = this.normalizeChatDiffPath(relativePath);
    if (!trimmed) return;
    const touchList = this.recentPortableBundleTouchedPaths;
    const idx = touchList.indexOf(trimmed);
    if (idx >= 0) touchList.splice(idx, 1);
    touchList.unshift(trimmed);
    while (touchList.length > 32) touchList.pop();
  }

  private truncateDiffSnapshot(content: string, label: "before" | "after"): string {
    if (content.length <= CutieSidebarProvider.MAX_FILE_CHARS_FOR_PATCH) return content;
    return `${content.slice(0, CutieSidebarProvider.MAX_FILE_CHARS_FOR_PATCH)}\n\n/* ... truncated ${label} snapshot ... */\n`;
  }

  private truncateChatPatch(patch: string): string {
    if (patch.length <= CutieSidebarProvider.MAX_PATCH_CHARS) return patch;
    return `${patch.slice(0, CutieSidebarProvider.MAX_PATCH_CHARS)}\n\n... patch truncated for chat preview ...\n`;
  }

  private upsertChatDiffItem(sessionId: string, item: CutieChatDiffItem): void {
    const list = [...(this.chatDiffsBySessionId.get(sessionId) ?? [])];
    const runId = String(item.runId || "").trim();
    const existingIndex = list.findIndex((candidate) => {
      const candidateRunId = String(candidate.runId || "").trim();
      if (candidateRunId !== runId) return false;
      if (item.receiptId && candidate.receiptId) {
        return candidate.receiptId === item.receiptId;
      }
      if (
        typeof item.step === "number" &&
        typeof candidate.step === "number" &&
        item.step === candidate.step &&
        item.relativePath === candidate.relativePath
      ) {
        return item.patch === candidate.patch;
      }
      return item.relativePath === candidate.relativePath && item.patch === candidate.patch;
    });
    if (existingIndex >= 0) {
      const previous = list[existingIndex];
      list[existingIndex] = {
        ...previous,
        ...item,
        id: previous.id || item.id,
        createdAt:
          String(previous.createdAt || "") <= String(item.createdAt || "") ? previous.createdAt : item.createdAt,
        source: previous.source === "live_callback" ? "live_callback" : item.source || previous.source,
      };
    } else {
      list.push(item);
    }
    list.sort((a, b) => {
      const aTime = String(a.createdAt || "");
      const bTime = String(b.createdAt || "");
      if (aTime < bTime) return -1;
      if (aTime > bTime) return 1;
      return String(a.id || "").localeCompare(String(b.id || ""));
    });
    while (list.length > CutieSidebarProvider.MAX_CHAT_DIFFS_PER_SESSION) {
      list.shift();
    }
    this.chatDiffsBySessionId.set(sessionId, list);
  }

  private hydrateChatDiffsFromRunReceipts(session: CutieSessionRecord): void {
    const sessionId = String(session.id || "").trim();
    if (!sessionId) return;
    for (const run of session.runs || []) {
      const runId = String(run.id || "").trim();
      if (!runId) continue;
      for (const receipt of run.receipts || []) {
        if (receipt.status !== "completed") continue;
        if (receipt.toolName !== "write_file" && receipt.toolName !== "patch_file" && receipt.toolName !== "edit_file") {
          continue;
        }
        const data = receipt.data && typeof receipt.data === "object" ? (receipt.data as Record<string, unknown>) : null;
        if (!data) continue;
        const relativePath = this.normalizeChatDiffPath(typeof data.path === "string" ? String(data.path) : "");
        if (!relativePath) continue;
        let patch = typeof data.patch === "string" ? String(data.patch) : "";
        if (!patch && typeof data.previousContent === "string" && typeof data.nextContent === "string") {
          patch = createTwoFilesPatch(relativePath, relativePath, String(data.previousContent), String(data.nextContent), "", "", {
            context: 3,
          });
        }
        if (!patch) continue;
        const receiptId = String(receipt.id || "").trim();
        const item: CutieChatDiffItem = {
          id: `cutie_chat_diff_receipt_${runId}_${receiptId || String(receipt.step || "0")}`,
          createdAt: receipt.finishedAt || receipt.startedAt || run.endedAt || run.startedAt || new Date().toISOString(),
          runId,
          relativePath,
          toolName: receipt.toolName,
          patch: this.truncateChatPatch(patch),
          ...(receiptId ? { receiptId } : {}),
          ...(typeof receipt.step === "number" ? { step: receipt.step } : {}),
          source: "receipt_backfill",
        };
        this.upsertChatDiffItem(sessionId, item);
      }
    }
  }

  private async ensureRunChangeRecap(
    run: CutieRunState | null,
    sourceSession: CutieSessionRecord | null = this.activeSession
  ): Promise<CutieSessionRecord | null> {
    if (!run || !isTerminalRunStatus(run.status) || !sourceSession) return sourceSession;
    const runId = String(run.id || "").trim();
    if (!runId) return sourceSession;

    this.hydrateChatDiffsFromRunReceipts(sourceSession);
    const runDiffs = this.getChatDiffsForRun(runId, sourceSession.id);
    const changedPaths = new Set(runDiffs.map((item) => item.relativePath));
    const recapContent = changedPaths.size
      ? `${changedPaths.size} file${changedPaths.size === 1 ? "" : "s"} changed this run.`
      : "No files changed.";
    const isRecapForRun = (message: CutieChatMessage): boolean =>
      message.role === "assistant" && message.presentation === "run_change_recap" && message.runId === runId;
    const recaps = sourceSession.messages.filter(isRecapForRun);
    if (recaps.length === 1 && String(recaps[0].content || "").trim() === recapContent) {
      return sourceSession;
    }

    let nextSession = sourceSession;
    if (recaps.length) {
      const withoutRecaps = sourceSession.messages.filter((message) => !isRecapForRun(message));
      nextSession = await this.sessionStore.replaceMessages(sourceSession, withoutRecaps);
    }
    nextSession = await this.sessionStore.appendMessage(nextSession, {
      role: "assistant",
      content: recapContent,
      runId,
      presentation: "run_change_recap",
    });
    return nextSession;
  }

  private async recordChatWorkspaceDiff(info: CutieWorkspaceMutationInfo): Promise<void> {
    const sessionId = String(info.sessionId || "").trim() || this.activeSessionId;
    if (!sessionId) return;
    const trimmed = this.normalizeChatDiffPath(info.relativePath);
    if (!trimmed) return;
    this.touchRecentPortableBundlePath(trimmed);

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
    let before = this.truncateDiffSnapshot(typeof info.previousContent === "string" ? info.previousContent : "", "before");
    if (before.length > CutieSidebarProvider.MAX_FILE_CHARS_FOR_PATCH) {
      before = `${before.slice(0, CutieSidebarProvider.MAX_FILE_CHARS_FOR_PATCH)}\n\n/* … truncated before snapshot … */\n`;
    }
    if (after.length > CutieSidebarProvider.MAX_FILE_CHARS_FOR_PATCH) {
      after = `${after.slice(0, CutieSidebarProvider.MAX_FILE_CHARS_FOR_PATCH)}\n\n/* … truncated after snapshot … */\n`;
    }
    after = this.truncateDiffSnapshot(after, "after");
    let patch =
      hasAfterContent
        ? createTwoFilesPatch(trimmed, trimmed, before, after, "", "", { context: 3 })
        : `Inline diff preview unavailable for ${trimmed}.\n\nCutie changed the file, but the updated file contents could not be reconstructed for the chat card.`;
    if (patch.length > CutieSidebarProvider.MAX_PATCH_CHARS) {
      patch = `${patch.slice(0, CutieSidebarProvider.MAX_PATCH_CHARS)}\n\n… patch truncated for chat preview …\n`;
    }
    patch = this.truncateChatPatch(patch);
    const item: CutieChatDiffItem = {
      id: `cutie_chat_diff_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`,
      createdAt: new Date().toISOString(),
      runId: String(info.runId || "").trim() || this.activeRun?.id || null,
      relativePath: trimmed,
      toolName: info.toolName,
      patch,
      ...(String(info.receiptId || "").trim() ? { receiptId: String(info.receiptId || "").trim() } : {}),
      ...(typeof info.step === "number" ? { step: info.step } : {}),
      source: "live_callback",
    };
    this.upsertChatDiffItem(sessionId, item);
  }

  private async finishHostWorkspaceMutationUi(info: CutieWorkspaceMutationInfo): Promise<void> {
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
  }

  private async initializeView(): Promise<void> {
    await this.emitState();
    void this.prewarmFastStartState();
    void this.refreshViewState();
    void this.binaryController.resumeBinaryBuildIfNeeded();
  }

  /** Saves live playground step text as a normal assistant message so it remains after the run settles. */
  private async persistPlaygroundLiveNarrationToSession(session: CutieSessionRecord): Promise<CutieSessionRecord> {
    const text = this.playgroundLiveNarration.trim();
    const runtime = getBinaryIdeChatRuntime();
    if (!text || (runtime !== "playgroundApi" && runtime !== "openCode")) {
      return session;
    }
    const next = await this.sessionStore.appendMessage(session, { role: "assistant", content: text });
    if (this.activeSessionId === next.id) {
      this.activeSession = next;
    }
    return next;
  }

  private async runBinaryHostAssistTurn(input: {
    task: string;
    historySessionId?: string | null;
    signal: AbortSignal;
    onProgress?: (text: string) => void;
  }): Promise<{ assistantText: string; runId?: string; sessionId?: string }> {
    let assistantText = "";
    let runId: string | undefined;
    let sessionId: string | undefined;
    let statusNarration = "";
    const workspaceRoot = getWorkspaceRootPath() || undefined;
    await this.parityClient.assistStream(
      {
        task: input.task,
        mode: "auto",
        model: getModelHint() || "Binary IDE",
        ...(workspaceRoot ? { workspaceRoot } : {}),
        ...(input.historySessionId ? { historySessionId: input.historySessionId } : {}),
        client: {
          surface: "vsix",
          version: getExtensionVersion(this.context),
        },
      },
      async (event) => {
        if (input.signal.aborted) return;
        const eventName = String(event?.event || "");
        const data = Object.prototype.hasOwnProperty.call(event || {}, "data") ? event.data : undefined;
        if (eventName === "run" && data && typeof data === "object") {
          if (typeof (data as { runId?: unknown }).runId === "string") runId = String((data as { runId?: string }).runId || "");
          if (typeof (data as { sessionId?: unknown }).sessionId === "string") {
            sessionId = String((data as { sessionId?: string }).sessionId || "");
          }
          return;
        }
        if ((eventName === "partial" || eventName === "final") && typeof data === "string") {
          assistantText = data;
          input.onProgress?.(assistantText);
          return;
        }
        if (eventName === "host.status" && data && typeof data === "object") {
          const message = String((data as { message?: unknown }).message || "").trim();
          if (message) {
            statusNarration = message;
            input.onProgress?.(statusNarration);
          }
          if (typeof (data as { runId?: unknown }).runId === "string") runId = String((data as { runId?: string }).runId || "");
          return;
        }
        if (eventName === "tool_request" && data && typeof data === "object") {
          const toolCall = (data as { toolCall?: { name?: unknown; summary?: unknown } }).toolCall;
          const toolName = String(toolCall?.name || "tool").replace(/_/g, " ");
          const summary = String(toolCall?.summary || "").trim();
          input.onProgress?.(summary || `Binary is using ${toolName}.`);
          return;
        }
        if (eventName === "tool_result" && data && typeof data === "object") {
          const summary = String((data as { summary?: unknown }).summary || "").trim();
          if (summary) input.onProgress?.(summary);
        }
      },
      input.signal
    );
    return {
      assistantText: assistantText || statusNarration || "Binary completed the request.",
      ...(runId ? { runId } : {}),
      ...(sessionId ? { sessionId } : {}),
    };
  }

  private clearWebviewReadyTimeout(): void {
    if (this.webviewReadyTimeout) {
      clearTimeout(this.webviewReadyTimeout);
      this.webviewReadyTimeout = null;
    }
  }

  /** Reads `cutie-product.webviewReadyTimeoutMs` (default 60s). Older packaged builds used 10s; reinstall from a fresh compile if you still hit that limit. */
  private getWebviewReadyTimeoutMs(): number {
    const raw = vscode.workspace.getConfiguration(EXTENSION_NAMESPACE).get<number>("webviewReadyTimeoutMs");
    const n = typeof raw === "number" && Number.isFinite(raw) ? Math.floor(raw) : CutieSidebarProvider.WEBVIEW_READY_TIMEOUT_DEFAULT_MS;
    return Math.max(
      CutieSidebarProvider.WEBVIEW_READY_TIMEOUT_MIN_MS,
      Math.min(CutieSidebarProvider.WEBVIEW_READY_TIMEOUT_MAX_MS, n)
    );
  }

  private armWebviewReadyTimeout(webviewView: vscode.WebviewView): void {
    this.clearWebviewReadyTimeout();
    const bootNonce = ++this.webviewBootNonce;
    const timeoutMs = this.getWebviewReadyTimeoutMs();
    this.webviewReadyTimeout = setTimeout(() => {
      if (this.webviewBootNonce !== bootNonce || this.webviewReady || this.view !== webviewView) return;
      const message =
        "Cutie UI did not finish loading in time. Quit and restart Cursor, run Developer: Reload Window, or reinstall the Cutie extension. If it persists, Help → Toggle Developer Tools → Console (look for errors from the webview). You can raise `cutie-product.webviewReadyTimeoutMs` if the UI is slow to parse on first open.";
      this.status = `Cutie UI failed to load: ${message}`;
      webviewView.webview.html = buildWebviewFailureHtml(message);
      console.error("Cutie webview ready timeout", {
        version: getExtensionVersion(this.context),
        workspaceHash: getWorkspaceHash(),
        timeoutMs,
      });
      void vscode.window.showErrorMessage(this.status);
    }, timeoutMs);
  }

  private async handleMessage(message: WebviewMessage): Promise<void> {
    if (message.type === "ready") {
      this.webviewReady = true;
      this.clearWebviewReadyTimeout();
      await this.emitState();
      void this.prewarmFastStartState();
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
    if (message.type === "setComposerModel") {
      return this.setComposerModelFromWebview(String(message.model || "").trim());
    }
    if (message.type === "setComposerReasoningLevel") {
      return this.setComposerReasoningLevelFromWebview(String(message.level || "").trim());
    }
  }

  private composerConfigurationTarget(): vscode.ConfigurationTarget {
    return vscode.workspace.workspaceFolders?.length
      ? vscode.ConfigurationTarget.Workspace
      : vscode.ConfigurationTarget.Global;
  }

  private async setComposerModelFromWebview(model: string): Promise<void> {
    if (!model) return;
    await vscode.workspace
      .getConfiguration(EXTENSION_NAMESPACE)
      .update("model", model, this.composerConfigurationTarget());
    await this.emitState();
  }

  private async setComposerReasoningLevelFromWebview(level: string): Promise<void> {
    if (!(CUTIE_REASONING_LEVELS as readonly string[]).includes(level)) return;
    await vscode.workspace
      .getConfiguration(EXTENSION_NAMESPACE)
      .update("reasoningLevel", level, this.composerConfigurationTarget());
    await this.emitState();
  }

  async undoLastPlaygroundBatchCommand(): Promise<void> {
    if (getBinaryIdeChatRuntime() !== "playgroundApi") return;
    try {
      const msg = await this.playgroundChatBridge.undoLastPlaygroundBatch();
      this.status = msg;
      void vscode.window.showInformationMessage(msg);
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      this.status = `Undo failed: ${message}`;
      void vscode.window.showErrorMessage(this.status);
    }
    await this.emitState();
  }

  private appendMentionsToPrompt(base: string, mentions: CutieMentionSuggestion[]): string {
    if (!mentions.length) return base;
    const prefix = mentions
      .map((m) => String(m.insertText || m.label || "").trim())
      .filter(Boolean)
      .join("\n");
    return prefix ? `${prefix}\n\n${base}` : base;
  }

  private sessionMessagesToIdeHistory(messages: CutieChatMessage[]): Array<{ role: string; content: string }> {
    return messages
      .filter((m) => m.role === "user" || m.role === "assistant" || m.role === "system")
      .map((m) => ({ role: m.role, content: m.content }));
  }

  private async appendChatMessage(
    session: CutieSessionRecord,
    role: "user" | "assistant" | "system",
    content: string
  ): Promise<CutieSessionRecord> {
    const next = await this.sessionStore.appendMessage(session, { role, content });
    if (this.activeSessionId === next.id) {
      this.activeSession = next;
    }
    return next;
  }

  private formatRecentEvents(value: unknown): string {
    const root = asObjectRecord(unwrapData(value));
    const events = asUnknownArray(root.events)
      .slice(-12)
      .map((item) => {
        const row = asObjectRecord(item);
        const event = asObjectRecord(row.event);
        const eventName = readString(event.event || row.type || event.type, "event");
        const capturedAt = readString(row.capturedAt || row.timestamp, "");
        const data = asObjectRecord(event.data);
        const summary =
          readString(data.summary) ||
          readString(data.message) ||
          readString(data.status) ||
          readString(data.phase);
        return `- ${eventName}${capturedAt ? ` @ ${capturedAt}` : ""}${summary ? `: ${summary}` : ""}`;
      });
    return events.length ? events.join("\n") : "No events yet.";
  }

  private formatHostedSessionMessages(value: unknown): string {
    const rows = asUnknownArray(unwrapData(value));
    if (!rows.length) return "No hosted session messages were returned.";
    return rows
      .slice(-12)
      .map((item) => {
        const row = asObjectRecord(item);
        const role = readString(row.role, "message");
        const content = readString(row.content).trim().replace(/\s+/g, " ");
        return `- ${role}: ${content.slice(0, 220) || "(empty)"}`;
      })
      .join("\n");
  }

  private formatConnections(value: unknown): string {
    const root = asObjectRecord(unwrapData(value));
    const rows = asUnknownArray(root.connections);
    if (!rows.length) return "No Cutie connections are configured yet.";
    return rows
      .map((item) => {
        const row = asObjectRecord(item);
        return `- ${readString(row.name, readString(row.id, "connection"))} (${readString(row.status, "unknown")})\n  ${readString(row.transport, "http")} ${readString(row.url)}\n  auth ${readString(row.authMode, "none")}${row.enabled === false ? " • disabled" : ""}`;
      })
      .join("\n");
  }

  private formatProviders(value: unknown): string {
    const root = asObjectRecord(unwrapData(value));
    const rows = asUnknownArray(root.providers);
    if (!rows.length) return "No provider profiles are available in this Binary Host build.";
    return rows
      .map((item) => {
        const row = asObjectRecord(item);
        const status = readString(row.status, row.connected ? "connected" : "disconnected");
        const bits = [
          row.isDefault ? "default" : "",
          row.connected ? "connected" : "not connected",
          readString(row.runtimeReadinessReason),
        ].filter(Boolean);
        return `- ${readString(row.displayName, readString(row.id, "provider"))} (${status})${bits.length ? ` • ${bits.join(" • ")}` : ""}`;
      })
      .join("\n");
  }

  private formatRuns(value: unknown, noun: "runs" | "jobs" | "automations" = "runs"): string {
    const root = asObjectRecord(unwrapData(value));
    const key = noun === "jobs" ? "jobs" : noun === "automations" ? "automations" : "runs";
    const rows = asUnknownArray(root[key]);
    if (!rows.length) return `No ${noun} found.`;
    return rows
      .map((item) => {
        const row = asObjectRecord(item);
        const id = readString(row.id, readString(row.runId, "unknown"));
        const status = readString(row.status, "unknown");
        const label =
          noun === "jobs"
            ? readString(row.task, id)
            : noun === "automations"
              ? readString(row.name, id)
              : readString(asObjectRecord(row.request).task, id);
        return `- ${label}\n  id ${id} • ${status}${readString(row.executionLane) ? ` • ${readString(row.executionLane)}` : ""}`;
      })
      .join("\n");
  }

  private formatAutomation(value: unknown): string {
    const row = asObjectRecord(unwrapData(value));
    if (!Object.keys(row).length) return "Automation not found.";
    const trigger = asObjectRecord(row.trigger);
    return [
      `Automation ${readString(row.name, readString(row.id, "unknown"))}`,
      `- id ${readString(row.id)}`,
      `- status ${readString(row.status, "unknown")}`,
      `- policy ${readString(row.policy, "autonomous")}`,
      `- trigger ${readString(trigger.kind, "manual")}`,
      trigger.scheduleText ? `- schedule ${readString(trigger.scheduleText)}` : "",
      trigger.query ? `- query ${readString(trigger.query)}` : "",
      readString(row.prompt) ? `- prompt ${readString(row.prompt)}` : "",
    ]
      .filter(Boolean)
      .join("\n");
  }

  private formatUsage(value: unknown): string {
    const root = asObjectRecord(unwrapData(value));
    const today = asObjectRecord(root.today);
    const month = asObjectRecord(root.thisMonth);
    const cycle = asObjectRecord(root.cycle);
    return [
      `Plan: ${readString(root.plan, "inactive")} (${readString(root.status, "inactive")})`,
      `Today: ${readNumber(today.requestsUsed)} used / ${readNumber(today.requestsLimit)} requests`,
      `Cycle: ${readNumber(cycle.requestsUsed)} used / ${readNumber(cycle.requestsLimit)} requests`,
      `Month tokens: ${readNumber(month.tokensTotal)} / ${readNumber(month.tokensLimit)}`,
      `Estimated spend: $${readNumber(month.estimatedCostUsd).toFixed(2)}`,
      readString(root.nextResetAt) ? `Next reset: ${readString(root.nextResetAt)}` : "",
    ]
      .filter(Boolean)
      .join("\n");
  }

  private async resolveHostedAuthForParity(): Promise<RequestAuth | null> {
    return this.requireAuth();
  }

  private async runBinaryUtility(command: Extract<CutieParityCommand, { kind: "binary_inspect" | "binary_hexdump" | "binary_hash" }>): Promise<string> {
    const targetPath = path.resolve(command.path);
    const stat = await fs.stat(targetPath);
    const bytes = await fs.readFile(targetPath);
    if (command.kind === "binary_hash") {
      const sha256 = createHash("sha256").update(bytes).digest("hex");
      return `SHA-256 for \`${targetPath}\`\n- size ${stat.size} bytes\n- hash ${sha256}`;
    }
    if (command.kind === "binary_hexdump") {
      const offset = Math.max(0, command.offset || 0);
      const length = Math.max(1, command.length || 256);
      const slice = bytes.slice(offset, offset + length);
      return `Hexdump for \`${targetPath}\`\n\`\`\`\n${formatHexdump(slice, offset)}\n\`\`\``;
    }
    const sha256 = createHash("sha256").update(bytes).digest("hex");
    return [
      `Binary inspection for \`${targetPath}\``,
      `- type ${detectBinaryKind(bytes.slice(0, 32))}`,
      `- size ${stat.size} bytes`,
      `- modified ${stat.mtime.toISOString()}`,
      `- sha256 ${sha256}`,
      `- first bytes ${bytes.slice(0, 16).toString("hex") || "n/a"}`,
    ].join("\n");
  }

  private async buildIndexChunks(rootPath: string): Promise<Array<Record<string, unknown>>> {
    const files = await collectIndexableFiles(rootPath, 120);
    const chunks: Array<Record<string, unknown>> = [];
    for (const filePath of files) {
      const relative = path.relative(rootPath, filePath).replace(/\\/g, "/");
      const raw = await fs.readFile(filePath, "utf8").catch(() => "");
      if (!raw || raw.includes("\u0000")) continue;
      chunks.push(...chunkTextForIndex(relative, raw));
      if (chunks.length >= 400) break;
    }
    return chunks;
  }

  private async executeParityCommand(command: CutieParityCommand): Promise<string> {
    switch (command.kind) {
      case "auth_status": {
        const [hostHealth, hostAuth] = await Promise.all([
          this.parityClient.checkHostHealth(),
          this.parityClient.authStatus().catch((error) => ({ error: error instanceof Error ? error.message : String(error) })),
        ]);
        return [
          "Cutie auth status",
          `- hosted auth ${this.authState.kind} (${this.authState.label})`,
          hostHealth ? `- local host ready` : "- local host unavailable",
          `- local key ${prettyJson(unwrapData(hostAuth))}`,
        ].join("\n");
      }
      case "auth_sign_in":
        await this.auth.signInWithBrowser();
        return "Opened browser sign-in for Cutie.";
      case "auth_sign_out":
        await this.auth.signOut();
        return "Signed out of Cutie.";
      case "auth_set_key":
        await this.auth.setApiKeyInteractive();
        return "Opened Cutie API key prompt.";
      case "config_show": {
        const preferences = await this.parityClient.preferences().catch(() => ({}));
        return [
          "Cutie config",
          `- baseApiUrl ${getBaseApiUrl()}`,
          `- runtime ${getBinaryIdeChatRuntime()}`,
          `- model ${getModelHint()}`,
          `- reasoning ${getReasoningLevel()}`,
          `- local host ${prettyJson(unwrapData(preferences))}`,
        ].join("\n");
      }
      case "usage": {
        const auth = await this.resolveHostedAuthForParity();
        if (!auth) throw new Error("Sign in or set an API key before checking usage.");
        return this.formatUsage(await this.parityClient.usage(auth));
      }
      case "checkout": {
        const auth = await this.resolveHostedAuthForParity();
        if (!auth) throw new Error("Sign in or set an API key before opening checkout.");
        const response = asObjectRecord(unwrapData(await this.parityClient.checkout(auth, command.tier, command.billing)));
        const url = readString(response.url);
        if (url) {
          await vscode.env.openExternal(vscode.Uri.parse(url));
        }
        return `Opened ${command.tier}/${command.billing} checkout${url ? `:\n- ${url}` : "."}`;
      }
      case "connections_list":
        return this.formatConnections(await this.parityClient.listConnections());
      case "connections_add":
        if (command.mode === "web") {
          return this.formatConnections(
            await this.parityClient.saveConnection({
              name: "Web starter",
              transport: "sse",
              url: process.env.BINARY_CONNECTIONS_WEB_STARTER_URL || "http://127.0.0.1:8081/sse",
              authMode: "none",
              enabled: true,
              source: "starter",
            })
          );
        }
        if (!command.name || !command.url) {
          throw new Error("Remote connection add needs a name and URL.");
        }
        return this.formatConnections(
          await this.parityClient.saveConnection({
            name: command.name,
            transport: command.transport || "http",
            url: command.url,
            authMode: command.authMode || "none",
            enabled: true,
            source: "guided",
          })
        );
      case "connections_import": {
        const raw = await fs.readFile(path.resolve(command.file), "utf8");
        return this.formatConnections(await this.parityClient.importConnections(raw, path.resolve(command.file)));
      }
      case "connections_test":
        return prettyJson(unwrapData(await this.parityClient.testConnection(command.id)));
      case "connections_enable":
        return prettyJson(unwrapData(await this.parityClient.enableConnection(command.id)));
      case "connections_disable":
        return prettyJson(unwrapData(await this.parityClient.disableConnection(command.id)));
      case "connections_remove":
        await this.parityClient.removeConnection(command.id);
        return `Removed connection \`${command.id}\`.`;
      case "providers_list": {
        const [catalog, providers] = await Promise.all([
          this.parityClient.listProviderCatalog().catch(() => ({})),
          this.parityClient.listProviders(),
        ]);
        return [
          this.formatProviders(providers),
          formatMaybeList("Catalog", asObjectRecord(unwrapData(catalog)).providers),
        ].join("\n");
      }
      case "providers_open": {
        const response = asObjectRecord(unwrapData(await this.parityClient.openProviderBrowser(command.providerId)));
        const url = readString(response.url);
        if (url) await vscode.env.openExternal(vscode.Uri.parse(url));
        return `Opened ${command.providerId} in your browser.${url ? `\n- ${url}` : ""}`;
      }
      case "providers_import":
        return prettyJson(
          unwrapData(
            await this.parityClient.importProviderLocalAuth({
              providerId: command.providerId,
              ...(command.baseUrl ? { baseUrl: command.baseUrl } : {}),
              ...(command.model ? { defaultModel: command.model } : {}),
              ...(command.setDefault ? { setDefault: true } : {}),
            })
          )
        );
      case "providers_login": {
        const catalog = asObjectRecord(unwrapData(await this.parityClient.listProviderCatalog()));
        const providers = asUnknownArray(catalog.providers);
        const provider = asObjectRecord(providers.find((item) => readString(asObjectRecord(item).id) === command.providerId));
        const connectionMode = readString(provider.connectionMode);
        if (connectionMode === "portal_session" || connectionMode === "local_credential_adapter") {
          const started = asObjectRecord(
            unwrapData(
              await this.parityClient.startProviderBrowserSession({
                providerId: command.providerId,
                ...(command.baseUrl ? { baseUrl: command.baseUrl } : {}),
                ...(command.model ? { defaultModel: command.model } : {}),
                ...(command.setDefault ? { setDefault: true } : {}),
              })
            )
          );
          const launchUrl = readString(started.launchUrl);
          if (launchUrl) await vscode.env.openExternal(vscode.Uri.parse(launchUrl));
          return `Started browser linking for ${command.providerId}.${launchUrl ? `\n- ${launchUrl}` : ""}`;
        }
        const started = asObjectRecord(
          unwrapData(
            await this.parityClient.startProviderOAuth({
              providerId: command.providerId,
              ...(command.baseUrl ? { baseUrl: command.baseUrl } : {}),
              ...(command.model ? { defaultModel: command.model } : {}),
              ...(command.setDefault ? { setDefault: true } : {}),
            })
          )
        );
        const launchUrl = readString(started.launchUrl);
        if (launchUrl) await vscode.env.openExternal(vscode.Uri.parse(launchUrl));
        return `Started provider auth for ${command.providerId}.${launchUrl ? `\n- ${launchUrl}` : ""}`;
      }
      case "providers_status": {
        const response = asObjectRecord(unwrapData(await this.parityClient.listProviders()));
        const provider = asUnknownArray(response.providers).find((item) => readString(asObjectRecord(item).id) === command.providerId);
        return provider ? prettyJson(provider) : `Provider ${command.providerId} is not available.`;
      }
      case "providers_test":
        return prettyJson(unwrapData(await this.parityClient.testProvider(command.providerId)));
      case "providers_refresh":
        return prettyJson(unwrapData(await this.parityClient.refreshProvider(command.providerId)));
      case "providers_default":
        return prettyJson(unwrapData(await this.parityClient.setDefaultProvider(command.providerId)));
      case "providers_logout":
        await this.parityClient.disconnectProvider(command.providerId);
        return `Disconnected provider \`${command.providerId}\`.`;
      case "runs_list":
        return this.formatRuns(await this.parityClient.listRuns(command.limit), "runs");
      case "runs_show":
        return prettyJson(unwrapData(await this.parityClient.getRun(command.id)));
      case "runs_tail":
      case "runs_stream":
        return this.formatRecentEvents(await this.parityClient.getRunEvents(command.id));
      case "runs_export":
        return prettyJson(unwrapData(await this.parityClient.exportRun(command.id)));
      case "runs_control":
        return prettyJson(unwrapData(await this.parityClient.controlRun(command.id, command.action)));
      case "jobs_list":
        return this.formatRuns(await this.parityClient.listAgentJobs(command.limit), "jobs");
      case "jobs_run":
        return prettyJson(
          unwrapData(
            await this.parityClient.createAgentJob({
              task: command.task,
              mode: command.mode || "auto",
              model: getModelHint(),
              workspaceRoot: command.workspace || getWorkspaceRootPath() || undefined,
              executionLane: command.lane,
              client: {
                surface: "vsix",
                version: getExtensionVersion(this.context),
              },
            })
          )
        );
      case "jobs_show":
        return prettyJson(unwrapData(await this.parityClient.getAgentJob(command.id)));
      case "jobs_tail":
        return this.formatRecentEvents(await this.parityClient.getAgentJobEvents(command.id));
      case "jobs_control":
        return prettyJson(unwrapData(await this.parityClient.controlAgentJob(command.id, command.action)));
      case "jobs_remote_health":
        return prettyJson(unwrapData(await this.parityClient.getRemoteAgentHealth()));
      case "automations_list":
        return this.formatRuns(await this.parityClient.listAutomations(), "automations");
      case "automations_create": {
        const payload: Record<string, unknown> = {
          name: command.name,
          prompt: command.prompt,
          trigger:
            command.trigger === "manual"
              ? { kind: "manual", ...(command.workspace ? { workspaceRoot: command.workspace } : {}) }
              : command.trigger === "schedule_nl"
                ? { kind: "schedule_nl", scheduleText: command.scheduleText || "every weekday at 9am", ...(command.workspace ? { workspaceRoot: command.workspace } : {}) }
                : command.trigger === "file_event"
                  ? { kind: "file_event", workspaceRoot: command.workspace || getWorkspaceRootPath() || "", ...(command.includes?.length ? { includes: command.includes } : {}), ...(command.excludes?.length ? { excludes: command.excludes } : {}) }
                  : command.trigger === "process_event"
                    ? { kind: "process_event", query: command.query || "code", ...(command.workspace ? { workspaceRoot: command.workspace } : {}) }
                    : { kind: "notification", ...(command.topic ? { topic: command.topic } : {}), ...(command.query ? { query: command.query } : {}), ...(command.workspace ? { workspaceRoot: command.workspace } : {}) },
        };
        return this.formatAutomation(await this.parityClient.saveAutomation(payload));
      }
      case "automations_show":
        return this.formatAutomation(await this.parityClient.getAutomation(command.id));
      case "automations_run":
        return prettyJson(unwrapData(await this.parityClient.runAutomation(command.id)));
      case "automations_tail":
        return this.formatRecentEvents(await this.parityClient.getAutomationEvents(command.id));
      case "automations_control":
        return this.formatAutomation(await this.parityClient.controlAutomation(command.id, command.action));
      case "debug_agent_chat":
        if (command.sessionId) {
          return prettyJson(unwrapData(await this.parityClient.submitAgentProbeMessage(command.sessionId, command.message || "Continue.")));
        }
        return prettyJson(
          unwrapData(
            await this.parityClient.createAgentProbeSession({
              title: "Cutie debug-agent session",
              model: getModelHint(),
              workspaceRoot: getWorkspaceRootPath() || undefined,
              ...(command.message ? { message: command.message } : {}),
            })
          )
        );
      case "debug_agent_show":
        return prettyJson(unwrapData(await this.parityClient.getAgentProbeSession(command.sessionId)));
      case "debug_agent_tail":
        return this.formatRecentEvents(await this.parityClient.getAgentProbeEvents(command.sessionId));
      case "sessions_list": {
        const auth = await this.resolveHostedAuthForParity();
        if (!auth) throw new Error("Sign in or set an API key before listing hosted sessions.");
        return prettyJson(unwrapData(await this.parityClient.listSessions(auth, command.limit)));
      }
      case "sessions_show": {
        const auth = await this.resolveHostedAuthForParity();
        if (!auth) throw new Error("Sign in or set an API key before reading hosted sessions.");
        return this.formatHostedSessionMessages(await this.parityClient.getSessionMessages(auth, command.sessionId, true));
      }
      case "execute": {
        const auth = await this.resolveHostedAuthForParity();
        if (!auth) throw new Error("Sign in or set an API key before execute.");
        const raw = await fs.readFile(path.resolve(command.file), "utf8");
        const parsed = JSON.parse(raw) as unknown;
        const root = asObjectRecord(parsed);
        const actions = Array.isArray(root.actions) ? root.actions : Array.isArray(parsed) ? parsed : [];
        if (!actions.length) throw new Error("No valid actions found in execute file.");
        return prettyJson(
          unwrapData(await this.parityClient.execute(auth, command.sessionId || randomId("playground_exec"), getWorkspaceHash(), actions))
        );
      }
      case "replay": {
        const auth = await this.resolveHostedAuthForParity();
        if (!auth) throw new Error("Sign in or set an API key before replay.");
        return prettyJson(unwrapData(await this.parityClient.replay(auth, command.sessionId, getWorkspaceHash(), command.mode)));
      }
      case "index_upsert": {
        const auth = await this.resolveHostedAuthForParity();
        if (!auth) throw new Error("Sign in or set an API key before indexing.");
        const rootPath = path.resolve(command.path || getWorkspaceRootPath() || ".");
        const chunks = await this.buildIndexChunks(rootPath);
        return prettyJson(
          unwrapData(
            await this.parityClient.indexUpsert(auth, {
              projectKey: command.projectKey,
              chunks,
              cursor: null,
              stats: {
                fileCount: chunks.length,
                chunkCount: chunks.length,
              },
            })
          )
        );
      }
      case "index_query": {
        const auth = await this.resolveHostedAuthForParity();
        if (!auth) throw new Error("Sign in or set an API key before querying the index.");
        return prettyJson(
          unwrapData(
            await this.parityClient.indexQuery(auth, {
              projectKey: command.projectKey,
              query: command.query,
              limit: command.limit,
            })
          )
        );
      }
      case "binary_inspect":
      case "binary_hexdump":
      case "binary_hash":
        return this.runBinaryUtility(command);
      default:
        return prettyJson(command);
    }
  }

  private async runParityPrompt(trimmedPrompt: string): Promise<boolean> {
    const command = resolveCutieParityCommand(trimmedPrompt);
    if (!command) return false;

    let session = await this.ensureSession(trimmedPrompt);
    session = await this.appendChatMessage(session, "user", trimmedPrompt);
    this.activeSession = session;
    this.activeSessionId = session.id;
    this.activeRun = null;
    this.activeRunSessionId = session.id;
    this.streamingAssistantText = "";
    this.playgroundLiveNarration = "";
    this.suppressedAssistantArtifactText = "";
    this.submitState = "running";
    this.status = "Running Cutie parity action...";
    await this.emitState();

    try {
      const output = await this.executeParityCommand(command);
      session = await this.appendChatMessage(session, "assistant", output);
      this.activeSession = session;
      this.status = "Cutie parity action completed.";
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      session = await this.appendChatMessage(session, "assistant", `Cutie parity action failed.\n- ${message}`);
      this.activeSession = session;
      this.status = `Cutie parity failed: ${message}`;
      void vscode.window.showErrorMessage(this.status);
    } finally {
      this.submitState = "settled";
      await this.emitState();
    }

    return true;
  }

  private async runIdeRuntimePrompt(trimmedPrompt: string, mentions: CutieMentionSuggestion[]): Promise<void> {
    const runtime = getBinaryIdeChatRuntime();
    const task = this.appendMentionsToPrompt(trimmedPrompt, mentions);

    if (!this.isWarmSnapshotFresh()) {
      void this.prewarmFastStartState();
    }

    this.status =
      runtime === "qwenCode"
        ? "Running Qwen Code…"
        : runtime === "openCode"
          ? "Running OpenCode…"
        : runtime === "playgroundApi"
          ? "Thinking"
          : "Running…";
    this.submitState = "submitting";
    await this.emitState();

    try {
      const hostAssistAvailable =
        runtime !== "qwenCode" && runtime !== "openCode"
          ? Boolean(await this.parityClient.checkHostHealth().catch(() => null))
          : false;
      if (runtime === "qwenCode") {
        const auth = await this.getCachedRequestAuth();
        if (!auth?.apiKey) {
          this.submitState = "idle";
          this.status = "Qwen Code needs an Xpersona API key. Use “Set Xpersona API key” in Cutie settings.";
          void vscode.window.showWarningMessage(this.status);
          await this.emitState();
          return;
        }
      } else if (runtime === "openCode") {
        const health = await this.playgroundChatBridge.getOpenCodeStatus();
        if (health.status !== "healthy") {
          throw new Error(health.details ? `${health.message} ${health.details}` : health.message);
        }
      } else if (runtime === "playgroundApi" && !hostAssistAvailable) {
        const auth = await this.requireAuth();
        if (!auth) {
          this.submitState = "idle";
          await this.emitState();
          return;
        }
      }

      let session = await this.ensureSession(trimmedPrompt);
      session = await this.sessionStore.appendMessage(session, { role: "user", content: task });
      this.activeSession = session;
      this.activeSessionId = session.id;
      this.activeRun = null;
      this.activeRunSessionId = session.id;

      const runRequestVersion = ++this.runRequestVersion;
      this.currentAbortController?.abort();
      const abortController = new AbortController();
      this.currentAbortController = abortController;
      this.streamingAssistantText = "";
      this.playgroundLiveNarration = "";
      this.suppressedAssistantArtifactText = "";
      this.resetLiveActionLog();
      this.submitState = "running";
      await this.emitState();

      const history = this.sessionMessagesToIdeHistory(session.messages.slice(0, -1));

      try {
        let assistantText: string;
        if (runtime === "qwenCode") {
          assistantText = await this.playgroundChatBridge.runQwenTurn({
            task,
            history,
            signal: abortController.signal,
            onPartial: (text) => {
              if (runRequestVersion !== this.runRequestVersion) return;
              if (abortController.signal.aborted) return;
              this.streamingAssistantText = text;
              void this.emitState();
            },
          });
        } else if (runtime === "openCode") {
          const openCodeTurn = await this.playgroundChatBridge.runOpenCodeTurn({
            task,
            history,
            sessionId: session.openCodeSessionId ?? null,
            signal: abortController.signal,
            onOpenCodeProgress: (text) => {
              if (runRequestVersion !== this.runRequestVersion) return;
              if (abortController.signal.aborted) return;
              this.playgroundLiveNarration = text;
              void this.emitState();
            },
          });
          assistantText = openCodeTurn.assistantText;
          session = {
            ...session,
            openCodeSessionId: openCodeTurn.openCodeSessionId,
          };
        } else {
          if (hostAssistAvailable) {
            const hostTurn = await this.runBinaryHostAssistTurn({
              task,
              historySessionId: session.playgroundHistorySessionId ?? null,
              signal: abortController.signal,
              onProgress: (text) => {
                if (runRequestVersion !== this.runRequestVersion) return;
                if (abortController.signal.aborted) return;
                this.playgroundLiveNarration = text;
                void this.emitState();
              },
            });
            assistantText = hostTurn.assistantText;
            if (hostTurn.sessionId) {
              session = { ...session, playgroundHistorySessionId: hostTurn.sessionId };
            }

            if (runRequestVersion !== this.runRequestVersion) return;

            session = await this.persistPlaygroundLiveNarrationToSession(session);
            session = await this.sessionStore.appendMessage(session, {
              role: "assistant",
              content: assistantText,
              ...(hostTurn.runId ? { runId: hostTurn.runId } : {}),
            });
            if (this.activeSessionId === session.id) {
              this.activeSession = session;
            }
          } else {
            const health = await this.playgroundChatBridge.getOpenHandsStatus(abortController.signal);
            if (health.status !== "healthy") {
              throw new Error(`OpenHands unavailable: ${health.message}`);
            }
            const playgroundTurn = await this.playgroundChatBridge.runPlaygroundApiTurn({
              task,
              mode: "auto",
              historySessionId: session.playgroundHistorySessionId ?? null,
              history,
              signal: abortController.signal,
              onPlaygroundProgress: (text) => {
                if (runRequestVersion !== this.runRequestVersion) return;
                if (abortController.signal.aborted) return;
                this.playgroundLiveNarration = text;
                void this.emitState();
              },
            });
            assistantText = playgroundTurn.assistantText;
            if (playgroundTurn.playgroundSessionId) {
              session = { ...session, playgroundHistorySessionId: playgroundTurn.playgroundSessionId };
            }

            if (runRequestVersion !== this.runRequestVersion) return;

            session = await this.persistPlaygroundLiveNarrationToSession(session);

            const playgroundRunId = playgroundTurn.playgroundRunId;
            const fileMutations = playgroundTurn.fileMutations;
            session = await this.sessionStore.appendMessage(session, {
              role: "assistant",
              content: assistantText,
              ...(playgroundRunId && fileMutations.length ? { runId: playgroundRunId } : {}),
            });
            if (this.activeSessionId === session.id) {
              this.activeSession = session;
            }

            if (playgroundRunId && fileMutations.length) {
              for (const mutation of fileMutations) {
                if (runRequestVersion !== this.runRequestVersion) return;
                const info: CutieWorkspaceMutationInfo = {
                  sessionId: session.id,
                  runId: playgroundRunId,
                  relativePath: mutation.relativePath,
                  toolName: mutation.toolName,
                  previousContent: mutation.previousContent,
                  nextContent: mutation.nextContent,
                };
                await this.recordChatWorkspaceDiff(info);
                await this.finishHostWorkspaceMutationUi(info);
              }
            }
          }
        }

        if (runRequestVersion !== this.runRequestVersion) return;

        if (runtime === "qwenCode" || runtime === "openCode") {
          session = await this.sessionStore.appendMessage(session, { role: "assistant", content: assistantText });
          if (this.activeSessionId === session.id) {
            this.activeSession = session;
          }
        }

        this.streamingAssistantText = "";
        this.playgroundLiveNarration = "";
        this.submitState = "settled";
        this.status =
          runtime === "openCode"
            ? "Done. OpenCode completed the run."
            : runtime === "playgroundApi"
              ? "Done. OpenHands completed the run."
              : "Done.";
      } catch (error) {
        if (runRequestVersion !== this.runRequestVersion) return;
        const message = error instanceof Error ? error.message : String(error);
        const isCancel = /aborted|abort|cancelled|canceled/i.test(message);
        this.streamingAssistantText = "";
        try {
          session = await this.persistPlaygroundLiveNarrationToSession(session);
        } catch {
          /* ignore persistence errors */
        }
        this.playgroundLiveNarration = "";
        this.status = isCancel ? "Run cancelled." : `Failed: ${message}`;
        this.submitState = "settled";
        if (!isCancel) void vscode.window.showErrorMessage(this.status);
      } finally {
        if (this.currentAbortController === abortController) {
          this.currentAbortController = null;
        }
        if (runRequestVersion === this.runRequestVersion) {
          this.streamingAssistantText = "";
          this.playgroundLiveNarration = "";
          this.submitState = "settled";
        }
        await this.refreshDesktopState();
        void this.prewarmFastStartState();
        await this.emitState();
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.status = `Failed: ${message}`;
      this.submitState = "settled";
      void vscode.window.showErrorMessage(this.status);
      await this.refreshDesktopState();
      void this.prewarmFastStartState();
      await this.emitState();
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
    const auth = await this.getCachedRequestAuth();
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
    this.hydrateChatDiffsFromRunReceipts(session);
    this.activeSession = session;
    this.activeSessionId = session.id;
    if (!this.currentAbortController && !this.binaryController.hasOngoingWork()) {
      this.activeRun = this.sessionStore.getLatestRun(session);
      this.activeRunSessionId = this.activeRun?.sessionId || session.id;
      this.submitState = "idle";
      this.streamingAssistantText = "";
      this.playgroundLiveNarration = "";
      this.suppressedAssistantArtifactText = "";
      this.resetLiveActionLog();
    }
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
    await this.refreshOperatingPromptState(false);
    const settings = this.buildDynamicSettings();
    const snapshot = this.isWarmSnapshotFresh() ? this.warmStartSnapshot : null;
    const editorSnapshot = snapshot
      ? {
          ...(snapshot.activeFile ? { activeFile: snapshot.activeFile } : {}),
          openFiles: snapshot.openFiles,
          diagnostics: snapshot.diagnostics,
        }
      : this.captureEditorContextSnapshot(settings);

    const desktop = snapshot?.desktopState || (await this.getDesktopContextForPrompt().catch(() => this.desktopState));
    const gitStatusSummary =
      snapshot?.gitStatusSummary || (await this.getGitStatusSummary().catch(() => this.gitStatusSummary));

    return {
      workspaceHash: getWorkspaceHash(),
      workspaceRootPath: getWorkspaceRootPath(),
      extensionVersion: getExtensionVersion(this.context),
      ...(editorSnapshot.activeFile ? { activeFile: editorSnapshot.activeFile } : {}),
      ...(editorSnapshot.openFiles.length ? { openFiles: editorSnapshot.openFiles } : {}),
      ...(editorSnapshot.diagnostics.length ? { diagnostics: editorSnapshot.diagnostics } : {}),
      desktop,
      latestSnapshot: this.activeSession?.snapshots?.[0] || null,
      cutieDynamicSettings: {
        maxToolsPerBatch: settings.maxToolsPerBatch,
        contextReceiptWindow: settings.contextReceiptWindow,
        investigationPreflight: settings.investigationPreflight,
        objectiveBasedRuns: settings.objectiveBasedRuns,
        objectiveBasedInvestigation: settings.objectiveBasedInvestigation,
        maxToolSteps: settings.maxToolSteps,
        maxWorkspaceMutations: settings.maxWorkspaceMutations,
        unlimitedAutonomy: settings.unlimitedAutonomy,
      },
      promptSource: this.operatingPromptState.promptSource,
      promptMarkdownPath: this.operatingPromptState.promptMarkdownPath,
      promptLoaded: this.operatingPromptState.promptLoaded,
      ...(this.operatingPromptState.promptLoadError
        ? { promptLoadError: this.operatingPromptState.promptLoadError }
        : {}),
      ...(this.operatingPromptState.promptLastLoadedAt
        ? { promptLastLoadedAt: this.operatingPromptState.promptLastLoadedAt }
        : {}),
      ...(this.operatingPromptState.promptContent
        ? { externalOperatingPrompt: this.operatingPromptState.promptContent }
        : {}),
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
        const indexedPaths = await this.getWorkspaceMentionPathsForQuery();
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

    const shouldLookupWindows = wantsWindowsOnly;
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
    return this.runPromptLegacy(prompt, mentions);
  }

  private async runPromptLegacy(prompt: string, mentions: CutieMentionSuggestion[] = []): Promise<void> {
    const trimmedPrompt = String(prompt || "").trim();
    if (!trimmedPrompt) {
      await this.emitState();
      return;
    }

    if (await this.runParityPrompt(trimmedPrompt)) {
      return;
    }

    if (getBinaryIdeChatRuntime() !== "cutie") {
      return this.runIdeRuntimePrompt(trimmedPrompt, mentions);
    }

    if (!this.isWarmSnapshotFresh()) {
      void this.prewarmFastStartState();
    }

    this.status = this.warmStartSnapshot?.localReady
      ? this.warmStartSnapshot.hostReady === false
        ? "Starting your Cutie run from warm local context..."
        : "Starting your Cutie run from warm context..."
      : "Preparing your Cutie run...";
    this.submitState = "submitting";
    await this.emitState();

    try {
      const auth = await this.requireAuth();
      if (!auth) {
        this.submitState = "idle";
        this.status = "Sign in or set an API key to start Cutie.";
        await this.emitState();
        return;
      }

      const session = await this.ensureSession(trimmedPrompt);
      const runRequestVersion = ++this.runRequestVersion;
      this.currentAbortController?.abort();
      const abortController = new AbortController();
      this.currentAbortController = abortController;
      this.activeRun = null;
      this.activeRunSessionId = session.id;
      this.streamingAssistantText = "";
      this.suppressedAssistantArtifactText = "";
      this.resetLiveActionLog();
      this.status = this.warmStartSnapshot?.localReady
        ? "Starting local Cutie runtime from warm context..."
        : "Starting local Cutie runtime...";
      this.submitState = "starting";
      await this.emitState();

      try {
        const result = await this.runtime.runPrompt({
          auth,
          session,
          prompt: trimmedPrompt,
          mentions,
          signal: abortController.signal,
          callbacks: {
            onSessionChanged: async (nextSession, maybeRun) => {
              if (runRequestVersion !== this.runRequestVersion) return;
              if (this.activeSessionId === nextSession.id) {
                this.activeSession = nextSession;
              }
              this.activeRun =
                maybeRun === undefined ? this.sessionStore.getLatestRun(nextSession) : maybeRun;
              this.activeRunSessionId = nextSession.id;
              this.syncLiveActionReceipts(this.activeRun);
              await this.emitState();
              void this.refreshDesktopState().then(() => this.emitState());
            },
            onStatusChanged: async (status, run) => {
              if (runRequestVersion !== this.runRequestVersion) return;
              this.status = status;
              this.activeRun = run;
              if (run?.sessionId) this.activeRunSessionId = run.sessionId;
              if (this.submitState !== "stopping") {
                this.submitState =
                  run?.status === "running"
                    ? "running"
                    : this.currentAbortController
                      ? "starting"
                      : "settled";
              }
              this.noteLiveActionStatus(status, run);
              this.syncLiveActionReceipts(run);
              if (abortController.signal.aborted || !run || run.status !== "running") {
                this.streamingAssistantText = "";
              }
              await this.emitState();
              void this.refreshDesktopState().then(() => this.emitState());
            },
            onAssistantDelta: async (_delta, accumulated) => {
              if (runRequestVersion !== this.runRequestVersion) return;
              if (abortController.signal.aborted) return;
              if (this.submitState === "stopping") return;
              if (looksLikeCutieToolArtifactText(accumulated)) {
                this.suppressedAssistantArtifactText = accumulated;
                this.streamingAssistantText = "";
                this.upsertLiveTranscriptEvent({
                  kind: "artifact_rescue",
                  text: humanizeSuppressedAssistantArtifact(accumulated),
                  run: this.activeRun,
                  slot: "suppressed_artifact",
                });
                this.submitState = "running";
                await this.emitState();
                if (abortController.signal.aborted) return;
                return;
              }
              this.submitState = "running";
              this.streamingAssistantText = accumulated;
              this.upsertLiveTranscriptEvent({
                kind: "assistant_text",
                text: accumulated,
                run: this.activeRun,
                slot: "assistant_stream",
              });
              await this.emitState();
              if (abortController.signal.aborted) {
                this.streamingAssistantText = "";
              }
            },
            onSuppressedAssistantArtifact: async (artifact) => {
              if (runRequestVersion !== this.runRequestVersion) return;
              if (abortController.signal.aborted) return;
              if (this.submitState === "stopping") return;
              this.suppressedAssistantArtifactText = artifact;
              this.upsertLiveTranscriptEvent({
                kind: "artifact_rescue",
                text: humanizeSuppressedAssistantArtifact(artifact),
                run: this.activeRun,
                slot: "suppressed_artifact",
              });
              this.submitState = "running";
              await this.emitState();
              if (abortController.signal.aborted) {
                this.suppressedAssistantArtifactText = "";
              }
            },
            onWorkspaceFileMutated: async (info) => {
              if (runRequestVersion !== this.runRequestVersion) return;
              await this.recordChatWorkspaceDiff(info);
              await this.finishHostWorkspaceMutationUi(info);
            },
          },
        });

        if (runRequestVersion !== this.runRequestVersion) return;
        if (this.activeSessionId === result.session.id) {
          this.activeSession = result.session;
        }
        this.hydrateChatDiffsFromRunReceipts(result.session);
        this.activeRun = result.run;
        this.activeRunSessionId = result.session.id;
        this.syncLiveActionReceipts(result.run);
        await this.persistUnifiedRunTranscript(result.run);
        if (runRequestVersion !== this.runRequestVersion) return;
        const recapSession = await this.ensureRunChangeRecap(result.run, result.session);
        if (runRequestVersion !== this.runRequestVersion) return;
        if (recapSession && this.activeSessionId === recapSession.id) {
          this.activeSession = recapSession;
        }
        this.streamingAssistantText = "";
        this.submitState = "settled";
        this.status = settledStatusForRun(result.run);
      } catch (error) {
        if (runRequestVersion !== this.runRequestVersion) return;
        const message = error instanceof Error ? error.message : String(error);
        const isCancel = /aborted|abort|cancelled|canceled/i.test(message);
        this.streamingAssistantText = "";
        this.suppressedAssistantArtifactText = "";
        this.status = isCancel ? "Cutie run cancelled." : `Cutie failed: ${message}`;
        this.submitState = "settled";
        const runSession =
          this.activeRunSessionId ? this.sessionStore.getSession(getWorkspaceHash(), this.activeRunSessionId) : null;
        if (runSession && this.activeRun && isTerminalRunStatus(this.activeRun.status)) {
          const recapSession = await this.ensureRunChangeRecap(this.activeRun, runSession);
          if (runRequestVersion !== this.runRequestVersion) return;
          if (recapSession && this.activeSessionId === recapSession.id) {
            this.activeSession = recapSession;
          }
        }
        if (!isCancel) void vscode.window.showErrorMessage(this.status);
      } finally {
        if (this.currentAbortController === abortController) {
          this.currentAbortController = null;
        }
        if (runRequestVersion !== this.runRequestVersion) return;
        this.submitState = "settled";
        await this.refreshDesktopState();
        void this.prewarmFastStartState();
        await this.emitState();
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.status = `Cutie failed: ${message}`;
      this.submitState = "settled";
      void vscode.window.showErrorMessage(this.status);
      await this.refreshDesktopState();
      void this.prewarmFastStartState();
      await this.emitState();
    }
  }

  private async copyDebugReport(): Promise<void> {
    const session = this.activeSession;
    const run = this.activeRun;
    const messages = this.getVisibleMessages();
    const payloadText = buildCutieDebugReportV2Text({
      generatedAt: new Date().toISOString(),
      extensionVersion: getExtensionVersion(this.context),
      runtime: getBinaryIdeChatRuntime(),
      workspaceHash: getWorkspaceHash(),
      workspaceRootPath: getWorkspaceRootPath(),
      submitState: this.submitState,
      status: this.status,
      auth: {
        kind: this.authState.kind,
        label: this.authState.label,
      },
      warmStartState: this.getWarmStartStateForView() as Record<string, unknown> | null,
      promptState: this.getPromptStateForView() as Record<string, unknown> | null,
      dynamicSettings: this.buildDynamicSettings() as Record<string, unknown>,
      desktop: this.desktopState,
      session: session
        ? {
            id: session.id,
            title: session.title,
            updatedAt: session.updatedAt,
            snapshotCount: session.snapshots.length,
          }
        : null,
      activeRun: run,
      binaryPanelState: this.binaryController.binary,
      binaryDebug: this.binaryController.getDebugSnapshot(),
      liveActionLog: this.getLiveActionLogForRun(run),
      liveTranscript: this.getLiveTranscriptForRun(run),
      recentMessages: messages,
      suppressedAssistantArtifactText: this.suppressedAssistantArtifactText || null,
    });
    await vscode.env.clipboard.writeText(payloadText);
    this.status = "Cutie debug report copied to clipboard.";
    await this.emitState();
    void vscode.window.showInformationMessage("Cutie debug report copied to your clipboard.");
  }

  private getVisibleMessages(): CutieChatMessage[] {
    const activeRunId = this.isViewingActiveRunSession() ? String(this.activeRun?.id || "").trim() : "";
    const messages = (this.activeSession?.messages || []).filter((message) => {
      if (!activeRunId || !isBusySubmitState(this.submitState)) return true;
      return !(message.role === "assistant" && message.runId === activeRunId);
    });
    let out: CutieChatMessage[] = messages;
    const bubble = this.binaryController.getLiveBubble();
    if (bubble && (!bubble.sessionId || bubble.sessionId === this.activeSessionId)) {
      out = [
        ...out,
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
    if (
      (getBinaryIdeChatRuntime() === "playgroundApi" || getBinaryIdeChatRuntime() === "openCode") &&
      isBusySubmitState(this.submitState) &&
      this.playgroundLiveNarration.trim()
    ) {
      out = [
        ...out,
        {
          id: "__cutie_playground_progress__",
          role: "assistant" as const,
          content: this.playgroundLiveNarration.trim(),
          createdAt: new Date().toISOString(),
        },
      ];
    }
    return out;
  }

  private async refreshDesktopState(): Promise<void> {
    this.desktopState = await this.desktop.getDesktopContext().catch(() => this.desktopState || buildDefaultDesktopState());
    this.desktopStateFetchedAt = Date.now();
  }

  private async getDesktopContextForPrompt(): Promise<DesktopContextForView> {
    const now = Date.now();
    if (
      this.desktopStateFetchedAt &&
      now - this.desktopStateFetchedAt < CutieSidebarProvider.DESKTOP_CONTEXT_CACHE_TTL_MS
    ) {
      return this.desktopState;
    }
    await this.refreshDesktopState();
    return this.desktopState;
  }

  private async getGitStatusSummary(force = false): Promise<string | undefined> {
    const now = Date.now();
    if (
      !force &&
      this.gitStatusFetchedAt &&
      now - this.gitStatusFetchedAt < CutieSidebarProvider.GIT_STATUS_CACHE_TTL_MS
    ) {
      return this.gitStatusSummary;
    }
    if (this.gitStatusPromise) {
      return this.gitStatusPromise;
    }
    this.gitStatusPromise = (async () => {
      let summary: string | undefined;
      try {
        const gs = await this.workspaceAdapter.gitStatus();
        const out = (gs.stdout || "").trim();
        if (out) {
          summary = out.length > 6000 ? `${out.slice(0, 6000)}\n...[truncated]` : out;
        }
      } catch {
        summary = undefined;
      }
      this.gitStatusSummary = summary;
      this.gitStatusFetchedAt = Date.now();
      return summary;
    })();
    try {
      return await this.gitStatusPromise;
    } finally {
      this.gitStatusPromise = null;
    }
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

  private async refreshOpenHandsStatus(): Promise<void> {
    const runtime = getBinaryIdeChatRuntime();
    if (runtime !== "playgroundApi" && runtime !== "openCode") return;
    if (isBusySubmitState(this.submitState) || this.activeRun) return;
    if (runtime === "openCode") {
      try {
        const auth = await this.getCachedRequestAuth();
        const health = await this.playgroundChatBridge.getOpenCodeStatus();
        const autoStartNote = getOpenCodeAutoStart() ? " Auto-start is enabled." : "";
        this.status =
          health.status === "healthy"
            ? "OpenCode connected. Cutie is ready."
            : `OpenCode unavailable: ${health.message}${health.details ? ` ${health.details}` : autoStartNote}`;
        if (auth?.apiKey === undefined && health.status !== "healthy") {
          this.status = `${this.status} Sign in or set an API key if your OpenCode provider needs one.`;
        }
      } catch (error) {
        this.status = `OpenCode unavailable: ${error instanceof Error ? error.message : String(error)}`;
      }
      return;
    }
    try {
      const health = await this.playgroundChatBridge.getOpenHandsStatus();
      this.status =
        health.status === "healthy"
          ? "OpenHands connected. Cutie is ready."
          : `OpenHands unavailable: ${health.message}`;
    } catch (error) {
      this.status = `OpenHands unavailable: ${error instanceof Error ? error.message : String(error)}`;
    }
  }

  private async refreshViewState(): Promise<void> {
    await Promise.allSettled([
      this.refreshAuthState(),
      this.refreshDesktopState(),
      this.refreshOperatingPromptState(false),
      this.refreshWarmStartSnapshot(false),
    ]);
    await this.refreshOpenHandsStatus();
    await this.emitState();
  }

  private async emitState(): Promise<void> {
    if (!this.view) return;

    const workspaceHash = getWorkspaceHash();
    const visibleSessionRun = this.getVisibleSessionRun();
    const viewingActiveRun = this.isViewingActiveRunSession();
    const state: CutieViewState = {
      authState: this.authState,
      sessions: this.sessionStore.listSessions(workspaceHash),
      activeSessionId: this.activeSessionId,
      messages: this.getVisibleMessages(),
      chatDiffs: this.getChatDiffsForActiveSession(),
      liveActionLog: viewingActiveRun ? this.getLiveActionLogForRun(this.activeRun) : [],
      liveTranscript: viewingActiveRun ? this.getLiveTranscriptForRun(this.activeRun) : [],
      status: this.status,
      submitState: this.submitState,
      running: isBusySubmitState(this.submitState),
      activeRun: this.activeRun,
      visibleSessionRun,
      activeRunSessionId: this.activeRunSessionId,
      viewingActiveRun,
      backgroundActivity: this.getBackgroundActivity(),
      desktop: this.desktopState,
      progress: viewingActiveRun ? buildProgressViewModel(this.activeRun) : null,
      binary: this.binaryController.binary,
      binaryActivity: this.binaryController.binaryActivity,
      binaryLiveBubble: this.binaryController.getLiveBubble(),
      composerPrefs: {
        selectedModel: getModelHint(),
        modelOptions: getModelPickerOptions(),
        reasoningLevel: getReasoningLevel(),
      },
      warmStartState: this.getWarmStartStateForView(),
      promptState: this.getPromptStateForView(),
    };
    this.view.webview.postMessage({ type: "state", state });
  }
}

export type CutieProductServices = {
  auth: CutieAuthManager;
  provider: CutieSidebarProvider;
};

export function createCutieProductServices(context: vscode.ExtensionContext): CutieProductServices {
  registerCutieDiffBeforeProvider(context);
  const auth = new CutieAuthManager(context);
  const provider = new CutieSidebarProvider(context, auth);
  return { auth, provider };
}

export function activateCutieProduct(context: vscode.ExtensionContext): void {
  try {
    const { auth, provider } = createCutieProductServices(context);
    // Defer warmup to the next macrotask so activation returns before network / workspace scans start.
    setTimeout(() => provider.startBackgroundWarmup(), 0);

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
          const rel = toWorkspaceRelativePath(editor.document.uri);
          const line = editor.selection.active.line + 1;
          const selectedText = editor.selection.isEmpty
            ? editor.document.lineAt(editor.selection.active.line).text
            : editor.document.getText(editor.selection);
          const fromSelection = buildSelectionPrefill({
            path: rel || undefined,
            line,
            selectedText,
          });
          prefill = fromSelection.trim() || selectedText.trim() || undefined;
        }
        await provider.runBinaryGenerateFromEditor(prefill);
      }),
      vscode.commands.registerCommand("cutie-product.undoLastPlaygroundChanges", async () => {
        await provider.undoLastPlaygroundBatchCommand();
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

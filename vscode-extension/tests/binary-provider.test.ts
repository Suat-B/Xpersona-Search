import { beforeEach, describe, expect, it, vi } from "vitest";
import type { BinaryBuildEvent, BinaryBuildRecord, BinaryPlanPreview, BinaryPreviewFile } from "../src/shared";

const {
  executeCommand,
  showQuickPick,
  showInformationMessage,
  showInputBox,
  writeClipboardText,
  activeTextEditorState,
  configurationValues,
  requestBinaryBuild,
  requestBinaryBuildStream,
  requestBinaryStreamEvents,
  requestBinaryRefine,
  requestBinaryBranch,
  requestBinaryRewind,
  requestBinaryExecute,
  requestBinaryCancel,
  requestBinaryStatus,
  requestBinaryValidate,
  requestBinaryPublish,
  requestJsonMock,
  streamJsonEventsMock,
} = vi.hoisted(() => ({
  executeCommand: vi.fn(async () => undefined),
  showQuickPick: vi.fn(async () => undefined),
  showInformationMessage: vi.fn(),
  showInputBox: vi.fn(async () => ""),
  writeClipboardText: vi.fn(async () => undefined),
  activeTextEditorState: {
    current: undefined as unknown,
  },
  configurationValues: {
    "xpersona.binary": {
      runtime: "qwenCode",
      baseApiUrl: "http://localhost:3000",
      "qwen.baseUrl": "http://localhost:3000/api/v1/hf",
      "qwen.model": "Qwen/Qwen3-Coder-30B-A3B-Instruct:featherless-ai",
      "qwen.executable": "",
    },
    "xpersona.playground": {},
  } as Record<string, Record<string, unknown>>,
  requestBinaryBuild: vi.fn(),
  requestBinaryBuildStream: vi.fn(),
  requestBinaryStreamEvents: vi.fn(),
  requestBinaryRefine: vi.fn(),
  requestBinaryBranch: vi.fn(),
  requestBinaryRewind: vi.fn(),
  requestBinaryExecute: vi.fn(),
  requestBinaryCancel: vi.fn(),
  requestBinaryStatus: vi.fn(),
  requestBinaryValidate: vi.fn(),
  requestBinaryPublish: vi.fn(),
  requestJsonMock: vi.fn(),
  streamJsonEventsMock: vi.fn(),
}));

function configurationTargetValue(target: unknown): "global" | "workspace" | "workspaceFolder" {
  if (target === 2) return "workspace";
  if (target === 3) return "workspaceFolder";
  return "global";
}

vi.mock("vscode", () => ({
  window: {
    showQuickPick,
    showInformationMessage,
    showInputBox,
    get activeTextEditor() {
      return activeTextEditorState.current;
    },
  },
  env: {
    clipboard: {
      writeText: writeClipboardText,
    },
  },
  commands: {
    executeCommand,
  },
  extensions: {
    getExtension: vi.fn(() => ({
      packageJSON: { version: "0.0.59" },
    })),
  },
  workspace: {
    workspaceFolders: [
      {
        name: "repo",
        uri: { fsPath: "C:/repo" },
      },
    ],
    getWorkspaceFolder: vi.fn(() => ({
      name: "repo",
      uri: { fsPath: "C:/repo" },
    })),
    getConfiguration: (namespace: string) => ({
      get: (key: string) => configurationValues[namespace]?.[key],
      update: async (key: string, value: unknown, target: unknown) => {
        const bucket = configurationTargetValue(target);
        configurationValues[namespace] = {
          ...(configurationValues[namespace] || {}),
          [key]: value,
          [`${key}:${bucket}`]: value,
        };
      },
      inspect: (key: string) => ({
        globalValue: configurationValues[namespace]?.[`${key}:global`],
        workspaceValue: configurationValues[namespace]?.[`${key}:workspace`],
        workspaceFolderValue: configurationValues[namespace]?.[`${key}:workspaceFolder`],
      }),
    }),
  },
  ConfigurationTarget: {
    Global: 1,
    Workspace: 2,
    WorkspaceFolder: 3,
  },
  EventEmitter: class<T> {
    private listeners: Array<(value: T) => void> = [];
    event = (listener: (value: T) => void) => {
      this.listeners.push(listener);
      return { dispose() {} };
    };
    fire(value: T) {
      for (const listener of this.listeners) listener(value);
    }
  },
}));

vi.mock("../src/binary-client", () => ({
  branchBinaryBuild: requestBinaryBranch,
  createBinaryBuild: requestBinaryBuild,
  createBinaryBuildStream: requestBinaryBuildStream,
  streamBinaryBuildEvents: requestBinaryStreamEvents,
  executeBinaryBuild: requestBinaryExecute,
  refineBinaryBuild: requestBinaryRefine,
  rewindBinaryBuild: requestBinaryRewind,
  cancelBinaryBuild: requestBinaryCancel,
  getBinaryBuild: requestBinaryStatus,
  validateBinaryBuild: requestBinaryValidate,
  publishBinaryBuild: requestBinaryPublish,
}));

vi.mock("../src/api-client", () => ({
  requestJson: requestJsonMock,
  streamJsonEvents: streamJsonEventsMock,
}));

import { PlaygroundViewProvider } from "../src/webview-provider";

type TestMemento = {
  values: Map<string, unknown>;
  get: <T>(key: string) => T;
  update: (key: string, value: unknown) => Promise<void>;
};

function createMemento(): TestMemento {
  const values = new Map<string, unknown>();
  return {
    values,
    get: <T>(key: string) => values.get(key) as T,
    update: async (key: string, value: unknown) => {
      values.set(key, value);
    },
  };
}

function createContext() {
  return {
    workspaceState: createMemento(),
    globalState: createMemento(),
    extensionUri: { fsPath: "C:/repo/vscode-extension" },
  };
}

const TARGET_ENVIRONMENT = {
  runtime: "node18",
  platform: "portable",
  packageManager: "npm",
} as const;

function createPlanPreview(overrides: Partial<BinaryPlanPreview> = {}): BinaryPlanPreview {
  return {
    name: "binary-starter",
    displayName: "Binary Starter",
    description: "Starter bundle",
    entrypoint: "dist/index.js",
    buildCommand: "npm run build",
    startCommand: "npm start",
    sourceFiles: ["package.json", "src/index.ts"],
    warnings: [],
    ...overrides,
  };
}

function createPreviewFile(overrides: Partial<BinaryPreviewFile> = {}): BinaryPreviewFile {
  return {
    path: "src/index.ts",
    language: "typescript",
    preview: "export const ready = true;",
    hash: "hash-123",
    completed: true,
    updatedAt: new Date().toISOString(),
    ...overrides,
  };
}

function createReliabilityReport(
  overrides: Partial<NonNullable<BinaryBuildRecord["reliability"]>> = {}
): NonNullable<BinaryBuildRecord["reliability"]> {
  return {
    status: "pass",
    score: 98,
    summary: "Bundle looks good.",
    targetEnvironment: { ...TARGET_ENVIRONMENT },
    issues: [],
    warnings: [],
    generatedAt: new Date().toISOString(),
    ...overrides,
  };
}

function createManifest(buildId: string, intent = "starter bundle") {
  return {
    buildId,
    artifactKind: "package_bundle" as const,
    name: "binary-starter",
    displayName: "Binary Starter",
    description: "Starter bundle",
    intent,
    runtime: "node18" as const,
    platform: "portable" as const,
    packageManager: "npm" as const,
    entrypoint: "dist/index.js",
    installCommand: "npm install",
    buildCommand: "npm run build",
    startCommand: "npm start",
    sourceFiles: ["src/index.ts"],
    outputFiles: ["dist/index.js"],
    warnings: [],
    createdAt: new Date().toISOString(),
  };
}

function createArtifact(buildId: string) {
  return {
    fileName: `${buildId}.zip`,
    relativePath: `artifacts/${buildId}.zip`,
    sizeBytes: 1024,
    sha256: "abc123",
  };
}

function createArtifactState(overrides: Partial<NonNullable<BinaryBuildRecord["artifactState"]>> = {}) {
  return {
    coverage: 72,
    runnable: false,
    sourceFilesTotal: 2,
    sourceFilesReady: 2,
    outputFilesReady: 0,
    entryPoints: [],
    latestFile: "src/index.ts",
    updatedAt: new Date().toISOString(),
    ...overrides,
  };
}

function createSourceGraph(overrides: Partial<NonNullable<BinaryBuildRecord["sourceGraph"]>> = {}) {
  return {
    coverage: 67,
    readyModules: 2,
    totalModules: 3,
    modules: [
      {
        path: "src/index.ts",
        language: "typescript",
        imports: ["./lib/health"],
        exports: ["health"],
        functions: [
          {
            name: "health",
            sourcePath: "src/index.ts",
            exported: true,
            async: false,
            callable: true,
            signature: "health()",
          },
        ],
        completed: true,
        diagnosticCount: 0,
      },
    ],
    dependencies: [
      {
        from: "src/index.ts",
        to: "src/lib/health.ts",
        kind: "import",
        resolved: true,
      },
    ],
    diagnostics: [],
    updatedAt: new Date().toISOString(),
    ...overrides,
  };
}

function createExecutionState(overrides: Partial<NonNullable<BinaryBuildRecord["execution"]>> = {}) {
  return {
    runnable: true,
    mode: "native" as const,
    availableFunctions: [
      {
        name: "health",
        sourcePath: "src/index.ts",
        mode: "native" as const,
        callable: true,
        signature: "health()",
      },
    ],
    lastRun: null,
    updatedAt: new Date().toISOString(),
    ...overrides,
  };
}

function createLiveReliabilityState(
  overrides: Partial<NonNullable<BinaryBuildRecord["liveReliability"]>> = {}
): NonNullable<BinaryBuildRecord["liveReliability"]> {
  return {
    score: 91,
    trend: "rising" as const,
    warnings: [],
    blockers: [],
    resolvedBlockers: [],
    updatedAt: new Date().toISOString(),
    source: "compat" as const,
    ...overrides,
  };
}

function createAstState(overrides: Partial<NonNullable<BinaryBuildRecord["astState"]>> = {}) {
  return {
    coverage: 74,
    moduleCount: 1,
    modules: [
      {
        path: "src/index.ts",
        language: "typescript",
        nodeCount: 4,
        exportedSymbols: ["health"],
        callableFunctions: ["health"],
        completed: true,
      },
    ],
    nodes: [
      {
        id: "node_health",
        kind: "function",
        label: "health",
        path: "src/index.ts",
        exported: true,
        callable: true,
        completeness: 100,
      },
    ],
    updatedAt: new Date().toISOString(),
    source: "compat" as const,
    ...overrides,
  };
}

function createRuntimeState(overrides: Partial<NonNullable<BinaryBuildRecord["runtimeState"]>> = {}) {
  return {
    runnable: true,
    engine: "quickjs" as const,
    availableFunctions: [
      {
        name: "health",
        sourcePath: "src/index.ts",
        mode: "native" as const,
        callable: true,
        signature: "health()",
      },
    ],
    patches: [],
    updatedAt: new Date().toISOString(),
    lastRun: null,
    ...overrides,
  };
}

function createSnapshotSummary(overrides: Partial<NonNullable<BinaryBuildRecord["snapshots"]>[number]> = {}) {
  return {
    id: "snap_123",
    checkpointId: "chk_123",
    parentSnapshotId: null,
    phase: "materializing" as const,
    label: "AST synced",
    savedAt: new Date().toISOString(),
    source: "compat" as const,
    ...overrides,
  };
}

function createCheckpointSummary(overrides: Partial<NonNullable<BinaryBuildRecord["checkpoints"]>[number]> = {}) {
  return {
    id: "chk_123",
    phase: "materializing" as const,
    savedAt: new Date().toISOString(),
    label: "Graph synced",
    ...overrides,
  };
}

function createBuild(overrides: Partial<BinaryBuildRecord> = {}): BinaryBuildRecord {
  const id = overrides.id || "bin_test";
  const intent = overrides.intent || "starter bundle";
  return {
    id,
    userId: "user-1",
    historySessionId: null,
    runId: null,
    workflow: "binary_generate",
    artifactKind: "package_bundle",
    status: "queued",
    phase: "queued",
    progress: 0,
    intent,
    workspaceFingerprint: "workspace-1",
    targetEnvironment: { ...TARGET_ENVIRONMENT },
    logs: [],
    preview: {
      plan: null,
      files: [],
      recentLogs: [],
    },
    cancelable: true,
    manifest: null,
    reliability: null,
    liveReliability: null,
    artifact: null,
    publish: null,
    errorMessage: null,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    ...overrides,
  };
}

let eventSequence = 0;

function createEvent<TType extends BinaryBuildEvent["type"]>(
  type: TType,
  data: Extract<BinaryBuildEvent, { type: TType }>["data"],
  buildId = "bin_test",
  id?: string
): BinaryBuildEvent {
  eventSequence += 1;
  return {
    id: id || `evt_${eventSequence}`,
    buildId,
    timestamp: new Date().toISOString(),
    type,
    data,
  } as BinaryBuildEvent;
}

function createProvider(options?: { persistedMode?: "auto" | "plan" }) {
  const context = createContext();
  if (options?.persistedMode) {
    context.workspaceState.values.set("xpersona.playground.mode", options.persistedMode);
  }
  const auth = {
    onDidChange: vi.fn(() => ({ dispose() {} })),
    getRequestAuth: vi.fn(async () => ({ apiKey: "test-key" })),
    setApiKeyInteractive: vi.fn(async () => undefined),
    signInWithBrowser: vi.fn(async () => undefined),
    signOut: vi.fn(async () => undefined),
    getApiKey: vi.fn(async () => "test-key"),
    getAuthState: vi.fn(async () => ({ kind: "apiKey", label: "Using Xpersona Binary IDE API key" })),
  };
  const historyService = {
    list: vi.fn(async () => []),
    loadMessages: vi.fn(async () => []),
  };
  const qwenHistoryService = {
    list: vi.fn(async () => []),
    loadMessages: vi.fn(async () => []),
    hasSession: vi.fn(async () => false),
    saveConversation: vi.fn(async () => undefined),
    getWorkspaceHints: vi.fn(async () => ({
      recentTargets: [],
      recentIntents: [],
    })),
  };
  const contextCollector = {
    collect: vi.fn(async () => ({
      context: {
        activeFile: { path: "src/index.ts", language: "typescript" },
        openFiles: [],
      },
      retrievalHints: {
        mentionedPaths: [],
        candidateSymbols: [],
        candidateErrors: [],
      },
      preview: {
        activeFile: "src/index.ts",
        openFiles: [],
        candidateFiles: [],
        attachedFiles: [],
        memoryFiles: [],
        resolvedFiles: ["src/index.ts"],
        selectedFiles: [],
        diagnostics: [],
        intent: "change",
        confidence: "high",
        confidenceScore: 0.9,
        rationale: "high confidence",
        snippets: [],
      },
    })),
    preview: vi.fn(async () => ({
      activeFile: "src/index.ts",
      openFiles: [],
      candidateFiles: [],
      attachedFiles: [],
      memoryFiles: [],
      resolvedFiles: ["src/index.ts"],
      selectedFiles: [],
      diagnostics: [],
      intent: "change",
      confidence: "high",
      confidenceScore: 0.9,
      rationale: "high confidence",
      snippets: [],
    })),
    getMentionSuggestions: vi.fn(async () => []),
  };
  const actionRunner = {
    canUndo: vi.fn(() => false),
    onDidChangeUndo: vi.fn(() => ({ dispose() {} })),
    getRecentTouchedPaths: vi.fn(() => []),
  };
  const toolExecutor = {
    getSupportedTools: vi.fn(() => []),
  };
  const indexManager = {
    query: vi.fn(async () => []),
  };

  const provider = new PlaygroundViewProvider(
    context as any,
    auth as any,
    historyService as any,
    qwenHistoryService as any,
    {
      runPrompt: vi.fn(async () => ({
        sessionId: "qwen_session",
        assistantText: "Applied the requested edit.",
        permissionDenials: [],
        usedTools: [],
        didMutate: true,
        toolEvents: [],
      })),
    } as any,
    contextCollector as any,
    actionRunner as any,
    toolExecutor as any,
    indexManager as any
  );

  return {
    provider: provider as any,
    context,
    auth,
    historyService,
    qwenHistoryService,
    contextCollector,
  };
}

describe("binary provider", () => {
  beforeEach(() => {
    vi.useRealTimers();
    eventSequence = 0;
    executeCommand.mockClear();
    showQuickPick.mockReset();
    showInformationMessage.mockReset();
    showInputBox.mockReset();
    writeClipboardText.mockReset();
    requestBinaryBuild.mockReset();
    requestBinaryBuildStream.mockReset();
    requestBinaryStreamEvents.mockReset();
    requestBinaryRefine.mockReset();
    requestBinaryBranch.mockReset();
    requestBinaryRewind.mockReset();
    requestBinaryExecute.mockReset();
    requestBinaryCancel.mockReset();
    requestBinaryStatus.mockReset();
    requestBinaryValidate.mockReset();
    requestBinaryPublish.mockReset();
    requestJsonMock.mockReset();
    streamJsonEventsMock.mockReset();
    configurationValues["xpersona.binary"].runtime = "qwenCode";
    activeTextEditorState.current = undefined;
  });

  it("streams bundle generation first and updates realtime binary state", async () => {
    configurationValues["xpersona.binary"].runtime = "playgroundApi";
    const { provider } = createProvider();
    const plan = createPlanPreview();
    const previewFile = createPreviewFile();
    const completedBuild = createBuild({
      id: "bin_live",
      status: "completed",
      phase: "completed",
      progress: 100,
      cancelable: false,
      logs: ["Synthesizing bundle plan.", "npm install", "npm run build"],
      preview: {
        plan,
        files: [previewFile],
        recentLogs: ["npm install", "npm run build"],
      },
      manifest: createManifest("bin_live"),
      reliability: createReliabilityReport(),
      artifactState: createArtifactState({
        coverage: 100,
        runnable: true,
        outputFilesReady: 1,
        entryPoints: ["dist/index.js"],
        latestFile: "bin_live.zip",
      }),
      artifact: createArtifact("bin_live"),
    });

    requestBinaryBuildStream.mockImplementation(async ({ onEvent }: { onEvent: (event: BinaryBuildEvent) => Promise<void> }) => {
      await onEvent(createEvent("build.created", { build: createBuild({ id: "bin_live" }) }, "bin_live"));
      await onEvent(
        createEvent(
          "phase.changed",
          { status: "running", phase: "planning", progress: 12, message: "Synthesizing bundle plan." },
          "bin_live"
        )
      );
      await onEvent(createEvent("plan.updated", { plan }, "bin_live"));
      await onEvent(createEvent("file.updated", previewFile, "bin_live"));
      await onEvent(
        createEvent(
          "artifact.delta",
          {
            artifactState: createArtifactState({
              coverage: 78,
              runnable: false,
              latestFile: "src/index.ts",
            }),
          },
          "bin_live"
        )
      );
      await onEvent(createEvent("log.chunk", { stream: "stdout", chunk: "npm install" }, "bin_live"));
      await onEvent(
        createEvent(
          "reliability.delta",
          { kind: "prebuild", report: createReliabilityReport({ status: "warn", score: 88 }) },
          "bin_live"
        )
      );
      await onEvent(createEvent("build.completed", { build: completedBuild }, "bin_live"));
    });

    await provider.generateBinaryBuild("starter bundle");

    expect(requestBinaryBuildStream).toHaveBeenCalledTimes(1);
    expect(requestBinaryBuild).not.toHaveBeenCalled();
    expect(provider.state.binary.activeBuild?.id).toBe("bin_live");
    expect(provider.state.binary.activeBuild?.status).toBe("completed");
    expect(provider.state.binary.phase).toBe("completed");
    expect(provider.state.binary.progress).toBe(100);
    expect(provider.state.binary.previewFiles[0]?.path).toBe("src/index.ts");
    expect(provider.state.binary.recentLogs).toContain("npm run build");
    expect(provider.state.binary.reliability?.score).toBe(98);
    expect(provider.state.binary.artifactState?.runnable).toBe(true);
    expect(provider.state.binary.artifactState?.entryPoints).toContain("dist/index.js");
    expect(provider.state.binary.canCancel).toBe(false);
    expect(provider.state.messages.filter((message: any) => message.role === "assistant")).toHaveLength(1);
    expect(provider.state.messages.at(-1)?.content).toContain("Portable starter bundle ready.");
    expect(provider.state.messages.at(-1)?.presentation).toBe("live_binary");
  });

  it("falls back to polling when streaming is unavailable", async () => {
    vi.useFakeTimers();
    configurationValues["xpersona.binary"].runtime = "playgroundApi";
    const { provider } = createProvider();

    requestBinaryBuildStream.mockRejectedValueOnce(new Error("HTTP 503: streaming disabled"));
    requestBinaryBuild.mockResolvedValue(
      createBuild({
        id: "bin_fallback",
        status: "queued",
        phase: "queued",
        progress: 0,
      })
    );
    requestBinaryStatus.mockResolvedValueOnce(
      createBuild({
        id: "bin_fallback",
        status: "completed",
        phase: "completed",
        progress: 100,
        cancelable: false,
        manifest: createManifest("bin_fallback"),
        reliability: createReliabilityReport({ score: 97 }),
        artifact: createArtifact("bin_fallback"),
      })
    );

    const run = provider.generateBinaryBuild("starter bundle");
    await vi.advanceTimersByTimeAsync(1_100);
    await run;

    expect(requestBinaryBuildStream).toHaveBeenCalledTimes(1);
    expect(requestBinaryBuild).toHaveBeenCalledTimes(1);
    expect(requestBinaryStatus).toHaveBeenCalledTimes(1);
    expect(provider.state.binary.activeBuild?.status).toBe("completed");
    expect(provider.state.activity).toContain("Streaming unavailable, falling back to polling.");
    expect(provider.state.messages.some((message: any) => /Binary generation failed/i.test(message.content))).toBe(false);
  });

  it("resumes an active streamed build from a persisted cursor", async () => {
    configurationValues["xpersona.binary"].runtime = "playgroundApi";
    const { provider, context } = createProvider();
    await context.workspaceState.update("xpersona.binary.activeBuildId", "bin_resume");
    await context.workspaceState.update("xpersona.binary.streamCursorByBuild", { bin_resume: "evt_saved" });

    requestBinaryStatus.mockResolvedValue(
      createBuild({
        id: "bin_resume",
        status: "running",
        phase: "compiling",
        progress: 65,
        cancelable: true,
        logs: ["existing log"],
        preview: {
          plan: createPlanPreview(),
          files: [],
          recentLogs: ["existing log"],
        },
      })
    );
    requestBinaryStreamEvents.mockImplementation(
      async ({
        buildId,
        cursor,
        onEvent,
      }: {
        buildId: string;
        cursor?: string | null;
        onEvent: (event: BinaryBuildEvent) => Promise<void>;
      }) => {
        expect(buildId).toBe("bin_resume");
        expect(cursor).toBe("evt_saved");

        await onEvent(createEvent("log.chunk", { stream: "stdout", chunk: "build resumed" }, "bin_resume", "evt_next"));
        await onEvent(
          createEvent(
            "build.completed",
            {
              build: createBuild({
                id: "bin_resume",
                status: "completed",
                phase: "completed",
                progress: 100,
                cancelable: false,
                logs: ["existing log", "build resumed"],
                preview: {
                  plan: createPlanPreview(),
                  files: [],
                  recentLogs: ["existing log", "build resumed"],
                },
                manifest: createManifest("bin_resume"),
                reliability: createReliabilityReport({ score: 96 }),
                artifact: createArtifact("bin_resume"),
              }),
            },
            "bin_resume",
            "evt_done"
          )
        );
      }
    );

    await provider.refreshConfiguration();
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(requestBinaryStatus).toHaveBeenCalledTimes(1);
    expect(requestBinaryStreamEvents).toHaveBeenCalledTimes(1);
    expect(provider.state.binary.activeBuild?.status).toBe("completed");

    expect(provider.state.binary.lastEventId).toBe("evt_done");
    expect(provider.state.binary.recentLogs).toContain("build resumed");
  });

  it("cancels a running build and blocks validate/publish until completion", async () => {
    configurationValues["xpersona.binary"].runtime = "playgroundApi";
    const { provider } = createProvider();
    provider.state.binary.activeBuild = createBuild({
      id: "bin_cancel",
      status: "running",
      phase: "compiling",
      progress: 72,
      cancelable: true,
    });
    provider.state.binary.canCancel = true;

    requestBinaryCancel.mockResolvedValue(
      createBuild({
        id: "bin_cancel",
        status: "canceled",
        phase: "canceled",
        progress: 100,
        cancelable: false,
        errorMessage: "Canceled by user.",
      })
    );

    await provider.cancelBinaryBuild();
    await provider.validateBinaryBuild();
    await provider.publishBinaryBuild();

    expect(requestBinaryCancel).toHaveBeenCalledTimes(1);
    expect(provider.state.binary.activeBuild?.status).toBe("canceled");
    expect(provider.state.binary.canCancel).toBe(false);
    expect(requestBinaryValidate).not.toHaveBeenCalled();
    expect(requestBinaryPublish).not.toHaveBeenCalled();
    expect(provider.state.messages.some((message: any) => /Only completed portable starter bundles can be validated/i.test(message.content))).toBe(true);
    expect(provider.state.messages.some((message: any) => /Only completed portable starter bundles can be published/i.test(message.content))).toBe(true);
  });

  it("tracks graph, execution, checkpoint, snapshot, and runtime stream events in binary state", async () => {
    configurationValues["xpersona.binary"].runtime = "playgroundApi";
    const { provider } = createProvider();
    provider.state.binary.activeBuild = createBuild({
      id: "bin_stream",
      status: "running",
      phase: "materializing",
      progress: 42,
      cancelable: true,
    });

    await provider.handleBinaryBuildEvent(
      createEvent("token.delta", {
        text: "export const health = () => ({ ok: true });",
        cursor: 13,
        updatedAt: new Date().toISOString(),
        source: "compat",
      }, "bin_stream")
    );
    await provider.handleBinaryBuildEvent(
      createEvent(
        "reliability.stream",
        {
          reliability: createLiveReliabilityState({ score: 93, trend: "steady" }),
        },
        "bin_stream"
      )
    );
    await provider.handleBinaryBuildEvent(
      createEvent("generation.delta", {
        delta: {
          path: "src/index.ts",
          language: "typescript",
          content: "export const health = () => ({ ok: true });",
          completed: false,
          order: 1,
          operation: "upsert",
        },
      }, "bin_stream")
    );
    await provider.handleBinaryBuildEvent(
      createEvent("graph.updated", { sourceGraph: createSourceGraph() }, "bin_stream")
    );
    await provider.handleBinaryBuildEvent(
      createEvent("ast.delta", {
        delta: {
          changeId: "chg_1",
          coverage: 82,
          source: "compat",
          nodes: createAstState().nodes,
          modulesTouched: ["src/index.ts"],
          updatedAt: new Date().toISOString(),
        },
      }, "bin_stream")
    );
    await provider.handleBinaryBuildEvent(
      createEvent("ast.state", { astState: createAstState({ coverage: 84 }) }, "bin_stream")
    );
    await provider.handleBinaryBuildEvent(
      createEvent("execution.updated", { execution: createExecutionState() }, "bin_stream")
    );
    await provider.handleBinaryBuildEvent(
      createEvent("runtime.state", { runtime: createRuntimeState() }, "bin_stream")
    );
    await provider.handleBinaryBuildEvent(
      createEvent(
        "patch.applied",
        {
          patch: {
            id: "patch_1",
            modulePath: "src/index.ts",
            symbolNames: ["health"],
            engine: "quickjs",
            status: "applied",
            appliedAt: new Date().toISOString(),
          },
          runtime: createRuntimeState({
            patches: [
              {
                id: "patch_1",
                modulePath: "src/index.ts",
                symbolNames: ["health"],
                engine: "quickjs",
                status: "applied",
                appliedAt: new Date().toISOString(),
              },
            ],
          }),
        },
        "bin_stream"
      )
    );
    await provider.handleBinaryBuildEvent(
      createEvent(
        "checkpoint.saved",
        {
          checkpoint: {
            id: "chk_123",
            buildId: "bin_stream",
            phase: "materializing",
            savedAt: new Date().toISOString(),
            label: "Graph synced",
            preview: {
              plan: createPlanPreview(),
              files: [createPreviewFile()],
              recentLogs: ["checkpoint saved"],
            },
            manifest: null,
            reliability: null,
            liveReliability: createLiveReliabilityState({ score: 93, trend: "steady" }),
            artifactState: createArtifactState(),
            sourceGraph: createSourceGraph(),
            astState: createAstState({ coverage: 84 }),
            execution: createExecutionState(),
            runtimeState: createRuntimeState(),
            snapshot: createSnapshotSummary(),
            artifact: null,
          },
        },
        "bin_stream"
      )
    );
    await provider.handleBinaryBuildEvent(
      createEvent("snapshot.saved", { snapshot: createSnapshotSummary({ id: "snap_456" }) }, "bin_stream")
    );
    await provider.handleBinaryBuildEvent(
      createEvent(
        "interrupt.accepted",
        {
          action: "refine",
          message: "Queued refinement for the active build.",
          pendingRefinement: {
            intent: "Add retry logic",
            requestedAt: new Date().toISOString(),
          },
        },
        "bin_stream"
      )
    );

    expect(provider.state.binary.previewFiles[0]?.path).toBe("src/index.ts");
    expect(provider.state.binary.sourceGraph?.coverage).toBe(67);
    expect(provider.state.binary.execution?.availableFunctions[0]?.name).toBe("health");
    expect(provider.state.binary.liveReliability?.score).toBe(93);
    expect(provider.state.binary.astState?.coverage).toBe(84);
    expect(provider.state.binary.runtimeState?.engine).toBe("quickjs");
    expect(provider.state.binary.checkpoints[0]?.id).toBe("chk_123");
    expect(provider.state.binary.snapshots[0]?.id).toBe("snap_456");
    expect(provider.state.binary.pendingRefinement?.intent).toBe("Add retry logic");
  });

  it("dispatches refine, branch, rewind, and execute actions through the binary client", async () => {
    configurationValues["xpersona.binary"].runtime = "playgroundApi";
    const { provider } = createProvider();

    provider.state.binary.activeBuild = createBuild({
      id: "bin_actions",
      status: "running",
      phase: "materializing",
      progress: 38,
      cancelable: true,
      checkpointId: "chk_123",
      checkpoints: [createCheckpointSummary()],
      execution: createExecutionState(),
    });
    provider.state.binary.checkpoints = [createCheckpointSummary()];
    provider.state.binary.execution = createExecutionState();

    requestBinaryRefine.mockResolvedValue(
      createBuild({
        id: "bin_actions",
        status: "running",
        phase: "materializing",
        progress: 44,
        pendingRefinement: {
          intent: "Add retry logic",
          requestedAt: new Date().toISOString(),
        },
      })
    );

    await provider.refineBinaryBuild("Add retry logic");

    requestBinaryBranch.mockResolvedValue(
      createBuild({
        id: "bin_branch",
        status: "completed",
        phase: "completed",
        progress: 100,
        cancelable: false,
        parentBuildId: "bin_actions",
        checkpointId: "chk_123",
        checkpoints: [createCheckpointSummary()],
      })
    );

    await provider.branchBinaryBuild("Try a branch", "chk_123");

    provider.state.binary.activeBuild = createBuild({
      id: "bin_branch",
      status: "completed",
      phase: "completed",
      progress: 100,
      cancelable: false,
      checkpointId: "chk_123",
      checkpoints: [createCheckpointSummary()],
      execution: createExecutionState(),
    });

    requestBinaryRewind.mockResolvedValue(
      createBuild({
        id: "bin_branch",
        status: "completed",
        phase: "completed",
        progress: 100,
        checkpointId: "chk_123",
        checkpoints: [createCheckpointSummary()],
      })
    );

    await provider.rewindBinaryBuild("chk_123");

    requestBinaryExecute.mockResolvedValue(
      createBuild({
        id: "bin_branch",
        status: "completed",
        phase: "completed",
        progress: 100,
        execution: createExecutionState({
          lastRun: {
            id: "exec_123",
            entryPoint: "health",
            args: [],
            status: "completed",
            outputJson: { ok: true },
            logs: ["health ok"],
            startedAt: new Date().toISOString(),
            completedAt: new Date().toISOString(),
          },
        }),
      })
    );

    await provider.executeBinaryBuild("health");

    expect(requestBinaryRefine).toHaveBeenCalledWith({
      auth: { apiKey: "test-key" },
      buildId: "bin_actions",
      intent: "Add retry logic",
    });
    expect(requestBinaryBranch).toHaveBeenCalledWith({
      auth: { apiKey: "test-key" },
      buildId: "bin_actions",
      checkpointId: "chk_123",
      intent: "Try a branch",
    });
    expect(requestBinaryRewind).toHaveBeenCalledWith({
      auth: { apiKey: "test-key" },
      buildId: "bin_branch",
      checkpointId: "chk_123",
    });
    expect(requestBinaryExecute).toHaveBeenCalledWith({
      auth: { apiKey: "test-key" },
      buildId: "bin_branch",
      entryPoint: "health",
    });
    expect(provider.state.binary.activeBuild?.execution?.lastRun?.entryPoint).toBe("health");
  });

  it("opens the Binary IDE settings surface from configure", async () => {
    const { provider } = createProvider();
    showQuickPick.mockResolvedValueOnce({
      label: "Open Binary IDE settings",
      detail: "Open the VS Code settings UI filtered to xpersona.binary.",
      action: "settings",
    });

    await provider.openBinaryConfiguration();

    expect(executeCommand).toHaveBeenCalledWith("workbench.action.openSettings", "xpersona.binary");
    expect(provider.state.messages.at(-1)?.content).toBe("Opened Binary IDE settings.");
  });

  it("skips expensive preview work for a blank fresh draft", async () => {
    const { provider, contextCollector } = createProvider();

    await provider.refreshDraftContext("");

    expect(contextCollector.preview).not.toHaveBeenCalled();
    expect(provider.state.runtimePhase).toBe("idle");
    expect(provider.state.intent).toBe("ask");
    expect(provider.state.contextSummary).toEqual({
      likelyTargets: [],
      candidateTargets: [],
      attachedFiles: [],
      memoryTargets: [],
    });
  });

  it("does not inject workspace memory hints into fresh-chat context collection", async () => {
    const { provider, qwenHistoryService, contextCollector } = createProvider();
    qwenHistoryService.getWorkspaceHints.mockResolvedValueOnce({
      recentTargets: ["src/from-history.ts"],
      recentIntents: ["change"],
    });

    await provider.runQwenPrompt({
      text: "please update the active file",
      appendUser: true,
      searchDepth: "fast",
    });

    expect(contextCollector.preview).toHaveBeenCalled();
    expect(contextCollector.collect).toHaveBeenCalled();
    const previewOptions = contextCollector.preview.mock.calls[0]?.[1];
    const collectOptions = contextCollector.collect.mock.calls[0]?.[1];
    expect(previewOptions?.memoryTargets).toEqual([]);
    expect(collectOptions?.memoryTargets).toEqual([]);
  });

  it("does not block edit prompts when the active file is already the inferred target", async () => {
    const { provider, contextCollector } = createProvider();
    activeTextEditorState.current = {
      document: {
        uri: { fsPath: "C:/repo/src/index.ts" },
        languageId: "typescript",
        getText: () => "export const value = 1;",
      },
      selection: {
        isEmpty: true,
      },
    };

    contextCollector.preview.mockResolvedValueOnce({
      activeFile: "src/index.ts",
      openFiles: ["src/index.ts"],
      candidateFiles: ["src/index.ts", "src/other.ts"],
      attachedFiles: ["src/index.ts"],
      memoryFiles: [],
      resolvedFiles: ["src/index.ts"],
      selectedFiles: [],
      diagnostics: [],
      intent: "change",
      confidence: "low",
      confidenceScore: 0.4,
      rationale: "active file fallback",
      snippets: [],
    });
    contextCollector.collect.mockResolvedValueOnce({
      context: {
        activeFile: { path: "src/index.ts", language: "typescript" },
        openFiles: [],
      },
      retrievalHints: {
        mentionedPaths: [],
        candidateSymbols: [],
        candidateErrors: [],
      },
      preview: {
        activeFile: "src/index.ts",
        openFiles: ["src/index.ts"],
        candidateFiles: ["src/index.ts", "src/other.ts"],
        attachedFiles: ["src/index.ts"],
        memoryFiles: [],
        resolvedFiles: ["src/index.ts"],
        selectedFiles: ["src/index.ts"],
        diagnostics: [],
        intent: "change",
        confidence: "medium",
        confidenceScore: 0.68,
        rationale: "active file inferred",
        snippets: [],
      },
    });

    await provider.runQwenPrompt({
      text: "fix this file",
      appendUser: true,
      searchDepth: "fast",
    });

    expect(provider.state.runtimePhase).toBe("done");
    expect(provider.state.followUpActions).toEqual([]);
    expect(provider.state.messages.some((message: any) => /do not want to guess before editing/i.test(message.content))).toBe(false);
  });

  it("creates one live assistant bubble for qwen partials and resolves it in place", async () => {
    const { provider } = createProvider();
    provider.qwenCodeRuntime.runPrompt.mockImplementationOnce(
      async ({ onActivity, onPartial }: { onActivity?: (value: string) => void; onPartial?: (value: string) => void }) => {
        onActivity?.("Awaiting tool approval");
        onPartial?.("Thinking through the patch.");
        onActivity?.("Applying result");
        onPartial?.("Applied the requested change.");
        return {
          sessionId: "qwen_session",
          assistantText: "Applied the requested change.",
          permissionDenials: [],
          usedTools: ["read_file"],
          didMutate: false,
          toolEvents: [],
        };
      }
    );

    await provider.runQwenPrompt({
      text: "please fix the bug",
      appendUser: true,
      searchDepth: "fast",
    });

    const assistantMessages = provider.state.messages.filter((message: any) => message.role === "assistant");
    expect(assistantMessages).toHaveLength(1);
    expect(assistantMessages[0].content).toContain("Applied the requested change.");
    expect(assistantMessages[0].presentation).toBe("live_binary");
    expect(assistantMessages[0].live?.status).toBe("done");
    expect(provider.state.liveChat).toBeNull();
  });

  it("keeps the richer streamed body when the final qwen message is much shorter", async () => {
    const { provider } = createProvider();
    const streamedBody =
      "I found the likely issue and I am going to explain the full fix path step by step so the stream stays readable and complete.";
    provider.qwenCodeRuntime.runPrompt.mockImplementationOnce(
      async ({ onPartial }: { onPartial?: (value: string) => void }) => {
        onPartial?.(streamedBody);
        return {
          sessionId: "qwen_session",
          assistantText: "Done.",
          permissionDenials: [],
          usedTools: [],
          didMutate: false,
          toolEvents: [],
        };
      }
    );

    await provider.runQwenPrompt({
      text: "please fix the bug",
      appendUser: true,
      searchDepth: "fast",
    });

    const assistantMessages = provider.state.messages.filter((message: any) => message.role === "assistant");
    expect(assistantMessages).toHaveLength(1);
    expect(assistantMessages[0].content).toContain(streamedBody);
    expect(assistantMessages[0].content).not.toBe("Done.");
    expect(assistantMessages[0].live?.status).toBe("done");
  });

  it("keeps the streamed body when the final qwen message is only slightly shorter", async () => {
    const { provider } = createProvider();
    const streamedBody =
      "I found the likely issue and the full fix path is ready to ship today for the current workspace.";
    provider.qwenCodeRuntime.runPrompt.mockImplementationOnce(
      async ({ onPartial }: { onPartial?: (value: string) => void }) => {
        onPartial?.(streamedBody);
        return {
          sessionId: "qwen_session",
          assistantText: "I found the likely issue and the full fix path is ready to ship.",
          permissionDenials: [],
          usedTools: [],
          didMutate: false,
          toolEvents: [],
        };
      }
    );

    await provider.runQwenPrompt({
      text: "please fix the bug",
      appendUser: true,
      searchDepth: "fast",
    });

    const assistantMessages = provider.state.messages.filter((message: any) => message.role === "assistant");
    expect(assistantMessages).toHaveLength(1);
    expect(assistantMessages[0].content).toContain(streamedBody);
    expect(assistantMessages[0].content).not.toBe("I found the likely issue and the full fix path is ready to ship.");
    expect(assistantMessages[0].live?.status).toBe("done");
  });

  it("shows the live assistant shell before qwen context preview starts", async () => {
    const { provider, contextCollector } = createProvider();

    const runPromise = provider.runQwenPrompt({
      text: "please fix the bug",
      appendUser: true,
      searchDepth: "fast",
    });

    const assistantMessages = provider.state.messages.filter((message: any) => message.role === "assistant");
    expect(assistantMessages).toHaveLength(1);
    expect(assistantMessages[0].presentation).toBe("live_binary");
    expect(assistantMessages[0].live?.phase).toBe("collecting_context");
    expect(provider.state.liveChat?.latestActivity).toBe("Collecting context");
    expect(contextCollector.preview).not.toHaveBeenCalled();

    await runPromise;
  });

  it("keeps the richer streamed body when the hosted final answer is shorter", async () => {
    configurationValues["xpersona.binary"].runtime = "playgroundApi";
    const { provider } = createProvider();
    const streamedBody =
      "Hosted stream answer with the full explanation of the change, why it works, and what the next edit should be.";

    streamJsonEventsMock.mockImplementationOnce(
      async (
        _method: string,
        _url: string,
        _auth: unknown,
        _body: unknown,
        onEvent: (event: string, data: unknown) => Promise<void>
      ) => {
        await onEvent("ack", "Assist stream connected.");
        await onEvent("meta", {
          sessionId: "sess_hosted",
          decision: { mode: "auto", reason: "x", confidence: 0.9 },
          validationPlan: {
            scope: "targeted",
            checks: [],
            touchedFiles: [],
            reason: "targeted",
          },
          targetInference: { confidence: 0.8, source: "unknown" },
          contextSelection: { files: [], snippets: 0, usedCloudIndex: false },
          completionStatus: "complete",
          missingRequirements: [],
          actions: [],
          plan: null,
        });
        await onEvent("partial", streamedBody);
        await onEvent("final", "Hosted stream answer.");
      }
    );

    await provider.sendPromptWithPlaygroundApi("help me with this file");

    const assistantMessages = provider.state.messages.filter((message: any) => message.role === "assistant");
    expect(assistantMessages).toHaveLength(1);
    expect(assistantMessages[0].content).toContain(streamedBody);
    expect(assistantMessages[0].content).not.toBe("Hosted stream answer.");
    expect(assistantMessages[0].live?.status).toBe("failed");
  });

  it("treats hosted completion as failed when objective proof is missing", async () => {
    configurationValues["xpersona.binary"].runtime = "playgroundApi";
    const { provider } = createProvider();

    streamJsonEventsMock.mockImplementationOnce(
      async (
        _method: string,
        _url: string,
        _auth: unknown,
        _body: unknown,
        onEvent: (event: string, data: unknown) => Promise<void>
      ) => {
        await onEvent("ack", "Assist stream connected.");
        await onEvent("meta", {
          sessionId: "sess_hosted",
          decision: { mode: "auto", reason: "x", confidence: 0.9 },
          validationPlan: {
            scope: "targeted",
            checks: [],
            touchedFiles: [],
            reason: "targeted",
          },
          targetInference: { confidence: 0.8, source: "active_file" },
          contextSelection: { files: [], snippets: 0, usedCloudIndex: false },
          completionStatus: "complete",
          missingRequirements: ["Need a concrete mutation."],
          actions: [],
          plan: null,
          reviewState: {
            status: "blocked",
            reason: "No mutation proof was recorded.",
            recommendedAction: "Edit src/index.ts directly.",
            surface: "playground_panel",
            controlActions: ["repair"],
          },
          progressState: {
            status: "stalled",
            lastMeaningfulProgressAtStep: 1,
            lastMeaningfulProgressSummary: "Inspected the target file but never mutated it.",
            stallCount: 1,
            stallReason: "Inspected the target file but never mutated it.",
            nextDeterministicAction: "Edit src/index.ts directly.",
            pendingToolCallSignature: "read_file",
          },
          objectiveState: {
            status: "in_progress",
            goalType: "code_edit",
            targetPath: "src/index.ts",
            requiredProof: ["mutation"],
            observedProof: ["inspection"],
            missingProof: ["mutation"],
          },
        });
        await onEvent("final", "I inspected the file, but I did not make a change.");
      }
    );

    await provider.sendPromptWithPlaygroundApi("please create a trailing stop loss in this file");

    expect(provider.state.runtimePhase).toBe("failed");
    expect(provider.state.liveChat).toBeNull();
    const assistantMessages = provider.state.messages.filter((message: any) => message.role === "assistant");
    expect(assistantMessages).toHaveLength(1);
    expect(assistantMessages[0].live?.status).toBe("failed");
    expect(assistantMessages[0].content).toContain("The run stopped before proving the objective was complete.");
    expect(assistantMessages[0].content).toContain("Missing requirements: Need a concrete mutation.");
    expect(assistantMessages[0].content).toContain("Stall reason: Inspected the target file but never mutated it.");
    expect(assistantMessages[0].content).toContain("Next deterministic action: Edit src/index.ts directly.");
    expect(assistantMessages[0].content).toContain("Receipt status:");
  });

  it("waits for bootstrap before handling the first send prompt", async () => {
    const { provider } = createProvider();
    provider.didBootstrap = false;

    const events: string[] = [];
    provider.bootstrap = vi.fn(async () => {
      events.push("bootstrap");
      provider.didBootstrap = true;
    });
    provider.sendPrompt = vi.fn(async () => {
      events.push("sendPrompt");
    });

    await provider.handleMessage({
      type: "sendPrompt",
      text: "hello world",
    });

    expect(provider.bootstrap).toHaveBeenCalledTimes(1);
    expect(provider.sendPrompt).toHaveBeenCalledWith("hello world", "");
    expect(events).toEqual(["bootstrap", "sendPrompt"]);
  });

  it("switches to plan mode from the composer confirmation message", async () => {
    const { provider } = createProvider();
    provider.didBootstrap = true;
    provider.state.mode = "auto";
    provider.draftText = "/plan";

    await provider.handleMessage({
      type: "confirmPlanMode",
    });

    expect(provider.state.mode).toBe("plan");
    expect(provider.state.messages.at(-1)?.content).toBe("Mode set to Plan.");
    expect(provider.draftText).toBe("");
  });

  it("defaults to auto mode on startup even if a prior plan mode was persisted", () => {
    const { provider } = createProvider({ persistedMode: "plan" });
    expect(provider.state.mode).toBe("auto");
  });

  it("toggles into plan mode from the composer shortcut", async () => {
    const { provider } = createProvider();
    provider.didBootstrap = true;
    provider.state.mode = "auto";

    await provider.handleMessage({
      type: "togglePlanMode",
    });

    expect(provider.state.mode).toBe("plan");
    expect(provider.state.messages.at(-1)?.content).toBe("Mode set to Plan.");
  });

  it("toggles back to auto mode from the composer shortcut", async () => {
    const { provider } = createProvider();
    provider.didBootstrap = true;
    provider.state.mode = "plan";

    await provider.handleMessage({
      type: "togglePlanMode",
    });

    expect(provider.state.mode).toBe("auto");
    expect(provider.state.messages.at(-1)?.content).toBe("Mode set to Auto.");
  });

  it("retries once with tool-first instructions when Qwen falls into clarification-loop text", async () => {
    const { provider } = createProvider();
    provider.qwenCodeRuntime.runPrompt
      .mockResolvedValueOnce({
        sessionId: "qwen_session",
        assistantText: [
          "Are you looking to:",
          "1. Read and examine the file contents?",
          "2. Help modify or debug something related to it?",
          "3. Something else entirely?",
        ].join("\n"),
        permissionDenials: [],
        usedTools: ["read_file"],
        didMutate: false,
        toolEvents: [],
      })
      .mockResolvedValueOnce({
        sessionId: "qwen_session",
        assistantText: "I updated the trailing stop loss logic in the active file.",
        permissionDenials: [],
        usedTools: ["read_file", "edit"],
        didMutate: true,
        toolEvents: [],
      });

    await provider.runQwenPrompt({
      text: "create a trailing stop loss in this file",
      appendUser: true,
      searchDepth: "fast",
    });

    expect(provider.qwenCodeRuntime.runPrompt).toHaveBeenCalledTimes(2);
    expect(provider.state.messages.at(-1)?.content).toContain("trailing stop loss");
    expect(provider.state.activity.some((line: string) => /tool-first/i.test(line))).toBe(true);
  });

  it("retries when Qwen output is runtime chatter even if a read tool ran", async () => {
    const { provider } = createProvider();
    provider.qwenCodeRuntime.runPrompt
      .mockResolvedValueOnce({
        sessionId: "qwen_session",
        assistantText: "I can see you've provided a file path to a Node.js CLI script from the Qwen SDK.",
        permissionDenials: [],
        usedTools: ["read_file"],
        didMutate: false,
        toolEvents: [],
      })
      .mockResolvedValueOnce({
        sessionId: "qwen_session",
        assistantText: "I updated src/index.ts with the requested trailing stop logic.",
        permissionDenials: [],
        usedTools: ["read_file", "edit"],
        didMutate: true,
        toolEvents: [],
      });

    await provider.runQwenPrompt({
      text: "please create a trailing stop loss in this file",
      appendUser: true,
      searchDepth: "fast",
    });

    expect(provider.qwenCodeRuntime.runPrompt).toHaveBeenCalledTimes(2);
    expect(provider.state.messages.at(-1)?.content).toContain("trailing stop");
    expect(provider.state.activity.some((line: string) => /tool-first/i.test(line))).toBe(true);
  });

  it("marks a trusted-target Qwen run as stalled when it only inspects and never mutates", async () => {
    const { provider } = createProvider();
    provider.qwenCodeRuntime.runPrompt
      .mockResolvedValueOnce({
        sessionId: "qwen_session",
        assistantText: "I inspected the file and I will think about the change.",
        permissionDenials: [],
        usedTools: ["read_file"],
        didMutate: false,
        toolEvents: [],
      })
      .mockResolvedValueOnce({
        sessionId: "qwen_session",
        assistantText: "I inspected the file again and still did not edit it.",
        permissionDenials: [],
        usedTools: ["read_file"],
        didMutate: false,
        toolEvents: [],
      })
      .mockResolvedValueOnce({
        sessionId: "qwen_session",
        assistantText: "I inspected the file a third time and still did not edit it.",
        permissionDenials: [],
        usedTools: ["read_file"],
        didMutate: false,
        toolEvents: [],
      });

    await provider.runQwenPrompt({
      text: "please create a trailing stop loss in this file",
      appendUser: true,
      searchDepth: "fast",
    });

    expect(provider.qwenCodeRuntime.runPrompt).toHaveBeenCalledTimes(3);
    expect(provider.state.runtimePhase).toBe("failed");
    expect(provider.state.messages.at(-1)?.live?.status).toBe("failed");
    expect(provider.state.messages.at(-1)?.content).toContain(
      "The local Qwen run stalled before proving the change request was complete."
    );
    expect(provider.state.messages.at(-1)?.content).toContain("Mutation proof: missing");
    expect(provider.state.messages.at(-1)?.content).toContain("Next deterministic action:");
    expect(provider.state.activity.some((line: string) => /real tool execution/i.test(line))).toBe(true);
  });

  it("copies a debug report that includes latest Qwen tool usage", async () => {
    const { provider } = createProvider();
    provider.qwenCodeRuntime.runPrompt.mockResolvedValueOnce({
      sessionId: "qwen_session",
      assistantText: "Applied update.",
      permissionDenials: [],
      usedTools: ["read_file", "edit"],
      didMutate: true,
      toolEvents: [
        {
          phase: "requested",
          toolName: "read_file",
          summary: "read_file: src/index.ts",
          timestamp: "2026-03-16T12:00:00.000Z",
        },
        {
          phase: "executed",
          toolName: "edit",
          summary: "edit: src/index.ts",
          timestamp: "2026-03-16T12:00:01.000Z",
        },
      ],
    });

    await provider.runQwenPrompt({
      text: "please fix this file",
      appendUser: true,
      searchDepth: "fast",
    });

    provider.didBootstrap = true;
    await provider.handleMessage({ type: "copyDebugReport" });

    expect(writeClipboardText).toHaveBeenCalledTimes(1);
    const payload = String(writeClipboardText.mock.calls[0]?.[0] || "");
    expect(payload).toContain("Binary IDE Debug Report");
    expect(payload).toContain("please fix this file");
    expect(payload).toContain("usedTools=read_file, edit");
    expect(payload).toContain("Attempt 1 tool timeline:");
    expect(payload).toContain("requested | read_file: src/index.ts");
    expect(showInformationMessage).toHaveBeenCalledWith("Copied Binary IDE debug report to clipboard.");
  });

  it("cancels an active streamed prompt", async () => {
    const { provider } = createProvider();
    provider.qwenCodeRuntime.runPrompt.mockImplementationOnce(
      async ({ abortController }: { abortController?: AbortController }) =>
        await new Promise((_resolve, reject) => {
          abortController?.signal.addEventListener(
            "abort",
            () => {
              const error = new Error("Request aborted");
              (error as Error & { name: string }).name = "AbortError";
              reject(error);
            },
            { once: true }
          );
        })
    );

    const run = provider.runQwenPrompt({
      text: "please keep streaming",
      appendUser: true,
      searchDepth: "fast",
    });

    await new Promise((resolve) => setTimeout(resolve, 0));
    provider.cancelActivePrompt();
    await run;

    expect(provider.state.busy).toBe(false);
    expect(provider.state.runtimePhase).toBe("canceled");
    expect(provider.state.messages.at(-1)?.content).toContain("Canceled current response");
  });

});

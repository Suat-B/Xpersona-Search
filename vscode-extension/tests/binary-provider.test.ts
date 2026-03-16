import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  executeCommand,
  showQuickPick,
  showInformationMessage,
  showInputBox,
  activeTextEditorState,
  configurationValues,
  requestBinaryBuild,
  requestBinaryStatus,
  requestBinaryValidate,
  requestBinaryPublish,
} = vi.hoisted(() => ({
  executeCommand: vi.fn(async () => undefined),
  showQuickPick: vi.fn(async () => undefined),
  showInformationMessage: vi.fn(),
  showInputBox: vi.fn(async () => ""),
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
  requestBinaryStatus: vi.fn(),
  requestBinaryValidate: vi.fn(),
  requestBinaryPublish: vi.fn(),
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
  commands: {
    executeCommand,
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
  createBinaryBuild: requestBinaryBuild,
  getBinaryBuild: requestBinaryStatus,
  validateBinaryBuild: requestBinaryValidate,
  publishBinaryBuild: requestBinaryPublish,
}));

import { PlaygroundViewProvider } from "../src/webview-provider";

function createMemento() {
  const values = new Map<string, unknown>();
  return {
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

function createProvider() {
  const auth = {
    onDidChange: vi.fn(() => ({ dispose() {} })),
    getRequestAuth: vi.fn(async () => ({ apiKey: "test-key" })),
    setApiKeyInteractive: vi.fn(async () => undefined),
    signInWithBrowser: vi.fn(async () => undefined),
    signOut: vi.fn(async () => undefined),
    getApiKey: vi.fn(async () => "test-key"),
    getAuthState: vi.fn(async () => ({ kind: "apiKey", label: "Using stored API key" })),
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
    createContext() as any,
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
      })),
    } as any,
    contextCollector as any,
    actionRunner as any,
    toolExecutor as any,
    indexManager as any
  );

  return {
    provider: provider as any,
    auth,
    historyService,
    qwenHistoryService,
    contextCollector,
  };
}

describe("binary provider", () => {
  beforeEach(() => {
    vi.useRealTimers();
    executeCommand.mockClear();
    showQuickPick.mockReset();
    showInformationMessage.mockReset();
    showInputBox.mockReset();
    requestBinaryBuild.mockReset();
    requestBinaryStatus.mockReset();
    requestBinaryValidate.mockReset();
    requestBinaryPublish.mockReset();
    configurationValues["xpersona.binary"].runtime = "qwenCode";
    activeTextEditorState.current = undefined;
  });

  it("polls queued starter bundles until they complete", async () => {
    vi.useFakeTimers();
    const { provider } = createProvider();

    requestBinaryBuild.mockResolvedValue({
      id: "bin_queued",
      status: "queued",
      intent: "starter bundle",
      targetEnvironment: { runtime: "node18", platform: "portable", packageManager: "npm" },
      logs: [],
    });
    requestBinaryStatus
      .mockResolvedValueOnce({
        id: "bin_queued",
        status: "running",
        intent: "starter bundle",
        targetEnvironment: { runtime: "node18", platform: "portable", packageManager: "npm" },
        logs: ["Starting build"],
      })
      .mockResolvedValueOnce({
        id: "bin_queued",
        status: "completed",
        intent: "starter bundle",
        targetEnvironment: { runtime: "node18", platform: "portable", packageManager: "npm" },
        logs: ["Done"],
        artifact: { fileName: "bin_queued.zip", relativePath: "artifacts/bin_queued.zip", sizeBytes: 1024, sha256: "abc" },
        manifest: {
          buildId: "bin_queued",
          artifactKind: "package_bundle",
          name: "binary-starter",
          displayName: "Binary Starter",
          description: "Starter bundle",
          intent: "starter bundle",
          runtime: "node18",
          platform: "portable",
          packageManager: "npm",
          entrypoint: "dist/index.js",
          installCommand: "npm install",
          buildCommand: "npm run build",
          startCommand: "npm start",
          sourceFiles: ["src/index.ts"],
          outputFiles: ["dist/index.js"],
          warnings: [],
          createdAt: new Date().toISOString(),
        },
        reliability: {
          status: "pass",
          score: 98,
          summary: "Bundle looks good.",
          targetEnvironment: { runtime: "node18", platform: "portable", packageManager: "npm" },
          issues: [],
          warnings: [],
          generatedAt: new Date().toISOString(),
        },
      });

    const run = provider.generateBinaryBuild("starter bundle");
    await vi.advanceTimersByTimeAsync(1_000);
    await vi.advanceTimersByTimeAsync(1_250);
    await run;

    expect(requestBinaryStatus).toHaveBeenCalledTimes(2);
    expect(provider.state.binary.activeBuild.status).toBe("completed");
    expect(provider.state.binary.busy).toBe(false);
    expect(provider.state.messages.at(-1)?.content).toContain("Portable starter bundle ready.");
  });

  it("retries transient bundle status failures before surfacing an error", async () => {
    vi.useFakeTimers();
    const { provider } = createProvider();

    requestBinaryBuild.mockResolvedValue({
      id: "bin_retry",
      status: "queued",
      intent: "starter bundle",
      targetEnvironment: { runtime: "node18", platform: "portable", packageManager: "npm" },
      logs: [],
    });
    requestBinaryStatus
      .mockRejectedValueOnce(new Error("HTTP 500: Internal Server Error"))
      .mockResolvedValueOnce({
        id: "bin_retry",
        status: "completed",
        intent: "starter bundle",
        targetEnvironment: { runtime: "node18", platform: "portable", packageManager: "npm" },
        logs: ["Done"],
        artifact: { fileName: "bin_retry.zip", relativePath: "artifacts/bin_retry.zip", sizeBytes: 1024, sha256: "abc" },
        manifest: {
          buildId: "bin_retry",
          artifactKind: "package_bundle",
          name: "binary-starter",
          displayName: "Binary Starter",
          description: "Starter bundle",
          intent: "starter bundle",
          runtime: "node18",
          platform: "portable",
          packageManager: "npm",
          entrypoint: "dist/index.js",
          installCommand: "npm install",
          buildCommand: "npm run build",
          startCommand: "npm start",
          sourceFiles: ["src/index.ts"],
          outputFiles: ["dist/index.js"],
          warnings: [],
          createdAt: new Date().toISOString(),
        },
        reliability: {
          status: "pass",
          score: 98,
          summary: "Bundle looks good.",
          targetEnvironment: { runtime: "node18", platform: "portable", packageManager: "npm" },
          issues: [],
          warnings: [],
          generatedAt: new Date().toISOString(),
        },
      });

    const run = provider.generateBinaryBuild("starter bundle");
    await vi.advanceTimersByTimeAsync(1_000);
    await vi.advanceTimersByTimeAsync(500);
    await vi.advanceTimersByTimeAsync(1_250);
    await run;

    expect(requestBinaryStatus).toHaveBeenCalledTimes(2);
    expect(provider.state.binary.activeBuild.status).toBe("completed");
    expect(provider.state.messages.at(-1)?.content).toContain("Portable starter bundle ready.");
    expect(provider.state.messages.some((message: any) => /Binary generation failed/i.test(message.content))).toBe(false);
  });

  it("blocks validation while a starter bundle is still queued", async () => {
    const { provider } = createProvider();
    provider.state.binary.activeBuild = {
      id: "bin_queued",
      status: "queued",
      intent: "starter bundle",
      targetEnvironment: { runtime: "node18", platform: "portable", packageManager: "npm" },
      logs: [],
    };

    await provider.validateBinaryBuild();

    expect(requestBinaryValidate).not.toHaveBeenCalled();
    expect(provider.state.messages.at(-1)?.content).toContain("Wait for the current portable starter bundle build to finish");
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
    expect(provider.state.followUpActions.some((action: any) => action.id === "show-diff")).toBe(true);
    expect(provider.state.messages.some((message: any) => /do not want to guess before editing/i.test(message.content))).toBe(false);
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
    expect(provider.sendPrompt).toHaveBeenCalledWith("hello world");
    expect(events).toEqual(["bootstrap", "sendPrompt"]);
  });
});

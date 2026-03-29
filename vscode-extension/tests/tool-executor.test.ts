import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  showWarningMessage,
  requestJsonMock,
  requestBinaryBuild,
  requestBinaryPublish,
  requestBinaryRefine,
  requestBinaryCancel,
  requestBinaryBranch,
  requestBinaryRewind,
  requestBinaryValidate,
  requestBinaryExecute,
} = vi.hoisted(() => ({
  showWarningMessage: vi.fn(async () => undefined),
  requestJsonMock: vi.fn(),
  requestBinaryBuild: vi.fn(),
  requestBinaryPublish: vi.fn(),
  requestBinaryRefine: vi.fn(),
  requestBinaryCancel: vi.fn(),
  requestBinaryBranch: vi.fn(),
  requestBinaryRewind: vi.fn(),
  requestBinaryValidate: vi.fn(),
  requestBinaryExecute: vi.fn(),
}));

vi.mock("vscode", () => ({
  window: {
    showWarningMessage,
  },
  workspace: {
    findFiles: vi.fn(async () => []),
  },
  languages: {
    getDiagnostics: vi.fn(() => []),
  },
}));

vi.mock("../src/binary-client", () => ({
  branchBinaryBuild: requestBinaryBranch,
  cancelBinaryBuild: requestBinaryCancel,
  createBinaryBuild: requestBinaryBuild,
  executeBinaryBuild: requestBinaryExecute,
  publishBinaryBuild: requestBinaryPublish,
  refineBinaryBuild: requestBinaryRefine,
  rewindBinaryBuild: requestBinaryRewind,
  validateBinaryBuild: requestBinaryValidate,
}));

vi.mock("../src/api-client", () => ({
  requestJson: requestJsonMock,
}));

import { ToolExecutor } from "../src/tool-executor";

describe("tool executor", () => {
  let actionRunner: {
    createCheckpoint: ReturnType<typeof vi.fn>;
    apply: ReturnType<typeof vi.fn>;
  };

  beforeEach(() => {
    showWarningMessage.mockReset();
    requestJsonMock.mockReset();
    requestBinaryBuild.mockReset();
    requestBinaryPublish.mockReset();
    requestBinaryRefine.mockReset();
    requestBinaryCancel.mockReset();
    requestBinaryBranch.mockReset();
    requestBinaryRewind.mockReset();
    requestBinaryValidate.mockReset();
    requestBinaryExecute.mockReset();
    actionRunner = {
      createCheckpoint: vi.fn(() => "Checkpoint created."),
      apply: vi.fn(async () => ({
        summary: "Applied changes to 1 file.",
        details: ["Patched hello.py."],
        changedFiles: ["hello.py"],
        createdDirectories: [],
        blockedActions: [],
        commandResults: [],
        canUndo: true,
      })),
    };
  });

  it("advertises the full tool-loop tool surface", () => {
    const executor = new ToolExecutor(actionRunner as any, { query: vi.fn() } as any);
    expect(executor.getSupportedTools()).toContain("create_checkpoint");
    expect(executor.getSupportedTools()).toContain("run_command");
    expect(executor.getSupportedTools()).toContain("binary_start_build");
    expect(executor.getSupportedTools()).toContain("binary_publish_build");
  });

  it("delegates create_checkpoint to the action runner", async () => {
    const executor = new ToolExecutor(actionRunner as any, { query: vi.fn() } as any);
    const result = await executor.executeToolCall({
      pendingToolCall: {
        step: 1,
        adapter: "text_actions",
        requiresClientExecution: true,
        toolCall: {
          id: "call_checkpoint",
          name: "create_checkpoint",
          arguments: { reason: "Before edit" },
        },
        createdAt: new Date().toISOString(),
      },
      auth: {},
      workspaceFingerprint: "workspace-1",
    });

    expect(actionRunner.createCheckpoint).toHaveBeenCalledWith("Before edit");
    expect(result.ok).toBe(true);
    expect(result.summary).toContain("Checkpoint");
  });

  it("maps edit tool calls to a local apply batch", async () => {
    const executor = new ToolExecutor(actionRunner as any, { query: vi.fn() } as any);
    const result = await executor.executeToolCall({
      pendingToolCall: {
        step: 2,
        adapter: "text_actions",
        requiresClientExecution: true,
        toolCall: {
          id: "call_edit",
          name: "edit",
          arguments: {
            path: "hello.py",
            patch: "@@ -1,1 +1,1 @@\n-print('hi')\n+print('hello')",
          },
        },
        createdAt: new Date().toISOString(),
      },
      auth: { apiKey: "x" },
      sessionId: "session-1",
      workspaceFingerprint: "workspace-1",
    });

    expect(actionRunner.apply).toHaveBeenCalledWith({
      mode: "auto",
      actions: [
        {
          type: "edit",
          path: "hello.py",
          patch: "@@ -1,1 +1,1 @@\n-print('hi')\n+print('hello')",
        },
      ],
      auth: { apiKey: "x" },
      sessionId: "session-1",
      workspaceFingerprint: "workspace-1",
    });
    expect(result.ok).toBe(true);
    expect(result.summary).toContain("Applied changes");
  });

  it("marks edit tools as failed when no file change was applied", async () => {
    actionRunner.apply.mockResolvedValueOnce({
      summary: "No local changes were applied.",
      details: ["Patch failed for hello.py: hunk mismatch."],
      changedFiles: [],
      createdDirectories: [],
      blockedActions: [],
      commandResults: [],
      canUndo: false,
    });
    const executor = new ToolExecutor(actionRunner as any, { query: vi.fn() } as any);
    const result = await executor.executeToolCall({
      pendingToolCall: {
        step: 2,
        adapter: "text_actions",
        requiresClientExecution: true,
        toolCall: {
          id: "call_edit_failed",
          name: "edit",
          arguments: {
            path: "hello.py",
            patch: "@@ -1,1 +1,1 @@\n-print('hi')\n+print('hello')",
          },
        },
        createdAt: new Date().toISOString(),
      },
      auth: { apiKey: "x" },
      sessionId: "session-1",
      workspaceFingerprint: "workspace-1",
    });

    expect(result.ok).toBe(false);
    expect(result.summary).toContain("Patch failed");
    expect(result.error).toContain("Patch failed");
  });

  it("marks command tools as failed when the command exits non-zero", async () => {
    actionRunner.apply.mockResolvedValueOnce({
      summary: "Ran 1 command.",
      details: ["FAIL npm test: test suite failed"],
      changedFiles: [],
      createdDirectories: [],
      blockedActions: [],
      commandResults: [
        {
          command: "npm test",
          exitCode: 1,
          stdout: "",
          stderr: "test suite failed",
          timedOut: false,
        },
      ],
      canUndo: false,
    });
    const executor = new ToolExecutor(actionRunner as any, { query: vi.fn() } as any);
    const result = await executor.executeToolCall({
      pendingToolCall: {
        step: 3,
        adapter: "text_actions",
        requiresClientExecution: true,
        toolCall: {
          id: "call_command_failed",
          name: "run_command",
          arguments: {
            command: "npm test",
            category: "implementation",
          },
        },
        createdAt: new Date().toISOString(),
      },
      auth: { apiKey: "x" },
      workspaceFingerprint: "workspace-1",
    });

    expect(result.ok).toBe(false);
    expect(result.summary).toContain("Command failed");
    expect(result.error).toContain("Command failed");
  });

  it("runs command tools in yolo mode for full-auto execution", async () => {
    const executor = new ToolExecutor(actionRunner as any, { query: vi.fn() } as any);
    await executor.executeToolCall({
      pendingToolCall: {
        step: 3,
        adapter: "text_actions",
        requiresClientExecution: true,
        toolCall: {
          id: "call_command",
          name: "run_command",
          arguments: {
            command: "npm test",
            category: "implementation",
          },
        },
        createdAt: new Date().toISOString(),
      },
      auth: { apiKey: "x" },
      workspaceFingerprint: "workspace-1",
    });

    expect(actionRunner.apply).toHaveBeenCalledWith(
      expect.objectContaining({
        mode: "yolo",
        actions: [expect.objectContaining({ type: "command", command: "npm test" })],
      })
    );
  });

  it("starts binary builds with session and runtime context", async () => {
    requestBinaryBuild.mockResolvedValueOnce({
      id: "build-1",
      status: "queued",
      phase: "queued",
      progress: 0,
    });
    const executor = new ToolExecutor(actionRunner as any, { query: vi.fn() } as any);
    executor.setBinaryToolContextProvider(() => ({
      activeBuild: null,
      targetEnvironment: {
        runtime: "node18",
        platform: "portable",
        packageManager: "npm",
      },
    }));

    const result = await executor.executeToolCall({
      pendingToolCall: {
        step: 4,
        adapter: "text_actions",
        requiresClientExecution: true,
        toolCall: {
          id: "call_binary_start",
          name: "binary_start_build",
          arguments: {
            intent: "Create a starter bundle",
            runtime: "node20",
          },
        },
        createdAt: new Date().toISOString(),
      },
      auth: { apiKey: "x" },
      sessionId: "session-binary",
      workspaceFingerprint: "workspace-1",
    });

    expect(requestBinaryBuild).toHaveBeenCalledWith({
      auth: { apiKey: "x" },
      intent: "Create a starter bundle",
      workspaceFingerprint: "workspace-1",
      historySessionId: "session-binary",
      targetEnvironment: {
        runtime: "node20",
        platform: "portable",
        packageManager: "npm",
      },
    });
    expect(result.ok).toBe(true);
    expect(result.data).toMatchObject({ buildId: "build-1" });
  });

  it("requires confirmation before publishing a binary build", async () => {
    showWarningMessage.mockResolvedValueOnce(undefined);
    const executor = new ToolExecutor(actionRunner as any, { query: vi.fn() } as any);
    executor.setBinaryToolContextProvider(() => ({
      activeBuild: {
        id: "build-1",
        status: "completed",
        phase: "completed",
        progress: 100,
      } as any,
      targetEnvironment: {
        runtime: "node18",
        platform: "portable",
        packageManager: "npm",
      },
    }));

    const result = await executor.executeToolCall({
      pendingToolCall: {
        step: 5,
        adapter: "text_actions",
        requiresClientExecution: true,
        toolCall: {
          id: "call_binary_publish",
          name: "binary_publish_build",
          arguments: {},
        },
        createdAt: new Date().toISOString(),
      },
      auth: { apiKey: "x" },
      workspaceFingerprint: "workspace-1",
    });

    expect(showWarningMessage).toHaveBeenCalled();
    expect(requestBinaryPublish).not.toHaveBeenCalled();
    expect(result.ok).toBe(false);
    expect(result.blocked).toBe(true);
    expect(result.summary).toContain("Publish canceled");
  });
});

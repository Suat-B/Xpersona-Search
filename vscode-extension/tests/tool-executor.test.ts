import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("vscode", () => ({
  workspace: {
    findFiles: vi.fn(async () => []),
  },
  languages: {
    getDiagnostics: vi.fn(() => []),
  },
}));

import { ToolExecutor } from "../src/tool-executor";

describe("tool executor", () => {
  let actionRunner: {
    createCheckpoint: ReturnType<typeof vi.fn>;
    apply: ReturnType<typeof vi.fn>;
  };

  beforeEach(() => {
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
});

import { afterEach, describe, expect, it, vi } from "vitest";

const runs = new Map<string, any>();

vi.mock("@/lib/playground/auth", () => ({
  hasUnlimitedPlaygroundAccess: () => false,
}));

vi.mock("@/lib/hf-router/rate-limit", () => ({
  checkRateLimits: async () => ({ allowed: true, limits: { maxOutputTokens: 2048 } }),
  getUserPlan: async () => ({ plan: "builder", isActive: true }),
}));

vi.mock("@/lib/playground/store", () => ({
  createAgentRun: vi.fn(async (input: any) => {
    const row = {
      id: `run-${runs.size + 1}`,
      sessionId: input.sessionId,
      userId: input.userId,
      role: input.role,
      status: input.status,
      confidence: input.confidence ?? null,
      riskLevel: input.riskLevel ?? null,
      input: input.input,
      output: null,
      errorMessage: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    runs.set(row.id, row);
    return row;
  }),
  getAgentRunById: vi.fn(async ({ runId }: any) => runs.get(runId) ?? null),
  updateAgentRun: vi.fn(async ({ runId, status, output, errorMessage, confidence, riskLevel }: any) => {
    const existing = runs.get(runId);
    if (!existing) return null;
    const next = {
      ...existing,
      ...(status ? { status } : {}),
      ...(output !== undefined ? { output } : {}),
      ...(errorMessage !== undefined ? { errorMessage } : {}),
      ...(confidence !== undefined ? { confidence } : {}),
      ...(riskLevel !== undefined ? { riskLevel } : {}),
      updatedAt: new Date(),
    };
    runs.set(runId, next);
    return next;
  }),
  appendSessionMessage: vi.fn(async () => null),
}));

vi.mock("@/lib/playground/tool-loop-adapters", () => ({
  requestToolLoopTurn: vi.fn(),
  selectToolLoopAdapter: vi.fn(() => ({
    adapter: "text_actions",
    modelSelection: {
      requested: "playground-default",
      requestedAlias: "playground-default",
      resolvedAlias: "playground-default",
      resolvedEntry: {
        alias: "playground-default",
        displayName: "Playground",
        description: "mock",
        provider: "hf",
        model: "mock-model",
        capabilities: {
          maxContextTokens: 128000,
          supportsStreaming: true,
          supportsTextActions: true,
          supportsUnifiedDiff: true,
          supportsWriteFile: true,
          supportsMkdir: true,
          supportsShellCommands: true,
          supportsToolLoop: true,
          supportsNativeToolCalls: false,
          preferredAdapter: "text_actions",
          supportedTools: ["read_file", "create_checkpoint", "edit", "run_command"],
        },
        certification: "tool_ready",
        enabled: true,
      },
      fallbackChain: [],
    },
  })),
}));

import { requestToolLoopTurn } from "@/lib/playground/tool-loop-adapters";
import { continueAssistToolLoop, startAssistToolLoop } from "@/lib/playground/tool-loop";

const mockedRequestToolLoopTurn = vi.mocked(requestToolLoopTurn);

afterEach(() => {
  runs.clear();
  mockedRequestToolLoopTurn.mockReset();
});

describe("playground tool loop", () => {
  it("runs observation, injects a checkpoint before mutation, then completes", async () => {
    mockedRequestToolLoopTurn
      .mockResolvedValueOnce({
        adapter: "text_actions",
        final: "",
        toolCall: {
          id: "call_read",
          name: "read_file",
          arguments: { path: "hello.py" },
          kind: "observe",
          summary: "Inspect hello.py",
        },
        logs: ["adapter=text_actions"],
        modelSelection: {} as any,
      })
      .mockResolvedValueOnce({
        adapter: "text_actions",
        final: "",
        toolCall: {
          id: "call_edit",
          name: "edit",
          arguments: {
            path: "hello.py",
            patch: "@@ -1,1 +1,1 @@\n-print('hi')\n+print('hello')",
          },
          kind: "mutate",
          summary: "Patch hello.py",
        },
        logs: ["adapter=text_actions"],
        modelSelection: {} as any,
      })
      .mockResolvedValueOnce({
        adapter: "text_actions",
        final: "Updated hello.py and verified the change.",
        logs: ["adapter=text_actions"],
        modelSelection: {} as any,
      });

    const started = await startAssistToolLoop({
      userId: "user-1",
      sessionId: "session-1",
      traceId: "trace-1",
      request: {
        mode: "auto",
        task: "Update hello.py",
        orchestrationProtocol: "tool_loop_v1",
        clientCapabilities: {
          toolLoop: true,
          supportedTools: ["read_file", "create_checkpoint", "edit"],
          autoExecute: true,
        },
        context: {
          activeFile: { path: "hello.py", content: "print('hi')\n" },
        },
      },
    });

    expect(started.pendingToolCall?.toolCall.name).toBe("read_file");
    expect(started.loopState?.stepCount).toBe(1);
    expect(started.runId).toBeTruthy();

    const afterRead = await continueAssistToolLoop({
      userId: "user-1",
      traceId: "trace-2",
      runId: started.runId!,
      toolResult: {
        toolCallId: "call_read",
        name: "read_file",
        ok: true,
        summary: "Read hello.py.",
        data: { path: "hello.py", content: "print('hi')\n" },
      },
    });

    expect(afterRead.pendingToolCall?.toolCall.name).toBe("create_checkpoint");
    expect(afterRead.loopState?.stepCount).toBe(2);

    const afterCheckpoint = await continueAssistToolLoop({
      userId: "user-1",
      traceId: "trace-3",
      runId: started.runId!,
      toolResult: {
        toolCallId: afterRead.pendingToolCall!.toolCall.id,
        name: "create_checkpoint",
        ok: true,
        summary: "Checkpoint created.",
      },
    });

    expect(afterCheckpoint.pendingToolCall?.toolCall.name).toBe("edit");
    expect(afterCheckpoint.loopState?.stepCount).toBe(3);

    const completed = await continueAssistToolLoop({
      userId: "user-1",
      traceId: "trace-4",
      runId: started.runId!,
      toolResult: {
        toolCallId: afterCheckpoint.pendingToolCall!.toolCall.id,
        name: "edit",
        ok: true,
        summary: "Patched hello.py.",
        data: { changedFiles: ["hello.py"] },
      },
    });

    expect(completed.pendingToolCall).toBeNull();
    expect(completed.loopState?.status).toBe("completed");
    expect(completed.final).toContain("Updated hello.py");
    expect(completed.toolTrace?.some((entry) => entry.toolCall?.name === "create_checkpoint")).toBe(true);
  });

  it("fails after exceeding the repair limit for a blocked tool result", async () => {
    mockedRequestToolLoopTurn
      .mockResolvedValueOnce({
        adapter: "text_actions",
        final: "",
        toolCall: {
          id: "call_read",
          name: "read_file",
          arguments: { path: "hello.py" },
          kind: "observe",
          summary: "Inspect hello.py",
        },
        logs: ["adapter=text_actions"],
        modelSelection: {} as any,
      })
      .mockResolvedValueOnce({
        adapter: "text_actions",
        final: "",
        toolCall: {
          id: "call_command",
          name: "run_command",
          arguments: { command: "npm test", category: "implementation" },
          kind: "command",
          summary: "Run the implementation command",
        },
        logs: ["adapter=text_actions"],
        modelSelection: {} as any,
      })
      .mockResolvedValueOnce({
        adapter: "text_actions",
        final: "",
        toolCall: {
          id: "call_command_retry",
          name: "run_command",
          arguments: { command: "npm test", category: "implementation" },
          kind: "command",
          summary: "Retry the implementation command",
        },
        logs: ["adapter=text_actions"],
        modelSelection: {} as any,
      });

    const started = await startAssistToolLoop({
      userId: "user-2",
      sessionId: "session-2",
      traceId: "trace-5",
      request: {
        mode: "auto",
        task: "Run npm test in hello.py workspace",
        orchestrationProtocol: "tool_loop_v1",
        clientCapabilities: {
          toolLoop: true,
          supportedTools: ["read_file", "run_command"],
          autoExecute: true,
        },
        context: {
          activeFile: { path: "hello.py", content: "print('hi')\n" },
        },
      },
    });

    const afterRead = await continueAssistToolLoop({
      userId: "user-2",
      traceId: "trace-6",
      runId: started.runId!,
      toolResult: {
        toolCallId: "call_read",
        name: "read_file",
        ok: true,
        summary: "Read hello.py.",
      },
    });

    expect(afterRead.pendingToolCall?.toolCall.name).toBe("create_checkpoint");

    const afterCheckpoint = await continueAssistToolLoop({
      userId: "user-2",
      traceId: "trace-7",
      runId: started.runId!,
      toolResult: {
        toolCallId: afterRead.pendingToolCall!.toolCall.id,
        name: "create_checkpoint",
        ok: true,
        summary: "Checkpoint created.",
      },
    });

    expect(afterCheckpoint.pendingToolCall?.toolCall.name).toBe("run_command");

    const repaired = await continueAssistToolLoop({
      userId: "user-2",
      traceId: "trace-8",
      runId: started.runId!,
      toolResult: {
        toolCallId: afterCheckpoint.pendingToolCall!.toolCall.id,
        name: "run_command",
        ok: false,
        blocked: true,
        summary: "Command blocked by policy.",
      },
    });

    expect(repaired.pendingToolCall?.toolCall.name).toBe("run_command");

    const failed = await continueAssistToolLoop({
      userId: "user-2",
      traceId: "trace-9",
      runId: started.runId!,
      toolResult: {
        toolCallId: repaired.pendingToolCall!.toolCall.id,
        name: "run_command",
        ok: false,
        blocked: true,
        summary: "Command blocked again by policy.",
      },
    });

    expect(failed.loopState?.status).toBe("failed");
    expect(failed.missingRequirements).toContain("tool_result_failed");
  });
});

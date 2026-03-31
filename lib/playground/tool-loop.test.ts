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
  parseToolLoopJson: vi.fn((raw: string) => {
    try {
      const parsed = JSON.parse(String(raw || ""));
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
        const record = parsed as Record<string, any>;
        if (record.toolCall && typeof record.toolCall === "object") {
          return {
            final: typeof record.final === "string" ? record.final : "",
            toolCall: record.toolCall,
          };
        }
        if (typeof record.final === "string") {
          return { final: record.final };
        }
      }
    } catch {
      // Ignore invalid mock payloads.
    }
    return null;
  }),
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
const openHandsTurn = <T extends Record<string, unknown>>(turn: T): T & {
  orchestrator: "openhands";
  orchestratorVersion: string;
  orchestratorRunId: string;
} => ({
  ...turn,
  orchestrator: "openhands",
  orchestratorVersion: "test-gateway",
  orchestratorRunId: "oh-run-test",
});

afterEach(() => {
  runs.clear();
  mockedRequestToolLoopTurn.mockReset();
});

describe("playground tool loop", () => {
  it("runs observation, injects a checkpoint before mutation, then completes", async () => {
    mockedRequestToolLoopTurn
      .mockResolvedValueOnce(openHandsTurn({
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
      }))
      .mockResolvedValueOnce(openHandsTurn({
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
      }))
      .mockResolvedValueOnce(openHandsTurn({
        adapter: "text_actions",
        final: "Updated hello.py and verified the change.",
        logs: ["adapter=text_actions"],
        modelSelection: {} as any,
      }));

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

  it("recovers a tool call leaked inside final text before finalizing the run", async () => {
    mockedRequestToolLoopTurn.mockResolvedValueOnce(
      openHandsTurn({
        adapter: "text_actions",
        final: JSON.stringify({
          toolCall: {
            id: "call_write",
            name: "write_file",
            arguments: { path: "hello.py", content: "print('hello')\n" },
            kind: "mutate",
            summary: "Write the updated file",
          },
        }),
        logs: [],
        modelSelection: {} as any,
      })
    );

    const started = await startAssistToolLoop({
      userId: "user-recover-final-toolcall",
      sessionId: "session-recover-final-toolcall",
      traceId: "trace-recover-final-toolcall",
      request: {
        mode: "auto",
        task: "Update hello.py",
        orchestrationProtocol: "tool_loop_v1",
        clientCapabilities: {
          toolLoop: true,
          supportedTools: ["write_file"],
          autoExecute: true,
        },
        context: {
          activeFile: { path: "hello.py", content: "print('hi')\n" },
        },
      },
    });

    expect(started.pendingToolCall?.toolCall.name).toBe("write_file");
    expect(started.pendingToolCall?.toolCall.id).toBe("call_write");
    expect(started.final).toContain("Step 1 ready: write_file");
  });

  it("returns the latest persisted result when continue is retried for an already-recorded tool result", async () => {
    mockedRequestToolLoopTurn
      .mockResolvedValueOnce(
        openHandsTurn({
          adapter: "text_actions",
          final: "",
          toolCall: {
            id: "call_read",
            name: "read_file",
            arguments: { path: "hello.py" },
            kind: "observe",
            summary: "Inspect hello.py",
          },
          logs: [],
          modelSelection: {} as any,
        })
      )
      .mockResolvedValueOnce(
        openHandsTurn({
          adapter: "text_actions",
          final: "Completed successfully.",
          logs: [],
          modelSelection: {} as any,
        })
      );

    const started = await startAssistToolLoop({
      userId: "user-idempotent-continue",
      sessionId: "session-idempotent-continue",
      traceId: "trace-idempotent-continue",
      request: {
        mode: "auto",
        task: "Tell me what hello.py contains.",
        orchestrationProtocol: "tool_loop_v1",
        clientCapabilities: {
          toolLoop: true,
          supportedTools: ["read_file"],
          autoExecute: true,
        },
        context: {
          activeFile: { path: "hello.py", content: "print('hi')\n" },
        },
      },
    });

    const first = await continueAssistToolLoop({
      userId: "user-idempotent-continue",
      traceId: "trace-idempotent-continue-2",
      runId: started.runId!,
      toolResult: {
        toolCallId: "call_read",
        name: "read_file",
        ok: true,
        summary: "Read hello.py.",
        data: { path: "hello.py", content: "print('hi')\n" },
      },
    });

    const retried = await continueAssistToolLoop({
      userId: "user-idempotent-continue",
      traceId: "trace-idempotent-continue-3",
      runId: started.runId!,
      toolResult: {
        toolCallId: "call_read",
        name: "read_file",
        ok: true,
        summary: "Read hello.py.",
        data: { path: "hello.py", content: "print('hi')\n" },
      },
    });

    expect(first.final).toContain("Completed successfully.");
    expect(first.pendingToolCall).toBeNull();
    expect(retried.final).toContain("Completed successfully.");
    expect(retried.pendingToolCall).toBeNull();
  });

  it("injects an observation tool when OpenHands returns only final on step 0 for a code edit", async () => {
    mockedRequestToolLoopTurn.mockResolvedValueOnce(
      openHandsTurn({
        adapter: "text_actions",
        final:
          "To implement that, inspect your strategy file and add exit logic. I cannot see your code from here.",
        logs: ["adapter=text_actions"],
        modelSelection: {} as any,
      })
    );

    const started = await startAssistToolLoop({
      userId: "user-primer",
      sessionId: "session-primer",
      traceId: "trace-primer",
      request: {
        mode: "auto",
        task: "please create a trailing stop loss in my strategy",
        orchestrationProtocol: "tool_loop_v1",
        clientCapabilities: {
          toolLoop: true,
          supportedTools: ["read_file", "list_files", "edit"],
          autoExecute: true,
        },
        context: {
          activeFile: { path: "trader/main.py", content: "class TraderApp: pass\n" },
        },
      },
    });

    expect(started.pendingToolCall?.toolCall.name).toBe("read_file");
    expect(started.pendingToolCall?.toolCall.arguments.path).toBe("trader/main.py");
    expect(started.final).not.toContain("cannot see your code");
    expect(started.logs?.some((line) => line.includes("observation primer injected"))).toBe(true);
  });

  it("keeps repairing blocked tool results until the longer repair budget is exhausted", async () => {
    mockedRequestToolLoopTurn
      .mockResolvedValueOnce(openHandsTurn({
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
      }))
      .mockResolvedValueOnce(openHandsTurn({
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
      }))
      .mockResolvedValueOnce(openHandsTurn({
        adapter: "text_actions",
        final: "",
        toolCall: {
          id: "call_command_retry_1",
          name: "run_command",
          arguments: { command: "npm test", category: "implementation" },
          kind: "command",
          summary: "Retry the implementation command",
        },
        logs: ["adapter=text_actions"],
        modelSelection: {} as any,
      }))
      .mockResolvedValueOnce(openHandsTurn({
        adapter: "text_actions",
        final: "",
        toolCall: {
          id: "call_command_retry_2",
          name: "run_command",
          arguments: { command: "npm test", category: "implementation" },
          kind: "command",
          summary: "Retry the implementation command again",
        },
        logs: ["adapter=text_actions"],
        modelSelection: {} as any,
      }))
      .mockResolvedValueOnce(openHandsTurn({
        adapter: "text_actions",
        final: "",
        toolCall: {
          id: "call_command_retry_3",
          name: "run_command",
          arguments: { command: "npm test", category: "implementation" },
          kind: "command",
          summary: "Retry the implementation command a third time",
        },
        logs: ["adapter=text_actions"],
        modelSelection: {} as any,
      }));

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

    expect(afterRead.pendingToolCall?.toolCall.name).toBe("run_command");

    const repaired = await continueAssistToolLoop({
      userId: "user-2",
      traceId: "trace-8",
      runId: started.runId!,
      toolResult: {
        toolCallId: afterRead.pendingToolCall!.toolCall.id,
        name: "run_command",
        ok: false,
        blocked: true,
        summary: "Command blocked by policy.",
      },
    });

    expect(repaired.pendingToolCall?.toolCall.name).toBe("run_command");

    const repairedAgain = await continueAssistToolLoop({
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

    expect(repairedAgain.pendingToolCall?.toolCall.name).toBe("run_command");

    const repairedThird = await continueAssistToolLoop({
      userId: "user-2",
      traceId: "trace-10",
      runId: started.runId!,
      toolResult: {
        toolCallId: repairedAgain.pendingToolCall!.toolCall.id,
        name: "run_command",
        ok: false,
        blocked: true,
        summary: "Command blocked a third time by policy.",
      },
    });

    expect(repairedThird.pendingToolCall?.toolCall.name).toBe("run_command");

    const failed = await continueAssistToolLoop({
      userId: "user-2",
      traceId: "trace-11",
      runId: started.runId!,
      toolResult: {
        toolCallId: repairedThird.pendingToolCall!.toolCall.id,
        name: "run_command",
        ok: false,
        blocked: true,
        summary: "Command blocked a fourth time by policy.",
      },
    });

    expect(failed.loopState?.status).toBe("failed");
    expect(failed.missingRequirements).toContain("tool_result_failed");
  });

  it("does not inject unsupported primer or checkpoint tools", async () => {
    mockedRequestToolLoopTurn.mockResolvedValueOnce(openHandsTurn({
      adapter: "text_actions",
      final: "",
      toolCall: {
        id: "call_edit_direct",
        name: "edit",
        arguments: {
          path: "hello.py",
          patch: "@@ -1,1 +1,1 @@\n-print('hi')\n+print('hello')",
        },
        kind: "mutate",
        summary: "Patch hello.py directly",
      },
      logs: ["adapter=text_actions"],
      modelSelection: {} as any,
    }));

    const started = await startAssistToolLoop({
      userId: "user-3",
      sessionId: "session-3",
      traceId: "trace-10",
      request: {
        mode: "auto",
        task: "Patch hello.py directly",
        orchestrationProtocol: "tool_loop_v1",
        clientCapabilities: {
          toolLoop: true,
          supportedTools: ["edit"],
          autoExecute: true,
        },
        context: {
          activeFile: { path: "hello.py", content: "print('hi')\n" },
        },
      },
    });

    expect(started.pendingToolCall?.toolCall.name).toBe("edit");
    expect(started.pendingToolCall?.availableTools).toEqual(["edit"]);
  });

  it("completes without mutation requirements when the task is informational and the host returns final-only", async () => {
    mockedRequestToolLoopTurn.mockResolvedValueOnce(openHandsTurn({
      adapter: "text_actions",
      final: "I read the request but have no concrete next step.",
      logs: ["adapter=text_actions"],
      modelSelection: {} as any,
    }));

    const result = await startAssistToolLoop({
      userId: "user-4",
      sessionId: "session-4",
      traceId: "trace-11",
      request: {
        mode: "auto",
        // "describe" is classified as informational (unknown intent), not code_edit — no forced tool/mutation gate.
        task: "Could you please describe what the hello.py file does in a single short sentence?",
        orchestrationProtocol: "tool_loop_v1",
        clientCapabilities: {
          toolLoop: true,
          supportedTools: ["read_file", "edit"],
          autoExecute: true,
        },
        context: {
          activeFile: { path: "hello.py", content: "print('hi')\n" },
        },
      },
    });

    expect(result.loopState?.status).toBe("completed");
    expect(result.pendingToolCall).toBeNull();
    expect(result.missingRequirements ?? []).not.toContain("no_usable_next_action");
  });

  it("blocks a change run when it inspects the target and still cannot produce a mutation", async () => {
    mockedRequestToolLoopTurn
      .mockResolvedValueOnce(openHandsTurn({
        adapter: "text_actions",
        final: "",
        toolCall: {
          id: "call_read_target",
          name: "read_file",
          arguments: { path: "hello.py" },
          kind: "observe",
          summary: "Inspect hello.py",
        },
        logs: ["adapter=text_actions"],
        modelSelection: {} as any,
      }))
      .mockResolvedValueOnce(openHandsTurn({
        adapter: "text_actions",
        final: "I inspected hello.py but I am still thinking.",
        logs: ["adapter=text_actions"],
        modelSelection: {} as any,
      }))
      .mockResolvedValueOnce(openHandsTurn({
        adapter: "text_actions",
        final: "I still do not have a concrete mutation.",
        logs: ["adapter=text_actions", "repair_attempt=true"],
        modelSelection: {} as any,
      }));

    const started = await startAssistToolLoop({
      userId: "user-5",
      sessionId: "session-5",
      traceId: "trace-12",
      request: {
        mode: "auto",
        task: "Add a trailing stop to hello.py",
        orchestrationProtocol: "tool_loop_v1",
        clientCapabilities: {
          toolLoop: true,
          supportedTools: ["read_file", "edit", "create_checkpoint"],
          autoExecute: true,
        },
        context: {
          activeFile: { path: "hello.py", content: "print('hi')\n" },
        },
      },
    });

    const failed = await continueAssistToolLoop({
      userId: "user-5",
      traceId: "trace-13",
      runId: started.runId!,
      toolResult: {
        toolCallId: started.pendingToolCall!.toolCall.id,
        name: "read_file",
        ok: true,
        summary: "Read hello.py.",
        data: { path: "hello.py", content: "print('hi')\n" },
      },
    });

    expect(failed.pendingToolCall).toBeNull();
    expect(failed.completionStatus).toBe("incomplete");
    expect(failed.missingRequirements).toContain("mutation_required_after_inspection");
    expect(failed.progressState.status).toBe("failed");
    expect(failed.objectiveState.status).toBe("blocked");
  });

  it("repairs a multi-file code-edit run when a read step returns final-only text", async () => {
    mockedRequestToolLoopTurn
      .mockResolvedValueOnce(openHandsTurn({
        adapter: "text_actions",
        final: "",
        toolCall: {
          id: "call_read_multi",
          name: "read_file",
          arguments: { path: "duration-toolkit/src/index.js" },
          kind: "observe",
          summary: "Inspect duration-toolkit/src/index.js",
        },
        logs: ["adapter=text_actions"],
        modelSelection: {} as any,
      }))
      .mockResolvedValueOnce(openHandsTurn({
        adapter: "text_actions",
        final: "Awaiting package.json content.",
        logs: ["adapter=text_actions"],
        modelSelection: {} as any,
      }))
      .mockResolvedValueOnce(openHandsTurn({
        adapter: "text_actions",
        final: "",
        toolCall: {
          id: "call_write_multi",
          name: "write_file",
          arguments: {
            path: "duration-toolkit/test/duration.test.js",
            content: "import test from 'node:test';\n",
          },
          kind: "mutate",
          summary: "Add the missing duration tests",
        },
        logs: ["adapter=text_actions", "repair_attempt=true"],
        modelSelection: {} as any,
      }));

    const started = await startAssistToolLoop({
      userId: "user-5b",
      sessionId: "session-5b",
      traceId: "trace-12b",
      request: {
        mode: "auto",
        task: "Create a duration toolkit project with package.json, src/index.js, test/duration.test.js, and README.md.",
        orchestrationProtocol: "tool_loop_v1",
        clientCapabilities: {
          toolLoop: true,
          supportedTools: ["read_file", "write_file", "mkdir", "create_checkpoint"],
          autoExecute: true,
        },
      },
    });

    const repaired = await continueAssistToolLoop({
      userId: "user-5b",
      traceId: "trace-13b",
      runId: started.runId!,
      toolResult: {
        toolCallId: started.pendingToolCall!.toolCall.id,
        name: "read_file",
        ok: true,
        summary: "Read duration-toolkit/src/index.js.",
        data: {
          path: "duration-toolkit/src/index.js",
          content: "export function parseDuration() {}\n",
        },
      },
    });

    expect(repaired.pendingToolCall?.toolCall.name).toBe("create_checkpoint");
    expect(repaired.loopState?.repairCount).toBe(1);
    const afterCheckpoint = await continueAssistToolLoop({
      userId: "user-5b",
      traceId: "trace-14b",
      runId: started.runId!,
      toolResult: {
        toolCallId: repaired.pendingToolCall!.toolCall.id,
        name: "create_checkpoint",
        ok: true,
        summary: "Checkpoint created.",
        data: {},
      },
    });

    expect(afterCheckpoint.pendingToolCall?.toolCall.name).toBe("write_file");
    expect(afterCheckpoint.pendingToolCall?.toolCall.arguments.path).toBe("duration-toolkit/test/duration.test.js");
    expect(afterCheckpoint.progressState.status).toBe("repairing");
  });

  it("retargets multi-file repair to the first missing required file", async () => {
    mockedRequestToolLoopTurn
      .mockResolvedValueOnce(openHandsTurn({
        adapter: "text_actions",
        final: "",
        toolCall: {
          id: "call_read_multifile_readme",
          name: "read_file",
          arguments: { path: "duration-toolkit/src/index.js" },
          kind: "observe",
          summary: "Inspect duration-toolkit/src/index.js",
        },
        logs: ["adapter=text_actions"],
        modelSelection: {} as any,
      }))
      .mockResolvedValueOnce(openHandsTurn({
        adapter: "text_actions",
        final: "Here is a general implementation guide.",
        logs: ["adapter=text_actions"],
        modelSelection: {} as any,
      }))
      .mockResolvedValueOnce(openHandsTurn({
        adapter: "text_actions",
        final: "",
        toolCall: {
          id: "call_write_readme",
          name: "write_file",
          arguments: {
            path: "duration-toolkit/README.md",
            content: "# duration-toolkit\n",
          },
          kind: "mutate",
          summary: "Add the missing README",
        },
        logs: ["adapter=text_actions", "repair_attempt=true"],
        modelSelection: {} as any,
      }));

    const started = await startAssistToolLoop({
      userId: "user-5c",
      sessionId: "session-5c",
      traceId: "trace-12c",
      request: {
        mode: "auto",
        task: "Create a duration toolkit project with package.json, src/index.js, test/duration.test.js, and README.md.",
        orchestrationProtocol: "tool_loop_v1",
        clientCapabilities: {
          toolLoop: true,
          supportedTools: ["read_file", "write_file", "mkdir", "create_checkpoint"],
          autoExecute: true,
        },
      },
    });

    const repaired = await continueAssistToolLoop({
      userId: "user-5c",
      traceId: "trace-13c",
      runId: started.runId!,
      toolResult: {
        toolCallId: started.pendingToolCall!.toolCall.id,
        name: "read_file",
        ok: true,
        summary: "Read duration-toolkit/src/index.js.",
        data: {
          path: "duration-toolkit/src/index.js",
          content: "export function parseDuration() {}\n",
          changedFiles: [
            "duration-toolkit/package.json",
            "duration-toolkit/src/index.js",
            "duration-toolkit/test/duration.test.js",
          ],
        },
      },
    });

    expect(mockedRequestToolLoopTurn.mock.calls[2]?.[0]?.targetInference.path).toBe("duration-toolkit/README.md");
    expect(mockedRequestToolLoopTurn.mock.calls[2]?.[0]?.repairDirective?.reason).toContain("duration-toolkit/README.md");
    expect(repaired.pendingToolCall?.toolCall.name).toBe("create_checkpoint");

    const afterCheckpoint = await continueAssistToolLoop({
      userId: "user-5c",
      traceId: "trace-14c",
      runId: started.runId!,
      toolResult: {
        toolCallId: repaired.pendingToolCall!.toolCall.id,
        name: "create_checkpoint",
        ok: true,
        summary: "Checkpoint created.",
        data: {},
      },
    });

    expect(afterCheckpoint.pendingToolCall?.toolCall.name).toBe("write_file");
    expect(afterCheckpoint.pendingToolCall?.toolCall.arguments.path).toBe("duration-toolkit/README.md");
  });

  it("escalates repeated pending tool signatures through repair before blocking", async () => {
    mockedRequestToolLoopTurn
      .mockResolvedValueOnce(openHandsTurn({
        adapter: "text_actions",
        final: "",
        toolCall: {
          id: "call_read_repeat",
          name: "read_file",
          arguments: { path: "hello.py" },
          kind: "observe",
          summary: "Inspect hello.py",
        },
        logs: ["adapter=text_actions"],
        modelSelection: {} as any,
      }))
      .mockResolvedValueOnce(openHandsTurn({
        adapter: "text_actions",
        final: "",
        toolCall: {
          id: "call_command_repeat_1",
          name: "run_command",
          arguments: { command: "npm test", category: "implementation" },
          kind: "command",
          summary: "Run npm test",
        },
        logs: ["adapter=text_actions"],
        modelSelection: {} as any,
      }))
      .mockResolvedValueOnce(openHandsTurn({
        adapter: "text_actions",
        final: "Still thinking about the same command.",
        toolCall: {
          id: "call_command_repeat_2",
          name: "run_command",
          arguments: { command: "npm test", category: "implementation" },
          kind: "command",
          summary: "Run npm test",
        },
        logs: ["adapter=text_actions"],
        modelSelection: {} as any,
      }))
      .mockResolvedValueOnce(openHandsTurn({
        adapter: "text_actions",
        final: "",
        toolCall: {
          id: "call_edit_after_repeat",
          name: "edit",
          arguments: {
            path: "hello.py",
            patch: "@@ -1,1 +1,1 @@\n-print('hi')\n+print('hello')",
          },
          kind: "mutate",
          summary: "Patch hello.py instead",
        },
        logs: ["adapter=text_actions", "repair_attempt=true"],
        modelSelection: {} as any,
      }));

    const started = await startAssistToolLoop({
      userId: "user-6",
      sessionId: "session-6",
      traceId: "trace-14",
      request: {
        mode: "auto",
        task: "Update hello.py",
        orchestrationProtocol: "tool_loop_v1",
        clientCapabilities: {
          toolLoop: true,
          supportedTools: ["read_file", "run_command", "edit"],
          autoExecute: true,
        },
        context: {
          activeFile: { path: "hello.py", content: "print('hi')\n" },
        },
      },
    });

    const afterRead = await continueAssistToolLoop({
      userId: "user-6",
      traceId: "trace-15",
      runId: started.runId!,
      toolResult: {
        toolCallId: started.pendingToolCall!.toolCall.id,
        name: "read_file",
        ok: true,
        summary: "Read hello.py.",
        data: { path: "hello.py", content: "print('hi')\n" },
      },
    });

    const repaired = await continueAssistToolLoop({
      userId: "user-6",
      traceId: "trace-16",
      runId: started.runId!,
      toolResult: {
        toolCallId: afterRead.pendingToolCall!.toolCall.id,
        name: "run_command",
        ok: true,
        summary: "npm test completed without edits.",
      },
    });

    expect(mockedRequestToolLoopTurn).toHaveBeenCalledTimes(4);
    expect(mockedRequestToolLoopTurn.mock.calls[3]?.[0]?.repairDirective?.stage).toBe("target_path_repair");
    expect(repaired.loopState?.repairCount).toBe(1);
    expect(repaired.pendingToolCall?.toolCall.name).toBe("edit");
    expect(repaired.progressState.status).toBe("repairing");
  });

  it("reaches pine specialization before terminal failure on repeated no-content mutations", async () => {
    mockedRequestToolLoopTurn
      .mockResolvedValueOnce(openHandsTurn({
        adapter: "text_actions",
        final: "",
        toolCall: {
          id: "call_edit_pine_initial",
          name: "edit",
          arguments: {
            path: "strategies/CMMI_Strategy_6.pine",
            patch: "@@ -1,1 +1,1 @@\n-//@version=6\n+//@version=6\n",
          },
          kind: "mutate",
          summary: "Patch the Pine strategy",
        },
        logs: ["adapter=text_actions"],
        modelSelection: {} as any,
      }))
      .mockResolvedValueOnce(openHandsTurn({
        adapter: "text_actions",
        final: "",
        toolCall: {
          id: "call_write_file_rewrite",
          name: "write_file",
          arguments: {
            path: "strategies/CMMI_Strategy_6.pine",
            content: "// rewritten pine content",
          },
          kind: "mutate",
          summary: "Rewrite the Pine strategy",
        },
        logs: ["adapter=text_actions", "repair_attempt=single_file_rewrite"],
        modelSelection: {} as any,
      }))
      .mockResolvedValueOnce(openHandsTurn({
        adapter: "text_actions",
        final: "",
        toolCall: {
          id: "call_write_file_pine_specialized",
          name: "write_file",
          arguments: {
            path: "strategies/CMMI_Strategy_6.pine",
            content: "// pine specialized rewrite",
          },
          kind: "mutate",
          summary: "Rewrite the Pine strategy with Pine-specific structure",
        },
        logs: ["adapter=text_actions", "repair_attempt=pine_specialization"],
        modelSelection: {} as any,
      }));

    const started = await startAssistToolLoop({
      userId: "user-7",
      sessionId: "session-7",
      traceId: "trace-17",
      request: {
        mode: "auto",
        task: "Add a trailing stop to strategies/CMMI_Strategy_6.pine",
        orchestrationProtocol: "tool_loop_v1",
        clientCapabilities: {
          toolLoop: true,
          supportedTools: ["edit", "write_file"],
          autoExecute: true,
        },
        context: {
          activeFile: { path: "strategies/CMMI_Strategy_6.pine", content: "//@version=6\nstrategy('CMMI')\n" },
        },
      },
    });

    const afterFirstFailure = await continueAssistToolLoop({
      userId: "user-7",
      traceId: "trace-18",
      runId: started.runId!,
      toolResult: {
        toolCallId: started.pendingToolCall!.toolCall.id,
        name: "edit",
        ok: false,
        summary: "Patch produced no content change.",
      },
    });

    const afterSecondFailure = await continueAssistToolLoop({
      userId: "user-7",
      traceId: "trace-19",
      runId: started.runId!,
      toolResult: {
        toolCallId: afterFirstFailure.pendingToolCall!.toolCall.id,
        name: "write_file",
        ok: false,
        summary: "Patch produced no content change.",
      },
    });

    const failed = await continueAssistToolLoop({
      userId: "user-7",
      traceId: "trace-20",
      runId: started.runId!,
      toolResult: {
        toolCallId: afterSecondFailure.pendingToolCall!.toolCall.id,
        name: "write_file",
        ok: false,
        summary: "Patch produced no content change.",
      },
    });

    expect(mockedRequestToolLoopTurn.mock.calls[1]?.[0]?.repairDirective?.stage).toBe("single_file_rewrite");
    expect(mockedRequestToolLoopTurn.mock.calls[2]?.[0]?.repairDirective?.stage).toBe("pine_specialization");
    expect(failed.pendingToolCall).toBeNull();
    expect(failed.loopState?.status).toBe("failed");
    expect(failed.missingRequirements).toContain("tool_result_failed");
    expect(failed.missingRequirements).toContain("no_content_delta");
  });

  describe("PLAYGROUND_OPENHANDS_PRIMARY_ORCHESTRATION", () => {
    afterEach(() => {
      vi.unstubAllEnvs();
    });

    it("injects observation primer when gateway returns final-only on step 0 for agentic edits", async () => {
      vi.stubEnv("PLAYGROUND_OPENHANDS_PRIMARY_ORCHESTRATION", "true");
      mockedRequestToolLoopTurn.mockResolvedValueOnce(
        openHandsTurn({
          adapter: "text_actions",
          final:
            "To implement that, inspect your strategy file and add exit logic. I cannot see your code from here.",
          logs: ["adapter=text_actions"],
          modelSelection: {} as any,
        })
      );

      const started = await startAssistToolLoop({
        userId: "user-oh-primary",
        sessionId: "session-oh-primary",
        traceId: "trace-oh-1",
        request: {
          mode: "auto",
          task: "please create a trailing stop loss in my strategy",
          orchestrationProtocol: "tool_loop_v1",
          clientCapabilities: {
            toolLoop: true,
            supportedTools: ["read_file", "list_files", "edit"],
            autoExecute: true,
          },
          context: {
            activeFile: { path: "trader/main.py", content: "class TraderApp: pass\n" },
          },
        },
      });

      expect(started.pendingToolCall?.toolCall.name).toBe("read_file");
      expect(started.pendingToolCall?.toolCall.arguments.path).toBe("trader/main.py");
      expect(started.logs?.some((line) => line.includes("observation primer injected"))).toBe(true);
    });

    it("does not fail mutation_required_after_inspection when the next turn is non-mutating", async () => {
      vi.stubEnv("PLAYGROUND_OPENHANDS_PRIMARY_ORCHESTRATION", "true");
      mockedRequestToolLoopTurn
        .mockResolvedValueOnce(
          openHandsTurn({
            adapter: "text_actions",
            final: "",
            toolCall: {
              id: "call_read",
              name: "read_file",
              arguments: { path: "hello.py" },
              kind: "observe",
              summary: "Inspect hello.py",
            },
            logs: [],
            modelSelection: {} as any,
          })
        )
        .mockResolvedValueOnce(
          openHandsTurn({
            adapter: "text_actions",
            final: "",
            toolCall: {
              id: "call_list",
              name: "list_files",
              arguments: { query: "*.py", limit: 5 },
              kind: "observe",
              summary: "List Python files",
            },
            logs: [],
            modelSelection: {} as any,
          })
        )
        .mockResolvedValueOnce(
          openHandsTurn({
            adapter: "text_actions",
            final: "",
            toolCall: {
              id: "call_edit",
              name: "edit",
              arguments: { path: "hello.py", patch: "@@\n-print('hi')\n+print('hello')\n" },
              kind: "mutate",
              summary: "Apply the requested update",
            },
            logs: [],
            modelSelection: {} as any,
          })
        );

      const started = await startAssistToolLoop({
        userId: "user-oh-primary-2",
        sessionId: "session-oh-primary-2",
        traceId: "trace-oh-2",
        request: {
          mode: "auto",
          task: "Update hello.py",
          orchestrationProtocol: "tool_loop_v1",
          clientCapabilities: {
            toolLoop: true,
            supportedTools: ["read_file", "list_files", "edit"],
            autoExecute: true,
          },
          context: {
            activeFile: { path: "hello.py", content: "print('hi')\n" },
          },
        },
      });

      const afterRead = await continueAssistToolLoop({
        userId: "user-oh-primary-2",
        traceId: "trace-oh-3",
        runId: started.runId!,
        toolResult: {
          toolCallId: "call_read",
          name: "read_file",
          ok: true,
          summary: "Read hello.py.",
          data: { path: "hello.py", content: "print('hi')\n" },
        },
      });

      expect(afterRead.loopState?.status).not.toBe("failed");
      expect(afterRead.missingRequirements ?? []).not.toContain("mutation_required_after_inspection");
      expect(afterRead.pendingToolCall?.toolCall.name).toBe("edit");
    });

    it("does not fail on repeated pending tool signature", async () => {
      vi.stubEnv("PLAYGROUND_OPENHANDS_PRIMARY_ORCHESTRATION", "true");
      mockedRequestToolLoopTurn
        .mockResolvedValueOnce(
          openHandsTurn({
            adapter: "text_actions",
            final: "",
            toolCall: {
              id: "call_read_1",
              name: "read_file",
              arguments: { path: "hello.py" },
              kind: "observe",
              summary: "Read",
            },
            logs: [],
            modelSelection: {} as any,
          })
        )
        .mockResolvedValueOnce(
          openHandsTurn({
            adapter: "text_actions",
            final: "",
            toolCall: {
              id: "call_read_2",
              name: "read_file",
              arguments: { path: "hello.py" },
              kind: "observe",
              summary: "Read again",
            },
            logs: [],
            modelSelection: {} as any,
          })
        )
        .mockResolvedValueOnce(
          openHandsTurn({
            adapter: "text_actions",
            final: "",
            toolCall: {
              id: "call_edit_1",
              name: "edit",
              arguments: { path: "hello.py", patch: "@@\n-print('hi')\n+print('hello')\n" },
              kind: "mutate",
              summary: "Stop rereading and edit the file",
            },
            logs: [],
            modelSelection: {} as any,
          })
        );

      const started = await startAssistToolLoop({
        userId: "user-oh-primary-3",
        sessionId: "session-oh-primary-3",
        traceId: "trace-oh-4",
        request: {
          mode: "auto",
          task: "Update hello.py",
          orchestrationProtocol: "tool_loop_v1",
          clientCapabilities: {
            toolLoop: true,
            supportedTools: ["read_file", "edit"],
            autoExecute: true,
          },
          context: {
            activeFile: { path: "hello.py", content: "print('hi')\n" },
          },
        },
      });

      const afterRead = await continueAssistToolLoop({
        userId: "user-oh-primary-3",
        traceId: "trace-oh-5",
        runId: started.runId!,
        toolResult: {
          toolCallId: "call_read_1",
          name: "read_file",
          ok: true,
          summary: "Read hello.py.",
          data: { path: "hello.py", content: "print('hi')\n" },
        },
      });

      expect(afterRead.loopState?.status).not.toBe("failed");
      expect(afterRead.missingRequirements ?? []).not.toContain("tool_repeat_without_progress");
      expect(afterRead.pendingToolCall?.toolCall.name).toBe("edit");
      expect(afterRead.pendingToolCall?.toolCall.id).toBe("call_edit_1");
    });

    it("targets package.json for repair after a validation command fails", async () => {
      mockedRequestToolLoopTurn
        .mockResolvedValueOnce(
          openHandsTurn({
            adapter: "text_actions",
            final: "",
            toolCall: {
              id: "call_read_pkg",
              name: "read_file",
              arguments: { path: "repo-proof/package.json" },
              kind: "observe",
              summary: "Inspect repo-proof/package.json",
            },
            logs: [],
            modelSelection: {} as any,
          })
        )
        .mockResolvedValueOnce(
          openHandsTurn({
            adapter: "text_actions",
            final: "",
            toolCall: {
              id: "call_write_pkg",
              name: "write_file",
              arguments: {
                path: "repo-proof/package.json",
                content:
                  '{\n  "name": "repo-proof",\n  "scripts": {\n    "test": "node --experimental-modulesloader test/index.test.js"\n  }\n}\n',
              },
              kind: "mutate",
              summary: "Write repo-proof/package.json",
            },
            logs: [],
            modelSelection: {} as any,
          })
        )
        .mockResolvedValueOnce(
          openHandsTurn({
            adapter: "text_actions",
            final: "",
            toolCall: {
              id: "call_validate",
              name: "run_command",
              arguments: {
                command: "npm test",
                category: "validation",
              },
              kind: "command",
              summary: "Run focused validation: npm test",
            },
            logs: [],
            modelSelection: {} as any,
          })
        )
        .mockResolvedValueOnce(
          openHandsTurn({
            adapter: "text_actions",
            final: "",
            toolCall: {
              id: "call_fix_pkg",
              name: "edit",
              arguments: {
                path: "repo-proof/package.json",
                patch:
                  '@@ -1,5 +1,5 @@\n-    "test": "node --experimental-modulesloader test/index.test.js"\n+    "test": "node --test test/index.test.js"\n',
              },
              kind: "mutate",
              summary: "Repair the generated validation script",
            },
            logs: [],
            modelSelection: {} as any,
          })
        );

      const started = await startAssistToolLoop({
        userId: "user-validation-repair",
        sessionId: "session-validation-repair",
        traceId: "trace-validation-repair",
        request: {
          mode: "auto",
          task: "Create repo-proof with package.json, src/index.js, and test/index.test.js. Run tests until they pass.",
          orchestrationProtocol: "tool_loop_v1",
          clientCapabilities: {
            toolLoop: true,
            supportedTools: ["read_file", "create_checkpoint", "write_file", "edit", "run_command"],
            autoExecute: true,
          },
          context: {
            activeFile: { path: "repo-proof/package.json", content: "" },
          },
        },
      });

      const afterRead = await continueAssistToolLoop({
        userId: "user-validation-repair",
        traceId: "trace-validation-repair-2",
        runId: started.runId!,
        toolResult: {
          toolCallId: "call_read_pkg",
          name: "read_file",
          ok: true,
          summary: "repo-proof/package.json is missing.",
          error: "ENOENT",
        },
      });

      const afterCheckpoint = await continueAssistToolLoop({
        userId: "user-validation-repair",
        traceId: "trace-validation-repair-3",
        runId: started.runId!,
        toolResult: {
          toolCallId: afterRead.pendingToolCall!.toolCall.id,
          name: "create_checkpoint",
          ok: true,
          summary: "Checkpoint created.",
        },
      });

      const afterWrite = await continueAssistToolLoop({
        userId: "user-validation-repair",
        traceId: "trace-validation-repair-4",
        runId: started.runId!,
        toolResult: {
          toolCallId: afterCheckpoint.pendingToolCall!.toolCall.id,
          name: "write_file",
          ok: true,
          summary: "Wrote repo-proof/package.json.",
          data: { changedFiles: ["repo-proof/package.json"] },
        },
      });

      expect(afterWrite.pendingToolCall?.toolCall.name).toBe("run_command");
      expect(afterWrite.pendingToolCall?.toolCall.arguments.command).toBe('cd "repo-proof" && npm test');

      await continueAssistToolLoop({
        userId: "user-validation-repair",
        traceId: "trace-validation-repair-5",
        runId: started.runId!,
        toolResult: {
          toolCallId: afterWrite.pendingToolCall!.toolCall.id,
          name: "run_command",
          ok: false,
          summary: "Command failed: npm test",
          error: "node: bad option: --experimental-modulesloader",
          data: {
            stderr: "node: bad option: --experimental-modulesloader",
            exitCode: 9,
          },
        },
      });

      expect(mockedRequestToolLoopTurn).toHaveBeenCalledTimes(4);
      const repairCall = mockedRequestToolLoopTurn.mock.calls[3]?.[0];
      expect(repairCall?.targetInference.path).toBe("package.json");
      expect(repairCall?.repairDirective?.reason).toContain("Repair the generated validation script");
    });

    it("forces git closeout commands after validation succeeds", async () => {
      mockedRequestToolLoopTurn
        .mockResolvedValueOnce(
          openHandsTurn({
            adapter: "text_actions",
            final: "",
            toolCall: {
              id: "call_list_repo",
              name: "list_files",
              arguments: {},
              kind: "observe",
              summary: "Check current workspace structure",
            },
            logs: [],
            modelSelection: {} as any,
          })
        )
        .mockResolvedValueOnce(
          openHandsTurn({
            adapter: "text_actions",
            final: "",
            toolCall: {
              id: "call_write_pkg_git",
              name: "write_file",
              arguments: {
                path: "repo-proof/package.json",
                content: '{\n  "name": "repo-proof",\n  "scripts": {\n    "test": "node --test test/index.test.js"\n  }\n}\n',
              },
              kind: "mutate",
              summary: "Write package.json",
            },
            logs: [],
            modelSelection: {} as any,
          })
        )
        .mockResolvedValueOnce(
          openHandsTurn({
            adapter: "text_actions",
            final: "",
            toolCall: {
              id: "call_observe_after_validate",
              name: "list_files",
              arguments: { path: "repo-proof" },
              kind: "observe",
              summary: "Inspect the finished repo-proof folder",
            },
            logs: [],
            modelSelection: {} as any,
          })
        )
        .mockResolvedValueOnce(
          openHandsTurn({
            adapter: "text_actions",
            final: "",
            toolCall: {
              id: "call_observe_after_git",
              name: "list_files",
              arguments: { path: "repo-proof" },
              kind: "observe",
              summary: "Inspect repo-proof after validation",
            },
            logs: [],
            modelSelection: {} as any,
          })
        );

      const started = await startAssistToolLoop({
        userId: "user-git-closeout",
        sessionId: "session-git-closeout",
        traceId: "trace-git-closeout",
        request: {
          mode: "auto",
          task: "Create a folder named repo-proof with README.md, src/index.js, test/index.test.js, and package.json. Run tests until they pass. Then initialize git inside repo-proof, create a feature branch named feat/autonomy-proof, and create a commit.",
          orchestrationProtocol: "tool_loop_v1",
          clientCapabilities: {
            toolLoop: true,
            supportedTools: ["list_files", "create_checkpoint", "write_file", "run_command"],
            autoExecute: true,
          },
        },
      });

      const afterList = await continueAssistToolLoop({
        userId: "user-git-closeout",
        traceId: "trace-git-closeout-2",
        runId: started.runId!,
        toolResult: {
          toolCallId: "call_list_repo",
          name: "list_files",
          ok: true,
          summary: "Listed 0 workspace file(s).",
          data: { files: [] },
        },
      });

      const afterCheckpoint = await continueAssistToolLoop({
        userId: "user-git-closeout",
        traceId: "trace-git-closeout-3",
        runId: started.runId!,
        toolResult: {
          toolCallId: afterList.pendingToolCall!.toolCall.id,
          name: "create_checkpoint",
          ok: true,
          summary: "Checkpoint created.",
        },
      });

      const afterWrite = await continueAssistToolLoop({
        userId: "user-git-closeout",
        traceId: "trace-git-closeout-4",
        runId: started.runId!,
        toolResult: {
          toolCallId: afterCheckpoint.pendingToolCall!.toolCall.id,
          name: "write_file",
          ok: true,
          summary: "Wrote repo-proof/package.json.",
          data: { changedFiles: ["repo-proof/package.json", "repo-proof/README.md", "repo-proof/src/index.js", "repo-proof/test/index.test.js"] },
        },
      });

      expect(afterWrite.pendingToolCall?.toolCall.name).toBe("run_command");
      expect(afterWrite.pendingToolCall?.toolCall.arguments.command).toBe('cd "repo-proof" && npm test');

      const afterValidation = await continueAssistToolLoop({
        userId: "user-git-closeout",
        traceId: "trace-git-closeout-5",
        runId: started.runId!,
        toolResult: {
          toolCallId: afterWrite.pendingToolCall!.toolCall.id,
          name: "run_command",
          ok: true,
          summary: 'Command succeeded: cd "repo-proof" && npm test',
          data: {
            command: 'cd "repo-proof" && npm test',
            exitCode: 0,
            stdout: "",
            stderr: "",
          },
        },
      });

      expect(afterValidation.pendingToolCall?.toolCall.name).toBe("run_command");
      expect(afterValidation.pendingToolCall?.toolCall.arguments.command).toBe('cd "repo-proof" && git init');
    });
  });
});

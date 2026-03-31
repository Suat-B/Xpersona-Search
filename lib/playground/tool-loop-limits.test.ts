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
        if (typeof record.final === "string") return { final: record.final };
      }
    } catch {
      // ignore invalid payloads in tests
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
          supportedTools: ["read_file"],
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

describe("playground tool loop limits", () => {
  it("clamps requested step budgets to the 128-step maximum", async () => {
    mockedRequestToolLoopTurn.mockResolvedValueOnce(
      openHandsTurn({
        adapter: "text_actions",
        final: "Budget clamp check.",
        logs: ["adapter=text_actions"],
        modelSelection: {} as any,
      })
    );

    const result = await startAssistToolLoop({
      userId: "user-step-budget-clamp",
      sessionId: "session-step-budget-clamp",
      traceId: "trace-step-budget-clamp",
      request: {
        mode: "plan",
        task: "Check the configured step ceiling.",
        orchestrationProtocol: "tool_loop_v1",
        clientCapabilities: {
          toolLoop: true,
          supportedTools: ["read_file"],
          autoExecute: true,
        },
        clientTrace: {
          extensionVersion: "test",
          workspaceHash: "workspace-step-budget-clamp",
          maxToolSteps: 999,
        },
      },
    });

    expect(result.loopState?.maxSteps).toBe(128);
    expect(result.final).toContain("Budget clamp check.");
  });

  it("fails once the default 128-step budget is exhausted", async () => {
    const turnCount = 129;
    for (let index = 1; index <= turnCount; index += 1) {
      mockedRequestToolLoopTurn.mockResolvedValueOnce(
        openHandsTurn({
          adapter: "text_actions",
          final: "",
          toolCall: {
            id: `call_read_budget_${index}`,
            name: "read_file",
            arguments: { path: `docs/file-${index}.md` },
            kind: "observe",
            summary: `Inspect docs/file-${index}.md`,
          },
          logs: ["adapter=text_actions"],
          modelSelection: {} as any,
        })
      );
    }

    let envelope = await startAssistToolLoop({
      userId: "user-step-budget",
      sessionId: "session-step-budget",
      traceId: "trace-step-budget-1",
      request: {
        mode: "plan",
        task: "Inspect a lot of files and keep going until the loop stops you.",
        orchestrationProtocol: "tool_loop_v1",
        clientCapabilities: {
          toolLoop: true,
          supportedTools: ["read_file"],
          autoExecute: true,
        },
      },
    });

    expect(envelope.loopState?.maxSteps).toBe(128);
    expect(envelope.pendingToolCall?.toolCall.id).toBe("call_read_budget_1");

    for (let step = 1; step <= 128; step += 1) {
      envelope = await continueAssistToolLoop({
        userId: "user-step-budget",
        traceId: `trace-step-budget-${step + 1}`,
        runId: envelope.runId!,
        toolResult: {
          toolCallId: envelope.pendingToolCall!.toolCall.id,
          name: "read_file",
          ok: true,
          summary: `Read docs/file-${step}.md.`,
          data: { path: `docs/file-${step}.md`, content: `content ${step}` },
        },
      });
    }

    expect(envelope.pendingToolCall).toBeNull();
    expect(envelope.loopState?.status).toBe("failed");
    expect(envelope.loopState?.stepCount).toBe(128);
    expect(envelope.completionStatus).toBe("incomplete");
    expect(envelope.missingRequirements).toContain("tool_step_budget_exceeded");
    expect(envelope.final).toContain("step budget");
  });

  it("honors a lower custom budget when the client explicitly sets one", async () => {
    const turnCount = 26;
    for (let index = 1; index <= turnCount; index += 1) {
      mockedRequestToolLoopTurn.mockResolvedValueOnce(
        openHandsTurn({
          adapter: "text_actions",
          final: index === turnCount ? "Completed after a long autonomous run." : "",
          ...(index === turnCount
            ? {}
            : {
                toolCall: {
                  id: `call_read_extended_${index}`,
                  name: "read_file",
                  arguments: { path: `docs/extended-${index}.md` },
                  kind: "observe",
                  summary: `Inspect docs/extended-${index}.md`,
                },
              }),
          logs: ["adapter=text_actions"],
          modelSelection: {} as any,
        })
      );
    }

    let envelope = await startAssistToolLoop({
      userId: "user-step-budget-extended",
      sessionId: "session-step-budget-extended",
      traceId: "trace-step-budget-extended-1",
      request: {
        mode: "plan",
        task: "Inspect many files before summarizing what you learned.",
        orchestrationProtocol: "tool_loop_v1",
        clientCapabilities: {
          toolLoop: true,
          supportedTools: ["read_file"],
          autoExecute: true,
        },
        clientTrace: {
          extensionVersion: "test",
          workspaceHash: "workspace-step-budget-extended",
          maxToolSteps: 30,
        },
      },
    });

    expect(envelope.loopState?.maxSteps).toBe(30);

    for (let step = 1; step < turnCount; step += 1) {
      envelope = await continueAssistToolLoop({
        userId: "user-step-budget-extended",
        traceId: `trace-step-budget-extended-${step + 1}`,
        runId: envelope.runId!,
        toolResult: {
          toolCallId: envelope.pendingToolCall!.toolCall.id,
          name: "read_file",
          ok: true,
          summary: `Read docs/extended-${step}.md.`,
          data: { path: `docs/extended-${step}.md`, content: `content ${step}` },
        },
      });
    }

    expect(envelope.pendingToolCall).toBeNull();
    expect(envelope.loopState?.status).toBe("completed");
    expect(envelope.loopState?.stepCount).toBe(25);
    expect(envelope.completionStatus).toBe("complete");
    expect(envelope.missingRequirements ?? []).not.toContain("tool_step_budget_exceeded");
    expect(envelope.final).toContain("Completed after a long autonomous run.");
  });

  it("preserves a 120k-character final response without truncation", async () => {
    const longFinal = "L".repeat(120_000);
    mockedRequestToolLoopTurn.mockResolvedValueOnce(
      openHandsTurn({
        adapter: "text_actions",
        final: longFinal,
        logs: ["adapter=text_actions"],
        modelSelection: {} as any,
      })
    );

    const result = await startAssistToolLoop({
      userId: "user-long-final",
      sessionId: "session-long-final",
      traceId: "trace-long-final",
      request: {
        mode: "plan",
        task: "Provide a very long architectural summary.",
        orchestrationProtocol: "tool_loop_v1",
        clientCapabilities: {
          toolLoop: true,
          supportedTools: ["read_file"],
          autoExecute: true,
        },
      },
    });

    expect(result.pendingToolCall).toBeNull();
    expect(result.loopState?.status).toBe("completed");
    expect(result.completionStatus).toBe("complete");
    expect(result.final?.length).toBe(longFinal.length);
    expect(result.final).toBe(longFinal);
  });
});

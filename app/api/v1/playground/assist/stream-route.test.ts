import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const {
  authenticatePlaygroundRequest,
  guardPlaygroundAccess,
  runAssist,
  startAssistToolLoop,
  appendSessionMessage,
  createAgentRun,
  createSession,
  getSessionById,
  listSessionMessages,
  updateAgentRun,
  incrementUsage,
  getOrCreateRequestId,
} = vi.hoisted(() => ({
  authenticatePlaygroundRequest: vi.fn(),
  guardPlaygroundAccess: vi.fn(),
  runAssist: vi.fn(),
  startAssistToolLoop: vi.fn(),
  appendSessionMessage: vi.fn(),
  createAgentRun: vi.fn(),
  createSession: vi.fn(),
  getSessionById: vi.fn(),
  listSessionMessages: vi.fn(),
  updateAgentRun: vi.fn(),
  incrementUsage: vi.fn(),
  getOrCreateRequestId: vi.fn(),
}));

vi.mock("@/lib/playground/auth", () => ({
  authenticatePlaygroundRequest,
}));

vi.mock("@/lib/playground/orchestration", () => ({
  guardPlaygroundAccess,
  runAssist,
}));

vi.mock("@/lib/playground/tool-loop", () => ({
  startAssistToolLoop,
}));

vi.mock("@/lib/playground/store", () => ({
  appendSessionMessage,
  createAgentRun,
  createSession,
  getSessionById,
  listSessionMessages,
  updateAgentRun,
}));

vi.mock("@/lib/hf-router/rate-limit", () => ({
  estimateMessagesTokens: vi.fn(() => 16),
  incrementUsage,
}));

vi.mock("@/lib/api/request-meta", () => ({
  getOrCreateRequestId,
}));

import { POST } from "./route";

function createStreamAssistResult(finalText = "Hosted stream answer.") {
  return {
    decision: { mode: "auto", reason: "direct", confidence: 0.92 },
    plan: null,
    actions: [],
    final: finalText,
    modelMetadata: {
      contractVersion: "test",
      adapter: "text_actions_v1",
      modelRequested: "m",
      modelRequestedAlias: "m",
      modelResolved: "m",
      modelResolvedAlias: "playground-default",
      providerResolved: "hf" as const,
      capabilities: {},
      certification: "none",
    },
    validationPlan: {
      scope: "targeted",
      checks: [],
      touchedFiles: [],
      reason: "targeted",
    },
    targetInference: {
      confidence: 0.6,
      source: "unknown",
    },
    contextSelection: {
      files: [],
      snippets: 0,
      usedCloudIndex: false,
    },
    completionStatus: "complete",
    missingRequirements: [],
    progressState: {
      status: "completed",
      lastMeaningfulProgressAtStep: 1,
      lastMeaningfulProgressSummary: "Objective satisfied.",
      stallCount: 0,
    },
    objectiveState: {
      status: "satisfied",
      goalType: "unknown",
      requiredProof: [],
      observedProof: ["response_ready"],
      missingProof: [],
    },
    orchestrationProtocol: "tool_loop_v1",
    orchestrator: "openhands",
    orchestratorVersion: null,
    runId: "agent-run-stream-1",
    adapter: "text_actions",
    loopState: null,
    pendingToolCall: null,
    toolTrace: [],
  };
}

function createStreamUserInputResult() {
  return {
    ...createStreamAssistResult("I need a bit more context before I can finish the plan."),
    decision: { mode: "plan", reason: "clarification needed", confidence: 0.81 },
    orchestrationProtocol: "batch_v1",
    orchestrator: undefined,
    adapter: "deterministic_batch",
    runId: "plan-run-1",
    completionStatus: "incomplete",
    missingRequirements: ["user_input_required"],
    userInputRequest: {
      requestId: "plan_req_1",
      questions: [
        {
          header: "Scope",
          id: "scope",
          question: "Which slice should we land first?",
          options: [
            { label: "Desktop bridge", description: "Wire the compat bridge and sticky /plan mode first." },
            { label: "Host API", description: "Start with the persisted host resume flow first." },
          ],
        },
      ],
    },
  };
}

describe("POST /api/v1/playground/assist stream", () => {
  beforeEach(() => {
    process.env.OPENHANDS_GATEWAY_URL = "http://127.0.0.1:8010";
    authenticatePlaygroundRequest.mockReset();
    guardPlaygroundAccess.mockReset();
    runAssist.mockReset();
    startAssistToolLoop.mockReset();
    appendSessionMessage.mockReset();
    createAgentRun.mockReset();
    createSession.mockReset();
    getSessionById.mockReset();
    listSessionMessages.mockReset();
    updateAgentRun.mockReset();
    incrementUsage.mockReset();
    getOrCreateRequestId.mockReset();

    authenticatePlaygroundRequest.mockResolvedValue({ userId: "user-1", email: "user@example.com" });
    guardPlaygroundAccess.mockResolvedValue({ allowed: true, limits: { maxOutputTokens: 2048 } });
    createSession.mockResolvedValue({ id: "sess_1" });
    createAgentRun.mockResolvedValue({ id: "agent-run-stream-1" });
    getSessionById.mockResolvedValue(null);
    listSessionMessages.mockResolvedValue([]);
    appendSessionMessage.mockResolvedValue(undefined);
    updateAgentRun.mockResolvedValue(undefined);
    incrementUsage.mockResolvedValue(undefined);
    getOrCreateRequestId.mockReturnValue("trace-1");
    const streamAssistResult = createStreamAssistResult();
    runAssist.mockResolvedValue({
      ...streamAssistResult,
      orchestrationProtocol: "batch_v1",
      orchestrator: undefined,
      runId: undefined,
      adapter: "deterministic_batch",
    });
    startAssistToolLoop.mockResolvedValue(streamAssistResult as any);
  });

  it("emits structured streaming lifecycle events before final output", async () => {
    const req = new NextRequest("http://localhost/api/v1/playground/assist", {
      method: "POST",
      body: JSON.stringify({
        task: "help me",
        stream: true,
        mode: "auto",
      }),
    });

    const res = await POST(req);
    const text = await res.text();

    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toBe("text/event-stream");
    expect(text).toContain('"event":"ack"');
    expect(text).toContain('"event":"status"');
    expect(text).toContain('"event":"activity"');
    expect(text).toContain('"event":"meta"');
    expect(text).toContain('"event":"partial"');
    expect(text).toContain('"event":"final"');
    expect(text).toContain("Hosted stream answer.");
    expect(startAssistToolLoop).toHaveBeenCalledTimes(1);
    expect(startAssistToolLoop.mock.calls[0]?.[0]?.request?.tom).toEqual({ enabled: true });
    expect(runAssist).not.toHaveBeenCalled();
  });

  it("preserves an explicit TOM override", async () => {
    const req = new NextRequest("http://localhost/api/v1/playground/assist", {
      method: "POST",
      body: JSON.stringify({
        task: "help me",
        stream: true,
        mode: "auto",
        tom: { enabled: false },
      }),
    });

    const res = await POST(req);
    await res.text();

    expect(startAssistToolLoop).toHaveBeenCalledTimes(1);
    expect(startAssistToolLoop.mock.calls[0]?.[0]?.request?.tom).toEqual({ enabled: false });
  });

  it("forwards gateway token events as token stream updates", async () => {
    startAssistToolLoop.mockImplementationOnce(async (input: any) => {
      if (typeof input?.onGatewayEvent === "function") {
        await input.onGatewayEvent({ event: "token", data: "Hosted " });
        await input.onGatewayEvent({ event: "token", data: "stream answer." });
      }
      return createStreamAssistResult("Hosted stream answer.");
    });

    const req = new NextRequest("http://localhost/api/v1/playground/assist", {
      method: "POST",
      body: JSON.stringify({
        task: "help me",
        stream: true,
        mode: "auto",
      }),
    });

    const res = await POST(req);
    const text = await res.text();

    expect(res.status).toBe(200);
    expect(text).toContain('"event":"token"');
    expect(text).toContain('"data":"Hosted "');
    expect(text).toContain('"data":"stream answer."');
    expect(text).not.toContain('"event":"partial"');
    expect(text).toContain('"event":"final"');
  });

  it("emits request_user_input without finalizing the assistant text when plan clarification is needed", async () => {
    runAssist.mockResolvedValueOnce(createStreamUserInputResult() as any);

    const req = new NextRequest("http://localhost/api/v1/playground/assist", {
      method: "POST",
      body: JSON.stringify({
        task: "plan the desktop compat work",
        stream: true,
        mode: "plan",
      }),
    });

    const res = await POST(req);
    const text = await res.text();

    expect(res.status).toBe(200);
    expect(text).toContain('"event":"request_user_input"');
    expect(text).toContain('"requestId":"plan_req_1"');
    expect(text).toContain('"event":"meta"');
    expect(text).not.toContain('"event":"final"');
  });
});

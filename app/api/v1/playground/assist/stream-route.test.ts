import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const {
  authenticatePlaygroundRequest,
  guardPlaygroundAccess,
  runAssist,
  startAssistToolLoop,
  appendSessionMessage,
  createSession,
  getSessionById,
  listSessionMessages,
  incrementUsage,
  getOrCreateRequestId,
} = vi.hoisted(() => ({
  authenticatePlaygroundRequest: vi.fn(),
  guardPlaygroundAccess: vi.fn(),
  runAssist: vi.fn(),
  startAssistToolLoop: vi.fn(),
  appendSessionMessage: vi.fn(),
  createSession: vi.fn(),
  getSessionById: vi.fn(),
  listSessionMessages: vi.fn(),
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
  createSession,
  getSessionById,
  listSessionMessages,
}));

vi.mock("@/lib/hf-router/rate-limit", () => ({
  estimateMessagesTokens: vi.fn(() => 16),
  incrementUsage,
}));

vi.mock("@/lib/api/request-meta", () => ({
  getOrCreateRequestId,
}));

import { POST } from "./route";

describe("POST /api/v1/playground/assist stream", () => {
  beforeEach(() => {
    authenticatePlaygroundRequest.mockReset();
    guardPlaygroundAccess.mockReset();
    runAssist.mockReset();
    startAssistToolLoop.mockReset();
    appendSessionMessage.mockReset();
    createSession.mockReset();
    getSessionById.mockReset();
    listSessionMessages.mockReset();
    incrementUsage.mockReset();
    getOrCreateRequestId.mockReset();

    authenticatePlaygroundRequest.mockResolvedValue({ userId: "user-1", email: "user@example.com" });
    guardPlaygroundAccess.mockResolvedValue({ allowed: true, limits: { maxOutputTokens: 2048 } });
    createSession.mockResolvedValue({ id: "sess_1" });
    getSessionById.mockResolvedValue(null);
    listSessionMessages.mockResolvedValue([]);
    appendSessionMessage.mockResolvedValue(undefined);
    incrementUsage.mockResolvedValue(undefined);
    getOrCreateRequestId.mockReturnValue("trace-1");
    runAssist.mockResolvedValue({
      decision: { mode: "auto", reason: "direct", confidence: 0.92 },
      plan: null,
      actions: [],
      final: "Hosted stream answer.",
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
      orchestrationProtocol: "batch_v1",
      adapter: "deterministic_batch",
      loopState: null,
      pendingToolCall: null,
      toolTrace: [],
    });
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
  });
});

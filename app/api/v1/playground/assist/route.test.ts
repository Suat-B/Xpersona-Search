import { describe, expect, it } from "vitest";
import {
  buildAssistResponsePayload,
  buildCompactSessionSummary,
  buildConversationHistory,
  mergeConversationHistory,
} from "@/app/api/v1/playground/assist/route-helpers";

describe("assist route helpers", () => {
  it("builds bounded conversation history from persisted rows", () => {
    const history = buildConversationHistory([
      { role: "assistant", content: "latest assistant" },
      { role: "user", content: "latest user" },
      { role: "agent", content: "skip me" },
    ]);
    expect(history.length).toBe(2);
    expect(history[0]).toEqual({ role: "user", content: "latest user" });
    expect(history[1]).toEqual({ role: "assistant", content: "latest assistant" });
  });

  it("merges persisted and client history with dedupe", () => {
    const merged = mergeConversationHistory({
      persisted: [{ role: "user", content: "a" }],
      fromClient: [{ role: "user", content: "a" }, { role: "assistant", content: "b" }],
    });
    expect(merged).toEqual([
      { role: "user", content: "a" },
      { role: "assistant", content: "b" },
    ]);
  });

  it("creates privacy-safe compact session summary", () => {
    const summary = buildCompactSessionSummary({
      history: [
        { role: "user", content: "create code in hello.py" },
        { role: "assistant", content: "```python\nprint('x')\n``` done" },
      ],
      latestTask: "create code in hello.py",
      latestFinal: "Done and ready.",
    });
    expect(summary).toContain("Latest user request:");
    expect(summary).not.toContain("```");
  });

  it("includes autonomy metadata in API payload", () => {
    const payload = buildAssistResponsePayload({
      sessionId: "sess-1",
      traceId: "trace-1",
      runId: "run-1",
      result: {
        decision: { mode: "generate", reason: "x", confidence: 0.8 },
        intent: { type: "code_edit", confidence: 0.8, delta: 0.2, clarified: false },
        reasonCodes: ["intent_code_edit"],
        autonomyDecision: {
          mode: "auto_apply_only",
          autoApplyEdits: true,
          autoRunValidation: false,
          confidence: 0.8,
          thresholds: { autoApply: 0.72, autoValidate: 0.8 },
          rationale: "ok",
        },
        validationPlan: {
          scope: "targeted",
          checks: ["npm run lint -- hello.py"],
          touchedFiles: ["hello.py"],
          reason: "targeted",
        },
        plan: null,
        edits: [],
        commands: [],
        actions: [],
        final: "done",
        logs: [],
        modelUsed: "Playground 1",
        modelMetadata: {
          contractVersion: "2026-03-actions-v1",
          adapter: "text_actions_v1",
          modelRequested: "playground-default",
          modelRequestedAlias: "playground-default",
          modelResolved: "openai/gpt-oss-120b:fastest",
          modelResolvedAlias: "playground-default",
          providerResolved: "hf",
          capabilities: {
            maxContextTokens: 262144,
            supportsStreaming: true,
            supportsReasoningStream: true,
            supportsImages: true,
            supportsNativeTools: false,
            supportsTextActions: true,
            supportsUnifiedDiff: true,
            supportsWriteFile: true,
            supportsMkdir: true,
            supportsShellCommands: true,
          },
          certification: "tool_ready",
        },
        confidence: 0.8,
        risk: { blastRadius: "low", rollbackComplexity: 1 },
        influence: { files: ["hello.py"], snippets: 1 },
        targetInference: {
          path: "hello.py",
          confidence: 0.96,
          source: "mention",
        },
        contextSelection: {
          files: [{ path: "hello.py", reason: "Explicit mention", score: 4.2 }],
          snippets: 1,
          usedCloudIndex: true,
        },
        toolState: {
          strategy: "standard",
          route: "text_actions",
          adapter: "text_actions_v1",
          actionSource: "structured_json",
          recoveryStage: "none",
          commandPolicyResolved: "safe_default",
          attempts: [],
          lastFailureCategory: null,
        },
        nextBestActions: ["Apply edits"],
        repromptStage: "none",
        actionability: {
          summary: "valid_actions",
          reason: "Action set is acceptable for this request.",
        },
        completionStatus: "complete",
        missingRequirements: [],
        lane: "interactive-fast",
        taskGraph: [
          { id: "scout", title: "Scout", status: "completed", summary: "Resolved likely target hello.py.", evidence: ["Target hello.py"] },
        ],
        checkpoint: {
          id: "run-1:checkpoint",
          status: "planned",
          summary: "Create a local checkpoint immediately before applying the prepared workspace changes.",
          touchedFiles: ["hello.py"],
          undoHint: "Use the latest Playground undo batch to revert the checkpoint.",
          createdAt: "2026-03-12T00:00:00.000Z",
        },
        receipt: {
          id: "run-1:receipt",
          title: "GENERATE run for code edit",
          status: "ready",
          intent: "code_edit",
          lane: "interactive-fast",
          route: "text_actions",
          model: "playground-default",
          provider: "hf",
          touchedFiles: ["hello.py"],
          commands: [],
          validationEvidence: ["npm run lint -- hello.py", "targeted"],
          unresolvedRisk: [],
          checkpointId: "run-1:checkpoint",
          reviewState: "ready",
          delegateRunIds: ["run-1:scout"],
          memoryWriteIds: ["run-1:memory:1"],
          generatedAt: "2026-03-12T00:00:00.000Z",
        },
        contextTrace: {
          sources: [{ kind: "retrieval", label: "hello.py", detail: "Explicit mention", confidence: 4.2 }],
          target: { path: "hello.py", source: "mention", confidence: 0.96 },
          budget: { files: 1, snippets: 1, usedCloudIndex: true },
        },
        delegateRuns: [{ id: "run-1:scout", role: "scout", status: "completed", summary: "Resolved likely target hello.py." }],
        memoryWrites: [
          {
            id: "run-1:memory:1",
            scope: "session",
            key: "sessionMemory",
            summary: "Remember hello.py as the most recent working target. (2026-03-12)",
            reason: "Successful edit-oriented runs should preserve recent target continuity.",
            status: "planned",
          },
        ],
        reviewState: {
          status: "ready",
          reason: "The run is compact enough to continue from native chat or the Playground panel.",
          recommendedAction: "Continue with the current flow or open Playground for richer execution details.",
          surface: "native_chat",
          controlActions: ["pause", "cancel", "repair"],
        },
      } as any,
    });
    expect(payload.runId).toBe("run-1");
    expect(payload.reasonCodes).toEqual(["intent_code_edit"]);
    expect(payload.autonomyDecision.mode).toBe("auto_apply_only");
    expect(payload.validationPlan.scope).toBe("targeted");
    expect(payload.repromptStage).toBe("none");
    expect(payload.actionability.summary).toBe("valid_actions");
    expect(payload.completionStatus).toBe("complete");
    expect(payload.missingRequirements).toEqual([]);
    expect(payload.model).toBe("playground-default");
    expect(payload.providerResolved).toBe("hf");
    expect(payload.targetInference).toEqual({
      path: "hello.py",
      confidence: 0.96,
      source: "mention",
    });
    expect(payload.contextSelection).toEqual({
      files: [{ path: "hello.py", reason: "Explicit mention", score: 4.2 }],
      snippets: 1,
      usedCloudIndex: true,
    });
    expect(payload.lane).toBe("interactive-fast");
    expect(payload.checkpoint.id).toBe("run-1:checkpoint");
    expect(payload.receipt.id).toBe("run-1:receipt");
    expect(payload.reviewState.status).toBe("ready");
  });
});

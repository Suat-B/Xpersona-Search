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
        confidence: 0.8,
        risk: { blastRadius: "low", rollbackComplexity: 1 },
        influence: { files: ["hello.py"], snippets: 1 },
        nextBestActions: ["Apply edits"],
        repromptStage: "none",
        actionability: {
          summary: "valid_actions",
          reason: "Action set is acceptable for this request.",
        },
      },
    });
    expect(payload.reasonCodes).toEqual(["intent_code_edit"]);
    expect(payload.autonomyDecision.mode).toBe("auto_apply_only");
    expect(payload.validationPlan.scope).toBe("targeted");
    expect(payload.repromptStage).toBe("none");
    expect(payload.actionability.summary).toBe("valid_actions");
    expect(payload.model).toBe("Playground 1");
  });
});

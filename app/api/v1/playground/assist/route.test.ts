import { describe, expect, it } from "vitest";
import {
  buildAssistResponsePayload,
  buildConversationHistory,
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

  it("builds the minimal assist response payload", () => {
    const payload = buildAssistResponsePayload({
      sessionId: "sess-1",
      traceId: "trace-1",
      result: {
        decision: { mode: "auto", reason: "x", confidence: 0.8 },
        plan: {
          objective: "Update the assist route",
          files: ["app/api/v1/playground/assist/route.ts"],
          steps: ["Update the route", "Validate the response"],
          acceptanceTests: ["git diff --check -- app/api/v1/playground/assist/route.ts"],
          risks: [],
        },
        actions: [{ type: "mkdir", path: "tmp" }],
        final: "done",
        validationPlan: {
          scope: "targeted",
          checks: ["git diff --check -- app/api/v1/playground/assist/route.ts"],
          touchedFiles: ["app/api/v1/playground/assist/route.ts"],
          reason: "targeted",
        },
        targetInference: {
          path: "app/api/v1/playground/assist/route.ts",
          confidence: 0.96,
          source: "mention",
        },
        contextSelection: {
          files: [{ path: "app/api/v1/playground/assist/route.ts", reason: "Explicit mention", score: 4.2 }],
          snippets: 1,
          usedCloudIndex: true,
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
          goalType: "code_edit",
          targetPath: "app/api/v1/playground/assist/route.ts",
          requiredProof: ["target_resolved"],
          observedProof: ["target_resolved"],
          missingProof: [],
        },
      } as any,
    });

    expect(payload).toEqual({
      sessionId: "sess-1",
      traceId: "trace-1",
      decision: { mode: "auto", reason: "x", confidence: 0.8 },
      plan: {
        objective: "Update the assist route",
        files: ["app/api/v1/playground/assist/route.ts"],
        steps: ["Update the route", "Validate the response"],
        acceptanceTests: ["git diff --check -- app/api/v1/playground/assist/route.ts"],
        risks: [],
      },
      actions: [{ type: "mkdir", path: "tmp" }],
      final: "done",
      validationPlan: {
        scope: "targeted",
        checks: ["git diff --check -- app/api/v1/playground/assist/route.ts"],
        touchedFiles: ["app/api/v1/playground/assist/route.ts"],
        reason: "targeted",
      },
      targetInference: {
        path: "app/api/v1/playground/assist/route.ts",
        confidence: 0.96,
        source: "mention",
      },
      contextSelection: {
        files: [{ path: "app/api/v1/playground/assist/route.ts", reason: "Explicit mention", score: 4.2 }],
        snippets: 1,
        usedCloudIndex: true,
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
        goalType: "code_edit",
        targetPath: "app/api/v1/playground/assist/route.ts",
        requiredProof: ["target_resolved"],
        observedProof: ["target_resolved"],
        missingProof: [],
      },
    });
  });
});

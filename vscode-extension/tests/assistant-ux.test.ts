import { describe, expect, it } from "vitest";
import {
  assessContextConfidence,
  buildClarificationActions,
  buildContextSummary,
  buildFollowUpActions,
  buildPatchConfidence,
  classifyIntent,
} from "../src/assistant-ux";

describe("assistant-ux", () => {
  it("classifies common coding intents", () => {
    expect(classifyIntent("fix route.ts")).toBe("change");
    expect(classifyIntent("explain why route.ts is failing")).toBe("explain");
    expect(classifyIntent("expand on my current files integration plan")).toBe("explain");
    expect(classifyIntent("find references to buildQwenPrompt")).toBe("find");
    expect(classifyIntent("what model am i using")).toBe("ask");
  });

  it("raises confidence when explicit targets and snippets exist", () => {
    const result = assessContextConfidence({
      intent: "change",
      resolvedFiles: ["app/api/v1/playground/models/route.ts"],
      candidateFiles: ["app/api/v1/playground/models/route.ts"],
      attachedFiles: [],
      memoryFiles: ["app/api/v1/playground/models/route.ts"],
      hasAttachedSelection: false,
      explicitReferenceCount: 1,
      selectedFilesCount: 2,
      diagnosticsCount: 1,
    });

    expect(result.confidence).toBe("high");
    expect(result.score).toBeGreaterThan(0.72);
  });

  it("builds summaries and clarification actions for low-confidence edits", () => {
    const preview = {
      activeFile: "app/api/v1/playground/models/route.ts",
      openFiles: ["app/api/v1/playground/models/route.ts"],
      candidateFiles: ["app/api/v1/playground/models/route.ts", "lib/playground/orchestration.ts"],
      attachedFiles: ["app/api/v1/playground/models/route.ts"],
      memoryFiles: ["lib/playground/orchestration.ts"],
      resolvedFiles: [],
      selectedFiles: [],
      diagnostics: [],
      intent: "change" as const,
      confidence: "low" as const,
      confidenceScore: 0.31,
      rationale: "multiple candidates",
      workspaceRoot: "c:/repo",
      attachedSelection: {
        path: "app/api/v1/playground/models/route.ts",
        summary: "export async function GET()",
      },
      snippets: [],
    };

    const summary = buildContextSummary(preview);
    const actions = buildClarificationActions({ candidateFiles: preview.candidateFiles });

    expect(summary.attachedFiles).toEqual(["app/api/v1/playground/models/route.ts"]);
    expect(summary.attachedSelection?.path).toBe("app/api/v1/playground/models/route.ts");
    expect(actions.map((action) => action.id)).toContain("search-deeper");
    expect(actions.some((action) => action.kind === "target")).toBe(true);
  });

  it("builds follow-up actions with patch confidence for edits", () => {
    const preview = {
      activeFile: "app/api/v1/playground/models/route.ts",
      openFiles: ["app/api/v1/playground/models/route.ts"],
      candidateFiles: ["app/api/v1/playground/models/route.ts"],
      attachedFiles: [],
      memoryFiles: [],
      resolvedFiles: ["app/api/v1/playground/models/route.ts"],
      selectedFiles: ["app/api/v1/playground/models/route.ts"],
      diagnostics: ["app/api/v1/playground/models/route.ts:3 missing guard"],
      intent: "change" as const,
      confidence: "high" as const,
      confidenceScore: 0.94,
      rationale: "single likely target",
      workspaceRoot: "c:/repo",
      snippets: [],
    };

    const patchConfidence = buildPatchConfidence({
      intent: "change",
      preview,
      didMutate: true,
    });
    const actions = buildFollowUpActions({
      intent: "change",
      lastTask: "fix route.ts",
      preview,
      patchConfidence,
    });

    expect(patchConfidence).toBe("high");
    expect(actions[0]?.label).toBe("High confidence");
    expect(actions.some((action) => action.id === "show-diff")).toBe(true);
  });
});

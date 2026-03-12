import { describe, expect, it } from "vitest";
import { attachAssistArtifactIdentifiers, buildAssistAgentArtifacts } from "@/lib/playground/agent-os";

describe("playground agent os artifacts", () => {
  it("builds a deep/background-oriented artifact set for heavier runs", () => {
    const artifacts = buildAssistAgentArtifacts({
      mode: "auto",
      task: "Refactor the workspace and validate everything.",
      runProfile: "deep_focus",
      context: {
        activeFile: { path: "src/app.ts" },
        diagnostics: [{ file: "src/app.ts", message: "Type error" }],
        indexedSnippets: [{ path: "src/app.ts", source: "cloud", reason: "Indexed snippet" }],
      },
      intent: { type: "code_edit", confidence: 0.92 },
      decision: { mode: "generate" },
      autonomyDecision: { mode: "auto_apply_and_validate", rationale: "confident" },
      validationPlan: {
        checks: ["npm run lint -- src/app.ts", "npm test -- src/app.ts"],
        touchedFiles: ["src/app.ts", "src/runtime.ts", "src/review.ts", "src/memory.ts"],
        reason: "High-confidence targeted validation.",
      },
      actions: [
        { type: "edit", path: "src/app.ts" },
        { type: "write_file", path: "src/runtime.ts" },
      ],
      commands: ["npm run lint -- src/app.ts"],
      risk: { blastRadius: "high", rollbackComplexity: 5 },
      targetInference: { path: "src/app.ts", source: "active_file", confidence: 0.95 },
      contextSelection: {
        files: [{ path: "src/app.ts", reason: "Active file", score: 0.9 }],
        snippets: 12,
        usedCloudIndex: true,
      },
      toolState: { route: "text_actions" },
      modelMetadata: { modelResolvedAlias: "playground-default", providerResolved: "hf" },
      completionStatus: "complete",
      missingRequirements: [],
      nextBestActions: ["Apply edits"],
      workspaceMemory: { workspaceFingerprint: "workspace-1", enabled: true, summary: "Recent TypeScript runtime work" },
      now: new Date("2026-03-12T00:00:00.000Z"),
    });

    expect(artifacts.lane).toBe("background-heavy");
    expect(artifacts.taskGraph[0].id).toBe("scout");
    expect(artifacts.checkpoint.status).toBe("planned");
    expect(artifacts.reviewState.status).toBe("needs_attention");
    expect(artifacts.receipt.model).toBe("playground-default");
  });

  it("hydrates artifact ids with the run id", () => {
    const hydrated = attachAssistArtifactIdentifiers(
      {
        lane: "interactive-fast",
        taskGraph: [{ id: "scout", title: "Scout", status: "completed", summary: "Resolved target.", evidence: [] }],
        checkpoint: {
          id: "pending-checkpoint",
          status: "planned",
          summary: "Create checkpoint",
          touchedFiles: ["hello.py"],
          undoHint: "Undo",
          createdAt: "2026-03-12T00:00:00.000Z",
        },
        receipt: {
          id: "pending-receipt",
          title: "Receipt",
          status: "ready",
          intent: "code_edit",
          lane: "interactive-fast",
          route: "text_actions",
          model: "playground-default",
          provider: "hf",
          touchedFiles: ["hello.py"],
          commands: [],
          validationEvidence: [],
          unresolvedRisk: [],
          checkpointId: "pending-checkpoint",
          reviewState: "ready",
          delegateRunIds: ["pending-scout"],
          memoryWriteIds: ["pending-memory-1"],
          generatedAt: "2026-03-12T00:00:00.000Z",
        },
        contextTrace: {
          sources: [],
          target: { path: "hello.py", source: "mention", confidence: 0.9 },
          budget: { files: 1, snippets: 1, usedCloudIndex: true },
        },
        delegateRuns: [{ id: "pending-scout", role: "scout", status: "completed", summary: "Resolved target." }],
        memoryWrites: [{ id: "pending-memory-1", scope: "session", key: "sessionMemory", summary: "Remember hello.py", reason: "Continuity", status: "planned" }],
        reviewState: {
          status: "ready",
          reason: "Ready",
          recommendedAction: "Continue",
          surface: "native_chat",
          controlActions: ["pause", "cancel", "repair"],
        },
      },
      { runId: "run-1", traceId: "trace-1" }
    );

    expect(hydrated.checkpoint.id).toBe("run-1:checkpoint");
    expect(hydrated.receipt.id).toBe("run-1:receipt");
    expect(hydrated.delegateRuns[0].id).toBe("run-1:scout");
    expect(hydrated.memoryWrites[0].id).toBe("run-1:memory:1");
  });
});

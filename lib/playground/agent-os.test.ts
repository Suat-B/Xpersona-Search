import { describe, expect, it } from "vitest";
import { attachAssistArtifactIdentifiers, buildAssistAgentArtifacts } from "@/lib/playground/agent-os";

describe("playground agent os artifacts", () => {
  it("builds receipt, checkpoint, and review artifacts for an assist run", () => {
    const artifacts = buildAssistAgentArtifacts({
      mode: "auto",
      task: "Update hello.py",
      runProfile: "standard",
      intent: { type: "code_edit", confidence: 0.9 },
      decision: { mode: "generate" },
      autonomyDecision: { mode: "auto_apply_only", rationale: "Single-file change." },
      validationPlan: {
        checks: ["git diff --check -- hello.py"],
        touchedFiles: ["hello.py"],
        reason: "Targeted quick validation.",
      },
      actions: [{ type: "edit", path: "hello.py" }],
      commands: [],
      risk: { blastRadius: "low", rollbackComplexity: 1 },
      targetInference: { path: "hello.py", source: "mention", confidence: 0.95 },
      contextSelection: {
        files: [{ path: "hello.py", reason: "Explicit mention", score: 4.2 }],
        snippets: 1,
        usedCloudIndex: true,
      },
      toolState: { route: "text_actions" },
      modelMetadata: { modelResolvedAlias: "playground-default", providerResolved: "hf" },
      completionStatus: "complete",
      missingRequirements: [],
      nextBestActions: ["Apply edits"],
      now: new Date("2026-03-12T00:00:00.000Z"),
    });

    expect(artifacts.lane).toBe("interactive-fast");
    expect(artifacts.checkpoint.status).toBe("planned");
    expect(artifacts.receipt.model).toBe("playground-default");
    expect(artifacts.reviewState.status).toBe("ready");
  });

  it("hydrates pending artifact identifiers with run and trace ids", () => {
    const hydrated = attachAssistArtifactIdentifiers(
      {
        lane: "interactive-fast",
        taskGraph: [],
        checkpoint: {
          id: "pending-checkpoint",
          status: "planned",
          summary: "Create checkpoint",
          touchedFiles: ["hello.py"],
          undoHint: "Use undo.",
          createdAt: "2026-03-12T00:00:00.000Z",
        },
        receipt: {
          id: "pending-receipt",
          title: "Run receipt",
          status: "ready",
          intent: "code_edit",
          lane: "interactive-fast",
          route: "text_actions",
          model: "playground-default",
          provider: "playground",
          touchedFiles: ["hello.py"],
          commands: [],
          validationEvidence: [],
          unresolvedRisk: [],
          checkpointId: "pending-checkpoint",
          reviewState: "ready",
          delegateRunIds: ["pending-scout"],
          memoryWriteIds: ["pending-memory"],
          generatedAt: "2026-03-12T00:00:00.000Z",
        },
        contextTrace: {
          sources: [],
          target: { path: "hello.py", source: "mention", confidence: 0.9 },
          budget: { files: 1, snippets: 1, usedCloudIndex: true },
        },
        delegateRuns: [{ id: "pending-scout", role: "scout", status: "completed", summary: "done" }],
        memoryWrites: [{ id: "pending-memory", scope: "session", key: "target", summary: "hello.py", reason: "recent target", status: "planned" }],
        reviewState: {
          status: "ready",
          reason: "Looks good.",
          recommendedAction: "Continue.",
          surface: "native_chat",
          controlActions: ["pause", "cancel"],
        },
      },
      { runId: "run-1", traceId: "trace-1" }
    );

    expect(hydrated.checkpoint.id).toBe("run-1:checkpoint");
    expect(hydrated.receipt.id).toBe("run-1:receipt");
    expect(hydrated.receipt.provider).toBe("playground:trace-1");
    expect(hydrated.delegateRuns[0]?.id).toBe("run-1:scout");
    expect(hydrated.memoryWrites[0]?.id).toBe("run-1:memory:1");
  });
});

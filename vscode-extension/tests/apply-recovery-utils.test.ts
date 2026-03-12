import { describe, expect, it } from "vitest";
import {
  buildLocalApplyRetryTask,
  collapseConflictingFileActions,
  classifyLocalApplyFailure,
  isNoContentDeltaReason,
  nextLocalRecoveryStage,
} from "../src/apply-recovery-utils";

describe("apply recovery utils", () => {
  it("classifies invalid patch failures as retryable", () => {
    const result = classifyLocalApplyFailure({
      actionKind: "edit",
      status: "rejected_invalid_patch",
      reason: "Unsupported patch format.",
      changed: false,
      path: "One/strategies/pending/Emergent_Swarm_Intelligence.pine",
      targetExistedBefore: true,
    });
    expect(result.category).toBe("unsupported_patch_shape");
    expect(result.retryable).toBe(true);
  });

  it("classifies no-op apply results as no_content_delta", () => {
    const result = classifyLocalApplyFailure({
      actionKind: "edit",
      status: "applied",
      reason: "Patch matched file context but did not change content.",
      changed: false,
      path: "hello.py",
      targetExistedBefore: true,
    });
    expect(result.category).toBe("no_content_delta");
  });

  it("detects no-content-delta validation reasons", () => {
    expect(isNoContentDeltaReason("no_content_delta:ta.atr")).toBe(true);
    expect(isNoContentDeltaReason("No file content changed after local apply.")).toBe(true);
    expect(isNoContentDeltaReason("validation_failed:ta.atr")).toBe(false);
  });

  it("keeps only the last file mutation per path in a single run", () => {
    const result = collapseConflictingFileActions([
      { type: "edit", path: "ta.atr", patch: "diff --git a/ta.atr b/ta.atr" },
      { type: "command", command: "npm test" },
      { type: "write_file", path: "ta.atr", content: "latest" },
      { type: "edit", path: "other.ts", patch: "diff --git a/other.ts b/other.ts" },
    ]);

    expect(result.actions).toEqual([
      { type: "command", command: "npm test" },
      { type: "write_file", path: "ta.atr", content: "latest" },
      { type: "edit", path: "other.ts", patch: "diff --git a/other.ts b/other.ts" },
    ]);
    expect(result.collapsedPaths).toEqual(["ta.atr"]);
  });

  it("advances through recovery stages and adds pine specialization last for structural failures", () => {
    expect(nextLocalRecoveryStage([], "hello.py")).toBe("patch_repair");
    expect(nextLocalRecoveryStage(["patch_repair"], "hello.py")).toBe("target_path_repair");
    expect(nextLocalRecoveryStage(["patch_repair", "target_path_repair"], "hello.py")).toBe("single_file_rewrite");
    expect(nextLocalRecoveryStage(["patch_repair", "target_path_repair", "single_file_rewrite"], "hello.py")).toBeNull();
    expect(nextLocalRecoveryStage(["patch_repair", "target_path_repair", "single_file_rewrite"], "x.pine")).toBe("pine_specialization");
  });

  it("jumps directly to rewrite-oriented recovery for no-content-delta failures", () => {
    expect(nextLocalRecoveryStage([], "hello.py", "no_content_delta")).toBe("single_file_rewrite");
    expect(nextLocalRecoveryStage(["single_file_rewrite"], "hello.py", "no_content_delta")).toBeNull();
    expect(nextLocalRecoveryStage([], "x.pine", "no_content_delta")).toBe("pine_specialization");
    expect(nextLocalRecoveryStage(["pine_specialization"], "x.pine", "no_content_delta")).toBe("single_file_rewrite");
  });

  it("builds a single-file rewrite retry prompt with exact target binding", () => {
    const task = buildLocalApplyRetryTask({
      objective: "create a trailing stop loss",
      filePath: "One/strategies/pending/Emergent_Swarm_Intelligence.pine",
      category: "invalid_patch",
      reason: "the patch was invalid or malformed",
      stage: "single_file_rewrite",
    });
    expect(task).toContain("Target file: One/strategies/pending/Emergent_Swarm_Intelligence.pine");
    expect(task).toContain("Recovery stage: single_file_rewrite.");
    expect(task).toContain("Return a single write_file action");
    expect(task).toContain("must differ from the current workspace file");
  });
});

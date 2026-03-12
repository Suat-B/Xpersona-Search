import { describe, expect, it } from "vitest";
import {
  buildLocalApplyRetryTask,
  classifyLocalApplyFailure,
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

  it("advances through recovery stages and adds pine specialization last", () => {
    expect(nextLocalRecoveryStage([], "hello.py")).toBe("patch_repair");
    expect(nextLocalRecoveryStage(["patch_repair"], "hello.py")).toBe("target_path_repair");
    expect(nextLocalRecoveryStage(["patch_repair", "target_path_repair"], "hello.py")).toBe("single_file_rewrite");
    expect(nextLocalRecoveryStage(["patch_repair", "target_path_repair", "single_file_rewrite"], "hello.py")).toBeNull();
    expect(nextLocalRecoveryStage(["patch_repair", "target_path_repair", "single_file_rewrite"], "x.pine")).toBe("pine_specialization");
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
  });
});

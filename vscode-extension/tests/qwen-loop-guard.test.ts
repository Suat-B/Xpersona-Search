import { describe, expect, it } from "vitest";
import { isLikelyClarificationContinuation } from "../src/qwen-loop-guard";

describe("qwen-loop-guard", () => {
  it("treats short affirmative replies as clarification continuations", () => {
    expect(isLikelyClarificationContinuation("yes usre")).toBe(true);
    expect(isLikelyClarificationContinuation("sure, go ahead")).toBe(true);
  });

  it("does not treat real task text as a clarification continuation", () => {
    expect(isLikelyClarificationContinuation("please create a trailing stop loss in route.ts")).toBe(false);
    expect(isLikelyClarificationContinuation("fix the auth flow in app/api/v1/playground/models/route.ts")).toBe(
      false
    );
  });
});

import { describe, expect, it } from "vitest";
import { isRetryableGitHubError } from "../github";

describe("isRetryableGitHubError", () => {
  it("detects timeout-like errors", () => {
    expect(isRetryableGitHubError(new Error("ETIMEDOUT while requesting"))).toBe(true);
    expect(isRetryableGitHubError(new Error("socket hang up"))).toBe(true);
    expect(isRetryableGitHubError(new Error("504 gateway timeout"))).toBe(true);
  });

  it("does not mark validation errors retryable", () => {
    expect(isRetryableGitHubError(new Error("Validation Failed"))).toBe(false);
  });
});


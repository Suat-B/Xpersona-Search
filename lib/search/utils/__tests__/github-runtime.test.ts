import { describe, expect, it } from "vitest";
import {
  calculateRetryDelayMs,
  createGitHubRequestContext,
  withGithubTimeout,
} from "../github";

describe("github runtime helpers", () => {
  it("uses retry-after header when present", () => {
    const err = {
      response: {
        headers: {
          "retry-after": "2",
        },
      },
    };
    const delay = calculateRetryDelayMs(err, 1);
    expect(delay).toBeGreaterThanOrEqual(1900);
    expect(delay).toBeLessThanOrEqual(30000);
  });

  it("tracks timeout counts in context", async () => {
    const ctx = createGitHubRequestContext();
    await expect(
      withGithubTimeout(
        async () => {
          await new Promise((resolve) => setTimeout(resolve, 25));
          return "ok";
        },
        "timeout-test",
        5,
        ctx
      )
    ).rejects.toThrow(/GitHub timeout/i);
    expect(ctx.timeouts).toBe(1);
  });
});

import { describe, expect, it } from "vitest";
import { canProceed, getSourceHealth, recordFailure, recordSuccess, resetSourceHealth } from "../source-health";

describe("source-health circuit breaker", () => {
  it("opens after threshold failures and can recover", () => {
    const source = "TEST_SOURCE";
    resetSourceHealth(source);

    expect(canProceed(source)).toBe(true);
    recordFailure(source);
    recordFailure(source);
    recordFailure(source);
    expect(getSourceHealth(source).state).toBe("CLOSED");

    recordFailure(source);
    expect(getSourceHealth(source).state).toBe("OPEN");
    expect(canProceed(source)).toBe(false);

    recordSuccess(source);
    expect(getSourceHealth(source).state).toBe("CLOSED");
    expect(canProceed(source)).toBe(true);
  });
});


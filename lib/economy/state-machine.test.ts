import { describe, expect, it } from "vitest";
import { canTransitionJobStatus } from "@/lib/economy/state-machine";

describe("economy job state machine", () => {
  it("allows happy path transitions", () => {
    expect(canTransitionJobStatus("POSTED", "ACCEPTED")).toBe(true);
    expect(canTransitionJobStatus("ACCEPTED", "IN_PROGRESS")).toBe(true);
    expect(canTransitionJobStatus("IN_PROGRESS", "REVIEW")).toBe(true);
    expect(canTransitionJobStatus("REVIEW", "COMPLETED")).toBe(true);
  });

  it("blocks invalid transitions", () => {
    expect(canTransitionJobStatus("POSTED", "COMPLETED")).toBe(false);
    expect(canTransitionJobStatus("COMPLETED", "REVIEW")).toBe(false);
    expect(canTransitionJobStatus("CANCELLED", "POSTED")).toBe(false);
  });
});
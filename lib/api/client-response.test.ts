import { describe, expect, it } from "vitest";
import {
  extractClientErrorMessage,
  unwrapClientResponse,
} from "./client-response";

describe("unwrapClientResponse", () => {
  it("unwraps v1 success envelopes", () => {
    const payload = { success: true, data: { results: [1, 2] } };
    expect(unwrapClientResponse<{ results: number[] }>(payload)).toEqual({ results: [1, 2] });
  });

  it("passes through legacy payloads", () => {
    const payload = { results: [1, 2] };
    expect(unwrapClientResponse<{ results: number[] }>(payload)).toEqual(payload);
  });
});

describe("extractClientErrorMessage", () => {
  it("reads v1 error message", () => {
    const payload = { success: false, error: { message: "bad request" } };
    expect(extractClientErrorMessage(payload)).toBe("bad request");
  });

  it("reads legacy error strings", () => {
    expect(extractClientErrorMessage({ error: "legacy fail" })).toBe("legacy fail");
  });
});


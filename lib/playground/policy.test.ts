import { describe, expect, it } from "vitest";
import { validateExecuteAction } from "@/lib/playground/policy";

describe("playground execute policy", () => {
  it("allows safe mkdir action", () => {
    const result = validateExecuteAction({ type: "mkdir", path: "vs_code_test" });
    expect(result.ok).toBe(true);
  });

  it("blocks unsafe mkdir traversal", () => {
    const result = validateExecuteAction({ type: "mkdir", path: "../outside" });
    expect(result.ok).toBe(false);
  });

  it("blocks absolute write_file path", () => {
    const result = validateExecuteAction({ type: "write_file", path: "/tmp/x.txt", content: "x" });
    expect(result.ok).toBe(false);
  });
});


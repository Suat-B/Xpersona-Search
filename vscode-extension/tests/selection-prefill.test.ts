import { describe, expect, it } from "vitest";
import { buildSelectionPrefill } from "../src/selection-prefill";

describe("selection prefill", () => {
  it("includes the workspace path, line, and selected text", () => {
    const result = buildSelectionPrefill({
      path: "app/api/v1/playground/models/route.ts",
      line: 12,
      selectedText: "return Response.json({ ok: true });",
    });

    expect(result).toContain("@app/api/v1/playground/models/route.ts:12");
    expect(result).toContain("return Response.json({ ok: true });");
  });

  it("falls back to plain selected text when no path is available", () => {
    expect(
      buildSelectionPrefill({
        path: null,
        line: 4,
        selectedText: "const value = 1;",
      })
    ).toBe("const value = 1;");
  });
});

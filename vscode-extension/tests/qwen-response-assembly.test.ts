import { describe, expect, it } from "vitest";
import { mergeAssistantResponseText } from "../src/qwen-response-assembly";

describe("qwen-response-assembly", () => {
  it("keeps the longer response when a later assistant snapshot is only a shorter prefix", () => {
    const merged = mergeAssistantResponseText(
      "Let me look carefully.\n\nPossible scenarios:\n1. They might be confused about where the file lives.",
      "Let me look carefully.\n\nPossible scenarios:"
    );

    expect(merged).toContain("They might be confused about where the file lives");
    expect(merged).not.toBe("Let me look carefully.\n\nPossible scenarios:");
  });

  it("promotes a later snapshot when it extends the earlier text", () => {
    const merged = mergeAssistantResponseText(
      "I checked route.ts",
      "I checked route.ts and found the bug in the response handler."
    );

    expect(merged).toBe("I checked route.ts and found the bug in the response handler.");
  });

  it("stitches overlapping fragments instead of duplicating them", () => {
    const merged = mergeAssistantResponseText(
      "I found the issue in route.ts.\n\nThe fix",
      "The fix is to return the final assistant text instead of the last snapshot."
    );

    expect(merged).toBe(
      "I found the issue in route.ts.\n\nThe fix is to return the final assistant text instead of the last snapshot."
    );
  });

  it("keeps distinct assistant segments when the SDK emits separate text blocks", () => {
    const merged = mergeAssistantResponseText(
      "I'll inspect the workspace first.",
      "The response is truncating because later SDK events overwrite earlier text."
    );

    expect(merged).toContain("I'll inspect the workspace first.");
    expect(merged).toContain("The response is truncating because later SDK events overwrite earlier text.");
    expect(merged).toContain("\n\n");
  });
});

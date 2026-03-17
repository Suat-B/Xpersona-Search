import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/playground/orchestration", () => ({
  buildContextPrompt: () => "context",
  parseStructuredAssistResponse: () => ({
    final: "fallback",
    actions: [],
  }),
}));

import { parseToolLoopJson } from "@/lib/playground/tool-loop-adapters";

describe("tool loop adapters", () => {
  it("accepts a single tool call response", () => {
    const parsed = parseToolLoopJson(
      JSON.stringify({
        toolCall: {
          id: "call_read",
          name: "read_file",
          arguments: { path: "src/app.ts" },
          kind: "observe",
          summary: "Inspect src/app.ts",
        },
      }),
      ["read_file"]
    );

    expect(parsed?.toolCall?.name).toBe("read_file");
    expect(parsed?.toolCall?.arguments.path).toBe("src/app.ts");
  });

  it("rejects text-actions responses that try to return batch actions", () => {
    const parsed = parseToolLoopJson(
      JSON.stringify({
        final: "Prepared a patch.",
        actions: [
          {
            type: "edit",
            path: "src/app.ts",
            patch: "@@ -1,1 +1,1 @@\n-old\n+new",
          },
        ],
      }),
      ["edit"]
    );

    expect(parsed).toBeNull();
  });
});

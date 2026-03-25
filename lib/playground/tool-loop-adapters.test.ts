import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/playground/orchestration", () => ({
  buildContextPrompt: () => "context",
  parseStructuredAssistResponse: () => ({
    final: "fallback",
    actions: [],
  }),
}));

import { parseToolLoopJson, requestToolLoopTurn } from "@/lib/playground/tool-loop-adapters";

afterEach(() => {
  delete process.env.OPENHANDS_GATEWAY_URL;
  delete process.env.OPENHANDS_GATEWAY_API_KEY;
  delete process.env.HF_ROUTER_TOKEN;
  delete process.env.HF_TOKEN;
  delete process.env.HUGGINGFACE_TOKEN;
  vi.unstubAllGlobals();
});

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

  it("prefers the OpenHands gateway when configured", async () => {
    process.env.OPENHANDS_GATEWAY_URL = "http://localhost:8010";
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: true,
        json: async () => ({
          runId: "oh_run_1",
          adapter: "text_actions",
          toolCall: {
            id: "call_read",
            name: "read_file",
            arguments: { path: "src/app.ts" },
            kind: "observe",
            summary: "Inspect src/app.ts",
          },
          logs: ["gateway=openhands"],
          version: "test-gateway",
        }),
      }))
    );

    const result = await requestToolLoopTurn({
      request: {
        mode: "auto",
        task: "fix src/app.ts",
        model: "playground-default",
        context: {
          activeFile: { path: "src/app.ts", content: "export const x = 1;" },
        },
      },
      targetInference: {
        path: "src/app.ts",
        confidence: 0.9,
        source: "mention",
      },
      contextSelection: {
        files: [{ path: "src/app.ts", reason: "Primary inferred target" }],
        snippets: 0,
        usedCloudIndex: false,
      },
      fallbackPlan: {
        objective: "fix src/app.ts",
        files: ["src/app.ts"],
        steps: ["Inspect src/app.ts"],
        acceptanceTests: [],
        risks: [],
      },
      toolTrace: [],
      loopSummary: {
        stepCount: 0,
        mutationCount: 0,
        repairCount: 0,
      },
      availableTools: ["read_file", "edit", "create_checkpoint"],
    });

    expect(result.orchestrator).toBe("openhands");
    expect(result.orchestratorRunId).toBe("oh_run_1");
    expect(result.toolCall?.name).toBe("read_file");
    expect(result.logs).toContain("adapter=openhands_gateway");
  });

  it("fails closed when OpenHands is not configured", async () => {
    await expect(
      requestToolLoopTurn({
        request: {
          mode: "auto",
          task: "fix src/app.ts",
          model: "playground-default",
          context: {
            activeFile: { path: "src/app.ts", content: "export const x = 1;" },
          },
        },
        targetInference: {
          path: "src/app.ts",
          confidence: 0.9,
          source: "mention",
        },
        contextSelection: {
          files: [{ path: "src/app.ts", reason: "Primary inferred target" }],
          snippets: 0,
          usedCloudIndex: false,
        },
        fallbackPlan: {
          objective: "fix src/app.ts",
          files: ["src/app.ts"],
          steps: ["Inspect src/app.ts"],
          acceptanceTests: [],
          risks: [],
        },
        toolTrace: [],
        loopSummary: {
          stepCount: 0,
          mutationCount: 0,
          repairCount: 0,
        },
        availableTools: ["read_file", "edit", "create_checkpoint"],
      })
    ).rejects.toThrow(/OpenHands is not configured/i);
  });
});

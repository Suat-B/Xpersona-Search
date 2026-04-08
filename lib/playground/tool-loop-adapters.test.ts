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

  it("accepts desktop discovery tool calls", () => {
    const parsed = parseToolLoopJson(
      JSON.stringify({
        toolCall: {
          id: "call_apps",
          name: "desktop_list_apps",
          arguments: { limit: 12, refresh: true },
          kind: "observe",
          summary: "Inspect installed apps before launching anything",
        },
      }),
      ["desktop_list_apps"]
    );

    expect(parsed?.toolCall?.name).toBe("desktop_list_apps");
    expect(parsed?.toolCall?.arguments.limit).toBe(12);
    expect(parsed?.toolCall?.arguments.refresh).toBe(true);
  });

  it("rejects browser-native tool calls because browser work is internal to OpenHands", () => {
    const parsed = parseToolLoopJson(
      JSON.stringify({
        toolCall: {
          id: "call_browser_snapshot",
          name: "browser_snapshot_dom",
          arguments: { pageId: "page_1", limit: 10 },
          kind: "observe",
          summary: "Inspect the current Gmail DOM before acting",
        },
      }),
      ["read_file"]
    );

    expect(parsed).toBeNull();
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

  it("recovers a tool call nested inside final JSON text", () => {
    const parsed = parseToolLoopJson(
      JSON.stringify({
        final: JSON.stringify({
          toolCall: {
            id: "call_write",
            name: "write_file",
            arguments: {
              path: "test/duration.test.js",
              content: "import test from 'node:test';\n",
            },
            kind: "mutate",
          },
        }),
      }),
      ["write_file"]
    );

    expect(parsed?.toolCall?.name).toBe("write_file");
    expect(parsed?.toolCall?.arguments.path).toBe("test/duration.test.js");
  });

  it("decodes likely double-escaped write_file content before execution", () => {
    const parsed = parseToolLoopJson(
      JSON.stringify({
        toolCall: {
          id: "call_write_json",
          name: "write_file",
          arguments: {
            path: "duration-toolkit/package.json",
            content: "{\\n  \\\"name\\\": \\\"duration-toolkit\\\"\\n}",
          },
          kind: "mutate",
        },
      }),
      ["write_file"]
    );

    expect(parsed?.toolCall?.arguments.content).toBe('{\n  "name": "duration-toolkit"\n}');
  });

  it("prefers the OpenHands gateway when configured", async () => {
    process.env.OPENHANDS_GATEWAY_URL = "http://localhost:8010";
    const fetchMock = vi.fn(async () => ({
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
      }));
    vi.stubGlobal("fetch", fetchMock);

    const result = await requestToolLoopTurn({
      request: {
        mode: "auto",
        task: "fix src/app.ts",
        model: "playground-default",
        context: {
          activeFile: { path: "src/app.ts", content: "export const x = 1;" },
        },
      },
      tom: {
        enabled: true,
        userKey: "hashed-user-key",
        sessionId: "sess-1",
        traceId: "trace-1",
      },
      mcp: {
        mcpServers: {
          Docs: {
            url: "https://example.com/mcp",
            transport: "http",
          },
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
    const [, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    const body = JSON.parse(String(init.body)) as {
      tom?: { userKey?: string; enabled?: boolean };
      mcp?: { mcpServers?: Record<string, Record<string, unknown>> };
    };
    expect(body.tom).toEqual(
      expect.objectContaining({
        enabled: true,
        userKey: "hashed-user-key",
      })
    );
    expect(body.mcp?.mcpServers?.Docs).toEqual({
      url: "https://example.com/mcp",
      transport: "http",
    });
  });

  it("recovers a gateway tool call that leaked into final text", async () => {
    process.env.OPENHANDS_GATEWAY_URL = "http://localhost:8010";
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: true,
        json: async () => ({
          runId: "oh_run_recover_1",
          adapter: "text_actions",
          final: JSON.stringify({
            toolCall: {
              id: "call_write",
              name: "write_file",
              arguments: {
                path: "test/duration.test.js",
                content: "import test from 'node:test';\n",
              },
              kind: "mutate",
            },
          }),
          logs: ["gateway=openhands"],
          version: "test-gateway",
        }),
      }))
    );

    const result = await requestToolLoopTurn({
      request: {
        mode: "auto",
        task: "add the missing test file",
        model: "playground-default",
      },
      targetInference: {
        path: "test/duration.test.js",
        confidence: 0.8,
        source: "mention",
      },
      contextSelection: {
        files: [{ path: "test/duration.test.js", reason: "Requested test target" }],
        snippets: 0,
        usedCloudIndex: false,
      },
      fallbackPlan: {
        objective: "add the missing test file",
        files: ["test/duration.test.js"],
        steps: ["Create the test file"],
        acceptanceTests: [],
        risks: [],
      },
      toolTrace: [],
      loopSummary: {
        stepCount: 3,
        mutationCount: 1,
        repairCount: 0,
      },
      availableTools: ["write_file"],
    });

    expect(result.toolCall?.name).toBe("write_file");
    expect(result.toolCall?.arguments.path).toBe("test/duration.test.js");
    expect(result.logs).toContain("repair=final_toolcall_recovered");
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

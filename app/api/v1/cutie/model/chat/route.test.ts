import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const { authenticatePlaygroundRequest, unauthorized } = vi.hoisted(() => ({
  authenticatePlaygroundRequest: vi.fn(),
  unauthorized: vi.fn(() => new Response("unauthorized", { status: 401 })),
}));

vi.mock("@/lib/playground/auth", () => ({
  authenticatePlaygroundRequest,
}));

vi.mock("@/lib/playground/http", () => ({
  unauthorized,
}));

import { POST } from "./route";
import { normalizeStructuredCutieTurnResult, stripCutieToolArtifactText } from "./structured";

describe("POST /api/v1/cutie/model/chat", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    authenticatePlaygroundRequest.mockResolvedValue({ userId: "user-1" });
    vi.stubGlobal("fetch", vi.fn());
    process.env.HF_TOKEN = "hf_test_token";
  });

  it("strips raw TOOL_CALL markup from visible assistant text", () => {
    const text = [
      "I will inspect the file first.",
      "",
      "[TOOL_CALL]",
      '{"tool_call":{"name":"read_file","arguments":{"path":"foo.pine","startLine":1,"endLine":81}}}',
      "[/TOOL_CALL]",
    ].join("\n");

    expect(stripCutieToolArtifactText(text)).toBe("I will inspect the file first.");
  });

  it("normalizes textual TOOL_CALL markup into a native tool batch", () => {
    const normalized = normalizeStructuredCutieTurnResult({
      assistantText:
        '[TOOL_CALL]\n{"tool_call":{"name":"read_file","arguments":{"path":"foo.pine","startLine":1,"endLine":81}}}\n[/TOOL_CALL]',
      allowedToolNames: ["read_file"],
      maxToolsPerBatch: 1,
    });

    expect(normalized.response.type).toBe("tool_batch");
    if (normalized.response.type !== "tool_batch") {
      throw new Error("expected tool_batch response");
    }
    expect(normalized.response.toolCalls[0]).toMatchObject({
      name: "read_file",
      arguments: {
        path: "foo.pine",
        startLine: 1,
        endLine: 81,
      },
    });
    expect(normalized.assistantText).toBe("");
  });

  it("normalizes top-level toolName json into a native tool batch", () => {
    const normalized = normalizeStructuredCutieTurnResult({
      assistantText:
        '{"toolName":"patch_file","arguments":{"path":"foo.pine","baseRevision":"sha1:abc","edits":[{"startLine":10,"deleteLineCount":0,"replacement":"next"}]}}',
      allowedToolNames: ["patch_file"],
      maxToolsPerBatch: 1,
    });

    expect(normalized.response.type).toBe("tool_batch");
    if (normalized.response.type !== "tool_batch") {
      throw new Error("expected tool_batch response");
    }
    expect(normalized.response.toolCalls[0]).toMatchObject({
      name: "patch_file",
      arguments: {
        path: "foo.pine",
        baseRevision: "sha1:abc",
      },
    });
    expect(normalized.normalizationSource).toBe("text_tool_artifact");
    expect(normalized.artifactExtractionShape).toBe("top_level_tool_name");
    expect(normalized.assistantText).toBe("");
  });

  it("prefers upstream native tool_calls when they are present", () => {
    const normalized = normalizeStructuredCutieTurnResult({
      assistantText: "Working on it now.",
      upstreamToolCalls: [
        {
          id: "call_1",
          function: {
            name: "patch_file",
            arguments:
              '{"path":"foo.pine","baseRevision":"sha1:abc","edits":[{"startLine":10,"deleteLineCount":1,"replacement":"next"}]}',
          },
        },
      ],
      allowedToolNames: ["patch_file"],
      maxToolsPerBatch: 1,
    });

    expect(normalized.response.type).toBe("tool_batch");
    if (normalized.response.type !== "tool_batch") {
      throw new Error("expected tool_batch response");
    }
    expect(normalized.response.toolCalls[0]).toMatchObject({
      id: "call_1",
      name: "patch_file",
    });
    expect(normalized.assistantText).toBe("Working on it now.");
  });

  it("returns structured tool_batch responses for non-stream native protocol requests", async () => {
    const fetchMock = vi.mocked(fetch);
    fetchMock.mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          choices: [
            {
              message: {
                content:
                  '[TOOL_CALL]\n{"tool_call":{"name":"read_file","arguments":{"path":"foo.pine","startLine":1,"endLine":81}}}\n[/TOOL_CALL]',
              },
            },
          ],
          model: "openai/gpt-oss-120b:fastest",
          usage: { completion_tokens: 12 },
        }),
        {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }
      )
    );

    const req = new NextRequest("http://localhost/api/v1/cutie/model/chat", {
      method: "POST",
      body: JSON.stringify({
        protocol: "cutie_tools_v2",
        stream: false,
        model: "openai/gpt-oss-120b:fastest",
        messages: [{ role: "user", content: "please inspect foo.pine" }],
        tools: [
          {
            name: "read_file",
            description: "Read a file from the workspace.",
            kind: "observe",
            domain: "workspace",
            inputSchema: { type: "object", properties: { path: { type: "string" } } },
          },
        ],
        maxToolsPerBatch: 1,
      }),
      headers: { "Content-Type": "application/json" },
    });

    const res = await POST(req);
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.response.type).toBe("tool_batch");
    expect(json.response.toolCalls[0].name).toBe("read_file");
    expect(json.modelAdapter).toBe("canonical_portability_v1");
    expect(json.protocolMode).toBe("text_extraction");
    expect(json.orchestratorContractVersion).toBe("canonical_portability_v1");
    expect(json.portabilityMode).toBe("canonical_default");
    expect(json.transportModeUsed).toBe("text_extraction");
    expect(json.normalizationSource).toBe("text_tool_artifact");
    expect(json.normalizationTier).toBe("artifact_rescue");
    expect(json.artifactExtractionShape).toBe("tool_call_wrapper");

    const upstreamBody = JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body || "{}")) as Record<string, unknown>;
    expect(upstreamBody.tool_choice).toBeUndefined();
    expect(Array.isArray(upstreamBody.tools)).toBe(false);
  });

  it("streams native tool batches instead of leaking raw tool text", async () => {
    const fetchMock = vi.mocked(fetch);
    const encoder = new TextEncoder();
    const upstreamBody = new ReadableStream({
      start(controller) {
        controller.enqueue(
          encoder.encode(
            'data: {"choices":[{"delta":{"tool_calls":[{"index":0,"id":"call_1","function":{"name":"read_file","arguments":"{\\"path\\":\\"foo.pine\\",\\"startLine\\":1"}}]}}]}\n\n'
          )
        );
        controller.enqueue(
          encoder.encode(
            'data: {"choices":[{"delta":{"tool_calls":[{"index":0,"function":{"arguments":",\\"endLine\\":81}"}}],"finish_reason":"tool_calls"}}]}\n\n'
          )
        );
        controller.enqueue(encoder.encode("data: [DONE]\n\n"));
        controller.close();
      },
    });
    fetchMock.mockResolvedValueOnce(
      new Response(upstreamBody, {
        status: 200,
        headers: { "Content-Type": "text/event-stream" },
      })
    );

    const req = new NextRequest("http://localhost/api/v1/cutie/model/chat", {
      method: "POST",
      body: JSON.stringify({
        protocol: "cutie_tools_v2",
        stream: true,
        model: "openai/gpt-oss-120b:fastest",
        messages: [{ role: "user", content: "please inspect foo.pine" }],
        tools: [
          {
            name: "read_file",
            description: "Read a file from the workspace.",
            kind: "observe",
            domain: "workspace",
            inputSchema: { type: "object", properties: { path: { type: "string" } } },
          },
        ],
        maxToolsPerBatch: 1,
      }),
      headers: { "Content-Type": "application/json" },
    });

    const res = await POST(req);
    const body = await res.text();

    expect(res.status).toBe(200);
    expect(body).toContain('"event":"tool_batch"');
    expect(body).toContain('"name":"read_file"');
    expect(body).not.toContain("[TOOL_CALL]");
    expect(body).toContain('"protocolMode":"text_extraction"');
    expect(body).toContain('"orchestratorContractVersion":"canonical_portability_v1"');
    expect(body).toContain('"portabilityMode":"canonical_default"');
    expect(body).toContain('"normalizationSource":"streamed_tool_calls"');
  });

  it("finalizes native stream output even when upstream closes without [DONE]", async () => {
    const fetchMock = vi.mocked(fetch);
    const encoder = new TextEncoder();
    const upstreamBody = new ReadableStream({
      start(controller) {
        controller.enqueue(
          encoder.encode(
            'data: {"choices":[{"delta":{"tool_calls":[{"index":0,"id":"call_1","function":{"name":"read_file","arguments":"{\\"path\\":\\"foo.pine\\",\\"startLine\\":1,\\"endLine\\":81}"}}]}}]}\n\n'
          )
        );
        controller.close();
      },
    });
    fetchMock.mockResolvedValueOnce(
      new Response(upstreamBody, {
        status: 200,
        headers: { "Content-Type": "text/event-stream" },
      })
    );

    const req = new NextRequest("http://localhost/api/v1/cutie/model/chat", {
      method: "POST",
      body: JSON.stringify({
        protocol: "cutie_tools_v2",
        stream: true,
        model: "openai/gpt-oss-120b:fastest",
        messages: [{ role: "user", content: "please inspect foo.pine" }],
        tools: [
          {
            name: "read_file",
            description: "Read a file from the workspace.",
            kind: "observe",
            domain: "workspace",
            inputSchema: { type: "object", properties: { path: { type: "string" } } },
          },
        ],
        maxToolsPerBatch: 1,
      }),
      headers: { "Content-Type": "application/json" },
    });

    const res = await POST(req);
    const body = await res.text();

    expect(res.status).toBe(200);
    expect(body).toContain('"event":"tool_batch"');
    expect(body).toContain('"name":"read_file"');
    expect(body).toContain('"event":"meta"');
    expect(body).toContain("[DONE]");
  });

  it("keeps native upstream tool wiring for reliable native-tool models", async () => {
    const fetchMock = vi.mocked(fetch);
    fetchMock.mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          choices: [
            {
              message: {
                content: "Working on it.",
                tool_calls: [
                  {
                    id: "call_1",
                    function: {
                      name: "read_file",
                      arguments: '{"path":"foo.pine","startLine":1,"endLine":81}',
                    },
                  },
                ],
              },
            },
          ],
          model: "openai/gpt-5",
          usage: { completion_tokens: 5 },
        }),
        {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }
      )
    );

    const req = new NextRequest("http://localhost/api/v1/cutie/model/chat", {
      method: "POST",
      body: JSON.stringify({
        protocol: "cutie_tools_v2",
        protocolMode: "native_tools",
        stream: false,
        model: "openai/gpt-5",
        messages: [{ role: "user", content: "please inspect foo.pine" }],
        tools: [
          {
            name: "read_file",
            description: "Read a file from the workspace.",
            kind: "observe",
            domain: "workspace",
            inputSchema: { type: "object", properties: { path: { type: "string" } } },
          },
        ],
        maxToolsPerBatch: 2,
      }),
      headers: { "Content-Type": "application/json" },
    });

    const res = await POST(req);
    const json = await res.json();
    const upstreamBody = JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body || "{}"));

    expect(res.status).toBe(200);
    expect(json.protocolMode).toBe("native_tools");
    expect(json.normalizationSource).toBe("upstream_tool_calls");
    expect(upstreamBody.tool_choice).toBe("auto");
    expect(Array.isArray(upstreamBody.tools)).toBe(true);
    expect(upstreamBody.parallel_tool_calls).toBeUndefined();
  });
});

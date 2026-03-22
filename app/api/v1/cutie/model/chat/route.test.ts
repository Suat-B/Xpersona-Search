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

    const upstreamBody = JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body || "{}")) as Record<string, unknown>;
    expect(upstreamBody.tool_choice).toBe("auto");
    expect(Array.isArray(upstreamBody.tools)).toBe(true);
    expect((upstreamBody.tools as Array<Record<string, unknown>>)[0]?.function).toMatchObject({
      name: "read_file",
    });
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
});

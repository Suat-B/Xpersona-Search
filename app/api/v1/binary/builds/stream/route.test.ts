import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const { authenticatePlaygroundRequest, createBinaryBuild, isBinaryStreamingEnabled, createBinaryEventStreamResponse } =
  vi.hoisted(() => ({
    authenticatePlaygroundRequest: vi.fn(),
    createBinaryBuild: vi.fn(),
    isBinaryStreamingEnabled: vi.fn(),
    createBinaryEventStreamResponse: vi.fn(),
  }));

vi.mock("@/lib/playground/auth", () => ({
  authenticatePlaygroundRequest,
}));

vi.mock("@/lib/binary/service", () => ({
  createBinaryBuild,
  isBinaryStreamingEnabled,
}));

vi.mock("@/lib/binary/sse", () => ({
  createBinaryEventStreamResponse,
}));

import { POST } from "./route";

describe("POST /api/v1/binary/builds/stream", () => {
  beforeEach(() => {
    authenticatePlaygroundRequest.mockReset();
    createBinaryBuild.mockReset();
    isBinaryStreamingEnabled.mockReset();
    createBinaryEventStreamResponse.mockReset();

    authenticatePlaygroundRequest.mockResolvedValue({ userId: "user-1" });
    isBinaryStreamingEnabled.mockReturnValue(true);
    createBinaryEventStreamResponse.mockResolvedValue(
      new Response("stream", {
        status: 200,
        headers: { "Content-Type": "text/event-stream" },
      })
    );
  });

  it("creates a build and upgrades into an SSE stream", async () => {
    createBinaryBuild.mockResolvedValue({
      id: "bin_stream",
      userId: "user-1",
    });

    const req = new NextRequest("http://localhost/api/v1/binary/builds/stream", {
      method: "POST",
      body: JSON.stringify({
        intent: "Build a starter bundle",
        workspaceFingerprint: "workspace-1",
        targetEnvironment: {
          runtime: "node18",
          platform: "portable",
          packageManager: "npm",
        },
      }),
    });

    const res = await POST(req);

    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toBe("text/event-stream");
    expect(createBinaryBuild).toHaveBeenCalledTimes(1);
    expect(createBinaryEventStreamResponse).toHaveBeenCalledWith({
      request: req,
      buildId: "bin_stream",
    });
  });

  it("returns 503 when streaming is disabled", async () => {
    isBinaryStreamingEnabled.mockReturnValue(false);

    const req = new NextRequest("http://localhost/api/v1/binary/builds/stream", {
      method: "POST",
      body: JSON.stringify({
        intent: "Build a starter bundle",
        workspaceFingerprint: "workspace-1",
      }),
    });

    const res = await POST(req);
    const json = await res.json();

    expect(res.status).toBe(503);
    expect(json.error.code).toBe("BINARY_STREAMING_DISABLED");
  });
});

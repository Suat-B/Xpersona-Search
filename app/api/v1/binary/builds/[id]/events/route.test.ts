import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const { authenticatePlaygroundRequest, getBinaryBuildForUser, isBinaryStreamingEnabled, createBinaryEventStreamResponse } =
  vi.hoisted(() => ({
    authenticatePlaygroundRequest: vi.fn(),
    getBinaryBuildForUser: vi.fn(),
    isBinaryStreamingEnabled: vi.fn(),
    createBinaryEventStreamResponse: vi.fn(),
  }));

vi.mock("@/lib/playground/auth", () => ({
  authenticatePlaygroundRequest,
}));

vi.mock("@/lib/binary/service", () => ({
  getBinaryBuildForUser,
  isBinaryStreamingEnabled,
}));

vi.mock("@/lib/binary/sse", () => ({
  createBinaryEventStreamResponse,
}));

import { GET } from "./route";

describe("GET /api/v1/binary/builds/:id/events", () => {
  beforeEach(() => {
    authenticatePlaygroundRequest.mockReset();
    getBinaryBuildForUser.mockReset();
    isBinaryStreamingEnabled.mockReset();
    createBinaryEventStreamResponse.mockReset();

    authenticatePlaygroundRequest.mockResolvedValue({ userId: "user-1" });
    isBinaryStreamingEnabled.mockReturnValue(true);
    getBinaryBuildForUser.mockResolvedValue({ id: "bin_stream", userId: "user-1" });
    createBinaryEventStreamResponse.mockResolvedValue(
      new Response("stream", {
        status: 200,
        headers: { "Content-Type": "text/event-stream" },
      })
    );
  });

  it("replays and tails the build event stream", async () => {
    const req = new NextRequest("http://localhost/api/v1/binary/builds/bin_stream/events?cursor=evt_123");

    const res = await GET(req, {
      params: Promise.resolve({ id: "bin_stream" }),
    });

    expect(res.status).toBe(200);
    expect(createBinaryEventStreamResponse).toHaveBeenCalledWith({
      request: req,
      buildId: "bin_stream",
      cursor: "evt_123",
    });
  });

  it("returns 404 when the build is unknown", async () => {
    getBinaryBuildForUser.mockResolvedValue(null);

    const req = new NextRequest("http://localhost/api/v1/binary/builds/bin_missing/events");
    const res = await GET(req, {
      params: Promise.resolve({ id: "bin_missing" }),
    });
    const json = await res.json();

    expect(res.status).toBe(404);
    expect(json.error.code).toBe("BINARY_BUILD_NOT_FOUND");
  });
});

import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const { authenticatePlaygroundRequest, publishBinaryBuild, getBinaryBuildForUser } = vi.hoisted(() => ({
  authenticatePlaygroundRequest: vi.fn(),
  publishBinaryBuild: vi.fn(),
  getBinaryBuildForUser: vi.fn(),
}));

vi.mock("@/lib/playground/auth", () => ({
  authenticatePlaygroundRequest,
}));

vi.mock("@/lib/binary/service", () => ({
  publishBinaryBuild,
  getBinaryBuildForUser,
}));

import { POST } from "./route";

describe("POST /api/v1/binary/builds/:id/publish", () => {
  beforeEach(() => {
    authenticatePlaygroundRequest.mockReset();
    publishBinaryBuild.mockReset();
    getBinaryBuildForUser.mockReset();
    authenticatePlaygroundRequest.mockResolvedValue({ userId: "user-1" });
  });

  it("returns 409 when the portable starter bundle is not ready to publish", async () => {
    publishBinaryBuild.mockResolvedValue(null);
    getBinaryBuildForUser.mockResolvedValue({
      id: "bin_running",
      status: "running",
    });

    const req = new NextRequest("http://localhost/api/v1/binary/builds/bin_running/publish", {
      method: "POST",
      body: JSON.stringify({}),
    });
    const res = await POST(req, { params: Promise.resolve({ id: "bin_running" }) });
    const json = await res.json();
    expect(res.status).toBe(409);
    expect(json.error.code).toBe("BINARY_BUILD_NOT_READY");
  });

  it("returns 503 when publish safety checks fail", async () => {
    publishBinaryBuild.mockRejectedValue(new Error("Binary download signing is not configured."));

    const req = new NextRequest("http://localhost/api/v1/binary/builds/bin_done/publish", {
      method: "POST",
      body: JSON.stringify({}),
    });
    const res = await POST(req, { params: Promise.resolve({ id: "bin_done" }) });
    const json = await res.json();
    expect(res.status).toBe(503);
    expect(json.error.code).toBe("BINARY_PUBLISH_UNAVAILABLE");
  });

  it("returns the published build with a signed download URL", async () => {
    publishBinaryBuild.mockResolvedValue({
      id: "bin_done",
      status: "completed",
      publish: {
        publishedAt: new Date().toISOString(),
        downloadUrl: "http://localhost/api/v1/binary/builds/bin_done/download?sig=x",
        expiresAt: "2030-01-01T00:00:00.000Z",
      },
    });

    const req = new NextRequest("http://localhost/api/v1/binary/builds/bin_done/publish", {
      method: "POST",
      body: JSON.stringify({}),
    });
    const res = await POST(req, { params: Promise.resolve({ id: "bin_done" }) });
    const json = await res.json();
    expect(res.status).toBe(200);
    expect(json.data.publish.downloadUrl).toContain("/download");
  });
});

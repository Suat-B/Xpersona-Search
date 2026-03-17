import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const { authenticatePlaygroundRequest, cancelBinaryBuild, getBinaryBuildForUser } = vi.hoisted(() => ({
  authenticatePlaygroundRequest: vi.fn(),
  cancelBinaryBuild: vi.fn(),
  getBinaryBuildForUser: vi.fn(),
}));

vi.mock("@/lib/playground/auth", () => ({
  authenticatePlaygroundRequest,
}));

vi.mock("@/lib/binary/service", () => ({
  cancelBinaryBuild,
  getBinaryBuildForUser,
}));

import { POST } from "./route";

describe("POST /api/v1/binary/builds/:id/control", () => {
  beforeEach(() => {
    authenticatePlaygroundRequest.mockReset();
    cancelBinaryBuild.mockReset();
    getBinaryBuildForUser.mockReset();

    authenticatePlaygroundRequest.mockResolvedValue({ userId: "user-1" });
  });

  it("returns the updated build when cancellation succeeds", async () => {
    cancelBinaryBuild.mockResolvedValue({
      id: "bin_stream",
      userId: "user-1",
      status: "canceled",
    });

    const req = new NextRequest("http://localhost/api/v1/binary/builds/bin_stream/control", {
      method: "POST",
      body: JSON.stringify({ action: "cancel" }),
    });

    const res = await POST(req, {
      params: Promise.resolve({ id: "bin_stream" }),
    });
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.data.status).toBe("canceled");
  });

  it("returns 409 when the build exists but is no longer cancelable", async () => {
    cancelBinaryBuild.mockResolvedValue(null);
    getBinaryBuildForUser.mockResolvedValue({
      id: "bin_done",
      userId: "user-1",
      status: "completed",
    });

    const req = new NextRequest("http://localhost/api/v1/binary/builds/bin_done/control", {
      method: "POST",
      body: JSON.stringify({ action: "cancel" }),
    });

    const res = await POST(req, {
      params: Promise.resolve({ id: "bin_done" }),
    });
    const json = await res.json();

    expect(res.status).toBe(409);
    expect(json.error.code).toBe("BINARY_BUILD_NOT_CANCELABLE");
  });
});

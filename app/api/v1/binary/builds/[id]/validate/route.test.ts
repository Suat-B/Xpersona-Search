import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const { authenticatePlaygroundRequest, validateBinaryBuild, getBinaryBuildForUser } = vi.hoisted(() => ({
  authenticatePlaygroundRequest: vi.fn(),
  validateBinaryBuild: vi.fn(),
  getBinaryBuildForUser: vi.fn(),
}));

vi.mock("@/lib/playground/auth", () => ({
  authenticatePlaygroundRequest,
}));

vi.mock("@/lib/binary/service", () => ({
  validateBinaryBuild,
  getBinaryBuildForUser,
}));

import { POST } from "./route";

describe("POST /api/v1/binary/builds/:id/validate", () => {
  beforeEach(() => {
    authenticatePlaygroundRequest.mockReset();
    validateBinaryBuild.mockReset();
    getBinaryBuildForUser.mockReset();
    authenticatePlaygroundRequest.mockResolvedValue({ userId: "user-1" });
  });

  it("returns 409 when the portable starter bundle is still building", async () => {
    validateBinaryBuild.mockResolvedValue(null);
    getBinaryBuildForUser.mockResolvedValue({
      id: "bin_running",
      status: "running",
    });

    const req = new NextRequest("http://localhost/api/v1/binary/builds/bin_running/validate", {
      method: "POST",
      body: JSON.stringify({}),
    });
    const res = await POST(req, { params: Promise.resolve({ id: "bin_running" }) });
    const json = await res.json();
    expect(res.status).toBe(409);
    expect(json.error.code).toBe("BINARY_BUILD_NOT_READY");
  });

  it("returns the updated validation report for a completed build", async () => {
    validateBinaryBuild.mockResolvedValue({
      id: "bin_done",
      status: "completed",
      reliability: { status: "pass", score: 100, summary: "ok" },
    });

    const req = new NextRequest("http://localhost/api/v1/binary/builds/bin_done/validate", {
      method: "POST",
      body: JSON.stringify({ targetEnvironment: { runtime: "node20" } }),
    });
    const res = await POST(req, { params: Promise.resolve({ id: "bin_done" }) });
    const json = await res.json();
    expect(res.status).toBe(200);
    expect(json.data.id).toBe("bin_done");
  });
});

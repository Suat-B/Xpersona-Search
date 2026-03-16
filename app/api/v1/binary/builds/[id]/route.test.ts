import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const { authenticatePlaygroundRequest, getBinaryBuildForUser } = vi.hoisted(() => ({
  authenticatePlaygroundRequest: vi.fn(),
  getBinaryBuildForUser: vi.fn(),
}));

vi.mock("@/lib/playground/auth", () => ({
  authenticatePlaygroundRequest,
}));

vi.mock("@/lib/binary/service", () => ({
  getBinaryBuildForUser,
}));

import { GET } from "./route";

describe("GET /api/v1/binary/builds/:id", () => {
  beforeEach(() => {
    authenticatePlaygroundRequest.mockReset();
    getBinaryBuildForUser.mockReset();
    authenticatePlaygroundRequest.mockResolvedValue({ userId: "user-1" });
  });

  it("returns the build record for the authenticated user", async () => {
    getBinaryBuildForUser.mockResolvedValue({
      id: "bin_done",
      userId: "user-1",
      workflow: "binary_generate",
      artifactKind: "package_bundle",
      status: "completed",
      intent: "Build it",
      workspaceFingerprint: "workspace-1",
      targetEnvironment: {
        runtime: "node18",
        platform: "portable",
        packageManager: "npm",
      },
      logs: [],
      manifest: null,
      reliability: null,
      artifact: null,
      publish: null,
      errorMessage: null,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });

    const res = await GET(new NextRequest("http://localhost/api/v1/binary/builds/bin_done"), {
      params: Promise.resolve({ id: "bin_done" }),
    });
    const json = await res.json();
    expect(res.status).toBe(200);
    expect(json.data.id).toBe("bin_done");
  });

  it("returns 404 when the build is missing or belongs to another user", async () => {
    getBinaryBuildForUser.mockResolvedValue(null);

    const res = await GET(new NextRequest("http://localhost/api/v1/binary/builds/bin_missing"), {
      params: Promise.resolve({ id: "bin_missing" }),
    });
    expect(res.status).toBe(404);
  });
});

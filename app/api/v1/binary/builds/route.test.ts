import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const { authenticatePlaygroundRequest, createBinaryBuild } = vi.hoisted(() => ({
  authenticatePlaygroundRequest: vi.fn(),
  createBinaryBuild: vi.fn(),
}));

vi.mock("@/lib/playground/auth", () => ({
  authenticatePlaygroundRequest,
}));

vi.mock("@/lib/binary/service", () => ({
  createBinaryBuild,
}));

import { POST } from "./route";

function createQueuedBuild() {
  return {
    id: "bin_queued",
    userId: "user-1",
    workflow: "binary_generate",
    artifactKind: "package_bundle",
    status: "queued",
    intent: "Build a starter bundle",
    workspaceFingerprint: "workspace-1",
    targetEnvironment: {
      runtime: "node18",
      platform: "portable",
      packageManager: "npm",
    },
    logs: ["Queued Binary IDE portable package bundle build."],
    manifest: null,
    reliability: null,
    artifact: null,
    publish: null,
    errorMessage: null,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
}

describe("POST /api/v1/binary/builds", () => {
  beforeEach(() => {
    authenticatePlaygroundRequest.mockReset();
    createBinaryBuild.mockReset();
    authenticatePlaygroundRequest.mockResolvedValue({ userId: "user-1" });
  });

  it("returns 202 when a portable starter bundle is queued", async () => {
    createBinaryBuild.mockResolvedValue(createQueuedBuild());

    const req = new NextRequest("http://localhost/api/v1/binary/builds", {
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
    const json = await res.json();
    expect(res.status).toBe(202);
    expect(json.success).toBe(true);
    expect(json.data.status).toBe("queued");
  });

  it("returns 503 when the binary build subsystem is unavailable", async () => {
    createBinaryBuild.mockRejectedValue(new Error("storage offline"));

    const req = new NextRequest("http://localhost/api/v1/binary/builds", {
      method: "POST",
      body: JSON.stringify({
        intent: "Build a starter bundle",
        workspaceFingerprint: "workspace-1",
      }),
    });

    const res = await POST(req);
    const json = await res.json();
    expect(res.status).toBe(503);
    expect(json.error.code).toBe("BINARY_BUILD_UNAVAILABLE");
  });
});

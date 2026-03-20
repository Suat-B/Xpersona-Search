import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const { authenticatePlaygroundRequest, branchBinaryBuild, cancelBinaryBuild, getBinaryBuildForUser, refineBinaryBuild, rewindBinaryBuild } = vi.hoisted(() => ({
  authenticatePlaygroundRequest: vi.fn(),
  branchBinaryBuild: vi.fn(),
  cancelBinaryBuild: vi.fn(),
  getBinaryBuildForUser: vi.fn(),
  refineBinaryBuild: vi.fn(),
  rewindBinaryBuild: vi.fn(),
}));

vi.mock("@/lib/playground/auth", () => ({
  authenticatePlaygroundRequest,
}));

vi.mock("@/lib/binary/service", () => ({
  branchBinaryBuild,
  cancelBinaryBuild,
  getBinaryBuildForUser,
  refineBinaryBuild,
  rewindBinaryBuild,
}));

import { POST } from "./route";

describe("POST /api/v1/binary/builds/:id/control", () => {
  beforeEach(() => {
    authenticatePlaygroundRequest.mockReset();
    branchBinaryBuild.mockReset();
    cancelBinaryBuild.mockReset();
    getBinaryBuildForUser.mockReset();
    refineBinaryBuild.mockReset();
    rewindBinaryBuild.mockReset();

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
    expect(json.error.code).toBe("BINARY_BUILD_CONTROL_REJECTED");
  });

  it("dispatches refine, branch, and rewind actions", async () => {
    refineBinaryBuild.mockResolvedValue({
      id: "bin_stream",
      userId: "user-1",
      status: "running",
      pendingRefinement: {
        intent: "Add retry logic",
        requestedAt: new Date().toISOString(),
      },
    });
    branchBinaryBuild.mockResolvedValue({
      id: "bin_branch",
      userId: "user-1",
      status: "queued",
      parentBuildId: "bin_stream",
    });
    rewindBinaryBuild.mockResolvedValue({
      id: "bin_stream",
      userId: "user-1",
      status: "completed",
      checkpointId: "chk_123",
    });

    const refineResponse = await POST(
      new NextRequest("http://localhost/api/v1/binary/builds/bin_stream/control", {
        method: "POST",
        body: JSON.stringify({ action: "refine", intent: "Add retry logic" }),
      }),
      { params: Promise.resolve({ id: "bin_stream" }) }
    );
    const refineJson = await refineResponse.json();

    const branchResponse = await POST(
      new NextRequest("http://localhost/api/v1/binary/builds/bin_stream/control", {
        method: "POST",
        body: JSON.stringify({ action: "branch", checkpointId: "chk_123", intent: "Try a branch" }),
      }),
      { params: Promise.resolve({ id: "bin_stream" }) }
    );
    const branchJson = await branchResponse.json();

    const rewindResponse = await POST(
      new NextRequest("http://localhost/api/v1/binary/builds/bin_stream/control", {
        method: "POST",
        body: JSON.stringify({ action: "rewind", checkpointId: "chk_123" }),
      }),
      { params: Promise.resolve({ id: "bin_stream" }) }
    );
    const rewindJson = await rewindResponse.json();

    expect(refineResponse.status).toBe(200);
    expect(refineJson.data.pendingRefinement.intent).toBe("Add retry logic");
    expect(refineBinaryBuild).toHaveBeenCalledWith({
      userId: "user-1",
      buildId: "bin_stream",
      intent: "Add retry logic",
    });

    expect(branchResponse.status).toBe(200);
    expect(branchJson.data.parentBuildId).toBe("bin_stream");
    expect(branchBinaryBuild).toHaveBeenCalledWith({
      userId: "user-1",
      buildId: "bin_stream",
      checkpointId: "chk_123",
      intent: "Try a branch",
    });

    expect(rewindResponse.status).toBe(200);
    expect(rewindJson.data.checkpointId).toBe("chk_123");
    expect(rewindBinaryBuild).toHaveBeenCalledWith({
      userId: "user-1",
      buildId: "bin_stream",
      checkpointId: "chk_123",
    });
  });
});

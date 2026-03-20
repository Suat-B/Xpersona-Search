import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const { authenticatePlaygroundRequest, executeBinaryBuild, getBinaryBuildForUser } = vi.hoisted(() => ({
  authenticatePlaygroundRequest: vi.fn(),
  executeBinaryBuild: vi.fn(),
  getBinaryBuildForUser: vi.fn(),
}));

vi.mock("@/lib/playground/auth", () => ({
  authenticatePlaygroundRequest,
}));

vi.mock("@/lib/binary/service", () => ({
  executeBinaryBuild,
  getBinaryBuildForUser,
}));

import { POST } from "./route";

describe("POST /api/v1/binary/builds/:id/execute", () => {
  beforeEach(() => {
    authenticatePlaygroundRequest.mockReset();
    executeBinaryBuild.mockReset();
    getBinaryBuildForUser.mockReset();

    authenticatePlaygroundRequest.mockResolvedValue({ userId: "user-1" });
  });

  it("returns the updated build when partial execution succeeds", async () => {
    executeBinaryBuild.mockResolvedValue({
      id: "bin_exec",
      userId: "user-1",
      status: "completed",
      execution: {
        runnable: true,
        mode: "native",
        availableFunctions: [
          {
            name: "health",
            sourcePath: "src/index.ts",
            mode: "native",
            callable: true,
          },
        ],
        lastRun: {
          id: "exec_123",
          entryPoint: "health",
          args: [],
          status: "completed",
          outputJson: { ok: true },
          logs: ["health ok"],
          startedAt: new Date().toISOString(),
          completedAt: new Date().toISOString(),
        },
        updatedAt: new Date().toISOString(),
      },
    });

    const res = await POST(
      new NextRequest("http://localhost/api/v1/binary/builds/bin_exec/execute", {
        method: "POST",
        body: JSON.stringify({ entryPoint: "health" }),
      }),
      {
        params: Promise.resolve({ id: "bin_exec" }),
      }
    );
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.data.execution.lastRun.entryPoint).toBe("health");
    expect(executeBinaryBuild).toHaveBeenCalledWith({
      userId: "user-1",
      buildId: "bin_exec",
      request: {
        entryPoint: "health",
      },
    });
  });

  it("returns 409 when the requested entry point cannot execute", async () => {
    executeBinaryBuild.mockResolvedValue(null);
    getBinaryBuildForUser.mockResolvedValue({
      id: "bin_exec",
      userId: "user-1",
      status: "completed",
    });

    const res = await POST(
      new NextRequest("http://localhost/api/v1/binary/builds/bin_exec/execute", {
        method: "POST",
        body: JSON.stringify({ entryPoint: "health" }),
      }),
      {
        params: Promise.resolve({ id: "bin_exec" }),
      }
    );
    const json = await res.json();

    expect(res.status).toBe(409);
    expect(json.error.code).toBe("BINARY_BUILD_NOT_EXECUTABLE");
  });
});

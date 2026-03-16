import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const {
  readFile,
  assertBinaryDownloadSigningReady,
  verifyBinaryDownloadSignature,
  ensureBinaryArtifactStorageAccessible,
  getBinaryBuildRecord,
  getBinaryArtifactPath,
} = vi.hoisted(() => ({
  readFile: vi.fn(),
  assertBinaryDownloadSigningReady: vi.fn(),
  verifyBinaryDownloadSignature: vi.fn(),
  ensureBinaryArtifactStorageAccessible: vi.fn(),
  getBinaryBuildRecord: vi.fn(),
  getBinaryArtifactPath: vi.fn(),
}));

vi.mock("node:fs/promises", () => ({
  readFile,
}));

vi.mock("@/lib/binary/signing", () => ({
  assertBinaryDownloadSigningReady,
  verifyBinaryDownloadSignature,
}));

vi.mock("@/lib/binary/store", () => ({
  ensureBinaryArtifactStorageAccessible,
  getBinaryBuildRecord,
  getBinaryArtifactPath,
}));

import { GET } from "./route";

describe("GET /api/v1/binary/builds/:id/download", () => {
  beforeEach(() => {
    readFile.mockReset();
    assertBinaryDownloadSigningReady.mockReset();
    verifyBinaryDownloadSignature.mockReset();
    ensureBinaryArtifactStorageAccessible.mockReset();
    getBinaryBuildRecord.mockReset();
    getBinaryArtifactPath.mockReset();

    ensureBinaryArtifactStorageAccessible.mockResolvedValue("artifacts/binary-builds");
    assertBinaryDownloadSigningReady.mockImplementation(() => undefined);
    verifyBinaryDownloadSignature.mockReturnValue(true);
    getBinaryBuildRecord.mockResolvedValue({
      artifact: {
        fileName: "bin_done.zip",
      },
    });
    getBinaryArtifactPath.mockReturnValue("artifacts/binary-builds/bin_done/bin_done.zip");
    readFile.mockResolvedValue(Buffer.from("zip-data"));
  });

  it("returns 503 when download signing is not production-safe", async () => {
    assertBinaryDownloadSigningReady.mockImplementation(() => {
      throw new Error("Binary download signing is not configured.");
    });

    const req = new NextRequest("http://localhost/api/v1/binary/builds/bin_done/download?expires=2030-01-01T00:00:00.000Z&sig=ok");
    const res = await GET(req, { params: Promise.resolve({ id: "bin_done" }) });
    const json = await res.json();
    expect(res.status).toBe(503);
    expect(json.error.code).toBe("BINARY_DOWNLOAD_UNAVAILABLE");
  });

  it("returns 410 for expired download URLs", async () => {
    const req = new NextRequest("http://localhost/api/v1/binary/builds/bin_done/download?expires=2000-01-01T00:00:00.000Z&sig=ok");
    const res = await GET(req, { params: Promise.resolve({ id: "bin_done" }) });
    expect(res.status).toBe(410);
  });

  it("returns 403 for invalid download signatures", async () => {
    verifyBinaryDownloadSignature.mockReturnValue(false);

    const req = new NextRequest("http://localhost/api/v1/binary/builds/bin_done/download?expires=2030-01-01T00:00:00.000Z&sig=bad");
    const res = await GET(req, { params: Promise.resolve({ id: "bin_done" }) });
    expect(res.status).toBe(403);
  });

  it("streams the zip artifact for a valid signed request", async () => {
    const req = new NextRequest("http://localhost/api/v1/binary/builds/bin_done/download?expires=2030-01-01T00:00:00.000Z&sig=ok");
    const res = await GET(req, { params: Promise.resolve({ id: "bin_done" }) });

    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toBe("application/zip");
    expect(await res.arrayBuffer()).toBeInstanceOf(ArrayBuffer);
  });
});

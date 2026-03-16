import * as fs from "node:fs/promises";
import { NextRequest, NextResponse } from "next/server";
import { jsonError } from "@/lib/api/errors";
import {
  assertBinaryDownloadSigningReady,
  verifyBinaryDownloadSignature,
} from "@/lib/binary/signing";
import {
  ensureBinaryArtifactStorageAccessible,
  getBinaryBuildRecord,
  getBinaryArtifactPath,
} from "@/lib/binary/store";

type Ctx = { params: Promise<{ id: string }> };

export async function GET(request: NextRequest, ctx: Ctx): Promise<Response> {
  const { id } = await ctx.params;
  try {
    await ensureBinaryArtifactStorageAccessible();
    assertBinaryDownloadSigningReady();
  } catch (error) {
    return jsonError(request, {
      code: "BINARY_DOWNLOAD_UNAVAILABLE",
      message: error instanceof Error ? error.message : "Binary downloads are currently unavailable.",
      status: 503,
      retryable: true,
      retryAfterMs: 5_000,
    });
  }

  const expiresAt = String(request.nextUrl.searchParams.get("expires") || "").trim();
  const sig = String(request.nextUrl.searchParams.get("sig") || "").trim();
  if (!expiresAt || !sig) {
    return jsonError(request, {
      code: "BINARY_DOWNLOAD_SIGNATURE_REQUIRED",
      message: "Signed download parameters are required.",
      status: 400,
    });
  }

  const expiryMs = Date.parse(expiresAt);
  if (!Number.isFinite(expiryMs) || expiryMs < Date.now()) {
    return jsonError(request, {
      code: "BINARY_DOWNLOAD_EXPIRED",
      message: "The signed Binary IDE download URL has expired.",
      status: 410,
    });
  }

  if (!verifyBinaryDownloadSignature(id, expiresAt, sig)) {
    return jsonError(request, {
      code: "BINARY_DOWNLOAD_INVALID_SIGNATURE",
      message: "The signed Binary IDE download URL is invalid.",
      status: 403,
    });
  }

  const record = await getBinaryBuildRecord(id);
  if (!record?.artifact) {
    return jsonError(request, {
      code: "BINARY_BUILD_NOT_FOUND",
      message: "Unknown binary build.",
      status: 404,
    });
  }

  const filePath = getBinaryArtifactPath(id);
  const buffer = await fs.readFile(filePath).catch(() => null);
  if (!buffer) {
    return jsonError(request, {
      code: "BINARY_ARTIFACT_MISSING",
      message: "Binary artifact file is missing.",
      status: 404,
    });
  }

  return new NextResponse(buffer, {
    status: 200,
    headers: {
      "Content-Type": "application/zip",
      "Content-Disposition": `attachment; filename="${record.artifact.fileName}"`,
      "Content-Length": String(buffer.length),
      "Cache-Control": "private, max-age=60",
    },
  });
}

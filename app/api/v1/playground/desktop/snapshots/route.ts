import { NextRequest } from "next/server";
import { authenticatePlaygroundRequest } from "@/lib/playground/auth";
import { zDesktopSnapshotUploadRequest } from "@/lib/playground/contracts";
import { ok, parseBody, unauthorized } from "@/lib/playground/http";
import { createDesktopSnapshot } from "@/lib/playground/desktop-snapshots";

export async function POST(request: NextRequest): Promise<Response> {
  const auth = await authenticatePlaygroundRequest(request);
  if (!auth) return unauthorized(request);

  const parsed = await parseBody(request, zDesktopSnapshotUploadRequest);
  if (!parsed.success) return parsed.response;

  const snapshot = createDesktopSnapshot({
    userId: auth.userId,
    sessionId: parsed.data.sessionId,
    displayId: parsed.data.displayId,
    width: parsed.data.width,
    height: parsed.data.height,
    mimeType: parsed.data.mimeType || "image/png",
    dataBase64: parsed.data.dataBase64,
    activeWindow: parsed.data.activeWindow,
  });

  return ok(request, {
    snapshotId: snapshot.id,
    displayId: snapshot.displayId ?? null,
    width: snapshot.width,
    height: snapshot.height,
    mimeType: snapshot.mimeType,
    capturedAt: snapshot.capturedAt,
    activeWindow: snapshot.activeWindow ?? null,
  });
}

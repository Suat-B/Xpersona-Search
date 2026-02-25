import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { trustReceipts } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { hasTrustTable } from "@/lib/trust/db";
import { applyRequestIdHeader, jsonError } from "@/lib/api/errors";
import { recordApiResponse } from "@/lib/metrics/record";

export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const startedAt = Date.now();
  const { id } = await params;
  if (!id) {
    const response = jsonError(req, {
      code: "BAD_REQUEST",
      message: "Missing id",
      status: 400,
    });
    recordApiResponse("/api/trust/receipts/:id", req, response, startedAt);
    return response;
  }

  if (!(await hasTrustTable("trust_receipts"))) {
    const response = jsonError(req, {
      code: "SERVICE_UNAVAILABLE",
      message: "Trust tables not ready",
      status: 503,
    });
    recordApiResponse("/api/trust/receipts/:id", req, response, startedAt);
    return response;
  }

  const rows = await db
    .select()
    .from(trustReceipts)
    .where(eq(trustReceipts.id, id))
    .limit(1);

  if (!rows[0]) {
    const response = jsonError(req, {
      code: "NOT_FOUND",
      message: "Not found",
      status: 404,
    });
    recordApiResponse("/api/trust/receipts/:id", req, response, startedAt);
    return response;
  }
  const response = NextResponse.json(rows[0]);
  applyRequestIdHeader(response, req);
  recordApiResponse("/api/trust/receipts/:id", req, response, startedAt);
  return response;
}

import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { trustReceipts } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { hasTrustTable } from "@/lib/trust/db";
import { applyRequestIdHeader, jsonError } from "@/lib/api/errors";

export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  if (!id) {
    return jsonError(req, {
      code: "BAD_REQUEST",
      message: "Missing id",
      status: 400,
    });
  }

  if (!(await hasTrustTable("trust_receipts"))) {
    return jsonError(req, {
      code: "SERVICE_UNAVAILABLE",
      message: "Trust tables not ready",
      status: 503,
    });
  }

  const rows = await db
    .select()
    .from(trustReceipts)
    .where(eq(trustReceipts.id, id))
    .limit(1);

  if (!rows[0]) {
    return jsonError(req, {
      code: "NOT_FOUND",
      message: "Not found",
      status: 404,
    });
  }
  const response = NextResponse.json(rows[0]);
  applyRequestIdHeader(response, req);
  return response;
}

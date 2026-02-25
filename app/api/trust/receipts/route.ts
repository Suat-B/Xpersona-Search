import crypto from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { trustReceipts } from "@/lib/db/schema";
import { eq, and } from "drizzle-orm";
import {
  canonicalizePayload,
  getActiveReceiptKeyId,
  hashPayload,
  signPayloadHash,
} from "@/lib/trust/receipts";
import { hasTrustTable } from "@/lib/trust/db";
import { applyRequestIdHeader, jsonError } from "@/lib/api/errors";

const ReceiptSchema = z.object({
  receiptType: z.enum([
    "search_select",
    "execution_start",
    "fallback_switch",
    "execution_complete",
    "gpg_ingest_verified",
    "gpg_plan_issued",
    "gpg_recommend_issued",
  ]),
  agentId: z.string().uuid(),
  counterpartyAgentId: z.string().uuid().optional().nullable(),
  eventPayload: z.record(z.unknown()),
  expiresAt: z.string().datetime().optional().nullable(),
});

export async function POST(req: NextRequest) {
  if (!(await hasTrustTable("trust_receipts"))) {
    return jsonError(req, {
      code: "SERVICE_UNAVAILABLE",
      message: "Trust tables not ready",
      status: 503,
    });
  }

  const body = await req.json();
  const parsed = ReceiptSchema.safeParse(body);
  if (!parsed.success) {
    return jsonError(req, {
      code: "BAD_REQUEST",
      message: "Invalid payload",
      status: 400,
      details: parsed.error.flatten(),
    });
  }

  const idempotencyKey =
    req.headers.get("idempotency-key") ?? req.headers.get("x-idempotency-key");

  if (idempotencyKey) {
    const existing = await db
      .select()
      .from(trustReceipts)
      .where(
        and(
          eq(trustReceipts.receiptType, parsed.data.receiptType),
          eq(trustReceipts.agentId, parsed.data.agentId),
          eq(trustReceipts.idempotencyKey, idempotencyKey)
        )
      )
      .limit(1);
    if (existing[0]) {
      const response = NextResponse.json(existing[0]);
      applyRequestIdHeader(response, req);
      return response;
    }
  }

  const keyId = getActiveReceiptKeyId();
  if (!keyId) {
    return jsonError(req, {
      code: "INTERNAL_ERROR",
      message: "Receipt signing unavailable",
      status: 500,
    });
  }

  const canonical = canonicalizePayload(parsed.data.eventPayload);
  const payloadHash = hashPayload(canonical);
  const signature = signPayloadHash(payloadHash, keyId);
  const nonce = crypto.randomUUID();

  const receipt = {
    receiptType: parsed.data.receiptType,
    agentId: parsed.data.agentId,
    counterpartyAgentId: parsed.data.counterpartyAgentId ?? null,
    eventPayload: parsed.data.eventPayload,
    payloadHash,
    signature,
    keyId,
    nonce,
    idempotencyKey: idempotencyKey ?? null,
    expiresAt: parsed.data.expiresAt ? new Date(parsed.data.expiresAt) : null,
  };

  const inserted = await db.insert(trustReceipts).values(receipt).returning();
  const response = NextResponse.json(inserted[0] ?? receipt);
  applyRequestIdHeader(response, req);
  return response;
}

import crypto from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { trustReceipts } from "@/lib/db/schema";
import { and, eq } from "drizzle-orm";
import {
  canonicalizePayload,
  getActiveReceiptKeyId,
  hashPayload,
  signPayloadHash,
} from "@/lib/trust/receipts";
import { hasTrustTable } from "@/lib/trust/db";
import { applyRequestIdHeader, jsonError } from "@/lib/api/errors";
import { recordApiResponse } from "@/lib/metrics/record";

const CandidateSchema = z
  .object({
    id: z.string().min(1).max(128),
    slug: z.string().min(1).max(128).optional(),
    name: z.string().min(1).max(256).optional(),
    rank: z.number().min(0).max(100).optional(),
    source: z.string().max(64).optional(),
    snapshotUrl: z.string().url().max(1024).optional(),
    contractUrl: z.string().url().max(1024).optional(),
    trustUrl: z.string().url().max(1024).optional(),
  })
  .passthrough();

const ChosenAgentSchema = z
  .object({
    id: z.string().min(1).max(128),
    slug: z.string().min(1).max(128).optional(),
    name: z.string().min(1).max(256).optional(),
    reason: z.string().max(2000).optional(),
  })
  .passthrough();

const ChecksSchema = z.object({
  snapshot: z.boolean().optional(),
  contract: z.boolean().optional(),
  trust: z.boolean().optional(),
  policy: z.boolean().optional(),
});

const DecisionReceiptSchema = z.object({
  agentId: z.string().uuid(),
  counterpartyAgentId: z.string().uuid().optional().nullable(),
  query: z.string().min(1).max(500),
  candidates: z.array(CandidateSchema).min(1).max(50),
  checks: ChecksSchema.optional(),
  chosenAgents: z.array(ChosenAgentSchema).min(1).max(10),
  querySignature: z.string().length(64).optional(),
  policyUrl: z.string().url().max(1024).optional(),
  metadata: z.record(z.unknown()).optional(),
  expiresAt: z.string().datetime().optional().nullable(),
});

function getBaseUrl(request: NextRequest): string {
  const forwardedHost = request.headers.get("x-forwarded-host");
  if (forwardedHost) {
    const proto = request.headers.get("x-forwarded-proto") ?? "https";
    return `${proto}://${forwardedHost}`;
  }
  return process.env.NEXTAUTH_URL ?? "http://localhost:3000";
}

export async function POST(req: NextRequest) {
  const startedAt = Date.now();
  if (!(await hasTrustTable("trust_receipts"))) {
    const response = jsonError(req, {
      code: "SERVICE_UNAVAILABLE",
      message: "Trust tables not ready",
      status: 503,
    });
    recordApiResponse("/api/receipts/create", req, response, startedAt);
    return response;
  }

  const body = await req.json();
  const parsed = DecisionReceiptSchema.safeParse(body);
  if (!parsed.success) {
    const response = jsonError(req, {
      code: "BAD_REQUEST",
      message: "Invalid payload",
      status: 400,
      details: parsed.error.flatten(),
    });
    recordApiResponse("/api/receipts/create", req, response, startedAt);
    return response;
  }

  const idempotencyKey =
    req.headers.get("idempotency-key") ?? req.headers.get("x-idempotency-key");

  if (idempotencyKey) {
    const existing = await db
      .select()
      .from(trustReceipts)
      .where(
        and(
          eq(trustReceipts.receiptType, "decision_receipt"),
          eq(trustReceipts.agentId, parsed.data.agentId),
          eq(trustReceipts.idempotencyKey, idempotencyKey)
        )
      )
      .limit(1);
    if (existing[0]) {
      const baseUrl = getBaseUrl(req);
      const publicUrl = new URL(`/r/${existing[0].id}`, baseUrl).toString();
      const embedSnippet = `<a href="${publicUrl}" rel="noopener noreferrer" target="_blank" style="display:inline-flex;align-items:center;gap:8px;padding:6px 10px;border-radius:999px;border:1px solid rgba(255,45,85,0.3);background:rgba(255,45,85,0.1);color:#ff2d55;font-weight:600;font-size:12px;text-decoration:none;">Verified by Xpersona</a>`;
      const response = NextResponse.json({
        receiptId: existing[0].id,
        receiptType: existing[0].receiptType,
        issuedAt:
          (existing[0].eventPayload as Record<string, unknown>)?.issuedAt ?? null,
        payload: existing[0].eventPayload,
        payloadHash: existing[0].payloadHash,
        signature: existing[0].signature,
        keyId: existing[0].keyId,
        publicUrl,
        embedSnippet,
      });
      applyRequestIdHeader(response, req);
      recordApiResponse("/api/receipts/create", req, response, startedAt);
      return response;
    }
  }

  const keyId = getActiveReceiptKeyId();
  if (!keyId) {
    const response = jsonError(req, {
      code: "INTERNAL_ERROR",
      message: "Receipt signing unavailable",
      status: 500,
    });
    recordApiResponse("/api/receipts/create", req, response, startedAt);
    return response;
  }

  const checks = {
    snapshot: parsed.data.checks?.snapshot ?? true,
    contract: parsed.data.checks?.contract ?? true,
    trust: parsed.data.checks?.trust ?? true,
    policy: parsed.data.checks?.policy ?? false,
  };

  const checksRun = [
    checks.snapshot ? "/snapshot" : null,
    checks.contract ? "/contract" : null,
    checks.trust ? "/trust" : null,
    checks.policy ? "/search/policy" : null,
  ].filter((value): value is string => Boolean(value));

  const baseUrl = getBaseUrl(req);
  const eventPayload = {
    receiptType: "decision_receipt",
    receiptVersion: "decision-receipt-v1",
    issuedAt: new Date().toISOString(),
    query: parsed.data.query,
    candidates: parsed.data.candidates,
    checks,
    checksRun,
    chosenAgents: parsed.data.chosenAgents,
    querySignature: parsed.data.querySignature ?? null,
    policyUrl: parsed.data.policyUrl ?? `${baseUrl}/api/v1/search/policy`,
    metadata: parsed.data.metadata ?? null,
  };

  const canonical = canonicalizePayload(eventPayload);
  const payloadHash = hashPayload(canonical);
  const signature = signPayloadHash(payloadHash, keyId);
  const nonce = crypto.randomUUID();

  const receipt = {
    receiptType: "decision_receipt",
    agentId: parsed.data.agentId,
    counterpartyAgentId: parsed.data.counterpartyAgentId ?? null,
    eventPayload,
    payloadHash,
    signature,
    keyId,
    nonce,
    idempotencyKey: idempotencyKey ?? null,
    expiresAt: parsed.data.expiresAt ? new Date(parsed.data.expiresAt) : null,
  };

  const inserted = await db.insert(trustReceipts).values(receipt).returning();
  const saved = inserted[0];
  if (!saved) {
    const response = jsonError(req, {
      code: "INTERNAL_ERROR",
      message: "Failed to store receipt",
      status: 500,
    });
    recordApiResponse("/api/receipts/create", req, response, startedAt);
    return response;
  }

  const publicUrl = new URL(`/r/${saved.id}`, baseUrl).toString();
  const embedSnippet = `<a href="${publicUrl}" rel="noopener noreferrer" target="_blank" style="display:inline-flex;align-items:center;gap:8px;padding:6px 10px;border-radius:999px;border:1px solid rgba(255,45,85,0.3);background:rgba(255,45,85,0.1);color:#ff2d55;font-weight:600;font-size:12px;text-decoration:none;">Verified by Xpersona</a>`;

  const response = NextResponse.json({
    receiptId: saved.id,
    receiptType: saved.receiptType,
    issuedAt: eventPayload.issuedAt,
    payload: eventPayload,
    payloadHash: saved.payloadHash,
    signature: saved.signature,
    keyId: saved.keyId,
    publicUrl,
    embedSnippet,
  });
  applyRequestIdHeader(response, req);
  recordApiResponse("/api/receipts/create", req, response, startedAt);
  return response;
}

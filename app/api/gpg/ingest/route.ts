import crypto from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { isAdmin } from "@/lib/admin";
import { requireBearerApiKey } from "@/lib/api/auth-guards";
import { verifyPayloadSignature } from "@/lib/gpg/security";
import { checkIdempotency, createIdempotencyRecord, hashIdempotencyPayload, ingestRun, resolveAgentOwner } from "@/lib/gpg/ingest";
import { trustReceipts } from "@/lib/db/schema";
import { hasTrustTable } from "@/lib/trust/db";
import { getActiveReceiptKeyId } from "@/lib/trust/receipts";
import { buildGpgReceiptPayload, signGpgReceipt } from "@/lib/gpg/receipts";
import { db } from "@/lib/db";

const IngestSchema = z.object({
  agentId: z.string().uuid(),
  jobId: z.string().max(64).optional(),
  taskText: z.string().min(1).max(500).optional(),
  taskType: z.string().max(32).optional(),
  tags: z.array(z.string().min(1).max(64)).optional(),
  pipeline: z
    .object({
      id: z.string().optional(),
      agentPath: z.array(z.string().min(1)).optional(),
      step: z.number().int().min(0).optional(),
    })
    .optional(),
  status: z.enum(["SUCCESS", "FAILURE", "TIMEOUT", "PARTIAL"]),
  latencyMs: z.number().int().min(0),
  costUsd: z.number().min(0),
  confidence: z.number().min(0).max(1).optional(),
  hallucinationScore: z.number().min(0).max(1).optional(),
  failureType: z.enum([
    "TOOL_ERROR",
    "TIMEOUT",
    "HALLUCINATION",
    "INVALID_FORMAT",
    "POLICY_BLOCK",
    "UNKNOWN",
  ]).optional(),
  trace: z.record(z.unknown()).optional(),
  inputHash: z.string().length(64).optional(),
  outputHash: z.string().length(64).optional(),
  modelUsed: z.string().min(1).max(64),
  tokensInput: z.number().int().min(0).optional(),
  tokensOutput: z.number().int().min(0).optional(),
  startedAt: z.union([z.string(), z.date()]).optional(),
  completedAt: z.union([z.string(), z.date()]).optional(),
});

export async function POST(req: NextRequest) {
  const auth = await requireBearerApiKey(req);
  if (!auth.ok) return auth.response;

  const body = await req.json().catch(() => null);
  const parsed = IngestSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "Invalid payload" }, { status: 400 });

  const idempotencyKey = req.headers.get("idempotency-key")?.trim();
  const keyId = req.headers.get("x-gpg-key-id")?.trim();
  const timestamp = req.headers.get("x-gpg-timestamp")?.trim();
  const signature = req.headers.get("x-gpg-signature")?.trim();

  if (!idempotencyKey || !keyId || !timestamp || !signature) {
    return NextResponse.json({ error: "SIGNED_HEADERS_REQUIRED" }, { status: 401 });
  }

  const verify = verifyPayloadSignature({
    payload: parsed.data,
    timestamp,
    idempotencyKey,
    signature,
    keyId,
  });
  if (!verify.ok) {
    return NextResponse.json({ error: verify.reason ?? "BAD_SIGNATURE" }, { status: 401 });
  }

  const existing = await checkIdempotency({ endpoint: "gpg_ingest", idempotencyKey });
  if (existing) {
    const incomingHash = hashIdempotencyPayload(parsed.data);
    if (incomingHash !== existing.payloadHash) {
      return NextResponse.json({ error: "IDEMPOTENCY_PAYLOAD_MISMATCH" }, { status: 409 });
    }
    return NextResponse.json({ success: true, deduped: true, data: existing.responseBody ?? {} });
  }

  const ownerId = await resolveAgentOwner(parsed.data.agentId);
  if (!ownerId && !isAdmin(auth.user)) {
    return NextResponse.json({ error: "AGENT_NOT_CLAIMED" }, { status: 403 });
  }
  if (ownerId && ownerId !== auth.user.id && !isAdmin(auth.user)) {
    return NextResponse.json({ error: "FORBIDDEN_AGENT" }, { status: 403 });
  }

  const result = await ingestRun({
    ...parsed.data,
    ingestIdempotencyKey: idempotencyKey,
    ingestKeyId: keyId,
    isVerified: true,
  });

  await createIdempotencyRecord({
    endpoint: "gpg_ingest",
    idempotencyKey,
    payload: parsed.data,
    agentId: parsed.data.agentId,
    responseBody: result,
  });

  if (await hasTrustTable("trust_receipts")) {
    const keyId = getActiveReceiptKeyId();
    if (keyId) {
      const receiptIdempotency = idempotencyKey.length <= 64 ? idempotencyKey : null;
      const { payload, payloadHash } = buildGpgReceiptPayload({
        receiptType: "gpg_ingest_verified",
        agentId: parsed.data.agentId,
        eventPayload: {
          runId: result.runId,
          clusterId: result.clusterId,
          taskSignatureId: result.taskSignatureId,
          pipelineRunId: result.pipelineRunId,
          verifiedAt: new Date().toISOString(),
        },
        idempotencyKey: receiptIdempotency,
      });
      const signatureValue = signGpgReceipt(payloadHash, keyId);
      try {
        await db.insert(trustReceipts).values({
          receiptType: payload.receiptType,
          agentId: payload.agentId,
          counterpartyAgentId: payload.counterpartyAgentId ?? null,
          eventPayload: payload.eventPayload,
          payloadHash,
          signature: signatureValue,
          keyId,
          nonce: crypto.randomUUID(),
          idempotencyKey: receiptIdempotency,
        });
      } catch {
        // best-effort
      }
    }
  }

  return NextResponse.json({ success: true, data: result });
}

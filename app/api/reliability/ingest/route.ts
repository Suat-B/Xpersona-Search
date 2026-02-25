import crypto from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { isAdmin } from "@/lib/admin";
import { requireBearerApiKey } from "@/lib/api/auth-guards";
import { verifyPayloadSignature } from "@/lib/gpg/security";
import { checkIdempotency, createIdempotencyRecord, hashIdempotencyPayload, ingestRun, resolveAgentOwner } from "@/lib/gpg/ingest";
import { hashPayload } from "@/lib/reliability/hash";
import { classifyFailure } from "@/lib/reliability/classifier";
import type { FailureType, RunStatus } from "@/lib/reliability/types";
import { db } from "@/lib/db";
import { trustReceipts } from "@/lib/db/schema";
import { hasTrustTable } from "@/lib/trust/db";
import { getActiveReceiptKeyId } from "@/lib/trust/receipts";
import { buildGpgReceiptPayload, signGpgReceipt } from "@/lib/gpg/receipts";
import { applyRequestIdHeader, jsonError } from "@/lib/api/errors";
import { recordApiResponse } from "@/lib/metrics/record";

const IngestSchema = z.object({
  agentId: z.string().min(1),
  jobId: z.string().max(64).optional(),
  input: z.unknown().optional(),
  output: z.unknown().optional(),
  inputHash: z.string().length(64).optional(),
  outputHash: z.string().length(64).optional(),
  status: z.enum(["SUCCESS", "FAILURE", "TIMEOUT", "PARTIAL"]),
  latencyMs: z.number().int().min(0),
  costUsd: z.number().min(0),
  confidence: z.number().min(0).max(1).optional(),
  hallucinationScore: z.number().min(0).max(1).optional(),
  failureType: z
    .enum(["TOOL_ERROR", "TIMEOUT", "HALLUCINATION", "INVALID_FORMAT", "POLICY_BLOCK", "UNKNOWN"])
    .optional(),
  failureDetails: z.record(z.unknown()).optional(),
  modelUsed: z.string().min(1).max(64),
  tokensInput: z.number().int().min(0).optional(),
  tokensOutput: z.number().int().min(0).optional(),
  startedAt: z.union([z.string(), z.date()]).optional(),
  completedAt: z.union([z.string(), z.date()]).optional(),
  trace: z.record(z.unknown()).optional(),
  taskText: z.string().max(500).optional(),
  taskType: z.string().max(32).optional(),
  tags: z.array(z.string().min(1).max(64)).optional(),
  pipeline: z
    .object({
      id: z.string().optional(),
      agentPath: z.array(z.string().min(1)).optional(),
      step: z.number().int().min(0).optional(),
    })
    .optional(),
});

export async function POST(req: NextRequest) {
  const startedAt = Date.now();
  const auth = await requireBearerApiKey(req);
  if (!auth.ok) {
    recordApiResponse("/api/reliability/ingest", req, auth.response, startedAt);
    return auth.response;
  }

  const idempotencyKey = req.headers.get("idempotency-key")?.trim();
  const keyId = req.headers.get("x-gpg-key-id")?.trim();
  const timestamp = req.headers.get("x-gpg-timestamp")?.trim();
  const signature = req.headers.get("x-gpg-signature")?.trim();

  if (!idempotencyKey || !keyId || !timestamp || !signature) {
    const response = jsonError(req, {
      code: "SIGNED_HEADERS_REQUIRED",
      message: "Signed headers are required",
      status: 401,
    });
    recordApiResponse("/api/reliability/ingest", req, response, startedAt);
    return response;
  }

  const payload = await req.json().catch(() => null);
  const parsed = IngestSchema.safeParse(payload);
  if (!parsed.success) {
    const response = jsonError(req, {
      code: "BAD_REQUEST",
      message: "Invalid payload",
      status: 400,
      details: parsed.error.flatten(),
    });
    recordApiResponse("/api/reliability/ingest", req, response, startedAt);
    return response;
  }

  const verify = verifyPayloadSignature({
    payload: parsed.data,
    timestamp,
    idempotencyKey,
    signature,
    keyId,
  });
  if (!verify.ok) {
    const response = jsonError(req, {
      code: verify.reason ?? "BAD_SIGNATURE",
      message: "Signature verification failed",
      status: 401,
    });
    recordApiResponse("/api/reliability/ingest", req, response, startedAt);
    return response;
  }

  const existing = await checkIdempotency({ endpoint: "reliability_ingest", idempotencyKey });
  if (existing) {
    const incomingHash = hashIdempotencyPayload(parsed.data);
    if (incomingHash !== existing.payloadHash) {
      const response = jsonError(req, {
        code: "IDEMPOTENCY_PAYLOAD_MISMATCH",
        message: "Idempotency payload mismatch",
        status: 409,
      });
      recordApiResponse("/api/reliability/ingest", req, response, startedAt);
      return response;
    }
    const response = NextResponse.json({ success: true, deduped: true, data: existing.responseBody ?? {} });
    applyRequestIdHeader(response, req);
    recordApiResponse("/api/reliability/ingest", req, response, startedAt);
    return response;
  }

  const ownerId = await resolveAgentOwner(parsed.data.agentId);
  if (!ownerId && !isAdmin(auth.user)) {
    const response = jsonError(req, {
      code: "AGENT_NOT_CLAIMED",
      message: "Agent not claimed",
      status: 403,
    });
    recordApiResponse("/api/reliability/ingest", req, response, startedAt);
    return response;
  }
  if (ownerId && ownerId !== auth.user.id && !isAdmin(auth.user)) {
    const response = jsonError(req, {
      code: "FORBIDDEN_AGENT",
      message: "Forbidden agent",
      status: 403,
    });
    recordApiResponse("/api/reliability/ingest", req, response, startedAt);
    return response;
  }

  const inputHash = parsed.data.inputHash ?? hashPayload(parsed.data.input);
  const outputHash = parsed.data.outputHash ?? (parsed.data.output ? hashPayload(parsed.data.output) : null);
  const failureType: FailureType | null =
    parsed.data.failureType ??
    (parsed.data.status === "SUCCESS"
      ? null
      : classifyFailure({
          latencyMs: parsed.data.latencyMs,
          trace: parsed.data.trace ?? null,
          hallucinationScore: parsed.data.hallucinationScore ?? null,
          status: parsed.data.status,
        }));

  const result = await ingestRun({
    agentId: parsed.data.agentId,
    jobId: parsed.data.jobId ?? null,
    taskText: parsed.data.taskText ?? null,
    taskType: parsed.data.taskType ?? null,
    tags: parsed.data.tags ?? null,
    pipeline: parsed.data.pipeline ?? null,
    status: parsed.data.status as RunStatus,
    latencyMs: parsed.data.latencyMs,
    costUsd: parsed.data.costUsd,
    confidence: parsed.data.confidence ?? null,
    hallucinationScore: parsed.data.hallucinationScore ?? null,
    failureType,
    trace: parsed.data.trace ?? null,
    inputHash,
    outputHash,
    modelUsed: parsed.data.modelUsed,
    tokensInput: parsed.data.tokensInput ?? null,
    tokensOutput: parsed.data.tokensOutput ?? null,
    startedAt: parsed.data.startedAt ?? null,
    completedAt: parsed.data.completedAt ?? null,
    isVerified: true,
    ingestIdempotencyKey: idempotencyKey,
    ingestKeyId: keyId,
  });

  await createIdempotencyRecord({
    endpoint: "reliability_ingest",
    idempotencyKey,
    payload: parsed.data,
    agentId: parsed.data.agentId,
    responseBody: result,
  });

  if (await hasTrustTable("trust_receipts")) {
    const keyId = getActiveReceiptKeyId();
    if (keyId) {
      const receiptIdempotency = idempotencyKey.length <= 64 ? idempotencyKey : null;
      const { payload: receiptPayload, payloadHash } = buildGpgReceiptPayload({
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
          receiptType: receiptPayload.receiptType,
          agentId: receiptPayload.agentId,
          counterpartyAgentId: receiptPayload.counterpartyAgentId ?? null,
          eventPayload: receiptPayload.eventPayload,
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

  const response = NextResponse.json({ success: true, data: result });
  applyRequestIdHeader(response, req);
  recordApiResponse("/api/reliability/ingest", req, response, startedAt);
  return response;
}

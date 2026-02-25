import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getAuthUser } from "@/lib/auth-utils";
import { isAdmin } from "@/lib/admin";
import { verifyPayloadSignature } from "@/lib/gpg/security";
import { checkIdempotency, createIdempotencyRecord, ingestRun, resolveAgentOwner } from "@/lib/gpg/ingest";
import { hashPayload } from "@/lib/reliability/hash";
import { classifyFailure } from "@/lib/reliability/classifier";
import type { FailureType, RunStatus } from "@/lib/reliability/types";

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
  const auth = await getAuthUser(req);
  if ("error" in auth) {
    return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
  }

  const idempotencyKey = req.headers.get("idempotency-key")?.trim();
  const keyId = req.headers.get("x-gpg-key-id")?.trim();
  const timestamp = req.headers.get("x-gpg-timestamp")?.trim();
  const signature = req.headers.get("x-gpg-signature")?.trim();

  if (!idempotencyKey || !keyId || !timestamp || !signature) {
    return NextResponse.json({ error: "SIGNED_HEADERS_REQUIRED" }, { status: 401 });
  }

  const payload = await req.json().catch(() => null);
  const parsed = IngestSchema.safeParse(payload);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
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

  const existing = await checkIdempotency({ endpoint: "reliability_ingest", idempotencyKey });
  if (existing) {
    return NextResponse.json({ success: true, deduped: true, data: existing.responseBody ?? {} });
  }

  const ownerId = await resolveAgentOwner(parsed.data.agentId);
  if (!ownerId && !isAdmin(auth.user)) {
    return NextResponse.json({ error: "AGENT_NOT_CLAIMED" }, { status: 403 });
  }
  if (ownerId && ownerId !== auth.user.id && !isAdmin(auth.user)) {
    return NextResponse.json({ error: "FORBIDDEN_AGENT" }, { status: 403 });
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

  return NextResponse.json({ success: true, data: result });
}

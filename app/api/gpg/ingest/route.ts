import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getAuthUser } from "@/lib/auth-utils";
import { isAdmin } from "@/lib/admin";
import { verifyPayloadSignature } from "@/lib/gpg/security";
import { checkIdempotency, createIdempotencyRecord, ingestRun, resolveAgentOwner } from "@/lib/gpg/ingest";

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
  const auth = await getAuthUser(req);
  if ("error" in auth) return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });

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

  return NextResponse.json({ success: true, data: result });
}

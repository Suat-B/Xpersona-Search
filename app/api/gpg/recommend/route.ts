import crypto from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { recommendAgents } from "@/lib/gpg/recommend";
import { ensureTaskSignature } from "@/lib/gpg/task-canonicalization";
import { hasTrustTable } from "@/lib/trust/db";
import { getActiveReceiptKeyId } from "@/lib/trust/receipts";
import { buildGpgReceiptPayload, signGpgReceipt } from "@/lib/gpg/receipts";
import { db } from "@/lib/db";
import { trustReceipts } from "@/lib/db/schema";

const RecommendSchema = z.object({
  task: z.string().min(1).max(500),
  taskType: z.string().max(32).optional(),
  tags: z.array(z.string().min(1).max(64)).optional(),
  budget: z.number().min(0).optional(),
  maxLatencyMs: z.number().int().min(1).max(300000).optional(),
  minSuccessProb: z.number().min(0).max(1).optional(),
  minQuality: z.number().min(0).max(1).optional(),
  limit: z.number().int().min(1).max(50).optional(),
});

export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const parsed = RecommendSchema.safeParse({
    task: url.searchParams.get("task"),
    taskType: url.searchParams.get("taskType") ?? undefined,
    tags: url.searchParams.get("tags")?.split(",").filter(Boolean),
    budget: url.searchParams.get("budget") ? Number(url.searchParams.get("budget")) : undefined,
    maxLatencyMs: url.searchParams.get("maxLatencyMs") ? Number(url.searchParams.get("maxLatencyMs")) : undefined,
    minSuccessProb: url.searchParams.get("minSuccessProb") ? Number(url.searchParams.get("minSuccessProb")) : undefined,
    minQuality: url.searchParams.get("minQuality") ? Number(url.searchParams.get("minQuality")) : undefined,
    limit: url.searchParams.get("limit") ? Number(url.searchParams.get("limit")) : undefined,
  });
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid parameters" }, { status: 400 });
  }

  const signature = await ensureTaskSignature({
    rawText: parsed.data.task,
    taskType: parsed.data.taskType,
    tags: parsed.data.tags,
  });

  const response = await recommendAgents({
    clusterId: signature.clusterId,
    constraints: {
      budget: parsed.data.budget,
      maxLatencyMs: parsed.data.maxLatencyMs,
      minSuccessProb: parsed.data.minSuccessProb,
      minQuality: parsed.data.minQuality,
    },
    limit: parsed.data.limit,
  });

  const idempotencyKey = req.headers.get("idempotency-key")?.trim() ?? null;
  const topAgentId = response.topAgents[0]?.agentId ?? null;
  if (topAgentId && (await hasTrustTable("trust_receipts"))) {
    const keyId = getActiveReceiptKeyId();
    if (keyId) {
      const receiptIdempotency = idempotencyKey && idempotencyKey.length <= 64 ? idempotencyKey : null;
      const { payload, payloadHash } = buildGpgReceiptPayload({
        receiptType: "gpg_recommend_issued",
        agentId: topAgentId,
        eventPayload: {
          clusterId: response.clusterId,
          taskType: response.taskType,
          task: parsed.data.task,
          constraints: {
            budget: parsed.data.budget ?? null,
            maxLatencyMs: parsed.data.maxLatencyMs ?? null,
            minSuccessProb: parsed.data.minSuccessProb ?? null,
            minQuality: parsed.data.minQuality ?? null,
          },
          topAgentIds: response.topAgents.map((agent) => agent.agentId),
          alternatives: response.alternatives.map((agent) => agent.agentId),
          issuedAt: new Date().toISOString(),
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

  return NextResponse.json({ success: true, data: response });
}

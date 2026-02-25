import { createHash } from "crypto";
import { db } from "@/lib/db";
import {
  agents,
  agentRuns,
  gpgIngestIdempotency,
  gpgPipelineRuns,
} from "@/lib/db/schema";
import { and, eq, sql } from "drizzle-orm";
import { ensureTaskSignature, ensureTaskCluster } from "./task-canonicalization";
import { normalizeRunStatus } from "./stats";
import type { FailureType, RunStatus } from "@/lib/reliability/types";

export type GpgIngestPayload = {
  agentId: string;
  jobId?: string | null;
  taskText?: string | null;
  taskType?: string | null;
  tags?: string[] | null;
  pipeline?: {
    id?: string | null;
    agentPath?: string[] | null;
    step?: number | null;
  } | null;
  status: RunStatus;
  latencyMs: number;
  costUsd: number;
  confidence?: number | null;
  hallucinationScore?: number | null;
  failureType?: FailureType | null;
  trace?: Record<string, unknown> | null;
  inputHash?: string | null;
  outputHash?: string | null;
  modelUsed: string;
  tokensInput?: number | null;
  tokensOutput?: number | null;
  startedAt?: string | Date | null;
  completedAt?: string | Date | null;
  isVerified?: boolean | null;
  ingestKeyId?: string | null;
  ingestIdempotencyKey?: string | null;
};

export async function resolveAgentOwner(agentId: string): Promise<string | null> {
  const [row] = await db
    .select({ claimedByUserId: agents.claimedByUserId })
    .from(agents)
    .where(eq(agents.id, agentId))
    .limit(1);
  return row?.claimedByUserId ?? null;
}

export async function createIdempotencyRecord(params: {
  endpoint: string;
  idempotencyKey: string;
  payload: unknown;
  agentId: string | null;
  responseBody?: Record<string, unknown> | null;
}) {
  const payloadHash = createHash("sha256")
    .update(JSON.stringify(params.payload ?? null))
    .digest("hex");

  const inserted = await db
    .insert(gpgIngestIdempotency)
    .values({
      endpoint: params.endpoint,
      idempotencyKey: params.idempotencyKey,
      payloadHash,
      agentId: params.agentId,
      responseBody: params.responseBody ?? null,
      createdAt: new Date(),
      expiresAt: new Date(Date.now() + 1000 * 60 * 10),
    })
    .onConflictDoNothing()
    .returning();

  return inserted[0] ?? null;
}

export async function checkIdempotency(params: {
  endpoint: string;
  idempotencyKey: string;
}) {
  const [row] = await db
    .select()
    .from(gpgIngestIdempotency)
    .where(and(eq(gpgIngestIdempotency.endpoint, params.endpoint), eq(gpgIngestIdempotency.idempotencyKey, params.idempotencyKey)))
    .limit(1);
  return row ?? null;
}

export async function ingestRun(payload: GpgIngestPayload) {
  const taskText = payload.taskText?.trim() ?? "";
  const taskType = payload.taskType ?? "general";
  const tags = payload.tags ?? [];
  const signature = taskText
    ? await ensureTaskSignature({ rawText: taskText, taskType, tags })
    : null;
  let clusterId = signature?.clusterId ?? null;

  if (!clusterId && signature) {
    const cluster = await ensureTaskCluster({
      normalizedText: signature.normalizedText,
      taskType: signature.taskType,
      tags: signature.tags,
      embedding: null,
    });
    clusterId = cluster.id;
  }

  let pipelineRunId: string | null = null;
  if (payload.pipeline?.agentPath && payload.pipeline.agentPath.length > 0) {
    const agentPath = payload.pipeline.agentPath;
    const pathHash = createHash("sha256").update(agentPath.join(">"), "utf8").digest("hex");
    const inserted = await db
      .insert(gpgPipelineRuns)
      .values({
        jobId: payload.jobId ?? null,
        clusterId,
        agentPath,
        pathHash,
        status: normalizeRunStatus(payload.status),
        latencyMs: payload.latencyMs,
        costUsd: payload.costUsd,
        qualityScore: null,
        confidence: payload.confidence ?? null,
        failureType: payload.failureType ?? null,
        metadata: payload.trace ?? null,
        isVerified: payload.isVerified ?? false,
        createdAt: new Date(),
      })
      .returning({ id: gpgPipelineRuns.id });
    pipelineRunId = inserted[0]?.id ?? null;
  }

  const insertedRun = await db
    .insert(agentRuns)
    .values({
      agentId: payload.agentId,
      jobId: payload.jobId ?? null,
      inputHash: payload.inputHash ?? createHash("sha256").update(JSON.stringify(payload.trace ?? null)).digest("hex"),
      outputHash: payload.outputHash ?? null,
      status: payload.status,
      latencyMs: payload.latencyMs,
      costUsd: payload.costUsd,
      confidence: payload.confidence ?? null,
      hallucinationScore: payload.hallucinationScore ?? null,
      failureType: payload.failureType ?? null,
      failureDetails: null,
      modelUsed: payload.modelUsed,
      tokensInput: payload.tokensInput ?? null,
      tokensOutput: payload.tokensOutput ?? null,
      startedAt: payload.startedAt ? new Date(payload.startedAt) : new Date(),
      completedAt: payload.completedAt ? new Date(payload.completedAt) : new Date(),
      trace: payload.trace ?? {},
      clusterId,
      taskSignatureId: signature?.id ?? null,
      pipelineRunId,
      pipelineStep: payload.pipeline?.step ?? null,
      isVerified: payload.isVerified ?? false,
      ingestIdempotencyKey: payload.ingestIdempotencyKey ?? null,
      ingestKeyId: payload.ingestKeyId ?? null,
    })
    .returning({ id: agentRuns.id, clusterId: agentRuns.clusterId });

  return {
    runId: insertedRun[0]?.id ?? null,
    clusterId: insertedRun[0]?.clusterId ?? clusterId,
    taskSignatureId: signature?.id ?? null,
    pipelineRunId,
  };
}

import * as fs from "node:fs/promises";
import type {
  BinaryBuildRecord,
  BinaryBuildRequest,
  BinaryPublishResult,
  BinaryTargetEnvironment,
  BinaryValidationReport,
} from "@/lib/binary/contracts";
import { runPackageBundleBuild } from "@/lib/binary/build-runner";
import { computeBinaryValidationReport } from "@/lib/binary/reliability";
import {
  assertBinaryDownloadSigningReady,
  createBinaryDownloadSignature,
} from "@/lib/binary/signing";
import {
  createBinaryBuildRecord,
  ensureBinaryArtifactStorageAccessible,
  getBinaryArtifactPath,
  getBinaryBuildRecord,
  getBinaryBuildWorkspaceDir,
  updateBinaryBuildRecord,
} from "@/lib/binary/store";
import { appendSessionMessage, createAgentRun, createSession, updateAgentRun } from "@/lib/playground/store";

const activeBuildJobs = new Map<string, Promise<void>>();

function createBuildId(): string {
  return `bin_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

function nowIso(): string {
  return new Date().toISOString();
}

function buildSummaryMessage(record: BinaryBuildRecord): string {
  const score = typeof record.reliability?.score === "number" ? `Score ${record.reliability.score}.` : "";
  const artifact = record.artifact ? `Artifact ${record.artifact.fileName}.` : "No artifact produced.";
  return [
    `Binary IDE ${record.status === "completed" ? "generated" : "attempted"} a package bundle for: ${record.intent}`,
    score,
    artifact,
  ]
    .filter(Boolean)
    .join(" ");
}

function deriveSessionTitle(intent: string): string {
  return String(intent || "").replace(/\s+/g, " ").trim().slice(0, 80) || "Binary IDE Build";
}

function riskLevelFromReliability(report: BinaryValidationReport | null | undefined): "low" | "medium" | "high" {
  if (!report) return "medium";
  if (report.status === "fail") return "high";
  if (report.status === "warn") return "medium";
  return "low";
}

function mergeLogs(...chunks: Array<string[] | undefined>): string[] {
  return chunks
    .flatMap((chunk) => chunk || [])
    .map((entry) => String(entry || "").trim())
    .filter(Boolean);
}

async function ensureBinarySession(input: {
  userId: string;
  historySessionId?: string | null;
  title: string;
  workspaceFingerprint: string;
  workflow: "binary_generate" | "binary_validate" | "binary_deploy";
}): Promise<string> {
  if (input.historySessionId) return input.historySessionId;
  const session = await createSession({
    userId: input.userId,
    title: input.title,
    mode: "auto",
    workspaceFingerprint: input.workspaceFingerprint,
    metadata: {
      workflow: input.workflow,
    },
  });
  return session.id;
}

async function maybeAppendSessionMessage(input: {
  userId: string;
  historySessionId?: string | null;
  content: string;
  payload: Record<string, unknown>;
}): Promise<void> {
  if (!input.historySessionId) return;
  await appendSessionMessage({
    userId: input.userId,
    sessionId: input.historySessionId,
    role: "assistant",
    kind: "binary_build",
    content: input.content,
    payload: input.payload,
  }).catch(() => null);
}

async function finalizeQueuedBinaryBuild(input: {
  userId: string;
  buildId: string;
  request: BinaryBuildRequest;
  runId: string;
}): Promise<void> {
  const queuedRecord = await getBinaryBuildRecord(input.buildId);
  if (!queuedRecord) return;

  const runningRecord = await updateBinaryBuildRecord(input.buildId, {
    status: "running",
    logs: mergeLogs(queuedRecord.logs, ["Starting Binary IDE package bundle build."]),
    errorMessage: null,
  });

  const baseRecord = runningRecord || queuedRecord;
  const result = await runPackageBundleBuild({
    buildId: input.buildId,
    request: input.request,
  });

  const finalRecord = await updateBinaryBuildRecord(input.buildId, {
    status: result.status,
    logs: mergeLogs(baseRecord.logs, result.logs),
    manifest: result.manifest,
    reliability: result.reliability,
    artifact: result.artifact,
    errorMessage: result.errorMessage,
  });

  if (!finalRecord) return;

  await updateAgentRun({
    userId: input.userId,
    runId: input.runId,
    status: finalRecord.status === "completed" ? "completed" : "failed",
    output: {
      workflow: "binary_generate",
      artifactBuildId: input.buildId,
      manifest: finalRecord.manifest,
      reliability: finalRecord.reliability,
      artifact: finalRecord.artifact,
    },
    errorMessage: finalRecord.errorMessage,
    confidence: finalRecord.reliability?.score ? finalRecord.reliability.score / 100 : 0.5,
    riskLevel: riskLevelFromReliability(finalRecord.reliability),
  }).catch(() => null);

  await maybeAppendSessionMessage({
    userId: input.userId,
    historySessionId: finalRecord.historySessionId,
    content: buildSummaryMessage(finalRecord),
    payload: {
      workflow: "binary_generate",
      artifactBuildId: finalRecord.id,
      build: finalRecord,
    },
  });
}

function startQueuedBinaryBuild(input: {
  userId: string;
  buildId: string;
  request: BinaryBuildRequest;
  runId: string;
}): void {
  const job = Promise.resolve()
    .then(() => finalizeQueuedBinaryBuild(input))
    .catch(async (error) => {
      const message = error instanceof Error ? error.message : String(error);
      const record = await getBinaryBuildRecord(input.buildId);
      const updated = await updateBinaryBuildRecord(input.buildId, {
        status: "failed",
        logs: mergeLogs(record?.logs, [`Background Binary IDE build failed: ${message}`]),
        errorMessage: message,
      });
      await updateAgentRun({
        userId: input.userId,
        runId: input.runId,
        status: "failed",
        output: {
          workflow: "binary_generate",
          artifactBuildId: input.buildId,
        },
        errorMessage: message,
        confidence: 0.1,
        riskLevel: "high",
      }).catch(() => null);

      if (updated) {
        await maybeAppendSessionMessage({
          userId: input.userId,
          historySessionId: updated.historySessionId,
          content: buildSummaryMessage(updated),
          payload: {
            workflow: "binary_generate",
            artifactBuildId: updated.id,
            build: updated,
          },
        });
      }
    })
    .finally(() => {
      activeBuildJobs.delete(input.buildId);
    });

  activeBuildJobs.set(input.buildId, job);
}

export async function createBinaryBuild(input: {
  userId: string;
  request: BinaryBuildRequest;
}): Promise<BinaryBuildRecord> {
  await ensureBinaryArtifactStorageAccessible();

  const buildId = createBuildId();
  const createdAt = nowIso();
  const sessionId = await ensureBinarySession({
    userId: input.userId,
    historySessionId: input.request.historySessionId,
    title: deriveSessionTitle(input.request.intent),
    workspaceFingerprint: input.request.workspaceFingerprint,
    workflow: "binary_generate",
  });
  const run = await createAgentRun({
    userId: input.userId,
    sessionId,
    role: "single",
    status: "running",
    confidence: 0.82,
    riskLevel: "medium",
    input: {
      workflow: "binary_generate",
      artifactBuildId: buildId,
      intent: input.request.intent,
      workspaceFingerprint: input.request.workspaceFingerprint,
      targetEnvironment: input.request.targetEnvironment,
    },
  });

  const initial: BinaryBuildRecord = {
    id: buildId,
    userId: input.userId,
    historySessionId: sessionId,
    runId: run.id,
    workflow: "binary_generate",
    artifactKind: "package_bundle",
    status: "queued",
    intent: input.request.intent,
    workspaceFingerprint: input.request.workspaceFingerprint,
    targetEnvironment: input.request.targetEnvironment,
    logs: ["Queued Binary IDE portable package bundle build."],
    manifest: null,
    reliability: null,
    artifact: null,
    publish: null,
    errorMessage: null,
    createdAt,
    updatedAt: createdAt,
  };

  await createBinaryBuildRecord(initial);
  startQueuedBinaryBuild({
    userId: input.userId,
    buildId,
    request: input.request,
    runId: run.id,
  });
  return initial;
}

export async function getBinaryBuildForUser(input: {
  userId: string;
  buildId: string;
}): Promise<BinaryBuildRecord | null> {
  const record = await getBinaryBuildRecord(input.buildId);
  if (!record || record.userId !== input.userId) return null;
  return record;
}

export async function validateBinaryBuild(input: {
  userId: string;
  buildId: string;
  targetEnvironment?: BinaryTargetEnvironment;
}): Promise<BinaryBuildRecord | null> {
  const record = await getBinaryBuildForUser({ userId: input.userId, buildId: input.buildId });
  if (!record || !record.manifest) return null;

  const targetEnvironment = input.targetEnvironment || record.targetEnvironment;
  const sessionId = await ensureBinarySession({
    userId: input.userId,
    historySessionId: record.historySessionId,
    title: deriveSessionTitle(record.intent),
    workspaceFingerprint: record.workspaceFingerprint,
    workflow: "binary_validate",
  });
  const workspaceDir = getBinaryBuildWorkspaceDir(record.id);
  const reliability = await computeBinaryValidationReport({
    workspaceDir,
    manifest: record.manifest,
    targetEnvironment,
    buildSucceeded: record.status === "completed",
  });

  const run = await createAgentRun({
    userId: input.userId,
    sessionId,
    role: "single",
    status: "completed",
    confidence: reliability.score / 100,
    riskLevel: riskLevelFromReliability(reliability),
    input: {
      workflow: "binary_validate",
      artifactBuildId: record.id,
      targetEnvironment,
    },
  });

  const updated = await updateBinaryBuildRecord(record.id, {
    workflow: "binary_validate",
    historySessionId: sessionId,
    targetEnvironment,
    reliability,
    runId: run.id,
  });

  if (updated) {
    await updateAgentRun({
      userId: input.userId,
      runId: run.id,
      status: "completed",
      output: {
        workflow: "binary_validate",
        artifactBuildId: record.id,
        reliability,
      },
      confidence: reliability.score / 100,
      riskLevel: riskLevelFromReliability(reliability),
    }).catch(() => null);

    await maybeAppendSessionMessage({
      userId: input.userId,
      historySessionId: updated.historySessionId,
      content: `Binary IDE revalidated portable bundle ${updated.id}. ${updated.reliability?.summary || ""}`.trim(),
      payload: {
        workflow: "binary_validate",
        artifactBuildId: updated.id,
        reliability,
      },
    });
  }

  return updated;
}

export async function publishBinaryBuild(input: {
  userId: string;
  buildId: string;
  origin: string;
  expiresInSeconds?: number;
}): Promise<BinaryBuildRecord | null> {
  const record = await getBinaryBuildForUser({ userId: input.userId, buildId: input.buildId });
  if (!record || !record.artifact || record.status !== "completed") return null;

  await ensureBinaryArtifactStorageAccessible();
  assertBinaryDownloadSigningReady();
  await fs.access(getBinaryArtifactPath(record.id));

  const sessionId = await ensureBinarySession({
    userId: input.userId,
    historySessionId: record.historySessionId,
    title: deriveSessionTitle(record.intent),
    workspaceFingerprint: record.workspaceFingerprint,
    workflow: "binary_deploy",
  });
  const expiresAt = new Date(Date.now() + (input.expiresInSeconds || 60 * 60 * 24) * 1000).toISOString();
  const sig = createBinaryDownloadSignature(record.id, expiresAt);
  const downloadUrl = `${input.origin}/api/v1/binary/builds/${encodeURIComponent(record.id)}/download?expires=${encodeURIComponent(expiresAt)}&sig=${encodeURIComponent(sig)}`;
  const publish: BinaryPublishResult = {
    publishedAt: nowIso(),
    downloadUrl,
    expiresAt,
  };

  const run = await createAgentRun({
    userId: input.userId,
    sessionId,
    role: "single",
    status: "completed",
    confidence: 0.93,
    riskLevel: "low",
    input: {
      workflow: "binary_deploy",
      artifactBuildId: record.id,
      downloadUrl,
    },
  });

  const updated = await updateBinaryBuildRecord(record.id, {
    workflow: "binary_deploy",
    historySessionId: sessionId,
    publish,
    runId: run.id,
  });

  if (updated) {
    await updateAgentRun({
      userId: input.userId,
      runId: run.id,
      status: "completed",
      output: {
        workflow: "binary_deploy",
        artifactBuildId: record.id,
        publish,
      },
      confidence: 0.93,
      riskLevel: "low",
    }).catch(() => null);

    await maybeAppendSessionMessage({
      userId: input.userId,
      historySessionId: updated.historySessionId,
      content: `Binary IDE published portable bundle ${updated.id}. Download URL ready.`,
      payload: {
        workflow: "binary_deploy",
        artifactBuildId: updated.id,
        publish,
      },
    });
  }

  return updated;
}

export function isBinaryBuildActive(buildId: string): boolean {
  return activeBuildJobs.has(buildId);
}

import { NextRequest } from "next/server";
import { authenticatePlaygroundRequest } from "@/lib/playground/auth";
import { estimateMessagesTokens, incrementUsage } from "@/lib/hf-router/rate-limit";
import { guardPlaygroundAccess, runAssist } from "@/lib/playground/orchestration";
import {
  appendSessionMessage,
  createSession,
  getSessionById,
  getUserPlaygroundProfile,
  listSessionMessages,
  logAgentRun,
  upsertUserPlaygroundProfile,
} from "@/lib/playground/store";
import { zAssistRequest } from "@/lib/playground/contracts";
import { ok, parseBody, unauthorized } from "@/lib/playground/http";
import { getOrCreateRequestId } from "@/lib/api/request-meta";
import { jsonError } from "@/lib/api/errors";
import { db } from "@/lib/db";
import { hfUsageLogs } from "@/lib/db/playground-schema";
import {
  buildAssistResponsePayload,
  buildCompactSessionSummary,
  buildConversationHistory,
  mergeConversationHistory,
} from "./route-helpers";

type SessionTask<T> = () => Promise<T>;
const PUBLIC_PLAYGROUND_MODEL_NAME = "Playground 1";
const ASSIST_USAGE_COST_PER_1K_TOKENS = 0.0005;

const sessionQueues = new Map<string, Promise<unknown>>();

function enqueueSessionTask<T>(sessionId: string, task: SessionTask<T>): Promise<T> {
  const previous = sessionQueues.get(sessionId) ?? Promise.resolve();
  const next = previous
    .catch(() => {})
    .then(() => task());

  let nextChain: Promise<unknown>;
  nextChain = next.finally(() => {
    if (sessionQueues.get(sessionId) === nextChain) {
      sessionQueues.delete(sessionId);
    }
  });
  sessionQueues.set(sessionId, nextChain);

  return next;
}

function isSessionQueued(sessionId: string): boolean {
  return sessionQueues.has(sessionId);
}

function sse(data: Record<string, unknown>): string {
  return `data: ${JSON.stringify(data)}\n\n`;
}

const ASSIST_MAX_ATTEMPTS = 3;
const ASSIST_RETRY_DELAY_MS = 400;

function buildRecoveryTask(task: string, errorMessage: string, attempt: number): string {
  const suffix =
    `\n\nRecovery note (attempt ${attempt}): The previous attempt failed with error: ${errorMessage}. ` +
    "Continue with the original task, resolve the issue, and complete the response.";
  return task + suffix;
}

function normalizeForRepeatCheck(value: string): string {
  return value
    .toLowerCase()
    .replace(/\s+/g, " ")
    .replace(/[^\p{L}\p{N}\s]/gu, "")
    .trim();
}

function tokenizeForOverlap(value: string): Set<string> {
  return new Set(
    normalizeForRepeatCheck(value)
      .split(" ")
      .map((token) => token.trim())
      .filter((token) => token.length >= 2)
  );
}

function tokenOverlapRatio(a: string, b: string): number {
  const aTokens = tokenizeForOverlap(a);
  const bTokens = tokenizeForOverlap(b);
  if (!aTokens.size || !bTokens.size) return 0;
  let overlap = 0;
  for (const token of aTokens) {
    if (bTokens.has(token)) overlap += 1;
  }
  return overlap / Math.max(aTokens.size, bTokens.size);
}

function extractNumericAtoms(value: string): string[] {
  return normalizeForRepeatCheck(value).match(/\b\d+\b/g) ?? [];
}

function isStaleRepeatResponse(input: {
  final: string;
  task: string;
  priorConversationHistory: Array<{ role: "user" | "assistant"; content: string }>;
}): boolean {
  const normalizedFinal = normalizeForRepeatCheck(input.final);
  if (!normalizedFinal) return false;

  const lastAssistant = [...input.priorConversationHistory]
    .reverse()
    .find((turn) => turn.role === "assistant")?.content;
  if (!lastAssistant) return false;
  if (normalizeForRepeatCheck(lastAssistant) !== normalizedFinal) return false;

  const lastUser = [...input.priorConversationHistory].reverse().find((turn) => turn.role === "user")?.content;
  if (!lastUser) return false;

  const normalizedTask = normalizeForRepeatCheck(input.task);
  const normalizedLastUser = normalizeForRepeatCheck(lastUser);
  if (!normalizedTask || !normalizedLastUser) return false;
  if (normalizedTask === normalizedLastUser) return false;

  const normalizedLastAssistant = normalizeForRepeatCheck(lastAssistant);

  if (normalizedLastAssistant === normalizedFinal) {
    return true;
  }

  const isPartialCarryover =
    normalizedFinal.length >= 4 &&
    (normalizedLastAssistant.includes(normalizedFinal) || normalizedFinal.includes(normalizedLastAssistant));

  const finalVsLastAssistantOverlap = tokenOverlapRatio(input.final, lastAssistant);
  const finalVsTaskOverlap = tokenOverlapRatio(input.final, input.task);
  const semanticCarryover =
    finalVsLastAssistantOverlap >= 0.45 &&
    finalVsTaskOverlap <= 0.2;

  const finalNumbers = extractNumericAtoms(input.final);
  const lastAssistantNumbers = extractNumericAtoms(lastAssistant);
  const currentTaskLooksMath = /[\d]+\s*[\+\-\*\/x]/i.test(input.task) || /\b(calculate|compute|multiply|divide|plus|minus)\b/i.test(input.task);
  const numericCarryover =
    !currentTaskLooksMath &&
    finalNumbers.length > 0 &&
    finalNumbers.every((n) => lastAssistantNumbers.includes(n));

  const taskOverlap = tokenOverlapRatio(input.task, lastUser);

  return taskOverlap < 0.35 && (isPartialCarryover || numericCarryover || semanticCarryover);
}

async function sleep(ms: number): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

function estimateAttachmentBytesFromDataUrl(dataUrl: string | undefined): number | null {
  if (!dataUrl || typeof dataUrl !== "string") return null;
  const comma = dataUrl.indexOf(",");
  if (comma < 0) return null;
  const base64 = dataUrl.slice(comma + 1).replace(/\s+/g, "");
  if (!base64) return 0;
  const padding = base64.endsWith("==") ? 2 : base64.endsWith("=") ? 1 : 0;
  const bytes = Math.max(0, Math.floor((base64.length * 3) / 4) - padding);
  return Number.isFinite(bytes) ? bytes : null;
}

function summarizeAttachments(
  attachments: Array<{ mimeType: string; name?: string; dataUrl?: string }> | undefined
): Array<{ mimeType: string; name?: string; bytesApprox?: number }> | undefined {
  if (!attachments?.length) return undefined;
  return attachments.slice(0, 6).map((attachment) => {
    const bytesApprox = estimateAttachmentBytesFromDataUrl(attachment.dataUrl);
    return {
      mimeType: attachment.mimeType,
      ...(attachment.name ? { name: attachment.name.slice(0, 255) } : {}),
      ...(typeof bytesApprox === "number" ? { bytesApprox } : {}),
    };
  });
}

function estimateOutputTokens(text: string): number {
  const normalized = String(text || "");
  if (!normalized) return 0;
  return Math.max(1, Math.ceil(normalized.length / 4));
}

function calculateEstimatedCost(tokensInput: number, tokensOutput: number): number {
  const totalTokens = Math.max(0, tokensInput) + Math.max(0, tokensOutput);
  return (totalTokens / 1000) * ASSIST_USAGE_COST_PER_1K_TOKENS;
}

function inferProviderFromAssistLogs(logs: string[] | undefined): string {
  for (const line of logs ?? []) {
    const match = String(line || "").match(/\bprovider=([a-z0-9_-]+)/i);
    if (match?.[1]) return match[1].toLowerCase().slice(0, 50);
  }
  return "playground";
}

function buildAssistUsagePayload(params: {
  body: {
    mode?: string;
    model?: string;
    max_tokens?: number;
    historySessionId?: string;
    executionPolicy?: string;
    safetyProfile?: string;
    workflowIntentId?: string;
    clientTrace?: { extensionVersion?: string; workspaceHash?: string };
    context?: {
      activeFile?: { path?: string };
      openFiles?: unknown[];
      diagnostics?: unknown[];
      indexedSnippets?: unknown[];
    };
  };
  attachments: Array<{ mimeType: string; name?: string; bytesApprox?: number }> | undefined;
  sessionId: string;
  traceId: string;
  stream: boolean;
  resolvedModel: string;
  provider: string;
  reasonCodes?: string[];
  repromptStage?: string;
}): Record<string, unknown> {
  return {
    endpoint: "/api/v1/playground/assist",
    mode: params.body.mode ?? "auto",
    stream: params.stream,
    modelRequested: params.body.model ?? null,
    modelResolved: params.resolvedModel,
    provider: params.provider,
    maxTokensRequested: params.body.max_tokens ?? null,
    historySessionId: params.body.historySessionId ?? null,
    executionPolicy: params.body.executionPolicy ?? null,
    safetyProfile: params.body.safetyProfile ?? null,
    workflowIntentId: params.body.workflowIntentId ?? null,
    clientTrace: params.body.clientTrace ?? null,
    contextSummary: {
      hasActiveFile: Boolean(params.body.context?.activeFile?.path),
      openFiles: params.body.context?.openFiles?.length ?? 0,
      diagnostics: params.body.context?.diagnostics?.length ?? 0,
      indexedSnippets: params.body.context?.indexedSnippets?.length ?? 0,
    },
    attachments: params.attachments,
    sessionId: params.sessionId,
    traceId: params.traceId,
    reasonCodes: params.reasonCodes ?? [],
    repromptStage: params.repromptStage ?? "none",
  };
}

async function recordAssistUsage(params: {
  userId: string;
  model: string;
  provider: string;
  tokensInput: number;
  tokensOutput: number;
  latencyMs: number;
  status: "success" | "error" | "rate_limited" | "quota_exceeded" | "validation_error";
  errorMessage?: string;
  requestPayload: Record<string, unknown>;
}): Promise<void> {
  const tokensInput = Math.max(0, Math.floor(params.tokensInput));
  const tokensOutput = Math.max(0, Math.floor(params.tokensOutput));
  const estimatedCostUsd =
    params.status === "success" ? calculateEstimatedCost(tokensInput, tokensOutput) : 0;

  try {
    await db.insert(hfUsageLogs).values({
      userId: params.userId,
      model: String(params.model || PUBLIC_PLAYGROUND_MODEL_NAME).slice(0, 100),
      provider: String(params.provider || "playground").slice(0, 50),
      tokensInput,
      tokensOutput,
      latencyMs: Math.max(0, Math.floor(params.latencyMs)),
      status: params.status,
      errorMessage: params.errorMessage,
      estimatedCostUsd,
      requestPayload: params.requestPayload,
    });
  } catch (error) {
    console.error("Failed to log assist usage:", error);
  }

  if (params.status === "success") {
    try {
      await incrementUsage(params.userId, tokensInput, tokensOutput, estimatedCostUsd);
    } catch (error) {
      console.error("Failed to increment assist usage counters:", error);
    }
  }
}

function statusFromAccessError(statusCode?: number): "rate_limited" | "quota_exceeded" | "validation_error" {
  if (statusCode === 402) return "quota_exceeded";
  if (statusCode === 429) return "rate_limited";
  return "validation_error";
}

export async function POST(request: NextRequest): Promise<Response> {
  const auth = await authenticatePlaygroundRequest(request);
  if (!auth) return unauthorized(request);

  const parsed = await parseBody(request, zAssistRequest);
  if (!parsed.success) return parsed.response;
  const body = parsed.data;
  const requestStartedAt = Date.now();
  const attachmentsSummary = summarizeAttachments(body.attachments);

  const estimatedInputTokens = estimateMessagesTokens([{ content: body.task }]);
  const access = await guardPlaygroundAccess({
    userId: auth.userId,
    email: auth.email,
    requestedMaxTokens: Math.max(64, body.max_tokens ?? 512),
    estimatedInputTokens,
  });

  if (!access.allowed) {
    const resolvedModel = body.model || PUBLIC_PLAYGROUND_MODEL_NAME;
    await recordAssistUsage({
      userId: auth.userId,
      model: resolvedModel,
      provider: "playground",
      tokensInput: estimatedInputTokens,
      tokensOutput: 0,
      latencyMs: Date.now() - requestStartedAt,
      status: statusFromAccessError(access.status),
      errorMessage: access.message,
      requestPayload: buildAssistUsagePayload({
        body,
        attachments: attachmentsSummary,
        stream: Boolean(body.stream),
        sessionId: body.historySessionId || "pending",
        traceId: getOrCreateRequestId(request),
        resolvedModel,
        provider: "playground",
        reasonCodes: access.error ? [access.error] : [],
        repromptStage: "none",
      }),
    });
    return jsonError(request, {
      code: access.error,
      message: access.message,
      status: access.status,
      details: access.details,
    });
  }

  const traceId = getOrCreateRequestId(request);
  const stream = Boolean(body.stream);
  let sessionId = body.historySessionId;
  const requestedHistorySessionId = sessionId;
  let recoveredStaleHistorySession = false;
  if (!sessionId) {
    const created = await createSession({
      userId: auth.userId,
      title: body.task.slice(0, 80),
      mode: body.mode ?? "auto",
      workspaceFingerprint: body.clientTrace?.workspaceHash,
      metadata: { source: "assist", workflowIntentId: body.workflowIntentId ?? null },
      traceId,
    });
    sessionId = created.id;
  } else {
    const existing = await getSessionById({ userId: auth.userId, sessionId });
    if (!existing) {
      const created = await createSession({
        userId: auth.userId,
        title: body.task.slice(0, 80),
        mode: body.mode ?? "auto",
        workspaceFingerprint: body.clientTrace?.workspaceHash,
        metadata: {
          source: "assist",
          workflowIntentId: body.workflowIntentId ?? null,
          recoveredFromHistorySessionId: sessionId,
        },
        traceId,
      });
      sessionId = created.id;
      recoveredStaleHistorySession = true;
    }
  }

  const persistedConversationHistory = buildConversationHistory(
    await listSessionMessages({
      userId: auth.userId,
      sessionId,
      includeAgentEvents: false,
      limit: 120,
    }).catch(() => [])
  );
  let priorConversationHistory = mergeConversationHistory({
    persisted: persistedConversationHistory,
    fromClient: body.conversationHistory,
  });
  if (recoveredStaleHistorySession && requestedHistorySessionId) {
    priorConversationHistory = [];
  }
  const contextBudgetMax = Math.max(1024, body.contextBudget?.maxTokens ?? 8192);
  const historyTokens = estimateMessagesTokens(
    priorConversationHistory.map((turn) => ({ content: turn.content }))
  );
  const projectedTokens = historyTokens + estimateMessagesTokens([{ content: body.task }]);
  if (priorConversationHistory.length > 4 && projectedTokens >= Math.floor(contextBudgetMax * 0.8)) {
    const compactSummary = buildCompactSessionSummary({
      history: priorConversationHistory,
      latestTask: body.task,
      latestFinal: "",
    });
    if (compactSummary) {
      const tail = priorConversationHistory.slice(-4);
      priorConversationHistory = [{ role: "assistant", content: `Session summary:\n${compactSummary}` }, ...tail];
    }
  }
  const userProfile = await getUserPlaygroundProfile({ userId: auth.userId }).catch(() => null);

  if (body.clientPreferences) {
    await upsertUserPlaygroundProfile({
      userId: auth.userId,
      ...(body.clientPreferences.tone ? { preferredTone: body.clientPreferences.tone } : {}),
      ...(body.clientPreferences.autonomy ? { autonomyMode: body.clientPreferences.autonomy } : {}),
      ...(body.clientPreferences.responseStyle ? { responseStyle: body.clientPreferences.responseStyle } : {}),
      ...(body.clientPreferences.reasoning ? { reasoningPreference: body.clientPreferences.reasoning } : {}),
      ...(body.model ? { preferredModelAlias: body.model } : {}),
      stablePreferences: {
        source: "clientPreferences",
        ...(body.clientPreferences || {}),
      },
    }).catch(() => {});
  }
  const effectiveUserProfile = {
    ...(userProfile || {}),
    ...(body.clientPreferences?.tone ? { preferredTone: body.clientPreferences.tone } : {}),
    ...(body.clientPreferences?.autonomy ? { autonomyMode: body.clientPreferences.autonomy } : {}),
    ...(body.clientPreferences?.responseStyle ? { responseStyle: body.clientPreferences.responseStyle } : {}),
    ...(body.clientPreferences?.reasoning ? { reasoningPreference: body.clientPreferences.reasoning } : {}),
    ...(body.model ? { preferredModelAlias: body.model } : {}),
  };

  await appendSessionMessage({
    userId: auth.userId,
    sessionId,
    role: "user",
    content: body.task,
    payload: {
      mode: body.mode ?? "auto",
      context: body.context ?? null,
      attachments: attachmentsSummary,
    },
    tokenCount: estimatedInputTokens,
  });

  if (!stream) {
    const result = await enqueueSessionTask(sessionId, async () => {
      const startedAt = Date.now();
      let runResult: Awaited<ReturnType<typeof runAssist>> | null = null;
      let lastError: unknown = null;
      for (let attempt = 1; attempt <= ASSIST_MAX_ATTEMPTS; attempt += 1) {
        try {
          const task = attempt === 1 ? body.task : buildRecoveryTask(body.task, String(lastError ?? "unknown error"), attempt);
          runResult = await runAssist({
            ...body,
            task,
            mode: body.mode ?? "auto",
            conversationHistory: priorConversationHistory,
            clientPreferences: body.clientPreferences,
            userProfile: effectiveUserProfile,
          });
          if (
            runResult &&
            isStaleRepeatResponse({
              final: runResult.final,
              task: body.task,
              priorConversationHistory,
            })
          ) {
            lastError = new Error("stale_repeat_detected: previous answer was repeated instead of answering the latest user task");
            if (attempt < ASSIST_MAX_ATTEMPTS) {
              continue;
            }
          }
          break;
        } catch (error) {
          lastError = error;
          if (attempt < ASSIST_MAX_ATTEMPTS) await sleep(ASSIST_RETRY_DELAY_MS);
        }
      }
      if (!runResult) throw lastError ?? new Error("Unknown assist failure");
      const latencyMs = Date.now() - startedAt;
      await appendSessionMessage({
        userId: auth.userId,
        sessionId,
        role: "assistant",
        content: runResult.final,
        payload: runResult,
        tokenCount: Math.ceil(runResult.final.length / 4),
        latencyMs,
      });
      await logAgentRun({
        userId: auth.userId,
        sessionId,
        role: "single",
        status: "completed",
        confidence: runResult.confidence,
        riskLevel: runResult.risk.blastRadius,
        payload: {
          mode: body.mode ?? "auto",
          decision: runResult.decision,
          intent: runResult.intent,
          reasonCodes: runResult.reasonCodes,
          autonomyDecision: runResult.autonomyDecision,
          validationPlan: runResult.validationPlan,
          completionStatus: runResult.completionStatus,
          missingRequirements: runResult.missingRequirements,
          traceId,
        },
      });
      await upsertUserPlaygroundProfile({
        userId: auth.userId,
        sessionSummary: buildCompactSessionSummary({
          history: [...priorConversationHistory, { role: "user", content: body.task }, { role: "assistant", content: runResult.final }],
          latestTask: body.task,
          latestFinal: runResult.final,
        }),
        ...(body.model ? { preferredModelAlias: body.model } : {}),
      }).catch(() => {});

      const provider = inferProviderFromAssistLogs(runResult.logs);
      await recordAssistUsage({
        userId: auth.userId,
        model: runResult.modelUsed || body.model || PUBLIC_PLAYGROUND_MODEL_NAME,
        provider,
        tokensInput: estimatedInputTokens,
        tokensOutput: estimateOutputTokens(runResult.final),
        latencyMs,
        status: "success",
        requestPayload: buildAssistUsagePayload({
          body,
          attachments: attachmentsSummary,
          stream: false,
          sessionId,
          traceId,
          resolvedModel: runResult.modelUsed || body.model || PUBLIC_PLAYGROUND_MODEL_NAME,
          provider,
          reasonCodes: runResult.reasonCodes,
          repromptStage: runResult.repromptStage,
        }),
      });
      return runResult;
    });
    const payload = buildAssistResponsePayload({ sessionId, traceId, result });
    if (recoveredStaleHistorySession && requestedHistorySessionId) {
      payload.logs = [...(payload.logs || []), "session_recovered_from_stale_history_session_id"];
    }
    return ok(request, payload);
  }

  const { readable, writable } = new TransformStream();
  const writer = writable.getWriter();
  const encoder = new TextEncoder();
  const emitStreamError = async (error: unknown) => {
    const message = error instanceof Error ? error.message : String(error);
    await writer.write(
      encoder.encode(
        sse({
          event: "log",
          level: "error",
          message,
        })
      )
    );
    await writer.write(encoder.encode(sse({ event: "status", data: "Request failed." })));
    await writer.write(encoder.encode(sse({ event: "final", data: `I hit an error while generating a response: ${message}` })));
    await writer.write(encoder.encode("data: [DONE]\n\n"));
  };
  const wasQueued = isSessionQueued(sessionId);
  if (wasQueued) {
    void writer.write(encoder.encode(sse({ event: "status", data: "Queued behind another request" })));
  }
  if (recoveredStaleHistorySession && requestedHistorySessionId) {
    void writer.write(
      encoder.encode(
        sse({
          event: "status",
          data: "Recovered stale session id and continued with a fresh session.",
        })
      )
    );
  }

  void (async () => {
    try {
      await enqueueSessionTask(sessionId, async () => {
        try {
          await writer.write(encoder.encode(sse({ event: "phase", data: { name: "decision", ts: Date.now(), traceId } })));
          await writer.write(encoder.encode(sse({ event: "log", message: "assist_started", sessionId, traceId })));
          const startedAt = Date.now();
          let result: Awaited<ReturnType<typeof runAssist>> | null = null;
          let lastError: unknown = null;
          for (let attempt = 1; attempt <= ASSIST_MAX_ATTEMPTS; attempt += 1) {
            try {
              if (attempt > 1) {
                await writer.write(
                  encoder.encode(
                    sse({ event: "status", data: `Attempting recovery (${attempt}/${ASSIST_MAX_ATTEMPTS})...` })
                  )
                );
              }
              const task = attempt === 1 ? body.task : buildRecoveryTask(body.task, String(lastError ?? "unknown error"), attempt);
              result = await runAssist(
                {
                  ...body,
                  task,
                  mode: body.mode ?? "auto",
                  conversationHistory: priorConversationHistory,
                  clientPreferences: body.clientPreferences,
                  userProfile: effectiveUserProfile,
                },
                {
                  onToken: async (token) => {
                    if (!token) return;
                    await writer.write(encoder.encode(sse({ event: "token", data: token })));
                  },
                  onReasoningToken: async (token) => {
                    if (!token) return;
                    await writer.write(encoder.encode(sse({ event: "reasoning_token", data: token })));
                  },
                  onStatus: async (status) => {
                    if (!status) return;
                    await writer.write(encoder.encode(sse({ event: "status", data: status })));
                  },
                }
              );
              if (
                result &&
                isStaleRepeatResponse({
                  final: result.final,
                  task: body.task,
                  priorConversationHistory,
                })
              ) {
                lastError = new Error("stale_repeat_detected: previous answer was repeated instead of answering the latest user task");
                if (attempt < ASSIST_MAX_ATTEMPTS) {
                  continue;
                }
              }
              break;
            } catch (error) {
              lastError = error;
              if (attempt < ASSIST_MAX_ATTEMPTS) await sleep(ASSIST_RETRY_DELAY_MS);
            }
          }
          if (!result) throw lastError ?? new Error("Unknown assist failure");
          const latencyMs = Date.now() - startedAt;

          await writer.write(encoder.encode(sse({ event: "decision", data: result.decision })));
          await writer.write(
            encoder.encode(
              sse({
                event: "reason_codes",
                data: result.reasonCodes,
              })
            )
          );
          if (result.plan) {
            await writer.write(encoder.encode(sse({ event: "phase", data: { name: "plan", ts: Date.now() } })));
            await writer.write(encoder.encode(sse({ event: "plan_chunk", data: result.plan })));
          }
          await writer.write(encoder.encode(sse({ event: "phase", data: { name: "execute", ts: Date.now() } })));
          await writer.write(encoder.encode(sse({ event: "diff_chunk", data: result.edits })));
          await writer.write(encoder.encode(sse({ event: "commands_chunk", data: result.commands })));
          await writer.write(encoder.encode(sse({ event: "actions_chunk", data: result.actions })));
          await writer.write(encoder.encode(sse({ event: "log", data: result.logs })));
          await writer.write(
            encoder.encode(
              sse({
                event: "meta",
                data: {
                  intent: result.intent,
                  reasonCodes: result.reasonCodes,
                  autonomyDecision: result.autonomyDecision,
                  validationPlan: result.validationPlan,
                  confidence: result.confidence,
                  risk: result.risk,
                  influence: result.influence,
                  model: result.modelMetadata.modelResolvedAlias,
                  modelRequested: result.modelMetadata.modelRequested,
                  modelRequestedAlias: result.modelMetadata.modelRequestedAlias,
                  modelResolved: result.modelMetadata.modelResolved,
                  modelResolvedAlias: result.modelMetadata.modelResolvedAlias,
                  providerResolved: result.modelMetadata.providerResolved,
                  contractVersion: result.modelMetadata.contractVersion,
                  modelCapabilities: result.modelMetadata.capabilities,
                  modelCertification: result.modelMetadata.certification,
                  adapter: result.modelMetadata.adapter,
                  decision: result.decision.mode,
                  actions: result.actions,
                  toolState: result.toolState,
                  nextBestActions: result.nextBestActions,
                  repromptStage: result.repromptStage,
                  actionability: result.actionability,
                  completionStatus: result.completionStatus,
                  missingRequirements: result.missingRequirements,
                },
              })
            )
          );
          await writer.write(encoder.encode(sse({ event: "phase", data: { name: "verify", ts: Date.now() } })));
          await writer.write(encoder.encode(sse({ event: "final", data: result.final })));
          await writer.write(encoder.encode("data: [DONE]\n\n"));

          await appendSessionMessage({
            userId: auth.userId,
            sessionId,
            role: "assistant",
            content: result.final,
            payload: result,
            tokenCount: Math.ceil(result.final.length / 4),
            latencyMs,
          });
          await logAgentRun({
            userId: auth.userId,
            sessionId,
            role: "single",
            status: "completed",
            confidence: result.confidence,
            riskLevel: result.risk.blastRadius,
            payload: {
              mode: body.mode ?? "auto",
              decision: result.decision,
              intent: result.intent,
              reasonCodes: result.reasonCodes,
              autonomyDecision: result.autonomyDecision,
              validationPlan: result.validationPlan,
              completionStatus: result.completionStatus,
              missingRequirements: result.missingRequirements,
              traceId,
            },
          });
          await upsertUserPlaygroundProfile({
            userId: auth.userId,
            sessionSummary: buildCompactSessionSummary({
              history: [...priorConversationHistory, { role: "user", content: body.task }, { role: "assistant", content: result.final }],
              latestTask: body.task,
              latestFinal: result.final,
            }),
            ...(body.model ? { preferredModelAlias: body.model } : {}),
          }).catch(() => {});

          const provider = inferProviderFromAssistLogs(result.logs);
          await recordAssistUsage({
            userId: auth.userId,
            model: result.modelUsed || body.model || PUBLIC_PLAYGROUND_MODEL_NAME,
            provider,
            tokensInput: estimatedInputTokens,
            tokensOutput: estimateOutputTokens(result.final),
            latencyMs,
            status: "success",
            requestPayload: buildAssistUsagePayload({
              body,
              attachments: attachmentsSummary,
              stream: true,
              sessionId,
              traceId,
              resolvedModel: result.modelUsed || body.model || PUBLIC_PLAYGROUND_MODEL_NAME,
              provider,
              reasonCodes: result.reasonCodes,
              repromptStage: result.repromptStage,
            }),
          });
        } catch (error) {
          await emitStreamError(error);
        }
      });
    } catch (error) {
      await emitStreamError(error);
    } finally {
      await writer.close();
    }
  })();

  return new Response(readable, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    },
  });
}

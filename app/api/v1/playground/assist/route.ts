import { NextRequest } from "next/server";
import { authenticatePlaygroundRequest } from "@/lib/playground/auth";
import { estimateMessagesTokens } from "@/lib/hf-router/rate-limit";
import { guardPlaygroundAccess, runAssist } from "@/lib/playground/orchestration";
import {
  appendSessionMessage,
  createSession,
  getUserPlaygroundProfile,
  listSessionMessages,
  listSessions,
  logAgentRun,
  upsertUserPlaygroundProfile,
} from "@/lib/playground/store";
import { zAssistRequest } from "@/lib/playground/contracts";
import { badRequest, ok, parseBody, unauthorized } from "@/lib/playground/http";
import { getOrCreateRequestId } from "@/lib/api/request-meta";
import { jsonError } from "@/lib/api/errors";
import {
  buildAssistResponsePayload,
  buildCompactSessionSummary,
  buildConversationHistory,
  mergeConversationHistory,
} from "./route-helpers";

type SessionTask<T> = () => Promise<T>;
const PUBLIC_PLAYGROUND_MODEL_NAME = "Playground 1";

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

export async function POST(request: NextRequest): Promise<Response> {
  const auth = await authenticatePlaygroundRequest(request);
  if (!auth) return unauthorized(request);

  const parsed = await parseBody(request, zAssistRequest);
  if (!parsed.success) return parsed.response;
  const body = parsed.data;

  const estimatedInputTokens = estimateMessagesTokens([{ content: body.task }]);
  const access = await guardPlaygroundAccess({
    userId: auth.userId,
    email: auth.email,
    requestedMaxTokens: Math.max(64, body.max_tokens ?? 512),
    estimatedInputTokens,
  });

  if (!access.allowed) {
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
    const existing = await listSessions({ userId: auth.userId, limit: 100 });
    if (!existing.data.some((session) => session.id === sessionId)) {
      return badRequest(request, "Unknown historySessionId");
    }
  }

  const persistedConversationHistory = buildConversationHistory(
    await listSessionMessages({
      userId: auth.userId,
      sessionId,
      includeAgentEvents: false,
    }).catch(() => [])
  );
  const priorConversationHistory = mergeConversationHistory({
    persisted: persistedConversationHistory,
    fromClient: body.conversationHistory,
  });
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
      attachments: summarizeAttachments(body.attachments),
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
      return runResult;
    });
    return ok(request, buildAssistResponsePayload({ sessionId, traceId, result }));
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
                  onStatus: async (status) => {
                    if (!status) return;
                    await writer.write(encoder.encode(sse({ event: "status", data: status })));
                  },
                }
              );
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
                  model: PUBLIC_PLAYGROUND_MODEL_NAME,
                  decision: result.decision.mode,
                  actions: result.actions,
                  nextBestActions: result.nextBestActions,
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

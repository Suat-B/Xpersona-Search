import { NextRequest } from "next/server";
import { authenticatePlaygroundApiKey } from "@/lib/playground/auth";
import { estimateMessagesTokens } from "@/lib/hf-router/rate-limit";
import { guardPlaygroundAccess, runAssist } from "@/lib/playground/orchestration";
import { appendSessionMessage, createSession, listSessions, logAgentRun } from "@/lib/playground/store";
import { zAssistRequest } from "@/lib/playground/contracts";
import { badRequest, ok, parseBody, unauthorized } from "@/lib/playground/http";
import { getOrCreateRequestId } from "@/lib/api/request-meta";
import { jsonError } from "@/lib/api/errors";

type SessionTask<T> = () => Promise<T>;

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

export async function POST(request: NextRequest): Promise<Response> {
  const auth = await authenticatePlaygroundApiKey(request);
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

  await appendSessionMessage({
    userId: auth.userId,
    sessionId,
    role: "user",
    content: body.task,
    payload: { mode: body.mode ?? "auto", context: body.context ?? null },
    tokenCount: estimatedInputTokens,
  });

  if (!stream) {
    const result = await enqueueSessionTask(sessionId, async () => {
      const startedAt = Date.now();
      const runResult = await runAssist({ ...body, mode: body.mode ?? "auto" });
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
        payload: { mode: body.mode ?? "auto", decision: runResult.decision, traceId },
      });
      return runResult;
    });
    return ok(request, {
      sessionId,
      decision: result.decision,
      plan: result.plan,
      edits: result.edits,
      commands: result.commands,
      final: result.final,
      logs: result.logs,
      model: result.modelUsed,
      confidence: result.confidence,
      risk: result.risk,
      influence: result.influence,
      nextBestActions: result.nextBestActions,
      traceId,
    });
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
          const result = await runAssist(
            { ...body, mode: body.mode ?? "auto" },
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
          const latencyMs = Date.now() - startedAt;

          await writer.write(encoder.encode(sse({ event: "decision", data: result.decision })));
          if (result.plan) {
            await writer.write(encoder.encode(sse({ event: "phase", data: { name: "plan", ts: Date.now() } })));
            await writer.write(encoder.encode(sse({ event: "plan_chunk", data: result.plan })));
          }
          await writer.write(encoder.encode(sse({ event: "phase", data: { name: "execute", ts: Date.now() } })));
          await writer.write(encoder.encode(sse({ event: "diff_chunk", data: result.edits })));
          await writer.write(encoder.encode(sse({ event: "commands_chunk", data: result.commands })));
          await writer.write(encoder.encode(sse({ event: "log", data: result.logs })));
          await writer.write(
            encoder.encode(
              sse({
                event: "meta",
                data: {
                  confidence: result.confidence,
                  risk: result.risk,
                  influence: result.influence,
                  model: result.modelUsed,
                  decision: result.decision.mode,
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
            payload: { mode: body.mode ?? "auto", decision: result.decision, traceId },
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

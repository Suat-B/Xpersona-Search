import { NextRequest } from "next/server";
import { authenticatePlaygroundApiKey } from "@/lib/playground/auth";
import { estimateMessagesTokens } from "@/lib/hf-router/rate-limit";
import { guardPlaygroundAccess, runAssist } from "@/lib/playground/orchestration";
import { appendSessionMessage, createSession, listSessions, logAgentRun } from "@/lib/playground/store";
import { zAssistRequest } from "@/lib/playground/contracts";
import { badRequest, ok, parseBody, unauthorized } from "@/lib/playground/http";
import { getOrCreateRequestId } from "@/lib/api/request-meta";
import { jsonError } from "@/lib/api/errors";

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
    const startedAt = Date.now();
    const result = await runAssist({ ...body, mode: body.mode ?? "auto" });
    const latencyMs = Date.now() - startedAt;
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

  void (async () => {
    try {
      await writer.write(encoder.encode(sse({ event: "phase", data: { name: "decision", ts: Date.now(), traceId } })));
      await writer.write(encoder.encode(sse({ event: "log", message: "assist_started", sessionId, traceId })));
      const startedAt = Date.now();
      const result = await runAssist({ ...body, mode: body.mode ?? "auto" });
      const latencyMs = Date.now() - startedAt;

      await writer.write(encoder.encode(sse({ event: "decision", data: result.decision })));
      if (result.plan) {
        await writer.write(encoder.encode(sse({ event: "phase", data: { name: "plan", ts: Date.now() } })));
        await writer.write(encoder.encode(sse({ event: "plan_chunk", data: result.plan })));
      }
      await writer.write(encoder.encode(sse({ event: "phase", data: { name: "execute", ts: Date.now() } })));
      await writer.write(encoder.encode(sse({ event: "diff_chunk", data: result.edits })));
      await writer.write(encoder.encode(sse({ event: "log", data: result.logs })));
      await writer.write(encoder.encode(sse({ event: "meta", data: {
        confidence: result.confidence,
        risk: result.risk,
        influence: result.influence,
        nextBestActions: result.nextBestActions,
      } })));
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
      await writer.write(
        encoder.encode(
          sse({
            event: "log",
            level: "error",
            message: error instanceof Error ? error.message : String(error),
          })
        )
      );
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

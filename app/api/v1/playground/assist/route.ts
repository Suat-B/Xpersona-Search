import { NextRequest } from "next/server";
import { estimateMessagesTokens, incrementUsage } from "@/lib/hf-router/rate-limit";
import { authenticatePlaygroundRequest } from "@/lib/playground/auth";
import { guardPlaygroundAccess, runAssist } from "@/lib/playground/orchestration";
import {
  appendSessionMessage,
  createSession,
  getSessionById,
  listSessionMessages,
} from "@/lib/playground/store";
import { zAssistRequest } from "@/lib/playground/contracts";
import { ok, parseBody, unauthorized } from "@/lib/playground/http";
import { getOrCreateRequestId } from "@/lib/api/request-meta";
import { jsonError } from "@/lib/api/errors";
import {
  buildAssistResponsePayload,
  buildConversationHistory,
} from "./route-helpers";

const ASSIST_COST_PER_1K_TOKENS = 0.0005;

function estimateOutputTokens(text: string): number {
  const normalized = String(text || "");
  if (!normalized) return 0;
  return Math.max(1, Math.ceil(normalized.length / 4));
}

function estimateCostUsd(tokensInput: number, tokensOutput: number): number {
  return ((Math.max(0, tokensInput) + Math.max(0, tokensOutput)) / 1000) * ASSIST_COST_PER_1K_TOKENS;
}

function deriveSessionTitle(task: string): string {
  return String(task || "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 80) || "Playground Chat";
}

async function resolveSession(input: {
  userId: string;
  requestedSessionId?: string;
  mode: "auto" | "plan" | "yolo";
  workspaceFingerprint?: string;
  title: string;
  traceId: string;
}) {
  const requested = String(input.requestedSessionId || "").trim();
  if (requested) {
    const existing = await getSessionById({
      userId: input.userId,
      sessionId: requested,
    }).catch(() => null);
    if (existing) return existing;
  }

  return createSession({
    userId: input.userId,
    title: input.title,
    mode: input.mode,
    workspaceFingerprint: input.workspaceFingerprint,
    traceId: input.traceId,
  });
}

function sse(value: unknown): string {
  return `data: ${JSON.stringify(value)}\n\n`;
}

export async function POST(request: NextRequest): Promise<Response> {
  const auth = await authenticatePlaygroundRequest(request);
  if (!auth) return unauthorized(request);

  const parsed = await parseBody(request, zAssistRequest);
  if (!parsed.success) return parsed.response;
  const body = parsed.data;
  const mode = body.mode || "auto";

  const estimatedInputTokens = estimateMessagesTokens([{ content: body.task }]);
  const access = await guardPlaygroundAccess({
    userId: auth.userId,
    email: auth.email,
    requestedMaxTokens: 2048,
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
  const session = await resolveSession({
    userId: auth.userId,
    requestedSessionId: body.historySessionId,
    mode,
    workspaceFingerprint: body.clientTrace?.workspaceHash,
    title: deriveSessionTitle(body.task),
    traceId,
  });

  const persistedHistory = buildConversationHistory(
    await listSessionMessages({
      userId: auth.userId,
      sessionId: session.id,
      limit: 40,
    }).catch(() => [])
  );

  await appendSessionMessage({
    userId: auth.userId,
    sessionId: session.id,
    role: "user",
    content: body.task,
    payload: {
      mode: body.mode,
      resolvedMode: mode,
      target: body.retrievalHints?.preferredTargetPath ?? null,
    },
    tokenCount: estimatedInputTokens,
  });

  const runTask = async () => {
    const result = await runAssist({
      ...body,
      mode,
      conversationHistory: persistedHistory,
      maxTokens: Math.min(access.limits?.maxOutputTokens ?? 2048, 2048),
    });

    const outputTokens = estimateOutputTokens(result.final);
    await appendSessionMessage({
      userId: auth.userId,
      sessionId: session.id,
      role: "assistant",
      content: result.final,
      payload: result,
      tokenCount: outputTokens,
    });

    await incrementUsage(
      auth.userId,
      estimatedInputTokens,
      outputTokens,
      estimateCostUsd(estimatedInputTokens, outputTokens)
    ).catch(() => {});

    return result;
  };

  if (!body.stream) {
    const result = await runTask();
    return ok(
      request,
      buildAssistResponsePayload({
        sessionId: session.id,
        traceId,
        result,
      })
    );
  }

  const { readable, writable } = new TransformStream();
  const writer = writable.getWriter();
  const encoder = new TextEncoder();

  const emit = async (event: string, data: unknown) => {
    await writer.write(encoder.encode(sse({ event, data })));
  };

  void (async () => {
    try {
      await emit("status", "Starting Playground assist run...");
      const result = await runTask();
      if (result.plan) await emit("plan", result.plan);
      await emit("actions", result.actions);
      await emit("meta", {
        decision: result.decision,
        validationPlan: result.validationPlan,
        targetInference: result.targetInference,
        contextSelection: result.contextSelection,
        completionStatus: result.completionStatus,
        missingRequirements: result.missingRequirements,
        sessionId: session.id,
        traceId,
      });
      await emit("final", result.final);
      await writer.write(encoder.encode("data: [DONE]\n\n"));
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      await emit("status", "Assist request failed.");
      await emit("final", `I hit an error while preparing the response: ${message}`);
      await writer.write(encoder.encode("data: [DONE]\n\n"));
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

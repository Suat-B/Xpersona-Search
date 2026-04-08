import { NextRequest } from "next/server";
import { z } from "zod";
import { authenticatePlaygroundRequest } from "@/lib/playground/auth";
import { ok, parseBody, serverError, unauthorized } from "@/lib/playground/http";
import { jsonError } from "@/lib/api/errors";
import { runOpenHandsGatewayProbeTurn, OpenHandsGatewayError } from "@/lib/playground/openhands-gateway";

const zProbeRequest = z.object({
  message: z.string().min(1).max(120_000),
  model: z.string().min(1).max(256).optional(),
  gatewayRunId: z.string().min(1).max(256).optional(),
  workspaceRoot: z.string().min(1).max(4096).optional(),
  context: z.record(z.string(), z.unknown()).optional(),
  conversationHistory: z
    .array(
      z.object({
        role: z.enum(["user", "assistant"]),
        content: z.string().min(1).max(12_000),
      })
    )
    .max(20)
    .optional(),
  tom: z
    .object({
      enabled: z.boolean().optional(),
      userKey: z.string().min(1).max(256).optional(),
      sessionId: z.string().min(1).max(256).optional(),
      traceId: z.string().min(1).max(256).optional(),
    })
    .optional(),
});

export async function POST(request: NextRequest): Promise<Response> {
  const auth = await authenticatePlaygroundRequest(request);
  if (!auth) return unauthorized(request);

  const parsed = await parseBody(request, zProbeRequest);
  if (!parsed.success) return parsed.response;

  try {
    const turn = await runOpenHandsGatewayProbeTurn({
      message: parsed.data.message,
      requestedModel: parsed.data.model,
      gatewayRunId: parsed.data.gatewayRunId,
      workspaceRoot: parsed.data.workspaceRoot,
      context: parsed.data.context,
      conversationHistory: parsed.data.conversationHistory,
      tom: parsed.data.tom
        ? {
            enabled: parsed.data.tom.enabled ?? true,
            userKey: parsed.data.tom.userKey,
            sessionId: parsed.data.tom.sessionId,
            traceId: parsed.data.tom.traceId,
          }
        : undefined,
    });

    return ok(request, {
      runId: turn.runId,
      final: turn.final,
      logs: turn.logs,
      adapter: turn.adapter,
      toolCall: turn.toolCall,
      version: turn.version,
      modelCandidate: turn.modelCandidate,
      fallbackAttempt: turn.fallbackAttempt,
      failureReason: turn.failureReason,
      persistenceDir: turn.persistenceDir,
      conversationId: turn.conversationId,
      fallbackTrail: turn.fallbackTrail,
    });
  } catch (error) {
    if (error instanceof OpenHandsGatewayError) {
      return jsonError(request, {
        code: error.code,
        message: error.message,
        status: error.status,
        details: error.details,
      });
    }
    return serverError(request, error);
  }
}

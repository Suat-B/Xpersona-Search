import { NextRequest } from "next/server";
import { estimateMessagesTokens, incrementUsage } from "@/lib/hf-router/rate-limit";
import { authenticatePlaygroundRequest } from "@/lib/playground/auth";
import {
  guardPlaygroundAccess,
  runAssist,
  type AssistResult,
} from "@/lib/playground/orchestration";
import { startAssistToolLoop } from "@/lib/playground/tool-loop";
import {
  appendSessionMessage,
  createSession,
  getSessionById,
  listSessionMessages,
} from "@/lib/playground/store";
import { zAssistRequest } from "@/lib/playground/contracts";
import { ok, parseBody, serverError, unauthorized } from "@/lib/playground/http";
import { getOrCreateRequestId } from "@/lib/api/request-meta";
import { jsonError } from "@/lib/api/errors";
import {
  isPlaygroundAssistGreetingViaGateway,
  isPlaygroundAssistPlanViaGateway,
} from "@/lib/playground/assist-openhands-routing";
import { isOpenHandsGatewayEnabled, OpenHandsGatewayError } from "@/lib/playground/openhands-gateway";
import {
  buildAssistResponsePayload,
  buildConversationHistory,
  isTrivialGreetingOnlyTask,
  resolveAssistTomEnabled,
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

function buildPartialPrefixes(text: string): string[] {
  const normalized = String(text || "").trim();
  if (!normalized) return [];

  const words = normalized.split(/\s+/);
  if (words.length <= 3) return [normalized];

  const prefixes: string[] = [];
  let buffer = "";
  let remainingBudget = 22;

  for (const word of words) {
    buffer = buffer ? `${buffer} ${word}` : word;
    remainingBudget -= word.length + 1;
    if (remainingBudget > 0) continue;
    prefixes.push(buffer);
    remainingBudget = 22;
    if (prefixes.length >= 10) break;
  }

  if (!prefixes.length || prefixes[prefixes.length - 1] !== normalized) {
    prefixes.push(normalized);
  }

  const unique: string[] = [];
  for (const prefix of prefixes) {
    if (!unique.length || unique[unique.length - 1] !== prefix) {
      unique.push(prefix);
    }
  }
  return unique.slice(0, 12);
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

  // Orchestration matrix: docs/cutie-openhands-orchestration.md (default: greeting + plan use runAssist; auto coding uses OpenHands tool loop).
  const runTask = async () => {
    const planMode = mode === "plan";
    const maxOut = Math.min(access.limits?.maxOutputTokens ?? 2048, 2048);
    const chatInteraction = body.interactionKind === "chat";
    const resolvedTomEnabled = resolveAssistTomEnabled({
      task: body.task,
      interactionKind: body.interactionKind,
      requestedTomEnabled: body.tom?.enabled,
    });
    const requestWithTom = {
      ...body,
      tom: { enabled: resolvedTomEnabled },
    } as typeof body;

    let result: AssistResult;

    const gatewayOk = isOpenHandsGatewayEnabled();

    const startHostedToolLoop = (overrides: Partial<(typeof body) & { task?: string; mode?: typeof mode }>) => {
      if (!gatewayOk) {
        throw new OpenHandsGatewayError(
          "Hosted coding uses OpenHands only. Set OPENHANDS_GATEWAY_URL on the server.",
          "OPENHANDS_GATEWAY_MISSING_CONFIG",
          503
        );
      }
      return startAssistToolLoop({
        userId: auth.userId,
        sessionId: session.id,
        traceId,
        request: {
          ...requestWithTom,
          mode,
          orchestrationProtocol: "tool_loop_v1",
          conversationHistory: persistedHistory,
          maxTokens: maxOut,
          ...overrides,
        },
      });
    };

    const trivialGreeting =
      !planMode &&
      chatInteraction &&
      mode === "auto" &&
      isTrivialGreetingOnlyTask({
        task: body.task,
        mode,
        retrievalHints: body.retrievalHints,
      });

    const greetingTask = `The user only sent a short greeting with no code request. Reply with a brief friendly greeting in plain text (2–4 sentences). Do NOT output JSON, patches, unified diffs, file edits, or tool calls. Invite them to describe a task or @mention a file.\n\nUser message: ${body.task}`;

    if (trivialGreeting) {
      if (isPlaygroundAssistGreetingViaGateway() && gatewayOk) {
        result = await startHostedToolLoop({ mode: "auto", task: greetingTask });
      } else {
        result = await runAssist({
          ...requestWithTom,
          mode: "auto",
          task: greetingTask,
          conversationHistory: persistedHistory,
          maxTokens: maxOut,
        }, {
          userId: auth.userId,
        });
      }
      await appendSessionMessage({
        userId: auth.userId,
        sessionId: session.id,
        role: "assistant",
        content: result.final,
        payload: result,
        tokenCount: estimateOutputTokens(result.final),
      }).catch(() => null);
    } else if (!planMode && chatInteraction) {
      result = await runAssist(
        {
          ...requestWithTom,
          mode,
          orchestrationProtocol: "batch_v1",
          conversationHistory: persistedHistory,
          maxTokens: maxOut,
        },
        {
          userId: auth.userId,
        }
      );
      await appendSessionMessage({
        userId: auth.userId,
        sessionId: session.id,
        role: "assistant",
        content: result.final,
        payload: result,
        tokenCount: estimateOutputTokens(result.final),
      }).catch(() => null);
    } else {
      result = planMode
        ? isPlaygroundAssistPlanViaGateway() && gatewayOk
          ? await startHostedToolLoop({ mode: "plan" })
          : await runAssist({
              ...requestWithTom,
              mode,
              conversationHistory: persistedHistory,
              maxTokens: maxOut,
            }, {
              userId: auth.userId,
            })
        : await startHostedToolLoop({ mode });

      if (planMode) {
        const outputTokens = estimateOutputTokens(result.final);
        await appendSessionMessage({
          userId: auth.userId,
          sessionId: session.id,
          role: "assistant",
          content: result.final,
          payload: result,
          tokenCount: outputTokens,
        }).catch(() => null);
      }
    }

    const shouldBillHostedUsage =
      result.modelMetadata.chatModelSource !== "user_connected" || result.orchestrator === "openhands";
    if (shouldBillHostedUsage) {
      await incrementUsage(
        auth.userId,
        estimatedInputTokens,
        estimateOutputTokens(result.final),
        estimateCostUsd(estimatedInputTokens, estimateOutputTokens(result.final))
      ).catch(() => {});
    }

    return result;
  };

  if (!body.stream) {
    try {
      const result = await runTask();
      return ok(
        request,
        buildAssistResponsePayload({
          sessionId: session.id,
          traceId,
          result,
        })
      );
    } catch (error) {
      if (error instanceof OpenHandsGatewayError) {
        return jsonError(request, {
          code: error.code,
          message: error.message,
          status: error.status,
          details: error.details,
        });
      }
      console.error("[playground/assist] non-stream run failed", error);
      return serverError(request, error);
    }
  }

  const { readable, writable } = new TransformStream();
  const writer = writable.getWriter();
  const encoder = new TextEncoder();

  const emit = async (event: string, data: unknown) => {
    await writer.write(encoder.encode(sse({ event, data })));
  };

  void (async () => {
    try {
      await emit("ack", "Assist stream connected.");
      await emit("status", "Starting Playground assist run...");
      await emit("activity", "Resolving context and orchestration plan.");
      const result = await runTask();
      await emit(
        "activity",
        result.orchestrationProtocol === "tool_loop_v1"
          ? `Tool loop ready${result.runId ? ` (${result.runId})` : ""}.`
          : "Assist result prepared."
      );
      if (result.plan) await emit("plan", result.plan);
      await emit("actions", result.actions);
      if (result.runId) await emit("run", { runId: result.runId, adapter: result.adapter, loopState: result.loopState });
      if (result.pendingToolCall) {
        await emit("activity", `Awaiting tool request: ${result.pendingToolCall.toolCall.name}`);
        await emit("tool_request", result.pendingToolCall);
      }
      await emit("meta", {
        decision: result.decision,
        validationPlan: result.validationPlan,
        targetInference: result.targetInference,
        contextSelection: result.contextSelection,
        completionStatus: result.completionStatus,
        missingRequirements: result.missingRequirements,
        modelAlias: result.modelMetadata.modelResolvedAlias,
        chatModelSource: result.modelMetadata.chatModelSource,
        chatModelAlias: result.modelMetadata.chatModelAlias,
        chatProvider: result.modelMetadata.chatProvider,
        orchestratorModelAlias: result.modelMetadata.orchestratorModelAlias,
        orchestratorProvider: result.modelMetadata.orchestratorProvider,
        fallbackApplied: result.modelMetadata.fallbackApplied,
        orchestrator: result.orchestrator,
        orchestratorVersion: result.orchestratorVersion,
        progressState: result.progressState,
        objectiveState: result.objectiveState,
        sessionId: session.id,
        traceId,
        runId: result.runId,
        orchestrationProtocol: result.orchestrationProtocol,
        adapter: result.adapter,
        loopState: result.loopState,
        pendingToolCall: result.pendingToolCall,
        toolTrace: result.toolTrace ?? [],
        receipt: result.receipt,
        checkpoint: result.checkpoint,
        reviewState: result.reviewState,
      });
      for (const partial of buildPartialPrefixes(result.final)) {
        await emit("partial", partial);
      }
      await emit("final", result.final);
      await writer.write(encoder.encode("data: [DONE]\n\n"));
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      await emit("status", "Assist request failed.");
      await emit("error", message);
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

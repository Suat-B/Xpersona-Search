import { NextRequest } from "next/server";
import { jsonError } from "@/lib/api/errors";
import { getOrCreateRequestId } from "@/lib/api/request-meta";
import { authenticatePlaygroundRequest } from "@/lib/playground/auth";
import { zRunUserInputRequest } from "@/lib/playground/contracts";
import { ok, parseBody, serverError, unauthorized } from "@/lib/playground/http";
import { runAssist, type AssistRuntimeInput, type AssistResult } from "@/lib/playground/orchestration";
import { buildAssistResponsePayload } from "@/app/api/v1/playground/assist/route-helpers";
import { appendSessionMessage, resolveAgentRunForContinue, updateAgentRun } from "@/lib/playground/store";

type Ctx = { params: Promise<{ runId: string }> };

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

function buildQuestionsHistory(request: NonNullable<AssistResult["userInputRequest"]>): string {
  return request.questions
    .map((question, index) => {
      const options = Array.isArray(question.options)
        ? question.options
            .map((option) => option.label?.trim())
            .filter((label): label is string => Boolean(label))
            .slice(0, 4)
        : [];
      return [
        `${index + 1}. ${question.question}`,
        ...(options.length ? [`Options: ${options.join(" | ")}`] : []),
      ].join("\n");
    })
    .join("\n\n");
}

function buildAnswersHistory(input: {
  request: NonNullable<AssistResult["userInputRequest"]>;
  answers: Record<string, string[]>;
}): string {
  return input.request.questions
    .map((question) => {
      const answers = Array.isArray(input.answers[question.id]) ? input.answers[question.id] : [];
      if (!answers.length) return null;
      return `${question.question}\nAnswer: ${answers.join(" | ")}`;
    })
    .filter((entry): entry is string => Boolean(entry))
    .join("\n\n");
}

export async function POST(request: NextRequest, ctx: Ctx): Promise<Response> {
  const auth = await authenticatePlaygroundRequest(request);
  if (!auth) return unauthorized(request);

  const parsed = await parseBody(request, zRunUserInputRequest);
  if (!parsed.success) return parsed.response;

  const { runId: runIdParam } = await ctx.params;
  const existing = await resolveAgentRunForContinue({
    userId: auth.userId,
    runIdFromPath: runIdParam,
    sessionId: parsed.data.sessionId,
  });
  if (!existing) {
    return jsonError(request, {
      code: "RUN_NOT_FOUND",
      message: "Unknown runId",
      status: 404,
    });
  }

  const requestTraceId = getOrCreateRequestId(request);
  try {
    const storedInput = asRecord(existing.input);
    const storedRequest = asRecord(storedInput.request) as AssistRuntimeInput;
    if (!storedRequest.mode || !storedRequest.task) {
      return jsonError(request, {
        code: "RUN_INPUT_INVALID",
        message: "The stored run does not contain a resumable assist request.",
        status: 409,
      });
    }

    const storedOutput = asRecord(existing.output);
    const pendingUserInputRequest = asRecord(storedOutput.userInputRequest) as AssistResult["userInputRequest"];
    if (!pendingUserInputRequest?.requestId || !Array.isArray(pendingUserInputRequest.questions)) {
      return jsonError(request, {
        code: "RUN_NOT_WAITING_FOR_USER_INPUT",
        message: "This run is not waiting for clarification answers.",
        status: 409,
      });
    }
    if (pendingUserInputRequest.requestId !== parsed.data.requestId) {
      return jsonError(request, {
        code: "USER_INPUT_REQUEST_MISMATCH",
        message: "The supplied requestId does not match the pending clarification request.",
        status: 409,
      });
    }

    const answerSummary = buildAnswersHistory({
      request: pendingUserInputRequest,
      answers: parsed.data.answers,
    });
    if (!answerSummary) {
      return jsonError(request, {
        code: "USER_INPUT_REQUIRED",
        message: "At least one clarification answer is required.",
        status: 400,
      });
    }

    await appendSessionMessage({
      userId: auth.userId,
      sessionId: existing.sessionId,
      role: "user",
      content: answerSummary,
      payload: {
        kind: "plan_user_input_response",
        runId: existing.id,
        requestId: parsed.data.requestId,
      },
    }).catch(() => null);

    const priorHistory = Array.isArray(storedRequest.conversationHistory) ? storedRequest.conversationHistory : [];
    const resumedRequest: AssistRuntimeInput = {
      ...storedRequest,
      conversationHistory: [
        ...priorHistory,
        {
          role: "assistant",
          content: `Clarification needed:\n${buildQuestionsHistory(pendingUserInputRequest)}`,
        },
        {
          role: "user",
          content: answerSummary,
        },
      ],
    };

    let result = await runAssist(resumedRequest, {
      userId: auth.userId,
    });
    result = {
      ...result,
      runId: existing.id,
    };

    await updateAgentRun({
      userId: auth.userId,
      runId: existing.id,
      status: result.userInputRequest ? "running" : "completed",
      input: {
        request: resumedRequest,
      },
      output: {
        ...result,
        sessionId: existing.sessionId,
        traceId: requestTraceId,
      },
      confidence: result.confidence,
      riskLevel: result.risk.blastRadius,
    }).catch(() => null);

    if (!result.userInputRequest) {
      await appendSessionMessage({
        userId: auth.userId,
        sessionId: existing.sessionId,
        role: "assistant",
        content: result.final,
        payload: result,
      }).catch(() => null);
    }

    return ok(
      request,
      buildAssistResponsePayload({
        sessionId: existing.sessionId,
        traceId: requestTraceId,
        result,
      })
    );
  } catch (error) {
    console.error("[playground/runs/user-input] failed", { runId: runIdParam, error });
    return serverError(request, error);
  }
}

import { NextRequest, NextResponse } from "next/server";
import {
  createChatProxyBearer,
  ensureChatTrialEntitlement,
  resolveExistingChatActor,
} from "@/lib/chat/actor";
import { proxyPlaygroundRequest } from "@/lib/chat/playground-proxy";
import { buildWorkspaceAssistContext } from "@/lib/chat/workspace-context";
import { DEFAULT_PLAYGROUND_MODEL_ALIAS } from "@/lib/playground/model-registry";

const CHAT_ASSIST_FAST_MODEL = DEFAULT_PLAYGROUND_MODEL_ALIAS;
const CHAT_ASSIST_CODE_REASONING = "medium";
const CHAT_ASSIST_CODE_CONTEXT_BUDGET = 16_384;

function unauthorized(): NextResponse {
  return NextResponse.json(
    {
      success: false,
      error: "UNAUTHORIZED",
      message: "Call /api/me/chat/bootstrap first.",
    },
    { status: 401 }
  );
}

function normalizeIntentText(value: string): string {
  return String(value || "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

function looksLikeCodeModeTask(task: string): boolean {
  const raw = String(task || "");
  const normalized = normalizeIntentText(raw);
  if (!normalized) return false;

  if (/[A-Za-z0-9_./-]+\.(ts|tsx|js|jsx|py|go|rs|java|cs|sql|yaml|yml|json|md)\b/i.test(raw)) {
    return true;
  }

  if (
    /\b(file|route|component|function|class|module|script|api|endpoint|schema|migration)\b/.test(normalized) &&
    /\b(ts|tsx|js|jsx|py|go|rs|java|cs|sql|yaml|yml|json|md)\b/.test(normalized)
  ) {
    return true;
  }

  return /\b(code|coding|implement|implementation|build|create|add|write|update|modify|edit|refactor|fix|debug|bug|patch|test|lint|typecheck|function|class|component|api|endpoint|schema|migration|query|algorithm)\b/.test(
    normalized
  );
}

function buildCodeModeTask(task: string): string {
  const trimmed = String(task || "").trim();
  if (!trimmed) return "";
  return [
    `User request: "${trimmed}".`,
    "Primary goal: return accurate, runnable code edits.",
    "When code changes are requested, provide concrete patches/actions instead of abstract advice.",
    "Infer target files from available context when possible and avoid placeholder pseudocode.",
    "If any assumption is required, state it briefly and choose the safest implementation path.",
  ].join("\n");
}

function buildConversationModeTask(task: string): string {
  const trimmed = String(task || "").trim();
  if (!trimmed) return "";
  return [
    `User message: "${trimmed}".`,
    "Primary goal: answer as the chat assistant in natural language.",
    "Do not claim to be inspecting, analyzing, scanning, or reading project files unless the user explicitly asks for repo/code help in this turn.",
    "Keep the reply grounded in the user's message instead of IDE or workspace behavior.",
  ].join("\n");
}

function looksRepoScopedCodeTask(task: string): boolean {
  const raw = String(task || "");
  const normalized = normalizeIntentText(raw);
  if (!normalized) return false;

  if (/[A-Za-z0-9_./-]+\.(ts|tsx|js|jsx|py|go|rs|java|cs|sql|yaml|yml|json|md)\b/i.test(raw)) {
    return true;
  }

  if (
    /\b(this|our|current|existing)\s+(repo|repository|project|app|codebase|workspace|component|route|module|file|files|api|endpoint|schema|migration)\b/.test(
      normalized
    )
  ) {
    return true;
  }

  if (
    /\b(look at|inspect|scan|search|open|read|check|review|debug|fix|update|modify|edit|refactor|patch)\b/.test(normalized) &&
    /\b(repo|repository|project|app|codebase|workspace|component|route|module|file|files|api|endpoint|schema|migration)\b/.test(
      normalized
    )
  ) {
    return true;
  }

  return false;
}

export async function POST(request: NextRequest): Promise<Response> {
  const actor = await resolveExistingChatActor(request);
  if (!actor) return unauthorized();

  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
  if (!body || typeof body.task !== "string" || !body.task.trim()) {
    return NextResponse.json(
      {
        success: false,
        error: "BAD_REQUEST",
        message: "task is required",
      },
      { status: 400 }
    );
  }

  const rawTask = body.task.trim();
  const codeMode = looksLikeCodeModeTask(rawTask);
  const repoScopedCodeTask = codeMode && looksRepoScopedCodeTask(rawTask);
  const task = codeMode ? buildCodeModeTask(rawTask) : buildConversationModeTask(rawTask);

  await ensureChatTrialEntitlement(actor.userId);
  const bearer = createChatProxyBearer(actor);
  const inferredContext =
    body.context === undefined && repoScopedCodeTask
      ? await buildWorkspaceAssistContext(rawTask).catch(() => null)
      : null;

  const proxiedBody = {
    ...body,
    task,
    ...(inferredContext ? { context: inferredContext } : {}),
    mode: repoScopedCodeTask ? "yolo" : "generate",
    ...(codeMode
      ? {
          workflowIntentId: `reasoning:${CHAT_ASSIST_CODE_REASONING}` as const,
        }
      : {}),
    ...(repoScopedCodeTask
      ? {
          contextBudget: { maxTokens: CHAT_ASSIST_CODE_CONTEXT_BUDGET, strategy: "hybrid" as const },
        }
      : {}),
    model: CHAT_ASSIST_FAST_MODEL,
    stream: true,
    safetyProfile: "standard",
  };

  return proxyPlaygroundRequest({
    request,
    method: "POST",
    path: "/api/v1/playground/assist",
    bearer,
    body: proxiedBody,
    acceptSse: true,
  });
}

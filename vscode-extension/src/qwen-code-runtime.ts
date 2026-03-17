import * as vscode from "vscode";
import {
  isSDKAssistantMessage,
  isSDKPartialAssistantMessage,
  isSDKResultMessage,
  isSDKSystemMessage,
  query,
  type ContentBlock,
  type ToolInput,
} from "@qwen-code/sdk";
import {
  getBaseApiUrl,
  getQwenExecutablePath,
  getQwenModel,
  getQwenOpenAiBaseUrl,
  getWorkspaceRootPath,
} from "./config";
import {
  describeToolActivity,
  getAutoApprovedQwenTools,
  isMutationToolName,
  isSafeInspectionToolRequest,
} from "./qwen-runtime-utils";
import { mergeAssistantResponseText } from "./qwen-response-assembly";
import { formatAssistantStreamText } from "./qwen-stream-format";
import type { Mode } from "./shared";

function trimToSentence(value: string, limit = 220): string {
  const text = String(value || "").replace(/\s+/g, " ").trim();
  if (text.length <= limit) return text;
  return `${text.slice(0, limit - 1)}...`;
}

function extractText(blocks: ContentBlock[]): string {
  return blocks
    .filter((block): block is Extract<ContentBlock, { type: "text" }> => block.type === "text")
    .map((block) => block.text)
    .join("")
    .trim();
}

function extractThinking(blocks: ContentBlock[]): string {
  return blocks
    .filter((block): block is Extract<ContentBlock, { type: "thinking" }> => block.type === "thinking")
    .map((block) => block.thinking)
    .join("")
    .trim();
}

function extractToolUses(blocks: ContentBlock[]): Array<{
  name: string;
  input: ToolInput;
}> {
  return blocks
    .filter((block): block is Extract<ContentBlock, { type: "tool_use" }> => block.type === "tool_use")
    .map((block) => ({
      name: block.name,
      input: (block.input || {}) as ToolInput,
    }));
}

function summarizeToolRequest(toolName: string, input: ToolInput): string {
  const commandLike =
    (typeof input.command === "string" && input.command) ||
    (typeof input.cmd === "string" && input.cmd) ||
    (typeof input.path === "string" && input.path) ||
    "";
  const detail = commandLike ? commandLike : trimToSentence(JSON.stringify(input));
  return detail ? `${toolName}: ${detail}` : toolName;
}

function buildApprovalKey(toolName: string, input: ToolInput): string {
  return JSON.stringify({
    toolName: String(toolName || "").trim().toLowerCase(),
    command:
      (typeof input.command === "string" && input.command.trim()) ||
      (typeof input.cmd === "string" && input.cmd.trim()) ||
      (typeof input.path === "string" && input.path.trim()) ||
      "",
    args:
      input && typeof input === "object"
        ? Object.keys(input)
            .sort()
            .map((key) => [key, (input as Record<string, unknown>)[key]])
        : [],
  });
}

function toPermissionMode(mode: Mode): "plan" | "auto-edit" {
  return mode === "plan" ? "plan" : "auto-edit";
}

export type QwenPromptResult = {
  sessionId: string;
  assistantText: string;
  permissionDenials: string[];
  usedTools: string[];
  didMutate: boolean;
  toolEvents: QwenToolEvent[];
};

export type QwenToolEventPhase =
  | "requested"
  | "approved"
  | "denied"
  | "reused_approval"
  | "executed"
  | "permission_denial"
  | "pseudo_markup";

export type QwenToolEvent = {
  phase: QwenToolEventPhase;
  toolName: string;
  summary: string;
  detail?: string;
  timestamp: string;
};

function extractPseudoToolMarkupEvents(text: string): Array<{
  toolName: string;
  summary: string;
}> {
  const source = String(text || "");
  if (!source) return [];
  const toolCallMatches = Array.from(
    source.matchAll(/<tool_call>[\s\S]*?<function=([A-Za-z0-9_.:-]+)>[\s\S]*?<\/tool_call>/gi)
  );
  if (!toolCallMatches.length) return [];
  return toolCallMatches.map((match) => {
    const toolName = String(match[1] || "unknown_tool").trim() || "unknown_tool";
    const snippet = String(match[0] || "")
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, 220);
    return {
      toolName,
      summary: snippet ? `${toolName}: ${snippet}` : toolName,
    };
  });
}

export class QwenCodeRuntime {
  async runPrompt(input: {
    apiKey: string;
    prompt: string;
    mode: Mode;
    sessionId?: string | null;
    abortController?: AbortController;
    onActivity?: (text: string) => void;
    onPartial?: (text: string) => void;
  }): Promise<QwenPromptResult> {
    const cwd = getWorkspaceRootPath();
    if (!cwd) {
      throw new Error("Open a workspace folder before using Qwen Code.");
    }

    const model = getQwenModel();
    const includePartialMessages = true;
    const requestedSessionId = input.sessionId || undefined;
    let assistantText = "";
    let completedReasoningText = "";
    let completedAnswerText = "";
    let streamingReasoningText = "";
    let streamingAnswerText = "";
    const permissionDenials: string[] = [];
    const usedToolNames = new Set<string>();
    const approvedToolRequests = new Set<string>();
    const toolEvents: QwenToolEvent[] = [];
    let didMutate = false;

    const pushToolEvent = (
      phase: QwenToolEventPhase,
      toolName: string,
      input?: ToolInput,
      detail?: string
    ) => {
      const summary = summarizeToolRequest(toolName, input || {});
      toolEvents.push({
        phase,
        toolName,
        summary,
        detail: detail ? trimToSentence(detail) : undefined,
        timestamp: new Date().toISOString(),
      });
    };

    const publishAssistantText = (reasoningCandidate: string, answerCandidate: string) => {
      const nextText = formatAssistantStreamText({
        reasoningText: reasoningCandidate,
        answerText: answerCandidate,
      });
      if (!nextText || nextText === assistantText) return;
      assistantText = nextText;
      input.onPartial?.(nextText);
    };

    const publishStreamingState = () => {
      publishAssistantText(
        mergeAssistantResponseText(completedReasoningText, streamingReasoningText),
        mergeAssistantResponseText(completedAnswerText, streamingAnswerText)
      );
    };

    const commitAssistantText = (reasoningCandidate: string, answerCandidate: string) => {
      const nextReasoning = mergeAssistantResponseText(completedReasoningText, reasoningCandidate);
      const nextAnswer = mergeAssistantResponseText(completedAnswerText, answerCandidate);
      const didChange =
        nextReasoning !== completedReasoningText || nextAnswer !== completedAnswerText;
      completedReasoningText = nextReasoning;
      completedAnswerText = nextAnswer;
      if (!didChange) return;
      publishAssistantText(completedReasoningText, completedAnswerText);
    };

    const result = query({
      prompt: input.prompt,
      options: {
        cwd,
        model,
        ...(getQwenExecutablePath() ? { pathToQwenExecutable: getQwenExecutablePath() } : {}),
        authType: "openai",
        permissionMode: toPermissionMode(input.mode),
        allowedTools: getAutoApprovedQwenTools(),
        includePartialMessages,
        ...(input.abortController ? { abortController: input.abortController } : {}),
        env: {
          OPENAI_API_KEY: input.apiKey,
          OPENAI_BASE_URL: getQwenOpenAiBaseUrl(),
          PLAYGROUND_BASE_API_URL: getBaseApiUrl(),
        },
        ...(requestedSessionId ? { resume: requestedSessionId } : {}),
        canUseTool: async (toolName, toolInput, options) => {
          if (options.signal.aborted) {
            return { behavior: "deny", message: "Request was aborted." } as const;
          }

          pushToolEvent("requested", toolName, toolInput);
          if (isSafeInspectionToolRequest(toolName, toolInput)) {
            input.onActivity?.(describeToolActivity(toolName, toolInput));
            pushToolEvent("approved", toolName, toolInput, "Auto-approved safe inspection tool.");
            return { behavior: "allow", updatedInput: toolInput } as const;
          }

          const approvalKey = buildApprovalKey(toolName, toolInput);
          if (approvedToolRequests.has(approvalKey)) {
            input.onActivity?.(`Reusing prior approval: ${summarizeToolRequest(toolName, toolInput)}`);
            pushToolEvent("reused_approval", toolName, toolInput);
            return { behavior: "allow", updatedInput: toolInput } as const;
          }

          input.onActivity?.("Awaiting tool approval");

          const approved = await vscode.window.showWarningMessage(
            `Qwen Code wants to use a tool.\n\n${summarizeToolRequest(toolName, toolInput)}`,
            { modal: true },
            "Allow Once",
            "Deny"
          );

          if (approved === "Allow Once") {
            approvedToolRequests.add(approvalKey);
            input.onActivity?.(`Approved tool: ${summarizeToolRequest(toolName, toolInput)}`);
            pushToolEvent("approved", toolName, toolInput, "Approved from modal prompt.");
            return { behavior: "allow", updatedInput: toolInput } as const;
          }

          input.onActivity?.(`Denied tool: ${summarizeToolRequest(toolName, toolInput)}`);
          pushToolEvent("denied", toolName, toolInput, "Denied from modal prompt.");
          return { behavior: "deny", message: "Tool use denied in Binary IDE." } as const;
        },
      },
    });

    try {
      for await (const message of result) {
        if (isSDKPartialAssistantMessage(message)) {
          if (message.event.type === "message_start") {
            streamingReasoningText = "";
            streamingAnswerText = "";
            continue;
          }

          if (
            message.event.type === "content_block_delta" &&
            message.event.delta.type === "text_delta"
          ) {
            streamingAnswerText += message.event.delta.text;
            publishStreamingState();
            continue;
          }

          if (
            message.event.type === "content_block_delta" &&
            message.event.delta.type === "thinking_delta"
          ) {
            streamingReasoningText += message.event.delta.thinking;
            publishStreamingState();
            continue;
          }

          if (message.event.type === "message_stop") {
            commitAssistantText(streamingReasoningText, streamingAnswerText);
            streamingReasoningText = "";
            streamingAnswerText = "";
          }
          continue;
        }

        if (isSDKSystemMessage(message)) {
          if (message.subtype === "init" || message.subtype === "initialized") {
            input.onActivity?.(
              `Qwen Code ready${message.model ? ` with ${message.model}` : ""}${
                message.permission_mode ? ` (${message.permission_mode})` : ""
              }.`
            );
          }
          continue;
        }

        if (isSDKAssistantMessage(message)) {
          const nextText = extractText(message.message.content);
          const nextThinking = extractThinking(message.message.content);
          if (nextText || nextThinking) {
            commitAssistantText(nextThinking, nextText);
            for (const pseudoEvent of extractPseudoToolMarkupEvents(nextText)) {
              toolEvents.push({
                phase: "pseudo_markup",
                toolName: pseudoEvent.toolName,
                summary: pseudoEvent.summary,
                detail: "Assistant emitted literal tool-call markup instead of executing an SDK tool.",
                timestamp: new Date().toISOString(),
              });
            }
          }
          for (const toolUse of extractToolUses(message.message.content)) {
            usedToolNames.add(toolUse.name);
            if (isMutationToolName(toolUse.name)) {
              didMutate = true;
            }
            pushToolEvent("executed", toolUse.name, toolUse.input);
            input.onActivity?.(describeToolActivity(toolUse.name, toolUse.input));
          }
          continue;
        }

        if (isSDKResultMessage(message)) {
          if (message.result && typeof message.result === "string" && message.result.trim()) {
            commitAssistantText("", message.result);
          }
          for (const denial of message.permission_denials || []) {
            const denialSummary = trimToSentence(`${denial.tool_name} denied`);
            permissionDenials.push(denialSummary);
            pushToolEvent("permission_denial", denial.tool_name, {}, denialSummary);
          }
        }
      }
    } finally {
      await result.close().catch(() => undefined);
    }

    return {
      sessionId: result.getSessionId(),
      assistantText:
        assistantText ||
        formatAssistantStreamText({
          reasoningText: mergeAssistantResponseText(completedReasoningText, streamingReasoningText),
          answerText: mergeAssistantResponseText(completedAnswerText, streamingAnswerText),
        }) ||
        "Qwen Code finished without returning a final message.",
      permissionDenials,
      usedTools: Array.from(usedToolNames),
      didMutate,
      toolEvents,
    };
  }
}

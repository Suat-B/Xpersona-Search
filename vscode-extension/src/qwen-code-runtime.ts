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
};

export class QwenCodeRuntime {
  async runPrompt(input: {
    apiKey: string;
    prompt: string;
    mode: Mode;
    sessionId?: string | null;
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
    let streamingMessageText = "";
    const permissionDenials: string[] = [];
    const usedToolNames = new Set<string>();
    const approvedToolRequests = new Set<string>();
    let didMutate = false;

    const publishAssistantText = (candidate: string) => {
      const merged = mergeAssistantResponseText(assistantText, candidate);
      if (!merged || merged === assistantText) return;
      assistantText = merged;
      input.onPartial?.(assistantText);
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

          if (isSafeInspectionToolRequest(toolName, toolInput)) {
            input.onActivity?.(describeToolActivity(toolName, toolInput));
            return { behavior: "allow", updatedInput: toolInput } as const;
          }

          const approvalKey = buildApprovalKey(toolName, toolInput);
          if (approvedToolRequests.has(approvalKey)) {
            input.onActivity?.(`Reusing prior approval: ${summarizeToolRequest(toolName, toolInput)}`);
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
            return { behavior: "allow", updatedInput: toolInput } as const;
          }

          input.onActivity?.(`Denied tool: ${summarizeToolRequest(toolName, toolInput)}`);
          return { behavior: "deny", message: "Tool use denied in Playground." } as const;
        },
      },
    });

    try {
      for await (const message of result) {
        if (isSDKPartialAssistantMessage(message)) {
          if (message.event.type === "message_start") {
            streamingMessageText = "";
            continue;
          }

          if (
            message.event.type === "content_block_delta" &&
            message.event.delta.type === "text_delta"
          ) {
            streamingMessageText += message.event.delta.text;
            publishAssistantText(streamingMessageText);
            continue;
          }

          if (message.event.type === "message_stop") {
            publishAssistantText(streamingMessageText);
            streamingMessageText = "";
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
          if (nextText) {
            publishAssistantText(nextText);
          }
          for (const toolUse of extractToolUses(message.message.content)) {
            usedToolNames.add(toolUse.name);
            if (isMutationToolName(toolUse.name)) {
              didMutate = true;
            }
            input.onActivity?.(describeToolActivity(toolUse.name, toolUse.input));
          }
          continue;
        }

        if (isSDKResultMessage(message)) {
          if (message.result && typeof message.result === "string" && message.result.trim()) {
            publishAssistantText(message.result);
          }
          for (const denial of message.permission_denials || []) {
            permissionDenials.push(trimToSentence(`${denial.tool_name} denied`));
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
        streamingMessageText.trim() ||
        "Qwen Code finished without returning a final message.",
      permissionDenials,
      usedTools: Array.from(usedToolNames),
      didMutate,
    };
  }
}

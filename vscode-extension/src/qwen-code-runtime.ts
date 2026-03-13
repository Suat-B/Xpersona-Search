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
import { getAutoApprovedQwenTools, isSafeInspectionToolRequest } from "./qwen-runtime-utils";
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

function extractToolSummary(blocks: ContentBlock[]): string[] {
  return blocks
    .filter((block): block is Extract<ContentBlock, { type: "tool_use" }> => block.type === "tool_use")
    .map((block) => {
      const inputPreview =
        block.input && typeof block.input === "object" ? trimToSentence(JSON.stringify(block.input)) : "";
      return inputPreview ? `Qwen tool: ${block.name} ${inputPreview}` : `Qwen tool: ${block.name}`;
    });
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

function toPermissionMode(mode: Mode): "plan" | "auto-edit" {
  return mode === "plan" ? "plan" : "auto-edit";
}

export type QwenPromptResult = {
  sessionId: string;
  assistantText: string;
  permissionDenials: string[];
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

    const requestedSessionId = input.sessionId || undefined;
    let assistantText = "";
    let partialText = "";
    const permissionDenials: string[] = [];

    const result = query({
      prompt: input.prompt,
      options: {
        cwd,
        model: getQwenModel(),
        ...(getQwenExecutablePath() ? { pathToQwenExecutable: getQwenExecutablePath() } : {}),
        authType: "openai",
        permissionMode: toPermissionMode(input.mode),
        allowedTools: getAutoApprovedQwenTools(),
        includePartialMessages: true,
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
            input.onActivity?.(`Qwen tool auto-approved: ${summarizeToolRequest(toolName, toolInput)}`);
            return { behavior: "allow", updatedInput: toolInput } as const;
          }

          const approved = await vscode.window.showWarningMessage(
            `Qwen Code wants to use a tool.\n\n${summarizeToolRequest(toolName, toolInput)}`,
            { modal: true },
            "Allow Once",
            "Deny"
          );

          if (approved === "Allow Once") {
            return { behavior: "allow", updatedInput: toolInput } as const;
          }

          return { behavior: "deny", message: "Tool use denied in Playground." } as const;
        },
      },
    });

    try {
      for await (const message of result) {
        if (isSDKPartialAssistantMessage(message)) {
          if (
            message.event.type === "content_block_delta" &&
            message.event.delta.type === "text_delta"
          ) {
            partialText += message.event.delta.text;
            input.onPartial?.(partialText.trim());
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
            assistantText = nextText;
            input.onPartial?.(assistantText);
          }
          for (const summary of extractToolSummary(message.message.content)) {
            input.onActivity?.(summary);
          }
          continue;
        }

        if (isSDKResultMessage(message)) {
          if (message.result && typeof message.result === "string" && message.result.trim()) {
            assistantText = message.result.trim();
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
      assistantText: assistantText || partialText.trim() || "Qwen Code finished without returning a final message.",
      permissionDenials,
    };
  }
}
